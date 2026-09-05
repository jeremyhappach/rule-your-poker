BEGIN;
-- Caller-owned rollback proof for the shared dealer configuration handoff.
-- Exercises every supported game plus authorization, validation, duplicate,
-- exact-identity replay, and late replay behavior.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_types text[]:=ARRAY['3-5-7','holm-game','cribbage','gin-rummy','horses','ship-captain-crew','yahtzee'];
  v_type text;
  v_game uuid;
  v_dealer_player uuid;
  v_other_player uuid;
  v_deadline timestamptz;
  v_config jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_dealer_game uuid;
  v_before jsonb;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT p.id,p.created_at FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at,p.id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'dealer_setup_proof:requires_two_profiles';
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);

  FOREACH v_type IN ARRAY v_types LOOP
    v_game:=gen_random_uuid();
    v_deadline:=clock_timestamp()+interval '20 minutes';
    INSERT INTO public.games(
      id,name,status,game_type,current_host,dealer_position,config_complete,
      config_deadline,ante_decision_timer_seconds,pot,current_round,total_hands
    ) VALUES(
      v_game,'Codex rollback proof - setup '||v_type,'game_selection',NULL,
      v_users[1],1,false,v_deadline,30,CASE WHEN v_type='cribbage' THEN 0 ELSE 9 END,0,0
    );
    INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision,current_decision,decision_locked,auto_fold)
    VALUES
      (v_game,v_users[1],1,100,'active',true,false,NULL,'fold',true,true),
      (v_game,v_users[2],2,100,'folded',false,false,'ante_up','stay',true,true);
    SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
    SELECT id INTO v_other_player FROM public.players WHERE game_id=v_game AND position=2;

    v_config:=CASE v_type
      WHEN '3-5-7' THEN '{"ante_amount":3,"rollover_amount":1,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"reveal_at_showdown":true}'::jsonb
      WHEN 'holm-game' THEN '{"ante_amount":2,"leg_value":2,"pussy_tax_enabled":true,"pussy_tax_value":1,"legs_to_win":3,"pot_max_enabled":true,"pot_max_value":12,"chucky_cards":4,"rabbit_hunt":true}'::jsonb
      WHEN 'cribbage' THEN '{"ante_amount":2,"points_to_win":121,"skunk_enabled":true,"skunk_threshold":91,"double_skunk_enabled":true,"double_skunk_threshold":61,"game_mode":"full"}'::jsonb
      WHEN 'gin-rummy' THEN '{"ante_amount":2,"points_to_win":100,"per_point_value":1,"gin_bonus":25,"undercut_bonus":25}'::jsonb
      ELSE '{"ante_amount":2}'::jsonb
    END;

    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.games SET ante_amount=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_ante_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET points_to_win=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_scoring_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET game_setup_timer_seconds=989 WHERE id=v_game;
      RAISE EXCEPTION 'direct_timer_configuration_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      UPDATE public.games SET dealer_selection_state='{"isComplete":true,"winnerPosition":1}'::jsonb WHERE id=v_game;
      RAISE EXCEPTION 'direct_draw_forgery_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
      VALUES(v_game,v_users[1],v_type,v_config);
      RAISE EXCEPTION 'direct_dealer_game_insert_allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_result;
    RESET ROLE;
    v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
    IF v_result->>'outcome'<>'configured' OR coalesce((v_result->>'deduped')::boolean,true)
       OR (v_result#>>'{game,status}')<>'ante_decision'
       OR (v_result#>>'{game,current_game_uuid}')::uuid<>v_dealer_game
       OR v_result#>>'{game,ante_decision_deadline}' IS NULL
       OR v_result#>>'{game,config_deadline}' IS NOT NULL
       OR (v_result#>>'{dealer_game,game_type}')<>v_type
       OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up'
       OR (SELECT sitting_out FROM public.players WHERE id=v_dealer_player)
       OR (SELECT ante_decision FROM public.players WHERE id=v_other_player) IS NOT NULL
       OR (SELECT status FROM public.players WHERE id=v_other_player)<>'active'
       OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND (current_decision IS NOT NULL OR decision_locked OR auto_fold))
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1
       OR (SELECT count(*) FROM private.dealer_game_setup_commits WHERE game_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:atomic_handoff_invalid:%:%',v_type,v_result;
    END IF;
    IF (v_type='3-5-7' AND (
          (v_result#>>'{game,rollover_amount}')::integer<>1
          OR (v_result#>>'{game,leg_value}')::integer<>2
          OR (v_result#>>'{game,reveal_at_showdown}')::boolean IS NOT TRUE
       ))
       OR (v_type='holm-game' AND (
          (v_result#>>'{game,current_round}')::integer<>1
          OR (v_result#>>'{game,chucky_cards}')::integer<>4
          OR (v_result#>>'{game,rabbit_hunt}')::boolean IS NOT TRUE
       ))
       OR (v_type='cribbage' AND (
          (v_result#>>'{game,pot}')::integer<>0
          OR (v_result#>>'{game,points_to_win}')::integer<>121
          OR (v_result#>>'{game,skunk_threshold}')::integer<>91
       ))
       OR (v_type='gin-rummy' AND (
          (v_result#>>'{game,points_to_win}')::integer<>100
          OR (v_result#>>'{dealer_game,config,gin_bonus}')::integer<>25
       ))
       OR (v_type IN ('horses','ship-captain-crew','yahtzee') AND (
          (v_result#>>'{game,leg_value}')::integer<>0
          OR (v_result#>>'{game,pot_max_enabled}')::boolean IS NOT FALSE
       )) THEN
      RAISE EXCEPTION 'dealer_setup_proof:game_specific_state_invalid:%:%',v_type,v_result;
    END IF;
    SELECT public.configure_dealer_game(v_game,v_dealer_player,1,v_type,v_config,v_deadline) INTO v_replay;
    IF v_replay->>'outcome'<>'already_configured' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
       OR (v_replay#>>'{dealer_game,id}')::uuid<>v_dealer_game
       OR (SELECT count(*) FROM public.dealer_games WHERE session_id=v_game)<>1 THEN
      RAISE EXCEPTION 'dealer_setup_proof:duplicate_changed_state:%:%',v_type,v_replay;
    END IF;
    IF v_type='yahtzee' THEN
      BEGIN
        PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,v_type,'{"ante_amount":3}'::jsonb,v_deadline);
        RAISE EXCEPTION 'dealer_setup_proof:mismatched_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='dealer_setup_proof:mismatched_replay_succeeded'
           OR SQLERRM NOT LIKE '%replay_payload_mismatch%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;

  -- Unauthorized callers cannot create a setup commit.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - unauthorized','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:outsider_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:unauthorized_call_partially_mutated';
  END IF;

  -- Invalid configuration is atomic and creates no dealer-game row or claim.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  BEGIN
    PERFORM public.configure_dealer_game(v_game,v_dealer_player,1,'3-5-7','{"ante_amount":3,"rollover_amount":0}'::jsonb,v_deadline);
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='dealer_setup_proof:invalid_config_succeeded' OR SQLERRM NOT LIKE '%invalid_card_game_config%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=v_game)
     OR EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=v_game) THEN
    RAISE EXCEPTION 'dealer_setup_proof:invalid_config_partially_mutated';
  END IF;

  -- A human session member may configure an eligible bot dealer. The bot's
  -- user identity, not the caller identity, owns the dealer-game row.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - bot dealer','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[2],1,100,'active',true),(v_game,v_users[1],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'yahtzee','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  IF (v_result#>>'{dealer_game,dealer_user_id}')::uuid<>v_users[2]
     OR (SELECT ante_decision FROM public.players WHERE id=v_dealer_player)<>'ante_up' THEN
    RAISE EXCEPTION 'dealer_setup_proof:bot_dealer_invalid:%',v_result;
  END IF;

  -- Late replay returns its stored result and cannot overwrite a newer setup.
  v_game:=gen_random_uuid(); v_deadline:=clock_timestamp()+interval '20 minutes';
  INSERT INTO public.games(id,name,status,current_host,dealer_position,config_complete,config_deadline)
  VALUES(v_game,'Codex rollback proof - late replay','game_selection',v_users[1],1,false,v_deadline);
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES(v_game,v_users[1],1,100,'active',false),(v_game,v_users[2],2,100,'active',false);
  SELECT id INTO v_dealer_player FROM public.players WHERE game_id=v_game AND position=1;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_result;
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.games SET status='game_selection',dealer_position=2,
    config_complete=false,config_deadline=v_deadline+interval '1 hour',current_game_uuid=NULL
   WHERE id=v_game;
  SELECT to_jsonb(game) INTO v_before FROM public.games game WHERE id=v_game;
  SELECT public.configure_dealer_game(v_game,v_dealer_player,1,'horses','{"ante_amount":2}'::jsonb,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_configured'
     OR (SELECT to_jsonb(game) FROM public.games game WHERE id=v_game) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'dealer_setup_proof:late_replay_mutated_newer_setup:%',v_replay;
  END IF;

  SELECT count(*) INTO v_count FROM private.dealer_game_setup_commits;
  IF v_count<9 THEN RAISE EXCEPTION 'dealer_setup_proof:missing_claims:%',v_count; END IF;
END;
$proof$;
ROLLBACK;
