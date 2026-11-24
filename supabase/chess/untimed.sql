-- Chess timing is selected from authoritative money mode, never a browser preference.
CREATE OR REPLACE FUNCTION private.chess_untimed_state(s jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT s || jsonb_build_object('timingPolicy','play-money-untimed/1','deadline',NULL,
 'clockDuration',0,'opened',true,'turnStartedAt',coalesce((s->>'turnStartedAt')::bigint,
 (s->>'deadline')::bigint-(s->>'clockDuration')::bigint,0))
$$;
REVOKE ALL ON FUNCTION private.chess_untimed_state(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.delayed_turn_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.game_type='chess' AND NOT NEW.terminal AND EXISTS(SELECT FROM private.delayed_matches WHERE id=NEW.match_id AND NOT real_money) THEN
  NEW.state:=private.chess_untimed_state(NEW.state); NEW.available_at:=NULL;NEW.last_call_at:=NULL;NEW.expires_at:=NULL;NEW.started_at:=NULL;NEW.gameplay_due_at:=NULL;
  RETURN NEW;
 END IF;
 IF NOT NEW.terminal AND NEW.available_at IS NOT NULL THEN
  NEW.last_call_at:=NEW.available_at+interval '48 hours';
  NEW.expires_at:=NEW.available_at+interval '72 hours';
  IF NEW.game_type='chess' AND NEW.gameplay_due_at IS NULL AND NEW.state->>'opened'='false' THEN
   NEW.state:=NEW.state||jsonb_build_object('deadline',floor(extract(epoch FROM NEW.expires_at)*1000)::bigint,'clockDuration',259200000);
  ELSIF NEW.game_type='ptown-words' AND NEW.config->>'version'='ptown-words/3' THEN
   NEW.state:=jsonb_set(NEW.state,'{deadline}',to_jsonb(floor(extract(epoch FROM NEW.expires_at)*1000)::bigint));
  END IF;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION private.chess_live_timing() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT NEW.finished AND NEW.settlement IS NULL AND EXISTS(SELECT FROM public.games WHERE id=NEW.game_id AND NOT real_money) THEN
  NEW.state:=private.chess_untimed_state(NEW.state);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.chess_live_timing() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER chess_00_timing BEFORE INSERT OR UPDATE OF state ON private.chess_matches
 FOR EACH ROW EXECUTE FUNCTION private.chess_live_timing();
CREATE OR REPLACE FUNCTION private.chess_sync(mode_i text, id_i uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE m private.chess_matches;c private.delayed_children;parent private.delayed_matches;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);s jsonb;winner uuid;
BEGIN
 IF mode_i='live' THEN
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i;
  PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
  PERFORM 1 FROM public.games WHERE id=m.game_id FOR UPDATE;
  SELECT * INTO STRICT m FROM private.chess_matches WHERE dealer_game_id=id_i FOR UPDATE;
  IF m.finished OR m.paused_at IS NOT NULL THEN RETURN;END IF;
  IF m.settlement IS NOT NULL THEN PERFORM private.chess_finish_postgame(id_i);RETURN;END IF;
  IF EXISTS(SELECT FROM public.games WHERE id=m.game_id AND real_money) AND (m.state->>'deadline')::bigint<=at_ms THEN
   UPDATE private.chess_matches SET state=private.chess_timeout_state(state),revision=revision+1 WHERE dealer_game_id=id_i;
   PERFORM private.chess_settle(id_i);
  END IF;
 ELSE
  SELECT * INTO STRICT parent FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=id_i AND game_type='chess') FOR UPDATE;
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=id_i FOR UPDATE;
  IF c.terminal OR parent.status<>'active' OR private.delayed_held(parent.id) THEN RETURN;END IF;
  IF parent.real_money AND (c.state->>'deadline')::bigint<=at_ms THEN
   s:=private.chess_timeout_state(c.state);winner:=(s->'winnerIds'->>0)::uuid;
   UPDATE private.delayed_children SET state=s,revision=revision+1 WHERE id=id_i RETURNING * INTO c;
   PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',winner,jsonb_build_object('game','chess','reason','timeout','fen',s->>'fen'));
  END IF;
 END IF;
END $function$
;
CREATE OR REPLACE FUNCTION private.delayed_expire(child uuid, expected_segment bigint, expected_expiry timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 IF c.game_type='chess' AND NOT m.real_money THEN RETURN false; END IF;
 IF c.game_type='five-alive' THEN RETURN private.five_alive_async_expire(c,m,expected_segment,expected_expiry); END IF;
 -- An entered live-rules Words turn is governed solely by its playable deadline.
 IF c.game_type='ptown-words' AND c.config->>'version' IN ('ptown-words/2','ptown-words/4') AND c.gameplay_due_at IS NOT NULL THEN
  IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment
     OR c.expires_at IS DISTINCT FROM expected_expiry OR clock_timestamp()<c.gameplay_due_at THEN RETURN false; END IF;
  PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,(c.state->>'deadline')::bigint),clock_timestamp());
  RETURN true;
 END IF;
 IF m.status<>'active' OR c.terminal OR private.delayed_held(m.id) OR c.segment<>expected_segment OR c.expires_at IS DISTINCT FROM expected_expiry
  OR c.expires_at IS NULL OR clock_timestamp()<c.expires_at THEN RETURN false; END IF;
 -- An earlier active-game deadline must be resolved by the game adapter first.
 IF c.gameplay_due_at IS NOT NULL AND c.gameplay_due_at<c.expires_at THEN RETURN false; END IF;
 IF c.game_type='chess' THEN
  PERFORM private.chess_sync('async',c.id);RETURN (SELECT terminal FROM private.delayed_children WHERE id=c.id);
 ELSIF c.game_type='ptown-words' THEN
  IF c.config->>'version'='ptown-words/3' THEN
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'pass',NULL,(c.state->>'deadline')::bigint-1),clock_timestamp());
  ELSE
   PERFORM private.delayed_words_finish_turn(c,private.ptown_words_reduce(c.state,'tick',NULL,greatest((c.state->>'deadline')::bigint,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)),clock_timestamp());
  END IF;
  RETURN true;
 ELSIF c.game_type='quintzee' THEN
  IF c.gameplay_due_at IS NOT NULL THEN RETURN false;END IF;
  PERFORM private.delayed_quintzee_missed_turn(c,m);RETURN true;
 END IF;
 PERFORM private.delayed_record_outcome(c.id,c.revision,'timeout_forfeit',CASE WHEN c.actor=m.organizer THEN m.opponent ELSE m.organizer END,
  jsonb_build_object('segment',c.segment,'expiredAt',c.expires_at,'actor',c.actor));
 RETURN true;
