-- Execute inside BEGIN after the candidate migration and always ROLLBACK.
-- Every game, player, dealer-game, round, and fixture mutation is synthetic.

DO $proof$
DECLARE
  v_admin uuid;
  v_non_admin uuid;
  v_normal_game uuid := gen_random_uuid();
  v_gin_game uuid := gen_random_uuid();
  v_undercut_game uuid := gen_random_uuid();
  v_void_game uuid := gen_random_uuid();
  v_other_game uuid := gen_random_uuid();
  v_real_game uuid := gen_random_uuid();
  v_terminal_game uuid := gen_random_uuid();
  v_normal_dg uuid := gen_random_uuid();
  v_gin_dg uuid := gen_random_uuid();
  v_undercut_dg uuid := gen_random_uuid();
  v_void_dg uuid := gen_random_uuid();
  v_normal_p1 uuid := gen_random_uuid();
  v_normal_p2 uuid := gen_random_uuid();
  v_gin_p1 uuid := gen_random_uuid();
  v_gin_p2 uuid := gen_random_uuid();
  v_undercut_p1 uuid := gen_random_uuid();
  v_undercut_p2 uuid := gen_random_uuid();
  v_void_p1 uuid := gen_random_uuid();
  v_void_p2 uuid := gen_random_uuid();
  v_round uuid;
  v_state jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_card jsonb;
  v_meld_index integer;
  v_count bigint;
  v_original_harnesses_mode jsonb;
  v_original_global_profile text;
