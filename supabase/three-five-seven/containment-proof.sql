BEGIN;
SET LOCAL lock_timeout='2s';
DO $proof$
DECLARE u uuid;g uuid:=gen_random_uuid();f uuid:=gen_random_uuid();d uuid:=gen_random_uuid();kind text;
BEGIN
 SELECT id INTO STRICT u FROM public.profiles p WHERE EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p.id) ORDER BY id LIMIT 1;
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 INSERT INTO public.games(id,name,status,game_type,real_money,current_host) VALUES(g,'357 containment rollback','waiting','3-5-7',true,u),(f,'357 containment fake rollback','waiting','3-5-7',false,u);
 FOREACH kind IN ARRAY ARRAY['3-5-7','3-5-7-game','357'] LOOP
  BEGIN
   INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,g,u,kind);
   RAISE EXCEPTION 'proof:real_money_admitted';
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM<>'three_five_seven:real_money_admission_closed' THEN RAISE; END IF;
  END;
 END LOOP;
 BEGIN
  UPDATE public.games SET status='ante_decision' WHERE id=g;
  RAISE EXCEPTION 'proof:setup_admitted';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'three_five_seven:real_money_admission_closed' THEN RAISE; END IF;
 END;
 INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(d,f,u,'3-5-7');
 UPDATE public.games SET status='ante_decision' WHERE id=f;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type) VALUES(g,u,'holm-game');
 IF NOT (SELECT is_paused FROM public.games WHERE id='0ced03f3-902d-4593-b198-d0bca305211c') THEN RAISE EXCEPTION 'proof:incident_not_paused'; END IF;
END $proof$;
ROLLBACK;
