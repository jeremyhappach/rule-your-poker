DO $guard$ DECLARE f record;BEGIN FOR f IN SELECT * FROM (VALUES ('private.advance_ante_phase_exact(uuid,uuid,timestamp with time zone,timestamp with time zone)','ed70e8608f4a04b72cab66d55dcd9970'),('private.megatouch_begin(uuid,uuid)','26754906038b83e7ca739196957376d0'),('private.megatouch_frozen_stake()','4d6058383dd6903cf7c4f604f5088ac2'),('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)','0560d2e5ed3caddb9e5470ad7da4c7b9'),('public.arcade_start(uuid,uuid,text)','0ea070393b53931c792d22d672d2a66d')) expected(signature,hash) LOOP IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'quintzee:shared_authority_changed:%',f.signature;END IF;END LOOP;IF to_regclass('private.quintzee_release') IS NOT NULL THEN RAISE EXCEPTION 'quintzee:already_installed';END IF;END $guard$;
-- Presentation defaults are frozen at admission; gameplay stays quintzee/1.
ALTER TABLE public.game_defaults ADD COLUMN quintzee_theme text NOT NULL DEFAULT 'classic' CHECK(quintzee_theme IN ('classic','modern'));
INSERT INTO public.game_defaults(game_type,ante_amount,presentation_mode) VALUES('quintzee',1,'fullscreen') ON CONFLICT(game_type) DO NOTHING;

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

