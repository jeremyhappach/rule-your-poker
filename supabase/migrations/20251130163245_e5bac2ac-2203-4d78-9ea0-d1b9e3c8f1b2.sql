-- Add game_over_at timestamp to track when game ended
ALTER TABLE games ADD COLUMN game_over_at TIMESTAMP WITH TIME ZONE;