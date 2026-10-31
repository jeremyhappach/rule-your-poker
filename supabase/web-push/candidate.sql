-- LOCAL CANDIDATE ONLY. No scheduler, hosted migration or delivery activation.
-- Install after async five-game/review migrations. Gameplay/finance remain untouched.
CREATE TABLE private.push_defaults(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id), enabled boolean NOT NULL DEFAULT false,
 new_table_enabled boolean NOT NULL DEFAULT false, quiet_enabled boolean NOT NULL DEFAULT false,
 quiet_start time NOT NULL DEFAULT '22:00', quiet_end time NOT NULL DEFAULT '07:00',
 quiet_zone text NOT NULL DEFAULT 'UTC');
-- A durable first-opening receipt, independent of hands/dealer games and host changes.
CREATE TABLE private.push_table_openings(session_id uuid PRIMARY KEY, host_id uuid, opened_at timestamptz NOT NULL DEFAULT clock_timestamp());
-- Never announce historical sessions when installing this package.
INSERT INTO private.push_table_openings(session_id,host_id) SELECT id,current_host FROM public.games;
CREATE TABLE private.push_match_preferences(
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id), user_id uuid NOT NULL REFERENCES public.profiles(id),
 enabled boolean NOT NULL DEFAULT false, PRIMARY KEY(match_id,user_id));
CREATE TABLE private.push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth_secret text NOT NULL,
 binding uuid NOT NULL DEFAULT gen_random_uuid(), disabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE private.push_presence(
 subscription_id uuid PRIMARY KEY REFERENCES private.push_subscriptions(id), match_id uuid REFERENCES private.delayed_matches(id),
 until_at timestamptz NOT NULL);
CREATE TABLE private.push_episodes(
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id), user_id uuid NOT NULL REFERENCES public.profiles(id),
 epoch bigint NOT NULL DEFAULT 0, keys text[] NOT NULL DEFAULT '{}', PRIMARY KEY(match_id,user_id));
CREATE TABLE private.push_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid, table_id uuid, user_id uuid NOT NULL,
 epoch bigint NOT NULL, kind text NOT NULL CHECK(kind IN('turn','last_call','table_open')), keys text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((kind='table_open' AND table_id IS NOT NULL AND match_id IS NULL AND epoch=0) OR (kind<>'table_open' AND table_id IS NULL AND match_id IS NOT NULL)),
 UNIQUE(table_id,user_id),
 UNIQUE(match_id,user_id,epoch,kind), FOREIGN KEY(match_id,user_id) REFERENCES private.push_episodes(match_id,user_id));
CREATE TABLE private.push_deliveries(
 event_id uuid NOT NULL REFERENCES private.push_events(id), subscription_id uuid NOT NULL REFERENCES private.push_subscriptions(id),
 binding uuid NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease uuid, lease_until timestamptz,
 PRIMARY KEY(event_id,subscription_id));
