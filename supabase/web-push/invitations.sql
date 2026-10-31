-- Additive invitation notifications. No backfill, new public RPC, grants or automatic opt-in.
ALTER TABLE private.push_defaults ADD COLUMN invitations_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE private.push_events DROP CONSTRAINT push_events_kind_check;
ALTER TABLE private.push_events ADD CONSTRAINT push_events_kind_check CHECK(kind IN('invite','turn','last_call','table_open'));
CREATE OR REPLACE FUNCTION public.notification_preferences(p_patch jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); p private.push_defaults; k text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_patch IS NOT NULL THEN
  IF jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
   IF k IN('invitations','asyncDefault','newTable','quietEnabled') THEN
    IF jsonb_typeof(p_patch->k)<>'boolean' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
   ELSIF k IN('quietStart','quietEnd') THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR p_patch->>k !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'push:invalid_time'; END IF;
   ELSIF k='quietZone' THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR NOT EXISTS(SELECT FROM private.push_timezone_names WHERE name=p_patch->>k) THEN RAISE EXCEPTION 'push:invalid_timezone'; END IF;
   ELSE RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  END LOOP;
  INSERT INTO private.push_defaults(user_id) VALUES(who) ON CONFLICT DO NOTHING;
  UPDATE private.push_defaults SET invitations_enabled=coalesce((p_patch->>'invitations')::boolean,invitations_enabled), enabled=coalesce((p_patch->>'asyncDefault')::boolean,enabled),
   new_table_enabled=coalesce((p_patch->>'newTable')::boolean,new_table_enabled),
   quiet_enabled=coalesce((p_patch->>'quietEnabled')::boolean,quiet_enabled),
   quiet_start=coalesce((p_patch->>'quietStart')::time,quiet_start),quiet_end=coalesce((p_patch->>'quietEnd')::time,quiet_end),
   quiet_zone=coalesce(p_patch->>'quietZone',quiet_zone) WHERE user_id=who;
  -- Wake deferred work after zone/window edits; Last Call still checks its real due time.
  UPDATE private.push_deliveries d SET retry_at=clock_timestamp() FROM private.push_events e
   WHERE e.id=d.event_id AND e.user_id=who AND d.state='pending';
  -- An explicit opt-out cancels old pending work, even if the user later opts in again.
  IF p_patch->>'invitations'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='invite' AND d.state IN('pending','sending');
  END IF;
  IF p_patch->>'newTable'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='table_open' AND d.state IN('pending','sending');
  END IF;
 END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=who;
 RETURN jsonb_build_object('invitations',coalesce(p.invitations_enabled,false),'asyncDefault',coalesce(p.enabled,false),'newTable',coalesce(p.new_table_enabled,false),
  'quietEnabled',coalesce(p.quiet_enabled,false),'quietStart',coalesce(to_char(p.quiet_start,'HH24:MI'),'22:00'),
  'quietEnd',coalesce(to_char(p.quiet_end,'HH24:MI'),'07:00'),'quietZone',coalesce(p.quiet_zone,'UTC'));
