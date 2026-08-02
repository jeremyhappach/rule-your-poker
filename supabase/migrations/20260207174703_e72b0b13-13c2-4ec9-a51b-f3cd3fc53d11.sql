
-- Fix the record_player_action_from_decision trigger to scope by dealer_game_id
-- This prevents it from inserting actions into rounds from old dealer games
-- when the same hand_number/round_number exists across multiple dealer games

CREATE OR REPLACE FUNCTION public.record_player_action_from_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round_id uuid;
BEGIN
  -- Only record when a decision becomes locked and is a stay/fold decision
  IF (NEW.decision_locked IS TRUE)
     AND (NEW.current_decision IN ('stay', 'fold'))
     AND (
       (OLD.decision_locked IS DISTINCT FROM NEW.decision_locked)
       OR (OLD.current_decision IS DISTINCT FROM NEW.current_decision)
     ) THEN

    -- CRITICAL FIX: Scope by dealer_game_id (current_game_uuid) to avoid
    -- selecting rounds from old dealer games that have the same hand_number/round_number
    SELECT r.id INTO current_round_id
    FROM public.rounds r
    JOIN public.games g ON g.id = r.game_id
    WHERE r.game_id = NEW.game_id
      AND r.round_number = COALESCE(g.current_round, 0)
      AND r.hand_number = COALESCE(g.total_hands, 1)
      AND (g.current_game_uuid IS NULL OR r.dealer_game_id = g.current_game_uuid)
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF current_round_id IS NOT NULL THEN
      -- Avoid duplicates - check for existing action with same type
      IF NOT EXISTS (
        SELECT 1
        FROM public.player_actions pa
        WHERE pa.round_id = current_round_id
          AND pa.player_id = NEW.id
          AND pa.action_type = NEW.current_decision
      ) THEN
        INSERT INTO public.player_actions (round_id, player_id, action_type)
        VALUES (current_round_id, NEW.id, NEW.current_decision);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
