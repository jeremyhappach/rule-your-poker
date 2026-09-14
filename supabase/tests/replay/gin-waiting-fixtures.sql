CREATE OR REPLACE FUNCTION private.replay_gin_waiting_prepare_v2(_category text,_harness text,_bot boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $fn$
DECLARE
 _enabled boolean:=true;
 g uuid:=gen_random_uuid(); dg uuid:=gen_random_uuid(); u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); r uuid; v_result jsonb; v_state jsonb;
 v_mode text:=_harness;
 v_points integer:=CASE WHEN _category IN ('settlement_terminal','postgame_terminal') THEN 1 ELSE 1000 END;
 v_actor uuid; v_user uuid; v_action text; v_card jsonb; v_count integer;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  (u1,'replay-'||u1||'@example.invalid',jsonb_build_object('username','replay-'||u1)),
  (u2,'replay-'||u2||'@example.invalid',jsonb_build_object('username','replay-'||u2));
 INSERT INTO public.profiles(id,username) VALUES(u1,'replay-'||u1),(u2,'replay-'||u2) ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.system_settings(key,value) VALUES('harnesses_mode','{"enabled":true}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
 INSERT INTO public.game_defaults(game_type,debug_harness) VALUES('gin-rummy',v_mode) ON CONFLICT(game_type) DO UPDATE SET debug_harness=EXCLUDED.debug_harness;
 INSERT INTO public.games(id,name,game_type,status,ante_amount,buy_in,pot,total_hands,points_to_win,current_host,dealer_position,replay_contract_version,pending_session_end,game_setup_timer_seconds,real_money)
  VALUES(g,'Gin replay commit benchmark','gin-rummy','ante_decision',1,1000,0,0,v_points,u1,1,CASE WHEN _enabled THEN 1 END,_category='settlement_terminal',1,coalesce(nullif(current_setting('test.replay_real_money',true),''),'false')::boolean);
 INSERT INTO public.dealer_games(id,dealer_user_id,game_type,session_id,config)
  VALUES(dg,u1,'gin-rummy',g,jsonb_build_object('points_to_win',v_points,'per_point_value',1,'gin_bonus',25,'undercut_bonus',25));
 UPDATE public.games SET current_game_uuid=dg WHERE id=g;
 INSERT INTO public.players(id,user_id,game_id,position,chips,is_bot,status,ante_decision)
  VALUES(p1,u1,g,1,1000,false,'active','ante_up'),(p2,u2,g,2,1000,_bot,'active','ante_up');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 v_result:=public.start_gin_rummy_initial_hand(g); r:=(v_result->>'round_id')::uuid;
 IF v_result->>'outcome' IS DISTINCT FROM 'started' THEN RAISE EXCEPTION 'benchmark:opening:%',v_result; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
 RETURN jsonb_build_object('game',g,'round',r,'dealerGame',dg,'players',jsonb_build_array(p1,p2),'users',jsonb_build_array(u1,u2));
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_waiting_prepare_v2(text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
