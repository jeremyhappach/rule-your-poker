-- Audited clock replenishment during an existing incident hold. Never resumes.
CREATE TABLE private.incident_clock_batches (
 id uuid PRIMARY KEY,actor uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL,fingerprint jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.incident_clock_entries (
 request_id uuid NOT NULL REFERENCES private.incident_clock_batches(id),
 scope text NOT NULL CHECK(scope IN('live','async')),target uuid NOT NULL,
 hold_key text NOT NULL,turn_key text NOT NULL,before_row jsonb NOT NULL,after_row jsonb NOT NULL,
 PRIMARY KEY(request_id,scope,target),UNIQUE(scope,target,hold_key,turn_key)
);
ALTER TABLE private.incident_clock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.incident_clock_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.incident_clock_batches,private.incident_clock_entries FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER incident_clock_batches_immutable BEFORE UPDATE OR DELETE ON private.incident_clock_batches
 FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER incident_clock_entries_immutable BEFORE UPDATE OR DELETE ON private.incident_clock_entries
 FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

CREATE OR REPLACE FUNCTION public.admin_replenish_held_turns(p_request uuid,p_targets jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE who uuid:=auth.uid();fp jsonb;prior private.incident_clock_batches;t jsonb;
 g public.games;live private.chess_matches;c private.delayed_children;m private.delayed_matches;h private.delayed_incidents;
 before_i jsonb;after_i jsonb;s jsonb;anchor timestamptz;anchor_ms bigint;duration bigint;deadline_ms bigint;
 scope_i text;target_i uuid;hold_i text;turn_i text;items jsonb:='[]';entries jsonb:='[]';receipt jsonb;revision_i bigint;
BEGIN
 IF who IS NULL OR NOT public.has_role(who,'admin'::public.app_role) THEN
  RAISE EXCEPTION 'clock_replenish:not_authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_targets) NOT BETWEEN 1 AND 50
 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 2000 THEN
  RAISE EXCEPTION 'clock_replenish:identity_and_reason_required';END IF;
 fp:=jsonb_build_object('targets',p_targets,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.incident_clock_batches WHERE id=p_request;
 IF FOUND THEN
  IF prior.actor<>who OR prior.fingerprint<>fp THEN RAISE EXCEPTION 'clock_replenish:request_conflict';END IF;
  RETURN prior.receipt||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(DISTINCT (x->>'scope',x->>'id')) FROM jsonb_array_elements(p_targets)x)<>jsonb_array_length(p_targets)
 THEN RAISE EXCEPTION 'clock_replenish:duplicate_target';END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(p_targets) ORDER BY value->>'scope',value->>'id' LOOP
  scope_i:=t->>'scope';target_i:=(t->>'id')::uuid;revision_i:=(t->>'revision')::bigint;
  IF scope_i='live' THEN
   SELECT * INTO STRICT g FROM public.games WHERE id=(t->>'gameId')::uuid FOR UPDATE NOWAIT;
   SELECT * INTO STRICT live FROM private.chess_matches WHERE dealer_game_id=target_i AND game_id=g.id FOR UPDATE NOWAIT;
   IF NOT g.real_money OR g.status<>'in_progress' OR g.game_type<>'chess' OR NOT g.is_paused
   OR g.current_game_uuid IS DISTINCT FROM target_i OR g.pause_version IS DISTINCT FROM (t->>'pauseVersion')::bigint
   OR live.paused_at IS NULL OR live.revision IS DISTINCT FROM revision_i OR live.finished OR live.settlement IS NOT NULL
   OR live.state->>'phase'<>'playing' OR live.state#>>'{rules,version}'<>'ptown-chess/1'
   OR live.state->'players'->(live.state->>'turnIndex')::int->>'id' IS DISTINCT FROM t->>'actor'
   THEN RAISE EXCEPTION 'clock_replenish:stale_or_unheld_live';END IF;
   hold_i:=g.pause_version::text;turn_i:=live.round_id::text||':'||(live.state->>'turn');
   IF EXISTS(SELECT FROM private.incident_clock_entries WHERE scope=scope_i AND target=target_i AND hold_key=hold_i AND turn_key=turn_i)
   THEN RAISE EXCEPTION 'clock_replenish:already_replenished';END IF;
   before_i:=to_jsonb(live);duration:=(live.state#>>'{rules,turnMs}')::bigint;
   IF duration<>300000 THEN RAISE EXCEPTION 'clock_replenish:unsupported_duration';END IF;
   deadline_ms:=greatest((live.state->>'deadline')::bigint,live.paused_at+duration);
   s:=jsonb_set(live.state,'{deadline}',to_jsonb(deadline_ms));
   UPDATE private.chess_matches SET state=s,revision=revision+1 WHERE dealer_game_id=target_i RETURNING to_jsonb(chess_matches.*) INTO after_i;
   items:=items||jsonb_build_array(jsonb_build_object('scope',scope_i,'id',target_i,'actor',t->>'actor','held',true,'playMs',deadline_ms-live.paused_at));
  ELSIF scope_i='async' THEN
   SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=target_i) FOR UPDATE;
   SELECT * INTO STRICT c FROM private.delayed_children WHERE id=target_i FOR UPDATE;
   SELECT * INTO STRICT h FROM private.delayed_incidents WHERE id=(t->>'holdId')::uuid AND closed_at IS NULL AND (match_id=m.id OR match_id IS NULL) FOR UPDATE;
   IF NOT m.real_money OR m.status<>'active' OR c.terminal OR c.revision IS DISTINCT FROM revision_i
   OR c.actor::text IS DISTINCT FROM t->>'actor' OR NOT private.delayed_held(m.id)
   OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
   OR c.game_type NOT IN('chess','ptown-words','quintzee')
   THEN RAISE EXCEPTION 'clock_replenish:stale_or_unheld_async';END IF;
   hold_i:=h.id::text;turn_i:=c.segment::text;
   IF EXISTS(SELECT FROM private.incident_clock_entries WHERE scope=scope_i AND target=target_i AND hold_key=hold_i AND turn_key=turn_i)
   THEN RAISE EXCEPTION 'clock_replenish:already_replenished';END IF;
   before_i:=to_jsonb(c);s:=c.state;anchor_ms:=floor(extract(epoch FROM h.opened_at)*1000);anchor:=to_timestamp(anchor_ms/1000.0);
   -- Started scored attempts need game-specific score/time accounting; fail closed.
   IF c.game_type='quintzee' AND (c.started_at IS NOT NULL OR s->'board' IS NOT NULL AND s->'board'<>'null'::jsonb)
   THEN RAISE EXCEPTION 'clock_replenish:started_scored_attempt_unsupported';END IF;
   duration:=CASE WHEN c.game_type='quintzee' THEN (c.config->>'durationMs')::bigint ELSE (c.config->>'turnMs')::bigint END;
   IF duration IS NULL OR duration NOT BETWEEN 60000 AND 3600000 THEN RAISE EXCEPTION 'clock_replenish:unsupported_duration';END IF;
   IF c.gameplay_due_at IS NOT NULL THEN
    deadline_ms:=greatest(floor(extract(epoch FROM c.gameplay_due_at)*1000),anchor_ms+duration);
    s:=jsonb_set(s,'{deadline}',to_jsonb(deadline_ms));
   ELSE
    deadline_ms:=NULL;
    IF c.game_type='chess' THEN s:=jsonb_set(s,'{deadline}',to_jsonb(anchor_ms+129600000));
    ELSIF c.game_type='ptown-words' THEN s:=jsonb_set(s,'{deadline}',to_jsonb(anchor_ms+duration));END IF;
   END IF;
   UPDATE private.delayed_children SET available_at=anchor,last_call_at=anchor+interval '24 hours',
    expires_at=anchor+interval '36 hours',gameplay_due_at=CASE WHEN deadline_ms IS NOT NULL THEN to_timestamp(deadline_ms/1000.0) END,
    state=s,revision=revision+1 WHERE id=c.id RETURNING to_jsonb(delayed_children.*) INTO after_i;
   UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
   PERFORM private.delayed_notify(m.id);
   items:=items||jsonb_build_array(jsonb_build_object('scope',scope_i,'id',target_i,'actor',c.actor,'held',true,
    'playMs',coalesce(deadline_ms-anchor_ms,duration),'opened',c.gameplay_due_at IS NOT NULL,'availabilityMs',129600000));
  ELSE RAISE EXCEPTION 'clock_replenish:unsupported_scope';END IF;
  entries:=entries||jsonb_build_array(jsonb_build_object('scope',scope_i,'target',target_i,'hold',hold_i,'turn',turn_i,'before',before_i,'after',after_i));
 END LOOP;
 receipt:=jsonb_build_object('requestId',p_request,'items',items,'replayed',false);
 INSERT INTO private.incident_clock_batches(id,actor,reason,fingerprint,receipt) VALUES(p_request,who,p_reason,fp,receipt);
 INSERT INTO private.incident_clock_entries(request_id,scope,target,hold_key,turn_key,before_row,after_row)
 SELECT p_request,e->>'scope',(e->>'target')::uuid,e->>'hold',e->>'turn',e->'before',e->'after' FROM jsonb_array_elements(entries)e;
 RETURN receipt;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_replenish_held_turns(uuid,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_replenish_held_turns(uuid,jsonb,text) TO authenticated;
