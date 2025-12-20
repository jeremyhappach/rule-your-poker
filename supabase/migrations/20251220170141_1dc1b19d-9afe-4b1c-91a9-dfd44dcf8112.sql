-- Fix linter: extension in public (pg_net)
-- Recreate pg_net with extnamespace = extensions, and recreate the cron schedule.

-- Remove existing schedule if present
DO $$
DECLARE
  _jobid integer;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'enforce-deadlines-autotick' LIMIT 1;
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

create schema if not exists extensions;

-- Recreate pg_net in the correct schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recreate schedule (every 10 seconds)
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
