-- Add visual customization preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN table_layout text NOT NULL DEFAULT 'classic',
ADD COLUMN card_back_design text NOT NULL DEFAULT 'red';