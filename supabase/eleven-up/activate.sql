-- Run only after the matching client and recovery worker are published.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='3s';
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
 VALUES('eleven-up','fullscreen',5,false,'none','none',false,false,false,0,0)
 ON CONFLICT(game_type) DO NOTHING;
UPDATE private.eleven_up_release SET enabled=true,admission_enabled=true WHERE singleton;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='eleven-up/1';
COMMIT;
