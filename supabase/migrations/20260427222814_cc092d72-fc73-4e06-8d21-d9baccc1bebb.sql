CREATE OR REPLACE FUNCTION public.cribbage_apply_discard(
  _round_id uuid,
  _player_id uuid,
  _card_indices integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_id uuid;
  cs jsonb;
  p_user uuid;
  p_is_bot boolean;
  player_state jsonb;
  hand jsonb;
  expected_discard int;
  player_count int;
  i int;
  idx int;
  discarded_cards jsonb := '[]'::jsonb;
  remaining_hand jsonb := '[]'::jsonb;
  new_crib jsonb;
  card jsonb;
  all_discarded boolean := true;
  player_keys text[];
  pkey text;
BEGIN
  -- Lock the round row
  SELECT r.game_id, r.cribbage_state
  INTO g_id, cs
  FROM public.rounds r
  WHERE r.id = _round_id
  FOR UPDATE;

  IF g_id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF NOT public.user_is_in_game(g_id) THEN
    RAISE EXCEPTION 'Not in game';
  END IF;

  -- Permission: human owns player; bot writes via owner of bot record
  SELECT p.user_id, p.is_bot
  INTO p_user, p_is_bot
  FROM public.players p
  WHERE p.id = _player_id AND p.game_id = g_id;

  IF p_user IS NULL THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  IF NOT p_is_bot AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'Not player owner';
  END IF;

  -- Phase guard
  IF cs IS NULL OR (cs->>'phase') <> 'discarding' THEN
    -- Idempotent: not in discarding phase, just return current state
    RETURN cs;
  END IF;

  player_state := cs->'playerStates'->_player_id::text;
  IF player_state IS NULL THEN
    RAISE EXCEPTION 'Player state not found';
  END IF;

  -- Idempotent: already discarded
  IF jsonb_array_length(COALESCE(player_state->'discardedToCrib', '[]'::jsonb)) > 0 THEN
    RETURN cs;
  END IF;

  hand := COALESCE(player_state->'hand', '[]'::jsonb);

  -- Determine expected discard count
  SELECT array_agg(k) INTO player_keys
  FROM jsonb_object_keys(cs->'playerStates') k;
  player_count := COALESCE(array_length(player_keys, 1), 0);

  expected_discard := CASE WHEN player_count = 2 THEN 2 ELSE 1 END;

  IF array_length(_card_indices, 1) IS DISTINCT FROM expected_discard THEN
    RAISE EXCEPTION 'Must discard exactly % cards', expected_discard;
  END IF;

  -- Build discarded and remaining
  FOR i IN 0 .. jsonb_array_length(hand) - 1 LOOP
    card := hand->i;
    IF i = ANY(_card_indices) THEN
      discarded_cards := discarded_cards || jsonb_build_array(card);
    ELSE
      remaining_hand := remaining_hand || jsonb_build_array(card);
    END IF;
  END LOOP;

  IF jsonb_array_length(discarded_cards) <> expected_discard THEN
    RAISE EXCEPTION 'Invalid card indices';
  END IF;

  -- Apply this player's update
  player_state := player_state
    || jsonb_build_object('hand', remaining_hand, 'discardedToCrib', discarded_cards);

  cs := jsonb_set(cs, ARRAY['playerStates', _player_id::text], player_state, true);

  new_crib := COALESCE(cs->'crib', '[]'::jsonb) || discarded_cards;
  cs := jsonb_set(cs, '{crib}', new_crib, true);

  -- Check if all players have now discarded
  FOREACH pkey IN ARRAY player_keys LOOP
    IF jsonb_array_length(COALESCE(cs->'playerStates'->pkey->'discardedToCrib', '[]'::jsonb)) <> expected_discard THEN
      all_discarded := false;
      EXIT;
    END IF;
  END LOOP;

  -- Persist the merged state (still under row lock)
  UPDATE public.rounds r
  SET cribbage_state = cs
  WHERE r.id = _round_id;

  -- Return new state. Phase advancement to 'cutting' is handled client-side
  -- once both players' discards are visible (idempotently). Server does not
  -- mutate phase here to avoid coupling deck/cut-card RNG to this RPC.
  RETURN cs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cribbage_apply_discard(uuid, uuid, integer[]) TO authenticated;
