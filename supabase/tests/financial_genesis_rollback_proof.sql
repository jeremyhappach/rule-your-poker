BEGIN;
DO $proof$
DECLARE u uuid; g uuid; p uuid; denied boolean;
BEGIN
 SELECT p.id INTO u FROM public.profiles p JOIN auth.users a ON a.id=p.id WHERE p.is_active AND NOT public.has_role(p.id,'admin'::public.app_role) ORDER BY p.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 INSERT INTO public.games(name,status,real_money) VALUES('Rollback financial genesis','waiting',false) RETURNING id INTO g;
 INSERT INTO public.players(game_id,user_id,position,chips,waiting) VALUES(g,u,1,0,true) RETURNING id INTO p;
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
END;
$proof$;
ROLLBACK;
