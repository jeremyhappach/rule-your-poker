-- Qualified Farkle correction: fresh active-account checks and nonblocking recovery lock order.
-- No admission, session, history, balance, ledger, trigger, index, or table changes.
-- Existing callers and ACLs are preserved. Unknown source drift aborts atomically.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(19092026,1);
DO $precondition$
DECLARE f record; actual text;
BEGIN
 IF (SELECT creation_enabled FROM private.farkle_release WHERE singleton) IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'farkle_correction:admission_must_be_closed';
 END IF;
 FOR f IN SELECT * FROM (VALUES
('private.farkle_claim_v1(uuid,uuid,uuid,text)','fe9bd036beaa268be65d593b389091ef','67d21bf8f9fbff95471b4c993715d6bb'),
('public.farkle_advance_postgame(uuid,uuid,uuid,integer)','8349700190717dcd40e814bfcf490797','7a91f9df414410d6fdaa6ac441caa51a'),
('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)','54b2ef0f284857e4df624f967f732f95','a265d4492773a9a008e7cb47f949f6a9'),
('private.advance_due_canonical_game_timers(integer)','354df9a2a5244d7c1df1c64ed65ee189','e6a5040550c194284986f9a8de248eb5'),
('public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamp with time zone)','10b9deabf9032df33c5319adff96f948','cd7e21dc835c35e3df967482022ca598'),
('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)','9e6d59a69f0c828a4ed84481258662e3','a69f39fefb234c3b01114c8049fdbbb6'),
('public.set_game_paused(uuid,boolean,uuid,bigint)','101f170b8e61d2528cee3b0a93abad1a','1fa2220c33734d1cf14c11f3eaef432b'),
('public.set_session_player_intent(uuid,uuid,bigint,uuid,text,boolean)','96d62d83ae5212e97ef12b5d6bb09290','0ac84e381210d0395b93e09feaf2b1db'),
('public.advance_ante_phase(uuid,uuid)','dd6a4516d67a562166788076208eb32c','e9f1b6b65a404f94d68d535ed9f6ecb2'),
('public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)','64c589ab0fcd545ab1ccd9d5f29a0e32','c633a318c7f2605104c92e03d3b3b09a')
 ) AS expected(signature,original_hash,qualified_hash) LOOP
  SELECT md5(pg_get_functiondef(to_regprocedure(f.signature))) INTO actual;
  IF actual IS NULL OR actual NOT IN (f.original_hash,f.qualified_hash) THEN
   RAISE EXCEPTION 'farkle_correction:unexpected_definition:%',f.signature;
  END IF;
 END LOOP;
END $precondition$;

-- Qualified correction candidate. Does not change admission or historical rows.
CREATE OR REPLACE FUNCTION private.farkle_require_active_actor_v1(p_game_id uuid DEFAULT NULL, p_dealer_game_id uuid DEFAULT NULL, p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
 IF NOT p_force
 AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=p_game_id AND game_type='farkle')
 AND NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_dealer_game_id AND session_id=p_game_id AND game_type='farkle')
 THEN RETURN; END IF;
 -- Only a trusted service invocation can continue existing obligations without
 -- an active human caller. The stored profile, never JWT metadata, owns status.
 IF coalesce(auth.jwt()->>'role','')='service_role' THEN RETURN; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active IS TRUE)
 THEN RAISE EXCEPTION 'farkle:active_account_required' USING ERRCODE='42501'; END IF;
