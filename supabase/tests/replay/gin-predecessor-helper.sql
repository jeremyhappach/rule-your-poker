-- One boundary append before the existing successor opening append. Both
-- checkpoint records commit atomically with the authoritative handoff.
-- No journal reconstruction, mutable-state read, or private-card projection.
CREATE OR REPLACE FUNCTION private.replay_gin_predecessor_close_v1(_previous public.rounds,_successor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $fn$
DECLARE tail jsonb;before_state jsonb;after_state jsonb;round_after jsonb;actor text;closing jsonb;delta jsonb;
BEGIN
 SELECT body INTO tail FROM private.replay_steps
 WHERE session_id=_previous.game_id ORDER BY sequence DESC LIMIT 1;
 -- Never synthesize history for an uncaptured predecessor or modify old rows.
 IF tail IS NULL OR tail #>> '{identity,roundId}' IS DISTINCT FROM _previous.id::text THEN RETURN; END IF;
 IF tail #>> '{closing,completeness}' IS DISTINCT FROM 'complete'
 OR tail #>> '{closing,writerContract}' IS DISTINCT FROM 'gin-replay/1' THEN RETURN; END IF;
 before_state:=tail #> '{closing,endingState}';
 round_after:=to_jsonb(_previous)-ARRAY['gin_rummy_state','authority_revision'];
 delta:=private.replay_diff_v1(before_state->'round',round_after,ARRAY['round']);
 IF delta='[]'::jsonb THEN RETURN; END IF;
 IF _previous.status IS DISTINCT FROM 'completed' OR _successor IS NULL THEN
  RAISE EXCEPTION 'replay_v1:invalid_predecessor_completion';
 END IF;
 after_state:=jsonb_set(before_state,'{round}',round_after);
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
  SELECT value->>'playerId' INTO actor FROM jsonb_array_elements(before_state->'roster') WHERE value->>'userId'=auth.uid()::text LIMIT 1;
 END IF;
 closing:=(tail->'closing')||jsonb_build_object('endingState',after_state,'disposition','continued');
 PERFORM private.replay_append_v1(_previous.game_id,'gin:'||_previous.id||':predecessor_completed',tail->'identity',NULL,
  jsonb_build_array(jsonb_build_object('type','gin.predecessor_completed','source','private.gin_start_next_hand_core',
    'actorId',actor,'targets',jsonb_build_array(_previous.id,_successor),'origin',CASE WHEN actor IS NULL THEN 'system' ELSE 'player' END,
    'operands',jsonb_build_object('contract','gin-continuation/1','predecessorRoundId',_previous.id,'successorRoundId',_successor),
    'delta',delta,'scores','[]'::jsonb,'transfers','[]'::jsonb)),closing);
END;
$fn$;
REVOKE ALL ON FUNCTION private.replay_gin_predecessor_close_v1(public.rounds,uuid) FROM PUBLIC,anon,authenticated,service_role;
