-- Add mute_dealer_chat preference to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS mute_dealer_chat boolean NOT NULL DEFAULT false;

-- Set false for all existing users (in case they have NULL values from concurrent modifications)
UPDATE public.profiles SET mute_dealer_chat = false WHERE mute_dealer_chat IS NULL;