DO $guard$ DECLARE f record; BEGIN
 FOR f IN SELECT * FROM (VALUES
 ('public.arcade_start(uuid,uuid,text)','5c29d89461b1de9b7c2ce7dea03621d3'),
 ('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)','6d57da27cb323f7696a08105fdc99d74'),
 ('private.megatouch_begin(uuid,uuid)','a3870e589a62d8460409af2a17b1a3bd'),
 ('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','61a00628fb000a2a8eb3df1063ef9da3'),
 ('private.megatouch_frozen_stake()','1e97542cf7bac94bafcbd64396337e25')) expected(signature,hash) LOOP
 IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'trip_flip:shared_authority_changed:%',f.signature;END IF;
 END LOOP;END $guard$;
-- trip-flip/1: the sole gameplay rule base for both lifecycle adapters.
CREATE OR REPLACE FUNCTION private.trip_flip_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"trip-flip/1","stageMs":180000,"introMs":2500,"holdMs":6000,"clockStart":"intro_end","rounds":2,"dots":30,"dotMs":6000,"timePerDot":125,"tripPoints":3000,"runPoints":600,"suitedBonus":5000,"specialBonus":10000,"aceLowOnly":true}'::jsonb
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_random(bound integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE bytes bytea;n bigint;
BEGIN
 IF bound<1 THEN RAISE EXCEPTION 'trip_flip:random_bound';END IF;
 LOOP
  bytes:=extensions.gen_random_bytes(4);
  n:=get_byte(bytes,0)::bigint*16777216+get_byte(bytes,1)::bigint*65536+get_byte(bytes,2)::bigint*256+get_byte(bytes,3);
  EXIT WHEN n<4294967296-(4294967296%bound);
 END LOOP;
 RETURN (n%bound)::integer;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_shuffle() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE a integer[]:=ARRAY(SELECT generate_series(0,53));i integer;j integer;t integer;
BEGIN
 FOR i IN REVERSE 54..2 LOOP j:=private.trip_flip_random(i)+1;t:=a[i];a[i]:=a[j];a[j]:=t;END LOOP;
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_combination(cards jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE natural_i integer[];r integer;start_i integer;direction integer;candidate integer[];valid boolean;i integer;c integer;
BEGIN
 IF jsonb_typeof(cards) IS DISTINCT FROM 'array' OR jsonb_array_length(cards)<>3 THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(cards)x WHERE jsonb_typeof(x)<>'number' OR x::integer NOT BETWEEN 0 AND 53)
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(cards)x)<>3 THEN RETURN NULL;END IF;
 SELECT array_agg(x::integer%13+1) INTO natural_i FROM jsonb_array_elements(cards)x WHERE x::integer<52;
 IF cardinality(natural_i)>0 AND (SELECT count(DISTINCT x) FROM unnest(natural_i)x)=1 THEN
  RETURN jsonb_build_object('kind','trip','ranks',jsonb_build_array(natural_i[1],natural_i[1],natural_i[1]),'natural',cardinality(natural_i)=3,'suited',false);
 END IF;
 FOR start_i IN 1..13 LOOP
  FOREACH direction IN ARRAY ARRAY[1,-1] LOOP
   IF start_i+2*direction NOT BETWEEN 1 AND 13 THEN CONTINUE;END IF;
   candidate:=ARRAY[start_i,start_i+direction,start_i+2*direction];valid:=true;
   FOR i IN 0..2 LOOP c:=(cards->>i)::integer;IF c<52 AND c%13+1<>candidate[i+1] THEN valid:=false;EXIT;END IF;END LOOP;
   IF valid THEN RETURN jsonb_build_object('kind','run','ranks',to_jsonb(candidate),'natural',cardinality(natural_i)=3,
    'suited',cardinality(natural_i)=3 AND (SELECT count(DISTINCT x::integer/13) FROM jsonb_array_elements(cards)x)=1);END IF;
  END LOOP;
 END LOOP;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_special() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE first_i integer:=private.trip_flip_random(11);direction integer:=CASE WHEN private.trip_flip_random(2)=0 THEN 1 ELSE -1 END;
