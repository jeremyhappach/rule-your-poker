-- Update default values for new users
ALTER TABLE public.profiles 
ALTER COLUMN table_layout SET DEFAULT 'black',
ALTER COLUMN card_back_design SET DEFAULT 'hawks';

-- Update all existing users to the new defaults
UPDATE public.profiles 
SET table_layout = 'black', card_back_design = 'hawks';