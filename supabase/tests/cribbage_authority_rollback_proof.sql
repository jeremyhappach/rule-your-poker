-- Self-contained rollback proof for the Cribbage authority/startup migrations.
-- It must never retain synthetic data or mutate shared settings when run directly.
BEGIN;

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
  v_later_dealer_game_id uuid:=gen_random_uuid();
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
  v_advanced integer;
  v_tie_seen boolean:=false;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_hand jsonb;
  v_loser_hand jsonb;
  v_played jsonb:='[]'::jsonb;
  v_dealer_positions integer[];
  v_old_dealer_position integer;
  v_expected_dealer_position integer;
  v_dealer_index integer;
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
    'ante_decision',1,100,0,NULL,0,121,true,91,true,61,true,v_user_one
  );
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_dealer_game_id,v_user_one,'cribbage',v_game_id,'{}'::jsonb);
  UPDATE public.games SET current_game_uuid=v_dealer_game_id WHERE id=v_game_id;
  INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES
    (v_player_one,v_user_one,v_game_id,1,100,false,'active','ante_up'),
    (v_player_two,v_user_two,v_game_id,2,100,false,'active',NULL);
  UPDATE public.system_settings
     SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false'::jsonb,true)
   WHERE key='harnesses_mode';

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_outsider,'role','authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.cribbage_begin_dealer_selection(v_game_id);
    RAISE EXCEPTION 'outsider_dealer_selection_entry_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_dealer_selection_entry_was_allowed' THEN RAISE; END IF;
  END;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );

  -- Dealer selection cannot begin until every eligible participant resolves
  -- the ante, and rejection cannot publish a partial status/state transition.
  v_result:=public.cribbage_begin_dealer_selection(v_game_id);
  IF v_result->>'outcome'<>'rejected'
     OR v_result->>'reason'<>'waiting_for_antes'
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'ante_decision'
     OR (SELECT dealer_selection_state FROM public.games WHERE id=v_game_id) IS NOT NULL THEN
    RAISE EXCEPTION 'incomplete_ante_entry_was_not_rejected:%',v_result;
  END IF;
  UPDATE public.players SET ante_decision='ante_up' WHERE id=v_player_two;

  -- Dealer-draw tie: repeat the server draw until a redraw round is observed.
  -- The chance of missing a two-player rank tie in 200 independent draws is negligible.
  FOR v_iteration IN 1..200 LOOP
    PERFORM set_config('app.cribbage_authoritative_write','on',true);
    UPDATE public.games SET dealer_selection_state=NULL WHERE id=v_game_id;
    PERFORM set_config('app.cribbage_authoritative_write','',true);
    v_state:=CASE WHEN v_iteration=1
      THEN public.cribbage_begin_dealer_selection(v_game_id)
      ELSE public.cribbage_prepare_dealer_selection(v_game_id)
    END;
    SELECT coalesce(max((card->>'roundNumber')::integer),0)>1
      INTO v_tie_seen
      FROM jsonb_array_elements(v_state->'cards') AS cards(card);
    EXIT WHEN v_tie_seen;
  END LOOP;
  IF NOT v_tie_seen THEN RAISE EXCEPTION 'dealer_tie_redraw_not_observed'; END IF;
  IF (SELECT status FROM public.games WHERE id=v_game_id)<>'cribbage_dealer_selection' THEN
    RAISE EXCEPTION 'dealer_selection_entry_did_not_commit_atomically';
  END IF;
  v_replay:=public.cribbage_begin_dealer_selection(v_game_id);
  IF v_replay IS DISTINCT FROM v_state THEN
    RAISE EXCEPTION 'dealer_selection_entry_replay_changed_state:%',v_replay;
  END IF;
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

  -- The complete scheduled recovery function must start the hand and continue
  -- through every later candidate query without aborting the transaction.
  v_state:=jsonb_set(
    v_state,
    '{preparedAt}',
    to_jsonb(to_char(clock_timestamp()-interval '10 seconds','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    true
  );
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.games SET dealer_selection_state=v_state WHERE id=v_game_id;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_advanced:=private.advance_due_cribbage_state();
  SELECT id INTO v_round_id
    FROM public.rounds
   WHERE game_id=v_game_id
     AND dealer_game_id=v_dealer_game_id
     AND hand_number=1;
  IF v_advanced<1 OR v_round_id IS NULL
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'in_progress' THEN
    RAISE EXCEPTION 'scheduled_initial_start_failed:advanced=% round=%',v_advanced,v_round_id;
  END IF;

  -- Initial creation replay dedupe.
  v_replay:=public.start_cribbage_initial_hand(v_game_id);
  IF v_replay->>'outcome'<>'already-started'
     OR (v_replay->>'round_id')::uuid<>v_round_id THEN
    RAISE EXCEPTION 'initial_start_replay_failed:%',v_replay;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );

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
  SELECT cribbage_state INTO v_public FROM public.rounds WHERE id=v_next_round_id;
  IF v_state->>'phase'<>'counting'
     OR v_state->'countingResolution'->>'outcome'<>'terminal_pending'
     OR v_state->>'winnerPlayerId' IS NOT NULL
     OR (v_state->'pendingTerminal'->>'winnerPlayerId')::uuid<>v_winner_id
     OR v_public->>'phase'<>'counting'
     OR v_public->>'winnerPlayerId' IS NOT NULL
     OR v_public ? 'pendingTerminal'
     OR (SELECT presentation_fallback_at FROM public.rounds WHERE id=v_next_round_id) IS NULL
     OR EXISTS(
       SELECT 1 FROM public.game_results
        WHERE dealer_game_id=v_dealer_game_id
          AND hand_number=2
          AND settlement_key='cribbage_terminal'
     ) THEN
    RAISE EXCEPTION 'terminal_pending_lease_failed:private=% public=%',v_state,v_public;
  END IF;

  -- Pending winner identity is private, duplicate finalization cannot score it
  -- twice, and no caller can settle before presentation promotes the state.
  v_before:=v_state;
  v_replay:=public.cribbage_finalize_counting(v_next_round_id);
  SELECT state INTO v_after FROM private.cribbage_round_states WHERE round_id=v_next_round_id;
  IF v_replay->>'outcome'<>'terminal_pending'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
     OR v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'terminal_pending_finalize_replay_changed_state:%',v_replay;
  END IF;
  BEGIN
    PERFORM public.cribbage_settle_game(v_game_id,v_next_round_id,v_dealer_game_id,2);
    RAISE EXCEPTION 'terminal_pending_settlement_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='terminal_pending_settlement_was_allowed'
       OR SQLERRM NOT LIKE '%cribbage_settle_game:round_not_terminal:counting%' THEN
      RAISE;
    END IF;
  END;

  -- Outsiders cannot acknowledge terminal presentation.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_outsider,'role','authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.cribbage_complete_counting(v_next_round_id);
    RAISE EXCEPTION 'outsider_terminal_presentation_ack_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_terminal_presentation_ack_was_allowed'
       OR SQLERRM NOT LIKE '%cribbage_finalize_counting:not_in_session%' THEN
      RAISE;
    END IF;
  END;

  -- A connected client's visible crossing promotes exactly once.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );
  v_result:=public.cribbage_complete_counting(v_next_round_id);
  v_replay:=public.cribbage_complete_counting(v_next_round_id);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_next_round_id;
  IF v_result->>'outcome'<>'terminal'
     OR coalesce((v_result->>'deduped')::boolean,true) IS TRUE
     OR v_replay->>'outcome'<>'terminal'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
     OR v_state->>'phase'<>'complete'
     OR (v_state->>'winnerPlayerId')::uuid<>v_winner_id
     OR v_state ? 'pendingTerminal'
     OR (SELECT presentation_fallback_at FROM public.rounds WHERE id=v_next_round_id) IS NOT NULL THEN
    RAISE EXCEPTION 'terminal_presentation_ack_failed:%/%/%',v_result,v_replay,v_state;
  END IF;

  -- Restore the rollback-only pending fixture, then prove that the scheduled
  -- owner promotes and settles the same result when every browser disconnects.
  PERFORM private.cribbage_publish_state(v_next_round_id,v_before);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.rounds SET presentation_fallback_at=clock_timestamp()-interval '1 second'
   WHERE id=v_next_round_id;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_advanced:=private.advance_due_cribbage_state();
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=v_next_round_id;
  IF v_advanced<1
     OR v_state->>'phase'<>'complete'
     OR (v_state->>'winnerPlayerId')::uuid<>v_winner_id
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'game_over'
     OR (SELECT count(*) FROM public.game_results
          WHERE dealer_game_id=v_dealer_game_id
            AND hand_number=2
            AND settlement_key='cribbage_terminal')<>1 THEN
    RAISE EXCEPTION 'terminal_fallback_settlement_failed:advanced=% state=%',v_advanced,v_state;
  END IF;
  v_result:=public.cribbage_settle_game(v_game_id,v_next_round_id,v_dealer_game_id,2);
  IF v_result->>'status'<>'already_settled' THEN RAISE EXCEPTION 'terminal_settlement_replay_failed:%',v_result; END IF;

  -- A browser cannot perform the outgoing dealer-game reset directly.
  PERFORM set_config('app.cribbage_authoritative_write','',true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );
  BEGIN
    UPDATE public.games SET total_hands=0 WHERE id=v_game_id;
    RAISE EXCEPTION 'direct_postgame_mutation_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct_postgame_mutation_was_allowed'
       OR SQLERRM NOT LIKE '%cribbage_game_authority_mutation:rpc_required%' THEN
      RAISE;
    END IF;
  END;

  -- The exact settled round is the only valid claim, and outsiders cannot
  -- submit it even though the function is replay-safe.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_outsider,'role','authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.cribbage_advance_postgame(v_game_id,v_next_round_id,v_dealer_game_id,2);
    RAISE EXCEPTION 'outsider_postgame_advance_was_allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='outsider_postgame_advance_was_allowed'
       OR SQLERRM NOT LIKE '%cribbage_advance_postgame:not_in_session%' THEN
      RAISE;
    END IF;
  END;

  -- Disable make-it-take-it for a deterministic rotation assertion. The RPC
  -- must derive the next eligible dealer and deadline inside the game lock.
  UPDATE public.system_settings
     SET value=jsonb_set(coalesce(value,'{}'::jsonb),'{enabled}','false'::jsonb,true)
   WHERE key='make_it_take_it';
  SELECT dealer_position INTO v_old_dealer_position
    FROM public.games WHERE id=v_game_id;
  SELECT array_agg(position ORDER BY position) INTO v_dealer_positions
    FROM public.players
   WHERE game_id=v_game_id
     AND NOT coalesce(sitting_out,false)
     AND status NOT IN ('observer','left')
     AND position IS NOT NULL
     AND NOT coalesce(is_bot,false);
  v_dealer_index:=array_position(v_dealer_positions,coalesce(v_old_dealer_position,1));
  v_expected_dealer_position:=CASE
    WHEN v_dealer_index IS NULL THEN v_dealer_positions[1]
    ELSE v_dealer_positions[(v_dealer_index%cardinality(v_dealer_positions))+1]
  END;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user_one,'role','authenticated')::text,
    true
  );
  v_result:=public.cribbage_advance_postgame(v_game_id,v_next_round_id,v_dealer_game_id,2);
  IF v_result->>'outcome'<>'advanced'
     OR v_result->>'status'<>'game_selection'
     OR (v_result->>'dealer_position')::integer IS DISTINCT FROM v_expected_dealer_position
     OR (SELECT status FROM public.games WHERE id=v_game_id)<>'game_selection'
     OR (SELECT dealer_position FROM public.games WHERE id=v_game_id) IS DISTINCT FROM v_expected_dealer_position
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT current_round FROM public.games WHERE id=v_game_id) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_game_id)<>0
     OR (SELECT config_deadline FROM public.games WHERE id=v_game_id) IS NULL
     OR (SELECT count(*) FROM private.cribbage_postgame_advances
          WHERE game_id=v_game_id AND dealer_game_id=v_dealer_game_id
            AND round_id=v_next_round_id AND hand_number=2)<>1 THEN
    RAISE EXCEPTION 'postgame_advance_failed:%',v_result;
  END IF;

  -- Duplicate clients read the durable result and cannot mutate it or create
  -- a second settlement/claim.
  SELECT to_jsonb(game_row) INTO v_before FROM public.games game_row WHERE id=v_game_id;
  v_replay:=public.cribbage_advance_postgame(v_game_id,v_next_round_id,v_dealer_game_id,2);
  SELECT to_jsonb(game_row) INTO v_after FROM public.games game_row WHERE id=v_game_id;
  IF v_replay->>'outcome'<>'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
     OR v_after IS DISTINCT FROM v_before
     OR (SELECT count(*) FROM public.game_results
          WHERE dealer_game_id=v_dealer_game_id
            AND hand_number=2
            AND settlement_key='cribbage_terminal')<>1 THEN
    RAISE EXCEPTION 'postgame_advance_replay_failed:%',v_replay;
  END IF;

  -- Even after a later dealer game exists, a late replay of the old exact
  -- identity is read-only and cannot clear the newer lifecycle state.
  INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(v_later_dealer_game_id,v_user_two,'cribbage',v_game_id,'{}'::jsonb);
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  UPDATE public.games
     SET status='in_progress',current_game_uuid=v_later_dealer_game_id,
         current_round=1,total_hands=1
   WHERE id=v_game_id;
  PERFORM set_config('app.cribbage_authoritative_write','',true);
  SELECT to_jsonb(game_row) INTO v_before FROM public.games game_row WHERE id=v_game_id;
  v_replay:=public.cribbage_advance_postgame(v_game_id,v_next_round_id,v_dealer_game_id,2);
  SELECT to_jsonb(game_row) INTO v_after FROM public.games game_row WHERE id=v_game_id;
  IF v_replay->>'outcome'<>'already_advanced'
     OR v_after IS DISTINCT FROM v_before
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_game_id)
          IS DISTINCT FROM v_later_dealer_game_id THEN
    RAISE EXCEPTION 'late_postgame_replay_mutated_newer_game:%',v_replay;
  END IF;
END;
$proof$;

ROLLBACK;
