-- Approved results/history release: guarded, atomic review metadata migration.
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('public.delayed_home(uuid)'::regprocedure),chr(13),''))<>'380f31ca8625abf413de1db5ea688f61' THEN RAISE EXCEPTION 'async_review:preimage_changed public.delayed_home(uuid)';END IF;
 IF md5(replace(pg_get_functiondef('public.platform_notification_center()'::regprocedure),chr(13),''))<>'d27d9dc9844f8bb8dfb675ded2acfba0' THEN RAISE EXCEPTION 'async_review:preimage_changed public.platform_notification_center()';END IF;
 IF md5(replace(pg_get_functiondef('private.delayed_notify(uuid)'::regprocedure),chr(13),''))<>'11ec814833fa12df6c1e34a7ae2b3062' THEN RAISE EXCEPTION 'async_review:preimage_changed private.delayed_notify(uuid)';END IF;
 IF md5(replace(pg_get_functiondef('public.delayed_load(uuid,uuid,uuid)'::regprocedure),chr(13),''))<>'ff04043f645d91abcccafa7edf49f009' THEN RAISE EXCEPTION 'async_review:preimage_changed public.delayed_load(uuid,uuid,uuid)';END IF;
END $$;

-- No cleanup of authority/audit state and no financial writers.
-- Apply atomically: close the backfill/trigger gap against concurrent authority writers.
LOCK TABLE private.delayed_matches,private.delayed_children IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.platform_notifications DROP CONSTRAINT platform_notifications_kind_check;
ALTER TABLE public.platform_notifications ADD CONSTRAINT platform_notifications_kind_check CHECK(kind IN('invitation','turn','settled','invitation_closed','accepted','results'));
CREATE TABLE private.delayed_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES private.delayed_children(id),
 match_id uuid NOT NULL REFERENCES private.delayed_matches(id), event_key text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('attempt','child')), actor uuid, round integer NOT NULL,
 score bigint, completed_at timestamptz NOT NULL, receipt jsonb NOT NULL
);
CREATE TABLE private.delayed_review_boards (
 event_id uuid PRIMARY KEY REFERENCES private.delayed_review_events(id), board jsonb NOT NULL
);
CREATE TABLE private.delayed_review_seen (
 event_id uuid NOT NULL REFERENCES private.delayed_review_events(id), viewer uuid NOT NULL REFERENCES public.profiles(id),
 seen_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(event_id,viewer)
);
CREATE TABLE private.delayed_finale_seen (
 match_id uuid NOT NULL REFERENCES private.delayed_settlements(match_id),viewer uuid NOT NULL REFERENCES public.profiles(id),
 seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(match_id,viewer)
);
CREATE TABLE private.delayed_acceptance_retired (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id)
);
CREATE TABLE private.delayed_review_playback (
 event_id uuid NOT NULL REFERENCES private.delayed_review_events(id),viewer uuid NOT NULL REFERENCES public.profiles(id),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),lease_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',PRIMARY KEY(event_id,viewer)
);
ALTER TABLE private.delayed_review_playback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_review_playback FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.delayed_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.delayed_review_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.delayed_review_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.delayed_finale_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.delayed_acceptance_retired ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_review_events,private.delayed_review_boards,private.delayed_review_seen,
 private.delayed_finale_seen,private.delayed_acceptance_retired FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX delayed_review_match ON private.delayed_review_events(match_id,child_id,round);
CREATE INDEX delayed_review_child ON private.delayed_review_events(child_id,actor,round);
CREATE INDEX delayed_history_organizer ON private.delayed_matches(organizer,settled_at DESC,id DESC) WHERE status='settled';
CREATE INDEX delayed_history_opponent ON private.delayed_matches(opponent,settled_at DESC,id DESC) WHERE status='settled';
CREATE TRIGGER delayed_review_events_immutable BEFORE UPDATE OR DELETE ON private.delayed_review_events FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_review_seen_immutable BEFORE UPDATE OR DELETE ON private.delayed_review_seen FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();
CREATE TRIGGER delayed_finale_seen_immutable BEFORE UPDATE OR DELETE ON private.delayed_finale_seen FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

