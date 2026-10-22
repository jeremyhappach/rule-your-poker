-- Run only inside the rollback proof. No committed fixtures.
DO $smoke$
DECLARE real_mode boolean; late_rpc boolean; u uuid[]; people uuid[]; g uuid; d uuid; p uuid; who uuid;
 m private.eleven_up_matches; expected jsonb; roster jsonb; saved_state jsonb; rev bigint; at_ms bigint;
 deadline timestamptz; v jsonb; i integer; steps integer; action text; rejected boolean;
BEGIN
 FOREACH real_mode IN ARRAY ARRAY[false,true] LOOP
 FOREACH late_rpc IN ARRAY ARRAY[false,true] LOOP
  u:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  people:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];g:=gen_random_uuid();
  INSERT INTO smoke_fixture_users SELECT unnest(u);
  INSERT INTO auth.users(id) SELECT unnest(u);
  INSERT INTO public.profiles(id,username,is_active) SELECT x,'Smoke proof '||x,true FROM unnest(u)x ON CONFLICT(id) DO UPDATE SET is_active=true;
  deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end)
   VALUES(g,u[1],'game_selection',real_mode,3,deadline,0,false,false);
  FOR i IN 1..3 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   VALUES(people[i],g,u[i],4-i,100,false,'active',false,false);END LOOP;
  PERFORM set_config('request.jwt.claim.sub',u[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[1],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v:=public.eleven_up_configure(g,people[1],3,'eleven-up','{"ante_amount":7}',deadline);d:=(v#>>'{dealer_game,id}')::uuid;
  EXECUTE 'RESET ROLE';
  FOR i IN 2..3 LOOP
   PERFORM set_config('request.jwt.claim.sub',u[i]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u[i],'role','authenticated')::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(g,d,people[i],'ante_up');EXECUTE 'RESET ROLE';
  END LOOP;
  UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,'tick',null,(state->>'deadline')::bigint),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  p:=(m.state->'players'->(m.state->>'turnIndex')::integer->>'id')::uuid;SELECT user_id INTO who FROM public.players WHERE id=p;
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+30000)) WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.eleven_up_action(d,gen_random_uuid(),m.revision,'pass',null);EXECUTE 'RESET ROLE';
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-10;
  UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(at_ms)),revision=revision+1 WHERE dealer_game_id=d;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;roster:=m.state->'players';
  expected:=private.eleven_up_reduce(m.state,'tick',null,at_ms);
  IF late_rpc THEN
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.eleven_up_action(d,gen_random_uuid(),m.revision,'pass',null);EXECUTE 'RESET ROLE';
  ELSE
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);PERFORM private.eleven_up_recover();
  END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert(m.state=expected AND m.state#>>'{result,score}'='0','unchanged exact timeout result and clock');
  PERFORM pg_temp.money_assert((SELECT auto_fold AND sit_out_next_hand AND NOT sitting_out FROM public.players WHERE id=p),'persistent away flags without removing seat');
  PERFORM pg_temp.money_assert((SELECT NOT is_paused FROM public.games WHERE id=g),'no gameplay timeout pause');
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  v:=public.eleven_up_snapshot(d);
  PERFORM pg_temp.money_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(v->'players') x WHERE x->>'id'=p::text AND (x->>'autoplay')::boolean),'reconnect projects autoplay');
  FOR steps IN 1..30 LOOP
   SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
   EXIT WHEN m.state->>'stage'='2' AND m.state->>'phase'='ready' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=p::text;
   action:=CASE m.state->>'phase' WHEN 'ready' THEN 'pass' WHEN 'playing' THEN 'take_score' ELSE 'tick' END;
   at_ms:=CASE m.state->>'phase' WHEN 'ready' THEN (m.state->>'deadline')::bigint-1 WHEN 'playing' THEN (m.state->>'startedAt')::bigint+1 ELSE (m.state->>'deadline')::bigint END;
   UPDATE private.eleven_up_matches SET state=private.eleven_up_reduce(state,action,null,at_ms),revision=revision+1 WHERE dealer_game_id=d;
  END LOOP;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert(m.state->>'stage'='2' AND m.state->>'phase'='ready' AND m.state->'players'=roster,'normal next-round schedule and frozen roster');
  PERFORM pg_temp.money_assert((SELECT count(*)=1 FROM jsonb_array_elements(m.state->'stages') x WHERE x->>'playerId'=p::text),'no skipped or replacement round');
  PERFORM pg_temp.money_assert((SELECT is_paused=real_mode FROM public.games WHERE id=g),'only real-money next Ready pauses');
  IF real_mode THEN
   PERFORM pg_temp.money_assert(m.paused_at IS NOT NULL AND m.bot_due_at IS NULL,'real money canonical pause without bot');
  ELSE
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   PERFORM pg_sleep(greatest(0,(m.bot_due_at-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.05);
   PERFORM private.eleven_up_recover();SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.money_assert(m.state->>'phase'='playing' AND ((m.state->>'groups')::integer>0 OR (m.state->>'cursor')::integer>23),'strategic next-round autoplay');
  END IF;
  saved_state:=m.state;rev:=m.revision;
  PERFORM set_config('request.jwt.claim.sub',who::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.eleven_up_reclaim(d,rev);EXECUTE 'RESET ROLE';
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.money_assert(m.state=saved_state AND m.bot_due_at IS NULL AND m.revision>rev,'reclaim invalidates actions without resetting clock');
  PERFORM pg_temp.money_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand AND NOT sitting_out FROM public.players WHERE id=p),'reclaim clears flags');
  PERFORM pg_temp.money_assert((SELECT is_paused=real_mode FROM public.games WHERE id=g),'reclaim never resumes');
  rejected:=false;BEGIN PERFORM public.eleven_up_action(d,gen_random_uuid(),rev,'pass',null);
   EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%stale_revision%' OR SQLERRM LIKE '%inactive%';END;
  PERFORM pg_temp.money_assert(rejected,'stale action rejected');
 END LOOP;END LOOP;
END $smoke$;
