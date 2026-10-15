-- Run21 production authority. Existing matches retain financial_version=1.
-- Apply with the bundled worker deployed; admission stays closed until activation.
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='1s';
DO $preflight$
DECLARE expected record; actual text;
BEGIN
 FOR expected IN SELECT * FROM jsonb_to_recordset($baseline$[{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","md5":"5d1c8703caee40ce7392d4eb6de1aaf9","name":"public.finalize_gameplay_transfer_batch","identity":""},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","md5":"101f170b8e61d2528cee3b0a93abad1a","name":"public.set_game_paused","identity":"p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"b86f571f88d909be542dc412e3e6b05b","name":"public.set_game_paused","identity":"p_game_id uuid, p_paused boolean"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"b332b750f1ae7b9cd65c31403f334277","name":"private.evaluate_real_money_liveness","identity":"p_game_id uuid"},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","md5":"96d62d83ae5212e97ef12b5d6bb09290","name":"public.set_session_player_intent","identity":"p_game_id uuid, p_player_id uuid, p_expected_version bigint, p_expected_dealer_game_id uuid, p_option text, p_value boolean"},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","md5":"4dae3e8b8e6256996625f88904eb6da1","name":"public.run21_configure_local","identity":"p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"81430ad90b50f8c70040eb5422b6ed26","name":"public.run21_server_load","identity":"p_game_id uuid"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"d9c39af6cb08cb52a62270815aea5a5c","name":"public.run21_server_commit","identity":"p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"f95a2f0b7367e9957896dbd4c206c4e3","name":"public.run21_server_close","identity":"p_dealer_game_id uuid, p_user_id uuid"},{"acl":"{postgres=X/postgres}","md5":"5753b8b82c1b1bd69ee887ed6333c704","name":"private.run21_guard_browser","identity":""},{"acl":"{postgres=X/postgres}","md5":"9004760bda7767abd4078f962ac200bd","name":"private.run21_actor_allowed","identity":"p_user_id uuid"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"47398a477f1df78a76b9683975f20054","name":"public.run21_server_authorize","identity":"p_user_id uuid"},{"acl":"{postgres=X/postgres}","md5":"3cb779fbf3e858471c2aa364b944a89c","name":"private.run21_require_local","identity":""},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","md5":"81e54a4e6b6133856215e61216bdecac","name":"public.run21_app_test_capabilities","identity":"p_session_id uuid"},{"acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}","md5":"0b35bd17231f4f23752cb12951635113","name":"public.run21_session_visible","identity":"p_game_id uuid"},{"acl":"{postgres=X/postgres}","md5":"63370d03e555cf49c1c804b0108fc8f9","name":"private.run21_release_write_guard","identity":""},{"acl":"{postgres=X/postgres}","md5":"4409820d709e6841861b951f7baa9445","name":"private.run21_publish_revision","identity":""},{"acl":"{postgres=X/postgres}","md5":"e1bd92b18a64b84dcbbcd0634ea40a83","name":"private.run21_append_events","identity":""},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"f7bcd4b2166d55938ba4b8b68dd6c5a5","name":"public.run21_server_load_current","identity":"p_game_id uuid, p_after_sequence bigint"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"9b7d7578c800aa2a19874fa943317307","name":"public.run21_server_admit","identity":"p_user_id uuid, p_game_id uuid"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"70c9be34c4d56724024cedc77ff1fce5","name":"public.run21_server_commit_admitted","identity":"p_verified_user_id uuid, p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","md5":"de14ab5df0a703cfd8c1ed43aa5a819c","name":"public.settle_gameplay_chip_transfers","identity":"p_game_id uuid, p_transfers jsonb, p_reason text"},{"acl":"{postgres=X/postgres,authenticated=X/postgres}","md5":"9e6d59a69f0c828a4ed84481258662e3","name":"public.set_automatic_play","identity":"p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean"},{"acl":"{postgres=X/postgres}","md5":"f532ce87a9ceac07b68064f699e11d9f","name":"private.run21_capture_harness","identity":""}]$baseline$::jsonb) AS x(name text,identity text,md5 text,acl text) LOOP
  SELECT md5(pg_get_functiondef(p.oid)) INTO actual FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname||'.'||p.proname=expected.name AND pg_get_function_identity_arguments(p.oid)=expected.identity;
  IF actual IS DISTINCT FROM expected.md5 THEN RAISE EXCEPTION 'run21:deployment_definition_changed:%',expected.name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='run21_matches' AND column_name='financial_version') THEN
  RAISE EXCEPTION 'run21:financial_version_already_installed'; END IF;
END $preflight$;
-- Fail immediately under concurrent gameplay instead of queuing broad DDL locks.
LOCK TABLE public.games,public.players,private.run21_matches IN ACCESS EXCLUSIVE MODE NOWAIT;
-- Explicit opt-in only: existing matches remain financial_version=1. New
-- configurations opt into version two through the qualified admission owner.
ALTER TABLE private.run21_matches ADD COLUMN financial_version smallint NOT NULL DEFAULT 1 CHECK(financial_version IN(1,2));
ALTER TABLE private.run21_matches ADD COLUMN real_money boolean NOT NULL DEFAULT false,
  ADD COLUMN first_placement_seconds integer NOT NULL DEFAULT 30 CHECK(first_placement_seconds BETWEEN 5 AND 60),
  ADD COLUMN paused_at bigint;
