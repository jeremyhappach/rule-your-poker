-- 357 Drop / 1. Mode-independent, server-owned rules. Cards are 0..51,
-- rank = card % 13 + 2 (14 maps to ace=15), suit = card / 13.
CREATE OR REPLACE FUNCTION private.drop357_rank(c integer) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN c%13=12 THEN 15 ELSE c%13+2 END $$;

-- Highest poker vector, before points/natural bonuses. Wild cards are removed
-- before classification; constructing rank patterns avoids exponential assignments.
CREATE OR REPLACE FUNCTION private.drop357_vector(cards integer[], lane integer) RETURNS integer[]
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE ranks integer[]:=ARRAY[15,13,12,11,10,9,8,7,6,5,4,3,2]; counts integer[]:=array_fill(0,ARRAY[15]);
 w integer:=0; c integer; r integer; a integer; b integer; k integer; need integer; n integer:=cardinality(cards);
 suit_i integer; flush_ok boolean:=true; unique_ok boolean:=true; lefts integer[]; target integer[]; hi integer;
BEGIN
 FOREACH c IN ARRAY cards LOOP
  r:=private.drop357_rank(c);
  IF r=lane THEN w:=w+1; ELSE
   counts[r]:=counts[r]+1;
   IF counts[r]>1 THEN unique_ok:=false; END IF;
   IF suit_i IS NULL THEN suit_i:=c/13; ELSIF suit_i<>c/13 THEN flush_ok:=false; END IF;
  END IF;
 END LOOP;
 IF n=3 THEN
  FOREACH a IN ARRAY ranks LOOP IF counts[a]+w=3 THEN RETURN ARRAY[3,a]; END IF; END LOOP;
  FOREACH a IN ARRAY ranks LOOP
   IF counts[a]+w>=2 THEN
    SELECT max(x) INTO k FROM unnest(ranks)x WHERE x<>a AND counts[x]>0;
    IF k IS NULL THEN k:=CASE WHEN a=15 THEN 13 ELSE 15 END; END IF;
    RETURN ARRAY[1,a,k];
   END IF;
  END LOOP;
  RETURN ARRAY[0];
 END IF;
 FOREACH a IN ARRAY ranks LOOP IF counts[a]+w=5 THEN RETURN ARRAY[10,a]; END IF; END LOOP;
 -- Royal and straight flush, ace-low only in the wheel.
 IF flush_ok AND unique_ok THEN
  FOR hi IN REVERSE 14..5 LOOP
   target:=CASE WHEN hi=14 THEN ARRAY[10,11,12,13,15] WHEN hi=5 THEN ARRAY[15,2,3,4,5] ELSE ARRAY[hi-4,hi-3,hi-2,hi-1,hi] END;
   IF NOT EXISTS(SELECT FROM unnest(ranks)x WHERE counts[x]>0 AND NOT x=ANY(target)) THEN
    RETURN CASE WHEN hi=14 THEN ARRAY[9] ELSE ARRAY[8,hi] END;
   END IF;
  END LOOP;
 END IF;
 FOREACH a IN ARRAY ranks LOOP
  IF counts[a]+w>=4 THEN
   SELECT max(x) INTO k FROM unnest(ranks)x WHERE x<>a AND counts[x]>0;
   IF k IS NULL THEN k:=CASE WHEN a=15 THEN 13 ELSE 15 END; END IF;
   RETURN ARRAY[7,a,k];
  END IF;
 END LOOP;
 FOREACH a IN ARRAY ranks LOOP FOREACH b IN ARRAY ranks LOOP
  IF a<>b AND counts[a]<=3 AND counts[b]<=2 AND counts[a]+counts[b]+w=5 THEN RETURN ARRAY[6,a,b]; END IF;
 END LOOP; END LOOP;
 IF flush_ok THEN
  SELECT coalesce(array_agg(x ORDER BY x DESC),'{}'::integer[]) INTO lefts FROM unnest(ranks)x WHERE counts[x]>0;
  FOREACH a IN ARRAY ranks LOOP EXIT WHEN cardinality(lefts)=5; IF NOT a=ANY(lefts) THEN lefts:=array_append(lefts,a); END IF; END LOOP;
  SELECT array_agg(x ORDER BY x DESC) INTO lefts FROM unnest(lefts)x;
  RETURN ARRAY[5]||lefts;
 END IF;
 IF unique_ok THEN
  FOR hi IN REVERSE 14..5 LOOP
   target:=CASE WHEN hi=14 THEN ARRAY[10,11,12,13,15] WHEN hi=5 THEN ARRAY[15,2,3,4,5] ELSE ARRAY[hi-4,hi-3,hi-2,hi-1,hi] END;
   IF NOT EXISTS(SELECT FROM unnest(ranks)x WHERE counts[x]>0 AND NOT x=ANY(target)) THEN RETURN ARRAY[4,CASE WHEN hi=14 THEN 15 ELSE hi END]; END IF;
  END LOOP;
 END IF;
 FOREACH a IN ARRAY ranks LOOP
  IF counts[a]+w>=3 AND NOT EXISTS(SELECT FROM unnest(ranks)x WHERE x<>a AND counts[x]>1) THEN
   SELECT coalesce(array_agg(x ORDER BY x DESC),'{}'::integer[]) INTO lefts FROM unnest(ranks)x WHERE x<>a AND counts[x]>0;
   FOREACH b IN ARRAY ranks LOOP EXIT WHEN cardinality(lefts)=2; IF b<>a AND NOT b=ANY(lefts) THEN lefts:=array_append(lefts,b); END IF; END LOOP;
   SELECT array_agg(x ORDER BY x DESC) INTO lefts FROM unnest(lefts)x;
   RETURN ARRAY[3,a]||lefts;
  END IF;
 END LOOP;
 FOREACH a IN ARRAY ranks LOOP FOREACH b IN ARRAY ranks LOOP
  IF a>b AND counts[a]<=2 AND counts[b]<=2 AND 4-counts[a]-counts[b]<=w THEN
   SELECT max(x) INTO k FROM unnest(ranks)x WHERE x<>a AND x<>b AND counts[x]>0;
   IF k IS NULL THEN SELECT max(x) INTO k FROM unnest(ranks)x WHERE x<>a AND x<>b; END IF;
   RETURN ARRAY[2,a,b,k];
  END IF;
 END LOOP; END LOOP;
 FOREACH a IN ARRAY ranks LOOP
  IF counts[a]+w>=2 THEN
   SELECT coalesce(array_agg(x ORDER BY x DESC),'{}'::integer[]) INTO lefts FROM unnest(ranks)x WHERE x<>a AND counts[x]>0;
   FOREACH b IN ARRAY ranks LOOP EXIT WHEN cardinality(lefts)=3; IF b<>a AND NOT b=ANY(lefts) THEN lefts:=array_append(lefts,b); END IF; END LOOP;
   SELECT array_agg(x ORDER BY x DESC) INTO lefts FROM unnest(lefts)x;
   RETURN ARRAY[1,a]||lefts;
  END IF;
 END LOOP;
 SELECT array_agg(x ORDER BY x DESC) INTO lefts FROM unnest(ranks)x WHERE counts[x]>0;
 RETURN ARRAY[0]||lefts;
