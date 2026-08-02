-- Ensure realtime updates include full row data (required for filtered UPDATE events)
ALTER TABLE public.rounds REPLICA IDENTITY FULL;
ALTER TABLE public.player_cards REPLICA IDENTITY FULL;

-- Ensure tables are part of realtime publication (idempotent)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.player_cards;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;