BEGIN
 IF direction=-1 THEN first_i:=first_i+2;END IF;
 RETURN jsonb_build_array(first_i+13*private.trip_flip_random(4),first_i+direction+13*private.trip_flip_random(4),first_i+2*direction+13*private.trip_flip_random(4));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_card(b jsonb,location integer) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN location BETWEEN 0 AND 3 THEN (b->'columns'->location->>-1)::integer
 WHEN location BETWEEN 4 AND 6 THEN (b->'cells'->>(location-4))::integer
 WHEN location=7 THEN (b->'fan'->>0)::integer END
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_moves(b jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(src,dst,private.trip_flip_card(b,src)) ORDER BY src,dst),'[]'::jsonb)
 FROM generate_series(0,7)src CROSS JOIN generate_series(0,6)dst
 WHERE src<>dst AND private.trip_flip_card(b,src) IS NOT NULL AND
 CASE WHEN dst<4 THEN jsonb_array_length(b->'columns'->dst)<3 ELSE b->'cells'->(dst-4)='null'::jsonb END
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_dots(b jsonb,at_ms bigint) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT least((b#>>'{rules,dots}')::integer,ceil(greatest(0,(b->>'deadline')::bigint-at_ms)::numeric/(b#>>'{rules,dotMs}')::integer)::integer)
$$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_deal(b jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE deck jsonb:=private.trip_flip_shuffle();start_i bigint;
BEGIN
 IF b->'rules' IS DISTINCT FROM private.trip_flip_rules() THEN RAISE EXCEPTION 'trip_flip:rules';END IF;
 start_i:=at_ms+(b#>>'{rules,introMs}')::integer;
 RETURN (b-ARRAY['result','startedAt','botVisited'])||jsonb_build_object('deck',deck,'columns','[[],[],[],[]]'::jsonb,'cells','[null,null,null]'::jsonb,
 'fan',jsonb_build_array(deck->0,deck->1,deck->2),'cursor',3,'special',private.trip_flip_special(),'specialClaimed',false,
 'scoreBefore',coalesce(b->'score','0'::jsonb),'score',coalesce(b->'score','0'::jsonb),'trips',0,'runs',0,'suitedTotal',0,'specialTotal',0,
 'recentPositions','[]'::jsonb,'phase','intro','deadline',start_i,'result',NULL,'event',jsonb_build_object('label','Get ready','points',0));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_finish(b jsonb,at_ms bigint,reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dots_i integer:=private.trip_flip_dots(b,at_ms);time_i integer;total bigint;result_i jsonb;
BEGIN
 time_i:=dots_i*(b#>>'{rules,timePerDot}')::integer;total:=(b->>'score')::bigint+time_i;
 result_i:=jsonb_build_object('reason',reason,'scoreBefore',b->'scoreBefore','displayScore',b->'score','score',total,'stageScore',total-(b->>'scoreBefore')::bigint,
 'tripPoints',(b->>'trips')::integer*(b#>>'{rules,tripPoints}')::integer,'runPoints',(b->>'runs')::integer*(b#>>'{rules,runPoints}')::integer,
 'suitedBonus',b->'suitedTotal','specialBonus',b->'specialTotal','timeDots',dots_i,'timeBonus',time_i,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total,'result',result_i,'phase','stage_complete','deadline',at_ms+(b#>>'{rules,holdMs}')::integer,
 'event',jsonb_build_object('label',CASE reason WHEN 'full_clear' THEN 'Playfield cleared!' WHEN 'timeout' THEN 'Time up' ELSE 'Score banked' END,'points',time_i));
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE src integer;dst integer;card integer;cursor_i integer;cards jsonb;combo jsonb;points_i integer:=0;suited_i integer:=0;special_i integer:=0;kind text;label_i text:='Card moved';
BEGIN
 IF b->'rules' IS DISTINCT FROM private.trip_flip_rules() THEN RAISE EXCEPTION 'trip_flip:rules';END IF;
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;END IF;RAISE EXCEPTION 'trip_flip:intro';END IF;
  b:=b||jsonb_build_object('phase','playing','startedAt',b->'deadline','deadline',(b->>'deadline')::bigint+(b#>>'{rules,stageMs}')::integer);
 END IF;
 IF b->>'phase'<>'playing' THEN RAISE EXCEPTION 'trip_flip:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.trip_flip_board_finish(b,(b->>'deadline')::bigint,'timeout');END IF;
 IF action='tick' THEN RETURN b;END IF;
 IF action='take_score' THEN RETURN private.trip_flip_board_finish(b,at_ms,'take_score');END IF;
 IF action<>'move' OR cardinality(items) IS DISTINCT FROM 3 OR array_position(items,NULL) IS NOT NULL THEN RAISE EXCEPTION 'trip_flip:invalid_command';END IF;
 src:=items[1];dst:=items[2];card:=items[3];
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.trip_flip_moves(b))m WHERE m=to_jsonb(items)) THEN RAISE EXCEPTION 'trip_flip:illegal_move';END IF;
 -- Positions contain only visible columns/cells. A fan play makes permanent
 -- progress and resets this bounded bot loop history for the next stock card.
 b:=jsonb_set(b,'{recentPositions}',CASE WHEN src=7 THEN '[]'::jsonb ELSE coalesce(b->'recentPositions','[]'::jsonb)||jsonb_build_array(md5(jsonb_build_array(b->'columns',b->'cells')::text)) END);
 IF jsonb_array_length(b->'recentPositions')>128 THEN b:=jsonb_set(b,'{recentPositions}',(b->'recentPositions')-0);END IF;
 IF src<4 THEN b:=jsonb_set(b,ARRAY['columns',src::text],(b->'columns'->src)-(-1));
 ELSIF src<7 THEN b:=jsonb_set(b,ARRAY['cells',(src-4)::text],'null');
 ELSE
  cursor_i:=(b->>'cursor')::integer;cards:=(b->'fan')-0;
  IF cursor_i<54 THEN cards:=cards||jsonb_build_array(b->'deck'->cursor_i);cursor_i:=cursor_i+1;END IF;
  b:=b||jsonb_build_object('fan',cards,'cursor',cursor_i);
 END IF;
 IF dst>=4 THEN b:=jsonb_set(b,ARRAY['cells',(dst-4)::text],to_jsonb(card));
 ELSE
  cards:=(b->'columns'->dst)||jsonb_build_array(card);combo:=private.trip_flip_combination(cards);
  IF combo IS NOT NULL THEN
   kind:=combo->>'kind';points_i:=(b#>>ARRAY['rules',kind||'Points'])::integer;
   IF (combo->>'suited')::boolean THEN suited_i:=(b#>>'{rules,suitedBonus}')::integer;END IF;
   IF kind='run' AND (combo->>'natural')::boolean AND NOT (b->>'specialClaimed')::boolean AND cards=b->'special' THEN special_i:=(b#>>'{rules,specialBonus}')::integer;END IF;
   label_i:=CASE WHEN special_i>0 THEN 'Special Run!' WHEN suited_i>0 THEN 'Suited Run!' WHEN kind='trip' THEN 'Trip!' ELSE 'Run!' END;
   b:=b||jsonb_build_object(kind||'s',(b->>(kind||'s'))::integer+1,'suitedTotal',(b->>'suitedTotal')::integer+suited_i,
    'specialTotal',(b->>'specialTotal')::integer+special_i,'specialClaimed',(b->>'specialClaimed')::boolean OR special_i>0);
   cards:='[]';
  END IF;
  b:=jsonb_set(b,ARRAY['columns',dst::text],cards);
 END IF;
 points_i:=points_i+suited_i+special_i;
 b:=b||jsonb_build_object('score',(b->>'score')::bigint+points_i,'event',jsonb_build_object('label',label_i,'points',points_i,'source',src,'destination',dst,'card',card,'combination',combo,'special',special_i>0));
 IF (b->>'cursor')::integer=54 AND b->'fan'='[]'::jsonb AND b->'columns'='[[],[],[],[]]'::jsonb AND b->'cells'='[null,null,null]'::jsonb THEN RETURN private.trip_flip_board_finish(b,at_ms,'full_clear');END IF;
 RETURN b;
END $$;

CREATE OR REPLACE FUNCTION private.trip_flip_visible(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor','botVisited'])||jsonb_build_object('stockRemaining',54-(s->>'cursor')::integer,'legalMoves',private.trip_flip_moves(s),
 'activePlayerId',s->'players'->(s->>'turnIndex')::integer->>'id')
$$;


-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.trip_flip_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.trip_flip_release DEFAULT VALUES;
ALTER TABLE private.trip_flip_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.trip_flip_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.trip_flip_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint, bot_due_at bigint,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trip_flip_matches_session ON private.trip_flip_matches(game_id);
CREATE INDEX trip_flip_matches_pending ON private.trip_flip_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.trip_flip_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.trip_flip_matches(dealer_game_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.trip_flip_history (
 dealer_game_id uuid NOT NULL REFERENCES private.trip_flip_matches(dealer_game_id) ON DELETE CASCADE,
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.trip_flip_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.trip_flip_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.trip_flip_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.trip_flip_matches,private.trip_flip_requests,private.trip_flip_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.trip_flip_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.trip_flip_matches(dealer_game_id) ON DELETE CASCADE,
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.trip_flip_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_flip_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.trip_flip_revisions TO authenticated;
CREATE POLICY trip_flip_member_read ON public.trip_flip_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=trip_flip_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE OR REPLACE FUNCTION private.trip_flip_actor_allowed(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.trip_flip_release WHERE singleton AND enabled)
$function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_capabilities(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.trip_flip_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.trip_flip_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.trip_flip_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',2,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',false);
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_high_score(actor uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(score),0) FROM (
  SELECT score FROM private.arcade_results WHERE user_id=actor AND game='trip-flip' AND ruleset='trip-flip/1'
  UNION ALL SELECT score FROM private.multiplayer_score_results WHERE user_id=actor AND game='trip-flip' AND ruleset='trip-flip/1'
 ) scores
$$;
CREATE OR REPLACE FUNCTION private.trip_flip_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE totals jsonb;
BEGIN
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.trip_flip_board_deal(s||jsonb_build_object('scores',totals,'highScore',private.trip_flip_high_score((s->'players'->(s->>'turnIndex')::integer->>'userId')::uuid),'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_reduce(s jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'trip_flip:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'trip_flip:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.trip_flip_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),(s->>'deadline')::bigint);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.trip_flip_board_reduce(board,action,items,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'trip_flip:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 INSERT INTO public.trip_flip_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.trip_flip_history VALUES(NEW.dealer_game_id,NEW.revision,private.trip_flip_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.trip_flip_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
 IF viewer IS NULL OR NOT private.trip_flip_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'trip_flip:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='trip_flip_terminal';
 RETURN private.trip_flip_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_history(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.trip_flip_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.trip_flip_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_record_scores(p_dealer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.trip_flip_matches;member jsonb;peers jsonb;facts jsonb;answer jsonb:='{}';at_time timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer;
 IF m.state->>'phase'<>'complete' THEN RETURN answer;END IF;
 -- Completion must contain each player's own complete, compatible performance.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE
  (SELECT array_agg((r->>'stage')::int ORDER BY (r->>'stage')::int) FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id') IS DISTINCT FROM
   ARRAY[1,2] OR
  (SELECT (r->>'score')::bigint FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id' ORDER BY (r->>'stage')::int DESC LIMIT 1) IS DISTINCT FROM (m.state->'scores'->>(p->>'id'))::bigint) THEN RETURN answer;END IF;
 SELECT jsonb_agg(jsonb_build_object('score',value::bigint)) INTO peers FROM jsonb_each_text(m.state->'scores') score WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=score.key AND NOT coalesce((p->>'isBot')::boolean,false));
 FOR member IN SELECT value FROM jsonb_array_elements(m.state->'players') WHERE NOT coalesce((value->>'isBot')::boolean,false) AND EXISTS(SELECT 1 FROM auth.users WHERE id=(value->>'userId')::uuid) LOOP
  SELECT record INTO facts FROM private.multiplayer_score_results WHERE dealer_game_id=p_dealer AND player_id=(member->>'id')::uuid;
  IF NOT FOUND THEN
   facts:=private.score_record('trip-flip',m.state#>>'{rules,version}',(member->>'userId')::uuid,(m.state->'scores'->>(member->>'id'))::bigint,p_dealer,peers);
   INSERT INTO private.multiplayer_score_results(session_id,dealer_game_id,player_id,user_id,game,ruleset,score,completed_at,record)
   VALUES(m.game_id,p_dealer,(member->>'id')::uuid,(member->>'userId')::uuid,'trip-flip',m.state#>>'{rules,version}',(m.state->'scores'->>(member->>'id'))::bigint,at_time,facts);
  END IF;
  answer:=answer||jsonb_build_object(member->>'id',facts);
 END LOOP;
 RETURN answer;
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.trip_flip_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.game_type IS DISTINCT FROM 'trip-flip' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'trip_flip:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'trip_flip:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'trip_flip_terminal','trip-flip',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'Trip Flip: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.trip_flip_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements',private.trip_flip_record_scores(m.dealer_game_id))) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='Trip Flip complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_action(p_dealer_game_id uuid, p_request_id uuid, p_revision bigint, p_action text, p_items integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.trip_flip_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.trip_flip_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.trip_flip_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'trip_flip:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('move','take_score') THEN RAISE EXCEPTION 'trip_flip:invalid_command'; END IF;
 SELECT * INTO prior FROM private.trip_flip_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'trip_flip:replay_conflict'; END IF;
  RETURN public.trip_flip_snapshot(p_dealer_game_id);
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'trip-flip' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'trip_flip:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'trip_flip:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'trip_flip:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.trip_flip_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.trip_flip_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.trip_flip_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.trip_flip_settle(m.dealer_game_id); END IF;
 RETURN public.trip_flip_snapshot(m.dealer_game_id);
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_configure(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.trip_flip_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'trip-flip' THEN RAISE EXCEPTION 'trip_flip:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'trip_flip:dealer_required' USING ERRCODE='42501';END IF;

 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'trip_flip:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'trip_flip:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'trip_flip:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.trip_flip_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'trip_flip:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'trip_flip:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.trip_flip_actor_allowed(user_id)) THEN RAISE EXCEPTION 'trip_flip:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'trip_flip:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) <>2 THEN RAISE EXCEPTION 'trip_flip:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'trip_flip:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'trip-flip',jsonb_build_object('ante_amount',stake_i,'rules',private.trip_flip_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision=CASE WHEN id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='trip-flip',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=clock_timestamp()+make_interval(secs=>greatest(1,coalesce(g.ante_decision_timer_seconds,30))),status='ante_decision',ante_amount=stake_i,current_round=NULL,total_hands=0,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.trip_flip_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'trip_flip:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'trip-flip' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'trip_flip:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='trip_flip_terminal';
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
 UPDATE private.trip_flip_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.trip_flip_close(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.trip_flip_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.trip_flip_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'trip_flip:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.trip_flip_finish_postgame(p_dealer_game_id);END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'trip-flip' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.trip_flip_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.trip_flip_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $function$
;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'trip_flip_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.trip_flip_capabilities(uuid),public.trip_flip_snapshot(uuid),public.trip_flip_history(uuid),public.trip_flip_action(uuid,uuid,bigint,text,integer[]),public.trip_flip_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.trip_flip_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.trip_flip_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.trip_flip_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER trip_flip_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='trip-flip') EXECUTE FUNCTION private.trip_flip_pause();

CREATE TRIGGER trip_flip_publish AFTER INSERT OR UPDATE ON private.trip_flip_matches FOR EACH ROW EXECUTE FUNCTION private.trip_flip_publish();

-- Solo orchestration only. Board rules remain in the shared trip-flip/1 core.
CREATE OR REPLACE FUNCTION private.arcade_trip_flip_finish_round(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; round_i integer:=(s->>'round')::integer;
BEGIN
 IF s#>>'{board,phase}'<>'stage_complete' OR jsonb_array_length(s->'results')>=round_i THEN RETURN s;END IF;
 r:=s#>'{board,result}'||jsonb_build_object('id',s->>'roundId','stage',round_i);
 s:=s||jsonb_build_object('results',(s->'results')||jsonb_build_array(r),'score',s#>'{board,score}');
 IF round_i=2 THEN s:=s||jsonb_build_object('status','completed');END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_trip_flip_finish_round(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_trip_flip_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE due bigint; round_i integer; i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';
  due:=(s#>>'{board,deadline}')::bigint;EXIT WHEN due>at_ms;
  IF s#>>'{board,phase}'='stage_complete' THEN
   round_i:=(s->>'round')::integer+1;
   s:=s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'board',private.trip_flip_board_deal(jsonb_build_object('rules',s->'config','highScore',s#>'{board,highScore}','score',s->'score','stage',round_i),due));
  ELSE
   s:=jsonb_set(s,'{board}',private.trip_flip_board_reduce(s->'board','tick',NULL,due));
   s:=private.arcade_trip_flip_finish_round(s);
  END IF;
 END LOOP;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_trip_flip_advance(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_trip_flip_valid_completion(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; previous bigint:=0; i integer:=0; n integer; required integer;
BEGIN
 n:=jsonb_array_length(s->'results');
 required:=2;
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
REVOKE ALL ON FUNCTION private.arcade_trip_flip_valid_completion(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_trip_flip_projection(run private.arcade_runs,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.trip_flip_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','columns','cells','fan','special','specialClaimed','legalMoves','trips','runs','suitedTotal','specialTotal','highScore','scoreBefore','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',(result->>'completedAt')::bigint,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION private.arcade_trip_flip_projection(private.arcade_runs,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_trip_flip_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'trip-flip' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('move','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_trip_flip_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.trip_flip_board_deal(jsonb_build_object('rules',run.config,'highScore',private.trip_flip_high_score(run.user_id),'score',0,'stage',1),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_trip_flip_advance(s,at_ms);
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
    s:=jsonb_set(s,'{board}',private.trip_flip_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_trip_flip_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_trip_flip_projection(run,at_ms));
END $$;
REVOKE ALL ON FUNCTION public.arcade_trip_flip_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_trip_flip_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('trip-flip/1','trip-flip',private.trip_flip_rules(),false) ON CONFLICT(id) DO NOTHING;

-- Only visible cards and public board-position history enter this policy.
CREATE OR REPLACE FUNCTION private.trip_flip_bot_choice(visible jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE move_i jsonb;best jsonb;src integer;dst integer;card integer;column_i jsonb;combo jsonb;utility integer;best_utility integer:=-100000;rank_i integer;natural_i integer;before_i jsonb;after_i jsonb;key_i text;
BEGIN
 FOR move_i IN SELECT value FROM jsonb_array_elements(visible->'legalMoves') LOOP
  src:=(move_i->>0)::integer;dst:=(move_i->>1)::integer;card:=(move_i->>2)::integer;combo:=NULL;
  IF src BETWEEN 4 AND 6 AND dst>=4 THEN CONTINUE;END IF;
  utility:=CASE WHEN src=7 THEN 30 WHEN src>=4 THEN 10 ELSE -15 END;
  IF dst>=4 THEN utility:=utility-20;
  ELSE
   column_i:=(visible->'columns'->dst)||jsonb_build_array(card);combo:=private.trip_flip_combination(column_i);
   IF combo IS NOT NULL THEN
    utility:=utility+CASE WHEN combo->>'kind'='trip' THEN 3000 ELSE 600 END;
    IF (combo->>'suited')::boolean THEN utility:=utility+5000;END IF;
    IF column_i=visible->'special' AND NOT (visible->>'specialClaimed')::boolean THEN utility:=utility+10000;END IF;
   ELSIF jsonb_array_length(column_i)=3 THEN utility:=utility-100;
   ELSIF jsonb_array_length(column_i)=2 THEN
    natural_i:=(column_i->>0)::integer;rank_i:=card%13-natural_i%13;
    utility:=utility+CASE WHEN card>=52 OR natural_i>=52 THEN 70 WHEN rank_i=0 THEN 65 WHEN abs(rank_i)=1 THEN 35 ELSE -30 END;
    IF column_i=(visible->'special')-2 THEN utility:=utility+80;END IF;
   END IF;
  END IF;
  -- Rearrangements must improve the board; never oscillate an unmatched card.
  IF src<4 AND combo IS NULL AND utility<=0 THEN CONTINUE;END IF;
  IF src<>7 THEN
   after_i:=visible;
   IF src<4 THEN after_i:=jsonb_set(after_i,ARRAY['columns',src::text],(after_i->'columns'->src)-(-1));
   ELSE after_i:=jsonb_set(after_i,ARRAY['cells',(src-4)::text],'null');END IF;
   IF dst<4 THEN after_i:=jsonb_set(after_i,ARRAY['columns',dst::text],CASE WHEN combo IS NOT NULL THEN '[]'::jsonb ELSE column_i END);
   ELSE after_i:=jsonb_set(after_i,ARRAY['cells',(dst-4)::text],to_jsonb(card));END IF;
   key_i:=md5(jsonb_build_array(after_i->'columns',after_i->'cells')::text);
   IF coalesce(visible->'recentPositions','[]'::jsonb) ? key_i THEN CONTINUE;END IF;
  END IF;
  IF utility>best_utility THEN best:=move_i;best_utility:=utility;END IF;
 END LOOP;
 RETURN CASE WHEN best IS NULL THEN jsonb_build_object('action','take_score') ELSE jsonb_build_object('action','move','items',best) END;
END $$;
REVOKE ALL ON FUNCTION private.trip_flip_bot_choice(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION private.trip_flip_schedule_bot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.finished OR NEW.settlement IS NOT NULL OR NEW.paused_at IS NOT NULL
  OR NEW.state->>'phase' NOT IN ('ready','playing')
  OR NOT coalesce((NEW.state->'players'->(NEW.state->>'turnIndex')::integer->>'isBot')::boolean,false) THEN
  NEW.bot_due_at:=NULL;
 ELSIF TG_OP='INSERT' THEN NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSIF OLD.paused_at IS NOT NULL OR NEW.state IS DISTINCT FROM OLD.state THEN
  NEW.bot_due_at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+750;
 ELSE NEW.bot_due_at:=OLD.bot_due_at;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.trip_flip_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE candidate record; m private.trip_flip_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; i integer; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.trip_flip_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.status='in_progress' AND live.game_type='trip-flip'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'trip-flip' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.trip_flip_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
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
 m.state:=private.trip_flip_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
 END LOOP;
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.trip_flip_bot_choice(private.trip_flip_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.trip_flip_reduce(m.state,choice->>'action',ARRAY(SELECT value::integer FROM jsonb_array_elements_text(choice->'items')),at_ms);
  END IF;
  UPDATE private.trip_flip_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.trip_flip_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.trip_flip_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
 PERFORM private.trip_flip_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;END LOOP;
 RETURN count_i;
END $function$
;
CREATE TRIGGER trip_flip_bot_schedule BEFORE INSERT OR UPDATE ON private.trip_flip_matches FOR EACH ROW EXECUTE FUNCTION private.trip_flip_schedule_bot();
REVOKE ALL ON FUNCTION private.trip_flip_schedule_bot(),private.trip_flip_recover() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_start(p_actor uuid, p_request uuid, p_game text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; rules private.arcade_rulesets;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_game IS NULL OR p_game NOT IN ('run21','tri-towers','eleven-up','royal-flash','take-two','trip-flip') THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
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
   INSERT INTO private.arcade_runs(user_id,game,ruleset,config,due_at) VALUES(p_actor,p_game,rules.id,rules.config,floor(extract(epoch FROM clock_timestamp())*1000)) RETURNING * INTO run;
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
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type NOT IN('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip') OR g.is_paused THEN RAISE EXCEPTION 'megatouch:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i THEN RAISE EXCEPTION 'megatouch:stake_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'megatouch:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'kind',CASE WHEN p.is_bot THEN 'bot' ELSE 'human' END,'chips',p.chips)
 ORDER BY CASE WHEN g.game_type='run21' THEN 0 WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,CASE WHEN g.game_type='run21' THEN p.position ELSE -p.position END,p.id),jsonb_object_agg(p.id,p.chips)
 INTO people,balances FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 IF coalesce(jsonb_array_length(people),0)<2 OR jsonb_array_length(people)>(CASE WHEN g.game_type IN('run21','trip-flip') THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'megatouch:accepted_player_count';END IF;
 IF g.game_type='eleven-up' AND EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 PERFORM set_config('app.cribbage_authoritative_write','on',true);PERFORM set_config('app.gin_rummy_authoritative_write','on',true);PERFORM set_config('app.three_five_seven_authoritative_write','on',true);PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 IF g.game_type='run21' THEN
  INSERT INTO private.run21_matches(dealer_game_id,game_id,first_round_id,participants,stake,initial_balances,balances,financial_version,real_money,first_placement_seconds)
  VALUES(p_dealer,p_game,r,people,stake_i,balances,balances,2,g.real_money,(dg.config->>'first_placement_seconds')::integer);
 ELSE
  s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'players',people,'rules',dg.config->'rules','turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb);
  IF g.game_type='trip-flip' THEN
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
    WHEN v_game.game_type IN ('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip') THEN
      SELECT private.megatouch_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;
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
 IF OLD.game_type IN('eleven-up','tri-towers','run21','royal-flash','take-two','trip-flip') AND NEW.config IS DISTINCT FROM OLD.config THEN RAISE EXCEPTION 'megatouch:configuration_frozen';END IF;RETURN NEW;
END $function$
;

ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_flip_revisions;
SELECT cron.schedule('trip-flip-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.trip_flip_recover()$job$);
