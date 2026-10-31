-- LOCAL CANDIDATE ONLY. No scheduler, hosted migration or delivery activation.
-- Install after async five-game/review migrations. Gameplay/finance remain untouched.
CREATE TABLE private.push_defaults(user_id uuid PRIMARY KEY REFERENCES public.profiles(id), enabled boolean NOT NULL DEFAULT false);
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
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL, user_id uuid NOT NULL,
 epoch bigint NOT NULL, kind text NOT NULL CHECK(kind IN('turn','last_call')), keys text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(match_id,user_id,epoch,kind), FOREIGN KEY(match_id,user_id) REFERENCES private.push_episodes(match_id,user_id));
CREATE TABLE private.push_deliveries(
 event_id uuid NOT NULL REFERENCES private.push_events(id), subscription_id uuid NOT NULL REFERENCES private.push_subscriptions(id),
 binding uuid NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0, retry_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease uuid, lease_until timestamptz,
 PRIMARY KEY(event_id,subscription_id));
CREATE INDEX push_deliveries_due ON private.push_deliveries(retry_at) WHERE state IN('pending','sending');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['push_defaults','push_match_preferences','push_subscriptions','push_presence','push_episodes','push_events','push_deliveries'] LOOP
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
  IF p_enabled IS NOT NULL THEN INSERT INTO private.push_defaults VALUES(who,p_enabled)
   ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled; END IF;
  SELECT enabled INTO answer FROM private.push_defaults WHERE user_id=who;
 ELSE
  PERFORM 1 FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
  IF NOT FOUND THEN RAISE EXCEPTION 'push:match_denied' USING ERRCODE='42501'; END IF;
  IF p_enabled IS NOT NULL THEN UPDATE private.push_match_preferences SET enabled=p_enabled WHERE match_id=p_match AND user_id=who; END IF;
  SELECT enabled INTO answer FROM private.push_match_preferences WHERE match_id=p_match AND user_id=who;
 END IF;
 RETURN coalesce(answer,false);
END $$;

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
 AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND keys&&e.keys)
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT m.real_money AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND c.id::text||':'||c.segment=ANY(e.keys)
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND c.expires_at>clock_timestamp() AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()));
$$;
CREATE FUNCTION public.async_push_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; token uuid;
BEGIN
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
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions;
BEGIN
 SELECT * INTO d FROM private.push_deliveries WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO e FROM private.push_events WHERE id=p_event; SELECT * INTO s FROM private.push_subscriptions WHERE id=p_subscription;
 IF s.binding<>d.binding OR NOT private.push_eligible(e,s) OR EXISTS(SELECT FROM private.push_presence WHERE subscription_id=s.id AND match_id=e.match_id AND until_at>clock_timestamp()) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('eventId',e.id,'matchId',e.match_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM clock_timestamp())*1000)+60000));
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
REVOKE ALL ON FUNCTION public.async_push_preference(uuid,boolean),public.async_push_subscribe(text,text,text),public.async_push_device(uuid,uuid,boolean,uuid),public.async_push_claim(),public.async_push_authorize(uuid,uuid,uuid),public.async_push_receipt(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.async_push_preference(uuid,boolean),public.async_push_subscribe(text,text,text),public.async_push_device(uuid,uuid,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.async_push_claim(),public.async_push_authorize(uuid,uuid,uuid),public.async_push_receipt(uuid,uuid,uuid,text) TO service_role;
