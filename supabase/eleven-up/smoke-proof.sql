-- Execute after smoke-production-proof.sql in the same rollback transaction.
DO $$
DECLARE b jsonb;v jsonb;old jsonb;rules jsonb;users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];people uuid[];
 session uuid;dealer uuid;deadline timestamptz;state_i jsonb;totals jsonb;stages jsonb;facts jsonb;board jsonb;
 case_i int;i int;j int;scores int[];all_games uuid[]:='{}';admin_id uuid;before_chips jsonb;before_count bigint;label text;
BEGIN
 rules:=private.eleven_up_admission_rules();PERFORM pg_temp.eleven_assert(rules->>'version'='eleven-up/3','11 Up new admission');
 b:=private.eleven_up_board_deal(jsonb_build_object('rules',rules,'score',0),0)||jsonb_build_object('phase','playing','deadline',100000,'startedAt',0,'cursor',52,'current',20,'slots','[null,null,null,null,null,null,null,null,16,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb);
 v:=private.eleven_up_board_reduce(b,'pass',NULL,1000);
 PERFORM pg_temp.eleven_assert(v->>'phase'='playing' AND v->'deadline'=b->'deadline' AND NOT private.eleven_up_can_pass(v) AND NOT private.eleven_up_has_group(v),'11 Up manual stuck');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(v,'take_score',NULL,2000)->>'phase'='stage_complete','11 Up legal take');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(v,'tick',NULL,100000)#>>'{result,reason}'='timeout','11 Up timeout');
 old:=jsonb_set(b,'{rules,version}','"eleven-up/2"');
 PERFORM pg_temp.eleven_assert(private.eleven_up_board_reduce(old,'pass',NULL,1000)->>'phase'='stage_complete','frozen 11 Up auto completion');
 rules:=private.tri_towers_rules();PERFORM pg_temp.eleven_assert(rules->>'version'='tri-towers/5','TriTowers new admission');
 b:=private.tri_towers_board_deal(jsonb_build_object('rules',rules,'score',0),0)||jsonb_build_object('phase','playing','deadline',100000,'cursor',51,'deck',(SELECT jsonb_agg(x) FROM generate_series(0,51)x),'removed',(SELECT jsonb_agg(x) FROM generate_series(0,26)x),'waste',0);
 v:=private.tri_towers_board_reduce(b,'draw',NULL,1000);
 PERFORM pg_temp.eleven_assert(v->>'phase'='playing' AND v->'deadline'=b->'deadline','TriTowers manual stuck');
 PERFORM pg_temp.eleven_assert(private.tri_towers_board_reduce(v,'tick',NULL,100000)#>>'{result,reason}'='timeout','TriTowers timeout');
 PERFORM pg_temp.eleven_assert(private.tri_towers_bot_choice(private.tri_towers_visible(v),1000)->>'action'='take_score','stuck bot uses legal command');
 old:=jsonb_set(b,'{rules,version}','"tri-towers/4"');
 PERFORM pg_temp.eleven_assert(private.tri_towers_board_reduce(old,'draw',NULL,1000)->>'phase'='stage_complete','frozen TriTowers auto completion');
 PERFORM pg_temp.eleven_assert(private.tri_towers_board_reduce(b,'remove',27,1000)#>>'{result,reason}'='cleared','TriTowers all-clear immediate');
 PERFORM pg_temp.eleven_assert(private.arcade_score_group('tri-towers','tri-towers/5')<>private.arcade_score_group('tri-towers','tri-towers/4'),'manual-recognition score group isolated');
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Smoke '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
 FOR case_i IN 1..7 LOOP
  scores:=CASE case_i WHEN 1 THEN ARRAY[103000,70000] WHEN 2 THEN ARRAY[103000,103000] WHEN 3 THEN ARRAY[110000,109000] WHEN 7 THEN ARRAY[1,0] ELSE ARRAY[100,50] END;
  session:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(session,'game_selection',false,2,deadline,0,false,false);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT people[x],session,users[x],3-x,100,false FROM generate_series(1,2)x;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  v:=public.eleven_up_configure(session,people[1],2,'eleven-up','{"ante_amount":5}',deadline);dealer:=(v#>>'{dealer_game,id}')::uuid;
  SELECT state INTO state_i FROM private.eleven_up_matches WHERE dealer_game_id=dealer;
  totals:=jsonb_build_object(people[1]::text,scores[1],people[2]::text,scores[2]);stages:='[]';
  FOR i IN 1..2 LOOP FOR j IN 1..CASE WHEN scores[i]>=80000 THEN 3 ELSE 2 END LOOP
   stages:=stages||jsonb_build_array(jsonb_build_object('playerId',people[i],'stage',j,'score',CASE WHEN j=1 THEN 0 WHEN j=2 THEN least(80000,scores[i]) ELSE scores[i] END,'reason','take_score'));
  END LOOP;END LOOP;
  UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','complete','scores',totals,'stages',stages,'turnIndex',2) WHERE dealer_game_id=dealer;
  IF case_i=1 THEN
   SELECT state INTO state_i FROM private.eleven_up_matches WHERE dealer_game_id=dealer;
   UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{players,0,isBot}','true') WHERE dealer_game_id=dealer;
   PERFORM pg_temp.eleven_assert(private.eleven_up_record_scores(dealer)='{}','bot match excluded');
   UPDATE private.eleven_up_matches SET state=jsonb_set(state_i,'{stages}','[]') WHERE dealer_game_id=dealer;
   PERFORM pg_temp.eleven_assert(private.eleven_up_record_scores(dealer)='{}','incomplete scores excluded');
   UPDATE private.eleven_up_matches SET state=state_i WHERE dealer_game_id=dealer;
   BEGIN PERFORM private.eleven_up_settle(dealer);RAISE EXCEPTION 'injected_after_financial_write';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'injected_after_financial_write' THEN RAISE;END IF;END;
   PERFORM pg_temp.eleven_assert((SELECT bool_and(chips=100) FROM public.players WHERE game_id=session) AND NOT EXISTS(SELECT 1 FROM private.multiplayer_score_results WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=dealer),'settlement and score facts roll back atomically');
  END IF;
  PERFORM private.eleven_up_settle(dealer);PERFORM private.eleven_up_settle(dealer);SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  SELECT state->'terminal' INTO facts FROM private.eleven_up_matches WHERE dealer_game_id=dealer;
  PERFORM pg_temp.eleven_assert((SELECT count(*)=2 FROM private.multiplayer_score_results WHERE dealer_game_id=dealer),'each participant recorded once');
  PERFORM pg_temp.eleven_assert((SELECT score=scores[2] FROM private.multiplayer_score_results WHERE dealer_game_id=dealer AND user_id=users[2]),'loser owns score');
  PERFORM pg_temp.eleven_assert(jsonb_array_length(public.multiplayer_score_history())=case_i,'own history');
  IF case_i=1 THEN
   PERFORM pg_temp.eleven_assert(facts#>>ARRAY['achievements',people[1]::text,'overallKind'] IN ('first','broken') AND facts#>>ARRAY['achievements',people[2]::text,'overallKind']='lower','only highest peer gets overall record');
  ELSIF case_i=2 THEN
   PERFORM pg_temp.eleven_assert(facts#>>ARRAY['achievements',people[1]::text,'kind']='matched' AND facts#>>ARRAY['achievements',people[2]::text,'kind']='broken' AND jsonb_array_length(facts->'winnerIds')=2,'tie and separate personal facts');
  ELSIF case_i=3 THEN
   PERFORM pg_temp.eleven_assert(facts#>>ARRAY['achievements',people[1]::text,'overallKind']='broken' AND facts#>>ARRAY['achievements',people[2]::text,'kind']='broken','both players can earn achievements');
  ELSE PERFORM pg_temp.eleven_assert(facts#>>ARRAY['achievements',people[1]::text,'kind']='lower','no new personal record');END IF;
  IF case_i=7 THEN PERFORM pg_temp.eleven_assert(facts#>>ARRAY['achievements',people[2]::text,'topTen']='false' AND facts#>>ARRAY['achievements',people[2]::text,'overallKind']='lower','no achievement outside top ten');END IF;
  PERFORM pg_temp.eleven_assert((public.arcade_leaderboard(users[2],'eleven-up','all',NULL,'eleven-up/3')->>'personalBest')::bigint=CASE WHEN case_i>=4 THEN 109000 ELSE scores[2] END,'compatible multiplayer leaderboard');
  PERFORM public.eleven_up_close(dealer);PERFORM pg_temp.eleven_assert((SELECT NOT finished FROM private.eleven_up_matches WHERE dealer_game_id=dealer),'no early continuation');
  IF case_i=7 THEN UPDATE public.players SET stand_up_next_hand=true WHERE game_id=session;END IF;
  UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=dealer;
  PERFORM private.eleven_up_recover();PERFORM private.eleven_up_recover();
  PERFORM pg_temp.eleven_assert((SELECT finished FROM private.eleven_up_matches WHERE dealer_game_id=dealer) AND (SELECT status IN ('game_selection','dealer_selection','waiting','waiting_for_players','session_ended') FROM public.games WHERE id=session),'zero-client automatic next state: '||(SELECT status FROM public.games WHERE id=session));
  IF case_i=7 THEN PERFORM pg_temp.eleven_assert(public.eleven_up_snapshot(dealer)->>'finished'='true','standing-up participant can acknowledge completed presentation');END IF;
  all_games:=array_append(all_games,session);
 END LOOP;
 -- Blast must remove exactly its graph, roll back completely on interruption,
 -- and replay without repeating financial work. No historical session is touched.
 session:=all_games[1];SELECT current_game_uuid INTO dealer FROM public.games WHERE id=session;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 BEGIN PERFORM public.admin_blast_fake_money_game(session);RAISE EXCEPTION 'missing authorization';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 BEGIN PERFORM public.admin_blast_fake_money_game(session);RAISE EXCEPTION 'interrupted_blast';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'interrupted_blast' THEN RAISE;END IF;END;
 PERFORM pg_temp.eleven_assert(EXISTS(SELECT 1 FROM public.games WHERE id=session) AND (SELECT count(*)=2 FROM private.multiplayer_score_results WHERE session_id=session),'interrupted Blast atomic rollback');
 PERFORM public.admin_blast_fake_money_game(session);
 PERFORM pg_temp.eleven_assert(public.admin_blast_fake_money_game(session)->>'outcome'='already-deleted' AND NOT EXISTS(SELECT 1 FROM private.eleven_up_matches WHERE game_id=session) AND NOT EXISTS(SELECT 1 FROM private.multiplayer_score_results WHERE session_id=session) AND EXISTS(SELECT 1 FROM public.games WHERE id=all_games[2]),'Blast exact graph and retry');
 -- Run21's existing admitted graph must also survive interruption and delete on retry.
 session:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(session,'configuring',false,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT people[x],session,users[x],3-x,100,false FROM generate_series(1,2)x;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
 v:=public.run21_configure_local(session,people[1],2,'run21','{"ante_amount":5}',deadline);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 BEGIN PERFORM public.admin_blast_fake_money_game(session);RAISE EXCEPTION 'interrupted_run21';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'interrupted_run21' THEN RAISE;END IF;END;
 PERFORM pg_temp.eleven_assert(EXISTS(SELECT 1 FROM private.run21_matches WHERE game_id=session),'Run21 interrupted Blast restores match');
 PERFORM public.admin_blast_fake_money_game(session);
 PERFORM pg_temp.eleven_assert(public.admin_blast_fake_money_game(session)->>'outcome'='already-deleted' AND NOT EXISTS(SELECT 1 FROM private.run21_matches WHERE game_id=session),'Run21 Blast and retry');
 -- TriTowers actual configured graph has the same canonical Blast ownership.
 session:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(session,'game_selection',false,2,deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT people[x],session,users[x],3-x,100,false FROM generate_series(1,2)x;
 PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);v:=public.tri_towers_configure(session,people[1],2,'tri-towers','{"ante_amount":5}',deadline);
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);PERFORM public.admin_blast_fake_money_game(session);
 PERFORM pg_temp.eleven_assert(public.admin_blast_fake_money_game(session)->>'outcome'='already-deleted' AND NOT EXISTS(SELECT 1 FROM private.tri_towers_matches WHERE game_id=session),'TriTowers Blast and retry');
 PERFORM pg_temp.eleven_assert(NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.contype='f' AND t.relnamespace='private'::regnamespace AND t.relname LIKE 'run21_%' AND c.confrelid IN('public.games'::regclass,'public.dealer_games'::regclass,'public.rounds'::regclass,'private.run21_matches'::regclass) AND c.confdeltype<>'c'),'Run21 Blast cascade regression');
END $$;
SELECT 'manual completion, score facts, postgame and Blast rollback proof passed' AS proof;