-- Derived compatibility receipts only: never rewrite historical authority or copy private boards.
INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 SELECT c.id,c.match_id,c.id||':'||(a->>'actor')||':'||(a->>'round'),'attempt',(a->>'actor')::uuid,
 (a->>'round')::int,(a->>'score')::bigint,to_timestamp((a->>'at')::numeric/1000),
 jsonb_build_object('game',c.game_type,'rules',c.config,'result',a#>'{board,result}','legacy',true)
 FROM private.delayed_children c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.state->'attempts','[]')) a
 WHERE c.game_type<>'ptown-words' ON CONFLICT(event_key) DO NOTHING;
INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 SELECT c.id,c.match_id,c.id||':final','child',NULL,0,NULL,o.completed_at,
 jsonb_build_object('game',c.game_type,'rules',c.config,'reason',o.reason,'winner',o.winner,'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',c.stake,'legacy',true)
 FROM private.delayed_children c JOIN private.delayed_outcomes o ON o.child_id=c.id ON CONFLICT(event_key) DO NOTHING;
INSERT INTO private.delayed_acceptance_retired(match_id)
 SELECT m.id FROM private.delayed_matches m WHERE m.accepted_at IS NOT NULL AND (m.status<>'active' OR EXISTS(
 SELECT FROM private.delayed_children c WHERE c.match_id=m.id AND (c.starter=m.organizer OR c.actor=m.organizer OR c.segment>1))) ON CONFLICT DO NOTHING;

CREATE FUNCTION private.delayed_review_board(game text,b jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE game WHEN 'run21' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(b) WHERE key=ANY(ARRAY['playerId','columns','passesUsed','presented','current','cardIndex','revision','startedAt','deadline','result']))
 WHEN 'tri-towers' THEN private.tri_towers_visible(b)
 WHEN 'quintzee' THEN private.quintzee_present_board(b)
 WHEN 'boxdrop' THEN private.boxdrop_visible(b)
 WHEN 'ptown-words' THEN private.ptown_words_visible(b,NULL)-ARRAY['rack','rackCounts'] END
$$;

CREATE FUNCTION private.delayed_capture_reviews() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a jsonb; e uuid; o private.delayed_outcomes; move jsonb;
BEGIN
 IF NEW.game_type<>'ptown-words' THEN
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(NEW.state->'attempts','[]')) LOOP
   e:=NULL;
   INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(NEW.id,NEW.match_id,NEW.id||':'||(a->>'actor')||':'||(a->>'round'),'attempt',(a->>'actor')::uuid,
    (a->>'round')::int,(a->>'score')::bigint,to_timestamp((a->>'at')::numeric/1000),
    jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'result',a#>'{board,result}'))
   ON CONFLICT(event_key) DO NOTHING RETURNING id INTO e;
   IF e IS NOT NULL THEN INSERT INTO private.delayed_review_boards VALUES(e,private.delayed_review_board(NEW.game_type,a->'board'));END IF;
  END LOOP;
 ELSIF OLD.state->>'turn' IS DISTINCT FROM NEW.state->>'turn' THEN
  move:=NEW.state->'moves'->-1;
  IF move IS NOT NULL THEN
   INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
   VALUES(NEW.id,NEW.match_id,NEW.id||':word:'||(move->>'turn'),'attempt',(move->>'playerId')::uuid,
    (move->>'turn')::int,(move->>'points')::bigint,clock_timestamp(),jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'move',move))
   ON CONFLICT(event_key) DO NOTHING RETURNING id INTO e;
   IF e IS NOT NULL THEN INSERT INTO private.delayed_review_boards VALUES(e,private.delayed_review_board(NEW.game_type,NEW.state));END IF;
  END IF;
 END IF;
 IF NEW.terminal AND NOT OLD.terminal THEN
  SELECT * INTO STRICT o FROM private.delayed_outcomes WHERE child_id=NEW.id;
  INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
  VALUES(NEW.id,NEW.match_id,NEW.id||':final','child',NULL,0,NULL,o.completed_at,
   jsonb_build_object('game',NEW.game_type,'rules',NEW.config,'reason',o.reason,'winner',o.winner,
    'organizerDelta',o.organizer_delta,'opponentDelta',o.opponent_delta,'stake',NEW.stake))
  ON CONFLICT(event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER delayed_capture_reviews AFTER UPDATE OF state,terminal ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.delayed_capture_reviews();

-- Eligibility is separate from execution. No scheduler or destructive migration runs this.
CREATE FUNCTION private.delayed_review_cleanup_eligible(e private.delayed_review_events) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT e.kind='attempt' AND e.receipt->>'game'<>'ptown-words'
 AND NOT EXISTS(SELECT FROM private.delayed_review_playback p WHERE p.event_id=e.id AND p.lease_until>clock_timestamp())
 AND EXISTS(SELECT FROM private.delayed_matches m WHERE m.id=e.match_id AND
  EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=CASE WHEN e.actor=m.organizer THEN m.opponent ELSE m.organizer END))
 AND (
  (EXISTS(SELECT FROM private.delayed_review_events later WHERE later.child_id=e.child_id AND later.kind='attempt' AND later.actor<>e.actor AND later.round>=e.round)
   OR EXISTS(SELECT FROM private.delayed_children c WHERE c.id=e.child_id AND c.terminal))
  AND NOT EXISTS(SELECT FROM private.delayed_review_events f JOIN private.delayed_matches m ON m.id=f.match_id WHERE f.child_id=e.child_id AND f.kind='child'
   AND (NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=f.id AND s.viewer=m.organizer)
     OR NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=f.id AND s.viewer=m.opponent)))
 )
