
-- 1) Predecessor link + durable uniqueness guard.
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS predecessor_round_id uuid
    REFERENCES public.rounds(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rounds_predecessor_round_id_unique
  ON public.rounds (predecessor_round_id)
  WHERE predecessor_round_id IS NOT NULL;

-- 2) Transactional successor-round RPC.
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
  _pred              public.rounds%ROWTYPE;
  _game_id           uuid;
  _dealer_game_id    uuid;
  _pred_hand         int;
  _next_hand         int;
  _new_round_id      uuid;
  _existing_round_id uuid;
  _existing_hand     int;
  _idem_key          text;
  _actor             uuid := auth.uid();
  _elem              jsonb;
BEGIN
  IF _predecessor_round_id IS NULL THEN
    RAISE EXCEPTION 'predecessor_round_id required';
  END IF;

  -- Lock predecessor row for the duration of this transaction so concurrent
  -- callers serialize on the same completed hand.
  SELECT * INTO _pred
    FROM public.rounds
   WHERE id = _predecessor_round_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Predecessor round % not found', _predecessor_round_id;
  END IF;

  _game_id        := _pred.game_id;
  _dealer_game_id := _pred.dealer_game_id;
  _pred_hand      := COALESCE(_pred.hand_number, 0);
  _next_hand      := _pred_hand + 1;
  _idem_key       := 'crib-next-hand:'
                     || COALESCE(_dealer_game_id::text, 'null')
                     || ':' || _pred_hand::text;

  IF NOT public.user_is_in_game(_game_id) THEN
    RAISE EXCEPTION 'Not in game';
  END IF;

  INSERT INTO public.debug_sync_events
    (game_id, game_type, hand_number, round_id, event_type, severity, event_name, payload)
  VALUES
    (_game_id, 'cribbage', _pred_hand, _predecessor_round_id,
     'invariant', 'info', 'CRIB_NEXT_HAND_CREATE_ATTEMPT',
     jsonb_build_object(
       'idempotency_key', _idem_key,
       'actor', _actor,
       'dealer_game_id', _dealer_game_id,
       'predecessor_round_id', _predecessor_round_id,
       'predecessor_hand_number', _pred_hand,
       'requested_hand_number', _next_hand,
       'rpc', 'cribbage_create_next_hand'
     ));

  -- Fast idempotent path: successor already exists.
  SELECT id, hand_number
    INTO _existing_round_id, _existing_hand
    FROM public.rounds
   WHERE predecessor_round_id = _predecessor_round_id
   LIMIT 1;

  IF _existing_round_id IS NOT NULL THEN
    INSERT INTO public.debug_sync_events
      (game_id, game_type, hand_number, round_id, event_type, severity, event_name, payload)
    VALUES
      (_game_id, 'cribbage', COALESCE(_existing_hand, _next_hand), _existing_round_id,
       'invariant', 'info', 'CRIB_NEXT_HAND_CREATE_DEDUPED',
       jsonb_build_object(
         'idempotency_key', _idem_key,
         'actor', _actor,
         'reason', 'existing-successor-fast-path'
       ));
    RETURN jsonb_build_object(
      'round_id', _existing_round_id,
      'hand_number', _existing_hand,
      'deduped', true
    );
  END IF;

  BEGIN
    INSERT INTO public.rounds (
      game_id, dealer_game_id, round_number, hand_number,
      cards_dealt, pot, status, cribbage_state, predecessor_round_id
    ) VALUES (
      _game_id, _dealer_game_id, 1, _next_hand,
      6, 0, 'betting', _cribbage_state, _predecessor_round_id
    )
    RETURNING id INTO _new_round_id;
  EXCEPTION WHEN unique_violation THEN
    -- Either another caller inserted our successor first (predecessor unique
    -- index), or a stale row with the same (dealer_game_id, hand_number,
    -- round_number) exists. Return whichever we can find and log prevention.
    SELECT id, hand_number
      INTO _existing_round_id, _existing_hand
      FROM public.rounds
     WHERE predecessor_round_id = _predecessor_round_id
     LIMIT 1;

    IF _existing_round_id IS NULL THEN
      SELECT id, hand_number
        INTO _existing_round_id, _existing_hand
        FROM public.rounds
       WHERE dealer_game_id = _dealer_game_id
         AND hand_number = _next_hand
         AND round_number = 1
       LIMIT 1;
    END IF;

    INSERT INTO public.debug_sync_events
      (game_id, game_type, hand_number, round_id, event_type, severity, event_name, payload)
    VALUES
      (_game_id, 'cribbage', COALESCE(_existing_hand, _next_hand), _existing_round_id,
       'invariant', 'warn', 'CRIB_NEXT_HAND_DUPLICATE_PREVENTED',
       jsonb_build_object(
         'idempotency_key', _idem_key,
         'actor', _actor,
         'reason', 'unique_violation'
       ));

    RETURN jsonb_build_object(
      'round_id', _existing_round_id,
      'hand_number', _existing_hand,
      'deduped', true
    );
  END;

  -- Deal player_cards once, idempotently.
  IF _player_cards IS NOT NULL AND jsonb_typeof(_player_cards) = 'array' THEN
    FOR _elem IN SELECT * FROM jsonb_array_elements(_player_cards) LOOP
      IF _elem ? 'player_id' THEN
        INSERT INTO public.player_cards (player_id, round_id, cards)
        VALUES (
          (_elem->>'player_id')::uuid,
          _new_round_id,
          COALESCE(_elem->'cards', '[]'::jsonb)
        )
        ON CONFLICT (player_id, round_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Advance the authoritative hand pointer.
  UPDATE public.games
     SET total_hands   = _next_hand,
         is_first_hand = false
   WHERE id = _game_id;

  INSERT INTO public.debug_sync_events
    (game_id, game_type, hand_number, round_id, event_type, severity, event_name, payload)
  VALUES
    (_game_id, 'cribbage', _next_hand, _new_round_id,
     'invariant', 'info', 'CRIB_NEXT_HAND_CREATE_GRANTED',
     jsonb_build_object(
       'idempotency_key', _idem_key,
       'actor', _actor,
       'predecessor_round_id', _predecessor_round_id,
       'predecessor_hand_number', _pred_hand
     ));

  RETURN jsonb_build_object(
    'round_id', _new_round_id,
    'hand_number', _next_hand,
    'deduped', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cribbage_create_next_hand(uuid, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cribbage_create_next_hand(uuid, jsonb, jsonb)
  TO service_role;
