-- Trusted server adapter boundary. Browser roles never submit state or results.
DO $$ DECLARE source_i text;old_i text;BEGIN
 source_i:=pg_get_functiondef('public.delayed_words_snapshot(uuid)'::regprocedure);
 old_i:='-- Read may catch up an overdue turn;';
 IF position(old_i IN source_i)=0 THEN RAISE EXCEPTION 'delayed:snapshot_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'IF c.game_type<>''ptown-words'' OR m.real_money THEN RAISE EXCEPTION ''delayed:scope_closed'';END IF; '||old_i);
END $$;
CREATE TABLE private.delayed_commands (
 actor uuid NOT NULL, request_id uuid NOT NULL, child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 fingerprint jsonb NOT NULL, revision bigint NOT NULL, PRIMARY KEY(actor,request_id)
);
ALTER TABLE private.delayed_commands ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER delayed_commands_immutable BEFORE UPDATE OR DELETE ON private.delayed_commands FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
REVOKE ALL ON private.delayed_commands FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_tri_core(p_operation text,p_config jsonb DEFAULT NULL,p_score bigint DEFAULT 0,
 p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_index integer DEFAULT NULL,p_at bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 CASE p_operation
 WHEN 'deal' THEN RETURN private.tri_towers_board_deal(jsonb_build_object('rules',p_config,'score',p_score),p_at);
 WHEN 'reduce' THEN RETURN private.tri_towers_board_reduce(p_board,p_action,p_index,p_at);
 WHEN 'visible' THEN RETURN private.tri_towers_visible(p_board)-ARRAY['activePlayerId','cursor'];
 WHEN 'eligible' THEN RETURN to_jsonb(private.tri_towers_bonus_qualified_v2(p_score,p_config));
 ELSE RAISE EXCEPTION 'delayed:invalid_core_operation';
 END CASE;
END $$;

CREATE FUNCTION private.delayed_child_record(c private.delayed_children) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_jsonb(c)||jsonb_build_object('organizer',m.organizer,'opponent',m.opponent,
  'status',m.status,'held',private.delayed_held(m.id),'server_at',floor(extract(epoch FROM clock_timestamp())*1000),
  'outcome',(SELECT jsonb_build_object('winner',o.winner,'reason',o.reason,'organizer_delta',o.organizer_delta,'opponent_delta',o.opponent_delta)
   FROM private.delayed_outcomes o WHERE o.child_id=c.id))
 FROM private.delayed_matches m WHERE m.id=c.match_id
$$;

CREATE FUNCTION public.delayed_load(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $$;

CREATE FUNCTION public.delayed_commit(p_child uuid,p_actor uuid,p_revision bigint,p_state jsonb,p_event text,p_at bigint,
 p_advanced boolean,p_request uuid DEFAULT NULL,p_fingerprint jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;now_i timestamptz;event_time timestamptz;
 done boolean;next_actor uuid;next_due bigint;expected_due timestamptz;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_actor IS NOT NULL AND p_request IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501';END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
  IF FOUND THEN
   IF r.child_id IS DISTINCT FROM p_child OR r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.delayed_child_record(c));
  END IF;
 END IF;
 IF c.revision IS DISTINCT FROM p_revision OR c.terminal THEN RETURN jsonb_build_object('outcome','conflict','record',private.delayed_child_record(c)); END IF;
 IF m.status<>'active' OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:held';END IF;
 now_i:=clock_timestamp();event_time:=to_timestamp(p_at/1000.0);
 expected_due:=least(c.expires_at,c.gameplay_due_at);
 IF p_event='action' THEN
  IF p_actor IS DISTINCT FROM c.actor OR p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'delayed:not_your_turn';END IF;
  IF now_i>=expected_due THEN RETURN jsonb_build_object('outcome','deadline','record',private.delayed_child_record(c)); END IF;
 ELSIF p_event='tick' THEN
  IF p_request IS NOT NULL OR now_i<expected_due OR abs(extract(epoch FROM expected_due)*1000-p_at)>=1 THEN RAISE EXCEPTION 'delayed:invalid_tick'; END IF;
  IF c.expires_at<=coalesce(c.gameplay_due_at,c.expires_at) THEN
   PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);
   SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
   RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
  END IF;
 ELSE RAISE EXCEPTION 'delayed:invalid_event';END IF;
 IF event_time>now_i OR event_time<c.available_at-interval '1 millisecond' OR p_state->>'version' IS DISTINCT FROM 'delayed/1'
  OR p_state->>'child' IS DISTINCT FROM c.id::text OR p_state->>'game' IS DISTINCT FROM c.game_type
  OR p_advanced IS NULL THEN RAISE EXCEPTION 'delayed:invalid_state';END IF;
 done:=coalesce((p_state->>'completed')::boolean,false);
 next_actor:=(p_state->'players'->>(p_state->>'turn')::integer)::uuid;
 IF next_actor IS NULL OR next_actor NOT IN(m.organizer,m.opponent) OR (NOT p_advanced AND next_actor<>c.actor) OR (done AND NOT p_advanced)
 THEN RAISE EXCEPTION 'delayed:invalid_actor';END IF;
 next_due:=(p_state#>>'{board,deadline}')::bigint;
 UPDATE private.delayed_children SET state=p_state,revision=revision+1,
  actor=next_actor,segment=segment+CASE WHEN p_advanced THEN 1 ELSE 0 END,
  available_at=CASE WHEN p_advanced THEN event_time ELSE available_at END,
  last_call_at=CASE WHEN p_advanced THEN event_time+interval '24 hours' ELSE last_call_at END,
  expires_at=CASE WHEN p_advanced THEN event_time+interval '36 hours' ELSE expires_at END,
  started_at=to_timestamp((p_state->>'segmentStartedAt')::bigint/1000.0),gameplay_due_at=to_timestamp(next_due/1000.0)
 WHERE id=c.id RETURNING * INTO c;
 IF done THEN
  PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN p_state->>'winner' IS NULL THEN 'draw' ELSE 'normal' END,
   (p_state->>'winner')::uuid,jsonb_build_object('rules',c.config,'finalState',p_state));
 ELSE
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 END IF;
 SELECT * INTO c FROM private.delayed_children WHERE id=p_child;
 IF p_request IS NOT NULL THEN INSERT INTO private.delayed_commands VALUES(p_actor,p_request,p_child,p_fingerprint,c.revision);END IF;
 RETURN jsonb_build_object('outcome','committed','record',private.delayed_child_record(c));
END $$;

REVOKE ALL ON FUNCTION private.delayed_child_record(private.delayed_children) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_tri_core(text,jsonb,bigint,jsonb,text,integer,bigint),
 public.delayed_load(uuid,uuid,uuid),public.delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_tri_core(text,jsonb,bigint,jsonb,text,integer,bigint),
 public.delayed_load(uuid,uuid,uuid),public.delayed_commit(uuid,uuid,bigint,jsonb,text,bigint,boolean,uuid,jsonb) TO service_role;