$$;
CREATE FUNCTION private.delayed_prune_review_boards() RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE removed integer:=0;counted integer;e private.delayed_review_events;
BEGIN
 FOR e IN SELECT candidate.* FROM private.delayed_review_events candidate JOIN private.delayed_review_boards saved ON saved.event_id=candidate.id
  WHERE private.delayed_review_cleanup_eligible(candidate) ORDER BY candidate.match_id,candidate.completed_at LIMIT 100 LOOP
  -- The same parent lock serializes playback leases, acknowledgements and pruning.
  PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
  IF private.delayed_review_cleanup_eligible(e) THEN
   DELETE FROM private.delayed_review_boards WHERE event_id=e.id;
   GET DIAGNOSTICS counted=ROW_COUNT;removed:=removed+counted;
  END IF;
 END LOOP;
 RETURN removed;
END $$;

CREATE FUNCTION public.delayed_reviews(p_child uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children;m private.delayed_matches;who uuid:=auth.uid();answer jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id AND who IN(organizer,opponent);
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'actor',e.actor,'round',e.round,'score',e.score,
  'at',e.completed_at,'receipt',e.receipt,'actorName',(SELECT username FROM public.profiles WHERE id=e.actor),'board',b.board,'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who)) ORDER BY e.completed_at,e.kind DESC),'[]') INTO answer
 FROM private.delayed_review_events e LEFT JOIN private.delayed_review_boards b ON b.event_id=e.id WHERE e.child_id=c.id AND (e.actor IS DISTINCT FROM who OR e.kind='child');
 RETURN jsonb_build_object('events',answer,'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL,'expiresAt',c.expires_at,'held',private.delayed_held(m.id),'serverAt',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;

CREATE FUNCTION public.delayed_review_begin(p_event uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e private.delayed_review_events;who uuid:=auth.uid();started timestamptz;
BEGIN
 SELECT * INTO e FROM private.delayed_review_events WHERE id=p_event;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent)) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM private.delayed_matches WHERE id=e.match_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=e.match_id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_playback(event_id,viewer) VALUES(e.id,who)
 ON CONFLICT(event_id,viewer) DO UPDATE SET lease_until=clock_timestamp()+interval '5 minutes'
 RETURNING started_at INTO started;
 RETURN jsonb_build_object('elapsed',greatest(0,floor(extract(epoch FROM clock_timestamp()-started)*1000)),'seen',EXISTS(SELECT FROM private.delayed_review_seen WHERE event_id=e.id AND viewer=who));
END $$;

CREATE FUNCTION public.delayed_review_ack(p_event uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e private.delayed_review_events;m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO STRICT e FROM private.delayed_review_events WHERE id=p_event;
 SELECT * INTO m FROM private.delayed_matches WHERE id=e.match_id AND who IN(organizer,opponent) FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_review_seen(event_id,viewer) VALUES(e.id,who) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $$;
CREATE FUNCTION public.delayed_finale_ack(p_match uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.delayed_matches;who uuid:=auth.uid();inserted integer;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent) AND status='settled' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501';END IF;
 INSERT INTO private.delayed_finale_seen VALUES(m.id,who,clock_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN;END IF;
 PERFORM private.delayed_notify(m.id);
 UPDATE private.delayed_matches SET revision=revision+1 WHERE id=m.id;
END $$;

ALTER FUNCTION public.delayed_home(uuid) RENAME TO delayed_home_before_reviews;
REVOKE ALL ON FUNCTION public.delayed_home_before_reviews(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.delayed_home(p_match uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE h jsonb;c private.delayed_children;item jsonb;lineup jsonb:='[]';who uuid:=auth.uid();scores jsonb;progress jsonb;pending_counts jsonb;person text;pts bigint;shown bigint;pending_count int;seen_count int;next_round int;required int;f uuid;viewed boolean;
BEGIN
 h:=public.delayed_home_before_reviews(p_match);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid;
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
     ELSE greatest((c.config->>'rounds')::int,coalesce((c.state->>'round')::int,1)) END;
    progress:=progress||jsonb_build_object(person,CASE WHEN c.terminal OR next_round>required THEN 'Complete' ELSE 'Next Round: '||next_round END);
   END LOOP;
  END IF;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'pendingResults',pending_counts,'progress',progress,'bagCount',CASE WHEN c.game_type='ptown-words' THEN jsonb_array_length(c.state->'bag') END,'reviewId',f,'viewed',viewed,'result',CASE WHEN viewed THEN item->'result' ELSE NULL END));
 END LOOP;
 RETURN h||jsonb_build_object('lineup',lineup,'unsettled',(SELECT coalesce(sum(stake),0) FROM private.delayed_children WHERE match_id=p_match AND NOT terminal),
  'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=who));
END $$;

-- Carry only acknowledgement identities through the trusted service projection.
DO $$ DECLARE source text;BEGIN
 source:=pg_get_functiondef('public.delayed_load(uuid,uuid,uuid)'::regprocedure);
 IF position('''receipt'',CASE WHEN r.request_id' IN source)=0 THEN RAISE EXCEPTION 'review:load_preimage';END IF;
 EXECUTE replace(source,'''receipt'',CASE WHEN r.request_id','''reviewed'',(SELECT coalesce(jsonb_agg(e.actor::text||'':''||e.round),''[]'') FROM private.delayed_review_events e JOIN private.delayed_review_seen s ON s.event_id=e.id AND s.viewer=p_actor WHERE e.child_id=c.id AND e.kind=''attempt''),''receipt'',CASE WHEN r.request_id');
END $$;

ALTER FUNCTION private.delayed_notify(uuid) RENAME TO delayed_notify_before_reviews;
DO $$ DECLARE source text;BEGIN
 source:=pg_get_functiondef('private.delayed_notify_before_reviews(uuid)'::regprocedure);
 IF position('ARRAY[''invitation'',''turn'',''settled'',''invitation_closed'']' IN source)=0 THEN RAISE EXCEPTION 'review:notification_preimage';END IF;
 EXECUTE replace(source,'ARRAY[''invitation'',''turn'',''settled'',''invitation_closed'']','ARRAY[''invitation'',''turn'',''invitation_closed'']');
END $$;
CREATE FUNCTION private.delayed_notify(parent uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE m private.delayed_matches;who uuid;n int;available int;k text;active boolean;p jsonb;seen boolean;
BEGIN
 PERFORM private.delayed_notify_before_reviews(parent);
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=parent;
 IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=parent) THEN RETURN;END IF;
 IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=parent AND actor=m.organizer AND NOT terminal) THEN
  INSERT INTO private.delayed_acceptance_retired VALUES(parent) ON CONFLICT DO NOTHING;
 END IF;
 FOREACH who IN ARRAY ARRAY[m.organizer,m.opponent] LOOP
  SELECT count(*) INTO available FROM private.delayed_children WHERE match_id=parent AND actor=who AND NOT terminal;
  SELECT count(*) INTO n FROM private.delayed_review_events e WHERE e.match_id=parent AND kind='child' AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=who);
  FOREACH k IN ARRAY ARRAY['accepted','results','settled'] LOOP
   active:=CASE k WHEN 'accepted' THEN who=m.organizer AND m.status='active' AND available=0 AND NOT EXISTS(SELECT FROM private.delayed_acceptance_retired WHERE match_id=parent)
    WHEN 'results' THEN m.status='active' AND n>0
    ELSE m.status='settled' AND NOT EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=parent AND viewer=who) END;
   p:=jsonb_build_object('status',m.status,'opponentId',CASE WHEN who=m.organizer THEN m.opponent ELSE m.organizer END,
    'opponentName',(SELECT username FROM public.profiles WHERE id=CASE WHEN who=m.organizer THEN m.opponent ELSE m.organizer END),'completionCount',n,'availableCount',available);
   INSERT INTO public.platform_notifications(user_id,match_id,kind,actionable,payload) VALUES(who,parent,k,active,p)
   ON CONFLICT(user_id,match_id,kind) DO UPDATE SET actionable=EXCLUDED.actionable,payload=EXCLUDED.payload,revision=platform_notifications.revision+1,updated_at=clock_timestamp()
    WHERE (platform_notifications.actionable,platform_notifications.payload) IS DISTINCT FROM (EXCLUDED.actionable,EXCLUDED.payload);
  END LOOP;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.platform_notification_center() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('actionable',(SELECT count(*) FROM public.platform_notifications WHERE user_id=auth.uid() AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND (actionable OR kind='invitation_closed' AND read_revision<revision)),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY updated_at DESC),'[]') FROM (SELECT * FROM public.platform_notifications WHERE user_id=auth.uid() AND NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND (actionable OR kind='invitation_closed' AND read_revision<revision) ORDER BY updated_at DESC,id LIMIT 50)n))
