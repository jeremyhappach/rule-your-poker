DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];p uuid[];g uuid;d uuid;offer jsonb;v jsonb;s jsonb;rev bigint;deadline timestamptz;steps integer;idx integer;command text;choice jsonb;request uuid;old_request uuid;old_rev bigint;old_command text;old_idx integer;mode text;before_b jsonb;after_b jsonb;rules_before jsonb;bot_played text[]:='{}';bot_key text;bot_delay numeric;
BEGIN
 INSERT INTO auth.users(id) SELECT unnest(u);
 INSERT INTO public.profiles(id,username,is_active) SELECT x,'Flow '||x::text,true FROM unnest(u)x ON CONFLICT(id) DO UPDATE SET is_active=true;
 PERFORM pg_temp.money_assert(NOT has_function_privilege('authenticated','private.__FAMILY___settle(uuid)','EXECUTE'),'browser cannot invoke private settlement');
 FOREACH mode IN ARRAY ARRAY['play','recovery','decline','leave','timeout','abandonment','bot'] LOOP
  PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{}',true);
  g:=gen_random_uuid();p:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',true,2,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) SELECT p[x],g,u[x],3-x,100,'active',false,false,(mode='bot' AND x=2) FROM generate_series(1,2)x;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  IF mode='bot' AND '__FAMILY__'='eleven_up' THEN
   BEGIN PERFORM public.__FAMILY___configure(g,p[1],2,'__GAME__','{"ante_amount":9}',deadline);RAISE EXCEPTION 'bot accepted unexpectedly';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'eleven_up:bots_not_supported' THEN RAISE;END IF;END;
   INSERT INTO money_evidence(case_name,game_id) VALUES('unsupported bot rejected',g);CONTINUE;
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';offer:=public.__FAMILY___configure(g,p[1],2,'__GAME__','{"ante_amount":9}',deadline);EXECUTE 'RESET ROLE';
  d:=(offer#>>'{dealer_game,id}')::uuid;
  IF mode IN('decline','leave','timeout') THEN
   IF mode='decline' THEN
    PERFORM set_config('request.jwt.claim.sub',u[2]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[2],'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(g,d,p[2],'sit_out');EXECUTE 'RESET ROLE';
   ELSIF mode='leave' THEN UPDATE public.players SET status='left' WHERE id=p[2];PERFORM public.advance_ante_phase(g,d);
   ELSE PERFORM private.advance_ante_phase_exact(g,d,(SELECT ante_decision_deadline FROM public.games WHERE id=g),clock_timestamp()+interval '1 hour');END IF;
   PERFORM pg_temp.money_assert(NOT EXISTS(SELECT 1 FROM private.__FAMILY___matches WHERE dealer_game_id=d) AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=d) AND (SELECT bool_and(chips=100) FROM public.players WHERE game_id=g),'abandoned offer no financial writes');
   INSERT INTO money_evidence(case_name,game_id,dealer_game_id) VALUES(mode,g,d);CONTINUE;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',u[2]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[2],'role','authenticated')::text,true);
  IF mode='bot' THEN PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM public.submit_ante_decision(g,d,p[2],'ante_up');
  ELSE EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(g,d,p[2],'ante_up');EXECUTE 'RESET ROLE';END IF;
  IF mode='abandonment' THEN UPDATE public.players SET status='left' WHERE game_id=g;UPDATE public.games SET pending_session_end=true WHERE id=g;END IF;
  SELECT state->'rules' INTO rules_before FROM private.__FAMILY___matches WHERE dealer_game_id=d;
  steps:=0;old_request:=NULL;
  LOOP
   SELECT state,revision INTO s,rev FROM private.__FAMILY___matches WHERE dealer_game_id=d;
   EXIT WHEN s->>'phase'='complete';steps:=steps+1;PERFORM pg_temp.money_assert(steps<800,'bounded live game');
   IF mode IN('recovery','abandonment','bot') THEN
    -- Simulate elapsed wall time on this isolated match; retain the actual recovery owner.
    bot_key:=concat_ws(':',s->>'turnIndex',s->>'stage');
    IF mode='bot' AND s->>'phase' IN('ready','playing') AND (s->'players'->(s->>'turnIndex')::integer->>'isBot')::boolean AND NOT bot_key=ANY(bot_played) THEN
     EXECUTE 'SELECT greatest(0,(bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0) FROM private.__FAMILY___matches WHERE dealer_game_id=$1' INTO bot_delay USING d;
     PERFORM pg_sleep(least(coalesce(bot_delay,0)+0.03,3));bot_played:=array_append(bot_played,bot_key);
    ELSE UPDATE private.__FAMILY___matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-CASE WHEN mode='bot' AND s->>'phase' IN('intro','stage_complete') THEN 1 ELSE 1000000 END)) WHERE dealer_game_id=d;END IF;
    PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    PERFORM private.__FAMILY___recover();CONTINUE;
   END IF;
   IF s->>'phase' IN('intro','stage_complete') THEN
    UPDATE private.__FAMILY___matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=d;
    IF s->>'phase'='intro' THEN
     PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM private.__FAMILY___recover();CONTINUE;
    END IF;
   END IF;
   PERFORM set_config('request.jwt.claim.sub',s->'players'->(s->>'turnIndex')::integer->>'userId',true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s->'players'->(s->>'turnIndex')::integer->>'userId','role','authenticated')::text,true);
   idx:=NULL;
   IF s->>'phase'='stage_complete' THEN command:='continue';
   ELSIF '__FAMILY__'='royal_flash' THEN command:='place';SELECT x INTO idx FROM generate_series(0,24)x WHERE s->'slots'->x='null'::jsonb ORDER BY x LIMIT 1;
   ELSIF s->>'phase'='playing' THEN command:='take_score';
   ELSIF '__FAMILY__'='eleven_up' THEN command:='pass';
   ELSE choice:=private.tri_towers_bot_choice(private.tri_towers_visible(s),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);command:=choice->>'action';idx:=(choice->>'index')::integer;END IF;
   request:=gen_random_uuid();EXECUTE 'SET LOCAL ROLE authenticated';
   BEGIN
   IF '__FAMILY__'='tri_towers' THEN v:=public.tri_towers_action(d,request,rev,command,idx);
   ELSE EXECUTE 'SELECT public.__FAMILY___action($1,$2,$3,$4,$5)' INTO v USING d,request,rev,command,CASE WHEN idx IS NULL THEN NULL::integer[] ELSE ARRAY[idx] END;END IF;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '% mode=% phase=% scores=% rules=%',SQLERRM,mode,s->>'phase',s->'scores',s->'rules';END;
   EXECUTE 'RESET ROLE';
   old_request:=request;old_rev:=rev;old_command:=command;old_idx:=idx;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.money_assert((SELECT settlement IS NOT NULL AND state->'rules'=rules_before AND jsonb_array_length(state->'stages')>=4 FROM private.__FAMILY___matches WHERE dealer_game_id=d),'gameplay and recovery settle authoritative stages with frozen rules');
  PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'one gameplay result');
  IF mode='abandonment' THEN
   PERFORM pg_temp.money_assert((SELECT status='session_ended' FROM public.games WHERE id=g) AND (SELECT sum(chips)=200 FROM public.players WHERE game_id=g),'abandoned active competition settles and ends');
   INSERT INTO money_evidence(case_name,game_id,dealer_game_id,result) SELECT mode,g,d,to_jsonb(r) FROM public.game_results r WHERE dealer_game_id=d;SET CONSTRAINTS ALL DEFERRED;CONTINUE;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';v:=public.__FAMILY___snapshot(d);EXECUTE 'RESET ROLE';
  SELECT jsonb_object_agg(id,chips) INTO before_b FROM public.players WHERE game_id=g;
  PERFORM pg_temp.money_assert(v->'settlement' IS NOT NULL,'reconnect reads committed outcome');
  UPDATE private.__FAMILY___matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.__FAMILY___close(d);PERFORM public.__FAMILY___close(d);EXECUTE 'RESET ROLE';
  PERFORM private.__FAMILY___settle(d);
  SELECT jsonb_object_agg(id,chips) INTO after_b FROM public.players WHERE game_id=g;
  PERFORM pg_temp.money_assert(before_b=after_b AND (SELECT finished FROM private.__FAMILY___matches WHERE dealer_game_id=d),'continuation and late settle do not repay');
  PERFORM pg_temp.money_assert((SELECT status IN('game_selection','dealer_selection') AND current_game_uuid IS NULL FROM public.games WHERE id=g),'normal next dealer handoff');
  INSERT INTO money_evidence SELECT mode,g,d,(SELECT jsonb_object_agg(id,100) FROM public.players WHERE game_id=g),after_b,(SELECT to_jsonb(x) FROM public.game_results x WHERE dealer_game_id=d),(SELECT to_jsonb(x) FROM public.gameplay_transfer_batches x WHERE dealer_game_id=d);
  SET CONSTRAINTS ALL DEFERRED;
 END LOOP;
END$$;
SELECT * FROM money_evidence WHERE case_name IN('play','recovery','decline','leave','timeout');
