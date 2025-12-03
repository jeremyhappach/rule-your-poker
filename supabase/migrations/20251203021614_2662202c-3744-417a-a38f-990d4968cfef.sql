-- Add bot behavior configuration to game_defaults
ALTER TABLE public.game_defaults 
ADD COLUMN bot_fold_probability integer NOT NULL DEFAULT 30,
ADD COLUMN bot_decision_delay_seconds numeric(3,1) NOT NULL DEFAULT 2.0;