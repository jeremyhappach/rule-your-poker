-- Hosted rollback proof, only after separately authorized installation and real worker health.
-- No fabricated health, scheduler writes, captured dispatcher, or worker lease manipulation.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT private.canasta_assert_recovery_health();
-- Caller wraps candidate and proof in a single transaction and always rolls back.
CREATE FUNCTION pg_temp.canasta_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Canasta proof: %',label;END IF;END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];proof_players uuid[];game uuid;dealer uuid;round_id uuid;
 state_i jsonb;next_i jsonb;seats_i jsonb;cmd jsonb;reply jsonb;money_i integer;req uuid;at_ms bigint;counts_i jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR money_i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[money_i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[money_i],'Canasta proof '||money_i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 -- This is a transaction-local authority proof. Admission stays false throughout.
 UPDATE private.canasta_release SET enabled=true;
 FOR money_i IN 0..1 LOOP
  game:=gen_random_uuid();proof_players:=ARRAY[gen_random_uuid(),gen_random_uuid()];round_id:=gen_random_uuid();
  INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,pending_session_end)
   VALUES(game,'game_selection',money_i=1,1,0,false,money_i=1);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,ante_decision)
   SELECT proof_players[i],game,users[i],i,100,false,'ante_up' FROM generate_series(1,2) i;
  INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config)
   VALUES(game,users[1],'canasta','{"ante_amount":10,"ruleset":"canasta-classic-two/1"}') RETURNING id INTO dealer;
  UPDATE public.games SET current_game_uuid=dealer,game_type='canasta',status='in_progress',ante_amount=10 WHERE id=game;
  INSERT INTO public.rounds(id,game_id,dealer_game_id,hand_number,round_number,cards_dealt,status,pot)
   VALUES(round_id,game,dealer,1,1,0,'betting',0);
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
  SELECT jsonb_agg(jsonb_build_object('id',proof_players[i],'userId',users[i],'kind','human','seat',i)) INTO seats_i FROM generate_series(1,2) i;
  state_i:=jsonb_build_object('version','canasta-classic-two/1','id',dealer,'sessionId',game,'stake',10,'realMoney',money_i=1,
   'seats',seats_i,'revision',1,'updatedAt',at_ms,'automatic','[]'::jsonb,'pause',NULL,'pauseEpisode',0,'completed','[]'::jsonb,'winner',NULL,
   'totals',jsonb_build_object(proof_players[1]::text,0,proof_players[2]::text,0),
   'hand',jsonb_build_object('id',round_id,'number',1,'turn',1,'generation',1,'active',proof_players[1],'phase','meld','deadline',at_ms+120000));
  INSERT INTO private.canasta_matches(dealer_game_id,game_id,first_round_id,state,revision,stake,seats) VALUES(dealer,game,round_id,state_i,1,10,seats_i);
  PERFORM pg_temp.canasta_assert(NOT has_function_privilege('authenticated','public.canasta_server_commit(uuid,bigint,jsonb,jsonb)','EXECUTE'),'client cannot submit authority state');
  BEGIN PERFORM public.canasta_configure(game,proof_players[1],1,'canasta','{"ante_amount":10}',clock_timestamp());
   RAISE EXCEPTION 'missing closed admission';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN ('canasta:release_closed','canasta:dealer_required','canasta:admission_closed','canasta:fake_money_only') THEN RAISE;END IF;END;
  BEGIN PERFORM public.canasta_server_load(dealer,gen_random_uuid());RAISE EXCEPTION 'missing authorization rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  req:=gen_random_uuid();cmd:=jsonb_build_object('requestId',req,'matchId',dealer,'handId',round_id,'turn',1,'generation',1,'revision',1,'playerId',proof_players[1],'action',jsonb_build_object('type','finish','groups','[]'::jsonb,'discard',NULL));
  UPDATE private.canasta_matches SET state=jsonb_set(state,'{hand,deadline}','0') WHERE dealer_game_id=dealer;
  BEGIN PERFORM public.canasta_server_commit(dealer,1,state_i||'{"revision":2}'::jsonb,jsonb_build_object('kind','command','command',cmd,'userId',users[1]));
   RAISE EXCEPTION 'missing deadline guard';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:deadline' THEN RAISE;END IF;END;
  PERFORM public.set_game_paused(game,true,dealer,(SELECT pause_version FROM public.games WHERE id=game));
  PERFORM pg_temp.canasta_assert((SELECT (state#>>'{pause,expired}')::boolean FROM private.canasta_matches WHERE dealer_game_id=dealer),'canonical pause records expired episode');
  PERFORM public.set_game_paused(game,false,dealer,(SELECT pause_version FROM public.games WHERE id=game));
  PERFORM pg_temp.canasta_assert((SELECT state->'pause'='null'::jsonb AND (state#>>'{hand,generation}')::integer=2
   AND (state#>>'{hand,deadline}')::bigint>floor(extract(epoch FROM clock_timestamp())*1000)+119000 FROM private.canasta_matches WHERE dealer_game_id=dealer),'canonical resume re-arms once');
  UPDATE private.canasta_matches SET state=state_i,revision=1 WHERE dealer_game_id=dealer;
  next_i:=state_i||jsonb_build_object('revision',2,'totals',jsonb_build_object(proof_players[1]::text,5100,proof_players[2]::text,5100),
   'completed',jsonb_build_array(jsonb_build_object('id',round_id,'number',1,'scores',jsonb_build_object(proof_players[1]::text,5100,proof_players[2]::text,5100))),
   'hand',(state_i->'hand')||'{"phase":"complete"}'::jsonb);
  reply:=public.canasta_server_commit(dealer,1,next_i,jsonb_build_object('kind','command','command',cmd,'userId',users[1]));
  PERFORM pg_temp.canasta_assert(reply->'settlement'='null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE dealer_game_id=dealer),'qualifying tie has no financial write');
  PERFORM pg_temp.canasta_assert((public.canasta_server_commit(dealer,1,next_i,jsonb_build_object('kind','command','command',cmd,'userId',users[1]))#>>'{state,revision}')::integer=2,'duplicate replay');
  state_i:=reply->'state';
  -- Exact successor identity and same fixed stake; signed score -100 in second hand.
  next_i:=state_i||jsonb_build_object('revision',3,'totals',jsonb_build_object(proof_players[1]::text,5200,proof_players[2]::text,5000),
   'winner',proof_players[1],'completed',(state_i->'completed')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'number',2,'scores',jsonb_build_object(proof_players[1]::text,100,proof_players[2]::text,-100))));
  reply:=public.canasta_server_commit(dealer,2,next_i,'{"kind":"recover"}');
  PERFORM pg_temp.canasta_assert((SELECT chips=110 FROM public.players WHERE id=proof_players[1]) AND (SELECT chips=90 FROM public.players WHERE id=proof_players[2]),'canonical +S/-S chips');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'one result');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer AND unmatched_deltas='{}'::jsonb),'balanced canonical ledger');
  PERFORM pg_temp.canasta_assert((SELECT count(*)=2 FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id AND p.chips=s.chips WHERE s.dealer_game_id=dealer),'atomic snapshots');
  PERFORM pg_temp.canasta_assert((SELECT status=CASE WHEN money_i=1 THEN 'session_ended' ELSE 'game_over' END FROM public.games WHERE id=game),'terminal disposition');
  PERFORM public.canasta_server_commit(dealer,1,next_i,jsonb_build_object('kind','command','command',cmd,'userId',users[1]));
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'late retry cannot repay');
  BEGIN PERFORM public.canasta_server_commit(dealer,1,next_i,jsonb_build_object('kind','command','command',jsonb_set(cmd,'{turn}','2'),'userId',users[1]));
   RAISE EXCEPTION 'missing receipt conflict';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'canasta:receipt_conflict' THEN RAISE;END IF;END;
  PERFORM private.canasta_finish_postgame(dealer);
  PERFORM pg_temp.canasta_assert((SELECT NOT finished FROM private.canasta_matches WHERE dealer_game_id=dealer),'terminal hold retained');
  UPDATE private.canasta_matches SET settlement=jsonb_set(settlement,'{deadline}','0') WHERE dealer_game_id=dealer;
  PERFORM private.canasta_finish_postgame(dealer);PERFORM private.canasta_finish_postgame(dealer);
  PERFORM pg_temp.canasta_assert((SELECT finished AND revision=(state->>'revision')::bigint FROM private.canasta_matches WHERE dealer_game_id=dealer),'one postgame continuation');
  PERFORM public.canasta_server_commit(dealer,1,next_i,jsonb_build_object('kind','command','command',cmd,'userId',users[1]));
  PERFORM pg_temp.canasta_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'post-continuation retry cannot repay');
 END LOOP;
 PERFORM pg_temp.canasta_assert((SELECT NOT admission_enabled FROM private.canasta_release),'admission remains closed');
END $$;
SELECT 'canasta local financial rollback proof passed' AS proof;

-- Caller must wrap in rollback. These tests use only newly-created fixture identities.
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];ids uuid[];g uuid;d uuid;deadline timestamptz;
 money boolean;reply jsonb;before_i jsonb;after_i jsonb;i integer;
BEGIN
 UPDATE private.canasta_release SET enabled=true,admission_enabled=false;
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Canasta admission '||i,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOREACH money IN ARRAY ARRAY[false,true] LOOP
  ids:=ARRAY[gen_random_uuid(),gen_random_uuid()];g:=gen_random_uuid();deadline:=clock_timestamp()+interval '120 seconds';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.games(id,status,real_money,dealer_position,pot,is_paused,config_deadline) VALUES(g,'game_selection',money,1,0,false,deadline);
  INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,status,sitting_out,waiting)
   SELECT ids[j],g,users[j],j,100,false,'active',false,false FROM generate_series(1,2) j;
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',users[1])::text,true);
  PERFORM pg_temp.canasta_assert(public.canasta_capabilities(g)->>'enabled'='false','closed admission hides both modes');
  BEGIN
   PERFORM public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline);
   RAISE EXCEPTION 'missing admission rejection';
  EXCEPTION WHEN insufficient_privilege THEN
   PERFORM pg_temp.canasta_assert(SQLERRM=CASE WHEN money THEN 'canasta:fake_money_only' ELSE 'canasta:admission_closed' END,'closed setup rejects');
  END;
  UPDATE private.canasta_release SET admission_enabled=true;
  PERFORM pg_temp.canasta_assert((public.canasta_capabilities(g)->>'enabled')::boolean=NOT money,'discovery respects session money mode');
  SELECT jsonb_build_object('game',to_jsonb(t),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p WHERE game_id=g)) INTO before_i FROM public.games t WHERE id=g;
  IF money THEN
   -- Direct configure and Run Back both use this RPC; config cannot override session mode.
   EXECUTE 'SET LOCAL ROLE authenticated';
   BEGIN
    PERFORM public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10,"real_money":false}',deadline);
    RAISE EXCEPTION 'missing fake-only rejection';
   EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','real-money authenticated RPC rejected');
   END;
   EXECUTE 'SET LOCAL ROLE postgres';
   SELECT jsonb_build_object('game',to_jsonb(t),'players',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.players p WHERE game_id=g)) INTO after_i FROM public.games t WHERE id=g;
   PERFORM pg_temp.canasta_assert(before_i=after_i AND NOT EXISTS(SELECT 1 FROM public.dealer_games WHERE session_id=g)
    AND NOT EXISTS(SELECT 1 FROM private.dealer_game_setup_commits WHERE game_id=g)
    AND NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE game_id=g),'rejection has no setup or financial writes');
   -- Independently defend the internal consent boundary even with a constructed setup.
   PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
   INSERT INTO public.dealer_games(session_id,dealer_user_id,game_type,config) VALUES(g,users[1],'canasta',jsonb_build_object('ante_amount',10,'rules',private.canasta_rules())) RETURNING id INTO d;
   UPDATE public.games SET current_game_uuid=d,game_type='canasta',status='ante_decision' WHERE id=g;
   BEGIN PERFORM private.canasta_begin(g,d);RAISE EXCEPTION 'missing begin money guard';
   EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','consent completion rejects real money');END;
   PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=d)
    AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE dealer_game_id=d),'no real-money hand admitted');
  ELSE
   EXECUTE 'SET LOCAL ROLE authenticated';
   reply:=public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline);
   EXECUTE 'SET LOCAL ROLE postgres';
   d:=(reply#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.canasta_assert(reply->>'outcome'='configured','fake-money configure accepted');
   -- A mode change after genuine setup cannot admit a real-money match.
   UPDATE public.games SET real_money=true WHERE id=g;
   BEGIN PERFORM private.canasta_begin(g,d);RAISE EXCEPTION 'missing changed-mode rejection';
   EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.canasta_assert(SQLERRM='canasta:fake_money_only','mode changed between setup and consent');END;
   PERFORM pg_temp.canasta_assert(NOT EXISTS(SELECT 1 FROM private.canasta_matches WHERE dealer_game_id=d),'changed mode creates no match');
   UPDATE public.games SET real_money=false WHERE id=g;
   UPDATE private.canasta_release SET admission_enabled=false;
   PERFORM pg_temp.canasta_assert(public.canasta_configure(g,ids[1],1,'canasta','{"ante_amount":10}',deadline)->>'outcome'='already_configured','closing admission preserves committed setup retry');
  END IF;
  UPDATE private.canasta_release SET admission_enabled=false;
 END LOOP;
 PERFORM pg_temp.canasta_assert(NOT has_function_privilege('authenticated','private.canasta_begin(uuid,uuid)','EXECUTE'),'browser cannot bypass consent boundary');
 UPDATE private.canasta_release SET enabled=false,admission_enabled=false;
END $$;
SELECT 'canasta fake-only admission proof passed' AS proof;

ROLLBACK;
