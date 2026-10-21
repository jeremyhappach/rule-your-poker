DO $$
DECLARE g uuid;d uuid;next_d uuid;u uuid[];p uuid[];n integer;money integer;i integer;t integer;human_count integer;
 m private.golf_matches;v jsonb;offer timestamptz;actor jsonb;items integer[];action text;bot_finishes integer:=0;
 old_round uuid;old_rev bigint;old_request uuid;old_actor uuid;old_action text;old_items integer[];old_receipt jsonb;
BEGIN
 FOR money IN 0..1 LOOP FOR n IN 2..4 LOOP
  g:=gen_random_uuid();u:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  p:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];human_count:=CASE WHEN n=2 THEN 1 ELSE 2 END;
  offer:=clock_timestamp()+interval '10 minutes';
  FOR i IN 1..n LOOP
   INSERT INTO auth.users(id) VALUES(u[i]);INSERT INTO public.profiles(id,username,is_active) VALUES(u[i],'Golf mixed '||u[i],true);
  END LOOP;
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host)
   VALUES(g,'game_selection',money=1,4,offer,0,false,false,u[1]);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT p[x],g,u[x],5-x,100,x>human_count FROM generate_series(1,n)x;
  UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
  PERFORM pg_temp.golf_login(u[1]);v:=public.golf_configure(g,p[1],4,'six-card-golf','{"ante_amount":5}',offer);d:=(v#>>'{dealer_game,id}')::uuid;
  FOR i IN 2..human_count LOOP PERFORM pg_temp.golf_login(u[i]);PERFORM public.submit_ante_decision(g,d,p[i],'ante_up');END LOOP;
  PERFORM public.advance_ante_phase(g,d);
  FOR t IN 1..2500 LOOP
   SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=d;EXIT WHEN m.settlement IS NOT NULL;
   IF m.state->>'phase'='hole_complete' THEN
    UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
    PERFORM private.golf_recover();CONTINUE;
   END IF;
   actor:=m.state->'players'->(m.state->>'turnIndex')::integer;
   IF (actor->>'isBot')::boolean THEN
    -- Advance only the local fixture's wake time; actual redacted bot policy,
    -- reducer, terminal detection and financial settlement remain the owners.
    UPDATE private.golf_matches SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1 WHERE dealer_game_id=d;
    PERFORM private.golf_recover();
    IF EXISTS(SELECT 1 FROM private.golf_matches WHERE dealer_game_id=d AND settlement IS NOT NULL) THEN bot_finishes:=bot_finishes+1;END IF;
   ELSE
    PERFORM pg_temp.golf_login((actor->>'userId')::uuid);
    IF m.state->>'phase'='opening' THEN action:='open';items:=ARRAY[0,3];
    ELSIF m.state->'pending'='null'::jsonb THEN action:='draw';items:=NULL;
    ELSE action:='replace';SELECT ARRAY[coalesce(min(ordinal::integer-1) FILTER(WHERE value='false'),0)] INTO items
     FROM jsonb_array_elements_text(m.state->'tableaus'->(actor->>'id')->'exposed') WITH ORDINALITY c(value,ordinal);END IF;
    old_round:=m.round_id;old_rev:=m.revision;old_request:=gen_random_uuid();old_actor:=(actor->>'userId')::uuid;old_action:=action;old_items:=items;
    v:=public.golf_action(d,old_round,old_request,old_rev,action,items);old_receipt:=v->'receipt';
   END IF;
  END LOOP;
  SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=d;
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.golf_assert(m.settlement IS NOT NULL AND jsonb_array_length(m.state->'holes')=9,'mixed nine-hole completion');
  PERFORM pg_temp.golf_assert((SELECT count(*)=9 AND count(predecessor_round_id)=8 FROM public.rounds WHERE dealer_game_id=d),'mixed exact successors');
  PERFORM pg_temp.golf_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=d),'mixed immutable result');
  PERFORM pg_temp.golf_assert((SELECT sum(chips)=100*n AND bool_and(chips=100+(m.settlement->>id::text)::integer) FROM public.players WHERE game_id=g),'mixed actual balanced chip deltas');
  PERFORM pg_temp.golf_assert((SELECT coalesce(bool_and(unmatched_deltas='{}'),true) FROM public.gameplay_transfer_batches WHERE dealer_game_id=d),'mixed balanced ledger');
  SET CONSTRAINTS ALL DEFERRED;
  -- Wait for the real terminal hold, preserving immutable final state.
  PERFORM pg_sleep(greatest(0,((m.state#>>'{terminal,deadline}')::bigint-floor(extract(epoch FROM clock_timestamp())*1000))/1000.0)+0.01);
  PERFORM private.golf_recover();
  PERFORM pg_temp.golf_assert((SELECT finished FROM private.golf_matches WHERE dealer_game_id=d),'autonomous postgame finish');
  SELECT config_deadline INTO offer FROM public.games WHERE id=g;
  SELECT jsonb_build_object('id',p0.id,'user_id',p0.user_id) INTO actor FROM public.players p0 JOIN public.games g0 ON g0.id=p0.game_id AND p0.position=g0.dealer_position WHERE g0.id=g;
  -- Run Back uses a new dealer-game and the canonical fresh consent path.
  PERFORM pg_temp.golf_login((actor->>'user_id')::uuid);
  UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
  v:=public.golf_configure(g,(actor->>'id')::uuid,(SELECT dealer_position FROM public.games WHERE id=g),'six-card-golf','{"ante_amount":5}',offer);next_d:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.golf_assert(next_d<>d,'Run Back has a fresh match identity');
  IF human_count>1 THEN
   PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT 1 FROM private.golf_matches WHERE dealer_game_id=next_d),'Run Back waits for noncaller human consent');
   FOR i IN 1..human_count LOOP IF u[i]<>(actor->>'user_id')::uuid THEN PERFORM pg_temp.golf_login(u[i]);PERFORM public.submit_ante_decision(g,next_d,p[i],'ante_up');END IF;END LOOP;
  END IF;
  PERFORM public.advance_ante_phase(g,next_d);
  PERFORM pg_temp.golf_login(old_actor);
  PERFORM pg_temp.golf_assert(public.golf_action(d,old_round,old_request,old_rev,old_action,old_items)->'receipt'=old_receipt,'old receipt after newly admitted match');
  PERFORM pg_temp.golf_assert((SELECT state->>'hole'='1' AND settlement IS NULL FROM private.golf_matches WHERE dealer_game_id=next_d),'old receipt cannot advance new match');
 END LOOP;END LOOP;
 PERFORM pg_temp.golf_assert(bot_finishes>0,'earned zero-client bot final action and settlement');
END $$;
SELECT 'Six complete mixed-bot matches, both money modes, earned service final settlement, fresh Run Back consent and prior-match replay passed' proof;
