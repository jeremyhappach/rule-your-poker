CREATE FUNCTION private.chess_timeout_state(s jsonb) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT s||jsonb_build_object('phase','complete','reason','timeout','winnerIds',jsonb_build_array(s->'players'->(1-(s->>'turnIndex')::int)->>'id'),'scores',(SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=s->'players'->(1-(s->>'turnIndex')::int)->>'id' THEN 1 ELSE 0 END) FROM jsonb_array_elements(s->'players')p))
$$;
CREATE FUNCTION private.chess_sync(mode_i text,id_i uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.chess_matches;c private.delayed_children;parent private.delayed_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);s jsonb;winner uuid;
BEGIN
 IF mode_i='live' THEN
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i;
  PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
  PERFORM 1 FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i FOR UPDATE;
  IF m.finished OR m.paused_at IS NOT NULL THEN RETURN;END IF;
  IF m.settlement IS NOT NULL THEN PERFORM private.chess_finish_postgame(id_i);RETURN;END IF;
  IF (m.state->>'deadline')::bigint<=at_ms THEN
   UPDATE private.chess_matches SET state=private.chess_timeout_state(state),revision=revision+1 WHERE dealer_game_id=id_i;
   PERFORM private.chess_settle(id_i);
  END IF;
 ELSE
  SELECT * INTO STRICT parent FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=id_i AND game_type='chess') FOR UPDATE;
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=id_i FOR UPDATE;
  IF c.terminal OR parent.status<>'active' OR private.delayed_held(parent.id) THEN RETURN;END IF;
  IF (c.state->>'deadline')::bigint<=at_ms THEN
   s:=private.chess_timeout_state(c.state);winner:=(s->'winnerIds'->>0)::uuid;
   UPDATE private.delayed_children SET state=s,revision=revision+1 WHERE id=id_i RETURNING * INTO c;
   PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',winner,jsonb_build_object('game','chess','reason','timeout','fen',s->>'fen'));
  END IF;
 END IF;