END $function$
;
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
CREATE OR REPLACE FUNCTION public.chess_bot_claim(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ids uuid[];at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 PERFORM 1 FROM private.chess_bot_recovery WHERE singleton AND token=p_token AND NOT claimed AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN '{"accepted":false}'::jsonb;END IF;
 SELECT coalesce(array_agg(dealer_game_id),'{}'::uuid[]) INTO ids FROM (
  SELECT m.dealer_game_id FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id
  WHERE NOT m.finished AND m.settlement IS NULL AND m.paused_at IS NULL AND m.state ? 'bot' AND g.real_money=false AND NOT g.is_paused
   AND m.state->>'phase'='playing' AND (m.state->'players'->(m.state->>'turnIndex')::int->>'isBot')::boolean
   AND coalesce((m.state->>'turnStartedAt')::bigint,(m.state->>'deadline')::bigint-(m.state->>'clockDuration')::bigint)+1000<=at_ms
  ORDER BY (m.state->>'deadline')::bigint,m.dealer_game_id LIMIT 1
 ) due;
 UPDATE private.chess_bot_recovery SET claimed=true,matches=ids WHERE singleton;
 RETURN jsonb_build_object('accepted',true,'matches',ids);
END $function$
;
CREATE OR REPLACE FUNCTION private.chess_commit_impl(p_mode text, p_id uuid, p_actor uuid, p_revision bigint, p_state jsonb, p_request uuid, p_fingerprint jsonb, p_bot boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE row_i jsonb;before_s jsonb;prior private.chess_requests;c private.delayed_children;winner uuid;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);changed_turn boolean;
BEGIN
 IF NOT p_bot THEN PERFORM private.chess_authorize(p_mode,p_id,p_actor);
 ELSIF p_mode<>'live' THEN RAISE EXCEPTION 'chess:bot_mode';END IF;
 PERFORM private.chess_sync(p_mode,p_id);
 row_i:=private.chess_record(p_mode,p_id,CASE WHEN p_bot THEN NULL ELSE p_actor END);before_s:=row_i->'state';
 IF p_bot THEN
  IF NOT EXISTS(SELECT FROM private.chess_matches m JOIN public.games g ON g.id=m.game_id JOIN public.players p ON p.game_id=g.id WHERE m.dealer_game_id=p_id AND p.id=p_actor AND p.is_bot AND g.real_money=false)
    OR NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=p_actor::text AND (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'chess:bot_actor';END IF;
  row_i:=row_i||jsonb_build_object('viewerId',p_actor);
 END IF;
 SELECT * INTO prior FROM private.chess_requests WHERE mode=p_mode AND match_id=p_id AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM p_actor OR prior.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'chess:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','duplicate','record',row_i);
 END IF;
 IF p_request IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'chess:request_required';END IF;
 IF (row_i->>'revision')::bigint IS DISTINCT FROM p_revision OR (row_i->>'settled')::boolean OR (row_i->>'paused')::boolean OR before_s->>'phase'<>'playing' THEN RETURN jsonb_build_object('outcome','stale','record',row_i);END IF;
 -- Forfeit is available to either authorized participant. It cannot alter the board or award the actor a win.
 IF p_fingerprint#>>'{intent,type}'='resign' THEN
  IF NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=row_i->>'viewerId')
   OR p_state->>'phase' IS DISTINCT FROM 'complete' OR p_state->>'reason' IS DISTINCT FROM 'resignation'
   OR p_state->'winnerIds' IS DISTINCT FROM (SELECT jsonb_agg(p->'id') FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'<>row_i->>'viewerId')
   OR (p_state-ARRAY['phase','reason','winnerIds','scores']) IS DISTINCT FROM (before_s-ARRAY['phase','reason','winnerIds','scores'])
   OR p_state->'scores' IS DISTINCT FROM (SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=row_i->>'viewerId' THEN 0 ELSE 1 END) FROM jsonb_array_elements(before_s->'players') p)
  THEN RAISE EXCEPTION 'chess:invalid_forfeit';END IF;
 ELSIF before_s->'players'->(before_s->>'turnIndex')::int->>'id' IS DISTINCT FROM row_i->>'viewerId' THEN RAISE EXCEPTION 'chess:not_your_turn';END IF;
 IF before_s->>'timingPolicy'='play-money-untimed/1' AND (p_fingerprint#>>'{intent,type}'='bank' OR p_state->>'reason'='timeout' OR p_state->'timingPolicy' IS DISTINCT FROM before_s->'timingPolicy') THEN RAISE EXCEPTION 'chess:untimed';END IF;
 IF p_state->'bot' IS DISTINCT FROM before_s->'bot' THEN RAISE EXCEPTION 'chess:bot_config_changed';END IF;
 IF p_state->'identity' IS DISTINCT FROM before_s->'identity' OR p_state->'rules' IS DISTINCT FROM before_s->'rules' OR p_state->'players' IS DISTINCT FROM before_s->'players' OR p_state->'backgroundId' IS DISTINCT FROM before_s->'backgroundId' OR p_state->'initialFen' IS DISTINCT FROM before_s->'initialFen' OR p_state->'mode' IS DISTINCT FROM before_s->'mode' THEN RAISE EXCEPTION 'chess:identity_changed';END IF;
 -- Only the authenticated Node authority can reach this full-state boundary.
 -- Enforce append-only moves and exact rule/config identity again under row lock.
 IF jsonb_array_length(p_state->'moves') NOT BETWEEN jsonb_array_length(before_s->'moves') AND jsonb_array_length(before_s->'moves')+1 OR EXISTS(SELECT FROM jsonb_array_elements(before_s->'moves') WITH ORDINALITY t(m,n) WHERE p_state->'moves'->(n::int-1) IS DISTINCT FROM m) THEN RAISE EXCEPTION 'chess:history_changed';END IF;
 IF p_state->>'phase'='complete' AND (jsonb_array_length(p_state->'winnerIds') NOT BETWEEN 1 AND 2 OR EXISTS(SELECT FROM jsonb_array_elements_text(p_state->'winnerIds') w WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(before_s->'players') p WHERE p->>'id'=w))) THEN RAISE EXCEPTION 'chess:invalid_winner';END IF;
 IF p_mode='live' THEN
  UPDATE private.chess_matches SET state=p_state,revision=revision+1 WHERE dealer_game_id=p_id;
  IF p_state->>'phase'='complete' THEN PERFORM private.chess_settle(p_id);END IF;
 ELSE
  changed_turn:=p_state->'turn' IS DISTINCT FROM before_s->'turn';
  UPDATE private.delayed_children SET state=p_state,revision=revision+1,actor=(p_state->'players'->(p_state->>'turnIndex')::int->>'id')::uuid,
   segment=segment+CASE WHEN changed_turn THEN 1 ELSE 0 END,
   started_at=CASE WHEN changed_turn THEN NULL WHEN (p_state->>'opened')::boolean THEN coalesce(started_at,to_timestamp(at_ms/1000.0)) ELSE started_at END,
   available_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0) ELSE available_at END,
   last_call_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '24 hours' ELSE last_call_at END,
   expires_at=CASE WHEN changed_turn THEN to_timestamp(at_ms/1000.0)+interval '36 hours' ELSE expires_at END,
   gameplay_due_at=CASE WHEN (p_state->>'opened')::boolean THEN to_timestamp((p_state->>'deadline')::bigint/1000.0) END
   WHERE id=p_id RETURNING * INTO c;
  IF p_state->>'phase'='complete' THEN
   winner:=CASE WHEN jsonb_array_length(p_state->'winnerIds')=1 THEN (p_state->'winnerIds'->>0)::uuid END;
   PERFORM private.delayed_record_outcome(p_id,c.revision,CASE WHEN winner IS NULL THEN 'draw' ELSE 'normal' END,winner,jsonb_build_object('game','chess','reason',p_state->>'reason','fen',p_state->>'fen'));
  ELSE UPDATE private.delayed_matches SET revision=revision+1 WHERE id=c.match_id;PERFORM private.delayed_notify(c.match_id);END IF;
 END IF;
 INSERT INTO private.chess_requests VALUES(p_mode,p_id,p_request,p_actor,p_fingerprint);
 RETURN jsonb_build_object('outcome','committed','record',private.chess_record(p_mode,p_id,p_actor));
