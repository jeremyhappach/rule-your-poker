-- Enable required extensions for scheduling
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ensure we don't create duplicate schedules
DO $$
DECLARE
  _jobid integer;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'enforce-deadlines-autotick' LIMIT 1;
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- cron.job not available (extension not installed yet)
    NULL;
END $$;

-- Call the enforce-deadlines function periodically so games progress even when no clients are open.
-- Runs every 10 seconds.
SELECT cron.schedule(
  'enforce-deadlines-autotick',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := 'https://ehccrxumpibuoehfsmms.functions.supabase.co/functions/v1/enforce-deadlines',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoY2NyeHVtcGlidW9laGZzbW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDMzNzksImV4cCI6MjA3OTQxOTM3OX0._ktKoBm9nXKrLZPK8u6fzrnd57Qbz0VoJ2ORK7-lGs0',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoY2NyeHVtcGlidW9laGZzbW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDMzNzksImV4cCI6MjA3OTQxOTM3OX0._ktKoBm9nXKrLZPK8u6fzrnd57Qbz0VoJ2ORK7-lGs0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
