-- Complete self-contained rollback proof for the 3-5-7 authority cutover.
-- It invokes the complete scheduled recovery statement, not an isolated helper,
-- and cannot retain synthetic data or shared-setting changes when run directly.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[]; v_outsider uuid:=gen_random_uuid();
  v_game uuid:=gen_random_uuid(); v_dealer uuid:=gen_random_uuid();
  v_cron_game uuid:=gen_random_uuid(); v_cron_dealer uuid:=gen_random_uuid();
  v_leg_game uuid:=gen_random_uuid(); v_leg_dealer uuid:=gen_random_uuid();
  v_terminal_game uuid:=gen_random_uuid(); v_terminal_dealer uuid:=gen_random_uuid();
  v_session_terminal_game uuid:=gen_random_uuid(); v_session_terminal_dealer uuid:=gen_random_uuid();
  v_p1 uuid; v_p2 uuid; v_round uuid; v_r2 uuid; v_r3 uuid; v_r1_next uuid;
  v_cron_p1 uuid; v_cron_p2 uuid; v_cron_round uuid;
  v_l1 uuid; v_l2 uuid; v_leg_round uuid;
  v_t1 uuid; v_t2 uuid; v_terminal_round uuid; v_new_dealer uuid:=gen_random_uuid();
  v_st1 uuid; v_st2 uuid; v_session_terminal_round uuid;
  v_case record; v_case_game uuid; v_case_dealer uuid; v_case_round uuid;
  v_case_p1 uuid; v_case_p2 uuid;
  v_result jsonb; v_replay jsonb; v_frame jsonb; v_chips1 integer; v_chips2 integer; v_count integer; v_cursor integer;
  v_opening_cursor bigint; v_late_cursor bigint;
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
  BEGIN
    PERFORM public.three_five_seven_current_frame(v_game);
    RAISE EXCEPTION '357_authority_proof:outsider_frame_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='357_authority_proof:outsider_frame_succeeded' OR SQLERRM NOT LIKE '%not_in_session%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_begin_game(v_game) INTO v_result;
  v_round:=(v_result->>'round_id')::uuid;
  v_opening_cursor:=(v_result->>'opening_transfer_cursor')::bigint;
  IF v_result->>'outcome'<>'started' OR v_result->'round'->>'id' IS DISTINCT FROM v_round::text
     OR coalesce((v_result->>'opening_transfer_required')::boolean,false) IS NOT TRUE
     OR coalesce(v_opening_cursor,0)<=0
     OR (v_result#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (SELECT status FROM public.games WHERE id=v_game)<>'in_progress'
     OR (SELECT chip_transfer_cursor FROM public.games WHERE id=v_game)<>v_opening_cursor
     OR (SELECT pot FROM public.games WHERE id=v_game)<>4
     OR EXISTS(SELECT 1 FROM public.players WHERE game_id=v_game AND chips<>98)
     OR (SELECT count(*) FROM public.player_cards WHERE round_id=v_round)<>2
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_game AND dealer_game_id=v_dealer AND cursor=v_opening_cursor
            AND reason='ante' AND jsonb_array_length(transfers)=2)<>1 THEN
    RAISE EXCEPTION '357_authority_proof:atomic_bootstrap_invalid:%',v_result;
  END IF;
  SELECT public.three_five_seven_current_frame(v_game) INTO v_frame;
  IF v_frame#>>'{game,id}' IS DISTINCT FROM v_game::text
     OR v_frame#>>'{game,current_game_uuid}' IS DISTINCT FROM v_dealer::text
     OR v_frame#>>'{round,id}' IS DISTINCT FROM v_round::text
     OR v_frame#>>'{identity,hand_number}' IS DISTINCT FROM '1'
     OR v_frame#>>'{identity,round_number}' IS DISTINCT FROM '1'
     OR coalesce((v_frame#>>'{identity,opening_transfer_required}')::boolean,false) IS NOT TRUE
     OR (v_frame#>>'{identity,opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (v_frame#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR jsonb_array_length(v_frame->'players')<>2
     OR (SELECT count(*) FROM jsonb_array_elements(v_frame->'player_cards') card_row
          WHERE card_row->>'player_id'=v_p1::text)<>1
     OR (SELECT jsonb_array_length(card_row->'cards') FROM jsonb_array_elements(v_frame->'player_cards') card_row
          WHERE card_row->>'player_id'=v_p1::text)<>3
     OR coalesce((v_frame->>'viewer_cards_required')::boolean,false) IS NOT TRUE
     OR coalesce((v_frame->>'viewer_cards_present')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION '357_authority_proof:atomic_current_frame_invalid:%',v_frame;
  END IF;
  SELECT public.three_five_seven_begin_game(v_game) INTO v_replay;
  IF v_replay->>'outcome'<>'already_started' OR coalesce((v_replay->>'deduped')::boolean,false) IS NOT TRUE
     OR coalesce((v_replay->>'opening_transfer_required')::boolean,false) IS NOT TRUE
     OR v_replay#>>'{game,id}' IS DISTINCT FROM v_game::text
     OR v_replay#>>'{round,id}' IS DISTINCT FROM v_round::text
     OR (v_replay->>'opening_transfer_cursor')::bigint<>v_opening_cursor
     OR (v_replay#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
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
  IF v_result#>>'{game,status}' IS DISTINCT FROM (SELECT status FROM public.games WHERE id=v_game)
     OR (v_result#>>'{game,authority_revision}')::bigint IS DISTINCT FROM (SELECT authority_revision FROM public.games WHERE id=v_game)
     OR (v_result#>>'{round,authority_revision}')::bigint IS DISTINCT FROM (SELECT authority_revision FROM public.rounds WHERE id=v_round) THEN
    RAISE EXCEPTION '357_authority_proof:decision_receipt_version_or_status_missing:%',v_result;
  END IF;

  SELECT public.three_five_seven_submit_decision(v_game,v_round,v_dealer,1,1,v_p1,'stay') INTO v_result;
  IF v_result#>>'{game,status}' IS DISTINCT FROM (SELECT status FROM public.games WHERE id=v_game)
     OR (v_result#>>'{game,authority_revision}')::bigint IS DISTINCT FROM (SELECT authority_revision FROM public.games WHERE id=v_game)
     OR (v_result#>>'{round,authority_revision}')::bigint IS DISTINCT FROM (SELECT authority_revision FROM public.rounds WHERE id=v_round) THEN
    RAISE EXCEPTION '357_authority_proof:decision_receipt_version_or_status_missing:%',v_result;
  END IF;

  IF v_result->>'outcome'<>'already_decided' THEN RAISE EXCEPTION '357_authority_proof:decision_replay_not_deduped'; END IF;

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
  v_opening_cursor:=(v_result->>'opening_transfer_cursor')::bigint;
  IF (SELECT total_hands FROM public.games WHERE id=v_game)<>2 OR (SELECT current_round FROM public.games WHERE id=v_game)<>1
     OR coalesce((v_result->>'opening_transfer_required')::boolean,false) IS NOT TRUE
     OR coalesce(v_opening_cursor,0)<=0
     OR (v_result#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (SELECT chip_transfer_cursor FROM public.games WHERE id=v_game)<>v_opening_cursor
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_game AND dealer_game_id=v_dealer AND cursor=v_opening_cursor
            AND reason='ante' AND jsonb_array_length(transfers)=2)<>1
     OR (SELECT chips FROM public.players WHERE id=v_p1)<>v_chips1-1 OR (SELECT chips FROM public.players WHERE id=v_p2)<>v_chips2-1
     OR EXISTS(SELECT 1 FROM public.player_cards WHERE round_id=v_r1_next AND jsonb_array_length(cards)<>3) THEN
    RAISE EXCEPTION '357_authority_proof:rollover_invalid:%',v_result;
  END IF;
  SELECT public.three_five_seven_current_frame(v_game) INTO v_frame;
  IF v_frame#>>'{game,total_hands}' IS DISTINCT FROM '2'
     OR v_frame#>>'{game,current_round}' IS DISTINCT FROM '1'
     OR v_frame#>>'{round,id}' IS DISTINCT FROM v_r1_next::text
     OR v_frame#>>'{round,hand_number}' IS DISTINCT FROM '2'
     OR v_frame#>>'{round,round_number}' IS DISTINCT FROM '1'
     OR v_frame#>>'{identity,round_id}' IS DISTINCT FROM v_r1_next::text
     OR coalesce((v_frame#>>'{identity,opening_transfer_required}')::boolean,false) IS NOT TRUE
     OR (v_frame#>>'{identity,opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (v_frame#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (SELECT count(*) FROM jsonb_array_elements(v_frame->'player_cards') card_row
          WHERE card_row->>'player_id'=v_p2::text)<>1
     OR (SELECT jsonb_array_length(card_row->'cards') FROM jsonb_array_elements(v_frame->'player_cards') card_row
          WHERE card_row->>'player_id'=v_p2::text)<>3 THEN
    RAISE EXCEPTION '357_authority_proof:rollover_current_frame_invalid:%',v_frame;
  END IF;

  -- A later financial batch may advance games.chip_transfer_cursor, but an
  -- exact duplicate of R3 -> next-hand R1 must replay the stored opening claim
  -- and must not mutate the newer current identity.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM public.settle_gameplay_chip_transfers(
    v_game,
    jsonb_build_array(jsonb_build_object(
      'from',jsonb_build_object('kind','player','playerId',v_p1),
      'to',jsonb_build_object('kind','pot'),
      'amount',1
    )),
    'bet'
  );
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  SELECT chip_transfer_cursor INTO v_late_cursor FROM public.games WHERE id=v_game;
  SELECT public.three_five_seven_advance_round(v_game,v_r3,v_dealer,1,3) INTO v_replay;
  IF v_late_cursor<=v_opening_cursor
     OR v_replay->>'outcome'<>'already_started'
     OR coalesce((v_replay->>'opening_transfer_required')::boolean,false) IS NOT TRUE
     OR (v_replay->>'opening_transfer_cursor')::bigint<>v_opening_cursor
     OR (v_replay#>>'{round,three_five_seven_opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (v_replay#>>'{game,chip_transfer_cursor}')::bigint<>v_late_cursor
     OR (SELECT total_hands FROM public.games WHERE id=v_game)<>2
     OR (SELECT current_round FROM public.games WHERE id=v_game)<>1
     OR (SELECT count(*) FROM public.gameplay_transfer_batches
          WHERE game_id=v_game AND cursor=v_opening_cursor AND reason='ante')<>1 THEN
    RAISE EXCEPTION '357_authority_proof:late_rollover_replay_invalid:%/%/%',v_replay,v_opening_cursor,v_late_cursor;
  END IF;
  SELECT public.three_five_seven_current_frame(v_game) INTO v_frame;
  IF (v_frame#>>'{identity,opening_transfer_cursor}')::bigint<>v_opening_cursor
     OR (v_frame#>>'{identity,chip_transfer_cursor}')::bigint<>v_late_cursor THEN
    RAISE EXCEPTION '357_authority_proof:late_cursor_frame_invalid:%',v_frame;
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
  IF coalesce((v_result->>'opening_transfer_required')::boolean,true) IS NOT FALSE
     OR v_result->'opening_transfer_cursor' IS DISTINCT FROM 'null'::jsonb
     OR v_result#>>'{round,three_five_seven_opening_transfer_cursor}' IS NOT NULL THEN
    RAISE EXCEPTION '357_authority_proof:zero_charge_bootstrap_claim_invalid:%',v_result;
  END IF;
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
  SELECT private.advance_due_three_five_seven_state() INTO v_result;
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  PERFORM set_config('app.three_five_seven_recovery','off',true);
  IF (SELECT status FROM public.games WHERE id=v_cron_game)<>'in_progress'
     OR (SELECT count(*) FROM public.rounds WHERE dealer_game_id=v_cron_dealer)<>1
     OR coalesce((v_result#>>'{games,0,result,opening_transfer_cursor}')::bigint,0)<=0
     OR coalesce((v_result#>>'{games,0,result,opening_transfer_required}')::boolean,false) IS NOT TRUE
     OR (v_result#>>'{games,0,result,opening_transfer_cursor}')::bigint
          IS DISTINCT FROM (SELECT three_five_seven_opening_transfer_cursor
                              FROM public.rounds WHERE dealer_game_id=v_cron_dealer)
     OR (SELECT count(*) FROM public.gameplay_transfer_batches batch
          JOIN public.rounds round_row
            ON round_row.game_id=batch.game_id
           AND round_row.three_five_seven_opening_transfer_cursor=batch.cursor
         WHERE round_row.dealer_game_id=v_cron_dealer AND batch.reason='ante')<>1 THEN
    RAISE EXCEPTION '357_authority_proof:complete_scheduled_recovery_failed:%',v_result;
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
  PERFORM set_config('app.three_five_seven_recovery','off',true);
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
  IF coalesce((v_result->>'opening_transfer_required')::boolean,true) IS NOT FALSE
     OR v_result->'opening_transfer_cursor' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION '357_authority_proof:zero_charge_terminal_bootstrap_claim_invalid:%',v_result;
  END IF;
  -- Deterministic non-sweep hands: the instant-sweep test switch does not
  -- suppress the settlement owner's independent 3/5/7 check.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.player_cards SET cards=CASE WHEN player_id=v_t1
    THEN '[{"rank":"2","suit":"♠"},{"rank":"4","suit":"♠"},{"rank":"6","suit":"♠"}]'::jsonb
    ELSE '[{"rank":"2","suit":"♥"},{"rank":"4","suit":"♥"},{"rank":"6","suit":"♥"}]'::jsonb END
   WHERE round_id=v_terminal_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM public.three_five_seven_submit_decision(v_terminal_game,v_terminal_round,v_terminal_dealer,1,1,v_t1,'stay');
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  SELECT public.three_five_seven_submit_decision(v_terminal_game,v_terminal_round,v_terminal_dealer,1,1,v_t2,'fold') INTO v_result;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';
  IF v_result#>>'{resolution,outcome}'<>'terminal' OR (SELECT status FROM public.games WHERE id=v_terminal_game)<>'game_over'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_terminal_game) IS DISTINCT FROM v_terminal_dealer
     OR (SELECT total_hands FROM public.games WHERE id=v_terminal_game) IS DISTINCT FROM 1
     OR (SELECT current_round FROM public.games WHERE id=v_terminal_game) IS DISTINCT FROM 1
     OR (SELECT status FROM public.rounds WHERE id=v_terminal_round)<>'completed'
     OR (SELECT count(*) FROM public.game_results WHERE dealer_game_id=v_terminal_dealer AND settlement_key='three_five_seven_terminal')<>1
     OR (SELECT chips FROM public.players WHERE id=v_t1)<>105
     OR (SELECT chips FROM public.players WHERE id=v_t2)<>100
     OR (SELECT pot FROM public.games WHERE id=v_terminal_game)<>0
     OR (SELECT sum(chips) FROM public.players WHERE game_id=v_terminal_game)<>205 THEN
    RAISE EXCEPTION '357_authority_proof:terminal_settlement_invalid:%',v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_current_frame(v_terminal_game) INTO v_frame;
  IF v_frame#>>'{game,status}'<>'game_over'
     OR (v_frame#>>'{identity,dealer_game_id}')::uuid IS DISTINCT FROM v_terminal_dealer
     OR (v_frame#>>'{identity,hand_number}')::integer IS DISTINCT FROM 1
     OR (v_frame#>>'{identity,round_number}')::integer IS DISTINCT FROM 1
     OR (v_frame#>>'{identity,round_id}')::uuid IS DISTINCT FROM v_terminal_round
     OR (v_frame#>>'{round,id}')::uuid IS DISTINCT FROM v_terminal_round
     OR NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_frame->'player_cards') cards
        WHERE (cards->>'player_id')::uuid=v_t1
          AND jsonb_array_length(cards->'cards')=3
     ) THEN
    RAISE EXCEPTION '357_authority_proof:terminal_current_frame_invalid:%',v_frame;
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
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE private.three_five_seven_round_resolutions
     SET presentation_fallback_at=clock_timestamp()-interval '1 second'
   WHERE game_id=v_terminal_game AND round_id=v_terminal_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_recovery_game_id',v_terminal_game::text,true);
  SELECT private.advance_due_three_five_seven_state() INTO v_result;
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  PERFORM set_config('app.three_five_seven_recovery','off',true);
  IF v_result->>'outcome'<>'recovered' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'games') recovered
     WHERE (recovered->>'game_id')::uuid=v_terminal_game
       AND recovered#>>'{result,outcome}'='advanced'
  ) THEN
    RAISE EXCEPTION '357_authority_proof:complete_terminal_recovery_failed:%',v_result;
  END IF;
  SELECT public.three_five_seven_advance_postgame(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_result;
  SELECT public.three_five_seven_advance_postgame(v_terminal_game,v_terminal_round,v_terminal_dealer,1) INTO v_replay;
  IF v_result->>'outcome'<>'already_advanced' OR v_replay->>'outcome'<>'already_advanced'
     OR (v_result->>'dealer_position')::integer<>1
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_terminal_game) IS NOT NULL
     OR (SELECT current_round FROM public.games WHERE id=v_terminal_game) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_terminal_game) IS DISTINCT FROM 0
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
     OR (SELECT count(*) FROM private.session_setup_declines
          WHERE game_id=v_terminal_game AND expected_deadline=v_deadline
            AND expected_position=1 AND player_id=v_t1)<>1 THEN
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

  -- The exact postgame claim owns participation reconciliation. Prove each
  -- precedence branch, next-dealer derivation after a waiting player rejoins,
  -- and durable replay when a terminal-winning bot is deleted.
  FOR v_case IN
    SELECT *
      FROM (VALUES
        ('waiting_rejoin', false, false, false, false, false, true,  true,  'game_selection'),
        ('sit_out_precedes_waiting', false, false, true,  false, true,  false, false, 'waiting'),
        ('auto_fold_precedes_waiting', false, false, false, true,  true,  false, false, 'waiting'),
        ('human_stand_up', false, true,  false, false, false, false, false, 'waiting'),
        ('bot_stand_up_winner', true,  true,  false, false, false, false, false, 'waiting')
      ) AS cases(
        case_name,
        winner_is_bot,
        winner_stand_up,
        winner_sit_out,
        winner_auto_fold,
        winner_waiting,
        peer_sitting_out,
        peer_waiting,
        expected_status
      )
  LOOP
    v_case_game := gen_random_uuid();
    v_case_dealer := gen_random_uuid();
    v_case_round := gen_random_uuid();
    v_case_p1 := gen_random_uuid();
    v_case_p2 := gen_random_uuid();

    PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
    INSERT INTO public.games(
      id,name,status,game_type,current_game_uuid,current_host,dealer_position,
      ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,current_round,
      pot,real_money
    ) VALUES(
      v_case_game,
      'Codex rollback proof - 357 postgame ' || v_case.case_name,
      'game_over','3-5-7',v_case_dealer,v_users[2],1,
      0,1,1,1,1,1,0,false
    );
    INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
    VALUES(v_case_dealer,v_case_game,v_users[2],'3-5-7');
    INSERT INTO public.players(
      id,game_id,user_id,position,chips,status,sitting_out,is_bot,
      stand_up_next_hand,sit_out_next_hand,auto_fold,waiting,legs
    ) VALUES
      (
        v_case_p1,v_case_game,v_users[1],1,100,'active',false,
        v_case.winner_is_bot,v_case.winner_stand_up,v_case.winner_sit_out,
        v_case.winner_auto_fold,v_case.winner_waiting,1
      ),
      (
        v_case_p2,v_case_game,v_users[2],2,100,'active',
        v_case.peer_sitting_out,false,false,false,false,v_case.peer_waiting,2
      );
    INSERT INTO public.rounds(
      id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot
    ) VALUES(
      v_case_round,v_case_game,v_case_dealer,1,1,3,'completed',0
    );
    INSERT INTO private.three_five_seven_round_resolutions(
      game_id,dealer_game_id,round_id,hand_number,round_number,outcome,
      winner_player_id,result,presentation_fallback_at
    ) VALUES(
      v_case_game,v_case_dealer,v_case_round,1,1,'terminal',v_case_p1,
      jsonb_build_object(
        'outcome','terminal',
        'winner_player_id',v_case_p1,
        'round_id',v_case_round,
        'dealer_game_id',v_case_dealer,
        'hand_number',1,
        'round_number',1
      ),
      clock_timestamp()+interval '30 seconds'
    );
    INSERT INTO public.game_results(
      game_id,dealer_game_id,hand_number,settlement_key,game_type,
      winner_player_id,winning_hand_description,pot_won,
      player_chip_changes,is_chopped
    ) VALUES(
      v_case_game,v_case_dealer,1,'three_five_seven_terminal','3-5-7',
      v_case_p1,'1 legs',0,
      jsonb_build_object(v_case_p1::text,0,v_case_p2::text,0),false
    );
    PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
    PERFORM set_config(
      'request.jwt.claim.sub',
      CASE WHEN v_case.case_name='human_stand_up'
        THEN v_users[1]::text ELSE v_users[2]::text END,
      true
    );
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'role','authenticated',
        'sub',CASE WHEN v_case.case_name='human_stand_up'
          THEN v_users[1] ELSE v_users[2] END
      )::text,
      true
    );

    SELECT public.three_five_seven_advance_postgame(
      v_case_game,v_case_round,v_case_dealer,1
    ) INTO v_result;

    IF v_case.case_name='waiting_rejoin' THEN
      PERFORM set_config('request.jwt.claim.sub',v_outsider::text,true);
      PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role','authenticated','sub',v_outsider)::text,
        true
      );
      BEGIN
        PERFORM public.three_five_seven_advance_postgame(
          v_case_game,v_case_round,v_case_dealer,1
        );
        RAISE EXCEPTION '357_authority_proof:outsider_postgame_replay_succeeded';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM='357_authority_proof:outsider_postgame_replay_succeeded'
           OR SQLERRM NOT LIKE '%not_in_session%' THEN
          RAISE;
        END IF;
      END;
      PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
      PERFORM set_config(
        'request.jwt.claims',
        jsonb_build_object('role','authenticated','sub',v_users[2])::text,
        true
      );
    END IF;

    SELECT public.three_five_seven_advance_postgame(
      v_case_game,v_case_round,v_case_dealer,1
    ) INTO v_replay;

    IF v_result->>'outcome'<>'advanced'
       OR v_result->>'status'<>v_case.expected_status
       OR v_replay->>'outcome'<>'already_advanced'
       OR v_replay->>'status'<>v_case.expected_status
       OR (SELECT status FROM public.games WHERE id=v_case_game)<>v_case.expected_status
       OR (SELECT current_game_uuid FROM public.games WHERE id=v_case_game) IS NOT NULL
       OR (SELECT current_round FROM public.games WHERE id=v_case_game) IS NOT NULL
       OR (SELECT total_hands FROM public.games WHERE id=v_case_game) IS DISTINCT FROM 0
       OR EXISTS(
         SELECT 1 FROM public.players player
          WHERE player.game_id=v_case_game
            AND (
              coalesce(player.waiting,false)
              OR coalesce(player.stand_up_next_hand,false)
              OR coalesce(player.sit_out_next_hand,false)
              OR coalesce(player.auto_fold,false)
              OR coalesce(player.legs,0)<>0
            )
       )
       OR (SELECT count(*) FROM private.three_five_seven_postgame_advances claim
            WHERE claim.game_id=v_case_game
              AND claim.dealer_game_id=v_case_dealer
              AND claim.round_id=v_case_round
              AND claim.hand_number=1
              AND claim.winner_player_id=v_case_p1
              AND claim.result->>'winner_player_id'=v_case_p1::text)<>1 THEN
      RAISE EXCEPTION
        '357_authority_proof:postgame_participation_case_invalid:%:%/%',
        v_case.case_name,v_result,v_replay;
    END IF;

    IF v_case.case_name='waiting_rejoin' AND (
         NOT EXISTS(
           SELECT 1 FROM public.players
            WHERE id=v_case_p2 AND NOT sitting_out AND NOT waiting
         )
         OR (v_result->>'dealer_position')::integer<>2
         OR (SELECT config_deadline FROM public.games WHERE id=v_case_game) IS NULL
       ) THEN
      RAISE EXCEPTION '357_authority_proof:waiting_rejoin_invalid:%',v_result;
    END IF;

    IF v_case.case_name IN ('sit_out_precedes_waiting','auto_fold_precedes_waiting')
       AND NOT EXISTS(
         SELECT 1 FROM public.players
          WHERE id=v_case_p1 AND sitting_out AND NOT waiting
       ) THEN
      RAISE EXCEPTION
        '357_authority_proof:postgame_sit_out_invalid:%:%',
        v_case.case_name,v_result;
    END IF;

    IF v_case.case_name='human_stand_up' AND NOT EXISTS(
      SELECT 1 FROM public.players
       WHERE id=v_case_p1 AND status='left' AND sitting_out AND NOT waiting
    ) THEN
      RAISE EXCEPTION '357_authority_proof:human_stand_up_invalid:%',v_result;
    END IF;

    IF v_case.case_name='bot_stand_up_winner' AND (
         EXISTS(SELECT 1 FROM public.players WHERE id=v_case_p1)
         OR (SELECT winner_player_id FROM private.three_five_seven_round_resolutions
              WHERE game_id=v_case_game AND dealer_game_id=v_case_dealer
                AND round_id=v_case_round AND hand_number=1 AND round_number=1)
              IS DISTINCT FROM v_case_p1
         OR (SELECT winner_player_id FROM private.three_five_seven_postgame_advances
              WHERE game_id=v_case_game AND dealer_game_id=v_case_dealer
                AND round_id=v_case_round AND hand_number=1)
              IS DISTINCT FROM v_case_p1
       ) THEN
      RAISE EXCEPTION '357_authority_proof:bot_stand_up_replay_claim_invalid:%',v_result;
    END IF;
  END LOOP;

  -- A pending session end retains the same exact terminal round through its
  -- connected-client frame, then the complete scheduler clears that address.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  INSERT INTO public.games(
    id,name,status,game_type,current_game_uuid,current_host,dealer_position,
    ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,pot,real_money,pending_session_end
  ) VALUES(
    v_session_terminal_game,'Codex rollback proof - 357 terminal session','ante_decision','3-5-7',
    v_session_terminal_dealer,v_users[1],1,0,1,1,1,0,0,false,true
  );
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type)
  VALUES(v_session_terminal_dealer,v_session_terminal_game,v_users[1],'3-5-7');
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision) VALUES
    (v_session_terminal_game,v_users[1],1,100,'active',false,false,'ante_up'),
    (v_session_terminal_game,v_users[2],2,100,'active',false,false,'ante_up');
  SELECT id INTO v_st1 FROM public.players WHERE game_id=v_session_terminal_game AND user_id=v_users[1];
  SELECT id INTO v_st2 FROM public.players WHERE game_id=v_session_terminal_game AND user_id=v_users[2];
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_begin_game(v_session_terminal_game) INTO v_result;
  v_session_terminal_round:=(v_result->>'round_id')::uuid;
  -- Deterministic non-sweep hands: the instant-sweep test switch does not
  -- suppress the settlement owner's independent 3/5/7 check.
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.player_cards SET cards=CASE WHEN player_id=v_st1
    THEN '[{"rank":"2","suit":"♠"},{"rank":"4","suit":"♠"},{"rank":"6","suit":"♠"}]'::jsonb
    ELSE '[{"rank":"2","suit":"♥"},{"rank":"4","suit":"♥"},{"rank":"6","suit":"♥"}]'::jsonb END
   WHERE round_id=v_session_terminal_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM public.three_five_seven_submit_decision(
    v_session_terminal_game,v_session_terminal_round,v_session_terminal_dealer,1,1,v_st1,'stay'
  );
  PERFORM set_config('request.jwt.claim.sub',v_users[2]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[2])::text,true);
  PERFORM public.three_five_seven_submit_decision(
    v_session_terminal_game,v_session_terminal_round,v_session_terminal_dealer,1,1,v_st2,'fold'
  );
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_users[1])::text,true);
  SELECT public.three_five_seven_current_frame(v_session_terminal_game) INTO v_frame;
  IF v_frame#>>'{game,status}'<>'session_ended'
     OR (v_frame#>>'{identity,dealer_game_id}')::uuid IS DISTINCT FROM v_session_terminal_dealer
     OR (v_frame#>>'{identity,hand_number}')::integer IS DISTINCT FROM 1
     OR (v_frame#>>'{identity,round_number}')::integer IS DISTINCT FROM 1
     OR (v_frame#>>'{identity,round_id}')::uuid IS DISTINCT FROM v_session_terminal_round THEN
    RAISE EXCEPTION '357_authority_proof:session_terminal_current_frame_invalid:%',v_frame;
  END IF;
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE private.three_five_seven_round_resolutions
     SET presentation_fallback_at=clock_timestamp()-interval '1 second'
   WHERE game_id=v_session_terminal_game AND round_id=v_session_terminal_round;
  PERFORM set_config('app.three_five_seven_authoritative_write','off',true);
  PERFORM set_config('app.three_five_seven_recovery_game_id',v_session_terminal_game::text,true);
  SELECT private.advance_due_three_five_seven_state() INTO v_result;
  PERFORM set_config('app.three_five_seven_recovery_game_id','',true);
  PERFORM set_config('app.three_five_seven_recovery','off',true);
  IF v_result->>'outcome'<>'recovered'
     OR (SELECT status FROM public.games WHERE id=v_session_terminal_game)<>'session_ended'
     OR (SELECT current_game_uuid FROM public.games WHERE id=v_session_terminal_game) IS NOT NULL
     OR (SELECT current_round FROM public.games WHERE id=v_session_terminal_game) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id=v_session_terminal_game) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '357_authority_proof:complete_session_terminal_recovery_failed:%',v_result;
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

ROLLBACK;
