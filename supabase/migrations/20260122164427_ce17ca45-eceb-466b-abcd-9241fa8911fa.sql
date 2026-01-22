-- Add haptic and sound preference columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN use_haptic boolean NOT NULL DEFAULT true,
ADD COLUMN play_sounds boolean NOT NULL DEFAULT true;

-- Set all existing users to true
UPDATE public.profiles SET use_haptic = true, play_sounds = true;