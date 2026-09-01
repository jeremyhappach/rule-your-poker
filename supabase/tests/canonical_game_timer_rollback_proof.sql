-- Caller-owned rollback proof for canonical timer ownership.
-- Covers authorization, future-only admission, ante continuation, a dice tie
-- and successor, a terminal winner, duplicate/replay/late-replay behavior,
-- and pause/resume deadline preservation.  The caller must wrap this file in
-- BEGIN/ROLLBACK.

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid();
  v_pause_game uuid:=gen_random_uuid();
  v_dealer uuid;
  v_other uuid;
  v_deadline timestamptz:=clock_timestamp()+interval '20 minutes';
  v_dealer_game uuid;
  v_round uuid;
  v_successor uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tie_state jsonb;
  v_winner_state jsonb;
  v_before_count integer;
  v_after_count integer;
  v_before_deadline timestamptz;
  v_after_deadline timestamptz;
  v_cutover timestamptz;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:requires_two_profiles';
  END IF;

  SELECT cutover_at INTO v_cutover FROM private.game_timer_cutover
   WHERE singleton=true;
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
     WHERE timer.created_at>=v_cutover
       AND timer.due_at<v_cutover
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:expired_history_was_admitted';
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
  ) VALUES (
    v_game,'Codex rollback proof - canonical timers','game_selection',NULL,
    v_users[1],1,false,v_deadline,30,30,0,0,0,false
  );
  INSERT INTO public.players(
    game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision
  ) VALUES
    (v_game,v_users[1],1,100,'active',false,false,NULL),
    (v_game,v_users[2],2,100,'active',false,false,NULL);
  SELECT id INTO v_dealer FROM public.players
   WHERE game_id=v_game AND position=1;
  SELECT id INTO v_other FROM public.players
   WHERE game_id=v_game AND position=2;

  SELECT public.configure_dealer_game(
    v_game,v_dealer,1,'horses','{"ante_amount":2}'::jsonb,v_deadline
  ) INTO v_result;
  v_dealer_game:=(v_result#>>'{dealer_game,id}')::uuid;
  IF v_result->>'outcome'<>'configured' OR v_dealer_game IS NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:setup_failed:%',v_result;
  END IF;

  -- Authorization: an outsider cannot submit another player's ante and the
  -- failed call cannot partially mutate the player.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT ante_decision FROM public.players WHERE id=v_other) IS NOT NULL THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_ante_mutated:%',v_result;
  END IF;

  -- The second valid ante atomically continues into the database-owned dice
  -- first round.  No browser start callback is involved.
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[2]
  )::text,true);
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_result;
  IF v_result->>'outcome'<>'accepted'
     OR v_result#>>'{phase,outcome}'<>'advanced'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:ante_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_round FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game
     AND hand_number=1 AND round_number=1;

  -- Duplicate decision/replay cannot create another first round.
  SELECT public.submit_ante_decision(
    v_game,v_dealer_game,v_other,'ante_up',false,false
  ) INTO v_replay;
  IF v_replay->>'outcome'<>'stale_identity'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>1 THEN
    RAISE EXCEPTION 'canonical_timer_proof:duplicate_ante_changed_state:%',v_replay;
  END IF;

  -- Tie proof: exact terminal dice state rolls into one successor even while
  -- humans are present; a replay returns already_advanced.
  v_tie_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_tie_state WHERE id=v_round;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_result;
  IF v_result->>'status'<>'advanced'
     OR (v_result->>'hand_number')::integer<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_continuation_failed:%',v_result;
  END IF;
  SELECT id INTO v_successor FROM public.rounds
   WHERE game_id=v_game AND dealer_game_id=v_dealer_game AND hand_number=2;
  SELECT private.horses_scc_rollover_abandoned_round(
    v_round,clock_timestamp()
  ) INTO v_replay;
  IF v_replay->>'status'<>'not_current'
     OR (SELECT count(*) FROM public.rounds
          WHERE game_id=v_game AND dealer_game_id=v_dealer_game)<>2 THEN
    RAISE EXCEPTION 'canonical_timer_proof:tie_replay_changed_state:%',v_replay;
  END IF;

  -- Winner/terminal proof: successor settles once, publishes game_over, and
  -- canonical postgame advances once with an exact replay receipt.
  v_winner_state:=jsonb_build_object(
    'currentTurnPlayerId',NULL,'gamePhase','complete','turnDeadline',NULL,
    'turnOrder',jsonb_build_array(v_dealer,v_other),
    'playerStates',jsonb_build_object(
      v_dealer::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false),
          jsonb_build_object('value',6,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      ),
      v_other::text,jsonb_build_object(
        'dice',jsonb_build_array(
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false),
          jsonb_build_object('value',1,'isHeld',false)
        ),'rollsRemaining',0,'isComplete',true
      )
    )
  );
  UPDATE public.rounds SET horses_state=v_winner_state WHERE id=v_successor;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_result;
  IF v_result->>'status'<>'settled'
     OR (SELECT status FROM public.games WHERE id=v_game)<>'game_over' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_terminal_failed:%',v_result;
  END IF;
  SELECT public.horses_settle_game(
    v_game,v_successor,v_dealer_game,2
  ) INTO v_replay;
  IF v_replay->>'status'<>'already_settled' THEN
    RAISE EXCEPTION 'canonical_timer_proof:winner_duplicate_failed:%',v_replay;
  END IF;

  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_result;
  IF v_result->>'outcome'<>'advanced'
     OR v_result->>'status'<>'game_selection' THEN
    RAISE EXCEPTION 'canonical_timer_proof:terminal_postgame_failed:%',v_result;
  END IF;
  SELECT private.advance_standard_postgame(v_game,v_dealer_game,2)
    INTO v_replay;
  IF v_replay->>'outcome'<>'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical_timer_proof:postgame_replay_failed:%',v_replay;
  END IF;

  -- Late replay of the old ante identity cannot cross the dealer-game/lifecycle
  -- boundary or manufacture a third round.
  SELECT count(*) INTO v_before_count FROM public.rounds WHERE game_id=v_game;
  SELECT private.advance_ante_phase_exact(
    v_game,v_dealer_game,(SELECT ante_decision_deadline FROM public.games
      WHERE id=v_game),clock_timestamp()
  ) INTO v_replay;
  SELECT count(*) INTO v_after_count FROM public.rounds WHERE game_id=v_game;
  IF v_replay->>'outcome'<>'stale_identity' OR v_after_count<>v_before_count THEN
    RAISE EXCEPTION 'canonical_timer_proof:late_replay_crossed_boundary:%',v_replay;
  END IF;

  -- Pause/resume proof on a separate exact setup clock.
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_users[1]
  )::text,true);
  INSERT INTO public.games(
    id,name,status,current_host,dealer_position,config_complete,config_deadline
  ) VALUES (
    v_pause_game,'Codex rollback proof - pause','game_selection',
    v_users[1],1,false,clock_timestamp()+interval '10 minutes'
  );
  INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot)
  VALUES
    (v_pause_game,v_users[1],1,100,'active',false),
    (v_pause_game,v_users[2],2,100,'active',false);
  SELECT config_deadline INTO v_before_deadline FROM public.games
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,true) INTO v_result;
  IF v_result->>'outcome'<>'paused' THEN
    RAISE EXCEPTION 'canonical_timer_proof:pause_failed:%',v_result;
  END IF;
  UPDATE public.games SET timer_paused_at=timer_paused_at-interval '5 seconds'
   WHERE id=v_pause_game;
  SELECT public.set_game_paused(v_pause_game,false) INTO v_result;
  SELECT config_deadline INTO v_after_deadline FROM public.games
   WHERE id=v_pause_game;
  IF v_result->>'outcome'<>'resumed'
     OR v_after_deadline<v_before_deadline+interval '4.9 seconds' THEN
    RAISE EXCEPTION 'canonical_timer_proof:resume_did_not_preserve_time:%',v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_outsider
  )::text,true);
  SELECT public.set_game_paused(v_pause_game,true) INTO v_result;
  IF v_result->>'outcome'<>'not_authorized'
     OR (SELECT is_paused FROM public.games WHERE id=v_pause_game) THEN
    RAISE EXCEPTION 'canonical_timer_proof:unauthorized_pause_mutated:%',v_result;
  END IF;

  -- Policy proof: no Gin/Cribbage human decision timer kind exists.
  IF EXISTS (
    SELECT 1 FROM private.game_timer_registry timer
    JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE game_row.game_type IN ('gin-rummy','cribbage')
       AND timer.state IN ('scheduled','processing')
       AND timer.timer_kind IN ('holm_decision','three_five_seven_decision',
                                'horses_scc_turn','yahtzee_turn')
  ) THEN
    RAISE EXCEPTION 'canonical_timer_proof:untimed_game_received_human_clock';
  END IF;
END;
$proof$;