END $function$
;
CREATE OR REPLACE FUNCTION private.push_sync(parent uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE m private.delayed_matches; who uuid; ks text[]; fresh text[]; old private.push_episodes; kind_i text; event_i uuid;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=parent FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT coalesce(array_agg(c.id::text||':'||c.segment ORDER BY c.id),'{}') INTO ks
   FROM private.delayed_children c WHERE c.match_id=parent AND c.actor=who AND NOT c.terminal AND (c.expires_at>clock_timestamp() OR c.game_type='chess' AND NOT m.real_money)
   AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
   AND m.status='active' AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent);
  INSERT INTO private.push_episodes(match_id,user_id) VALUES(parent,who) ON CONFLICT DO NOTHING;
  SELECT * INTO old FROM private.push_episodes WHERE match_id=parent AND user_id=who FOR UPDATE;
  SELECT coalesce(array_agg(k),'{}') INTO fresh FROM unnest(ks) k WHERE NOT k=ANY(old.keys);
  -- Last Call retains child/segment identity; turn alerts open only from zero availability.
  IF cardinality(fresh)>0 THEN
   old.epoch:=old.epoch+1;
   IF cardinality(old.keys)=0 THEN old.turn_epoch:=old.epoch; END IF;
   FOREACH kind_i IN ARRAY ARRAY['turn','last_call'] LOOP
    IF kind_i='turn' AND cardinality(old.keys)>0 THEN CONTINUE; END IF;
    IF kind_i='last_call' AND NOT EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=parent AND c.last_call_at IS NOT NULL AND c.id::text||':'||c.segment=ANY(fresh)) THEN CONTINUE;END IF;
    INSERT INTO private.push_events(match_id,user_id,epoch,kind,keys) VALUES(parent,who,old.epoch,kind_i,fresh) RETURNING id INTO event_i;
    -- Only devices/preferences opted in at transition time; no retrospective push flood.
    INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
     SELECT event_i,s.id,s.binding FROM private.push_subscriptions s JOIN private.push_match_preferences p ON p.user_id=s.user_id AND p.match_id=parent
     WHERE s.user_id=who AND NOT s.disabled AND p.enabled;
   END LOOP;
  END IF;
  UPDATE private.push_episodes SET keys=ks,epoch=old.epoch,
   turn_epoch=CASE WHEN cardinality(ks)=0 THEN NULL ELSE old.turn_epoch END
   WHERE match_id=parent AND user_id=who
   AND (keys IS DISTINCT FROM ks OR epoch<>old.epoch);
 END LOOP;
