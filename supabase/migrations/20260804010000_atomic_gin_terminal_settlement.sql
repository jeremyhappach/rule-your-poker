-- Atomic Gin Rummy terminal settlement.
--
-- The final hand-history row and terminal result claim are written together.
-- That claim, fixed match payout, post-payout snapshots, and game/session
-- disposition are one replay-safe transaction. Clients submit identity only
-- and retain responsibility for presentation.

CREATE OR REPLACE FUNCTION public.gin_rummy_settle_game(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_dealer_config jsonb;
  v_state jsonb;
  v_knock_result jsonb;
  v_match_scores jsonb;
  v_winner_id uuid;
  v_loser_id uuid;
  v_hand_winner_id uuid;
  v_winner_score integer;
  v_loser_score integer;
  v_points_to_win integer;
  v_ante_amount integer;
  v_per_point_value integer;
  v_payout_amount integer;
  v_hand_points integer;
  v_knocker_deadwood integer;
  v_opponent_deadwood integer;
  v_winner_username text;
  v_hand_description text;
  v_terminal_description text;
  v_chip_changes jsonb;
  v_hand_chip_changes jsonb;
  v_existing_terminal public.game_results%ROWTYPE;
  v_existing_hand public.game_results%ROWTYPE;
  v_existing_hand_count integer;
  v_result_id uuid;
  v_end_session boolean;
  v_disposition text;
  v_updated_player_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_not_found:%', p_round_id;
  END IF;

  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:game_not_found:%', p_game_id;
  END IF;

  -- A service-role/database proof has auth.uid() = NULL. Every browser caller
  -- must otherwise be a participant in this session or an administrator.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:caller_not_in_session';
  END IF;

  SELECT config INTO v_dealer_config
    FROM public.dealer_games
   WHERE id = p_dealer_game_id
     AND session_id = p_game_id
     AND game_type = 'gin-rummy';
  IF NOT FOUND OR jsonb_typeof(v_dealer_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:dealer_game_not_found';
  END IF;

  v_state := v_round.gin_rummy_state;
  IF jsonb_typeof(v_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_state';
  END IF;
  IF v_state->>'phase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:round_not_complete:%',
      COALESCE(v_state->>'phase', 'null');
  END IF;
  IF jsonb_typeof(v_state->'playerStates') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(v_state->'playerStates')) <> 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_player_roster';
  END IF;
  IF jsonb_typeof(v_state->'matchScores') IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(v_state->'matchScores')) <> 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_match_scores';
  END IF;

  BEGIN
    v_winner_id := NULLIF(v_state->>'winnerPlayerId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_winner';
  END;
  IF v_winner_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:tie_not_terminal';
  END IF;
  IF NOT (v_state->'playerStates' ? v_winner_id::text) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:winner_not_in_roster';
  END IF;

  BEGIN
    SELECT key::uuid INTO v_loser_id
      FROM jsonb_object_keys(v_state->'playerStates') AS key
     WHERE key::uuid <> v_winner_id
     LIMIT 1;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_player_identity';
  END;
  IF v_loser_id IS NULL THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_player_roster';
  END IF;

  IF COALESCE(v_dealer_config->>'points_to_win', '') !~ '^[1-9][0-9]*$'
     OR COALESCE(v_dealer_config->>'per_point_value', '0') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_dealer_config';
  END IF;
  BEGIN
    v_points_to_win := (v_dealer_config->>'points_to_win')::integer;
    v_per_point_value := COALESCE((v_dealer_config->>'per_point_value')::integer, 0);
    v_ante_amount := (v_state->>'anteAmount')::integer;
    v_winner_score := (v_state->'matchScores'->>v_winner_id::text)::integer;
    v_loser_score := (v_state->'matchScores'->>v_loser_id::text)::integer;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_terminal_state';
  END;
  IF v_points_to_win <= 0 OR v_per_point_value < 0
     OR v_ante_amount < 0 OR v_winner_score < 0 OR v_loser_score < 0
     OR v_ante_amount IS DISTINCT FROM v_game.ante_amount
     OR (v_state->>'pointsToWin') IS DISTINCT FROM v_points_to_win::text
     OR v_winner_score < v_points_to_win
     OR v_winner_score <= v_loser_score THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_terminal_scores';
  END IF;

  v_knock_result := v_state->'knockResult';
  IF jsonb_typeof(v_knock_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:missing_hand_result';
  END IF;
  BEGIN
    v_hand_winner_id := (v_knock_result->>'winnerId')::uuid;
    v_hand_points := (v_knock_result->>'pointsAwarded')::integer;
    v_knocker_deadwood := (v_knock_result->>'knockerDeadwood')::integer;
    v_opponent_deadwood := (v_knock_result->>'opponentDeadwood')::integer;
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:malformed_hand_result';
  END;
  IF v_hand_winner_id IS DISTINCT FROM v_winner_id
     OR v_hand_points <= 0
     OR v_knocker_deadwood < 0
     OR v_opponent_deadwood < 0
     OR jsonb_typeof(v_knock_result->'isGin') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_knock_result->'isUndercut') IS DISTINCT FROM 'boolean'
     OR ((v_knock_result->>'isGin')::boolean AND (v_knock_result->>'isUndercut')::boolean) THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:invalid_hand_result';
  END IF;

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
    RAISE EXCEPTION 'gin_rummy_settle_game:winner_not_in_session';
  END IF;

  v_payout_amount := v_ante_amount
    + ((v_winner_score - v_loser_score) * v_per_point_value);
  v_chip_changes := jsonb_build_object(
    v_winner_id::text, v_payout_amount,
    v_loser_id::text, -v_payout_amount
  );
  v_hand_chip_changes := jsonb_build_object(
    v_winner_id::text, v_ante_amount,
    v_loser_id::text, -v_ante_amount
  );
  v_hand_description := CASE
    WHEN (v_knock_result->>'isGin')::boolean
      THEN 'Gin! +' || v_hand_points::text || ' pts'
    WHEN (v_knock_result->>'isUndercut')::boolean
      THEN 'Undercut! +' || v_hand_points::text || ' pts'
    ELSE 'Knock (' || v_knocker_deadwood::text || ' vs '
      || v_opponent_deadwood::text || ') +' || v_hand_points::text || ' pts'
  END;
  v_terminal_description := v_winner_username || ' wins '
    || v_winner_score::text || '-' || v_loser_score::text
    || ' +$' || v_payout_amount::text;

  -- An existing durable claim is a valid replay even after ordinary lifecycle
  -- progression moved this session to a different dealer game.
  SELECT * INTO v_existing_terminal
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'gin_rummy_terminal'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_terminal.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_terminal.pot_won IS DISTINCT FROM v_payout_amount
       OR v_existing_terminal.player_chip_changes IS DISTINCT FROM v_chip_changes
       OR v_existing_terminal.winning_hand_description IS DISTINCT FROM v_terminal_description
       OR v_existing_terminal.game_type IS DISTINCT FROM 'gin-rummy'
       OR v_existing_terminal.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'gin_rummy_settle_game:authoritative_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_terminal.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_winner_id,
      'payout_amount', v_payout_amount,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END
    );
  END IF;

  IF v_game.game_type IS DISTINCT FROM 'gin-rummy'
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_round.status = 'completed' THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:game_not_settleable';
  END IF;

  -- A pre-cutover browser can only have written one non-financial final hand
  -- record. Accept an exact match; reject every ambiguous legacy partial.
  SELECT count(*) INTO v_existing_hand_count
    FROM public.game_results
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = 'gin-rummy'
     AND settlement_key IS NULL;
  IF v_existing_hand_count > 1 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_existing_hand_count = 1 THEN
    SELECT * INTO v_existing_hand
      FROM public.game_results
     WHERE game_id = p_game_id
       AND dealer_game_id = p_dealer_game_id
       AND hand_number = p_hand_number
       AND game_type = 'gin-rummy'
       AND settlement_key IS NULL
     LIMIT 1;
    IF v_existing_hand.winner_player_id IS DISTINCT FROM v_winner_id
       OR v_existing_hand.pot_won IS DISTINCT FROM v_ante_amount
       OR v_existing_hand.player_chip_changes IS DISTINCT FROM v_hand_chip_changes
       OR v_existing_hand.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'gin_rummy_settle_game:legacy_hand_result_mismatch_requires_review';
    END IF;
  ELSE
    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, settlement_key, game_type,
      winner_player_id, winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped
    ) VALUES (
      p_game_id, p_dealer_game_id, p_hand_number, 'gin_rummy_hand_history', 'gin-rummy',
      v_winner_id, v_winner_username, v_winner_username || ': ' || v_hand_description,
      v_ante_amount, v_hand_chip_changes, false
    );
  END IF;

  -- The durable terminal result is the claim. Any later failure rolls it back
  -- with the transfer, snapshot batch, and disposition, so replay starts clean.
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'gin_rummy_terminal', 'gin-rummy',
    v_winner_id, v_winner_username, v_terminal_description,
    v_payout_amount, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  UPDATE public.players p
     SET chips = p.chips + CASE
       WHEN p.id = v_winner_id THEN v_payout_amount
       WHEN p.id = v_loser_id THEN -v_payout_amount
       ELSE 0
     END
   WHERE p.game_id = p_game_id
     AND p.id IN (v_winner_id, v_loser_id);
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  IF v_updated_player_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'gin_rummy_settle_game:payout_roster_changed';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  -- Snapshot after payout and before terminal status fires SessionResult.
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

  -- Last: `record_session_results` reads the post-payout snapshot batch.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         awaiting_next_round = false,
         last_round_result = v_terminal_description,
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

  RETURN jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'hand_number', p_hand_number,
    'winner_player_id', v_winner_id,
    'payout_amount', v_payout_amount,
    'terminal_disposition', v_disposition
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gin_rummy_settle_game(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gin_rummy_settle_game(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.gin_rummy_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles one authoritative terminal Gin Rummy match.';
