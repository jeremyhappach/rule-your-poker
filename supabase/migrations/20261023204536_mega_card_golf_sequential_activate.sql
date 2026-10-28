-- Apply only after compatible API/client and recovery deployment verification.
-- Existing /1 rows, enabled flag, course configurations and board IDs are untouched.
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='mega-card-golf/2' AND game='mega-card-golf' AND config->>'opening'='sequential') THEN RAISE EXCEPTION 'mega:v2_registration_required';END IF;
 IF position('ruleset_i' IN pg_get_functiondef('public.arcade_mega_start(uuid,uuid,text)'::regprocedure))=0 THEN RAISE EXCEPTION 'mega:v2_start_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
END $$;
UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/2' AND NOT enabled;
