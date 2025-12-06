-- Change default deck_color_mode to four_color
ALTER TABLE public.profiles 
ALTER COLUMN deck_color_mode SET DEFAULT 'four_color';