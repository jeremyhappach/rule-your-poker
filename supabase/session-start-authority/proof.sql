-- Caller opens BEGIN, creates pg_temp.waiting_start_candidate from authority.sql
-- and pg_temp.waiting_start_baseline from the captured production function.
-- This script touches only newly generated fixture UUIDs; caller MUST ROLLBACK.
CREATE TEMP TABLE waiting_start_proof_log(case_name text, result jsonb);

CREATE FUNCTION pg_temp.start_as(g uuid, actor uuid, candidate boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF candidate THEN RETURN pg_temp.waiting_start_candidate(g); END IF;
 RETURN pg_temp.waiting_start_baseline(g);
END $$;

CREATE FUNCTION pg_temp.money_state(g uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'pot',(SELECT pot FROM public.games WHERE id=g),
  'chips',(SELECT jsonb_agg(jsonb_build_object('id',id,'chips',chips) ORDER BY id) FROM public.players WHERE game_id=g),
  'rounds',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rounds r WHERE game_id=g),
  'dealers',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.dealer_games d WHERE session_id=g),
  'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.game_results r WHERE game_id=g),
  'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.session_player_snapshots s WHERE game_id=g),
  'transfers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.gameplay_transfer_batches t WHERE game_id=g)
 )
$$;

DO $proof$
DECLARE
 users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 pids uuid[]; g uuid; dg uuid; rid uuid; r jsonb; before_money jsonb; state_before jsonb;
 i integer; peer integer; release_seat boolean; money boolean; deadline timestamptz;
 outcome text; version bigint; mode text; baseline jsonb; total integer:=0; starter uuid; other_user uuid;
