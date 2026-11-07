-- Earn every score through the shared reducers, then recover with zero clients.
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();pa uuid;pb uuid;g uuid;d uuid;v jsonb;s jsonb;phase_before jsonb;game_i text;offer timestamptz;token_i uuid:=gen_random_uuid();due_before bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(a,true,true),(b,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
 UPDATE public.profiles SET is_active=true WHERE id IN(a,b);
 FOREACH game_i IN ARRAY ARRAY['crib-lab','chucky-showdown'] LOOP
  g:=gen_random_uuid();pa:=gen_random_uuid();pb:=gen_random_uuid();offer:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(g,'game_selection',false,2,offer,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(pa,g,a,2,100,false),(pb,g,b,1,100,false);
  PERFORM pg_temp.originals_login(a);
  v:=public.originals_configure(g,pa,2,game_i,'{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.originals_login(b);PERFORM public.submit_ante_decision(g,d,pb,'ante_up');
  v:=public.originals_live_snapshot(d);
  PERFORM pg_temp.originals_assert(v->>'phase'='playing','board starts after accepted consent');
  SELECT state,(state->>'deadline')::bigint INTO s,due_before FROM private.originals_live_matches WHERE dealer_game_id=d;
  UPDATE public.games SET is_paused=true WHERE id=g;
  PERFORM public.originals_live_snapshot(d);
  PERFORM pg_temp.originals_assert((SELECT state=s AND paused_at IS NOT NULL FROM private.originals_live_matches WHERE dealer_game_id=d),'paused board cannot advance');
  UPDATE public.games SET is_paused=false WHERE id=g;
  PERFORM pg_temp.originals_assert((SELECT (state->>'deadline')::bigint>=due_before AND paused_at IS NULL FROM private.originals_live_matches WHERE dealer_game_id=d),'resume shifts authoritative clock');
  -- Move the synthetic session's clocks back, without modifying cards, scores or results.
  UPDATE private.originals_live_matches SET state=private.originals_shift(state,-3600000) WHERE dealer_game_id=d;
  UPDATE private.delayed_recovery_state SET claimed=true,token=token_i,expires_at=clock_timestamp()+interval '1 minute' WHERE singleton;
  PERFORM public.originals_live_recover(token_i);
  SELECT state INTO s FROM private.originals_live_matches WHERE dealer_game_id=d;
  PERFORM pg_temp.originals_assert(s->>'phase'='complete' AND jsonb_array_length(s->'results')=6 AND jsonb_array_length(s->'rounds')=3,'zero-client recovery earns six rounds');
  PERFORM pg_temp.originals_assert((SELECT settlement IS NOT NULL FROM private.originals_live_matches WHERE dealer_game_id=d),'zero-client recovery settles');
  PERFORM public.originals_live_recover(token_i);
  PERFORM pg_temp.originals_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'recovery replay pays once');
 END LOOP;
END $$;
