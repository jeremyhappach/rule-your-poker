SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN IF (SELECT md5(string_agg(n.nspname||'.'||p.proname||':'||pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname IN('private','public') AND p.proname LIKE '%quintzee%') OR (n.nspname='public' AND p.proname='arcade_start')) IS DISTINCT FROM '9e67887a47b055f4e511f5d77d2cdd16' THEN RAISE EXCEPTION 'quintzee:authority_drift';END IF;IF to_regprocedure('private.quintzee_v3_rules(integer,integer)') IS NOT NULL THEN RAISE EXCEPTION 'quintzee:polish_already_installed';END IF;END $guard$;
-- LOCAL candidate. v1 definitions remain unchanged; scoring formulas are identical.
-- Frozen production quintzee/2. Future rule versions add new functions.
-- quintzee/2: shared SQL authority for both modes. No admission or financial writes.
-- Reuses Yahtzee's pure category calculation with an EMPTY scorecard: no joker path.
CREATE OR REPLACE FUNCTION private.quintzee_v2_rules(duration_ms integer DEFAULT 180000, clear_bonus integer DEFAULT 35)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF duration_ms IS NULL OR duration_ms<=0 OR clear_bonus IS NULL OR clear_bonus<0 THEN RAISE EXCEPTION 'quintzee:config'; END IF;
 RETURN jsonb_build_object('version','quintzee/2','durationMs',duration_ms,'clearBonus',clear_bonus,
  'upperThreshold',63,'upperBonus',35,'bonusThreshold',80000,'rounds',2,'maxRounds',3,
  'readyMs',30000,'introMs',2500,'resultMs',9000,'speedMin',100,'speedRange',200);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_categories() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT ARRAY['ones','twos','threes','fours','fives','sixes',
 'three_of_a_kind','four_of_a_kind','yahtzee','full_house','large_straight','chance']::text[] $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_validate_rules(r jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF r IS DISTINCT FROM private.quintzee_v2_rules((r->>'durationMs')::integer,(r->>'clearBonus')::integer)
 THEN RAISE EXCEPTION 'quintzee:rules_version'; END IF;
END $$;

-- Frozen independent Quintzee v1 scorer. No wildcard/joker substitution.
CREATE OR REPLACE FUNCTION private.quintzee_v2_category_score(category text,dice jsonb) RETURNS integer
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
REVOKE ALL ON FUNCTION private.quintzee_v2_category_score(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.quintzee_v2_potentials(b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c text; result jsonb:='{}'; points integer;
BEGIN
 IF jsonb_array_length(b->'dice')<>5 THEN RETURN result; END IF;
 FOREACH c IN ARRAY private.quintzee_v2_categories() LOOP
  IF NOT (b->'scores') ? c THEN
   points:=private.quintzee_v2_category_score(c,b->'dice');
   IF points>0 THEN result:=result||jsonb_build_object(c,points); END IF;
  END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_speed(remaining_ms bigint,duration_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT 100+(200*greatest(0,least(duration_ms,remaining_ms))/duration_ms)::integer
$$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_die() RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer;
BEGIN
 -- Rejection sampling: 252 is divisible by six; never use biased byte % 6.
 LOOP n:=get_byte(extensions.gen_random_bytes(1),0); EXIT WHEN n<252; END LOOP;
 RETURN 1+n%6;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_board_start(r jsonb,at_ms bigint,score_before bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 PERFORM private.quintzee_v2_validate_rules(r);
 RETURN jsonb_build_object('rules',r,'phase','ready','deadline',at_ms+(r->>'readyMs')::bigint,
 'dice','[]'::jsonb,'held','[]'::jsonb,'rollsRemaining',3,'rollSerial',0,'scores','{}'::jsonb,
 'scoreBefore',score_before,'score',score_before,'result',NULL,'potentials','{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_roll(b jsonb,held integer[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE dice jsonb:='[]'; i integer; kept integer[]:=coalesce(held,ARRAY[]::integer[]);
BEGIN
 IF (b->>'rollsRemaining')::integer<=0 OR cardinality(kept)>5 OR EXISTS(SELECT 1 FROM unnest(kept) x WHERE x IS NULL OR x NOT BETWEEN 0 AND 4)
 OR (SELECT count(DISTINCT x) FROM unnest(kept) x)<>cardinality(kept)
 OR jsonb_array_length(b->'dice')<>5 AND cardinality(kept)>0 THEN RAISE EXCEPTION 'quintzee:roll'; END IF;
 FOR i IN 0..4 LOOP
  dice:=dice||jsonb_build_array(CASE WHEN i=ANY(kept) THEN (b->'dice'->>i)::integer ELSE private.quintzee_v2_die() END);
 END LOOP;
 b:=b||jsonb_build_object('dice',dice,'held',to_jsonb(kept),'rollsRemaining',(b->>'rollsRemaining')::integer-1,'rollSerial',(b->>'rollSerial')::integer+1);
 RETURN b||jsonb_build_object('potentials',private.quintzee_v2_potentials(b));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE upper_i bigint; raw_i bigint; upper_bonus integer; clear_i integer; multiplier integer; points bigint; remaining bigint;
BEGIN
 IF b->>'phase'<>'playing' OR reason NOT IN('all_categories','timeout','no_matches') THEN RAISE EXCEPTION 'quintzee:finish'; END IF;
 SELECT coalesce(sum(value::bigint),0),coalesce(sum(value::bigint) FILTER(WHERE key=ANY((private.quintzee_v2_categories())[1:6])),0)
 INTO raw_i,upper_i FROM jsonb_each_text(b->'scores');
 upper_bonus:=CASE WHEN upper_i>=63 THEN 35 ELSE 0 END;
 clear_i:=CASE WHEN (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN (b#>>'{rules,clearBonus}')::integer ELSE 0 END;
 remaining:=CASE WHEN reason='timeout' THEN 0 ELSE greatest(0,(b->>'deadline')::bigint-at_ms) END;
 multiplier:=private.quintzee_v2_speed(remaining,(b#>>'{rules,durationMs}')::bigint);
 points:=(raw_i+upper_bonus+clear_i)*multiplier;
 RETURN b||jsonb_build_object('phase','stage_complete','deadline',at_ms+(b#>>'{rules,resultMs}')::bigint,
 'score',(b->>'scoreBefore')::bigint+points,'potentials','{}'::jsonb,
 'result',jsonb_build_object('reason',reason,'categories',b->'scores','upperSubtotal',upper_i,'categorySubtotal',raw_i,
 'upperBonus',upper_bonus,'clearBonus',clear_i,'rawSubtotal',raw_i+upper_bonus+clear_i,'multiplier',multiplier,
 'remainingMs',remaining,'stageScore',points,'scoreBefore',b->'scoreBefore','score',(b->>'scoreBefore')::bigint+points,'completedAt',at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE c text; points integer; due bigint;
BEGIN
 PERFORM private.quintzee_v2_validate_rules(b->'rules');
 IF b->>'phase'='ready' THEN
  due:=(b->>'deadline')::bigint;
  IF action='tick' THEN RETURN b;END IF;
  IF action<>'start' OR cardinality(coalesce(items,ARRAY[]::integer[]))<>0 OR at_ms>due THEN RAISE EXCEPTION 'quintzee:start_expired';END IF;
  RETURN private.quintzee_v2_roll(b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,durationMs}')::bigint),NULL);
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'quintzee:phase'; END IF;
 -- A crossing action never scores or draws; expiry keeps only committed categories.
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.quintzee_v2_finish(b,'timeout',(b->>'deadline')::bigint); END IF;
 IF action='tick' THEN RETURN b; END IF;
 IF action='roll' THEN b:=private.quintzee_v2_roll(b,items);
 ELSIF action IN('score','score_zero') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'quintzee:category'; END IF;
  c:=(private.quintzee_v2_categories())[items[1]+1];
  IF (b->'scores') ? c THEN RAISE EXCEPTION 'quintzee:already_scored'; END IF;
  points:=private.quintzee_v2_category_score(c,b->'dice');
  IF (points=0) IS DISTINCT FROM (action='score_zero') THEN RAISE EXCEPTION 'quintzee:zero_confirmation_required';END IF;
  b:=jsonb_set(b,ARRAY['scores',c],to_jsonb(points));
  IF (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN RETURN private.quintzee_v2_finish(b,'all_categories',at_ms); END IF;
  -- A scored category starts another hand, not another player or another clock.
  b:=private.quintzee_v2_roll(b||'{"rollsRemaining":3,"dice":[],"held":[]}'::jsonb,NULL);
 ELSE RAISE EXCEPTION 'quintzee:action'; END IF;

 RETURN b;
END $$;

-- Shared scheduling policy follows Boxdrop's complete-round rotation. Solo passes one UUID.
CREATE OR REPLACE FUNCTION private.quintzee_v2_start(players uuid[],r jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 IF cardinality(players) NOT BETWEEN 1 AND 4 OR cardinality(players) IS NULL OR array_position(players,NULL) IS NOT NULL
 OR (SELECT count(DISTINCT p) FROM unnest(players) p)<>cardinality(players) THEN RAISE EXCEPTION 'quintzee:players'; END IF;
 SELECT jsonb_object_agg(p::text,0) INTO totals FROM unnest(players) p;
 RETURN jsonb_build_object('rules',r,'players',to_jsonb(players),'scores',totals,'round',1,'turnIndex',0,'qualified','[]'::jsonb,
 'results','[]'::jsonb,'finished',false,'board',private.quintzee_v2_board_start(r,at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
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
  RETURN s||jsonb_build_object('round',round_i,'turnIndex',idx,'board',private.quintzee_v2_board_start(s->'rules',(b->>'deadline')::bigint,(s->'scores'->>actor)::bigint));
 END IF;
 b:=private.quintzee_v2_board_reduce(b,action,items,at_ms);
 s:=s||jsonb_build_object('board',b);
 IF b->>'phase'='stage_complete' THEN
  s:=jsonb_set(s,ARRAY['scores',actor],b->'score')||jsonb_build_object('results',(s->'results')||jsonb_build_array(b->'result'||jsonb_build_object('playerId',actor,'round',round_i)));
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v2_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE i integer;
BEGIN
 FOR i IN 1..48 LOOP
  EXIT WHEN s#>>'{board,phase}'='ready' OR (s->>'finished')::boolean OR (s#>>'{board,deadline}')::bigint>at_ms;
  s:=private.quintzee_v2_reduce(s,'tick',NULL,(s#>>'{board,deadline}')::bigint);
 END LOOP;
 RETURN s;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'quintzee_v2_%'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;

-- LOCAL qualification only. Shared dispatch preserves frozen v1 in-progress runs.
CREATE OR REPLACE FUNCTION private.quintzee_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$ BEGIN
 IF b#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_board_reduce(b,action,items,at_ms);END IF;
 RETURN private.quintzee_v1_board_reduce(b,action,items,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_start_core(players uuid[],r jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF r->>'version'='quintzee/2' THEN RETURN private.quintzee_v2_start(players,r,at_ms);END IF;RETURN private.quintzee_v1_start(players,r,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_reduce_core(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$ BEGIN
 IF s#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_reduce(s,action,items,at_ms);END IF;RETURN private.quintzee_v1_reduce(s,action,items,at_ms);END $$;
CREATE OR REPLACE FUNCTION private.quintzee_board_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF s#>>'{rules,version}'='quintzee/2' THEN RETURN private.quintzee_v2_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0));END IF;RETURN private.quintzee_v1_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0));END $$;
DO $patch$ DECLARE f record;s text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname IN('quintzee_deal','quintzee_match_reduce','arcade_quintzee_advance')) OR (n.nspname='public' AND p.proname IN('arcade_quintzee_step','quintzee_action','quintzee_configure')) LOOP
 s:=pg_get_functiondef(f.oid);s:=replace(s,'private.quintzee_v1_start(','private.quintzee_start_core(');s:=replace(s,'private.quintzee_v1_reduce(','private.quintzee_reduce_core(');s:=replace(s,'private.quintzee_v1_board_reduce(','private.quintzee_board_reduce(');
 s:=replace(s,'private.quintzee_v1_rules()','private.quintzee_v2_rules()');
 s:=replace(s,'NOT IN (''roll'',''score'')','NOT IN (''start'',''roll'',''score'',''score_zero'')');s:=replace(s,'NOT IN(''roll'',''score'',''abandon'')','NOT IN(''start'',''roll'',''score'',''score_zero'',''abandon'')');
 IF s LIKE '%FUNCTION private.arcade_quintzee_advance(%' THEN
 s:=replace(s,'IF s#>>''{board,phase}''=''stage_complete'' THEN','IF s#>>''{board,phase}''=''ready'' THEN RETURN s||jsonb_build_object(''status'',''expired'');END IF; IF s#>>''{board,phase}''=''stage_complete'' THEN');END IF;
 EXECUTE s;
 END LOOP;
END $patch$;
-- Cosmetic choice is frozen by the existing atomic, replay-safe admission owner.
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
 s:=replace(s,'coalesce((SELECT quintzee_theme FROM public.game_defaults WHERE game_type=''quintzee''),''classic'')','coalesce(nullif(current_setting(''app.quintzee_theme'',true),''''),''modern'')');EXECUTE s;END $patch$;
CREATE OR REPLACE FUNCTION public.arcade_quintzee_start(p_actor uuid,p_request uuid,p_theme text DEFAULT 'modern') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE v jsonb;old text:=current_setting('app.quintzee_theme',true);BEGIN
 IF p_theme NOT IN('classic','modern') OR p_theme IS NULL THEN RAISE EXCEPTION 'quintzee:theme';END IF;
 PERFORM set_config('app.quintzee_theme',p_theme,true);v:=public.arcade_start(p_actor,p_request,'quintzee');PERFORM set_config('app.quintzee_theme',coalesce(old,''),true);RETURN v;END $$;
REVOKE ALL ON FUNCTION public.arcade_quintzee_start(uuid,uuid,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.arcade_quintzee_start(uuid,uuid,text) TO service_role;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('quintzee/2','quintzee',private.quintzee_v2_rules(),false);
-- Bots use only visible dice; choosing an intentional zero is explicit.
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.quintzee_bot_choice(jsonb,bigint)'::regprocedure);
 s:=replace(s,'BEGIN','BEGIN IF b->>''phase''=''ready'' AND at_ms<=(b->>''deadline'')::bigint THEN RETURN jsonb_build_object(''action'',''start'',''items'',''[]''::jsonb);END IF;');
 s:=replace(s,chr(13),'');s:=replace(s,'RETURN NULL;'||chr(10)||'END', 'IF b#>>''{rules,version}''=''quintzee/2'' THEN SELECT c INTO category FROM unnest(private.quintzee_v2_categories()) c WHERE NOT (b->''scores'') ? c LIMIT 1;RETURN jsonb_build_object(''action'',''score_zero'',''items'',jsonb_build_array(array_position(private.quintzee_v2_categories(),category)-1));END IF;RETURN NULL;'||chr(10)||'END');EXECUTE s;
 s:=pg_get_functiondef('private.quintzee_schedule_bot()'::regprocedure);s:=replace(s,'''intro'',''playing''','''intro'',''ready'',''playing''');EXECUTE s;
END $patch$;
-- Admitted fake-money matches finish through legal autoplay, including all-away.
CREATE OR REPLACE FUNCTION private.quintzee_ready_timeout(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.quintzee_matches;g public.games;p uuid;due bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_id;SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.real_money IS DISTINCT FROM false OR g.is_paused OR m.state->>'phase'<>'ready' THEN RETURN;END IF;
 p:=(m.state->'players'->(m.state->>'turnIndex')::int->>'id')::uuid;due:=(m.state->>'deadline')::bigint;IF due>at_ms THEN RETURN;END IF;
 UPDATE public.players SET auto_fold=true,sit_out_next_hand=true WHERE id=p AND NOT is_bot;
 UPDATE private.quintzee_matches SET state=private.quintzee_match_reduce(state,'start','{}',due),revision=revision+1 WHERE dealer_game_id=p_id;
END $$;
DO $patch$ DECLARE s text;BEGIN
 s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);
 s:=replace(s,'IF (m.state->>''deadline'')::bigint<=at_ms THEN','IF m.state->>''phase''=''ready'' AND (m.state->>''deadline'')::bigint<=at_ms THEN PERFORM private.quintzee_ready_timeout(m.dealer_game_id);count_i:=count_i+1;CONTINUE;END IF; IF (m.state->>''deadline'')::bigint<=at_ms THEN');EXECUTE s;
END $patch$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND (p.proname LIKE 'quintzee_v2_%' OR p.proname IN('quintzee_board_reduce','quintzee_start_core','quintzee_reduce_core','quintzee_ready_timeout')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;

CREATE OR REPLACE FUNCTION private.quintzee_control_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.auto_fold IS DISTINCT FROM OLD.auto_fold OR NEW.sit_out_next_hand IS DISTINCT FROM OLD.sit_out_next_hand THEN
  UPDATE private.quintzee_matches m SET revision=revision+1
  FROM public.games g WHERE g.id=NEW.game_id AND g.game_type='quintzee'
   AND g.current_game_uuid=m.dealer_game_id AND m.game_id=g.id AND NOT m.finished AND m.settlement IS NULL
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=NEW.id::text);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS quintzee_control_changed ON public.players;
CREATE TRIGGER quintzee_control_changed AFTER UPDATE OF auto_fold,sit_out_next_hand ON public.players
 FOR EACH ROW EXECUTE FUNCTION private.quintzee_control_changed();


CREATE OR REPLACE FUNCTION public.quintzee_reclaim(p_dealer_game_id uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.quintzee_matches; g public.games; p public.players; prior text;
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND NOT is_bot AND status NOT IN ('left','observer') FOR UPDATE;
 IF NOT FOUND OR NOT private.quintzee_actor_allowed(auth.uid()) OR NOT EXISTS
 (SELECT 1 FROM jsonb_array_elements(m.state->'players') x WHERE x->>'id'=p.id::text) THEN RAISE EXCEPTION 'quintzee:participant_required' USING ERRCODE='42501'; END IF;
 IF g.game_type<>'quintzee' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id
 OR g.status<>'in_progress' OR m.finished OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'quintzee:inactive'; END IF;
 IF NOT coalesce(p.auto_fold,false) AND NOT coalesce(p.sit_out_next_hand,false) THEN RETURN public.quintzee_snapshot(m.dealer_game_id); END IF;
 IF p_revision IS DISTINCT FROM m.revision THEN RAISE EXCEPTION 'quintzee:stale_revision'; END IF;
 -- Canonical control permission permits clearing intent while paused. No
 -- gameplay mutation, resume, scoring-clock shift or extra action is performed.
 prior:=coalesce(current_setting('app.session_pause_write',true),'');
 PERFORM set_config('app.session_pause_write','on',true);
 UPDATE public.players SET auto_fold=false,sit_out_next_hand=false,auto_play_stop_round_id=NULL WHERE id=p.id;
 PERFORM set_config('app.session_pause_write',prior,true);
 RETURN public.quintzee_snapshot(m.dealer_game_id);
END $$;
REVOKE ALL ON FUNCTION public.quintzee_reclaim(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quintzee_reclaim(uuid,bigint) TO authenticated;


DO $patch$ DECLARE s text;BEGIN
s:=pg_get_functiondef('public.quintzee_snapshot(uuid)'::regprocedure);
s:=replace(s,'private.quintzee_visible(m.state)||jsonb_build_object', $replace$(private.quintzee_visible(m.state)||jsonb_build_object('autoplay',EXISTS(SELECT 1 FROM public.players WHERE id=viewer AND auto_fold)))||jsonb_build_object$replace$);EXECUTE s;
s:=pg_get_functiondef('public.quintzee_action(uuid,uuid,bigint,text,integer[])'::regprocedure);
s:=replace(s,'m.state:=private.quintzee_match_reduce(m.state,p_action,p_items,at_ms);', $replace$IF m.state#>>'{rules,version}'='quintzee/2' AND EXISTS(SELECT 1 FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'quintzee:reclaim_required';END IF;
 IF m.state->>'phase'='ready' AND (m.state->>'deadline')::bigint<=at_ms THEN PERFORM private.quintzee_ready_timeout(m.dealer_game_id);RETURN public.quintzee_snapshot(m.dealer_game_id);END IF;
 m.state:=private.quintzee_match_reduce(m.state,p_action,p_items,at_ms);$replace$);EXECUTE s;
s:=pg_get_functiondef('private.quintzee_schedule_bot()'::regprocedure);
s:=replace(s,'OR NOT coalesce((NEW.state', $replacement$OR NOT (EXISTS(SELECT 1 FROM public.players WHERE id=(NEW.state->'players'->(NEW.state->>'turnIndex')::int->>'id')::uuid AND auto_fold AND NEW.state#>>'{rules,version}'='quintzee/2') OR coalesce((NEW.state$replacement$);
s:=replace(s,'''isBot'')::boolean,false) THEN','''isBot'')::boolean,false)) THEN');EXECUTE s;
s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);
s:=replace(s,'OR NOT coalesce((m.state->''players''->(m.state->>''turnIndex'')::integer->>''isBot'')::boolean,false)','');s:=replace(s,'AND is_bot) THEN','AND (is_bot OR auto_fold)) THEN');EXECUTE s;
END $patch$;

DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.quintzee_recover()'::regprocedure);s:=replace(s,'EXIT WHEN m.state->>''phase''=''complete'' OR','EXIT WHEN m.state->>''phase'' IN(''complete'',''ready'') OR');EXECUTE s;END $patch$;

REVOKE ALL ON FUNCTION private.quintzee_control_changed() FROM PUBLIC,anon,authenticated,service_role;

-- Read-only presentation totals from the exact frozen scorer; no new awards or state writes.
CREATE OR REPLACE FUNCTION private.quintzee_present_board(b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE r jsonb; BEGIN
 IF b->>'phase'='stage_complete' THEN r:=b->'result';
 ELSIF b#>>'{rules,version}'='quintzee/2' THEN r:=private.quintzee_v2_finish(b||'{"phase":"playing"}'::jsonb,'timeout',(b->>'deadline')::bigint)->'result';
 ELSE r:=private.quintzee_v1_finish(b||'{"phase":"playing"}'::jsonb,'timeout',(b->>'deadline')::bigint)->'result';END IF;
 RETURN b||jsonb_build_object('baseScore',r->'rawSubtotal','upperBonusAwarded',r->'upperBonus');
END $$;
REVOKE ALL ON FUNCTION private.quintzee_present_board(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.quintzee_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_set(s,'{core,board}',private.quintzee_present_board(s#>'{core,board}'))
$$;
DO $patch$ DECLARE s text;BEGIN s:=pg_get_functiondef('private.arcade_quintzee_projection(private.arcade_runs,bigint)'::regprocedure);
 IF position('private.quintzee_present_board' IN s)=0 THEN
 IF position('v:=b;' IN s)=0 THEN RAISE EXCEPTION 'quintzee:projection_drift';END IF;
 EXECUTE replace(s,'v:=b;','v:=private.quintzee_present_board(b);');END IF;END $patch$;

-- LOCAL candidate. v1 definitions remain unchanged; scoring formulas are identical.
-- Frozen production quintzee/3. Future rule versions add new functions.
-- quintzee/3: shared SQL authority for both modes. No admission or financial writes.
-- Reuses Yahtzee's pure category calculation with an EMPTY scorecard: no joker path.
CREATE OR REPLACE FUNCTION private.quintzee_v3_rules(duration_ms integer DEFAULT 180000, clear_bonus integer DEFAULT 35)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF duration_ms IS NULL OR duration_ms<=0 OR clear_bonus IS NULL OR clear_bonus<0 THEN RAISE EXCEPTION 'quintzee:config'; END IF;
 RETURN jsonb_build_object('version','quintzee/3','durationMs',duration_ms,'clearBonus',clear_bonus,
  'upperThreshold',63,'upperBonus',35,'bonusThreshold',80000,'rounds',2,'maxRounds',3,
  'upperCelebrationMs',1500,'baseCountMs',600,'readyMs',30000,'introMs',2500,'resultMs',9000,'speedMin',100,'speedRange',200);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_categories() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT ARRAY['ones','twos','threes','fours','fives','sixes',
 'three_of_a_kind','four_of_a_kind','yahtzee','full_house','large_straight','chance']::text[] $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_validate_rules(r jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF r IS DISTINCT FROM private.quintzee_v3_rules((r->>'durationMs')::integer,(r->>'clearBonus')::integer)
 THEN RAISE EXCEPTION 'quintzee:rules_version'; END IF;
END $$;

-- Frozen independent Quintzee v1 scorer. No wildcard/joker substitution.
CREATE OR REPLACE FUNCTION private.quintzee_v3_category_score(category text,dice jsonb) RETURNS integer
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
REVOKE ALL ON FUNCTION private.quintzee_v3_category_score(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.quintzee_v3_potentials(b jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c text; result jsonb:='{}'; points integer;
BEGIN
 IF jsonb_array_length(b->'dice')<>5 THEN RETURN result; END IF;
 FOREACH c IN ARRAY private.quintzee_v3_categories() LOOP
  IF NOT (b->'scores') ? c THEN
   points:=private.quintzee_v3_category_score(c,b->'dice');
   IF points>0 THEN result:=result||jsonb_build_object(c,points); END IF;
  END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_speed(remaining_ms bigint,duration_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT 100+(200*greatest(0,least(duration_ms,remaining_ms))/duration_ms)::integer
$$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_die() RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE n integer;
BEGIN
 -- Rejection sampling: 252 is divisible by six; never use biased byte % 6.
 LOOP n:=get_byte(extensions.gen_random_bytes(1),0); EXIT WHEN n<252; END LOOP;
 RETURN 1+n%6;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_board_start(r jsonb,at_ms bigint,score_before bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 PERFORM private.quintzee_v3_validate_rules(r);
 RETURN jsonb_build_object('rules',r,'phase','ready','deadline',at_ms+(r->>'readyMs')::bigint,
 'dice','[]'::jsonb,'held','[]'::jsonb,'rollsRemaining',3,'rollSerial',0,'scores','{}'::jsonb,
 'scoreBefore',score_before,'score',score_before,'result',NULL,'potentials','{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_roll(b jsonb,held integer[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE dice jsonb:='[]'; i integer; kept integer[]:=coalesce(held,ARRAY[]::integer[]);
BEGIN
 IF (b->>'rollsRemaining')::integer<=0 OR cardinality(kept)>5 OR EXISTS(SELECT 1 FROM unnest(kept) x WHERE x IS NULL OR x NOT BETWEEN 0 AND 4)
 OR (SELECT count(DISTINCT x) FROM unnest(kept) x)<>cardinality(kept)
 OR jsonb_array_length(b->'dice')<>5 AND cardinality(kept)>0 THEN RAISE EXCEPTION 'quintzee:roll'; END IF;
 FOR i IN 0..4 LOOP
  dice:=dice||jsonb_build_array(CASE WHEN i=ANY(kept) THEN (b->'dice'->>i)::integer ELSE private.quintzee_v3_die() END);
 END LOOP;
 b:=b||jsonb_build_object('dice',dice,'held',to_jsonb(kept),'rollsRemaining',(b->>'rollsRemaining')::integer-1,'rollSerial',(b->>'rollSerial')::integer+1);
 RETURN b||jsonb_build_object('potentials',private.quintzee_v3_potentials(b));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE upper_i bigint; raw_i bigint; upper_bonus integer; clear_i integer; multiplier integer; points bigint; remaining bigint;
BEGIN
 IF b->>'phase'<>'playing' OR reason NOT IN('all_categories','timeout','no_matches') THEN RAISE EXCEPTION 'quintzee:finish'; END IF;
 SELECT coalesce(sum(value::bigint),0),coalesce(sum(value::bigint) FILTER(WHERE key=ANY((private.quintzee_v3_categories())[1:6])),0)
 INTO raw_i,upper_i FROM jsonb_each_text(b->'scores');
 upper_bonus:=CASE WHEN upper_i>=63 THEN 35 ELSE 0 END;
 clear_i:=CASE WHEN (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN (b#>>'{rules,clearBonus}')::integer ELSE 0 END;
 remaining:=CASE WHEN reason='timeout' THEN 0 ELSE greatest(0,(b->>'deadline')::bigint-at_ms) END;
 multiplier:=private.quintzee_v3_speed(remaining,(b#>>'{rules,durationMs}')::bigint);
 points:=(raw_i+upper_bonus+clear_i)*multiplier;
 RETURN b||jsonb_build_object('phase','stage_complete','deadline',at_ms+(b#>>'{rules,resultMs}')::bigint,
 'score',(b->>'scoreBefore')::bigint+points,'potentials','{}'::jsonb,
 'result',jsonb_build_object('reason',reason,'categories',b->'scores','upperSubtotal',upper_i,'categorySubtotal',raw_i,
 'upperBonus',upper_bonus,'clearBonus',clear_i,'rawSubtotal',raw_i+upper_bonus+clear_i,'multiplier',multiplier,
 'remainingMs',remaining,'stageScore',points,'scoreBefore',b->'scoreBefore','score',(b->>'scoreBefore')::bigint+points,'completedAt',at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE c text; points integer; due bigint; before_score jsonb; after_score jsonb; celebration_ms bigint; event jsonb;
BEGIN
 PERFORM private.quintzee_v3_validate_rules(b->'rules');
 IF b->>'phase'='ready' THEN
  due:=(b->>'deadline')::bigint;
  IF action='tick' THEN RETURN b;END IF;
  IF action<>'start' OR cardinality(coalesce(items,ARRAY[]::integer[]))<>0 OR at_ms>due THEN RAISE EXCEPTION 'quintzee:start_expired';END IF;
  RETURN private.quintzee_v3_roll(b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,durationMs}')::bigint),NULL);
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'quintzee:phase'; END IF;
 IF at_ms<coalesce((b#>>'{celebration,endsAt}')::bigint,0) THEN
  IF action='tick' THEN RETURN b;END IF;RAISE EXCEPTION 'quintzee:celebrating';
 END IF;
 b:=b-'celebration';
 -- A crossing action never scores or draws; expiry keeps only committed categories.
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.quintzee_v3_finish(b,'timeout',(b->>'deadline')::bigint); END IF;
 IF action='tick' THEN RETURN b; END IF;
 IF action='roll' THEN b:=private.quintzee_v3_roll(b,items);
 ELSIF action IN('score','score_zero') THEN
  IF cardinality(items) IS DISTINCT FROM 1 OR items[1] IS NULL OR items[1] NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'quintzee:category'; END IF;
  c:=(private.quintzee_v3_categories())[items[1]+1];
  IF (b->'scores') ? c THEN RAISE EXCEPTION 'quintzee:already_scored'; END IF;
  points:=private.quintzee_v3_category_score(c,b->'dice');
  IF (points=0) IS DISTINCT FROM (action='score_zero') THEN RAISE EXCEPTION 'quintzee:zero_confirmation_required';END IF;
  before_score:=private.quintzee_v3_finish(b,'timeout',at_ms)->'result';
  b:=jsonb_set(b,ARRAY['scores',c],to_jsonb(points));
  after_score:=private.quintzee_v3_finish(b,'timeout',at_ms)->'result';
  IF (after_score->>'upperBonus')::int>(before_score->>'upperBonus')::int THEN
   celebration_ms:=(b#>>'{rules,upperCelebrationMs}')::bigint+(b#>>'{rules,baseCountMs}')::bigint;
   event:=jsonb_build_object('id',concat_ws(':',b->>'rollSerial',c),'startedAt',at_ms,'countAt',at_ms+(b#>>'{rules,upperCelebrationMs}')::bigint,'endsAt',at_ms+celebration_ms,'from',before_score->'rawSubtotal','to',after_score->'rawSubtotal','label','Upper Bonus +35');
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(b->'scores'))=12 THEN
   b:=private.quintzee_v3_finish(b,'all_categories',at_ms);
  ELSE b:=b||'{"rollsRemaining":3,"dice":[],"held":[],"potentials":{}}'::jsonb;END IF;
  IF event IS NOT NULL THEN b:=b||jsonb_build_object('celebration',event,'deadline',(b->>'deadline')::bigint+celebration_ms);END IF;
  RETURN b;

 ELSE RAISE EXCEPTION 'quintzee:action'; END IF;

 RETURN b;
END $$;

-- Shared scheduling policy follows Boxdrop's complete-round rotation. Solo passes one UUID.
CREATE OR REPLACE FUNCTION private.quintzee_v3_start(players uuid[],r jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 IF cardinality(players) NOT BETWEEN 1 AND 4 OR cardinality(players) IS NULL OR array_position(players,NULL) IS NOT NULL
 OR (SELECT count(DISTINCT p) FROM unnest(players) p)<>cardinality(players) THEN RAISE EXCEPTION 'quintzee:players'; END IF;
 SELECT jsonb_object_agg(p::text,0) INTO totals FROM unnest(players) p;
 RETURN jsonb_build_object('rules',r,'players',to_jsonb(players),'scores',totals,'round',1,'turnIndex',0,'qualified','[]'::jsonb,
 'results','[]'::jsonb,'finished',false,'board',private.quintzee_v3_board_start(r,at_ms));
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
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
  RETURN s||jsonb_build_object('round',round_i,'turnIndex',idx,'board',private.quintzee_v3_board_start(s->'rules',(b->>'deadline')::bigint,(s->'scores'->>actor)::bigint));
 END IF;
 b:=private.quintzee_v3_board_reduce(b,action,items,at_ms);
 s:=s||jsonb_build_object('board',b);
 IF b->>'phase'='stage_complete' THEN
  s:=jsonb_set(s,ARRAY['scores',actor],b->'score')||jsonb_build_object('results',(s->'results')||jsonb_build_array(b->'result'||jsonb_build_object('playerId',actor,'round',round_i)));
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_v3_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE i integer;
BEGIN
 FOR i IN 1..48 LOOP
  EXIT WHEN s#>>'{board,phase}'='ready' OR (s->>'finished')::boolean OR (s#>>'{board,deadline}')::bigint>at_ms;
  s:=private.quintzee_v3_reduce(s,'tick',NULL,(s#>>'{board,deadline}')::bigint);
 END LOOP;
 RETURN s;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'quintzee_v3_%'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;

-- New admissions use /3; historical /1 and /2 reducers are untouched.
DO $patch$ DECLARE f record;s text;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('quintzee_board_reduce','quintzee_start_core','quintzee_reduce_core','quintzee_board_deal') LOOP
 s:=pg_get_functiondef(f.oid);
 IF f.proname='quintzee_board_reduce' THEN s:=replace(s,'BEGIN','BEGIN IF b#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_board_reduce(b,action,items,at_ms);END IF;');
 ELSIF f.proname='quintzee_start_core' THEN s:=replace(s,'BEGIN','BEGIN IF r->>''version''=''quintzee/3'' THEN RETURN private.quintzee_v3_start(players,r,at_ms);END IF;');
 ELSIF f.proname='quintzee_reduce_core' THEN s:=replace(s,'BEGIN','BEGIN IF s#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_reduce(s,action,items,at_ms);END IF;');
 ELSE s:=replace(s,'BEGIN','BEGIN IF s#>>''{rules,version}''=''quintzee/3'' THEN RETURN private.quintzee_v3_board_start((s->''rules'')-''theme'',at_ms,coalesce((s->>''score'')::bigint,0));END IF;');END IF;EXECUTE s;
 END LOOP;
 s:=pg_get_functiondef('public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure);EXECUTE replace(s,'private.quintzee_v2_rules()','private.quintzee_v3_rules()');
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname IN('quintzee_bot_choice','quintzee_schedule_bot')) OR (n.nspname='public' AND p.proname='quintzee_action') LOOP
 s:=pg_get_functiondef(f.oid);s:=replace(s,'=''quintzee/2''','IN(''quintzee/2'',''quintzee/3'')');
 IF s LIKE '%FUNCTION private.quintzee_bot_choice(%' THEN s:=replace(s,'BEGIN','BEGIN IF at_ms<coalesce((b#>>''{celebration,endsAt}'')::bigint,0) THEN RETURN NULL;END IF;');END IF;
 IF s LIKE '%FUNCTION private.quintzee_schedule_bot(%' THEN s:=replace(s,'OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state','OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state OR (NEW.state#>>''{rules,version}''=''quintzee/3'' AND OLD.bot_due_at IS NULL)');s:=replace(s,'RETURN NEW;','IF NEW.bot_due_at IS NOT NULL THEN NEW.bot_due_at:=greatest(NEW.bot_due_at,coalesce((NEW.state#>>''{core,board,celebration,endsAt}'')::bigint,0));END IF; RETURN NEW;');END IF;EXECUTE s;
 END LOOP;
 s:=pg_get_functiondef('private.quintzee_present_board(jsonb)'::regprocedure);s:=replace(s,'ELSIF b#>>''{rules,version}''=''quintzee/2'' THEN','ELSIF b#>>''{rules,version}''=''quintzee/3'' THEN r:=private.quintzee_v3_finish(b||''{"phase":"playing"}''::jsonb,''timeout'',(b->>''deadline'')::bigint)->''result''; ELSIF b#>>''{rules,version}''=''quintzee/2'' THEN');EXECUTE s;
 s:=pg_get_functiondef('private.quintzee_pause()'::regprocedure);s:=replace(s,'q:=jsonb_set(q,''{board}'',b);', 'IF (b#>>''{celebration,endsAt}'')::bigint>m.paused_at THEN b:=jsonb_set(b,''{celebration}'',(b->''celebration'')||jsonb_build_object(''startedAt'',(b#>>''{celebration,startedAt}'')::bigint+delta,''countAt'',(b#>>''{celebration,countAt}'')::bigint+delta,''endsAt'',(b#>>''{celebration,endsAt}'')::bigint+delta));END IF; q:=jsonb_set(q,''{board}'',b);');EXECUTE s;
END $patch$;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('quintzee/3','quintzee',private.quintzee_v3_rules(),false);

UPDATE private.quintzee_release SET admission_enabled=false WHERE singleton;