$$;

CREATE FUNCTION public.delayed_history(p_profile uuid DEFAULT NULL,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'opponent',(SELECT username FROM public.profiles WHERE id=CASE WHEN auth.uid()=m.organizer THEN m.opponent ELSE m.organizer END),
 'startedAt',m.accepted_at,'completedAt',m.settled_at,'count',s.child_count,'net',CASE WHEN auth.uid()=m.organizer THEN s.organizer_delta ELSE s.opponent_delta END,'realMoney',m.real_money) ORDER BY m.settled_at DESC,m.id DESC),'[]')
 FROM (SELECT candidate.* FROM private.delayed_matches candidate WHERE auth.uid() IN(candidate.organizer,candidate.opponent) AND candidate.status='settled' AND (p_profile IS NULL OR p_profile=auth.uid()) AND (p_before IS NULL OR (candidate.settled_at,candidate.id)<(p_before,p_before_id)) ORDER BY candidate.settled_at DESC,candidate.id DESC LIMIT 30) m JOIN private.delayed_settlements s ON s.match_id=m.id
$$;
CREATE FUNCTION public.delayed_history_detail(p_match uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE h jsonb;original jsonb;
BEGIN
 h:=public.delayed_home(p_match);
 original:=public.delayed_home_before_reviews(p_match);
 IF h->>'status'<>'settled' THEN RAISE EXCEPTION 'delayed:not_complete';END IF;
 RETURN h||jsonb_build_object('lineup',(SELECT jsonb_agg(item||jsonb_build_object('result',saved->'result') ORDER BY (item->>'ordinal')::int) FROM jsonb_array_elements(h->'lineup') item JOIN jsonb_array_elements(original->'lineup') saved ON item->>'id'=saved->>'id'),'unsettled',0,'finaleViewed',EXISTS(SELECT FROM private.delayed_finale_seen WHERE match_id=p_match AND viewer=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION private.delayed_review_board(text,jsonb),private.delayed_capture_reviews(),private.delayed_review_cleanup_eligible(private.delayed_review_events),private.delayed_prune_review_boards(),private.delayed_notify(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_reviews(uuid),public.delayed_review_begin(uuid),public.delayed_review_ack(uuid),public.delayed_finale_ack(uuid),public.delayed_home(uuid),public.delayed_history(uuid,timestamptz,uuid),public.delayed_history_detail(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_reviews(uuid),public.delayed_review_begin(uuid),public.delayed_review_ack(uuid),public.delayed_finale_ack(uuid),public.delayed_home(uuid),public.delayed_history(uuid,timestamptz,uuid),public.delayed_history_detail(uuid) TO authenticated;
