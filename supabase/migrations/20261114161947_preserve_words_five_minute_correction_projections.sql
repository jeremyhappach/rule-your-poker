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
  IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';
  ELSE
   FOR person IN SELECT jsonb_array_elements_text(coalesce(c.state->'players',jsonb_build_array(h->>'organizer',h->>'opponent'))) LOOP
    SELECT coalesce(sum((a->>'score')::bigint),0),coalesce(max((a->>'round')::int),0)+1 INTO pts,next_round FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person;
    SELECT coalesce(sum((a->>'score')::bigint) FILTER(WHERE visible),0),count(*) FILTER(WHERE visible),count(*) FILTER(WHERE NOT visible)
     INTO shown,seen_count,pending_count FROM (
      SELECT a,person=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=who
       WHERE e.child_id=c.id AND e.kind='attempt' AND e.actor::text=person AND e.round=(a->>'round')::int) visible
      FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=person
     ) visible_attempts;
    scores:=scores||jsonb_build_object(person,CASE WHEN pending_count>0 AND seen_count=0 THEN NULL ELSE shown END);
    pending_counts:=pending_counts||jsonb_build_object(person,pending_count);
    required:=CASE c.game_type WHEN 'tri-towers' THEN (c.config->>'stages')::int+CASE WHEN private.tri_towers_bonus_qualified_v2(pts,c.config) THEN (c.config->>'maxBonusStages')::int ELSE 0 END
     WHEN 'crib-lab' THEN 3 WHEN 'chucky-showdown' THEN 3
     WHEN 'quintzee' THEN private.quintzee_required_rounds(pts)
     WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)
     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_current_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'reviewsComplete',private.delayed_reviews_complete(p_match,who),'finaleViewed',EXISTS(SELECT FROM private.delayed_current_finale_seen WHERE match_id=p_match AND viewer=who));
END $function$;


CREATE OR REPLACE FUNCTION private.delayed_words_view(child uuid, viewer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;receipt private.delayed_settlements;s jsonb;held boolean;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) OR viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent) OR m.status NOT IN('active','settled') OR c.game_type<>'ptown-words' THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM private.delayed_current_outcomes WHERE child_id=c.id;
 SELECT * INTO receipt FROM private.delayed_current_settlements WHERE match_id=m.id;
 held:=private.delayed_held(m.id);
 s:=private.ptown_words_visible(c.state,viewer::text);
 IF c.config->>'version' IN ('ptown-words/2','ptown-words/4') THEN
  s:=s||jsonb_build_object('playDeadline',floor(extract(epoch FROM c.gameplay_due_at)*1000),'availabilityDeadline',floor(extract(epoch FROM c.expires_at)*1000));
  IF c.gameplay_due_at IS NOT NULL AND viewer=c.actor THEN s:=s-'movePresentation';END IF;
 END IF;
 RETURN s||jsonb_build_object('identity',jsonb_build_object('sessionId',m.id,'dealerGameId',c.id,'roundId',c.id),
 'revision',c.revision,'viewerId',viewer,'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),
 'deadline',floor(extract(epoch FROM coalesce(c.gameplay_due_at,c.expires_at))*1000),'lastCallAt',floor(extract(epoch FROM c.last_call_at)*1000),
 'canAct',NOT c.terminal AND NOT held AND c.actor=viewer,'paused',held,'pausedAt',NULL,'finished',c.terminal,
 'phase',CASE WHEN c.terminal THEN 'complete' ELSE 'playing' END,'settlement',CASE WHEN receipt.match_id IS NOT NULL THEN jsonb_build_object(m.organizer::text,receipt.organizer_delta,m.opponent::text,receipt.opponent_delta) END,
 'outcome',CASE WHEN o.child_id IS NOT NULL THEN jsonb_build_object('reason',o.reason,'winner',o.winner,'delta',CASE WHEN viewer=m.organizer THEN o.organizer_delta ELSE o.opponent_delta END) END,
 'terminal',CASE WHEN c.terminal THEN jsonb_build_object('resultId',receipt.result_id,'winnerIds',CASE WHEN o.winner IS NULL THEN jsonb_build_array(m.organizer,m.opponent) ELSE jsonb_build_array(o.winner) END,'score',(SELECT max(value::int) FROM jsonb_each_text(c.state->'scores')),'startedAt',floor(extract(epoch FROM o.completed_at)*1000),'deadline',floor(extract(epoch FROM o.completed_at)*1000)) END,
 'financial',jsonb_build_object('balances','{}'::jsonb,'resultId',receipt.result_id,'batch',NULL));
END $function$;
