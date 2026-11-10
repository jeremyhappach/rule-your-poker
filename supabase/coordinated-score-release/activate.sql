-- After the exact compatible production deployment is READY and visually verified.
-- Set app.coordinated_release_sha to that full Git SHA in the same transaction.
DO $$
DECLARE sha text:=current_setting('app.coordinated_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION 'coordinated:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text COLLATE "C")) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND (p.proname LIKE 'horses_blitz_%' OR p.proname LIKE 'drop357_%')) OR (n.nspname='public' AND p.proname IN('arcade_horses_blitz_step','arcade_drop357_step'));
 IF digest IS DISTINCT FROM 'ee8cbea897e558d390fcbb113f392236' THEN RAISE EXCEPTION 'coordinated:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'coordinated:recovery_unavailable';END IF;
 IF (SELECT config FROM private.arcade_rulesets WHERE id='357-drop/6') IS DISTINCT FROM private.drop357_v6_rules() OR (SELECT config FROM private.arcade_rulesets WHERE id='horses-blitz/5') IS DISTINCT FROM private.horses_blitz_rules('horses-blitz/5') THEN RAISE EXCEPTION 'coordinated:configuration_changed';END IF;
 PERFORM private.drop357_select_ruleset('357-drop/6'::text);
 UPDATE private.arcade_rulesets SET enabled=(id='horses-blitz/5') WHERE game='horses-blitz';
END $$;
