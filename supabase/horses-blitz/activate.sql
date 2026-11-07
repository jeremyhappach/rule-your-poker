-- Run only after the exact client publication and qualified worker are verified.
DO $$
DECLARE sha text:=current_setting('app.horses_blitz_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION 'horses_blitz:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname LIKE 'horses_blitz_%') OR (n.nspname='public' AND p.proname='arcade_horses_blitz_step');
 IF digest IS DISTINCT FROM '934d3e53938ff51453ea984ae607e601' THEN RAISE EXCEPTION 'horses_blitz:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'horses_blitz:recovery_unavailable';END IF;
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='horses-blitz' AND enabled;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='horses-blitz/2' AND game='horses-blitz' AND config=private.horses_blitz_rules('horses-blitz/2');
 IF NOT FOUND THEN RAISE EXCEPTION 'horses_blitz:ruleset_mismatch';END IF;
END$$;