CREATE OR REPLACE FUNCTION public.run21_server_commit(p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE m private.run21_matches; g public.games; last_round jsonb; receipt jsonb; winner uuid; loser uuid; batch uuid; changes jsonb;
 timeout_event jsonb; timed_out uuid;
BEGIN
  PERFORM private.run21_require_local();
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
  IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.status NOT IN ('in_progress','game_over') OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
    RAISE EXCEPTION 'run21:inactive_identity'; END IF;
  IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
  IF p_state#>>'{identity,sessionId}' IS DISTINCT FROM m.game_id::text OR p_state#>>'{identity,dealerGameId}' IS DISTINCT FROM m.dealer_game_id::text
    OR p_state#>>'{identity,handNumber}' IS DISTINCT FROM '1' OR p_state->>'stake' IS DISTINCT FROM m.stake::text
    OR jsonb_array_length(p_state->'players')<>2 OR jsonb_array_length(p_state->'rounds')<1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'players') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p->>'id'))
    OR (m.state IS NOT NULL AND (p_state->'config' IS DISTINCT FROM m.state->'config' OR (p_state->>'updatedAt')::bigint<(m.state->>'updatedAt')::bigint)) THEN
    RAISE EXCEPTION 'run21:commit_identity'; END IF;
  last_round:=p_state->'rounds'->-1;
  SELECT e INTO timeout_event FROM jsonb_array_elements(p_state->'events') e
    WHERE e->>'type'='first_placement_timeout' AND (e->>'sequence')::bigint>m.event_sequence LIMIT 1;
  IF timeout_event IS NOT NULL THEN
    timed_out:=(timeout_event->>'actorId')::uuid;
    IF m.financial_version<>2 OR m.state#>>'{rounds,-1,active_player_id}' IS DISTINCT FROM timed_out::text
      OR m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'startedAt'] IS NOT NULL
      OR (m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'firstPlacementDeadline'])::bigint IS NULL
      OR (m.state#>>ARRAY['rounds','-1','boards',timed_out::text,'firstPlacementDeadline'])::bigint>floor(extract(epoch FROM clock_timestamp())*1000)
      OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=timed_out AND game_id=m.game_id AND NOT is_bot) THEN
      RAISE EXCEPTION 'run21:timeout_identity';
    END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.rounds WHERE id=(last_round->>'id')::uuid) THEN
    INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
      VALUES((last_round->>'id')::uuid,g.id,m.dealer_game_id,1,(last_round->>'number')::integer,0,'betting',0);
  END IF;
  UPDATE public.rounds SET status='completed' WHERE dealer_game_id=m.dealer_game_id
    AND id IN(SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_state->'rounds') r WHERE (r->>'revealed')::boolean) AND status<>'completed';
  UPDATE public.games SET current_round=(last_round->>'number')::integer WHERE id=g.id AND current_round IS DISTINCT FROM (last_round->>'number')::integer;
  receipt:=nullif(p_state->'settlement','null'::jsonb);
  IF receipt IS NOT NULL THEN
    winner:=(receipt->>'winnerId')::uuid;loser:=(receipt->>'loserId')::uuid;
    IF receipt->>'key' IS DISTINCT FROM 'run21:'||m.dealer_game_id||':1' OR receipt->>'winnerId' IS DISTINCT FROM p_state->>'winnerId'
      OR receipt->>'amount' IS DISTINCT FROM m.stake::text OR winner=loser OR m.initial_balances->>winner::text IS NULL OR m.initial_balances->>loser::text IS NULL
      OR (last_round->>'number')::integer<3 OR NOT(last_round->>'revealed')::boolean
      OR (p_state#>>ARRAY['cumulative',winner::text])::bigint<=(p_state#>>ARRAY['cumulative',loser::text])::bigint THEN
      RAISE EXCEPTION 'run21:settlement_identity'; END IF;
    IF m.financial_version=2 AND NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
      PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
      IF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND id IN (winner,loser))<>2
        OR (g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id AND id IN(winner,loser) AND is_bot)) THEN
        RAISE EXCEPTION 'run21:financial_participants';
      END IF;
      -- The trusted reducer supplies scores; independently require complete totals for every round.
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE
        (SELECT sum((r#>>ARRAY['boards',p->>'id','result','score'])::bigint) FROM jsonb_array_elements(p_state->'rounds') r)
          IS DISTINCT FROM (p_state#>>ARRAY['cumulative',p->>'id'])::bigint)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'rounds') r, jsonb_array_elements(m.participants) p
          WHERE r#>ARRAY['boards',p->>'id','result'] IS NULL OR r#>ARRAY['boards',p->>'id','result']='null'::jsonb OR r->>'revealed' IS DISTINCT FROM 'true') THEN
        RAISE EXCEPTION 'run21:incomplete_scores';
      END IF;
      changes:=jsonb_build_object(winner::text,m.stake,loser::text,-m.stake);
      INSERT INTO public.game_results(id,game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
      VALUES((receipt->>'resultId')::uuid,m.game_id,m.dealer_game_id,1,'run21_terminal','run21',winner,
        (SELECT p->>'name' FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=winner::text),
        'Run21: '||(p_state->'cumulative')::text,m.stake,changes,false);
      PERFORM public.settle_gameplay_chip_transfers(m.game_id,jsonb_build_array(jsonb_build_object(
        'from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',m.stake)),'win');
      -- Materialize the existing deferred journal, retaining its generated immutable identity.
      SET CONSTRAINTS public.gameplay_transfer_pending_finalize IMMEDIATE;
      SELECT id INTO STRICT batch FROM public.gameplay_transfer_batches
        WHERE game_id=m.game_id AND dealer_game_id=m.dealer_game_id AND cursor=(SELECT chip_transfer_cursor FROM public.games WHERE id=m.game_id);
      SET CONSTRAINTS public.gameplay_transfer_pending_finalize DEFERRED;
      receipt:=jsonb_set(receipt,'{transferBatchId}',to_jsonb(batch::text));
      p_state:=jsonb_set(p_state,'{settlement}',receipt);
      p_state:=jsonb_set(p_state,'{events}',(SELECT jsonb_agg(CASE WHEN e->>'type'='settlement_recorded'
        THEN jsonb_set(jsonb_set(e,'{operands,receipt}',receipt),'{frame,settlement}',receipt) ELSE e END ORDER BY n)
        FROM jsonb_array_elements(p_state->'events') WITH ORDINALITY AS x(e,n)));
      INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
      SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1
        FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
      ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
    END IF;
    INSERT INTO private.run21_settlements(id,transfer_batch_id,dealer_game_id,settlement_key,winner_id,loser_id,amount)
      VALUES((receipt->>'resultId')::uuid,(receipt->>'transferBatchId')::uuid,m.dealer_game_id,receipt->>'key',winner,loser,m.stake)
      ON CONFLICT(dealer_game_id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id AND id=(receipt->>'resultId')::uuid AND transfer_batch_id=(receipt->>'transferBatchId')::uuid AND winner_id=winner AND loser_id=loser AND amount=m.stake) THEN
      RAISE EXCEPTION 'run21:settlement_conflict'; END IF;
    m.balances:=jsonb_set(jsonb_set(m.initial_balances,ARRAY[winner::text],to_jsonb((m.initial_balances->>winner::text)::numeric+m.stake)),ARRAY[loser::text],to_jsonb((m.initial_balances->>loser::text)::numeric-m.stake));
    IF m.financial_version=2 THEN
      SELECT jsonb_object_agg(p.id,p.chips) INTO m.balances FROM public.players p WHERE p.game_id=m.game_id
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text);
      UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
        session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,
        pending_session_end=false,game_over_at=clock_timestamp(),last_round_result='Run21 complete',awaiting_next_round=false WHERE id=m.game_id;
    END IF;
  ELSIF m.state->'settlement' IS NOT NULL AND m.state->'settlement'<>'null'::jsonb THEN
    RAISE EXCEPTION 'run21:settlement_cannot_regress';
  END IF;
  UPDATE private.run21_matches SET state=p_state,revision=revision+1,bot_due_at=p_bot_due_at,balances=m.balances
    WHERE dealer_game_id=m.dealer_game_id RETURNING * INTO m;
  IF timeout_event IS NOT NULL THEN
    UPDATE public.players SET auto_fold=NOT g.real_money,sit_out_next_hand=true,
      sitting_out=CASE WHEN g.real_money THEN true ELSE sitting_out END WHERE id=timed_out AND game_id=m.game_id;
    IF g.real_money AND NOT EXISTS(SELECT 1 FROM public.games WHERE id=g.id AND is_paused) THEN
      RAISE EXCEPTION 'run21:timeout_pause_failed';
    END IF;
    SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  END IF;
  RETURN jsonb_build_object('outcome','committed','record',CASE WHEN p_state ? 'eventSequence' THEN
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') ELSE
    jsonb_set(to_jsonb(m),'{state,events}',p_state->'events') #- '{state,eventSequence}' END);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_commit_admitted(p_verified_user_id uuid, p_dealer_game_id uuid, p_expected_revision bigint, p_state jsonb, p_bot_due_at bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE m private.run21_matches; g public.games;
BEGIN
 IF NOT private.run21_actor_allowed(p_verified_user_id) THEN
  RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p
   JOIN public.players seat ON seat.id=(p->>'id')::uuid AND seat.game_id=m.game_id
   WHERE p->>'userId'=p_verified_user_id::text AND p->>'kind'='human'
     AND seat.user_id=p_verified_user_id AND NOT seat.is_bot AND seat.status<>'left') THEN
  RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
 END IF;
 IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.game_type IS DISTINCT FROM 'run21'
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
  RAISE EXCEPTION 'run21:inactive_identity';
 END IF;
 IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
 -- A duplicate/rejected action still checks fresh admission and CAS but writes nothing.
 IF p_state IS NULL THEN RETURN jsonb_build_object('outcome','committed','record',to_jsonb(m)); END IF;
 RETURN public.run21_server_commit(p_dealer_game_id,p_expected_revision,p_state,p_bot_due_at);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_close(p_dealer_game_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 m private.run21_matches; g public.games; winner uuid;
 active_count integer; human_count integer; eligible_count integer;
 allow_bots boolean:=false; make_take boolean:=false; positions integer[];
 next_position integer; target text; deadline timestamptz;
BEGIN
 PERFORM private.run21_require_local();
 IF NOT public.run21_server_authorize(p_user_id) THEN
  RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id;
  PERFORM 1 FROM public.rounds WHERE id=m.first_round_id FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
 OR NOT EXISTS(SELECT 1 FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id) THEN
  RAISE EXCEPTION 'run21:close_denied' USING ERRCODE='42501'; END IF;
 IF m.finished THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF (g.real_money AND m.financial_version<>2) OR g.is_paused OR g.game_type IS DISTINCT FROM 'run21' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id THEN
  RAISE EXCEPTION 'run21:inactive_identity'; END IF;
 SELECT winner_id INTO STRICT winner FROM private.run21_settlements WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->'settlement' IS NULL OR m.state->'settlement'='null'::jsonb OR m.state->>'winnerId' IS DISTINCT FROM winner::text THEN
  RAISE EXCEPTION 'run21:not_settled'; END IF;
 IF g.status='session_ended' THEN
  target:='session_ended';
 ELSE
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET
   status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false
  WHERE game_id=m.game_id;
  SELECT count(*),count(*) FILTER(WHERE NOT is_bot) INTO active_count,human_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL;
  -- Same session-level dealer policy source as Yahtzee; no game scoring defaults.
  SELECT coalesce(allow_bot_dealers,false) INTO allow_bots FROM public.game_defaults WHERE game_type='holm';
  allow_bots:=coalesce(allow_bots,false);
  SELECT array_agg(position ORDER BY position DESC),count(*) INTO positions,eligible_count FROM public.players
   WHERE game_id=m.game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND position IS NOT NULL
    AND (allow_bots OR NOT is_bot);
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF human_count=0 OR active_count<2 OR eligible_count=0 THEN
   -- Canonical participant admission distinguishes seated/sitting-out humans
   -- from a truly ended session and preserves its financial finalization rules.
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());
   SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT position INTO next_position FROM public.players WHERE id=winner AND game_id=m.game_id
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
  -- live family discriminator; immutable dealer-game/round/history keep Run21.
  -- A later setup timer has its own transaction and must use canonical authority,
  -- never a prior game claim from this continuation. Ended frames retain it.
  UPDATE public.games SET status=target,
   game_type=CASE WHEN target IN ('game_selection','dealer_selection','waiting') THEN NULL ELSE game_type END,
   config_complete=false,config_deadline=deadline,ante_decision_deadline=NULL,
   last_round_result=NULL,current_round=NULL,awaiting_next_round=false,next_round_number=NULL,pot=0,
   all_decisions_in=false,all_decisions_in_round_id=NULL,game_over_at=NULL,buck_position=NULL,total_hands=0,
   is_first_hand=false,current_game_uuid=NULL,dealer_selection_state=NULL,
   dealer_position=CASE WHEN target='game_selection' THEN next_position ELSE dealer_position END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END
  WHERE id=m.game_id;
 END IF;
 UPDATE private.run21_matches SET finished=true WHERE dealer_game_id=m.dealer_game_id;
END $function$
;

-- Existing games are deliberately excluded: no historical recovery/backfill.
CREATE TABLE private.run21_recovery_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  token uuid, expires_at timestamptz, claimed boolean NOT NULL DEFAULT false,
  last_completed_at timestamptz, failure text, games uuid[] NOT NULL DEFAULT '{}'
);
INSERT INTO private.run21_recovery_state(singleton) VALUES(true);
ALTER TABLE private.run21_recovery_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_recovery_state FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.run21_dispatch_recovery() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.run21_recovery_state; token_i uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO STRICT s FROM private.run21_recovery_state WHERE singleton FOR UPDATE;
  IF s.token IS NOT NULL AND s.expires_at>clock_timestamp() THEN RETURN; END IF;
  UPDATE private.run21_recovery_state SET token=token_i,expires_at=clock_timestamp()+interval '25 seconds',claimed=false,
    failure=CASE WHEN s.token IS NOT NULL THEN 'run21:recovery_lease_expired' ELSE failure END WHERE singleton;
  PERFORM net.http_post(url:='https://xvhmbuppghwmwpwrkzao.supabase.co/functions/v1/run21-recovery',
    headers:=jsonb_build_object('Content-Type','application/json','x-run21-dispatch',token_i::text),
    body:='{}'::jsonb,timeout_milliseconds:=20000);
END $$;
REVOKE ALL ON FUNCTION private.run21_dispatch_recovery() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.run21_recovery_claim(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected_games uuid[];
BEGIN
  PERFORM 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token
    AND expires_at>clock_timestamp() AND NOT claimed FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false); END IF;
  SELECT coalesce(array_agg(game_id),'{}'::uuid[]) INTO selected_games FROM (
    SELECT m.game_id FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
    WHERE m.financial_version=2 AND NOT m.finished AND nullif(m.state->'settlement','null'::jsonb) IS NULL
      AND g.status='in_progress' AND g.current_game_uuid=m.dealer_game_id AND g.game_type='run21' AND NOT g.is_paused
      AND (m.state IS NULL OR nullif(m.state->>'winnerId','') IS NOT NULL
        OR m.state#>>'{rounds,-1,revealed}'='true'
        OR (m.state#>>'{rounds,-1,scorePresentation,endsAt}')::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','deadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR (m.state#>>ARRAY['rounds','-1','boards',m.state#>>'{rounds,-1,active_player_id}','firstPlacementDeadline'])::bigint<=extract(epoch FROM clock_timestamp())*1000
        OR m.bot_due_at<=extract(epoch FROM clock_timestamp())*1000)
    ORDER BY m.created_at LIMIT 20
  ) candidates;
  UPDATE private.run21_recovery_state SET claimed=true,games=selected_games WHERE singleton;
  RETURN jsonb_build_object('accepted',true,'games',selected_games);
END $$;

CREATE FUNCTION public.run21_recovery_load(p_token uuid,p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND token=p_token AND claimed
    AND expires_at>clock_timestamp() AND p_game_id=ANY(games)) THEN
    RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id))
    FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id JOIN public.dealer_games d ON d.id=m.dealer_game_id
    WHERE m.game_id=p_game_id AND m.financial_version=2 AND NOT m.finished
      AND g.current_game_uuid=m.dealer_game_id AND g.status='in_progress' AND NOT g.is_paused),'[]'::jsonb);
