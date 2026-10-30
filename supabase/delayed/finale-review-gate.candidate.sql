-- LOCAL CANDIDATE ONLY. Install before the matching client in an approved release.
-- No backfill, customer ACK repair, settlement writes or retention changes.
CREATE OR REPLACE FUNCTION private.delayed_reviews_complete(parent uuid,who uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.delayed_matches m
  JOIN private.delayed_settlements s ON s.match_id=m.id
  WHERE m.id=parent AND who IN(m.organizer,m.opponent) AND m.status='settled')
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent)
 AND NOT EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent AND
  (NOT c.terminal OR NOT EXISTS(SELECT FROM private.delayed_review_events e
    WHERE e.child_id=c.id AND e.kind='child')))
 AND NOT EXISTS(SELECT FROM private.delayed_review_events e WHERE e.match_id=parent
  AND (e.kind='child' OR e.actor IS DISTINCT FROM who)
  AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who))
$$;
REVOKE ALL ON FUNCTION private.delayed_reviews_complete(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the installed home projection and its participant authorization.
DO $$ DECLARE source text; BEGIN
 source:=pg_get_functiondef('public.delayed_home(uuid)'::regprocedure);
 IF position('''reviewsComplete''' IN source)=0 THEN
  IF position('''finaleViewed'',EXISTS' IN source)=0 THEN RAISE EXCEPTION 'review:home_preimage';END IF;
  EXECUTE replace(source,'''finaleViewed'',EXISTS',
   '''reviewsComplete'',private.delayed_reviews_complete(p_match,who),''finaleViewed'',EXISTS');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delayed_finale_ack(p_match uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent) AND status='settled' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 -- Same parent lock as child ACKs. Check even when an older client already ACKed
 -- the finale prematurely; leave that immutable receipt untouched.
 IF NOT private.delayed_reviews_complete(m.id,who) THEN RAISE EXCEPTION 'delayed:reviews_pending' USING ERRCODE='55000';END IF;
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $$;
REVOKE ALL ON FUNCTION public.delayed_finale_ack(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_finale_ack(uuid) TO authenticated;
