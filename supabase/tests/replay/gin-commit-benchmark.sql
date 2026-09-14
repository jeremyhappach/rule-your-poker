CALL public.replay_gin_commit_benchmark(30);
SELECT jsonb_agg(row_to_json(s)) FROM (
 SELECT category,enabled,count(*) samples,
 percentile_cont(0.5) WITHIN GROUP(ORDER BY milliseconds) p50_ms,
 percentile_cont(0.95) WITHIN GROUP(ORDER BY milliseconds) p95_ms
 FROM private.replay_gin_benchmark_samples WHERE sample>(SELECT max(sample)-27 FROM private.replay_gin_benchmark_samples) GROUP BY category,enabled ORDER BY category,enabled
) s;
