-- Pending invitations are deletable; immutable command receipts and owner-only
-- invalidation UUIDs must survive deletion for retries and filtered Realtime UPDATE.
-- Gameplay/outcome/settlement FKs and immutable guards remain unchanged.
ALTER TABLE private.delayed_requests DROP CONSTRAINT IF EXISTS delayed_requests_match_id_fkey;
ALTER TABLE public.delayed_match_updates DROP CONSTRAINT IF EXISTS delayed_match_updates_match_id_fkey;
-- Prior user removal is also an immutable command receipt, not a live invitation.
ALTER TABLE private.delayed_removals DROP CONSTRAINT IF EXISTS delayed_removals_match_id_fkey;

CREATE OR REPLACE FUNCTION private.delayed_delete_pending_invitation(parent uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE m private.delayed_matches;
BEGIN
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 IF m.accepted_at IS NOT NULL OR m.settled_at IS NOT NULL OR
  (m.status<>'invited' AND NOT (m.status='cancelled' AND EXISTS(
   SELECT FROM private.delayed_requests r WHERE r.match_id=m.id AND r.actor=m.organizer
   AND r.fingerprint->>'op'='cancel' AND r.response->>'status'='cancelled')))
  OR EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=m.id AND
   (c.actor IS NOT NULL OR c.starter IS NOT NULL OR c.segment<>0 OR c.revision<>0 OR
    c.started_at IS NOT NULL OR c.available_at IS NOT NULL OR c.state IS NOT NULL OR c.terminal))
  OR EXISTS(SELECT FROM private.delayed_outcomes WHERE match_id=m.id)
  OR EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m.id)
  OR EXISTS(SELECT FROM private.delayed_review_events WHERE match_id=m.id)
  OR EXISTS(SELECT FROM private.delayed_incidents WHERE match_id=m.id)
 THEN RAISE EXCEPTION 'delayed:pending_invitation_required'; END IF;

 DELETE FROM private.push_deliveries d USING private.push_events e
  WHERE d.event_id=e.id AND e.match_id=m.id;
 DELETE FROM private.push_events WHERE match_id=m.id;
 DELETE FROM private.push_episodes WHERE match_id=m.id;
 DELETE FROM private.push_match_preferences WHERE match_id=m.id;
 DELETE FROM private.push_presence WHERE match_id=m.id;
 DELETE FROM public.platform_notifications WHERE match_id=m.id;
 DELETE FROM private.delayed_children WHERE match_id=m.id;
 -- Surviving owner-filtered UPDATE invalidates both lobbies and the bell.
 INSERT INTO public.delayed_match_updates(match_id,user_id,revision)
 VALUES(m.id,m.organizer,m.revision+1),(m.id,m.opponent,m.revision+1)
 ON CONFLICT(match_id,user_id) DO UPDATE SET revision=EXCLUDED.revision;
 DELETE FROM private.delayed_matches WHERE id=m.id AND accepted_at IS NULL
  AND status IN('invited','cancelled');
 IF NOT FOUND THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
