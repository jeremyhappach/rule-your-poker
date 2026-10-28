-- Isolated combined-release candidate. No hosted installation or activation.
-- Canonical session bots have a profile/seat but no auth.users identity.
-- Use UUID identity, never a display-name or user-editable metadata heuristic.
CREATE OR REPLACE FUNCTION private.delayed_human(actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=actor AND p.is_active)
$$;
REVOKE ALL ON FUNCTION private.delayed_human(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.delayed_actor(actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF actor IS NULL OR NOT private.delayed_human(actor)
 THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.delayed_actor(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delayed_opponent_page(p_search text DEFAULT '',p_sort text DEFAULT 'username',p_after jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;needle text:=lower(trim(coalesce(p_search,'')));
BEGIN
 PERFORM private.delayed_actor(auth.uid());
 IF length(needle)>80 OR p_sort NOT IN('username','recent') THEN RAISE EXCEPTION 'delayed:invalid_filter';END IF;
 IF p_after IS NOT NULL AND (p_after->>'sort' IS DISTINCT FROM p_sort OR p_after->>'search' IS DISTINCT FROM needle) THEN RAISE EXCEPTION 'delayed:invalid_cursor';END IF;
 WITH candidates AS (
  SELECT p.id,p.username,lower(p.username) name_key,
   (SELECT max(greatest(m.settled_at,m.accepted_at,
     (SELECT max(to_timestamp((cmd.response->>'serverAt')::double precision/1000))
      FROM private.delayed_children c JOIN private.delayed_word_commands cmd ON cmd.child_id=c.id
      WHERE c.match_id=m.id AND NOT cmd.response?'error'))) FROM private.delayed_matches m
    WHERE m.accepted_at IS NOT NULL AND (m.organizer=auth.uid() AND m.opponent=p.id OR m.opponent=auth.uid() AND m.organizer=p.id)) last_played
  FROM public.profiles p WHERE private.delayed_human(p.id) AND p.id<>auth.uid() AND position(needle IN lower(p.username))>0
 ), keyed AS (
  SELECT *,CASE WHEN p_sort='recent' THEN -coalesce(extract(epoch FROM last_played),0) ELSE 0 END time_key FROM candidates
 ), page AS (
  SELECT * FROM keyed WHERE p_after IS NULL OR (time_key,name_key,id)>((p_after->>'time')::numeric,p_after->>'name',(p_after->>'id')::uuid)
  ORDER BY time_key,name_key,id LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY time_key,name_key,id LIMIT 50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',username,'isHuman',true) ORDER BY time_key,name_key,id) FROM visible),'[]'::jsonb),
  'hasMore',(SELECT count(*)>50 FROM page),'next',CASE WHEN (SELECT count(*)>50 FROM page) THEN
   (SELECT jsonb_build_object('time',time_key::text,'name',name_key,'id',id,'sort',p_sort,'search',needle) FROM visible ORDER BY time_key DESC,name_key DESC,id DESC LIMIT 1) END) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.delayed_opponent_page(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_opponent_page(text,text,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.delayed_opponents(p_search text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',username) ORDER BY username),'[]'::jsonb)
 FROM (SELECT id,username FROM public.profiles WHERE private.delayed_human(auth.uid()) AND private.delayed_human(id) AND id<>auth.uid()
  AND length(trim(p_search)) BETWEEN 2 AND 80 AND position(lower(trim(p_search)) IN lower(username))>0 ORDER BY username,id LIMIT 20) p
$$;
