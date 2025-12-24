-- Record stay/fold actions automatically whenever a player's decision is locked in
-- This fixes missing history for bots/auto-folded players and enables accurate round history.

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

    SELECT r.id INTO current_round_id
    FROM public.rounds r
    JOIN public.games g ON g.id = r.game_id
    WHERE r.game_id = NEW.game_id
      AND r.round_number = COALESCE(g.current_round, 0)
    LIMIT 1;

    IF current_round_id IS NOT NULL THEN
      -- Avoid duplicates
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

DROP TRIGGER IF EXISTS trg_record_player_actions_from_decision ON public.players;

CREATE TRIGGER trg_record_player_actions_from_decision
AFTER UPDATE OF decision_locked, current_decision ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.record_player_action_from_decision();
