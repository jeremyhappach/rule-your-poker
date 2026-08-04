-- Atomic Yahtzee match settlement with replay-safe terminal ownership.
--
-- The persisted scorecards determine the winner. Callers submit only immutable
-- session/dealer-game/hand identity; this function derives the fixed-stake
-- payout, claims the terminal result, moves chips, snapshots post-payout
-- balances, and commits the terminal disposition in one transaction.
-- Replayed callers observe the existing claim and perform no financial writes.

CREATE OR REPLACE FUNCTION public.yahtzee_settle_game(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_state jsonb;
  v_turn_entry record;
  v_score_entry record;
  v_player_key text;
  v_player_id uuid;
  v_player_state jsonb;
  v_scorecard jsonb;
  v_scores jsonb;
  v_score_value integer;
  v_player_total integer;
  v_upper_total integer;
  v_yahtzee_bonuses integer;
  v_score_totals jsonb := '{}'::jsonb;
  v_participant_count integer;
  v_unique_turn_count integer;
  v_state_player_count integer;
  v_matched_player_count integer;
  v_updated_player_count integer;
  v_ante_amount integer;
  v_max_score integer;
  v_winner_count integer;
  v_winner_id uuid;
  v_winner_username text;
  v_score_summary text;
  v_winner_result_username text;
  v_result_description text;
  v_last_round_result text;
  v_total_winner_gain integer;
  v_chip_changes jsonb;
  v_existing_result public.game_results%ROWTYPE;
  v_existing_result_count integer;
  v_result_id uuid;
  v_end_session boolean;
  v_disposition text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_game_id IS NULL
     OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL
     OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'yahtzee_settle_game:missing_identity';
  END IF;

  -- Match the established settlement lock order: immutable round first, then
  -- its owning session row. Concurrent callers for one identity serialize here.
  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yahtzee_settle_game:round_not_found:%', p_round_id;
  END IF;

  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'yahtzee_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yahtzee_settle_game:game_not_found:%', p_game_id;
  END IF;

  IF v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:not_yahtzee:%', v_game.game_type;
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'yahtzee_settle_game:dealer_game_mismatch';
  END IF;

  SELECT * INTO v_dealer_game
    FROM public.dealer_games
   WHERE id = p_dealer_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'yahtzee_settle_game:dealer_game_not_found:%', p_dealer_game_id;
  END IF;
  IF v_dealer_game.session_id IS DISTINCT FROM p_game_id
     OR v_dealer_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:dealer_game_identity_mismatch';
  END IF;

  -- Any authenticated session participant may submit this replay-safe request.
  -- service_role/database maintenance calls have auth.uid() = NULL.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.players
        WHERE game_id = p_game_id
          AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'yahtzee_settle_game:caller_not_in_session';
  END IF;

  v_state := v_round.yahtzee_state;
  IF v_state IS NULL OR pg_catalog.jsonb_typeof(v_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:missing_state';
  END IF;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:round_not_terminal:%',
      COALESCE(v_state->>'gamePhase', 'null');
  END IF;
  IF pg_catalog.jsonb_typeof(v_state->'currentTurnPlayerId') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:terminal_turn_not_clear';
  END IF;
  IF pg_catalog.jsonb_typeof(v_state->'playerStates') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_player_states';
  END IF;
  IF pg_catalog.jsonb_typeof(v_state->'turnOrder') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_turn_order';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_state->'turnOrder') AS entry(value)
     WHERE pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_turn_order_identity';
  END IF;

  SELECT pg_catalog.count(*), pg_catalog.count(DISTINCT entry.player_key)
    INTO v_participant_count, v_unique_turn_count
    FROM pg_catalog.jsonb_array_elements_text(v_state->'turnOrder')
      AS entry(player_key);
  SELECT pg_catalog.count(*)
    INTO v_state_player_count
    FROM pg_catalog.jsonb_object_keys(v_state->'playerStates') AS keys(player_key);

  IF v_participant_count < 2 OR v_participant_count > 7 THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_participant_count:%', v_participant_count;
  END IF;
  IF v_unique_turn_count IS DISTINCT FROM v_participant_count
     OR v_state_player_count IS DISTINCT FROM v_participant_count THEN
    RAISE EXCEPTION 'yahtzee_settle_game:participant_identity_mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_state->'playerStates') AS keys(player_key)
     WHERE NOT EXISTS (
       SELECT 1
         FROM pg_catalog.jsonb_array_elements_text(v_state->'turnOrder')
           AS turns(player_key)
        WHERE turns.player_key = keys.player_key
     )
  ) THEN
    RAISE EXCEPTION 'yahtzee_settle_game:participant_identity_mismatch';
  END IF;

  BEGIN
    PERFORM keys.player_key::uuid
      FROM pg_catalog.jsonb_object_keys(v_state->'playerStates') AS keys(player_key);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'yahtzee_settle_game:malformed_player_identity';
  END;

  SELECT pg_catalog.count(*)
    INTO v_matched_player_count
    FROM public.players p
   WHERE p.game_id = p_game_id
     AND (v_state->'playerStates') ? p.id::text;
  IF v_matched_player_count IS DISTINCT FROM v_participant_count THEN
    RAISE EXCEPTION 'yahtzee_settle_game:participant_membership_mismatch';
  END IF;

  IF pg_catalog.jsonb_typeof(v_dealer_game.config) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_dealer_game.config->'ante_amount') IS DISTINCT FROM 'number'
     OR (v_dealer_game.config->>'ante_amount') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_configured_stake';
  END IF;
  BEGIN
    v_ante_amount := (v_dealer_game.config->>'ante_amount')::integer;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION 'yahtzee_settle_game:invalid_configured_stake';
  END;
  IF v_ante_amount <= 0 OR v_game.ante_amount IS DISTINCT FROM v_ante_amount THEN
    RAISE EXCEPTION 'yahtzee_settle_game:ante_mismatch';
  END IF;
  IF COALESCE(v_game.pot, 0) <> 0
     OR COALESCE(v_round.pot, 0) <> 0 THEN
    RAISE EXCEPTION 'yahtzee_settle_game:unexpected_pot';
  END IF;

  -- Derive every total from the persisted terminal scorecards. No winner,
  -- payout amount, or score summary is accepted from the caller.
  FOR v_turn_entry IN
    SELECT entry.player_key, entry.ordinality
      FROM pg_catalog.jsonb_array_elements_text(v_state->'turnOrder')
        WITH ORDINALITY AS entry(player_key, ordinality)
     ORDER BY entry.ordinality
  LOOP
    v_player_key := v_turn_entry.player_key;
    BEGIN
      v_player_id := v_player_key::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'yahtzee_settle_game:malformed_player_identity';
    END;

    v_player_state := v_state->'playerStates'->v_player_key;
    IF pg_catalog.jsonb_typeof(v_player_state) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_player_state:%', v_player_id;
    END IF;
    IF pg_catalog.jsonb_typeof(v_player_state->'isComplete') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_completion_flag:%', v_player_id;
    END IF;
    IF (v_player_state->>'isComplete')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'yahtzee_settle_game:incomplete_scorecard:%', v_player_id;
    END IF;

    v_scorecard := v_player_state->'scorecard';
    IF pg_catalog.jsonb_typeof(v_scorecard) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_scorecard:%', v_player_id;
    END IF;
    v_scores := v_scorecard->'scores';
    IF pg_catalog.jsonb_typeof(v_scores) IS DISTINCT FROM 'object'
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_scores)) <> 13 THEN
      RAISE EXCEPTION 'yahtzee_settle_game:incomplete_scorecard:%', v_player_id;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_object_keys(v_scores) AS category(name)
       WHERE category.name <> ALL (ARRAY[
         'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
         'three_of_a_kind', 'four_of_a_kind', 'full_house',
         'small_straight', 'large_straight', 'yahtzee', 'chance'
       ]::text[])
    ) THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_score_category:%', v_player_id;
    END IF;

    IF pg_catalog.jsonb_typeof(v_scorecard->'yahtzeeBonuses') IS DISTINCT FROM 'number'
       OR (v_scorecard->>'yahtzeeBonuses') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_yahtzee_bonus:%', v_player_id;
    END IF;
    BEGIN
      v_yahtzee_bonuses := (v_scorecard->>'yahtzeeBonuses')::integer;
    EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_yahtzee_bonus:%', v_player_id;
    END;
    IF v_yahtzee_bonuses < 0 OR v_yahtzee_bonuses > 12 THEN
      RAISE EXCEPTION 'yahtzee_settle_game:invalid_yahtzee_bonus:%', v_player_id;
    END IF;

    v_player_total := 0;
    v_upper_total := 0;
    FOR v_score_entry IN
      SELECT score.key, score.value
        FROM pg_catalog.jsonb_each(v_scores) AS score(key, value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_score_entry.value) IS DISTINCT FROM 'number'
         OR (v_score_entry.value #>> '{}') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'yahtzee_settle_game:invalid_score_value:%:%',
          v_player_id, v_score_entry.key;
      END IF;
      BEGIN
        v_score_value := (v_score_entry.value #>> '{}')::integer;
      EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
        RAISE EXCEPTION 'yahtzee_settle_game:invalid_score_value:%:%',
          v_player_id, v_score_entry.key;
      END;

      -- These are the static score domains produced by yahtzeeScoring.ts.
      -- They reject malformed terminal state without pretending to reconstruct
      -- roll/category history that is not persisted.
      IF (CASE v_score_entry.key
        WHEN 'ones' THEN v_score_value < 0 OR v_score_value > 5
        WHEN 'twos' THEN v_score_value < 0 OR v_score_value > 10 OR v_score_value % 2 <> 0
        WHEN 'threes' THEN v_score_value < 0 OR v_score_value > 15 OR v_score_value % 3 <> 0
        WHEN 'fours' THEN v_score_value < 0 OR v_score_value > 20 OR v_score_value % 4 <> 0
        WHEN 'fives' THEN v_score_value < 0 OR v_score_value > 25 OR v_score_value % 5 <> 0
        WHEN 'sixes' THEN v_score_value < 0 OR v_score_value > 30 OR v_score_value % 6 <> 0
        WHEN 'three_of_a_kind' THEN v_score_value < 0 OR v_score_value > 30
        WHEN 'four_of_a_kind' THEN v_score_value < 0 OR v_score_value > 30
        WHEN 'full_house' THEN v_score_value NOT IN (0, 25)
        WHEN 'small_straight' THEN v_score_value NOT IN (0, 30)
        WHEN 'large_straight' THEN v_score_value NOT IN (0, 40)
        WHEN 'yahtzee' THEN v_score_value NOT IN (0, 50)
        WHEN 'chance' THEN v_score_value < 5 OR v_score_value > 30
        ELSE true
      END) THEN
        RAISE EXCEPTION 'yahtzee_settle_game:invalid_score_value:%:%',
          v_player_id, v_score_entry.key;
      END IF;

      v_player_total := v_player_total + v_score_value;
      IF v_score_entry.key = ANY (ARRAY[
        'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'
      ]::text[]) THEN
        v_upper_total := v_upper_total + v_score_value;
      END IF;
    END LOOP;

    IF v_upper_total >= 63 THEN
      v_player_total := v_player_total + 35;
    END IF;
    v_player_total := v_player_total + (v_yahtzee_bonuses * 100);
    v_score_totals := v_score_totals ||
      pg_catalog.jsonb_build_object(v_player_key, v_player_total);
  END LOOP;

  SELECT pg_catalog.max((entry.value #>> '{}')::integer)
    INTO v_max_score
    FROM pg_catalog.jsonb_each(v_score_totals) AS entry(player_key, value);
  SELECT pg_catalog.count(*)
    INTO v_winner_count
    FROM pg_catalog.jsonb_each(v_score_totals) AS entry(player_key, value)
   WHERE (entry.value #>> '{}')::integer = v_max_score;
  SELECT pg_catalog.string_agg(
           v_score_totals->>entry.player_key,
           '-' ORDER BY (v_score_totals->>entry.player_key)::integer DESC, entry.ordinality
         )
    INTO v_score_summary
    FROM pg_catalog.jsonb_array_elements_text(v_state->'turnOrder')
      WITH ORDINALITY AS entry(player_key, ordinality);

  IF v_winner_count > 1 THEN
    -- A tie is a no-money rollover under the same dealer game. The completed
    -- round is its durable claim; pending_session_end deliberately survives so
    -- LAST HAND is consumed only after a later unique winner.
    SELECT pg_catalog.count(*)
      INTO v_existing_result_count
      FROM public.game_results
     WHERE dealer_game_id = p_dealer_game_id
       AND hand_number = p_hand_number
       AND game_type = 'yahtzee';
    IF v_existing_result_count > 0 THEN
      RAISE EXCEPTION 'yahtzee_settle_game:tie_result_requires_review';
    END IF;

    IF v_round.status = 'completed' THEN
      IF COALESCE(v_game.awaiting_next_round, false) IS DISTINCT FROM true
         AND COALESCE(v_game.total_hands, 0) <= p_hand_number THEN
        RAISE EXCEPTION 'yahtzee_settle_game:legacy_partial_settlement_requires_review';
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'already_settled',
        'result_id', NULL,
        'hand_number', p_hand_number,
        'winner_player_id', NULL,
        'score_summary', v_score_summary,
        'terminal_disposition', 'tie_rollover'
      );
    END IF;

    IF v_game.status IS DISTINCT FROM 'in_progress' THEN
      RAISE EXCEPTION 'yahtzee_settle_game:game_not_settleable:%', v_game.status;
    END IF;
    IF v_game.total_hands IS DISTINCT FROM p_hand_number
       OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
      RAISE EXCEPTION 'yahtzee_settle_game:current_hand_mismatch';
    END IF;

    UPDATE public.rounds
       SET status = 'completed',
           decision_deadline = NULL,
           current_turn_position = NULL
     WHERE id = p_round_id;

    INSERT INTO public.session_player_snapshots (
      game_id, dealer_game_id, player_id, user_id, username,
      chips, is_bot, hand_number
    )
    SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
           COALESCE(
             pr.username,
             CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
           ),
           p.chips, p.is_bot, p_hand_number
      FROM public.players p
      LEFT JOIN public.profiles pr ON pr.id = p.user_id
     WHERE p.game_id = p_game_id
    ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      username = EXCLUDED.username,
      chips = EXCLUDED.chips,
      is_bot = EXCLUDED.is_bot,
      created_at = EXCLUDED.created_at;

    UPDATE public.games
       SET awaiting_next_round = true,
           last_round_result = 'Tie - rollover'
     WHERE id = p_game_id;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'settled',
      'result_id', NULL,
      'hand_number', p_hand_number,
      'winner_player_id', NULL,
      'score_summary', v_score_summary,
      'terminal_disposition', 'tie_rollover'
    );
  END IF;

  SELECT entry.player_key::uuid
    INTO v_winner_id
    FROM pg_catalog.jsonb_each(v_score_totals) AS entry(player_key, value)
   WHERE (entry.value #>> '{}')::integer = v_max_score
   LIMIT 1;

  SELECT COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         )
    INTO v_winner_username
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.id = v_winner_id
     AND p.game_id = p_game_id;
  IF v_winner_username IS NULL THEN
    RAISE EXCEPTION 'yahtzee_settle_game:winner_not_in_session';
  END IF;

  v_total_winner_gain := v_ante_amount * (v_participant_count - 1);
  v_winner_result_username := v_winner_username || ' wins';
  v_result_description := 'Score: ' || v_score_summary;
  v_last_round_result := v_winner_username || ' wins ' || v_score_summary || '!';

  SELECT pg_catalog.jsonb_object_agg(
           keys.player_key,
           CASE WHEN keys.player_key::uuid = v_winner_id
                THEN v_total_winner_gain ELSE -v_ante_amount END
         )
    INTO v_chip_changes
    FROM pg_catalog.jsonb_object_keys(v_state->'playerStates') AS keys(player_key);

  -- New-format replay: the durable result claim is the financial gate.
  SELECT * INTO v_existing_result
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'yahtzee_terminal'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_result.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_result.winner_username IS DISTINCT FROM v_winner_result_username
       OR v_existing_result.winning_hand_description IS DISTINCT FROM v_result_description
       OR v_existing_result.pot_won IS DISTINCT FROM v_total_winner_gain
       OR v_existing_result.player_chip_changes IS DISTINCT FROM v_chip_changes
       OR v_existing_result.is_chopped IS DISTINCT FROM false
       OR v_round.status IS DISTINCT FROM 'completed'
       OR v_game.status NOT IN ('game_over', 'session_ended') THEN
      RAISE EXCEPTION 'yahtzee_settle_game:authoritative_partial_settlement_requires_review';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_winner_id,
      'score_summary', v_score_summary,
      'terminal_disposition', v_game.status
    );
  END IF;

  -- Legacy clients wrote a result only after both generic chip RPCs completed,
  -- but the public legacy policy cannot make that row a trusted financial claim
  -- until terminal lifecycle state also proves completion. Never infer/replay
  -- money through a nonterminal or mismatched legacy partial.
  SELECT pg_catalog.count(*)
    INTO v_existing_result_count
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = 'yahtzee'
     AND settlement_key IS NULL;
  IF v_existing_result_count > 1 THEN
    RAISE EXCEPTION 'yahtzee_settle_game:multiple_legacy_results_require_review';
  END IF;
  IF v_existing_result_count = 1 THEN
    SELECT * INTO v_existing_result
      FROM public.game_results
     WHERE dealer_game_id = p_dealer_game_id
       AND hand_number = p_hand_number
       AND game_type = 'yahtzee'
       AND settlement_key IS NULL
     LIMIT 1;

    IF v_existing_result.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_result.winner_username IS DISTINCT FROM v_winner_result_username
       OR v_existing_result.winning_hand_description IS DISTINCT FROM v_result_description
       OR v_existing_result.pot_won IS DISTINCT FROM v_total_winner_gain
       OR v_existing_result.player_chip_changes IS DISTINCT FROM v_chip_changes
       OR v_existing_result.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'yahtzee_settle_game:legacy_result_mismatch_requires_review';
    END IF;
    IF v_game.status NOT IN ('game_over', 'session_ended') THEN
      RAISE EXCEPTION 'yahtzee_settle_game:legacy_partial_settlement_requires_review';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_winner_id,
      'score_summary', v_score_summary,
      'terminal_disposition', v_game.status,
      'legacy_result', true
    );
  END IF;

  IF v_round.status = 'completed'
     OR v_game.status IN ('game_over', 'session_ended') THEN
    RAISE EXCEPTION 'yahtzee_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'yahtzee_settle_game:game_not_settleable:%', v_game.status;
  END IF;
  IF v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RAISE EXCEPTION 'yahtzee_settle_game:current_hand_mismatch';
  END IF;

  -- Claim first. Any later exception rolls this insert back together with all
  -- chip, snapshot, and lifecycle writes, so a retry starts cleanly.
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'yahtzee_terminal', 'yahtzee',
    v_winner_id, v_winner_result_username, v_result_description,
    v_total_winner_gain, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  UPDATE public.players p
     SET chips = p.chips + CASE
       WHEN p.id = v_winner_id THEN v_total_winner_gain
       ELSE -v_ante_amount
     END
   WHERE p.game_id = p_game_id
     AND (v_state->'playerStates') ? p.id::text;
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  IF v_updated_player_count IS DISTINCT FROM v_participant_count THEN
    RAISE EXCEPTION 'yahtzee_settle_game:payout_roster_changed';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  -- Snapshot after payout and before games.status fires record_session_results.
  -- A pre-payout departure snapshot at this identity is replaced with the final
  -- balance; the canonical unique index makes the batch replay-safe.
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
         COALESCE(
           pr.username,
           CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player ' || p.position::text END
         ),
         p.chips, p.is_bot, p_hand_number
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.game_id = p_game_id
  ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    username = EXCLUDED.username,
    chips = EXCLUDED.chips,
    is_bot = EXCLUDED.is_bot,
    created_at = EXCLUDED.created_at;

  v_end_session := COALESCE(v_game.pending_session_end, false);
  v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;

  -- Deliberately last. In real-money LAST HAND, record_session_results runs
  -- within this transaction and reads the post-payout snapshot batch above.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         awaiting_next_round = false,
         last_round_result = v_last_round_result,
         game_over_at = COALESCE(game_over_at, v_now),
         session_ended_at = CASE
           WHEN v_end_session THEN COALESCE(session_ended_at, v_now)
           ELSE session_ended_at
         END,
         pending_session_end = CASE
           WHEN v_end_session THEN false
           ELSE pending_session_end
         END
   WHERE id = p_game_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'hand_number', p_hand_number,
    'winner_player_id', v_winner_id,
    'score_summary', v_score_summary,
    'amount_per_loser', v_ante_amount,
    'total_winner_gain', v_total_winner_gain,
    'terminal_disposition', v_disposition
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.yahtzee_settle_game(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yahtzee_settle_game(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.yahtzee_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles one authoritative terminal Yahtzee match or tie rollover.';
