-- Synthetic local/installed rollback fixture. Never run without BEGIN/ROLLBACK.
CREATE FUNCTION pg_temp.race_accept(game uuid,dealer uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p record;actor text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=game AND status='active' AND NOT sitting_out AND NOT is_bot AND ante_decision IS NULL LOOP
  PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(game,dealer,p.id,'ante_up');
 END LOOP;
 PERFORM public.advance_ante_phase(game,dealer);PERFORM set_config('request.jwt.claim.sub',actor,true);
END $$;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];people uuid[];game uuid;dealer uuid;offer timestamptz;
 v jsonb;s jsonb;receipt_i jsonb;req uuid;actor uuid;other uuid;revision_i bigint;money_i integer;case_i integer;i integer;previous bigint;counts jsonb;
BEGIN
 UPDATE private.race_poker_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=true;
 UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';
 FOR i IN 1..2 LOOP
  INSERT INTO auth.users(id) VALUES(users[i]);
  INSERT INTO public.profiles(id,username,is_active) VALUES(users[i],'Race proof '||users[i],true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 END LOOP;
 FOR money_i IN 0..1 LOOP
  FOR case_i IN 1..2 LOOP
   game:=gen_random_uuid();people:=ARRAY[gen_random_uuid(),gen_random_uuid()];offer:=clock_timestamp()+interval '10 minutes';
   INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,'game_selection',money_i=1,2,offer,0,false,false);
   INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) SELECT people[ordinal],game,users[ordinal],3-ordinal,100,false FROM generate_series(1,2)ordinal;
   PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
   v:=public.race_poker_configure(game,people[1],2,'race-poker','{"ante_amount":5}',offer);dealer:=(v#>>'{dealer_game,id}')::uuid;
   PERFORM pg_temp.race_assert(NOT EXISTS(SELECT 1 FROM private.race_poker_matches WHERE dealer_game_id=dealer),'no match before opponent consent');
   PERFORM pg_temp.race_assert((public.race_poker_configure(game,people[1],2,'race-poker','{"ante_amount":5}',offer)->>'deduped')::boolean,'setup duplicate');
   PERFORM pg_temp.race_accept(game,dealer);
   SELECT state,revision INTO s,revision_i FROM private.race_poker_matches WHERE dealer_game_id=dealer;
   actor:=(s->'players'->(s->>'turnIndex')::int->>'id')::uuid;other:=(s->'players'->(1-(s->>'turnIndex')::int)->>'id')::uuid;
   PERFORM set_config('request.jwt.claim.sub',(s->'players'->(s->>'turnIndex')::int->>'userId'),true);
   req:=gen_random_uuid();receipt_i:=public.race_poker_action(dealer,req,revision_i,'choose',ARRAY[0]);
   PERFORM pg_temp.race_assert(receipt_i=public.race_poker_action(dealer,req,revision_i,'choose',ARRAY[0]),'identical receipt retry');
   BEGIN PERFORM public.race_poker_action(dealer,req,revision_i,'choose',ARRAY[1]);RAISE EXCEPTION 'missing conflict';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:replay_conflict' THEN RAISE;END IF;END;
   BEGIN PERFORM public.race_poker_action(dealer,gen_random_uuid(),revision_i,'choose',ARRAY[0]);RAISE EXCEPTION 'missing stale';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:stale_revision' THEN RAISE;END IF;END;
   BEGIN UPDATE private.race_poker_matches SET stake=6 WHERE dealer_game_id=dealer;RAISE EXCEPTION 'missing frozen stake';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:configuration_frozen' THEN RAISE;END IF;END;
   BEGIN UPDATE private.race_poker_matches SET real_money=NOT real_money WHERE dealer_game_id=dealer;RAISE EXCEPTION 'missing frozen money mode';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:configuration_frozen' THEN RAISE;END IF;END;
   BEGIN UPDATE private.race_poker_matches SET state=jsonb_set(state,'{rules,version}','"tampered"') WHERE dealer_game_id=dealer;RAISE EXCEPTION 'missing frozen rules';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:configuration_frozen' THEN RAISE;END IF;END;
   BEGIN UPDATE private.race_poker_matches SET state=jsonb_set(state,'{players,0,name}','"tampered"') WHERE dealer_game_id=dealer;RAISE EXCEPTION 'missing frozen roster';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:configuration_frozen' THEN RAISE;END IF;END;
   BEGIN UPDATE public.dealer_games SET config='{"ante_amount":9}' WHERE id=dealer;RAISE EXCEPTION 'missing frozen offer';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%frozen%' THEN RAISE;END IF;END;
   PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
   BEGIN PERFORM public.race_poker_action(dealer,gen_random_uuid(),revision_i+1,'choose',ARRAY[0]);RAISE EXCEPTION 'missing unauthorized';
   EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   PERFORM set_config('request.jwt.claim.sub',(s->'players'->(s->>'turnIndex')::int->>'userId'),true);
   SELECT (state->>'deadline')::bigint INTO previous FROM private.race_poker_matches WHERE dealer_game_id=dealer;
   UPDATE public.games SET is_paused=true WHERE id=game;
   PERFORM pg_temp.race_assert((public.race_poker_snapshot(dealer)->>'paused')::boolean,'canonical pause visible');
   BEGIN PERFORM public.race_poker_action(dealer,gen_random_uuid(),revision_i+2,'choose',ARRAY[0]);RAISE EXCEPTION 'missing paused rejection';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'race_poker:inactive' THEN RAISE;END IF;END;
   UPDATE public.games SET is_paused=false WHERE id=game;
   PERFORM pg_temp.race_assert((SELECT (state->>'deadline')::bigint>=previous FROM private.race_poker_matches WHERE dealer_game_id=dealer),'resume preserves remaining clock');
   -- Final boundary fixture: legal fifth card determines actual final score.
   UPDATE private.race_poker_matches SET state=state||jsonb_build_object('stage',16,'handInRound',1,'hand','[0,13,4,20]'::jsonb,'choices','[34,35,36]'::jsonb,
    'phase','playing','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+30000,
    'scores',jsonb_build_object(actor::text,0,other::text,CASE WHEN case_i=2 THEN 4500 ELSE 0 END)),revision=revision+1 WHERE dealer_game_id=dealer;
   SELECT revision INTO revision_i FROM private.race_poker_matches WHERE dealer_game_id=dealer;
   v:=public.race_poker_action(dealer,gen_random_uuid(),revision_i,'choose',ARRAY[0]);
   PERFORM pg_temp.race_assert(v#>>'{frame,result,points}'='4500','terminal award from server classifier');
   PERFORM pg_temp.race_assert((SELECT settlement IS NULL FROM private.race_poker_matches WHERE dealer_game_id=dealer),'no settlement before final result interval');
   IF case_i=2 THEN UPDATE public.games SET pending_session_end=true WHERE id=game;END IF;
   UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=dealer;
   PERFORM private.race_poker_recover();PERFORM private.race_poker_recover();
   SET CONSTRAINTS ALL IMMEDIATE;
   PERFORM pg_temp.race_assert((SELECT chips=CASE WHEN case_i=1 THEN 105 ELSE 100 END FROM public.players WHERE id=actor),'winner canonical balance');
   PERFORM pg_temp.race_assert((SELECT chips=CASE WHEN case_i=1 THEN 95 ELSE 100 END FROM public.players WHERE id=other),'loser canonical balance');
   PERFORM pg_temp.race_assert((SELECT sum(chips)=200 FROM public.players WHERE game_id=game),'conservation');
   PERFORM pg_temp.race_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'one result');
   PERFORM pg_temp.race_assert((SELECT count(*)=2 FROM public.session_player_snapshots snap JOIN public.players p ON p.id=snap.player_id AND p.chips=snap.chips WHERE snap.dealer_game_id=dealer),'final snapshots match actual chips');
   IF case_i=1 THEN
    PERFORM pg_temp.race_assert((SELECT count(*)=1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer AND unmatched_deltas='{}'::jsonb AND jsonb_array_length(transfers)=1),'balanced canonical journal');
   ELSE PERFORM pg_temp.race_assert((SELECT status='session_ended' FROM public.games WHERE id=game),'terminal session closure');END IF;
   SET CONSTRAINTS ALL DEFERRED;
   PERFORM pg_temp.race_assert(public.race_poker_action(dealer,req,0,'choose',ARRAY[0])=receipt_i,'late replay returns original receipt');
   PERFORM public.race_poker_close(dealer);
   PERFORM pg_temp.race_assert((SELECT NOT finished FROM private.race_poker_matches WHERE dealer_game_id=dealer),'terminal presentation hold');
   UPDATE private.race_poker_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=dealer;
   PERFORM public.race_poker_close(dealer);PERFORM public.race_poker_close(dealer);
   PERFORM pg_temp.race_assert((SELECT finished FROM private.race_poker_matches WHERE dealer_game_id=dealer),'continuation / close dedupe');
   PERFORM pg_temp.race_assert(public.race_poker_action(dealer,req,0,'choose',ARRAY[0])=receipt_i,'late replay after continuation');
   PERFORM pg_temp.race_assert((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=dealer),'no repayment');
   PERFORM pg_temp.race_assert(NOT has_function_privilege('authenticated','private.race_poker_execute(uuid,uuid,bigint,uuid,text,integer[],text)','EXECUTE')
    AND NOT has_function_privilege('authenticated','private.race_poker_settle(uuid)','EXECUTE'),'private authority not browser-callable');
  END LOOP;
 END LOOP;
END $$;
SELECT 'Race Poker consent, receipts, pause, winner/draw, canonical chips and ledger PASS' proof;
