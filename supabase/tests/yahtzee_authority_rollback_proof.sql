-- Run after the Yahtzee authority migration inside a caller-owned transaction.
-- The complete scheduled owner is invoked directly; all synthetic state rolls back.
DO $proof$
DECLARE
  v_game_id uuid:=gen_random_uuid();
  v_dealer_game_id uuid:=gen_random_uuid();
  v_later_dealer_game_id uuid:=gen_random_uuid();
  v_terminal_game_id uuid:=gen_random_uuid();
  v_terminal_dealer_game_id uuid:=gen_random_uuid();
  v_bot_game_id uuid:=gen_random_uuid();
  v_bot_dealer_game_id uuid:=gen_random_uuid();
  v_user_one uuid;
  v_user_two uuid;
  v_outsider uuid:=gen_random_uuid();
  v_player_one uuid:=gen_random_uuid();
  v_player_two uuid:=gen_random_uuid();
  v_terminal_player_one uuid:=gen_random_uuid();
  v_terminal_player_two uuid:=gen_random_uuid();
  v_bot_human uuid:=gen_random_uuid();
  v_bot_player uuid:=gen_random_uuid();
  v_round_id uuid;
  v_tie_round_id uuid;
  v_terminal_round_id uuid;
  v_bot_round_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_state jsonb;
  v_before jsonb;
  v_after jsonb;
  v_scores_high jsonb:='{"ones":5,"twos":10,"threes":15,"fours":20,"fives":25,"sixes":30,"three_of_a_kind":30,"four_of_a_kind":30,"full_house":25,"small_straight":30,"large_straight":40,"yahtzee":50,"chance":30}'::jsonb;
  v_scores_low jsonb:='{"ones":1,"twos":2,"threes":3,"fours":4,"fives":5,"sixes":6,"three_of_a_kind":0,"four_of_a_kind":0,"full_house":0,"small_straight":0,"large_straight":0,"yahtzee":0,"chance":5}'::jsonb;
  v_scores_tie jsonb:='{"ones":3,"twos":6,"threes":9,"fours":12,"fives":15,"sixes":18,"three_of_a_kind":18,"four_of_a_kind":0,"full_house":25,"small_straight":30,"large_straight":40,"yahtzee":0,"chance":20}'::jsonb;
  v_advanced integer;