END $function$;
REVOKE ALL ON FUNCTION private.farkle_require_active_actor_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.farkle_apply_action(p_round_id uuid, p_player_id uuid, p_action text, p_expected_sequence bigint, p_request_id uuid, p_selection jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; p public.players; d public.dealer_games; receipt private.farkle_action_receipts;
 s jsonb; request jsonb; result jsonb; rolled integer[]; terminal jsonb; next_actor public.players; service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
 PERFORM private.farkle_require_active_actor_v1(NULL,NULL,true);
 IF p_request_id IS NULL OR p_expected_sequence IS NULL OR p_action NOT IN ('roll','hold','bank') OR p_selection IS NULL
 OR (auth.uid() IS NULL AND NOT service) THEN RAISE EXCEPTION 'farkle:invalid_action_request' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.farkle_state IS NULL THEN RAISE EXCEPTION 'farkle:round_not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=r.game_id FOR UPDATE;
 IF NOT FOUND OR NOT (r.farkle_state->'playerStates' ? p.id::text)
 OR (NOT service AND (p.is_bot OR p.user_id IS DISTINCT FROM auth.uid())) THEN RAISE EXCEPTION 'farkle:not_authorized' USING ERRCODE='42501'; END IF;
 request:=jsonb_build_object('actor',p_player_id,'action',p_action,'expectedSequence',p_expected_sequence,'selection',p_selection);
 SELECT * INTO receipt FROM private.farkle_action_receipts WHERE round_id=r.id AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.actor_id<>p_player_id OR receipt.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'farkle:replay_payload_mismatch'; END IF;
  PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN receipt.response||jsonb_build_object('deduped',true);
 END IF;
 s:=r.farkle_state;
 IF g.game_type<>'farkle' OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id OR g.current_round<>r.round_number OR g.total_hands<>r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR s->>'gamePhase'<>'playing'
 THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_identity','state',s); END IF;
 IF g.is_paused THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','paused','state',s); END IF;
 IF (s->>'actionSequence')::bigint<>p_expected_sequence THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_action','state',s); END IF;
 IF s->>'currentTurnPlayerId'<>p.id::text OR (NOT service AND p.auto_fold) OR (service AND NOT (p.is_bot OR p.auto_fold))
 THEN RAISE EXCEPTION 'farkle:not_controller' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dealer_games WHERE id=r.dealer_game_id AND session_id=g.id AND game_type='farkle';
 IF NOT FOUND OR s->'config' IS DISTINCT FROM d.config THEN RAISE EXCEPTION 'farkle:frozen_config_mismatch'; END IF;
 IF p_action<>'hold' AND p_selection<>'[]'::jsonb THEN RAISE EXCEPTION 'farkle:unexpected_selection'; END IF;
 IF p_action='roll' THEN SELECT array_agg(private.secure_random_int(6)+1 ORDER BY i) INTO rolled FROM generate_series(1,jsonb_array_length(s->'available')) i; END IF;
 s:=private.farkle_reduce_v1(s,p_action,p_selection,rolled);
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 UPDATE public.players SET auto_fold=false,auto_play_stop_round_id=NULL
 WHERE game_id=g.id AND auto_play_stop_round_id=r.id
 AND (s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 IF s->>'gamePhase'='playing' THEN
  SELECT * INTO next_actor FROM public.players WHERE id=(s->>'currentTurnPlayerId')::uuid AND game_id=g.id;
  IF s->>'currentTurnPlayerId' IS DISTINCT FROM p.id::text
    OR next_actor.is_bot OR next_actor.auto_fold
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(s->'events') event WHERE event->>'type'='hot_dice') THEN
   s:=jsonb_set(s,'{turnDeadline}',to_jsonb(clock_timestamp()+make_interval(secs=>CASE WHEN next_actor.is_bot OR next_actor.auto_fold
    THEN (d.config->>'botDelayMs')::numeric/1000 ELSE (d.config->>'turnSeconds')::numeric END)));
  END IF;
 ELSE s:=s||jsonb_build_object('turnDeadline',NULL); END IF;
 UPDATE public.rounds SET farkle_state=s WHERE id=r.id;
 IF s->>'gamePhase'='complete' THEN terminal:=private.farkle_settle_v1(r.id); END IF;
 INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
 VALUES(r.id,(s->>'actionSequence')::bigint,d.id,p.id,s->'events',s,md5(d.config::text));
 result:=jsonb_build_object('outcome','applied','deduped',false,'action_sequence',s->'actionSequence','state',s,'settlement',terminal);
 INSERT INTO private.farkle_action_receipts(round_id,request_id,actor_id,request,response) VALUES(r.id,p_request_id,p.id,request,result);
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.farkle_advance_postgame(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid(); service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
 prior_claim text:=coalesce(current_setting('app.farkle_authority',true),'');
 r public.rounds; g public.games; receipt jsonb; outcome jsonb; winner uuid;
 result_count integer; active_count integer; human_count integer; eligible_count integer;
 allow_bots boolean:=false; make_take boolean:=false; positions integer[];
 next_position integer; target text; deadline timestamptz;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(NULL,NULL,true);
 IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number IS NULL OR p_hand_number<1
 THEN RAISE EXCEPTION 'farkle_postgame:missing_identity'; END IF;
 IF actor IS NULL AND NOT service THEN RAISE EXCEPTION 'farkle_postgame:authentication_required' USING ERRCODE='42501'; END IF;
 -- Same serialization protocol as creation and forward recovery; held to COMMIT.
 PERFORM pg_advisory_xact_lock_shared(19092026,1);
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.game_id IS DISTINCT FROM p_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR r.hand_number IS DISTINCT FROM p_hand_number OR r.farkle_state IS NULL
 THEN RAISE EXCEPTION 'farkle_postgame:round_identity_mismatch'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'farkle_postgame:missing_game'; END IF;
 IF NOT service AND NOT public.has_role(actor,'admin'::public.app_role)
 AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game_id AND user_id=actor AND status<>'left')
 AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id
   AND hand_number=p_hand_number AND user_id=actor)
 THEN RAISE EXCEPTION 'farkle_postgame:not_in_session' USING ERRCODE='42501'; END IF;
 SELECT result INTO receipt FROM private.farkle_postgame_receipts_v2
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND round_id=p_round_id AND hand_number=p_hand_number;
 IF FOUND THEN RETURN receipt||jsonb_build_object('outcome','already_advanced','deduped',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM private.farkle_postgame_control_v2 WHERE singleton AND enabled)
 THEN RETURN jsonb_build_object('outcome','recovery_disabled'); END IF;
 IF g.game_type IS DISTINCT FROM 'farkle' OR g.current_game_uuid IS DISTINCT FROM p_dealer_game_id
 OR g.total_hands IS DISTINCT FROM p_hand_number OR g.current_round IS DISTINCT FROM r.round_number
 OR g.status NOT IN ('game_over','session_ended')
 THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF g.is_paused THEN RETURN jsonb_build_object('outcome','paused'); END IF;
 winner:=(r.farkle_state->>'winnerPlayerId')::uuid;
 IF r.status IS DISTINCT FROM 'completed' OR r.farkle_state->>'gamePhase' IS DISTINCT FROM 'complete' OR winner IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE id=p_dealer_game_id AND session_id=p_game_id
   AND game_type='farkle' AND config=r.farkle_state->'config')
 THEN RAISE EXCEPTION 'farkle_postgame:not_terminal'; END IF;
 SELECT count(*) INTO result_count FROM public.game_results
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
 AND game_type='farkle' AND settlement_key='farkle_terminal';
 IF result_count<>1 OR NOT EXISTS(SELECT 1 FROM public.game_results
 WHERE game_id=p_game_id AND dealer_game_id=p_dealer_game_id AND hand_number=p_hand_number
 AND settlement_key='farkle_terminal' AND winner_player_id=winner)
 THEN RAISE EXCEPTION 'farkle_postgame:settlement_not_committed'; END IF;
 -- Pending session end may already have been committed by Wave 1 settlement.
 -- Preserve that terminal frame for connected presentation and fresh admission.
 IF g.status='session_ended' THEN
  target:='session_ended';
 ELSE
  PERFORM private.farkle_claim_v1(p_game_id,p_dealer_game_id,p_round_id,'cleanup');
  PERFORM 1 FROM public.players WHERE game_id=p_game_id ORDER BY id FOR UPDATE;
  DELETE FROM public.players WHERE game_id=p_game_id AND is_bot AND stand_up_next_hand;
  UPDATE public.players SET
   status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false
  WHERE game_id=p_game_id;
  SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count FROM public.players
   WHERE game_id=p_game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
  -- Same session-level dealer policy source as Yahtzee; no Farkle scoring defaults.
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  allow_bots:=coalesce(allow_bots,false);
  SELECT array_agg(position ORDER BY position DESC),count(*) INTO positions,eligible_count FROM public.players
   WHERE game_id=p_game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL
    AND (allow_bots OR NOT is_bot);
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF human_count=0 OR active_count<2 OR eligible_count=0 THEN
   -- Canonical participant admission distinguishes seated/sitting-out humans
   -- from a truly ended session and preserves its financial finalization rules.
   PERFORM private.resolve_postgame_participation(p_game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=p_game_id;
  ELSE
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT position INTO next_position FROM public.players WHERE id=winner AND game_id=p_game_id
     AND NOT is_bot AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
    IF next_position IS NULL THEN
     IF eligible_count=1 THEN next_position:=positions[1]; ELSE target:='dealer_selection'; END IF;
    END IF;
   END IF;
   IF target IS NULL THEN
    IF next_position IS NULL THEN
     -- Canonical clockwise is next LOWER occupied position, wrapping.
     SELECT max(p) INTO next_position FROM unnest(positions) p WHERE p<g.dealer_position;
     next_position:=coalesce(next_position,positions[1]);
    END IF;
    target:='game_selection';
    deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.game_setup_timer_seconds,30)));
   END IF;
  END IF;
  -- No dealer game is committed in canonical setup/waiting. Retire only the
  -- live family discriminator; immutable dealer-game/round/history keep Farkle.
  -- A later setup timer has its own transaction and must use canonical authority,
  -- never a leaked Farkle claim from this continuation. Ended frames retain it.
  UPDATE public.games SET status=target,
   game_type=CASE WHEN target IN ('game_selection','dealer_selection','waiting') THEN NULL ELSE game_type END,
   config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL,
   last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
   all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,
   is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
   dealer_position=CASE WHEN target='game_selection' THEN next_position ELSE dealer_position END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
  WHERE id=p_game_id;
 END IF;
 outcome:=jsonb_build_object('outcome','advanced','deduped',false,'status',target,'winner_player_id',winner,
  'dealer_position',CASE WHEN target='game_selection' THEN next_position END,'config_deadline',deadline);
 INSERT INTO private.farkle_postgame_receipts_v2(game_id,dealer_game_id,round_id,hand_number,winner_player_id,result)
 VALUES(p_game_id,p_dealer_game_id,p_round_id,p_hand_number,winner,outcome);
 PERFORM set_config('app.farkle_authority',prior_claim,true);
 RETURN outcome;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.farkle_authority',prior_claim,true); RAISE;
