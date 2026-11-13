-- Passive async entry, matching Words: no sync, expiry, replay or settlement.
CREATE OR REPLACE FUNCTION public.delayed_chess_inspect(p_child uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid(); row_i jsonb; s jsonb;
BEGIN
 PERFORM private.chess_authorize('async',p_child,who);
 IF EXISTS(SELECT FROM private.delayed_children c JOIN private.delayed_removals r ON r.match_id=c.match_id
  WHERE c.id=p_child) THEN
  RAISE EXCEPTION 'chess:participant_required' USING ERRCODE='42501';
 END IF;
 row_i:=private.chess_record('async',p_child,who); s:=row_i->'state';
 RETURN s||(row_i-'state')||jsonb_build_object('id',p_child,'canAct',
  NOT (row_i->>'paused')::boolean AND NOT (row_i->>'finished')::boolean
  AND s->>'phase'='playing' AND s->'players'->(s->>'turnIndex')::int->>'id'=who::text);
END $$;
REVOKE ALL ON FUNCTION public.delayed_chess_inspect(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_chess_inspect(uuid) TO authenticated;
