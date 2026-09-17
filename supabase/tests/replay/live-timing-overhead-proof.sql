CREATE TEMP TABLE live_timing_samples(category text, enabled boolean, elapsed numeric);
DO $proof$
DECLARE f jsonb;r jsonb;kind text;iteration integer;arm integer;enabled boolean;started timestamptz;duration numeric;headers jsonb;
BEGIN
 FOR iteration IN 1..16 LOOP
  FOREACH kind IN ARRAY ARRAY['ordinary','compound','reveal_void','scoring','settlement_terminal'] LOOP
   FOR arm IN 0..1 LOOP
    enabled:=(iteration+arm)%2=0;
    PERFORM set_config('app.live_timing_disabled',(NOT enabled)::text,true);
    f:=private.replay_gin_benchmark_prepare(true,kind);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
    PERFORM set_config('response.headers','[]',true);
    PERFORM set_config('app.replay_live_ms','',true);
    PERFORM set_config('app.replay_live_sections','',true);
    started:=clock_timestamp();
    r:=public.gin_rummy_apply_action((f->>'round')::uuid,(f->>'actor')::uuid,f->>'action',f->'card',NULL,(f->>'count')::integer);
    SET CONSTRAINTS ALL IMMEDIATE;
    duration:=extract(epoch FROM clock_timestamp()-started)*1000;
    SET CONSTRAINTS ALL DEFERRED;
    IF r->>'outcome'<>'applied' THEN RAISE EXCEPTION 'timing_proof:action'; END IF;
    headers:=current_setting('response.headers',true)::jsonb;
    IF enabled AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(headers) h WHERE (h->>'X-Ptown-Replay-Ms')::numeric>0) THEN RAISE EXCEPTION 'timing_proof:missing_header'; END IF;
    IF NOT enabled AND headers<>'[]'::jsonb THEN RAISE EXCEPTION 'timing_proof:disabled_headers'; END IF;
    IF iteration>2 THEN INSERT INTO live_timing_samples VALUES(kind,enabled,duration); END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 -- Corrupt diagnostic metadata must not reject gameplay or discard an existing header.
 PERFORM set_config('response.headers','not-json',true);
 PERFORM private.replay_live_timing_finish_v1(clock_timestamp());
 PERFORM set_config('response.headers','[{"Cache-Control":"no-store"},{"Access-Control-Expose-Headers":"Existing"}]',true);
 PERFORM private.replay_live_timing_finish_v1(clock_timestamp());
 IF NOT current_setting('response.headers',true)::jsonb @> '[{"Cache-Control":"no-store"}]'::jsonb THEN RAISE EXCEPTION 'timing_proof:existing_header_lost'; END IF;
END;
$proof$;
