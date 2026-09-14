SET statement_timeout='180s';
CALL public.replay_gin_commit_benchmark(80);
SELECT jsonb_agg(s) FROM (SELECT category,enabled,count(*) n,percentile_cont(0.5) WITHIN GROUP(ORDER BY milliseconds) p50,percentile_cont(0.95) WITHIN GROUP(ORDER BY milliseconds) p95,max(milliseconds) maximum FROM private.replay_gin_benchmark_samples WHERE sample>84 GROUP BY category,enabled ORDER BY category,enabled) s;
