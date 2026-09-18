import fs from 'node:fs';
const read = name => fs.readFileSync(`supabase/tests/replay/${name}`, 'utf8');
const benchmark = read('gin-commit-benchmark.draft.sql');
const prepare = benchmark.slice(benchmark.indexOf('CREATE OR REPLACE FUNCTION private.replay_gin_benchmark_prepare'), benchmark.indexOf('CREATE OR REPLACE PROCEDURE'));
const performance = read('live-timing-overhead-proof.sql').replace("f:=private.replay_gin_benchmark_prepare", "PERFORM set_config('app.replay_live_sampled',enabled::text,true);\n    f:=private.replay_gin_benchmark_prepare");
const checks = `
DO $proof$ DECLARE a timestamptz; b timestamptz; sampled integer:=0; i integer; source text; statement text; owner text; BEGIN
 PERFORM set_config('app.live_timing_disabled','false',true);
 PERFORM set_config('app.replay_live_sampled','false',true);
 IF private.replay_live_timing_start_v1() IS NOT NULL THEN RAISE EXCEPTION 'sampling:false'; END IF;
 PERFORM set_config('app.replay_live_sampled','true',true);
 IF private.replay_live_timing_start_v1() IS NULL THEN RAISE EXCEPTION 'sampling:true'; END IF;
 PERFORM set_config('app.live_timing_disabled','true',true);
 IF private.replay_live_timing_start_v1() IS NOT NULL THEN RAISE EXCEPTION 'sampling:disable'; END IF;
 PERFORM set_config('app.live_timing_disabled','false',true);
 PERFORM set_config('request.method','POST',true);
 FOR i IN 1..1000 LOOP
  PERFORM set_config('app.replay_live_sampled','',true);
  a:=private.replay_live_timing_start_v1(); b:=private.replay_live_timing_start_v1();
  IF (a IS NULL) IS DISTINCT FROM (b IS NULL) THEN RAISE EXCEPTION 'sampling:inconsistent_sections'; END IF;
  IF a IS NOT NULL THEN sampled:=sampled+1; END IF;
 END LOOP;
 IF sampled NOT BETWEEN 150 AND 350 THEN RAISE EXCEPTION 'sampling:rate:%',sampled; END IF;
 -- Preserve ordinary diagnostic retention; timing and missing-card evidence lasts seven days.
 IF EXISTS(SELECT 1 FROM (VALUES
 ('live-play-timing-v1',2,false),('card-visibility-invariant',6,false),
 ('live-play-timing-v1',8,true),('other',2,true),('other',0,false)
 ) v(event_type,days,expected) WHERE
 (days>1 AND (event_type NOT IN ('live-play-timing-v1','card-visibility-invariant') OR days>7)) IS DISTINCT FROM expected)
 THEN RAISE EXCEPTION 'retention:policy'; END IF;
 -- Execute each deployed owner's exact debug-table DELETE against a temporary
 -- probe table, so retention is tested without deleting real diagnostic rows.
 CREATE TEMP TABLE retention_probe(event_type text,created_at timestamptz,expected_delete boolean);
 FOREACH owner IN ARRAY ARRAY['private.purge_quota_diagnostics()','public.purge_expired_diagnostics(interval)'] LOOP
  TRUNCATE retention_probe;
  INSERT INTO retention_probe SELECT event_type,now()-days*interval '1 day',expected FROM (VALUES
   ('live-play-timing-v1',2,false),('card-visibility-invariant',6,false),
   ('live-play-timing-v1',8,true),('other',2,true),('other',0,false)) v(event_type,days,expected);
  source:=pg_get_functiondef(owner::regprocedure);
  statement:=substring(source FROM 'DELETE FROM public.debug_events[^;]+;');
  IF statement IS NULL THEN RAISE EXCEPTION 'retention:missing_owner'; END IF;
  statement:=replace(replace(statement,'public.debug_events','pg_temp.retention_probe'),'_cutoff', 'now()-interval ''1 day''');
  EXECUTE statement;
  IF (SELECT count(*) FROM retention_probe)<>3 OR EXISTS(SELECT 1 FROM retention_probe WHERE expected_delete)
  THEN RAISE EXCEPTION 'retention:deployed_owner:%',owner; END IF;
 END LOOP;
 DROP TABLE retention_probe;
 IF has_function_privilege('authenticated','private.replay_live_timing_start_v1()','EXECUTE')
 OR has_function_privilege('anon','private.replay_live_timing_start_v1()','EXECUTE')
 THEN RAISE EXCEPTION 'sampling:public_execute'; END IF;
 PERFORM set_config('app.replay_live_sampled','true',true);
END; $proof$;
`;
const proof = checks + [prepare, read('gin-pilot-proof.draft.sql'), read('gin-rule-fixtures.draft.sql'), read('gin-rule-proof.draft.sql'), read('gin-waiting-fixtures.sql'), read('gin-waiting-proof.sql'), performance].join('\n') + `
SELECT jsonb_build_object(
 'deployment',jsonb_build_object('migration',(SELECT version FROM supabase_migrations.schema_migrations WHERE name='continuous_play_timing' ORDER BY version DESC LIMIT 1),
 'timedOwners',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'replay_gin_%' AND p.prosrc LIKE '%v_live_started timestamptz := private.replay_live_timing_start_v1()%'),
 'lockWaiters',(SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid())),
 'pilot',private.replay_gin_pilot_proof_v1(true,'stock_two_void')-'journal',
 'rules',private.replay_gin_rule_proof_v1(),
 'waiting',private.replay_gin_waiting_proof_v2(),
 'timing',(SELECT jsonb_agg(x) FROM (SELECT category,enabled,count(*) n,
 round(percentile_cont(.5)within group(order by elapsed)::numeric,3) p50,
 round(percentile_cont(.95)within group(order by elapsed)::numeric,3) p95,
 max(elapsed) maximum FROM live_timing_samples GROUP BY category,enabled ORDER BY category,enabled)x)
) report;
`;
const migration = fs.readFileSync('supabase/migrations/20260918162031_continuous_play_timing.sql','utf8');
const prefix = "BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='60s';\n";
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/continuous-timing-preflight.sql', prefix + migration + proof + '\nROLLBACK;');
fs.writeFileSync('artifacts/continuous-timing-proof.sql', prefix + proof + '\nROLLBACK;');
