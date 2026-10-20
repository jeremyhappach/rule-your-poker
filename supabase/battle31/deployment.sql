-- Release-only platform registration, deliberately NOT executed by local installation.
-- Before use, rebuild the shared registration functions against the coordinated main
-- and verify deployed definition hashes. Installation must leave both gates false.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('battle-31','fullscreen',5,false,'none','none',false,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle31_revisions;
SELECT cron.schedule('battle31-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.battle31_recover()$job$);
-- No admission activation statement belongs in this candidate.
