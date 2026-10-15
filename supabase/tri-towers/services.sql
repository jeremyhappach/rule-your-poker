-- Reference services included in migration 20261015003637. Do not apply separately.
-- Existing scheduler jobs and publication tables are left intact.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tri_towers_revisions;
SELECT cron.schedule('tri-towers-recovery','5 seconds','SET statement_timeout = ''3s''; SELECT private.tri_towers_recover()');