END $function$;
REVOKE ALL ON FUNCTION private.delayed_delete_pending_invitation(uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $install$
BEGIN
 IF pg_get_functiondef('public.delayed_respond(uuid,uuid,text,text)'::regprocedure)=$before$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$before$ THEN
  EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 IF p_action='cancel' THEN
  PERFORM private.delayed_delete_pending_invitation(m.id);
  response:=jsonb_build_object('status','cancelled','deleted',true);
  INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
  RETURN response;
 END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$after$;
 ELSIF pg_get_functiondef('public.delayed_respond(uuid,uuid,text,text)'::regprocedure)<>$after$CREATE OR REPLACE FUNCTION public.delayed_respond(p_match uuid, p_request uuid, p_offer_hash text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor_i uuid:=auth.uid(); m private.delayed_matches; receipt private.delayed_requests; fingerprint jsonb;
 c private.delayed_children; first_actor uuid; at_time timestamptz; response jsonb; dealt jsonb;
BEGIN
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(actor_i);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required'; END IF;
 fingerprint:=jsonb_build_object('op',p_action,'match',p_match,'hash',p_offer_hash);
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_i::text||p_request::text,317));
 SELECT * INTO receipt FROM private.delayed_requests WHERE delayed_requests.actor=actor_i AND request_id=p_request;
 IF FOUND THEN IF receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict'; END IF; RETURN receipt.response; END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('accept','decline','cancel') OR
  actor_i IS DISTINCT FROM (CASE WHEN p_action='cancel' THEN m.organizer ELSE m.opponent END) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 IF m.status<>'invited' OR p_offer_hash IS DISTINCT FROM m.offer_hash THEN RAISE EXCEPTION 'delayed:offer_changed'; END IF;
 IF p_action='cancel' THEN
  PERFORM private.delayed_delete_pending_invitation(m.id);
  response:=jsonb_build_object('status','cancelled','deleted',true);
  INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
  RETURN response;
 END IF;
 at_time:=clock_timestamp();
 IF at_time>=m.expires_at THEN UPDATE private.delayed_matches SET status='expired',revision=revision+1 WHERE id=m.id; response:='{"status":"expired"}';
 ELSIF p_action='accept' THEN
  PERFORM private.delayed_actor(m.organizer);
  IF EXISTS(SELECT FROM public.system_settings WHERE key='maintenance_mode' AND value->>'enabled'='true') THEN RAISE EXCEPTION 'delayed:maintenance'; END IF;
  IF NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND admission_enabled) OR private.delayed_held(m.id) THEN RAISE EXCEPTION 'delayed:admission_closed'; END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
 IF m.real_money AND NOT EXISTS(SELECT FROM private.delayed_release WHERE singleton AND real_qualified) THEN RAISE EXCEPTION 'delayed:real_money_closed';END IF;
  IF NOT private.delayed_multi_enabled() AND ((SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1 OR EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type<>'ptown-words')) THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=m.id ORDER BY ordinal FOR UPDATE LOOP
   IF c.game_type NOT IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two') THEN RAISE EXCEPTION 'delayed:scope_closed';END IF;
   dealt:=NULL;
   IF c.game_type='ptown-words' THEN dealt:=private.ptown_words_deal(jsonb_build_object('rules',c.config,'players',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'userId',p.id,'name',p.username,'seat',CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END,'isBot',false) ORDER BY CASE WHEN p.id=m.organizer THEN 1 ELSE 2 END) FROM public.profiles p WHERE p.id IN(m.organizer,m.opponent))),floor(extract(epoch FROM at_time)*1000)::bigint);
   first_actor:=(dealt->'players'->(dealt->>'turnIndex')::int->>'id')::uuid;
   ELSE first_actor:=CASE WHEN get_byte(extensions.gen_random_bytes(1),0)%2=0 THEN m.organizer ELSE m.opponent END;END IF;
   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
   UPDATE private.delayed_children SET state=dealt,starter=first_actor,actor=first_actor,segment=1,revision=1,
    available_at=at_time,last_call_at=at_time+interval '24 hours',expires_at=at_time+interval '36 hours' WHERE id=c.id;
  END LOOP;
  UPDATE private.delayed_matches SET status='active',accepted_at=at_time,revision=revision+1 WHERE id=m.id;
  response:='{"status":"active"}';
 ELSE
  UPDATE private.delayed_matches SET status=CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END,revision=revision+1 WHERE id=m.id;
  response:=jsonb_build_object('status',CASE p_action WHEN 'decline' THEN 'declined' ELSE 'cancelled' END);
 END IF;
 INSERT INTO private.delayed_requests VALUES(actor_i,p_request,fingerprint,m.id,response);
 PERFORM private.delayed_notify(m.id); RETURN response;
END $function$
$after$ THEN
  RAISE EXCEPTION 'async_bell:source_changed public.delayed_respond(uuid,uuid,text,text)';
 END IF;
END $install$;

DO $install$
BEGIN
 IF pg_get_functiondef('public.delayed_home(uuid)'::regprocedure)=$before$CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2' AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='ptown-words' THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
