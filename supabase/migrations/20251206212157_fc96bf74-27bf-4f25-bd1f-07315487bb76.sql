-- Add column to track consecutive hands a player has been sitting out
ALTER TABLE public.players 
ADD COLUMN sitting_out_hands integer NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.players.sitting_out_hands IS 'Tracks consecutive hands the player has been sitting out. Resets to 0 when player antes up. Player is removed after 20 consecutive hands.';