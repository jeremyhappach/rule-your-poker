-- Three approved admin-access smoke corrections; no financial writes.
SET LOCAL lock_timeout='5s';
ALTER TABLE private.email_verification_requests
 ADD COLUMN email text, ADD COLUMN attempt_id uuid,
 ADD COLUMN status text NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','requested','accepted','failed'));

CREATE FUNCTION public.account_email_dispatch_start(p_actor uuid,p_target uuid,p_initial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE address text; attempt uuid:=gen_random_uuid();
BEGIN
 IF p_actor IS NULL OR (p_actor<>p_target AND (NOT private.account_enabled(p_actor) OR NOT public.has_role(p_actor,'admin'::public.app_role))) THEN
  RAISE EXCEPTION 'account:forbidden' USING ERRCODE='42501'; END IF;
 SELECT email INTO STRICT address FROM auth.users WHERE id=p_target FOR SHARE;
 IF p_initial AND EXISTS(SELECT FROM private.email_ownership WHERE user_id=p_target AND email=address)
 THEN RETURN jsonb_build_object('skipped',true); END IF;
 INSERT INTO private.email_verification_requests(user_id,email,attempt_id,status)
 VALUES(p_target,address,attempt,'requested')
 ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,attempt_id=excluded.attempt_id,
  requested_at=clock_timestamp(),status='requested'
 WHERE private.email_verification_requests.email IS DISTINCT FROM excluded.email
  OR (NOT p_initial AND private.email_verification_requests.requested_at<clock_timestamp()-interval '60 seconds');
 IF NOT FOUND THEN
  IF p_initial THEN RETURN jsonb_build_object('skipped',true); END IF;
  RAISE EXCEPTION 'account:resend_wait';
 END IF;
 RETURN jsonb_build_object('email',address,'attemptId',attempt,'skipped',false);
END $$;
REVOKE ALL ON FUNCTION public.account_email_dispatch_start(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_dispatch_start(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.account_email_dispatch_finish(p_target uuid,p_attempt uuid,p_success boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE private.email_verification_requests r SET status=CASE WHEN p_success THEN 'accepted' ELSE 'failed' END
 WHERE r.user_id=p_target AND r.attempt_id=p_attempt
  AND EXISTS(SELECT FROM auth.users u WHERE u.id=r.user_id AND u.email=r.email);
 IF FOUND THEN UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_target; END IF;
END $$;
REVOKE ALL ON FUNCTION public.account_email_dispatch_finish(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_dispatch_finish(uuid,uuid,boolean) TO service_role;

-- Compatibility for the previous API during deployment; one request authority.
CREATE OR REPLACE FUNCTION public.account_email_request(p_actor uuid,p_target uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.account_email_dispatch_start(p_actor,p_target,false)->>'email'
$$;

ALTER TABLE public.platform_notifications ADD COLUMN registration_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.platform_notifications ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE public.platform_notifications DROP CONSTRAINT platform_notifications_kind_check;
ALTER TABLE public.platform_notifications ADD CONSTRAINT platform_notifications_kind_check
 CHECK(kind IN ('invitation','turn','settled','invitation_closed','accepted','results','registration'));
ALTER TABLE public.platform_notifications ADD CONSTRAINT platform_notifications_destination_check
 CHECK((kind='registration' AND registration_user_id IS NOT NULL AND match_id IS NULL)
 OR (kind<>'registration' AND registration_user_id IS NULL AND match_id IS NOT NULL));
CREATE UNIQUE INDEX platform_notifications_registration ON public.platform_notifications(user_id,registration_user_id) WHERE kind='registration';
ALTER POLICY notification_owner ON public.platform_notifications USING(user_id=auth.uid()
 AND (kind<>'registration' OR (private.account_enabled(auth.uid()) AND public.has_role(auth.uid(),'admin'::public.app_role))));

CREATE FUNCTION private.account_registration_resolved() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.platform_notifications SET actionable=false,read_revision=revision+1,revision=revision+1,updated_at=clock_timestamp()
 WHERE kind='registration' AND registration_user_id=NEW.user_id AND actionable;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_registration_resolved() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER account_registration_resolved AFTER UPDATE OF ever_enabled ON public.account_access
 FOR EACH ROW WHEN (NEW.ever_enabled AND NOT OLD.ever_enabled) EXECUTE FUNCTION private.account_registration_resolved();

CREATE OR REPLACE FUNCTION public.account_access_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('userId',u.id,'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'revision',a.revision,'email',u.email,'emailDelivery',coalesce((SELECT r.status FROM private.email_verification_requests r WHERE r.user_id=u.id AND r.email=u.email),'not_requested'),
  'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'admin',a.enabled AND public.has_role(u.id,'admin'::public.app_role))
 FROM auth.users u JOIN public.account_access a ON a.user_id=u.id WHERE u.id=auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.admin_account_directory()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT private.account_enabled(auth.uid()) OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'account:admin_required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',p.username,'email',u.email,'createdAt',u.created_at,'lastSeenAt',p.last_seen_at,
  'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'admin',public.has_role(u.id,'admin'::public.app_role),'emailDelivery',coalesce((SELECT r.status FROM private.email_verification_requests r WHERE r.user_id=u.id AND r.email=u.email),'not_requested'),
  'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object('actorId',h.actor_id,'actor',ap.username,'at',h.changed_at,'from',h.previous_status,'to',h.new_status) ORDER BY h.changed_at DESC),'[]') FROM private.account_access_audit h JOIN public.profiles ap ON ap.id=h.actor_id WHERE h.user_id=u.id)
 ) ORDER BY u.created_at DESC),'[]') FROM auth.users u JOIN public.profiles p ON p.id=u.id JOIN public.account_access a ON a.user_id=u.id);
END $function$
;

CREATE OR REPLACE FUNCTION public.admin_account_balances()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
  RAISE EXCEPTION 'account_balances:not_authorized' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',account.id,'username',account.username,'balance',account.balance::text,
   'lastTransactionDate',account.last_date,'enabled',account.is_active) ORDER BY account.balance DESC,account.id),'[]'::jsonb)
 INTO result FROM (
   SELECT p.id,p.username,p.is_active,coalesce(sum(t.amount),0) balance,max(t.date) last_date
   FROM public.profiles p JOIN auth.users a ON a.id=p.id
   LEFT JOIN public.player_transactions t ON t.profile_id=p.id
   GROUP BY p.id,p.username,p.is_active
 ) account;
 RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.account_registered_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE recipient uuid; event_i uuid;
