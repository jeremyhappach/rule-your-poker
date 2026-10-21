-- Included only by the rollback-contained hosted proof builder. No COMMIT.
CREATE FUNCTION pg_temp.b31_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'battle31_proof: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.b31_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'battle31_proof_after_chips';END $$;
DO $cases$
DECLARE users uuid[]:=__USERS__; game uuid; dealer uuid; players uuid[]; deadline timestamptz;
 money boolean; outcome text; i int; v jsonb; m private.battle31_matches; p0 uuid; p1 uuid; u0 uuid;u1 uuid;
 req uuid; rev bigint; action text; items integer[]; failed boolean; old_state jsonb; receipt jsonb;
BEGIN
 PERFORM pg_temp.b31_assert(EXISTS(SELECT 1 FROM private.game_recovery_dispatch_state WHERE singleton AND last_outcome='completed' AND last_completed_at>clock_timestamp()-interval '30 seconds'),'actual canonical scheduler health');
 PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE enabled OR admission_enabled OR fake_qualified OR real_qualified),'installed admission closed');
 FOR i IN 1..3 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'B31 hosted proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
 FOREACH outcome IN ARRAY ARRAY['winner','tie','abort'] LOOP
  game:=gen_random_uuid();players:=ARRAY[gen_random_uuid(),gen_random_uuid()];deadline:=clock_timestamp()+interval '10 minutes';
  INSERT INTO public.games(id,current_host,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,users[1],'game_selection',money,2,deadline,0,false,false);
  FOR i IN 1..2 LOOP INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(players[i],game,users[i],3-i,100,false);END LOOP;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
  UPDATE private.battle31_release SET enabled=true,admission_enabled=true,fake_qualified=money,real_qualified=NOT money;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.b31_assert(NOT (public.battle31_capabilities(game)->>'enabled')::boolean,'wrong mode capability closed');
  failed:=false;BEGIN PERFORM public.battle31_configure(game,players[1],2,'battle-31','{"ante_amount":5}',deadline);EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='battle31:admission_closed';END;
  PERFORM pg_temp.b31_assert(failed,'wrong money mode refused');EXECUTE 'RESET ROLE';
  UPDATE private.battle31_release SET fake_qualified=NOT money,real_qualified=money;
  EXECUTE 'SET LOCAL ROLE authenticated';
  failed:=false;BEGIN PERFORM public.battle31_configure(game,players[1],2,'battle-31','{"ante_amount":0}',deadline);EXCEPTION WHEN OTHERS THEN failed:=true;END;
  PERFORM pg_temp.b31_assert(failed,'invalid stake rejected');
  v:=public.battle31_configure(game,players[1],2,'battle-31','{"ante_amount":5}',deadline);dealer:=(v#>>'{dealer_game,id}')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM private.battle31_matches WHERE dealer_game_id=dealer),'no start before consent');
  PERFORM set_config('request.jwt.claim.sub',users[2]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.submit_ante_decision(game,dealer,players[2],'ante_up');EXECUTE 'RESET ROLE';
  UPDATE private.battle31_release SET admission_enabled=false;
  PERFORM public.advance_ante_phase(game,dealer);
  SELECT * INTO STRICT m FROM private.battle31_matches WHERE dealer_game_id=dealer;
  p0:=(m.state#>>'{players,0,id}')::uuid;p1:=(m.state#>>'{players,1,id}')::uuid;u0:=(m.state#>>'{players,0,userId}')::uuid;u1:=(m.state#>>'{players,1,userId}')::uuid;
  UPDATE private.battle31_release SET fake_qualified=false,real_qualified=false;
  UPDATE private.battle31_matches SET state=state||jsonb_build_object('phase','playing','deadline',floor(extract(epoch FROM clock_timestamp()+interval '10 minutes')*1000)::bigint,'stage',12,'turn',8,'turnIndex',0,'closing',false,'losses',CASE WHEN outcome='winner' THEN '[0,3]'::jsonb ELSE '[2,2]'::jsonb END,'hands',CASE WHEN outcome='winner' THEN '[[7,4,0],[8,17,26]]'::jsonb ELSE '[[0,8,16],[1,9,17]]'::jsonb END,'center','[5,12,21]'::jsonb) WHERE dealer_game_id=dealer RETURNING * INTO m;
  rev:=m.revision;old_state:=m.state;req:=gen_random_uuid();action:=CASE WHEN outcome='winner' THEN 'swap' ELSE 'pass' END;items:=CASE WHEN outcome='winner' THEN ARRAY[0,5] ELSE NULL END;
  PERFORM set_config('request.jwt.claim.sub',u0::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u0,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';v:=public.battle31_snapshot(dealer);
  PERFORM pg_temp.b31_assert(v#>'{hands,1}'='[null,null,null]'::jsonb AND v#>'{values,1}'='null'::jsonb AND NOT v?'deck','private projection');
  failed:=false;BEGIN PERFORM state FROM private.battle31_matches WHERE dealer_game_id=dealer;EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'raw state denied');
  failed:=false;BEGIN PERFORM public.battle31_action(dealer,gen_random_uuid(),rev,'swap',ARRAY[0,31]);EXCEPTION WHEN OTHERS THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'invalid cards denied');
  EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',u1::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
  failed:=false;BEGIN PERFORM public.battle31_action(dealer,gen_random_uuid(),rev,'pass');EXCEPTION WHEN OTHERS THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'wrong actor denied');
  EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',users[3]::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',users[3],'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
  failed:=false;BEGIN PERFORM public.battle31_snapshot(dealer);EXCEPTION WHEN OTHERS THEN failed:=true;END;PERFORM pg_temp.b31_assert(failed,'nonmember denied');
  EXECUTE 'RESET ROLE';PERFORM set_config('request.jwt.claim.sub',u0::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u0,'role','authenticated')::text,true);
  IF outcome='winner' THEN
   CREATE TRIGGER b31_hosted_failure AFTER INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION pg_temp.b31_failure();
   EXECUTE 'SET LOCAL ROLE authenticated';failed:=false;
   BEGIN PERFORM public.battle31_action(dealer,req,rev,action,items);SET CONSTRAINTS ALL IMMEDIATE;EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='battle31_proof_after_chips';END;
   EXECUTE 'RESET ROLE';PERFORM pg_temp.b31_assert(failed,'after-chip injection reached');
   PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=game AND chips<>100),'injected transaction rolled back');
   PERFORM pg_temp.b31_assert((SELECT state=old_state FROM private.battle31_matches WHERE dealer_game_id=dealer),'injected state rolled back');
   DROP TRIGGER b31_hosted_failure ON public.gameplay_transfer_batches;
  END IF;
  IF outcome='abort' THEN PERFORM private.battle31_abort(dealer);
  ELSE EXECUTE 'SET LOCAL ROLE authenticated';receipt:=public.battle31_action(dealer,req,rev,action,items);v:=public.battle31_action(dealer,req,rev,action,items);PERFORM pg_temp.b31_assert(v->'revision'=receipt->'revision','duplicate keeps authoritative revision');EXECUTE 'RESET ROLE';END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM pg_temp.b31_assert(NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=game AND chips<>CASE WHEN outcome='winner' THEN CASE WHEN id=p0 THEN 105 ELSE 95 END ELSE 100 END),'canonical chip deltas');
  PERFORM pg_temp.b31_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'one immutable result');
  PERFORM pg_temp.b31_assert((SELECT count(*)=2 FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=dealer),'final snapshots match chips');
  PERFORM pg_temp.b31_assert((SELECT count(*)=CASE WHEN outcome='winner' THEN 1 ELSE 0 END FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer),'transfer batch count');
  IF outcome='winner' THEN PERFORM pg_temp.b31_assert((SELECT unmatched_deltas='{}'::jsonb AND (transfers->0->>'amount')::numeric=5 AND transfers#>>'{0,to,playerId}'=p0::text AND transfers#>>'{0,from,playerId}'=p1::text FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer),'balanced canonical transfer');END IF;
  SET CONSTRAINTS ALL DEFERRED;
  UPDATE private.battle31_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=dealer;
  IF outcome='tie' THEN UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp() WHERE id=game;END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.battle31_close(dealer);PERFORM public.battle31_close(dealer);
  IF outcome<>'abort' THEN PERFORM public.battle31_action(dealer,req,rev,action,items);END IF;EXECUTE 'RESET ROLE';
  PERFORM pg_temp.b31_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'late replay and continuation stay settled once');
 END LOOP;END LOOP;
END $cases$;
