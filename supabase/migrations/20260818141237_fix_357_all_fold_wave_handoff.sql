BEGIN;
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

SAVEPOINT codex_rollback_proof;
-- Complete rollback-only proof for the 3-5-7 authority cutover.
-- The caller owns BEGIN/ROLLBACK so this same body can run before and after
-- deployment. It invokes the complete scheduled recovery statement, not an
-- isolated helper.

DO $proof$
DECLARE
  v_users uuid[]; v_outsider uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid(); v_dealer uuid:=gen_random_uuid();
  v_cron_game uuid:=gen_random_uuid(); v_cron_dealer uuid:=gen_random_uuid();
  v_leg_game uuid:=gen_random_uuid(); v_leg_dealer uuid:=gen_random_uuid();
  v_terminal_game uuid:=gen_random_uuid(); v_terminal_dealer uuid:=gen_random_uuid();
  v_p1 uuid; v_p2 uuid; v_round uuid; v_r2 uuid; v_r3 uuid; v_r1_next uuid;
  v_cron_p1 uuid; v_cron_p2 uuid; v_cron_round uuid;
  v_l1 uuid; v_l2 uuid; v_leg_round uuid;
  v_t1 uuid; v_t2 uuid; v_terminal_round uuid; v_new_dealer uuid:=gen_random_uuid();
  v_result jsonb; v_replay jsonb; v_chips1 integer; v_chips2 integer; v_count integer; v_cursor integer;
  v_deadline timestamptz; v_reasons text[]; v_setting jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at,id) INTO v_users FROM (
    SELECT id,created_at FROM public.profiles ORDER BY created_at,id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users),0)<2 THEN RAISE EXCEPTION '357_authority_proof:requires_two_profiles'; END IF;

  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_test_no_sweep','on',true);

  INSERT INTO public.games(
    id,name,status,game_type,current_game_uuid,current_host,dealer_position,
    ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,current_round,
    pot,real_money,pussy_tax_enabled,pussy_tax_value,pot_max_enabled,pot_max_value,
    timeout_enforcement_enabled,timeout_action
  ) VALUES(
    v_game,'Codex rollback proof - 357 authority','ante_decision','3-5-7',v_dealer,v_users[1],1,
    2,1,1,3,0,NULL,0,false,true,1,true,10,true,'auto_fold'
  );
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
  VALUES(v_dealer,v_game,v_users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision)
  VALUES
    (v_game,v_users[1],1,100,'active',false,false,'ante_up'),
    (v_game,v_users[2],2,100,'active',false,false,'ante_up');
  SELECT id INTO v_p1 FROM public.players WHERE game_id=v_game AND user_id=v_users[1];
  SELECT id INTO v_p2 FROM public.players WHERE game_id=v_game AND user_id=v_users[2];
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);

  -- Outsiders cannot bootstrap a ready game.
  PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_outsider)::text,true);
  BEGIN
    PERFORM public.three_five_seven_begin_game(v_game);
    RAISE EXCEPTION '357_authority_proof:outsider_bootstrap_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:outsider_bootstrap_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_begin_game(v_game) INTO v_result;
  v_round:=(v_result->>'round_id')::uuid;
  IF v_result->>'outcome'<>'started' OR v_result->'round'->>'id' IS DISTINCT FROM v_round::text
     OR (SELECT status FROM public.games WHERE id=v_game)<>'in_progress'
     OR (SELECT pot FROM public.games WHERE id=v_game)<>4
     OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND chips<>98)
     OR (SELECT count(*) FROM public.player_cards WHERE round_id=v_round)<>2 THEN
    RAISE EXCEPTION '357_authority_proof:atomic_bootstrap_invalid:%',v_result;
  END IF;
  SELECT public.three_five_seven_begin_game(v_game) INTO v_replay;
  IF v_replay->>'outcome'<>'already_started' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
     OR v_replay#>>'{game,id}' IS DISTINCT FROM v_game::text
     OR v_replay#>>'{round,id}' IS DISTINCT FROM v_round::text
     OR (SELECT pot FROM public.games WHERE id=v_game)<>4 OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND chips<>98) THEN
    RAISE EXCEPTION '357_authority_proof:bootstrap_replay_mutated:%',v_replay;
  END IF;
  -- Model the next PostgREST request: transaction-local RPC authority never
  -- crosses a request boundary.
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);

  -- Browser writes to protected game/round/player/card/result state are rejected.
  BEGIN
    UPDATE public.games SET current_round=2 WHERE id=v_game;
    RAISE EXCEPTION '357_authority_proof:direct_game_write_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:direct_game_write_succeeded' OR SQLERRM NOT LIKE '%rpc_required%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.players SET chips=chips+1 WHERE id=v_p1;
    RAISE EXCEPTION '357_authority_proof:direct_player_write_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:direct_player_write_succeeded' OR SQLERRM NOT LIKE '%rpc_required%' THEN RAISE; END IF;
  END;

  -- Deterministic unique R1 showdown. The server evaluates cards and transfers
  -- the pot-sized stake once; a stale exact identity is refused.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.player_cards SET cards=CASE player_id
    WHEN v_p1 THEN '[{"rank":"A","suit":"♠"},{"rank":"A","suit":"♥"},{"rank":"2","suit":"♦"}]'::jsonb
    ELSE '[{"rank":"K","suit":"♠"},{"rank":"Q","suit":"♥"},{"rank":"2","suit":"♣"}]'::jsonb END
   WHERE round_id=v_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  SELECT public.three_five_seven_submit_decision(v_game,v_round,v_dealer,1,1,v_p1,'stay') INTO v_result;
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_game,v_round,v_dealer,1,1,v_p2,'stay') INTO v_result;
  -- The proof body runs inside one caller-owned transaction. Flush and restore
  -- the deferred projector here to model the production RPC commit boundary,
  -- so the later all-fold cursor identifies only its pussy-tax batch.
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  IF v_result#>>'{resolution,outcome}'<>'showdown'
     OR (v_result#>>'{resolution,winner_player_id}')::uuid<>v_p1
     OR (SELECT chips FROM public.players WHERE id=v_p1)<>102
     OR (SELECT chips FROM public.players WHERE id=v_p2)<>94 THEN
    RAISE EXCEPTION '357_authority_proof:unique_showdown_invalid:%',v_result;
  END IF;
  BEGIN
    PERFORM public.three_five_seven_submit_decision(v_game,v_round,v_dealer,2,1,v_p2,'stay');
    RAISE EXCEPTION '357_authority_proof:stale_decision_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:stale_decision_succeeded' OR SQLERRM NOT LIKE '%round_identity_mismatch%' THEN RAISE; END IF;
  END;

  -- R1 -> R2 continuation carries three cards and charges nothing.
  SELECT public.three_five_seven_advance_round(v_game,v_round,v_dealer,1,1) INTO v_result;
  v_r2:=(v_result->>'round_id')::uuid;
  SELECT chips INTO v_chips1 FROM public.players WHERE id=v_p1;
  SELECT chips INTO v_chips2 FROM public.players WHERE id=v_p2;
  IF v_result->>'outcome'<>'started' OR (SELECT current_round FROM public.games WHERE id=v_game)<>2
     OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=v_r2 AND jsonb_array_length(cards)<>5) THEN
    RAISE EXCEPTION '357_authority_proof:r2_continuation_invalid:%',v_result;
  END IF;
  SELECT public.three_five_seven_advance_round(v_game,v_round,v_dealer,1,1) INTO v_replay;
  IF v_replay->>'outcome'<>'already_started' OR (SELECT chips FROM public.players WHERE id=v_p1)<>v_chips1
     OR (SELECT chips FROM public.players WHERE id=v_p2)<>v_chips2 THEN
    RAISE EXCEPTION '357_authority_proof:continuation_replay_mutated:%',v_replay;
  END IF;

  -- Deterministic tie leaves balances unchanged and still creates one durable resolution.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.player_cards SET cards=CASE player_id
    WHEN v_p1 THEN '[{"rank":"A","suit":"♠"},{"rank":"K","suit":"♥"},{"rank":"Q","suit":"♦"},{"rank":"J","suit":"♣"},{"rank":"9","suit":"♠"}]'::jsonb
    ELSE '[{"rank":"A","suit":"♥"},{"rank":"K","suit":"♦"},{"rank":"Q","suit":"♣"},{"rank":"J","suit":"♠"},{"rank":"9","suit":"♥"}]'::jsonb END
   WHERE round_id=v_r2;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  PERFORM public.three_five_seven_submit_decision(v_game,v_r2,v_dealer,1,2,v_p1,'stay');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_game,v_r2,v_dealer,1,2,v_p2,'stay') INTO v_result;
  IF v_result#>>'{resolution,outcome}'<>'tie' OR (SELECT chips FROM public.players WHERE id=v_p1)<>v_chips1
     OR (SELECT chips FROM public.players WHERE id=v_p2)<>v_chips2 THEN
    RAISE EXCEPTION '357_authority_proof:tie_invalid:%',v_result;
  END IF;

  -- R2 -> R3 then all-fold tax, followed by one exact R3 -> new-hand R1 rollover.
  SELECT public.three_five_seven_advance_round(v_game,v_r2,v_dealer,1,2) INTO v_result; v_r3:=(v_result->>'round_id')::uuid;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  PERFORM public.three_five_seven_submit_decision(v_game,v_r3,v_dealer,1,3,v_p1,'fold');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_game,v_r3,v_dealer,1,3,v_p2,'fold') INTO v_result;
  v_cursor:=(v_result#>>'{resolution,presentation_transfer_cursor}')::integer;
  IF v_result#>>'{resolution,outcome}'<>'all_fold'
     OR v_result#>>'{resolution,presentation_kind}'<>'pussy_tax'
     OR coalesce(v_cursor,0)<=0
     OR v_result#>>'{game,id}' IS DISTINCT FROM v_game::text
     OR v_result#>>'{game,current_game_uuid}' IS DISTINCT FROM v_dealer::text
     OR v_result#>>'{game,last_round_result}' IS DISTINCT FROM 'All players folded'
     OR coalesce((v_result#>>'{game,awaiting_next_round}')::boolean,false) IS NOT TRUE
     OR v_result#>>'{round,id}' IS DISTINCT FROM v_r3::text
     OR v_result#>>'{round,status}' IS DISTINCT FROM 'completed'
     OR (SELECT chip_transfer_cursor FROM public.games WHERE id=v_game)<>v_cursor
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_game AND cursor=v_cursor AND reason='bet'
            AND jsonb_array_length(transfers)=2)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:all_fold_invalid:%',v_result;
  END IF;
  SELECT public.three_five_seven_submit_decision(v_game,v_r3,v_dealer,1,3,v_p2,'fold') INTO v_replay;
  IF v_replay->>'outcome'<>'already_decided'
     OR v_replay#>>'{resolution,outcome}'<>'all_fold'
     OR (v_replay#>>'{resolution,presentation_transfer_cursor}')::integer<>v_cursor
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_game AND cursor=v_cursor)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:all_fold_replay_invalid:%',v_replay;
  END IF;
  SELECT chips INTO v_chips1 FROM public.players WHERE id=v_p1; SELECT chips INTO v_chips2 FROM public.players WHERE id=v_p2;
  SELECT public.three_five_seven_advance_round(v_game,v_r3,v_dealer,1,3) INTO v_result; v_r1_next:=(v_result->>'round_id')::uuid;
  IF (SELECT total_hands FROM public.games WHERE id=v_game)<>2 OR (SELECT current_round FROM public.games WHERE id=v_game)<>1
     OR (SELECT chips FROM public.players WHERE id=v_p1)<>v_chips1-1 OR (SELECT chips FROM public.players WHERE id=v_p2)<>v_chips2-1
     OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=v_r1_next AND jsonb_array_length(cards)<>3) THEN
    RAISE EXCEPTION '357_authority_proof:rollover_invalid:%',v_result;
  END IF;

  -- A purchased nonterminal leg is owned reserve beside the player. It debits
  -- only that player, leaves the table pot unchanged, and emits one leg batch
  -- with an unmatched debit rather than a player-to-pot transfer.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  INSERT INTO public.games(
    id,name,status,game_type,current_game_uuid,current_host,dealer_position,
    ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,pot,real_money
  ) VALUES(
    v_leg_game,'Codex rollback proof - 357 leg reserve','ante_decision','3-5-7',v_leg_dealer,v_users[1],1,
    0,1,2,3,0,10,false
  );
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
  VALUES(v_leg_dealer,v_leg_game,v_users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision) VALUES
    (v_leg_game,v_users[1],1,100,'active',false,false,'ante_up'),
    (v_leg_game,v_users[2],2,100,'active',false,false,'ante_up');
  SELECT id INTO v_l1 FROM public.players WHERE game_id=v_leg_game AND user_id=v_users[1];
  SELECT id INTO v_l2 FROM public.players WHERE game_id=v_leg_game AND user_id=v_users[2];
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_begin_game(v_leg_game) INTO v_result;
  v_leg_round:=(v_result->>'round_id')::uuid;
  PERFORM public.three_five_seven_submit_decision(v_leg_game,v_leg_round,v_leg_dealer,1,1,v_l1,'stay');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_leg_game,v_leg_round,v_leg_dealer,1,1,v_l2,'fold') INTO v_result;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  IF v_result#>>'{resolution,outcome}'<>'solo_stay'
     OR (SELECT pot FROM public.games WHERE id=v_leg_game)<>10
     OR (SELECT chips FROM public.players WHERE id=v_l1)<>98
     OR (SELECT legs FROM public.players WHERE id=v_l1)<>1
     OR (SELECT chips FROM public.players WHERE id=v_l2)<>100
     OR (SELECT sum(chips) FROM public.players WHERE game_id=v_leg_game)
          +(SELECT pot FROM public.games WHERE id=v_leg_game)
          +(SELECT sum(legs)*2 FROM public.players WHERE game_id=v_leg_game)<>210
     OR (SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=v_leg_game AND reason='leg')<>1
     OR EXISTS(
       SELECT 1 FROM public.gameplay_transfer_batches batch
        WHERE batch.game_id=v_leg_game
          AND batch.reason='leg'
          AND batch.transfers<>'[]'::jsonb
     ) THEN
    RAISE EXCEPTION '357_authority_proof:owned_leg_reserve_invalid:%',v_result;
  END IF;

  -- The complete scheduled function can bootstrap a ready game without a
  -- browser/Realtime self-event dependency, then recover an unacknowledged
  -- all-fold handoff without replaying its pussy-tax batch.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,pot,real_money)
  VALUES(v_cron_game,'Codex rollback proof - 357 cron','ante_decision','3-5-7',v_cron_dealer,v_users[1],1,1,1,1,3,0,0,false);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(v_cron_dealer,v_cron_game,v_users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision) VALUES
    (v_cron_game,v_users[1],1,100,'active',false,false,'ante_up'),(v_cron_game,v_users[2],2,100,'active',false,false,'ante_up');
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_recovery_game_id',v_cron_game::text,true);
  PERFORM private.advance_due_three_five_seven_state();
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  IF (SELECT status FROM public.games WHERE id=v_cron_game)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE dealer_game_id=v_cron_dealer)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:complete_scheduled_recovery_failed';
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  SELECT id INTO v_cron_round FROM public.rounds WHERE dealer_game_id=v_cron_dealer;
  SELECT id INTO v_cron_p1 FROM public.players WHERE game_id=v_cron_game AND user_id=v_users[1];
  SELECT id INTO v_cron_p2 FROM public.players WHERE game_id=v_cron_game AND user_id=v_users[2];
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  PERFORM public.three_five_seven_submit_decision(v_cron_game,v_cron_round,v_cron_dealer,1,1,v_cron_p1,'fold');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_cron_game,v_cron_round,v_cron_dealer,1,1,v_cron_p2,'fold') INTO v_result;
  v_cursor:=(v_result#>>'{resolution,presentation_transfer_cursor}')::integer;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE private.three_five_seven_round_resolutions
     SET presentation_fallback_at=clock_timestamp()-interval '1 second'
   WHERE game_id=v_cron_game AND round_id=v_cron_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_recovery_game_id',v_cron_game::text,true);
  PERFORM private.advance_due_three_five_seven_state();
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  IF (SELECT current_round FROM public.games WHERE id=v_cron_game)<>2
     OR (SELECT total_hands FROM public.games WHERE id=v_cron_game)<>1
     OR (SELECT count(*) FROM public.rounds WHERE dealer_game_id=v_cron_dealer)<>2
     OR (SELECT chip_transfer_cursor FROM public.games WHERE id=v_cron_game)<>v_cursor
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_cron_game AND cursor=v_cursor AND reason='bet')<>1 THEN
    RAISE EXCEPTION '357_authority_proof:complete_all_fold_recovery_failed:%',v_result;
  END IF;

  -- Final-leg settlement, exact committed settlement verification, durable
  -- postgame duplicate replay, and late replay after a newer dealer game.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,pot,real_money)
  VALUES(v_terminal_game,'Codex rollback proof - 357 terminal','ante_decision','3-5-7',v_terminal_dealer,v_users[1],1,0,1,1,1,0,5,false);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(v_terminal_dealer,v_terminal_game,v_users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision) VALUES
    (v_terminal_game,v_users[1],1,100,'active',false,false,'ante_up'),(v_terminal_game,v_users[2],2,100,'active',false,false,'ante_up');
  SELECT id INTO v_t1 FROM public.players WHERE game_id=v_terminal_game AND user_id=v_users[1];
  SELECT id INTO v_t2 FROM public.players WHERE game_id=v_terminal_game AND user_id=v_users[2];
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_begin_game(v_terminal_game) INTO v_result; v_terminal_round:=(v_result->>'round_id')::uuid;
  PERFORM public.three_five_seven_submit_decision(v_terminal_game,v_terminal_round,v_terminal_dealer,1,1,v_t1,'stay');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_terminal_game,v_terminal_round,v_terminal_dealer,1,1,v_t2,'fold') INTO v_result;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  IF v_result#>>'{resolution,outcome}'<>'terminal' OR (SELECT status FROM public.games WHERE id=v_terminal_game)<>'game_over'
     OR (SELECT count(*) FROM public.game_results WHERE dealer_game_id=v_terminal_dealer AND settlement_key='three_five_seven_terminal')<>1
     OR (SELECT chips FROM public.players WHERE id=v_t1)<>105
     OR (SELECT chips FROM public.players WHERE id=v_t2)<>100
     OR (SELECT pot FROM public.games WHERE id=v_terminal_game)<>0
     OR (SELECT sum(chips) FROM public.players WHERE game_id=v_terminal_game)<>205 THEN
    RAISE EXCEPTION '357_authority_proof:terminal_settlement_invalid:%',v_result;
  END IF;
  SELECT array_agg(reason ORDER BY cursor) INTO v_reasons
    FROM public.gameplay_transfer_batches
   WHERE game_id=v_terminal_game;
  IF v_reasons IS DISTINCT FROM ARRAY['leg','sweep','transfer']::text[] THEN
    RAISE EXCEPTION '357_authority_proof:terminal_batch_order_invalid:%',v_reasons;
  END IF;
  SELECT public.three_five_seven_settle_game(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_replay;
  IF (SELECT count(*) FROM public.game_results WHERE dealer_game_id=v_terminal_dealer AND settlement_key='three_five_seven_terminal')<>1 THEN
    RAISE EXCEPTION '357_authority_proof:terminal_replay_duplicated';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_reveal_terminal_cards(
    v_terminal_game,v_terminal_round,v_terminal_dealer,1,v_t1
  ) INTO v_result;
  IF v_result->>'outcome'<>'revealed' OR NOT EXISTS(
    SELECT 1 FROM public.player_cards WHERE round_id=v_terminal_round AND player_id=v_t1 AND is_public
  ) THEN RAISE EXCEPTION '357_authority_proof:terminal_reveal_invalid:%',v_result; END IF;
  UPDATE public.system_settings
     SET value=jsonb_build_object('enabled',true),updated_at=clock_timestamp()
   WHERE key='make_it_take_it'
   RETURNING value INTO v_setting;
  IF coalesce((v_setting->>'enabled')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION '357_authority_proof:make_it_take_it_enable_not_returned';
  END IF;
  SELECT public.three_five_seven_advance_postgame(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_result;
  SELECT public.three_five_seven_advance_postgame(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_replay;
  IF v_result->>'outcome'<>'advanced' OR v_replay->>'outcome'<>'already_advanced'
     OR (v_result->>'dealer_position')::integer<>1
     OR (SELECT count(*) FROM private.three_five_seven_postgame_advances WHERE game_id=v_terminal_game AND dealer_game_id=v_terminal_dealer)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:postgame_replay_invalid:%/%',v_result,v_replay;
  END IF;
  SELECT config_deadline INTO v_deadline FROM public.games WHERE id=v_terminal_game;

  -- Only the exact setup owner can decline this committed handoff. The server
  -- publishes waiting for the remaining one-player cohort, stores one replay
  -- claim, and returns that claim to duplicate callers.
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  BEGIN
    PERFORM public.three_five_seven_decline_setup(v_terminal_game,1,v_deadline);
    RAISE EXCEPTION '357_authority_proof:non_owner_setup_decline_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:non_owner_setup_decline_succeeded' OR SQLERRM NOT LIKE '%not_setup_owner%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_decline_setup(v_terminal_game,1,v_deadline) INTO v_result;
  SELECT public.three_five_seven_decline_setup(v_terminal_game,1,v_deadline) INTO v_replay;
  IF v_result->>'outcome'<>'declined' OR v_result->>'status'<>'waiting'
     OR v_replay->>'outcome'<>'already_declined'
     OR (SELECT status FROM public.games WHERE id=v_terminal_game)<>'waiting'
     OR NOT (SELECT sitting_out FROM public.players WHERE id=v_t1)
     OR (SELECT count(*) FROM private.three_five_seven_setup_declines
          WHERE game_id=v_terminal_game AND dealer_game_id=v_terminal_dealer
            AND round_id=v_terminal_round AND hand_number=1 AND declining_player_id=v_t1)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:setup_decline_replay_invalid:%/%',v_result,v_replay;
  END IF;
  -- A validated shared configuration handoff may create the next dealer game;
  -- this is not permission to mutate an active 3-5-7 identity.
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(v_new_dealer,v_terminal_game,v_users[1],'holm');
  UPDATE public.games SET current_game_uuid=v_new_dealer,total_hands=0,current_round=NULL,status='ante_decision',game_type='holm' WHERE id=v_terminal_game;
  SELECT public.three_five_seven_advance_postgame(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_replay;
  IF v_replay->>'outcome'<>'already_advanced' OR (SELECT current_game_uuid FROM public.games WHERE id=v_terminal_game)<>v_new_dealer THEN
    RAISE EXCEPTION '357_authority_proof:late_replay_mutated_new_game:%',v_replay;
  END IF;
  SELECT public.three_five_seven_decline_setup(v_terminal_game,1,v_deadline) INTO v_replay;
  IF v_replay->>'outcome'<>'already_declined' OR (SELECT current_game_uuid FROM public.games WHERE id=v_terminal_game)<>v_new_dealer THEN
    RAISE EXCEPTION '357_authority_proof:late_setup_decline_mutated_new_game:%',v_replay;
  END IF;

  UPDATE public.system_settings
     SET value=jsonb_build_object('enabled',false),updated_at=clock_timestamp()
   WHERE key='make_it_take_it'
   RETURNING value INTO v_setting;
  IF coalesce((v_setting->>'enabled')::boolean,true) IS NOT FALSE THEN
    RAISE EXCEPTION '357_authority_proof:make_it_take_it_disable_not_returned';
  END IF;

  -- Ambiguous simultaneous 3/5/7 sweeps are rejected atomically.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  BEGIN
    UPDATE public.player_cards SET cards='[{"rank":"3","suit":"♠"},{"rank":"5","suit":"♥"},{"rank":"7","suit":"♦"}]'::jsonb
     WHERE round_id=v_r1_next;
    PERFORM set_config('app.three_five_seven_test_no_sweep','off',true);
    PERFORM private.three_five_seven_settle_instant_sweep(v_game,v_r1_next,v_dealer,2);
    RAISE EXCEPTION '357_authority_proof:multiple_sweep_winner_selected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:multiple_sweep_winner_selected' OR SQLERRM NOT LIKE '%ambiguous_multiple_winners%' THEN RAISE; END IF;
  END;
END;
$proof$;

ROLLBACK TO SAVEPOINT codex_rollback_proof;
RELEASE SAVEPOINT codex_rollback_proof;
COMMIT;
;
