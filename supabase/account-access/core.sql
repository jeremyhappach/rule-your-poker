-- Account access is independent of Auth's confirmation timestamps.
CREATE TABLE public.account_access (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,
 ever_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (NOT enabled OR ever_enabled)
);
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_access TO authenticated;
CREATE POLICY account_access_own ON public.account_access FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_access;
INSERT INTO public.account_access(user_id,enabled,ever_enabled)
 SELECT u.id,p.is_active,true FROM auth.users u JOIN public.profiles p ON p.id=u.id;

CREATE TABLE private.account_access_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), previous_enabled boolean NOT NULL,
 enabled boolean NOT NULL, previous_status text NOT NULL, new_status text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX account_access_audit_user ON private.account_access_audit(user_id,changed_at DESC);
CREATE TABLE private.email_ownership(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), email text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), method text NOT NULL DEFAULT 'supabase_email_token' CHECK(method='supabase_email_token'));
CREATE TABLE private.email_verification_requests(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE private.account_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.email_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.email_verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_access_audit,private.email_ownership,private.email_verification_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.account_enabled(who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT enabled FROM public.account_access WHERE user_id=who),false)
$$;
REVOKE ALL ON FUNCTION private.account_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_enabled(uuid) TO authenticated;
CREATE FUNCTION private.account_registered(who uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM auth.users WHERE id=who)
$$;
REVOKE ALL ON FUNCTION private.account_registered(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_registered(uuid) TO authenticated;
CREATE FUNCTION private.require_account_enabled(who uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean;
BEGIN
 -- Mutating requests hold this lock through commit: suspension and actions
 -- have a single database ordering, including old JWTs and service adapters.
 IF current_setting('transaction_read_only')='on' THEN
  SELECT enabled INTO allowed FROM public.account_access WHERE user_id=who;
 ELSE
  SELECT enabled INTO allowed FROM public.account_access WHERE user_id=who FOR SHARE;
 END IF;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'account:access_disabled' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.require_account_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.account_request_guard() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.jwt()->>'role'='anon' THEN RAISE EXCEPTION 'account:authentication_required' USING ERRCODE='42501'; END IF;
 IF auth.jwt()->>'role'='authenticated' AND trim(leading '/' FROM coalesce(current_setting('request.path',true),''))<>'rpc/account_access_snapshot' THEN
  IF trim(leading '/' FROM coalesce(current_setting('request.path',true),'')) IN('rpc/admin_set_account_access','rpc/admin_set_user_role') THEN
   IF NOT private.account_enabled(auth.uid()) THEN RAISE EXCEPTION 'account:access_disabled' USING ERRCODE='42501'; END IF;
  ELSE PERFORM private.require_account_enabled(auth.uid()); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.account_request_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_request_guard() TO authenticated,service_role;
ALTER ROLE authenticator SET pgrst.db_pre_request='public.account_request_guard';

CREATE FUNCTION public.account_access_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('userId',u.id,'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'revision',a.revision,'email',u.email,'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'admin',a.enabled AND public.has_role(u.id,'admin'::public.app_role))
 FROM auth.users u JOIN public.account_access a ON a.user_id=u.id WHERE u.id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.account_access_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_access_snapshot() TO authenticated;

CREATE FUNCTION private.require_enabled_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.require_account_enabled(auth.uid());
 IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'account:admin_required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.require_enabled_admin() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_set_account_access(p_user_id uuid,p_enabled boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.account_access; old_status text;
BEGIN
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'account:invalid_request'; END IF;
 -- Role and account mutations serialize together, including concurrent admins.
 PERFORM pg_advisory_xact_lock(hashtextextended('ptown:admin-role',0));
 PERFORM private.require_enabled_admin();
 IF p_user_id=auth.uid() THEN RAISE EXCEPTION 'account:cannot_change_self' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT old FROM public.account_access WHERE user_id=p_user_id FOR UPDATE;
 IF old.enabled=p_enabled THEN RETURN jsonb_build_object('changed',false); END IF;
 IF NOT p_enabled AND public.has_role(p_user_id,'admin'::public.app_role)
  AND NOT EXISTS(SELECT FROM public.account_access a JOIN public.user_roles r ON r.user_id=a.user_id WHERE a.enabled AND a.user_id<>p_user_id AND r.role='admin') THEN
  RAISE EXCEPTION 'account:last_enabled_admin' USING ERRCODE='42501';
 END IF;
 old_status:=CASE WHEN old.enabled THEN 'enabled' WHEN old.ever_enabled THEN 'suspended' ELSE 'pending' END;
 UPDATE public.account_access SET enabled=p_enabled,ever_enabled=ever_enabled OR p_enabled,revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 -- Preserve the established host succession and game recovery integration.
 UPDATE public.profiles SET is_active=p_enabled WHERE id=p_user_id;
 INSERT INTO private.account_access_audit(user_id,actor_id,previous_enabled,enabled,previous_status,new_status)
 VALUES(p_user_id,auth.uid(),old.enabled,p_enabled,old_status,CASE WHEN p_enabled THEN 'enabled' WHEN old.ever_enabled THEN 'suspended' ELSE 'pending' END);
 RETURN jsonb_build_object('changed',true);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_access(uuid,boolean) TO authenticated;

CREATE FUNCTION public.admin_account_directory() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.account_enabled(auth.uid()) OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'account:admin_required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'username',p.username,'email',u.email,'createdAt',u.created_at,'lastSeenAt',p.last_seen_at,
  'enabled',a.enabled,'status',CASE WHEN a.enabled THEN 'enabled' WHEN a.ever_enabled THEN 'suspended' ELSE 'pending' END,
  'admin',public.has_role(u.id,'admin'::public.app_role),'verified',EXISTS(SELECT FROM private.email_ownership v WHERE v.user_id=u.id AND v.email=u.email),
  'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object('actorId',h.actor_id,'actor',ap.username,'at',h.changed_at,'from',h.previous_status,'to',h.new_status) ORDER BY h.changed_at DESC),'[]') FROM private.account_access_audit h JOIN public.profiles ap ON ap.id=h.actor_id WHERE h.user_id=u.id)
 ) ORDER BY u.created_at DESC),'[]') FROM auth.users u JOIN public.profiles p ON p.id=u.id JOIN public.account_access a ON a.user_id=u.id);
