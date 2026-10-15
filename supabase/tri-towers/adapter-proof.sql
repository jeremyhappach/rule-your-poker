CREATE FUNCTION pg_temp.check_adapter(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers_adapter_proof:%',label;END IF;END $$;
DO $$
DECLARE session_id uuid:=gen_random_uuid(); user_a uuid:=gen_random_uuid();user_b uuid:=gen_random_uuid();
 player_a uuid:=gen_random_uuid();player_b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 deadline timestamptz:=clock_timestamp()+interval '10 minutes'; setup jsonb; s jsonb; view jsonb; dealer_id uuid;
 request_id uuid:=gen_random_uuid(); revision_i bigint; old_request uuid; old_rev bigint; idx integer; action text; step_i integer:=0;
BEGIN
 INSERT INTO pg_temp.profiles(id,username) VALUES(user_a,'Tri proof A'),(user_b,'Tri proof B');
 INSERT INTO pg_temp.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(session_id,'game_selection',false,2,deadline,0,false,false);
 INSERT INTO pg_temp.players(id,game_id,user_id,position,chips) VALUES(player_a,session_id,user_a,2,0),(player_b,session_id,user_b,1,0);
 PERFORM set_config('request.jwt.claim.sub',user_a::text,true);
 BEGIN PERFORM pg_temp.tri_towers_configure(session_id,player_a,2,'tri-towers','{"ante_amount":5}',deadline);RAISE EXCEPTION 'gate_open';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'tri_towers:release_closed' THEN RAISE;END IF;END;
 UPDATE pg_temp.tri_towers_release SET enabled=true;
 setup:=pg_temp.tri_towers_configure(session_id,player_a,2,'tri-towers','{"ante_amount":5}',deadline);dealer_id:=(setup#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.check_adapter((pg_temp.tri_towers_configure(session_id,player_a,2,'tri-towers','{"ante_amount":5}',deadline)->>'deduped')::boolean,'setup_duplicate');
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 BEGIN PERFORM pg_temp.tri_towers_snapshot(dealer_id);RAISE EXCEPTION 'outsider_read';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM pg_temp.tri_towers_configure(session_id,player_a,2,'tri-towers','{"ante_amount":5}',deadline);RAISE EXCEPTION 'outsider_setup_replay';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',user_a::text,true);
 view:=pg_temp.tri_towers_snapshot(dealer_id);PERFORM pg_temp.check_adapter(view->>'activePlayerId'=player_b::text AND NOT(view->>'canAct')::boolean,'clockwise_spectator');
 BEGIN PERFORM pg_temp.tri_towers_action(dealer_id,request_id,0,'start');RAISE EXCEPTION 'spectator_action';EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'tri_towers:spectator' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',user_b::text,true);
 view:=pg_temp.tri_towers_action(dealer_id,request_id,0,'start');
 PERFORM pg_temp.check_adapter(pg_temp.tri_towers_action(dealer_id,request_id,0,'start')->>'revision'=view->>'revision','duplicate_action');
 BEGIN PERFORM pg_temp.tri_towers_action(dealer_id,request_id,0,'draw');RAISE EXCEPTION 'replay_conflict_missing';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:replay_conflict' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.tri_towers_action(dealer_id,gen_random_uuid(),0,'draw');RAISE EXCEPTION 'stale_missing';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:stale_revision' THEN RAISE;END IF;END;
 -- Pause affects only this synthetic session and freezes the exact deadline.
 UPDATE pg_temp.games SET is_paused=true WHERE id=session_id;
 BEGIN PERFORM pg_temp.tri_towers_action(dealer_id,gen_random_uuid(),(view->>'revision')::bigint,'draw');RAISE EXCEPTION 'paused_action';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'tri_towers:inactive' THEN RAISE;END IF;END;
 UPDATE pg_temp.games SET is_paused=false WHERE id=session_id;
 LOOP
  SELECT state,revision INTO s,revision_i FROM pg_temp.tri_towers_matches WHERE dealer_game_id=dealer_id;
  EXIT WHEN s->>'phase'='complete';step_i:=step_i+1;IF step_i>500 THEN RAISE EXCEPTION 'simulation_limit';END IF;
  PERFORM set_config('request.jwt.claim.sub',s->'players'->(s->>'turnIndex')::integer->>'userId',true);
  idx:=NULL;IF s->>'phase'='ready' THEN action:='start';ELSIF s->>'phase'='stage_complete' THEN action:='continue';
  ELSE SELECT q.card INTO idx FROM generate_series(0,27)q(card) WHERE pg_temp.tri_towers_legal(s,q.card) ORDER BY q.card LIMIT 1;action:=CASE WHEN idx IS NULL THEN 'draw' ELSE 'remove' END;END IF;
  old_request:=gen_random_uuid();old_rev:=revision_i;view:=pg_temp.tri_towers_action(dealer_id,old_request,revision_i,action,idx);
 END LOOP;
 PERFORM pg_temp.check_adapter((SELECT count(*)=1 FROM pg_temp.game_results WHERE dealer_game_id=dealer_id),'one_result');
 PERFORM pg_temp.check_adapter((SELECT sum(chips)=0 FROM pg_temp.players WHERE game_id=session_id),'balanced_chips');
 PERFORM pg_temp.check_adapter((SELECT count(*)=2 FROM pg_temp.session_player_snapshots WHERE dealer_game_id=dealer_id),'final_snapshots');
 PERFORM pg_temp.tri_towers_action(dealer_id,old_request,old_rev,action,idx);
 PERFORM pg_temp.tri_towers_settle(dealer_id);
 PERFORM pg_temp.check_adapter((SELECT count(*)=1 FROM pg_temp.game_results WHERE dealer_game_id=dealer_id),'duplicate_and_late_settlement');
 PERFORM pg_temp.check_adapter((SELECT count(*)>1 FROM pg_temp.tri_towers_history WHERE dealer_game_id=dealer_id),'persistent_live_history');
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.check_adapter(NOT EXISTS(SELECT 1 FROM pg_temp.gameplay_transfer_batches WHERE unmatched_deltas<>'{}'::jsonb),'existing_journal_balanced');
 PERFORM pg_temp.tri_towers_close(dealer_id);PERFORM pg_temp.tri_towers_close(dealer_id);
 PERFORM pg_temp.check_adapter((SELECT status='game_selection' AND current_game_uuid IS NULL FROM pg_temp.games WHERE id=session_id),'canonical_continuation');
END $$;
SELECT pg_temp.check_adapter(NOT EXISTS(SELECT 1 FROM pg_stat_xact_user_tables WHERE schemaname IN ('public','private') AND n_tup_ins+n_tup_upd+n_tup_del>0),'zero_application_writes');
SELECT 'Temporary-schema proof passed: configure, closed gate, authorization, spectator rejection, duplicate/stale commands, pause, complete multiplayer, settlement, existing transfer journal, snapshots, history and continuation. Zero application-table writes.' AS proof;
