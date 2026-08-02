-- Atomic Cribbage terminal settlement.
--
-- The result row is the durable settlement claim. The claim, chip transfer,
-- post-payout snapshots, terminal disposition, and real-money SessionResult
-- writes all execute in this one PostgreSQL transaction. Replayed callers
-- observe the existing claim and perform no financial writes.

ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS settlement_key text;

CREATE UNIQUE INDEX IF NOT EXISTS game_results_terminal_settlement_key
  ON public.game_results (dealer_game_id, hand_number, settlement_key)
  WHERE settlement_key IS NOT NULL;

COMMENT ON COLUMN public.game_results.settlement_key IS
  'Stable server-authored idempotency discriminator for authoritative settlement rows.';

-- The historical client insert policy remains necessary for games that have
-- not yet migrated, but a browser must never be able to manufacture a durable
-- settlement claim. SECURITY DEFINER settlement functions bypass this RLS
-- check and are the only writers allowed to set settlement_key.
DROP POLICY IF EXISTS "Anyone can insert game results" ON public.game_results;
CREATE POLICY "Anyone can insert non-settlement game results"
  ON public.game_results
  FOR INSERT
  WITH CHECK (settlement_key IS NULL);

-- SessionResult is itself financial output. Give it a durable source identity
-- instead of relying only on games.status never being moved away from terminal.
ALTER TABLE public.player_transactions
  ADD COLUMN IF NOT EXISTS source_game_id uuid
    REFERENCES public.games(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS player_transactions_session_result_game_profile_key
  ON public.player_transactions (source_game_id, profile_id)
  WHERE transaction_type = 'SessionResult' AND source_game_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_session_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  player_total RECORD;
  game_name text;
BEGIN
  IF (NEW.status = 'completed' OR NEW.status = 'session_ended')
     AND OLD.status IS DISTINCT FROM 'completed'
     AND OLD.status IS DISTINCT FROM 'session_ended'
     AND NEW.real_money = true THEN

    game_name := COALESCE(NEW.name, 'Unnamed Session');

    FOR player_total IN
      SELECT DISTINCT ON (user_id)
        user_id,
        chips AS final_chips
      FROM public.session_player_snapshots
      WHERE game_id = NEW.id
        AND is_bot = false
      ORDER BY user_id, created_at DESC
    LOOP
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = player_total.user_id) THEN
        INSERT INTO public.player_transactions (
          profile_id, transaction_type, amount, notes, source_game_id
        ) VALUES (
          player_total.user_id, 'SessionResult', player_total.final_chips,
          game_name, NEW.id
        )
        ON CONFLICT (source_game_id, profile_id)
          WHERE transaction_type = 'SessionResult' AND source_game_id IS NOT NULL
        DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cribbage_settle_game(
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
  v_state jsonb;
  v_existing_result_id uuid;
  v_winner_id uuid;
  v_winner_username text;
  v_points_to_win integer;
  v_winner_score integer;
  v_lowest_loser_score integer;
  v_ante_amount integer;
  v_multiplier integer;
  v_amount_per_loser integer;
  v_participant_count integer;
  v_matched_player_count integer;
  v_updated_player_count integer;
  v_total_winner_gain integer;
  v_chip_changes jsonb;
  v_result_description text;
  v_result_id uuid;
  v_end_session boolean;
  v_disposition text;
  v_now timestamptz := now();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'cribbage_settle_game:missing_identity';
  END IF;

  -- Match Holm's lock order: immutable round first, then its owning game.
  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_settle_game:round_not_found:%', p_round_id;
  END IF;

  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'cribbage_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_settle_game:game_not_found:%', p_game_id;
  END IF;

  IF v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_settle_game:not_cribbage:%', v_game.game_type;
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'cribbage_settle_game:dealer_game_mismatch';
  END IF;

  -- Any authenticated session participant may submit the replay-safe request.
  -- service_role/database maintenance calls have auth.uid() = NULL.
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_settle_game:caller_not_in_session';
  END IF;

  v_state := v_round.cribbage_state;
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION 'cribbage_settle_game:missing_state';
  END IF;
  IF v_state->>'phase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'cribbage_settle_game:round_not_terminal:%', COALESCE(v_state->>'phase', 'null');
  END IF;
  IF jsonb_typeof(v_state->'playerStates') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'cribbage_settle_game:invalid_player_states';
  END IF;

  BEGIN
    v_winner_id := NULLIF(v_state->>'winnerPlayerId', '')::uuid;
    v_points_to_win := COALESCE(v_game.points_to_win, 121);
    v_ante_amount := COALESCE((v_state->>'anteAmount')::integer, v_game.ante_amount);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'cribbage_settle_game:malformed_terminal_state';
  END;

  IF v_winner_id IS NULL THEN
    RAISE EXCEPTION 'cribbage_settle_game:missing_winner';
  END IF;
  IF v_ante_amount IS NULL OR v_ante_amount < 0 OR v_ante_amount IS DISTINCT FROM v_game.ante_amount THEN
    RAISE EXCEPTION 'cribbage_settle_game:ante_mismatch';
  END IF;
  SELECT count(*) INTO v_participant_count
    FROM jsonb_object_keys(v_state->'playerStates');
  IF v_participant_count < 2 OR v_participant_count > 4 THEN
    RAISE EXCEPTION 'cribbage_settle_game:invalid_participant_count:%', v_participant_count;
  END IF;

  -- Casting every key proves UUID identity. The count comparison proves that
  -- every terminal-state participant belongs to this game.
  PERFORM player_key::uuid
    FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key);

  SELECT count(*) INTO v_matched_player_count
    FROM public.players p
   WHERE p.game_id = p_game_id
     AND EXISTS (
       SELECT 1
         FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key)
        WHERE keys.player_key = p.id::text
     );
  IF v_matched_player_count IS DISTINCT FROM v_participant_count THEN
    RAISE EXCEPTION 'cribbage_settle_game:participant_membership_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players
     WHERE id = v_winner_id AND game_id = p_game_id
  ) OR NOT (v_state->'playerStates' ? v_winner_id::text) THEN
    RAISE EXCEPTION 'cribbage_settle_game:winner_not_participant';
  END IF;

  v_winner_score := COALESCE(
    (v_state->'playerStates'->(v_winner_id::text)->>'pegScore')::integer,
    -1
  );
  IF v_winner_score < v_points_to_win THEN
    RAISE EXCEPTION 'cribbage_settle_game:winner_below_target:%/%', v_winner_score, v_points_to_win;
  END IF;

  -- Financial classification is server-derived from the persisted scoreboard
  -- and authoritative game configuration. Never trust a client-authored
  -- payoutMultiplier for chip movement.
  SELECT min((entry.value->>'pegScore')::integer)
    INTO v_lowest_loser_score
    FROM jsonb_each(v_state->'playerStates') AS entry(player_key, value)
   WHERE entry.player_key::uuid <> v_winner_id;
  IF v_lowest_loser_score IS NULL THEN
    RAISE EXCEPTION 'cribbage_settle_game:missing_loser_score';
  END IF;
  v_multiplier := CASE
    WHEN COALESCE(v_game.double_skunk_enabled, true)
         AND v_lowest_loser_score < COALESCE(v_game.double_skunk_threshold, 61) THEN 3
    WHEN COALESCE(v_game.skunk_enabled, true)
         AND v_lowest_loser_score < COALESCE(v_game.skunk_threshold, 91) THEN 2
    ELSE 1
  END;

  -- New-format replay: the durable result claim is the only financial gate.
  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'cribbage_terminal'
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result_id,
      'hand_number', p_hand_number,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END
    );
  END IF;

  -- Legacy completed games have no settlement_key. Never replay their money
  -- from inference; recognize a terminal result as already settled, and fail
  -- loudly on a completed-without-result partial state.
  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = 'cribbage'
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    -- A legacy result row proves that older client code already moved money,
    -- but only a terminal game row proves that its lifecycle also finished.
    -- Never hide a historical partial settlement behind a successful replay.
    IF v_game.status NOT IN ('game_over', 'session_ended') THEN
      RAISE EXCEPTION 'cribbage_settle_game:legacy_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result_id,
      'hand_number', p_hand_number,
      'terminal_disposition', CASE
        WHEN v_game.status = 'session_ended' THEN 'session_ended'
        ELSE 'game_over'
      END,
      'legacy_result', true
    );
  END IF;
  IF v_round.status = 'completed' OR v_game.status IN ('game_over', 'session_ended') THEN
    RAISE EXCEPTION 'cribbage_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'cribbage_settle_game:game_not_settleable:%', v_game.status;
  END IF;

  SELECT COALESCE(pr.username, 'Player ' || p.position::text)
    INTO v_winner_username
    FROM public.players p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
   WHERE p.id = v_winner_id AND p.game_id = p_game_id;

  v_amount_per_loser := v_ante_amount * v_multiplier;
  v_total_winner_gain := v_amount_per_loser * (v_participant_count - 1);
  v_result_description := v_winner_username || ' wins' ||
    CASE v_multiplier WHEN 3 THEN ' Double-Skunk!' WHEN 2 THEN ' Skunk!' ELSE '' END ||
    ' +$' || v_total_winner_gain::text;

  SELECT jsonb_object_agg(
           keys.player_key,
           CASE WHEN keys.player_key::uuid = v_winner_id
                THEN v_total_winner_gain ELSE -v_amount_per_loser END
         )
    INTO v_chip_changes
    FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key);

  -- Claim first. Any later exception rolls this insert back with all other
  -- effects, so a retry can safely attempt the whole transaction again.
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'cribbage_terminal', 'cribbage',
    v_winner_id, v_winner_username, v_result_description,
    v_total_winner_gain, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  UPDATE public.players p
     SET chips = p.chips + CASE
       WHEN p.id = v_winner_id THEN v_total_winner_gain
       ELSE -v_amount_per_loser
     END
   WHERE p.game_id = p_game_id
     AND EXISTS (
       SELECT 1
         FROM jsonb_object_keys(v_state->'playerStates') AS keys(player_key)
        WHERE keys.player_key = p.id::text
     );
  GET DIAGNOSTICS v_updated_player_count = ROW_COUNT;
  IF v_updated_player_count IS DISTINCT FROM v_participant_count THEN
    RAISE EXCEPTION 'cribbage_settle_game:payout_roster_changed';
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  -- Snapshot after payout, before the games.status transition that fires
  -- record_session_results. A departure snapshot may already occupy this
  -- identity; the terminal financial owner must replace that pre-payout value
  -- with the final balance. Replays write the same authoritative values.
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT p.game_id, p_dealer_game_id, p.id, p.user_id,
         COALESCE(pr.username, CASE WHEN p.is_bot THEN 'Bot' ELSE 'Unknown' END),
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

  -- This is deliberately last. For real-money LAST HAND, the existing trigger
  -- inserts SessionResult rows inside this same transaction and now sees the
  -- post-payout snapshot batch above.
  UPDATE public.games
     SET status = v_disposition,
         pot = 0,
         last_round_result = v_result_description,
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
    'amount_per_loser', v_amount_per_loser,
    'total_winner_gain', v_total_winner_gain,
    'terminal_disposition', v_disposition
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cribbage_settle_game(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_settle_game(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cribbage_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and idempotently settles one authoritative terminal Cribbage match.';
