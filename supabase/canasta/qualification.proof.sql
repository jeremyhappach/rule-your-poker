-- Run inside a caller-owned rollback transaction, with genuine recovery health
-- for the configure/consent path (local harness health is explicitly synthetic).
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 g uuid:=gen_random_uuid();other_g uuid:=gen_random_uuid();p uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];
 deadline timestamptz:=clock_timestamp()+interval '120 seconds';r jsonb;d uuid;i integer;
BEGIN
 UPDATE private.canasta_release SET enabled=true,admission_enabled=false;
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(u[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Canasta scoped '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline)
  VALUES(g,'game_selection',false,1,0,false,deadline),(other_g,'game_selection',false,1,0,false,deadline);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
  SELECT p[j],g,u[j],j,100,false,'active',false,false FROM generate_series(1,2) j;
 INSERT INTO private.canasta_qualification(game_id,user_id,expires_at) VALUES(g,u[1],clock_timestamp()+interval '24 hours');
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u[1])::text,true);
 PERFORM pg_temp.canasta_assert(NOT private.canasta_admission_allowed(u[1],other_g),'exact session scope');
 PERFORM pg_temp.canasta_assert(NOT private.canasta_admission_allowed(u[3],g),'outsider denied');
 PERFORM pg_temp.canasta_assert(public.canasta_capabilities(NULL)->>'enabled'='false','no global discovery');
 PERFORM pg_temp.canasta_assert(public.canasta_capabilities(g)->>'enabled'='false','all humans require grants');
 BEGIN PERFORM public.canasta_configure(g,p[1],1,'canasta','{"ante_amount":10}',deadline);RAISE EXCEPTION 'missing roster gate';
 EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.canasta_assert(SQLERRM='canasta:tester_required','unscoped opponent denied');END;
 INSERT INTO private.canasta_qualification(game_id,user_id,expires_at) VALUES(g,u[2],clock_timestamp()+interval '24 hours');
 PERFORM pg_temp.canasta_assert(public.canasta_capabilities(g)->>'enabled'='true','exact scoped roster admitted');
 UPDATE public.games SET real_money=true WHERE id=g;
 PERFORM pg_temp.canasta_assert(NOT private.canasta_admission_allowed(u[1],g),'grant never permits real money');
 UPDATE public.games SET real_money=false WHERE id=g;
 UPDATE public.profiles SET is_active=false WHERE id=u[1];
 PERFORM pg_temp.canasta_assert(NOT private.canasta_admission_allowed(u[1],g),'grant never overrides active profile');
 UPDATE public.profiles SET is_active=true WHERE id=u[1];
 r:=public.canasta_configure(g,p[1],1,'canasta','{"ante_amount":10}',deadline);d:=(r#>>'{dealer_game,id}')::uuid;
 UPDATE private.canasta_qualification SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE game_id=g;
 PERFORM pg_temp.canasta_assert(NOT private.canasta_admission_allowed(u[1],g),'expiry blocks new setup');
 PERFORM pg_temp.canasta_assert(public.canasta_configure(g,p[1],1,'canasta','{"ante_amount":10}',deadline)->>'outcome'='already_configured','committed setup retry survives expiry');
 DELETE FROM private.canasta_qualification WHERE game_id=g;
 PERFORM set_config('request.jwt.claim.sub',u[2]::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u[2])::text,true);
 r:=public.submit_ante_decision(g,d,p[2],'ante_up',NULL,NULL);
 PERFORM pg_temp.canasta_assert(r#>>'{phase,outcome}'='advanced','accepted roster consent survives expired/removed grants');
 PERFORM public.canasta_server_load(d,u[1]);
 PERFORM pg_temp.canasta_assert(NOT has_table_privilege('authenticated','private.canasta_qualification','SELECT,INSERT,UPDATE,DELETE'),'no browser grant access');
 UPDATE private.canasta_release SET enabled=false,admission_enabled=false;
END $$;
