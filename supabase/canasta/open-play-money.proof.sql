-- Rollback-only installed-authority proof. No real-money gameplay or settlement.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();
 p uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline timestamptz:=clock_timestamp()+interval '120 seconds';i integer;r jsonb;
BEGIN
 UPDATE private.canasta_release SET enabled=true,admission_enabled=true;
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(u[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Canasta general admission proof '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline) VALUES(g,'game_selection',false,1,0,false,deadline);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
 SELECT p[j],g,u[j],j,100,false,'active',false,false FROM generate_series(1,2) j;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u[1])::text,true);
 IF EXISTS(SELECT FROM private.canasta_qualification WHERE game_id=g) THEN RAISE EXCEPTION 'unexpected_allowlist';END IF;
 IF NOT private.canasta_admission_allowed(u[1],g) OR public.canasta_capabilities(g)->>'enabled'<>'true' THEN RAISE EXCEPTION 'ordinary_fake_discovery_denied';END IF;
 UPDATE public.games SET real_money=true WHERE id=g;
 IF private.canasta_admission_allowed(u[1],g) OR public.canasta_capabilities(g)->>'enabled'<>'false' THEN RAISE EXCEPTION 'real_discovery_leak';END IF;
 BEGIN
  PERFORM public.canasta_configure(g,p[1],1,'canasta','{"ante_amount":5}',deadline);
  RAISE EXCEPTION 'real_setup_allowed';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'canasta:fake_money_only' THEN RAISE;END IF;END;
 UPDATE public.games SET real_money=false WHERE id=g;
 r:=public.canasta_configure(g,p[1],1,'canasta','{"ante_amount":5}',deadline);
 IF r#>>'{dealer_game,id}' IS NULL THEN RAISE EXCEPTION 'ordinary_fake_setup_denied';END IF;
END $$;
SELECT jsonb_build_object('ordinary_unlisted_fake_discovery',true,'ordinary_unlisted_fake_setup',true,'real_money_denied',true,'rollback_only',true) evidence;
ROLLBACK;
