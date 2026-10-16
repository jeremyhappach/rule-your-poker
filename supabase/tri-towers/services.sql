-- Reference services after the TriTowers bot migration. Do not apply separately.
-- Existing scheduler jobs and publication tables are left intact.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tri_towers_revisions;
SELECT cron.schedule('tri-towers-recovery','1 second','SET statement_timeout = ''3s''; SELECT private.tri_towers_recover()');
