-- Installed only in a disposable local qualification database.
CREATE OR REPLACE FUNCTION public.qualification_bonus_fixture(game text,async_mode boolean,money boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];g uuid:=gen_random_uuid();d uuid;prefix text:=replace(game,'-','_');s jsonb;v jsonb;rounds jsonb;totals jsonb;who integer;turn_i integer;p record;deadline timestamptz:=clock_timestamp()+interval '10 minutes';hash_i text;c private.delayed_children;
BEGIN
 FOR who IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[who]);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[who];
  UPDATE public.profiles SET is_active=true WHERE id=users[who];
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 IF async_mode THEN
  g:=public.delayed_create(gen_random_uuid(),users[2],money,jsonb_build_array(jsonb_build_object('game',game,'stake',7)));
  SELECT offer_hash INTO hash_i FROM private.delayed_matches WHERE id=g;
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);PERFORM public.delayed_respond(g,gen_random_uuid(),hash_i,'accept');
  SELECT * INTO c FROM private.delayed_children WHERE match_id=g;
  SELECT jsonb_agg(jsonb_build_object('actor',users[i],'round',r,'score',CASE WHEN i=1 THEN 500000 ELSE 500 END,'at',1,'board','{}'::jsonb)) INTO rounds FROM generate_series(1,2) i CROSS JOIN generate_series(1,2) r;
  s:=jsonb_build_object('version','delayed/1','game',game,'child',c.id,'players',to_jsonb(users),'round',2,'turn',0,'totals',jsonb_build_object(users[1]::text,1000000,users[2]::text,1000),'attempts',rounds,'board',NULL,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',NULL);
  UPDATE private.delayed_children SET state=s,actor=users[1] WHERE id=c.id;
  UPDATE private.delayed_children SET state=jsonb_set(state,'{round}','3') WHERE id=c.id RETURNING * INTO c;
  RETURN jsonb_build_object('game',game,'match',g,'id',c.id,'users',users,'actor',users[1],'revision',c.revision,'segment',c.segment,'async',true);
 END IF;
 EXECUTE format('UPDATE private.%I SET enabled=true,admission_enabled=true',prefix||'_release');
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',money,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT ids[i],g,users[i],3-i,100,false FROM generate_series(1,2) i;
 EXECUTE format('SELECT public.%I($1,$2,2,$3,$4,$5)',prefix||'_configure') INTO v USING g,ids[1],game,'{"ante_amount":5}'::jsonb,deadline;
 d:=(v#>>'{dealer_game,id}')::uuid;
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=g AND ante_decision IS NULL LOOP
  PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(g,d,p.id,'ante_up');
 END LOOP;
 PERFORM public.advance_ante_phase(g,d);
 EXECUTE format('SELECT state FROM private.%I WHERE dealer_game_id=$1',prefix||'_matches') INTO s USING d;
 totals:=jsonb_build_object(ids[1]::text,1000000,ids[2]::text,1000);
 SELECT jsonb_agg(jsonb_build_object('playerId',ids[i],'stage',r,'score',CASE WHEN i=1 THEN 500000*r ELSE 500*r END,'stageScore',CASE WHEN i=1 THEN 500000 ELSE 500 END,'reason','take_score','id',concat(d,':',i,':',r))) INTO rounds FROM generate_series(1,2) i CROSS JOIN generate_series(1,2) r;
 s:=s||jsonb_build_object('stage',2,'scores',totals,'stages',rounds);
 EXECUTE format('UPDATE private.%I SET state=$2 WHERE dealer_game_id=$1',prefix||'_matches') USING d,s;
 SELECT n-1 INTO turn_i FROM jsonb_array_elements(s->'players') WITH ORDINALITY members(value,n) WHERE value->>'id'=ids[1]::text;
 EXECUTE format('SELECT private.%I($1,$2)',prefix||'_deal') INTO s USING s||jsonb_build_object('stage',3,'turnIndex',turn_i),floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 EXECUTE format('UPDATE private.%I SET state=$2 WHERE dealer_game_id=$1 RETURNING revision',prefix||'_matches') INTO who USING d,s;
 RETURN jsonb_build_object('game',game,'match',g,'id',d,'users',users,'actor',users[1],'player',ids[1],'revision',who,'async',false);
END $$;
REVOKE ALL ON FUNCTION public.qualification_bonus_fixture(text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
