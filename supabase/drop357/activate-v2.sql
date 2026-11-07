-- Execute in a transaction after exact production client verification.
DO $$
DECLARE sha text:=current_setting('app.drop357_release_sha',true);digest text;
BEGIN
 IF sha IS NULL OR sha!~'^[a-f0-9]{40}$' OR (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN RAISE EXCEPTION '357:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname LIKE 'drop357_%') OR (n.nspname='public' AND p.proname='arcade_drop357_step');
 IF digest IS DISTINCT FROM '500b058f49b0c057c7b78703fa627dc8' THEN RAISE EXCEPTION '357:authority_changed';END IF;
 IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION '357:recovery_unavailable';END IF;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='357-drop/1';
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='357-drop/2' AND config->>'version'='357-drop/2';
 IF NOT FOUND THEN RAISE EXCEPTION '357:missing_v2';END IF;
END $$;
