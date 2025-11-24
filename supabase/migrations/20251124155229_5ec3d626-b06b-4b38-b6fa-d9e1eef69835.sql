-- Remove the foreign key constraint from profiles to allow bot profiles
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Make id just a regular UUID primary key without the foreign key
-- The table structure remains the same, just without the constraint