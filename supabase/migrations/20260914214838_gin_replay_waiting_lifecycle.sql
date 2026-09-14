SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=false;
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.complete_session_dealer_selection(uuid,bigint)'::regprocedure)) IS DISTINCT FROM '308cea425221d09554bbbb70d1dc84cc' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.complete_session_dealer_selection(uuid,bigint)'; END IF;
 IF md5(pg_get_functiondef('private.finalize_settled_session_if_no_active_humans(uuid,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM 'e468ab2fff9a56d582ce10f34986ac89' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.finalize_settled_session_if_no_active_humans(uuid,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('private.prepare_session_dealer_selection(uuid,bigint)'::regprocedure)) IS DISTINCT FROM 'a341bcfe117a8f6b5820dcf7d9901e3f' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.prepare_session_dealer_selection(uuid,bigint)'; END IF;
 IF md5(pg_get_functiondef('private.reconcile_session_abandonment(uuid,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM '2af73c74f77fda6db4d63887cc1d0782' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.reconcile_session_abandonment(uuid,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('private.request_session_end(uuid)'::regprocedure)) IS DISTINCT FROM 'a26d4d316542aea3f5c878f44888fbb7' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.request_session_end(uuid)'; END IF;
 IF md5(pg_get_functiondef('private.stand_up_and_resolve_postgame(uuid)'::regprocedure)) IS DISTINCT FROM '8a28ffc776069290d7f1245169e35dbf' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.stand_up_and_resolve_postgame(uuid)'; END IF;
 IF md5(pg_get_functiondef('begin_session_dealer_selection(uuid)'::regprocedure)) IS DISTINCT FROM 'e02351fba59e4174d04c90ac6b131c39' THEN RAISE EXCEPTION 'gin lifecycle owner drift: begin_session_dealer_selection(uuid)'; END IF;
 IF md5(pg_get_functiondef('create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid)'::regprocedure)) IS DISTINCT FROM '64777758d5885a7d9d55825a861090de' THEN RAISE EXCEPTION 'gin lifecycle owner drift: create_session_bot(uuid,uuid,text,integer,boolean,boolean,uuid)'; END IF;
 IF md5(pg_get_functiondef('request_session_end(uuid,uuid,bigint)'::regprocedure)) IS DISTINCT FROM 'f278afbb6cf511df30bffa9f8d50f77e' THEN RAISE EXCEPTION 'gin lifecycle owner drift: request_session_end(uuid,uuid,bigint)'; END IF;
 IF md5(pg_get_functiondef('session_leave(uuid,uuid,integer)'::regprocedure)) IS DISTINCT FROM '5f89800b51d3579356300c60b6791f08' THEN RAISE EXCEPTION 'gin lifecycle owner drift: session_leave(uuid,uuid,integer)'; END IF;
 IF md5(pg_get_functiondef('session_take_seat(uuid,integer,uuid,integer)'::regprocedure)) IS DISTINCT FROM '277687b0b0af33fe2be84cd10e74cb1d' THEN RAISE EXCEPTION 'gin lifecycle owner drift: session_take_seat(uuid,integer,uuid,integer)'; END IF;
 IF md5(pg_get_functiondef('set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure)) IS DISTINCT FROM '7b6d4b2bac61cec0d32e2c6a75463cfc' THEN RAISE EXCEPTION 'gin lifecycle owner drift: set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'; END IF;
 IF md5(pg_get_functiondef('set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure)) IS DISTINCT FROM 'a40b0c6b958ac1e64e94e13e20730df8' THEN RAISE EXCEPTION 'gin lifecycle owner drift: set_game_paused(uuid,boolean,uuid,bigint)'; END IF;
 IF md5(pg_get_functiondef('set_session_player_intent(uuid,uuid,bigint,uuid,text,boolean)'::regprocedure)) IS DISTINCT FROM '62cbdffa9deca17103262766369280eb' THEN RAISE EXCEPTION 'gin lifecycle owner drift: set_session_player_intent(uuid,uuid,bigint,uuid,text,boolean)'; END IF;
 IF md5(pg_get_functiondef('settle_gameplay_chip_transfers(uuid,jsonb,text)'::regprocedure)) IS DISTINCT FROM '439c94e1c14f9bf636d5d4efd5c10a53' THEN RAISE EXCEPTION 'gin lifecycle owner drift: settle_gameplay_chip_transfers(uuid,jsonb,text)'; END IF;
 IF md5(pg_get_functiondef('stand_up_and_resolve_postgame(uuid)'::regprocedure)) IS DISTINCT FROM '881c5e6564cf61e8c65e331778c3ad04' THEN RAISE EXCEPTION 'gin lifecycle owner drift: stand_up_and_resolve_postgame(uuid)'; END IF;
 IF md5(pg_get_functiondef('transfer_session_host(uuid,uuid,bigint)'::regprocedure)) IS DISTINCT FROM '269b7765ca7098f0c659d9bde971385b' THEN RAISE EXCEPTION 'gin lifecycle owner drift: transfer_session_host(uuid,uuid,bigint)'; END IF;
 IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM 'f47ec5dbbd9f6bee0fe23ca41f4f0fd7' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('private.handle_config_deadline_timeout_exact(uuid,timestamp with time zone,integer)'::regprocedure)) IS DISTINCT FROM '91f239ddc223911729a900291fe3bda1' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.handle_config_deadline_timeout_exact(uuid,timestamp with time zone,integer)'; END IF;
 IF md5(pg_get_functiondef('private.resolve_postgame_participation(uuid,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM 'fe4891613d5601930a3b9d4bff19369e' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.resolve_postgame_participation(uuid,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM '6c40aba8e499d2c9cb311a3a5f70e35f' THEN RAISE EXCEPTION 'gin lifecycle owner drift: configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('decline_session_setup(uuid,integer,timestamp with time zone)'::regprocedure)) IS DISTINCT FROM '4699eaef16b7719e78bd76296b6b2471' THEN RAISE EXCEPTION 'gin lifecycle owner drift: decline_session_setup(uuid,integer,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure)) IS DISTINCT FROM '81c6e9be1e9b47440393afa7ae50b272' THEN RAISE EXCEPTION 'gin lifecycle owner drift: submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)'; END IF;
 IF md5(pg_get_functiondef('private.replay_gin_open_v1(games,rounds,jsonb,jsonb)'::regprocedure)) IS DISTINCT FROM '81437443669ba723eb457b5de8935d0a' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.replay_gin_open_v1(games,rounds,jsonb,jsonb)'; END IF;
 IF md5(pg_get_functiondef('private.replay_gin_shared_end_v1(jsonb,jsonb,jsonb)'::regprocedure)) IS DISTINCT FROM 'dfc686366315b75d21ff4989dff1dae9' THEN RAISE EXCEPTION 'gin lifecycle owner drift: private.replay_gin_shared_end_v1(jsonb,jsonb,jsonb)'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.replay_gin_lifecycle_begin_v2(_game public.games,_source text,_allow_legacy boolean DEFAULT false,_operands jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE c jsonb;s jsonb;r uuid;b jsonb;ending jsonb;actor text;
BEGIN
 IF _game.replay_contract_version IS DISTINCT FROM 1 OR (_game.game_type IS NOT NULL AND _game.game_type<>'gin-rummy')
 OR coalesce(current_setting('app.replay_gin_shared_root',true),'')<>'' THEN RETURN NULL; END IF;
 SELECT (body #>> '{identity,roundId}')::uuid,body #> '{closing,endingState}' INTO r,ending FROM private.replay_steps
 WHERE session_id=_game.id ORDER BY sequence DESC LIMIT 1;
 SELECT gr.replay_context_v1,gr.state INTO c,s FROM private.gin_rummy_round_states gr WHERE gr.round_id=r;
 IF c IS NULL THEN RETURN NULL; END IF;
 -- No backfill of older incomplete boundaries. Existing active Gin hooks keep
 -- their prior behavior until the next authoritative opening enrolls v2.
 IF c #>> '{checkpoint,lifecycleCaptureContract}' IS DISTINCT FROM 'gin-lifecycle/2'
 AND NOT (_allow_legacy AND _game.game_type IS NOT DISTINCT FROM 'gin-rummy') THEN RETURN NULL; END IF;
 IF ending IS NOT NULL THEN c:=jsonb_set(c,'{checkpoint}',ending-ARRAY['gameState','visibility','privateCatalog']); END IF;
 b:=private.replay_gin_state_v1(s,c);
 IF _source LIKE 'public.%' THEN SELECT value->>'playerId' INTO actor FROM jsonb_array_elements(b->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1; END IF;
 PERFORM set_config('app.replay_gin_shared_root',_source,true);
 PERFORM set_config('app.replay_gin_opening_cause',jsonb_build_object('contract','gin-lifecycle/2','source',_source,'actorId',actor,'operands',_operands,'previousIdentity',c->'identity')::text,true);
 RETURN jsonb_build_object('context',c,'before',b,'round',r,'source',_source,'actorId',actor);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_lifecycle_begin_v2(public.games,text,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.replay_gin_open_v1(_game games, _round rounds, _state jsonb, _rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_context jsonb; v_cards jsonb; v_players jsonb; v_users jsonb; v_balances jsonb; v_identity jsonb; v_origins jsonb;
BEGIN
  IF _game.replay_contract_version IS NULL THEN RETURN; END IF;
  SELECT jsonb_agg(jsonb_build_object('playerId',id,'userId',user_id,'seat',position,'isBot',is_bot,'status',status) ORDER BY position,id),
         jsonb_object_agg(id::text,user_id),jsonb_object_agg('player:'||id::text,chips),jsonb_object_agg(id::text,CASE WHEN is_bot THEN 'bot' ELSE 'player' END)
    INTO v_players,v_users,v_balances,v_origins FROM public.players WHERE game_id=_game.id;
  SELECT jsonb_object_agg(private.gin_card_key(card),gen_random_uuid()::text) INTO v_cards
    FROM (SELECT value card FROM jsonb_array_elements((_state->'stockPile')||(_state->'discardPile'))
          UNION ALL SELECT card.value FROM jsonb_each(_state->'playerStates') p CROSS JOIN LATERAL jsonb_array_elements(p.value->'hand') card) cards;
  v_identity := jsonb_build_object('sessionId',_game.id,'dealerGameId',_round.dealer_game_id,'handNumber',_round.hand_number,'roundId',_round.id);
  v_context := jsonb_build_object('identity',v_identity,'cardIds',v_cards,'users',v_users,'origins',v_origins,
    'checkpoint',jsonb_build_object('captureContract','gin-replay/1','lifecycleCaptureContract','gin-lifecycle/2','roster',private.replay_gin_roster_v1(_game.id),'session',to_jsonb(_game)-ARRAY['replay_contract_version','authority_revision','chip_transfer_cursor','pot_transfer_cursor'],
      'round',to_jsonb(_round)-ARRAY['gin_rummy_state','authority_revision'],'rules',jsonb_build_object('contract','gin-rummy/1','config',_rules),
      'balances',v_balances||jsonb_build_object('pot',_game.pot),'scores',_state->'matchScores'));
  INSERT INTO private.replay_streams(session_id,contract,coverage,writer_contract)
    VALUES(_game.id,'ptown-replay/1','hand_boundary','gin-replay/1') ON CONFLICT(session_id) DO NOTHING;
  UPDATE private.gin_rummy_round_states SET replay_context_v1=v_context WHERE round_id=_round.id;
  PERFORM private.replay_append_v1(_game.id,'gin:'||_round.id::text||':opening',v_identity,
    jsonb_build_object('state',private.replay_gin_state_v1(_state,v_context),'coverage','hand_boundary','rules',v_context #> '{checkpoint,rules}','trigger',coalesce(nullif(current_setting('app.replay_gin_opening_cause',true),'')::jsonb,'null'::jsonb)),'[]');
END;
$function$
;
CREATE OR REPLACE FUNCTION private.replay_gin_shared_end_v1(_capture jsonb, _operands jsonb, _result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE c jsonb;b jsonb;a jsonb;s jsonb;g public.games;r public.rounds;bal jsonb;expected jsonb;edge jsonb;edges jsonb:='[]';
 d jsonb;actor text;closing jsonb;key text;amount bigint;from_key text;to_key text;seq bigint;
 parts jsonb:='[]';cards jsonb;previous jsonb;middle jsonb;
BEGIN
 IF _capture IS NULL THEN RETURN; END IF;
 -- An enclosing ante action can open a new hand. Its opening checkpoint owns
 -- that committed boundary; never append the predecessor after that opening.
 IF (SELECT body #>> '{identity,roundId}' FROM private.replay_steps
     WHERE session_id=(_capture #>> '{context,identity,sessionId}')::uuid ORDER BY sequence DESC LIMIT 1)
    IS DISTINCT FROM _capture->>'round' THEN
  PERFORM set_config('app.replay_gin_shared_root','',true); PERFORM set_config('app.replay_gin_opening_cause','',true); RETURN;
 END IF;
 c:=_capture->'context';b:=_capture->'before';
 SELECT * INTO g FROM public.games WHERE id=(c #>> '{identity,sessionId}')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'replay_v1:captured_session_deleted'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=(_capture->>'round')::uuid;
 SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=r.id;
 SELECT jsonb_object_agg('player:'||id::text,chips)||jsonb_build_object('pot',g.pot) INTO bal FROM public.players WHERE game_id=g.id;
 a:=private.replay_gin_state_v1(s,c)||jsonb_build_object('session',private.replay_gin_game_envelope_v1(g),
  'round',to_jsonb(r)-ARRAY['gin_rummy_state','authority_revision'],'roster',private.replay_gin_roster_v1(g.id),'balances',bal);
 d:=private.replay_diff_v1(b,a);
 PERFORM set_config('app.replay_gin_shared_root','',true);
 IF d='[]'::jsonb THEN RETURN; END IF;
 expected:=b->'balances';
 FOR key IN SELECT jsonb_object_keys(bal) LOOP
  IF NOT expected ? key THEN expected:=expected||jsonb_build_object(key,0); END IF;
 END LOOP;
 FOR edge IN SELECT value FROM jsonb_array_elements(coalesce(_operands->'p_transfers','[]')) LOOP
  amount:=(edge->>'amount')::bigint;
  from_key:=CASE WHEN edge #>> '{from,kind}'='pot' THEN 'pot' ELSE 'player:'||(edge #>> '{from,playerId}') END;
  to_key:=CASE WHEN edge #>> '{to,kind}'='pot' THEN 'pot' ELSE 'player:'||(edge #>> '{to,playerId}') END;
  expected:=jsonb_set(expected,ARRAY[from_key],to_jsonb((expected->>from_key)::bigint-amount));
  expected:=jsonb_set(expected,ARRAY[to_key],to_jsonb((expected->>to_key)::bigint+amount));
  edges:=edges||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from',from_key,'to',to_key,'amount',amount,'reason',_operands->>'p_reason'));
 END LOOP;
 IF expected IS DISTINCT FROM bal THEN RAISE EXCEPTION 'replay_v1:unrecorded_shared_finance'; END IF;
 actor:=_capture->>'actorId';
 previous:=b;
 IF _capture ? 'anteDecisionRoster' THEN
  middle:=jsonb_set(previous,'{roster}',_capture->'anteDecisionRoster');
  parts:=parts||jsonb_build_array(jsonb_build_object('type','session.ante_decision','source',_capture->>'source','actorId',actor,
   'targets',jsonb_build_array(_operands->'p_player_id'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',private.replay_diff_v1(previous,middle),'scores','[]'::jsonb,'transfers','[]'::jsonb));
  previous:=middle;
 END IF;
 FOR cards IN SELECT value FROM jsonb_array_elements(coalesce(_capture->'dealerDrawRounds','[]')) LOOP
  middle:=jsonb_set(previous,'{session,dealer_selection_state}',jsonb_build_object('cards',cards,'isComplete',false,
   'preparedAt',a #> '{session,dealer_selection_state,preparedAt}'));
  parts:=parts||jsonb_build_array(jsonb_build_object('type','session.dealer_draw_round','source',_capture->>'source','actorId',NULL,
   'targets',(SELECT jsonb_agg(value->'playerId') FROM jsonb_array_elements(cards)),'origin','system','operands','{}'::jsonb,
   'delta',private.replay_diff_v1(previous,middle),'scores','[]'::jsonb,'transfers','[]'::jsonb));
  previous:=middle;
 END LOOP;
 d:=private.replay_diff_v1(previous,a);
 IF s->>'phase'='complete' THEN closing:=jsonb_build_object('scope','hand','identity',c->'identity','disposition',g.status,
  'writerContract',c #>> '{checkpoint,captureContract}','completeness',CASE WHEN c #>> '{checkpoint,captureContract}'='gin-replay/1' THEN 'complete' ELSE 'partial' END,'endingState',a,'balances',bal,'scores',a->'scores'); END IF;
 seq:=private.replay_append_v1(g.id,'gin:'||r.id||':shared:'||gen_random_uuid(),c->'identity',NULL,
  parts||jsonb_build_array(jsonb_build_object('type',CASE WHEN _capture->>'source'='public.configure_dealer_game' AND g.game_type IS DISTINCT FROM 'gin-rummy' THEN 'session.game_handoff' ELSE 'session.'||split_part(_capture->>'source','.',2) END,'source',_capture->>'source',
   'actorId',actor,'targets',coalesce(jsonb_path_query_array(_operands,'$.p_player_id'),'[]'),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
   'operands',_operands,'delta',d,'scores','[]'::jsonb,'transfers',edges)),closing);
 c:=jsonb_set(c,'{checkpoint}',a-ARRAY['gameState','visibility','privateCatalog']);
 IF s->>'phase'<>'complete' THEN UPDATE private.gin_rummy_round_states SET replay_context_v1=c WHERE round_id=r.id; END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.complete_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_winner_position integer;
  v_prepared_at timestamptz;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.complete_session_dealer_selection',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  BEGIN
    v_winner_position := nullif(v_game.dealer_selection_state->>'winnerPosition','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_winner';
  END;
  IF v_winner_position IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','not_prepared');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  BEGIN
    v_prepared_at:=nullif(v_game.dealer_selection_state->>'preparedAt','')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'complete_session_dealer_selection:malformed_prepared_at';
  END;
  IF v_prepared_at IS NULL OR v_prepared_at+interval '3 seconds'>clock_timestamp() THEN
    v_replay_return := jsonb_build_object(
      'outcome','presentation_pending','prepared_at',v_prepared_at
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.position = v_winner_position
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
  ) THEN
    v_replay_return := jsonb_build_object('outcome','winner_ineligible');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  v_deadline := clock_timestamp() + make_interval(
    secs => greatest(1,coalesce(v_game.game_setup_timer_seconds,30))
  );
  UPDATE public.games
     SET status = 'game_selection',
         dealer_position = v_winner_position,
         config_complete = false,
         config_deadline = v_deadline,
         current_game_uuid = NULL
   WHERE id = p_game_id;
  v_replay_return := jsonb_build_object(
    'outcome','advanced','status','game_selection',
    'dealer_position',v_winner_position,'config_deadline',v_deadline
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.finalize_settled_session_if_no_active_humans(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return text;
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_result_count integer := 0;
  v_snapshot_count integer := 0;
  v_missing_or_stale_snapshot boolean := false;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.finalize_settled_session_if_no_active_humans',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := 'missing-game';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF NOT COALESCE(v_game.real_money, false) THEN
    v_replay_return := 'ineligible-state';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := 'already-session-ended';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    v_replay_return := 'active-humans';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT count(*) INTO v_result_count
    FROM public.game_results
   WHERE game_id = p_game_id;

  IF v_result_count = 0 THEN
    v_replay_return := 'no-settled-results';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT count(DISTINCT user_id) INTO v_snapshot_count
    FROM public.session_player_snapshots
   WHERE game_id = p_game_id
     AND is_bot = false;

  SELECT EXISTS (
    SELECT 1
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.is_bot = false
       AND player.status <> 'observer'
       AND NOT EXISTS (
         SELECT 1
           FROM (
             SELECT DISTINCT ON (snapshot.user_id)
                    snapshot.user_id,
                    snapshot.chips
               FROM public.session_player_snapshots AS snapshot
              WHERE snapshot.game_id = p_game_id
                AND snapshot.is_bot = false
              ORDER BY snapshot.user_id, snapshot.created_at DESC, snapshot.id DESC
           ) AS latest
          WHERE latest.user_id = player.user_id
            AND latest.chips = player.chips
       )
  ) INTO v_missing_or_stale_snapshot;

  IF v_snapshot_count = 0 OR v_missing_or_stale_snapshot THEN
    v_replay_return := 'blocked-incomplete-final-snapshots';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  -- The existing games-status trigger mints SessionResult rows from the
  -- already-final snapshots. Its unique key keeps a repeated call idempotent.
  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;

  v_replay_return := 'session-ended-with-results';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.prepare_session_dealer_selection(p_game_id uuid, p_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_allow_bot boolean := false;
  v_remaining uuid[];
  v_winners uuid[];
  v_player_id uuid;
  v_position integer;
  v_deck jsonb;
  v_card jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_round integer := 0;
  v_deck_index integer := 0;
  v_rank_value integer;
  v_highest integer;
  v_prepared_at timestamptz := clock_timestamp();
  v_winner_position integer;
  v_state jsonb;
  v_harness_value jsonb;
  v_harness_expires_at timestamptz;
  v_harness_applied boolean := false;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.prepare_session_dealer_selection',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status <> 'dealer_selection'
     OR v_game.timer_generation IS DISTINCT FROM p_timer_generation THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF coalesce((v_game.dealer_selection_state->>'isComplete')::boolean,false)
     AND (v_game.dealer_selection_state->>'winnerPosition') IS NOT NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome','already_prepared','state',v_game.dealer_selection_state
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm')
   LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);

  SELECT array_agg(player.id ORDER BY player.position)
    INTO v_remaining
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false));

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    SELECT array_agg(player.id ORDER BY player.position)
      INTO v_remaining
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND NOT coalesce(player.sitting_out,false)
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left');
  END IF;

  IF coalesce(cardinality(v_remaining),0) = 0 THEN
    v_replay_return := jsonb_build_object('outcome','no_eligible_players');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  -- Lock the single request before testing it. A second concurrent dealer draw
  -- sees the consumed value after this transaction commits, so the fixture can
  -- never leak into two sessions.
  SELECT setting.value
    INTO v_harness_value
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness'
   FOR UPDATE;

  BEGIN
    v_harness_expires_at := nullif(v_harness_value->>'expiresAt', '')::timestamptz;
    v_harness_applied := cardinality(v_remaining) > 1
      AND coalesce((v_harness_value->>'armed')::boolean, false)
      AND nullif(v_harness_value->>'armedBy', '')::uuid = v_game.current_host
      AND v_harness_expires_at > clock_timestamp();
  EXCEPTION WHEN invalid_text_representation THEN
    v_harness_applied := false;
  END;

  IF v_harness_applied THEN
    -- First two seats receive equal aces; every other eligible seat receives a
    -- lower unique card. The tied seats then receive K/Q, guaranteeing a real
    -- second draw with one winner while preserving deck uniqueness.
    WITH all_cards AS (
      SELECT rank, suit,
        CASE rank
          WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
          ELSE rank::integer
        END AS rank_value
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit
    ), first_round_fill AS (
      SELECT row_number() OVER (ORDER BY card.rank_value DESC, card.suit) + 2 AS sequence,
             card.rank,
             card.suit
        FROM all_cards card
       WHERE card.rank_value <= 11
       ORDER BY card.rank_value DESC, card.suit
       LIMIT greatest(cardinality(v_remaining) - 2, 0)
    ), forced_cards AS (
      SELECT 1::bigint AS sequence, 'A'::text AS rank, '♠'::text AS suit
      UNION ALL SELECT 2, 'A', '♥'
      UNION ALL SELECT fill.sequence, fill.rank, fill.suit FROM first_round_fill fill
      UNION ALL SELECT cardinality(v_remaining) + 1, 'K', '♠'
      UNION ALL SELECT cardinality(v_remaining) + 2, 'Q', '♠'
    ), remaining_cards AS (
      SELECT card.rank, card.suit, private.secure_shuffle_key() AS random_order
        FROM all_cards card
       WHERE NOT EXISTS (
         SELECT 1 FROM forced_cards forced
          WHERE forced.rank = card.rank AND forced.suit = card.suit
       )
    ), ordered_cards AS (
      SELECT 0 AS section, forced.sequence::double precision AS sequence,
             forced.rank, forced.suit
        FROM forced_cards forced
      UNION ALL
      SELECT 1, remaining.random_order, remaining.rank, remaining.suit
        FROM remaining_cards remaining
    )
    SELECT jsonb_agg(
             jsonb_build_object('rank', deck.rank, 'suit', deck.suit)
             ORDER BY deck.section, deck.sequence
           )
      INTO v_deck
      FROM ordered_cards deck;

    UPDATE public.system_settings
       SET value = v_harness_value || jsonb_build_object(
             'armed', false,
             'consumedAt', clock_timestamp(),
             'consumedGameId', p_game_id
           ),
           updated_at = clock_timestamp()
     WHERE key = 'session_dealer_draw_tie_harness';
  ELSE
    SELECT jsonb_agg(
             jsonb_build_object('rank',rank,'suit',suit)
             ORDER BY private.secure_shuffle_key()
           )
      INTO v_deck
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
      CROSS JOIN unnest(ARRAY['♠','♥','♦','♣']) suit;
  END IF;

  WHILE cardinality(v_remaining) > 1 LOOP
    v_round := v_round + 1;
    v_highest := 0;
    v_winners := ARRAY[]::uuid[];
    FOREACH v_player_id IN ARRAY v_remaining LOOP
      v_card := v_deck -> v_deck_index;
      v_deck_index := v_deck_index + 1;
      SELECT player.position INTO v_position
        FROM public.players player WHERE player.id = v_player_id;
      v_rank_value := CASE v_card->>'rank'
        WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
        ELSE (v_card->>'rank')::integer END;
      IF v_rank_value > v_highest THEN
        v_highest := v_rank_value;
        v_winners := ARRAY[v_player_id];
      ELSIF v_rank_value = v_highest THEN
        v_winners := array_append(v_winners,v_player_id);
      END IF;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'playerId',v_player_id,'position',v_position,'card',v_card,
        'isRevealed',true,'isWinner',false,'isDimmed',false,
        'roundNumber',v_round
      ));
    END LOOP;

    SELECT coalesce(jsonb_agg(
      CASE WHEN (entry.value->>'roundNumber')::integer = v_round THEN
        entry.value || jsonb_build_object(
          'isWinner',(entry.value->>'playerId')::uuid = ANY(v_winners),
          'isDimmed',NOT ((entry.value->>'playerId')::uuid = ANY(v_winners))
        ) ELSE entry.value END
      ORDER BY entry.ordinality
    ),'[]'::jsonb) INTO v_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS entry(value,ordinality);

    IF v_replay_shared IS NOT NULL THEN
      v_replay_shared:=jsonb_set(v_replay_shared,'{dealerDrawRounds}',coalesce(v_replay_shared->'dealerDrawRounds','[]')||jsonb_build_array(v_cards));
    END IF;
    v_remaining := v_winners;
  END LOOP;

  v_player_id := v_remaining[1];
  SELECT player.position INTO v_winner_position
    FROM public.players player WHERE player.id = v_player_id;

  IF jsonb_array_length(v_cards) = 0 THEN
    v_state := jsonb_build_object(
      'cards','[]'::jsonb,
      'announcement','Only eligible player wins the deal',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
  ELSE
    v_state := jsonb_build_object(
      'cards',v_cards,
      'announcement','Seat ' || v_winner_position::text || ' wins the deal!',
      'isComplete',true,
      'winnerPosition',v_winner_position,
      'preparedAt',v_prepared_at
    );
    IF v_harness_applied THEN
      v_state := v_state || jsonb_build_object(
        'harnessApplied', 'force_first_round_tie_once'
      );
    END IF;
  END IF;

  UPDATE public.games
     SET dealer_selection_state = v_state
   WHERE id = p_game_id;

  PERFORM private.register_game_timer(
    p_game_id, 'dealer_selection_complete', p_timer_generation::text,
    'canonical_timers', v_prepared_at + interval '3 seconds',
    NULL, NULL, NULL, v_player_id, 'dealer_selection',
    jsonb_build_object(
      'timer_generation',p_timer_generation,
      'winner_position',v_winner_position,
      'prepared_at',v_prepared_at
    )
  );

  v_replay_return := jsonb_build_object('outcome','prepared','state',v_state);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_timer_generation',p_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.reconcile_session_abandonment(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return text;
  v_game public.games%ROWTYPE;
  v_watch private.session_abandonment_watches%ROWTYPE;
  v_active_humans integer := 0;
  v_seated_humans integer := 0;
  v_missed_heartbeat_counts jsonb := '{}'::jsonb;
  v_active_grace_seconds integer := 60;
  v_sitting_out_grace_seconds integer := 60;
  v_forced_confirmation_seconds integer := 15;
  v_initial_grace_seconds integer := 300;
  v_nonpristine boolean := false;
  v_outcome text;
  v_deleted integer := 0;
  v_authority_keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write','app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  v_prior_settings text[]:=ARRAY[]::text[];
  v_setting_index integer;
BEGIN
  IF p_game_id IS NULL THEN
    v_replay_return := 'missing-game-id';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.reconcile_session_abandonment',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := 'missing-game';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    IF v_game.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;
    END IF;
    v_replay_return := 'ineligible-state';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := 'unarmed';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT
    CASE
      WHEN setting.value ->> 'subsequent_active_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_active_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'subsequent_sitting_out_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_sitting_out_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'forced_absence_confirmation_seconds' ~ '^[0-9]+$'
        THEN LEAST(300, GREATEST(5,
          (setting.value ->> 'forced_absence_confirmation_seconds')::integer))
      ELSE 15
    END,
    CASE
      WHEN setting.value ->> 'initial_waiting_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(7200, GREATEST(60,
          (setting.value ->> 'initial_waiting_grace_seconds')::integer))
      ELSE 300
    END
    INTO v_active_grace_seconds, v_sitting_out_grace_seconds,
         v_forced_confirmation_seconds, v_initial_grace_seconds
    FROM public.system_settings AS setting
   WHERE setting.key = 'postgame_presence'
   LIMIT 1;

  v_active_grace_seconds := COALESCE(v_active_grace_seconds, 60);
  v_sitting_out_grace_seconds := COALESCE(v_sitting_out_grace_seconds, 60);
  v_forced_confirmation_seconds := COALESCE(v_forced_confirmation_seconds, 15);
  v_initial_grace_seconds := COALESCE(v_initial_grace_seconds, 300);

  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(EXTRACT(EPOCH FROM (
          p_now - GREATEST(
            v_watch.armed_at,
            player.created_at,
            COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
          )
        )) / 5)::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
    LEFT JOIN LATERAL (
      SELECT heartbeat.updated_at
        FROM public.voice_presence_heartbeats AS heartbeat
       WHERE heartbeat.game_id = p_game_id
         AND heartbeat.user_id = player.user_id
         AND heartbeat.status IN ('active', 'hidden')
         AND heartbeat.updated_at >= v_watch.armed_at
       ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
       LIMIT 1
    ) AS latest_heartbeat ON true
   WHERE player.game_id = p_game_id
     AND NOT player.is_bot
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Any heartbeat after a forced claim cancels stand-up, but Sitting Out is
  -- retained. The player opts back in through the ordinary table action.
  DELETE FROM private.postgame_forced_absence_watches AS forced
   WHERE forced.game_id = p_game_id
     AND (
       NOT EXISTS (
         SELECT 1
           FROM public.players AS player
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND NOT player.is_bot
            AND player.position IS NOT NULL
            AND player.sitting_out
            AND player.status NOT IN ('observer', 'left')
       )
       OR EXISTS (
         SELECT 1
           FROM public.players AS player
           JOIN public.voice_presence_heartbeats AS heartbeat
             ON heartbeat.user_id = player.user_id
            AND heartbeat.game_id = player.game_id
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       )
     );

  IF v_watch.waiting_kind = 'subsequent' THEN
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM private.postgame_forced_absence_watches AS forced
     WHERE forced.game_id = p_game_id
       AND forced.player_id = player.id
       AND player.game_id = forced.game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND p_now >= forced.armed_at
         + make_interval(secs => v_forced_confirmation_seconds)
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = forced.game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       );

    DELETE FROM private.postgame_forced_absence_watches AS forced
     USING public.players AS player
     WHERE forced.game_id = p_game_id
       AND player.id = forced.player_id
       AND player.game_id = forced.game_id
       AND (
         player.status IN ('observer', 'left')
         OR NOT player.sitting_out
       );

    -- A sitting-out human without a forced claim is voluntary (or recovered
    -- from one). Sixty seconds without any new heartbeat releases the seat.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND NOT EXISTS (
           SELECT 1
             FROM private.postgame_forced_absence_watches AS forced
            WHERE forced.game_id = player.game_id
              AND forced.player_id = player.id
         )
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_sitting_out_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    -- The lateral join above intentionally requires a post-boundary heartbeat.
    -- Handle never-seen voluntary sitters from the boundary timestamp.
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM private.postgame_forced_absence_watches AS forced
          WHERE forced.game_id = player.game_id
            AND forced.player_id = player.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_sitting_out_grace_seconds);

    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        LEFT JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND NOT player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
         ) + make_interval(secs => v_active_grace_seconds)
    ), demoted AS (
      UPDATE public.players AS player
         SET sitting_out = true,
             waiting = false
        FROM due
       WHERE player.id = due.id
       RETURNING player.game_id, player.id
    )
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT demoted.game_id, demoted.id, p_now, 'presence_timeout'
      FROM demoted
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  ELSE
    -- Initial Waiting has no Sit Out action. Ready humans are stood up after
    -- five minutes without a heartbeat and no intermediate demotion.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_initial_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_initial_grace_seconds);
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_seated_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = CASE
             WHEN v_active_humans = 0
               THEN COALESCE(zero_active_since, p_now)
             ELSE NULL
           END,
           last_checked_at = p_now,
           next_check_at = p_now + interval '5 seconds',
           missed_heartbeat_counts = v_missed_heartbeat_counts,
           last_outcome = 'seated-humans:' || v_seated_humans::text ||
             ';active-humans:' || v_active_humans::text ||
             ';missed-windows:' || v_missed_heartbeat_counts::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    v_replay_return := 'seated-humans';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_watch.waiting_kind = 'initial' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dealer_games WHERE session_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.rounds WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dice_roll_audit WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.cribbage_hand_archive WHERE game_id = p_game_id)
      OR COALESCE(v_game.total_hands, 0) > 0
      OR COALESCE(v_game.pot, 0) <> 0
      OR v_game.current_game_uuid IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.players
         WHERE game_id = p_game_id AND chips <> 0
      )
      INTO v_nonpristine;

    IF v_nonpristine THEN
      UPDATE private.session_abandonment_watches
         SET last_checked_at = p_now,
             next_check_at = p_now + interval '15 minutes',
             last_outcome = 'blocked-nonpristine-initial-waiting',
             updated_at = p_now
       WHERE game_id = p_game_id;
      v_replay_return := 'blocked-nonpristine-initial-waiting';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
    END IF;

    IF v_game.real_money IS DISTINCT FROM false THEN
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        v_prior_settings:=array_append(v_prior_settings,coalesce(current_setting(v_authority_keys[v_setting_index],true),''));
        PERFORM set_config(v_authority_keys[v_setting_index],'on',true);
      END LOOP;
      UPDATE public.games SET status='session_ended',session_ended_at=p_now,game_over_at=coalesce(game_over_at,p_now),
        pending_session_end=false,is_paused=false WHERE id=p_game_id;
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        PERFORM set_config(v_authority_keys[v_setting_index],v_prior_settings[v_setting_index],true);
      END LOOP;
      DELETE FROM private.session_abandonment_watches WHERE game_id=p_game_id;
      v_replay_return := 'archived-pristine-real-session';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
    END IF;

    DELETE FROM public.session_events WHERE game_id = p_game_id;
    DELETE FROM public.voice_presence_heartbeats WHERE game_id = p_game_id;
    DELETE FROM public.games WHERE id = p_game_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_replay_return := CASE WHEN v_deleted = 1
      THEN 'deleted-pristine-initial-session'
      ELSE 'delete-race-lost'
    END;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id) THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(
      p_game_id,
      p_now
    );
    v_replay_return := v_outcome;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND (
       EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
       OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
       OR COALESCE(v_game.pot, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.players WHERE game_id = p_game_id AND chips <> 0)
     ) THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = p_now + interval '15 minutes',
           last_outcome = 'blocked-unsettled-financial-evidence',
           updated_at = p_now
     WHERE game_id = p_game_id;
    v_replay_return := 'blocked-unsettled-financial-evidence';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;
  DELETE FROM private.postgame_forced_absence_watches
   WHERE game_id = p_game_id;

  v_replay_return := 'session-ended-without-financial-settlement';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.request_session_end(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; ctx text; prior jsonb:='{}'; target text; terminal_key text; settled boolean:=false; result jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'private.request_session_end',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.status IN ('session_ended','completed') THEN
 v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','session_ended','already_terminal',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.status='game_over' THEN
  terminal_key:=CASE g.game_type WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN '3-5-7-game' THEN 'three_five_seven_terminal'
   WHEN '357' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal'
   WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  SELECT coalesce(g.pot,0)=0 AND EXISTS(SELECT 1 FROM public.game_results r WHERE r.game_id=g.id
   AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands
   AND ((g.game_type IN ('holm','holm-game') AND r.event_kind='chucky_final_award') OR r.settlement_key=terminal_key))
   INTO settled;
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF (g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0 AND g.status IN ('waiting','dealer_selection','game_selection','configuring')) OR settled THEN
  IF g.real_money IS FALSE AND g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0
   AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND chips<>0)
   AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g.id) THEN
   DELETE FROM public.games WHERE id=g.id; target:='deleted';
  ELSE
   UPDATE public.games SET status='session_ended',session_ended_at=coalesce(session_ended_at,clock_timestamp()),
    pending_session_end=false,config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=g.id;
   target:='session_ended';
  END IF;
 ELSE
  -- Rule engines consume the request at their financial completion boundary.
  UPDATE public.games SET pending_session_end=true WHERE id=g.id;
  target:='pending_session_end';
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition',target,'already_terminal',false);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION private.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.stand_up_and_resolve_postgame',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  v_replay_return := jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.begin_session_dealer_selection(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_host public.players%ROWTYPE;
  v_other public.players%ROWTYPE;
  v_occupant public.players%ROWTYPE;
  v_eligible_count integer := 0;
  v_target_position integer;
  v_old_other_position integer;
  v_new_dealer_position integer;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF NOT v_service AND auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.begin_session_dealer_selection',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status = 'dealer_selection' THEN
    v_replay_return := jsonb_build_object('outcome','already_started','status',v_game.status,'timer_generation',v_game.timer_generation,'dealer_selection_state',v_game.dealer_selection_state);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_game.status <> 'waiting' THEN
    v_replay_return := jsonb_build_object('outcome','not_startable','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  PERFORM 1 FROM public.players player WHERE player.game_id = p_game_id FOR UPDATE;
  SELECT count(*) INTO v_eligible_count
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false));
  IF v_eligible_count < 2 THEN
    v_replay_return := jsonb_build_object('outcome','not_ready','eligible_players',v_eligible_count);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT player.* INTO v_host
    FROM public.players player
   WHERE player.game_id = p_game_id AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     AND NOT coalesce(player.is_bot,false)
   ORDER BY CASE WHEN player.user_id = v_game.current_host THEN 0 ELSE 1 END,
            player.created_at NULLS LAST, player.id
   LIMIT 1;
  IF NOT FOUND THEN
    SELECT player.* INTO v_host
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     ORDER BY player.created_at NULLS LAST, player.id
     LIMIT 1;
  END IF;
  IF NOT v_service AND v_host.user_id IS DISTINCT FROM auth.uid() THEN
    v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_eligible_count = 2 THEN
    SELECT player.* INTO v_other
      FROM public.players player
     WHERE player.game_id = p_game_id AND player.id <> v_host.id
       AND player.position IS NOT NULL AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     LIMIT 1;
    v_target_position := ((v_host.position - 1 + 3) % 7) + 1;
    v_old_other_position := v_other.position;
    IF least(abs(v_host.position - v_other.position),7 - abs(v_host.position - v_other.position)) <> 3 THEN
      SELECT player.* INTO v_occupant FROM public.players player
       WHERE player.game_id = p_game_id AND player.id <> v_other.id
         AND player.position = v_target_position LIMIT 1;
      IF FOUND THEN UPDATE public.players SET position = NULL WHERE id = v_occupant.id; END IF;
      UPDATE public.players SET position = v_target_position WHERE id = v_other.id;
      IF v_occupant.id IS NOT NULL THEN
        UPDATE public.players SET position = v_old_other_position WHERE id = v_occupant.id;
      END IF;
      v_new_dealer_position := v_game.dealer_position;
      IF v_new_dealer_position = v_old_other_position THEN
        v_new_dealer_position := v_target_position;
      ELSIF v_occupant.id IS NOT NULL AND v_new_dealer_position = v_target_position THEN
        v_new_dealer_position := v_old_other_position;
      END IF;
      IF v_new_dealer_position IS DISTINCT FROM v_game.dealer_position THEN
        UPDATE public.games SET dealer_position = v_new_dealer_position WHERE id = p_game_id;
      END IF;
    END IF;
  END IF;
  UPDATE public.players SET status = 'active', sitting_out = false, waiting = false
   WHERE game_id = p_game_id AND position IS NOT NULL AND status NOT IN ('observer','left')
     AND (coalesce(waiting,false) OR NOT coalesce(sitting_out,false));
  UPDATE public.games
     SET status = 'dealer_selection', dealer_selection_state = NULL, current_game_uuid = NULL,
         config_deadline = NULL, config_complete = false, awaiting_next_round = false, last_round_result = NULL
   WHERE id = p_game_id
   RETURNING * INTO v_game;
  v_replay_return := jsonb_build_object('outcome','started','status',v_game.status,'timer_generation',v_game.timer_generation);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_session_bot(_game_id uuid, _bot_id uuid, _aggression_level text, _position integer, _sitting_out boolean DEFAULT false, _waiting boolean DEFAULT false, _actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
 _next integer; _name text; _suffix text; _player public.players;
 _game public.games; _actor uuid:=auth.uid();
BEGIN
 IF _actor IS NULL THEN RAISE EXCEPTION 'create_session_bot:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO _game FROM public.games WHERE id=_game_id FOR UPDATE;
 IF FOUND THEN
  IF _game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(_game,'public.create_session_bot',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'create_session_bot:game_not_found'; END IF;
 IF _game.current_host IS DISTINCT FROM _actor AND NOT public.has_role(_actor,'admin'::public.app_role) THEN
   RAISE EXCEPTION 'create_session_bot:host_required' USING ERRCODE='42501';
 END IF;
 IF _game.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'create_session_bot:fake_money_only' USING ERRCODE='42501'; END IF;
 IF _game.status IN ('completed','session_ended','game_over') THEN RAISE EXCEPTION 'create_session_bot:terminal_game'; END IF;
 IF _bot_id IS NULL OR _position IS NULL OR _position NOT BETWEEN 1 AND 7
    OR coalesce(_aggression_level,'normal') NOT IN ('very_conservative','conservative','normal','aggressive','very_aggressive') THEN
   RAISE EXCEPTION 'create_session_bot:invalid_request';
 END IF;
 -- The caller's UUID is an operation identity, never a replacement identity.
 SELECT * INTO _player FROM public.players WHERE game_id=_game_id AND user_id=_bot_id;
 IF FOUND THEN
   IF NOT _player.is_bot THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
   SELECT username INTO _name FROM public.profiles WHERE id=_bot_id;
   SELECT (event_data->>'bot_alias_ordinal')::integer INTO _next FROM public.session_events
    WHERE game_id=_game_id AND event_type='bot_added' AND event_data->>'bot_id'=_bot_id::text LIMIT 1;
   v_replay_return := jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('_game_id',_game_id,'_bot_id',_bot_id,'_aggression_level',_aggression_level,'_position',_position,'_sitting_out',_sitting_out,'_waiting',_waiting,'_actor_user_id',_actor_user_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=_bot_id) THEN RAISE EXCEPTION 'create_session_bot:identity_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=_game_id AND position=_position) THEN
   RAISE EXCEPTION 'Seat % is already occupied',_position;
 END IF;
 _next:=public.allocate_bot_alias_number(_game_id);
 _name:='Bot '||_next::text;
 _suffix:=substr(replace(_bot_id::text,'-',''),1,6);
 IF EXISTS(SELECT 1 FROM public.profiles WHERE username=_name) THEN _name:=_name||'-'||_suffix; END IF;
 INSERT INTO public.profiles(id,username,aggression_level)
 VALUES(_bot_id,_name,coalesce(_aggression_level,'normal'));
 INSERT INTO public.players(user_id,game_id,position,chips,is_bot,status,sitting_out,waiting)
 VALUES(_bot_id,_game_id,_position,0,true,'active',
   _game.status='in_progress' OR coalesce(_sitting_out,false),
   _game.status='in_progress' OR coalesce(_waiting,false))
 RETURNING * INTO _player;
 INSERT INTO public.session_events(game_id,event_type,event_data,user_id)
 VALUES(_game_id,'bot_added',jsonb_build_object('position',_position,'bot_username',_name,
   'bot_alias_ordinal',_next,'bot_id',_bot_id),_actor);
 v_replay_return := jsonb_build_object('player',to_jsonb(_player),'username',_name,'ordinal',_next,'deduped',false);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('_game_id',_game_id,'_bot_id',_bot_id,'_aggression_level',_aggression_level,'_position',_position,'_sitting_out',_sitting_out,'_waiting',_waiting,'_actor_user_id',_actor_user_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.request_session_end(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_timer_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; fallback_host uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_end:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.request_session_end',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT user_id INTO fallback_host FROM public.players WHERE game_id=g.id AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL ORDER BY created_at,id LIMIT 1;
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 coalesce(g.current_host,fallback_host) IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot
 AND status NOT IN ('left','observer') AND position IS NOT NULL)
 AND NOT (g.current_host=auth.uid() AND g.status='waiting' AND g.current_game_uuid IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id))) THEN
 RAISE EXCEPTION 'session_end:not_session_host' USING ERRCODE='42501'; END IF;
 IF g.status IN ('session_ended','completed') THEN v_replay_return := private.request_session_end(g.id);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.timer_generation IS DISTINCT FROM p_expected_timer_generation THEN
 v_replay_return := jsonb_build_object('request_recorded',false,'outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 v_replay_return := private.request_session_end(g.id);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_timer_generation',p_expected_timer_generation),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.session_leave(p_game_id uuid, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  g public.games%ROWTYPE; p public.players%ROWTYPE; result jsonb;
  keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write',
    'app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  prior text[]:=ARRAY[]::text[]; i integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.session_leave',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing-game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  SELECT * INTO p FROM public.players
    WHERE id=p_player_id AND game_id=p_game_id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_leave:not_authorized' USING ERRCODE='42501'; END IF;
  IF g.status IN ('session_ended','completed') THEN
    v_replay_return := jsonb_build_object('outcome','already-session-ended');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF p.participation_version IS DISTINCT FROM p_expected_version THEN
    v_replay_return := jsonb_build_object('outcome','stale-participation');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF p.status='left' THEN v_replay_return := jsonb_build_object('outcome','already-left');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  -- A mid-hand departure is not a settled hand. Never occupy its financial snapshot key.
  IF g.current_game_uuid IS NOT NULL OR coalesce(g.total_hands,0)>0 OR p.chips<>0 THEN
    INSERT INTO private.session_departures
      (game_id,player_id,participation_version,user_id,dealer_game_id,hand_number,position,chips)
    VALUES(g.id,p.id,p.participation_version,p.user_id,g.current_game_uuid,coalesce(g.total_hands,0),p.position,p.chips)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR i IN 1..cardinality(keys) LOOP
    prior:=array_append(prior,coalesce(current_setting(keys[i],true),''));
    PERFORM set_config(keys[i],'on',true);
  END LOOP;
  result:=private.stand_up_and_resolve_postgame(p_game_id);
  FOR i IN 1..cardinality(keys) LOOP PERFORM set_config(keys[i],prior[i],true); END LOOP;
  v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.session_take_seat(p_game_id uuid, p_position integer, p_player_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  g public.games%ROWTYPE; p public.players%ROWTYPE; occupant public.players%ROWTYPE;
  in_play boolean; waiting_room boolean; v_deck text; v_prior_357 text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active
  ) THEN RAISE EXCEPTION 'session_take_seat:not_authorized' USING ERRCODE='42501'; END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'session_take_seat:invalid_seat';
  END IF;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.session_take_seat',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing-game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF g.status IN ('session_ended','completed') THEN
    v_replay_return := jsonb_build_object('outcome','already-session-ended');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot FOR UPDATE;
  IF p.id IS DISTINCT FROM p_player_id OR (p.id IS NOT NULL AND p.participation_version IS DISTINCT FROM p_expected_version) THEN
    v_replay_return := jsonb_build_object('outcome','stale-participation');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  in_play:=g.status NOT IN ('waiting','waiting_for_players','dealer_selection','game_selection','configuring','ante_decision');
  waiting_room:=g.status IN ('waiting','waiting_for_players');
  IF in_play AND p.id IS NOT NULL AND p.status NOT IN ('left','observer') AND p.position IS DISTINCT FROM p_position THEN
    RAISE EXCEPTION 'session_take_seat:seat_locked_during_game';
  END IF;
  SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=p_position AND id IS DISTINCT FROM p.id FOR UPDATE;
  IF occupant.id IS NOT NULL THEN
    -- Preserve an in-flight participant's seat identity through settlement.
    IF occupant.status NOT IN ('left','observer') OR in_play THEN
      RAISE EXCEPTION 'session_take_seat:seat_occupied';
    END IF;
    UPDATE public.players SET position=NULL WHERE id=occupant.id;
  END IF;
  IF p.id IS NULL THEN
    IF NOT public.has_role(auth.uid(),'admin'::public.app_role) AND EXISTS(
      SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true'
    ) THEN RAISE EXCEPTION 'session_take_seat:maintenance' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=auth.uid()) THEN
      RAISE EXCEPTION 'session_take_seat:missing_historical_participant';
    END IF;
    SELECT deck_color_mode INTO v_deck FROM public.profiles WHERE id=auth.uid();
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting,deck_color_mode)
    VALUES(g.id,auth.uid(),p_position,0,'active',in_play,waiting_room OR in_play,v_deck)
    RETURNING * INTO p;
  ELSIF p.status IN ('left','observer') OR p.position IS NULL THEN
    UPDATE public.players SET position=p_position,status='active',sitting_out=in_play,
      waiting=waiting_room OR in_play,ante_decision=NULL,stand_up_next_hand=false,sit_out_next_hand=false
    WHERE id=p.id RETURNING * INTO p;
  ELSE
    UPDATE public.players SET position=p_position,
      sitting_out=CASE WHEN in_play THEN sitting_out ELSE false END,
      status=CASE WHEN in_play THEN status ELSE 'active' END,
      waiting=CASE WHEN in_play THEN waiting ELSE false END
    WHERE id=p.id RETURNING * INTO p;
  END IF;
  -- A newcomer at an already-settled boundary has an authoritative zero opening
  -- balance. Include it for session finalization without reserving an active hand.
  IF p.chips=0 AND g.status IN ('waiting','waiting_for_players','game_over')
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id=g.id)
     AND NOT EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=p.user_id) THEN
    v_prior_357:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
    SELECT g.id,g.current_game_uuid,coalesce(g.total_hands,0),p.id,p.user_id,coalesce(profile.username,'Player'),0,false
      FROM public.profiles profile WHERE profile.id=p.user_id;
    PERFORM set_config('app.three_five_seven_authoritative_write',v_prior_357,true);
  END IF;
  UPDATE public.games SET current_host=(
    SELECT seated.user_id FROM public.players seated WHERE seated.game_id=g.id AND NOT seated.is_bot
      AND seated.status NOT IN ('left','observer') AND seated.position IS NOT NULL
    ORDER BY seated.created_at,seated.id LIMIT 1
  ) WHERE id=g.id AND NOT EXISTS (
    SELECT 1 FROM public.players host WHERE host.game_id=g.id AND host.user_id=g.current_host
      AND NOT host.is_bot AND host.status NOT IN ('left','observer') AND host.position IS NOT NULL
  );
  v_replay_return := jsonb_build_object('outcome','seated','player_id',p.id,'participation_version',p.participation_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_position',p_position,'p_player_id',p_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
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
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
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
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
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
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION public.set_session_player_intent(p_game_id uuid, p_player_id uuid, p_expected_version bigint, p_expected_dealer_game_id uuid, p_option text, p_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE; prior357 text;
BEGIN
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
END $function$
;
CREATE OR REPLACE FUNCTION public.settle_gameplay_chip_transfers(p_game_id uuid, p_transfers jsonb, p_reason text DEFAULT 'transfer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_transfer jsonb;
  v_from_kind text;
  v_to_kind text;
  v_from_player_id uuid;
  v_to_player_id uuid;
  v_amount integer;
  v_endpoint_key text;
  v_delta integer;
  v_deltas jsonb := '{}'::jsonb;
  v_pot_delta integer := 0;
BEGIN
  IF p_game_id IS NULL OR jsonb_typeof(p_transfers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_transfers) = 0 THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_input';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.settle_gameplay_chip_transfers',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:game_not_found:%', p_game_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'settle_gameplay_chip_transfers:caller_not_in_session';
  END IF;

  PERFORM set_config(
    'ptown.chip_transfer_reason',
    CASE WHEN p_reason IN ('ante', 'bet', 'win', 'leg', 'sweep', 'transfer') THEN p_reason ELSE 'transfer' END,
    true
  );

  FOR v_transfer IN SELECT value FROM jsonb_array_elements(p_transfers)
  LOOP
    BEGIN
      v_amount := (v_transfer ->> 'amount')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_amount';
    END IF;

    v_from_kind := v_transfer #>> '{from,kind}';
    v_to_kind := v_transfer #>> '{to,kind}';
    IF v_from_kind NOT IN ('pot', 'player') OR v_to_kind NOT IN ('pot', 'player')
       OR v_from_kind = v_to_kind AND v_from_kind = 'pot' THEN
      RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_endpoint';
    END IF;

    IF v_from_kind = 'player' THEN
      BEGIN v_from_player_id := (v_transfer #>> '{from,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_from_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_from_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) - v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta - v_amount;
    END IF;

    IF v_to_kind = 'player' THEN
      BEGIN v_to_player_id := (v_transfer #>> '{to,playerId}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'settle_gameplay_chip_transfers:invalid_player';
      END;
      PERFORM 1 FROM public.players WHERE id = v_to_player_id AND game_id = p_game_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'settle_gameplay_chip_transfers:player_not_in_session'; END IF;
      v_endpoint_key := 'player:' || v_to_player_id::text;
      v_delta := COALESCE((v_deltas ->> v_endpoint_key)::integer, 0) + v_amount;
      v_deltas := jsonb_set(v_deltas, ARRAY[v_endpoint_key], to_jsonb(v_delta), true);
    ELSE
      v_pot_delta := v_pot_delta + v_amount;
    END IF;
  END LOOP;

  UPDATE public.players p
     SET chips = p.chips + (entry.value #>> '{}')::integer
    FROM jsonb_each(v_deltas) AS entry(key, value)
   WHERE p.id = substring(entry.key from 8)::uuid
     AND p.game_id = p_game_id
     AND (entry.value #>> '{}')::integer <> 0;

  IF v_pot_delta <> 0 THEN
    UPDATE public.games
       SET pot = COALESCE(pot, 0) + v_pot_delta
     WHERE id = p_game_id;
  END IF;

  v_replay_return := jsonb_build_object('status', 'settled');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_transfers',p_transfers,'p_reason',p_reason),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stand_up_and_resolve_postgame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.stand_up_and_resolve_postgame',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    v_replay_return := jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    v_replay_return := jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  v_replay_return := jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.transfer_session_host(p_game_id uuid, p_target_player_id uuid, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.transfer_session_host',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND OR auth.uid() IS NULL OR g.current_host IS DISTINCT FROM auth.uid()
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND position IS NOT NULL)
 THEN RAISE EXCEPTION 'session_host:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status='session_ended' OR g.host_version IS DISTINCT FROM p_expected_version THEN
 v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_target_player_id',p_target_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_target_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.is_bot OR p.position IS NULL OR p.status IN ('left','observer') THEN
 RAISE EXCEPTION 'session_host:invalid_target' USING ERRCODE='22023'; END IF;
 UPDATE public.games SET current_host=p.user_id WHERE id=g.id RETURNING * INTO g;
 v_replay_return := jsonb_build_object('outcome','accepted','host_version',g.host_version,'current_host',g.current_host);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_target_player_id',p_target_player_id,'p_expected_version',p_expected_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.handle_config_deadline_timeout_exact(p_game_id uuid, p_expected_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_dealer_position integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer_id uuid;
  v_next_dealer_pos integer;
  v_allow_bot boolean := false;
  v_setup_seconds integer;
  v_new_deadline timestamptz;
  v_active_total integer;
  v_active_humans integer;
  v_outcome text;
  v_forced_absence_armed_at timestamptz;
  v_ctx text;
  v_prior jsonb := '{}';
BEGIN
  FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    v_prior:=v_prior||jsonb_build_object(v_ctx,coalesce(current_setting(v_ctx,true),''));
    PERFORM set_config(v_ctx,'on',true);
  END LOOP;
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.handle_config_deadline_timeout_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object('outcome','suppressed','reason','game-not-found');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF p_expected_deadline IS NOT NULL
     AND v_game.config_deadline IS DISTINCT FROM p_expected_deadline THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object('outcome','suppressed','reason','stale-deadline');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF p_expected_dealer_position IS NOT NULL
     AND v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object('outcome','suppressed','reason','stale-dealer');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF v_game.status NOT IN ('dealer_selection','configuring','game_selection')
     OR coalesce(v_game.config_complete,false)
     OR coalesce(v_game.is_paused,false)
     OR v_game.config_deadline IS NULL
     OR v_game.config_deadline > clock_timestamp() THEN
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object(
      'outcome','suppressed','reason','game-advanced-or-not-expired',
      'status',v_game.status,'config_deadline',v_game.config_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.id INTO v_dealer_id FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position = v_game.dealer_position LIMIT 1;
  IF v_dealer_id IS NOT NULL THEN
    v_forced_absence_armed_at := clock_timestamp();
    UPDATE public.players SET sitting_out=true,waiting=false
     WHERE id=v_dealer_id;
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT player.game_id, player.id, v_forced_absence_armed_at, 'config_timeout'
      FROM public.players AS player
     WHERE player.id = v_dealer_id
       AND player.is_bot = false
       AND EXISTS (
         SELECT 1
           FROM public.game_results AS result
          WHERE result.game_id = player.game_id
       )
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm') LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);
  v_setup_seconds := greatest(1,coalesce(nullif(v_game.game_setup_timer_seconds,0),30));

  SELECT count(*),
         count(*) FILTER (WHERE NOT coalesce(player.is_bot,false))
    INTO v_active_total,v_active_humans
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left');

  IF v_active_humans = 0 THEN
    v_outcome := private.resolve_postgame_participation(p_game_id,clock_timestamp());
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object('outcome',CASE
      WHEN v_outcome='session-ended-with-results' THEN 'session_ended'
      ELSE 'waiting' END,'reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT player.position INTO v_next_dealer_pos
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false))
     AND (v_dealer_id IS NULL OR player.id<>v_dealer_id)
   ORDER BY CASE WHEN player.position>coalesce(v_game.dealer_position,0) THEN 0 ELSE 1 END,
            player.position
   LIMIT 1;

  IF v_next_dealer_pos IS NOT NULL AND v_active_total>=2 THEN
    v_new_deadline:=clock_timestamp()+make_interval(secs=>v_setup_seconds);
    UPDATE public.games
       SET dealer_position=v_next_dealer_pos,
           config_deadline=v_new_deadline,
           config_complete=false,
           current_game_uuid=NULL
     WHERE id=p_game_id;
    FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
    v_replay_return := jsonb_build_object(
      'outcome','rotated','new_dealer_position',v_next_dealer_pos,
      'new_config_deadline',v_new_deadline,'active_total',v_active_total
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.games
     SET status='waiting',config_deadline=NULL,ante_decision_deadline=NULL,
         config_complete=false,awaiting_next_round=false,
         last_round_result=NULL,current_game_uuid=NULL
   WHERE id=p_game_id;
  FOREACH v_ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
    PERFORM set_config(v_ctx,v_prior->>v_ctx,true);
  END LOOP;
  v_replay_return := jsonb_build_object('outcome','waiting','active_humans',v_active_humans);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_deadline',p_expected_deadline,'p_expected_dealer_position',p_expected_dealer_position),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION private.resolve_postgame_participation(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return text;
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_results boolean := false;
  v_has_unsettled_financial_evidence boolean := false;
  v_outcome text;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.resolve_postgame_participation',false,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;

  IF NOT FOUND THEN
    v_replay_return := 'missing-game';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    v_replay_return := 'ineligible-state';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_results;

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_results THEN
      v_replay_return := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        p_now
      );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
    END IF;

    IF COALESCE(v_game.real_money, false) AND NOT v_has_results THEN
      SELECT
        EXISTS (
          SELECT 1 FROM public.session_player_snapshots
           WHERE game_id = p_game_id
        )
        OR EXISTS (
          SELECT 1 FROM public.player_transactions
           WHERE source_game_id = p_game_id
        )
        OR COALESCE(v_game.pot, 0) <> 0
        OR EXISTS (
          SELECT 1 FROM public.players
           WHERE game_id = p_game_id AND chips <> 0
        )
        INTO v_has_unsettled_financial_evidence;

      IF v_has_unsettled_financial_evidence THEN
        UPDATE public.games
           SET status = 'waiting',
               current_game_uuid = NULL,
               config_complete = false,
               config_deadline = NULL,
               ante_decision_deadline = NULL,
               awaiting_next_round = false,
               last_round_result = NULL
         WHERE id = p_game_id;
        v_replay_return := 'blocked-unsettled-financial-evidence';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
      END IF;
    END IF;

    UPDATE public.games
       SET status = 'session_ended',
           pending_session_end = false,
           session_ended_at = p_now,
           game_over_at = COALESCE(game_over_at, p_now),
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL,
           is_paused = false
     WHERE id = p_game_id
       AND status <> 'session_ended';

    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    DELETE FROM private.postgame_forced_absence_watches
     WHERE game_id = p_game_id;

    v_replay_return := 'session-ended-without-financial-settlement';
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.games
     SET status = 'waiting',
         current_game_uuid = NULL,
         config_complete = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL,
         awaiting_next_round = false,
         last_round_result = NULL
   WHERE id = p_game_id;

  v_replay_return := 'waiting-seated-humans:' || v_seated_humans::text ||
    ';active-humans:' || v_active_humans::text ||
    ';active-players:' || v_active_players::text;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
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
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee'
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
 RETURN v_replay_return;
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
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

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
         pot=CASE WHEN p_game_type='cribbage' THEN 0 ELSE game.pot END,
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
 RETURN v_replay_return;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.decline_session_setup(p_game_id uuid, p_expected_dealer_position integer, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; p public.players%ROWTYPE; claim private.session_setup_declines%ROWTYPE;
 host public.players%ROWTYPE; other public.players%ROWTYPE; occupant public.players%ROWTYPE;
 active_count integer; human_count integer; allow_bots boolean; target text; deadline timestamptz;
 next_pos integer; old_pos integer; target_pos integer; result jsonb; ctx text; prior jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL OR p_game_id IS NULL OR p_expected_dealer_position IS NULL OR p_expected_config_deadline IS NULL THEN
 RAISE EXCEPTION 'setup_decline:missing_identity'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.decline_session_setup',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_position',p_expected_dealer_position,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'setup_decline:missing_session'; END IF;
 SELECT * INTO claim FROM private.session_setup_declines WHERE game_id=g.id
 AND expected_deadline=p_expected_config_deadline AND expected_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.actor_id<>auth.uid() THEN RAISE EXCEPTION 'setup_decline:not_authorized' USING ERRCODE='42501'; END IF;
  v_replay_return := claim.result||jsonb_build_object('outcome','already_declined','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_position',p_expected_dealer_position,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer')) THEN
 RAISE EXCEPTION 'setup_decline:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.status NOT IN ('game_selection','configuring') OR coalesce(g.config_complete,false)
 OR g.current_game_uuid IS NOT NULL OR coalesce(g.pot,0)<>0 OR g.is_paused
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_position',p_expected_dealer_position,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE game_id=g.id AND position=p_expected_dealer_position
 AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') AND NOT sitting_out;
 IF NOT FOUND THEN RAISE EXCEPTION 'setup_decline:not_setup_owner' USING ERRCODE='42501'; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
 prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
 PERFORM set_config(ctx,'on',true); END LOOP;
 -- Apply already queued participation before evaluating the next dealer.
 UPDATE public.players SET
 position=CASE WHEN stand_up_next_hand THEN NULL ELSE position END,
 status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
 sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand OR id=p.id THEN true WHEN waiting THEN false ELSE sitting_out END,
 waiting=false, sit_out_next_hand=false,stand_up_next_hand=false,
 auto_ante=CASE WHEN stand_up_next_hand THEN false ELSE auto_ante END,
 auto_ante_runback=CASE WHEN stand_up_next_hand THEN false ELSE auto_ante_runback END,
 auto_fold=false,current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL
 WHERE game_id=g.id AND status NOT IN ('left','observer');
 SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count
 FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
 IF coalesce(g.pending_session_end,false) OR human_count=0 THEN target:='session_ended';
 ELSIF active_count<2 THEN target:='waiting';
 ELSE
  -- Preserve the established two-player projection, moving occupied seats atomically.
  IF active_count=2 THEN
   SELECT * INTO host FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL
   ORDER BY is_bot,CASE WHEN user_id=g.current_host THEN 0 ELSE 1 END,created_at NULLS LAST,id LIMIT 1;
   SELECT * INTO other FROM public.players WHERE game_id=g.id AND id<>host.id AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
   IF least(abs(host.position-other.position),7-abs(host.position-other.position))<>3 THEN
    target_pos:=((host.position-1+3)%7)+1; old_pos:=other.position;
    SELECT * INTO occupant FROM public.players WHERE game_id=g.id AND position=target_pos AND id<>other.id;
    IF FOUND THEN UPDATE public.players SET position=NULL WHERE id=occupant.id; END IF;
    UPDATE public.players SET position=target_pos WHERE id=other.id;
    IF occupant.id IS NOT NULL THEN UPDATE public.players SET position=old_pos WHERE id=occupant.id; END IF;
   END IF;
  END IF;
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm' LIMIT 1;
  -- Existing setup rotation chooses the first eligible position after the dealer sits out.
  SELECT position INTO next_pos FROM public.players WHERE game_id=g.id AND NOT sitting_out AND status NOT IN ('left','observer')
  AND position IS NOT NULL AND (coalesce(allow_bots,false) OR NOT is_bot) ORDER BY position LIMIT 1;
  IF next_pos IS NULL THEN target:='waiting';
  ELSE target:='game_selection'; deadline:=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.game_setup_timer_seconds,30))); END IF;
 END IF;
 UPDATE public.games SET status=target,game_type=NULL,config_complete=false,config_deadline=deadline,
 ante_decision_deadline=NULL,last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,
 all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,is_first_hand=false,
 current_game_uuid=NULL,dealer_selection_state=NULL,dealer_position=coalesce(next_pos,dealer_position),
 pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
 session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=g.id;
 result:=jsonb_build_object('outcome','declined','deduped',false,'status',target,'declining_player_id',p.id,'dealer_position',next_pos,'config_deadline',deadline);
 INSERT INTO private.session_setup_declines VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,auth.uid(),p.id,result);
 FOREACH ctx IN ARRAY ARRAY['app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
 PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_position',p_expected_dealer_position,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
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
$function$
;
