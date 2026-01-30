-- Remove legacy uniqueness constraint that blocks 3-5-7 from creating Hand 2 Round 1 (round_number=1) within the same session.
-- 3-5-7 uses (game_id, hand_number, round_number) for uniqueness instead.

ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_game_id_round_number_key;