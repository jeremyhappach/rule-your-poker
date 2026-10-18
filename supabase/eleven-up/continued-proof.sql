CREATE FUNCTION pg_temp.smoke_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'continued_smoke:%',label;END IF;END$$;
DO $$
DECLARE u uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];p uuid[];g uuid;d uuid;deadline timestamptz;family text;scenario text;outcome jsonb;before_rules jsonb;admin_id uuid;seen timestamptz;
BEGIN
 INSERT INTO auth.users(id) SELECT unnest(u);
 INSERT INTO public.profiles(id,username,is_active) SELECT x,'Ante proof',true FROM unnest(u)x ON CONFLICT(id) DO UPDATE SET is_active=true;
 FOREACH family IN ARRAY ARRAY['eleven-up','tri-towers','run21'] LOOP
 FOREACH scenario IN ARRAY ARRAY['accept','decline','timeout','leave'] LOOP
  g:=gen_random_uuid();p:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) SELECT p[x],g,u[x],3-x,100,'active',false,false,false FROM generate_series(1,2)x;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE format('SELECT public.%I($1,$2,2,$3,$4,$5)',CASE family WHEN 'run21' THEN 'run21_configure' ELSE replace(family,'-','_')||'_configure' END) INTO outcome USING g,p[1],family,'{"ante_amount":17}'::jsonb,deadline;
  d:=(outcome#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.smoke_assert(outcome#>>'{game,status}'='ante_decision' AND (SELECT ante_decision IS NULL FROM public.players WHERE id=p[2]) AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE dealer_game_id=d),'no play before explicit consent '||family);
  PERFORM pg_temp.smoke_assert(NOT has_function_privilege('authenticated','private.megatouch_begin(uuid,uuid)','execute'),'no direct start grant');
  EXECUTE format('SELECT public.%I($1,$2,2,$3,$4,$5)',CASE family WHEN 'run21' THEN 'run21_configure' ELSE replace(family,'-','_')||'_configure' END) INTO outcome USING g,p[1],family,'{"ante_amount":17}'::jsonb,deadline;
  PERFORM pg_temp.smoke_assert(outcome->>'deduped'='true','setup replay');
  BEGIN UPDATE public.dealer_games SET config=jsonb_set(config,'{ante_amount}','18') WHERE id=d;RAISE EXCEPTION 'missing freeze';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'megatouch:configuration_frozen' THEN RAISE;END IF;END;
  outcome:=public.submit_ante_decision(g,d,p[2],'ante_up');PERFORM pg_temp.smoke_assert(outcome->>'outcome'='not_authorized','cannot accept another player stake');
  PERFORM set_config('request.jwt.claim.sub',u[2]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[2],'role','authenticated')::text,true);
  IF scenario='accept' THEN
   outcome:=public.submit_ante_decision(g,d,p[2],'ante_up');PERFORM pg_temp.smoke_assert(outcome->>'outcome'='accepted' AND (SELECT status='in_progress' AND ante_amount=17 FROM public.games WHERE id=g),'accepted canonical start '||family);
   PERFORM public.submit_ante_decision(g,d,p[2],'ante_up');PERFORM public.advance_ante_phase(g,d);
   PERFORM pg_temp.smoke_assert((SELECT count(*)=1 FROM public.rounds WHERE dealer_game_id=d),'exactly one start');
   IF family='run21' THEN PERFORM pg_temp.smoke_assert((SELECT stake=17 AND jsonb_array_length(participants)=2 FROM private.run21_matches WHERE dealer_game_id=d),'run21 accepted frozen stake');
   ELSIF family='eleven-up' THEN PERFORM pg_temp.smoke_assert((SELECT stake=17 AND jsonb_array_length(state->'players')=2 FROM private.eleven_up_matches WHERE dealer_game_id=d),'11 Up accepted frozen stake');
   ELSE PERFORM pg_temp.smoke_assert((SELECT stake=17 AND jsonb_array_length(state->'players')=2 FROM private.tri_towers_matches WHERE dealer_game_id=d),'TriTowers accepted frozen stake');END IF;
  ELSE
   IF scenario='decline' THEN PERFORM public.submit_ante_decision(g,d,p[2],'sit_out');
   ELSIF scenario='timeout' THEN PERFORM private.advance_ante_phase_exact(g,d,(SELECT ante_decision_deadline FROM public.games WHERE id=g),clock_timestamp()+interval '1 hour');
   ELSE UPDATE public.players SET status='left' WHERE id=p[2];PERFORM public.advance_ante_phase(g,d);END IF;
   PERFORM pg_temp.smoke_assert((SELECT status='waiting' FROM public.games WHERE id=g) AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE dealer_game_id=d),'decline/timeout/leave cannot admit '||family||scenario);
  END IF;
 END LOOP;END LOOP;
 PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
 BEGIN PERFORM public.admin_recent_activity();RAISE EXCEPTION 'missing admin authorization';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.record_app_activity();EXECUTE 'RESET ROLE';
 SELECT last_seen_at INTO seen FROM public.profiles WHERE id=u[1];PERFORM public.record_app_activity();
 PERFORM pg_temp.smoke_assert(seen IS NOT NULL AND (SELECT last_seen_at=seen FROM public.profiles WHERE id=u[1]),'server timestamp and throttle');
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 PERFORM pg_temp.smoke_assert(EXISTS(SELECT 1 FROM public.admin_recent_activity() WHERE id=u[2] AND last_seen_at IS NULL),'Never is preserved');
 PERFORM pg_temp.smoke_assert((SELECT count(*) FROM public.admin_recent_activity())=(SELECT count(*) FROM public.profiles),'every player listed');
 PERFORM pg_temp.smoke_assert((SELECT array_agg(id) FROM public.admin_recent_activity())=(SELECT array_agg(id ORDER BY last_seen_at DESC NULLS LAST,id) FROM public.profiles),'newest first, Never last, deterministic ties');
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.profiles SET last_seen_at=clock_timestamp()+interval '1 day' WHERE id=admin_id;
  RAISE EXCEPTION 'missing server timestamp protection';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'activity:server_timestamp_required' THEN RAISE;END IF;END;
 PERFORM pg_temp.smoke_assert(NOT has_function_privilege('anon','public.admin_recent_activity()','EXECUTE'),'anonymous activity listing denied');
 PERFORM pg_temp.smoke_assert(private.arcade_score_group('tri-towers','tri-towers/4')=private.arcade_score_group('tri-towers','tri-towers/5'),'owner-approved combined TriTowers leaderboard');
END$$;
SELECT 'canonical stake consent, lifecycle, history preservation and admin activity proof passed' proof;