END $$;

CREATE OR REPLACE FUNCTION private.drop357_lane(cards integer[], lane integer) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE mask integer; i integer; selected integer[]; indices integer[]; v integer[]; best integer[];
 chosen integer[]; natural_i boolean; natural_best boolean:=false; points integer; bonus integer; n integer:=cardinality(cards);
BEGIN
 IF lane NOT IN(3,5,7) OR n IS DISTINCT FROM lane OR EXISTS(SELECT FROM unnest(cards)c WHERE c IS NULL OR c NOT BETWEEN 0 AND 51)
  OR (SELECT count(DISTINCT c) FROM unnest(cards)c)<>n THEN RAISE EXCEPTION 'arcade:invalid_cards'; END IF;
 FOR mask IN 1..((1<<n)-1) LOOP
  IF bit_count(mask::bit(8))<>least(5,n) THEN CONTINUE; END IF;
  selected:='{}';indices:='{}';natural_i:=true;
  FOR i IN 0..n-1 LOOP IF (mask & (1<<i))<>0 THEN
   selected:=array_append(selected,cards[i+1]);indices:=array_append(indices,i);
   IF private.drop357_rank(cards[i+1])=lane THEN natural_i:=false; END IF;
  END IF; END LOOP;
  v:=private.drop357_vector(selected,lane);
  IF best IS NULL OR v>best OR (v=best AND natural_i AND NOT natural_best) THEN best:=v;chosen:=indices;natural_best:=natural_i; END IF;
 END LOOP;
 points:=CASE WHEN lane=3 THEN CASE best[1] WHEN 3 THEN 150+30*best[2] WHEN 1 THEN 10*best[2]+best[3] ELSE 0 END ELSE
  CASE best[1] WHEN 2 THEN 200+16*best[2]+best[3] WHEN 3 THEN 550+10*best[2] WHEN 4 THEN 850+10*best[2]
   WHEN 5 THEN 1200+10*best[2] WHEN 6 THEN 1600+16*best[2]+best[3] WHEN 7 THEN 2250+10*best[2]
   WHEN 8 THEN 2900+10*best[2] WHEN 9 THEN 3700 WHEN 10 THEN 4500+10*best[2] ELSE 0 END END;
 bonus:=CASE WHEN natural_best THEN round(points*0.20)::integer ELSE 0 END;
 RETURN jsonb_build_object('vector',best,'selected',chosen,'natural',natural_best AND points>0,'points',points,'bonus',bonus,'score',points+bonus,
  'category',(ARRAY['High card','Pair','Two pair','Trips','Straight','Flush','Full house','Quads','Straight flush','Royal flush','Five of a kind'])[best[1]+1]);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_finish(s jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE base integer; all_bonus integer; time_bonus integer; remaining bigint;
BEGIN
 IF s->>'status'<>'active' THEN RETURN s; END IF;
 SELECT coalesce(sum((x->>'score')::integer),0),CASE WHEN count(*) FILTER(WHERE (x->>'score')::integer>0)=3 THEN 200 ELSE 0 END
  INTO base,all_bonus FROM jsonb_array_elements(s->'laneResults') x;
 base:=base+all_bonus;
 remaining:=greatest(0,least(120000,(s->>'deadline')::bigint-at_ms));
 time_bonus:=CASE WHEN reason='filled' THEN round(base*0.20*remaining/120000)::integer ELSE 0 END;
 RETURN s||jsonb_build_object('status','completed','phase','complete','score',base+time_bonus,'current',NULL,
  'result',jsonb_build_object('reason',reason,'base',base,'allBonus',all_bonus,'timeBonus',time_bonus,'score',base+time_bonus,'completedAt',at_ms,'remainingMs',remaining));
END $$;

CREATE OR REPLACE FUNCTION private.drop357_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb;
BEGIN
 SELECT jsonb_agg(c ORDER BY private.secure_shuffle_key()) INTO deck FROM generate_series(0,51)c;
 RETURN s||jsonb_build_object('round',1,'roundId',(s->>'runId')||':1','phase','playing','deck',deck,'cursor',1,'current',deck->0,
  'startedAt',at_ms,'deadline',at_ms+120000,'lanes','[[],[],[]]'::jsonb,'laneResults','[null,null,null]'::jsonb,'passesLeft',3,'placements',0,'score',0,'result',NULL);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_action(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lane_i integer; size_i integer; row_i jsonb; result_i jsonb; cursor_i integer:=(s->>'cursor')::integer; score_i integer;
BEGIN
 IF s->>'status'<>'active' THEN RAISE EXCEPTION 'arcade:run_ended'; END IF;
 IF at_ms>=(s->>'deadline')::bigint THEN RETURN private.drop357_finish(s,(s->>'deadline')::bigint,'timeout'); END IF;
 IF action='abandon' AND cardinality(items)=0 THEN RETURN s||'{"status":"abandoned","phase":"complete","current":null}'::jsonb; END IF;
 IF action='pass' AND cardinality(items)=0 AND (s->>'passesLeft')::integer>0 THEN
  s:=s||jsonb_build_object('passesLeft',(s->>'passesLeft')::integer-1);
 ELSIF action='place' AND cardinality(items)=1 AND items[1] BETWEEN 0 AND 2 THEN
  lane_i:=items[1];size_i:=(ARRAY[3,5,7])[lane_i+1];row_i:=s->'lanes'->lane_i;
  IF jsonb_array_length(row_i)>=size_i THEN RAISE EXCEPTION 'arcade:column_locked'; END IF;
  row_i:=row_i||jsonb_build_array(s->'current');
  s:=jsonb_set(s,ARRAY['lanes',lane_i::text],row_i)||jsonb_build_object('placements',(s->>'placements')::integer+1);
  IF jsonb_array_length(row_i)=size_i THEN
   result_i:=private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),size_i)||jsonb_build_object('completedAt',at_ms);
   s:=jsonb_set(s,ARRAY['laneResults',lane_i::text],result_i);
   SELECT sum(coalesce((x->>'score')::integer,0)) INTO score_i FROM jsonb_array_elements(s->'laneResults')x;
   s:=s||jsonb_build_object('score',score_i);
  END IF;
 ELSE RAISE EXCEPTION 'arcade:illegal_action'; END IF;
 IF (s->>'placements')::integer=15 THEN RETURN private.drop357_finish(s,at_ms,'filled'); END IF;
 RETURN s||jsonb_build_object('current',s->'deck'->cursor_i,'cursor',cursor_i+1);
