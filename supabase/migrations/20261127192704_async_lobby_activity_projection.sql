-- Complete current work list: pagination of historical matches must not hide work.
-- Reuse the participant-checked home and current correction/ACK projections.
CREATE OR REPLACE FUNCTION public.delayed_lobby() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH viewer AS (SELECT auth.uid() AS id), candidates AS MATERIALIZED (
  SELECT m.id,m.created_at FROM private.delayed_matches m CROSS JOIN viewer v
  WHERE v.id IN(m.organizer,m.opponent)
   AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id)
   AND (m.status IN('invited','active') OR m.status='settled' AND (
    NOT EXISTS(SELECT FROM private.delayed_current_finale_seen s WHERE s.match_id=m.id AND s.viewer=v.id)
    OR NOT private.delayed_reviews_complete(m.id,v.id)))
 )
 SELECT jsonb_build_object('serverAt',floor(extract(epoch FROM statement_timestamp())*1000),
  'matches',coalesce((SELECT jsonb_agg(public.delayed_home(id) ORDER BY created_at DESC,id DESC) FROM candidates),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.delayed_lobby() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_lobby() TO authenticated;
