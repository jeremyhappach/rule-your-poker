DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();d uuid;deadline timestamptz:=clock_timestamp()+interval '10 minutes';v jsonb;i int;
BEGIN
 FOR i IN 1..2 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Words release proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 PERFORM pg_temp.words_assert(NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=ANY(users)),'ordinary non-admin users');
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',true,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],3-j,100,false FROM generate_series(1,2)j;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 SET LOCAL ROLE authenticated;
 v:=public.ptown_words_capabilities(g);PERFORM pg_temp.words_assert(v->>'version'='3' AND v->>'fake_money_only'='true' AND v->>'enabled'='false','real session capability closed');
 BEGIN PERFORM public.ptown_words_configure(g,ids[1],2,'ptown-words','{"ante_amount":5}',deadline);RAISE EXCEPTION 'missing real configure rejection';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:fake_money_only' THEN RAISE;END IF;END;
 RESET ROLE;
 UPDATE public.games SET real_money=false WHERE id=g;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.words_assert((public.ptown_words_capabilities(g)->>'enabled')::boolean,'ordinary fake-money session eligible');
 v:=public.ptown_words_configure(g,ids[1],2,'ptown-words','{"ante_amount":5}',deadline);d:=(v#>>'{dealer_game,id}')::uuid;
 RESET ROLE;
 UPDATE public.games SET real_money=true WHERE id=g;
 BEGIN PERFORM private.megatouch_begin(g,d);RAISE EXCEPTION 'missing real begin rejection';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:fake_money_only' THEN RAISE;END IF;END;
 PERFORM pg_temp.words_assert(NOT EXISTS(SELECT 1 FROM private.ptown_words_matches WHERE dealer_game_id=d),'real begin creates no match');
 UPDATE public.games SET real_money=false WHERE id=g;PERFORM pg_temp.words_accept(g,d);
 PERFORM pg_temp.words_assert(EXISTS(SELECT 1 FROM private.ptown_words_matches WHERE dealer_game_id=d),'ordinary fake-money admission succeeds');
 PERFORM pg_temp.words_assert((private.ptown_words_rules()->>'turnMs')::int=180000,'normal turn timer unchanged');
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM pg_temp.words_assert(NOT(public.ptown_words_capabilities(NULL)->>'enabled')::boolean,'anonymous blocked');
END $proof$;
