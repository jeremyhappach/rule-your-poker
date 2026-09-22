BEGIN;
-- The existing service-only authority verifies getUser freshly, then passes that
-- verified UUID here. Browser roles cannot call this RPC or supply private state.
-- Admission and the unchanged journal/CAS/settlement commit share one transaction.
CREATE FUNCTION public.run21_server_commit_admitted(
 p_verified_user_id uuid,p_dealer_game_id uuid,p_expected_revision bigint,p_state jsonb,p_bot_due_at bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m private.run21_matches; g public.games;
BEGIN
 IF NOT private.run21_actor_allowed(p_verified_user_id) THEN
  RAISE EXCEPTION 'run21:release_denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT m FROM private.run21_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.participants) p
   JOIN public.players seat ON seat.id=(p->>'id')::uuid AND seat.game_id=m.game_id
   WHERE p->>'userId'=p_verified_user_id::text AND p->>'kind'='human'
     AND seat.user_id=p_verified_user_id AND NOT seat.is_bot AND seat.status<>'left') THEN
  RAISE EXCEPTION 'run21:participant_required' USING ERRCODE='42501';
 END IF;
 IF g.real_money IS DISTINCT FROM false OR g.game_type IS DISTINCT FROM 'run21'
   OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR m.finished THEN
  RAISE EXCEPTION 'run21:inactive_identity';
 END IF;
 IF m.revision<>p_expected_revision THEN RETURN jsonb_build_object('outcome','conflict','revision',m.revision); END IF;
 -- A duplicate/rejected action still checks fresh admission and CAS but writes nothing.
 IF p_state IS NULL THEN RETURN jsonb_build_object('outcome','committed','record',to_jsonb(m)); END IF;
 RETURN public.run21_server_commit(p_dealer_game_id,p_expected_revision,p_state,p_bot_due_at);
END $$;
REVOKE ALL ON FUNCTION public.run21_server_commit_admitted(uuid,uuid,bigint,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run21_server_commit_admitted(uuid,uuid,bigint,jsonb,bigint) TO service_role;
COMMIT;
