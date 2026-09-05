BEGIN;
SET LOCAL lock_timeout='2s';
DO $proof$
DECLARE users uuid[]; g uuid; dg uuid; p1 uuid; p2 uuid; rd uuid; fixture_games uuid[]:=ARRAY[]::uuid[]; fixture_rounds uuid[]:=ARRAY[]::uuid[];
 s jsonb; r jsonb; i integer; before_context jsonb; count_before bigint; health jsonb;
BEGIN
 SELECT array_agg(id) INTO users FROM (SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id ORDER BY pr.id LIMIT 2) x;
 PERFORM pg_advisory_xact_lock(357357,20260820);
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR i IN 1..2 LOOP
  g:=gen_random_uuid();dg:=gen_random_uuid();p1:=gen_random_uuid();p2:=gen_random_uuid();
  INSERT INTO public.games(id,name,game_type,status,real_money,ante_amount,buy_in,pot,current_round,total_hands,points_to_win,is_first_hand,current_host,dealer_position)
  VALUES(g,'Rollback recovery isolation','gin-rummy','ante_decision',false,1,1000,0,NULL,0,100,true,users[1],1);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config) VALUES(dg,users[1],'gin-rummy',g,'{"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}');
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES(p1,users[1],g,1,0,false,'active','ante_up'),(p2,users[2],g,4,0,false,'active','ante_up');
  r:=public.start_gin_rummy_initial_hand(g);rd:=(r->>'round_id')::uuid;
  IF rd IS NULL THEN RAISE EXCEPTION 'proof:gin_fixture:%',r; END IF;
  SELECT state INTO s FROM private.gin_rummy_round_states WHERE round_id=rd;
  s:=s||jsonb_build_object('phase','complete','winnerPlayerId',NULL,'completeDueAt',CASE WHEN i=1 THEN 'malformed-date' ELSE '2000-01-01T00:00:00Z' END);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM private.gin_publish_state(rd,s);
  fixture_games:=array_append(fixture_games,g);fixture_rounds:=array_append(fixture_rounds,rd);
 END LOOP;
 before_context:=private.capture_recovery_context();
 r:=private.run_due_game_recovery_task('gin_rummy');
 IF r->>'outcome'<>'completed' OR private.capture_recovery_context()<>before_context THEN RAISE EXCEPTION 'proof:task_context:%',r; END IF;
 IF (SELECT total_hands FROM public.games WHERE id=fixture_games[2])<>2 OR (SELECT total_hands FROM public.games WHERE id=fixture_games[1])<>1
 OR NOT EXISTS(SELECT 1 FROM private.game_recovery_unit_failures WHERE game_id=fixture_games[1] AND task_name='gin_rummy' AND returned_sqlstate='22007')
 OR EXISTS(SELECT 1 FROM private.game_recovery_failures WHERE task_name='gin_rummy') THEN RAISE EXCEPTION 'proof:poison_rolled_back_peer'; END IF;
 SELECT failure_count INTO count_before FROM private.game_recovery_unit_failures WHERE game_id=fixture_games[1];
 PERFORM private.run_due_game_recovery_task('gin_rummy');
 IF (SELECT failure_count FROM private.game_recovery_unit_failures WHERE game_id=fixture_games[1])<>count_before THEN RAISE EXCEPTION 'proof:backoff_not_observed'; END IF;
 -- An unrelated real-money room sees the healthy dispatcher; failed session
 -- diagnostics are scoped by its exact dealer game, not the entire family.
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed' WHERE singleton;
 UPDATE public.games SET real_money=true WHERE id=fixture_games[2];
 health:=private.evaluate_real_money_liveness(fixture_games[2]);
 IF health->>'reason'='session_recovery_failure' THEN RAISE EXCEPTION 'proof:peer_health_poisoned'; END IF;
 UPDATE public.games SET real_money=true WHERE id=fixture_games[1];
 health:=private.evaluate_real_money_liveness(fixture_games[1]);
 IF health->>'reason'<>'session_recovery_failure' THEN RAISE EXCEPTION 'proof:failure_not_visible:%',health; END IF;
 UPDATE public.games SET real_money=false WHERE id=ANY(fixture_games);
 -- Repair only the synthetic malformed deadline, then retry exactly that unit.
 UPDATE private.gin_rummy_round_states SET state=jsonb_set(state,'{completeDueAt}','"2000-01-01T00:00:00Z"') WHERE round_id=fixture_rounds[1];
 UPDATE private.game_recovery_unit_failures SET retry_after=statement_timestamp()-interval '1 second' WHERE game_id=fixture_games[1];
 PERFORM private.run_due_game_recovery_task('gin_rummy');
 IF (SELECT total_hands FROM public.games WHERE id=fixture_games[1])<>2 OR EXISTS(SELECT 1 FROM private.game_recovery_unit_failures WHERE game_id=fixture_games[1]) THEN RAISE EXCEPTION 'proof:retry_not_recovered'; END IF;
 PERFORM private.record_recovery_unit_failure('gin_rummy',fixture_games[1],'old:'||fixture_rounds[1]::text,'P0001','synthetic retired hand');
 IF private.recovery_session_deferred('gin_rummy',fixture_games[1]) THEN RAISE EXCEPTION 'proof:retired_hand_blocks_successor'; END IF;
 -- Both successful and failed owner calls restore all caller authority context.
 PERFORM private.run_due_game_recovery_task('__rollback_context_failure__');
 IF private.capture_recovery_context()<>before_context THEN RAISE EXCEPTION 'proof:failure_context'; END IF;
 DELETE FROM private.game_recovery_failures WHERE task_name='__rollback_context_failure__';
 PERFORM private.record_recovery_unit_failure('gin_rummy',fixture_games[1],'cleanup','P0001','synthetic');
 DELETE FROM public.games WHERE id=ANY(fixture_games);
 IF EXISTS(SELECT 1 FROM private.game_recovery_unit_failures WHERE game_id=ANY(fixture_games)) THEN RAISE EXCEPTION 'proof:cleanup'; END IF;
 IF has_table_privilege('authenticated','private.game_recovery_unit_failures','SELECT') OR has_function_privilege('authenticated','private.record_recovery_unit_failure(text,uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'proof:browser_failure_authority'; END IF;
END $proof$;
ROLLBACK;
