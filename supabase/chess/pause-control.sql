-- Canonical host pause; request-only control follows Words without changing rules.
CREATE OR REPLACE FUNCTION private.chess_record(mode_i text, id_i uuid, actor_i uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.chess_matches;c private.delayed_children;parent private.delayed_matches;answer jsonb;
BEGIN
 IF mode_i='live' THEN
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i;
  answer:=jsonb_build_object('state',m.state,'revision',m.revision,'paused',m.paused_at IS NOT NULL,'pausedAt',m.paused_at,'finished',m.finished,'settled',m.settlement IS NOT NULL,'settlement',m.settlement,'viewerId',(SELECT p.id FROM public.players p WHERE p.game_id=m.game_id AND p.user_id=actor_i AND NOT p.is_bot),'financial',jsonb_build_object('balances',CASE WHEN m.settlement IS NULL THEN (SELECT jsonb_object_agg(id,chips) FROM public.players WHERE game_id=m.game_id) ELSE (SELECT jsonb_object_agg(player_id,chips) FROM public.session_player_snapshots WHERE dealer_game_id=id_i AND hand_number=1) END,'resultId',(SELECT id FROM public.game_results WHERE dealer_game_id=id_i AND settlement_key='chess_terminal'),'batch',(SELECT to_jsonb(b) FROM public.gameplay_transfer_batches b WHERE dealer_game_id=id_i ORDER BY cursor DESC LIMIT 1)));
 ELSE
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=id_i AND game_type='chess';
  SELECT * INTO STRICT parent FROM private.delayed_matches WHERE id=c.match_id;
  answer:=jsonb_build_object('state',c.state,'revision',c.revision,'paused',private.delayed_held(parent.id),'pausedAt',(SELECT floor(extract(epoch FROM min(opened_at))*1000) FROM private.delayed_incidents WHERE closed_at IS NULL AND (match_id IS NULL OR match_id=parent.id)),'finished',c.terminal,'settled',c.terminal,'settlement',NULL,'viewerId',actor_i,'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',NULL,'batch',NULL));
 END IF;
 IF mode_i='live' THEN answer:=answer||(SELECT jsonb_build_object('hostUserId',current_host,'pauseVersion',pause_version) FROM public.games WHERE id=m.game_id); END IF;
 RETURN answer||jsonb_build_object('serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$;

CREATE OR REPLACE FUNCTION private.chess_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE delta bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);m private.chess_matches;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'chess' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.chess_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.chess_matches SET state=state-'pauseRequest',paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN delta:=at_ms-m.paused_at;UPDATE private.chess_matches SET state=jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+delta))||CASE WHEN state?'terminal' THEN jsonb_build_object('terminal',(state->'terminal')||jsonb_build_object('deadline',(state#>>'{terminal,deadline}')::bigint+delta)) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;END IF;RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.chess_host_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.chess_matches SET state=state-'pauseRequest',revision=revision+1
 WHERE dealer_game_id=NEW.current_game_uuid AND NOT finished;
 RETURN NEW;
END $$;
CREATE TRIGGER chess_host_changed AFTER UPDATE OF current_host ON public.games
FOR EACH ROW WHEN(NEW.game_type='chess' AND NEW.current_host IS DISTINCT FROM OLD.current_host)
EXECUTE FUNCTION private.chess_host_changed();
REVOKE ALL ON FUNCTION private.chess_host_changed() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.chess_request_pause(p_id uuid,p_actor uuid,p_request uuid,p_revision bigint,p_intent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.chess_matches;g public.games;prior private.chess_requests;v jsonb;fingerprint jsonb:=jsonb_build_object('revision',p_revision,'intent',p_intent);
BEGIN
 PERFORM private.chess_authorize('live',p_id,p_actor);
 PERFORM private.chess_sync('live',p_id);
 SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=p_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id;
 SELECT * INTO prior FROM private.chess_requests WHERE mode='live' AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN private.chess_record('live',p_id,p_actor);
 END IF;
 IF p_request IS NULL OR p_revision IS DISTINCT FROM m.revision THEN RAISE EXCEPTION 'chess:stale_action';END IF;
 v:=private.chess_record('live',p_id,p_actor);
 IF m.finished OR m.settlement IS NOT NULL OR m.paused_at IS NOT NULL OR m.state->>'phase'<>'playing' OR p_actor=g.current_host
 THEN RAISE EXCEPTION 'chess:pause_request_unavailable';END IF;
 IF p_intent=jsonb_build_object('type','request_pause') THEN
  IF NOT (m.state ? 'pauseRequest') THEN
   UPDATE private.chess_matches SET state=state||jsonb_build_object('pauseRequest',jsonb_build_object('id',p_request,'playerId',v->>'viewerId','hostUserId',g.current_host,'pauseVersion',g.pause_version)),revision=revision+1 WHERE dealer_game_id=p_id;
  END IF;
 ELSIF p_intent->>'type'='cancel_pause_request' AND p_intent=jsonb_build_object('type','cancel_pause_request','requestId',m.state#>>'{pauseRequest,id}')
  AND m.state#>>'{pauseRequest,playerId}'=v->>'viewerId' THEN
  UPDATE private.chess_matches SET state=state-'pauseRequest',revision=revision+1 WHERE dealer_game_id=p_id;
 ELSE RAISE EXCEPTION 'chess:pause_request_unavailable';END IF;
 INSERT INTO private.chess_requests(mode,match_id,request_id,actor,fingerprint) VALUES('live',p_id,p_request,p_actor,fingerprint);
 RETURN private.chess_record('live',p_id,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.chess_request_pause(uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.chess_request_pause(uuid,uuid,uuid,bigint,jsonb) TO service_role;
