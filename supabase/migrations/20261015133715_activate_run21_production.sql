-- Activate only after isolated financial/recovery qualification and live HTTP acknowledgements.
DO $activation$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='run21-recovery' AND active AND schedule='5 seconds')
 OR NOT EXISTS(SELECT 1 FROM private.run21_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '20 seconds')
 OR NOT EXISTS(SELECT 1 FROM private.game_recovery_dispatch_state WHERE singleton AND last_outcome='completed' AND last_completed_at>clock_timestamp()-interval '20 seconds') THEN
  RAISE EXCEPTION 'run21:activation_recovery_unhealthy';
 END IF;
 UPDATE private.run21_production_release SET qualified=true WHERE singleton;
END $activation$;
