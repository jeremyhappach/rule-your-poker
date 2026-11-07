-- Release operator supplies the verified publication SHA and installed authority digest.
-- Install and qualify the matching recovery worker first. Run inside a transaction.
DO $activation$
DECLARE settings public.game_defaults; c jsonb; target text; digest_i text; sha text:=current_setting('app.chucky_v3_release_sha',true);
BEGIN
  IF sha IS NULL OR sha !~ '^[a-f0-9]{40}$' OR
    (SELECT value->>'buildSha' FROM public.system_settings WHERE key='release_publication') IS DISTINCT FROM sha THEN
    RAISE EXCEPTION 'chucky_showdown:publication_mismatch';
  END IF;
  SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest_i
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='private' AND (left(p.proname,15)='chucky_showdown_' OR p.proname IN ('secure_shuffle_key')))
    OR (n.nspname='public' AND p.proname IN ('holm_hand_label','holm_best_hand_value','holm_five_card_value','holm_deterministic_chucky_cards','arcade_chucky_showdown_step','arcade_chucky_showdown_history','arcade_start','arcade_commit','arcade_leaderboard'));
  IF digest_i IS DISTINCT FROM current_setting('app.chucky_v3_authority_hash',true) THEN RAISE EXCEPTION 'chucky_showdown:authority_changed'; END IF;
  IF NOT EXISTS(SELECT FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN
    RAISE EXCEPTION 'chucky_showdown:recovery_unavailable';
  END IF;
  IF EXISTS(SELECT FROM public.games WHERE real_money AND status<>'session_ended') THEN RAISE EXCEPTION 'chucky_showdown:active_real_money'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id
      WHERE m.real_money AND m.status='active' AND NOT c.terminal AND c.started_at IS NOT NULL) THEN
    RAISE EXCEPTION 'chucky_showdown:active_money_turn';
  END IF;
  SELECT * INTO STRICT settings FROM public.game_defaults WHERE game_type='chucky-showdown' FOR UPDATE;
  c:=private.chucky_showdown_config_v3(settings);target:=private.chucky_showdown_id_v3(c);
  UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled AND id<>target;
  UPDATE private.arcade_rulesets SET enabled=true WHERE game='chucky-showdown' AND id=target AND config=c;
  IF NOT FOUND THEN RAISE EXCEPTION 'chucky_showdown:ruleset_mismatch'; END IF;
END $activation$;