BEGIN
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id,email,raw_user_meta_data)
   VALUES(users[i],users[i]||'@example.invalid',jsonb_build_object('username','start-proof-'||users[i]));
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'start-proof-'||users[i],true)
   ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.begin_session_dealer_selection(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.begin_session_dealer_selection(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'start_proof:public_acl';
 END IF;

 -- Both human identities, both money modes, and both rejoin paths.
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
 FOR i IN 1..2 LOOP
 FOREACH release_seat IN ARRAY ARRAY[false,true] LOOP
  peer:=3-i; g:=gen_random_uuid(); dg:=gen_random_uuid(); rid:=gen_random_uuid();
  pids:=ARRAY[gen_random_uuid(),gen_random_uuid()];
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  INSERT INTO public.games(id,name,status,real_money,current_host,dealer_position,game_type,current_round,total_hands,pot)
   VALUES(g,'Rollback waiting-start proof','game_over',money,users[1],CASE peer WHEN 1 THEN 1 ELSE 4 END,'holm-game',1,1,0);
  INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,created_at) VALUES
   (pids[1],g,users[1],1,CASE i WHEN 1 THEN 3 ELSE -3 END,'active',false,false,clock_timestamp()-interval '3 minutes'),
   (pids[2],g,users[2],4,CASE i WHEN 2 THEN 3 ELSE -3 END,'active',false,false,clock_timestamp()-interval '2 minutes');
  INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(dg,g,users[peer],'holm-game');
  INSERT INTO public.rounds(id,game_id,dealer_game_id,round_number,hand_number,status,pot,cards_dealt)
   VALUES(rid,g,dg,1,1,'completed',0,4);
  INSERT INTO public.game_results(game_id,dealer_game_id,game_type,hand_number,pot_won,winner_player_id,winner_username,player_chip_changes,event_kind)
   VALUES(g,dg,'holm-game',1,6,pids[i],'proof-winner',jsonb_build_object(pids[i]::text,6),'chucky_final_award');
  INSERT INTO public.game_results(game_id,dealer_game_id,game_type,hand_number,pot_won,winner_username,player_chip_changes)
   VALUES(g,dg,'holm',1,0,'Ante',jsonb_build_object(pids[1]::text,-3,pids[2]::text,-3));
  INSERT INTO public.gameplay_transfer_batches(game_id,dealer_game_id,cursor,reason,transfers,opening_balances,closing_balances,unmatched_deltas)
   VALUES(g,dg,1,'ante',jsonb_build_array(
    jsonb_build_object('id',g||':1:1','from',jsonb_build_object('kind','player','playerId',pids[1]),'to',jsonb_build_object('kind','pot'),'amount',3),
    jsonb_build_object('id',g||':1:2','from',jsonb_build_object('kind','player','playerId',pids[2]),'to',jsonb_build_object('kind','pot'),'amount',3)),
    jsonb_build_object('pot',0,'player:'||pids[1],0,'player:'||pids[2],0),
    jsonb_build_object('pot',6,'player:'||pids[1],-3,'player:'||pids[2],-3),'{}'),
   (g,dg,2,'transfer',jsonb_build_array(
    jsonb_build_object('id',g||':2:1','from',jsonb_build_object('kind','pot'),'to',jsonb_build_object('kind','player','playerId',pids[i]),'amount',6)),
    jsonb_build_object('pot',6,'player:'||pids[i],-3),jsonb_build_object('pot',0,'player:'||pids[i],3),'{}');
  INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot)
   SELECT g,dg,1,id,user_id,'proof',chips,false FROM public.players WHERE game_id=g;
  UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  before_money:=pg_temp.money_state(g);
  PERFORM set_config('request.jwt.claim.sub',users[i]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[i],'role','authenticated')::text,true);
  r:=public.holm_advance_postgame(g,rid,dg,1);
  IF r->>'status'<>'game_selection' OR (r->>'dealer_position')::integer<>(CASE i WHEN 1 THEN 1 ELSE 4 END) THEN
   RAISE EXCEPTION 'start_proof:normal_completion:%',r;
  END IF;
  r:=public.holm_advance_postgame(g,rid,dg,1);
  IF r->>'outcome'<>'already_advanced' THEN RAISE EXCEPTION 'start_proof:postgame_duplicate:%',r; END IF;
  SELECT config_deadline INTO deadline FROM public.games WHERE id=g;
  r:=public.decline_session_setup(g,CASE i WHEN 1 THEN 1 ELSE 4 END,deadline);
  IF r->>'status'<>'waiting' THEN RAISE EXCEPTION 'start_proof:decline:%',r; END IF;
  r:=pg_temp.start_as(g,users[peer]);
  IF r->>'outcome'<>'not_ready' THEN RAISE EXCEPTION 'start_proof:one_player:%',r; END IF;
  -- Keep the voluntary sitter present; expire only the other player's lease.
  UPDATE private.session_abandonment_watches SET armed_at=clock_timestamp()-interval '61 seconds' WHERE game_id=g;
  INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,game_id,route,status,last_heartbeat_at)
   VALUES(users[i],g::text,g,'/game/'||g,'active',clock_timestamp());
  outcome:=private.reconcile_session_abandonment(g,clock_timestamp());
  IF NOT (SELECT sitting_out FROM public.players WHERE id=pids[peer])
    OR (SELECT status FROM public.games WHERE id=g)<>'waiting' THEN
   RAISE EXCEPTION 'start_proof:timeout:%',outcome;
  END IF;
  IF release_seat THEN
   UPDATE private.postgame_forced_absence_watches SET armed_at=clock_timestamp()-interval '16 seconds' WHERE game_id=g;
   outcome:=private.reconcile_session_abandonment(g,clock_timestamp());
   IF (SELECT status FROM public.players WHERE id=pids[peer])<>'left' THEN RAISE EXCEPTION 'start_proof:seat_release:%',outcome; END IF;
   PERFORM set_config('request.jwt.claim.sub',users[peer]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[peer],'role','authenticated')::text,true);
   SELECT participation_version INTO version FROM public.players WHERE id=pids[peer];
   r:=public.session_take_seat(g,CASE peer WHEN 1 THEN 1 ELSE 5 END,pids[peer],version::integer);
   IF r->>'outcome'<>'seated' THEN RAISE EXCEPTION 'start_proof:reseat:%',r; END IF;
  ELSE
   PERFORM set_config('request.jwt.claim.sub',users[peer]::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[peer],'role','authenticated')::text,true);
   SELECT intent_version INTO version FROM public.players WHERE id=pids[peer];
   r:=public.set_session_player_intent(g,pids[peer],version,NULL,'rejoin',true);
   IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'start_proof:peer_rejoin:%',r; END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.sub',users[i]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[i],'role','authenticated')::text,true);
  SELECT intent_version INTO version FROM public.players WHERE id=pids[i];
  r:=public.set_session_player_intent(g,pids[i],version,NULL,'rejoin',true);
  IF r->>'outcome'<>'accepted' THEN RAISE EXCEPTION 'start_proof:dealer_rejoin:%',r; END IF;
  r:=public.set_session_player_intent(g,pids[i],version,NULL,'rejoin',true);
  IF r->>'outcome'<>'stale_identity' THEN RAISE EXCEPTION 'start_proof:intent_replay:%',r; END IF;
  IF (SELECT count(*) FROM public.players WHERE game_id=g AND position IS NOT NULL AND status NOT IN ('left','observer') AND (waiting OR NOT sitting_out))<>2 THEN
   RAISE EXCEPTION 'start_proof:ready_count';
  END IF;
  -- A released original host can legitimately transfer the persisted host to
  -- the other seated human. Rejoining does not seize it back.
  SELECT current_host INTO starter FROM public.games WHERE id=g;
  other_user:=CASE WHEN starter=users[1] THEN users[2] ELSE users[1] END;
  IF pg_temp.get_waiting_start_blocked(g) THEN RAISE EXCEPTION 'start_proof:readiness_disagrees'; END IF;
  r:=pg_temp.start_as(g,other_user);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'start_proof:duplicate_authority:%',r; END IF;
  r:=pg_temp.start_as(g,users[3]);
  IF r->>'outcome'<>'not_authorized' THEN RAISE EXCEPTION 'start_proof:outsider:%',r; END IF;
  INSERT INTO waiting_start_proof_log VALUES('ready_client_inputs',jsonb_build_object(
   'current_host',starter,'starter',starter,
   'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.players p WHERE game_id=g),
   'boundary',(SELECT to_jsonb(x) FROM public.games x WHERE id=g)));
  r:=pg_temp.start_as(g,starter);
  IF r->>'outcome'<>'started' THEN RAISE EXCEPTION 'start_proof:eligible_host:%',r; END IF;
  SELECT to_jsonb(x) INTO state_before FROM public.games x WHERE id=g;
  r:=pg_temp.start_as(g,starter);
  IF r->>'outcome'<>'already_started' OR (SELECT to_jsonb(x) FROM public.games x WHERE id=g) IS DISTINCT FROM state_before THEN
   RAISE EXCEPTION 'start_proof:duplicate_start:%',r;
  END IF;
  r:=public.holm_advance_postgame(g,rid,dg,1);
  IF r->>'outcome'<>'already_advanced' OR (SELECT to_jsonb(x) FROM public.games x WHERE id=g) IS DISTINCT FROM state_before THEN
   RAISE EXCEPTION 'start_proof:late_postgame_replay:%',r;
  END IF;
  IF pg_temp.money_state(g) IS DISTINCT FROM before_money THEN RAISE EXCEPTION 'start_proof:money_history_changed'; END IF;
  INSERT INTO waiting_start_proof_log VALUES('full_sequence',jsonb_build_object('real_money',money,'decliner',i,'disconnected',peer,'seat_released',release_seat,'outcome','passed'));
  total:=total+1;
 END LOOP;
 END LOOP;
 END LOOP;

 -- Prove the pre-existing guard gap only on new, rollback-only rows.
 g:=gen_random_uuid();
 INSERT INTO public.games(id,name,status,current_host,real_money,pot) VALUES(g,'Rollback baseline guard proof','waiting',users[1],true,3);
 INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting) VALUES
  (g,users[1],1,0,'active',false,true),(g,users[2],4,0,'active',false,true);
 baseline:=pg_temp.start_as(g,users[1],false);
 -- Before migration this reproduces the gap; after migration it verifies the deployed guard.
 IF baseline->>'outcome' NOT IN ('started','blocked_unfinished_state') THEN RAISE EXCEPTION 'start_proof:unexpected_deployed_probe:%',baseline; END IF;
 INSERT INTO waiting_start_proof_log VALUES('baseline_unsettled_pot_gap',baseline);

 FOREACH mode IN ARRAY ARRAY['pot','pointer','unfinished_round','live_round_pointer','pending_transfer','in_progress','ante_decision','game_over','session_ended','paused','pending_end','ended_at'] LOOP
  g:=gen_random_uuid(); dg:=gen_random_uuid();
  INSERT INTO public.games(id,name,status,current_host,real_money,pot) VALUES(g,'Rollback blocked start proof','waiting',users[1],true,0);
  INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,waiting) VALUES
   (g,users[1],1,3,'active',false,true),(g,users[2],4,-3,'active',false,true);
  IF mode='pot' THEN UPDATE public.games SET pot=6 WHERE id=g;
  ELSIF mode='pointer' THEN
   INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES(dg,g,users[1],'holm-game');
   UPDATE public.games SET current_game_uuid=dg WHERE id=g;
  ELSIF mode IN ('unfinished_round','live_round_pointer') THEN
   INSERT INTO public.rounds(game_id,round_number,hand_number,status,pot,cards_dealt) VALUES(g,1,1,'betting',0,4);
   IF mode='live_round_pointer' THEN UPDATE public.games SET current_round=1 WHERE id=g; END IF;
  ELSIF mode='pending_transfer' THEN
   INSERT INTO public.gameplay_transfer_pending_changes(transaction_id,game_id,endpoint_key,opening_balance,closing_balance)
    VALUES(txid_current(),g,'pot',6,0);
  ELSIF mode='paused' THEN UPDATE public.games SET is_paused=true WHERE id=g;
  ELSIF mode='pending_end' THEN UPDATE public.games SET pending_session_end=true WHERE id=g;
  ELSIF mode='ended_at' THEN UPDATE public.games SET session_ended_at=clock_timestamp() WHERE id=g;
  ELSE UPDATE public.games SET status=mode WHERE id=g;
  END IF;
  before_money:=pg_temp.money_state(g);
  SELECT to_jsonb(x) INTO state_before FROM public.games x WHERE id=g;
  IF NOT pg_temp.get_waiting_start_blocked(g) THEN RAISE EXCEPTION 'start_proof:readiness_ignored_blocker:%',mode; END IF;
  r:=pg_temp.start_as(g,users[1]);
  IF r->>'outcome' NOT IN ('not_startable','blocked_unfinished_state') THEN RAISE EXCEPTION 'start_proof:blocked:%:%',mode,r; END IF;
  IF pg_temp.money_state(g) IS DISTINCT FROM before_money OR (SELECT to_jsonb(x) FROM public.games x WHERE id=g) IS DISTINCT FROM state_before THEN
   RAISE EXCEPTION 'start_proof:blocked_mutated:%',mode;
  END IF;
  INSERT INTO waiting_start_proof_log VALUES('blocked_'||mode,r);
 END LOOP;
 IF has_function_privilege('anon','pg_temp.get_waiting_start_blocked(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','pg_temp.get_waiting_start_blocked(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','pg_temp.waiting_start_is_blocked(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'start_proof:readiness_acl';
 END IF;
 INSERT INTO waiting_start_proof_log VALUES('summary',jsonb_build_object('full_sequences',total,'result','PASS'));
END $proof$;
SELECT jsonb_agg(to_jsonb(l)) AS proof_results FROM waiting_start_proof_log l;
