-- Atomic 3-5-7 terminal settlement.
--
-- The terminal result claim, payout, post-payout snapshots, and game/session
-- disposition commit together. Clients provide only the immutable round
-- identity and retain presentation responsibility.

CREATE OR REPLACE FUNCTION public.three_five_seven_settle_game(
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
  v_existing_terminal public.game_results%ROWTYPE;
  v_winner_id uuid;
  v_winner_username text;
  v_result_id uuid;
  v_sweep_count integer;
  v_terminal_winner_count integer;
  v_leg_value integer;
  v_legs_to_win integer;
  v_total_leg_value integer;
  v_payout_amount integer;
  v_chip_changes jsonb;
  v_end_session boolean;
  v_disposition text;
  v_terminal_description text;
  v_is_sweep boolean := false;
  v_updated_player_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:round_not_found:%', p_round_id;
  END IF;
  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:game_not_found:%', p_game_id;
  END IF;

  -- Service-role rollback proofs have no auth UID. Browser callers must be a
  -- session participant or administrator.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:caller_not_in_session';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.dealer_games
     WHERE id = p_dealer_game_id
       AND session_id = p_game_id
       AND game_type IN ('3-5-7', '3-5-7-game', '357')
  ) THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:dealer_game_not_found';
  END IF;

  -- The durable claim makes a replay valid even after terminal lifecycle work
  -- reset legs or moved the game to the next dealer game.
  SELECT * INTO v_existing_terminal
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'three_five_seven_terminal'
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_terminal.game_id IS DISTINCT FROM p_game_id
       OR v_existing_terminal.game_type NOT IN ('3-5-7', '3-5-7-game', '357')
       OR v_existing_terminal.is_chopped IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:authoritative_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_terminal.id,
      'hand_number', p_hand_number,
      'winner_player_id', v_existing_terminal.winner_player_id,
      'payout_amount', v_existing_terminal.pot_won,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END
    );
  END IF;

  IF v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357')
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_round.status = 'completed' THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:game_not_settleable';
  END IF;

  v_leg_value := COALESCE(v_game.leg_value, 1);
  v_legs_to_win := COALESCE(v_game.legs_to_win, 3);
  IF v_leg_value < 0 OR v_legs_to_win <= 0 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:invalid_game_configuration';
  END IF;

  -- Round-one 3/5/7 is an immediate terminal sweep. Exactly one dealt hand
  -- may satisfy the invariant; anything else is ambiguous state.
  IF v_round.round_number = 1 THEN
    SELECT count(*) INTO v_sweep_count
      FROM public.player_cards pc
     WHERE pc.round_id = p_round_id
       AND jsonb_typeof(pc.cards) = 'array'
       AND jsonb_array_length(pc.cards) = 3
       AND (
         SELECT array_agg(card.value->>'rank' ORDER BY card.value->>'rank')
           FROM jsonb_array_elements(pc.cards) AS card(value)
       ) = ARRAY['3', '5', '7']::text[];
  ELSE
    v_sweep_count := 0;
  END IF;

  IF v_sweep_count > 1 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:multiple_sweep_winners';
  ELSIF v_sweep_count = 1 THEN
    v_is_sweep := true;
    SELECT pc.player_id INTO v_winner_id
      FROM public.player_cards pc
     WHERE pc.round_id = p_round_id
       AND jsonb_typeof(pc.cards) = 'array'
       AND jsonb_array_length(pc.cards) = 3
       AND (
         SELECT array_agg(card.value->>'rank' ORDER BY card.value->>'rank')
           FROM jsonb_array_elements(pc.cards) AS card(value)
       ) = ARRAY['3', '5', '7']::text[];
  ELSE
    SELECT count(*) INTO v_terminal_winner_count
      FROM public.players
     WHERE game_id = p_game_id
       AND legs >= v_legs_to_win;
    IF v_terminal_winner_count = 0 THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:no_terminal_winner';
    ELSIF v_terminal_winner_count > 1 THEN
      RAISE EXCEPTION 'three_five_seven_settle_game:terminal_tie_requires_review';
    END IF;
    SELECT id INTO v_winner_id
      FROM public.players
     WHERE game_id = p_game_id
       AND legs >= v_legs_to_win;
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
    RAISE EXCEPTION 'three_five_seven_settle_game:winner_not_in_session';
  END IF;

  SELECT COALESCE(SUM(
           (CASE
              WHEN p.id = v_winner_id AND v_is_sweep
                THEN GREATEST(p.legs, v_legs_to_win)
              ELSE p.legs
            END) * v_leg_value
         ), 0)::integer
    INTO v_total_leg_value
    FROM public.players p
   WHERE p.game_id = p_game_id;
  v_payout_amount := COALESCE(v_game.pot, 0) + v_total_leg_value;

  SELECT COALESCE(jsonb_object_agg(
           p.id::text,
           CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END
         ), '{}'::jsonb)
    INTO v_chip_changes
    FROM public.players p
   WHERE p.game_id = p_game_id;

  v_terminal_description := CASE
    WHEN v_is_sweep THEN '3-5-7 Sweep'
    ELSE v_legs_to_win::text || ' legs'
  END;

  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'three_five_seven_terminal',
    v_game.game_type, v_winner_id, v_winner_username, v_terminal_description,
    v_payout_amount, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  UPDATE public.players p
     SET chips = p.chips + CASE WHEN p.id = v_winner_id THEN v_payout_amount ELSE 0 END,
         legs = 0,
         current_decision = NULL,
         decision_locked = false,
         ante_decision = CASE WHEN p.status = 'observer' THEN p.ante_decision ELSE NULL END
   WHERE p.game_id = p_game_id;
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  IF v_updated_player_count = 0 THEN
    RAISE EXCEPTION 'three_five_seven_settle_game:empty_roster';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL
   WHERE id = p_round_id;

  -- Snapshot post-payout balances before terminal status can trigger result UI.
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

  -- Last: the terminal status is published only after all financial and
  -- snapshot state is durable. Normal game-over keeps its legacy null clock
  -- so the connected table can complete the celebration.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         current_round = NULL,
         awaiting_next_round = false,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         last_round_result = CASE
           WHEN v_is_sweep THEN '357_SWEEP:' || v_winner_username || ':' || v_payout_amount::text
           ELSE '🏆 ' || v_winner_username || ' won the game!'
         END,
         game_over_at = CASE
           WHEN v_end_session THEN COALESCE(game_over_at, v_now)
           ELSE NULL
         END,
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
    'terminal_disposition', v_disposition,
    'is_sweep', v_is_sweep
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.three_five_seven_settle_game(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_settle_game(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.three_five_seven_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles one authoritative terminal 3-5-7 game.';
