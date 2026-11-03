CREATE FUNCTION public.mega_live_commit(p_match uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_request uuid DEFAULT NULL,p_fingerprint text DEFAULT NULL,p_token uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;g public.games;r private.mega_live_requests;at_ms bigint;i integer:=0;result jsonb;person jsonb;prior jsonb;total bigint;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match FOR UPDATE;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.mega_live_requests WHERE dealer_game_id=p_match AND request_id=p_request;
  IF FOUND THEN
   IF r.actor IS DISTINCT FROM p_actor OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'mega:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.mega_live_record(m,p_actor));
  END IF;
 END IF;
 IF m.revision IS DISTINCT FROM p_revision OR m.settlement IS NOT NULL OR m.finished THEN RETURN jsonb_build_object('outcome','conflict','record',private.mega_live_record(m,p_actor));END IF;
 IF g.is_paused OR g.status<>'in_progress' OR g.current_game_uuid IS DISTINCT FROM p_match OR g.game_type IS DISTINCT FROM 'mega-card-golf' THEN RAISE EXCEPTION 'mega:inactive';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_request IS NOT NULL THEN
  IF p_actor IS NULL OR p_fingerprint IS NULL OR m.state->'players'->(m.state->>'turnIndex')::integer->>'userId' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'mega:not_actor';END IF;
  IF at_ms>=(m.state->>'deadline')::bigint THEN RETURN jsonb_build_object('outcome','deadline','record',private.mega_live_record(m,p_actor));END IF;
 ELSE IF at_ms<(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'mega:early_recovery';END IF;END IF;
 IF p_state->'identity' IS DISTINCT FROM m.state->'identity' OR p_state->'rules' IS DISTINCT FROM m.state->'rules' OR p_state->'players' IS DISTINCT FROM m.state->'players' THEN RAISE EXCEPTION 'mega:identity_changed';END IF;
 IF p_state->'board' IS NOT NULL AND p_state->'board'<>'null'::jsonb THEN
  prior:=CASE WHEN p_state#>>'{board,id}'=m.state#>>'{board,id}' THEN m.state->'board' ELSE m.state->'runs'->(p_state#>>'{board,owner}') END;
  PERFORM private.mega_assert_board(p_state->'board',p_state->'rules',prior);
 END IF;
 FOR result IN SELECT value FROM jsonb_array_elements(p_state->'results') LOOP
  i:=i+1;
  IF (result->>'score')::bigint IS DISTINCT FROM private.golf_score(result->'cards') OR (i<=jsonb_array_length(m.state->'results') AND result IS DISTINCT FROM m.state->'results'->(i-1)) THEN RAISE EXCEPTION 'mega:invalid_result';END IF;
 END LOOP;
 IF i<jsonb_array_length(m.state->'results') OR i>jsonb_array_length(m.state->'results')+1 THEN RAISE EXCEPTION 'mega:result_count';END IF;
 FOR person IN SELECT value FROM jsonb_array_elements(p_state->'players') LOOP
  SELECT coalesce(sum((value->>'score')::bigint),0) INTO total FROM jsonb_array_elements(p_state->'results') WHERE value->>'actor'=person->>'id';
  IF (p_state->'scores'->>(person->>'id'))::bigint IS DISTINCT FROM total THEN RAISE EXCEPTION 'mega:invalid_total';END IF;
 END LOOP;
 IF p_state->>'phase'='complete' AND (i<>(p_state#>>'{rules,course,holes}')::int*jsonb_array_length(p_state->'players') OR jsonb_array_length(p_state->'holes')<>(p_state#>>'{rules,course,holes}')::int) THEN RAISE EXCEPTION 'mega:incomplete';END IF;
 UPDATE private.mega_live_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_match RETURNING * INTO m;
 IF p_request IS NOT NULL THEN INSERT INTO private.mega_live_requests VALUES(p_match,p_request,p_actor,p_fingerprint);END IF;
 IF p_state->>'phase'='complete' THEN PERFORM private.mega_live_settle(p_match);SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.mega_live_record(m,p_actor));
END $$;
CREATE FUNCTION public.mega_live_finish(p_match uuid,p_actor uuid,p_token uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 PERFORM private.mega_live_authorize(m,p_actor,p_token);
 PERFORM private.mega_live_finish_postgame(p_match);
 SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=p_match;
 RETURN private.mega_live_record(m,p_actor);
END $$;
CREATE FUNCTION private.mega_live_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.mega_live_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);delta bigint;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'mega-card-golf' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.mega_live_matches WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.mega_live_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN
  delta:=at_ms-m.paused_at;m.state:=jsonb_set(m.state,'{deadline}',to_jsonb((m.state->>'deadline')::bigint+delta));
  IF m.state->'board'<>'null'::jsonb THEN m.state:=jsonb_set(jsonb_set(m.state,'{board,deadline}',to_jsonb((m.state#>>'{board,deadline}')::bigint+delta)),'{board,revision}',to_jsonb((m.state#>>'{board,revision}')::bigint+1));END IF;
  IF m.state ? 'presentation' THEN m.state:=jsonb_set(m.state,'{presentation}',jsonb_build_object('startedAt',(m.state#>>'{presentation,startedAt}')::bigint+delta,'endsAt',(m.state#>>'{presentation,endsAt}')::bigint+delta));END IF;
  IF m.state ? 'terminal' THEN m.state:=jsonb_set(jsonb_set(m.state,'{terminal,startedAt}',to_jsonb((m.state#>>'{terminal,startedAt}')::bigint+delta)),'{terminal,deadline}',to_jsonb((m.state#>>'{terminal,deadline}')::bigint+delta));END IF;
  UPDATE private.mega_live_matches SET state=m.state,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER mega_live_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='mega-card-golf') EXECUTE FUNCTION private.mega_live_pause();
-- Explicit service-only full-state boundary; browser clients submit typed actions via Auth API.
REVOKE ALL ON FUNCTION public.mega_live_load(uuid,uuid,uuid),public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.mega_live_finish(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mega_live_load(uuid,uuid,uuid),public.mega_live_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid),public.mega_live_finish(uuid,uuid,uuid) TO service_role;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'mega_live_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
