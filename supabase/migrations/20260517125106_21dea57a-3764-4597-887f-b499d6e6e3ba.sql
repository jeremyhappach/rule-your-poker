ALTER TABLE public.games ADD COLUMN IF NOT EXISTS all_decisions_in_round_id uuid;
CREATE INDEX IF NOT EXISTS idx_games_all_decisions_in_round_id ON public.games(all_decisions_in_round_id);
COMMENT ON COLUMN public.games.all_decisions_in_round_id IS 'Identity-scope for all_decisions_in. The round_id this flag was set for. Readers must ignore all_decisions_in unless this matches the current round_id, to prevent stale boolean carrying across round/hand transitions (F5.1/F4.2).';
