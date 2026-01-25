-- Add timer settings columns to games table (cached at session start)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS game_setup_timer_seconds integer NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS ante_decision_timer_seconds integer NOT NULL DEFAULT 30;

-- Add comment for documentation
COMMENT ON COLUMN public.games.game_setup_timer_seconds IS 'Cached from system_settings at session creation';
COMMENT ON COLUMN public.games.ante_decision_timer_seconds IS 'Cached from system_settings at session creation';