-- Make the 3-5-7 all-fold transition an exact, ledger-gated handoff.
-- The last decision RPC returns the committed result directly to its caller;
-- Realtime remains peer synchronization and the scheduled recovery lease is
-- only a fallback for clients that disconnect before acknowledging the batch.

DO $migration$
DECLARE
  v_function_sql text;
  v_old_declaration text := $old$
  v_amount integer:=0; v_result jsonb; v_settlement jsonb; v_new_legs integer; v_terminal boolean:=false;
$old$;
  v_new_declaration text := $new$
  v_amount integer:=0; v_result jsonb; v_settlement jsonb; v_new_legs integer; v_terminal boolean:=false;
  v_presentation_cursor integer;
$new$;
  v_old_all_fold text := $old$
  IF v_stayers=0 THEN
    v_outcome:='all_fold'; v_message:='All players folded';
    IF coalesce(v_game.pussy_tax_enabled,true) AND coalesce(v_game.pussy_tax_value,0)>0 THEN
      FOR v_player IN SELECT * FROM public.players player
       WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
      LOOP
        v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
          'from',jsonb_build_object('kind','player','playerId',v_player.id),
          'to',jsonb_build_object('kind','pot'),'amount',v_game.pussy_tax_value));
        v_changes:=jsonb_set(v_changes,ARRAY[v_player.id::text],to_jsonb(-v_game.pussy_tax_value),true);
      END LOOP;
      PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'bet');
    END IF;
$old$;
  v_new_all_fold text := $new$
  IF v_stayers=0 THEN
    v_outcome:='all_fold'; v_message:='All players folded';
    IF coalesce(v_game.pussy_tax_enabled,true) AND coalesce(v_game.pussy_tax_value,0)>0 THEN
      FOR v_player IN SELECT * FROM public.players player
       WHERE player.game_id=p_game_id AND player.status NOT IN ('left','observer') AND NOT coalesce(player.sitting_out,false)
      LOOP
        v_transfer:=v_transfer||jsonb_build_array(jsonb_build_object(
          'from',jsonb_build_object('kind','player','playerId',v_player.id),
          'to',jsonb_build_object('kind','pot'),'amount',v_game.pussy_tax_value));
        v_changes:=jsonb_set(v_changes,ARRAY[v_player.id::text],to_jsonb(-v_game.pussy_tax_value),true);
      END LOOP;
      PERFORM public.settle_gameplay_chip_transfers(p_game_id,v_transfer,'bet');
      EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
      EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
      SELECT game.chip_transfer_cursor INTO v_presentation_cursor
        FROM public.games game
       WHERE game.id=p_game_id;
      IF coalesce(v_presentation_cursor,0)<=0 THEN
        RAISE EXCEPTION 'three_five_seven_resolve_round:pussy_tax_batch_missing';
      END IF;
    END IF;
$new$;
  v_old_result text := $old$
  v_result:=jsonb_build_object(
    'outcome',v_outcome,'deduped',false,'winner_player_id',v_winner_id,'message',v_message,
    'round_id',p_round_id,'dealer_game_id',p_dealer_game_id,'hand_number',p_hand_number,
    'round_number',p_round_number,'next_round_number',CASE WHEN v_terminal THEN NULL ELSE v_next_round END
  );
$old$;
  v_new_result text := $new$
  v_result:=jsonb_build_object(
    'outcome',v_outcome,'deduped',false,'winner_player_id',v_winner_id,'message',v_message,
    'round_id',p_round_id,'dealer_game_id',p_dealer_game_id,'hand_number',p_hand_number,
    'round_number',p_round_number,'next_round_number',CASE WHEN v_terminal THEN NULL ELSE v_next_round END
  );
  IF v_outcome='all_fold' THEN
    v_result:=v_result||jsonb_build_object(
      'presentation_kind','pussy_tax',
      'presentation_transfer_cursor',v_presentation_cursor
    );
  END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'private.three_five_seven_resolve_round(uuid,uuid,uuid,integer,integer)'::regprocedure
  ) INTO v_function_sql;

  IF position('presentation_transfer_cursor' IN v_function_sql)>0 THEN
    RETURN;
  END IF;
  IF position(v_old_declaration IN v_function_sql)=0
     OR position(v_old_all_fold IN v_function_sql)=0
     OR position(v_old_result IN v_function_sql)=0 THEN
    RAISE EXCEPTION 'fix_357_all_fold_wave_handoff:resolver_shape_mismatch';
  END IF;

  v_function_sql:=replace(v_function_sql,v_old_declaration,v_new_declaration);
  v_function_sql:=replace(v_function_sql,v_old_all_fold,v_new_all_fold);
  v_function_sql:=replace(v_function_sql,v_old_result,v_new_result);
  EXECUTE v_function_sql;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.three_five_seven_submit_decision(
  p_game_id uuid,p_round_id uuid,p_dealer_game_id uuid,p_hand_number integer,p_round_number integer,
  p_player_id uuid,p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,private
AS $$
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
      'id',v_game.id,'current_game_uuid',v_game.current_game_uuid,
      'total_hands',v_game.total_hands,'current_round',v_game.current_round,
      'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
    );
    v_round_result:=jsonb_build_object(
      'id',v_round.id,'dealer_game_id',v_round.dealer_game_id,
      'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
    );
    RETURN jsonb_build_object(
      'outcome','already_decided','deduped',true,'decision',p_decision,
      'resolution',CASE WHEN FOUND THEN v_claim.result||jsonb_build_object('deduped',true) ELSE NULL END,
      'game',v_game_result,'round',v_round_result
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:stale_game_identity';
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision=p_decision,decision_locked=true WHERE id=p_player_id;
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id;
  v_game_result:=jsonb_build_object(
    'id',v_game.id,'current_game_uuid',v_game.current_game_uuid,
    'total_hands',v_game.total_hands,'current_round',v_game.current_round,
    'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
  );
  v_round_result:=jsonb_build_object(
    'id',v_round.id,'dealer_game_id',v_round.dealer_game_id,
    'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
  );
  RETURN jsonb_build_object(
    'outcome','decision_committed','decision',p_decision,'resolution',v_result,
    'game',v_game_result,'round',v_round_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text)
  TO authenticated;

COMMENT ON FUNCTION private.three_five_seven_resolve_round(uuid,uuid,uuid,integer,integer) IS
  'Resolves an exact 3-5-7 round; all-fold finalizes and returns the exact pussy-tax presentation cursor before publishing awaiting_next_round.';
COMMENT ON FUNCTION public.three_five_seven_submit_decision(uuid,uuid,uuid,integer,integer,uuid,text) IS
  'Commits an exact player decision and returns the committed game, round, durable resolution, and all-fold presentation identity directly to the initiating client.';
