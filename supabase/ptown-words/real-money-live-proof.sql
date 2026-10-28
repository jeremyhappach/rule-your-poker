BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s';
CREATE FUNCTION pg_temp.live_rpc(actor uuid,command text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE answer jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;EXECUTE command INTO answer;RESET ROLE;RETURN answer;
END $$;
DO $proof$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()]; ids uuid[];g uuid;d uuid;v jsonb;deadline timestamptz:=clock_timestamp()+interval '10 minutes';mode integer;i integer;
BEGIN
 IF NOT EXISTS(SELECT FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled AND bots_enabled AND real_qualified) THEN RAISE EXCEPTION 'Words not live';END IF;
 FOR i IN 1..2 LOOP INSERT INTO auth.users(id) VALUES(users[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Words live money proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;END LOOP;
 -- Ordinary active users, with no administrative or allowlist privilege.
 FOR mode IN 0..3 LOOP
  g:=gen_random_uuid();ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES(g,'game_selection',mode%2=1,2,deadline,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[j],g,users[j],2*j,0,mode>=2 AND j=2 FROM generate_series(1,2)j;
  v:=pg_temp.live_rpc(users[1],format('SELECT public.ptown_words_capabilities(%L)',g));
  IF v->>'version'<>'4' OR NOT(v->>'enabled')::boolean OR (v->>'fake_money_only')::boolean OR v->>'user_id'<>users[1]::text OR v->>'session_id'<>g::text THEN RAISE EXCEPTION 'Words live capability mismatch';END IF;
  BEGIN
   v:=pg_temp.live_rpc(users[1],format('SELECT public.ptown_words_configure(%L,%L,2,%L,%L::jsonb,%L)',g,ids[1],'ptown-words','{"ante_amount":5}',deadline));
   IF mode=3 THEN RAISE EXCEPTION 'missing real bot rejection';END IF;
   d:=(v#>>'{dealer_game,id}')::uuid;
   IF NOT EXISTS(SELECT FROM public.dealer_games WHERE id=d AND config->>'ante_amount'='5' AND config#>>'{rules,version}'='ptown-words/2') THEN RAISE EXCEPTION 'Words frozen configuration missing';END IF;
  EXCEPTION WHEN raise_exception THEN IF mode<>3 OR SQLERRM<>'ptown_words:bots_fake_money_only' THEN RAISE;END IF;END;
 END LOOP;
 BEGIN PERFORM pg_temp.live_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,true,%L::jsonb))',gen_random_uuid(),users[2],'[{"game":"ptown-words","stake":5}]'));RAISE EXCEPTION 'missing async real rejection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:invalid_offer' THEN RAISE;END IF;END;
 IF EXISTS(SELECT FROM public.player_transactions WHERE profile_id=ANY(users)) OR EXISTS(SELECT FROM public.players WHERE user_id=ANY(users) AND chips<>0) THEN RAISE EXCEPTION 'admission-only proof moved money';END IF;
END $proof$;
ROLLBACK;
SELECT jsonb_build_object('ordinary_human_fake_and_real_admission','pass','fake_bot_admission','pass','real_bot_rejection','pass','async_real_rejection','pass','fixtures_removed',NOT EXISTS(SELECT FROM public.profiles WHERE username LIKE 'Words live money proof %'),'release',(SELECT to_jsonb(r) FROM private.ptown_words_release r)) evidence;
