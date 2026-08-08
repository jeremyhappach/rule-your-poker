DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'reconcile-abandoned-real-money-sessions';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION
      'Missing cron job reconcile-abandoned-real-money-sessions';
  END IF;

  PERFORM cron.alter_job(
    job_id := v_job_id,
    schedule := '30 seconds'
  );
END
$schedule$;