END $function$
;
CREATE OR REPLACE FUNCTION private.push_eligible(e private.push_events, s private.push_subscriptions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT NOT s.disabled AND s.user_id=e.user_id
 AND EXISTS(SELECT FROM auth.sessions WHERE id=s.session_id AND user_id=s.user_id AND (not_after IS NULL OR not_after>clock_timestamp()))
 AND EXISTS(SELECT FROM public.profiles WHERE id=s.user_id AND is_active)
 AND ((e.kind='registration' AND public.has_role(e.user_id,'admin'::public.app_role)
   AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND registrations_enabled)
   AND EXISTS(SELECT FROM public.account_access WHERE user_id=e.registration_user_id AND NOT enabled AND NOT ever_enabled))
 OR (e.kind='table_open'
  AND e.created_at+interval '5 minutes'>clock_timestamp()
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND new_table_enabled)
  AND EXISTS(SELECT FROM private.push_table_openings WHERE session_id=e.table_id AND host_id IS DISTINCT FROM e.user_id)
  AND private.push_table_allowed(e.table_id,e.user_id)
  -- Drop a table alert if any quiet minute has elapsed since its opening, even
  -- when the worker was asleep for that entire (short) window. No morning backlog.
  AND NOT EXISTS(SELECT FROM private.push_defaults p, LATERAL generate_series(date_trunc('minute',e.created_at),clock_timestamp(),interval '1 minute') t
   WHERE p.user_id=e.user_id AND private.push_quiet_at(p,t)))
 OR (e.kind='invite'
  AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND invitations_enabled)
  AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND m.opponent=e.user_id
   AND m.status='invited' AND m.accepted_at IS NULL AND m.expires_at>clock_timestamp()
   AND NOT private.delayed_held(m.id) AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)))
 OR (e.kind IN('turn','last_call') AND EXISTS(SELECT FROM private.push_match_preferences WHERE match_id=e.match_id AND user_id=e.user_id AND enabled)
 AND EXISTS(SELECT FROM private.push_episodes WHERE match_id=e.match_id AND user_id=e.user_id AND ((e.kind='turn' AND turn_epoch=e.epoch AND cardinality(keys)>0) OR (e.kind='last_call' AND keys&&e.keys)))
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND e.user_id IN(m.organizer,m.opponent)
  AND m.status='active' AND NOT private.delayed_held(m.id)
  AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id))
 AND EXISTS(SELECT FROM private.delayed_children c WHERE c.match_id=e.match_id AND c.actor=e.user_id AND NOT c.terminal
  AND (e.kind='turn' OR c.id::text||':'||c.segment=ANY(e.keys))
  AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
  AND (c.expires_at>clock_timestamp() OR c.game_type='chess' AND c.state->>'timingPolicy'='play-money-untimed/1' AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=c.match_id AND NOT m.real_money)) AND (e.kind='turn' OR c.last_call_at<=clock_timestamp()))));
