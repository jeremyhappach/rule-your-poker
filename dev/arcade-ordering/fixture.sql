-- Disposable loopback fixture. Role helpers copied from deployed definitions
-- inspected November 7, 2026. Only their prerequisite tables are minimized.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_active boolean NOT NULL);
CREATE TABLE public.account_access(user_id uuid PRIMARY KEY,enabled boolean NOT NULL);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.system_settings(key text PRIMARY KEY,value jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $$
 SELECT public.has_role(_user_id,'admin'::public.app_role)
$$;
CREATE FUNCTION public.cutover_write_lock_active() RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
 SELECT COALESCE((SELECT value->>'enabled'='true' FROM public.system_settings WHERE key='cutover_write_lock'),false)
$$;
CREATE FUNCTION private.account_enabled(who uuid) RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path TO '' AS $$
 SELECT coalesce((SELECT enabled FROM public.account_access WHERE user_id=who),false)
$$;
GRANT USAGE ON SCHEMA public,auth,private TO authenticated,anon;
GRANT SELECT ON public.profiles,public.user_roles TO authenticated;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_role ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
INSERT INTO public.profiles VALUES('10000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000002',true);
INSERT INTO public.account_access SELECT id,true FROM public.profiles;
INSERT INTO public.user_roles VALUES('10000000-0000-0000-0000-000000000001','admin');