END $$;

CREATE FUNCTION public.run21_recovery_complete(p_token uuid,p_failure text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE private.run21_recovery_state SET token=NULL,claimed=false,games='{}',
    last_completed_at=CASE WHEN p_failure IS NULL THEN clock_timestamp() ELSE last_completed_at END,
    failure=left(p_failure,160)
  WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'run21:recovery_token_denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.run21_recovery_claim(uuid),public.run21_recovery_load(uuid,uuid),public.run21_recovery_complete(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_recovery_claim(uuid),public.run21_recovery_load(uuid,uuid),public.run21_recovery_complete(uuid,text) TO service_role;

CREATE FUNCTION private.run21_assert_recovery_health(p_game_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE health jsonb;
BEGIN
  health:=private.evaluate_real_money_liveness(p_game_id);
  IF NOT coalesce((health->>'admission_allowed')::boolean,false) THEN
    RAISE EXCEPTION 'real_money_liveness_unavailable:%',health->>'reason' USING ERRCODE='55000',DETAIL=health::text;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='run21-recovery' AND active AND schedule='5 seconds')
    OR NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND failure IS NULL
      AND last_completed_at>clock_timestamp()-interval '20 seconds') THEN
    RAISE EXCEPTION 'real_money_liveness_unavailable:run21_recovery_unhealthy' USING ERRCODE='55000';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.run21_assert_recovery_health(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No cron.schedule here: installation is a separate, qualification-gated step.

-- Attach to the existing canonical pause owner; never create an independent pause API.
CREATE OR REPLACE FUNCTION private.run21_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.run21_matches; shifted jsonb; board jsonb; key text; id text; delta bigint;
 at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'run21' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW; END IF;
 SELECT * INTO m FROM private.run21_matches WHERE dealer_game_id=NEW.current_game_uuid AND financial_version=2 FOR UPDATE;
 IF NOT FOUND OR m.finished OR nullif(m.state->'settlement','null'::jsonb) IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.is_paused THEN
  UPDATE private.run21_matches SET paused_at=at_ms,
    state=CASE WHEN state IS NOT NULL THEN jsonb_set(state,'{pausedAt}',to_jsonb(at_ms)) ELSE state END,
    revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSE
  IF NEW.real_money AND EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=NEW.id AND p.sitting_out
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text)) THEN
    RAISE EXCEPTION 'run21:return_players_before_resume';
  END IF;
  IF m.paused_at IS NULL THEN RAISE EXCEPTION 'run21:missing_pause_identity'; END IF;
  delta:=greatest(0,at_ms-m.paused_at);shifted:=m.state;
  IF shifted IS NOT NULL THEN
   id:=shifted#>>'{rounds,-1,active_player_id}';
   IF id IS NOT NULL THEN
    board:=shifted#>ARRAY['rounds','-1','boards',id];
    FOREACH key IN ARRAY ARRAY['startedAt','deadline','firstPlacementDeadline'] LOOP
     IF board->>key IS NOT NULL THEN board:=jsonb_set(board,ARRAY[key],to_jsonb((board->>key)::bigint+delta)); END IF;
    END LOOP;
    shifted:=jsonb_set(shifted,ARRAY['rounds','-1','boards',id],board);
   END IF;
   FOREACH key IN ARRAY ARRAY['startedAt','endsAt'] LOOP
    IF shifted#>>ARRAY['rounds','-1','scorePresentation',key] IS NOT NULL THEN
     shifted:=jsonb_set(shifted,ARRAY['rounds','-1','scorePresentation',key],to_jsonb((shifted#>>ARRAY['rounds','-1','scorePresentation',key])::bigint+delta));
    END IF;
   END LOOP;
   shifted:=jsonb_set(jsonb_set(shifted,'{pausedAt}','null'),'{updatedAt}',to_jsonb(at_ms));
  END IF;
  UPDATE private.run21_matches SET state=shifted,paused_at=NULL,bot_due_at=bot_due_at+delta,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_pause() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW EXECUTE FUNCTION private.run21_pause();

-- Any admitted real-money competitor sitting out pauses through the shared owner.
CREATE FUNCTION private.run21_sitting_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; saved jsonb; result jsonb;
BEGIN
 IF NOT NEW.sitting_out OR OLD.sitting_out OR NEW.is_bot THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR NOT g.real_money OR g.is_paused OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.run21_matches m WHERE m.dealer_game_id=g.current_game_uuid AND m.financial_version=2
   AND NOT m.finished AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=NEW.id::text)) THEN RETURN NEW; END IF;
 saved:=private.capture_recovery_context();
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
 PERFORM private.restore_recovery_context(saved);
 IF result->>'outcome' NOT IN ('paused','already_set') THEN RAISE EXCEPTION 'run21:sit_out_pause_failed'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_sitting_out() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_sitting_out AFTER UPDATE OF sitting_out ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_sitting_out();

-- The shared rejoin action normally queues the next hand. A paused, admitted
-- real-money competitor instead returns to their existing unfinished match.
CREATE FUNCTION private.run21_return_player() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games;
BEGIN
 IF NOT NEW.waiting OR OLD.waiting OR NOT OLD.sitting_out THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR NOT g.real_money OR NOT g.is_paused OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE NOWAIT;
 IF g.game_type='run21' AND g.real_money AND g.is_paused AND g.status='in_progress'
   AND EXISTS(SELECT 1 FROM private.run21_matches m WHERE m.dealer_game_id=g.current_game_uuid
     AND m.financial_version=2 AND NOT m.finished AND nullif(m.state->'settlement','null'::jsonb) IS NULL
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'id'=NEW.id::text)) THEN
   NEW.sitting_out:=false; NEW.waiting:=false;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_return_player() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_return_player BEFORE UPDATE OF waiting ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_return_player();