END $$;
REVOKE ALL ON FUNCTION public.admin_account_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_account_directory() TO authenticated;

-- Service-only email operations. Supabase's automatic confirmation is never evidence.
CREATE FUNCTION public.account_email_request(p_actor uuid,p_target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_email text;
BEGIN
 IF p_actor IS NULL OR (p_actor<>p_target AND (NOT private.account_enabled(p_actor) OR NOT public.has_role(p_actor,'admin'::public.app_role))) THEN RAISE EXCEPTION 'account:forbidden' USING ERRCODE='42501'; END IF;
 SELECT email INTO STRICT target_email FROM auth.users WHERE id=p_target;
 INSERT INTO private.email_verification_requests(user_id) VALUES(p_target) ON CONFLICT(user_id) DO UPDATE SET requested_at=clock_timestamp()
 WHERE private.email_verification_requests.requested_at<clock_timestamp()-interval '60 seconds';
 IF NOT FOUND THEN RAISE EXCEPTION 'account:resend_wait'; END IF;
 RETURN target_email;
END $$;
CREATE FUNCTION public.account_email_verified(p_user uuid,p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_user AND email=p_email FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account:email_changed'; END IF;
 INSERT INTO private.email_ownership(user_id,email) VALUES(p_user,p_email) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=clock_timestamp();
 UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.account_email_request(uuid,uuid),public.account_email_verified(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_request(uuid,uuid),public.account_email_verified(uuid,text) TO service_role;

CREATE FUNCTION private.account_email_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email THEN
  DELETE FROM private.email_ownership WHERE user_id=NEW.id;
  UPDATE public.profiles SET email=NEW.email WHERE id=NEW.id;
  UPDATE public.account_access SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_email_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER account_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_email_changed();

CREATE FUNCTION private.account_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'account:immutable_audit'; END $$;
REVOKE ALL ON FUNCTION private.account_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER account_audit_immutable BEFORE UPDATE OR DELETE ON private.account_access_audit FOR EACH ROW EXECUTE FUNCTION private.account_audit_immutable();
NOTIFY pgrst,'reload config';
NOTIFY pgrst,'reload schema';
