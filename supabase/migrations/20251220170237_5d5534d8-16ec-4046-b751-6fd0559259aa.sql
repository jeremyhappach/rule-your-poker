-- Update the autotick job so it enforces deadlines for ALL active games (no client needed)
DO $$
DECLARE
  _jobid integer;
BEGIN
  SELECT jobid INTO _jobid FROM cron.job WHERE jobname = 'enforce-deadlines-autotick' LIMIT 1;
  IF _jobid IS NOT NULL THEN
    PERFORM cron.unschedule(_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'enforce-deadlines-autotick',
  '10 seconds',
  $$
  SELECT
    net.http_post(
      url := 'https://ehccrxumpibuoehfsmms.functions.supabase.co/functions/v1/enforce-deadlines',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoY2NyeHVtcGlidW9laGZzbW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDMzNzksImV4cCI6MjA3OTQxOTM3OX0._ktKoBm9nXKrLZPK8u6fzrnd57Qbz0VoJ2ORK7-lGs0',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoY2NyeHVtcGlidW9laGZzbW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NDMzNzksImV4cCI6MjA3OTQxOTM3OX0._ktKoBm9nXKrLZPK8u6fzrnd57Qbz0VoJ2ORK7-lGs0'
      ),
      body := jsonb_build_object('gameId', g.id),
      timeout_milliseconds := 5000
    )
  FROM public.games g
  WHERE g.status IN ('configuring','game_selection','ante_decision','in_progress','betting','game_over');
  $$
);