-- Canonical player intent owns automatic play; keep the private projection in
-- sync when the existing control lets a human resume their own board.
CREATE FUNCTION private.run21_automatic_play() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; m private.run21_matches; s jsonb; ids jsonb; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.auto_fold IS NOT DISTINCT FROM OLD.auto_fold OR NEW.is_bot THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id;
 IF g.game_type IS DISTINCT FROM 'run21' OR g.real_money OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE NOWAIT;
 IF g.game_type IS DISTINCT FROM 'run21' OR g.real_money OR g.status<>'in_progress' THEN RETURN NEW; END IF;
 SELECT * INTO m FROM private.run21_matches WHERE dealer_game_id=g.current_game_uuid AND financial_version=2 AND NOT finished FOR UPDATE NOWAIT;
 IF NOT FOUND OR m.state IS NULL OR nullif(m.state->'settlement','null'::jsonb) IS NOT NULL THEN RETURN NEW; END IF;
 SELECT coalesce(jsonb_agg(p.id ORDER BY p.id),'[]'::jsonb) INTO ids FROM public.players p
  WHERE p.game_id=g.id AND p.auto_fold AND NOT p.is_bot AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) q WHERE q->>'id'=p.id::text);
 s:=jsonb_set(m.state,'{automaticPlayers}',ids);
 at_ms:=greatest(at_ms,(s->>'updatedAt')::bigint);
 IF s#>>'{rounds,-1,active_player_id}'=NEW.id::text AND s#>>ARRAY['rounds','-1','boards',NEW.id::text,'startedAt'] IS NULL THEN
  s:=jsonb_set(s,ARRAY['rounds','-1','boards',NEW.id::text,'firstPlacementDeadline'],
    CASE WHEN NEW.auto_fold THEN 'null'::jsonb ELSE to_jsonb(coalesce(m.paused_at,at_ms)+m.first_placement_seconds*1000) END);
 END IF;
 UPDATE private.run21_matches SET state=jsonb_set(s,'{updatedAt}',to_jsonb(at_ms)),revision=revision+1,
   bot_due_at=CASE WHEN s#>>'{rounds,-1,active_player_id}' IS DISTINCT FROM NEW.id::text THEN m.bot_due_at
     WHEN NEW.auto_fold THEN at_ms ELSE NULL END WHERE dealer_game_id=m.dealer_game_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.run21_automatic_play() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER run21_automatic_play AFTER UPDATE OF auto_fold ON public.players FOR EACH ROW EXECUTE FUNCTION private.run21_automatic_play();

