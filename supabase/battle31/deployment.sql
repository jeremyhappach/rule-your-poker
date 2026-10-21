-- Closed-admission registration. Run only inside the guarded release package.
DO $registration$
DECLARE job record; command_i text:='SET statement_timeout=''3s''; SELECT private.battle31_recover()';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
  OR to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN RAISE EXCEPTION 'battle31:platform_registration_missing';END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='battle31-recovery') THEN
  IF (SELECT count(*) FROM cron.job WHERE jobname='battle31-recovery')<>1 THEN RAISE EXCEPTION 'battle31:scheduler_collision';END IF;
  SELECT * INTO STRICT job FROM cron.job WHERE jobname='battle31-recovery';
  IF job.schedule IS DISTINCT FROM '1 second' OR job.command IS DISTINCT FROM command_i
   OR job.database IS DISTINCT FROM current_database() OR job.username IS DISTINCT FROM current_user OR job.active IS DISTINCT FROM true THEN RAISE EXCEPTION 'battle31:scheduler_collision';END IF;
 ELSE
  PERFORM cron.schedule('battle31-recovery','1 second',command_i);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='battle31_revisions') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.battle31_revisions;
 END IF;
END $registration$;
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('battle-31','fullscreen',5,false,'none','none',false,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;
-- No admission activation statement belongs in this candidate.
