CREATE FUNCTION pg_temp.take_accept(game uuid,dealer uuid) RETURNS void LANGUAGE plpgsql AS $wrap$
 DECLARE p record;actor text:=current_setting('request.jwt.claim.sub',true);
 BEGIN
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=game AND status='active' AND NOT sitting_out AND NOT is_bot AND ante_decision IS NULL LOOP
 PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(game,dealer,p.id,'ante_up');END LOOP;
 PERFORM public.advance_ante_phase(game,dealer);PERFORM set_config('request.jwt.claim.sub',actor,true);
 END $wrap$;
-- Transaction-contained qualification only. Caller wraps candidate + proof in BEGIN/ROLLBACK.
CREATE FUNCTION pg_temp.take_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Take 2 proof: %',label;END IF;END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; proof_players uuid[]; game uuid;dealer uuid;deadline timestamptz;v jsonb;b jsonb;a jsonb;again jsonb;run jsonb;req uuid;rev bigint;actor uuid;before_counts jsonb;expected integer;case_i integer;money_i integer;at_ms bigint;totals jsonb;terminal jsonb;
BEGIN
 UPDATE private.take_two_release SET enabled=true,admission_enabled=true;
 FOR case_i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[case_i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[case_i],'Eleven '||users[case_i]::text,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 b:=private.take_two_board_deal(jsonb_build_object('rules',private.take_two_rules(),'score',1000),1000);
 FOR money_i IN 0..1 LOOP
  FOR case_i IN 1..3 LOOP
  game:=gen_random_uuid();proof_players:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,'game_selection',money_i=1,3,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT proof_players[i],game,users[i],4-i,100,false FROM generate_series(1,3) i;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  BEGIN PERFORM public.take_two_configure(game,proof_players[1],3,'take-two','{"ante_amount":0}',deadline);RAISE EXCEPTION 'missing stake rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM='missing stake rejection' OR SQLERRM NOT LIKE 'take_two:%' THEN RAISE;END IF;END;
  v:=public.take_two_configure(game,proof_players[1],3,'take-two','{"ante_amount":5}',deadline);dealer:=(v#>>'{dealer_game,id}')::uuid;
  PERFORM pg_temp.take_assert((public.take_two_configure(game,proof_players[1],3,'take-two','{"ante_amount":5}',deadline)->>'deduped')::boolean,'setup replay');
  PERFORM pg_temp.take_accept(game,dealer);
  SELECT state INTO terminal FROM private.take_two_matches WHERE dealer_game_id=dealer;
  PERFORM pg_temp.take_assert(terminal->'rules'=private.take_two_rules(),'multiplayer freezes shared admission rules');
  actor:=(terminal#>>'{players,0,userId}')::uuid;PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  UPDATE private.take_two_matches SET state=state||b||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+30000) WHERE dealer_game_id=dealer;
  req:=gen_random_uuid();v:=public.take_two_action(dealer,req,0,'draw',NULL);rev:=(v->>'revision')::bigint;
  PERFORM pg_temp.take_assert((public.take_two_action(dealer,req,0,'draw',NULL)->>'revision')::bigint=rev,'duplicate command');
  BEGIN PERFORM public.take_two_action(dealer,req,0,'take_score');RAISE EXCEPTION 'missing replay conflict';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'take_two:replay_conflict' THEN RAISE;END IF;END;
  BEGIN PERFORM public.take_two_action(dealer,gen_random_uuid(),0,'take_score');RAISE EXCEPTION 'missing stale rejection';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'take_two:stale_revision' THEN RAISE;END IF;END;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  BEGIN PERFORM public.take_two_snapshot(dealer);RAISE EXCEPTION 'missing membership rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  totals:=jsonb_build_object(proof_players[1]::text,100,proof_players[2]::text,CASE WHEN case_i>1 THEN 100 ELSE 0 END,proof_players[3]::text,CASE WHEN case_i=3 THEN 100 ELSE 0 END);
  UPDATE private.take_two_matches SET state=state||jsonb_build_object('phase','complete','scores',totals,'turnIndex',3) WHERE dealer_game_id=dealer;
  IF case_i=3 THEN UPDATE public.games SET pending_session_end=true WHERE id=game;END IF;
  PERFORM private.take_two_settle(dealer);PERFORM private.take_two_settle(dealer);
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.take_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'one immutable result');
  PERFORM pg_temp.take_assert((SELECT sum(chips)=300 FROM public.players WHERE game_id=game),'balanced chips');
  PERFORM pg_temp.take_assert((SELECT chips=CASE case_i WHEN 1 THEN 110 WHEN 2 THEN 103 ELSE 100 END FROM public.players WHERE id=proof_players[1]) OR case_i=2 AND (SELECT chips=102 FROM public.players WHERE id=proof_players[1]),'winner actual chips');
  PERFORM pg_temp.take_assert((SELECT count(*)=3 FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=dealer),'final snapshots equal chips');
  IF case_i<3 THEN
   PERFORM pg_temp.take_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer AND unmatched_deltas='{}'::jsonb AND jsonb_array_length(transfers)>0),'canonical journal');
  ELSE PERFORM pg_temp.take_assert((SELECT status='session_ended' FROM public.games WHERE id=game),'Session Ended');END IF;
  PERFORM pg_temp.take_assert(public.take_two_action(dealer,req,0,'draw',NULL)->>'phase'='complete','late replay');
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM public.take_two_close(dealer); PERFORM pg_temp.take_assert((SELECT NOT finished FROM private.take_two_matches WHERE dealer_game_id=dealer),'authoritative postgame hold'); UPDATE private.take_two_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=dealer; PERFORM public.take_two_close(dealer);PERFORM public.take_two_close(dealer);
  PERFORM pg_temp.take_assert((SELECT finished FROM private.take_two_matches WHERE dealer_game_id=dealer),'close replay');
 END LOOP;
 END LOOP;
 -- Fresh authoritative no-client match: consume overdue ready/results windows.
 game:=gen_random_uuid();deadline:=clock_timestamp()+interval '10 minutes';proof_players:=ARRAY[gen_random_uuid(),gen_random_uuid()];
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,'game_selection',false,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT proof_players[i],game,users[i],3-i,100,false FROM generate_series(1,2) i;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 v:=public.take_two_configure(game,proof_players[1],2,'take-two','{"ante_amount":5}',deadline);dealer:=(v#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.take_accept(game,dealer);
 UPDATE private.take_two_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE dealer_game_id=dealer;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM private.take_two_recover();PERFORM pg_temp.take_assert((SELECT state->>'phase'='complete' AND settlement IS NOT NULL FROM private.take_two_matches WHERE dealer_game_id=dealer),'zero-client recovery');
 SELECT jsonb_build_array((SELECT count(*) FROM public.games),(SELECT count(*) FROM public.players),(SELECT count(*) FROM public.game_results),(SELECT count(*) FROM public.gameplay_transfer_batches)) INTO before_counts;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='take-two/1';UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 run:=public.arcade_start(users[1],gen_random_uuid(),'take-two');a:=public.arcade_take_two_step(users[1],(run->>'id')::uuid);
 PERFORM pg_temp.take_assert(NOT((a#>'{projection,view}')?'deck'),'solo redaction');
 PERFORM pg_temp.take_assert(a#>'{projection,view,rules}'=private.take_two_rules(),'Arcade freezes same admission rules');
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE id=(run->>'id')::uuid;
 a:=public.arcade_take_two_step(users[1],(run->>'id')::uuid);again:=public.arcade_take_two_step(users[1],(run->>'id')::uuid);
 PERFORM pg_temp.take_assert(a#>>'{record,status}'='completed' AND jsonb_array_length(a#>'{record,state,results}')=3 AND a#>'{record,revision}'=again#>'{record,revision}','solo completion replay');
 PERFORM pg_temp.take_assert((SELECT count(*)=1 FROM private.arcade_results WHERE run_id=(run->>'id')::uuid),'one solo result');
 BEGIN PERFORM public.arcade_take_two_step(users[2],(run->>'id')::uuid);RAISE EXCEPTION 'missing solo owner rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.take_assert(before_counts=(SELECT jsonb_build_array((SELECT count(*) FROM public.games),(SELECT count(*) FROM public.players),(SELECT count(*) FROM public.game_results),(SELECT count(*) FROM public.gameplay_transfer_batches))),'solo zero financial/session writes');
END $$;
SELECT 'take-two production rollback proof passed' AS proof;