CREATE INDEX push_deliveries_due ON private.push_deliveries(retry_at) WHERE state IN('pending','sending');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['push_defaults','push_match_preferences','push_subscriptions','push_presence','push_episodes','push_events','push_deliveries','push_table_openings'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;

-- Existing matches explicitly opt out. Only new admission takes a snapshot of defaults.
INSERT INTO private.push_match_preferences(match_id,user_id)
 SELECT id,organizer FROM private.delayed_matches UNION ALL SELECT id,opponent FROM private.delayed_matches;
CREATE FUNCTION private.push_seed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO private.push_match_preferences(match_id,user_id,enabled)
 SELECT NEW.id,u,coalesce((SELECT enabled FROM private.push_defaults WHERE user_id=u),false)
 FROM unnest(ARRAY[NEW.organizer,NEW.opponent]) u;
 RETURN NEW;
END $$;
CREATE TRIGGER push_seed AFTER INSERT ON private.delayed_matches FOR EACH ROW EXECUTE FUNCTION private.push_seed();

CREATE FUNCTION public.async_push_preference(p_match uuid DEFAULT NULL,p_enabled boolean DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); answer boolean;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_match IS NULL THEN
  IF p_enabled IS NOT NULL THEN INSERT INTO private.push_defaults(user_id,enabled) VALUES(who,p_enabled)
   ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled; END IF;
  SELECT enabled INTO answer FROM private.push_defaults WHERE user_id=who;
 ELSE
  PERFORM 1 FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
  IF NOT FOUND THEN RAISE EXCEPTION 'push:match_denied' USING ERRCODE='42501'; END IF;
  IF p_enabled IS NOT NULL THEN UPDATE private.push_match_preferences SET enabled=p_enabled WHERE match_id=p_match AND user_id=who; END IF;
  IF p_enabled IS FALSE THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.match_id=p_match AND e.user_id=who AND d.state IN('pending','sending');
  END IF;
  SELECT enabled INTO answer FROM private.push_match_preferences WHERE match_id=p_match AND user_id=who;
 END IF;
 RETURN coalesce(answer,false);
END $$;

-- Wall-clock membership: start inclusive, end exclusive. Equal times mean all day.
-- UTC -> IANA local conversion naturally covers both occurrences of a folded hour.
CREATE FUNCTION private.push_quiet_at(p private.push_defaults,at_time timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(p.quiet_enabled AND (p.quiet_start=p.quiet_end OR
  CASE WHEN p.quiet_start<p.quiet_end THEN (at_time AT TIME ZONE p.quiet_zone)::time>=p.quiet_start AND (at_time AT TIME ZONE p.quiet_zone)::time<p.quiet_end
  ELSE (at_time AT TIME ZONE p.quiet_zone)::time>=p.quiet_start OR (at_time AT TIME ZONE p.quiet_zone)::time<p.quiet_end END),false)
$$;
-- Settings have minute precision. Search actual UTC minute boundaries rather than
-- guessing a fixed offset or choosing one side of a missing/ambiguous local time.
CREATE FUNCTION private.push_quiet_transition(p private.push_defaults,at_time timestamptz,to_quiet boolean) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN NOT coalesce(p.quiet_enabled,false) OR p.quiet_start=p.quiet_end THEN 'infinity'::timestamptz
 ELSE coalesce((SELECT t FROM generate_series(date_trunc('minute',at_time)+interval '1 minute',at_time+interval '49 hours',interval '1 minute') t
  WHERE private.push_quiet_at(p,t)=to_quiet ORDER BY t LIMIT 1),'infinity'::timestamptz) END
$$;
CREATE FUNCTION public.notification_preferences(p_patch jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); p private.push_defaults; k text;
BEGIN
 PERFORM private.delayed_actor(who);
 IF p_patch IS NOT NULL THEN
  IF jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
   IF k IN('asyncDefault','newTable','quietEnabled') THEN
    IF jsonb_typeof(p_patch->k)<>'boolean' THEN RAISE EXCEPTION 'push:invalid_preferences'; END IF;
   ELSIF k IN('quietStart','quietEnd') THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR p_patch->>k !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'push:invalid_time'; END IF;
   ELSIF k='quietZone' THEN
    IF jsonb_typeof(p_patch->k)<>'string' OR NOT EXISTS(SELECT FROM pg_catalog.pg_timezone_names WHERE name=p_patch->>k AND (name='UTC' OR name LIKE '%/%') AND name NOT LIKE 'posix/%' AND name NOT LIKE 'right/%') THEN RAISE EXCEPTION 'push:invalid_timezone'; END IF;
   ELSE RAISE EXCEPTION 'push:invalid_preferences'; END IF;
  END LOOP;
  INSERT INTO private.push_defaults(user_id) VALUES(who) ON CONFLICT DO NOTHING;
  UPDATE private.push_defaults SET enabled=coalesce((p_patch->>'asyncDefault')::boolean,enabled),
   new_table_enabled=coalesce((p_patch->>'newTable')::boolean,new_table_enabled),
   quiet_enabled=coalesce((p_patch->>'quietEnabled')::boolean,quiet_enabled),
   quiet_start=coalesce((p_patch->>'quietStart')::time,quiet_start),quiet_end=coalesce((p_patch->>'quietEnd')::time,quiet_end),
   quiet_zone=coalesce(p_patch->>'quietZone',quiet_zone) WHERE user_id=who;
  -- Wake deferred work after zone/window edits; Last Call still checks its real due time.
  UPDATE private.push_deliveries d SET retry_at=clock_timestamp() FROM private.push_events e
   WHERE e.id=d.event_id AND e.user_id=who AND d.state='pending';
  -- An explicit opt-out cancels old pending work, even if the user later opts in again.
  IF p_patch->>'newTable'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='table_open' AND d.state IN('pending','sending');
  END IF;
 END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=who;
 RETURN jsonb_build_object('asyncDefault',coalesce(p.enabled,false),'newTable',coalesce(p.new_table_enabled,false),
  'quietEnabled',coalesce(p.quiet_enabled,false),'quietStart',coalesce(to_char(p.quiet_start,'HH24:MI'),'22:00'),
  'quietEnd',coalesce(to_char(p.quiet_end,'HH24:MI'),'07:00'),'quietZone',coalesce(p.quiet_zone,'UTC'));
END $$;

-- Explicit per-recipient equivalent of the current restrictive games policies,
-- plus the lobby/admission checks. Never impersonate auth.uid() or change JWT GUCs.
CREATE FUNCTION private.push_table_allowed(parent uuid,who uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.delayed_human(who) AND EXISTS(SELECT FROM public.games g WHERE g.id=parent AND g.real_money IS TRUE
  AND g.game_type IS DISTINCT FROM 'delayed-head-to-head'
  AND g.status NOT IN('session_ended','completed','game_over') AND g.session_ended_at IS NULL AND NOT coalesce(g.pending_session_end,false)
  AND who IS DISTINCT FROM g.current_host
  AND (g.game_type IS DISTINCT FROM 'run21' OR private.run21_actor_allowed(who))
  AND public.three_five_seven_row_visible(g.id,true)
  AND (SELECT count(*) FROM public.players WHERE game_id=g.id)<7
  AND NOT EXISTS(SELECT FROM public.session_player_snapshots WHERE game_id=g.id AND user_id=who)
  AND (public.has_role(who,'admin'::public.app_role) OR NOT EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true')))
$$;
-- A read-only notification landing projection. No seating, chips or wagers.
CREATE FUNCTION public.notification_table(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 IF NOT private.push_table_allowed(p_session,auth.uid()) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('sessionId',p_session,'realMoney',true);
END $$;
CREATE FUNCTION private.push_table_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games; p private.push_defaults; event_i uuid;
BEGIN
 -- An initial waiting row is the first joining boundary, not a hand transition.
 IF NEW.status NOT IN('waiting','waiting_for_players') THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO private.push_table_openings(session_id,host_id) VALUES(g.id,g.current_host) ON CONFLICT DO NOTHING;
 IF NOT FOUND OR g.real_money IS DISTINCT FROM true OR g.current_host IS NULL OR NOT private.delayed_human(g.current_host) THEN RETURN NEW; END IF;
 FOR p IN SELECT * FROM private.push_defaults WHERE new_table_enabled LOOP
  IF p.user_id IS NOT DISTINCT FROM g.current_host OR NOT private.push_table_allowed(g.id,p.user_id) OR private.push_quiet_at(p,clock_timestamp()) THEN CONTINUE; END IF;
  INSERT INTO private.push_events(table_id,user_id,epoch,kind,keys) VALUES(g.id,p.user_id,0,'table_open','{}') RETURNING id INTO event_i;
  INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
   SELECT event_i,s.id,s.binding FROM private.push_subscriptions s WHERE s.user_id=p.user_id AND NOT s.disabled
    AND EXISTS(SELECT FROM auth.sessions WHERE id=s.session_id AND user_id=s.user_id AND (not_after IS NULL OR not_after>clock_timestamp()));
 END LOOP;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER push_table_changed AFTER INSERT OR UPDATE ON public.games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.push_table_changed();

CREATE FUNCTION public.async_push_subscribe(p_endpoint text,p_p256dh text,p_auth text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); sid uuid; s private.push_subscriptions;
BEGIN
 PERFORM private.delayed_actor(who);
 sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
 IF NOT EXISTS(SELECT FROM auth.sessions WHERE id=sid AND user_id=who AND (not_after IS NULL OR not_after>clock_timestamp())) THEN RAISE EXCEPTION 'push:session_required'; END IF;
 -- Restrict provider origins before any network operation; no arbitrary URL delivery.
 IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL OR p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com)/[^[:space:]#]+$'
  OR length(p_endpoint)>2048 OR p_p256dh !~ '^[A-Za-z0-9_-]{87}$' OR p_auth !~ '^[A-Za-z0-9_-]{22}$'
 THEN RAISE EXCEPTION 'push:invalid_subscription'; END IF;
 INSERT INTO private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret)
 VALUES(who,sid,p_endpoint,p_p256dh,p_auth)
 ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,session_id=EXCLUDED.session_id,
  p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret,disabled=false,
  binding=CASE WHEN push_subscriptions.user_id=who AND push_subscriptions.session_id=sid AND NOT push_subscriptions.disabled
   AND push_subscriptions.p256dh=p_p256dh AND push_subscriptions.auth_secret=p_auth THEN push_subscriptions.binding ELSE gen_random_uuid() END
 RETURNING * INTO s;
 RETURN jsonb_build_object('id',s.id,'binding',s.binding);
END $$;
CREATE FUNCTION public.async_push_device(p_id uuid,p_binding uuid,p_disable boolean DEFAULT false,p_match uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM private.push_subscriptions WHERE id=p_id AND binding=p_binding AND user_id=auth.uid() AND NOT disabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'push:device_denied' USING ERRCODE='42501'; END IF;
 IF p_disable THEN UPDATE private.push_subscriptions SET disabled=true,binding=gen_random_uuid() WHERE id=p_id; DELETE FROM private.push_presence WHERE subscription_id=p_id;
 ELSE
  IF p_match IS NOT NULL AND NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match AND auth.uid() IN(organizer,opponent)) THEN RAISE EXCEPTION 'push:match_denied'; END IF;
  INSERT INTO private.push_presence VALUES(p_id,p_match,clock_timestamp()+interval '45 seconds')
  ON CONFLICT(subscription_id) DO UPDATE SET match_id=EXCLUDED.match_id,until_at=EXCLUDED.until_at;
 END IF;
END $$;

CREATE FUNCTION private.push_sync(parent uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches; who uuid; ks text[]; fresh text[]; old private.push_episodes; kind_i text; event_i uuid;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT coalesce(array_agg(c.id::text||':'||c.segment ORDER BY c.id),'{}') INTO ks
   FROM private.delayed_children c WHERE c.match_id=parent AND c.actor=who AND NOT c.terminal AND c.expires_at>clock_timestamp()
   AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
   AND m.status='active' AND NOT m.real_money AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent);
  INSERT INTO private.push_episodes(match_id,user_id) VALUES(parent,who) ON CONFLICT DO NOTHING;
  SELECT * INTO old FROM private.push_episodes WHERE match_id=parent AND user_id=who FOR UPDATE;
  SELECT coalesce(array_agg(k),'{}') INTO fresh FROM unnest(ks) k WHERE NOT k=ANY(old.keys);
  -- One event per committed match transition, including new turns while another child waits.
  IF cardinality(fresh)>0 THEN
   old.epoch:=old.epoch+1;
   UPDATE private.push_episodes SET epoch=old.epoch WHERE match_id=parent AND user_id=who;
   FOREACH kind_i IN ARRAY ARRAY['turn','last_call'] LOOP
    INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(parent,who,old.epoch,kind_i,fresh) RETURNING id INTO event_i;
    -- Only devices/preferences opted in at transition time; no retrospective push flood.
    INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
     SELECT event_i,s.id,s.binding FROM private.push_subscriptions s JOIN private.push_match_preferences p ON p.user_id=s.user_id AND p.match_id=parent
     WHERE s.user_id=who AND NOT s.disabled AND p.enabled;
   END LOOP;
  END IF;
  UPDATE private.push_episodes SET keys=ks WHERE match_id=parent AND user_id=who;
 END LOOP;
END $$;
CREATE FUNCTION private.push_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='delayed_matches' THEN PERFORM private.push_sync(NEW.id);
 ELSE PERFORM private.push_sync(NEW.match_id); END IF;
 RETURN NEW;
END $$;
-- Deferred triggers see the final committed aggregate, never a half-updated child lineup.
CREATE CONSTRAINT TRIGGER push_match_changed AFTER INSERT OR UPDATE ON private.delayed_matches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.push_changed();
CREATE CONSTRAINT TRIGGER push_child_changed AFTER INSERT OR UPDATE ON private.delayed_children DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.push_changed();

CREATE FUNCTION private.push_eligible(e private.push_events,s private.push_subscriptions) RETURNS boolean
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
 OR (e.kind<>'table_open' AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND keys&&e.keys)
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT m.real_money AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND c.id::text||':'||c.segment=ANY(e.keys)
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND c.expires_at>clock_timestamp() AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$$;
CREATE FUNCTION public.async_push_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; token uuid; p private.push_defaults;
BEGIN
 -- Serialize only the short claim/coalescing transaction, never an HTTP send.
 IF NOT pg_try_advisory_xact_lock(914,6021) THEN RETURN NULL; END IF;
 FOR d IN SELECT * FROM private.push_deliveries WHERE state IN('pending','sending') AND retry_at<=clock_timestamp()
  AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY retry_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO e FROM private.push_events WHERE id=d.event_id;
  SELECT * INTO s FROM private.push_subscriptions WHERE id=d.subscription_id;
  -- A Last Call is eligible only when the current pending turn actually reaches 24h.
  IF e.kind='last_call' AND EXISTS(SELECT FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND id::text||':'||segment=ANY(e.keys))
   AND NOT EXISTS(SELECT FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND last_call_at<=clock_timestamp() AND id::text||':'||segment=ANY(e.keys)) THEN
   UPDATE private.push_deliveries SET retry_at=(SELECT min(last_call_at) FROM private.delayed_children WHERE match_id=e.match_id AND actor=e.user_id AND NOT terminal AND expires_at>clock_timestamp() AND id::text||':'||segment=ANY(e.keys)) WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
   CONTINUE;
  END IF;
  IF s.binding<>d.binding OR NOT private.push_eligible(e,s) OR d.attempts>=8 THEN
   UPDATE private.push_deliveries SET state='skipped' WHERE event_id=d.event_id AND subscription_id=d.subscription_id; CONTINUE;
  END IF;
  SELECT * INTO p FROM private.push_defaults WHERE user_id=e.user_id;
  IF private.push_quiet_at(p,clock_timestamp()) THEN
   UPDATE private.push_deliveries SET state=CASE WHEN e.kind='table_open' THEN 'skipped' ELSE 'pending' END,
    retry_at=private.push_quiet_transition(p,clock_timestamp(),false),lease=NULL,lease_until=NULL
    WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
   CONTINUE;
  END IF;
  IF e.match_id IS NOT NULL THEN
   IF EXISTS(SELECT FROM private.push_deliveries x JOIN private.push_events y ON y.id=x.event_id
    WHERE x.subscription_id=s.id AND y.match_id=e.match_id AND x.event_id<>e.id
     AND x.state='sending' AND x.lease_until>clock_timestamp()) THEN CONTINUE; END IF;
   -- Select only the newest still-actionable due reminder for this device/match.
   -- This also handles worker downtime spanning the whole quiet window.
   IF EXISTS(SELECT FROM private.push_deliveries x JOIN private.push_events y ON y.id=x.event_id
    WHERE x.subscription_id=s.id AND x.binding=s.binding AND y.match_id=e.match_id AND y.user_id=e.user_id
     AND x.state IN('pending','sending') AND private.push_eligible(y,s)
     AND (y.epoch,CASE WHEN y.kind='last_call' THEN 1 ELSE 0 END)>(e.epoch,CASE WHEN e.kind='last_call' THEN 1 ELSE 0 END)) THEN
    UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
    CONTINUE;
   END IF;
   UPDATE private.push_deliveries x SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events y
    WHERE y.id=x.event_id AND x.subscription_id=s.id AND y.match_id=e.match_id AND y.user_id=e.user_id
     AND x.state IN('pending','sending') AND y.id<>e.id AND private.push_eligible(y,s)
     AND (y.epoch,CASE WHEN y.kind='last_call' THEN 1 ELSE 0 END)<(e.epoch,CASE WHEN e.kind='last_call' THEN 1 ELSE 0 END);
  END IF;
  IF EXISTS(SELECT FROM private.push_presence WHERE subscription_id=s.id AND match_id=e.match_id AND until_at>clock_timestamp()) THEN
   UPDATE private.push_deliveries SET state='skipped' WHERE event_id=d.event_id AND subscription_id=d.subscription_id; CONTINUE;
  END IF;
  token:=gen_random_uuid();
  UPDATE private.push_deliveries SET state='sending',lease=token,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1 WHERE event_id=d.event_id AND subscription_id=d.subscription_id;
  RETURN jsonb_build_object('eventId',e.id,'subscriptionId',s.id,'lease',token);
 END LOOP;
 RETURN NULL;
END $$;
-- Recheck immediately before delivery, including logout, preference and foreground changes since claim.
CREATE FUNCTION public.async_push_authorize(p_event uuid,p_subscription uuid,p_lease uuid) RETURNS jsonb
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
 ELSE
  SELECT least(expiry,min(least(c.expires_at,coalesce(c.gameplay_due_at,'infinity')))) INTO expiry
   FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
    AND c.id::text||':'||c.segment=ANY(e.keys) AND c.expires_at>clock_timestamp() AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp());
 END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('eventId',e.id,'matchId',e.match_id,'tableId',e.table_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM expiry)*1000)));
END $$;
CREATE FUNCTION public.async_push_receipt(p_event uuid,p_subscription uuid,p_lease uuid,p_result text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.push_deliveries;
BEGIN
 IF p_result NOT IN('sent','retry','gone','skipped','failed') THEN RAISE EXCEPTION 'push:invalid_receipt'; END IF;
 UPDATE private.push_deliveries SET state=CASE p_result WHEN 'retry' THEN 'pending' WHEN 'gone' THEN 'skipped' ELSE p_result END,
  retry_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_until=NULL
 WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending' AND lease_until>clock_timestamp() RETURNING * INTO d;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_result='gone' THEN UPDATE private.push_subscriptions SET disabled=true WHERE id=p_subscription AND binding=d.binding; END IF;
 RETURN true;
END $$;
-- New surfaces are explicitly scoped. No PUBLIC default execute privilege remains.
REVOKE ALL ON FUNCTION private.push_seed(),private.push_sync(uuid),private.push_changed(),private.push_eligible(private.push_events,private.push_subscriptions) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.push_quiet_at(private.push_defaults,timestamptz),private.push_quiet_transition(private.push_defaults,timestamptz,boolean),private.push_table_allowed(uuid,uuid),private.push_table_changed() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.notification_preferences(jsonb),public.notification_table(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.notification_preferences(jsonb),public.notification_table(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.async_push_preference(uuid,boolean),public.async_push_subscribe(text,text,text),public.async_push_device(uuid,uuid,boolean,uuid),public.async_push_claim(),public.async_push_authorize(uuid,uuid,uuid),public.async_push_receipt(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.async_push_preference(uuid,boolean),public.async_push_subscribe(text,text,text),public.async_push_device(uuid,uuid,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.async_push_claim(),public.async_push_authorize(uuid,uuid,uuid),public.async_push_receipt(uuid,uuid,uuid,text) TO service_role;
