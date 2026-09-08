-- Caller-owned rollback proof. Before loading the candidate migration, copy
-- the prior deployed admission function to pg_temp.recovery_due_reference.
-- Run this file inside BEGIN/ROLLBACK, both before and after deployment.
-- Historical sessions are read only; only these synthetic rows are changed.
DO $proof$
DECLARE
  v_users uuid[];
  v_game uuid := gen_random_uuid();
  v_dg uuid := gen_random_uuid();
  v_round uuid := gen_random_uuid();
  v_player uuid := gen_random_uuid();
  v_human uuid := v_player;
  v_bot uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_case record;
  v_state jsonb;
  v_actual boolean;
  v_reference boolean;
  v_task text;
BEGIN
  PERFORM pg_advisory_xact_lock(357357, 20260820);
  IF private.game_recovery_task_is_due('cribbage', v_now) THEN
    RAISE EXCEPTION 'cribbage_admission_proof:requires_no_existing_due_cribbage_work';
  END IF;
  SELECT array_agg(id) INTO v_users FROM (
    SELECT pr.id FROM public.profiles pr JOIN auth.users a ON a.id=pr.id
    ORDER BY pr.id LIMIT 3
  ) profiles;
  IF cardinality(v_users) < 3 THEN RAISE EXCEPTION 'cribbage_admission_proof:profiles'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);

  INSERT INTO public.games(id,name,status,game_type,real_money,current_host,total_hands,current_round)
  VALUES(v_game,'Rollback Cribbage admission cost','in_progress','cribbage',false,v_users[1],1,1);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
  VALUES(v_dg,v_game,v_users[1],'cribbage');
  UPDATE public.games SET current_game_uuid=v_dg WHERE id=v_game;
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot)
  VALUES(v_player,v_game,v_users[1],1,0,'active',false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,is_bot)
  VALUES(v_bot,v_game,v_users[3],2,0,'active',true);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],4,0,'active',false);
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status)
  VALUES(v_round,v_game,v_dg,1,1,0,'betting');
  INSERT INTO private.cribbage_round_states(round_id,state) VALUES(v_round,'{}');

  FOR v_case IN SELECT * FROM (VALUES
    ('human discard', 'discarding', false, 'in_progress', false, 1, 'ready', -1, true, 0, false),
    ('bot discard', 'discarding', true, 'in_progress', false, 1, 'ready', -1, true, 0, true),
    ('bot already discarded', 'discarding', true, 'in_progress', false, 1, 'ready', -1, true, 1, false),
    ('bot absent from cohort', 'discarding', true, 'in_progress', false, 1, 'ready', -1, false, 0, false),
    ('human pegging', 'pegging', false, 'in_progress', false, 1, 'ready', -1, true, 0, false),
    ('bot pegging', 'pegging', true, 'in_progress', false, 1, 'ready', -1, true, 0, true),
    ('ready counting', 'counting', false, 'in_progress', false, 1, 'ready', -1, true, 0, true),
    ('terminal counting', 'counting', false, 'in_progress', false, 1, 'terminal_pending', -1, true, 0, true),
    ('counting not ready', 'counting', false, 'in_progress', false, 1, 'pending', -1, true, 0, false),
    ('counting future', 'counting', false, 'in_progress', false, 1, 'ready', 60, true, 0, false),
    ('complete continuation', 'complete', false, 'in_progress', false, 1, 'ready', -1, true, 0, true),
    ('complete game over', 'complete', false, 'game_over', false, 1, 'ready', -1, true, 0, false),
    ('complete session ended', 'complete', false, 'session_ended', false, 1, 'ready', -1, true, 0, false),
    ('terminal counting after game over', 'counting', false, 'game_over', false, 1, 'terminal_pending', -1, true, 0, true),
    ('paused discard', 'discarding', true, 'in_progress', true, 1, 'ready', -1, true, 0, false),
    ('paused pegging', 'pegging', true, 'in_progress', true, 1, 'ready', -1, true, 0, false),
    ('paused counting', 'counting', false, 'in_progress', true, 1, 'ready', -1, true, 0, false),
    ('paused complete', 'complete', false, 'in_progress', true, 1, 'ready', -1, true, 0, false),
    ('retired hand', 'counting', false, 'in_progress', false, 2, 'ready', -1, true, 0, false),
    ('unknown phase', 'unknown', true, 'in_progress', false, 1, 'ready', -1, true, 0, false),
    ('missing phase', NULL, true, 'in_progress', false, 1, 'ready', -1, true, 0, false)
  ) cases(label,phase,bot,game_status,paused,current_hand,outcome,deadline_seconds,in_cohort,discards,expected)
  LOOP
    -- Only these rollback fixtures may cross paused/terminal states directly.
    PERFORM set_config('app.session_pause_write', 'on', true);
    UPDATE public.games SET status=v_case.game_status,is_paused=v_case.paused,
      total_hands=v_case.current_hand,current_game_uuid=v_dg WHERE id=v_game;
    -- Participant identity is immutable: choose an existing fixture actor.
    v_player:=CASE WHEN v_case.bot THEN v_bot ELSE v_human END;
    UPDATE public.rounds SET presentation_fallback_at=v_now+make_interval(secs=>v_case.deadline_seconds)
      WHERE id=v_round;
    v_state:=jsonb_build_object('phase',v_case.phase,
      'playerStates',CASE WHEN v_case.in_cohort THEN jsonb_build_object(v_player::text,
        jsonb_build_object('discardedToCrib',CASE WHEN v_case.discards=0 THEN '[]'::jsonb ELSE '[0]'::jsonb END))
        ELSE '{}'::jsonb END,
      'pegging',jsonb_build_object('currentTurnPlayerId',v_player),
      'countingResolution',jsonb_build_object('outcome',v_case.outcome));
    UPDATE private.cribbage_round_states SET state=v_state WHERE round_id=v_round;
    PERFORM set_config('app.session_pause_write', '', true);
    -- Round publication intentionally registers a fallback timer. Prove that
    -- admission first, then remove only this fixture's timer to exercise the
    -- legacy/missing-registry state path independently of the first OR branch.
    IF v_case.label='human discard' AND (
      NOT pg_temp.recovery_due_reference('cribbage',v_now)
      OR NOT private.game_recovery_task_is_due('cribbage',v_now)
    ) THEN RAISE EXCEPTION 'cribbage_admission_proof:registered_fallback'; END IF;
    DELETE FROM private.game_timer_registry WHERE game_id=v_game;
    v_reference:=pg_temp.recovery_due_reference('cribbage',v_now);
    v_actual:=private.game_recovery_task_is_due('cribbage',v_now);
    IF v_reference IS DISTINCT FROM v_case.expected OR v_actual IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'cribbage_admission_proof:%:expected=%:reference=%:actual=%',
        v_case.label,v_case.expected,v_reference,v_actual;
    END IF;
    IF private.game_recovery_task_is_due('cribbage',v_now) IS DISTINCT FROM v_actual THEN
      RAISE EXCEPTION 'cribbage_admission_proof:non_idempotent_read:%',v_case.label;
    END IF;
  END LOOP;

  -- A retired dealer identity cannot revive even a due complete hand.
  UPDATE private.cribbage_round_states SET state='{"phase":"complete"}' WHERE round_id=v_round;
  UPDATE public.games SET current_game_uuid=NULL WHERE id=v_game;
  IF private.game_recovery_task_is_due('cribbage',v_now)
    OR pg_temp.recovery_due_reference('cribbage',v_now) THEN
    RAISE EXCEPTION 'cribbage_admission_proof:retired_dealer_game';
  END IF;
  -- Other task classifications and private RPC permissions are unchanged.
  FOREACH v_task IN ARRAY ARRAY['canonical_timers','holm','gin_rummy','yahtzee','three_five_seven','horses_scc','session_abandonment'] LOOP
    IF private.game_recovery_task_is_due(v_task,v_now)
      IS DISTINCT FROM pg_temp.recovery_due_reference(v_task,v_now) THEN
      RAISE EXCEPTION 'cribbage_admission_proof:other_owner:%',v_task;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','private.game_recovery_task_is_due(text,timestamptz)','EXECUTE')
    OR has_function_privilege('authenticated','private.game_recovery_task_is_due(text,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('service_role','private.game_recovery_task_is_due(text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'cribbage_admission_proof:permissions';
  END IF;
  DELETE FROM public.games WHERE id=v_game;
END;
$proof$;
