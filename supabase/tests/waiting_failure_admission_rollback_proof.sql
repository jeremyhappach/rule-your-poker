-- Candidate validation inserts the scope_waiting_abandonment_failure_admission
-- migration after BEGIN, within this transaction. No historical session is
-- modified; fixtures use new UUIDs.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $proof$
DECLARE
  v_game uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_users uuid[];
  v_dealer uuid;
  v_deadline timestamptz := clock_timestamp() + interval '20 minutes';
  v_config jsonb := '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}';
  v_health jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_before jsonb;
  v_failure_before jsonb;
  v_dealer_game uuid;
  v_reason text;
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(357357,20260820);
  IF EXISTS (SELECT 1 FROM private.game_recovery_failures) THEN
    RAISE EXCEPTION 'waiting_failure_proof:global_health_not_clean';
  END IF;
  SELECT array_agg(id) INTO v_users FROM (
    SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE NOT public.has_role(p.id,'admin'::public.app_role)
    ORDER BY p.id LIMIT 2
  ) candidates;
  IF coalesce(cardinality(v_users),0) < 2 THEN
    RAISE EXCEPTION 'waiting_failure_proof:needs_two_non_admin_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  UPDATE private.game_recovery_dispatch_state
    SET last_completed_at=clock_timestamp(),last_outcome='completed',consecutive_partial_failures=0
    WHERE singleton;

  INSERT INTO public.games(id,name,status,real_money,current_host,dealer_position,config_complete,config_deadline,pot,total_hands,current_round)
  VALUES(v_game,'Rollback waiting-failure admission','waiting',true,v_users[1],1,false,v_deadline,0,0,0),
        (v_peer,'Rollback waiting-failure peer','game_selection',true,v_users[1],1,false,v_deadline,0,0,0);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,sitting_out)
  VALUES(v_game,v_users[1],1,100,'active',false,false),(v_game,v_users[2],2,100,'active',false,false);
  SELECT id INTO v_dealer FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM private.record_recovery_unit_failure('session_abandonment',v_game,'1:'||v_game,'55P03','synthetic lock contention');
  UPDATE private.game_recovery_unit_failures SET retry_after=clock_timestamp()-interval '1 second'
    WHERE game_id=v_game;
  SELECT to_jsonb(f) INTO v_failure_before FROM private.game_recovery_unit_failures f WHERE game_id=v_game;

  -- An expired retry is not success. The deployed status constraint admits
  -- waiting; the owner's legacy waiting_for_players predicate stays intact.
  FOREACH v_status IN ARRAY ARRAY['waiting'] LOOP
    UPDATE public.games SET status=v_status WHERE id=v_game;
    v_health:=private.evaluate_real_money_liveness(v_game);
    IF v_health->>'reason'<>'session_recovery_failure' OR (v_health->>'admission_allowed')::boolean THEN
      RAISE EXCEPTION 'waiting_failure_proof:eligible_failure_ignored:%:%',v_status,v_health;
    END IF;
  END LOOP;
  IF (private.evaluate_real_money_liveness(v_peer)->>'admission_allowed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'waiting_failure_proof:peer_poisoned';
  END IF;

  -- Real lifecycle departure retires the watch but preserves the failure row.
  FOREACH v_status IN ARRAY ARRAY['dealer_selection','game_selection','configuring'] LOOP
    UPDATE public.games SET status=v_status,config_deadline=v_deadline WHERE id=v_game;
    v_health:=private.evaluate_real_money_liveness(v_game);
    IF (v_health->>'admission_allowed')::boolean IS NOT TRUE OR v_health->'session_failures'<>'[]'::jsonb THEN
      RAISE EXCEPTION 'waiting_failure_proof:obsolete_failure_blocks:%:%',v_status,v_health;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM private.session_abandonment_watches WHERE game_id=v_game)
     OR (SELECT to_jsonb(f) FROM private.game_recovery_unit_failures f WHERE game_id=v_game) IS DISTINCT FROM v_failure_before THEN
    RAISE EXCEPTION 'waiting_failure_proof:failure_evidence_changed';
  END IF;
  UPDATE public.games SET status='game_selection',config_deadline=v_deadline WHERE id=v_game;

  -- Preserve all other admission guards and failed-setup transaction atomicity.
  FOREACH v_reason IN ARRAY ARRAY['scheduler_heartbeat_missing','scheduler_heartbeat_stale','scheduler_partial_failure','active_recovery_failure','session_recovery_failure','overdue_authoritative_timer','game_paused'] LOOP
    UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed' WHERE singleton;
    IF v_reason='scheduler_heartbeat_missing' THEN
      UPDATE private.game_recovery_dispatch_state SET last_completed_at=NULL WHERE singleton;
    ELSIF v_reason='scheduler_heartbeat_stale' THEN
      UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp()-interval '30 seconds' WHERE singleton;
    ELSIF v_reason='scheduler_partial_failure' THEN
      UPDATE private.game_recovery_dispatch_state SET last_outcome='partial_failure' WHERE singleton;
    ELSIF v_reason='active_recovery_failure' THEN
      INSERT INTO private.game_recovery_failures(task_name,first_failed_at,last_failed_at,failure_count,returned_sqlstate,error_message)
      VALUES('__waiting_failure_proof__',clock_timestamp(),clock_timestamp(),1,'55P03','synthetic global failure');
    ELSIF v_reason='session_recovery_failure' THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_game,'proof-current','55P03','synthetic current task failure');
    ELSIF v_reason='overdue_authoritative_timer' THEN
      UPDATE private.game_timer_registry SET due_at=clock_timestamp()-interval '30 seconds' WHERE game_id=v_game AND state='scheduled';
      IF NOT FOUND THEN RAISE EXCEPTION 'waiting_failure_proof:missing_timer_fixture'; END IF;
    ELSE
      PERFORM set_config('app.session_pause_write','on',true);
      UPDATE public.games SET is_paused=true WHERE id=v_game;
    END IF;
    v_health:=private.evaluate_real_money_liveness(v_game);
    IF v_health->>'reason'<>v_reason OR (v_health->>'admission_allowed')::boolean THEN
      RAISE EXCEPTION 'waiting_failure_proof:guard_lost:%:%',v_reason,v_health;
    END IF;
    SELECT jsonb_build_object('game',to_jsonb(g),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE game_id=v_game))
      INTO v_before FROM public.games g WHERE id=v_game;
    BEGIN
      PERFORM public.configure_dealer_game(v_game,v_dealer,1,'cribbage',v_config,v_deadline);
      RAISE EXCEPTION 'waiting_failure_proof:unhealthy_setup_succeeded';
    EXCEPTION WHEN OTHERS THEN
      IF v_reason='game_paused' THEN
        IF SQLERRM<>'configure_dealer_game:game_paused' THEN RAISE; END IF;
      ELSIF SQLSTATE<>'55000' OR SQLERRM<>'real_money_liveness_unavailable:'||v_reason THEN RAISE;
      END IF;
    END;
    IF (SELECT jsonb_build_object('game',to_jsonb(g),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE game_id=v_game)) FROM public.games g WHERE id=v_game) IS DISTINCT FROM v_before
      OR EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
      OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
      RAISE EXCEPTION 'waiting_failure_proof:partial_commit:%',v_reason;
    END IF;
    DELETE FROM private.game_recovery_failures WHERE task_name='__waiting_failure_proof__';
    DELETE FROM private.game_recovery_unit_failures WHERE game_id=v_game AND task_name='canonical_timers';
    UPDATE private.game_timer_registry SET due_at=v_deadline WHERE game_id=v_game AND state='scheduled';
    UPDATE public.games SET is_paused=false WHERE id=v_game;
  END LOOP;

  -- Fake-money exemption is unchanged even with an unhealthy scheduler.
  UPDATE public.games SET real_money=false WHERE id=v_peer;
  UPDATE private.game_recovery_dispatch_state SET last_completed_at=NULL WHERE singleton;
  IF private.evaluate_real_money_liveness(v_peer)->>'reason'<>'fake_money_exempt' THEN
    RAISE EXCEPTION 'waiting_failure_proof:fake_exemption_lost';
  END IF;
  UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed' WHERE singleton;

  -- The peer cannot configure the human dealer's game; the real dealer can.
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer,1,'cribbage',v_config,v_deadline);
    RAISE EXCEPTION 'waiting_failure_proof:peer_configured';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'configure_dealer_game:dealer_authorization_required' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  v_result:=public.configure_dealer_game(v_game,v_dealer,1,'cribbage',v_config,v_deadline);
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_result#>>'{game,status}'<>'ante_decision'
     OR v_dealer_game IS NULL OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game THEN
    RAISE EXCEPTION 'waiting_failure_proof:setup_not_committed:%',v_result;
  END IF;
  SELECT jsonb_build_object('game',to_jsonb(g),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE game_id=v_game))
    INTO v_before FROM public.games g WHERE id=v_game;
  v_replay:=public.configure_dealer_game(v_game,v_dealer,1,'cribbage',v_config,v_deadline);
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT jsonb_build_object('game',to_jsonb(g),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE game_id=v_game)) FROM public.games g WHERE id=v_game) IS DISTINCT FROM v_before
     OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
     OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
    RAISE EXCEPTION 'waiting_failure_proof:duplicate_mutation';
  END IF;
  IF (SELECT sum(chips) FROM public.players WHERE game_id=v_game)<>200
     OR (SELECT pot FROM public.games WHERE id=v_game)<>0 THEN
    RAISE EXCEPTION 'waiting_failure_proof:unexpected_chip_movement';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.game_recovery_unit_failures WHERE game_id=v_game AND task_name='session_abandonment') THEN
    RAISE EXCEPTION 'waiting_failure_proof:evidence_deleted';
  END IF;
  IF has_function_privilege('authenticated','private.evaluate_real_money_liveness(uuid)','EXECUTE')
     OR has_table_privilege('authenticated','private.game_recovery_unit_failures','SELECT') THEN
    RAISE EXCEPTION 'waiting_failure_proof:private_authority_exposed';
  END IF;
END;
$proof$;
ROLLBACK;
