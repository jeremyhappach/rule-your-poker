-- Additive, passive history projection. Never call a load/recover/ACK owner.
CREATE OR REPLACE FUNCTION public.delayed_match_record(p_match uuid,p_child uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 who uuid:=auth.uid(); m private.delayed_matches; c private.delayed_children;
 h jsonb; lineup jsonb:='[]'; item jsonb; scores jsonb; detail jsonb:=NULL;
BEGIN
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match AND who IN(organizer,opponent);
 IF who IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501'; END IF;
 IF m.status<>'settled' OR NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=m.id)
 THEN RAISE EXCEPTION 'delayed:not_complete' USING ERRCODE='42501'; END IF;
 IF p_child IS NOT NULL AND NOT EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND match_id=m.id AND terminal)
 THEN RAISE EXCEPTION 'delayed:not_found' USING ERRCODE='42501'; END IF;
 h:=public.delayed_history_detail(m.id);
 FOR item IN SELECT value FROM jsonb_array_elements(h->'lineup') LOOP
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=(item->>'id')::uuid AND match_id=m.id;
  scores:=CASE
   WHEN c.game_type='five-alive' AND c.state#>>'{fiveAlive,players,0}' IS NOT NULL THEN jsonb_build_object(
    c.state#>>'{fiveAlive,players,0}',c.state#>'{fiveAlive,sharedScores,0}',
    c.state#>>'{fiveAlive,players,1}',c.state#>'{fiveAlive,sharedScores,1}')
   WHEN c.game_type IN('chess','ptown-words') THEN c.state->'scores'
   ELSE c.state->'totals' END;
  lineup:=lineup||jsonb_build_array(item||jsonb_build_object('scores',scores,'pendingResults','{}'::jsonb));
  IF c.id=p_child THEN
   detail:=jsonb_build_object('id',c.id,'matchId',m.id,'game',c.game_type,'config',c.config,
    'attempts',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'actor',a->'actor','round',a->'round','score',a->'score','at',a->'at',
      'board',private.delayed_review_board(c.game_type,a->'board'))
      ORDER BY (a->>'round')::int,a->>'actor'),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a),
    'board',CASE
     WHEN c.game_type='chess' THEN (SELECT jsonb_object_agg(key,value) FROM jsonb_each(c.state)
      WHERE key=ANY(ARRAY['identity','fen','initialFen','players','moves','winnerIds','reason','phase']))
      ||jsonb_build_object('viewerId',(SELECT p->>'id' FROM jsonb_array_elements(c.state->'players') p WHERE p->>'userId'=who::text))
     WHEN c.game_type='ptown-words' THEN private.delayed_review_board(c.game_type,c.state)
     WHEN c.state->'board' IS NOT NULL AND c.state->'board'<>'null'::jsonb THEN private.delayed_review_board(c.game_type,c.state->'board')
     ELSE NULL END,
    'words',CASE WHEN c.game_type='five-alive' THEN jsonb_build_object(
      'players',c.state#>'{fiveAlive,players}','rounds',c.state#>'{fiveAlive,rounds}') ELSE NULL END);
  END IF;
 END LOOP;
 RETURN jsonb_build_object('home',h||jsonb_build_object('lineup',lineup),'detail',detail);
END $function$;
REVOKE ALL ON FUNCTION public.delayed_match_record(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_match_record(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.delayed_match_record(uuid,uuid) IS 'Participant-only settled match record; no recovery, playback, acknowledgements or settlement.';
