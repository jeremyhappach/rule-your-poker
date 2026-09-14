-- Temporary database only; every fixture rolls back. No live sessions changed.
CREATE OR REPLACE FUNCTION private.replay_gin_waiting_fixture_v2(_sitout boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE f jsonb;g public.games;p public.players;result jsonb;
BEGIN
 f:=private.replay_gin_waiting_prepare_v2('postgame_terminal','normal_knock_layoff',false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>1,'role','authenticated')::text,true);
 PERFORM public.gin_rummy_apply_action((f->>'round')::uuid,(f->'players'->>1)::uuid,'take_first_draw',NULL,NULL,0);
 PERFORM public.gin_rummy_apply_action((f->>'round')::uuid,(f->'players'->>1)::uuid,'knock',private.gin_card('K',chr(9829)),NULL,1);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
 IF _sitout THEN
  SELECT * INTO p FROM public.players WHERE id=(f->'players'->>0)::uuid;
  PERFORM public.set_session_player_intent((f->>'game')::uuid,p.id,p.intent_version,(f->>'dealerGame')::uuid,'sit_out_next_hand',true);
 END IF;
 PERFORM public.gin_rummy_apply_action((f->>'round')::uuid,(f->'players'->>0)::uuid,'finish_lay_off',NULL,NULL,2);
 result:=public.gin_rummy_advance_postgame((f->>'game')::uuid,(f->>'round')::uuid,(f->>'dealerGame')::uuid,1);
 IF result->>'outcome'<>'advanced' THEN RAISE EXCEPTION 'waiting_fixture:postgame:%',result; END IF;
 RETURN f;