CREATE TABLE private.run21_production_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),qualified boolean NOT NULL DEFAULT false);
INSERT INTO private.run21_production_release(singleton) VALUES(true);
ALTER TABLE private.run21_production_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.run21_production_release FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.run21_actor_allowed(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active)
$$;
CREATE FUNCTION private.run21_require_production() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.run21_production_release WHERE singleton AND qualified) THEN RAISE EXCEPTION 'run21:release_unqualified' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.run21_require_production() FROM PUBLIC,anon,authenticated,service_role;
-- Compatibility name used inside service-only RPCs. Their EXECUTE privileges,
-- fresh actor checks and per-match admission remain the security boundary.
-- Qualification gates new setup, never recovery/readability of existing matches.
CREATE OR REPLACE FUNCTION private.run21_require_local() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN; END $$;
CREATE OR REPLACE FUNCTION public.run21_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  g public.games;
  d public.players;
  dg public.dealer_games;
  r uuid:=gen_random_uuid();
  actor uuid:=auth.uid();
  claim private.dealer_game_setup_commits;
  request_hash text;
  stake integer; first_seconds integer;
  people jsonb;
  balances jsonb;
  result jsonb;
  setup_players jsonb;
BEGIN
  PERFORM private.run21_require_production();
  IF actor IS NULL OR NOT private.run21_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'run21' THEN
    RAISE EXCEPTION 'run21:authenticated_player_required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT EXISTS(
    SELECT 1 FROM public.players
    WHERE game_id=g.id AND user_id=actor AND NOT is_bot AND status='active' AND NOT sitting_out
  ) THEN
    RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,5}$' OR p_expected_config_deadline IS NULL THEN
    RAISE EXCEPTION 'run21:invalid_setup';
  END IF;
  stake:=(p_config->>'ante_amount')::integer;
  request_hash:=md5(jsonb_build_array(
    p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline
  )::text);

  SELECT * INTO claim
  FROM private.dealer_game_setup_commits
  WHERE game_id=g.id
    AND expected_config_deadline=p_expected_config_deadline
    AND expected_dealer_position=p_expected_dealer_position;
  IF FOUND THEN
    IF claim.request_hash<>request_hash THEN
      RAISE EXCEPTION 'run21:setup_replay_conflict';
    END IF;
    RETURN claim.result||jsonb_build_object('outcome','already_configured','deduped',true);
  END IF;

  SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
  IF g.status NOT IN ('game_selection','configuring')
    OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline
    OR clock_timestamp()>g.config_deadline
    OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position
    OR d.position IS DISTINCT FROM p_expected_dealer_position
    OR d.sitting_out
    OR d.status<>'active'
    OR (d.user_id<>actor AND NOT(d.is_bot AND g.current_host=actor))
    OR coalesce(g.is_paused,false)
    OR coalesce(g.pending_session_end,false) THEN
    RAISE EXCEPTION 'run21:setup_identity';
  END IF;

  IF g.real_money THEN PERFORM private.run21_assert_recovery_health(g.id); END IF;
  IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'run21:outstanding_pot'; END IF;
  PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
  IF g.real_money AND EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND is_bot) THEN
    RAISE EXCEPTION 'run21:real_money_humans_required';
  END IF;
  SELECT coalesce(decision_timer_seconds,30) INTO first_seconds FROM public.game_defaults WHERE game_type='run21';
  IF first_seconds IS NULL OR first_seconds NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'run21:invalid_first_placement_timer'; END IF;
  IF (SELECT count(*) FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out)<>2
    OR EXISTS(
      SELECT 1 FROM public.players
      WHERE game_id=g.id AND status<>'left' AND NOT is_bot
        AND NOT private.run21_actor_allowed(user_id)
    ) THEN
    RAISE EXCEPTION 'run21:two_eligible_players_required';
  END IF;

  -- Historical Run21 dealer-games remain in the session, but only a match
  -- that has not completed its authoritative close, lacks its settlement
  -- receipt, or is still the canonical live pointer may block continuation.
  IF EXISTS(
    SELECT 1
    FROM public.dealer_games prior
    JOIN private.run21_matches m ON m.dealer_game_id=prior.id
    WHERE prior.session_id=g.id
      AND prior.game_type='run21'
      AND (
        m.finished IS DISTINCT FROM true
        OR NOT EXISTS(
          SELECT 1 FROM private.run21_settlements settlement
          WHERE settlement.dealer_game_id=prior.id
        )
        OR g.current_game_uuid=prior.id
      )
  ) THEN
    RAISE EXCEPTION 'run21:live_game_exists';
  END IF;

  SELECT
    jsonb_agg(jsonb_build_object(
      'id',p.id,
      'userId',p.user_id,
      'seat',p.position,
      'name',CASE WHEN p.is_bot THEN 'Run21 bot' ELSE coalesce(pr.username,'Player') END,
      'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,
      'chips',p.chips
    ) ORDER BY p.position),
    jsonb_object_agg(p.id,p.chips)
  INTO people,balances
  FROM public.players p
  JOIN public.profiles pr ON pr.id=p.user_id
  WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out;

  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
    VALUES(g.id,d.user_id,'run21',jsonb_build_object('ante_amount',stake,'run21_authority',2,'first_placement_seconds',first_seconds))
    RETURNING * INTO dg;

  -- Normal setup authority transitions may retire a prior family's presentation.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.players
  SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false
  WHERE game_id=g.id AND status='active' AND NOT sitting_out;

  UPDATE public.games
  SET game_type='run21',
      current_game_uuid=dg.id,
      config_complete=true,
      config_deadline=NULL,
      ante_decision_deadline=NULL,
      status='in_progress',
      ante_amount=stake,
      current_round=1,
      total_hands=1,
      replay_contract_version=NULL,
      all_decisions_in=false,
      all_decisions_in_round_id=NULL
  WHERE id=g.id
  RETURNING * INTO g;

  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
    VALUES(r,g.id,dg.id,1,1,0,'betting',0);
  INSERT INTO private.run21_matches(
    dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds
  ) VALUES(dg.id,g.id,r,people,stake,balances,balances,2,g.real_money,first_seconds);

  SELECT jsonb_agg(to_jsonb(p) ORDER BY position)
  INTO setup_players
  FROM public.players p
  WHERE game_id=g.id;
  result:=jsonb_build_object(
    'outcome','configured',
    'deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',g.id,
      'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(g),
    'dealer_game',to_jsonb(dg),
    'players',setup_players
  );
  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result
  ) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,request_hash,dg.id,result);
  RETURN result;
