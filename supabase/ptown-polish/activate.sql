-- Run after the matching production deployment and release-publication signal.
DO $$
DECLARE sha text:=current_setting('app.ptown_polish_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION 'ptown_polish:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text COLLATE "C")) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'horses_blitz_%') OR (n.nspname='public' AND p.proname='arcade_horses_blitz_step');
 IF digest IS DISTINCT FROM '7d0f20e0bf53bf671d6fbdd3486feef1' THEN RAISE EXCEPTION 'ptown_polish:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'ptown_polish:recovery_unavailable';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE id='357-drop/5' AND config=(SELECT config||'{"version":"357-drop/5","allBonus":500,"allFilledMs":4000,"holdMs":9000}'::jsonb FROM private.arcade_rulesets WHERE id='357-drop/4')) THEN RAISE EXCEPTION 'ptown_polish:drop_config_changed';END IF;
 PERFORM private.drop357_select_ruleset('357-drop/5'::text);
 UPDATE private.arcade_rulesets SET enabled=false WHERE game='horses-blitz' AND enabled;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='horses-blitz/4' AND game='horses-blitz' AND config=private.horses_blitz_rules('horses-blitz/4');
 IF NOT FOUND THEN RAISE EXCEPTION 'ptown_polish:horses_config_changed';END IF;
END$$;
