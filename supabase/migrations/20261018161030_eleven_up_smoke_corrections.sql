-- 11 Up smoke: versioned manual completion, score facts, canonical postgame and Blast graph.
SET LOCAL search_path=public,pg_catalog;
ALTER TABLE private.tri_towers_matches DROP CONSTRAINT tri_towers_matches_dealer_game_id_fkey, ADD CONSTRAINT tri_towers_matches_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES dealer_games(id) ON DELETE CASCADE;
ALTER TABLE private.tri_towers_matches DROP CONSTRAINT tri_towers_matches_game_id_fkey, ADD CONSTRAINT tri_towers_matches_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE private.tri_towers_matches DROP CONSTRAINT tri_towers_matches_round_id_fkey, ADD CONSTRAINT tri_towers_matches_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
ALTER TABLE private.tri_towers_requests DROP CONSTRAINT tri_towers_requests_dealer_game_id_fkey, ADD CONSTRAINT tri_towers_requests_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.tri_towers_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE private.tri_towers_history DROP CONSTRAINT tri_towers_history_dealer_game_id_fkey, ADD CONSTRAINT tri_towers_history_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.tri_towers_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE tri_towers_revisions DROP CONSTRAINT tri_towers_revisions_dealer_game_id_fkey, ADD CONSTRAINT tri_towers_revisions_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.tri_towers_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE tri_towers_revisions DROP CONSTRAINT tri_towers_revisions_game_id_fkey, ADD CONSTRAINT tri_towers_revisions_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE private.eleven_up_history DROP CONSTRAINT eleven_up_history_dealer_game_id_fkey, ADD CONSTRAINT eleven_up_history_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.eleven_up_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE private.eleven_up_matches DROP CONSTRAINT eleven_up_matches_dealer_game_id_fkey, ADD CONSTRAINT eleven_up_matches_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES dealer_games(id) ON DELETE CASCADE;
ALTER TABLE private.eleven_up_matches DROP CONSTRAINT eleven_up_matches_game_id_fkey, ADD CONSTRAINT eleven_up_matches_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE private.eleven_up_matches DROP CONSTRAINT eleven_up_matches_round_id_fkey, ADD CONSTRAINT eleven_up_matches_round_id_fkey FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
ALTER TABLE private.eleven_up_requests DROP CONSTRAINT eleven_up_requests_dealer_game_id_fkey, ADD CONSTRAINT eleven_up_requests_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.eleven_up_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE eleven_up_revisions DROP CONSTRAINT eleven_up_revisions_dealer_game_id_fkey, ADD CONSTRAINT eleven_up_revisions_dealer_game_id_fkey FOREIGN KEY (dealer_game_id) REFERENCES private.eleven_up_matches(dealer_game_id) ON DELETE CASCADE;
ALTER TABLE eleven_up_revisions DROP CONSTRAINT eleven_up_revisions_game_id_fkey, ADD CONSTRAINT eleven_up_revisions_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
-- Shared score facts. Arcade retains its own lifecycle and presentation.
CREATE TABLE private.multiplayer_score_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
 dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 game text NOT NULL, ruleset text NOT NULL REFERENCES private.arcade_rulesets(id),
 score bigint NOT NULL CHECK(score>=0), completed_at timestamptz NOT NULL,
 record jsonb NOT NULL, UNIQUE(dealer_game_id,player_id)
);
ALTER TABLE private.multiplayer_score_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.multiplayer_score_results FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX multiplayer_score_results_board ON private.multiplayer_score_results(game,ruleset,score DESC);
CREATE VIEW private.all_score_results AS
 SELECT run_id,user_id,game,ruleset,score,completed_at,NULL::uuid dealer_game_id FROM private.arcade_results
 UNION ALL
 SELECT id,user_id,game,ruleset,score,completed_at,dealer_game_id FROM private.multiplayer_score_results;
