CREATE OR REPLACE FUNCTION private.golf_begin(p_game uuid, p_dealer uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; dg public.dealer_games; people jsonb; s jsonb; r uuid:=gen_random_uuid(); n integer; stake_i integer;
BEGIN
 SELECT * INTO STRICT g FROM public.games WHERE id=p_game FOR UPDATE;
 SELECT * INTO STRICT dg FROM public.dealer_games WHERE id=p_dealer AND session_id=p_game;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer OR g.status<>'ante_decision' OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.is_paused THEN RAISE EXCEPTION 'golf:ante_identity';END IF;
 stake_i:=(dg.config->>'ante_amount')::integer;
 IF g.ante_amount IS DISTINCT FROM stake_i OR dg.config->'rules' IS DISTINCT FROM private.golf_rules() THEN RAISE EXCEPTION 'golf:configuration_changed';END IF;
 PERFORM 1 FROM public.players WHERE game_id=p_game ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game AND status='active' AND NOT sitting_out AND NOT waiting AND position IS NOT NULL AND ante_decision IS NULL) THEN RAISE EXCEPTION 'golf:acceptance_pending';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.user_id,'name',coalesce(pr.username,'Player'),'seat',p.position,'isBot',p.is_bot,'chips',p.chips)
  ORDER BY CASE WHEN p.position<g.dealer_position THEN 0 ELSE 1 END,p.position DESC,p.id)
 INTO people FROM public.players p JOIN public.profiles pr ON pr.id=p.user_id
 WHERE p.game_id=p_game AND p.status='active' AND NOT p.sitting_out AND NOT p.waiting AND p.position IS NOT NULL AND p.ante_decision='ante_up';
 n:=jsonb_array_length(people);
 IF n NOT BETWEEN 2 AND 4 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(people) p WHERE NOT (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'golf:accepted_player_count';END IF;
 UPDATE public.games SET status='in_progress',ante_decision_deadline=NULL,current_round=1,total_hands=1 WHERE id=p_game;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
 VALUES(r,p_game,p_dealer,1,1,0,'betting',0);
 s:=jsonb_build_object('identity',jsonb_build_object('sessionId',p_game,'dealerGameId',p_dealer,'roundId',r),'rules',dg.config->'rules',
  'players',people,'hole',1,'dealerIndex',n-1,'scores',(SELECT jsonb_object_agg(p->>'id',0) FROM jsonb_array_elements(people) p),'holes','[]'::jsonb);
 s:=private.golf_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 INSERT INTO private.golf_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
 RETURN jsonb_build_object('dealerGameId',p_dealer,'roundId',r);
END $$;

-- Caller holds round -> game -> match. One predecessor can create one successor.
CREATE OR REPLACE FUNCTION private.golf_next_hole(p_dealer uuid, at_ms bigint) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.golf_matches; g public.games; r uuid:=gen_random_uuid(); hole_i integer;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_dealer
  OR m.state->>'phase'<>'hole_complete' OR (m.state->>'deadline')::bigint>at_ms THEN RETURN;END IF;
 hole_i:=(m.state->>'hole')::integer+1;
 IF hole_i NOT BETWEEN 2 AND 9 OR jsonb_array_length(m.state->'holes')<>hole_i-1 THEN RAISE EXCEPTION 'golf:integrity';END IF;
 INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,predecessor_round_id,cards_dealt,status,pot)
 VALUES(r,m.game_id,p_dealer,1,hole_i,m.round_id,0,'betting',0);
 UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=m.round_id;
 m.state:=jsonb_set(m.state,'{identity,roundId}',to_jsonb(r));
 m.state:=private.golf_deal(m.state||jsonb_build_object('hole',hole_i,'dealerIndex',((m.state->>'dealerIndex')::integer+1)%jsonb_array_length(m.state->'players')),at_ms);
 UPDATE private.golf_matches SET round_id=r,state=m.state,revision=revision+1 WHERE dealer_game_id=p_dealer;
 UPDATE public.games SET current_round=hole_i WHERE id=m.game_id;
