SET statement_timeout='180s';
SELECT current_setting('synchronous_commit'),current_setting('fsync');
SELECT greatest(0,84-coalesce(max(sample),0)) AS remaining FROM private.replay_gin_benchmark_samples \gset
CALL public.replay_gin_commit_benchmark(:remaining);
SELECT jsonb_agg(s) FROM (SELECT category,enabled,count(*) n,percentile_cont(0.5) WITHIN GROUP(ORDER BY milliseconds) p50,percentile_cont(0.95) WITHIN GROUP(ORDER BY milliseconds) p95,max(milliseconds) maximum FROM private.replay_gin_benchmark_samples WHERE sample>3 AND sample IN (SELECT sample FROM private.replay_gin_benchmark_samples GROUP BY sample HAVING count(*)=10) GROUP BY category,enabled ORDER BY category,enabled) s;
