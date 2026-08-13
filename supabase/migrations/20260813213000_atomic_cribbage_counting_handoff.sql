-- Counting resolution is authoritative.  The write that enters `counting`
-- derives the final score ledger immediately, then either records a durable
-- terminal state or deals exactly one non-actionable successor.  The browser
-- may wait for the visible count to finish before activating that successor;
-- it is never the owner of score application, card generation, or hand
-- creation.

CREATE OR REPLACE FUNCTION public.cribbage_finalize_counting(
  _round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_plan jsonb;
  v_turn_order jsonb;
  v_next_turn_order jsonb;
  v_player_count integer;
  v_cards_per_player integer;
  v_points_to_win integer;
  v_target jsonb;
  v_target_index integer;
  v_expected_player_id text;
  v_player_id text;
  v_target_total integer;
  v_combo_total integer;
  v_combo_count integer;
  v_player_state jsonb;
  v_player_score integer;
  v_winner_id text := NULL;
  v_lowest_loser_score integer;
  v_multiplier integer := 1;
  v_deck jsonb;
  v_next_player_states jsonb := '{}'::jsonb;
  v_next_state jsonb;
  v_next_dealer_id text;
  v_next_round_id uuid;
  v_existing_successor public.rounds%ROWTYPE;
  v_hand_cards jsonb;
  v_card_offset integer := 0;
  v_fallback_at timestamptz;
  v_presentation_ms integer := 3000; -- 2s pre-delay + 1s terminal beat.
  v_harness text;
  v_harnesses_enabled boolean := false;
  v_resolution jsonb;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF _round_id IS NULL THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:round_required';
  END IF;

  -- Lock in the same order used by terminal settlement: immutable hand first,
  -- then its owning game.  Replays serialize here and never create a second
  -- successor beside the predecessor unique index.
  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = _round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:round_not_found:%', _round_id;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = v_round.game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:not_cribbage_round';
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:dealer_game_mismatch';
  END IF;

  IF v_actor_id IS NOT NULL
     AND NOT v_is_service_role
     AND NOT public.user_is_in_game(v_round.game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:caller_not_in_session';
  END IF;

  v_state := v_round.cribbage_state;
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:missing_state';
  END IF;

  IF v_state ->> 'phase' = 'complete' THEN
    RETURN jsonb_build_object('outcome', 'terminal', 'state', v_state, 'deduped', true);
  END IF;
  IF v_state ->> 'phase' IS DISTINCT FROM 'counting' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'round_not_counting',
      'phase', coalesce(v_state ->> 'phase', 'null')
    );
  END IF;

  -- A completed resolution is inert.  Its successor, if any, is returned so
  -- a reconnect can activate the exact already-dealt hand rather than deal a
  -- fresh one.
  IF v_state -> 'countingResolution' ->> 'outcome' = 'prepared' THEN
    SELECT * INTO v_existing_successor
      FROM public.rounds
     WHERE predecessor_round_id = v_round.id
     LIMIT 1;
    RETURN jsonb_build_object(
      'outcome', 'prepared',
      'round_id', v_existing_successor.id,
      'hand_number', v_existing_successor.hand_number,
      'presentation_fallback_at', v_existing_successor.presentation_fallback_at,
      'deduped', true,
      'state', v_state
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game_paused');
  END IF;
  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal_game');
  END IF;

  IF jsonb_typeof(v_state -> 'playerStates') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_state -> 'turnOrder') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_state -> 'countingPlan') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:invalid_counting_shape';
  END IF;

  SELECT count(*) INTO v_player_count
    FROM jsonb_object_keys(v_state -> 'playerStates');
  IF v_player_count < 2 OR v_player_count > 4
     OR jsonb_array_length(v_state -> 'turnOrder') <> v_player_count THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:invalid_player_cohort:%', v_player_count;
  END IF;

  v_plan := v_state -> 'countingPlan';
  v_turn_order := v_state -> 'turnOrder';
  IF coalesce((v_plan ->> 'version')::integer, 0) <> 1
     OR jsonb_typeof(v_plan -> 'baselineScores') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_plan -> 'targets') IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_plan -> 'targets') <> v_player_count + 1
     OR v_turn_order ->> (v_player_count - 1) IS DISTINCT FROM v_state ->> 'dealerPlayerId' THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:invalid_counting_plan';
  END IF;

  -- The plan is a presentation schedule, but its baseline must agree with
  -- the durable pegging score.  Refuse to apply a stale or fabricated plan.
  FOR v_player_id IN SELECT jsonb_object_keys(v_state -> 'playerStates') LOOP
    IF NOT (v_plan -> 'baselineScores' ? v_player_id)
       OR (v_plan -> 'baselineScores' ->> v_player_id)::integer
          IS DISTINCT FROM coalesce((v_state -> 'playerStates' -> v_player_id ->> 'pegScore')::integer, 0) THEN
      RAISE EXCEPTION 'cribbage_finalize_counting:baseline_mismatch:%', v_player_id;
    END IF;
  END LOOP;

  v_points_to_win := coalesce(v_game.points_to_win, (v_state ->> 'pointsToWin')::integer, 121);

  -- Apply plan targets in their legal counting order.  This is intentionally
  -- sequential: the first player to reach the target wins, and later hand or
  -- crib targets are never allowed to manufacture a tie after that boundary.
  FOR v_target_index IN 0..v_player_count LOOP
    v_target := v_plan -> 'targets' -> v_target_index;
    v_player_id := v_target ->> 'playerId';
    IF v_target_index < v_player_count - 1 THEN
      v_expected_player_id := v_turn_order ->> v_target_index;
      IF v_target ->> 'type' IS DISTINCT FROM 'hand'
         OR v_player_id IS DISTINCT FROM v_expected_player_id THEN
        RAISE EXCEPTION 'cribbage_finalize_counting:invalid_hand_target:%', v_target_index;
      END IF;
    ELSIF v_target_index = v_player_count - 1 THEN
      IF v_target ->> 'type' IS DISTINCT FROM 'hand'
         OR v_player_id IS DISTINCT FROM v_state ->> 'dealerPlayerId' THEN
        RAISE EXCEPTION 'cribbage_finalize_counting:invalid_dealer_target';
      END IF;
    ELSE
      IF v_target ->> 'type' IS DISTINCT FROM 'crib'
         OR v_player_id IS DISTINCT FROM v_state ->> 'dealerPlayerId' THEN
        RAISE EXCEPTION 'cribbage_finalize_counting:invalid_crib_target';
      END IF;
    END IF;

    IF NOT (v_state -> 'playerStates' ? v_player_id)
       OR jsonb_typeof(v_target -> 'comboPoints') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_target -> 'totalPoints') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'cribbage_finalize_counting:malformed_target:%', v_target_index;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_target -> 'comboPoints') AS combo(value)
       WHERE jsonb_typeof(combo.value) IS DISTINCT FROM 'number'
    ) THEN
      RAISE EXCEPTION 'cribbage_finalize_counting:malformed_combo_points:%', v_target_index;
    END IF;
    SELECT coalesce(sum((combo.value #>> '{}')::integer), 0), count(*)
      INTO v_combo_total, v_combo_count
      FROM jsonb_array_elements(v_target -> 'comboPoints') AS combo(value);
    v_target_total := (v_target ->> 'totalPoints')::integer;
    IF v_target_total < 0 OR v_combo_total IS DISTINCT FROM v_target_total THEN
      RAISE EXCEPTION 'cribbage_finalize_counting:target_total_mismatch:%', v_target_index;
    END IF;

    -- The fallback lease is derived from the exact stored visual plan: per
    -- target enter/initial/exit beats, its combo or zero beats, plus the
    -- shared pre-delay/final beat.  It cannot race a valid visible count.
    v_presentation_ms := v_presentation_ms + 800 + 500 + 1500
      + CASE WHEN v_combo_count = 0 THEN 1000 ELSE (v_combo_count * 2000) + 1500 END;

    v_player_state := v_state -> 'playerStates' -> v_player_id;
    v_player_score := coalesce((v_player_state ->> 'pegScore')::integer, 0) + v_target_total;
    v_player_state := jsonb_set(v_player_state, '{pegScore}', to_jsonb(v_player_score), true);
    v_state := jsonb_set(v_state, ARRAY['playerStates', v_player_id], v_player_state, true);

    IF v_player_score >= v_points_to_win THEN
      v_winner_id := v_player_id;
      EXIT;
    END IF;
  END LOOP;

  IF v_winner_id IS NOT NULL THEN
    SELECT min(coalesce((entry.value ->> 'pegScore')::integer, 0))
      INTO v_lowest_loser_score
      FROM jsonb_each(v_state -> 'playerStates') AS entry(player_id, value)
     WHERE entry.player_id <> v_winner_id;

    v_multiplier := CASE
      WHEN coalesce(v_game.double_skunk_enabled, true)
           AND v_lowest_loser_score < coalesce(v_game.double_skunk_threshold, 61) THEN 3
      WHEN coalesce(v_game.skunk_enabled, true)
           AND v_lowest_loser_score < coalesce(v_game.skunk_threshold, 91) THEN 2
      ELSE 1
    END;
    v_resolution := jsonb_build_object(
      'version', 1,
      'outcome', 'terminal',
      'resolvedAt', to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    v_state := jsonb_set(v_state, '{phase}', '"complete"'::jsonb, true);
    v_state := jsonb_set(v_state, '{winnerPlayerId}', to_jsonb(v_winner_id), true);
    v_state := jsonb_set(v_state, '{loserScore}', to_jsonb(v_lowest_loser_score), true);
    v_state := jsonb_set(v_state, '{payoutMultiplier}', to_jsonb(v_multiplier), true);
    v_state := jsonb_set(v_state, '{matchCompleteLatch}', 'true'::jsonb, true);
    v_state := jsonb_set(v_state, '{countingResolution}', v_resolution, true);
    UPDATE public.rounds SET cribbage_state = v_state WHERE id = v_round.id;
    RETURN jsonb_build_object('outcome', 'terminal', 'state', v_state, 'deduped', false);
  END IF;

  -- A legacy browser may have inserted an active successor immediately before
  -- this migration.  Treat that exact successor as a replay-safe success;
  -- never create another hand beside it.
  SELECT * INTO v_existing_successor
    FROM public.rounds
   WHERE predecessor_round_id = v_round.id
   LIMIT 1;
  IF FOUND THEN
    v_resolution := jsonb_build_object(
      'version', 1,
      'outcome', CASE WHEN v_existing_successor.status = 'dealing' THEN 'prepared' ELSE 'active' END,
      'successorRoundId', v_existing_successor.id,
      'successorHandNumber', v_existing_successor.hand_number,
      'resolvedAt', to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    v_state := jsonb_set(v_state, '{countingResolution}', v_resolution, true);
    UPDATE public.rounds SET cribbage_state = v_state WHERE id = v_round.id;
    RETURN jsonb_build_object(
      'outcome', v_resolution ->> 'outcome',
      'round_id', v_existing_successor.id,
      'hand_number', v_existing_successor.hand_number,
      'deduped', true,
      'state', v_state
    );
  END IF;

  v_cards_per_player := CASE WHEN v_player_count = 2 THEN 6 ELSE 5 END;
  v_next_dealer_id := v_turn_order ->> 0;
  SELECT jsonb_agg(
           entry.value
           ORDER BY CASE WHEN entry.ordinality = 1 THEN v_player_count + 1 ELSE entry.ordinality END
         )
    INTO v_next_turn_order
    FROM jsonb_array_elements(v_turn_order) WITH ORDINALITY AS entry(value, ordinality);

  WITH deck AS (
    SELECT jsonb_build_object(
             'rank', rank,
             'suit', suit,
             'value', CASE WHEN rank = 'A' THEN 1 WHEN rank IN ('J', 'Q', 'K') THEN 10 ELSE rank::integer END
           ) AS card,
           random() AS shuffle_key
      FROM unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY['hearts','diamonds','clubs','spades']) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key) INTO v_deck FROM deck;

  -- Preserve the globally gated renderer harness only.  It remains impossible
  -- in ordinary or real-money play when harnesses_mode is disabled.
  SELECT gd.debug_harness INTO v_harness
    FROM public.game_defaults gd WHERE gd.game_type = 'cribbage' LIMIT 1;
  SELECT coalesce((value ->> 'enabled')::boolean, false) INTO v_harnesses_enabled
    FROM public.system_settings WHERE key = 'harnesses_mode' LIMIT 1;
  IF coalesce(v_harnesses_enabled, false) AND v_harness = 'max_pegging_fan' AND v_player_count = 2 THEN
    v_deck := jsonb_build_array(
      jsonb_build_object('rank','A','suit','spades','value',1),
      jsonb_build_object('rank','A','suit','hearts','value',1),
      jsonb_build_object('rank','2','suit','spades','value',2),
      jsonb_build_object('rank','2','suit','hearts','value',2),
      jsonb_build_object('rank','3','suit','spades','value',3),
      jsonb_build_object('rank','3','suit','hearts','value',3),
      jsonb_build_object('rank','A','suit','diamonds','value',1),
      jsonb_build_object('rank','A','suit','clubs','value',1),
      jsonb_build_object('rank','2','suit','diamonds','value',2),
      jsonb_build_object('rank','2','suit','clubs','value',2),
      jsonb_build_object('rank','3','suit','diamonds','value',3),
      jsonb_build_object('rank','3','suit','clubs','value',3)
    );
  END IF;

  FOR v_target_index IN 0..v_player_count - 1 LOOP
    v_player_id := v_next_turn_order ->> v_target_index;
    SELECT coalesce(jsonb_agg(v_deck -> card_index ORDER BY card_index), '[]'::jsonb)
      INTO v_hand_cards
      FROM generate_series(v_card_offset, v_card_offset + v_cards_per_player - 1) AS card_index;
    v_card_offset := v_card_offset + v_cards_per_player;
    v_next_player_states := jsonb_set(
      v_next_player_states,
      ARRAY[v_player_id],
      jsonb_build_object(
        'playerId', v_player_id,
        'hand', v_hand_cards,
        'pegScore', coalesce((v_state -> 'playerStates' -> v_player_id ->> 'pegScore')::integer, 0),
        'hasCalledGo', false,
        'discardedToCrib', '[]'::jsonb
      ),
      true
    );
  END LOOP;

  v_next_state := jsonb_build_object(
    'phase', 'discarding',
    'dealerPlayerId', v_next_dealer_id,
    'cribOwnerPlayerId', v_next_dealer_id,
    'playerStates', v_next_player_states,
    'turnOrder', v_next_turn_order,
    'crib', '[]'::jsonb,
    'cutCard', NULL,
    'pegging', jsonb_build_object(
      'playedCards', '[]'::jsonb,
      'currentCount', 0,
      'eventSequence', 0,
      'currentTurnPlayerId', v_next_turn_order ->> 0,
      'lastToPlay', NULL,
      'goCalledBy', '[]'::jsonb,
      'sequenceStartIndex', 0
    ),
    'anteAmount', coalesce((v_state ->> 'anteAmount')::integer, v_game.ante_amount, 0),
    'pot', 0,
    'pointsToWin', coalesce(v_game.points_to_win, (v_state ->> 'pointsToWin')::integer, 121),
    'skunkEnabled', coalesce(v_game.skunk_enabled, (v_state ->> 'skunkEnabled')::boolean, true),
    'skunkThreshold', coalesce(v_game.skunk_threshold, (v_state ->> 'skunkThreshold')::integer, 91),
    'doubleSkunkEnabled', coalesce(v_game.double_skunk_enabled, (v_state ->> 'doubleSkunkEnabled')::boolean, true),
    'doubleSkunkThreshold', coalesce(v_game.double_skunk_threshold, (v_state ->> 'doubleSkunkThreshold')::integer, 61),
    'lastEvent', NULL,
    'lastHandCount', NULL,
    'winnerPlayerId', NULL,
    'loserScore', NULL,
    'payoutMultiplier', 1,
    'dealerSelectionCohort', coalesce((v_state ->> 'dealerSelectionCohort')::integer, 0),
    'dealerResolved', true
  );

  -- Five seconds of render-slack is added after the exact plan duration.
  -- The fallback is a lower bound only; the deadline service may run later.
  v_fallback_at := clock_timestamp()
    + make_interval(secs => ceil((v_presentation_ms + 5000)::numeric / 1000)::integer);

  INSERT INTO public.rounds (
    game_id, dealer_game_id, round_number, hand_number,
    cards_dealt, pot, status, cribbage_state, predecessor_round_id,
    presentation_fallback_at
  ) VALUES (
    v_round.game_id, v_round.dealer_game_id, 1, coalesce(v_round.hand_number, 0) + 1,
    v_cards_per_player, 0, 'dealing', v_next_state, v_round.id,
    v_fallback_at
  )
  RETURNING id INTO v_next_round_id;

  FOR v_target_index IN 0..v_player_count - 1 LOOP
    v_player_id := v_next_turn_order ->> v_target_index;
    INSERT INTO public.player_cards (player_id, round_id, cards)
    VALUES (
      v_player_id::uuid,
      v_next_round_id,
      v_next_player_states -> v_player_id -> 'hand'
    )
    ON CONFLICT (player_id, round_id) DO NOTHING;
  END LOOP;

  IF (SELECT count(*) FROM public.player_cards
      WHERE round_id = v_next_round_id
        AND player_id IN (SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(v_next_turn_order)))
     IS DISTINCT FROM v_player_count THEN
    RAISE EXCEPTION 'cribbage_finalize_counting:successor_card_cohort_changed';
  END IF;

  v_resolution := jsonb_build_object(
    'version', 1,
    'outcome', 'prepared',
    'successorRoundId', v_next_round_id,
    'successorHandNumber', coalesce(v_round.hand_number, 0) + 1,
    'presentationFallbackAt', to_char(v_fallback_at AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolvedAt', to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_state := jsonb_set(v_state, '{countingResolution}', v_resolution, true);
  UPDATE public.rounds SET cribbage_state = v_state WHERE id = v_round.id;

  RETURN jsonb_build_object(
    'outcome', 'prepared',
    'round_id', v_next_round_id,
    'hand_number', coalesce(v_round.hand_number, 0) + 1,
    'presentation_fallback_at', v_fallback_at,
    'deduped', false,
    'state', v_state
  );
EXCEPTION WHEN unique_violation THEN
  -- The predecessor unique index is the final concurrent-writer guard.  A
  -- successful competing prepare is a replay, never an error path.
  SELECT * INTO v_existing_successor
    FROM public.rounds
   WHERE predecessor_round_id = _round_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_existing_successor.status = 'dealing' THEN 'prepared' ELSE 'active' END,
      'round_id', v_existing_successor.id,
      'hand_number', v_existing_successor.hand_number,
      'presentation_fallback_at', v_existing_successor.presentation_fallback_at,
      'deduped', true
    );
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_prepared_cribbage_hand(
  p_game_id uuid,
  p_predecessor_round_id uuid,
  p_successor_round_id uuid,
  p_from_fallback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_successor public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:authentication_required';
  END IF;
  IF p_from_fallback AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:fallback_requires_service_role';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:not_cribbage_game';
  END IF;
  IF NOT v_is_service_role
     AND NOT public.user_is_in_game(p_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:caller_not_in_session';
  END IF;

  SELECT * INTO v_predecessor
    FROM public.rounds
   WHERE id = p_predecessor_round_id
     AND game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
   FOR UPDATE;
  SELECT * INTO v_successor
    FROM public.rounds
   WHERE id = p_successor_round_id
     AND game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
     AND predecessor_round_id = p_predecessor_round_id
   FOR UPDATE;

  IF v_predecessor.id IS NULL OR v_successor.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale_identity');
  END IF;
  IF v_successor.status = 'betting'
     AND v_game.total_hands = v_successor.hand_number THEN
    RETURN jsonb_build_object(
      'outcome', 'already_active',
      'round_id', v_successor.id,
      'hand_number', v_successor.hand_number,
      'deduped', true
    );
  END IF;
  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal_game');
  END IF;
  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game_paused');
  END IF;
  IF v_predecessor.cribbage_state -> 'countingResolution' ->> 'outcome' IS DISTINCT FROM 'prepared'
     OR v_successor.status IS DISTINCT FROM 'dealing' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'successor_not_prepared');
  END IF;
  IF p_from_fallback
     AND (v_successor.presentation_fallback_at IS NULL
       OR v_successor.presentation_fallback_at > clock_timestamp()) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'fallback_not_due');
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = v_predecessor.id
     AND status <> 'completed';

  UPDATE public.rounds
     SET status = 'betting',
         presentation_fallback_at = NULL
   WHERE id = v_successor.id
     AND status = 'dealing';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'activation_compare_and_set_failed');
  END IF;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = v_successor.hand_number,
         is_first_hand = false,
         pot = 0
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'activated',
    'round_id', v_successor.id,
    'hand_number', v_successor.hand_number,
    'deduped', false,
    'from_fallback', p_from_fallback
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_complete_counting(
  _round_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_finalization jsonb;
  v_successor public.rounds%ROWTYPE;
BEGIN
  v_finalization := public.cribbage_finalize_counting(_round_id);

  SELECT * INTO v_round FROM public.rounds WHERE id = _round_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_complete_counting:round_not_found:%', _round_id;
  END IF;
  IF v_round.cribbage_state ->> 'phase' = 'complete' THEN
    RETURN jsonb_build_object(
      'outcome', 'terminal',
      'state', v_round.cribbage_state,
      'deduped', coalesce((v_finalization ->> 'deduped')::boolean, false)
    );
  END IF;

  SELECT * INTO v_successor
    FROM public.rounds
   WHERE predecessor_round_id = v_round.id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'successor_missing');
  END IF;
  RETURN public.activate_prepared_cribbage_hand(
    v_round.game_id,
    v_round.id,
    v_successor.id,
    false
  );
END;
$$;

-- Backward compatibility for already-open tabs: old clients may still call
-- this name with client-generated state.  Ignore that untrusted payload,
-- finalize from the stored predecessor, and activate only the one prepared
-- successor.  New clients call cribbage_complete_counting directly.
CREATE OR REPLACE FUNCTION public.cribbage_create_next_hand(
  _predecessor_round_id uuid,
  _cribbage_state jsonb,
  _player_cards jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.cribbage_complete_counting(_predecessor_round_id);
  IF v_result ->> 'outcome' IN ('activated', 'already_active') THEN
    RETURN jsonb_build_object(
      'round_id', v_result -> 'round_id',
      'hand_number', v_result -> 'hand_number',
      'deduped', (v_result ->> 'outcome') = 'already_active'
    );
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cribbage_finish_counting_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cribbage_state IS NULL
     OR NEW.cribbage_state ->> 'phase' IS DISTINCT FROM 'counting'
     OR NEW.cribbage_state -> 'countingResolution' ? 'outcome' THEN
    RETURN NEW;
  END IF;

  PERFORM public.cribbage_finalize_counting(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cribbage_finish_counting_handoff ON public.rounds;
CREATE TRIGGER cribbage_finish_counting_handoff
AFTER UPDATE OF cribbage_state ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.cribbage_finish_counting_handoff();

REVOKE ALL ON FUNCTION public.cribbage_finalize_counting(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_prepared_cribbage_hand(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cribbage_complete_counting(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cribbage_create_next_hand(uuid, jsonb, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cribbage_finalize_counting(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_prepared_cribbage_hand(uuid, uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_complete_counting(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cribbage_create_next_hand(uuid, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.cribbage_finalize_counting(uuid) IS
  'Atomically resolves one counted Cribbage hand to an immutable terminal snapshot or a single prepared successor.';
COMMENT ON FUNCTION public.activate_prepared_cribbage_hand(uuid, uuid, uuid, boolean) IS
  'Activates an exact prepared Cribbage successor after its visible count; service role may recover only after the durable fallback lease.';