END $$;

CREATE OR REPLACE FUNCTION public.golf_action(p_dealer_game_id uuid,p_round_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches; g public.games; player uuid; actor uuid:=auth.uid(); prior private.golf_requests;
 command jsonb:=jsonb_build_object('roundId',p_round_id,'revision',p_revision,'action',p_action,'items',p_items); at_ms bigint;
BEGIN
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.golf_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND NOT is_bot AND (status<>'left' OR m.settlement IS NOT NULL);
 IF player IS NULL OR NOT private.golf_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'golf:participant_required' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_round_id IS NULL OR p_action IS NULL OR p_action NOT IN ('open','draw','replace','discard','reject') THEN RAISE EXCEPTION 'golf:invalid_command';END IF;
 SELECT * INTO prior FROM private.golf_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'golf:replay_conflict';END IF;
  RETURN public.golf_snapshot(p_dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',prior.accepted_revision));
 END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'six-card-golf' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'golf:inactive';END IF;
 IF m.round_id<>p_round_id OR m.revision<>p_revision THEN RAISE EXCEPTION 'golf:stale_revision';END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'golf:not_actor' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'golf:deadline';END IF;
 m.state:=private.golf_reduce(m.state,p_action,p_items,at_ms);
 INSERT INTO private.golf_requests VALUES(m.dealer_game_id,p_request_id,actor,command,m.revision+1);
 UPDATE private.golf_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.golf_settle(m.dealer_game_id);END IF;
 RETURN public.golf_snapshot(m.dealer_game_id)||jsonb_build_object('receipt',jsonb_build_object('requestId',p_request_id,'acceptedRevision',m.revision+1));
END $$;

-- Match identity, admitted configuration and liabilities cannot be rewritten.
CREATE OR REPLACE FUNCTION private.golf_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.game_id<>OLD.game_id OR NEW.dealer_game_id<>OLD.dealer_game_id OR NEW.stake<>OLD.stake
  OR NEW.state->'players' IS DISTINCT FROM OLD.state->'players' OR NEW.state->'rules' IS DISTINCT FROM OLD.state->'rules'
  OR (OLD.settlement IS NOT NULL AND (NEW.settlement IS DISTINCT FROM OLD.settlement OR NEW.state IS DISTINCT FROM OLD.state))) THEN RAISE EXCEPTION 'golf:immutable_match';END IF;
 IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN PERFORM private.golf_integrity(NEW.state);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_guard BEFORE INSERT OR UPDATE ON private.golf_matches FOR EACH ROW EXECUTE FUNCTION private.golf_guard();

CREATE OR REPLACE FUNCTION private.golf_roster_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.golf_matches;
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM private.golf_matches WHERE game_id=NEW.game_id AND settlement IS NULL AND NOT finished) THEN NEW.waiting:=true;END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM private.golf_matches WHERE game_id=OLD.game_id AND settlement IS NULL AND NOT finished
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'players') p WHERE p->>'id'=OLD.id::text);
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'golf:match_liability_committed';END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.game_id IS DISTINCT FROM OLD.game_id OR NEW.is_bot IS DISTINCT FROM OLD.is_bot THEN RAISE EXCEPTION 'golf:participant_identity_frozen';END IF;
 IF NEW.position IS DISTINCT FROM OLD.position OR NEW.status IN ('left','observer') THEN
  NEW.position:=OLD.position;NEW.status:=OLD.status;NEW.stand_up_next_hand:=true;
 END IF;
 IF NEW.sitting_out AND NOT OLD.sitting_out THEN NEW.sitting_out:=OLD.sitting_out;NEW.sit_out_next_hand:=true;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER golf_committed_roster BEFORE INSERT OR UPDATE OR DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION private.golf_roster_guard();
