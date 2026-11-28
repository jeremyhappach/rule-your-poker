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
   AND ((c.game_type='chess' AND NOT (h->>'realMoney')::boolean) OR least(c.expires_at,c.gameplay_due_at)>statement_timestamp()),
   'untimed',c.game_type='chess' AND NOT (h->>'realMoney')::boolean,
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

 IF private.delayed_sealed(c) THEN
  SELECT jsonb_object_agg(q.person_key,q.score),jsonb_object_agg(q.person_key,q.completed),jsonb_object_agg(q.person_key,q.pending)
   INTO scores,progress,pending_counts FROM (
    SELECT player.id person_key,coalesce(sum((a->>'score')::bigint) FILTER(WHERE player.id=who::text OR (a->>'round')::int<(c.state->>'round')::int),0) score,
     count(a) completed,count(a) FILTER(WHERE player.id<>who::text AND (a->>'round')::int>=(c.state->>'round')::int) pending
    FROM jsonb_array_elements_text(c.state->'players') player(id) LEFT JOIN LATERAL jsonb_array_elements(c.state->'attempts') a ON a->>'actor'=player.id GROUP BY player.id
   ) q;
  item:=item||jsonb_build_object('flowVersion','delayed/sealed/1','playableDeadline',least(c.expires_at,to_timestamp((CASE WHEN c.game_type IN('crib-lab','chucky-showdown') THEN c.state#>>ARRAY['parts',who::text,'board','nextDue'] ELSE c.state#>>ARRAY['parts',who::text,'board','deadline'] END)::bigint/1000.0)),'completedRounds',progress,'round',c.state->'round',
   'playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,who),
   'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,CASE WHEN who::text=h->>'organizer' THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END),
   'startedAt',to_timestamp((c.state#>>ARRAY['parts',who::text,'segmentStartedAt'])::bigint/1000.0));
 END IF;
 item:=item||jsonb_build_object('reviewCount',(SELECT count(*) FROM private.delayed_current_review_events e
  WHERE e.child_id=c.id AND c.terminal AND e.kind='child'
   AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who)
   AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who)));
 lineup:=lineup||jsonb_build_array(item||CASE WHEN c.game_type='five-alive' THEN jsonb_build_object('round',least(3,coalesce((c.state#>>'{fiveAlive,current}')::int,0)+1),'playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who),'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,CASE WHEN who::text=(h->>'organizer') THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END)) ELSE '{}'::jsonb END||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round>=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$
;
