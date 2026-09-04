-- user_roles is the sole privilege source. is_superuser is a read-only
-- compatibility projection for existing SQL/read consumers.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$fn$;

CREATE OR REPLACE FUNCTION private.guard_profile_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profile_authority:immutable_identity' USING ERRCODE='42501';
  END IF;
  IF NEW.is_superuser IS DISTINCT FROM public.has_role(NEW.id,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'profile_authority:use_admin_role_command' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND current_user IN ('anon','authenticated')
     AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'profile_authority:admin_required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_profile_authority() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_profile_admin_projection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    UPDATE public.profiles SET is_superuser=public.has_role(OLD.user_id,'admin'::public.app_role)
      WHERE id=OLD.user_id AND is_superuser IS DISTINCT FROM public.has_role(OLD.user_id,'admin'::public.app_role);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    UPDATE public.profiles SET is_superuser=public.has_role(NEW.user_id,'admin'::public.app_role)
      WHERE id=NEW.user_id AND is_superuser IS DISTINCT FROM public.has_role(NEW.user_id,'admin'::public.app_role);
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION private.sync_profile_admin_projection() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_authority ON public.profiles;
CREATE TRIGGER guard_profile_authority BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_profile_authority();
DROP TRIGGER IF EXISTS sync_profile_admin_projection ON public.user_roles;
CREATE TRIGGER sync_profile_admin_projection AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.sync_profile_admin_projection();

-- Never infer new roles from the formerly self-editable profile flag.
UPDATE public.profiles SET is_superuser=public.has_role(id,'admin'::public.app_role)
WHERE is_superuser IS DISTINCT FROM public.has_role(id,'admin'::public.app_role);

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_actor uuid:=auth.uid(); v_changed integer:=0;
BEGIN
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'admin_role:invalid_request' USING ERRCODE='22023';
  END IF;
  -- Serialize authorization changes so concurrent revocation cannot race a grant.
  PERFORM pg_advisory_xact_lock(hashtextextended('ptown:admin-role',0));
  IF v_actor IS NULL OR NOT public.has_role(v_actor,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_role:admin_required' USING ERRCODE='42501';
  END IF;
  IF p_user_id=v_actor THEN
    RAISE EXCEPTION 'admin_role:cannot_change_own_role' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_role:profile_not_found' USING ERRCODE='22023'; END IF;
  IF p_enabled THEN
    INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'admin'::public.app_role)
    ON CONFLICT (user_id,role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id=p_user_id AND role='admin'::public.app_role;
  END IF;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  RETURN jsonb_build_object('user_id',p_user_id,'enabled',p_enabled,'changed',v_changed>0);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid,boolean) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
