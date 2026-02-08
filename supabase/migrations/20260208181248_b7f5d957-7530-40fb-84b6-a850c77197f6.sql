-- Fix horses_set_player_state to allow timed-out humans (auto_fold=true) to persist their own auto-roll results
-- This prevents "Not bot controller" errors when the timed-out player's client animates the auto-roll

CREATE OR REPLACE FUNCTION public.horses_set_player_state(_round_id uuid, _player_id uuid, _state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g_id uuid;
  hs jsonb;
  p_user uuid;
  p_is_bot boolean;
  p_auto_fold boolean;
BEGIN
  SELECT r.game_id, r.horses_state
  INTO g_id, hs
  FROM public.rounds r
  WHERE r.id = _round_id;

  IF g_id IS NULL THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF NOT public.user_is_in_game(g_id) THEN
    RAISE EXCEPTION 'Not in game';
  END IF;

  SELECT p.user_id, p.is_bot, p.auto_fold
  INTO p_user, p_is_bot, p_auto_fold
  FROM public.players p
  WHERE p.id = _player_id
    AND p.game_id = g_id;

  IF p_user IS NULL THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  IF p_is_bot THEN
    -- Bots must be written by the bot controller
    IF (hs->>'botControllerUserId') IS NULL OR (hs->>'botControllerUserId') <> auth.uid()::text THEN
      RAISE EXCEPTION 'Not bot controller';
    END IF;
  ELSIF p_auto_fold THEN
    -- Humans with auto_fold=true (timed out, auto-rolling) can write their own state
    -- OR the bot controller can write for them (redundancy)
    IF p_user <> auth.uid() AND ((hs->>'botControllerUserId') IS NULL OR (hs->>'botControllerUserId') <> auth.uid()::text) THEN
      RAISE EXCEPTION 'Not player owner or bot controller';
    END IF;
  ELSE
    -- Normal humans must own their player
    IF p_user <> auth.uid() THEN
      RAISE EXCEPTION 'Not player owner';
    END IF;
  END IF;

  UPDATE public.rounds r
  SET horses_state = jsonb_set(
    COALESCE(r.horses_state, '{}'::jsonb),
    ARRAY['playerStates', _player_id::text],
    _state,
    true
  )
  WHERE r.id = _round_id;

  SELECT r.horses_state INTO hs
  FROM public.rounds r
  WHERE r.id = _round_id;

  RETURN hs;
END;
$$;