-- Presentation and review eligibility only. No gameplay, settlement or historical rows are changed.
CREATE OR REPLACE FUNCTION public.delayed_home(p_match uuid)
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
  IF (c.game_type='chess' OR c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4')) AND c.gameplay_due_at IS NOT NULL THEN
   item:=item||jsonb_build_object('availabilityExpiresAt',c.expires_at,'expiresAt',c.gameplay_due_at,'startedAt',c.started_at,'lastCallAt',NULL);
  END IF;
  SELECT id INTO f FROM private.delayed_current_review_events WHERE child_id=c.id AND kind='child';
  viewed:=f IS NULL OR EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=f AND viewer=who);
  scores:='{}';progress:='{}';pending_counts:='{}';
  IF c.game_type='chess' THEN scores:=NULL;
  ELSIF c.game_type='ptown-words' THEN
   FOR person IN SELECT jsonb_array_elements_text(jsonb_build_array(h->>'organizer',h->>'opponent')) LOOP
    SELECT count(*) INTO pending_count FROM private.delayed_current_review_events e
     WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND person<>who::text
      AND e.round>(private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer
      AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who);
    IF person=who::text OR c.terminal AND viewed THEN shown:=coalesce((c.state->'scores'->>person)::bigint,0);
    ELSE
     SELECT (b.board->'scores'->>person)::bigint INTO shown
      FROM private.delayed_current_review_events e
      JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who
      JOIN private.delayed_review_boards b ON b.event_id=e.id
      WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person ORDER BY e.round DESC LIMIT 1;
     shown:=(private.delayed_words_reveal_state(c.id,who)#>>ARRAY['scores',person])::bigint;
    END IF;
    scores:=scores||jsonb_build_object(person,shown);
    pending_counts:=pending_counts||jsonb_build_object(person,least(pending_count,1));
   END LOOP;
   -- The latest move itself also carries unviewed points.
   item:=item-'lastMove';
  ELSIF c.game_type='five-alive' THEN
   IF c.state->'fiveAlive' IS NOT NULL THEN
    scores:=jsonb_build_object(c.state#>>'{fiveAlive,players,0}',c.state#>'{fiveAlive,sharedScores,0}',c.state#>>'{fiveAlive,players,1}',c.state#>'{fiveAlive,sharedScores,1}');
   END IF;
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR c.terminal AND viewed OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round>=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,least(pending_count,1));
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'crib-lab' THEN 3 WHEN 'chucky-showdown' THEN 3
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  
 item:=item||jsonb_build_object('reviewCount',(SELECT count(*) FROM private.delayed_current_review_events e
  WHERE e.child_id=c.id AND c.terminal AND e.kind='child'
   AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who)
   AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who)));
 lineup:=lineup||jsonb_build_array(item||CASE WHEN c.game_type='five-alive' THEN jsonb_build_object('playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who),'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,CASE WHEN who::text=(h->>'organizer') THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END)) ELSE '{}'::jsonb END||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round>=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;

