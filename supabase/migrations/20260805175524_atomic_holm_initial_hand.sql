-- Start Holm's first hand as one authenticated, replay-safe transaction.
-- The browser supplies only the game identity; PostgreSQL owns the hand
-- identity, ante movement, deal, round row, player cards, and game pointers.

CREATE OR REPLACE FUNCTION public.start_holm_initial_hand(
  _game_id uuid,
  _skip_ante_collection boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing_round public.rounds%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_player_ids uuid[];
  v_occupied_positions integer[];
  v_player_count integer;
  v_existing_round_count integer;
  v_updated_count integer;
  v_ante_amount integer;
  v_pot integer;
  v_buck_position integer;
  v_timer_seconds integer;
  v_deadline timestamptz;
  v_round_id uuid;
  v_deck jsonb;
  v_community_cards jsonb;
  v_card_offset integer := 4;
  v_ante_changes jsonb;
  v_player_id uuid;
BEGIN
  IF _skip_ante_collection THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'legacy-recovery-not-supported'
    );
  END IF;

  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'start_holm_initial_hand:authentication_required';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-not-found');
  END IF;

  IF NOT v_is_service_role
     AND NOT EXISTS (
       SELECT 1
         FROM public.players participant
        WHERE participant.game_id = _game_id
          AND participant.user_id = v_actor_id
          AND participant.status NOT IN ('observer', 'left')
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles profile
        WHERE profile.id = v_actor_id
          AND coalesce(profile.is_superuser, false)
     ) THEN
    RAISE EXCEPTION 'start_holm_initial_hand:not_participant';
  END IF;

  IF coalesce(v_game.game_type, '') <> 'holm-game' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'wrong-game-type',
      'game_type', v_game.game_type
    );
  END IF;

  IF v_game.current_game_uuid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'no-dealer-game');
  END IF;

  -- A delayed or duplicate caller receives the immutable first-hand identity.
  -- This check intentionally precedes the phase guard so a replay remains safe
  -- after the transaction has advanced the game to in_progress or terminal.
  SELECT *
    INTO v_existing_round
    FROM public.rounds
   WHERE game_id = _game_id
     AND dealer_game_id = v_game.current_game_uuid
     AND hand_number = 1
     AND round_number = 1
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-started',
      'round_id', v_existing_round.id,
      'dealer_game_id', v_game.current_game_uuid,
      'hand_number', 1,
      'buck_position', v_existing_round.current_turn_position,
      'pot', v_existing_round.pot,
      'deduped', true
    );
  END IF;

  IF v_game.status <> 'ante_decision' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'wrong-status',
      'status', v_game.status
    );
  END IF;

  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game-paused');
  END IF;

  IF NOT coalesce(v_game.is_first_hand, false) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'partial-start-detected'
    );
  END IF;

  SELECT count(*)
    INTO v_existing_round_count
    FROM public.rounds
   WHERE game_id = _game_id
     AND dealer_game_id = v_game.current_game_uuid;

  IF v_existing_round_count <> 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'unexpected-existing-rounds',
      'existing_round_count', v_existing_round_count
    );
  END IF;

  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)::integer
    INTO v_player_ids, v_occupied_positions, v_player_count
    FROM public.players
   WHERE game_id = _game_id
     AND status = 'active'
     AND sitting_out = false
     AND ante_decision = 'ante_up';

  IF coalesce(v_player_count, 0) < 2 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'insufficient-ante-up',
      'count', coalesce(v_player_count, 0)
    );
  END IF;

  IF 4 + (4 * v_player_count) > 52 THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'too-many-players',
      'count', v_player_count
    );
  END IF;

  IF v_game.dealer_position IS NULL
     OR NOT (v_game.dealer_position = ANY(v_occupied_positions)) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'invalid-dealer-position',
      'dealer_position', v_game.dealer_position
    );
  END IF;

  -- Canonical seat-ring clockwise order is the nearest lower occupied
  -- position, wrapping from the lowest position to the highest.
  SELECT max(position)
    INTO v_buck_position
    FROM unnest(v_occupied_positions) AS occupied(position)
   WHERE position < v_game.dealer_position;

  IF v_buck_position IS NULL THEN
    SELECT max(position)
      INTO v_buck_position
      FROM unnest(v_occupied_positions) AS occupied(position);
  END IF;

  v_ante_amount := coalesce(v_game.ante_amount, 1);
  v_pot := v_player_count * v_ante_amount;

  SELECT coalesce(defaults.decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults defaults
   WHERE defaults.game_type = 'holm'
   LIMIT 1;

  v_timer_seconds := coalesce(v_timer_seconds, 30);
  v_deadline := clock_timestamp() + make_interval(secs => v_timer_seconds);

  WITH deck AS (
    SELECT jsonb_build_object('rank', rank, 'suit', suit) AS card,
           random() AS shuffle_key
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS ranks(rank)
      CROSS JOIN unnest(ARRAY[chr(9824), chr(9829), chr(9830), chr(9827)]) AS suits(suit)
  )
  SELECT jsonb_agg(card ORDER BY shuffle_key)
    INTO v_deck
    FROM deck;

  v_community_cards := jsonb_build_array(
    v_deck->0,
    v_deck->1,
    v_deck->2,
    v_deck->3
  );

  UPDATE public.players
     SET chips = chips - v_ante_amount,
         current_decision = NULL,
         decision_locked = false
   WHERE id = ANY(v_player_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_player_count THEN
    RAISE EXCEPTION 'start_holm_initial_hand:ante_cohort_changed';
  END IF;

  -- Clear stale decisions for non-participating seats without moving chips.
  UPDATE public.players
     SET current_decision = NULL,
         decision_locked = false
   WHERE game_id = _game_id
     AND NOT (id = ANY(v_player_ids));

  SELECT jsonb_object_agg(player_id::text, -v_ante_amount)
    INTO v_ante_changes
    FROM unnest(v_player_ids) AS players(player_id);

  INSERT INTO public.game_results (
    game_id,
    dealer_game_id,
    hand_number,
    winner_player_id,
    winner_username,
    winning_hand_description,
    pot_won,
    player_chip_changes,
    is_chopped,
    game_type
  ) VALUES (
    _game_id,
    v_game.current_game_uuid,
    1,
    NULL,
    'Ante',
    v_player_count::text || ' players anted $' || v_ante_amount::text,
    0,
    v_ante_changes,
    false,
    'holm'
  );

  INSERT INTO public.rounds (
    game_id,
    round_number,
    cards_dealt,
    status,
    pot,
    decision_deadline,
    community_cards,
    community_cards_revealed,
    chucky_active,
    current_turn_position,
    hand_number,
    dealer_game_id
  ) VALUES (
    _game_id,
    1,
    4,
    'betting',
    v_pot,
    v_deadline,
    v_community_cards,
    2,
    false,
    v_buck_position,
    1,
    v_game.current_game_uuid
  )
  RETURNING id INTO v_round_id;

  FOREACH v_player_id IN ARRAY v_player_ids LOOP
    INSERT INTO public.player_cards (
      player_id,
      round_id,
      cards,
      hand_context_id,
      source_version,
      is_public
    ) VALUES (
      v_player_id,
      v_round_id,
      jsonb_build_array(
        v_deck->v_card_offset,
        v_deck->(v_card_offset + 1),
        v_deck->(v_card_offset + 2),
        v_deck->(v_card_offset + 3)
      ),
      v_round_id::text,
      1,
      false
    );
    v_card_offset := v_card_offset + 4;
  END LOOP;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = 1,
         buck_position = v_buck_position,
         pot = v_pot,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         is_first_hand = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL
   WHERE id = _game_id;

  RETURN jsonb_build_object(
    'outcome', 'started',
    'round_id', v_round_id,
    'dealer_game_id', v_game.current_game_uuid,
    'hand_number', 1,
    'buck_position', v_buck_position,
    'pot', v_pot,
    'deduped', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_holm_initial_hand(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_holm_initial_hand(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_holm_initial_hand(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_holm_initial_hand(uuid, boolean) TO service_role;