END $function$;

CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,NULL,p_game_type='farkle');
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee','farkle'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.configure_dealer_game',false,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSIF p_game_type='farkle' THEN
    v_config := private.farkle_resolve_config_v1(v_game,p_config);
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  IF p_game_type='farkle' OR v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(p_game_id,v_game.current_game_uuid,NULL,'configure'); END IF;
  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type IN ('cribbage','farkle') THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_ante_decision(p_game_id uuid, p_expected_dealer_game_id uuid, p_player_id uuid, p_decision text, p_auto_ante boolean DEFAULT NULL::boolean, p_auto_ante_runback boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
  v_phase jsonb;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_expected_dealer_game_id,false);
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
  IF p_auto_ante IS TRUE AND p_auto_ante_runback IS TRUE THEN RAISE EXCEPTION 'submit_ante_decision:conflicting_preferences' USING ERRCODE='22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('ante_up','sit_out') THEN
    RAISE EXCEPTION 'submit_ante_decision:invalid_decision';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.submit_ante_decision',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND OR v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT * INTO v_player FROM public.players
   WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('observer','left')
     OR coalesce(v_player.sitting_out,false) THEN
    v_replay_return := jsonb_build_object('outcome','player_ineligible');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF NOT v_service AND (
    auth.uid() IS NULL OR v_player.is_bot OR v_player.user_id IS DISTINCT FROM auth.uid()
  ) THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_game.ante_decision_deadline<=clock_timestamp() THEN
    v_phase:=private.advance_ante_phase_exact(
      p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
      clock_timestamp()
    );
    v_replay_return := jsonb_build_object('outcome','deadline_expired','phase',v_phase);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_player.ante_decision IS NOT NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome','already_decided','decision',v_player.ante_decision,'deduped',true
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players
     SET ante_decision=p_decision,
         sitting_out=(p_decision='sit_out'),
         waiting=CASE WHEN p_decision='sit_out' THEN false ELSE waiting END,
         auto_ante=CASE WHEN p_auto_ante_runback IS TRUE THEN false ELSE coalesce(p_auto_ante,auto_ante) END,
         auto_ante_runback=CASE WHEN p_auto_ante IS TRUE THEN false ELSE coalesce(p_auto_ante_runback,auto_ante_runback) END
   WHERE id=p_player_id;
  IF v_replay_shared IS NOT NULL THEN v_replay_shared:=v_replay_shared||jsonb_build_object('anteDecisionRoster',private.replay_gin_roster_v1(p_game_id)); END IF;
  v_phase:=private.advance_ante_phase_exact(
    p_game_id,p_expected_dealer_game_id,v_game.ante_decision_deadline,
    clock_timestamp()
  );
  v_replay_return := jsonb_build_object(
    'outcome','accepted','decision',p_decision,'deduped',false,'phase',v_phase
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_player_id',p_player_id,'p_decision',p_decision,'p_auto_ante',p_auto_ante,'p_auto_ante_runback',p_auto_ante_runback),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$;

CREATE OR REPLACE FUNCTION public.advance_ante_phase(p_game_id uuid, p_expected_dealer_game_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_expected_dealer_game_id,false);
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
  IF NOT v_service AND (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.players player
       WHERE player.game_id=p_game_id AND player.user_id=auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  IF NOT FOUND OR v_game.ante_decision_deadline IS NULL THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF p_expected_dealer_game_id IS NOT NULL
     AND v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  RETURN private.advance_ante_phase_exact(
    p_game_id,v_game.current_game_uuid,v_game.ante_decision_deadline,
    clock_timestamp()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_expected_dealer_game_id,false);
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_game_paused',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR (g.status IN ('session_ended','completed') AND private.three_five_seven_hidden_round(g.id,true) IS NULL) THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'pause'); END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  IF private.three_five_seven_hidden_round(g.id,true) IS NOT NULL THEN
    SELECT greatest(0,ceil(extract(epoch FROM ((private.three_five_seven_decision_reveal(
      r.game_id,r.dealer_game_id,r.id,r.hand_number,r.round_number)->>'drop_at')::timestamptz-now_at))))::integer
    INTO remaining FROM public.rounds r WHERE r.id=private.three_five_seven_hidden_round(g.id,true);
   END IF;
   UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   farkle_state=private.shift_pause_timestamp(farkle_state,ARRAY['turnDeadline'],duration),
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$;

CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_dealer_game_id,false);
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,r.dealer_game_id,r.id,'control'); END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND ((g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing')
 OR (g.game_type='farkle' AND r.farkle_state->>'currentTurnPlayerId'=p.id::text AND r.farkle_state->>'gamePhase'='playing'));
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 PERFORM private.pause_all_humans_auto_fold(p_game_id);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$;

CREATE OR REPLACE FUNCTION public.set_session_player_intent(p_game_id uuid, p_player_id uuid, p_expected_version bigint, p_expected_dealer_game_id uuid, p_option text, p_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE; prior357 text;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_expected_dealer_game_id,false);
 IF private.three_five_seven_hidden_round(p_game_id,true) IS NOT NULL THEN
  RAISE EXCEPTION 'three_five_seven:disclosure_pending' USING ERRCODE='42501';
 END IF;
 IF auth.uid() IS NULL OR p_value IS NULL OR p_option IS NULL OR p_option NOT IN
 ('auto_ante','auto_ante_runback','sit_out_next_hand','stand_up_next_hand','rejoin','cancel_exit') THEN
  RAISE EXCEPTION 'participant_intent:invalid_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_session_player_intent',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'participant_intent:missing_session'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR (NOT coalesce(p.is_bot,false) AND p.user_id IS DISTINCT FROM auth.uid())
 OR (coalesce(p.is_bot,false) AND (g.real_money IS DISTINCT FROM false OR g.current_host IS DISTINCT FROM auth.uid()))
 THEN RAISE EXCEPTION 'participant_intent:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR p.position IS NULL OR p.status IN ('left','observer')
 OR g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
 OR p.intent_version IS DISTINCT FROM p_expected_version THEN
  v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_option',p_option,'p_value',p_value),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF p_option IN ('rejoin','cancel_exit') AND NOT p_value THEN
  RAISE EXCEPTION 'participant_intent:invalid_value' USING ERRCODE='22023'; END IF;
 prior357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_ante=CASE WHEN p_option='auto_ante' THEN p_value WHEN p_option='auto_ante_runback' AND p_value THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN p_option='auto_ante_runback' THEN p_value WHEN p_option='auto_ante' AND p_value THEN false ELSE auto_ante_runback END,
 sit_out_next_hand=CASE WHEN p_option='sit_out_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='stand_up_next_hand' AND p_value) THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN p_option='stand_up_next_hand' THEN p_value
  WHEN p_option IN ('rejoin','cancel_exit') OR (p_option='sit_out_next_hand' AND p_value) THEN false ELSE stand_up_next_hand END,
 waiting=CASE WHEN p_option='rejoin' THEN true WHEN p_option IN ('sit_out_next_hand','stand_up_next_hand') AND p_value THEN false ELSE waiting END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior357,true);
 v_replay_return := jsonb_build_object('outcome','accepted','player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_option',p_option,'p_value',p_value),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$;

