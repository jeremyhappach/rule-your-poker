-- Rollback only. Random fixture identities; no customer or shared-health writes.
DO $$
DECLARE u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();g uuid:=gen_random_uuid();bad uuid:=gen_random_uuid();req uuid:=gen_random_uuid();parent uuid;cfg jsonb;offer text;denied boolean;flags jsonb;
BEGIN
 SELECT jsonb_build_object('live',live_enabled,'async',async_enabled) INTO flags FROM private.mega_competition_release;
 PERFORM pg_temp.mega_assert(flags='{"live":false,"async":false}','public admission remains closed');
 INSERT INTO auth.users(id,raw_app_meta_data) VALUES(u,'{"mega_synthetic":true}'),(v,'{"mega_synthetic":true}'),(outsider,'{}');
 INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Mega qualification A',true),(v,'Mega qualification B',true),(outsider,'Mega qualification outsider',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 INSERT INTO private.mega_test_accounts(user_id,expires_at) VALUES(u,clock_timestamp()+interval '1 hour'),(v,clock_timestamp()+interval '1 hour');
 INSERT INTO public.games(id,status,real_money) VALUES(g,'game_selection',false),(bad,'game_selection',true);
 INSERT INTO private.mega_test_live(game_id,user_id,expires_at) VALUES(g,u,clock_timestamp()+interval '1 hour'),(g,v,clock_timestamp()+interval '1 hour'),(bad,u,clock_timestamp()+interval '1 hour');
 PERFORM pg_temp.mega_assert(private.mega_live_admission_allowed(u,g) AND NOT private.mega_live_admission_allowed(outsider,g) AND NOT private.mega_live_admission_allowed(u,bad) AND NOT private.mega_live_admission_allowed(u,gen_random_uuid()),'exact fake session and actor scope');
 PERFORM pg_temp.mega_assert(NOT private.mega_test_visible(g,outsider) AND private.mega_test_visible(g,u),'synthetic lobby isolation');
 PERFORM pg_temp.mega_login(outsider);SET LOCAL ROLE authenticated;
 PERFORM pg_temp.mega_assert(NOT EXISTS(SELECT FROM public.games WHERE id=g),'actual outsider RLS hides synthetic table');
 RESET ROLE;
 denied:=false;BEGIN UPDATE public.games SET real_money=true WHERE id=g;EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'mega:test_fake_only' THEN RAISE;END IF;denied:=true;END;
 PERFORM pg_temp.mega_assert(denied,'money-mode escalation rejected');
 denied:=false;BEGIN INSERT INTO public.players(game_id,user_id,position,chips,is_bot) VALUES(g,outsider,1,100,false);EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'mega:test_roster' THEN RAISE;END IF;denied:=true;END;
 PERFORM pg_temp.mega_assert(denied,'outsider seat rejected');
 UPDATE private.mega_test_live SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE game_id=g AND user_id=u;
 PERFORM pg_temp.mega_assert(NOT private.mega_live_admission_allowed(u,g),'expired live grant denies new admission');
 INSERT INTO private.mega_test_async(actor,request_id,opponent,expires_at) VALUES(u,req,v,clock_timestamp()+interval '1 hour');
 PERFORM pg_temp.mega_assert(private.mega_test_async_allowed(u,v,req,NULL,false) AND NOT private.mega_test_async_allowed(u,v,req,NULL,true) AND NOT private.mega_test_async_allowed(u,outsider,req,NULL,false) AND NOT private.mega_test_async_allowed(u,v,gen_random_uuid(),NULL,false),'exact fake invitation grant');
 PERFORM pg_temp.mega_login(u);cfg:=private.mega_competition_config();cfg:=jsonb_set(cfg,'{course,holes}','3');
 parent:=public.delayed_create(req,v,false,jsonb_build_array(jsonb_build_object('game','mega-card-golf','stake',5,'config',cfg)));
 PERFORM pg_temp.mega_assert(public.delayed_create(req,v,false,jsonb_build_array(jsonb_build_object('game','mega-card-golf','stake',5,'config',cfg)))=parent,'create replay returns same scoped invitation');
 SELECT offer_hash INTO offer FROM private.delayed_matches WHERE id=parent;
 PERFORM pg_temp.mega_login(v);
 PERFORM public.delayed_respond(parent,gen_random_uuid(),offer,'accept');
 PERFORM pg_temp.mega_assert((SELECT status='active' AND NOT real_money FROM private.delayed_matches WHERE id=parent),'fake invitation accepts with public flag closed');
 PERFORM pg_temp.mega_assert(NOT has_table_privilege('authenticated','private.mega_test_live','INSERT') AND NOT has_table_privilege('service_role','private.mega_test_async','INSERT') AND NOT has_function_privilege('authenticated','public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','EXECUTE'),'private allowlist and state authority');
 PERFORM pg_temp.mega_assert((SELECT NOT live_enabled AND NOT async_enabled FROM private.mega_competition_release),'qualification never opens public admission');
END $$;