$before$ THEN
  EXECUTE $after$CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match)
  AND EXISTS(SELECT FROM public.delayed_match_updates WHERE match_id=p_match AND user_id=who) THEN
  RAISE EXCEPTION 'delayed:invitation_cancelled' USING ERRCODE='P0002';
 END IF;
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  item:=item||jsonb_build_object('playable',
   h->>'status'='active' AND NOT (h->>'held')::boolean AND NOT c.terminal AND c.actor=who
   AND least(c.expires_at,c.gameplay_due_at)>statement_timestamp(),
   'playableDeadline',least(c.expires_at,c.gameplay_due_at));
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2' AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='ptown-words' THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
$after$;
 ELSIF pg_get_functiondef('public.delayed_home(uuid)'::regprocedure)<>$after$CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=p_match)
  AND EXISTS(SELECT FROM public.delayed_match_updates WHERE match_id=p_match AND user_id=who) THEN
  RAISE EXCEPTION 'delayed:invitation_cancelled' USING ERRCODE='P0002';
 END IF;
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
  item:=item||jsonb_build_object('playable',
   h->>'status'='active' AND NOT (h->>'held')::boolean AND NOT c.terminal AND c.actor=who
   AND least(c.expires_at,c.gameplay_due_at)>statement_timestamp(),
   'playableDeadline',least(c.expires_at,c.gameplay_due_at));
  -- Existing lobby ordering, presence and resume links use the current actionable deadline.
  IF c.game_type='ptown-words' AND c.config->>'version'='ptown-words/2' AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='ptown-words' THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
$after$ THEN
  RAISE EXCEPTION 'async_bell:source_changed public.delayed_home(uuid)';
 END IF;
END $install$;

-- Filter per match before counting or limiting. Never acknowledge unseen results.
CREATE OR REPLACE FUNCTION public.platform_notification_center()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH viewer AS (SELECT auth.uid() AS id,statement_timestamp() AS at_time),
 available AS MATERIALIZED (
  SELECT m.id AS match_id,count(*) AS turns,min(least(c.expires_at,c.gameplay_due_at)) AS deadline
  FROM viewer v JOIN private.delayed_matches m ON v.id IN(m.organizer,m.opponent)
  JOIN private.delayed_children c ON c.match_id=m.id AND c.actor=v.id
  WHERE m.status='active' AND NOT c.terminal AND NOT private.delayed_held(m.id)
   AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=m.id)
   AND c.expires_at>v.at_time AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>v.at_time)
  GROUP BY m.id
 ),
 visible AS MATERIALIZED (
  SELECT n.*,CASE WHEN n.kind='turn' THEN n.payload||jsonb_build_object(
   'availableCount',a.turns,'earliestDeadline',a.deadline,
   'opponentName',private.async_opponent_name(n.match_id,n.user_id)) ELSE n.payload END AS projected_payload
  FROM public.platform_notifications n JOIN viewer v ON n.user_id=v.id
  LEFT JOIN available a ON a.match_id=n.match_id
  WHERE (n.kind<>'registration' OR (private.account_enabled(v.id) AND public.has_role(v.id,'admin'::public.app_role)
   AND EXISTS(SELECT FROM public.account_access target WHERE target.user_id=n.registration_user_id AND NOT target.ever_enabled)))
   AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=n.match_id)
   AND CASE WHEN n.kind='turn' THEN a.turns>0
    WHEN n.kind='results' THEN n.actionable AND a.match_id IS NULL
    ELSE n.actionable OR n.kind='invitation_closed' AND n.read_revision<n.revision END
 )
 SELECT jsonb_build_object('serverAt',floor(extract(epoch FROM (SELECT at_time FROM viewer))*1000),
  'actionable',(SELECT count(*) FROM visible),
  'items',(SELECT coalesce(jsonb_agg((to_jsonb(n)-'projected_payload')||jsonb_build_object('payload',n.projected_payload) ORDER BY n.updated_at DESC,n.id),'[]')
   FROM (SELECT * FROM visible ORDER BY updated_at DESC,id LIMIT 50)n))
$function$;

-- Only proven sender cancellations, never accepted matches or general removals.
DO $cleanup$
DECLARE target uuid;
BEGIN
 FOR target IN SELECT m.id FROM private.delayed_matches m
  WHERE m.status='cancelled' AND m.accepted_at IS NULL
   AND EXISTS(SELECT FROM private.delayed_requests r WHERE r.match_id=m.id AND r.actor=m.organizer
    AND r.fingerprint->>'op'='cancel' AND r.response->>'status'='cancelled')
  ORDER BY m.id FOR UPDATE
 LOOP PERFORM private.delayed_delete_pending_invitation(target); END LOOP;
END $cleanup$;

