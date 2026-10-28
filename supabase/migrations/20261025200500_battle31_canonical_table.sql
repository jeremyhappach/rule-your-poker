DO $$ BEGIN
 IF md5(pg_get_functiondef('private.battle31_reduce(jsonb,text,integer[],bigint)'::regprocedure))<>'1fb686ed6f3b171da0ff436a8940067e' THEN RAISE EXCEPTION 'battle31:rules_owner_drift';END IF;
END $$;
CREATE OR REPLACE FUNCTION private.battle31_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"battle-31/1","turnMs":15000,"introMs":1800,"holdMs":8000,"presentationVersion":2,"normalTurns":6,"maxTurns":8,"maxRounds":12,"lossLimit":4}'::jsonb
$$;
CREATE OR REPLACE FUNCTION private.battle31_scoring_cards(hand jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH cards AS (SELECT value::int card,i FROM jsonb_array_elements_text(hand) WITH ORDINALITY x(value,i)),
 best AS (SELECT card/8 suit FROM cards GROUP BY card/8 ORDER BY sum(CASE WHEN card%8=7 THEN 11 WHEN card%8>=3 THEN 10 ELSE card%8+7 END) DESC,card/8 LIMIT 1)
 SELECT jsonb_agg(card ORDER BY i) FROM cards WHERE (SELECT count(DISTINCT card%8)=1 FROM cards) OR card/8=(SELECT suit FROM best)
$$;
CREATE OR REPLACE FUNCTION private.battle31_resolve(s jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a numeric:=private.battle31_score(s->'hands'->0);b numeric:=private.battle31_score(s->'hands'->1);loser int;result jsonb;prior_losses jsonb:=s->'losses';
BEGIN
 IF a<>b THEN loser:=CASE WHEN a<b THEN 0 ELSE 1 END;s:=jsonb_set(s,ARRAY['losses',loser::text],to_jsonb((s->'losses'->>loser)::int+1));END IF;
 result:=jsonb_build_object('round',s->'stage','hands',s->'hands','values',jsonb_build_array(a,b),'loser',loser,'reason',reason,'losses',s->'losses','previousLosses',prior_losses,'scoringCards',jsonb_build_array(private.battle31_scoring_cards(s->'hands'->0),private.battle31_scoring_cards(s->'hands'->1)));
 s:=s||jsonb_build_object('result',result,'results',coalesce(s->'results','[]'::jsonb)||jsonb_build_array(result),'event',jsonb_build_object('label',CASE WHEN loser IS NULL THEN 'Round drawn' ELSE (s->'players'->loser->>'name')||' loses a life' END));
 IF s#>>'{rules,presentationVersion}'='2' THEN
  s:=s||jsonb_build_object('presentation',jsonb_build_object('version',2,'startedAt',at_ms,'revealAt',at_ms+350,'announceAt',at_ms+700,'lifeAt',at_ms+5100,'clearAt',at_ms+6900,'finishAt',at_ms+8000));
 END IF;
 IF greatest((s->'losses'->>0)::int,(s->'losses'->>1)::int)>=4 OR (s->>'stage')::int>=12 THEN RETURN private.battle31_complete(s,'completed',at_ms);END IF;
 RETURN s||jsonb_build_object('phase','round_result','deadline',at_ms+coalesce((s#>>'{rules,holdMs}')::bigint,4000));
END $$;
CREATE OR REPLACE FUNCTION private.battle31_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d jsonb:=private.battle31_shuffle();first_i int;hands jsonb;round_i int:=coalesce((s->>'stage')::int,1);
BEGIN
 IF jsonb_array_length(s->'players')<>2 OR s#>>'{rules,version}'<>'battle-31/1' THEN RAISE EXCEPTION 'battle31:configuration';END IF;
 IF NOT s?'firstActor' THEN s:=s||jsonb_build_object('firstActor',get_byte(extensions.gen_random_bytes(1),0)%2,'losses','[0,0]'::jsonb,'results','[]'::jsonb);END IF;
 first_i:=((s->>'firstActor')::int+round_i-1)%2;
 hands:=CASE WHEN first_i=0 THEN jsonb_build_array(jsonb_build_array(d->0,d->2,d->4),jsonb_build_array(d->1,d->3,d->5)) ELSE jsonb_build_array(jsonb_build_array(d->1,d->3,d->5),jsonb_build_array(d->0,d->2,d->4)) END;
 s:=s||jsonb_build_object('hands',hands,'center',jsonb_build_array(d->6,d->7,d->8),'known','[[],[]]'::jsonb,'turnIndex',first_i,'turn',1,'closing',false,'phase','intro','deadline',at_ms+coalesce((s#>>'{rules,introMs}')::bigint,1200),'dealStartedAt',at_ms,'dealerIndex',1-first_i,'moves','[]'::jsonb,'knock',NULL,'presentation',NULL,'result',NULL,'dealId',gen_random_uuid(),'event',jsonb_build_object('label','Round '||round_i));
 -- Only nine cards are used; the other 23 are never projected or drawn this round.
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION private.battle31_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor int:=(s->>'turnIndex')::int;opponent int:=1-actor;turn_i int:=(s->>'turn')::int;hand jsonb:=s->'hands'->actor;center jsonb:=s->'center';old_hand jsonb:=hand;own_slot int;center_slot int;known jsonb;
BEGIN
 IF s#>>'{rules,version}'<>'battle-31/1' OR s->>'phase'='complete' THEN RAISE EXCEPTION 'battle31:phase';END IF;
 IF action='resign' THEN
  IF cardinality(items)<>1 OR items[1] NOT IN(0,1) THEN RAISE EXCEPTION 'battle31:invalid_command';END IF;
  RETURN private.battle31_complete(jsonb_set(s,ARRAY['losses',items[1]::text],'4'),'resigned',at_ms);
 END IF;
 IF action='tick' THEN
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF s->>'phase'='intro' THEN
   IF greatest(private.battle31_score(s->'hands'->0),private.battle31_score(s->'hands'->1))>=31 THEN RETURN private.battle31_resolve(s,'initial_special',at_ms);END IF;
   RETURN s||jsonb_build_object('phase','playing','deadline',at_ms+coalesce((s#>>'{rules,turnMs}')::bigint,15000),'event',jsonb_build_object('label','Your turn'));
  ELSIF s->>'phase'='round_result' THEN RETURN private.battle31_deal(s||jsonb_build_object('stage',(s->>'stage')::int+1),at_ms);
  END IF;
  action:='pass';
 ELSIF at_ms>=(s->>'deadline')::bigint THEN RAISE EXCEPTION 'battle31:deadline';END IF;
 IF s->>'phase'<>'playing' THEN RAISE EXCEPTION 'battle31:phase';END IF;
 IF action='swap' THEN
  IF cardinality(items) IS DISTINCT FROM 2 OR items[1]=items[2] THEN RAISE EXCEPTION 'battle31:invalid_command';END IF;
  SELECT i-1 INTO own_slot FROM jsonb_array_elements_text(hand) WITH ORDINALITY x(card,i) WHERE card::int=items[1];
  SELECT i-1 INTO center_slot FROM jsonb_array_elements_text(center) WITH ORDINALITY x(card,i) WHERE card::int=items[2];
  IF own_slot IS NULL OR center_slot IS NULL THEN RAISE EXCEPTION 'battle31:stale_cards';END IF;
  hand:=jsonb_set(hand,ARRAY[own_slot::text],to_jsonb(items[2]));center:=jsonb_set(center,ARRAY[center_slot::text],to_jsonb(items[1]));
 ELSIF action='take_pot' THEN hand:=center;center:=old_hand;
 ELSIF action<>'pass' THEN RAISE EXCEPTION 'battle31:invalid_action';END IF;
 IF action<>'swap' AND cardinality(items)>0 THEN RAISE EXCEPTION 'battle31:invalid_command';END IF;
 IF s#>>'{rules,presentationVersion}'='2' THEN
  IF action IN('swap','take_pot') THEN
   s:=s||jsonb_build_object('moves',coalesce(s->'moves','[]')||jsonb_build_array(jsonb_build_object('id',(s->>'dealId')||':'||turn_i,'at',at_ms,'actor',actor,'action',action,'pairs',
    CASE WHEN action='swap' THEN jsonb_build_array(jsonb_build_object('handIndex',own_slot,'centerIndex',center_slot,'out',items[1],'in',items[2]))
    ELSE (SELECT jsonb_agg(jsonb_build_object('handIndex',i,'centerIndex',i,'out',old_hand->i,'in',hand->i) ORDER BY i) FROM generate_series(0,2) i) END)));
  ELSIF action='pass' AND NOT (s->>'closing')::boolean AND turn_i<=6 THEN
   s:=s||jsonb_build_object('knock',jsonb_build_object('id',(s->>'dealId')||':knock','at',at_ms,'actor',actor,'responder',opponent));
  END IF;
 END IF;
 -- Track only publicly witnessed cards held by each seat. The bot gets this memory, never hidden hands.
 SELECT coalesce(jsonb_agg(card ORDER BY card),'[]') INTO known FROM (SELECT DISTINCT card FROM (SELECT value card FROM jsonb_array_elements(s->'known'->actor) UNION SELECT value FROM jsonb_array_elements(hand) WHERE NOT old_hand @> jsonb_build_array(value)) seen WHERE hand @> jsonb_build_array(card)) k;
 s:=jsonb_set(jsonb_set(s,ARRAY['hands',actor::text],hand),ARRAY['known',actor::text],known)||jsonb_build_object('center',center,'event',jsonb_build_object('label',CASE action WHEN 'swap' THEN 'Card exchanged' WHEN 'take_pot' THEN 'All three exchanged' ELSE CASE WHEN (s->>'closing')::boolean OR turn_i>=7 THEN 'Stand' ELSE 'Opponent’s last turn' END END));
 IF greatest(private.battle31_score(s->'hands'->0),private.battle31_score(s->'hands'->1))>=31 THEN RETURN private.battle31_resolve(s,'special',at_ms);END IF;
 IF (s->>'closing')::boolean OR turn_i=8 THEN RETURN private.battle31_resolve(s,CASE WHEN (s->>'closing')::boolean THEN 'pass' ELSE 'turn_limit' END,at_ms);END IF;
 s:=s||jsonb_build_object('turn',turn_i+1,'turnIndex',opponent,'closing',action='pass' AND turn_i<=6,'deadline',at_ms+coalesce((s#>>'{rules,turnMs}')::bigint,15000));
 IF turn_i=6 AND action<>'pass' THEN s:=s||jsonb_build_object('event',jsonb_build_object('label','Last turn each'));END IF;
 RETURN s;
END $$;
DO $patch$ DECLARE d text; old text:=$old$'rules',private.battle31_rules()$old$; BEGIN d:=pg_get_functiondef('public.battle31_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure);IF position(old IN d)=0 THEN RAISE EXCEPTION 'battle31:owner_drift:public.battle31_configure(uuid,uuid,integer,text,jsonb,timestamptz)';END IF;EXECUTE replace(d,old,$new$'rules',private.battle31_rules()||jsonb_build_object('turnMs',1000*greatest(1,coalesce((SELECT decision_timer_seconds FROM public.game_defaults WHERE game_type='battle-31'),15)))$new$);END $patch$;
DO $patch$ DECLARE d text; old text:=$old$'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000$old$; BEGIN d:=pg_get_functiondef('private.battle31_settle(uuid)'::regprocedure);IF position(old IN d)=0 THEN RAISE EXCEPTION 'battle31:owner_drift:private.battle31_settle(uuid)';END IF;EXECUTE replace(d,old,$new$'startedAt',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,finishAt}')::bigint,0)),'deadline',greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,coalesce((m.state#>>'{presentation,finishAt}')::bigint,0))+3000$new$);END $patch$;
DO $patch$ DECLARE d text; old text:=$old$state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)$old$; BEGIN d:=pg_get_functiondef('private.battle31_pause()'::regprocedure);IF position(old IN d)=0 THEN RAISE EXCEPTION 'battle31:owner_drift:private.battle31_pause()';END IF;EXECUTE replace(d,old,$new$state=state||CASE WHEN state->'presentation' IS NOT NULL AND state->'presentation'<>'null'::jsonb THEN jsonb_build_object('presentation',(SELECT jsonb_object_agg(key,CASE WHEN key='version' THEN value ELSE to_jsonb(value::bigint+at_ms-paused_at) END) FROM jsonb_each(state->'presentation'))) ELSE '{}'::jsonb END||CASE WHEN state?'dealStartedAt' THEN jsonb_build_object('dealStartedAt',(state->>'dealStartedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)$new$);END $patch$;
REVOKE ALL ON FUNCTION private.battle31_scoring_cards(jsonb) FROM PUBLIC,anon,authenticated,service_role;
UPDATE public.game_defaults SET presentation_mode='table' WHERE game_type='battle-31';