CREATE OR REPLACE FUNCTION private.farkle_claim_v1(p_game_id uuid, p_dealer_id uuid, p_round_id uuid, p_operation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 -- Human command entry rechecks eligibility. The sealed deferred financial
 -- trigger must finish the already-authorized transaction after deactivation.
 IF coalesce(auth.jwt()->>'role','')='authenticated' AND pg_trigger_depth()=0 THEN
  PERFORM private.farkle_require_active_actor_v1(p_game_id,p_dealer_id,true);
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('configure','start','action','pause','control','cleanup')
 OR NOT EXISTS(SELECT 1 FROM public.games g WHERE g.id=p_game_id
   AND (p_operation IN ('configure','cleanup') OR (g.game_type='farkle' AND g.current_game_uuid=p_dealer_id)))
 OR (p_round_id IS NOT NULL AND p_operation NOT IN ('start','cleanup') AND NOT EXISTS(
   SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND r.game_id=p_game_id AND r.dealer_game_id=p_dealer_id))
 THEN RAISE EXCEPTION 'farkle:invalid_authority_identity' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',p_game_id,'dealer',p_dealer_id,'round',p_round_id,'operation',p_operation)::text,true);
END $function$;

CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
  LOOP
   BEGIN
    -- A Farkle action owns round -> session -> timer. Never hold its timer
    -- while waiting for either gameplay row. The subtransaction releases any
    -- partial acquisition on contention; the scheduled row stays due.
    IF v_timer.timer_kind IN ('farkle_turn','farkle_postgame') THEN
      PERFORM 1 FROM public.rounds WHERE id=v_timer.round_id FOR UPDATE NOWAIT;
      PERFORM 1 FROM public.games WHERE id=v_timer.game_id FOR UPDATE NOWAIT;
    END IF;
    -- Recheck after acquisition: another worker or action may retire this row.
    SELECT timer.* INTO v_timer FROM private.game_timer_registry timer
     WHERE timer.id=v_timer.id AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND EXISTS(SELECT 1 FROM public.games g WHERE g.id=timer.game_id AND NOT coalesce(g.is_paused,false))
     FOR UPDATE OF timer SKIP LOCKED;
    IF NOT FOUND THEN RAISE lock_not_available; END IF;
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      IF private.pause_all_humans_auto_fold(v_timer.game_id) THEN
        v_result:=jsonb_build_object('outcome','paused');
      ELSE
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'farkle_postgame' THEN
          v_result:=public.farkle_advance_postgame(
            v_timer.game_id,v_timer.round_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        WHEN 'farkle_turn' THEN
          v_result:=private.farkle_advance_due_v1(v_timer.round_id,clock_timestamp());
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;
      END IF;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') OR coalesce((v_result->>'game_paused')::boolean,false) THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome'='paused' OR coalesce((v_result->>'game_paused')::boolean,false) THEN due_at
                 WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
   EXCEPTION WHEN lock_not_available THEN
    -- Bounded skip, not a retry loop or a failed financial attempt.
    NULL;
   END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$;
