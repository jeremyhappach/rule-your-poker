-- Recent logins is a registered-account view. Session bots have profiles but
-- no auth.users row; use account identity so names and seat retention do not matter.
CREATE OR REPLACE FUNCTION public.admin_recent_activity()
RETURNS TABLE(id uuid,name text,last_seen_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role)
 THEN RAISE EXCEPTION 'activity:admin_required' USING ERRCODE='42501';END IF;
 RETURN QUERY
 SELECT p.id,coalesce(p.username,'Player'),p.last_seen_at
 FROM public.profiles p
 JOIN auth.users u ON u.id=p.id
 ORDER BY p.last_seen_at DESC NULLS LAST,p.id;
END $$;
