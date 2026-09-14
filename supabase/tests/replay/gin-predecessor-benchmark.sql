-- Disposable database only. The disabled arm omits all replay appends in the
-- measured transaction, including the successor opening. Restore the opening
-- definition after benchmarking; this test hook is never deployed.
CREATE OR REPLACE FUNCTION private.replay_gin_benchmark_step_count(_session uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
 SELECT count(*) FROM private.replay_steps WHERE session_id=_session;
$$;
REVOKE ALL ON FUNCTION private.replay_gin_benchmark_step_count(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.replay_gin_benchmark_step_count(uuid) TO replay_benchmark;
CREATE OR REPLACE PROCEDURE public.replay_gin_predecessor_commit_benchmark(_samples integer DEFAULT 80)
LANGUAGE plpgsql AS $proc$
DECLARE sample_id integer;offset_id integer;switch_id integer;enabled boolean;category text;f jsonb;t timestamptz;ms numeric;result jsonb;n bigint;after_n bigint;
BEGIN
 SELECT coalesce(max(sample),0) INTO offset_id FROM private.replay_gin_benchmark_samples;
 FOR sample_id IN offset_id+1..offset_id+_samples LOOP
  FOREACH category IN ARRAY ARRAY['ordinary','compound','reveal_void','scoring','settlement_terminal','continuation'] LOOP
   FOR switch_id IN 0..1 LOOP
    enabled:=((sample_id+switch_id)%2)=0;
    PERFORM set_config('replay_benchmark.disabled','false',true);
    f:=private.replay_gin_benchmark_prepare(enabled,CASE WHEN category='continuation' THEN 'scoring' ELSE category END);
    IF category='continuation' THEN
     PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
     result:=public.gin_rummy_apply_action((f->>'round')::uuid,(f->>'actor')::uuid,f->>'action',nullif(f->'card','null'::jsonb),NULL,(f->>'count')::bigint);
     IF result->>'outcome'<>'applied' THEN RAISE EXCEPTION 'benchmark:predecessor_prepare'; END IF;
    END IF;
    n:=private.replay_gin_benchmark_step_count((f->>'game')::uuid);
    COMMIT;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
    PERFORM set_config('replay_benchmark.disabled',(NOT enabled)::text,true);
    t:=clock_timestamp();
    IF category='continuation' THEN result:=public.gin_rummy_start_next_hand((f->>'round')::uuid);
    ELSE result:=public.gin_rummy_apply_action((f->>'round')::uuid,(f->>'actor')::uuid,f->>'action',nullif(f->'card','null'::jsonb),NULL,(f->>'count')::bigint); END IF;
    COMMIT;
    ms:=1000*extract(epoch FROM clock_timestamp()-t);
    IF result->>'outcome'<>(CASE WHEN category='continuation' THEN 'started' ELSE 'applied' END) THEN RAISE EXCEPTION 'benchmark:action_failed:%',result; END IF;
    after_n:=private.replay_gin_benchmark_step_count((f->>'game')::uuid);
    IF after_n-n<>(CASE WHEN NOT enabled THEN 0 WHEN category='continuation' THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'benchmark:append_count:%:%',category,after_n-n; END IF;
    INSERT INTO private.replay_gin_benchmark_samples VALUES(sample_id,enabled,category,ms,result-'state',f);
    COMMIT;
   END LOOP;
  END LOOP;
 END LOOP;
END;
$proc$;
REVOKE ALL ON PROCEDURE public.replay_gin_predecessor_commit_benchmark(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON PROCEDURE public.replay_gin_predecessor_commit_benchmark(integer) TO replay_benchmark;