BEGIN
  SELECT role_row.user_id
    INTO v_admin
    FROM public.user_roles role_row
    JOIN auth.users account ON account.id = role_row.user_id
   WHERE role_row.role::text = 'admin'
   ORDER BY account.created_at
   LIMIT 1;
  SELECT account.id
    INTO v_non_admin
    FROM auth.users account
   WHERE account.id <> v_admin
     AND NOT public.has_role(account.id, 'admin')
   ORDER BY account.created_at
   LIMIT 1;
  IF v_admin IS NULL OR v_non_admin IS NULL THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:missing_admin_or_non_admin';
  END IF;

  SELECT setting.value INTO v_original_harnesses_mode
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode';
  SELECT defaults.debug_harness INTO v_original_global_profile
    FROM public.game_defaults defaults WHERE defaults.game_type = 'gin-rummy';

  INSERT INTO public.games (
    id, name, game_type, status, real_money, ante_amount, buy_in, pot,
    current_round, total_hands, points_to_win, is_first_hand, current_host,
    dealer_position
  ) VALUES
    (v_normal_game, 'Gin fixture normal proof', 'gin-rummy', 'waiting', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_gin_game, 'Gin fixture gin proof', 'gin-rummy', 'waiting', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_undercut_game, 'Gin fixture undercut proof', 'gin-rummy', 'waiting', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_void_game, 'Gin fixture void proof', 'gin-rummy', 'waiting', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_other_game, 'Gin fixture isolation proof', 'gin-rummy', 'waiting', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_real_game, 'Gin fixture real proof', 'gin-rummy', 'waiting', true, 1, 100, 0, NULL, 0, 50, true, v_admin, 1),
    (v_terminal_game, 'Gin fixture terminal proof', 'gin-rummy', 'session_ended', false, 1, 100, 0, NULL, 0, 50, true, v_admin, 1);

  INSERT INTO public.players (
    id, game_id, user_id, position, chips, is_bot, status, ante_decision
  ) VALUES
    (v_normal_p1, v_normal_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (v_normal_p2, v_normal_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (v_gin_p1, v_gin_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (v_gin_p2, v_gin_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (v_undercut_p1, v_undercut_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (v_undercut_p2, v_undercut_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (v_void_p1, v_void_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (v_void_p2, v_void_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_other_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_other_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_real_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_real_game, v_non_admin, 2, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_terminal_game, v_admin, 1, 100, false, 'active', 'ante_up'),
    (gen_random_uuid(), v_terminal_game, v_non_admin, 2, 100, false, 'active', 'ante_up');

  INSERT INTO public.dealer_games (id, dealer_user_id, game_type, session_id, config)
  VALUES
    (v_normal_dg, v_admin, 'gin-rummy', v_normal_game, jsonb_build_object('points_to_win',50,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25)),
    (v_gin_dg, v_admin, 'gin-rummy', v_gin_game, jsonb_build_object('points_to_win',50,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25)),
    (v_undercut_dg, v_admin, 'gin-rummy', v_undercut_game, jsonb_build_object('points_to_win',50,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25)),
    (v_void_dg, v_admin, 'gin-rummy', v_void_game, jsonb_build_object('points_to_win',50,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25));

  -- Authorization, real-money, terminal, and invalid-profile boundaries.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_non_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_gin_rule_branch_harness(v_normal_game, 'normal_knock_layoff', 600);
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:non_admin_arm_allowed:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  IF public.arm_gin_rule_branch_harness(v_real_game, 'gin', 600)->>'outcome' <> 'real_money_forbidden' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:real_money_arm_allowed';
  END IF;
  IF public.arm_gin_rule_branch_harness(v_terminal_game, 'gin', 600)->>'outcome' <> 'wrong_status' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:terminal_arm_allowed';
  END IF;
  IF public.arm_gin_rule_branch_harness(v_normal_game, 'unknown', 600)->>'outcome' <> 'invalid_profile' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:invalid_profile_allowed';
  END IF;

  -- Exact-game isolation and all four profiles.
  IF public.arm_gin_rule_branch_harness(v_normal_game, 'normal_knock_layoff', 600)->>'outcome' <> 'armed'
     OR public.arm_gin_rule_branch_harness(v_gin_game, 'gin', 600)->>'outcome' <> 'armed'
     OR public.arm_gin_rule_branch_harness(v_undercut_game, 'undercut', 600)->>'outcome' <> 'armed'
     OR public.arm_gin_rule_branch_harness(v_void_game, 'stock_two_void', 600)->>'outcome' <> 'armed' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:profile_arm_failed';
  END IF;
  IF private.consume_gin_rule_branch_harness(v_other_game) IS NOT NULL THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:wrong_game_consumed';
  END IF;
  IF NOT coalesce((public.get_gin_rule_branch_harness(v_normal_game)->>'armed')::boolean, false) THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:isolation_disarmed_request';
  END IF;

  UPDATE public.games
     SET status = 'ante_decision',
         current_game_uuid = CASE id
           WHEN v_normal_game THEN v_normal_dg
           WHEN v_gin_game THEN v_gin_dg
           WHEN v_undercut_game THEN v_undercut_dg
           WHEN v_void_game THEN v_void_dg
         END
   WHERE id IN (v_normal_game, v_gin_game, v_undercut_game, v_void_game);

  -- Normal knock: take the upcard, knock with one deadwood, lay off all three
  -- legal cards, and prove exact terminal scoring.
  v_result := public.start_gin_rummy_initial_hand(v_normal_game);
  v_round := (v_result->>'round_id')::uuid;
  IF v_result->>'outcome' <> 'started' OR v_round IS NULL THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:normal_start_failed:%', v_result;
  END IF;
  v_replay := public.start_gin_rummy_initial_hand(v_normal_game);
  IF v_replay->>'outcome' <> 'already_started' OR (v_replay->>'round_id')::uuid <> v_round THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:start_replay_changed_state:%', v_replay;
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF v_state->>'nonDealerPlayerId' <> v_normal_p2::text
     OR v_state#>>ARRAY['playerStates',v_normal_p2::text,'hand','0','rank'] <> '3'
     OR jsonb_array_length(v_state->'stockPile') <> 31 THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:normal_seed_wrong:%', v_state;
  END IF;
  v_count := (v_state->>'actionCount')::bigint;
  PERFORM private.gin_apply_action_core(v_round,v_normal_p2,'take_first_draw',NULL,NULL,v_count);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_normal_p2::text->'hand')
   WHERE value->>'rank'='K' AND value->>'suit'=chr(9829) LIMIT 1;
  PERFORM private.gin_apply_action_core(v_round,v_normal_p2,'knock',v_card,NULL,(v_state->>'actionCount')::bigint);
  FOR v_card IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    private.gin_card('2',chr(9830)), private.gin_card('A',chr(9827)), private.gin_card('9',chr(9827))
  )) LOOP
    SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
    SELECT meld.ordinality::integer - 1 INTO v_meld_index
      FROM jsonb_array_elements(v_state->'playerStates'->v_normal_p2::text->'melds') WITH ORDINALITY meld(value,ordinality)
     WHERE private.gin_can_lay_off(v_card,meld.value) LIMIT 1;
    IF v_meld_index IS NULL THEN RAISE EXCEPTION 'gin_rule_fixture_proof:missing_normal_layoff:%',v_card; END IF;
    PERFORM private.gin_apply_action_core(v_round,v_normal_p1,'lay_off',v_card,v_meld_index,(v_state->>'actionCount')::bigint);
  END LOOP;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_normal_p1,'finish_lay_off',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF v_state->>'phase' <> 'complete'
     OR v_state#>>'{knockResult,knockerDeadwood}' <> '1'
     OR v_state#>>'{knockResult,opponentDeadwood}' <> '61'
     OR v_state#>>'{knockResult,pointsAwarded}' <> '60'
     OR (v_state#>>'{knockResult,isGin}')::boolean
     OR (v_state#>>'{knockResult,isUndercut}')::boolean
     OR v_state->>'winnerPlayerId' <> v_normal_p2::text THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:normal_terminal_wrong:%',v_state;
  END IF;
  IF coalesce((public.get_gin_rule_branch_harness(v_normal_game)->>'armed')::boolean, false)
     OR public.get_gin_rule_branch_harness(v_normal_game)->>'consumedAt' IS NULL THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:normal_not_consumed_once';
  END IF;
  IF public.arm_gin_rule_branch_harness(v_normal_game, 'normal_knock_layoff', 600)->>'outcome' <> 'wrong_status' THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:late_rearm_allowed';
  END IF;

  -- Gin: an unresolved host pointer falls back to the earliest human and
  -- still produces the exact terminal score.
  UPDATE public.games SET current_host = NULL WHERE id = v_gin_game;
  v_result := public.start_gin_rummy_initial_hand(v_gin_game);
  v_round := (v_result->>'round_id')::uuid;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_gin_p2,'pass_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_gin_p1,'take_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_gin_p1::text->'hand')
   WHERE value->>'rank'='K' AND value->>'suit'=chr(9827) LIMIT 1;
  PERFORM private.gin_apply_action_core(v_round,v_gin_p1,'knock',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_gin_p1,'finalize_scoring',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF v_state#>>'{knockResult,knockerDeadwood}' <> '0'
     OR v_state#>>'{knockResult,opponentDeadwood}' <> '71'
     OR v_state#>>'{knockResult,pointsAwarded}' <> '96'
     OR NOT (v_state#>>'{knockResult,isGin}')::boolean
     OR v_state->>'winnerPlayerId' <> v_gin_p1::text THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:gin_terminal_wrong:%',v_state;
  END IF;

  -- Undercut: a legal layoff reduces the opponent to zero deadwood. The
  -- nonterminal score starts exactly one ordinary successor hand.
  v_result := public.start_gin_rummy_initial_hand(v_undercut_game);
  v_round := (v_result->>'round_id')::uuid;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_undercut_p2,'take_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_undercut_p2::text->'hand')
   WHERE value->>'rank'='A' AND value->>'suit'=chr(9824) LIMIT 1;
  PERFORM private.gin_apply_action_core(v_round,v_undercut_p2,'knock',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  v_card := private.gin_card('2',chr(9830));
  SELECT meld.ordinality::integer - 1 INTO v_meld_index
    FROM jsonb_array_elements(v_state->'playerStates'->v_undercut_p2::text->'melds') WITH ORDINALITY meld(value,ordinality)
   WHERE private.gin_can_lay_off(v_card,meld.value) LIMIT 1;
  PERFORM private.gin_apply_action_core(v_round,v_undercut_p1,'lay_off',v_card,v_meld_index,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_undercut_p1,'finish_lay_off',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF v_state#>>'{knockResult,knockerDeadwood}' <> '10'
     OR v_state#>>'{knockResult,opponentDeadwood}' <> '0'
     OR v_state#>>'{knockResult,pointsAwarded}' <> '35'
     OR NOT (v_state#>>'{knockResult,isUndercut}')::boolean
     OR v_state#>>'{knockResult,winnerId}' <> v_undercut_p1::text
     OR v_state->>'winnerPlayerId' IS NOT NULL THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:undercut_wrong:%',v_state;
  END IF;
  v_result := private.gin_start_next_hand_core(v_round);
  IF v_result->>'outcome' <> 'started' OR (v_result->>'hand_number')::integer <> 2 THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:undercut_continuation_failed:%',v_result;
  END IF;
  IF jsonb_array_length(v_result->'state'->'stockPile') <> 31 THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:fixture_replayed_on_successor:%',v_result->'state';
  END IF;

  -- Stock-two void: both passes leave two cards after the automatic draw; the
  -- ordinary discard voids with zero score and still permits one successor.
  v_result := public.start_gin_rummy_initial_hand(v_void_game);
  v_round := (v_result->>'round_id')::uuid;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF jsonb_array_length(v_state->'stockPile') <> 3
     OR jsonb_array_length(v_state->'discardPile') <> 29 THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:void_seed_wrong:%',v_state;
  END IF;
  PERFORM private.gin_apply_action_core(v_round,v_void_p2,'pass_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  PERFORM private.gin_apply_action_core(v_round,v_void_p1,'pass_first_draw',NULL,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  SELECT value INTO v_card FROM jsonb_array_elements(v_state->'playerStates'->v_void_p2::text->'hand')
   WHERE private.gin_card_key(value) <> private.gin_card_key(v_state->'lastAction'->'card') LIMIT 1;
  PERFORM private.gin_apply_action_core(v_round,v_void_p2,'discard',v_card,NULL,(v_state->>'actionCount')::bigint);
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id = v_round;
  IF v_state->>'phase' <> 'complete'
     OR jsonb_array_length(v_state->'stockPile') <> 2
     OR v_state->'knockResult' <> 'null'::jsonb
     OR v_state->>'winnerPlayerId' IS NOT NULL
     OR EXISTS (SELECT 1 FROM jsonb_each_text(v_state->'matchScores') score WHERE score.value::integer <> 0) THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:void_result_wrong:%',v_state;
  END IF;
  v_result := private.gin_start_next_hand_core(v_round);
  IF v_result->>'outcome' <> 'started' OR (v_result->>'hand_number')::integer <> 2
     OR jsonb_array_length(v_result->'state'->'stockPile') <> 31 THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:void_continuation_failed:%',v_result;
  END IF;

  -- Equal deadwood is the Gin rules' tie boundary: it is an undercut with
  -- exactly the configured bonus rather than a zero-point or shared result.
  v_state := jsonb_build_object(
    'phase','scoring','pointsToWin',50,'actionCount',0,
    'matchScores',jsonb_build_object(v_normal_p1::text,0,v_normal_p2::text,0),
    'playerStates',jsonb_build_object(
      v_normal_p1::text,jsonb_build_object(
        'hand',jsonb_build_array(private.gin_card('K',chr(9824))),
        'hasKnocked',true,'hasGin',false,'laidOffCards','[]'::jsonb
      ),
      v_normal_p2::text,jsonb_build_object(
        'hand',jsonb_build_array(private.gin_card('Q',chr(9829))),
        'hasKnocked',false,'hasGin',false,'laidOffCards','[]'::jsonb
      )
    )
  );
  v_state := private.gin_score_state(v_state,v_normal_dg);
  IF v_state#>>'{knockResult,knockerDeadwood}' <> '10'
     OR v_state#>>'{knockResult,opponentDeadwood}' <> '10'
     OR v_state#>>'{knockResult,pointsAwarded}' <> '25'
     OR NOT (v_state#>>'{knockResult,isUndercut}')::boolean THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:equal_deadwood_boundary_wrong:%',v_state;
  END IF;

  -- The exact fixture never mutates either global harness owner.
  IF (SELECT setting.value FROM public.system_settings setting WHERE setting.key = 'harnesses_mode')
       IS DISTINCT FROM v_original_harnesses_mode THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:global_harness_gate_mutated';
  END IF;
  IF (SELECT defaults.debug_harness FROM public.game_defaults defaults WHERE defaults.game_type = 'gin-rummy')
       IS DISTINCT FROM v_original_global_profile THEN
    RAISE EXCEPTION 'gin_rule_fixture_proof:global_profile_mutated';
  END IF;
END;
$proof$;