$function$
;
CREATE OR REPLACE FUNCTION private.delayed_record_outcome(child uuid, expected_revision bigint, reason_i text, winner_i uuid, evidence_i jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children; m private.delayed_matches; old private.delayed_outcomes; delta_i integer;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=child FOR UPDATE;
 SELECT * INTO old FROM private.delayed_current_outcomes WHERE child_id=child;
 IF FOUND THEN
  IF (old.terminal_revision,old.reason,old.winner,old.evidence) IS DISTINCT FROM (expected_revision,reason_i,winner_i,evidence_i)
  THEN RAISE EXCEPTION 'delayed:outcome_conflict'; END IF;
  RETURN to_jsonb(old);
 END IF;
 IF m.status<>'active' OR c.terminal OR c.revision IS DISTINCT FROM expected_revision OR private.delayed_held(m.id)
 THEN RAISE EXCEPTION 'delayed:stale_outcome'; END IF;
 IF reason_i IS NULL OR reason_i NOT IN('normal','timeout_forfeit','draw','void') OR evidence_i IS NULL
 OR (reason_i IN('normal','timeout_forfeit') AND (winner_i IS NULL OR winner_i NOT IN(m.organizer,m.opponent)))
 OR (reason_i IN('draw','void') AND winner_i IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_outcome'; END IF;
 IF c.game_type='chess' AND NOT m.real_money AND reason_i='timeout_forfeit' THEN RAISE EXCEPTION 'chess:untimed';END IF;
 delta_i:=CASE WHEN winner_i=m.organizer THEN c.stake WHEN winner_i=m.opponent THEN -c.stake ELSE 0 END;
 IF EXISTS(SELECT FROM private.delayed_current_corrections WHERE match_id=c.match_id) THEN
 INSERT INTO private.delayed_reopened_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,generation)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i,(SELECT generation FROM private.delayed_current_corrections WHERE match_id=c.match_id)) RETURNING child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence,completed_at INTO old;
 ELSE
 INSERT INTO private.delayed_outcomes(child_id,match_id,terminal_revision,segment,reason,winner,organizer_delta,opponent_delta,evidence)
 VALUES(c.id,m.id,c.revision,c.segment,reason_i,winner_i,delta_i,-delta_i,evidence_i) RETURNING * INTO old;
 END IF;
 UPDATE private.delayed_children SET terminal=true,revision=revision+1 WHERE id=c.id;
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_finalize(m.id);
 PERFORM private.delayed_notify(m.id);
 RETURN to_jsonb(old);
