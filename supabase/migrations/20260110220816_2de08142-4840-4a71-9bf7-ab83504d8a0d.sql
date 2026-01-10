-- Fix race condition: horses_advance_turn should atomically set the current player's isComplete: true
-- before advancing to prevent game_over detection from running with stale player state

CREATE OR REPLACE FUNCTION public.horses_advance_turn(_round_id uuid, _expected_current_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g_id uuid;
  hs jsonb;
  current_turn text;
  order_arr text[];
  idx int;
  next_id text;
  p_user uuid;
  p_is_bot boolean;
  default_dice jsonb;
  current_player_state jsonb;
BEGIN
  -- Read state
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

  current_turn := hs->>'currentTurnPlayerId';

  -- Guard: only advance if caller is advancing the current turn
  IF current_turn IS NULL OR current_turn <> _expected_current_player_id::text THEN
    RETURN hs;
  END IF;

  -- Permission: current player advances; bots only by botControllerUserId
  SELECT p.user_id, p.is_bot
  INTO p_user, p_is_bot
  FROM public.players p
  WHERE p.id = _expected_current_player_id
    AND p.game_id = g_id;

  IF p_user IS NULL THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  IF p_is_bot THEN
    IF (hs->>'botControllerUserId') IS NULL OR (hs->>'botControllerUserId') <> auth.uid()::text THEN
      RAISE EXCEPTION 'Not bot controller';
    END IF;
  ELSE
    IF p_user <> auth.uid() THEN
      RAISE EXCEPTION 'Not player owner';
    END IF;
  END IF;

  -- CRITICAL FIX: Atomically set the current player's isComplete to true BEFORE advancing
  -- This prevents the race condition where game_over is detected before player state is complete
  current_player_state := COALESCE(hs->'playerStates'->_expected_current_player_id::text, '{}'::jsonb);
  current_player_state := jsonb_set(current_player_state, '{isComplete}', 'true'::jsonb, true);
  hs := jsonb_set(
    hs,
    ARRAY['playerStates', _expected_current_player_id::text],
    current_player_state,
    true
  );

  -- Turn order array
  SELECT array_agg(value ORDER BY ordinality)
  INTO order_arr
  FROM jsonb_array_elements_text(COALESCE(hs->'turnOrder', '[]'::jsonb)) WITH ORDINALITY;

  idx := array_position(order_arr, _expected_current_player_id::text);

  IF idx IS NULL THEN
    RETURN hs;
  END IF;

  IF idx >= array_length(order_arr, 1) THEN
    next_id := NULL;
  ELSE
    next_id := order_arr[idx + 1];
  END IF;

  -- Default dice payload (unrolled)
  default_dice := jsonb_build_array(
    jsonb_build_object('value', 0, 'isHeld', false),
    jsonb_build_object('value', 0, 'isHeld', false),
    jsonb_build_object('value', 0, 'isHeld', false),
    jsonb_build_object('value', 0, 'isHeld', false),
    jsonb_build_object('value', 0, 'isHeld', false)
  );

  -- Ensure next player state exists
  IF next_id IS NOT NULL AND (hs->'playerStates'->next_id) IS NULL THEN
    hs := jsonb_set(
      hs,
      ARRAY['playerStates', next_id],
      jsonb_build_object(
        'dice', default_dice,
        'rollsRemaining', 3,
        'isComplete', false
      ),
      true
    );
  END IF;

  IF next_id IS NULL THEN
    hs := hs || jsonb_build_object(
      'currentTurnPlayerId', NULL,
      'gamePhase', 'complete'
    );
  ELSE
    hs := hs || jsonb_build_object(
      'currentTurnPlayerId', next_id,
      'gamePhase', 'playing'
    );
  END IF;

  -- Atomic write: only if turn still matches
  UPDATE public.rounds r
  SET horses_state = hs
  WHERE r.id = _round_id
    AND (r.horses_state->>'currentTurnPlayerId') = _expected_current_player_id::text;

  -- Return freshest
  SELECT r.horses_state INTO hs
  FROM public.rounds r
  WHERE r.id = _round_id;

  RETURN hs;
END;
$function$;