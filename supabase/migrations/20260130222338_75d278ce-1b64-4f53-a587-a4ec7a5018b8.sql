-- Fix the record_player_action_from_decision trigger to use both hand_number AND round_number
-- This prevents it from selecting stale rounds from previous hands in 3-5-7 games

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

    -- FIXED: Use BOTH hand_number AND round_number to correctly identify the current round
    -- For 3-5-7 games, round_number cycles 1/2/3 each hand, so we need both values
    SELECT r.id INTO current_round_id
    FROM public.rounds r
    JOIN public.games g ON g.id = r.game_id
    WHERE r.game_id = NEW.game_id
      AND r.round_number = COALESCE(g.current_round, 0)
      AND r.hand_number = COALESCE(g.total_hands, 1)
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