END $$;
CREATE OR REPLACE FUNCTION private.push_eligible(e private.push_events,s private.push_subscriptions) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT s.disabled AND s.user_id=e.user_id
 AND EXISTS(SELECT FROM auth.sessions WHERE id=s.session_id AND user_id=s.user_id AND (not_after IS NULL OR not_after>clock_timestamp()))
 AND EXISTS(SELECT FROM public.profiles WHERE id=s.user_id AND is_active)
 AND ((e.kind='table_open'
  AND e.created_at+interval '5 minutes'>clock_timestamp()
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND new_table_enabled)
  AND EXISTS(SELECT FROM private.push_table_openings WHERE session_id=e.table_id AND host_id IS DISTINCT FROM e.user_id)
  AND private.push_table_allowed(e.table_id,e.user_id)
  -- Drop a table alert if any quiet minute has elapsed since its opening, even
  -- when the worker was asleep for that entire (short) window. No morning backlog.
  AND NOT EXISTS(SELECT FROM private.push_defaults p, LATERAL generate_series(date_trunc('minute',e.created_at),clock_timestamp(),interval '1 minute') t
   WHERE p.user_id=e.user_id AND private.push_quiet_at(p,t)))
 OR (e.kind='invite'
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND invitations_enabled)
  AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND m.opponent=e.user_id
   AND m.status='invited' AND m.accepted_at IS NULL AND m.expires_at>clock_timestamp() AND NOT m.real_money
   AND NOT private.delayed_held(m.id) AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)))
 OR (e.kind IN('turn','last_call') AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND keys&&e.keys)
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT m.real_money AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND c.id::text||':'||c.segment=ANY(e.keys)
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND c.expires_at>clock_timestamp() AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$$;
CREATE OR REPLACE FUNCTION public.async_push_authorize(p_event uuid,p_subscription uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; p private.push_defaults; expiry timestamptz;
BEGIN
 SELECT * INTO d FROM private.push_deliveries WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO e FROM private.push_events WHERE id=p_event; SELECT * INTO s FROM private.push_subscriptions WHERE id=p_subscription;
 IF s.binding<>d.binding OR NOT private.push_eligible(e,s) OR EXISTS(SELECT FROM private.push_presence WHERE subscription_id=s.id AND match_id=e.match_id AND until_at>clock_timestamp()) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=e.user_id;
 IF private.push_quiet_at(p,clock_timestamp()) THEN
  UPDATE private.push_deliveries SET state=CASE WHEN e.kind='table_open' THEN 'skipped' ELSE 'pending' END,
   retry_at=private.push_quiet_transition(p,clock_timestamp(),false),lease=NULL,lease_until=NULL
   WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending';
  RETURN NULL;
 END IF;
 expiry:=least(clock_timestamp()+interval '60 seconds',private.push_quiet_transition(p,clock_timestamp(),true));
 IF e.kind='table_open' THEN expiry:=least(expiry,e.created_at+interval '5 minutes');
 ELSIF e.kind='invite' THEN SELECT least(expiry,m.expires_at) INTO expiry FROM private.delayed_matches m WHERE m.id=e.match_id;
 ELSE
  SELECT least(expiry,min(least(c.expires_at,coalesce(c.gameplay_due_at,'infinity')))) INTO expiry
   FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
    AND c.id::text||':'||c.segment=ANY(e.keys) AND c.expires_at>clock_timestamp() AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp());
 END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('eventId',e.id,'matchId',e.match_id,'tableId',e.table_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM expiry)*1000)));
END $$;
-- Deferred INSERT observes the final transaction state; acceptance in the same
-- transaction creates no stale invitation. Never reannounce updates or old matches.
CREATE FUNCTION private.push_invited() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches; event_i uuid;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=NEW.id;
 IF NOT FOUND OR m.status<>'invited' OR m.accepted_at IS NOT NULL OR m.expires_at<=clock_timestamp() OR m.real_money
  OR NOT private.delayed_human(m.opponent) OR NOT private.delayed_human(m.organizer)
  OR private.delayed_held(m.id) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
  OR NOT EXISTS(SELECT FROM private.push_defaults WHERE user_id=m.opponent AND invitations_enabled) THEN RETURN NEW; END IF;
 INSERT INTO private.push_episodes(match_id,user_id) VALUES(m.id,m.opponent) ON CONFLICT DO NOTHING;
 INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(m.id,m.opponent,0,'invite','{}')
  ON CONFLICT(match_id,user_id,epoch,kind) DO NOTHING RETURNING id INTO event_i;
 IF event_i IS NULL THEN RETURN NEW; END IF;
 INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
  SELECT event_i,s.id,s.binding FROM private.push_subscriptions s WHERE s.user_id=m.opponent AND NOT s.disabled
   AND EXISTS(SELECT FROM auth.sessions a WHERE a.id=s.session_id AND a.user_id=s.user_id AND (a.not_after IS NULL OR a.not_after>clock_timestamp()));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.push_invited() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER push_invited AFTER INSERT ON private.delayed_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.push_invited();
