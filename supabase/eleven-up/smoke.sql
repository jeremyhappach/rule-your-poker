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
