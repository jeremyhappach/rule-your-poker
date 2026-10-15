-- Candidate services for the separately approved database installation.
-- Run in the same reviewed transaction AFTER authority.sql. Does not enable
-- the release gate or insert a catalog record. Never run blindly against prod.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tri_towers_revisions') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tri_towers_revisions;
 END IF;
END $$;
-- Only the dedicated TriTowers worker advances its own expired matches.
-- pg_cron sub-minute scheduling must be qualified on the destination first.
SELECT cron.schedule('tri-towers-recovery','5 seconds','SELECT private.tri_towers_recover()');
