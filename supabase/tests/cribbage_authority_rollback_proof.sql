-- Run in the same transaction immediately after the authority migration.
-- The caller owns BEGIN/ROLLBACK so this proof cannot retain synthetic data.
DO $proof$
DECLARE
  v_game_id uuid:=gen_random_uuid();
  v_dealer_game_id uuid:=gen_random_uuid();
  v_user_one uuid;
  v_user_two uuid;
  v_outsider uuid:=gen_random_uuid();
  v_player_one uuid:=gen_random_uuid();
  v_player_two uuid:=gen_random_uuid();
  v_round_id uuid;
  v_next_round_id uuid;
  v_state jsonb;
  v_public jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_current_player uuid;
  v_card_index integer;
  v_event_sequence integer;
  v_iteration integer;
  v_tie_seen boolean:=false;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_hand jsonb;
  v_loser_hand jsonb;
  v_played jsonb:='[]'::jsonb;
BEGIN
  SELECT profile_ids[1],profile_ids[2]
    INTO v_user_one,v_user_two
    FROM (
      SELECT array_agg(id ORDER BY id::text) AS profile_ids
        FROM (
          SELECT profile.id
            FROM public.profiles profile
            JOIN auth.users account ON account.id=profile.id
           ORDER BY profile.id::text
           LIMIT 2
        ) profiles
    ) selected;
  IF v_user_one IS NULL OR v_user_two IS NULL OR v_user_one=v_user_two THEN
    RAISE EXCEPTION 'proof_requires_two_profiles';
  END IF;

  INSERT INTO public.games(
    id,name,game_type,status,ante_amount,buy_in,pot,current_round,total_hands,
    points_to_win,skunk_enabled,skunk_threshold,double_skunk_enabled,
    double_skunk_threshold,is_first_hand,current_host
  ) VALUES(
    v_game_id,'Cribbage authority rollback proof','cribbage',
    'cribbage_dealer_selection',1,100,0,NULL,0,121,true,91,true,61,true,v_user_one
  );
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_dealer_game_id,v_user_one,'cribbage',v_game_id,'{}'::jsonb);
  UPDATE public.games SET current_game_uuid=v_dealer_game_id WHERE id=v_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status)
  VALUES
    (v_player_one,v_user_one,v_game_id,1,100,false,'active'),
    (v_player_two,v_user_two,v_game_id,2,100,false,'active');
  UPDATE public.system_settings
     SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false'::jsonb,true)
   WHERE key='harnesses_mode';

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );

  -- Dealer-draw tie: repeat the server draw until a redraw round is observed.
  -- The chance of missing a two-player rank tie in 200 independent draws is negligible.
  FOR v_iteration IN 1..200 LOOP
    PERFORM set_config('app.cribbage_authoritative_write','on',true);
    UPDATE public.games SET dealer_selection_state=NULL WHERE id=v_game_id;
    PERFORM set_config('app.cribbage_authoritative_write','',true);
    v_state:=public.cribbage_prepare_dealer_selection(v_game_id);
    SELECT coalesce(max((card->>'roundNumber')::integer),0)>1
      INTO v_tie_seen
      FROM jsonb_array_elements(v_state->'cards') AS cards(card);
    EXIT WHEN v_tie_seen;
  END LOOP;
  IF NOT v_tie_seen THEN RAISE EXCEPTION 'dealer_tie_redraw_not_observed'; END IF;
  IF v_state->>'winnerPosition' IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_state->'cards') AS cards(card)
        WHERE (card->>'isWinner')::boolean
          AND (card->>'position')::integer=(v_state->>'winnerPosition')::integer
     )
     OR EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_state->'cards') AS cards(card)
        WHERE (card->>'isWinner')::boolean
          AND (card->>'position')::integer<>(v_state->>'winnerPosition')::integer
     ) THEN
    RAISE EXCEPTION 'dealer_draw_did_not_resolve_one_winner_identity';
  END IF;

  -- Initial creation and replay dedupe.
  v_result:=public.start_cribbage_initial_hand(v_game_id);
  IF v_result->>'outcome'<>'started' THEN RAISE EXCEPTION 'initial_start_failed:%',v_result; END IF;
  v_round_id:=(v_result->>'round_id')::uuid;
  v_replay:=public.start_cribbage_initial_hand(v_game_id);
  IF v_replay->>'outcome'<>'already-started'
     OR (v_replay->>'round_id')::uuid<>v_round_id THEN
    RAISE EXCEPTION 'initial_start_replay_failed:%',v_replay;
  END IF;

  -- Hidden-state projection: public is masked, caller sees only their own hand.
  SELECT cribbage_state INTO v_public FROM public.rounds WHERE id=v_round_id;
  IF v_public->'playerStates'->v_player_one::text->'hand'->0->>'rank'<>'?'
     OR v_public->'playerStates'->v_player_two::text->'hand'->0->>'rank'<>'?' THEN
    RAISE EXCEPTION 'public_projection_leaked_hand';
  END IF;
  v_state:=public.cribbage_get_state(v_round_id);
  IF v_state->'playerStates'->v_player_one::text->'hand'->0->>'rank'='?'
     OR v_state->'playerStates'->v_player_two::text->'hand'->0->>'rank'<>'?' THEN
    RAISE EXCEPTION 'caller_projection_incorrect';
  END IF;

  -- An outsider cannot read or act on the hand.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_outsider,'role','authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.cribbage_get_state(v_round_id);
    RAISE EXCEPTION 'outsider_read_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_read_was_allowed' THEN RAISE; END IF;
  END;

  -- Direct round mutation is rejected for authenticated clients.
  PERFORM set_config('app.cribbage_authoritative_write','',true);
  BEGIN
    UPDATE public.rounds SET pot=999 WHERE id=v_round_id;
    RAISE EXCEPTION 'direct_round_mutation_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_round_mutation_was_allowed' THEN RAISE; END IF;
  END;

  -- Concurrent-safe discards and duplicate replay.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );
  PERFORM public.cribbage_apply_discard(v_round_id,v_player_one,ARRAY[0,1]);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_two,'role','authenticated')::text,
    true
  );
  v_state:=public.cribbage_apply_discard(v_round_id,v_player_two,ARRAY[0,1]);
  IF v_state->>'phase' NOT IN ('pegging','complete') THEN
    RAISE EXCEPTION 'discard_transition_failed:%',v_state->>'phase';
  END IF;
  SELECT state INTO v_before FROM private.cribbage_round_states WHERE round_id=v_round_id;
  PERFORM public.cribbage_apply_discard(v_round_id,v_player_two,ARRAY[0,1]);
  SELECT state INTO v_after FROM private.cribbage_round_states WHERE round_id=v_round_id;
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'duplicate_discard_changed_state'; END IF;

  -- Drive pegging as the recovery owner. Replaying the first event sequence
  -- must be stale and leave the committed event intact.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  FOR v_iteration IN 1..64 LOOP
    SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_round_id;
    EXIT WHEN v_state->>'phase'<>'pegging';
    v_current_player:=(v_state->'pegging'->>'currentTurnPlayerId')::uuid;
    v_event_sequence:=coalesce((v_state->'pegging'->>'eventSequence')::integer,0);
    SELECT item.ordinality::integer-1
      INTO v_card_index
      FROM jsonb_array_elements(v_state->'playerStates'->v_current_player::text->'hand')
           WITH ORDINALITY item(card,ordinality)
     WHERE private.cribbage_card_value(item.card)+(v_state->'pegging'->>'currentCount')::integer<=31
     ORDER BY item.ordinality
     LIMIT 1;
    v_result:=public.cribbage_apply_pegging_action(
      v_round_id,v_current_player,
      CASE WHEN v_card_index IS NULL THEN 'go' ELSE 'play' END,
      v_card_index,v_event_sequence
    );
    IF v_result->>'outcome'<>'applied' THEN RAISE EXCEPTION 'pegging_action_failed:%',v_result; END IF;
    IF v_iteration=1 THEN
      v_replay:=public.cribbage_apply_pegging_action(
        v_round_id,v_current_player,
        CASE WHEN v_card_index IS NULL THEN 'go' ELSE 'play' END,
        v_card_index,v_event_sequence
      );
      IF v_replay->>'outcome'<>'stale' THEN RAISE EXCEPTION 'pegging_replay_not_stale:%',v_replay; END IF;
    END IF;
  END LOOP;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_round_id;
  IF v_state->>'phase'<>'counting'
     OR v_state->'countingResolution'->>'outcome'<>'ready' THEN
    RAISE EXCEPTION 'counting_resolution_failed:%',v_state;
  END IF;

  -- Continuation, duplicate release, and late action replay.
  UPDATE public.rounds SET presentation_fallback_at=clock_timestamp()-interval '1 second'
   WHERE id=v_round_id;
  v_result:=public.cribbage_release_counting(v_round_id,true);
  IF v_result->>'outcome'<>'activated' THEN RAISE EXCEPTION 'continuation_failed:%',v_result; END IF;
  v_next_round_id:=(v_result->>'round_id')::uuid;
  v_replay:=public.cribbage_release_counting(v_round_id,true);
  IF v_replay->>'outcome'<>'already_active'
     OR (v_replay->>'round_id')::uuid<>v_next_round_id THEN
    RAISE EXCEPTION 'continuation_replay_failed:%',v_replay;
  END IF;
  v_replay:=public.cribbage_apply_pegging_action(
    v_round_id,v_current_player,'go',NULL,v_event_sequence
  );
  IF v_replay->>'outcome'<>'stale_identity' THEN
    RAISE EXCEPTION 'late_action_replay_not_rejected:%',v_replay;
  END IF;

  -- Build a physically coherent terminal counting state from successor cards.
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_next_round_id;
  v_winner_id:=(v_state->'turnOrder'->>0)::uuid;
  v_loser_id:=CASE WHEN v_winner_id=v_player_one THEN v_player_two ELSE v_player_one END;
  v_winner_hand:=v_state->'playerStates'->v_winner_id::text->'hand';
  v_loser_hand:=v_state->'playerStates'->v_loser_id::text->'hand';
  FOR v_iteration IN 0..3 LOOP
    v_played:=v_played||jsonb_build_array(
      jsonb_build_object('playerId',v_winner_id,'card',v_winner_hand->v_iteration),
      jsonb_build_object('playerId',v_loser_id,'card',v_loser_hand->v_iteration)
    );
  END LOOP;
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_winner_id::text,'hand'],'[]'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_loser_id::text,'hand'],'[]'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_winner_id::text,'pegScore'],'120'::jsonb,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',v_loser_id::text,'pegScore'],'100'::jsonb,true);
  v_state:=jsonb_set(v_state,'{crib}',jsonb_build_array(
    v_winner_hand->4,v_winner_hand->5,v_loser_hand->4,v_loser_hand->5
  ),true);
  v_state:=jsonb_set(v_state,'{cutCard}',jsonb_build_object('rank','5','suit','spades','value',5),true);
  v_state:=jsonb_set(v_state,'{pegging,playedCards}',v_played,true);
  v_state:=private.cribbage_enter_counting(v_state);
  PERFORM private.cribbage_publish_state(v_next_round_id,v_state);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_next_round_id;
  IF v_state->>'phase'<>'complete' OR (v_state->>'winnerPlayerId')::uuid<>v_winner_id THEN
    RAISE EXCEPTION 'terminal_resolution_failed:%',v_state;
  END IF;

  v_result:=public.cribbage_settle_game(v_game_id,v_next_round_id,v_dealer_game_id,2);
  IF v_result->>'status'<>'settled' THEN RAISE EXCEPTION 'terminal_settlement_failed:%',v_result; END IF;
  v_replay:=public.cribbage_settle_game(v_game_id,v_next_round_id,v_dealer_game_id,2);
  IF v_replay->>'status'<>'already_settled' THEN RAISE EXCEPTION 'terminal_settlement_replay_failed:%',v_replay; END IF;
END;
$proof$;
