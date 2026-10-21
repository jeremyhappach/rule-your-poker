-- Included only in an explicit rollback envelope; never commit synthetic fixtures.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];people uuid[];g uuid;d uuid;offer timestamptz;
 m private.race_poker_matches;actor uuid;actor_user uuid;peer uuid;req uuid;rev bigint;original jsonb;receipt_i jsonb;v jsonb;p public.players;real_mode boolean;i integer;deadline_i bigint;
BEGIN
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Race control proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH real_mode IN ARRAY ARRAY[false,true] LOOP
  g:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
   VALUES(g,'game_selection',real_mode,2,offer,0,false,false,users[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT people[x],g,users[x],3-x,100,false FROM generate_series(1,2)x;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  v:=public.race_poker_configure(g,people[1],2,'race-poker','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.race_accept(g,d);
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.race_assert(m.state#>>'{rules,version}'='race-poker/2','new admission freezes v2');
  actor:=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid;
  actor_user:=(m.state->'players'->(m.state->>'turnIndex')::int->>'userId')::uuid;
  peer:=(m.state->'players'->(1-(m.state->>'turnIndex')::int)->>'id')::uuid;
  PERFORM set_config('request.jwt.claim.sub',actor_user::text,true);
  PERFORM public.race_poker_action(d,gen_random_uuid(),m.revision,'choose',ARRAY[0]);
  SELECT state->'hand' INTO original FROM private.race_poker_matches WHERE dealer_game_id=d;
  deadline_i:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1;
  UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(deadline_i)) WHERE dealer_game_id=d RETURNING * INTO m;
  PERFORM public.race_poker_action(d,gen_random_uuid(),m.revision,'autoplay',ARRAY[0]);
  PERFORM pg_temp.race_assert((SELECT (state->>'deadline')::bigint=deadline_i FROM private.race_poker_matches WHERE dealer_game_id=d),'manual no-op cannot extend deadline');
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
  PERFORM private.race_poker_execute(d,gen_random_uuid(),m.revision,actor,'tick',NULL,'recovery');
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.race_assert(m.state->'hand'=original AND m.state->>'phase'='playing','expiry retains unresolved hand');
  SELECT * INTO p FROM public.players WHERE id=actor;
  IF real_mode THEN
   PERFORM pg_temp.race_assert(m.paused_at IS NOT NULL AND NOT p.auto_fold AND NOT p.sit_out_next_hand,'real timeout pauses without bot takeover');
   PERFORM pg_temp.race_assert((m.state->>'deadline')::bigint-m.paused_at BETWEEN 29000 AND 30000,'resume decision window');
   PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
   SELECT public.set_game_paused(g,false,d,pause_version) INTO v FROM public.games WHERE id=g;
   PERFORM pg_temp.race_assert(v->>'outcome'='resumed','canonical host resume');
   PERFORM set_config('request.jwt.claim.sub',actor_user::text,true);
  ELSE
   PERFORM pg_temp.race_assert(p.auto_fold AND p.sit_out_next_hand AND m.paused_at IS NULL,'fake takeover and deferred sit-out');
   v:=public.race_poker_snapshot(d);
   PERFORM pg_temp.race_assert(NOT (v->>'canAct')::boolean AND (v->'automaticPlayers'->>actor::text)::boolean AND NOT v?'deck','reconnect exposes control but no hidden deck');
   BEGIN PERFORM public.race_poker_action(d,gen_random_uuid(),m.revision,'choose',ARRAY[0]);RAISE EXCEPTION 'missing autoplay refusal';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:autoplay_active' THEN RAISE;END IF;END;
   UPDATE private.race_poker_matches SET bot_due_at=0 WHERE dealer_game_id=d RETURNING * INTO m;
   i:=private.race_poker_bot_choice(ARRAY(SELECT value::int FROM jsonb_array_elements_text(m.state->'hand')),ARRAY(SELECT value::int FROM jsonb_array_elements_text(m.state->'choices')));
   PERFORM private.race_poker_execute(d,gen_random_uuid(),m.revision,actor,'choose',ARRAY[i],'bot');
   SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.race_assert(jsonb_array_length(m.state->'hand')=2,'strategic bot completes a legal selection after expiry');
   req:=gen_random_uuid();rev:=m.revision;receipt_i:=public.race_poker_action(d,req,rev,'autoplay',ARRAY[0]);
   PERFORM pg_temp.race_assert(receipt_i=public.race_poker_action(d,req,rev,'autoplay',ARRAY[0]),'immutable reclaim receipt');
   SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
   PERFORM pg_temp.race_assert(m.bot_due_at IS NULL AND (m.state->>'deadline')::bigint>floor(extract(epoch FROM clock_timestamp())*1000)+29000,'reclaim cancels work and restores clock');
   PERFORM pg_temp.race_assert((SELECT NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=actor),'reclaim clears canonical intents');
   PERFORM pg_temp.race_assert((public.race_poker_snapshot(d)->>'canAct')::boolean,'reconnected human may act');
  END IF;
  SELECT * INTO m FROM private.race_poker_matches WHERE dealer_game_id=d;
  PERFORM public.race_poker_action(d,gen_random_uuid(),m.revision,'choose',ARRAY[0]);
  -- A second fake timeout proves persistent deferred sit-out at the dealer boundary.
  IF NOT real_mode THEN
   UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=d RETURNING * INTO m;
   PERFORM private.race_poker_execute(d,gen_random_uuid(),m.revision,actor,'tick',NULL,'recovery');
  END IF;
  UPDATE private.race_poker_matches SET state=state||jsonb_build_object('phase','complete','scores',jsonb_build_object(actor::text,50000,peer::text,40000)) WHERE dealer_game_id=d;
  PERFORM private.race_poker_settle(d);
  UPDATE private.race_poker_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=d;
  PERFORM private.race_poker_finish_postgame(d);
  PERFORM pg_temp.race_assert((SELECT finished FROM private.race_poker_matches WHERE dealer_game_id=d),'canonical continuation');
  PERFORM pg_temp.race_assert((SELECT sitting_out=NOT real_mode AND NOT auto_fold AND NOT sit_out_next_hand FROM public.players WHERE id=actor),'next-game sit-out and cleanup');
 END LOOP;
END $$;