CREATE OR REPLACE FUNCTION public.delayed_reviews(p_child uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,
 'beforeScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt'
 THEN (b.board#>>ARRAY['scores',e.actor::text])::bigint-e.score END,
 'afterScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt'
 THEN (b.board#>>ARRAY['scores',e.actor::text])::bigint END,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_current_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who);
 RETURN jsonb_build_object('events',answer,
 'turnReviewId',(SELECT e->>'id' FROM jsonb_array_elements(answer) e
 WHERE e->>'kind'='attempt'
 ORDER BY (e->>'round')::integer DESC,(e->>'at')::timestamptz DESC LIMIT 1),
 'revealedThrough',CASE WHEN c.game_type='ptown-words' THEN (private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer END,
 'finalBoard',CASE WHEN c.terminal AND c.game_type='ptown-words'
  THEN private.delayed_words_view(c.id,who)||private.ptown_words_visible(c.state,who::text) END,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $function$
;

CREATE OR REPLACE FUNCTION private.delayed_reviews_complete(parent uuid, who uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT FROM private.delayed_matches m
  JOIN private.delayed_current_settlements s ON s.match_id=m.id
  WHERE m.id=parent AND who IN(m.organizer,m.opponent) AND m.status='settled')
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent)
 AND NOT EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent AND
  (NOT c.terminal OR NOT EXISTS(SELECT FROM private.delayed_current_review_events e
    WHERE e.child_id=c.id AND e.kind='child')))
 AND NOT EXISTS(SELECT FROM private.delayed_current_review_events e WHERE e.match_id=parent
  AND e.kind='child'
  AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who))
$function$
;

CREATE OR REPLACE FUNCTION private.delayed_words_reveal_state(child uuid, viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches; source jsonb; acknowledged jsonb;
 opponent text; boundary integer:=0; ack_turn integer; scores jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR c.game_type<>'ptown-words' THEN
  RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';
 END IF;
 opponent:=CASE WHEN viewer=m.organizer THEN m.opponent ELSE m.organizer END::text;
 -- Unversioned historical responses prove disclosure, not a viewed receipt.
 -- New masked responses carry a version, so they cannot advance this baseline.
 SELECT w.response INTO source FROM private.delayed_word_commands w
 WHERE w.child_id=child AND w.actor=viewer
  AND w.fingerprint->>'action' IN('begin_turn','place','pass','exchange')
  AND NOT w.response ? 'error' AND jsonb_typeof(w.response->'scores')='object'
  AND NOT w.response ? 'reviewProjectionVersion'
 ORDER BY (w.response->>'turn')::integer DESC,(w.response->>'revision')::bigint DESC LIMIT 1;
 boundary:=coalesce((source->>'turn')::integer-1,0);
 SELECT b.board,e.round INTO acknowledged,ack_turn
 FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=delayed_words_reveal_state.viewer
 JOIN private.delayed_review_boards b ON b.event_id=e.id
 WHERE e.child_id=child AND e.kind='attempt' AND e.actor::text=opponent ORDER BY e.round DESC LIMIT 1;
 IF ack_turn>boundary THEN source:=acknowledged;boundary:=ack_turn;END IF;
 scores:=jsonb_build_object(viewer::text,coalesce(c.state->'scores'->viewer::text,'0'::jsonb),
  opponent,coalesce(source->'scores'->opponent,'0'::jsonb));
 IF c.terminal AND NOT EXISTS(SELECT FROM private.delayed_current_review_events e WHERE e.child_id=child
  AND e.kind='child' AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=delayed_words_reveal_state.viewer))
 THEN scores:=c.state->'scores';END IF;
 RETURN jsonb_build_object('scores',scores,'boundary',boundary,'board',source);
END$function$
;

CREATE OR REPLACE FUNCTION public.delayed_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;r private.delayed_commands;
BEGIN
 IF p_actor IS NOT NULL THEN PERFORM private.require_account_enabled(p_actor); END IF;
 PERFORM private.delayed_words_check_health();
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 IF p_actor IS NOT NULL THEN
  PERFORM private.delayed_actor(p_actor);
  IF p_actor NOT IN(m.organizer,m.opponent) THEN RAISE EXCEPTION 'delayed:not_authorized' USING ERRCODE='42501'; END IF;
 END IF;
 IF c.game_type NOT IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:removed_or_unavailable';END IF;
 IF m.status NOT IN('active','settled') THEN RAISE EXCEPTION 'delayed:not_active';END IF;
 SELECT * INTO r FROM private.delayed_commands WHERE actor=p_actor AND request_id=p_request;
 RETURN private.delayed_child_record(c)||jsonb_build_object('reviewed',(SELECT coalesce(jsonb_agg(e.actor::text||':'||e.round),'[]') FROM private.delayed_current_review_events e WHERE e.child_id=c.id AND e.kind='attempt' AND EXISTS(SELECT FROM private.delayed_current_review_events acknowledged JOIN private.delayed_review_seen s ON s.event_id=acknowledged.id AND s.viewer=p_actor WHERE acknowledged.child_id=e.child_id AND acknowledged.actor=e.actor AND acknowledged.kind='attempt' AND acknowledged.round>=e.round)),'receipt',CASE WHEN r.request_id IS NOT NULL THEN to_jsonb(r) END);
END $function$
;

