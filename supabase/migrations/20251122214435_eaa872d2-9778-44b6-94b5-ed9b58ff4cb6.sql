-- Drop the existing foreign key to auth.users
ALTER TABLE players
DROP CONSTRAINT IF EXISTS players_user_id_fkey;

-- Add new foreign key constraint to profiles table
ALTER TABLE players
ADD CONSTRAINT players_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE;