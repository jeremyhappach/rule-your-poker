-- ============================================================
-- Atomic 3-5-7 round advancement RPC
-- ============================================================
-- Round-only fold semantics: destination roster is every eligible
-- player (not left, not observer, not sitting_out), regardless of
-- the previous round's fold/stay decision. Every eligible player
-- is reset to active with cleared decision state and receives the
-- full destination card set in the same transaction as the round
-- row insert.

CREATE OR REPLACE FUNCTION public.advance_357_round(
  _game_id                       uuid,
  _dealer_game_id                uuid,
  _next_round_number             int,
  _next_hand_number              int,
  _cards_dealt                   int,
  _decision_deadline             timestamptz,
  _player_card_assignments       jsonb,
  _ante_amount                   int,
  _three_five_seven_legs_at_start jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game               public.games%ROWTYPE;
  _existing_round     public.rounds%ROWTYPE;
  _new_round_id       uuid;
  _eligible_ids       uuid[];
  _payload_ids        uuid[];
  _missing_count      int;
  _new_pot            int;
  _hand_number_final  int;
  _current_round_final int;
BEGIN
  IF _game_id IS NULL OR _dealer_game_id IS NULL THEN
    RAISE EXCEPTION 'advance_357_round:missing_identity';
  END IF;
  IF _next_round_number NOT IN (1,2,3) THEN
    RAISE EXCEPTION 'advance_357_round:invalid_round_number:%', _next_round_number;
  END IF;
  IF _cards_dealt NOT IN (3,5,7) THEN
    RAISE EXCEPTION 'advance_357_round:invalid_cards_dealt:%', _cards_dealt;
  END IF;
  IF (_next_round_number = 1 AND _cards_dealt <> 3)
     OR (_next_round_number = 2 AND _cards_dealt <> 5)
     OR (_next_round_number = 3 AND _cards_dealt <> 7)
  THEN
    RAISE EXCEPTION 'advance_357_round:round_card_mismatch:round=%,cards=%',
      _next_round_number, _cards_dealt;
  END IF;
  IF _player_card_assignments IS NULL
     OR jsonb_typeof(_player_card_assignments) <> 'array'
     OR jsonb_array_length(_player_card_assignments) < 1
  THEN
    RAISE EXCEPTION 'advance_357_round:empty_card_assignments';
  END IF;

  -- Lock the game row
  SELECT * INTO _game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_357_round:game_not_found';
  END IF;

  IF _game.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN
    RAISE EXCEPTION 'advance_357_round:not_357:%', _game.game_type;
  END IF;

  IF _game.status IN ('game_over','session_ended') THEN
    RETURN jsonb_build_object('status','game_over','game_status', _game.status);
  END IF;

  IF COALESCE(_game.is_paused, false) THEN
    RETURN jsonb_build_object('status','paused');
  END IF;

  IF _game.current_game_uuid IS DISTINCT FROM _dealer_game_id THEN
    RAISE EXCEPTION 'advance_357_round:dealer_game_mismatch:expected=%,got=%',
      _game.current_game_uuid, _dealer_game_id;
  END IF;

  -- Destination roster: every player who has not left, is not an observer,
  -- and is not sitting out. Round-only fold semantics: prior decisions
  -- (fold/stay) do NOT filter this list.
  SELECT array_agg(id ORDER BY position)
    INTO _eligible_ids
    FROM public.players
   WHERE game_id = _game_id
     AND status NOT IN ('left','observer')
     AND sitting_out = false;

  IF _eligible_ids IS NULL OR array_length(_eligible_ids,1) < 1 THEN
    RAISE EXCEPTION 'advance_357_round:no_eligible_players';
  END IF;

  -- Payload roster must equal eligible roster exactly.
  SELECT array_agg((x->>'player_id')::uuid ORDER BY (x->>'player_id'))
    INTO _payload_ids
    FROM jsonb_array_elements(_player_card_assignments) x;

  IF (SELECT array_agg(pid::text ORDER BY pid::text) FROM unnest(_eligible_ids) pid)
     IS DISTINCT FROM
     (SELECT array_agg(pid::text ORDER BY pid::text) FROM unnest(_payload_ids) pid)
  THEN
    RAISE EXCEPTION 'advance_357_round:roster_mismatch:eligible=%,payload=%',
      _eligible_ids, _payload_ids;
  END IF;

  -- Every assignment must have exactly _cards_dealt cards.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_player_card_assignments) x
     WHERE jsonb_typeof(x->'cards') <> 'array'
        OR jsonb_array_length(x->'cards') <> _cards_dealt
  ) THEN
    RAISE EXCEPTION 'advance_357_round:card_count_mismatch:expected=%', _cards_dealt;
  END IF;

  -- Idempotency: destination round already exists?
  SELECT * INTO _existing_round
    FROM public.rounds
   WHERE dealer_game_id = _dealer_game_id
     AND hand_number    = _next_hand_number
     AND round_number   = _next_round_number
   LIMIT 1;

  IF FOUND THEN
    -- Count eligible players missing a player_cards row.
    SELECT count(*) INTO _missing_count
      FROM unnest(_eligible_ids) pid
     WHERE NOT EXISTS (
       SELECT 1 FROM public.player_cards
        WHERE round_id = _existing_round.id
          AND player_id = pid
     );

    IF _missing_count = 0 THEN
      RETURN jsonb_build_object(
        'status','already_advanced',
        'round_id',_existing_round.id,
        'hand_number',_next_hand_number,
        'round_number',_next_round_number,
        'eligible_player_count', array_length(_eligible_ids,1)
      );
    END IF;

    -- Repair legacy incomplete shell atomically using the caller's authoritative
    -- card assignments. Only inserts missing rows; never overwrites existing ones.
    INSERT INTO public.player_cards (player_id, round_id, cards)
    SELECT (x->>'player_id')::uuid, _existing_round.id, x->'cards'
      FROM jsonb_array_elements(_player_card_assignments) x
     WHERE NOT EXISTS (
       SELECT 1 FROM public.player_cards pc
        WHERE pc.round_id = _existing_round.id
          AND pc.player_id = (x->>'player_id')::uuid
     );

    UPDATE public.players
       SET current_decision = NULL,
           decision_locked  = false,
           status           = 'active'
     WHERE game_id = _game_id
       AND status NOT IN ('left','observer')
       AND sitting_out = false;

    _hand_number_final := CASE WHEN _next_round_number = 1
                                 THEN _next_hand_number
                               ELSE COALESCE(_game.total_hands, _next_hand_number)
                          END;

    UPDATE public.games
       SET status               = 'in_progress',
           current_round        = _next_round_number,
           total_hands          = _hand_number_final,
           awaiting_next_round  = false,
           next_round_number    = NULL,
           all_decisions_in     = false,
           all_decisions_in_round_id = NULL,
           last_round_result    = NULL,
           game_over_at         = NULL,
           config_deadline      = NULL,
           ante_decision_deadline = NULL,
           is_first_hand        = false
     WHERE id = _game_id;

    RETURN jsonb_build_object(
      'status','repaired_and_advanced',
      'round_id',_existing_round.id,
      'hand_number',_next_hand_number,
      'round_number',_next_round_number,
      'repaired_player_cards', _missing_count,
      'eligible_player_count', array_length(_eligible_ids,1)
    );
  END IF;

  -- Reset every eligible player BEFORE inserting the destination round.
  UPDATE public.players
     SET current_decision = NULL,
         decision_locked  = false,
         status           = 'active'
   WHERE game_id = _game_id
     AND status NOT IN ('left','observer')
     AND sitting_out = false;

  -- Ante handling: only when starting a fresh Round 1 (new hand).
  _new_pot := COALESCE(_game.pot, 0);
  IF _next_round_number = 1 AND COALESCE(_ante_amount, 0) > 0 THEN
    UPDATE public.players
       SET chips = chips - _ante_amount
     WHERE id = ANY(_eligible_ids);

    _new_pot := _new_pot + (array_length(_eligible_ids,1) * _ante_amount);
  END IF;

  -- Insert the destination round row (unique index on
  -- (dealer_game_id, hand_number, round_number) provides insert-as-lock).
  BEGIN
    INSERT INTO public.rounds (
      game_id, dealer_game_id, round_number, hand_number,
      cards_dealt, status, pot, decision_deadline,
      three_five_seven_legs_at_start
    ) VALUES (
      _game_id, _dealer_game_id, _next_round_number, _next_hand_number,
      _cards_dealt, 'betting', _new_pot, _decision_deadline,
      _three_five_seven_legs_at_start
    ) RETURNING id INTO _new_round_id;
  EXCEPTION WHEN unique_violation THEN
    -- Lost the insert race. Re-read and treat as already advanced.
    SELECT * INTO _existing_round
      FROM public.rounds
     WHERE dealer_game_id = _dealer_game_id
       AND hand_number    = _next_hand_number
       AND round_number   = _next_round_number
     LIMIT 1;
    RETURN jsonb_build_object(
      'status','already_advanced',
      'round_id',_existing_round.id,
      'hand_number',_next_hand_number,
      'round_number',_next_round_number,
      'race','insert_lost'
    );
  END;

  -- Card commit for every eligible player.
  INSERT INTO public.player_cards (player_id, round_id, cards)
  SELECT (x->>'player_id')::uuid, _new_round_id, x->'cards'
    FROM jsonb_array_elements(_player_card_assignments) x;

  _current_round_final := _next_round_number;
  _hand_number_final := CASE WHEN _next_round_number = 1
                               THEN _next_hand_number
                             ELSE COALESCE(_game.total_hands, _next_hand_number)
                        END;

  UPDATE public.games
     SET status               = 'in_progress',
         current_round        = _current_round_final,
         total_hands          = _hand_number_final,
         pot                  = _new_pot,
         awaiting_next_round  = false,
         next_round_number    = NULL,
         all_decisions_in     = false,
         all_decisions_in_round_id = NULL,
         last_round_result    = NULL,
         game_over_at         = NULL,
         config_deadline      = NULL,
         ante_decision_deadline = NULL,
         is_first_hand        = false
   WHERE id = _game_id;

  RETURN jsonb_build_object(
    'status','advanced',
    'round_id', _new_round_id,
    'hand_number', _next_hand_number,
    'round_number', _next_round_number,
    'eligible_player_count', array_length(_eligible_ids,1),
    'pot', _new_pot,
    'ante_charged', CASE WHEN _next_round_number = 1 AND COALESCE(_ante_amount,0) > 0
                           THEN _ante_amount * array_length(_eligible_ids,1)
                         ELSE 0
                    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_357_round(
  uuid, uuid, int, int, int, timestamptz, jsonb, int, jsonb
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.advance_357_round(
  uuid, uuid, int, int, int, timestamptz, jsonb, int, jsonb
) TO service_role;