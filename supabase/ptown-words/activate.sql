-- Execute only after exact-SHA publication and all recorded release gates.
BEGIN;
SET LOCAL lock_timeout='100ms';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND NOT enabled AND NOT admission_enabled)
 OR (SELECT count(*) FROM private.ptown_words_lexicon WHERE version='enable2k/1')<>173528
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='ptown-words-recovery' AND active) THEN
 RAISE EXCEPTION 'ptown_words:activation_precondition';END IF;
END $$;
INSERT INTO public.game_defaults(game_type,presentation_mode,ante_amount,real_money,debug_harness,timeout_action,timeout_enforcement_enabled,pot_max_enabled,pussy_tax_enabled,leg_value,legs_to_win)
VALUES('ptown-words','fullscreen',5,false,'none','none',false,false,false,0,0)
ON CONFLICT(game_type) DO NOTHING;
UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true WHERE singleton;
COMMIT;