-- Canonical adapter shape only. All game decisions use the shared quintzee/1 core.
CREATE OR REPLACE FUNCTION private.quintzee_required_rounds(score bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN score>=80000 THEN 3 ELSE 2 END $$;

CREATE OR REPLACE FUNCTION private.quintzee_board_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.quintzee_v1_board_start((s->'rules')-'theme',at_ms,coalesce((s->>'score')::bigint,0))
$$;

CREATE OR REPLACE FUNCTION private.quintzee_match_projection(s jsonb,q jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT s||jsonb_build_object('core',q,'phase',CASE WHEN (q->>'finished')::boolean THEN 'complete' ELSE q#>>'{board,phase}' END,
  'deadline',q#>'{board,deadline}','startedAt',q#>'{board,startedAt}','turnIndex',q->'turnIndex','stage',q->'round',
  'scores',q->'scores','score',q#>'{board,score}','qualified',q->'qualified',
  'stages',coalesce((SELECT jsonb_agg(r||jsonb_build_object('stage',r->'round','id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',r->>'playerId',r->>'round'))) FROM jsonb_array_elements(q->'results') r),'[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION private.quintzee_deal(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ids uuid[]; q jsonb;
BEGIN
 SELECT array_agg((p->>'id')::uuid ORDER BY n) INTO ids FROM jsonb_array_elements(s->'players') WITH ORDINALITY t(p,n);
 q:=private.quintzee_v1_start(ids,s->'rules',at_ms);
 RETURN private.quintzee_match_projection(s,q);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_match_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE q jsonb;
BEGIN
 q:=private.quintzee_v1_reduce(s->'core',action,items,at_ms);
 RETURN private.quintzee_match_projection(s,q);
END $$;

CREATE OR REPLACE FUNCTION private.quintzee_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT s $$;

CREATE OR REPLACE FUNCTION private.quintzee_high_score(actor uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(score),0) FROM (
 SELECT score FROM private.arcade_results WHERE user_id=actor AND game='quintzee' AND ruleset='quintzee/1'
 UNION ALL SELECT score FROM private.multiplayer_score_results WHERE user_id=actor AND game='quintzee' AND ruleset='quintzee/1'
 ) scores
$$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname LIKE 'quintzee_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;

-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.quintzee_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.quintzee_release DEFAULT VALUES;
ALTER TABLE private.quintzee_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.quintzee_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.quintzee_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint, bot_due_at bigint,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX quintzee_matches_session ON private.quintzee_matches(game_id);
CREATE INDEX quintzee_matches_pending ON private.quintzee_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.quintzee_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.quintzee_matches(dealer_game_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.quintzee_history (
 dealer_game_id uuid NOT NULL REFERENCES private.quintzee_matches(dealer_game_id) ON DELETE CASCADE,
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.quintzee_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quintzee_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quintzee_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.quintzee_matches,private.quintzee_requests,private.quintzee_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.quintzee_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.quintzee_matches(dealer_game_id) ON DELETE CASCADE,
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.quintzee_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quintzee_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.quintzee_revisions TO authenticated;
CREATE POLICY quintzee_member_read ON public.quintzee_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=quintzee_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE OR REPLACE FUNCTION private.quintzee_actor_allowed(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND enabled)
$function$
;
CREATE OR REPLACE FUNCTION public.quintzee_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.quintzee_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money=false)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.quintzee_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',true);
END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.quintzee_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.quintzee_history VALUES(NEW.dealer_game_id,NEW.revision,private.quintzee_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.quintzee_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.quintzee_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.quintzee_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'quintzee:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='quintzee_terminal';
 RETURN private.quintzee_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.quintzee_history(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.quintzee_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.quintzee_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_record_scores(p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.quintzee_matches;member jsonb;peers jsonb;facts jsonb;answer jsonb:='{}';at_time timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer;
 IF m.state->>'phase'<>'complete' THEN RETURN answer;END IF;
 -- Completion must contain each player's own complete, compatible performance.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE
  (SELECT array_agg((r->>'stage')::int ORDER BY (r->>'stage')::int) FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id') IS DISTINCT FROM
   CASE WHEN private.quintzee_required_rounds((SELECT (r->>'score')::bigint FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id' AND r->>'stage'='2'))=3 THEN ARRAY[1,2,3] ELSE ARRAY[1,2] END OR
  (SELECT (r->>'score')::bigint FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id' ORDER BY (r->>'stage')::int DESC LIMIT 1) IS DISTINCT FROM (m.state->'scores'->>(p->>'id'))::bigint) THEN RETURN answer;END IF;
 SELECT jsonb_agg(jsonb_build_object('score',value::bigint)) INTO peers FROM jsonb_each_text(m.state->'scores') score WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=score.key AND NOT coalesce((p->>'isBot')::boolean,false));
 FOR member IN SELECT value FROM jsonb_array_elements(m.state->'players') WHERE NOT coalesce((value->>'isBot')::boolean,false) AND EXISTS(SELECT 1 FROM auth.users WHERE id=(value->>'userId')::uuid) LOOP
  SELECT record INTO facts FROM private.multiplayer_score_results WHERE dealer_game_id=p_dealer AND player_id=(member->>'id')::uuid;
  IF NOT FOUND THEN
   facts:=private.score_record('quintzee',m.state#>>'{rules,version}',(member->>'userId')::uuid,(m.state->'scores'->>(member->>'id'))::bigint,p_dealer,peers);
   INSERT INTO private.multiplayer_score_results(session_id,dealer_game_id,player_id,user_id,game,ruleset,score,completed_at,record)
   VALUES(m.game_id,p_dealer,(member->>'id')::uuid,(member->>'userId')::uuid,'quintzee',m.state#>>'{rules,version}',(m.state->'scores'->>(member->>'id'))::bigint,at_time,facts);
  END IF;
  answer:=answer||jsonb_build_object(member->>'id',facts);
 END LOOP;
 RETURN answer;
END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.quintzee_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'quintzee' OR g.real_money IS DISTINCT FROM false OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'quintzee:not_terminal'; END IF;
 SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));
 win_count:=cardinality(winners);total:=(jsonb_array_length(m.state->'players')-win_count)*m.stake;
 deltas:=private.split_whole_chips_clockwise(m.game_id,winners,total,g.dealer_position);
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;
  IF NOT loser=ANY(winners) THEN changes:=changes||jsonb_build_object(loser::text,-m.stake); END IF;
 END LOOP;
 changes:=changes||deltas;
 -- Existing signed session chip accounting and transfer journal; no alternate ledger.
 -- Allocate each loser's stake across winners according to the canonical split.
 FOR player IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  loser:=(player->>'id')::uuid;IF loser=ANY(winners) THEN CONTINUE; END IF;allocated:=m.stake;
  FOREACH winner IN ARRAY winners LOOP
   amount:=least(allocated,(deltas->>winner::text)::integer);
   IF amount>0 THEN transfers:=transfers||jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',loser),'to',jsonb_build_object('kind','player','playerId',winner),'amount',amount));
    deltas:=jsonb_set(deltas,ARRAY[winner::text],to_jsonb((deltas->>winner::text)::integer-amount));allocated:=allocated-amount;END IF;
  END LOOP;
  IF allocated<>0 THEN RAISE EXCEPTION 'quintzee:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'quintzee_terminal','quintzee',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Quintzee: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.quintzee_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements',private.quintzee_record_scores(m.dealer_game_id))) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Quintzee complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.quintzee_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_items integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.quintzee_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.quintzee_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.quintzee_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'quintzee:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('roll','score') THEN RAISE EXCEPTION 'quintzee:invalid_command'; END IF;
 SELECT * INTO prior FROM private.quintzee_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'quintzee:replay_conflict'; END IF;
  RETURN public.quintzee_snapshot(p_dealer_game_id);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'quintzee' OR g.real_money IS DISTINCT FROM false OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'quintzee:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'quintzee:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'quintzee:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.quintzee_match_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.quintzee_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.quintzee_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.quintzee_settle(m.dealer_game_id); END IF;
 RETURN public.quintzee_snapshot(m.dealer_game_id);
END $function$
;
CREATE OR REPLACE FUNCTION public.quintzee_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; theme_i text; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.quintzee_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'quintzee' THEN RAISE EXCEPTION 'quintzee:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'quintzee:fake_money_only' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'quintzee:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'quintzee:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'quintzee:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'quintzee:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 theme_i:=coalesce(p_config->>'theme',(SELECT quintzee_theme FROM public.game_defaults WHERE game_type='quintzee'),'classic');
 IF theme_i NOT IN ('classic','modern') THEN RAISE EXCEPTION 'quintzee:theme';END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'quintzee:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'quintzee:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.quintzee_actor_allowed(user_id)) THEN RAISE EXCEPTION 'quintzee:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'quintzee:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4 THEN RAISE EXCEPTION 'quintzee:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'quintzee:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'quintzee',jsonb_build_object('ante_amount',stake_i,'rules',private.quintzee_v1_rules(),'theme',theme_i)) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='quintzee',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.quintzee_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'quintzee:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'quintzee' OR g.real_money IS DISTINCT FROM false OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'quintzee:close_identity';END IF;
 IF g.status<>'session_ended' THEN
  PERFORM 1 FROM public.players WHERE game_id=m.game_id ORDER BY id FOR UPDATE;
  UPDATE public.players SET status=CASE WHEN stand_up_next_hand THEN 'left' ELSE status END,
   sitting_out=CASE WHEN stand_up_next_hand OR sit_out_next_hand THEN true WHEN waiting THEN false ELSE sitting_out END,
   waiting=false,stand_up_next_hand=false,sit_out_next_hand=false,auto_fold=false,auto_play_stop_round_id=NULL,
   current_decision=NULL,decision_locked=false,pre_fold=false,pre_stay=false,ante_decision=NULL,auto_ante=false,auto_ante_runback=false WHERE game_id=m.game_id;
  IF g.pending_session_end THEN target:='session_ended';
  ELSIF (SELECT count(*) FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL)<2 THEN
   PERFORM private.resolve_postgame_participation(m.game_id,clock_timestamp());SELECT status INTO target FROM public.games WHERE id=m.game_id;
  ELSE
   SELECT array_agg(position ORDER BY position DESC) INTO positions FROM public.players WHERE game_id=m.game_id AND status NOT IN ('left','observer') AND NOT sitting_out AND position IS NOT NULL AND NOT is_bot;
   SELECT coalesce((value->>'enabled')::boolean,false) INTO make_take FROM public.system_settings WHERE key='make_it_take_it';
   IF coalesce(make_take,false) THEN
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='quintzee_terminal';
    SELECT position INTO next_seat FROM public.players WHERE id=winner AND game_id=m.game_id AND NOT is_bot AND NOT sitting_out AND status NOT IN ('left','observer') AND position IS NOT NULL;
    IF next_seat IS NULL THEN IF cardinality(positions)=1 THEN next_seat:=positions[1];ELSE target:='dealer_selection';END IF;END IF;
   END IF;
   IF target IS NULL THEN
    IF next_seat IS NULL THEN SELECT max(p) INTO next_seat FROM unnest(positions) p WHERE p<g.dealer_position;next_seat:=coalesce(next_seat,positions[1]);END IF;
    target:=CASE WHEN next_seat IS NULL THEN 'dealer_selection' ELSE 'game_selection' END;
   END IF;
  END IF;
  UPDATE public.games SET status=target,game_type=CASE WHEN target='session_ended' THEN game_type END,
   current_game_uuid=NULL,config_complete=false,current_round=NULL,total_hands=0,all_decisions_in=false,all_decisions_in_round_id=NULL,
   last_round_result=NULL,awaiting_next_round=false,next_round_number=NULL,game_over_at=NULL,pot=0,
   ante_decision_deadline=NULL,buck_position=NULL,is_first_hand=false,dealer_selection_state=NULL,
   dealer_position=coalesce(next_seat,dealer_position),config_deadline=CASE WHEN target='game_selection' THEN clock_timestamp()+make_interval(secs=>greatest(1,game_setup_timer_seconds)) END,
   pending_session_end=CASE WHEN target='session_ended' THEN false ELSE pending_session_end END,
   session_ended_at=CASE WHEN target='session_ended' THEN coalesce(session_ended_at,clock_timestamp()) ELSE session_ended_at END WHERE id=m.game_id;
 END IF;
 UPDATE private.quintzee_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.quintzee_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.quintzee_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.quintzee_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'quintzee:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.quintzee_finish_postgame(p_dealer_game_id);END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); m private.quintzee_matches; q jsonb; b jsonb; delta bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'quintzee' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN
  UPDATE private.quintzee_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE
  SELECT * INTO m FROM private.quintzee_matches WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL FOR UPDATE;
  IF FOUND THEN
   delta:=at_ms-m.paused_at; q:=m.state->'core';b:=q->'board';
   b:=b||jsonb_build_object('deadline',(b->>'deadline')::bigint+delta);
   IF b ? 'startedAt' THEN b:=b||jsonb_build_object('startedAt',(b->>'startedAt')::bigint+delta);END IF;
   q:=jsonb_set(q,'{board}',b);
   UPDATE private.quintzee_matches SET state=private.quintzee_match_projection(m.state,q),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'quintzee_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.quintzee_capabilities(uuid),public.quintzee_snapshot(uuid),public.quintzee_history(uuid),public.quintzee_action(uuid,uuid,bigint,text,integer[]),public.quintzee_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.quintzee_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.quintzee_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.quintzee_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER quintzee_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='quintzee') EXECUTE FUNCTION private.quintzee_pause();

CREATE TRIGGER quintzee_publish AFTER INSERT OR UPDATE ON private.quintzee_matches FOR EACH ROW EXECUTE FUNCTION private.quintzee_publish();

-- Solo orchestration only. Board rules remain in the shared quintzee/1 core.
CREATE OR REPLACE FUNCTION private.arcade_quintzee_finish_round(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; round_i integer:=(s->>'round')::integer;
BEGIN
 IF s#>>'{board,phase}'<>'stage_complete' OR jsonb_array_length(s->'results')>=round_i THEN RETURN s;END IF;
 r:=s#>'{board,result}'||jsonb_build_object('id',s->>'roundId','stage',round_i);
 s:=s||jsonb_build_object('results',(s->'results')||jsonb_build_array(r),'score',s#>'{board,score}');
 IF round_i=3 OR round_i=2 AND private.quintzee_required_rounds((s->>'score')::bigint)=2 THEN s:=s||jsonb_build_object('status','completed');END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_quintzee_finish_round(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_quintzee_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE due bigint; round_i integer; i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';
  due:=(s#>>'{board,deadline}')::bigint;EXIT WHEN due>at_ms;
  IF s#>>'{board,phase}'='stage_complete' THEN
   round_i:=(s->>'round')::integer+1;
   s:=s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'board',private.quintzee_board_deal(jsonb_build_object('rules',s->'config','highScore',s#>'{board,highScore}','score',s->'score','stage',round_i),due));
  ELSE
   s:=jsonb_set(s,'{board}',private.quintzee_v1_board_reduce(s->'board','tick',NULL,due));
   s:=private.arcade_quintzee_finish_round(s);
  END IF;
 END LOOP;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_quintzee_advance(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_quintzee_valid_completion(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; previous bigint:=0; i integer:=0; n integer; required integer;
BEGIN
 n:=jsonb_array_length(s->'results');
 required:=private.quintzee_required_rounds((s#>>'{results,1,score}')::bigint);
 IF n IS DISTINCT FROM required OR (s->>'round')::integer IS DISTINCT FROM required THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(s->'results') LOOP
  i:=i+1;
  IF r->>'id' IS DISTINCT FROM (s->>'runId')||':'||i OR (r->>'stage')::integer IS DISTINCT FROM i
   OR (r->>'scoreBefore')::bigint IS DISTINCT FROM previous OR (r->>'score')::bigint IS NULL
   OR (r->>'score')::bigint<0 OR (r->>'stageScore')::bigint IS DISTINCT FROM (r->>'score')::bigint-previous THEN RETURN false;END IF;
  previous:=(r->>'score')::bigint;
 END LOOP;
 RETURN (s->>'score')::bigint=previous AND (s#>>'{board,score}')::bigint=previous AND s#>>'{board,phase}'='stage_complete';
END $$;
REVOKE ALL ON FUNCTION private.arcade_quintzee_valid_completion(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_quintzee_projection(run private.arcade_runs,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=b;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'results',s->'results','theme',coalesce(run.config->>'theme','classic'),'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',(result->>'completedAt')::bigint,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION private.arcade_quintzee_projection(private.arcade_runs,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_quintzee_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'quintzee' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('roll','score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_quintzee_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.quintzee_board_deal(jsonb_build_object('rules',run.config,'highScore',private.quintzee_high_score(run.user_id),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_quintzee_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.quintzee_v1_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_quintzee_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_quintzee_projection(run,at_ms));
END $$;
REVOKE ALL ON FUNCTION public.arcade_quintzee_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_quintzee_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('quintzee/1','quintzee',private.quintzee_v1_rules(),false) ON CONFLICT(id) DO NOTHING;

-- Bots receive the same already-visible dice/category potentials as human players.
CREATE OR REPLACE FUNCTION private.quintzee_bot_choice(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b jsonb:=s#>'{core,board}'; category text;
BEGIN
 IF b->>'phase'<>'playing' OR at_ms>=(b->>'deadline')::bigint THEN RETURN NULL;END IF;
 SELECT key INTO category FROM jsonb_each_text(b->'potentials') ORDER BY value::integer DESC,key LIMIT 1;
 IF category IS NOT NULL THEN RETURN jsonb_build_object('action','score','items',jsonb_build_array(array_position(private.quintzee_v1_categories(),category)-1));END IF;
 IF (b->>'rollsRemaining')::integer>0 THEN RETURN jsonb_build_object('action','roll','items','[]'::jsonb);END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.quintzee_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.quintzee_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('intro','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+1500;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+1500;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.quintzee_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.quintzee_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.quintzee_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.real_money=false AND live.status='in_progress' AND live.game_type='quintzee'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'quintzee' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.quintzee_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   FOR i IN 1..64 LOOP
 EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
 m.state:=private.quintzee_match_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
 END LOOP;
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.quintzee_bot_choice(private.quintzee_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.quintzee_match_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
  END IF;
  UPDATE private.quintzee_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.quintzee_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.quintzee_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.quintzee_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;
CREATE TRIGGER quintzee_bot_schedule BEFORE INSERT OR UPDATE ON private.quintzee_matches FOR EACH ROW EXECUTE FUNCTION private.quintzee_schedule_bot();
REVOKE ALL ON FUNCTION private.quintzee_schedule_bot(),private.quintzee_recover() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_start(p_actor uuid, p_request uuid, p_game text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; rules private.arcade_rulesets;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_game IS NULL OR p_game NOT IN ('quintzee','run21','tri-towers','eleven-up','royal-flash','take-two','trip-flip','boxdrop') THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 IF EXISTS(SELECT 1 FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true')
  AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_superuser) THEN RAISE EXCEPTION 'arcade:maintenance';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_game,0));
 SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=p_actor AND request_id=p_request;
 IF FOUND THEN
  IF receipt.fingerprint<>'start:'||p_game THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=receipt.run_id;
 ELSE
  SELECT * INTO run FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active';
  IF NOT FOUND THEN
   SELECT * INTO rules FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
   IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND failure IS NULL AND last_completed_at>clock_timestamp()-interval '30 seconds') THEN RAISE EXCEPTION 'arcade:recovery_unavailable';END IF;
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,p_game,rules.id,CASE WHEN p_game='quintzee' THEN rules.config||jsonb_build_object('theme',coalesce((SELECT quintzee_theme FROM public.game_defaults WHERE game_type='quintzee'),'classic')) ELSE rules.config END,floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO run;
   INSERT INTO public.arcade_revisions VALUES(run.id,p_actor,0);
  END IF;
  INSERT INTO private.arcade_command_receipts VALUES(p_actor,p_request,run.id,'start:'||p_game,run.revision);
 END IF;
 RETURN to_jsonb(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;

CREATE OR REPLACE FUNCTION public.arcade_commit(p_actor uuid, p_run uuid, p_revision bigint, p_state jsonb, p_due bigint, p_request uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;status_i text:=p_state->>'status';score_i bigint:=(p_state->>'score')::bigint;prior_best bigint;record_i jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run));
  END IF;
 END IF;
 IF run.revision<>p_revision OR run.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',private.arcade_record(run));END IF;
 -- A request computed before expiry may acquire this lock after expiry.
 -- Only the new clock policy changes; worker synchronization can commit its timeout.
 IF p_request IS NOT NULL AND run.config->>'clockStart'='intro_end'
  AND run.state->'board'->'result'='null'::jsonb
  AND (run.state->'board'->>'deadline')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RETURN jsonb_build_object('outcome','deadline','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
 END IF;
 IF p_state->>'runId' IS DISTINCT FROM run.id::text OR p_state->>'userId' IS DISTINCT FROM run.user_id::text
  OR p_state->'config' IS DISTINCT FROM run.config OR status_i NOT IN('active','completed','expired','abandoned')
  OR score_i IS NULL OR score_i<0 OR (p_state->>'round')::integer NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF run.game='quintzee' AND status_i='completed' AND private.arcade_quintzee_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='boxdrop' AND status_i='completed' AND private.arcade_boxdrop_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='trip-flip' AND status_i='completed' AND private.arcade_trip_flip_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='take-two' AND status_i='completed' AND private.arcade_take_two_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='royal-flash' AND status_i='completed' AND private.arcade_royal_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='eleven-up' AND status_i='completed' AND private.arcade_eleven_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='tri-towers' AND status_i='completed' AND private.arcade_tri_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='run21' AND status_i='completed' AND ((p_state->>'round')::integer<>3 OR jsonb_array_length(p_state->'results')<>3
  OR score_i<>(SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(p_state->'results') x)) THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,
  due_at=CASE WHEN status_i='active' THEN p_due END,updated_at=clock_timestamp(),
  ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=p_run RETURNING * INTO run;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(run.user_id,p_request,p_run,p_fingerprint,run.revision);END IF;
 IF status_i='completed' THEN
  -- One active run per user/game and the existing row lock serialize completions.
  -- Read before insertion, explicitly excluding this immutable result identity.
  SELECT max(score) INTO prior_best FROM private.arcade_results
   WHERE user_id=run.user_id AND game=run.game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(run.game,run.ruleset) AND run_id<>run.id;
  record_i:=jsonb_build_object('priorBest',prior_best,'kind',CASE
   WHEN prior_best IS NULL THEN 'first' WHEN run.score>prior_best THEN 'broken'
   WHEN run.score=prior_best THEN 'matched' ELSE 'lower' END);
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record)
   VALUES(run.id,run.user_id,run.game,run.ruleset,run.score,run.revision,run.ended_at,p_state,record_i);
 END IF;
 UPDATE public.arcade_revisions SET revision=run.revision WHERE run_id=p_run;
 RETURN jsonb_build_object('outcome','committed','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
END $function$
;

CREATE OR REPLACE FUNCTION private.megatouch_begin(p_game uuid, p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games;dg public.dealer_games;r uuid:=gen_random_uuid();people jsonb;balances jsonb;s jsonb;stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 IF g.game_type='quintzee' AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND enabled AND admission_enabled)) THEN RAISE EXCEPTION 'quintzee:fake_money_admission_closed' USING ERRCODE='42501';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type='quintzee' THEN 4 WHEN g.game_type IN('run21','trip-flip','boxdrop','race-poker','battle-31') THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 -- 11 Up bots use canonical consent and the shared reducer.
IF g.game_type='eleven-up' AND g.real_money IS DISTINCT FROM false AND EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_fake_money_only';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='quintzee' THEN
   s:=private.quintzee_deal(s||jsonb_build_object('theme',dg.config->>'theme'),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.quintzee_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='battle-31' THEN
   IF NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE singleton AND enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'battle31:admission_closed';END IF;
   s:=private.battle31_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.battle31_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='race-poker' THEN
   IF NOT EXISTS(SELECT 1 FROM private.race_poker_release WHERE singleton AND enabled AND admission_enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'race_poker:admission_closed';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'race_poker:human_required';END IF;
   s:=private.race_poker_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.race_poker_matches(dealer_game_id,game_id,round_id,state,stake,real_money) VALUES(p_dealer,p_game,r,s,stake_i,g.real_money);
  ELSIF g.game_type='boxdrop' THEN
   s:=private.boxdrop_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.boxdrop_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='trip-flip' THEN
   s:=private.trip_flip_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.trip_flip_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='take-two' THEN
   s:=private.take_two_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.take_two_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='royal-flash' THEN
   s:=private.royal_flash_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.royal_flash_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='eleven-up' THEN
   s:=private.eleven_up_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSE
   s:=private.tri_towers_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  END IF;
 END IF;
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $function$
;

CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  IF v_game.game_type='farkle' THEN PERFORM private.farkle_claim_v1(v_game.id,v_game.current_game_uuid,NULL,'start'); END IF;
  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='six-card-golf' THEN
      SELECT private.golf_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='canasta' THEN
      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='farkle' THEN
      SELECT private.farkle_begin_v1(p_game_id,p_expected_dealer_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.megatouch_frozen_stake()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF OLD.game_type IN('quintzee','eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip','boxdrop','race-poker','battle-31','six-card-golf') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$
;

DO $closed$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id='quintzee/1' AND game='quintzee' AND config=private.quintzee_v1_rules() AND NOT enabled) OR NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND NOT enabled AND NOT admission_enabled) THEN RAISE EXCEPTION 'quintzee:installation_not_closed'; END IF; END $closed$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quintzee_revisions;
SELECT cron.schedule('quintzee-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.quintzee_recover()$job$);
