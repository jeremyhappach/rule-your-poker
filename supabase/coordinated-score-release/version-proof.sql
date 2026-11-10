BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='25s';
DO $$
DECLARE actor uuid:=gen_random_uuid();fresh uuid:=gen_random_uuid();g text;old_version text;new_version text;
 run jsonb;next_run jsonb;v jsonb;pinned uuid;rid uuid;i integer;fixture_token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(fresh);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(actor,true,true),(fresh,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'Version fixture',true),(fresh,'New version fixture',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.arcade_recovery_state SET claimed=true,token=fixture_token,expires_at=clock_timestamp()+interval '1 minute',last_completed_at=clock_timestamp(),failure=null;
 FOREACH g IN ARRAY ARRAY['horses-blitz','357-drop'] LOOP
  old_version:=CASE g WHEN 'horses-blitz' THEN 'horses-blitz/4' ELSE '357-drop/5' END;
  new_version:=CASE g WHEN 'horses-blitz' THEN 'horses-blitz/5' ELSE '357-drop/6' END;
  UPDATE private.arcade_rulesets SET enabled=(id=old_version) WHERE game=g;
  run:=public.arcade_start(actor,gen_random_uuid(),g);pinned:=(run->>'id')::uuid;
  IF run->>'ruleset'<>old_version THEN RAISE EXCEPTION 'old admission failed';END IF;
  UPDATE private.arcade_rulesets SET enabled=(id=new_version) WHERE game=g;
  next_run:=public.arcade_start(actor,gen_random_uuid(),g);
  IF next_run->>'id'<>run->>'id' OR next_run->>'ruleset'<>old_version THEN RAISE EXCEPTION 'active run repinned';END IF;
  IF g='horses-blitz' THEN
   v:=public.arcade_horses_blitz_step(actor,pinned)->'projection';
   v:=public.arcade_horses_blitz_step(actor,pinned,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'roll','{}')->'projection';
   IF v->>'ruleset'<>old_version OR v->>'roll'<>'1' THEN RAISE EXCEPTION 'old roll failed after activation';END IF;
   FOR i IN 1..3 LOOP
    UPDATE private.arcade_runs SET state=state||'{"deadline":180000,"startedAt":0}'::jsonb,due_at=0 WHERE id=pinned;
    v:=public.arcade_horses_blitz_step(NULL,pinned,p_token=>fixture_token)->'projection';
    IF i<3 THEN v:=public.arcade_horses_blitz_step(actor,pinned,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'next_round','{}')->'projection';END IF;
   END LOOP;
  ELSE
   v:=public.arcade_drop357_step(actor,pinned)->'projection';
   IF v->>'ruleset'<>old_version THEN RAISE EXCEPTION 'old Drop continuation failed';END IF;
   UPDATE private.arcade_runs SET state=private.drop357_v4_deal(jsonb_build_object('runId',pinned,'userId',user_id,'status','active','config',config),floor(extract(epoch FROM clock_timestamp())*1000)::bigint-400000,1) WHERE id=pinned;
   v:=public.arcade_drop357_step(NULL,pinned,p_token=>fixture_token)->'projection';
  END IF;
  IF v->>'status'<>'completed' THEN RAISE EXCEPTION 'pinned terminal failed';END IF;
  IF public.arcade_leaderboard(actor,g,'all',pinned,new_version)->'personalBest'<>'null'::jsonb OR public.arcade_leaderboard(actor,g,'all',pinned,old_version)->>'personalBest'<>'0' THEN RAISE EXCEPTION 'personal best crossed scoring versions';END IF;
  next_run:=public.arcade_start(actor,gen_random_uuid(),g);rid:=(next_run->>'id')::uuid;
  IF next_run->>'ruleset'<>new_version OR rid=pinned THEN RAISE EXCEPTION 'successor did not admit new version';END IF;
  IF public.arcade_start(fresh,gen_random_uuid(),g)->>'ruleset'<>new_version THEN RAISE EXCEPTION 'fresh admission failed';END IF;
 END LOOP;
END $$;
ROLLBACK;
