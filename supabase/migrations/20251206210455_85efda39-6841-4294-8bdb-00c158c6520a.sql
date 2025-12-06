-- Add deck_color_mode column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN deck_color_mode text NOT NULL DEFAULT 'two_color';

-- Add check constraint for valid values
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_deck_color_mode_check 
CHECK (deck_color_mode IN ('two_color', 'four_color'));