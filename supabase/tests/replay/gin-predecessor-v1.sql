SET LOCAL lock_timeout='5s';
SET LOCAL check_function_bodies=false;
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.gin_start_next_hand_core(uuid)'::regprocedure)) IS DISTINCT FROM '0e4244d3f823efeff2fe51fbdf91743e' THEN
  RAISE EXCEPTION 'Gin predecessor owner drift';
 END IF;
END $guard$;
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

CREATE OR REPLACE FUNCTION private.gin_start_next_hand_core(_predecessor_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_previous public.rounds%ROWTYPE;
  v_next public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_next_state jsonb;
  v_hand_number integer;
  v_next_dealer uuid;
  v_next_nondealer uuid;
BEGIN
  SELECT * INTO v_previous FROM public.rounds WHERE id=_predecessor_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_found'; END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_previous.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_start_next_hand:not_gin_game'; END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_predecessor_round_id FOR UPDATE;
  IF v_state IS NULL OR v_state->>'phase'<>'complete' OR nullif(v_state->>'winnerPlayerId','') IS NOT NULL THEN
    RAISE EXCEPTION 'gin_rummy_start_next_hand:predecessor_not_continuable';
  END IF;
  v_hand_number := v_previous.hand_number+1;
  SELECT * INTO v_next FROM public.rounds
   WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_previous.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_previous.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','status',v_game.status,'state',NULL);
  END IF;
  v_next_dealer := (v_state->>'nonDealerPlayerId')::uuid;
  v_next_nondealer := (v_state->>'dealerPlayerId')::uuid;
  v_next_state := private.gin_deal_state(
    v_game,v_next_dealer,v_next_nondealer,v_state->'matchScores',v_hand_number,
    (v_state->>'pointsToWin')::integer,(v_state->>'anteAmount')::integer
  );
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  BEGIN
    INSERT INTO public.rounds(
      game_id,dealer_game_id,round_number,hand_number,cards_dealt,pot,status,gin_rummy_state,predecessor_round_id
    ) VALUES (
      v_previous.game_id,v_previous.dealer_game_id,1,v_hand_number,10,0,'betting',
      private.gin_public_state(v_next_state),v_previous.id
    ) RETURNING * INTO v_next;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_next FROM public.rounds
     WHERE dealer_game_id=v_previous.dealer_game_id AND hand_number=v_hand_number AND round_number=1 LIMIT 1;
    SELECT state INTO v_next_state FROM private.gin_rummy_round_states WHERE round_id=v_next.id;
    RETURN jsonb_build_object('outcome','already_started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
  END;
  PERFORM private.gin_publish_state(v_next.id,v_next_state);
  UPDATE public.rounds SET status='completed',decision_deadline=NULL,current_turn_position=NULL WHERE id=v_previous.id RETURNING * INTO v_previous;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_predecessor_close_v1(v_previous,v_next.id);
  END IF;
  UPDATE public.games SET current_round=1,total_hands=v_hand_number,is_first_hand=false,replay_contract_version=1 WHERE id=v_previous.game_id RETURNING * INTO v_game;
  IF v_game.replay_contract_version=1 THEN
    PERFORM private.replay_gin_open_v1(v_game,v_next,v_next_state,(SELECT config FROM public.dealer_games WHERE id=v_next.dealer_game_id));
  END IF;
  RETURN jsonb_build_object('outcome','started','round_id',v_next.id,'hand_number',v_hand_number,'state',v_next_state);
END;
$function$
;
