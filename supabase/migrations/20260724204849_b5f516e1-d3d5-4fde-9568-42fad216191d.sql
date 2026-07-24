ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS three_five_seven_legs_at_start jsonb;

COMMENT ON COLUMN public.rounds.three_five_seven_legs_at_start IS
  'Immutable snapshot of authoritative player legs at the moment this 3-5-7 Round 1 was created. Populated ONLY on Round 1 inserts for game_type=3-5-7 (or its accepted aliases). Shape: [{player_id: uuid, position: int, legs: int}]. Consumed by instant-357 terminal presentation to determine Sweep the Legs eligibility. Normal-win terminal presentation does NOT read this column.';