END;
$fn$;
CREATE OR REPLACE FUNCTION private.replay_gin_waiting_proof_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE mode text;f jsonb;g public.games;p public.players;other_p public.players;result jsonb;before_n bigint;n bigint;pack jsonb;again jsonb;opening_v2 text;
exports jsonb:='[]';checks jsonb:='[]';v_deadline timestamptz;v_position integer;v_round uuid;old_round uuid;v_config jsonb;denied boolean;fixture_dealer text;
BEGIN
 BEGIN
  -- Disposable rollback fixture only: allow the same deterministic opening
  -- deck on a money table. The authoritative opening still captures reality.
  SELECT pg_get_functiondef('private.gin_deal_state(public.games,uuid,uuid,jsonb,integer,integer,integer)'::regprocedure) INTO fixture_dealer;
  EXECUTE replace(fixture_dealer,'IF _game.real_money IS DISTINCT FROM false THEN','IF _game.real_money IS DISTINCT FROM false AND current_setting(''test.replay_real_money'',true) IS DISTINCT FROM ''true'' THEN');
  ALTER TABLE public.games DISABLE TRIGGER guard_session_financial_history;
  FOREACH mode IN ARRAY ARRAY['queued_sitout','decline_leave_rejoin','ante_timeout','real_money_ante_timeout','ante_sitout','setup_timeout','ante_success','other_game_handoff','waiting_terminal','legacy_boundary'] LOOP
   PERFORM set_config('test.replay_real_money',(mode='real_money_ante_timeout')::text,true);
   IF mode='legacy_boundary' THEN
    SELECT pg_get_functiondef('private.replay_gin_open_v1(public.games,public.rounds,jsonb,jsonb)'::regprocedure) INTO opening_v2;
    EXECUTE replace(opening_v2,'''lifecycleCaptureContract'',''gin-lifecycle/2'',','');
   END IF;
   f:=private.replay_gin_waiting_fixture_v2(mode IN ('queued_sitout','waiting_terminal'));
   IF mode='legacy_boundary' THEN EXECUTE opening_v2; END IF;
   SELECT * INTO g FROM public.games WHERE id=(f->>'game')::uuid;
   old_round:=(f->>'round')::uuid;
   IF mode IN ('queued_sitout','waiting_terminal') THEN
    IF g.status<>'waiting' THEN RAISE EXCEPTION 'waiting_proof:sitout:%',g.status; END IF;
   ELSE
    IF g.status<>'game_selection' THEN RAISE EXCEPTION 'waiting_proof:setup:%',g.status; END IF;
    SELECT * INTO p FROM public.players WHERE game_id=g.id AND position=g.dealer_position;
    SELECT * INTO other_p FROM public.players WHERE game_id=g.id AND id<>p.id;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);
   END IF;
   SELECT count(*) INTO before_n FROM private.replay_steps WHERE session_id=g.id;
   IF mode='legacy_boundary' THEN
    PERFORM public.decline_session_setup(g.id,g.dealer_position,g.config_deadline);
    SELECT * INTO p FROM public.players WHERE id=p.id;
    PERFORM public.session_leave(g.id,p.id,p.participation_version);
    IF (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>before_n THEN RAISE EXCEPTION 'waiting_proof:legacy_boundary_fabricated'; END IF;
   ELSIF mode='decline_leave_rejoin' THEN
    v_deadline:=g.config_deadline;v_position:=g.dealer_position;
    -- Rejected authority and stale calls must not append.
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_p.user_id,'role','authenticated')::text,true);
    denied:=false;
    BEGIN PERFORM public.decline_session_setup(g.id,g.dealer_position,g.config_deadline);
    EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_setup_owner%' THEN RAISE; END IF;denied:=true;END;
    IF NOT denied OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>before_n THEN RAISE EXCEPTION 'waiting_proof:rejected_append'; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);
    result:=public.decline_session_setup(g.id,v_position,v_deadline);
    IF result->>'status'<>'waiting' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>before_n+1 THEN RAISE EXCEPTION 'waiting_proof:decline:%',result; END IF;
    result:=public.decline_session_setup(g.id,v_position,v_deadline);
    IF result->>'outcome'<>'already_declined' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>before_n+1 THEN RAISE EXCEPTION 'waiting_proof:duplicate_decline'; END IF;
    SELECT * INTO p FROM public.players WHERE id=p.id;
    PERFORM public.session_leave(g.id,p.id,p.participation_version);
    SELECT * INTO p FROM public.players WHERE id=p.id;
    IF p.status<>'left' THEN RAISE EXCEPTION 'waiting_proof:leave'; END IF;
    PERFORM public.session_take_seat(g.id,p.position,p.id,p.participation_version);
    SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=g.id;
    result:=public.decline_session_setup(g.id,v_position,v_deadline);
    IF result->>'outcome'<>'already_declined' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>n THEN RAISE EXCEPTION 'waiting_proof:late_duplicate'; END IF;
   ELSIF mode IN ('ante_timeout','real_money_ante_timeout','ante_sitout','ante_success','other_game_handoff') THEN
    INSERT INTO private.game_recovery_dispatch_state(singleton,last_completed_at,last_outcome) VALUES(true,clock_timestamp(),'completed')
     ON CONFLICT(singleton) DO UPDATE SET last_completed_at=EXCLUDED.last_completed_at,last_outcome=EXCLUDED.last_outcome;
    v_config:=jsonb_build_object('ante_amount',1,'points_to_win',1,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25);
    result:=public.configure_dealer_game(g.id,p.id,g.dealer_position,CASE WHEN mode='other_game_handoff' THEN 'horses' ELSE 'gin-rummy' END,
     CASE WHEN mode='other_game_handoff' THEN '{"ante_amount":1}'::jsonb ELSE v_config END,g.config_deadline);
    IF result->>'outcome'<>'configured' THEN RAISE EXCEPTION 'waiting_proof:config:%',result; END IF;
    SELECT * INTO g FROM public.games WHERE id=g.id;
    IF mode='other_game_handoff' THEN
     IF g.replay_contract_version IS NOT NULL THEN RAISE EXCEPTION 'waiting_proof:handoff_not_disabled'; END IF;
     SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=g.id;
     PERFORM public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
     IF (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>n THEN RAISE EXCEPTION 'waiting_proof:other_game_capture'; END IF;
    ELSIF mode IN ('ante_timeout','real_money_ante_timeout') THEN
     IF mode='real_money_ante_timeout' AND g.real_money IS DISTINCT FROM true THEN RAISE EXCEPTION 'waiting_proof:money_fixture'; END IF;
     result:=private.advance_ante_phase_exact(g.id,g.current_game_uuid,g.ante_decision_deadline,g.ante_decision_deadline+interval '1 second');
     IF result->>'outcome'<>'not_enough_players' THEN RAISE EXCEPTION 'waiting_proof:ante_timeout:%',result; END IF;
     SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=g.id;
     PERFORM private.advance_ante_phase_exact(g.id,g.current_game_uuid,g.ante_decision_deadline,g.ante_decision_deadline+interval '1 second');
     IF (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>n THEN RAISE EXCEPTION 'waiting_proof:timeout_duplicate'; END IF;
    ELSE
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_p.user_id,'role','authenticated')::text,true);
     SELECT count(*) INTO n FROM private.replay_steps WHERE session_id=g.id;
     result:=public.submit_ante_decision(g.id,g.current_game_uuid,other_p.id,CASE WHEN mode='ante_sitout' THEN 'sit_out' ELSE 'ante_up' END,NULL,NULL);
     IF result->>'outcome'<>'accepted' OR (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>n+1 THEN RAISE EXCEPTION 'waiting_proof:ante_compound:%',result; END IF;
     IF mode='ante_success' THEN
      SELECT (body #>> '{identity,roundId}')::uuid INTO v_round FROM private.replay_steps WHERE session_id=g.id ORDER BY sequence DESC LIMIT 1;
      IF v_round=old_round OR NOT EXISTS(SELECT 1 FROM private.replay_steps WHERE session_id=g.id AND body#>>'{opening,trigger,source}'='public.submit_ante_decision') THEN RAISE EXCEPTION 'waiting_proof:opening_cause'; END IF;
     END IF;
    END IF;
   ELSIF mode='setup_timeout' THEN
    PERFORM pg_sleep(1.05);
    result:=private.handle_config_deadline_timeout_exact(g.id,g.config_deadline,g.dealer_position);
    IF (SELECT status FROM public.games WHERE id=g.id)<>'waiting' THEN RAISE EXCEPTION 'waiting_proof:setup_timeout:%',result; END IF;
   ELSIF mode='waiting_terminal' THEN
    FOR p IN SELECT * FROM public.players WHERE game_id=g.id AND status<>'left' ORDER BY id LOOP
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);
     PERFORM public.session_leave(g.id,p.id,p.participation_version);
    END LOOP;
    IF (SELECT status FROM public.games WHERE id=g.id)<>'session_ended' THEN RAISE EXCEPTION 'waiting_proof:terminal'; END IF;
   END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
   pack:=public.export_gin_replay_v1(g.id,old_round,true);
   IF pack#>>'{seal,completeness}'<>'complete' THEN RAISE EXCEPTION 'waiting_proof:seal:%',mode; END IF;
   IF mode NOT IN ('ante_success','other_game_handoff','legacy_boundary') AND pack#>ARRAY['steps',(jsonb_array_length(pack->'steps')-1)::text,'closing','endingState','session']
     IS DISTINCT FROM (SELECT private.replay_gin_game_envelope_v1(x) FROM public.games x WHERE id=g.id) THEN RAISE EXCEPTION 'waiting_proof:ending_mismatch:%',mode; END IF;
   exports:=exports||jsonb_build_array(jsonb_build_object('category',mode,'package',pack));
   -- Disposable fixtures only: remove live rows to prove export independence.
   -- This trigger change is reverted by this proof's enclosing rollback.
   DELETE FROM public.games WHERE id=g.id;
   again:=public.export_gin_replay_v1(g.id,old_round,true);
   IF again IS DISTINCT FROM pack THEN RAISE EXCEPTION 'waiting_proof:live_dependency'; END IF;
   checks:=checks||jsonb_build_array(mode);
  END LOOP;
  RAISE EXCEPTION USING ERRCODE='ZP007',MESSAGE='rollback_waiting_proof';
 EXCEPTION WHEN SQLSTATE 'ZP007' THEN NULL;END;
 RETURN jsonb_build_object('exports',exports,'checks',checks,'fixturesRolledBack',true,'liveRowsRemovedDuringProof',true);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_waiting_fixture_v2(boolean),private.replay_gin_waiting_proof_v2() FROM PUBLIC,anon,authenticated,service_role;
