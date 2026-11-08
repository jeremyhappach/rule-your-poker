-- Run only after the matching production client and publication signal are verified.
DO $$
DECLARE sha text:=current_setting('app.arcade_polish_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION 'arcade_polish:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'horses_blitz_%') OR (n.nspname='public' AND p.proname='arcade_horses_blitz_step');
 IF digest IS DISTINCT FROM 'bdbb1de22789816c3287bd3f9067b32b' THEN RAISE EXCEPTION 'arcade_polish:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade_polish:recovery_unavailable';END IF;
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='horses-blitz' AND enabled;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='horses-blitz/3' AND game='horses-blitz' AND config=private.horses_blitz_rules('horses-blitz/3');
 IF NOT FOUND THEN RAISE EXCEPTION 'arcade_polish:ruleset_mismatch';END IF;
END$$;
