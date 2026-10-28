-- A missed recovery heartbeat holds adjudication until an operator resolves it.
-- Call before the shared incident gate; never upgrade a held shared lock.
CREATE FUNCTION private.delayed_words_check_health() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h private.delayed_words_health;i uuid;
BEGIN
 SELECT * INTO STRICT h FROM private.delayed_words_health WHERE singleton;
 IF h.enabled AND h.last_tick IS NOT NULL AND h.last_tick>=clock_timestamp()-interval '2 minutes' THEN RETURN;END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE status='active') THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO STRICT h FROM private.delayed_words_health WHERE singleton FOR UPDATE;
 IF h.enabled AND h.last_tick IS NOT NULL AND h.last_tick>=clock_timestamp()-interval '2 minutes' THEN RETURN;END IF;
 IF NOT EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL AND match_id IS NULL) THEN
  -- Do not overlap a scoped incident: require operations review before widening.
  IF EXISTS(SELECT FROM private.delayed_incidents WHERE closed_at IS NULL) THEN RAISE EXCEPTION 'delayed:recovery_unhealthy';END IF;
  i:=private.delayed_incident_open(NULL,'Recovery heartbeat missing; adjudication held for operations review');
  UPDATE private.delayed_incidents SET opened_at=coalesce(h.last_tick,opened_at) WHERE id=i;
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.delayed_words_check_health() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f text;source text;BEGIN
 FOREACH f IN ARRAY ARRAY['public.delayed_words_snapshot(uuid)','public.delayed_words_action(uuid,uuid,bigint,text,jsonb)','private.delayed_words_recover()','public.delayed_respond(uuid,uuid,text,text)'] LOOP
  source:=pg_get_functiondef(f::regprocedure);
  IF position('PERFORM pg_advisory_xact_lock_shared(731907241);' IN source)=0 THEN RAISE EXCEPTION 'Health gate preimage missing';END IF;
  EXECUTE replace(source,'PERFORM pg_advisory_xact_lock_shared(731907241);','PERFORM private.delayed_words_check_health(); PERFORM pg_advisory_xact_lock_shared(731907241);');
 END LOOP;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['delayed_release','delayed_matches','delayed_children','delayed_outcomes','delayed_settlements','delayed_requests','delayed_incidents'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);END LOOP;
END $$;
