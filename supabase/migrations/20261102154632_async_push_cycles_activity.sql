-- Reuse existing match episodes, user/tab heartbeat index, server stamps and retention.
-- Existing outstanding cycles are baselined without replay; Last Call is unchanged.
ALTER TABLE private.push_episodes ADD COLUMN IF NOT EXISTS turn_epoch bigint;
ALTER TABLE public.voice_presence_heartbeats ADD COLUMN IF NOT EXISTS interaction_age_ms integer
 CHECK (interaction_age_ms>=0);
COMMENT ON COLUMN public.voice_presence_heartbeats.interaction_age_ms IS
 'Monotonic interaction age at the existing heartbeat; NULL is unknown and fails open for push.';
CREATE OR REPLACE FUNCTION private.push_user_active(who uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
  SELECT FROM public.voice_presence_heartbeats
  WHERE user_id=who AND status='active'
   AND updated_at>clock_timestamp()-interval '10 seconds'
   AND interaction_age_ms BETWEEN 0 AND 59999
   AND updated_at + (60000-interaction_age_ms)*interval '1 millisecond'>clock_timestamp()
 )
$$;
REVOKE ALL ON FUNCTION private.push_user_active(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.push_sync(parent uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches; who uuid; ks text[]; fresh text[]; old private.push_episodes; kind_i text; event_i uuid;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT coalesce(array_agg(c.id::text||':'||c.segment ORDER BY c.id),'{}') INTO ks
   FROM private.delayed_children c WHERE c.match_id=parent AND c.actor=who AND NOT c.terminal AND c.expires_at>clock_timestamp()
   AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
   AND m.status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent);
  INSERT INTO private.push_episodes(match_id,user_id) VALUES(parent,who) ON CONFLICT DO NOTHING;
  SELECT * INTO old FROM private.push_episodes WHERE match_id=parent AND user_id=who FOR UPDATE;
  SELECT coalesce(array_agg(k),'{}') INTO fresh FROM unnest(ks) k WHERE NOT k=ANY(old.keys);
  -- Last Call retains child/segment identity; turn alerts open only from zero availability.
  IF cardinality(fresh)>0 THEN
   old.epoch:=old.epoch+1;
   IF cardinality(old.keys)=0 THEN old.turn_epoch:=old.epoch; END IF;
   FOREACH kind_i IN ARRAY ARRAY['turn','last_call'] LOOP
    IF kind_i='turn' AND cardinality(old.keys)>0 THEN CONTINUE; END IF;
    INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(parent,who,old.epoch,kind_i,fresh) RETURNING id INTO event_i;
    -- Only devices/preferences opted in at transition time; no retrospective push flood.
    INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
     SELECT event_i,s.id,s.binding FROM private.push_subscriptions s JOIN private.push_match_preferences p ON p.user_id=s.user_id AND p.match_id=parent
     WHERE s.user_id=who AND NOT s.disabled AND p.enabled;
   END LOOP;
  END IF;
  UPDATE private.push_episodes SET keys=ks,epoch=old.epoch,
   turn_epoch=CASE WHEN cardinality(ks)=0 THEN NULL ELSE old.turn_epoch END
   WHERE match_id=parent AND user_id=who
   AND (keys IS DISTINCT FROM ks OR epoch<>old.epoch);
 END LOOP;
END $function$;

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION private.push_eligible(e private.push_events, s private.push_subscriptions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
   AND m.status='invited' AND m.accepted_at IS NULL AND m.expires_at>clock_timestamp()
   AND NOT private.delayed_held(m.id) AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)))
 OR (e.kind IN('turn','last_call') AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND ((e.kind='turn' AND turn_epoch=e.epoch AND cardinality(keys)>0) OR (e.kind='last_call' AND keys&&e.keys)))
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys))
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND c.expires_at>clock_timestamp() AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$function$;

CREATE OR REPLACE FUNCTION public.async_push_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF private.push_user_active(e.user_id) THEN
   UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE event_id=e.id AND state IN('pending','sending'); CONTINUE;
  END IF;
  token:=gen_random_uuid();
  UPDATE private.push_deliveries SET state='sending',lease=token,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1
   WHERE event_id=d.event_id AND subscription_id=d.subscription_id AND state IN('pending','sending');
  IF NOT FOUND THEN CONTINUE; END IF;
  RETURN jsonb_build_object('eventId',e.id,'subscriptionId',s.id,'lease',token);
 END LOOP;
 RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.async_push_authorize(p_event uuid, p_subscription uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d private.push_deliveries; e private.push_events; s private.push_subscriptions; p private.push_defaults; expiry timestamptz;
BEGIN
 SELECT * INTO d FROM private.push_deliveries WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending' AND lease_until>clock_timestamp();
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO e FROM private.push_events WHERE id=p_event; SELECT * INTO s FROM private.push_subscriptions WHERE id=p_subscription;
 IF s.binding<>d.binding OR NOT private.push_eligible(e,s) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM private.push_defaults WHERE user_id=e.user_id;
 IF private.push_quiet_at(p,clock_timestamp()) THEN
  UPDATE private.push_deliveries SET state=CASE WHEN e.kind='table_open' THEN 'skipped' ELSE 'pending' END,
   retry_at=private.push_quiet_transition(p,clock_timestamp(),false),lease=NULL,lease_until=NULL
   WHERE event_id=p_event AND subscription_id=p_subscription AND lease=p_lease AND state='sending';
  RETURN NULL;
 END IF;
 -- Persist suppression before returning, including a lost worker receipt.
 IF private.push_user_active(e.user_id) THEN
  UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL
   WHERE event_id=e.id AND state IN('pending','sending');
  RETURN NULL;
 END IF;
 expiry:=least(clock_timestamp()+interval '60 seconds',private.push_quiet_transition(p,clock_timestamp(),true));
 IF e.kind='table_open' THEN expiry:=least(expiry,e.created_at+interval '5 minutes');
 ELSIF e.kind='invite' THEN SELECT least(expiry,m.expires_at) INTO expiry FROM private.delayed_matches m WHERE m.id=e.match_id;
 ELSE
  SELECT least(expiry,min(least(c.expires_at,coalesce(c.gameplay_due_at,'infinity')))) INTO expiry
   FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
    AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys)) AND c.expires_at>clock_timestamp() AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp());
 END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('eventId',e.id,'matchId',e.match_id,'tableId',e.table_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM expiry)*1000)));
END $function$;
