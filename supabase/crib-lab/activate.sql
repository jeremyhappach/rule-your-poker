-- Release operator supplies the verified publication SHA and installed authority digest.
-- Install and qualify the matching recovery worker first. Run inside a transaction.
DO $activation$
DECLARE seconds_i integer; target text; digest_i text; sha text:=current_setting('app.crib_lab_release_sha',true);
BEGIN
  IF sha IS NULL OR sha !~ '^[a-f0-9]{40}$' OR
    (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN
    RAISE EXCEPTION 'crib_lab:publication_mismatch';
  END IF;
  SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest_i
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='private' AND (left(p.proname,9)='crib_lab_' OR p.proname IN ('cribbage_new_deck','cribbage_hand_score','cribbage_rank_value','cribbage_card_value','secure_shuffle_key')))
    OR (n.nspname='public' AND p.proname IN ('arcade_crib_lab_step','arcade_start','arcade_commit','arcade_leaderboard'));
  IF digest_i IS DISTINCT FROM current_setting('app.crib_lab_authority_hash',true) THEN RAISE EXCEPTION 'crib_lab:authority_changed'; END IF;
  IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN
    RAISE EXCEPTION 'crib_lab:recovery_unavailable';
  END IF;
  SELECT crib_lab_round_seconds INTO STRICT seconds_i FROM public.game_defaults WHERE game_type='crib-lab' FOR UPDATE;
  target:=CASE WHEN seconds_i=240 THEN 'crib-lab/1' ELSE 'crib-lab/1-duration-'||seconds_i END;
  UPDATE private.arcade_rulesets SET enabled=true WHERE game='crib-lab' AND id=target
    AND config=jsonb_build_object('version','crib-lab/1','durationMs',seconds_i*1000);
  IF NOT FOUND THEN RAISE EXCEPTION 'crib_lab:ruleset_mismatch'; END IF;
END $activation$;
