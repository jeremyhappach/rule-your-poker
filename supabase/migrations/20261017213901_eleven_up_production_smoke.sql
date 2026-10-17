-- 11 Up first production smoke. Admission remains closed until publication is verified.
DO $$ BEGIN
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='arcade_start') IS DISTINCT FROM 'c5fc3de11d5b8b68ca6df933dba5f2bd' THEN RAISE EXCEPTION 'eleven_up:owner_drift_arcade_start';END IF;
IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='arcade_commit') IS DISTINCT FROM 'dc41920fea71c9f1904230a9ec92ad64' THEN RAISE EXCEPTION 'eleven_up:owner_drift_arcade_commit';END IF;
END $$;
-- Approved Ptown rules, not a claim of exact legacy Megatouch arithmetic.
-- One frozen, mode-independent rule base; no wild ball.
CREATE FUNCTION private.eleven_up_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"eleven-up/1","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"stageMs":120000,"readyMs":30000,"introMs":2500,"holdMs":5000,"clearCelebrationMs":3000,"groupBonus":1000,"clearBonus":10000,"stockPerBall":1000,"speedMax":5000,"speedStep":100,"speedStepMs":2400}'::jsonb
$$;
CREATE FUNCTION private.eleven_up_value(item integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN item BETWEEN 0 AND 15 THEN 1 WHEN item BETWEEN 16 AND 51 THEN 2+(item-16)/4 END
$$;
-- Slots 0..8 left diamond, 9..17 right, 18..21 center.
CREATE FUNCTION private.eleven_up_children(slot integer) RETURNS integer[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN slot=18 THEN ARRAY[19,20] WHEN slot IN(19,20) THEN ARRAY[21] WHEN slot=21 THEN ARRAY[]::integer[]
 ELSE ARRAY(SELECT x+CASE WHEN slot>=9 THEN 9 ELSE 0 END FROM unnest(CASE slot%9
 WHEN 0 THEN ARRAY[1,2] WHEN 1 THEN ARRAY[3,4] WHEN 2 THEN ARRAY[4,5] WHEN 3 THEN ARRAY[6]
 WHEN 4 THEN ARRAY[6,7] WHEN 5 THEN ARRAY[7] WHEN 6 THEN ARRAY[8] WHEN 7 THEN ARRAY[8] ELSE ARRAY[]::integer[] END) x) END
$$;
CREATE FUNCTION private.eleven_up_row_value(slot integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN slot IS NULL THEN NULL WHEN slot=18 THEN 600 WHEN slot IN(0,9,19,20) THEN 500 WHEN slot IN(1,2,10,11,21) THEN 400
 WHEN slot IN(3,4,5,12,13,14) THEN 300 WHEN slot IN(6,7,15,16) THEN 200 ELSE 100 END
$$;
CREATE FUNCTION private.eleven_up_unblocked(b jsonb,slot integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT slot BETWEEN 0 AND 21 AND NOT EXISTS(SELECT 1 FROM unnest(private.eleven_up_children(slot)) x WHERE b->'slots'->x<>'null'::jsonb)
$$;
CREATE FUNCTION private.eleven_up_pass_slot(b jsonb) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT x FROM unnest(ARRAY[18,0,19,20,9,1,2,21,10,11,3,4,5,12,13,14,6,7,15,16,8,17]) x
 WHERE b->'slots'->x='null'::jsonb AND private.eleven_up_unblocked(b,x) LIMIT 1
$$;
CREATE FUNCTION private.eleven_up_has_group(b jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE bits integer:=1; ball integer;
BEGIN
 FOR ball IN SELECT (v#>>'{}')::integer FROM jsonb_array_elements(b->'slots') WITH ORDINALITY s(v,i)
 WHERE v<>'null'::jsonb AND private.eleven_up_unblocked(b,(i-1)::integer)
 UNION ALL SELECT (b->>'current')::integer WHERE b->'current'<>'null'::jsonb LOOP
  bits:=bits | (bits << private.eleven_up_value(ball));
  IF (bits & 2048)<>0 THEN RETURN true;END IF;
  bits:=bits & 2047;
 END LOOP;
 RETURN false;
END $$;
CREATE FUNCTION private.eleven_up_can_pass(b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT b->'current'<>'null'::jsonb AND (private.eleven_up_pass_slot(b) IS NOT NULL OR (b->>'cursor')::integer<52)
$$;
CREATE FUNCTION private.eleven_up_shuffle() RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE balls integer[]:=ARRAY(SELECT generate_series(0,51));i integer;j integer;n integer;t integer;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  LOOP n:=get_byte(extensions.gen_random_bytes(1),0);EXIT WHEN n<(256/i)*i;END LOOP;
  j:=n%i+1;t:=balls[i];balls[i]:=balls[j];balls[j]:=t;
 END LOOP;RETURN to_jsonb(balls);
END $$;
CREATE FUNCTION private.eleven_up_bonus_qualified(score bigint,rules jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT score >= (rules->>'bonusThreshold')::bigint
$$;
CREATE FUNCTION private.eleven_up_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.eleven_up_shuffle();
BEGIN
 RETURN (b-ARRAY['result','startedAt'])||jsonb_build_object('deck',deck,'slots',(SELECT jsonb_agg(deck->i ORDER BY i) FROM generate_series(0,21) i),
 'current',deck->22,'cursor',23,'groups',0,'scoreBefore',coalesce((b->>'score')::bigint,0),'phase','intro',
 'deadline',at_ms+(b#>>'{rules,introMs}')::bigint,'event',jsonb_build_object('label','11 Up','points',0));
END $$;
CREATE FUNCTION private.eleven_up_board_finish(b jsonb,reason text,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE speed integer:=0;stock integer:=0;clear_i integer:=0;groups_i integer;total bigint;result jsonb;hold bigint;
BEGIN
 IF b->>'phase' NOT IN('ready','playing') THEN RAISE EXCEPTION 'eleven_up:finish_phase';END IF;
 IF reason IN('cleared','take_score','blocked') AND b ? 'startedAt' THEN
  speed:=greatest(0,(b#>>'{rules,speedMax}')::integer-(greatest(0,at_ms-(b->>'startedAt')::bigint)/(b#>>'{rules,speedStepMs}')::bigint)*(b#>>'{rules,speedStep}')::integer);
 END IF;
 IF reason='cleared' THEN
  clear_i:=(b#>>'{rules,clearBonus}')::integer;
  stock:=(52-(b->>'cursor')::integer+CASE WHEN b->'current'<>'null'::jsonb THEN 1 ELSE 0 END)*(b#>>'{rules,stockPerBall}')::integer;
 END IF;
 groups_i:=(b->>'groups')::integer*(b#>>'{rules,groupBonus}')::integer;
 total:=(b->>'score')::bigint+speed+stock+clear_i+groups_i;
 hold:=(b#>>'{rules,holdMs}')::bigint+CASE WHEN reason='cleared' THEN (b#>>'{rules,clearCelebrationMs}')::bigint ELSE 0 END;
 result:=jsonb_build_object('score',total,'scoreBefore',(b->>'scoreBefore')::bigint,'displayScore',(b->>'score')::bigint,
 'stageScore',total-(b->>'scoreBefore')::bigint,'timeBonus',speed,'stockBonus',stock,'clearBonus',clear_i,'groupBonus',groups_i,'reason',reason,'completedAt',at_ms);
 RETURN b||jsonb_build_object('score',total,'result',result,'phase','stage_complete','deadline',at_ms+hold,
 'event',jsonb_build_object('label',CASE reason WHEN 'cleared' THEN 'All balls cleared!' WHEN 'take_score' THEN 'Score taken' WHEN 'timeout' THEN 'Time expired' WHEN 'ready_timeout' THEN 'Round not started' ELSE 'No moves remaining' END,'points',speed+stock+clear_i+groups_i));
END $$;
CREATE FUNCTION private.eleven_up_board_reduce(b jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text;slot integer;ball integer;total integer:=0;points integer:=0;dest integer;cursor_i integer;uses_current boolean:=false;slots jsonb;
BEGIN
 IF b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN IF action='tick' THEN RETURN b;ELSE RAISE EXCEPTION 'eleven_up:intro';END IF;END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint,'event',jsonb_build_object('label','Make eleven or pass to start','points',0));
 END IF;
 phase:=b->>'phase';
 IF phase NOT IN('ready','playing') THEN RAISE EXCEPTION 'eleven_up:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.eleven_up_board_finish(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,(b->>'deadline')::bigint);END IF;
 IF action='tick' THEN RETURN b;END IF;
 dest:=private.eleven_up_pass_slot(b);
 IF action='group' THEN
  IF cardinality(items) NOT BETWEEN 2 AND 11 OR cardinality(items) IS NULL OR EXISTS(SELECT 1 FROM unnest(items) x WHERE x IS NULL)
   OR cardinality(items)<>(SELECT count(DISTINCT x) FROM unnest(items) x) THEN RAISE EXCEPTION 'eleven_up:invalid_group';END IF;
  FOREACH ball IN ARRAY items LOOP
   IF b->'current'<>'null'::jsonb AND ball=(b->>'current')::integer THEN uses_current:=true;points:=points+coalesce(private.eleven_up_row_value(dest),0);
   ELSE
    SELECT (i-1)::integer INTO slot FROM jsonb_array_elements(b->'slots') WITH ORDINALITY s(v,i) WHERE v=to_jsonb(ball);
    IF slot IS NULL OR NOT private.eleven_up_unblocked(b,slot) THEN RAISE EXCEPTION 'eleven_up:covered_or_missing';END IF;
    points:=points+private.eleven_up_row_value(slot);
   END IF;
   total:=total+private.eleven_up_value(ball);
  END LOOP;
  IF total IS DISTINCT FROM 11 THEN RAISE EXCEPTION 'eleven_up:sum';END IF;
 ELSIF action='pass' THEN
  IF NOT private.eleven_up_can_pass(b) THEN RAISE EXCEPTION 'eleven_up:pass_unavailable';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' THEN RAISE EXCEPTION 'eleven_up:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.eleven_up_board_finish(b,'take_score',at_ms);END IF;
 slots:=b->'slots';cursor_i:=(b->>'cursor')::integer;
 IF action='group' THEN
  SELECT jsonb_agg(CASE WHEN v<>'null'::jsonb AND (v#>>'{}')::integer=ANY(items) THEN 'null'::jsonb ELSE v END ORDER BY i) INTO slots FROM jsonb_array_elements(slots) WITH ORDINALITY s(v,i);
  b:=b||jsonb_build_object('slots',slots,'groups',(b->>'groups')::integer+1,'score',(b->>'score')::bigint+points,'event',jsonb_build_object('label','Eleven!','points',points));
 ELSE
  points:=greatest(0,(b->>'score')::bigint-coalesce(private.eleven_up_row_value(dest),0))-(b->>'score')::bigint;
  -- Full rack: discard this draw and advance without a placement penalty.
  -- An available slot still receives the ball and incurs its row penalty.
  b:=b||jsonb_build_object('slots',CASE WHEN dest IS NULL THEN slots ELSE jsonb_set(slots,ARRAY[dest::text],b->'current') END,'score',(b->>'score')::bigint+points,'event',jsonb_build_object('label','Passed','points',points));
 END IF;
 IF uses_current OR action='pass' THEN b:=b||jsonb_build_object('current',coalesce(b->'deck'->cursor_i,'null'::jsonb),'cursor',least(52,cursor_i+1));END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'slots') v WHERE v<>'null'::jsonb) THEN RETURN private.eleven_up_board_finish(b,'cleared',at_ms);END IF;
 IF NOT private.eleven_up_has_group(b) AND NOT private.eleven_up_can_pass(b) THEN RETURN private.eleven_up_board_finish(b,'blocked',at_ms);END IF;
 RETURN b;
END $$;
CREATE FUNCTION private.eleven_up_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-ARRAY['deck','cursor'])||jsonb_build_object('stockRemaining',52-(s->>'cursor')::integer+CASE WHEN s->'current'<>'null'::jsonb THEN 1 ELSE 0 END,
 'passSlot',private.eleven_up_pass_slot(s),'canPass',private.eleven_up_can_pass(s),'exposed',(SELECT coalesce(jsonb_agg(i ORDER BY i),'[]'::jsonb) FROM generate_series(0,21) i WHERE s->'slots'->i<>'null'::jsonb AND private.eleven_up_unblocked(s,i)),
 'activePlayerId',CASE WHEN s->>'phase'='complete' THEN NULL ELSE s->'players'->(s->>'turnIndex')::integer->>'id' END)
$$;
REVOKE ALL ON FUNCTION private.eleven_up_can_pass(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.eleven_up_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false, admission_enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.eleven_up_release DEFAULT VALUES;
ALTER TABLE private.eleven_up_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.eleven_up_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.eleven_up_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint,

 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX eleven_up_matches_session ON private.eleven_up_matches(game_id);
CREATE INDEX eleven_up_matches_pending ON private.eleven_up_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;

CREATE TABLE private.eleven_up_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.eleven_up_matches(dealer_game_id),
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.eleven_up_history (
 dealer_game_id uuid NOT NULL REFERENCES private.eleven_up_matches(dealer_game_id),
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.eleven_up_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.eleven_up_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.eleven_up_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.eleven_up_matches,private.eleven_up_requests,private.eleven_up_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.eleven_up_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.eleven_up_matches(dealer_game_id),
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.eleven_up_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eleven_up_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.eleven_up_revisions TO authenticated;
CREATE POLICY eleven_up_member_read ON public.eleven_up_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=eleven_up_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE FUNCTION private.eleven_up_actor_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND enabled)
$$;
CREATE FUNCTION public.eleven_up_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.eleven_up_actor_allowed(actor);
BEGIN
 allowed:=allowed AND EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled);
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money=false)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',1,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',true);
END $$;


CREATE OR REPLACE FUNCTION private.eleven_up_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE totals jsonb;
BEGIN
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.eleven_up_board_deal(s||jsonb_build_object('scores',totals,'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $$;
CREATE OR REPLACE FUNCTION private.eleven_up_reduce(s jsonb,action text,items integer[],at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'eleven_up:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'eleven_up:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;
  ELSIF next_i>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p->>'id' ORDER BY ord),'[]'::jsonb) INTO qualified FROM jsonb_array_elements(s->'players') WITH ORDINALITY a(p,ord)
    WHERE private.eleven_up_bonus_qualified((s->'scores'->>(p->>'id'))::bigint,s->'rules');
   s:=s||jsonb_build_object('qualified',qualified);round_i:=3;next_i:=0;
  END IF;
  IF round_i=3 THEN
   WHILE next_i<n AND NOT coalesce(s->'qualified','[]'::jsonb) ? (s->'players'->next_i->>'id') LOOP next_i:=next_i+1;END LOOP;
  END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.eleven_up_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),(s->>'deadline')::bigint);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.eleven_up_board_reduce(board,action,items,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'eleven_up:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $$;
CREATE FUNCTION private.eleven_up_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.eleven_up_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.eleven_up_history VALUES(NEW.dealer_game_id,NEW.revision,private.eleven_up_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;

CREATE FUNCTION public.eleven_up_snapshot(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot;
 IF viewer IS NULL OR NOT private.eleven_up_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'eleven_up:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 IF m.settlement IS NOT NULL THEN
  SELECT jsonb_object_agg(player_id::text,chips) INTO balances FROM public.session_player_snapshots WHERE dealer_game_id=p_dealer_game_id;
 ELSE SELECT jsonb_object_agg(id::text,chips) INTO balances FROM public.players WHERE game_id=m.game_id;END IF;
 SELECT * INTO batch FROM public.gameplay_transfer_batches WHERE dealer_game_id=p_dealer_game_id ORDER BY cursor DESC LIMIT 1;
 SELECT id INTO result_id FROM public.game_results WHERE dealer_game_id=p_dealer_game_id AND settlement_key='eleven_up_terminal';
 RETURN private.eleven_up_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished,'pausedAt',m.paused_at,'financial',jsonb_build_object('balances',coalesce(balances,'{}'::jsonb),'resultId',result_id,'batch',CASE WHEN batch.id IS NOT NULL THEN to_jsonb(batch) ELSE NULL END))
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $$;

CREATE FUNCTION public.eleven_up_history(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.eleven_up_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.eleven_up_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $$;

CREATE FUNCTION private.eleven_up_settle(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'eleven_up:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'eleven_up:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'eleven_up_terminal','eleven-up',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  '11 Up: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.eleven_up_matches SET settlement=changes,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='11 Up complete',awaiting_next_round=false WHERE id=m.game_id;
END $$;

CREATE FUNCTION public.eleven_up_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.eleven_up_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.eleven_up_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'eleven_up:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('group','pass','continue','take_score') THEN RAISE EXCEPTION 'eleven_up:invalid_command'; END IF;
 SELECT * INTO prior FROM private.eleven_up_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'eleven_up:replay_conflict'; END IF;
  RETURN public.eleven_up_snapshot(p_dealer_game_id);
 END IF;
 IF g.real_money IS DISTINCT FROM false OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'eleven_up:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'eleven_up:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'eleven_up:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.eleven_up_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.eleven_up_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id); END IF;
 RETURN public.eleven_up_snapshot(m.dealer_game_id);
END $$;

CREATE FUNCTION public.eleven_up_configure(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.eleven_up_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'eleven-up' THEN RAISE EXCEPTION 'eleven_up:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'eleven_up:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'eleven_up:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'eleven_up:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'eleven_up:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'eleven_up:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 -- Admission controls creation only; existing setup retries and match authority remain live.
 IF NOT EXISTS(SELECT 1 FROM private.eleven_up_release WHERE singleton AND admission_enabled) THEN RAISE EXCEPTION 'eleven_up:admission_closed' USING ERRCODE='42501';END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'eleven_up:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.eleven_up_actor_allowed(user_id)) THEN RAISE EXCEPTION 'eleven_up:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'eleven_up:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'eleven_up:bots_not_supported';END IF;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'eleven_up:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'eleven_up:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'eleven-up',jsonb_build_object('ante_amount',stake_i,'rules',private.eleven_up_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='eleven-up',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake_i,current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g.id,dg.id,1,1,0,'betting',0);
 s:=private.eleven_up_deal(jsonb_build_object('identity',jsonb_build_object('sessionId',g.id,'dealerGameId',dg.id,'roundId',r),
  'players',people,'rules',private.eleven_up_rules(),'turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.eleven_up_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(dg.id,g.id,r,s,stake_i);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.eleven_up_close(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.eleven_up_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT private.eleven_up_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot)
 OR m.settlement IS NULL THEN RAISE EXCEPTION 'eleven_up:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'eleven_up:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='eleven_up_terminal';
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
 UPDATE private.eleven_up_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $$;

CREATE FUNCTION private.eleven_up_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'eleven-up' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.eleven_up_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('deadline',(state->>'deadline')::bigint+at_ms-paused_at)||CASE WHEN state ? 'startedAt' THEN jsonb_build_object('startedAt',(state->>'startedAt')::bigint+at_ms-paused_at) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.eleven_up_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record;m private.eleven_up_matches;g public.games;at_ms bigint;count_i integer:=0;i integer;
BEGIN
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 FOR candidate IN SELECT dealer_game_id,game_id,round_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND (state->>'deadline')::bigint<=at_ms ORDER BY (state->>'deadline')::bigint LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress' OR g.game_type IS DISTINCT FROM 'eleven-up' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.eleven_up_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  FOR i IN 1..64 LOOP
   EXIT WHEN m.state->>'phase'='complete' OR (m.state->>'deadline')::bigint>at_ms;
   m.state:=private.eleven_up_reduce(m.state,'tick',NULL,(m.state->>'deadline')::bigint);
  END LOOP;
  UPDATE private.eleven_up_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.eleven_up_settle(m.dealer_game_id);END IF;count_i:=count_i+1;
 END LOOP;RETURN count_i;
END $$;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'eleven_up_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.eleven_up_capabilities(uuid),public.eleven_up_snapshot(uuid),public.eleven_up_history(uuid),public.eleven_up_action(uuid,uuid,bigint,text,integer[]),public.eleven_up_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.eleven_up_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.eleven_up_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id),
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id),
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id);
ALTER TABLE public.eleven_up_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id);
CREATE TRIGGER eleven_up_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='eleven-up') EXECUTE FUNCTION private.eleven_up_pause();

CREATE TRIGGER eleven_up_publish AFTER INSERT OR UPDATE ON private.eleven_up_matches FOR EACH ROW EXECUTE FUNCTION private.eleven_up_publish();

-- Solo orchestration only. Board rules remain in the shared eleven-up/1 core.
CREATE OR REPLACE FUNCTION private.arcade_eleven_finish_round(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; round_i integer:=(s->>'round')::integer;
BEGIN
 IF s#>>'{board,phase}'<>'stage_complete' OR jsonb_array_length(s->'results')>=round_i THEN RETURN s;END IF;
 r:=s#>'{board,result}'||jsonb_build_object('id',s->>'roundId','stage',round_i);
 s:=s||jsonb_build_object('results',(s->'results')||jsonb_build_array(r),'score',s#>'{board,score}');
 IF round_i=2 THEN s:=s||jsonb_build_object('bonusQualified',private.eleven_up_bonus_qualified((r->>'score')::bigint,s->'config'));END IF;
 IF round_i=3 OR (round_i=2 AND NOT (s->>'bonusQualified')::boolean) THEN s:=s||jsonb_build_object('status','completed');END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_finish_round(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_advance(s jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE due bigint; round_i integer; i integer;
BEGIN
 FOR i IN 1..12 LOOP
  EXIT WHEN s->>'status'<>'active';
  due:=(s#>>'{board,deadline}')::bigint;EXIT WHEN due>at_ms;
  IF s#>>'{board,phase}'='stage_complete' THEN
   round_i:=(s->>'round')::integer+1;
   s:=s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'board',private.eleven_up_board_deal(jsonb_build_object('rules',s->'config','score',s->'score'),due));
  ELSE
   s:=jsonb_set(s,'{board}',private.eleven_up_board_reduce(s->'board','tick',NULL,due));
   s:=private.arcade_eleven_finish_round(s);
  END IF;
 END LOOP;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_advance(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_valid_completion(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r jsonb; previous bigint:=0; i integer:=0; n integer; required integer;
BEGIN
 n:=jsonb_array_length(s->'results');
 required:=CASE WHEN private.eleven_up_bonus_qualified((s#>>'{results,1,score}')::bigint,s->'config') THEN 3 ELSE 2 END;
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
REVOKE ALL ON FUNCTION private.arcade_eleven_valid_completion(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.arcade_eleven_projection(run private.arcade_runs,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.eleven_up_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','slots','current','exposed','passSlot','canPass','groups','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',(result->>'completedAt')::bigint,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION private.arcade_eleven_projection(private.arcade_runs,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arcade_eleven_step(p_actor uuid,p_run uuid,p_revision bigint DEFAULT NULL,p_round text DEFAULT NULL,
 p_request uuid DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'eleven-up' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('group','pass','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_items)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.eleven_up_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_eleven_advance(s,at_ms);
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
    s:=jsonb_set(s,'{board}',private.eleven_up_board_reduce(s->'board',p_action,p_items,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_eleven_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_eleven_projection(run,at_ms));
END $$;
REVOKE ALL ON FUNCTION public.arcade_eleven_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_eleven_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid) TO service_role;

INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('eleven-up/1','eleven-up',private.eleven_up_rules(),false) ON CONFLICT(id) DO NOTHING;

-- Existing owner definitions: only new game admission/validation branches added.
CREATE OR REPLACE FUNCTION public.arcade_start(p_actor uuid, p_request uuid, p_game text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs; receipt private.arcade_command_receipts; rules private.arcade_rulesets;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_game IS NULL OR p_game NOT IN ('run21','tri-towers','eleven-up') THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
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

ALTER PUBLICATION supabase_realtime ADD TABLE public.eleven_up_revisions;
SELECT cron.schedule('eleven-up-recovery','1 second',$job$SET statement_timeout = '3s'; SELECT private.eleven_up_recover()$job$);
NOTIFY pgrst,'reload schema';
