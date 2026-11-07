-- Set app.drop357_release_sha to the exact verified production SHA, then run in a transaction.
DO $$
DECLARE sha text:=current_setting('app.drop357_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION '357:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname LIKE 'drop357_%') OR (n.nspname='public' AND p.proname='arcade_drop357_step');
 IF digest IS DISTINCT FROM 'f8b2ed7ec6fcc9f9544f29d82088811c' THEN RAISE EXCEPTION '357:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION '357:recovery_unavailable';END IF;
 PERFORM private.drop357_select_ruleset(true);
END $$;
