-- Temporary branch only. Timing spans the authenticated authoritative RPC and
-- the following real COMMIT, including deferred financial-ledger triggers.
CREATE TABLE private.replay_gin_benchmark_samples(
 sample integer,enabled boolean,category text,milliseconds numeric,result jsonb,fixture jsonb,
 PRIMARY KEY(sample,enabled,category)
);
CREATE OR REPLACE FUNCTION private.replay_gin_benchmark_prepare(_enabled boolean,_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE
 g uuid:=gen_random_uuid(); dg uuid:=gen_random_uuid(); u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); r uuid; v_result jsonb; v_state jsonb;
 v_mode text:=CASE WHEN _category IN ('ordinary','compound','reveal_void') THEN 'stock_two_void' ELSE 'non_dealer_near_knock' END;
 v_points integer:=CASE WHEN _category='settlement_terminal' THEN 1 ELSE 1000 END;
 v_actor uuid; v_user uuid; v_action text; v_card jsonb; v_count integer;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (u1,'replay-'||u1||'@example.invalid',jsonb_build_object('username','replay-'||u1)),
  (u2,'replay-'||u2||'@example.invalid',jsonb_build_object('username','replay-'||u2));
 INSERT INTO public.profiles(id,username) VALUES(u1,'replay-'||u1),(u2,'replay-'||u2) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":true}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
 INSERT INTO public.game_defaults(game_type,debug_harness) VALUES('gin-rummy',v_mode) ON CONFLICT(game_type) DO UPDATE SET debug_harness=EXCLUDED.debug_harness;
 INSERT INTO public.games(id,name,game_type,status,ante_amount,buy_in,pot,total_hands,points_to_win,current_host,dealer_position,replay_contract_version,pending_session_end)
  VALUES(g,'Gin replay commit benchmark','gin-rummy','ante_decision',1,1000,0,0,v_points,u1,1,NULL,_category='settlement_terminal');
 INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(dg,u1,'gin-rummy',g,jsonb_build_object('points_to_win',v_points,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25));
 UPDATE public.games SET current_game_uuid=dg WHERE id=g;
 INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES(p1,u1,g,1,1000,false,'active','ante_up'),(p2,u2,g,2,1000,false,'active','ante_up');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 v_result:=public.start_gin_rummy_initial_hand(g); r:=(v_result->>'round_id')::uuid;
 -- Disposable benchmark fixtures only: production enrolls all new hands.
 IF NOT _enabled THEN UPDATE public.games SET replay_contract_version=NULL WHERE id=g; UPDATE private.gin_rummy_round_states SET replay_context_v1=NULL WHERE round_id=r; END IF;
 IF v_result->>'outcome' IS DISTINCT FROM 'started' THEN RAISE EXCEPTION 'benchmark:opening:%',v_result; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
 IF _category='ordinary' THEN v_actor:=p2;v_user:=u2;v_action:='pass_first_draw';v_count:=0;
 ELSIF _category IN ('compound','reveal_void') THEN
  PERFORM public.gin_rummy_apply_action(r,p2,'pass_first_draw',NULL,NULL,0);
  v_actor:=p1;v_user:=u1;v_action:='pass_first_draw';v_count:=1;
  IF _category='reveal_void' THEN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
   PERFORM public.gin_rummy_apply_action(r,p1,'pass_first_draw',NULL,NULL,1);
   SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=r;
   v_actor:=p2;v_user:=u2;v_action:='discard';v_count:=2;v_card:=v_state->'playerStates'->p2::text->'hand'->0;
  END IF;
 ELSE
  PERFORM public.gin_rummy_apply_action(r,p2,'take_first_draw',NULL,NULL,0);
  PERFORM public.gin_rummy_apply_action(r,p2,'knock',private.gin_card('K',chr(9829)),NULL,1);
  v_actor:=p1;v_user:=u1;v_action:='finish_lay_off';v_count:=2;
 END IF;
 RETURN jsonb_build_object('game',g,'round',r,'dealerGame',dg,'actor',v_actor,'user',v_user,'action',v_action,'card',v_card,'count',v_count,'users',jsonb_build_array(u1,u2));
END;
$fn$;
CREATE OR REPLACE PROCEDURE public.replay_gin_commit_benchmark(_samples integer DEFAULT 30)
LANGUAGE plpgsql AS $proc$
DECLARE v_sample integer; v_offset integer; v_switch integer; v_enabled boolean; v_category text; v_fixture jsonb; v_start timestamptz; v_ms numeric; v_result jsonb;
BEGIN
 SELECT coalesce(max(sample),0) INTO v_offset FROM private.replay_gin_benchmark_samples;
 FOR v_sample IN v_offset+1..v_offset+_samples LOOP
  FOREACH v_category IN ARRAY ARRAY['ordinary','compound','reveal_void','scoring','settlement_terminal'] LOOP
   FOR v_switch IN 0..1 LOOP
    v_enabled:=((v_sample+v_switch)%2)=0;
    v_fixture:=private.replay_gin_benchmark_prepare(v_enabled,v_category);
    COMMIT;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_fixture->>'user','role','authenticated')::text,true);
    v_start:=clock_timestamp();
    v_result:=public.gin_rummy_apply_action((v_fixture->>'round')::uuid,(v_fixture->>'actor')::uuid,v_fixture->>'action',
      nullif(v_fixture->'card','null'::jsonb),NULL,(v_fixture->>'count')::bigint);
    COMMIT;
    v_ms:=1000*extract(epoch FROM clock_timestamp()-v_start);
    IF v_result->>'outcome' IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'benchmark:action_failed:%',v_result; END IF;
    INSERT INTO private.replay_gin_benchmark_samples VALUES(v_sample,v_enabled,v_category,v_ms,v_result-'state',v_fixture);
    COMMIT;
   END LOOP;
  END LOOP;
 END LOOP;
END;
$proc$;
REVOKE ALL ON FUNCTION private.replay_gin_benchmark_prepare(boolean,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON PROCEDURE public.replay_gin_commit_benchmark(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.replay_gin_benchmark_prepare(boolean,text) TO replay_benchmark;
GRANT EXECUTE ON PROCEDURE public.replay_gin_commit_benchmark(integer) TO replay_benchmark;
GRANT INSERT,SELECT ON private.replay_gin_benchmark_samples TO replay_benchmark;
