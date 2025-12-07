-- Change default deck_color_mode for new profiles from 'four_color' to 'two_color'
ALTER TABLE public.profiles 
ALTER COLUMN deck_color_mode SET DEFAULT 'two_color';