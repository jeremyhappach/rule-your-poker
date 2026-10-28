-- UNAPPLIED. Requires the qualified worker bundle and pg_cron preload.
-- Register disabled; this file does not open gameplay or start a worker.
SELECT cron.schedule('canasta-recovery','5 seconds','SELECT private.canasta_dispatch_recovery()');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='canasta-recovery'),active:=false);
