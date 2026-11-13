-- Read-only final positions. Membership comes from the immutable game roster,
-- so standing up or ending a session does not erase a participant's history.
CREATE OR REPLACE FUNCTION public.chess_history(p_mode text,p_match uuid DEFAULT NULL,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); answer jsonb;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'chess:authentication_required' USING ERRCODE='42501';END IF;
 IF p_mode NOT IN ('live','async') OR p_mode IS NULL OR (p_match IS NULL AND p_id IS NULL) THEN RAISE EXCEPTION 'chess:invalid_history_request';END IF;
 WITH saved AS (
  SELECT m.dealer_game_id id,m.game_id session_id,m.state,
   (m.state#>>'{terminal,startedAt}')::bigint completed_at
  FROM private.chess_matches m
  WHERE p_mode='live' AND m.settlement IS NOT NULL AND m.state->>'phase'='complete'
   AND (p_match IS NULL OR m.game_id=p_match) AND (p_id IS NULL OR m.dealer_game_id=p_id)
  UNION ALL
  SELECT c.id,c.match_id,c.state,floor(extract(epoch FROM o.completed_at)*1000)::bigint
  FROM private.delayed_children c JOIN private.delayed_outcomes o ON o.child_id=c.id
  WHERE p_mode='async' AND c.game_type='chess' AND c.terminal AND c.state->>'phase'='complete'
   AND (p_match IS NULL OR c.match_id=p_match) AND (p_id IS NULL OR c.id=p_id)
 ), allowed AS (
  SELECT s.*,p->>'id' viewer_id FROM saved s
  CROSS JOIN LATERAL jsonb_array_elements(s.state->'players') p
  WHERE p->>'userId'=who::text AND coalesce((p->>'isBot')::boolean,false)=false
  ORDER BY s.completed_at DESC,s.id DESC LIMIT 50
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sessionId',session_id,'completedAt',completed_at,
  'state',state||jsonb_build_object('viewerId',viewer_id)) ORDER BY completed_at DESC,id DESC),'[]'::jsonb) INTO answer FROM allowed;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.chess_history(text,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.chess_history(text,uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.chess_history(text,uuid,uuid) IS 'Participant-only immutable completed Chess positions; does not load/sync gameplay or settle/continue sessions.';
