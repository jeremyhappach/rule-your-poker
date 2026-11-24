-- Presentation/read projections only. No historical ACKs, gameplay or financial writes.
CREATE OR REPLACE FUNCTION private.delayed_words_reveal_state(child uuid, viewer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
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
  AND (e.kind='child' OR e.actor<>viewer) AND NOT EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=delayed_words_reveal_state.viewer))
 THEN scores:=c.state->'scores';END IF;
 RETURN jsonb_build_object('scores',scores,'boundary',boundary,'board',source);
END$$;
REVOKE ALL ON FUNCTION private.delayed_words_reveal_state(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.delayed_words_mask(s jsonb, child uuid, viewer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE known jsonb:=private.delayed_words_reveal_state(child,viewer); safe jsonb:=known->'board';
BEGIN
 s:=s||jsonb_build_object('scores',known->'scores','reviewProjectionVersion',1);
 IF EXISTS(SELECT FROM private.delayed_current_review_events e WHERE e.child_id=child AND e.kind='attempt'
  AND e.actor<>viewer AND e.round>(known->>'boundary')::integer
  AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=delayed_words_mask.viewer)) THEN
  s:=s-ARRAY['movePresentation','event']||jsonb_build_object(
   'board',coalesce(safe->'board',(SELECT jsonb_agg(NULL::text) FROM generate_series(1,225))),
   'moves',coalesce(safe->'moves','[]'::jsonb));
 END IF;
 IF s#>>'{movePresentation,playerId}' IS DISTINCT FROM viewer::text
  AND coalesce((s#>>'{movePresentation,turn}')::integer,0)<=(known->>'boundary')::integer THEN
  s:=s-'movePresentation';
 END IF;
 RETURN s;
END$$;
REVOKE ALL ON FUNCTION private.delayed_words_mask(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE src text:=pg_get_functiondef('public.delayed_home(uuid)'::regprocedure);
BEGIN
 IF strpos(src,'private.delayed_words_reveal_state(c.id,who)')>0 THEN RETURN;END IF;
 IF strpos(src,'shown:=coalesce(shown,0);')=0 OR strpos(src,'lineup:=lineup||jsonb_build_array(item||')=0 THEN RAISE EXCEPTION 'result_recovery:home_changed';END IF;
 src:=replace(src,'shown:=coalesce(shown,0);',
  'shown:=(private.delayed_words_reveal_state(c.id,who)#>>ARRAY[''scores'',person])::bigint;');
 src:=replace(src,'lineup:=lineup||jsonb_build_array(item||',$new$
 item:=item||jsonb_build_object('reviewCount',(SELECT count(*) FROM private.delayed_current_review_events e
  WHERE e.child_id=c.id AND (e.kind='child' OR e.actor IS DISTINCT FROM who)
   AND private.delayed_take_two_review_allowed(ROW(e.*)::private.delayed_review_events,who)
   AND NOT EXISTS(SELECT FROM private.delayed_review_seen seen WHERE seen.event_id=e.id AND seen.viewer=who)));
 lineup:=lineup||jsonb_build_array(item||$new$);
 EXECUTE src;
END $patch$;

DO $patch$
DECLARE src text:=pg_get_functiondef('private.delayed_words_view(uuid,uuid)'::regprocedure);
BEGIN
 IF strpos(src,'private.delayed_words_mask(')>0 THEN RETURN;END IF;
 IF strpos(src,'s:=private.ptown_words_visible(c.state,viewer::text);')=0 THEN RAISE EXCEPTION 'result_recovery:view_changed';END IF;
 EXECUTE replace(src,'s:=private.ptown_words_visible(c.state,viewer::text);',
  's:=private.delayed_words_mask(private.ptown_words_visible(c.state,viewer::text),child,viewer);');
END $patch$;

-- Explicit review fetches the saved play; ordinary lobby/inspection never does.
DO $patch$
DECLARE src text:=pg_get_functiondef('public.delayed_reviews(uuid)'::regprocedure);
BEGIN
 IF strpos(src,'''beforeScore''')>0 THEN RETURN;END IF;
 IF strpos(src,'''board'',b.board,')=0 THEN RAISE EXCEPTION 'result_recovery:reviews_changed';END IF;
 src:=replace(src,'''board'',b.board,',$new$'board',b.board,
 'beforeScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt' THEN
  CASE WHEN e.round<=(private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer
   THEN (private.delayed_words_reveal_state(c.id,who)#>>ARRAY['scores',e.actor::text])::bigint
   ELSE (b.board#>>ARRAY['scores',e.actor::text])::bigint-e.score END END,
 'afterScore',CASE WHEN c.game_type='ptown-words' AND e.kind='attempt' THEN
  CASE WHEN e.round<=(private.delayed_words_reveal_state(c.id,who)->>'boundary')::integer
   THEN (private.delayed_words_reveal_state(c.id,who)#>>ARRAY['scores',e.actor::text])::bigint
   ELSE (b.board#>>ARRAY['scores',e.actor::text])::bigint END END,$new$);
 IF strpos(src,'''events'',answer,')=0 THEN RAISE EXCEPTION 'result_recovery:review_return_changed';END IF;
 src:=replace(src,'''events'',answer,',$new$'events',answer,
 'finalBoard',CASE WHEN c.terminal AND c.game_type='ptown-words'
  THEN private.delayed_words_view(c.id,who)||private.ptown_words_visible(c.state,who::text) END,$new$);
 EXECUTE src;
END $patch$;
