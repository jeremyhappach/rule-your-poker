-- Add is_superuser to profiles
ALTER TABLE public.profiles ADD COLUMN is_superuser boolean NOT NULL DEFAULT false;

-- Set any account with 'jeremyhappach' in username as superuser
UPDATE public.profiles SET is_superuser = true WHERE username ILIKE '%jeremyhappach%';

-- Create game_defaults table for configurable settings
CREATE TABLE public.game_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL UNIQUE,
  decision_timer_seconds integer NOT NULL DEFAULT 10,
  chucky_second_to_last_delay_seconds numeric(4,1) NOT NULL DEFAULT 1.5,
  chucky_last_card_delay_seconds numeric(4,1) NOT NULL DEFAULT 3.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_defaults ENABLE ROW LEVEL SECURITY;

-- Anyone can read defaults
CREATE POLICY "Anyone can view game defaults"
ON public.game_defaults
FOR SELECT
USING (true);

-- Only superusers can modify defaults
CREATE POLICY "Superusers can insert game defaults"
ON public.game_defaults
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_superuser = true
));

CREATE POLICY "Superusers can update game defaults"
ON public.game_defaults
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_superuser = true
));

-- Insert default values for each game type
INSERT INTO public.game_defaults (game_type, decision_timer_seconds, chucky_second_to_last_delay_seconds, chucky_last_card_delay_seconds)
VALUES 
  ('holm', 10, 1.5, 3.0),
  ('3-5-7', 10, 1.5, 3.0);

-- Create trigger for updated_at
CREATE TRIGGER update_game_defaults_updated_at
BEFORE UPDATE ON public.game_defaults
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();