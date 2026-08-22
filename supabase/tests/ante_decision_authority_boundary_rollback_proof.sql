-- Caller-owned rollback proof for the authenticated ante-decision request
-- boundary. The caller must apply the candidate migration in the same
-- transaction for the pre-deployment proof, then wrap this file in
-- BEGIN/ROLLBACK for the post-deployment proof.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_357_sit uuid:=gen_random_uuid();
  v_357_start uuid:=gen_random_uuid();
  v_yahtzee_sit uuid:=gen_random_uuid();
  v_deadline_357_sit timestamptz:=clock_timestamp()+interval '20 minutes';
  v_deadline_357_start timestamptz:=clock_timestamp()+interval '21 minutes';
  v_deadline_yahtzee_sit timestamptz:=clock_timestamp()+interval '22 minutes';
  v_dealer uuid;
  v_other uuid;
  v_dealer_game uuid;
  v_result jsonb;
  v_before_rounds integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'ante_authority_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);

  INSERT INTO public.games(
    id,name,status,game_type,current_host,dealer_position,config_complete,
    config_deadline,ante_decision_timer_seconds,game_setup_timer_seconds,
    pot,current_round,total_hands,real_money
  ) VALUES
    (v_357_sit,'Codex rollback proof - 357 Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_sit,30,30,0,0,0,false),
    (v_357_start,'Codex rollback proof - 357 start','game_selection',NULL,
      v_users[1],1,false,v_deadline_357_start,30,30,0,0,0,false),
    (v_yahtzee_sit,'Codex rollback proof - Yahtzee Sit Out','game_selection',NULL,
      v_users[1],1,false,v_deadline_yahtzee_sit,30,30,0,0,0,false);

  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_357_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_357_sit,v_users[2],2,100,'active',false,false,NULL),
    (v_357_start,v_users[1],1,100,'active',false,false,NULL),
    (v_357_start,v_users[2],2,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[1],1,100,'active',false,false,NULL),
    (v_yahtzee_sit,v_users[2],2,100,'active',false,false,NULL);

  -- 3-5-7 final Sit Out: setup and ante submission are separate HTTP
  -- transactions. Explicitly clear every setup authority flag before the
  -- second call so this proof cannot inherit setup's trusted context.
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_357_sit,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);

  -- Authorization remains in the public wrapper and cannot partially mutate.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL
     OR coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:unauthorized_357_sit_mutated:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR v_result#>>'{phase,reason}'<>'waiting-not-enough-players'
     OR (SELECT status FROM public.games WHERE id=v_357_sit)<>'waiting'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_357_sit) IS NOT NULL
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_not_committed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_sit)<>0 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_sit_replay_changed_state:%',v_result;
  END IF;

  -- The same protected branch must work for Yahtzee without weakening its
  -- game-authority trigger.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_yahtzee_sit AND position=2;
  SELECT public.configure_dealer_game(
    v_yahtzee_sit,v_dealer,1,'yahtzee',jsonb_build_object('ante_amount',3),
    v_deadline_yahtzee_sit
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_yahtzee_sit,v_dealer_game,v_other,'sit_out',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'not_enough_players'
     OR (SELECT status FROM public.games WHERE id=v_yahtzee_sit)<>'waiting'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other)<>'sit_out'
     OR NOT coalesce((SELECT sitting_out FROM public.players WHERE id=v_other),false) THEN
    RAISE EXCEPTION 'ante_authority_proof:yahtzee_sit_not_committed:%',v_result;
  END IF;

  -- Normal 3-5-7 continuation remains exactly once and replay safe.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_357_start AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_357_start AND position=2;
  SELECT public.configure_dealer_game(
    v_357_start,v_dealer,1,'3-5-7',jsonb_build_object(
      'ante_amount',3,'rollover_amount',1,'leg_value',2,
      'pussy_tax_enabled',true,'pussy_tax_value',1,'legs_to_win',3,
      'pot_max_enabled',true,'pot_max_value',15,
      'reveal_at_showdown',true
    ),v_deadline_357_start
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_setup_failed:%',v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write','off',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.yahtzee_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT count(*) INTO v_before_rounds FROM public.rounds
   WHERE game_id=v_357_start;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_357_start)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_failed:%',v_result;
  END IF;
  SELECT public.submit_ante_decision(
    v_357_start,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds WHERE game_id=v_357_start)
        <>v_before_rounds+1 THEN
    RAISE EXCEPTION 'ante_authority_proof:357_start_replay_changed_state:%',v_result;
  END IF;
END;
$proof$;
