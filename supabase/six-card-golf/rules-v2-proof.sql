-- Runs after core-proof.sql in a rollback-only local transaction.
DO $$
DECLARE s jsonb; seed jsonb; before_i jsonb; v jsonb; people jsonb; totals jsonb; n integer; i integer; actor text; queue jsonb; choice jsonb;
BEGIN
 PERFORM pg_temp.golf_assert(private.golf_supported_rules(private.golf_rules()) AND private.golf_supported_rules(private.golf_rules_v2()),'both frozen versions accepted');
 PERFORM pg_temp.golf_assert(NOT private.golf_supported_rules(private.golf_rules_v2()||'{"finalCircuits":5}'),'v2 has no progress cap');
 FOR n IN 2..4 LOOP
  SELECT jsonb_agg(jsonb_build_object('id',x::text,'isBot',false)),jsonb_object_agg(x::text,0) INTO people,totals FROM generate_series(0,n-1)x;
  s:=private.golf_deal(jsonb_build_object('players',people,'scores',totals,'rules',private.golf_rules_v2()||'{"presentation":{"version":1,"scoringDelayMs":1200,"resultsDurationMs":5000}}','identity',jsonb_build_object('roundId','v2-'||n),'hole',1,'dealerIndex',n-1,'holes','[]'::jsonb),0);
  FOR i IN 1..n LOOP s:=private.golf_reduce(s,'open',ARRAY[0,3],i);END LOOP;
  seed:=s;
  -- Humans may keep replacing exposed positions; elapsed time and no-reveal turns do not resolve a hole.
  FOR i IN 1..6*n LOOP s:=private.golf_reduce(s,'discard',ARRAY[0],100000000+i);END LOOP;
  PERFORM pg_temp.golf_assert(s->>'finalReason' IS NULL AND s->>'consecutiveNoRevealTurns'='0' AND s->'stock'=seed->'stock','no v2 no-reveal or wall-clock ending');
  WHILE jsonb_array_length(s->'stock')>n+1 LOOP
   s:=private.golf_reduce(private.golf_reduce(s,'draw',NULL,100),'reject',NULL,100);
   PERFORM pg_temp.golf_assert(s->>'finalReason' IS NULL AND NOT s?'stockFinalTrigger','above exact boundary');
  END LOOP;
  actor:=s->'players'->(s->>'turnIndex')::integer->>'id';before_i:=s;
  s:=private.golf_reduce(s,'draw',NULL,200);
  PERFORM pg_temp.golf_assert(jsonb_array_length(s->'stock')=n AND s->>'stockFinalTrigger'=actor AND s->'finalQueue'='[]' AND s->'deadline'=before_i->'deadline','threshold pending draw retains current turn');
  PERFORM pg_temp.golf_assert(6*n+jsonb_array_length(s->'stock')+jsonb_array_length(s->'discard')+1=52,'pending draw conservation');
  v:=private.golf_visible(s,actor);
  PERFORM pg_temp.golf_assert(v->'pending'=s->'pending' AND private.golf_visible(s,'observer')->'pending'='null','threshold pending draw privacy');
  choice:=private.golf_bot_choice(v);
  PERFORM pg_temp.golf_assert(private.golf_bot_choice(v||'{"consecutiveNoRevealTurns":9999}')=choice,'v2 bots ignore retired pressure counter');
  s:=private.golf_reduce(s,'reject',NULL,201);queue:=s->'finalQueue';
  PERFORM pg_temp.golf_assert(s->>'finalReason'='stock_threshold' AND jsonb_array_length(queue)=n AND queue->>-1=actor AND NOT s?'stockFinalTrigger','finish trigger normally then all players including trigger');
  FOR i IN 1..n LOOP
   actor:=s->'players'->(s->>'turnIndex')::integer->>'id';
   PERFORM pg_temp.golf_assert(queue->>(i-1)=actor,'authoritative final order');
   s:=private.golf_reduce(s,'draw',NULL,300+i);
   s:=private.golf_reduce(s,'reject',NULL,300+i);
   PERFORM pg_temp.golf_assert(jsonb_array_length(s->'finalQueue')=n-i AND s->>'finalReason'='stock_threshold','queue consumes once, never restarts');
   IF i<n THEN PERFORM pg_temp.golf_assert(s->>'phase'='playing' AND s->'holes'='[]','no early scoring');END IF;
  END LOOP;
  PERFORM pg_temp.golf_assert(s->>'phase'='hole_complete' AND jsonb_array_length(s->'stock')=0 AND jsonb_array_length(s->'discard')=52-6*n AND jsonb_array_length(s->'holes')=1,'last stock consumed at final queue end; protected-discard-only impossible');
  PERFORM pg_temp.golf_assert((s#>>'{presentation,endsAt}')::bigint-(s#>>'{presentation,resultsAt}')::bigint=5000,'presentation timing unchanged');
  BEGIN PERFORM private.golf_reduce(s,'reject',NULL,900);RAISE EXCEPTION 'second score allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:phase' THEN RAISE;END IF;END;
  -- Arrange an ordinary legal six-exposed finish on the threshold's triggering turn.
  s:=seed;
  FOR i IN 1..3*n LOOP
   actor:=s->'players'->(s->>'turnIndex')::integer->>'id';
   s:=private.golf_reduce(s,'discard',ARRAY[CASE (i-1)/n WHEN 0 THEN 1 WHEN 1 THEN 2 ELSE 4 END],100+i);
  END LOOP;
  WHILE jsonb_array_length(s->'stock')>n+1 LOOP s:=private.golf_reduce(private.golf_reduce(s,'draw',NULL,200),'reject',NULL,200);END LOOP;
  WHILE s->>'turnIndex'<>'0' LOOP s:=private.golf_reduce(s,'discard',ARRAY[0],201);END LOOP;
  s:=private.golf_reduce(s,'draw',NULL,202);
  PERFORM pg_temp.golf_assert(s->>'stockFinalTrigger'='0','ordinary finisher also triggers stock boundary');
  s:=private.golf_reduce(s,'replace',ARRAY[5],203);
  PERFORM pg_temp.golf_assert(s->>'finalReason'='six_exposed' AND jsonb_array_length(s->'finalQueue')=n-1 AND NOT s->'finalQueue'?'0','fully exposed trigger keeps opponents-only semantics');
  FOR i IN 1..n-1 LOOP
   s:=private.golf_reduce(s,'draw',NULL,204+i);
   PERFORM pg_temp.golf_assert(NOT s?'stockFinalTrigger','stock threshold cannot restart ordinary final queue');
   s:=private.golf_reduce(s,'replace',ARRAY[5],204+i);
   PERFORM pg_temp.golf_assert(jsonb_array_length(s->'finalQueue')=n-1-i AND s->>'finalReason'='six_exposed','new full exposures cannot restart ordinary queue');
  END LOOP;
  PERFORM pg_temp.golf_assert(s->>'phase'='hole_complete','ordinary final queue still completes');
 END LOOP;
END $$;
SELECT 'Golf /2 exact 2–4 boundaries, pending conservation/privacy, queue, ordinary precedence, no cap, bot policy and scoring passed' proof;
