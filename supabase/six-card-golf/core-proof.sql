CREATE OR REPLACE FUNCTION pg_temp.golf_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Golf proof: %',label;END IF;END $$;
DO $$
DECLARE s jsonb; v jsonb; before_i jsonb; p jsonb; choice jsonb; n integer; i integer; j integer; actor text; deck jsonb; hole_i integer; pending_card jsonb;
BEGIN
 PERFORM pg_temp.golf_assert(private.golf_score('[1,14,27,40,2,3]')=3,'twos match by rank and negative totals');
 PERFORM pg_temp.golf_assert(private.golf_score('[1,14,27,2,3,4]')=6,'three unmatched negative twos');
 PERFORM pg_temp.golf_assert(private.golf_score('[1,14,27,12,25,38]')=-6,'negative hole total is retained');
 PERFORM pg_temp.golf_assert(private.golf_score('[10,12,0,11,25,13]')=20,'J/Q do not match, kings and aces cancel');
 FOR n IN 2..4 LOOP
  SELECT jsonb_agg(jsonb_build_object('id',x::text,'isBot',false)),jsonb_object_agg(x::text,0) INTO p,v FROM generate_series(0,n-1)x;
  s:=private.golf_deal(jsonb_build_object('players',p,'scores',v,'rules',private.golf_rules(),'identity','{}'::jsonb,'hole',1,'dealerIndex',n-1,'holes','[]'::jsonb),0);
  PERFORM pg_temp.golf_assert(jsonb_array_length(s->'stock')=51-6*n,'initial stock');
  v:=private.golf_visible(s,'0');
  PERFORM pg_temp.golf_assert(v#>'{tableaus,0,cards}'='[null,null,null,null,null,null]'::jsonb AND NOT v?'stock','own cards concealed');
  BEGIN PERFORM private.golf_reduce(s,'open',ARRAY[0,0],1);RAISE EXCEPTION 'missing duplicate opening rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:illegal_open' THEN RAISE;END IF;END;
  FOR i IN 1..n LOOP s:=private.golf_reduce(s,'open',ARRAY[0,3],i);END LOOP;
  PERFORM pg_temp.golf_assert(s->>'phase'='playing' AND s->>'consecutiveNoRevealTurns'='0','opening complete');
  s:=private.golf_reduce(private.golf_reduce(s,'draw',NULL,10),'reject',NULL,11);
  PERFORM pg_temp.golf_assert(s->>'consecutiveNoRevealTurns'='1','rejected draw counts one completed turn');
  s:=private.golf_reduce(private.golf_reduce(s,'draw',NULL,12),'replace',ARRAY[1],13);
  PERFORM pg_temp.golf_assert(s->>'consecutiveNoRevealTurns'='0','new exposure resets progress');
  BEGIN
   PERFORM private.golf_integrity(s||jsonb_build_object('stock','[]'::jsonb,'discard',jsonb_build_array(s->'discard'->-1)));
   RAISE EXCEPTION 'missing impossible stock rejection';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'golf:integrity' THEN RAISE;END IF;END;
  FOR i IN 1..5*n LOOP
   actor:=s->'players'->(s->>'turnIndex')::integer->>'id';before_i:=s;
   s:=private.golf_reduce(s,'draw',NULL,100+i);
   PERFORM pg_temp.golf_assert(s->'deadline'=before_i->'deadline' AND s->'consecutiveNoRevealTurns'=before_i->'consecutiveNoRevealTurns','draw not a turn/deadline reset');
   PERFORM pg_temp.golf_assert(private.golf_visible(s,actor)->'pending'=s->'pending' AND private.golf_visible(s,'observer')->'pending'='null'::jsonb,'pending actor privacy');
   s:=private.golf_reduce(s,'reject',NULL,100+i);
   IF i=4*n THEN PERFORM pg_temp.golf_assert(s->>'finalReason' IS NULL AND s->>'consecutiveNoRevealTurns'=(4*n)::text,'warning threshold');END IF;
  END LOOP;
  PERFORM pg_temp.golf_assert(s->>'finalReason'='prolonged_play' AND jsonb_array_length(s->'finalQueue')=n AND s->'finalQueue'->>-1=actor,'house queue all participants');
  FOR i IN 1..n LOOP
   s:=private.golf_reduce(s,'draw',NULL,200+i);s:=private.golf_reduce(s,'replace',ARRAY[1],200+i);
   IF i<n THEN PERFORM pg_temp.golf_assert(jsonb_array_length(s->'finalQueue')=n-i,'exposure cannot restart final queue');END IF;
  END LOOP;
  PERFORM pg_temp.golf_assert(s->>'phase'='hole_complete' AND jsonb_array_length(s->'holes')=1,'one final reveal and score');
  -- Restart a hole for ordinary ending, reset behavior, recycling, replacement.
  s:=private.golf_deal(s||jsonb_build_object('hole',2),300);
  FOR i IN 1..n LOOP s:=private.golf_reduce(s,'open',ARRAY[0,3],300+i);END LOOP;
  FOR j IN 1..4 LOOP
   FOR i IN 1..n LOOP
    s:=private.golf_reduce(s,'draw',NULL,400+i+j*10);
    s:=private.golf_reduce(s,CASE WHEN i=1 THEN 'replace' ELSE 'reject' END,CASE WHEN i=1 THEN ARRAY[CASE j WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 ELSE 5 END] END,400+i+j*10);
    EXIT WHEN s->>'finalReason' IS NOT NULL;
   END LOOP;
  END LOOP;
  PERFORM pg_temp.golf_assert(s->>'finalReason'='six_exposed' AND jsonb_array_length(s->'finalQueue')=n-1,'ordinary queue excludes finisher');
  -- Exhaust/recycle by transferring stock cards to discard, preserving partition.
  s:=s||jsonb_build_object('discard',(s->'stock')||(s->'discard'),'stock','[]'::jsonb);
  before_i:=s;s:=private.golf_reduce(s,'draw',NULL,500);
  PERFORM pg_temp.golf_assert(s->'discard'->-1=before_i->'discard'->-1 AND jsonb_array_length(s->'stock')=50-6*n,'recycle protects discard');
  PERFORM private.golf_integrity(s);
  v:=private.golf_visible(s,s#>>'{pending,actor}');choice:=private.golf_bot_choice(v);
  -- Permuting two concealed cards cannot change actor observation or policy.
  actor:=s->'players'->1->>'id';pending_card:=s->'tableaus'->actor->'cards'->2;
  before_i:=jsonb_set(jsonb_set(s,ARRAY['tableaus',actor,'cards','2'],s->'tableaus'->actor->'cards'->4),ARRAY['tableaus',actor,'cards','4'],pending_card);
  PERFORM pg_temp.golf_assert(private.golf_visible(before_i,s#>>'{pending,actor}')=v AND private.golf_bot_choice(private.golf_visible(before_i,s#>>'{pending,actor}'))=choice,'observation-equivalent bot policy');
 END LOOP;
END $$;
SELECT 'Golf core rules, conservation, privacy, queues and bot equivalence passed' proof;
