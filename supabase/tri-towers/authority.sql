-- Additive authority source. Activation is in the versioned migration.
SET LOCAL lock_timeout = '100ms';
SET LOCAL statement_timeout = '10s';
CREATE TABLE private.tri_towers_release (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.tri_towers_release DEFAULT VALUES;
ALTER TABLE private.tri_towers_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tri_towers_release FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.tri_towers_matches (
 dealer_game_id uuid PRIMARY KEY,
 game_id uuid NOT NULL, round_id uuid NOT NULL,
 state jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0, stake integer NOT NULL CHECK(stake>0),
 settlement jsonb, finished boolean NOT NULL DEFAULT false, paused_at bigint,
 bot_due_at bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tri_towers_matches_session ON private.tri_towers_matches(game_id);
CREATE INDEX tri_towers_matches_pending ON private.tri_towers_matches(((state->>'deadline')::bigint)) WHERE NOT finished AND settlement IS NULL;
CREATE INDEX tri_towers_matches_due ON private.tri_towers_matches(least((state->>'deadline')::bigint,bot_due_at),dealer_game_id) WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL;
CREATE TABLE private.tri_towers_requests (
 dealer_game_id uuid NOT NULL REFERENCES private.tri_towers_matches(dealer_game_id),
 request_id uuid NOT NULL, actor uuid NOT NULL, command jsonb NOT NULL,
 PRIMARY KEY(dealer_game_id,request_id)
);
CREATE TABLE private.tri_towers_history (
 dealer_game_id uuid NOT NULL REFERENCES private.tri_towers_matches(dealer_game_id),
 revision bigint NOT NULL, frame jsonb NOT NULL, PRIMARY KEY(dealer_game_id,revision)
);
ALTER TABLE private.tri_towers_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tri_towers_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tri_towers_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tri_towers_matches,private.tri_towers_requests,private.tri_towers_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.tri_towers_revisions (
 dealer_game_id uuid PRIMARY KEY REFERENCES private.tri_towers_matches(dealer_game_id),
 game_id uuid NOT NULL, revision bigint NOT NULL
);
ALTER TABLE public.tri_towers_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tri_towers_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.tri_towers_revisions TO authenticated;
CREATE POLICY tri_towers_member_read ON public.tri_towers_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.players p WHERE p.game_id=tri_towers_revisions.game_id AND p.user_id=(SELECT auth.uid()) AND p.status<>'left'));

-- Same approved-account eligibility as Run21; independent game release gate.
CREATE FUNCTION private.tri_towers_actor_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)
  AND EXISTS(SELECT 1 FROM private.tri_towers_release WHERE singleton AND enabled)
$$;
CREATE FUNCTION public.tri_towers_capabilities(p_session_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); allowed boolean:=private.tri_towers_actor_allowed(actor);
BEGIN
 IF p_session_id IS NOT NULL THEN
  allowed:=allowed AND EXISTS(SELECT 1 FROM public.games WHERE id=p_session_id AND real_money=false)
   AND EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND user_id=actor AND status<>'left')
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=p_session_id AND status<>'left' AND NOT is_bot AND NOT private.tri_towers_actor_allowed(user_id));
 END IF;
 RETURN jsonb_build_object('version',1,'enabled',allowed,'user_id',actor,'session_id',p_session_id,'fake_money_only',true);
END $$;

