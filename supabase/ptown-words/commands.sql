CREATE FUNCTION public.ptown_words_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_items jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.ptown_words_matches;g public.games;actor uuid:=auth.uid();player uuid;prior private.ptown_words_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'items',p_items);at_ms bigint;answer jsonb;rejection text;
BEGIN
 SELECT * INTO STRICT m FROM private.ptown_words_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.ptown_words_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 IF player IS NULL OR NOT private.ptown_words_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players')p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'ptown_words:participant_required' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN('place','pass','exchange') OR pg_column_size(command)>8192 THEN RAISE EXCEPTION 'ptown_words:invalid_command';END IF;
 SELECT * INTO prior FROM private.ptown_words_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'ptown_words:replay_conflict';END IF;RETURN prior.response;END IF;
 IF g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'ptown-words' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'ptown_words:inactive';END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'ptown_words:stale_revision';END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::int->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'ptown_words:not_your_turn' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms<m.last_request_at+400 THEN RAISE EXCEPTION 'ptown_words:rate_limited';END IF;
 BEGIN m.state:=private.ptown_words_reduce(m.state,p_action,p_items,at_ms);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'ptown_words:%' THEN RAISE;END IF;rejection:=SQLERRM;
 END;
 IF rejection IS NOT NULL THEN
  answer:=jsonb_build_object('error',rejection,'requestId',p_request_id);
  UPDATE private.ptown_words_matches SET last_request_at=at_ms WHERE dealer_game_id=m.dealer_game_id;
 ELSE
  UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1,last_request_at=at_ms WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.ptown_words_settle(m.dealer_game_id);END IF;
  answer:=public.ptown_words_snapshot(m.dealer_game_id);
 END IF;
 INSERT INTO private.ptown_words_requests(dealer_game_id,request_id,actor,command,response) VALUES(m.dealer_game_id,p_request_id,actor,command,answer);
 RETURN answer;
END $$;

CREATE FUNCTION private.ptown_words_recover() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record;m private.ptown_words_matches;g public.games;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);count_i int:=0;
BEGIN
 FOR candidate IN SELECT work.dealer_game_id,work.round_id,work.game_id,work.revision FROM private.ptown_words_matches work JOIN public.games live ON live.id=work.game_id
 WHERE NOT work.finished AND work.settlement IS NULL AND work.paused_at IS NULL AND (work.state->>'deadline')::bigint<=at_ms AND live.status='in_progress' AND live.game_type='ptown-words' AND live.current_game_uuid=work.dealer_game_id AND NOT live.is_paused ORDER BY work.dealer_game_id LIMIT 20 LOOP
  PERFORM 1 FROM public.rounds WHERE id=candidate.round_id FOR UPDATE SKIP LOCKED;IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO g FROM public.games WHERE id=candidate.game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR g.is_paused OR g.status<>'in_progress' OR g.game_type IS DISTINCT FROM 'ptown-words' OR g.current_game_uuid IS DISTINCT FROM candidate.dealer_game_id THEN CONTINUE;END IF;
  SELECT * INTO m FROM private.ptown_words_matches WHERE dealer_game_id=candidate.dealer_game_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR m.revision<>candidate.revision OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.finished THEN CONTINUE;END IF;
  -- The existing configured inactivity safeguard owns whether automatic action may proceed.
  IF private.pause_all_humans_auto_fold(g.id) THEN CONTINUE;END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  IF (m.state->>'deadline')::bigint>at_ms THEN CONTINUE;END IF;
  m.state:=private.ptown_words_reduce(m.state,'tick',NULL,at_ms);
  UPDATE private.ptown_words_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
  IF m.state->>'phase'='complete' THEN PERFORM private.ptown_words_settle(m.dealer_game_id);END IF;count_i:=count_i+1;
 END LOOP;
 FOR candidate IN SELECT dealer_game_id FROM private.ptown_words_matches WHERE NOT finished AND settlement IS NOT NULL AND (state#>>'{terminal,deadline}')::bigint<=at_ms ORDER BY dealer_game_id LIMIT 20 LOOP
  PERFORM private.ptown_words_finish_postgame(candidate.dealer_game_id);count_i:=count_i+1;
 END LOOP;
 RETURN count_i;
END $$;

DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname LIKE 'ptown_words_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.ptown_words_capabilities(uuid),public.ptown_words_snapshot(uuid),public.ptown_words_history(uuid),public.ptown_words_action(uuid,uuid,bigint,text,jsonb),public.ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamptz),public.ptown_words_close(uuid) TO authenticated;
ALTER TABLE private.ptown_words_matches ADD FOREIGN KEY(dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE CASCADE,ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE,ADD FOREIGN KEY(round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
ALTER TABLE public.ptown_words_revisions ADD FOREIGN KEY(game_id) REFERENCES public.games(id) ON DELETE CASCADE;
CREATE TRIGGER ptown_words_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='ptown-words') EXECUTE FUNCTION private.ptown_words_pause();
CREATE TRIGGER ptown_words_publish AFTER INSERT OR UPDATE ON private.ptown_words_matches FOR EACH ROW EXECUTE FUNCTION private.ptown_words_publish();
