-- Rollback-only proof for the exact-game Yahtzee/Holm/3-5-7 campaign fixture.
-- The caller owns BEGIN/ROLLBACK. All identities and gameplay rows are synthetic.

DO $proof$
DECLARE
  v_admin uuid; v_other uuid;
  v_y_game uuid:=gen_random_uuid(); v_y_dg uuid:=gen_random_uuid(); v_y_round uuid;
  v_h_game uuid:=gen_random_uuid(); v_h_dg uuid:=gen_random_uuid(); v_h_round uuid;
  v_357_game uuid:=gen_random_uuid(); v_357_dg uuid:=gen_random_uuid(); v_357_round uuid; v_357_r2 uuid;
  v_real_game uuid:=gen_random_uuid();
  v_y_p1 uuid; v_y_p2 uuid; v_h_p1 uuid; v_h_p2 uuid; v_357_p1 uuid; v_357_p2 uuid;
  v_result jsonb; v_state jsonb; v_status jsonb; v_cards jsonb;
  v_original_harnesses_mode jsonb; v_original_y_debug text; v_original_h_debug text; v_original_357_debug text;
BEGIN
  IF position('SECURITY DEFINER' IN pg_get_functiondef(
       'public.arm_target_rule_branch_harness(uuid,text,integer)'::regprocedure
     ))>0
     OR position('private.target_rule_branch_' IN pg_get_functiondef(
       'public.arm_target_rule_branch_harness(uuid,text,integer)'::regprocedure
     ))>0 THEN
    RAISE EXCEPTION 'target_fixture_proof:public_arm_crosses_api_role_boundary';
  END IF;
  SELECT id INTO v_admin FROM public.profiles WHERE coalesce(is_superuser,false) ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE id<>v_admin ORDER BY created_at,id LIMIT 1;
  IF v_admin IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'target_fixture_proof:requires_admin_and_peer'; END IF;

  SELECT value INTO v_original_harnesses_mode FROM public.system_settings WHERE key='harnesses_mode';
  SELECT debug_harness INTO v_original_y_debug FROM public.game_defaults WHERE game_type='yahtzee';
  SELECT debug_harness INTO v_original_h_debug FROM public.game_defaults WHERE game_type='holm';
  SELECT debug_harness INTO v_original_357_debug FROM public.game_defaults WHERE game_type='3-5-7';

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_admin)::text,true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);

  INSERT INTO public.games(
    id,name,game_type,status,real_money,current_host,current_game_uuid,dealer_position,
    ante_amount,buy_in,pot,current_round,total_hands,is_first_hand,points_to_win,
    config_complete,legs_to_win,leg_value,rollover_amount,pussy_tax_enabled,pussy_tax_value,
    pot_max_enabled,pot_max_value,reveal_at_showdown,chucky_cards
  ) VALUES
    (v_y_game,'Target fixture Yahtzee','yahtzee','ante_decision',false,v_admin,v_y_dg,2,
      1,100,0,NULL,0,true,50,true,3,1,1,false,0,false,10,true,4),
    (v_h_game,'Target fixture Holm','holm-game','ante_decision',false,v_admin,v_h_dg,2,
      1,100,0,NULL,0,true,50,true,3,1,1,false,0,true,10,true,4),
    (v_357_game,'Target fixture 357','3-5-7','ante_decision',false,v_admin,v_357_dg,1,
      2,100,0,NULL,0,true,50,true,3,1,1,false,0,true,10,true,4),
    (v_real_game,'Target fixture real-money refusal','yahtzee','waiting',true,v_admin,NULL,1,
      1,100,0,NULL,0,true,50,false,3,1,1,false,0,false,10,true,4);

  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
  VALUES
    (v_y_game,v_admin,1,100,'active',false,false,'ante_up'),
    (v_y_game,v_other,2,100,'active',false,false,'ante_up'),
    (v_h_game,v_admin,1,100,'active',false,false,'ante_up'),
    (v_h_game,v_other,2,100,'active',false,false,'ante_up'),
    (v_357_game,v_admin,1,100,'active',false,false,'ante_up'),
    (v_357_game,v_other,2,100,'active',false,false,'ante_up'),
    (v_real_game,v_admin,1,100,'active',false,false,NULL),
    (v_real_game,v_other,2,100,'active',false,false,NULL);
  SELECT id INTO v_y_p1 FROM public.players WHERE game_id=v_y_game AND user_id=v_admin;
  SELECT id INTO v_y_p2 FROM public.players WHERE game_id=v_y_game AND user_id=v_other;
  SELECT id INTO v_h_p1 FROM public.players WHERE game_id=v_h_game AND user_id=v_admin;
  SELECT id INTO v_h_p2 FROM public.players WHERE game_id=v_h_game AND user_id=v_other;
  SELECT id INTO v_357_p1 FROM public.players WHERE game_id=v_357_game AND user_id=v_admin;
  SELECT id INTO v_357_p2 FROM public.players WHERE game_id=v_357_game AND user_id=v_other;

  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type,config)
  VALUES
    (v_y_dg,v_y_game,v_admin,'yahtzee',jsonb_build_object('ante_amount',1)),
    (v_h_dg,v_h_game,v_admin,'holm-game','{}'::jsonb),
    (v_357_dg,v_357_game,v_admin,'3-5-7','{}'::jsonb);

  -- Authorization, real-money, invalid-profile, and exact-game isolation gates.
  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_other)::text,true);
  IF public.arm_target_rule_branch_harness(v_y_game,'yahtzee:category:ones',600)->>'outcome'<>'not_authorized' THEN
    RAISE EXCEPTION 'target_fixture_proof:non_admin_arm_allowed';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_admin)::text,true);
  IF public.arm_target_rule_branch_harness(v_real_game,'yahtzee:category:ones',600)->>'outcome'<>'real_money_forbidden' THEN
    RAISE EXCEPTION 'target_fixture_proof:real_money_arm_allowed';
  END IF;
  IF public.arm_target_rule_branch_harness(v_y_game,'unknown',600)->>'outcome'<>'invalid_profile' THEN
    RAISE EXCEPTION 'target_fixture_proof:invalid_profile_allowed';
  END IF;
  IF public.arm_target_rule_branch_harness(v_y_game,'holm:solo:win',600)->>'outcome'<>'wrong_game_type' THEN
    RAISE EXCEPTION 'target_fixture_proof:wrong_game_profile_allowed';
  END IF;

  -- Yahtzee: the initial scorecard is seeded once, the normal scoring RPC
  -- remains authoritative, and the preparation RPC stages exact visible dice.
  IF public.arm_target_rule_branch_harness(v_y_game,'yahtzee:category:ones',600)->>'outcome'<>'armed' THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_arm_failed';
  END IF;
  v_result:=public.start_yahtzee_round(v_y_game,NULL);
  v_y_round:=(v_result->>'round_id')::uuid;
  v_state:=v_result->'state';
  IF v_result->>'outcome'<>'started'
     OR v_state#>ARRAY['playerStates',v_y_p1::text,'scorecard','scores','ones'] IS NOT NULL
     OR v_state#>ARRAY['playerStates',v_y_p2::text,'scorecard','scores','ones'] IS NOT NULL
     OR (SELECT count(*) FROM jsonb_object_keys(
       v_state#>ARRAY['playerStates',v_y_p1::text,'scorecard','scores']
     ))<>12 THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_seed_wrong:%',v_result;
  END IF;
  v_status:=public.get_target_rule_branch_harness(v_y_game);
  IF coalesce((v_status->>'armed')::boolean,false) OR v_status->>'consumedAt' IS NULL
     OR v_status->>'consumedDealerGameId'<>v_y_dg::text THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_not_consumed_once:%',v_status;
  END IF;
  v_result:=public.prepare_yahtzee_rule_branch_turn(v_y_game);
  v_state:=v_result->'state';
  IF v_result->>'outcome'<>'prepared'
     OR v_result->>'category'<>'ones'
     OR v_state#>>ARRAY['playerStates',(v_result->>'playerId'),'rollsRemaining']<>'2'
     OR v_state#>>ARRAY['playerStates',(v_result->>'playerId'),'dice','0','value']<>'1'
     OR nullif(v_state->>'turnDeadline','')::timestamptz<=clock_timestamp()
     OR (SELECT decision_deadline FROM public.rounds WHERE id=v_y_round)
        IS DISTINCT FROM nullif(v_state->>'turnDeadline','')::timestamptz THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_prepare_wrong:%',v_result;
  END IF;
  v_result:=public.start_yahtzee_round(v_y_game,NULL);
  IF v_result->>'outcome'<>'already_started' OR (v_result->>'round_id')::uuid<>v_y_round THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_start_replay_changed_identity:%',v_result;
  END IF;
  v_result:=public.yahtzee_apply_action(
    v_y_round,v_y_p1,'score',NULL,'ones',NULL,(v_state->>'actionSequence')::integer
  );
  IF v_result->>'outcome'<>'applied' OR (v_result->>'terminal')::boolean THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_first_score_failed:%',v_result;
  END IF;
  v_result:=public.prepare_yahtzee_rule_branch_turn(v_y_game);
  v_state:=v_result->'state';
  IF v_result->>'outcome'<>'prepared' OR (v_result->>'playerId')::uuid<>v_y_p2 THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_peer_prepare_failed:%',v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_other)::text,true);
  v_result:=public.yahtzee_apply_action(
    v_y_round,v_y_p2,'score',NULL,'ones',NULL,(v_state->>'actionSequence')::integer
  );
  IF v_result->>'outcome'<>'applied' OR NOT coalesce((v_result->>'terminal')::boolean,false)
     OR (SELECT count(*) FROM public.game_results
          WHERE game_id=v_y_game AND dealer_game_id=v_y_dg
            AND settlement_key='yahtzee_terminal')<>1 THEN
    RAISE EXCEPTION 'target_fixture_proof:yahtzee_terminal_score_failed:%',v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_admin)::text,true);

  -- Holm: the state constructor receives exact private/community/Chucky cards
  -- before publication; no post-mount card rewrite is involved.
  IF public.arm_target_rule_branch_harness(v_h_game,'holm:solo:win',600)->>'outcome'<>'armed' THEN
    RAISE EXCEPTION 'target_fixture_proof:holm_arm_failed';
  END IF;
  v_result:=public.start_holm_initial_hand(v_h_game,false);
  v_h_round:=(v_result->>'round_id')::uuid;
  SELECT community_cards INTO v_cards FROM public.rounds WHERE id=v_h_round;
  IF v_result->>'outcome'<>'started' OR jsonb_array_length(v_cards)<>4
     OR (SELECT count(DISTINCT card->>'rank') FROM jsonb_array_elements(v_cards) card)<>1
     OR (SELECT jsonb_array_length(chucky_cards) FROM public.rounds WHERE id=v_h_round)<>4
     OR (SELECT jsonb_array_length(cards) FROM public.player_cards WHERE round_id=v_h_round AND player_id=v_h_p1)<>4
     OR (SELECT cards->0->>'rank' FROM public.player_cards WHERE round_id=v_h_round AND player_id=v_h_p1)<>'A' THEN
    RAISE EXCEPTION 'target_fixture_proof:holm_seed_wrong:%/%',v_result,v_cards;
  END IF;
  v_status:=public.get_target_rule_branch_harness(v_h_game);
  IF coalesce((v_status->>'armed')::boolean,false) OR v_status->>'consumedAt' IS NULL THEN
    RAISE EXCEPTION 'target_fixture_proof:holm_not_consumed_once:%',v_status;
  END IF;

  -- 3-5-7: one consumed profile drives exact nonduplicated slices for R1-R3
  -- of only hand 1. The ordinary authority owns decisions and continuation.
  IF public.arm_target_rule_branch_harness(v_357_game,'357:round:progression',600)->>'outcome'<>'armed' THEN
    RAISE EXCEPTION 'target_fixture_proof:357_arm_failed';
  END IF;
  PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);
  v_result:=public.three_five_seven_begin_game(v_357_game);
  v_357_round:=(v_result->>'round_id')::uuid;
  IF v_result->>'outcome'<>'started'
     OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=v_357_round AND jsonb_array_length(cards)<>3)
     OR (SELECT cards->0->>'rank' FROM public.player_cards WHERE round_id=v_357_round AND player_id=v_357_p1)<>'A' THEN
    RAISE EXCEPTION 'target_fixture_proof:357_r1_seed_wrong:%',v_result;
  END IF;
  v_result:=public.three_five_seven_submit_decision(v_357_game,v_357_round,v_357_dg,1,1,v_357_p1,'fold');
  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_other)::text,true);
  v_result:=public.three_five_seven_submit_decision(v_357_game,v_357_round,v_357_dg,1,1,v_357_p2,'fold');
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_admin)::text,true);
  v_result:=public.three_five_seven_advance_round(v_357_game,v_357_round,v_357_dg,1,1);
  v_357_r2:=(v_result->>'round_id')::uuid;
  IF v_result->>'outcome'<>'started'
     OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=v_357_r2 AND jsonb_array_length(cards)<>5)
     OR (SELECT cards->3->>'rank' FROM public.player_cards WHERE round_id=v_357_r2 AND player_id=v_357_p1)<>'J'
     OR (SELECT cards->4->>'rank' FROM public.player_cards WHERE round_id=v_357_r2 AND player_id=v_357_p1)<>'10' THEN
    RAISE EXCEPTION 'target_fixture_proof:357_r2_seed_wrong:%',v_result;
  END IF;
  v_status:=public.get_target_rule_branch_harness(v_357_game);
  IF coalesce((v_status->>'armed')::boolean,false) OR v_status->>'consumedAt' IS NULL
     OR v_status->>'consumedHandNumber'<>'1' OR v_status->>'consumedRoundNumber'<>'1' THEN
    RAISE EXCEPTION 'target_fixture_proof:357_not_consumed_once:%',v_status;
  END IF;

  -- Cancelling is always explicit and the exact fixture never changes global
  -- harness owners or game-default profiles.
  IF public.cancel_target_rule_branch_harness(v_y_game)->>'outcome'<>'cancelled'
     OR public.cancel_target_rule_branch_harness(v_h_game)->>'outcome'<>'cancelled'
     OR public.cancel_target_rule_branch_harness(v_357_game)->>'outcome'<>'cancelled' THEN
    RAISE EXCEPTION 'target_fixture_proof:cleanup_failed';
  END IF;
  IF (SELECT value FROM public.system_settings WHERE key='harnesses_mode') IS DISTINCT FROM v_original_harnesses_mode
     OR (SELECT debug_harness FROM public.game_defaults WHERE game_type='yahtzee') IS DISTINCT FROM v_original_y_debug
     OR (SELECT debug_harness FROM public.game_defaults WHERE game_type='holm') IS DISTINCT FROM v_original_h_debug
     OR (SELECT debug_harness FROM public.game_defaults WHERE game_type='3-5-7') IS DISTINCT FROM v_original_357_debug THEN
    RAISE EXCEPTION 'target_fixture_proof:global_harness_mutated';
  END IF;
  RAISE NOTICE 'target_rule_branch_harness_proof:passed';
END;
$proof$;
