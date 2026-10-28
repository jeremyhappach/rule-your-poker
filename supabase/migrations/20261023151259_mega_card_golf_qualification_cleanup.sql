-- Remove only the three completed, closed-admission production test fixtures.
-- Resolve generated run IDs from their recorded qualification fingerprints.
-- Trigger suspension and restoration are atomic and block concurrent result writes.
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $cleanup$
DECLARE ids uuid[]; before_hash text; after_hash text; deleted integer;
BEGIN
 IF (SELECT enabled FROM private.arcade_rulesets WHERE id='mega-card-golf/1') IS DISTINCT FROM false THEN RAISE EXCEPTION 'mega:cleanup_admission';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.arcade_runs WHERE game='mega-card-golf') THEN RETURN;END IF;
 SELECT array_agg(r.id ORDER BY r.id) INTO ids FROM private.arcade_runs r JOIN (VALUES
  ('2026-10-23 14:34:25.947165+00'::timestamptz,90,253,'sunny-meadows'),
  ('2026-10-23 13:49:33.186720+00'::timestamptz,1,264,'devils-canyon'),
  ('2026-10-23 14:19:47.794898+00'::timestamptz,1,279,'devils-canyon')
 ) f(created_at,revision,score,course) ON r.created_at=f.created_at AND r.revision=f.revision AND r.score=f.score AND r.config->>'id'=f.course
 WHERE r.game='mega-card-golf' AND r.ruleset='mega-card-golf/1' AND r.status='completed' AND jsonb_array_length(r.state->'results')=9;
 IF cardinality(ids) IS DISTINCT FROM 3 OR (SELECT count(*) FROM private.arcade_runs WHERE game='mega-card-golf')<>3
  OR (SELECT count(*) FROM private.arcade_results WHERE run_id=ANY(ids))<>3 THEN RAISE EXCEPTION 'mega:cleanup_fixture_drift';END IF;
 IF EXISTS(SELECT 1 FROM private.arcade_runs r CROSS JOIN LATERAL jsonb_array_elements(r.state->'results') h WHERE r.id=ANY(ids) AND (h->>'score')::integer IS DISTINCT FROM private.golf_score(h->'cards')) THEN RAISE EXCEPTION 'mega:cleanup_score';END IF;
 IF (SELECT tgenabled FROM pg_trigger WHERE tgrelid='private.arcade_results'::regclass AND tgname='arcade_result_immutable') IS DISTINCT FROM 'O' THEN RAISE EXCEPTION 'mega:cleanup_trigger';END IF;
 SELECT md5(coalesce(string_agg(x,'|' ORDER BY x),'')) INTO before_hash FROM(
  SELECT 'run:'||to_jsonb(r)::text x FROM private.arcade_runs r WHERE NOT id=ANY(ids) UNION ALL
  SELECT 'result:'||to_jsonb(r)::text FROM private.arcade_results r WHERE NOT run_id=ANY(ids) UNION ALL
  SELECT 'receipt:'||to_jsonb(r)::text FROM private.arcade_command_receipts r WHERE NOT run_id=ANY(ids) UNION ALL
  SELECT 'revision:'||to_jsonb(r)::text FROM public.arcade_revisions r WHERE NOT run_id=ANY(ids) UNION ALL
  SELECT 'rule:'||to_jsonb(r)::text FROM private.arcade_rulesets r UNION ALL
  SELECT 'config:'||to_jsonb(r)::text FROM private.arcade_mega_configs r UNION ALL
  SELECT 'course:'||to_jsonb(r)::text FROM private.arcade_mega_courses r)t;
 ALTER TABLE private.arcade_results DISABLE TRIGGER arcade_result_immutable;
 DELETE FROM private.arcade_results WHERE run_id=ANY(ids);
 GET DIAGNOSTICS deleted=ROW_COUNT;
 IF deleted<>3 THEN RAISE EXCEPTION 'mega:cleanup_result_count';END IF;
 ALTER TABLE private.arcade_results ENABLE TRIGGER arcade_result_immutable;
 DELETE FROM private.arcade_command_receipts WHERE run_id=ANY(ids);
 DELETE FROM public.arcade_revisions WHERE run_id=ANY(ids);
 DELETE FROM private.arcade_runs WHERE id=ANY(ids);
 GET DIAGNOSTICS deleted=ROW_COUNT;
 IF deleted<>3 THEN RAISE EXCEPTION 'mega:cleanup_run_count';END IF;
 SELECT md5(coalesce(string_agg(x,'|' ORDER BY x),'')) INTO after_hash FROM(
  SELECT 'run:'||to_jsonb(r)::text x FROM private.arcade_runs r UNION ALL
  SELECT 'result:'||to_jsonb(r)::text FROM private.arcade_results r UNION ALL
  SELECT 'receipt:'||to_jsonb(r)::text FROM private.arcade_command_receipts r UNION ALL
  SELECT 'revision:'||to_jsonb(r)::text FROM public.arcade_revisions r UNION ALL
  SELECT 'rule:'||to_jsonb(r)::text FROM private.arcade_rulesets r UNION ALL
  SELECT 'config:'||to_jsonb(r)::text FROM private.arcade_mega_configs r UNION ALL
  SELECT 'course:'||to_jsonb(r)::text FROM private.arcade_mega_courses r)t;
 IF before_hash IS DISTINCT FROM after_hash OR (SELECT tgenabled FROM pg_trigger WHERE tgrelid='private.arcade_results'::regclass AND tgname='arcade_result_immutable') IS DISTINCT FROM 'O' THEN RAISE EXCEPTION 'mega:cleanup_preservation';END IF;
END $cleanup$;