END $$;

CREATE OR REPLACE FUNCTION private.drop357_valid(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer; cards integer[]; expected jsonb; base integer:=0; all_ok boolean:=true; r jsonb:=s->'result'; bonus integer;
BEGIN
 IF s->>'phase' IS DISTINCT FROM 'complete' OR s->>'round' IS DISTINCT FROM '1' OR r->>'reason' NOT IN('filled','timeout') OR r IS NULL THEN RETURN false; END IF;
 FOR i IN 0..2 LOOP
  cards:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(s->'lanes'->i));
  IF cardinality(cards)=(ARRAY[3,5,7])[i+1] THEN
   expected:=private.drop357_lane(cards,(ARRAY[3,5,7])[i+1]);
   IF (s->'laneResults'->i)-'completedAt' IS DISTINCT FROM expected THEN RETURN false; END IF;
   base:=base+(expected->>'score')::integer;all_ok:=all_ok AND (expected->>'score')::integer>0;
  ELSE
   IF r->>'reason'='filled' OR s->'laneResults'->i IS DISTINCT FROM 'null'::jsonb THEN RETURN false; END IF;
   all_ok:=false;
  END IF;
 END LOOP;
 base:=base+CASE WHEN all_ok THEN 200 ELSE 0 END;
 bonus:=CASE WHEN r->>'reason'='filled' THEN round(base*0.20*greatest(0,least(120000,(s->>'deadline')::bigint-(r->>'completedAt')::bigint))/120000)::integer ELSE 0 END;
 RETURN (r->>'base')::integer=base AND (r->>'timeBonus')::integer=bonus AND (r->>'score')::integer=base+bonus AND (s->>'score')::integer=base+bonus;
END $$;
