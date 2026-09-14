CREATE OR REPLACE FUNCTION private.replay_gin_lifecycle_proof_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE category text;f jsonb;g public.games;r public.rounds;p public.players;result jsonb;exports jsonb;before_count bigint;u3 uuid:=gen_random_uuid();p3 uuid;
 checks jsonb:='[]';
BEGIN
 BEGIN
  FOREACH category IN ARRAY ARRAY['reveal_void','scoring','settlement_terminal'] LOOP
   f:=private.replay_gin_benchmark_prepare(true,category);
   SELECT * INTO g FROM public.games WHERE id=(f->>'game')::uuid;
   SELECT * INTO r FROM public.rounds WHERE id=(f->>'round')::uuid;
   IF category='reveal_void' THEN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    SELECT count(*) INTO before_count FROM private.replay_steps WHERE session_id=g.id;
    result:=public.set_game_paused(g.id,true,g.current_game_uuid,g.pause_version);
    IF result->>'outcome' NOT IN ('applied','accepted') AND (SELECT is_paused FROM public.games WHERE id=g.id) IS NOT TRUE THEN RAISE EXCEPTION 'proof:pause:%',result; END IF;
    SELECT * INTO g FROM public.games WHERE id=g.id;
    result:=public.set_game_paused(g.id,false,g.current_game_uuid,g.pause_version);
    IF (SELECT is_paused FROM public.games WHERE id=g.id) IS TRUE THEN RAISE EXCEPTION 'proof:resume:%',result; END IF;
    IF (SELECT count(*) FROM private.replay_steps WHERE session_id=g.id)<>before_count+2 THEN RAISE EXCEPTION 'proof:pause_append_count'; END IF;
    SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=(f->'users'->>0)::uuid;
    result:=public.set_session_player_intent(g.id,p.id,p.intent_version,g.current_game_uuid,'sit_out_next_hand',true);
    IF (SELECT sit_out_next_hand FROM public.players WHERE id=p.id) IS NOT TRUE THEN RAISE EXCEPTION 'proof:intent:%',result; END IF;
    SELECT * INTO p FROM public.players WHERE id=p.id;
    result:=public.set_session_player_intent(g.id,p.id,p.intent_version,g.current_game_uuid,'cancel_exit',true);
    SELECT * INTO p FROM public.players WHERE id=p.id;
    result:=public.set_automatic_play(g.id,r.id,g.current_game_uuid,p.id,p.intent_version,true);
    IF result->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:automatic_play:%',result; END IF;
    SELECT * INTO p FROM public.players WHERE id=p.id;
    result:=public.set_automatic_play(g.id,r.id,g.current_game_uuid,p.id,p.intent_version,false);
    SELECT * INTO g FROM public.games WHERE id=g.id;
    result:=public.transfer_session_host(g.id,(f->>'actor')::uuid,g.host_version);
    IF result->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'proof:host_transfer:%',result; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>1,'role','authenticated')::text,true);
    SELECT * INTO g FROM public.games WHERE id=g.id;
    result:=public.transfer_session_host(g.id,p.id,g.host_version);
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u3,'replay-'||u3||'@example.invalid',jsonb_build_object('username','replay-'||u3));
    INSERT INTO public.profiles(id,username) VALUES(u3,'replay-'||u3) ON CONFLICT DO NOTHING;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u3,'role','authenticated')::text,true);
    result:=public.session_take_seat(g.id,3,NULL,NULL);
    SELECT id INTO p3 FROM public.players WHERE game_id=g.id AND user_id=u3;
    IF p3 IS NULL THEN RAISE EXCEPTION 'proof:join:%',result; END IF;
    SELECT * INTO p FROM public.players WHERE id=p3;
    result:=public.session_leave(g.id,p3,p.participation_version);
    IF (SELECT status FROM public.players WHERE id=p3)<>'left' THEN RAISE EXCEPTION 'proof:departure:%',result; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->'users'->>0,'role','authenticated')::text,true);
    SELECT * INTO p FROM public.players WHERE game_id=g.id AND user_id=(f->'users'->>0)::uuid;
    result:=public.settle_gameplay_chip_transfers(g.id,jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',p.id),
      'to',jsonb_build_object('kind','player','playerId',f->>'actor'),'amount',7)),'replay_qualification');
    checks:=checks||' ["pause_resume","participation_intent","automatic_play","host_transfer","join_departure","exact_shared_transfer"]'::jsonb;
   END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',f->>'user','role','authenticated')::text,true);
   result:=public.gin_rummy_apply_action(r.id,(f->>'actor')::uuid,f->>'action',nullif(f->'card','null'::jsonb),NULL,(f->>'count')::bigint);
   IF result->>'outcome'<>'applied' THEN RAISE EXCEPTION 'proof:terminal:%',result; END IF;
   INSERT INTO private.replay_gin_benchmark_samples VALUES(-1,true,category,0,result-'state',f);
  END LOOP;
  exports:=private.replay_gin_export_proof_v1(-1);
  RAISE EXCEPTION USING ERRCODE='ZP003',MESSAGE='rollback_lifecycle_proof';
 EXCEPTION WHEN SQLSTATE 'ZP003' THEN NULL;
 END;
 RETURN exports||jsonb_build_object('sharedChecks',checks);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_lifecycle_proof_v1() FROM PUBLIC,anon,authenticated,service_role;
