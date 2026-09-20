-- Exact transaction-local identity. Approved entry points restore prior claims
-- before every return; exceptions roll back the claim with their subtransaction.
CREATE OR REPLACE FUNCTION private.farkle_claim_v1(p_game_id uuid,p_dealer_id uuid,p_round_id uuid,p_operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN ('configure','start','action','pause','control','cleanup')
 OR NOT EXISTS(SELECT 1 FROM public.games g WHERE g.id=p_game_id
   AND (p_operation IN ('configure','cleanup') OR (g.game_type='farkle' AND g.current_game_uuid=p_dealer_id)))
 OR (p_round_id IS NOT NULL AND p_operation NOT IN ('start','cleanup') AND NOT EXISTS(
   SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND r.game_id=p_game_id AND r.dealer_game_id=p_dealer_id))
 THEN RAISE EXCEPTION 'farkle:invalid_authority_identity' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.farkle_authority',jsonb_build_object('game',p_game_id,'dealer',p_dealer_id,'round',p_round_id,'operation',p_operation)::text,true);
END $f$;
REVOKE ALL ON FUNCTION private.farkle_claim_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.farkle_require_claim_v1(game_id uuid,dealer_id uuid DEFAULT NULL,round_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $f$
DECLARE claim jsonb:=nullif(current_setting('app.farkle_authority',true),'')::jsonb;
BEGIN
 IF current_user IN ('anon','authenticated','service_role') OR claim IS NULL
 OR coalesce(claim->>'operation','') NOT IN ('configure','start','action','pause','control','cleanup')
 OR claim->>'game' IS DISTINCT FROM game_id::text
 OR (dealer_id IS NOT NULL AND claim->>'operation' NOT IN ('configure','cleanup') AND claim->>'dealer' IS DISTINCT FROM dealer_id::text)
 OR (round_id IS NOT NULL AND claim->>'round' IS NOT NULL AND claim->>'round' IS DISTINCT FROM round_id::text)
 THEN RAISE EXCEPTION 'farkle:authority_claim_required' USING ERRCODE='42501'; END IF;
END $f$;
REVOKE ALL ON FUNCTION private.farkle_require_claim_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
