-- Synthetic, fake-money fixtures only. Entire proof must remain in ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '25s';
SET LOCAL lock_timeout = '3s';
DO $proof$
DECLARE
  v_game uuid; v_dealer uuid; v_round uuid; v_next uuid;
  v_users uuid[]; v_players uuid[]; v_type text; v_tie boolean; i integer;
  v_state jsonb; v_dice jsonb; v_result jsonb; v_reply jsonb; v_duplicate jsonb;
  v_batch jsonb; v_batches integer; v_chips integer[]; v_pot integer;
  v_evidence jsonb := '[]'; v_ids uuid[] := '{}'; v_denied boolean;
  v_metadata boolean := current_setting('incident.expect_metadata',true) = 'true';
BEGIN
  FOREACH v_type IN ARRAY ARRAY['horses','ship-captain-crew'] LOOP
    FOREACH v_tie IN ARRAY ARRAY[false,true] LOOP
      v_game:=gen_random_uuid();v_dealer:=gen_random_uuid();
      v_users:=ARRAY[gen_random_uuid(),gen_random_uuid()];v_players:=ARRAY[gen_random_uuid(),gen_random_uuid()];
      v_ids:=v_ids||v_game;
      FOR i IN 1..2 LOOP
        INSERT INTO auth.users(id) VALUES(v_users[i]);
        INSERT INTO public.profiles(id,username,is_active) VALUES(v_users[i],'Dice proof '||v_users[i],true) ON CONFLICT(id) DO NOTHING;
      END LOOP;
      INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,pending_session_end,ante_amount,total_hands,current_round,game_type)
        VALUES(v_game,'waiting',false,1,0,false,false,2,1,1,v_type);
      FOR i IN 1..2 LOOP
        INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,ante_decision)
          VALUES(v_players[i],v_game,v_users[i],i,10,false,'ante_up');
      END LOOP;
      INSERT INTO public.dealer_games(id,session_id,game_type,dealer_user_id) VALUES(v_dealer,v_game,v_type,v_users[1]);
      UPDATE public.games SET current_game_uuid=v_dealer,status='ante_decision' WHERE id=v_game;
      v_reply:=private.start_horses_scc_initial_round(v_game,v_dealer);
      ASSERT v_reply->>'outcome'='started','initial admission did not start';
      v_round:=(v_reply->>'round_id')::uuid;
      SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
      SELECT to_jsonb(b) INTO v_batch FROM public.gameplay_transfer_batches b WHERE game_id=v_game;
      ASSERT v_batch->'unmatched_deltas'='{}'::jsonb,'initial unbalanced';
      IF v_metadata THEN
        ASSERT v_batch->>'source_round_id' IS NULL AND v_batch->>'successor_round_id'=v_round::text,'wrong initial destination';
      END IF;
      v_duplicate:=private.start_horses_scc_initial_round(v_game,v_dealer);
      ASSERT v_duplicate->>'outcome'='stale_identity','duplicate admission changed';
      SELECT array_agg(chips ORDER BY position) INTO v_chips FROM public.players WHERE game_id=v_game;
      ASSERT v_chips=ARRAY[8,8],'initial chips wrong';
      v_state:='{}';
      FOR i IN 1..2 LOOP
        SELECT jsonb_agg(jsonb_build_object('value',value,'isHeld',true,'isSCC',v_type='ship-captain-crew' AND NOT v_tie AND i=1 AND ord<=3,
          'sccType',CASE WHEN v_type='ship-captain-crew' AND NOT v_tie AND i=1 AND ord<=3 THEN (ARRAY['ship','captain','crew'])[ord] ELSE NULL END)) INTO v_dice
          FROM unnest(CASE WHEN v_tie OR i=2 THEN ARRAY[2,2,3,3,5] WHEN v_type='horses' THEN ARRAY[6,6,6,6,6] ELSE ARRAY[6,5,4,6,5] END) WITH ORDINALITY dice(value,ord);
        v_result:=private.horses_scc_player_result(v_dice,v_type);
        v_state:=v_state||jsonb_build_object(v_players[i]::text,jsonb_build_object('dice',v_dice,'rollsRemaining',0,'isComplete',true,'rollKey',2,'result',v_result));
      END LOOP;
      UPDATE public.rounds SET horses_state=jsonb_build_object('gamePhase','complete','currentTurnPlayerId',NULL,'turnOrder',to_jsonb(v_players),'playerStates',v_state) WHERE id=v_round;
      -- Reject outsider and wrong immutable identity before any financial writes.
      PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
      v_denied:=false;
      BEGIN
        PERFORM public.horses_settle_game(v_game,v_round,v_dealer,1);
      EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
      ASSERT v_denied,'outsider not rejected';
      PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
      v_denied:=false;
      BEGIN
        PERFORM public.horses_settle_game(v_game,v_round,gen_random_uuid(),1);
      EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
      ASSERT v_denied,'wrong dealer not rejected';
      -- Inject a transaction failure AFTER actual financial authority executes.
      BEGIN
        PERFORM public.horses_scc_advance_completed_round(v_game,v_round,v_dealer,1);
        SET CONSTRAINTS ALL IMMEDIATE;
        RAISE EXCEPTION USING ERRCODE='P9911',MESSAGE='intentional proof rollback';
      EXCEPTION WHEN SQLSTATE 'P9911' THEN NULL; END;
      SET CONSTRAINTS ALL DEFERRED;
      SELECT array_agg(chips ORDER BY position) INTO v_chips FROM public.players WHERE game_id=v_game;
      ASSERT v_chips=ARRAY[8,8],'injected failure left chips';
      ASSERT (SELECT pot=4 FROM public.games WHERE id=v_game),'injected failure left pot';
      ASSERT (SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE game_id=v_game),'injected failure left batch';
      ASSERT NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=v_game),'injected failure left result';
      v_reply:=public.horses_scc_advance_completed_round(v_game,v_round,v_dealer,1);
      SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
      v_duplicate:=public.horses_scc_advance_completed_round(v_game,v_round,v_dealer,1);
      ASSERT v_duplicate->>'status'=CASE WHEN v_tie THEN 'already_advanced' ELSE 'already_settled' END,'duplicate settlement changed';
      SELECT array_agg(chips ORDER BY position) INTO v_chips FROM public.players WHERE game_id=v_game;
      SELECT pot INTO v_pot FROM public.games WHERE id=v_game;
      ASSERT v_chips=CASE WHEN v_tie THEN ARRAY[6,6] ELSE ARRAY[12,8] END,'settled chips wrong';
      ASSERT v_pot=CASE WHEN v_tie THEN 8 ELSE 0 END,'settled pot wrong';
      ASSERT v_chips[1]+v_chips[2]+v_pot=20,'conservation';
      ASSERT NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE game_id=v_game AND unmatched_deltas<>'{}'::jsonb),'unbalanced batch';
      SELECT count(*) INTO v_batches FROM public.gameplay_transfer_batches WHERE game_id=v_game;
      ASSERT v_batches=2,'wrong financial batch count';
      SELECT to_jsonb(b) INTO v_batch FROM public.gameplay_transfer_batches b WHERE game_id=v_game ORDER BY cursor DESC LIMIT 1;
      IF v_metadata THEN
        ASSERT v_batch->>'source_round_id'=v_round::text,'wrong settlement predecessor';
        v_denied:=false;
        BEGIN
          UPDATE public.gameplay_transfer_batches SET successor_round_id=gen_random_uuid() WHERE id=(v_batch->>'id')::uuid;
        EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM='transfer_source_round_is_immutable'; END;
        ASSERT v_denied,'immutable batch identity was writable';
        IF v_tie THEN
          SELECT id INTO v_next FROM public.rounds WHERE game_id=v_game AND hand_number=2;
          ASSERT v_batch->>'successor_round_id'=v_next::text,'wrong successor ante destination';
        ELSE ASSERT v_batch->>'successor_round_id' IS NULL,'award has successor'; END IF;
      END IF;
      IF v_tie THEN
        SELECT id INTO v_next FROM public.rounds WHERE game_id=v_game AND hand_number=2;
        UPDATE public.rounds SET horses_state=jsonb_build_object('gamePhase','complete','currentTurnPlayerId',NULL,'turnOrder',to_jsonb(v_players),'playerStates',v_state) WHERE id=v_next;
        PERFORM public.horses_scc_advance_completed_round(v_game,v_next,v_dealer,2);
        SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
        v_duplicate:=public.horses_scc_advance_completed_round(v_game,v_round,v_dealer,1);
        ASSERT v_duplicate->>'status'='stale_identity','old round settled after continuation';
      END IF;
      v_evidence:=v_evidence||jsonb_build_array(jsonb_build_object('game',v_type,'tie',v_tie,'session',v_game,'chips',v_chips,'pot',v_pot,'balanced',true,'initial',true,'duplicate',true,'authorization',true,'atomicFailure',true,'continuation',v_tie,'metadata',coalesce(v_metadata,false)));
      PERFORM set_config('request.jwt.claim.sub','',true);
    END LOOP;
  END LOOP;
  ASSERT NOT has_function_privilege('anon','public.horses_settle_game(uuid,uuid,uuid,integer)','execute'),'anonymous settlement access';
  ASSERT NOT has_function_privilege('authenticated','private.start_horses_scc_initial_round(uuid,uuid)','execute'),'browser private initial access';
  PERFORM set_config('incident.proof',jsonb_build_object('cases',v_evidence,'fixtureSessions',v_ids,'rollbackContained',true)::text,true);
END;
$proof$;
SELECT current_setting('incident.proof')::jsonb AS evidence;
ROLLBACK;
