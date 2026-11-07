-- Notification presentation only. Existing events and notification revisions are retained.
CREATE OR REPLACE FUNCTION private.async_opponent_name(match_id uuid, recipient uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT nullif(btrim(p.username),'')
 FROM private.delayed_matches m
 JOIN public.profiles p ON p.id=CASE WHEN recipient=m.organizer THEN m.opponent ELSE m.organizer END
 WHERE m.id=match_id AND recipient IN(m.organizer,m.opponent)
$$;
REVOKE ALL ON FUNCTION private.async_opponent_name(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $guard$ BEGIN IF md5(pg_get_functiondef('platform_notification_center()'::regprocedure)) IS DISTINCT FROM '97b389e826dfb493cfa04f0d300aff57' THEN RAISE EXCEPTION 'originals:notification_owner_changed:platform_notification_center'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.platform_notification_center()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('actionable',(SELECT count(*) FROM public.platform_notifications WHERE user_id=auth.uid() AND (kind<>'registration' OR
 (private.account_enabled(auth.uid()) AND public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT FROM public.account_access target WHERE target.user_id=platform_notifications.registration_user_id AND NOT target.ever_enabled)))
 AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND (actionable OR kind='invitation_closed' AND read_revision<revision)),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n)||CASE WHEN n.kind='turn' THEN jsonb_build_object('payload',n.payload||jsonb_build_object('opponentName',private.async_opponent_name(n.match_id,n.user_id))) ELSE '{}'::jsonb END ORDER BY updated_at DESC),'[]') FROM (SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND (kind<>'registration' OR
 (private.account_enabled(auth.uid()) AND public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT FROM public.account_access target WHERE target.user_id=platform_notifications.registration_user_id AND NOT target.ever_enabled)))
 AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND (actionable OR kind='invitation_closed' AND read_revision<revision) ORDER BY updated_at DESC,id LIMIT 50)n))
$function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('async_push_authorize(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM 'd1cb608c85950ad26458a739fe9f0b5d' THEN RAISE EXCEPTION 'originals:notification_owner_changed:async_push_authorize'; END IF; END $guard$;
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
 IF e.kind IN('table_open','turn','last_call') AND private.push_user_active(e.user_id) THEN
  UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL
   WHERE event_id=e.id AND state IN('pending','sending');
  RETURN NULL;
 END IF;
 expiry:=least(clock_timestamp()+interval '60 seconds',private.push_quiet_transition(p,clock_timestamp(),true));
 IF e.kind='registration' THEN NULL; ELSIF e.kind='table_open' THEN expiry:=least(expiry,e.created_at+interval '5 minutes');
 ELSIF e.kind='invite' THEN SELECT least(expiry,m.expires_at) INTO expiry FROM private.delayed_matches m WHERE m.id=e.match_id;
 ELSE
  SELECT least(expiry,min(least(c.expires_at,coalesce(c.gameplay_due_at,'infinity')))) INTO expiry
   FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
    AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys)) AND c.expires_at>clock_timestamp() AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp());
 END IF;
 RETURN jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_secret),
  'payload',jsonb_build_object('opponentName',CASE WHEN e.kind IN('turn','last_call') THEN private.async_opponent_name(e.match_id,e.user_id) END,'registrationUserId',e.registration_user_id,'username',CASE WHEN e.kind='registration' THEN (SELECT username FROM public.profiles WHERE id=e.registration_user_id) END,'eventId',e.id,'matchId',e.match_id,'tableId',e.table_id,'binding',s.binding,'kind',e.kind,'expiresAt',floor(extract(epoch FROM expiry)*1000)));
END $function$
;

DO $guard$ BEGIN IF md5(pg_get_functiondef('async_push_claim()'::regprocedure)) IS DISTINCT FROM '3589192223fb42e23191516992821761' THEN RAISE EXCEPTION 'originals:notification_owner_changed:async_push_claim'; END IF; END $guard$;
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
  IF e.kind IN('table_open','turn','last_call') AND private.push_user_active(e.user_id) THEN
   UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL WHERE event_id=e.id AND state IN('pending','sending'); CONTINUE;
  END IF;
  token:=gen_random_uuid();
  UPDATE private.push_deliveries SET state='sending',lease=token,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1
   WHERE event_id=d.event_id AND subscription_id=d.subscription_id AND state IN('pending','sending');
  IF NOT FOUND THEN CONTINUE; END IF;
  RETURN jsonb_build_object('eventId',e.id,'subscriptionId',s.id,'lease',token);
 END LOOP;
 RETURN NULL;
END $function$
;