REVOKE ALL ON private.all_score_results FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.score_record(p_game text,p_ruleset text,p_user uuid,p_score bigint,p_dealer uuid DEFAULT NULL,p_peers jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE personal bigint;overall bigint;peer_best bigint;place bigint;group_i text:=private.arcade_score_group(p_game,p_ruleset);
BEGIN
 -- One comparison boundary for Arcade and multiplayer, including concurrent completions.
 PERFORM pg_advisory_xact_lock(hashtextextended('score:'||p_game||':'||group_i,0));
 SELECT max(score) FILTER(WHERE user_id=p_user),max(score),1+count(*) FILTER(WHERE score>p_score)
 INTO personal,overall,place FROM private.all_score_results
 WHERE game=p_game AND private.arcade_score_group(game,ruleset)=group_i
 AND (p_dealer IS NULL OR dealer_game_id IS DISTINCT FROM p_dealer);
 place:=place+(SELECT count(*) FROM jsonb_array_elements(p_peers) p WHERE (p->>'score')::bigint>p_score);
 SELECT max((p->>'score')::bigint) INTO peer_best FROM jsonb_array_elements(p_peers) p;
 RETURN jsonb_build_object('priorBest',personal,'kind',CASE WHEN personal IS NULL THEN 'first' WHEN p_score>personal THEN 'broken' WHEN p_score=personal THEN 'matched' ELSE 'lower' END,
 'overallPriorBest',overall,'overallKind',CASE WHEN p_score<peer_best THEN 'lower' WHEN overall IS NULL THEN 'first' WHEN p_score>overall THEN 'broken' WHEN p_score=overall THEN 'matched' ELSE 'lower' END,
 'rank',place,'topTen',place<=10);
END $$;
REVOKE ALL ON FUNCTION private.score_record(text,text,uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.arcade_score_facts() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record:=private.score_record(NEW.game,NEW.ruleset,NEW.user_id,NEW.score);RETURN NEW;END $$;
CREATE TRIGGER arcade_score_facts BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION private.arcade_score_facts();
REVOKE ALL ON FUNCTION private.arcade_score_facts() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.eleven_up_record_scores(p_dealer uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.eleven_up_matches;member jsonb;peers jsonb;facts jsonb;answer jsonb:='{}';at_time timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer;
 IF m.state->>'phase'<>'complete' OR EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE coalesce((p->>'isBot')::boolean,false) OR p->>'userId' IS NULL) THEN RETURN answer;END IF;
 -- Completion must contain each player's own complete, compatible performance.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE
  (SELECT array_agg((r->>'stage')::int ORDER BY (r->>'stage')::int) FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id') IS DISTINCT FROM
   CASE WHEN private.eleven_up_bonus_qualified((SELECT (r->>'score')::bigint FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id' AND r->>'stage'='2' LIMIT 1),m.state->'rules') THEN ARRAY[1,2,3] ELSE ARRAY[1,2] END OR
  (SELECT (r->>'score')::bigint FROM jsonb_array_elements(m.state->'stages') r WHERE r->>'playerId'=p->>'id' ORDER BY (r->>'stage')::int DESC LIMIT 1) IS DISTINCT FROM (m.state->'scores'->>(p->>'id'))::bigint) THEN RETURN answer;END IF;
 SELECT jsonb_agg(jsonb_build_object('score',value::bigint)) INTO peers FROM jsonb_each_text(m.state->'scores');
 FOR member IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
  SELECT record INTO facts FROM private.multiplayer_score_results WHERE dealer_game_id=p_dealer AND player_id=(member->>'id')::uuid;
  IF NOT FOUND THEN
   facts:=private.score_record('eleven-up',m.state#>>'{rules,version}',(member->>'userId')::uuid,(m.state->'scores'->>(member->>'id'))::bigint,p_dealer,peers);
   INSERT INTO private.multiplayer_score_results(session_id,dealer_game_id,player_id,user_id,game,ruleset,score,completed_at,record)
   VALUES(m.game_id,p_dealer,(member->>'id')::uuid,(member->>'userId')::uuid,'eleven-up',m.state#>>'{rules,version}',(m.state->'scores'->>(member->>'id'))::bigint,at_time,facts);
  END IF;
  answer:=answer||jsonb_build_object(member->>'id',facts);
 END LOOP;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION private.eleven_up_record_scores(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.multiplayer_score_history() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.completed_at DESC),'[]') FROM
 (SELECT s.id,s.session_id,s.game,s.ruleset,s.score,s.record,s.completed_at,g.real_money,coalesce(p.username,'Player') name
 FROM private.multiplayer_score_results s JOIN public.games g ON g.id=s.session_id LEFT JOIN public.profiles p ON p.id=s.user_id
 WHERE s.user_id=auth.uid() ORDER BY s.completed_at DESC LIMIT 100) r
$$;
REVOKE ALL ON FUNCTION public.multiplayer_score_history() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.multiplayer_score_history() TO authenticated;

CREATE OR REPLACE FUNCTION private.eleven_up_board_reduce(b jsonb, action text, items integer[], at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 IF b#>>'{rules,version}' IN ('eleven-up/1','eleven-up/2') AND NOT private.eleven_up_has_group(b) AND NOT private.eleven_up_can_pass(b) THEN RETURN private.eleven_up_board_finish(b,'blocked',at_ms);END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce_v2(b jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE phase text:=b->>'phase'; run_i integer; points integer; before_i integer; cursor_i integer:=(b->>'cursor')::integer;
BEGIN
 IF phase NOT IN ('ready','playing') THEN RAISE EXCEPTION 'tri_towers:phase';END IF;
 IF at_ms>=(b->>'deadline')::bigint THEN RETURN private.tri_towers_board_finish_v2(b,CASE WHEN phase='ready' THEN 'ready_timeout' ELSE 'timeout' END,at_ms);END IF;
 IF action='tick' THEN RETURN b;END IF;
 -- Validate BEFORE admitting the playing clock. Invalid actions cannot start it.
 IF action='remove' THEN
  IF private.tri_towers_legal(b,idx) IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers:illegal_move';END IF;
 ELSIF action='draw' THEN
  IF cursor_i>=52 THEN RAISE EXCEPTION 'tri_towers:stock_empty';END IF;
 ELSIF action<>'take_score' OR phase<>'playing' THEN RAISE EXCEPTION 'tri_towers:invalid_action';END IF;
 IF phase='ready' THEN b:=b||jsonb_build_object('phase','playing','deadline',at_ms+(b#>>'{rules,stageMs}')::bigint);END IF;
 IF action='take_score' THEN RETURN private.tri_towers_board_finish_v2(b,'take_score',at_ms);END IF;
 IF action='remove' THEN
  run_i:=(b->>'run')::integer+1;
  points:=(b->'rules'->'streakAwards'->>least(run_i-1,jsonb_array_length(b#>'{rules,streakAwards}')-1))::integer;
  b:=b||jsonb_build_object('removed',(b->'removed')||to_jsonb(idx),'waste',b->'deck'->idx);
  IF idx<3 THEN points:=points+(b->'rules'->'peakBonuses'->>((SELECT count(*) FROM jsonb_array_elements_text(b->'removed') r WHERE r::integer<3)-1)::integer)::integer;END IF;
  b:=b||jsonb_build_object('run',run_i,'score',(b->>'score')::integer+points,'event',jsonb_build_object('label',CASE WHEN idx<3 THEN 'Tower cleared' ELSE 'Streak '||run_i END,'points',points));
 ELSE
  before_i:=(b->>'score')::integer;points:=greatest(0,before_i-(b#>>'{rules,drawPenalty}')::integer)-before_i;
  b:=b||jsonb_build_object('cursor',cursor_i+1,'waste',b->'deck'->cursor_i,'run',0,'score',before_i+points,'event',jsonb_build_object('label','Stock drawn','points',points));
 END IF;
 IF jsonb_array_length(b->'removed')=28 THEN RETURN private.tri_towers_board_finish_v2(b,'cleared',at_ms);END IF;
 IF b#>>'{rules,version}'<>'tri-towers/5' AND (b->>'cursor')::integer=52 AND NOT EXISTS(SELECT 1 FROM generate_series(0,27) i WHERE private.tri_towers_legal(b,i)) THEN
  RETURN private.tri_towers_board_finish_v2(b,'exhausted',at_ms);
 END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_board_deal(b jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 b:=private.tri_towers_board_deal_v2(b,at_ms);
 IF b#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4','tri-towers/5') THEN b:=b||jsonb_build_object('phase','intro','deadline',at_ms+(b#>>'{rules,roundIntroMs}')::bigint);END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce(b jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF b#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4','tri-towers/5') AND b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN
   IF action='tick' THEN RETURN b;END IF;
   RAISE EXCEPTION 'tri_towers:round_intro';
  END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);
 END IF;
 b:=private.tri_towers_board_reduce_v2(b,action,idx,at_ms);
 IF b#>>'{rules,version}' IN ('tri-towers/4','tri-towers/5') AND b->>'phase'='stage_complete' AND b#>>'{result,reason}'='cleared' THEN
  -- Absolute result identity/time, never additive: replay cannot extend the hold.
  b:=jsonb_set(b,'{deadline}',to_jsonb((b#>>'{result,completedAt}')::bigint+(b#>>'{rules,holdMs}')::bigint+(b#>>'{rules,clearCelebrationMs}')::bigint));
 END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE totals jsonb;
BEGIN
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN RETURN private.tri_towers_deal_v1(s,at_ms);END IF;
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.tri_towers_board_deal(s||jsonb_build_object('scores',totals,'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_reduce(s jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN RETURN private.tri_towers_reduce_v1(s,action,idx,at_ms);END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'tri_towers:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'tri_towers:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;
  ELSIF next_i>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p->>'id' ORDER BY ord),'[]'::jsonb) INTO qualified FROM jsonb_array_elements(s->'players') WITH ORDINALITY a(p,ord)
    WHERE private.tri_towers_bonus_qualified_v2((s->'scores'->>(p->>'id'))::bigint,s->'rules');
   s:=s||jsonb_build_object('qualified',qualified);round_i:=3;next_i:=0;
  END IF;
  IF round_i=3 THEN
   WHILE next_i<n AND NOT coalesce(s->'qualified','[]'::jsonb) ? (s->'players'->next_i->>'id') LOOP next_i:=next_i+1;END LOOP;
  END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.tri_towers_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),at_ms);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.tri_towers_board_reduce(board,action,idx,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'tri_towers:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_bot_choice(v jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE i integer; best_i integer; value_i integer; best_value integer:=-1; next_points integer; peaks integer; r jsonb; uncovered integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') THEN RETURN private.tri_towers_bot_choice_v1(v,at_ms);END IF;
 IF v->>'phase' NOT IN ('ready','playing') THEN RETURN NULL;END IF;
 IF v->>'phase'='playing' AND (v->>'deadline')::bigint-at_ms<=2500 THEN RETURN jsonb_build_object('action','take_score');END IF;
 next_points:=(v->'rules'->'streakAwards'->>least((v->>'run')::integer,jsonb_array_length(v#>'{rules,streakAwards}')-1))::integer;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i IS NULL OR v->'cards'->i='null'::jsonb OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  IF abs((v->'cards'->>i)::integer%13-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  value_i:=next_points+uncovered*200;
  IF i<3 THEN SELECT count(*) INTO peaks FROM jsonb_array_elements_text(v->'removed') p WHERE p::integer<3;value_i:=value_i+(v->'rules'->'peakBonuses'->>peaks)::integer;END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $function$
;
CREATE OR REPLACE FUNCTION public.arcade_tri_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'tri-towers' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('remove','draw','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_index)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.tri_towers_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_tri_advance(s,at_ms);
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
    s:=jsonb_set(s,'{board}',private.tri_towers_board_reduce(s->'board',p_action,p_index,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_tri_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
END $function$
;
CREATE OR REPLACE FUNCTION private.arcade_tri_projection(run private.arcade_runs, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.tri_towers_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','cards','removed','waste','run','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'highRun',private.arcade_tri_high_run(run),
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',CASE WHEN run.ruleset IN ('tri-towers/4','tri-towers/5') THEN (result->>'completedAt')::bigint ELSE (b->>'deadline')::bigint-(run.config->>'holdMs')::bigint END,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present_scene(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id) IN ('tri-towers/4','tri-towers/5') THEN
  PERFORM public.tri_towers_snapshot(p_dealer_game_id);
  RAISE EXCEPTION 'TriTowers updated. Refresh to continue.';
 END IF;
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}'='tri-towers/3' THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id) IN ('tri-towers/3','tri-towers/4','tri-towers/5') THEN
  PERFORM public.tri_towers_snapshot(p_dealer_game_id);
  RAISE EXCEPTION 'TriTowers updated. Refresh to continue.';
 END IF;
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i);
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present_celebration(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4','tri-towers/5') THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;
END $function$
;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) SELECT 'eleven-up/3',game,config||'{"version":"eleven-up/3","manualStuck":true}'::jsonb,true FROM private.arcade_rulesets WHERE id='eleven-up/2';
UPDATE private.arcade_rulesets SET enabled=false WHERE game='eleven-up' AND id<>'eleven-up/3';
INSERT INTO private.arcade_rulesets(id,game,config,enabled) SELECT 'tri-towers/5',game,config||'{"version":"tri-towers/5","manualStuck":true}'::jsonb,true FROM private.arcade_rulesets WHERE id='tri-towers/4';
UPDATE private.arcade_rulesets SET enabled=false WHERE game='tri-towers' AND id<>'tri-towers/5';
CREATE OR REPLACE FUNCTION private.tri_towers_rules() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT config FROM private.arcade_rulesets WHERE id='tri-towers/5' $$;
CREATE OR REPLACE FUNCTION public.arcade_leaderboard(p_actor uuid, p_game text, p_window text, p_result uuid DEFAULT NULL::uuid, p_ruleset text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE version_i text;current_i text;answer jsonb;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 SELECT id INTO current_i FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
 version_i:=coalesce(p_ruleset,current_i);
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id=version_i AND game=p_game) THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 IF version_i IS NULL THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 WITH eligible AS (
  SELECT user_id,score,completed_at,run_id FROM private.all_score_results
   WHERE game=p_game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(p_game,version_i) AND (p_window='all' OR completed_at>=statement_timestamp()-interval '30 days')
 ), ranked AS (
  SELECT b.*,rank() OVER(ORDER BY score DESC) place FROM eligible b
 ), named AS (
  SELECT jsonb_build_object('runId',r.run_id,'userId',r.user_id,'name',coalesce(p.username,'Player'),'score',r.score,'rank',r.place,'completedAt',r.completed_at) item,r.*
   FROM ranked r LEFT JOIN public.profiles p ON p.id=r.user_id
 )
 SELECT jsonb_build_object('ruleset',version_i,'currentRuleset',current_i,'compatibleRulesets',(SELECT jsonb_agg(id ORDER BY id) FROM private.arcade_rulesets WHERE game=p_game AND private.arcade_score_group(game,id)=private.arcade_score_group(p_game,version_i)),'availableRulesets',(SELECT jsonb_agg(id ORDER BY id DESC) FROM(SELECT max(id) id FROM private.arcade_rulesets WHERE game=p_game AND (p_game<>'tri-towers' OR enabled OR EXISTS(SELECT 1 FROM private.all_score_results r WHERE r.ruleset=private.arcade_rulesets.id)) GROUP BY private.arcade_score_group(game,id)) groups),
  'rows',coalesce((SELECT jsonb_agg(item ORDER BY score DESC,completed_at,run_id) FROM(SELECT * FROM named ORDER BY score DESC,completed_at,run_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor ORDER BY score DESC,completed_at,run_id LIMIT 1),
  'personalBest',(SELECT max(score) FROM private.all_score_results WHERE user_id=p_actor AND game=p_game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(p_game,version_i)),
  'previousBests',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM(SELECT ruleset,max(score) score FROM private.all_score_results WHERE user_id=p_actor AND game=p_game AND private.arcade_score_group(game,ruleset)<>private.arcade_score_group(p_game,version_i) GROUP BY ruleset)b),'[]'),
  'activeRun',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active'),
  'latestResult',(SELECT jsonb_build_object('id',id,'score',score,'status',status,'ruleset',ruleset,'rank',(SELECT place FROM ranked WHERE run_id=p_result)) FROM private.arcade_runs WHERE id=p_result AND user_id=p_actor AND game=p_game AND status<>'active')) INTO answer;
 RETURN answer;
END $function$
;
CREATE OR REPLACE FUNCTION private.eleven_up_settle(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 UPDATE private.eleven_up_matches SET settlement=changes,revision=revision+1,state=state||jsonb_build_object('terminal',jsonb_build_object('resultId',result_id,'winnerIds',to_jsonb(winners),'score',(SELECT max(value::bigint) FROM jsonb_each_text(m.state->'scores')),'startedAt',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+3000,'achievements',private.eleven_up_record_scores(m.dealer_game_id))) WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='11 Up complete',awaiting_next_round=false WHERE id=m.game_id;
END $function$
;
CREATE OR REPLACE FUNCTION public.eleven_up_snapshot(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.eleven_up_matches; viewer uuid; paused boolean; balances jsonb; batch public.gameplay_transfer_batches; result_id uuid;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND (status<>'left' OR m.finished) AND NOT is_bot;
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
END $function$
;
CREATE OR REPLACE FUNCTION private.eleven_up_finish_postgame(p_dealer_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.eleven_up_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NULL THEN RAISE EXCEPTION 'eleven_up:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF coalesce((m.state#>>'{terminal,deadline}')::bigint,0)>floor(extract(epoch FROM clock_timestamp())*1000) THEN RETURN;END IF;
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
END $function$
;
REVOKE ALL ON FUNCTION private.eleven_up_finish_postgame(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.eleven_up_close(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE session uuid; BEGIN SELECT game_id INTO STRICT session FROM private.eleven_up_matches WHERE dealer_game_id=p_dealer_game_id;
IF NOT private.eleven_up_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=session AND user_id=auth.uid() AND status<>'left' AND NOT is_bot) THEN RAISE EXCEPTION 'eleven_up:close_denied' USING ERRCODE='42501';END IF;
PERFORM private.eleven_up_finish_postgame(p_dealer_game_id);END $$;
CREATE OR REPLACE FUNCTION private.eleven_up_recover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.eleven_up_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM private.eleven_up_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;
 END LOOP;RETURN count_i;
END $function$
;