END $function$
;
CREATE OR REPLACE FUNCTION private.chess_timeout_state(s jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN s->>'timingPolicy'='play-money-untimed/1' THEN s ELSE s||jsonb_build_object('phase','complete','reason','timeout','winnerIds',jsonb_build_array(s->'players'->(1-(s->>'turnIndex')::int)->>'id'),'scores',(SELECT jsonb_object_agg(p->>'id',CASE WHEN p->>'id'=s->'players'->(1-(s->>'turnIndex')::int)->>'id' THEN 1 ELSE 0 END) FROM jsonb_array_elements(s->'players')p))
 END
$function$
;
CREATE OR REPLACE FUNCTION private.chess_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE delta bigint;at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);m private.chess_matches;
BEGIN
 IF NEW.game_type IS DISTINCT FROM 'chess' OR NEW.is_paused IS NOT DISTINCT FROM OLD.is_paused THEN RETURN NEW;END IF;
 SELECT * INTO m FROM private.chess_matches WHERE dealer_game_id=NEW.current_game_uuid FOR UPDATE;
 IF NOT FOUND OR m.finished THEN RETURN NEW;END IF;
 IF NEW.is_paused THEN UPDATE private.chess_matches SET state=state-'pauseRequest',paused_at=at_ms,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 ELSIF m.paused_at IS NOT NULL THEN delta:=at_ms-m.paused_at;UPDATE private.chess_matches SET state=CASE WHEN state->>'timingPolicy'='play-money-untimed/1' THEN state ELSE jsonb_set(state,'{deadline}',to_jsonb((state->>'deadline')::bigint+delta)) END||CASE WHEN state?'terminal' THEN jsonb_build_object('terminal',(state->'terminal')||jsonb_build_object('deadline',(state#>>'{terminal,deadline}')::bigint+delta)) ELSE '{}'::jsonb END,paused_at=NULL,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.admin_restore_untimed_chess(p_request uuid, p_child uuid, p_expected_revision bigint, p_outcome_hash text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;s private.delayed_settlements;
 prior private.delayed_corrections;fp jsonb;restored private.delayed_children;at_i timestamptz:=clock_timestamp();at_ms bigint;
 opening bigint;last_move bigint;bank jsonb;actor_i uuid:=auth.uid();pa public.players;pb public.players;
 ta public.player_transactions;tb public.player_transactions;ra jsonb;rb jsonb;generation_i integer;financial_id uuid:=gen_random_uuid();
BEGIN
 IF actor_i IS NULL OR NOT public.has_role(actor_i,'admin'::public.app_role) THEN RAISE EXCEPTION 'chess_correction:not_authorized' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_child IS NULL OR p_expected_revision IS NULL OR p_outcome_hash IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 2000 THEN RAISE EXCEPTION 'chess_correction:identity_and_reason_required';END IF;
 fp:=jsonb_build_object('child',p_child,'revision',p_expected_revision,'outcomeHash',p_outcome_hash,'reason',p_reason);
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.delayed_corrections WHERE id=p_request;
 IF FOUND THEN
  IF prior.actor IS DISTINCT FROM actor_i OR prior.fingerprint IS DISTINCT FROM fp THEN RAISE EXCEPTION 'chess_correction:request_conflict';END IF;
  RETURN jsonb_build_object('id',prior.id,'matchId',prior.match_id,'childId',prior.child_id,'reversalIds',prior.reversal_ids,'outcome','already_corrected');
 END IF;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(SELECT match_id FROM private.delayed_children WHERE id=p_child) FOR UPDATE;
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child FOR UPDATE;
 SELECT coalesce(max(generation),0)+1 INTO generation_i FROM private.delayed_corrections WHERE match_id=m.id;
 SELECT * INTO STRICT o FROM private.delayed_current_outcomes WHERE child_id=c.id;
 SELECT * INTO STRICT s FROM private.delayed_current_settlements WHERE match_id=m.id;
 IF private.delayed_held(m.id) OR m.status<>'settled' OR m.real_money OR NOT c.terminal OR c.game_type<>'chess' OR c.revision<>p_expected_revision
 OR s.outcome_hash<>p_outcome_hash OR s.child_count<>1 OR (SELECT count(*) FROM private.delayed_children WHERE match_id=m.id)<>1
 OR o.reason<>'timeout_forfeit' OR c.state->>'reason'<>'timeout' OR c.state->>'phase'<>'complete'
 OR c.state#>>'{rules,version}'<>'ptown-chess/1' OR c.state#>>'{rules,turnMs}'<>'300000'
 OR o.organizer_delta<>s.organizer_delta OR abs(s.organizer_delta)<>c.stake
 OR c.actor::text IS DISTINCT FROM c.state->'players'->(c.state->>'turnIndex')::int->>'id'
 OR c.state->>'fen' IS DISTINCT FROM coalesce(c.state#>>'{moves,-1,fen}',c.state->>'initialFen')
 OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
 THEN RAISE EXCEPTION 'chess_correction:evidence_mismatch';END IF;
 SELECT max((fingerprint->>'revision')::bigint) INTO last_move FROM private.chess_requests WHERE mode='async' AND match_id=c.id AND fingerprint#>>'{intent,type}'='move';
 SELECT min((fingerprint->>'revision')::bigint) INTO opening FROM private.chess_requests WHERE mode='async' AND match_id=c.id AND actor=c.actor
 AND fingerprint#>>'{intent,type}'='open' AND (fingerprint->>'revision')::bigint>coalesce(last_move,-1);
 IF opening IS NULL OR c.state->>'opened'<>'true' THEN RAISE EXCEPTION 'chess_correction:turn_receipt_missing';END IF;
 SELECT coalesce(jsonb_agg(slot ORDER BY slot),'[]') INTO bank FROM jsonb_array_elements(c.state->'banks'->c.actor::text) slot
 WHERE NOT EXISTS(SELECT FROM private.chess_requests r WHERE r.mode='async' AND r.match_id=c.id AND r.actor=c.actor
 AND (r.fingerprint->>'revision')::bigint>=opening AND r.fingerprint#>>'{intent,type}'='bank' AND r.fingerprint#>'{intent,slot}'=slot);
 SELECT * INTO STRICT pa FROM public.players WHERE game_id=s.game_id AND user_id=m.organizer AND NOT is_bot FOR UPDATE;
 SELECT * INTO STRICT pb FROM public.players WHERE game_id=s.game_id AND user_id=m.opponent AND NOT is_bot FOR UPDATE;
 IF pa.chips<>s.organizer_delta OR pb.chips<>s.opponent_delta OR EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=s.game_id AND transaction_type='SessionResult') OR EXISTS(SELECT FROM public.games WHERE id=s.game_id AND real_money) THEN RAISE EXCEPTION 'chess_correction:financial_evidence_mismatch';END IF;
 PERFORM public.settle_gameplay_chip_transfers(s.game_id,jsonb_build_array(jsonb_build_object(
 'from',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pa.id ELSE pb.id END),
 'to',jsonb_build_object('kind','player','playerId',CASE WHEN s.organizer_delta>0 THEN pb.id ELSE pa.id END),
 'amount',abs(s.organizer_delta))),'transfer');
 IF EXISTS(SELECT FROM public.players WHERE id IN(pa.id,pb.id) AND chips<>0) THEN RAISE EXCEPTION 'chess_correction:unbalanced_reversal';END IF;
 at_ms:=floor(extract(epoch FROM at_i)*1000);
 restored:=c;
 restored.state:=(c.state-ARRAY['reason','terminal','movePresentation'])||jsonb_build_object('phase','playing','winnerIds','[]'::jsonb,
 'scores',jsonb_build_object(m.organizer::text,0,m.opponent::text,0),'deadline',at_ms+259200000,'clockDuration',259200000,'opened',false,
 'banks',c.state->'banks');
 restored.state:=private.chess_untimed_state(restored.state);
 restored.terminal:=false;restored.revision:=c.revision+1;restored.segment:=c.segment+1;
 restored.available_at:=NULL;restored.last_call_at:=NULL;restored.expires_at:=NULL;
 restored.started_at:=NULL;restored.gameplay_due_at:=NULL;
 INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at,generation)
 VALUES(p_request,c.id,m.id,actor_i,p_reason,fp,to_jsonb(c),to_jsonb(restored),to_jsonb(m),to_jsonb(o),to_jsonb(s),'{}'::uuid[],financial_id,txid_current(),session_user,at_i,generation_i);
 UPDATE private.delayed_children SET state=restored.state,terminal=false,revision=restored.revision,segment=restored.segment,
 available_at=restored.available_at,last_call_at=restored.last_call_at,expires_at=restored.expires_at,started_at=restored.started_at,gameplay_due_at=restored.gameplay_due_at WHERE id=c.id;
 UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
 PERFORM private.delayed_notify(m.id);
 RETURN jsonb_build_object('id',p_request,'matchId',m.id,'childId',c.id,'outcome','corrected_untimed','generation',generation_i,'reversalIds','[]'::jsonb,'untimed',true,'banks',restored.state->'banks');
END $function$
;
REVOKE ALL ON FUNCTION public.admin_restore_untimed_chess(uuid,uuid,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_untimed_chess(uuid,uuid,bigint,text,text) TO authenticated;

-- Only active play-money games are retimed. Historical completions remain immutable.
DO $retime$ DECLARE parent uuid;BEGIN
 FOR parent IN SELECT DISTINCT m.id FROM private.delayed_matches m JOIN private.delayed_children c ON c.match_id=m.id
 WHERE m.status='active' AND NOT m.real_money AND c.game_type='chess' AND NOT c.terminal LOOP
  PERFORM 1 FROM private.delayed_matches WHERE id=parent FOR UPDATE;
  UPDATE private.delayed_children SET state=private.chess_untimed_state(state),revision=revision+1
   WHERE match_id=parent AND game_type='chess' AND NOT terminal;
  UPDATE private.delayed_matches SET revision=revision+1 WHERE id=parent;
  PERFORM private.delayed_notify(parent);
 END LOOP;
 UPDATE private.chess_matches c SET state=private.chess_untimed_state(c.state),revision=c.revision+1
 FROM public.games g WHERE g.id=c.game_id AND NOT g.real_money AND NOT c.finished AND c.settlement IS NULL;
END $retime$;

