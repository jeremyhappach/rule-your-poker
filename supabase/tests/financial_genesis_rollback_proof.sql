BEGIN;
DO $proof$
DECLARE u uuid; peer uuid; g uuid; p uuid; denied boolean; result jsonb;
BEGIN
 SELECT p.id INTO u FROM public.profiles p JOIN auth.users a ON a.id=p.id WHERE p.is_active AND NOT public.has_role(p.id,'admin'::public.app_role) ORDER BY p.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.create_session(gen_random_uuid(),'Rollback financial genesis',false,1);
 g:=(result->>'game_id')::uuid; p:=(result->>'player_id')::uuid;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money,pot) VALUES('Rejected funded genesis','waiting',false,1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'genesis_proof:funded_game'; END IF;
 denied:=false; BEGIN INSERT INTO public.games(name,status,real_money,chip_transfer_cursor) VALUES('Rejected cursor genesis','waiting',false,1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'genesis_proof:forged_cursor'; END IF;
 denied:=false; BEGIN UPDATE public.players SET chips=1 WHERE id=p;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'genesis_proof:forged_balance'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT pot FROM public.games WHERE id=g)<>0 OR (SELECT chip_transfer_cursor FROM public.games WHERE id=g)<>0
   OR (SELECT chips FROM public.players WHERE id=p)<>0 THEN RAISE EXCEPTION 'genesis_proof:wrong_default'; END IF;
 -- A peer joining before the initial host is stamped must not take ownership.
 SELECT profile.id INTO peer FROM public.profiles profile JOIN auth.users a ON a.id=profile.id
 WHERE profile.is_active AND profile.id<>u ORDER BY profile.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',peer::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',peer,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.session_take_seat(g,2,NULL,NULL);
 EXECUTE 'RESET ROLE';
 IF result->>'outcome'<>'seated' OR (SELECT current_host FROM public.games WHERE id=g) IS DISTINCT FROM u THEN
   RAISE EXCEPTION 'genesis_proof:peer_stole_host:%',result;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.begin_session_dealer_selection(g);
 EXECUTE 'RESET ROLE';
 IF result->>'outcome'='not_authorized' OR (SELECT status FROM public.games WHERE id=g)<>'dealer_selection' THEN
   RAISE EXCEPTION 'genesis_proof:host_cannot_start:%',result;
 END IF;
END;
$proof$;
ROLLBACK;
