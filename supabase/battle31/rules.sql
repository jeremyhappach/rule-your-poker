-- battle-31/1: one private rules owner, multiplayer only. Card ids: suit*8 + rank(7..A).
CREATE OR REPLACE FUNCTION private.battle31_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"battle-31/1","turnMs":15000,"introMs":1200,"holdMs":4000,"normalTurns":6,"maxTurns":8,"maxRounds":12,"lossLimit":4}'::jsonb
$$;
CREATE OR REPLACE FUNCTION private.battle31_score(hand jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ranks integer[]; answer numeric;
BEGIN
 IF jsonb_typeof(hand)<>'array' OR jsonb_array_length(hand)<>3 THEN RAISE EXCEPTION 'battle31:invalid_hand';END IF;
 SELECT array_agg((x::text)::int%8) INTO ranks FROM jsonb_array_elements(hand) x;
 IF ranks[1]=ranks[2] AND ranks[2]=ranks[3] THEN RETURN CASE WHEN ranks[1]=7 THEN 32 ELSE 30.5 END;END IF;
 SELECT max(total) INTO answer FROM (SELECT sum(CASE WHEN n%8=7 THEN 11 WHEN n%8>=3 THEN 10 ELSE n%8+7 END) total FROM (SELECT (x::text)::int n FROM jsonb_array_elements(hand) x) c GROUP BY n/8) totals;
 RETURN answer;
END $$;
CREATE OR REPLACE FUNCTION private.battle31_shuffle() RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=ARRAY(SELECT generate_series(0,31));i int;j int;b int;t int;
BEGIN
 FOR i IN REVERSE 32..2 LOOP
  LOOP b:=get_byte(extensions.gen_random_bytes(1),0);EXIT WHEN b<256-(256%i);END LOOP;
  j:=1+b%i;t:=cards[i];cards[i]:=cards[j];cards[j]:=t;
 END LOOP;
 RETURN to_jsonb(cards);
END $$;
CREATE OR REPLACE FUNCTION private.battle31_complete(s jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ranks jsonb;
BEGIN
 SELECT jsonb_object_agg(p->>'id',CASE WHEN reason='aborted' THEN 0 ELSE -(s->'losses'->>(i-1)::int)::int END) INTO ranks FROM jsonb_array_elements(s->'players') WITH ORDINALITY x(p,i);
 RETURN s||jsonb_build_object('phase','complete','deadline',0,'ranks',ranks,'outcome',reason,'event',jsonb_build_object('label',CASE WHEN reason='aborted' THEN 'Match aborted' WHEN (s->'losses'->>0)::int=(s->'losses'->>1)::int THEN 'Match drawn' ELSE 'Match complete' END));
END $$;
CREATE OR REPLACE FUNCTION private.battle31_resolve(s jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a numeric:=private.battle31_score(s->'hands'->0);b numeric:=private.battle31_score(s->'hands'->1);loser int;result jsonb;
BEGIN
 IF a<>b THEN loser:=CASE WHEN a<b THEN 0 ELSE 1 END;s:=jsonb_set(s,ARRAY['losses',loser::text],to_jsonb((s->'losses'->>loser)::int+1));END IF;
 result:=jsonb_build_object('round',s->'stage','hands',s->'hands','values',jsonb_build_array(a,b),'loser',loser,'reason',reason,'losses',s->'losses');
 s:=s||jsonb_build_object('result',result,'results',coalesce(s->'results','[]'::jsonb)||jsonb_build_array(result),'event',jsonb_build_object('label',CASE WHEN loser IS NULL THEN 'Round drawn' ELSE (s->'players'->loser->>'name')||' loses a life' END));
 IF greatest((s->'losses'->>0)::int,(s->'losses'->>1)::int)>=4 OR (s->>'stage')::int>=12 THEN RETURN private.battle31_complete(s,'completed',at_ms);END IF;
 RETURN s||jsonb_build_object('phase','round_result','deadline',at_ms+4000);
END $$;
CREATE OR REPLACE FUNCTION private.battle31_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d jsonb:=private.battle31_shuffle();first_i int;hands jsonb;round_i int:=coalesce((s->>'stage')::int,1);
BEGIN
 IF jsonb_array_length(s->'players')<>2 OR s#>>'{rules,version}'<>'battle-31/1' THEN RAISE EXCEPTION 'battle31:configuration';END IF;
 IF NOT s?'firstActor' THEN s:=s||jsonb_build_object('firstActor',get_byte(extensions.gen_random_bytes(1),0)%2,'losses','[0,0]'::jsonb,'results','[]'::jsonb);END IF;
 first_i:=((s->>'firstActor')::int+round_i-1)%2;
 hands:=CASE WHEN first_i=0 THEN jsonb_build_array(jsonb_build_array(d->0,d->2,d->4),jsonb_build_array(d->1,d->3,d->5)) ELSE jsonb_build_array(jsonb_build_array(d->1,d->3,d->5),jsonb_build_array(d->0,d->2,d->4)) END;
 s:=s||jsonb_build_object('hands',hands,'center',jsonb_build_array(d->6,d->7,d->8),'known','[[],[]]'::jsonb,'turnIndex',first_i,'turn',1,'closing',false,'phase','intro','deadline',at_ms+1200,'result',NULL,'dealId',gen_random_uuid(),'event',jsonb_build_object('label','Round '||round_i));
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
   RETURN s||jsonb_build_object('phase','playing','deadline',at_ms+15000,'event',jsonb_build_object('label','Your turn'));
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
 -- Track only publicly witnessed cards held by each seat. The bot gets this memory, never hidden hands.
 SELECT coalesce(jsonb_agg(card ORDER BY card),'[]') INTO known FROM (SELECT DISTINCT card FROM (SELECT value card FROM jsonb_array_elements(s->'known'->actor) UNION SELECT value FROM jsonb_array_elements(hand) WHERE NOT old_hand @> jsonb_build_array(value)) seen WHERE hand @> jsonb_build_array(card)) k;
 s:=jsonb_set(jsonb_set(s,ARRAY['hands',actor::text],hand),ARRAY['known',actor::text],known)||jsonb_build_object('center',center,'event',jsonb_build_object('label',CASE action WHEN 'swap' THEN 'Card exchanged' WHEN 'take_pot' THEN 'All three exchanged' ELSE CASE WHEN (s->>'closing')::boolean OR turn_i>=7 THEN 'Stand' ELSE 'Opponent’s last turn' END END));
 IF greatest(private.battle31_score(s->'hands'->0),private.battle31_score(s->'hands'->1))>=31 THEN RETURN private.battle31_resolve(s,'special',at_ms);END IF;
 IF (s->>'closing')::boolean OR turn_i=8 THEN RETURN private.battle31_resolve(s,CASE WHEN (s->>'closing')::boolean THEN 'pass' ELSE 'turn_limit' END,at_ms);END IF;
 s:=s||jsonb_build_object('turn',turn_i+1,'turnIndex',opponent,'closing',action='pass' AND turn_i<=6,'deadline',at_ms+15000);
 IF turn_i=6 AND action<>'pass' THEN s:=s||jsonb_build_object('event',jsonb_build_object('label','Last turn each'));END IF;
 RETURN s;
END $$;
CREATE OR REPLACE FUNCTION private.battle31_visible(s jsonb,viewer uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE hands jsonb:='[]';values_i jsonb:='[]';i int;visible boolean;
BEGIN
 FOR i IN 0..1 LOOP
  visible:=s->>'phase' IN('round_result','complete') OR s->'players'->i->>'id'=viewer::text;
  hands:=hands||jsonb_build_array(CASE WHEN visible THEN s->'hands'->i ELSE '[null,null,null]'::jsonb END);
  values_i:=values_i||jsonb_build_array(CASE WHEN visible THEN to_jsonb(private.battle31_score(s->'hands'->i)) ELSE 'null'::jsonb END);
 END LOOP;
 RETURN (s-ARRAY['hands','score','scores','stages'])||jsonb_build_object('hands',hands,'values',values_i,'activePlayerId',s->'players'->(s->>'turnIndex')::int->>'id');
END $$;