BEGIN
  SELECT profile_ids[1],profile_ids[2] INTO v_user_one,v_user_two
    FROM (
      SELECT array_agg(id ORDER BY id::text) AS profile_ids FROM (
        SELECT profile.id FROM public.profiles profile
        JOIN auth.users account ON account.id=profile.id
        ORDER BY profile.id::text LIMIT 2
      ) selected_profiles
    ) selected;
  IF v_user_one IS NULL OR v_user_two IS NULL OR v_user_one=v_user_two THEN
    RAISE EXCEPTION 'proof_requires_two_profiles';
  END IF;
  UPDATE public.system_settings SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false'::jsonb,true)
   WHERE key='harnesses_mode';

  -- Synthetic fixture construction is trusted setup. Reset immediately after
  -- it so the proof still exercises browser-authored mutation rejection.
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  INSERT INTO public.games(
    id,name,game_type,status,ante_amount,buy_in,pot,current_round,total_hands,
    dealer_position,is_first_hand,current_host
  ) VALUES(v_game_id,'Yahtzee authority rollback proof','yahtzee','ante_decision',10,100,0,NULL,0,2,true,v_user_one);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_dealer_game_id,v_user_two,'yahtzee',v_game_id,jsonb_build_object('ante_amount',10));
  UPDATE public.games SET current_game_uuid=v_dealer_game_id WHERE id=v_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES
    (v_player_one,v_user_one,v_game_id,1,100,false,'active','ante_up'),
    (v_player_two,v_user_two,v_game_id,2,100,false,'active',NULL);
  PERFORM set_config('app.yahtzee_authoritative_write','',true);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_outsider,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.start_yahtzee_round(v_game_id,NULL);
    RAISE EXCEPTION 'outsider_bootstrap_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_bootstrap_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_result:=public.start_yahtzee_round(v_game_id,NULL);
  IF v_result->>'outcome'<>'rejected' OR v_result->>'reason'<>'waiting_for_antes'
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'ante_decision'
     OR EXISTS(SELECT 1 FROM public.rounds WHERE game_id=v_game_id) THEN
    RAISE EXCEPTION 'incomplete_ante_bootstrap_was_not_atomic:%',v_result;
  END IF;
  BEGIN
    UPDATE public.games SET status='in_progress',current_round=1,total_hands=1 WHERE id=v_game_id;
    RAISE EXCEPTION 'direct_startup_write_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_startup_write_was_allowed' THEN RAISE; END IF;
  END;

  UPDATE public.players SET ante_decision='ante_up' WHERE id=v_player_two;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_advanced:=private.advance_due_yahtzee_state();
  SELECT id INTO v_round_id FROM public.rounds
   WHERE game_id=v_game_id AND dealer_game_id=v_dealer_game_id AND hand_number=1;
  IF v_advanced<1 OR v_round_id IS NULL
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'in_progress' THEN
    RAISE EXCEPTION 'complete_scheduled_bootstrap_failed:%:%',v_advanced,v_round_id;
  END IF;
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_round_id;
  IF (v_state->'turnOrder'->>0)::uuid<>v_player_one
     OR (v_state->'turnOrder'->>1)::uuid<>v_player_two
     OR (v_state->>'currentTurnPlayerId')::uuid<>v_player_one THEN
    RAISE EXCEPTION 'clockwise_turn_order_not_canonical:%',v_state->'turnOrder';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_replay:=public.start_yahtzee_round(v_game_id,NULL);
  IF v_replay->>'outcome'<>'already_started' OR (v_replay->>'round_id')::uuid<>v_round_id THEN
    RAISE EXCEPTION 'bootstrap_replay_failed:%',v_replay;
  END IF;
  PERFORM set_config('app.yahtzee_authoritative_write','',true);
  BEGIN
    UPDATE public.rounds SET yahtzee_state=jsonb_set(yahtzee_state,'{gamePhase}',to_jsonb('complete'::text),true)
     WHERE id=v_round_id;
    RAISE EXCEPTION 'direct_round_write_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_round_write_was_allowed' THEN RAISE; END IF;
  END;

  v_result:=public.yahtzee_apply_action(v_round_id,v_player_one,'roll',NULL,NULL,NULL,0);
  IF v_result->>'outcome'<>'applied' OR (v_result->>'action_sequence')::integer<>1
     OR jsonb_array_length(v_result->'state'->'playerStates'->v_player_one::text->'dice')<>5
     OR EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_result->'state'->'playerStates'->v_player_one::text->'dice') die
        WHERE (die->>'value')::integer NOT BETWEEN 1 AND 6
     ) THEN
    RAISE EXCEPTION 'authoritative_roll_failed:%',v_result;
  END IF;
  v_before:=v_result->'state';
  v_replay:=public.yahtzee_apply_action(v_round_id,v_player_one,'roll',NULL,NULL,NULL,0);
  IF v_replay->>'outcome'<>'stale_action' OR v_replay->'state' IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'duplicate_action_replay_changed_state:%',v_replay;
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_outsider,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.yahtzee_apply_action(v_round_id,v_player_one,'hold',0,NULL,NULL,1);
    RAISE EXCEPTION 'outsider_action_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_action_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_result:=public.yahtzee_apply_action(v_round_id,v_player_one,'hold',0,NULL,NULL,1);
  IF v_result->>'outcome'<>'applied' OR (v_result->>'action_sequence')::integer<>2 THEN
    RAISE EXCEPTION 'authoritative_hold_failed:%',v_result;
  END IF;
  v_result:=public.yahtzee_apply_action(v_round_id,v_player_one,'score',NULL,'chance',NULL,2);
  IF v_result->>'outcome'<>'applied' OR v_result->>'terminal'<>'false'
     OR (v_result->'state'->>'currentTurnPlayerId')::uuid<>v_player_two
     OR NOT (v_result->'state'->'playerStates'->v_player_one::text->'scorecard'->'scores' ? 'chance') THEN
    RAISE EXCEPTION 'atomic_score_turn_handoff_failed:%',v_result;
  END IF;

  -- Build an exact tie terminal state under the trusted proof scope, then prove
  -- the accepted settlement and exact-predecessor bootstrap contract.
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_round_id;
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_one::text,'scorecard','scores'],v_scores_tie,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_two::text,'scorecard','scores'],v_scores_tie,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_one::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_two::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,'{currentTurnPlayerId}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{gamePhase}',to_jsonb('complete'::text),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET yahtzee_state=v_state WHERE id=v_round_id;
  v_result:=public.yahtzee_settle_game(v_game_id,v_round_id,v_dealer_game_id,1);
  IF v_result->>'terminal_disposition'<>'tie_rollover'
     OR NOT (SELECT awaiting_next_round FROM public.games WHERE id=v_game_id) THEN
    RAISE EXCEPTION 'tie_settlement_failed:%',v_result;
  END IF;
  v_result:=public.start_yahtzee_round(v_game_id,v_round_id);
  v_tie_round_id:=(v_result->>'round_id')::uuid;
  IF v_result->>'outcome'<>'started' OR (v_result->>'hand_number')::integer<>2 THEN
    RAISE EXCEPTION 'tie_successor_bootstrap_failed:%',v_result;
  END IF;
  v_replay:=public.start_yahtzee_round(v_game_id,v_round_id);
  IF v_replay->>'outcome'<>'already_started' OR (v_replay->>'round_id')::uuid<>v_tie_round_id THEN
    RAISE EXCEPTION 'tie_successor_replay_failed:%',v_replay;
  END IF;

  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_tie_round_id;
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_one::text,'scorecard','scores'],v_scores_high,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_two::text,'scorecard','scores'],v_scores_low,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_one::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_player_two::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,'{currentTurnPlayerId}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{gamePhase}',to_jsonb('complete'::text),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET yahtzee_state=v_state WHERE id=v_tie_round_id;
  v_result:=public.yahtzee_settle_game(v_game_id,v_tie_round_id,v_dealer_game_id,2);
  IF v_result->>'terminal_disposition'<>'game_over'
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'game_over'
     OR (SELECT count(*) FROM public.game_results WHERE game_id=v_game_id AND dealer_game_id=v_dealer_game_id AND hand_number=2 AND settlement_key='yahtzee_terminal')<>1 THEN
    RAISE EXCEPTION 'winner_settlement_failed:%',v_result;
  END IF;

  PERFORM set_config('app.yahtzee_authoritative_write','',true);
  BEGIN
    UPDATE public.games SET current_game_uuid=NULL,current_round=NULL,total_hands=0 WHERE id=v_game_id;
    RAISE EXCEPTION 'direct_postgame_cleanup_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_postgame_cleanup_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_outsider,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.yahtzee_advance_postgame(v_game_id,v_tie_round_id,v_dealer_game_id,2);
    RAISE EXCEPTION 'outsider_postgame_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_postgame_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_result:=public.yahtzee_advance_postgame(v_game_id,v_tie_round_id,v_dealer_game_id,2);
  IF v_result->>'outcome'<>'advanced' OR v_result->>'status'<>'game_selection'
     OR v_result->>'config_deadline' IS NULL
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT current_round FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_game_id)<>0 THEN
    RAISE EXCEPTION 'authoritative_postgame_handoff_failed:%',v_result;
  END IF;
  v_replay:=public.yahtzee_advance_postgame(v_game_id,v_tie_round_id,v_dealer_game_id,2);
  IF v_replay->>'outcome'<>'already_advanced' OR v_replay->>'status'<>'game_selection' THEN
    RAISE EXCEPTION 'postgame_duplicate_replay_failed:%',v_replay;
  END IF;

  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_later_dealer_game_id,v_user_one,'yahtzee',v_game_id,'{}'::jsonb);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='in_progress',game_type='yahtzee',current_game_uuid=v_later_dealer_game_id,current_round=5,total_hands=5
   WHERE id=v_game_id;
  v_before:=(SELECT to_jsonb(game_row) FROM public.games game_row WHERE id=v_game_id);
  v_replay:=public.yahtzee_advance_postgame(v_game_id,v_tie_round_id,v_dealer_game_id,2);
  v_after:=(SELECT to_jsonb(game_row) FROM public.games game_row WHERE id=v_game_id);
  IF v_replay->>'outcome'<>'already_advanced' OR v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'late_postgame_replay_changed_newer_game:%',v_replay;
  END IF;

  -- Direct terminal disposition remains owned by the accepted settlement.
  INSERT INTO public.games(id,name,game_type,status,ante_amount,buy_in,pot,current_round,total_hands,dealer_position,is_first_hand,current_host,pending_session_end)
  VALUES(v_terminal_game_id,'Yahtzee terminal rollback proof','yahtzee','ante_decision',10,100,0,NULL,0,2,true,v_user_one,true);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_terminal_dealer_game_id,v_user_two,'yahtzee',v_terminal_game_id,jsonb_build_object('ante_amount',10));
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET current_game_uuid=v_terminal_dealer_game_id WHERE id=v_terminal_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES
    (v_terminal_player_one,v_user_one,v_terminal_game_id,1,100,false,'active','ante_up'),
    (v_terminal_player_two,v_user_two,v_terminal_game_id,2,100,false,'active','ante_up');
  v_result:=public.start_yahtzee_round(v_terminal_game_id,NULL);
  v_terminal_round_id:=(v_result->>'round_id')::uuid;
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_terminal_round_id;
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_terminal_player_one::text,'scorecard','scores'],v_scores_high,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_terminal_player_two::text,'scorecard','scores'],v_scores_low,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_terminal_player_one::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_terminal_player_two::text,'isComplete'],'true'::jsonb,true);
  v_state:=jsonb_set(v_state,'{currentTurnPlayerId}','null'::jsonb,true);
  v_state:=jsonb_set(v_state,'{gamePhase}',to_jsonb('complete'::text),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET yahtzee_state=v_state WHERE id=v_terminal_round_id;
  v_result:=public.yahtzee_settle_game(v_terminal_game_id,v_terminal_round_id,v_terminal_dealer_game_id,1);
  IF v_result->>'terminal_disposition'<>'session_ended'
     OR (SELECT status FROM public.games WHERE id=v_terminal_game_id)<>'session_ended' THEN
    RAISE EXCEPTION 'terminal_disposition_failed:%',v_result;
  END IF;
  v_replay:=public.yahtzee_settle_game(v_terminal_game_id,v_terminal_round_id,v_terminal_dealer_game_id,1);
  IF v_replay->>'status'<>'already_settled' OR v_replay->>'terminal_disposition'<>'session_ended' THEN
    RAISE EXCEPTION 'terminal_settlement_replay_failed:%',v_replay;
  END IF;

  -- The complete recovery owner also advances an expired bot turn without a browser.
  INSERT INTO public.games(id,name,game_type,status,ante_amount,buy_in,pot,current_round,total_hands,dealer_position,is_first_hand,current_host)
  VALUES(v_bot_game_id,'Yahtzee bot recovery proof','yahtzee','ante_decision',10,100,0,NULL,0,1,true,v_user_one);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_bot_dealer_game_id,v_user_one,'yahtzee',v_bot_game_id,jsonb_build_object('ante_amount',10));
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET current_game_uuid=v_bot_dealer_game_id WHERE id=v_bot_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES
    (v_bot_human,v_user_one,v_bot_game_id,1,100,false,'active','ante_up'),
    (v_bot_player,v_user_two,v_bot_game_id,2,100,true,'active','ante_up');
  v_result:=public.start_yahtzee_round(v_bot_game_id,NULL);
  v_bot_round_id:=(v_result->>'round_id')::uuid;
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_bot_round_id;
  v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(clock_timestamp()-interval '1 second'),true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=clock_timestamp()-interval '1 second' WHERE id=v_bot_round_id;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_advanced:=private.advance_due_yahtzee_state();
  SELECT yahtzee_state INTO v_state FROM public.rounds WHERE id=v_bot_round_id;
  IF v_advanced<1 OR coalesce((v_state->>'actionSequence')::integer,0)<1
     OR (v_state->'playerStates'->v_bot_player::text->>'rollsRemaining')::integer<>2 THEN
    RAISE EXCEPTION 'complete_scheduled_bot_recovery_failed:%:%',v_advanced,v_state;
  END IF;
END;
$proof$;
