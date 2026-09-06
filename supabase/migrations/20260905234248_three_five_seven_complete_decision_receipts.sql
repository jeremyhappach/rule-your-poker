-- Complete versioned decision receipts; no gameplay or settlement behavior changes.
CREATE OR REPLACE FUNCTION public.three_five_seven_submit_decision(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer, p_player_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_result jsonb;
  v_game_result jsonb;
  v_round_result jsonb;
BEGIN
  IF p_decision NOT IN ('stay','fold') THEN RAISE EXCEPTION 'three_five_seven_submit_decision:invalid_decision'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_submit_decision:game_not_found'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('left','observer') OR coalesce(v_player.sitting_out,false) THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:player_not_eligible';
  END IF;
  IF coalesce(v_player.is_bot,false) OR auth.uid() IS DISTINCT FROM v_player.user_id THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:not_player_owner';
  END IF;

  IF coalesce(v_player.decision_locked,false) THEN
    IF v_player.current_decision<>p_decision THEN
      RAISE EXCEPTION 'three_five_seven_submit_decision:decision_already_locked';
    END IF;
    SELECT * INTO v_claim
      FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id
       AND resolution.dealer_game_id=p_dealer_game_id
       AND resolution.round_id=p_round_id
       AND resolution.hand_number=p_hand_number
       AND resolution.round_number=p_round_number;
    v_game_result:=jsonb_build_object(
      'id',v_game.id,'status',v_game.status,'authority_revision',v_game.authority_revision,'current_game_uuid',v_game.current_game_uuid,
      'total_hands',v_game.total_hands,'current_round',v_game.current_round,
      'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
    );
    v_round_result:=jsonb_build_object(
      'id',v_round.id,'authority_revision',v_round.authority_revision,'dealer_game_id',v_round.dealer_game_id,
      'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
    );
    RETURN jsonb_build_object(
      'outcome','already_decided','deduped',true,'decision',p_decision,
      'resolution',CASE WHEN FOUND THEN v_claim.result||jsonb_build_object('deduped',true) ELSE NULL END,
      'game',v_game_result,'round',v_round_result,
      'decision_reveal',private.three_five_seven_decision_reveal(
        p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
      ),
      'server_now',statement_timestamp()
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:stale_game_identity';
  END IF;
  PERFORM private.assert_game_not_paused(p_game_id);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision=p_decision,decision_locked=true WHERE id=p_player_id;
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id;
  v_game_result:=jsonb_build_object(
    'id',v_game.id,'status',v_game.status,'authority_revision',v_game.authority_revision,'current_game_uuid',v_game.current_game_uuid,
    'total_hands',v_game.total_hands,'current_round',v_game.current_round,
    'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
  );
  v_round_result:=jsonb_build_object(
    'id',v_round.id,'authority_revision',v_round.authority_revision,'dealer_game_id',v_round.dealer_game_id,
    'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
  );
  RETURN jsonb_build_object(
    'outcome','decision_committed','decision',p_decision,'resolution',v_result,
    'game',v_game_result,'round',v_round_result,
    'decision_reveal',private.three_five_seven_decision_reveal(
      p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
    ),
    'server_now',statement_timestamp()
  );
END;
$function$;
