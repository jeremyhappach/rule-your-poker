-- PROPOSAL ONLY: DO NOT RUN with the gameplay candidate or local proof.
-- Requires separate approval for the new Vault secret and scheduled HTTP authority.
-- Existing project: xvhmbuppghwmwpwrkzao. No Vercel plan upgrade or Vercel cron.
-- Provision ptown_async_push_cron_secret separately; it must match the approved
-- Vercel CRON_SECRET. No literal secret or key belongs in this file or Git.
-- pg_net stores bearer headers temporarily in its privileged request queue.
-- Verify job-name availability and net.http_get signature before approval/install.

SELECT cron.schedule(
 'ptown-async-push-delivery',
 '* * * * *',
 $scheduled_push$
 SELECT net.http_get(
  url := 'https://ptown-poker.vercel.app/api/web-push',
  headers := jsonb_build_object('Authorization',(
   SELECT 'Bearer '||decrypted_secret FROM vault.decrypted_secrets
   WHERE name='ptown_async_push_cron_secret'
  )),
  timeout_milliseconds := 60000
 ) WHERE EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='ptown_async_push_cron_secret');
 $scheduled_push$
);
