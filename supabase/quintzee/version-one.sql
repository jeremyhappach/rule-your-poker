-- Frozen production quintzee/1. Future rule versions add new functions.
-- quintzee/1: shared SQL authority for both modes. No admission or financial writes.
-- Reuses Yahtzee's pure category calculation with an EMPTY scorecard: no joker path.
CREATE OR REPLACE FUNCTION private.quintzee_v1_rules(duration_ms integer DEFAULT 180000, clear_bonus integer DEFAULT 35)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF duration_ms IS NULL OR duration_ms<=0 OR clear_bonus IS NULL OR clear_bonus<0 THEN RAISE EXCEPTION 'quintzee:config'; END IF;
 RETURN jsonb_build_object('version','quintzee/1','durationMs',duration_ms,'clearBonus',clear_bonus,
  'upperThreshold',63,'upperBonus',35,'bonusThreshold',80000,'rounds',2,'maxRounds',3,
  'introMs',2500,'resultMs',9000,'speedMin',100,'speedRange',200);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_categories() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT ARRAY['ones','twos','threes','fours','fives','sixes',
 'three_of_a_kind','four_of_a_kind','yahtzee','full_house','large_straight','chance']::text[] $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_validate_rules(r jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF r IS DISTINCT FROM private.quintzee_v1_rules((r->>'durationMs')::integer,(r->>'clearBonus')::integer)
 THEN RAISE EXCEPTION 'quintzee:rules_version'; END IF;
END $$;

-- Frozen independent Quintzee v1 scorer. No wildcard/joker substitution.
CREATE OR REPLACE FUNCTION private.quintzee_v1_category_score(category text,dice jsonb) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE total integer; biggest integer; distinct_i integer; spread integer; wanted integer;
BEGIN
 IF jsonb_typeof(dice) IS DISTINCT FROM 'array' OR jsonb_array_length(dice)<>5
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(dice) v WHERE v::text !~ '^[1-6]$') THEN RAISE EXCEPTION 'quintzee:invalid_dice';END IF;
 SELECT sum(v::text::int),count(DISTINCT v),max(v::text::int)-min(v::text::int) INTO total,distinct_i,spread FROM jsonb_array_elements(dice) v;
 SELECT max(n) INTO biggest FROM (SELECT count(*) n FROM jsonb_array_elements(dice) v GROUP BY v) counts;
 wanted:=array_position(ARRAY['ones','twos','threes','fours','fives','sixes'],category);
 IF wanted IS NOT NULL THEN RETURN wanted*(SELECT count(*)::int FROM jsonb_array_elements(dice) v WHERE v::text::int=wanted);END IF;
 CASE category
 WHEN 'three_of_a_kind' THEN RETURN CASE WHEN biggest>=3 THEN total ELSE 0 END;
 WHEN 'four_of_a_kind' THEN RETURN CASE WHEN biggest>=4 THEN total ELSE 0 END;
 WHEN 'yahtzee' THEN RETURN CASE WHEN biggest=5 THEN 50 ELSE 0 END;
 WHEN 'full_house' THEN RETURN CASE WHEN biggest=3 AND distinct_i=2 THEN 25 ELSE 0 END;
 WHEN 'large_straight' THEN RETURN CASE WHEN distinct_i=5 AND spread=4 THEN 40 ELSE 0 END;
 WHEN 'chance' THEN RETURN total;
 ELSE RAISE EXCEPTION 'quintzee:category';
 END CASE;
