-- All human, bot and timeout transitions share this locking/receipt/settlement owner.
CREATE OR REPLACE FUNCTION private.battle31_commit(p_dealer uuid,p_request uuid,p_revision bigint,p_player uuid,p_action text,p_items integer[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;g public.games;prior private.battle31_requests;actor_i int;at_ms bigint;cmd jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items);
BEGIN
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer FOR UPDATE;
 SELECT i-1 INTO actor_i FROM jsonb_array_elements(m.state->'players') WITH ORDINALITY x(p,i) WHERE p->>'id'=p_player::text;
 IF actor_i IS NULL OR p_request IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'battle31:participant_required' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM private.battle31_requests WHERE dealer_game_id=p_dealer AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>p_player OR prior.command<>cmd THEN RAISE EXCEPTION 'battle31:replay_conflict';END IF;RETURN;END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.game_type IS DISTINCT FROM 'battle-31' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'battle31:inactive';END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'battle31:stale_revision';END IF;
 IF p_action<>'resign' AND actor_i<>(m.state->>'turnIndex')::int THEN RAISE EXCEPTION 'battle31:wrong_turn';END IF;
 IF p_action NOT IN('swap','take_pot','pass','resign','tick') THEN RAISE EXCEPTION 'battle31:invalid_action';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action='tick' AND at_ms<(m.state->>'deadline')::bigint THEN RETURN;END IF;
 m.state:=private.battle31_reduce(m.state,p_action,CASE WHEN p_action='resign' THEN ARRAY[actor_i] ELSE p_items END,at_ms);
 INSERT INTO private.battle31_requests VALUES(p_dealer,p_request,p_player,cmd);
 UPDATE private.battle31_matches SET state=m.state,revision=revision+1,bot_due_at=at_ms+750 WHERE dealer_game_id=p_dealer;
 IF m.state->>'phase'='complete' THEN PERFORM private.battle31_settle(p_dealer);END IF;
END $$;
CREATE OR REPLACE FUNCTION public.battle31_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
 IF NOT private.battle31_actor_allowed(auth.uid()) OR p_action IS NULL OR p_action NOT IN('swap','take_pot','pass','resign') THEN RAISE EXCEPTION 'battle31:forbidden' USING ERRCODE='42501';END IF;
 SELECT (p->>'id')::uuid INTO actor FROM private.battle31_matches m,jsonb_array_elements(m.state->'players') p WHERE m.dealer_game_id=p_dealer_game_id AND p->>'userId'=auth.uid()::text AND NOT (p->>'isBot')::boolean;
 IF actor IS NULL THEN RAISE EXCEPTION 'battle31:participant_required' USING ERRCODE='42501';END IF;
 PERFORM private.battle31_commit(p_dealer_game_id,p_request_id,p_revision,actor,p_action,p_items);
 RETURN public.battle31_snapshot(p_dealer_game_id);
END $$;
-- An integrity abort is an administrative operation, never a browser command.
CREATE OR REPLACE FUNCTION private.battle31_abort(p_dealer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.battle31_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 PERFORM 1 FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=p_dealer FOR UPDATE;
 IF m.settlement IS NOT NULL THEN RETURN;END IF;
 UPDATE private.battle31_matches SET state=private.battle31_complete(state,'aborted',floor(extract(epoch FROM clock_timestamp())*1000)::bigint),revision=revision+1 WHERE dealer_game_id=p_dealer;
 PERFORM private.battle31_settle(p_dealer);
END $$;
