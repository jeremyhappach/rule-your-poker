-- Run in the same transaction immediately after the Gin authority migration.
-- The caller owns BEGIN/ROLLBACK so this proof cannot retain synthetic data.
DO $proof$
DECLARE
  v_game_id uuid:=gen_random_uuid();
  v_dealer_game_id uuid:=gen_random_uuid();
  v_later_dealer_game_id uuid:=gen_random_uuid();
  v_user_one uuid;
  v_user_two uuid;
  v_outsider uuid:=gen_random_uuid();
  v_player_one uuid:=gen_random_uuid();
  v_player_two uuid:=gen_random_uuid();
  v_round_one uuid;
  v_round_two uuid;
  v_round_three uuid;
  v_state jsonb;
  v_public jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_actor uuid;
  v_knocker uuid;
  v_other_player uuid;
  v_layoff_actor uuid;
  v_card jsonb;
  v_meld_index integer;
  v_count bigint;
  v_scheduler_result jsonb;
  v_dealer_positions integer[];
  v_dealer_index integer;
  v_expected_dealer integer;
  v_stock_card jsonb;
  v_actor_version_before bigint;
  v_actor_version_after bigint;
  v_other_version_before bigint;
  v_other_version_after bigint;
BEGIN
  SELECT ids[1],ids[2] INTO v_user_one,v_user_two FROM (
    SELECT array_agg(id ORDER BY id::text) ids FROM (
      SELECT profile.id FROM public.profiles profile JOIN auth.users account ON account.id=profile.id
       ORDER BY profile.id::text LIMIT 2
    ) selected
  ) users;
  IF v_user_one IS NULL OR v_user_two IS NULL OR v_user_one=v_user_two THEN RAISE EXCEPTION 'proof_requires_two_profiles'; END IF;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(
    id,name,game_type,status,ante_amount,buy_in,pot,current_round,total_hands,
    points_to_win,is_first_hand,current_host,dealer_position
  ) VALUES(v_game_id,'Gin authority rollback proof','gin-rummy','ante_decision',1,1000,0,NULL,0,100,true,v_user_one,1);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_dealer_game_id,v_user_one,'gin-rummy',v_game_id,
    jsonb_build_object('points_to_win',100,'per_point_value',1,'gin_bonus',37,'undercut_bonus',41));
  UPDATE public.games SET current_game_uuid=v_dealer_game_id WHERE id=v_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES
    (v_player_one,v_user_one,v_game_id,1,1000,false,'active','ante_up'),
    (v_player_two,v_user_two,v_game_id,2,1000,false,'active',NULL);
  UPDATE public.system_settings SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','true'::jsonb,true)
   WHERE key='harnesses_mode';
  UPDATE public.game_defaults SET debug_harness='non_dealer_near_knock' WHERE game_type='gin-rummy';

  -- Outsiders cannot bootstrap, and incomplete ante admission cannot publish a partial hand.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_outsider,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.start_gin_rummy_initial_hand(v_game_id);
    RAISE EXCEPTION 'outsider_bootstrap_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_bootstrap_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_result:=public.start_gin_rummy_initial_hand(v_game_id);
  IF v_result->>'outcome'<>'rejected' OR v_result->>'reason'<>'waiting_for_antes'
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'ante_decision'
     OR EXISTS(SELECT 1 FROM public.rounds WHERE game_id=v_game_id) THEN
    RAISE EXCEPTION 'incomplete_ante_bootstrap_changed_state:%',v_result;
  END IF;
  UPDATE public.players SET ante_decision='ante_up' WHERE id=v_player_two;

  -- Bootstrap commits status, exact H1, hidden state, and the initiator result atomically.
  v_result:=public.start_gin_rummy_initial_hand(v_game_id);
  v_round_one:=(v_result->>'round_id')::uuid;
  IF v_result->>'outcome'<>'started' OR v_round_one IS NULL
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'in_progress'
     OR (SELECT total_hands FROM public.games WHERE id=v_game_id)<>1
     OR v_result->'state'->'playerStates'->v_player_one::text->'hand'->0->>'rank'='?' THEN
    RAISE EXCEPTION 'atomic_bootstrap_failed:%',v_result;
  END IF;
  v_replay:=public.start_gin_rummy_initial_hand(v_game_id);
  IF v_replay->>'outcome'<>'already_started' OR (v_replay->>'round_id')::uuid<>v_round_one THEN
    RAISE EXCEPTION 'bootstrap_replay_failed:%',v_replay;
  END IF;
  SELECT gin_rummy_state INTO v_public FROM public.rounds WHERE id=v_round_one;
  IF v_public->'playerStates'->v_player_one::text->'hand'->0->>'rank'<>'?'
     OR v_public->'playerStates'->v_player_two::text->'hand'->0->>'rank'<>'?'
     OR v_public->'stockPile'->0->>'rank'<>'?' THEN RAISE EXCEPTION 'public_projection_leaked_hidden_cards'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_two,'role','authenticated')::text,true);
  v_state:=public.gin_rummy_get_state(v_round_one);
  IF v_state->'playerStates'->v_player_two::text->'hand'->0->>'rank'='?'
     OR v_state->'playerStates'->v_player_one::text->'hand'->0->>'rank'<>'?' THEN
    RAISE EXCEPTION 'peer_projection_incorrect';
  END IF;

  -- A stock draw remains masked in the Realtime/public and peer projections,
  -- while the initiating caller receives the exact committed card. Public
  -- discard draws remain visible because their source card was already public.
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  v_stock_card:=v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
  v_state:=jsonb_set(v_state,'{lastAction}',jsonb_build_object(
    'type','draw_stock','playerId',v_player_one,'card',v_stock_card,'timestamp','projection-proof'
  ),true);
  v_public:=private.gin_public_state(v_state);
  IF v_public #>> '{lastAction,card,rank}'<>'?' THEN
    RAISE EXCEPTION 'public_stock_draw_projection_leaked_card:%',v_public->'lastAction';
  END IF;
  v_result:=private.gin_project_state(v_state,v_game_id,v_user_one);
  IF v_result #> '{lastAction,card}' IS DISTINCT FROM v_stock_card THEN
    RAISE EXCEPTION 'stock_draw_actor_projection_missing_card:%',v_result->'lastAction';
  END IF;
  v_result:=private.gin_project_state(v_state,v_game_id,v_user_two);
  IF v_result #>> '{lastAction,card,rank}'<>'?' THEN
    RAISE EXCEPTION 'stock_draw_peer_projection_leaked_card:%',v_result->'lastAction';
  END IF;
  v_state:=jsonb_set(v_state,'{lastAction}',jsonb_build_object(
    'type','draw_discard','playerId',v_player_one,'card',v_stock_card,'timestamp','projection-proof'
  ),true);
  v_public:=private.gin_public_state(v_state);
  IF v_public #> '{lastAction,card}' IS DISTINCT FROM v_stock_card THEN
    RAISE EXCEPTION 'public_discard_draw_projection_masked_visible_card:%',v_public->'lastAction';
  END IF;

  -- Direct public state authority is rejected.
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  BEGIN
    UPDATE public.rounds SET pot=999 WHERE id=v_round_one;
    RAISE EXCEPTION 'direct_round_mutation_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_round_mutation_was_allowed' OR SQLERRM NOT LIKE '%gin_rummy_round_mutation:rpc_required%' THEN RAISE; END IF;
  END;

  -- H1: a legal normal knock, invalid layoff rejection, valid layoffs, and score.
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  v_knocker:=(v_state->>'nonDealerPlayerId')::uuid;
  v_other_player:=CASE WHEN v_knocker=v_player_one THEN v_player_two ELSE v_player_one END;
  v_count:=(v_state->>'actionCount')::bigint;
  SELECT source_version INTO v_actor_version_before
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_knocker;
  SELECT source_version INTO v_other_version_before
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_other_player;
  PERFORM private.gin_publish_state(v_round_one,v_state);
  SELECT source_version INTO v_actor_version_after
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_knocker;
  SELECT source_version INTO v_other_version_after
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_other_player;
  IF v_actor_version_after IS DISTINCT FROM v_actor_version_before
     OR v_other_version_after IS DISTINCT FROM v_other_version_before THEN
    RAISE EXCEPTION 'unchanged_hand_mirror_rewritten:%/%',v_actor_version_after,v_other_version_after;
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN v_knocker=v_player_one THEN v_user_one ELSE v_user_two END,'role','authenticated')::text,true);
  v_result:=public.gin_rummy_apply_action(v_round_one,v_knocker,'take_first_draw',NULL,NULL,v_count);
  SELECT source_version INTO v_actor_version_after
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_knocker;
  SELECT source_version INTO v_other_version_after
    FROM public.player_cards WHERE round_id=v_round_one AND player_id=v_other_player;
  IF v_actor_version_after<=v_actor_version_before
     OR v_other_version_after IS DISTINCT FROM v_other_version_before THEN
    RAISE EXCEPTION 'changed_hand_mirror_version_wrong:%/%',v_actor_version_after,v_other_version_after;
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_knocker::text->'hand') card(value)
   WHERE value->>'rank'='K' AND value->>'suit'=chr(9829) LIMIT 1;
  v_result:=public.gin_rummy_apply_action(v_round_one,v_knocker,'knock',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  v_layoff_actor:=(v_state->>'currentTurnPlayerId')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN v_layoff_actor=v_player_one THEN v_user_one ELSE v_user_two END,'role','authenticated')::text,true);
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_layoff_actor::text->'hand') LIMIT 1;
  BEGIN
    PERFORM public.gin_rummy_apply_action(v_round_one,v_layoff_actor,'lay_off',v_card,99,(v_state->>'actionCount')::bigint);
    RAISE EXCEPTION 'invalid_layoff_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='invalid_layoff_was_allowed' OR SQLERRM NOT LIKE '%gin_rummy_apply_action:invalid_layoff%' THEN RAISE; END IF;
  END;
  LOOP
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) LIMIT 1;
    SELECT card.value,(meld.ordinality-1)::integer INTO v_card,v_meld_index
      FROM jsonb_array_elements(v_state->'playerStates'->v_layoff_actor::text->'hand') card(value)
      CROSS JOIN LATERAL jsonb_array_elements(v_state->'playerStates'->v_knocker::text->'melds') WITH ORDINALITY meld(value,ordinality)
     WHERE private.gin_can_lay_off(card.value,meld.value) LIMIT 1;
    EXIT WHEN v_card IS NULL;
    PERFORM public.gin_rummy_apply_action(v_round_one,v_layoff_actor,'lay_off',v_card,v_meld_index,(v_state->>'actionCount')::bigint);
    v_card:=NULL;
  END LOOP;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  v_result:=public.gin_rummy_apply_action(v_round_one,v_layoff_actor,'finish_lay_off',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_one;
  IF v_state->>'phase'<>'complete' OR v_state->>'winnerPlayerId' IS NOT NULL
     OR (SELECT count(*) FROM public.game_results WHERE dealer_game_id=v_dealer_game_id AND hand_number=1 AND settlement_key='gin_rummy_hand_history')<>1
     OR (SELECT pot_won FROM public.game_results WHERE dealer_game_id=v_dealer_game_id AND hand_number=1 AND settlement_key='gin_rummy_hand_history')<>0 THEN
    RAISE EXCEPTION 'ordinary_hand_resolution_failed:%',v_state;
  END IF;

  -- Exact predecessor continuation is duplicate-safe; late H1 actions cannot alter H2.
  v_result:=public.gin_rummy_start_next_hand(v_round_one);
  v_round_two:=(v_result->>'round_id')::uuid;
  v_replay:=public.gin_rummy_start_next_hand(v_round_one);
  IF v_result->>'outcome'<>'started' OR v_replay->>'outcome'<>'already_started'
     OR (v_replay->>'round_id')::uuid<>v_round_two THEN RAISE EXCEPTION 'successor_replay_failed:%/%',v_result,v_replay; END IF;
  v_replay:=public.gin_rummy_apply_action(v_round_one,v_layoff_actor,'finish_lay_off',NULL,NULL,(v_state->>'actionCount')::bigint);
  IF v_replay->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'late_action_replay_not_stale:%',v_replay; END IF;

  -- H2: void/tie continuation. The complete installed cron statement, not a helper,
  -- must create H3 without a PostgreSQL statement-level abort.
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_two;
  v_actor:=(v_state->>'nonDealerPlayerId')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN v_actor=v_player_one THEN v_user_one ELSE v_user_two END,'role','authenticated')::text,true);
  PERFORM public.gin_rummy_apply_action(v_round_two,v_actor,'take_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_two;
  v_state:=jsonb_set(v_state,'{stockPile}',jsonb_build_array(v_state->'stockPile'->0,v_state->'stockPile'->1),true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM private.gin_publish_state(v_round_two,v_state);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_actor::text->'hand') card(value)
   WHERE private.gin_card_key(value)<>private.gin_card_key(v_state->'lastAction'->'card') LIMIT 1;
  PERFORM public.gin_rummy_apply_action(v_round_two,v_actor,'discard',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_two;
  IF v_state->>'phase'<>'complete' OR v_state->'knockResult'<>'null'::jsonb OR v_state->>'winnerPlayerId' IS NOT NULL THEN
    RAISE EXCEPTION 'void_hand_not_terminal_tie:%',v_state;
  END IF;
  UPDATE public.game_defaults SET debug_harness='near_gin' WHERE game_type='gin-rummy';
  v_state:=jsonb_set(v_state,'{completeDueAt}',to_jsonb(to_char(clock_timestamp()-interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM private.gin_publish_state(v_round_two,v_state);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_scheduler_result:=private.run_due_game_recovery_task('gin_rummy');
  SELECT id INTO v_round_three FROM public.rounds WHERE dealer_game_id=v_dealer_game_id AND hand_number=3 AND round_number=1;
  IF v_scheduler_result->>'outcome'<>'completed' OR v_round_three IS NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_game_id)<>3 THEN
    RAISE EXCEPTION 'complete_scheduler_continuation_failed:%/%',v_scheduler_result,v_round_three;
  END IF;

  -- H3: near-gin scores the configured 37-point bonus, then cron settles exactly once.
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_three;
  v_state:=jsonb_set(v_state,ARRAY['matchScores',v_player_one::text],'99'::jsonb,true);
  PERFORM private.gin_publish_state(v_round_three,v_state);
  v_actor:=(v_state->>'nonDealerPlayerId')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN v_actor=v_player_one THEN v_user_one ELSE v_user_two END,'role','authenticated')::text,true);
  PERFORM public.gin_rummy_apply_action(v_round_three,v_actor,'pass_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_three;
  v_actor:=(v_state->>'currentTurnPlayerId')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN v_actor=v_player_one THEN v_user_one ELSE v_user_two END,'role','authenticated')::text,true);
  PERFORM public.gin_rummy_apply_action(v_round_three,v_actor,'take_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_three;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_actor::text->'hand') card(value)
   WHERE value->>'rank'='K' AND value->>'suit'=chr(9827) LIMIT 1;
  PERFORM public.gin_rummy_apply_action(v_round_three,v_actor,'knock',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_three;
  IF v_state->>'phase'<>'scoring' THEN RAISE EXCEPTION 'near_gin_did_not_enter_scoring:%',v_state; END IF;
  v_state:=jsonb_set(v_state,'{scoringDueAt}',to_jsonb(to_char(clock_timestamp()-interval '1 second','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM private.gin_publish_state(v_round_three,v_state);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_scheduler_result:=private.run_due_game_recovery_task('gin_rummy');
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=v_round_three;
  IF v_scheduler_result->>'outcome'<>'completed' OR v_state->>'phase'<>'complete'
     OR (v_state->'knockResult'->>'pointsAwarded')::integer<>53
     OR (v_state->>'winnerPlayerId')::uuid<>v_player_one
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'game_over'
     OR (SELECT count(*) FROM public.game_results WHERE dealer_game_id=v_dealer_game_id AND hand_number=3 AND settlement_key='gin_rummy_terminal')<>1
     OR (SELECT pot_won FROM public.game_results WHERE dealer_game_id=v_dealer_game_id AND hand_number=3 AND settlement_key='gin_rummy_hand_history')<>0 THEN
    RAISE EXCEPTION 'terminal_scheduler_settlement_failed:%/%',v_scheduler_result,v_state;
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_replay:=public.gin_rummy_settle_game(v_game_id,v_round_three,v_dealer_game_id,3);
  IF v_replay->>'status'<>'already_settled' THEN RAISE EXCEPTION 'settlement_replay_failed:%',v_replay; END IF;

  -- Browser cleanup is protected; postgame exact identity owns continuation.
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  BEGIN
    UPDATE public.games SET total_hands=0,current_round=NULL WHERE id=v_game_id;
    RAISE EXCEPTION 'direct_postgame_cleanup_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_postgame_cleanup_was_allowed' OR SQLERRM NOT LIKE '%gin_rummy_game_authority_mutation:rpc_required%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_outsider,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.gin_rummy_advance_postgame(v_game_id,v_round_three,v_dealer_game_id,3);
    RAISE EXCEPTION 'outsider_postgame_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_postgame_was_allowed' OR SQLERRM NOT LIKE '%gin_rummy_advance_postgame:not_in_session%' THEN RAISE; END IF;
  END;
  UPDATE public.system_settings SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false'::jsonb,true) WHERE key='make_it_take_it';
  SELECT array_agg(position ORDER BY position) INTO v_dealer_positions FROM public.players
   WHERE game_id=v_game_id AND NOT sitting_out AND status NOT IN ('observer','left') AND NOT is_bot;
  v_dealer_index:=array_position(v_dealer_positions,(SELECT dealer_position FROM public.games WHERE id=v_game_id));
  v_expected_dealer:=CASE WHEN v_dealer_index IS NULL THEN v_dealer_positions[1]
    ELSE v_dealer_positions[(v_dealer_index%cardinality(v_dealer_positions))+1] END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_result:=public.gin_rummy_advance_postgame(v_game_id,v_round_three,v_dealer_game_id,3);
  IF v_result->>'outcome'<>'advanced' OR v_result->>'status'<>'game_selection'
     OR (v_result->>'dealer_position')::integer<>v_expected_dealer
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT current_round FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_game_id)<>0 THEN
    RAISE EXCEPTION 'authoritative_postgame_failed:%',v_result;
  END IF;
  SELECT to_jsonb(g) INTO v_before FROM public.games g WHERE id=v_game_id;
  v_replay:=public.gin_rummy_advance_postgame(v_game_id,v_round_three,v_dealer_game_id,3);
  SELECT to_jsonb(g) INTO v_after FROM public.games g WHERE id=v_game_id;
  IF v_replay->>'outcome'<>'already_advanced' OR v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'postgame_duplicate_changed_state:%',v_replay;
  END IF;

  -- A late replay returns the durable claim and cannot clear a newer dealer game.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_later_dealer_game_id,v_user_two,'gin-rummy',v_game_id,jsonb_build_object('points_to_win',100,'per_point_value',1,'gin_bonus',37,'undercut_bonus',41));
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  UPDATE public.games SET status='in_progress',current_game_uuid=v_later_dealer_game_id,current_round=1,total_hands=1 WHERE id=v_game_id;
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  SELECT to_jsonb(g) INTO v_before FROM public.games g WHERE id=v_game_id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user_one,'role','authenticated')::text,true);
  v_replay:=public.gin_rummy_advance_postgame(v_game_id,v_round_three,v_dealer_game_id,3);
  SELECT to_jsonb(g) INTO v_after FROM public.games g WHERE id=v_game_id;
  IF v_replay->>'outcome'<>'already_advanced' OR v_after IS DISTINCT FROM v_before
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_game_id)<>v_later_dealer_game_id THEN
    RAISE EXCEPTION 'late_postgame_replay_mutated_new_game:%',v_replay;
  END IF;
END;
$proof$;