END $function$
;
REVOKE ALL ON FUNCTION public.run21_configure(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_configure(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
-- Existing clients use the same financially authoritative owner after activation.
CREATE OR REPLACE FUNCTION public.run21_configure_local(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.run21_configure(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_game_type,p_config,p_expected_config_deadline)
$$;
CREATE OR REPLACE FUNCTION private.run21_release_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE is_run21 boolean;
BEGIN
 IF TG_TABLE_NAME='games' THEN
   is_run21:=NEW.game_type='run21';
   IF is_run21 AND (EXISTS(
     SELECT 1 FROM public.players WHERE game_id=NEW.id AND NOT is_bot AND status<>'left' AND NOT private.run21_actor_allowed(user_id))) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT game_type='run21' INTO is_run21 FROM public.games WHERE id=NEW.game_id;
   IF is_run21 AND NOT NEW.is_bot AND NOT private.run21_actor_allowed(NEW.user_id) THEN
     RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF is_run21 AND auth.uid() IS NOT NULL AND NOT private.run21_actor_allowed(auth.uid()) THEN
   RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_load(p_game_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id),'[]'::jsonb)) #- '{state,eventSequence}' END ORDER BY m.created_at)
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 WHERE (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_load_current(p_game_id uuid DEFAULT NULL::uuid, p_after_sequence bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM private.run21_require_local();
 RETURN coalesce((SELECT jsonb_agg(CASE WHEN p_after_sequence IS NULL OR m.state IS NULL THEN to_jsonb(m) ELSE
 jsonb_set(to_jsonb(m),'{state,events}',coalesce((SELECT jsonb_agg(e.event ORDER BY e.sequence)
 FROM private.run21_events e WHERE e.dealer_game_id=m.dealer_game_id AND e.sequence>p_after_sequence),'[]'::jsonb)) END
 ORDER BY m.created_at) FROM private.run21_matches m
 JOIN public.games g ON g.id=m.game_id WHERE (p_game_id IS NULL OR m.game_id=p_game_id)
 AND (p_game_id IS NOT NULL OR NOT m.finished)),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION public.run21_server_admit(p_user_id uuid, p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE allowed boolean; record jsonb; started timestamptz:=clock_timestamp(); gate_ms numeric; member_ms numeric;
BEGIN
 allowed:=private.run21_actor_allowed(p_user_id);
 gate_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 IF NOT coalesce(allowed,false) THEN RETURN jsonb_build_object('allowed',false); END IF;
 started:=clock_timestamp();
 SELECT to_jsonb(m)||jsonb_build_object('dealer_user_id',d.dealer_user_id) INTO record
 FROM private.run21_matches m JOIN public.games g ON g.id=m.game_id
 JOIN public.dealer_games d ON d.id=m.dealer_game_id
 WHERE m.game_id=p_game_id
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p WHERE p->>'userId'=p_user_id::text AND p->>'kind'='human')
 ORDER BY m.created_at DESC LIMIT 1;
 member_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
 RETURN jsonb_build_object('allowed',true,'record',record,'gateMs',gate_ms,'membershipMs',member_ms);
END $function$
;
CREATE FUNCTION public.run21_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean:=private.run21_actor_allowed(auth.uid());
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.run21_production_release WHERE singleton AND qualified);
 IF p_session_id IS NOT NULL THEN allowed:=allowed AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot); END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',auth.uid(),'session_id',p_session_id,'project_ref','xvhmbuppghwmwpwrkzao','fake_money_only',false);
END $$;
REVOKE ALL ON FUNCTION public.run21_capabilities(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_capabilities(uuid) TO authenticated;
-- Cached version-one clients reject this production capability and must refresh.
CREATE OR REPLACE FUNCTION public.run21_app_test_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.run21_capabilities(p_session_id)
$$;
UPDATE public.game_defaults SET decision_timer_seconds=30 WHERE game_type='run21';

SELECT cron.schedule('run21-recovery','5 seconds',
  'SET statement_timeout = ''3s''; SELECT private.run21_dispatch_recovery()');
