-- six-card-golf/1: private, versioned rule authority. Cards are integers 0..51.
-- Rank = card % 13 + 1; suit = card / 13. Never project concealed integers.
CREATE OR REPLACE FUNCTION private.golf_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"six-card-golf/1","holes":9,"turnSeconds":30,"openingCards":2,"warningCircuits":4,"finalCircuits":5,"holeResultSeconds":6}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.golf_shuffle(cards jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE a integer[]; i integer; j integer; t integer; bytes bytea; sample bigint; ceiling_i bigint;
BEGIN
 SELECT array_agg(value::integer ORDER BY ordinal) INTO a
 FROM jsonb_array_elements_text(cards) WITH ORDINALITY AS c(value,ordinal);
 FOR i IN REVERSE coalesce(cardinality(a),0)..2 LOOP
  ceiling_i:=4294967296-(4294967296%i);
  LOOP
   bytes:=extensions.gen_random_bytes(4);
   sample:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)*256+get_byte(bytes,3);
   EXIT WHEN sample<ceiling_i;
  END LOOP;
  j:=(sample%i)::integer+1;t:=a[i];a[i]:=a[j];a[j]:=t;
 END LOOP;
 RETURN coalesce(to_jsonb(a),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.golf_points(card integer) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT CASE card%13+1 WHEN 1 THEN 1 WHEN 2 THEN -2 WHEN 11 THEN 10 WHEN 12 THEN 10 WHEN 13 THEN 0 ELSE card%13+1 END
$$;
CREATE OR REPLACE FUNCTION private.golf_score(cards jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE answer integer:=0; i integer; a integer; b integer;
BEGIN
 IF jsonb_array_length(cards)<>6 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 FOR i IN 0..2 LOOP
  a:=(cards->>i)::integer;b:=(cards->>(i+3))::integer;
  IF a%13<>b%13 THEN answer:=answer+private.golf_points(a)+private.golf_points(b);END IF;
 END LOOP;
 RETURN answer;
END $$;

CREATE OR REPLACE FUNCTION private.golf_integrity(s jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); cards jsonb; pending_i integer; count_i integer; distinct_i integer; low_i integer; high_i integer;
BEGIN
 IF n NOT BETWEEN 2 AND 4 OR s#>>'{rules,version}' IS DISTINCT FROM 'six-card-golf/1'
  OR (SELECT count(*) FROM jsonb_object_keys(s->'tableaus'))<>n THEN RAISE EXCEPTION 'golf:integrity';END IF;
 pending_i:=CASE WHEN s->'pending'='null'::jsonb THEN 0 ELSE 1 END;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'players') p
  WHERE jsonb_array_length(s->'tableaus'->(p->>'id')->'cards') IS DISTINCT FROM 6
   OR jsonb_array_length(s->'tableaus'->(p->>'id')->'exposed') IS DISTINCT FROM 6)
  OR 6*n+jsonb_array_length(s->'stock')+jsonb_array_length(s->'discard')+pending_i<>52
  OR (pending_i=1 AND s#>>'{pending,actor}' IS DISTINCT FROM s->'players'->(s->>'turnIndex')::integer->>'id')
 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 SELECT coalesce(jsonb_agg(c),'[]'::jsonb) INTO cards FROM jsonb_each(s->'tableaus') t CROSS JOIN LATERAL jsonb_array_elements(t.value->'cards') c;
 cards:=cards||(s->'stock')||(s->'discard')||CASE WHEN pending_i=1 THEN jsonb_build_array(s#>'{pending,card}') ELSE '[]'::jsonb END;
 SELECT count(*),count(DISTINCT value::integer),min(value::integer),max(value::integer) INTO count_i,distinct_i,low_i,high_i FROM jsonb_array_elements_text(cards);
 IF count_i<>52 OR distinct_i<>52 OR low_i<>0 OR high_i<>51 THEN RAISE EXCEPTION 'golf:integrity';END IF;
END $$;

CREATE OR REPLACE FUNCTION private.golf_deal(s jsonb, at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb; n integer:=jsonb_array_length(s->'players'); i integer; j integer; boards jsonb:='{}'; hand jsonb; id text;
BEGIN
 s:=s-'presentation';
 SELECT private.golf_shuffle(jsonb_agg(c ORDER BY c)) INTO deck FROM generate_series(0,51) c;
 FOR i IN 0..n-1 LOOP
  id:=s->'players'->i->>'id';hand:='[]';
  FOR j IN 0..5 LOOP hand:=hand||jsonb_build_array(deck->(i*6+j));END LOOP;
  boards:=boards||jsonb_build_object(id,jsonb_build_object('cards',hand,'exposed','[false,false,false,false,false,false]'::jsonb));
 END LOOP;
 s:=s||jsonb_build_object('phase','opening','tableaus',boards,'pending',NULL,'discard',jsonb_build_array(deck->(6*n)),
  'stock',(SELECT jsonb_agg(value ORDER BY ordinal) FROM jsonb_array_elements(deck) WITH ORDINALITY c(value,ordinal) WHERE ordinal>6*n+1),
  'turnIndex',((s->>'dealerIndex')::integer+1)%n,'openingRemaining',n,'consecutiveNoRevealTurns',0,'finalQueue','[]'::jsonb,'finalReason',NULL,
  'deadline',at_ms+30000,'startedAt',at_ms);
 PERFORM private.golf_integrity(s);
 RETURN s;
END $$;

-- Whitelist projection: no raw stock, concealed card, hidden score, or private RNG.
CREATE OR REPLACE FUNCTION private.golf_visible(s jsonb, viewer text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE boards jsonb:='{}'; p jsonb; b jsonb; cards jsonb; i integer;
BEGIN
 FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
  b:=s->'tableaus'->(p->>'id');cards:='[]';
  FOR i IN 0..5 LOOP cards:=cards||jsonb_build_array(CASE WHEN (b->'exposed'->>i)::boolean THEN b->'cards'->i ELSE 'null'::jsonb END);END LOOP;
  boards:=boards||jsonb_build_object(p->>'id',jsonb_build_object('cards',cards,'exposed',b->'exposed'));
 END LOOP;
 RETURN jsonb_build_object('identity',s->'identity','rules',s->'rules','players',s->'players','phase',s->'phase',
  'hole',s->'hole','dealerIndex',s->'dealerIndex','turnIndex',s->'turnIndex','openingRemaining',s->'openingRemaining',
  'tableaus',boards,'stockCount',jsonb_array_length(s->'stock'),'discardTop',CASE WHEN s->>'phase'='opening' THEN 'null'::jsonb ELSE s->'discard'->-1 END,
  'pending',CASE WHEN s#>>'{pending,actor}'=viewer THEN s->'pending' ELSE 'null'::jsonb END,
  'hasPending',s->'pending'<>'null'::jsonb,'scores',s->'scores','holes',s->'holes',
  'consecutiveNoRevealTurns',s->'consecutiveNoRevealTurns','finalQueue',s->'finalQueue','finalReason',s->'finalReason',
  'deadline',s->'deadline','startedAt',s->'startedAt','terminal',s->'terminal','presentation',s->'presentation');
END $$;

CREATE OR REPLACE FUNCTION private.golf_reduce(s jsonb, action text, items integer[], at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer:=jsonb_array_length(s->'players'); actor_i integer:=(s->>'turnIndex')::integer;
 actor text:=s->'players'->actor_i->>'id'; b jsonb; card jsonb; old_card jsonb; pos integer; exposed_new boolean:=false;
 queue jsonb:=s->'finalQueue'; already_final boolean:=s->>'finalReason' IS NOT NULL;
 next_i integer:=(actor_i+1)%n; count_i integer; i integer; totals jsonb:=s->'scores'; results jsonb:='{}'; p jsonb; score_i integer; remaining integer;
BEGIN
 PERFORM private.golf_integrity(s);
 IF s->>'phase' NOT IN ('opening','playing') THEN RAISE EXCEPTION 'golf:phase';END IF;
 b:=s->'tableaus'->actor;
 IF s->>'phase'='opening' THEN
  IF action IS DISTINCT FROM 'open' OR cardinality(items) IS DISTINCT FROM 2 OR items[1] IS NULL OR items[2] IS NULL
    OR items[1] NOT BETWEEN 0 AND 5 OR items[2] NOT BETWEEN 0 AND 5 OR items[1]=items[2] THEN RAISE EXCEPTION 'golf:illegal_open';END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['exposed',items[1]::text],'true'),ARRAY['exposed',items[2]::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);remaining:=(s->>'openingRemaining')::integer-1;
  RETURN s||jsonb_build_object('openingRemaining',remaining,'phase',CASE WHEN remaining=0 THEN 'playing' ELSE 'opening' END,
    'turnIndex',next_i,'deadline',at_ms+30000);
 END IF;
 IF action='draw' THEN
  IF s->'pending'<>'null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_draw';END IF;
  IF jsonb_array_length(s->'stock')=0 THEN
   IF jsonb_array_length(s->'discard')<=1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
   s:=s||jsonb_build_object('stock',private.golf_shuffle((s->'discard')-(jsonb_array_length(s->'discard')-1)),'discard',jsonb_build_array(s->'discard'->-1));
  END IF;
  s:=s||jsonb_build_object('pending',jsonb_build_object('actor',actor,'card',s->'stock'->0),'stock',(s->'stock')-0);
  PERFORM private.golf_integrity(s);RETURN s; -- Preserve the whole-turn deadline and progress counter.
 ELSIF action='reject' THEN
  IF s->'pending'='null'::jsonb OR coalesce(cardinality(items),0)<>0 THEN RAISE EXCEPTION 'golf:illegal_reject';END IF;
  s:=s||jsonb_build_object('discard',(s->'discard')||jsonb_build_array(s#>'{pending,card}'),'pending',NULL);
 ELSIF action IN ('replace','discard') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'golf:illegal_position';END IF;
  pos:=items[1];old_card:=b->'cards'->pos;exposed_new:=NOT (b->'exposed'->>pos)::boolean;
  IF action='replace' THEN
   IF s->'pending'='null'::jsonb THEN RAISE EXCEPTION 'golf:pending_required';END IF;
   card:=s#>'{pending,card}';s:=s||jsonb_build_object('pending',NULL);
  ELSE
   IF s->'pending'<>'null'::jsonb OR jsonb_array_length(s->'discard')=0 THEN RAISE EXCEPTION 'golf:illegal_discard';END IF;
   card:=s->'discard'->-1;s:=jsonb_set(s,'{discard}',(s->'discard')-(jsonb_array_length(s->'discard')-1));
  END IF;
  b:=jsonb_set(jsonb_set(b,ARRAY['cards',pos::text],card),ARRAY['exposed',pos::text],'true');
  s:=jsonb_set(s,ARRAY['tableaus',actor],b);
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(old_card));
 ELSE RAISE EXCEPTION 'golf:invalid_action';
 END IF;
 count_i:=CASE WHEN exposed_new THEN 0 ELSE (s->>'consecutiveNoRevealTurns')::integer+1 END;
 IF already_final THEN
  IF queue->>0 IS DISTINCT FROM actor THEN RAISE EXCEPTION 'golf:integrity';END IF;
  queue:=queue-0;
 ELSIF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'exposed') e WHERE NOT e::boolean) THEN
  FOR i IN 1..n-1 LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','six_exposed');
 ELSIF count_i>=5*n THEN
  FOR i IN 1..n LOOP queue:=queue||jsonb_build_array(s->'players'->((actor_i+i)%n)->>'id');END LOOP;
  s:=s||jsonb_build_object('finalReason','prolonged_play');
 END IF;
 s:=s||jsonb_build_object('consecutiveNoRevealTurns',count_i,'finalQueue',queue,'turnIndex',next_i,'deadline',at_ms+30000);
 IF already_final AND jsonb_array_length(queue)=0 THEN
  IF s#>'{rules,presentation}' IS NOT NULL THEN s:=s||jsonb_build_object('presentation',private.golf_presentation(s,at_ms));END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'players') LOOP
   score_i:=private.golf_score(s->'tableaus'->(p->>'id')->'cards');
   results:=results||jsonb_build_object(p->>'id',score_i);
   totals:=totals||jsonb_build_object(p->>'id',(totals->>(p->>'id'))::integer+score_i);
   s:=jsonb_set(s,ARRAY['tableaus',p->>'id','exposed'],'[true,true,true,true,true,true]');
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'holes') h WHERE h->>'hole'=s->>'hole') THEN RAISE EXCEPTION 'golf:integrity';END IF;
  s:=s||jsonb_build_object('scores',totals,'holes',(s->'holes')||jsonb_build_array(jsonb_build_object('hole',s->'hole','roundId',s#>'{identity,roundId}','scores',results,'tableaus',s->'tableaus')),
    'phase',CASE WHEN (s->>'hole')::integer=9 THEN 'complete' ELSE 'hole_complete' END,'deadline',coalesce((s#>>'{presentation,endsAt}')::bigint,at_ms+6000));
 END IF;
 PERFORM private.golf_integrity(s);RETURN s;
END $$;

-- Functions are private even before the adapter's final privilege pass.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'golf_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
