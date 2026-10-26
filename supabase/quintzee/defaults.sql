-- Presentation defaults are frozen at admission; gameplay stays quintzee/1.
ALTER TABLE public.game_defaults ADD COLUMN quintzee_theme text NOT NULL DEFAULT 'classic' CHECK(quintzee_theme IN ('classic','modern'));
INSERT INTO public.game_defaults(game_type,ante_amount,presentation_mode) VALUES('quintzee',1,'fullscreen') ON CONFLICT(game_type) DO NOTHING;