END $$;
CREATE FUNCTION private.chess_record(mode_i text,id_i uuid,actor_i uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.chess_matches;c private.delayed_children;parent private.delayed_matches;answer jsonb;
BEGIN
 IF mode_i='live' THEN
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i;
  answer:=jsonb_build_object('state',m.state,'revision',m.revision,'paused',m.paused_at IS NOT NULL,'pausedAt',m.paused_at,'finished',m.finished,'settled',m.settlement IS NOT NULL,'settlement',m.settlement,'viewerId',(SELECT p.id FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor_i AND NOT p.is_bot),'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id,chips) FROM public.session_player_snapshots WHERE dealer_game_id=id_i AND hand_number=1) END,'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=id_i AND settlement_key='chess_terminal'),'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=id_i ORDER BY cursor DESC LIMIT 1)));
 ELSE
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=id_i AND game_type='chess';
  SELECT * INTO STRICT parent FROM private.delayed_matches WHERE id=c.match_id;
  answer:=jsonb_build_object('state',c.state,'revision',c.revision,'paused',private.delayed_held(parent.id),'pausedAt',NULL,'finished',c.terminal,'settled',c.terminal,'settlement',NULL,'viewerId',actor_i,'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',NULL,'batch',NULL));
 END IF;
 RETURN answer||jsonb_build_object('serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;
CREATE FUNCTION private.chess_authorize(mode_i text,id_i uuid,actor_i uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF actor_i IS NULL OR NOT private.chess_actor_allowed(actor_i) THEN RAISE EXCEPTION 'chess:authentication_required' USING ERRCODE='42501';END IF;
 IF mode_i='live' THEN
  IF NOT EXISTS(SELECT FROM private.chess_matches m JOIN public.players p ON p.game_id=m.game_id WHERE m.dealer_game_id=id_i AND p.user_id=actor_i AND p.status<>'left' AND NOT p.is_bot) THEN RAISE EXCEPTION 'chess:participant_required' USING ERRCODE='42501';END IF;
 ELSIF mode_i='async' THEN
  IF NOT EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id WHERE c.id=id_i AND c.game_type='chess' AND actor_i IN(m.organizer,m.opponent) AND m.status IN('active','settled')) THEN RAISE EXCEPTION 'chess:participant_required' USING ERRCODE='42501';END IF;
 ELSE RAISE EXCEPTION 'chess:invalid_mode';END IF;
END $$;
CREATE FUNCTION public.chess_load(p_mode text,p_id uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt private.chess_requests;
BEGIN
 PERFORM private.chess_authorize(p_mode,p_id,p_actor);PERFORM private.chess_sync(p_mode,p_id);
 SELECT * INTO receipt FROM private.chess_requests WHERE mode=p_mode AND match_id=p_id AND request_id=p_request;
 RETURN private.chess_record(p_mode,p_id,p_actor)||jsonb_build_object('receipt',CASE WHEN receipt.request_id IS NOT NULL THEN to_jsonb(receipt) END);
END $$;
CREATE FUNCTION public.chess_commit(p_mode text,p_id uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_request uuid,p_fingerprint jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_i jsonb;before_s jsonb;prior private.chess_requests;c private.delayed_children;winner uuid;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);changed_turn boolean;
BEGIN
 PERFORM private.chess_authorize(p_mode,p_id,p_actor);PERFORM private.chess_sync(p_mode,p_id);
 row_i:=private.chess_record(p_mode,p_id,p_actor);before_s:=row_i->'state';
 SELECT * INTO prior FROM private.chess_requests WHERE mode=p_mode AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','duplicate','record',row_i);
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'chess:request_required';END IF;
 IF (row_i->>'revision')::bigint IS DISTINCT FROM p_revision OR (row_i->>'settled')::boolean OR (row_i->>'paused')::boolean OR before_s->>'phase'<>'playing' THEN RETURN jsonb_build_object('outcome','stale','record',row_i);END IF;
 IF before_s->'players'->(before_s->>'turnIndex')::int->>'id' IS DISTINCT FROM row_i->>'viewerId' THEN RAISE EXCEPTION 'chess:not_your_turn';END IF;
 IF p_state->'identity' IS DISTINCT FROM before_s->'identity' OR p_state->'rules' IS DISTINCT FROM before_s->'rules' OR p_state->'players' IS DISTINCT FROM before_s->'players' OR p_state->'backgroundId' IS DISTINCT FROM before_s->'backgroundId' OR p_state->'initialFen' IS DISTINCT FROM before_s->'initialFen' OR p_state->'mode' IS DISTINCT FROM before_s->'mode' THEN RAISE EXCEPTION 'chess:identity_changed';END IF;
 -- Only the authenticated Node authority can reach this full-state boundary.
 -- Enforce append-only moves and exact rule/config identity again under row lock.
 IF jsonb_array_length(p_state->'moves') NOT BETWEEN jsonb_array_length(before_s->'moves') AND jsonb_array_length(before_s->'moves')+1 OR EXISTS(SELECT FROM jsonb_array_elements(before_s->'moves') WITH ORDINALITY t(m,n) WHERE p_state->'moves'->(n::int-1) IS DISTINCT FROM m) THEN RAISE EXCEPTION 'chess:history_changed';END IF;
 IF p_state->>'phase'='complete' AND (jsonb_array_length(p_state->'winnerIds') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT FROM jsonb_array_elements_text(p_state->'winnerIds') w WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=w))) THEN RAISE EXCEPTION 'chess:invalid_winner';END IF;
 IF p_mode='live' THEN
  UPDATE private.chess_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_id;
  IF p_state->>'phase'='complete' THEN PERFORM private.chess_settle(p_id);END IF;
 ELSE
  changed_turn:=p_state->'turn' IS DISTINCT FROM before_s->'turn';
  UPDATE private.delayed_children SET state=p_state,revision=revision+1,actor=(p_state->'players'->(p_state->>'turnIndex')::int->>'id')::uuid,
   segment=segment+CASE WHEN changed_turn THEN 1 ELSE 0 END,
   started_at=CASE WHEN changed_turn THEN NULL WHEN (p_state->>'opened')::boolean THEN coalesce(started_at,to_timestamp(at_ms/1000.0)) ELSE started_at END,
   available_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0) ELSE available_at END,
   last_call_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '24 hours' ELSE last_call_at END,
   expires_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '36 hours' ELSE expires_at END,
   gameplay_due_at=CASE WHEN (p_state->>'opened')::boolean THEN to_timestamp((p_state->>'deadline')::bigint/1000.0) END
   WHERE id=p_id RETURNING * INTO c;
  IF p_state->>'phase'='complete' THEN
   winner:=CASE WHEN jsonb_array_length(p_state->'winnerIds')=1 THEN (p_state->'winnerIds'->>0)::uuid END;
   PERFORM private.delayed_record_outcome(p_id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('game','chess','reason',p_state->>'reason','fen',p_state->>'fen'));
  ELSE UPDATE private.delayed_matches SET revision=revision+1 WHERE id=c.match_id;PERFORM private.delayed_notify(c.match_id);END IF;
 END IF;
 INSERT INTO private.chess_requests VALUES(p_mode,p_id,p_request,p_actor,p_fingerprint);
 RETURN jsonb_build_object('outcome','committed','record',private.chess_record(p_mode,p_id,p_actor));
END $$;
CREATE FUNCTION private.chess_recover() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_i record;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 FOR row_i IN SELECT dealer_game_id FROM private.chess_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=at_ms LIMIT 20 LOOP PERFORM private.chess_sync('live',row_i.dealer_game_id);END LOOP;
 FOR row_i IN SELECT c.id FROM private.delayed_children c JOIN private.delayed_matches m ON m.id=c.match_id WHERE c.game_type='chess' AND NOT c.terminal AND m.status='active' AND NOT private.delayed_held(m.id) AND (c.state->>'deadline')::bigint<=at_ms LIMIT 20 LOOP PERFORM private.chess_sync('async',row_i.id);END LOOP;
END $$;
CREATE FUNCTION private.chess_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delta bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);m private.chess_matches;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'chess' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.chess_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.chess_matches SET paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN delta:=at_ms-m.paused_at;UPDATE private.chess_matches SET state=jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+delta))||CASE WHEN state?'terminal' THEN jsonb_build_object('terminal',(state->'terminal')||jsonb_build_object('deadline',(state#>>'{terminal,deadline}')::bigint+delta)) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;END IF;RETURN NEW;
END $$;
CREATE TRIGGER chess_pause AFTER UPDATE OF is_paused ON public.games FOR EACH ROW WHEN(NEW.game_type='chess') EXECUTE FUNCTION private.chess_pause();
REVOKE ALL ON FUNCTION public.chess_load(text,uuid,uuid,uuid),public.chess_commit(text,uuid,uuid,bigint,jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chess_load(text,uuid,uuid,uuid),public.chess_commit(text,uuid,uuid,bigint,jsonb,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.chess_capabilities(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chess_capabilities(uuid) TO authenticated;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'chess_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