END $$;
REVOKE ALL ON FUNCTION private.quintzee_v1_category_score(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.quintzee_v1_potentials(b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c text; result jsonb:='{}'; points integer;
BEGIN
 IF jsonb_array_length(b->'dice')<>5 THEN RETURN result; END IF;
 FOREACH c IN ARRAY private.quintzee_v1_categories() LOOP
  IF NOT (b->'scores') ? c THEN
   points:=private.quintzee_v1_category_score(c,b->'dice');
   IF points>0 THEN result:=result||jsonb_build_object(c,points); END IF;
  END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_speed(remaining_ms bigint,duration_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT 100+(200*greatest(0,least(duration_ms,remaining_ms))/duration_ms)::integer
$$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_die() RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer;
BEGIN
 -- Rejection sampling: 252 is divisible by six; never use biased byte % 6.
 LOOP n:=get_byte(extensions.gen_random_bytes(1),0); EXIT WHEN n<252; END LOOP;
 RETURN 1+n%6;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_board_start(r jsonb,at_ms bigint,score_before bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 PERFORM private.quintzee_v1_validate_rules(r);
 RETURN jsonb_build_object('rules',r,'phase','intro','deadline',at_ms+(r->>'introMs')::bigint,
 'dice','[]'::jsonb,'held','[]'::jsonb,'rollsRemaining',3,'rollSerial',0,'scores','{}'::jsonb,
 'scoreBefore',score_before,'score',score_before,'result',NULL,'potentials','{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_roll(b jsonb,held integer[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE dice jsonb:='[]'; i integer; kept integer[]:=coalesce(held,ARRAY[]::integer[]);
BEGIN
 IF (b->>'rollsRemaining')::integer<=0 OR cardinality(kept)>5 OR EXISTS(SELECT 1 FROM unnest(kept) x WHERE x IS NULL OR x NOT BETWEEN 0 AND 4)
 OR (SELECT count(DISTINCT x) FROM unnest(kept) x)<>cardinality(kept)
 OR jsonb_array_length(b->'dice')<>5 AND cardinality(kept)>0 THEN RAISE EXCEPTION 'quintzee:roll'; END IF;
 FOR i IN 0..4 LOOP
  dice:=dice||jsonb_build_array(CASE WHEN i=ANY(kept) THEN (b->'dice'->>i)::integer ELSE private.quintzee_v1_die() END);
 END LOOP;
 b:=b||jsonb_build_object('dice',dice,'held',to_jsonb(kept),'rollsRemaining',(b->>'rollsRemaining')::integer-1,'rollSerial',(b->>'rollSerial')::integer+1);
 RETURN b||jsonb_build_object('potentials',private.quintzee_v1_potentials(b));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE upper_i bigint; raw_i bigint; upper_bonus integer; clear_i integer; multiplier integer; points bigint; remaining bigint;
BEGIN
 IF b->>'phase'<>'playing' OR reason NOT IN('all_categories','timeout','no_matches') THEN RAISE EXCEPTION 'quintzee:finish'; END IF;
 SELECT coalesce(sum(value::bigint),0),coalesce(sum(value::bigint) FILTER(WHERE key=ANY((private.quintzee_v1_categories())[1:6])),0)
 INTO raw_i,upper_i FROM jsonb_each_text(b->'scores');
 upper_bonus:=CASE WHEN upper_i>=63 THEN 35 ELSE 0 END;
 clear_i:=CASE WHEN (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN (b#>>'{rules,clearBonus}')::integer ELSE 0 END;
 remaining:=CASE WHEN reason='timeout' THEN 0 ELSE greatest(0,(b->>'deadline')::bigint-at_ms) END;
 multiplier:=private.quintzee_v1_speed(remaining,(b#>>'{rules,durationMs}')::bigint);
 points:=(raw_i+upper_bonus+clear_i)*multiplier;
 RETURN b||jsonb_build_object('phase','stage_complete','deadline',at_ms+(b#>>'{rules,resultMs}')::bigint,
 'score',(b->>'scoreBefore')::bigint+points,'potentials','{}'::jsonb,
 'result',jsonb_build_object('reason',reason,'categories',b->'scores','upperSubtotal',upper_i,'categorySubtotal',raw_i,
 'upperBonus',upper_bonus,'clearBonus',clear_i,'rawSubtotal',raw_i+upper_bonus+clear_i,'multiplier',multiplier,
 'remainingMs',remaining,'stageScore',points,'scoreBefore',b->'scoreBefore','score',(b->>'scoreBefore')::bigint+points,'completedAt',at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE c text; points integer; due bigint;
BEGIN
 PERFORM private.quintzee_v1_validate_rules(b->'rules');
 IF b->>'phase'='intro' THEN
  due:=(b->>'deadline')::bigint;
  IF at_ms<due THEN IF action='tick' THEN RETURN b; END IF; RAISE EXCEPTION 'quintzee:not_ready'; END IF;
  b:=b||jsonb_build_object('phase','playing','startedAt',due,'deadline',due+(b#>>'{rules,durationMs}')::bigint);
  IF at_ms<(b->>'deadline')::bigint THEN b:=private.quintzee_v1_roll(b,NULL); END IF;
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'quintzee:phase'; END IF;
 -- A crossing action never scores or draws; expiry keeps only committed categories.
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.quintzee_v1_finish(b,'timeout',(b->>'deadline')::bigint); END IF;
 IF action='tick' THEN RETURN b; END IF;
 IF action='roll' THEN b:=private.quintzee_v1_roll(b,items);
 ELSIF action='score' THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'quintzee:category'; END IF;
  c:=(private.quintzee_v1_categories())[items[1]+1];
  IF (b->'scores') ? c THEN RAISE EXCEPTION 'quintzee:already_scored'; END IF;
  points:=private.quintzee_v1_category_score(c,b->'dice');
  IF points<=0 THEN RAISE EXCEPTION 'quintzee:no_match'; END IF;
  b:=jsonb_set(b,ARRAY['scores',c],to_jsonb(points));
  IF (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN RETURN private.quintzee_v1_finish(b,'all_categories',at_ms); END IF;
  -- A scored category starts another hand, not another player or another clock.
  b:=private.quintzee_v1_roll(b||'{"rollsRemaining":3,"dice":[],"held":[]}'::jsonb,NULL);
 ELSE RAISE EXCEPTION 'quintzee:action'; END IF;
 IF (b->>'rollsRemaining')::integer=0 AND b->'potentials'='{}'::jsonb THEN RETURN private.quintzee_v1_finish(b,'no_matches',at_ms); END IF;
 RETURN b;
END $$;

-- Shared scheduling policy follows Boxdrop's complete-round rotation. Solo passes one UUID.
CREATE OR REPLACE FUNCTION private.quintzee_v1_start(players uuid[],r jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 IF cardinality(players) NOT BETWEEN 1 AND 4 OR cardinality(players) IS NULL OR array_position(players,NULL) IS NOT NULL
 OR (SELECT count(DISTINCT p) FROM unnest(players) p)<>cardinality(players) THEN RAISE EXCEPTION 'quintzee:players'; END IF;
 SELECT jsonb_object_agg(p::text,0) INTO totals FROM unnest(players) p;
 RETURN jsonb_build_object('rules',r,'players',to_jsonb(players),'scores',totals,'round',1,'turnIndex',0,'qualified','[]'::jsonb,
 'results','[]'::jsonb,'finished',false,'board',private.quintzee_v1_board_start(r,at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE b jsonb:=s->'board'; idx integer:=(s->>'turnIndex')::integer; round_i integer:=(s->>'round')::integer;
 n integer:=jsonb_array_length(s->'players'); actor text:=s->'players'->>idx; eligible jsonb;
BEGIN
 IF (s->>'finished')::boolean THEN RETURN s; END IF;
 IF b->>'phase'='stage_complete' THEN
  IF action<>'tick' THEN RAISE EXCEPTION 'quintzee:phase'; END IF;
  IF at_ms<(b->>'deadline')::bigint THEN RETURN s; END IF;
  idx:=idx+1;
  IF idx>=n AND round_i<2 THEN idx:=0; round_i:=2; END IF;
  IF idx>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p ORDER BY i),'[]'::jsonb) INTO eligible FROM jsonb_array_elements_text(s->'players') WITH ORDINALITY AS x(p,i)
   WHERE (s->'scores'->>p)::bigint>=80000;
   s:=s||jsonb_build_object('qualified',eligible);
   IF jsonb_array_length(eligible)>0 THEN idx:=0; round_i:=3; END IF;
  END IF;
  IF round_i=3 THEN WHILE idx<n AND NOT (s->'qualified') ? (s->'players'->>idx) LOOP idx:=idx+1; END LOOP; END IF;
  IF idx>=n THEN RETURN s||'{"finished":true}'::jsonb; END IF;
  actor:=s->'players'->>idx;
  RETURN s||jsonb_build_object('round',round_i,'turnIndex',idx,'board',private.quintzee_v1_board_start(s->'rules',(b->>'deadline')::bigint,(s->'scores'->>actor)::bigint));
 END IF;
 b:=private.quintzee_v1_board_reduce(b,action,items,at_ms);
 s:=s||jsonb_build_object('board',b);
 IF b->>'phase'='stage_complete' THEN
  s:=jsonb_set(s,ARRAY['scores',actor],b->'score')||jsonb_build_object('results',(s->'results')||jsonb_build_array(b->'result'||jsonb_build_object('playerId',actor,'round',round_i)));
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v1_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE i integer;
BEGIN
 FOR i IN 1..48 LOOP
  EXIT WHEN (s->>'finished')::boolean OR (s#>>'{board,deadline}')::bigint>at_ms;
  s:=private.quintzee_v1_reduce(s,'tick',NULL,(s#>>'{board,deadline}')::bigint);
 END LOOP;
 RETURN s;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'quintzee_v1_%'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
