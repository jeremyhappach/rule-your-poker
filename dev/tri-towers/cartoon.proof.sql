-- Transaction-contained proof; only synthetic Arcade records are changed.
DO $$
DECLARE a uuid:=gen_random_uuid(); r jsonb; p jsonb; req uuid; rev bigint; round_id text; game_id uuid; i integer; saved jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(a);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Cartoon projection proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/2';
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp();
 r:=public.arcade_start(a,gen_random_uuid(),'tri-towers');game_id:=(r->>'id')::uuid;
 r:=public.arcade_tri_step(a,game_id)->'record';
 UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{board,deck}',(SELECT jsonb_agg(n) FROM generate_series(0,51)n)),'{board,waste}','4') WHERE id=game_id;
 FOR i IN 18..20 LOOP
  SELECT revision,state->>'roundId' INTO rev,round_id FROM private.arcade_runs WHERE id=game_id;
  req:=gen_random_uuid();p:=public.arcade_tri_step(a,game_id,rev,round_id,req,'remove',i)->'projection';
  IF (p->>'highRun')::int<>i-17 THEN RAISE EXCEPTION 'cartoon:streak';END IF;
  IF public.arcade_tri_step(a,game_id,rev,round_id,req,'remove',i)->'projection'->>'highRun'<>p->>'highRun' THEN RAISE EXCEPTION 'cartoon:replay';END IF;
 END LOOP;
 SELECT revision,state->>'roundId' INTO rev,round_id FROM private.arcade_runs WHERE id=game_id;
 p:=public.arcade_tri_step(a,game_id,rev,round_id,gen_random_uuid(),'draw')->'projection';
 IF p->>'highRun'<>'3' OR p#>>'{view,run}'<>'0' THEN RAISE EXCEPTION 'cartoon:draw_retention';END IF;
 saved:=p->'view';p:=public.arcade_tri_step(a,game_id)->'projection';
 IF p->>'highRun'<>'3' OR p->'view'<>saved THEN RAISE EXCEPTION 'cartoon:reconnect';END IF;
 -- Scope to another round without carrying a display counter into it.
 UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{roundId}',to_jsonb(game_id||':3')),'{board,run}','0') WHERE id=game_id;
 p:=public.arcade_tri_step(a,game_id)->'projection';
 IF p->>'highRun'<>'0' THEN RAISE EXCEPTION 'cartoon:bonus_reset';END IF;
 IF has_function_privilege('anon','public.tri_towers_present(uuid,uuid,bigint,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'cartoon:anonymous_access';END IF;
 IF has_function_privilege('authenticated','private.arcade_tri_high_run(private.arcade_runs)','EXECUTE') THEN RAISE EXCEPTION 'cartoon:private_access';END IF;
END $$;
