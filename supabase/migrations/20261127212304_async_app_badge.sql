-- Presentation-only count. No gameplay, ACK, notification or financial writes.
CREATE OR REPLACE FUNCTION private.async_badge_snapshot(who uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH matches AS MATERIALIZED (
  SELECT m.* FROM private.delayed_matches m
  WHERE who IN(m.organizer,m.opponent) AND m.status IN('active','settled')
   AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id)
 ), work AS (
  SELECT c.id FROM matches m JOIN private.delayed_children c ON c.match_id=m.id
  WHERE (m.status='active' AND NOT private.delayed_held(m.id) AND NOT c.terminal
   AND CASE WHEN c.game_type='five-alive' THEN c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who)
    ELSE c.actor=who AND ((c.game_type='chess' AND NOT m.real_money)
     OR least(c.expires_at,c.gameplay_due_at)>statement_timestamp()) END)
   OR (c.terminal AND EXISTS(SELECT FROM private.delayed_current_review_events e
    WHERE e.child_id=c.id AND e.kind='child'
     AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)))
  UNION ALL
  SELECT m.id FROM matches m WHERE m.status='settled'
   AND EXISTS(SELECT FROM private.delayed_current_settlements s WHERE s.match_id=m.id)
   AND private.delayed_reviews_complete(m.id,who)
   AND NOT EXISTS(SELECT FROM private.delayed_current_finale_seen s WHERE s.match_id=m.id AND s.viewer=who)
 )
 SELECT jsonb_build_object('count',(SELECT count(*) FROM work),
  'version',floor(extract(epoch FROM statement_timestamp())*1000000))
$$;
REVOKE ALL ON FUNCTION private.async_badge_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve installed authorization, suppression, expiry and payload fields.
DO $$
DECLARE target regprocedure; source text; needle text; replacement text;
BEGIN
 FOREACH target IN ARRAY ARRAY['public.delayed_lobby()'::regprocedure,'public.async_push_authorize(uuid,uuid,uuid)'::regprocedure] LOOP
  source:=pg_get_functiondef(target);
  IF strpos(source,'private.async_badge_snapshot(')>0 THEN CONTINUE; END IF;
  IF target='public.delayed_lobby()'::regprocedure THEN
   needle:='''matches'',coalesce(';replacement:='''badge'',private.async_badge_snapshot(auth.uid()),''matches'',coalesce(';
  ELSE
   needle:='''payload'',jsonb_build_object(';replacement:='''payload'',jsonb_build_object(''badge'',private.async_badge_snapshot(e.user_id),';
  END IF;
  IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'app badge: installed owner changed: %',target; END IF;
  EXECUTE replace(source,needle,replacement);
 END LOOP;
END $$;
