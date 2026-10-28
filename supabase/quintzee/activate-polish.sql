-- Execute only after installed qualification and exact-SHA publication verification.
-- The caller supplies the verified SHA and installed authority hash, never a user token.
DO $activation$ DECLARE actual text; BEGIN
 IF (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM current_setting('app.quintzee_release_sha') THEN RAISE EXCEPTION 'quintzee:publication_mismatch';END IF;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text)) INTO actual FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND (p.proname LIKE '%quintzee%' OR p.proname IN('arcade_start','arcade_commit','megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'));
 IF actual IS DISTINCT FROM current_setting('app.quintzee_authority_hash') THEN RAISE EXCEPTION 'quintzee:authority_changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='quintzee/3' AND game='quintzee' AND config=private.quintzee_v3_rules()) THEN RAISE EXCEPTION 'quintzee:ruleset_mismatch';END IF;
 UPDATE private.quintzee_release SET enabled=true,admission_enabled=true WHERE singleton;
 UPDATE private.arcade_rulesets SET enabled=(id='quintzee/3') WHERE game='quintzee';
END $activation$;