CREATE FUNCTION private.tri_towers_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":"ptown-tritowers/1","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"runStep":1000,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":100,"wrap":true}'::jsonb
$$;
CREATE FUNCTION private.tri_towers_children(i integer) RETURNS integer[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN i<3 THEN ARRAY[3+i*2,4+i*2] WHEN i<9 THEN ARRAY[9+((i-3)/2)*3+(i-3)%2,10+((i-3)/2)*3+(i-3)%2] WHEN i<18 THEN ARRAY[18+i-9,19+i-9] ELSE ARRAY[]::integer[] END
$$;
CREATE FUNCTION private.tri_towers_exposed(s jsonb,i integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT i BETWEEN 0 AND 27 AND NOT s->'removed' @> to_jsonb(i) AND NOT EXISTS(SELECT 1 FROM unnest(private.tri_towers_children(i)) c WHERE NOT s->'removed' @> to_jsonb(c))
$$;
CREATE FUNCTION private.tri_towers_legal(s jsonb,i integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT private.tri_towers_exposed(s,i) AND abs((s->'deck'->>i)::integer%13-(s->>'waste')::integer%13) IN (1,12)
$$;
CREATE FUNCTION private.tri_towers_shuffle() RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cards integer[]:=ARRAY(SELECT generate_series(0,51)); i integer; j integer; n integer; b bytea; tmp integer;
BEGIN
 FOR i IN REVERSE 52..2 LOOP
  -- Rejection sampling of pgcrypto bytes, not random(), modulo bias, or a seed.
  LOOP b:=extensions.gen_random_bytes(1);n:=get_byte(b,0);EXIT WHEN n<(256/i)*i;END LOOP;
  j:=n%i+1;tmp:=cards[i];cards[i]:=cards[j];cards[j]:=tmp;
 END LOOP;
 RETURN to_jsonb(cards);
END $$;
CREATE FUNCTION private.tri_towers_deal(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE deck jsonb:=private.tri_towers_shuffle();
BEGIN
 RETURN s||jsonb_build_object('deck',deck,'removed','[]'::jsonb,'cursor',29,'waste',deck->28,'run',0,'phase','ready',
   'deadline',at_ms+(s#>>'{rules,readyMs}')::bigint,'event',jsonb_build_object('label','Ready','points',0));
END $$;
CREATE FUNCTION private.tri_towers_finish_player(s jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; idx integer:=(s->>'turnIndex')::integer+1;
BEGIN
 IF s->'scores' ? player THEN RAISE EXCEPTION 'tri_towers:score_already_final'; END IF;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score')||jsonb_build_object('turnIndex',idx,'stage',1,'score',0);
 IF idx=jsonb_array_length(s->'players') THEN
  RETURN s||jsonb_build_object('phase','complete','deadline',0,'event',jsonb_build_object('label','Competition complete','points',0));
 END IF;
 RETURN private.tri_towers_deal(s,at_ms);
END $$;
CREATE FUNCTION private.tri_towers_finish_stage(s jsonb,reason text,bonus integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; stage_i integer:=(s->>'stage')::integer;
 before_i integer; total_i integer:=(s->>'score')::integer+bonus; result jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=stage_i) THEN RAISE EXCEPTION 'tri_towers:stage_already_final';END IF;
 SELECT coalesce((SELECT (r->>'score')::integer FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer<stage_i ORDER BY (r->>'stage')::integer DESC LIMIT 1),0) INTO before_i;
 result:=jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,stage_i),
  'playerId',player,'stage',stage_i,'score',total_i,'scoreBefore',before_i,'stageScore',total_i-before_i,
  'timeBonus',bonus,'reason',reason,'completedAt',at_ms,
  'finishTurn',reason IN ('timeout','give_up') OR NOT(stage_i<(s#>>'{rules,stages}')::integer OR(stage_i=(s#>>'{rules,stages}')::integer AND total_i>=(s#>>'{rules,bonusThreshold}')::integer)));
 RETURN s||jsonb_build_object('score',total_i,'stages',(s->'stages')||jsonb_build_array(result),'phase','stage_complete',
  'deadline',at_ms+(s#>>'{rules,holdMs}')::bigint,'event',jsonb_build_object('label',CASE reason WHEN 'cleared' THEN 'All Three Towers Cleared!' WHEN 'take_score' THEN 'Score taken' WHEN 'timeout' THEN 'Time expired' WHEN 'give_up' THEN 'Turn given up' ELSE 'Stage complete' END,'points',bonus));
END $$;

CREATE FUNCTION private.tri_towers_reduce(s jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=s->>'phase'; points integer:=0; cursor_i integer:=(s->>'cursor')::integer; cleared boolean;
 player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; stage_i integer:=(s->>'stage')::integer; run_i integer;
BEGIN
 IF phase='complete' THEN RAISE EXCEPTION 'tri_towers:complete'; END IF;
 -- A committed result is immutable. Legacy Continue/Give Up cannot shorten its hold.
 IF phase='stage_complete' THEN
  IF at_ms<(s->>'deadline')::bigint THEN
   IF action IN ('tick','continue') THEN RETURN s;END IF;
   RAISE EXCEPTION 'tri_towers:phase';
  END IF;
  IF coalesce((s->'stages'->-1->>'finishTurn')::boolean,
   NOT(stage_i<(s#>>'{rules,stages}')::integer OR(stage_i=(s#>>'{rules,stages}')::integer AND (s->>'score')::integer>=(s#>>'{rules,bonusThreshold}')::integer))) THEN
   RETURN private.tri_towers_finish_player(s,at_ms);
  END IF;
  RETURN private.tri_towers_deal(s||jsonb_build_object('stage',stage_i+1),at_ms)||jsonb_build_object('phase','playing',
   'deadline',at_ms+(s#>>'{rules,stageMs}')::bigint,'event',jsonb_build_object('label','Stage started','points',0));
 END IF;
 IF at_ms>=(s->>'deadline')::bigint OR action='give_up' THEN
  IF phase='playing' THEN RETURN private.tri_towers_finish_stage(s,CASE WHEN at_ms>=(s->>'deadline')::bigint THEN 'timeout' ELSE 'give_up' END,0,at_ms);END IF;
  RETURN private.tri_towers_finish_player(s,at_ms);
 END IF;
 IF action='tick' THEN RETURN s; END IF;
 IF phase='ready' AND action='start' THEN RETURN s||jsonb_build_object('phase','playing','deadline',at_ms+(s#>>'{rules,stageMs}')::bigint,'event',jsonb_build_object('label','Stage started','points',0)); END IF;
 IF phase<>'playing' THEN RAISE EXCEPTION 'tri_towers:phase'; END IF;
 IF action='take_score' THEN RETURN private.tri_towers_finish_stage(s,'take_score',0,at_ms);END IF;
 IF action='remove' THEN
  IF private.tri_towers_legal(s,idx) IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers:illegal_move'; END IF;
  s:=s||jsonb_build_object('removed',(s->'removed')||to_jsonb(idx),'waste',s->'deck'->idx);
  run_i:=(s->>'run')::integer+1;points:=run_i*(s#>>'{rules,runStep}')::integer;
  IF idx<3 THEN points:=points+(s->'rules'->'peakBonuses'->>((SELECT count(*) FROM jsonb_array_elements_text(s->'removed') r WHERE r::integer<3)-1)::integer)::integer; END IF;
  s:=s||jsonb_build_object('run',run_i,'score',(s->>'score')::integer+points,'event',jsonb_build_object('label',CASE WHEN idx<3 THEN 'Tower cleared' ELSE 'Run '||run_i END,'points',points));
 ELSIF action='draw' THEN
  IF cursor_i>=52 THEN RAISE EXCEPTION 'tri_towers:stock_empty'; END IF;
  s:=s||jsonb_build_object('cursor',cursor_i+1,'waste',s->'deck'->cursor_i,'run',0,'event',jsonb_build_object('label','Stock drawn','points',0));
 ELSE RAISE EXCEPTION 'tri_towers:invalid_action'; END IF;
 cleared:=jsonb_array_length(s->'removed')=28;
 IF cleared OR ((s->>'cursor')::integer=52 AND NOT EXISTS(SELECT 1 FROM generate_series(0,27) i WHERE private.tri_towers_legal(s,i))) THEN
  points:=CASE WHEN cleared THEN greatest(0,((s->>'deadline')::bigint-at_ms)/1000)*(s#>>'{rules,timePerSecond}')::integer ELSE 0 END;
  RETURN private.tri_towers_finish_stage(s,CASE WHEN cleared THEN 'cleared' ELSE 'exhausted' END,points,at_ms);
 END IF;
 RETURN s;
END $$;

CREATE FUNCTION private.tri_towers_visible(s jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (s-'deck')||jsonb_build_object('cards',(SELECT jsonb_agg(CASE WHEN private.tri_towers_exposed(s,i) THEN s->'deck'->i ELSE 'null'::jsonb END ORDER BY i) FROM generate_series(0,27) i),'stockRemaining',52-(s->>'cursor')::integer,
 'activePlayerId',CASE WHEN s->>'phase'='complete' THEN NULL ELSE s->'players'->(s->>'turnIndex')::integer->>'id' END)
$$;
CREATE FUNCTION private.tri_towers_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.tri_towers_revisions VALUES(NEW.dealer_game_id,NEW.game_id,NEW.revision)
 ON CONFLICT(dealer_game_id) DO UPDATE SET revision=EXCLUDED.revision;
 INSERT INTO private.tri_towers_history VALUES(NEW.dealer_game_id,NEW.revision,private.tri_towers_visible(NEW.state)) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER tri_towers_publish AFTER INSERT OR UPDATE ON private.tri_towers_matches FOR EACH ROW EXECUTE FUNCTION private.tri_towers_publish();

CREATE FUNCTION public.tri_towers_snapshot(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; viewer uuid; paused boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot;
 IF viewer IS NULL OR NOT private.tri_towers_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'tri_towers:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 RETURN private.tri_towers_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished)
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $$;
CREATE FUNCTION public.tri_towers_history(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.tri_towers_snapshot(p_dealer_game_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'frame',frame) ORDER BY revision) FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id),'[]'::jsonb);
END $$;

CREATE FUNCTION private.tri_towers_settle(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; g public.games; winners uuid[]; win_count integer; total integer; deltas jsonb; transfers jsonb:='[]';
 result_id uuid; player jsonb; winner uuid; loser uuid; amount integer; changes jsonb:='{}'; allocated integer;
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN; END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.status<>'in_progress' OR g.is_paused
  OR m.state->>'phase'<>'complete' OR (SELECT count(*) FROM jsonb_object_keys(m.state->'scores'))<>jsonb_array_length(m.state->'players') THEN RAISE EXCEPTION 'tri_towers:not_terminal'; END IF;
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
  IF allocated<>0 THEN RAISE EXCEPTION 'tri_towers:unbalanced_settlement'; END IF;
 END LOOP;
 INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,settlement_key,game_type,winner_player_id,winner_username,winning_hand_description,pot_won,player_chip_changes,is_chopped)
 VALUES(m.game_id,m.dealer_game_id,1,'tri_towers_terminal','tri-towers',CASE WHEN win_count=1 THEN winners[1] END,
  CASE WHEN win_count>1 THEN 'Tie' ELSE (SELECT p->>'name' FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=winners[1]::text) END,
  'TriTowers: '||(m.state->'scores')::text,total,changes,win_count>1) RETURNING id INTO result_id;
 IF jsonb_array_length(transfers)>0 THEN PERFORM public.settle_gameplay_chip_transfers(m.game_id,transfers,'win'); END IF;
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,player_id,user_id,username,chips,is_bot,hand_number)
 SELECT p.game_id,m.dealer_game_id,p.id,p.user_id,coalesce(pr.username,'Player'),p.chips,p.is_bot,1 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=m.game_id
 ON CONFLICT(game_id,dealer_game_id,hand_number,player_id) DO UPDATE SET chips=EXCLUDED.chips,created_at=clock_timestamp();
 UPDATE private.tri_towers_matches SET settlement=changes,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 UPDATE public.games SET status=CASE WHEN pending_session_end THEN 'session_ended' ELSE 'game_over' END,
  session_ended_at=CASE WHEN pending_session_end THEN clock_timestamp() ELSE session_ended_at END,pending_session_end=false,
  game_over_at=clock_timestamp(),last_round_result='TriTowers complete',awaiting_next_round=false WHERE id=m.game_id;
END $$;

CREATE FUNCTION public.tri_towers_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_index integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.tri_towers_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'index',p_index); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.tri_towers_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'tri_towers:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('start','remove','draw','continue','give_up','take_score') THEN RAISE EXCEPTION 'tri_towers:invalid_command'; END IF;
 SELECT * INTO prior FROM private.tri_towers_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'tri_towers:replay_conflict'; END IF;
  RETURN public.tri_towers_snapshot(p_dealer_game_id);
 END IF;
 IF g.real_money IS DISTINCT FROM false OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'tri_towers:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'tri_towers:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'tri_towers:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.tri_towers_reduce(m.state,p_action,p_index,at_ms);
 INSERT INTO private.tri_towers_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id); END IF;
 RETURN public.tri_towers_snapshot(m.dealer_game_id);
END $$;

-- Called by the game's recovery job, not browsers. It makes progress with zero clients.
-- Private policy receives only tri_towers_visible(state), never the private deck.
CREATE FUNCTION private.tri_towers_bot_choice(v jsonb,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i integer; j integer; k integer; r jsonb; rr jsonb; uncovered integer; options integer; followups integer;
 value_i integer; best_value integer:=-1; best_i integer; rank_i integer; peak_count integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v->>'phase'='ready' THEN RETURN jsonb_build_object('action','start');END IF;
 IF v->>'phase'<>'playing' THEN RETURN NULL;END IF;
 -- Points cannot be lost by drawing. Bank before timeout forfeits later stages.
 IF (v->>'deadline')::bigint-at_ms<=5000 THEN RETURN jsonb_build_object('action','take_score');END IF;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i='null'::jsonb OR v->'cards'->i IS NULL OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  rank_i:=(v->'cards'->>i)::integer%13;
  IF abs(rank_i-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  options:=0;followups:=0;
  FOR j IN 0..27 LOOP
   IF j=i OR v->'cards'->j='null'::jsonb OR v->'cards'->j IS NULL OR v->'removed' @> to_jsonb(j) THEN CONTINUE;END IF;
   IF abs((v->'cards'->>j)::integer%13-rank_i) NOT IN (1,12) THEN CONTINUE;END IF;
   options:=options+1;
   rr:=r||jsonb_build_object('removed',(r->'removed')||to_jsonb(j));
   SELECT count(*) INTO k FROM generate_series(0,27) x
    WHERE x<>i AND x<>j AND v->'cards'->x<>'null'::jsonb AND private.tri_towers_exposed(rr,x)
     AND abs((v->'cards'->>x)::integer%13-(v->'cards'->>j)::integer%13) IN (1,12);
   followups:=greatest(followups,k);
  END LOOP;
  value_i:=((v->>'run')::integer+1)*(v#>>'{rules,runStep}')::integer+uncovered*2000+options*900+followups*400;
  IF i<3 THEN
   SELECT count(*) INTO peak_count FROM jsonb_array_elements_text(v->'removed') x WHERE x::integer<3;
   value_i:=value_i+(v->'rules'->'peakBonuses'->>peak_count)::integer;
  END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $$;

CREATE FUNCTION private.tri_towers_schedule_bot() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
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
END $$;

CREATE FUNCTION private.tri_towers_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; m private.tri_towers_matches; g public.games; at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000); count_i integer:=0; choice jsonb; actor uuid;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.game_id,work.round_id,work.revision,work.state->>'phase' phase,work.state->>'stage' stage,
   work.state->'players'->(work.state->>'turnIndex')::integer->>'id' player_id
  FROM private.tri_towers_matches work JOIN public.games live ON live.id=work.game_id
  WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL
   AND least((work.state->>'deadline')::bigint,work.bot_due_at)<=at_ms
   AND live.real_money=false AND live.status='in_progress' AND live.game_type='tri-towers'
   AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused
  ORDER BY least((work.state->>'deadline')::bigint,work.bot_due_at),work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.real_money IS DISTINCT FROM false OR g.is_paused OR g.status<>'in_progress'
   OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.tri_towers_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.revision<>candidate.revision
   OR m.game_id<>candidate.game_id OR m.round_id<>candidate.round_id OR m.state->>'phase' IS DISTINCT FROM candidate.phase
   OR m.state->>'stage' IS DISTINCT FROM candidate.stage
   OR m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM candidate.player_id
   OR least((m.state->>'deadline')::bigint,m.bot_due_at)>at_ms THEN CONTINUE;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   m.state:=private.tri_towers_reduce(m.state,'tick',NULL,at_ms);
  ELSE
   actor:=candidate.player_id::uuid;
   IF m.bot_due_at IS NULL OR m.bot_due_at>at_ms
    OR NOT coalesce((m.state->'players'->(m.state->>'turnIndex')::integer->>'isBot')::boolean,false)
    OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=actor AND game_id=m.game_id AND is_bot) THEN CONTINUE;END IF;
   choice:=private.tri_towers_bot_choice(private.tri_towers_visible(m.state),at_ms);
   IF choice IS NULL THEN CONTINUE;END IF;
   m.state:=private.tri_towers_reduce(m.state,choice->>'action',(choice->>'index')::integer,at_ms);
  END IF;
  UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id AND revision=candidate.revision;
  IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id);END IF;
  count_i:=count_i+1;
 END LOOP;
 RETURN count_i;
END $$;

CREATE TRIGGER tri_towers_schedule_bot BEFORE INSERT OR UPDATE ON private.tri_towers_matches FOR EACH ROW EXECUTE FUNCTION private.tri_towers_schedule_bot();

CREATE FUNCTION public.tri_towers_configure(p_game_id uuid,p_dealer_player_id uuid,p_expected_dealer_position integer,p_game_type text,p_config jsonb,p_expected_config_deadline timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; d public.players; dg public.dealer_games; r uuid:=gen_random_uuid(); actor uuid:=auth.uid();
 claim private.dealer_game_setup_commits; hash text; stake_i integer; people jsonb; s jsonb; result jsonb; setup_players jsonb;
BEGIN
 IF NOT private.tri_towers_actor_allowed(actor) OR p_game_type IS DISTINCT FROM 'tri-towers' THEN RAISE EXCEPTION 'tri_towers:release_closed' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game_id FOR UPDATE;
 SELECT * INTO STRICT d FROM public.players WHERE id=p_dealer_player_id AND game_id=g.id;
 IF d.user_id IS DISTINCT FROM actor OR d.is_bot THEN RAISE EXCEPTION 'tri_towers:dealer_required' USING ERRCODE='42501';END IF;
 -- No real-money creation in this release, including direct RPC calls.
 IF g.real_money IS DISTINCT FROM false THEN RAISE EXCEPTION 'tri_towers:real_money_closed' USING ERRCODE='42501';END IF;
 IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]{0,3}$' OR p_expected_config_deadline IS NULL THEN RAISE EXCEPTION 'tri_towers:config';END IF;stake_i:=(p_config->>'ante_amount')::integer;
 hash:=md5(jsonb_build_array(p_game_id,p_dealer_player_id,p_expected_dealer_position,p_config,p_expected_config_deadline)::text);
 SELECT * INTO claim FROM private.dealer_game_setup_commits WHERE game_id=g.id AND expected_config_deadline=p_expected_config_deadline AND expected_dealer_position=p_expected_dealer_position;
 IF FOUND THEN
  IF claim.request_hash<>hash THEN RAISE EXCEPTION 'tri_towers:setup_replay_conflict';END IF;
  IF g.current_game_uuid IS DISTINCT FROM claim.dealer_game_id THEN RAISE EXCEPTION 'tri_towers:setup_retired';END IF;
  RETURN claim.result||'{"outcome":"already_configured","deduped":true}'::jsonb;
 END IF;
 IF d.user_id<>actor OR d.is_bot OR d.sitting_out OR d.status<>'active' OR d.position<>p_expected_dealer_position
 OR g.dealer_position IS DISTINCT FROM p_expected_dealer_position OR g.status NOT IN ('game_selection','configuring')
 OR g.config_deadline IS DISTINCT FROM p_expected_config_deadline OR clock_timestamp()>g.config_deadline OR g.is_paused OR g.pending_session_end THEN RAISE EXCEPTION 'tri_towers:setup_identity';END IF;
 PERFORM 1 FROM public.players WHERE game_id=g.id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status<>'left' AND NOT is_bot AND NOT private.tri_towers_actor_allowed(user_id)) THEN RAISE EXCEPTION 'tri_towers:tester_required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND NOT is_bot) THEN RAISE EXCEPTION 'tri_towers:human_required';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot)
 ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id) INTO people
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id WHERE p.game_id=g.id AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL;
 IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'tri_towers:player_count';END IF;
 IF coalesce(g.pot,0)<>0 THEN RAISE EXCEPTION 'tri_towers:unfinished_pot';END IF;
 -- Established setup-authority handoff flags, scoped to this validated RPC.
 PERFORM set_config('app.cribbage_authoritative_write','on',true);
 PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 PERFORM set_config('app.yahtzee_authoritative_write','on',true);
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'configure');END IF;
 INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g.id,actor,'tri-towers',jsonb_build_object('ante_amount',stake_i,'rules',private.tri_towers_rules())) RETURNING * INTO dg;
 UPDATE public.players SET ante_decision='ante_up',current_decision=NULL,decision_locked=false,auto_fold=false WHERE game_id=g.id AND id IN(SELECT (p->>'id')::uuid FROM jsonb_array_elements(people) p);
 UPDATE public.games SET game_type='tri-towers',current_game_uuid=dg.id,config_complete=true,config_deadline=NULL,ante_decision_deadline=NULL,status='in_progress',ante_amount=stake_i,current_round=1,total_hands=1,replay_contract_version=NULL,all_decisions_in=false,all_decisions_in_round_id=NULL WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot) VALUES(r,g.id,dg.id,1,1,0,'betting',0);
 s:=private.tri_towers_deal(jsonb_build_object('identity',jsonb_build_object('sessionId',g.id,'dealerGameId',dg.id,'roundId',r),
  'players',people,'rules',private.tri_towers_rules(),'turnIndex',0,'stage',1,'score',0,'scores','{}'::jsonb,'stages','[]'::jsonb),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.tri_towers_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(dg.id,g.id,r,s,stake_i);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY position) INTO setup_players FROM public.players p WHERE game_id=g.id;
 result:=jsonb_build_object('outcome','configured','deduped',false,'setup_identity',jsonb_build_object('game_id',g.id,'dealer_position',p_expected_dealer_position,'expected_config_deadline',p_expected_config_deadline),'game',to_jsonb(g),'dealer_game',to_jsonb(dg),'players',setup_players);
 INSERT INTO private.dealer_game_setup_commits(game_id,expected_config_deadline,expected_dealer_position,request_hash,dealer_game_id,result) VALUES(g.id,p_expected_config_deadline,p_expected_dealer_position,hash,dg.id,result);
 RETURN result;
END $$;

CREATE FUNCTION public.tri_towers_close(p_dealer_game_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; g public.games; positions integer[]; next_seat integer; target text; winner uuid; make_take boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 IF NOT private.tri_towers_actor_allowed(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot)
 OR m.settlement IS NULL THEN RAISE EXCEPTION 'tri_towers:close_denied' USING ERRCODE='42501';END IF;
 IF m.finished THEN RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.status NOT IN ('game_over','session_ended') THEN RAISE EXCEPTION 'tri_towers:close_identity';END IF;
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
    SELECT winner_player_id INTO winner FROM public.game_results WHERE dealer_game_id=m.dealer_game_id AND settlement_key='tri_towers_terminal';
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
 UPDATE private.tri_towers_matches SET finished=true,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
END $$;

CREATE FUNCTION private.tri_towers_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'tri-towers' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.tri_towers_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND settlement IS NULL;
 ELSE UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+at_ms-paused_at)),paused_at=NULL,revision=revision+1 WHERE dealer_game_id=NEW.current_game_uuid AND paused_at IS NOT NULL AND settlement IS NULL;END IF;
 RETURN NEW;
END $$;
-- Explicit grants only. All raw state/decks/helpers remain private.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname LIKE 'tri_towers_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.tri_towers_capabilities(uuid),public.tri_towers_snapshot(uuid),public.tri_towers_history(uuid),public.tri_towers_action(uuid,uuid,bigint,text,integer),public.tri_towers_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.tri_towers_close(uuid) TO authenticated;

-- Acquire shared-table locks last. NOWAIT never queues behind live writes.
LOCK TABLE public.games,public.dealer_games,public.rounds IN SHARE ROW EXCLUSIVE MODE NOWAIT;
ALTER TABLE private.tri_towers_matches
 ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id),
 ADD FOREIGN KEY(game_id) REFERENCES public.games(id),
 ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id);
ALTER TABLE public.tri_towers_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id);
CREATE TRIGGER tri_towers_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW
 WHEN(NEW.game_type='tri-towers') EXECUTE FUNCTION private.tri_towers_pause();
