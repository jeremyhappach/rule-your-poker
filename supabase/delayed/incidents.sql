-- Operations-only incident recovery. No browser or service-role grants. An
-- operator records verified downtime; no player-triggered pause or grace period.
CREATE FUNCTION private.delayed_incident_open(p_match uuid,p_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE incident uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 IF length(trim(p_reason))<8 THEN RAISE EXCEPTION 'delayed:incident_reason_required';END IF;
 IF EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND (p_match IS NULL OR match_id IS NULL OR match_id=p_match))
 THEN RAISE EXCEPTION 'delayed:overlapping_incident';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match) ORDER BY id FOR UPDATE;
 INSERT INTO private.delayed_incidents(match_id,reason) VALUES(p_match,p_reason) RETURNING id INTO incident;
 UPDATE private.delayed_children SET revision=revision+1 WHERE NOT terminal AND match_id IN(SELECT id FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match));
 UPDATE private.delayed_matches SET revision=revision+1 WHERE status='active' AND (p_match IS NULL OR id=p_match);
 PERFORM private.delayed_notify(id) FROM private.delayed_matches WHERE status='active' AND (p_match IS NULL OR id=p_match);
 RETURN incident;
END $$;
CREATE FUNCTION private.delayed_incident_close(p_incident uuid,p_resolution text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE incident private.delayed_incidents;c private.delayed_children;finished timestamptz:=clock_timestamp();shift interval;ms bigint;s jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT incident FROM private.delayed_incidents WHERE id=p_incident FOR UPDATE;
 IF incident.closed_at IS NOT NULL THEN RETURN;END IF;
 IF length(trim(p_resolution))<8 THEN RAISE EXCEPTION 'delayed:incident_resolution_required';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id) ORDER BY id FOR UPDATE;
 FOR c IN SELECT child_row.* FROM private.delayed_children child_row JOIN private.delayed_matches m ON m.id=child_row.match_id
  WHERE m.status='active' AND NOT child_row.terminal AND (incident.match_id IS NULL OR m.id=incident.match_id) ORDER BY child_row.match_id,child_row.id FOR UPDATE OF child_row LOOP
  shift:=finished-greatest(incident.opened_at,c.available_at);
  IF shift<=interval '0 seconds' THEN CONTINUE;END IF;
  ms:=floor(extract(epoch FROM shift)*1000);shift:=ms*interval '1 millisecond';s:=c.state;
  IF c.game_type='ptown-words' AND s->>'deadline' IS NOT NULL THEN s:=jsonb_set(s,'{deadline}',to_jsonb((s->>'deadline')::bigint+ms));END IF;
  IF s#>>'{board,deadline}' IS NOT NULL THEN s:=jsonb_set(s,'{board,deadline}',to_jsonb((s#>>'{board,deadline}')::bigint+ms));END IF;
  IF s#>>'{board,startedAt}' IS NOT NULL THEN s:=jsonb_set(s,'{board,startedAt}',to_jsonb((s#>>'{board,startedAt}')::bigint+ms));END IF;
  IF s->>'segmentStartedAt' IS NOT NULL THEN s:=jsonb_set(s,'{segmentStartedAt}',to_jsonb((s->>'segmentStartedAt')::bigint+ms));END IF;
  UPDATE private.delayed_children SET available_at=available_at+shift,last_call_at=last_call_at+shift,expires_at=expires_at+shift,
   started_at=started_at+shift,gameplay_due_at=gameplay_due_at+shift,state=s,revision=revision+1 WHERE id=c.id;
 END LOOP;
 UPDATE private.delayed_incidents SET closed_at=finished,resolution=jsonb_build_object('note',p_resolution,'policy','measured_hold_duration') WHERE id=incident.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
 PERFORM private.delayed_notify(id) FROM private.delayed_matches WHERE status='active' AND (incident.match_id IS NULL OR id=incident.match_id);
END $$;
REVOKE ALL ON FUNCTION private.delayed_incident_open(uuid,text),private.delayed_incident_close(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
