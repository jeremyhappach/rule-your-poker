-- Uses synthetic profiles and actual API roles. Every change rolls back.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
DO $proof$
DECLARE
 a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 forged uuid:=gen_random_uuid(); result jsonb; denied boolean;
BEGIN
 INSERT INTO public.profiles(id,username) VALUES(a,'Role proof admin'),(u,'Role proof user'),(t,'Role proof target');
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'::public.app_role);
 IF NOT (SELECT is_superuser FROM public.profiles WHERE id=a) OR NOT public.is_admin(a) THEN
   RAISE EXCEPTION 'role_proof:projection_not_created';
 END IF;
 IF has_function_privilege('anon','public.admin_set_user_role(uuid,boolean)','EXECUTE')
    OR has_table_privilege('authenticated','public.user_roles','INSERT')
    OR has_table_privilege('authenticated','public.user_roles','UPDATE')
    OR has_table_privilege('authenticated','public.user_roles','DELETE') THEN
   RAISE EXCEPTION 'role_proof:alternate_role_writer';
 END IF;

 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 PERFORM set_config('request.jwt.claim.sub','',true);
 EXECUTE 'SET LOCAL ROLE anon';
 denied:=false;
 BEGIN
   PERFORM public.admin_set_user_role(t,true);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:anon_role_command'; END IF;
 denied:=false;
 BEGIN
   INSERT INTO public.profiles(id,username,is_superuser) VALUES(forged,'Bot privilege proof',true);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:anon_forged_admin'; END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 UPDATE public.profiles SET table_layout='classic',play_sounds=false WHERE id=u;
 IF NOT FOUND THEN RAISE EXCEPTION 'role_proof:own_preferences_blocked'; END IF;
 denied:=false;
 BEGIN
   UPDATE public.profiles SET is_superuser=true WHERE id=u;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:self_promotion'; END IF;
 denied:=false;
 BEGIN
   UPDATE public.profiles SET is_active=false WHERE id=u;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:self_activation_write'; END IF;
 denied:=false;
 BEGIN
   UPDATE public.profiles SET id=forged WHERE id=u;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:profile_identity_write'; END IF;
 denied:=false;
 BEGIN
   INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'::public.app_role);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:direct_role_write'; END IF;
 denied:=false;
 BEGIN
   PERFORM public.admin_set_user_role(u,true);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:nonadmin_role_command'; END IF;
 EXECUTE 'RESET ROLE';

 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;
 BEGIN
   INSERT INTO public.user_roles(user_id,role) VALUES(t,'admin'::public.app_role);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:admin_alternate_role_writer'; END IF;
 result:=public.admin_set_user_role(t,true);
 IF result->>'changed'<>'true' OR NOT public.has_role(t,'admin'::public.app_role)
    OR NOT public.is_admin(t) OR NOT (SELECT is_superuser FROM public.profiles WHERE id=t) THEN
   RAISE EXCEPTION 'role_proof:grant_not_atomic:%',result;
 END IF;
 result:=public.admin_set_user_role(t,true);
 IF result->>'changed'<>'false' THEN RAISE EXCEPTION 'role_proof:grant_not_idempotent'; END IF;
 UPDATE public.profiles SET is_active=false WHERE id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'role_proof:admin_activation_blocked'; END IF;
 result:=public.admin_set_user_role(t,false);
 IF result->>'changed'<>'true' OR public.has_role(t,'admin'::public.app_role)
    OR public.is_admin(t) OR (SELECT is_superuser FROM public.profiles WHERE id=t) THEN
   RAISE EXCEPTION 'role_proof:revoke_not_atomic:%',result;
 END IF;
 result:=public.admin_set_user_role(t,false);
 IF result->>'changed'<>'false' THEN RAISE EXCEPTION 'role_proof:revoke_not_idempotent'; END IF;
 denied:=false;
 BEGIN
   PERFORM public.admin_set_user_role(a,false);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:self_admin_removal'; END IF;
 denied:=false;
 BEGIN
   UPDATE public.profiles SET is_superuser=true WHERE id=t;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'role_proof:admin_profile_alternate_writer'; END IF;
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.is_superuser IS DISTINCT FROM public.has_role(p.id,'admin'::public.app_role)) THEN
   RAISE EXCEPTION 'role_proof:role_projection_drift';
 END IF;
END;
$proof$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
