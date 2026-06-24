-- 1) Widen rounds.status check to include the pre-actionability 'dealing' state.
ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_status_check;
ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'ante'::text,
    'dealing'::text,
    'betting'::text,
    'revealing'::text,
    'processing'::text,
    'showdown'::text,
    'completed'::text
  ]));

-- 2) Atomic Holm initial-hand startup. All writes succeed together or none do.
CREATE OR REPLACE FUNCTION public.start_holm_initial_hand(
  _game_id uuid,
  _skip_ante_collection boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _game            public.games%ROWTYPE;
  _player_ids      uuid[];
  _occupied        int[];
  _player_count    int;
  _ante_amount     int;
  _pot             int;
  _dealer_game_id  uuid;
  _buck_position   int;
  _round_id        uuid;
  _deck            jsonb;
  _community       jsonb;
  _card_offset     int := 4;
  _fallback_at     timestamptz;
  _was_first_hand  boolean;
  _existing_round_count int;
  _ante_changes    jsonb := '{}'::jsonb;
  _pid             uuid;
BEGIN
  -- Lock the games row for the duration of the transaction.
  SELECT * INTO _game FROM public.games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game-not-found');
  END IF;

  -- Phase + type guards.
  IF COALESCE(_game.game_type,'') <> 'holm-game' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong-game-type','game_type', _game.game_type);
  END IF;
  IF _game.status <> 'ante_decision' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','wrong-status','status', _game.status);
  END IF;
  IF COALESCE(_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome','rejected','reason','game-paused');
  END IF;

  _dealer_game_id := _game.current_game_uuid;
  IF _dealer_game_id IS NULL THEN
    RETURN jsonb_build_object('outcome','rejected','reason','no-dealer-game');
  END IF;

  -- Active cohort = players who anted up and are not sitting out/observer/left.
  SELECT array_agg(id ORDER BY position),
         array_agg(position ORDER BY position),
         count(*)
    INTO _player_ids, _occupied, _player_count
    FROM public.players
    WHERE game_id = _game_id
      AND status = 'active'
      AND sitting_out = false
      AND ante_decision = 'ante_up';

  IF _player_count IS NULL OR _player_count < 2 THEN
    RETURN jsonb_build_object('outcome','rejected','reason','insufficient-ante-up','count', COALESCE(_player_count,0));
  END IF;

  -- Idempotency: any existing round for this dealer_game means we already started.
  SELECT count(*) INTO _existing_round_count
    FROM public.rounds
    WHERE dealer_game_id = _dealer_game_id;
  IF _existing_round_count > 0 THEN
    RETURN jsonb_build_object(
      'outcome','rejected',
      'reason','round-already-exists',
      'existing_round_count', _existing_round_count
    );
  END IF;

  _ante_amount := COALESCE(_game.ante_amount, 1);
  _was_first_hand := COALESCE(_game.is_first_hand, false);

  IF NOT _skip_ante_collection THEN
    -- Normal startup: must hold the first-hand flag; consume it as the CAS lock.
    IF NOT _was_first_hand THEN
      RETURN jsonb_build_object('outcome','rejected','reason','first-hand-lock-already-consumed');
    END IF;
    UPDATE public.games SET is_first_hand = false WHERE id = _game_id;

    -- Charge antes atomically.
    UPDATE public.players
       SET chips = chips - _ante_amount
     WHERE id = ANY(_player_ids);
    _pot := _player_count * _ante_amount;

    -- Build chip-change map for audit.
    SELECT jsonb_object_agg(pid::text, -_ante_amount)
      INTO _ante_changes
      FROM unnest(_player_ids) AS pid;

    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, winner_player_id,
      winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped, game_type
    ) VALUES (
      _game_id, _dealer_game_id, 1, NULL,
      'Ante', _player_count::text || ' players anted $' || _ante_amount::text,
      0, _ante_changes, false, 'holm'
    );
  ELSE
    -- Recovery: antes already charged, pot already populated, first-hand lock consumed.
    IF _was_first_hand THEN
      RETURN jsonb_build_object('outcome','rejected','reason','partial-state-invalid-first-hand-flag');
    END IF;
    IF COALESCE(_game.pot, 0) < _ante_amount * _player_count THEN
      RETURN jsonb_build_object(
        'outcome','rejected',
        'reason','partial-state-invalid-pot',
        'pot', _game.pot,
        'expected_min', _ante_amount * _player_count
      );
    END IF;
    _pot := _game.pot;
  END IF;

  -- Buck position. Recovery reuses persisted buck_position; normal flow computes
  -- the next clockwise occupied position from dealer_position (wrap around).
  IF _skip_ante_collection AND _game.buck_position IS NOT NULL THEN
    _buck_position := _game.buck_position;
  ELSE
    SELECT min(p) INTO _buck_position
      FROM unnest(_occupied) AS p
      WHERE p > COALESCE(_game.dealer_position, 0);
    IF _buck_position IS NULL THEN
      SELECT min(p) INTO _buck_position FROM unnest(_occupied) AS p;
    END IF;
    IF _buck_position IS NULL THEN
      _buck_position := COALESCE(_game.dealer_position, 1);
    END IF;
  END IF;

  -- Shuffled 52-card deck. Cards use the same { rank, suit } shape as
  -- src/lib/cardUtils.ts createDeck (Unicode suit glyphs).
  WITH d AS (
    SELECT jsonb_build_object('rank', r, 'suit', s) AS card
      FROM unnest(ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A']) AS r
      CROSS JOIN unnest(ARRAY[E'\u2660', E'\u2665', E'\u2666', E'\u2663']) AS s
  ), shuffled AS (
    SELECT card, row_number() OVER (ORDER BY random()) AS idx FROM d
  )
  SELECT jsonb_agg(card ORDER BY idx) INTO _deck FROM shuffled;

  _community := jsonb_build_array(_deck->0, _deck->1, _deck->2, _deck->3);

  -- Pre-clear player decisions for the new hand.
  UPDATE public.players
     SET current_decision = NULL,
         decision_locked = false
   WHERE game_id = _game_id;

  -- Pre-clear stale game flags / phase deadlines.
  UPDATE public.games
     SET all_decisions_in = false,
         last_round_result = NULL,
         is_first_hand = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL
   WHERE id = _game_id;

  _fallback_at := now() + interval '20 seconds';

  -- Insert the pre-actionability round row (now-legal status='dealing').
  INSERT INTO public.rounds (
    game_id, round_number, cards_dealt, status, pot, decision_deadline,
    community_cards, community_cards_revealed, chucky_active,
    current_turn_position, pending_turn_position,
    presentation_generation, presentation_fallback_at,
    hand_number, dealer_game_id
  ) VALUES (
    _game_id, 1, 4, 'dealing', _pot, NULL,
    _community, 2, false,
    NULL, _buck_position,
    0, _fallback_at,
    1, _dealer_game_id
  ) RETURNING id INTO _round_id;

  -- Deal 4 cards per ante-up player. HCI for Holm == round.id (text).
  FOREACH _pid IN ARRAY _player_ids LOOP
    INSERT INTO public.player_cards (
      player_id, round_id, cards, hand_context_id, source_version, is_public
    ) VALUES (
      _pid,
      _round_id,
      jsonb_build_array(
        _deck->_card_offset,
        _deck->(_card_offset + 1),
        _deck->(_card_offset + 2),
        _deck->(_card_offset + 3)
      ),
      _round_id::text,
      1,
      false
    );
    _card_offset := _card_offset + 4;
  END LOOP;

  -- Final status flip → in_progress, atomic with all of the above.
  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = 1,
         buck_position = _buck_position,
         pot = _pot
   WHERE id = _game_id;

  RETURN jsonb_build_object(
    'outcome','started',
    'round_id', _round_id,
    'dealer_game_id', _dealer_game_id,
    'hand_number', 1,
    'pending_turn_position', _buck_position,
    'pot', _pot,
    'presentation_fallback_at', _fallback_at,
    'skipped_ante_collection', _skip_ante_collection
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_holm_initial_hand(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_holm_initial_hand(uuid, boolean) TO service_role;