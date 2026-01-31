
-- Fix rounds table uniqueness: use dealer_game_id instead of game_id for hand/round uniqueness
-- This allows each dealer game (3-5-7, Holm, Horses, SCC) to have its own hand numbering starting at 1

-- Drop the old constraint that uses game_id
DROP INDEX IF EXISTS rounds_game_hand_round_unique;

-- Create the new constraint using dealer_game_id
-- This ensures within a single dealer game, (hand_number, round_number) is unique
CREATE UNIQUE INDEX rounds_dealer_game_hand_round_unique 
ON public.rounds (dealer_game_id, hand_number, round_number) 
WHERE (dealer_game_id IS NOT NULL AND hand_number IS NOT NULL);
