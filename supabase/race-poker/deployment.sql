-- Admission stays closed. Qualification and explicit release activation are separate.
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('race-poker','fullscreen',5,false,'none','none',false,false,false,0,0) ON CONFLICT(game_type) DO NOTHING;
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_poker_revisions;
SELECT cron.schedule('race-poker-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.race_poker_recover()$job$);
