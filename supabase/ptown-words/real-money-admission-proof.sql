-- Run inside rollback, after core helpers and before financial proof. No customers.
CREATE FUNCTION pg_temp.money_rpc(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated; EXECUTE command INTO answer; RESET ROLE; RETURN answer;
END $$;
DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()]; ids uuid[]; g uuid; d uuid;
 deadline timestamptz:=clock_timestamp()+interval '10 minutes'; v jsonb; mode integer; i integer;
BEGIN
 PERFORM pg_temp.words_assert((SELECT enabled AND admission_enabled AND bots_enabled AND NOT real_qualified FROM private.ptown_words_release),'installed closed; fake availability and bots preserved');
 FOR i IN 1..2 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Words money proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 FOR mode IN 0..2 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES(g,'game_selection',mode>0,2,deadline,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],2*j,0,mode=2 AND j=2 FROM generate_series(1,2)j;
  UPDATE private.ptown_words_release SET real_qualified=false;
  v:=pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_capabilities(%L)',g));
  PERFORM pg_temp.words_assert((v->>'enabled')::boolean=(mode=0) AND v->>'version'='3' AND (v->>'fake_money_only')::boolean,'closed real session capability; fake enabled');
  IF mode>0 THEN BEGIN
   PERFORM pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_configure(%L,%L,2,%L,%L::jsonb,%L)',g,ids[1],'ptown-words','{"ante_amount":5}',deadline));RAISE EXCEPTION 'missing closed admission';
   EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:real_money_closed' THEN RAISE;END IF;END;
  END IF;
  UPDATE private.ptown_words_release SET real_qualified=true;
  IF mode=2 THEN BEGIN
   PERFORM pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_configure(%L,%L,2,%L,%L::jsonb,%L)',g,ids[1],'ptown-words','{"ante_amount":5}',deadline));RAISE EXCEPTION 'missing real bot rejection';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:bots_fake_money_only' THEN RAISE;END IF;END;
   CONTINUE;
  END IF;
  v:=pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_capabilities(%L)',g));
  PERFORM pg_temp.words_assert((v->>'enabled')::boolean AND v->>'version'='4' AND NOT(v->>'fake_money_only')::boolean,'ordinary active human capability opens in both modes');
  PERFORM pg_temp.words_assert(NOT(pg_temp.money_rpc(gen_random_uuid(),format('SELECT public.ptown_words_capabilities(%L)',g))->>'enabled')::boolean,'outsider cannot discover admission');
  UPDATE public.profiles SET is_active=false WHERE id=users[2];
  PERFORM pg_temp.words_assert(NOT(pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_capabilities(%L)',g))->>'enabled')::boolean,'inactive co-player blocks admission');
  UPDATE public.profiles SET is_active=true WHERE id=users[2];
  v:=pg_temp.money_rpc(users[1],format('SELECT public.ptown_words_configure(%L,%L,2,%L,%L::jsonb,%L)',g,ids[1],'ptown-words','{"ante_amount":5}',deadline));d:=(v#>>'{dealer_game,id}')::uuid;
  IF mode=1 THEN
   BEGIN UPDATE private.ptown_words_release SET real_qualified=false;PERFORM private.megatouch_begin(g,d);RAISE EXCEPTION 'missing closed start';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'ptown_words:real_money_closed' THEN RAISE;END IF;END;
   BEGIN UPDATE public.games SET ante_amount=6 WHERE id=g;PERFORM private.megatouch_begin(g,d);RAISE EXCEPTION 'missing frozen stake guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'megatouch:stake_changed' THEN RAISE;END IF;END;
  END IF;
 END LOOP;
 BEGIN
  PERFORM pg_temp.money_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,true,%L::jsonb))',gen_random_uuid(),users[2],'[{"game":"ptown-words","stake":5}]'));RAISE EXCEPTION 'missing async real rejection';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_offer' THEN RAISE;END IF;END;
 PERFORM pg_temp.words_assert(NOT has_table_privilege('authenticated','private.ptown_words_release','UPDATE') AND NOT has_function_privilege('authenticated','private.ptown_words_settle(uuid)','EXECUTE'),'browser cannot activate or settle');
END $proof$;