BEGIN
 INSERT INTO public.platform_notifications(user_id,registration_user_id,kind,actionable,payload)
 SELECT a.user_id,NEW.id,'registration',true,jsonb_build_object('username',p.username,'email',NEW.email,'registeredAt',NEW.created_at)
 FROM public.account_access a CROSS JOIN public.profiles p
 WHERE p.id=NEW.id AND a.enabled AND public.has_role(a.user_id,'admin'::public.app_role)
 ON CONFLICT(user_id,registration_user_id) WHERE kind='registration' DO NOTHING;
 FOR recipient IN SELECT d.user_id FROM private.push_defaults d JOIN public.account_access a ON a.user_id=d.user_id
  WHERE d.registrations_enabled AND a.enabled AND public.has_role(d.user_id,'admin'::public.app_role) LOOP
  INSERT INTO private.push_events(user_id,registration_user_id,epoch,kind,keys) VALUES(recipient,NEW.id,0,'registration','{}')
  ON CONFLICT(registration_user_id,user_id) WHERE kind='registration' DO NOTHING RETURNING id INTO event_i;
  IF event_i IS NOT NULL THEN
   INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
   SELECT event_i,id,binding FROM private.push_subscriptions WHERE user_id=recipient AND NOT disabled ON CONFLICT DO NOTHING;
  END IF;
 END LOOP; RETURN NEW;
END $function$
;

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
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY updated_at DESC),'[]') FROM (SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND (kind<>'registration' OR
 (private.account_enabled(auth.uid()) AND public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT FROM public.account_access target WHERE target.user_id=platform_notifications.registration_user_id AND NOT target.ever_enabled)))
 AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND (actionable OR kind='invitation_closed' AND read_revision<revision) ORDER BY updated_at DESC,id LIMIT 50)n))
$function$
;

-- Seed pending approvals for existing administrators without sending extra pushes.
INSERT INTO public.platform_notifications(user_id,registration_user_id,kind,actionable,payload)
 SELECT a.user_id,u.id,'registration',true,jsonb_build_object('username',p.username,'email',u.email,'registeredAt',u.created_at)
 FROM public.account_access a CROSS JOIN auth.users u JOIN public.profiles p ON p.id=u.id
 JOIN public.account_access target ON target.user_id=u.id
 WHERE a.enabled AND public.has_role(a.user_id,'admin'::public.app_role) AND NOT target.ever_enabled
 ON CONFLICT(user_id,registration_user_id) WHERE kind='registration' DO NOTHING;

-- Audit exception: four recent synthetic qualification accounts have no ownership proof.
-- Preserve all access decisions and the owner's earlier customer grandfathering.
WITH corrected AS (
 DELETE FROM private.email_ownership v USING private.mega_test_accounts t,auth.users u
 WHERE v.user_id=t.user_id AND u.id=v.user_id AND v.method='owner_grandfathered'
  AND u.created_at>='2026-11-03'::timestamptz AND u.created_at<='2026-11-04 17:03:38.712215+00'::timestamptz
 RETURNING v.user_id
)
UPDATE public.account_access a SET revision=revision+1,updated_at=clock_timestamp()
 FROM corrected c WHERE a.user_id=c.user_id;
NOTIFY pgrst,'reload schema';
