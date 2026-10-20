-- Run after proof.sql, inside the same rollback transaction.
DO $$
DECLARE b jsonb;v jsonb;w jsonb;old_b jsonb;rules jsonb;version_i text;
 actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();players uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];
 game uuid:=gen_random_uuid();dealer uuid;run jsonb;r jsonb;req uuid;revision_i bigint;scope_i text;
 before_b jsonb;after_b jsonb;at_i bigint;setup_deadline timestamptz:=clock_timestamp()+interval '10 minutes';
BEGIN
 -- Both historical and new configurations retain exactly the same clocks/penalty.
 FOREACH version_i IN ARRAY ARRAY['take-two/1','take-two/2'] LOOP
  rules:=private.take_two_rules(version_i);
  b:=private.take_two_board_deal(jsonb_build_object('rules',rules,'score',1000,'stage',1),1000);
  b:=private.take_two_board_reduce(b,'tick',NULL,3500);
  b:=b||jsonb_build_object('slots',jsonb_set(jsonb_set(b->'slots','{26}','0'),'{27}','13'));
  v:=private.take_two_board_reduce(b,'draw',NULL,10000);
  PERFORM pg_temp.take_assert(v->>'score'='900' AND v->'deadline'=b->'deadline' AND v->'startedAt'=b->'startedAt','draw penalty and round clock preserved '||version_i);
  PERFORM pg_temp.take_assert(private.take_two_meter(v,10000)=CASE WHEN version_i='take-two/2' THEN 500 ELSE 50 END,'accepted draw meter '||version_i);
  w:=private.take_two_board_reduce(v,'pair',ARRAY[26,27],10500);
  PERFORM pg_temp.take_assert(w->>'score'=CASE WHEN version_i='take-two/2' THEN '2600' ELSE '2150' END,'draw then same-value score '||version_i);
  IF version_i='take-two/2' THEN
   PERFORM pg_temp.take_assert(private.take_two_meter(v,11000)=500 AND private.take_two_meter(v,12000)=350 AND private.take_two_meter(v,14000)=50,'reset hold/decay/floor');
  END IF;
  old_b:=v||'{"cursor":52}'::jsonb;
  BEGIN PERFORM private.take_two_board_reduce(old_b,'draw',NULL,11000);RAISE EXCEPTION 'empty accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'take_two:stock_empty' THEN RAISE;END IF;END;
  PERFORM pg_temp.take_assert(old_b->'meterAt'=v->'meterAt','rejected draw anchor unchanged');
  PERFORM private.take_two_board_deal(b||'{"stage":2}'::jsonb,200000);
 END LOOP;
 BEGIN PERFORM private.take_two_board_deal(jsonb_build_object('rules',private.take_two_rules()||'{"version":"take-two/99"}'::jsonb),0);RAISE EXCEPTION 'unknown accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'take_two:rules' THEN RAISE;END IF;END;
 INSERT INTO auth.users(id) VALUES(actor),(other);
 INSERT INTO public.profiles(id,username,is_active) VALUES(actor,'Draw proof',true),(other,'Draw opponent',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 run:=public.arcade_start(actor,gen_random_uuid(),'take-two');
 PERFORM pg_temp.take_assert(run->>'ruleset'='take-two/2','new Arcade admission v2');
 r:=public.arcade_take_two_step(actor,(run->>'id')::uuid);
 at_i:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board}',(state->'board')||jsonb_build_object('phase','playing','deadline',at_i+90000,'meterAt',at_i-10000,'score',1000)),score=1000,due_at=at_i+90000 WHERE id=(run->>'id')::uuid;
 SELECT state->'board',revision,state->>'roundId' INTO before_b,revision_i,scope_i FROM private.arcade_runs WHERE id=(run->>'id')::uuid;
 req:=gen_random_uuid();r:=public.arcade_take_two_step(actor,(run->>'id')::uuid,revision_i,scope_i,req,'draw');
 SELECT state->'board' INTO after_b FROM private.arcade_runs WHERE id=(run->>'id')::uuid;
 PERFORM pg_temp.take_assert(r->>'outcome'='committed' AND after_b->>'score'='900' AND (after_b->>'meterAt')::bigint>=at_i AND after_b->'deadline'=before_b->'deadline' AND r#>'{projection,view,meterAt}'=after_b->'meterAt','Arcade authoritative draw + projected anchor');
 r:=public.arcade_take_two_step(actor,(run->>'id')::uuid,revision_i,scope_i,req,'draw');
 PERFORM pg_temp.take_assert(r->>'outcome'='duplicate' AND r#>'{projection,view,meterAt}'=after_b->'meterAt','Arcade duplicate does not reset');
 r:=public.arcade_take_two_step(actor,(run->>'id')::uuid,revision_i,scope_i,gen_random_uuid(),'draw');
 PERFORM pg_temp.take_assert(r->>'outcome'='stale' AND (SELECT state->'board'=after_b FROM private.arcade_runs WHERE id=(run->>'id')::uuid),'Arcade stale draw no writes');
 BEGIN PERFORM public.arcade_take_two_step(actor,(run->>'id')::uuid,revision_i,scope_i,req,'take_score');RAISE EXCEPTION 'conflict accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:request_conflict' THEN RAISE;END IF;END;
 INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES(game,'game_selection',false,2,setup_deadline,0,false,false);
 INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES(players[1],game,actor,2,100,false),(players[2],game,other,1,100,false);
 r:=public.take_two_configure(game,players[1],2,'take-two','{"ante_amount":5}',setup_deadline);dealer:=(r#>>'{dealer_game,id}')::uuid;
 PERFORM pg_temp.take_accept(game,dealer);
 SELECT state INTO before_b FROM private.take_two_matches WHERE dealer_game_id=dealer;
 PERFORM pg_temp.take_assert(before_b#>>'{rules,version}'='take-two/2','new multiplayer admission v2');
 PERFORM set_config('request.jwt.claim.sub',before_b#>>'{players,0,userId}',true);
 UPDATE private.take_two_matches SET state=state||jsonb_build_object('phase','playing','deadline',at_i+90000,'meterAt',at_i-10000,'score',1000) WHERE dealer_game_id=dealer;
 SELECT revision INTO revision_i FROM private.take_two_matches WHERE dealer_game_id=dealer;
 req:=gen_random_uuid();r:=public.take_two_action(dealer,req,revision_i,'draw');
 SELECT state INTO after_b FROM private.take_two_matches WHERE dealer_game_id=dealer;
 PERFORM pg_temp.take_assert(after_b->>'score'='900' AND (after_b->>'meterAt')::bigint>=at_i AND after_b->>'deadline'=(at_i+90000)::text AND r->'meterAt'=after_b->'meterAt','multiplayer draw + projected anchor');
 r:=public.take_two_action(dealer,req,revision_i,'draw');
 PERFORM pg_temp.take_assert(r->'meterAt'=after_b->'meterAt' AND (SELECT state=after_b FROM private.take_two_matches WHERE dealer_game_id=dealer),'multiplayer duplicate no writes');
 BEGIN PERFORM public.take_two_action(dealer,gen_random_uuid(),revision_i,'draw');RAISE EXCEPTION 'stale accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'take_two:stale_revision' THEN RAISE;END IF;END;
 PERFORM pg_temp.take_assert((SELECT state=after_b FROM private.take_two_matches WHERE dealer_game_id=dealer),'multiplayer stale no reset');
 -- Shared records already partition by exact Take 2 version; no new grouping override.
 PERFORM pg_temp.take_assert(private.arcade_score_group('take-two','take-two/1')<>private.arcade_score_group('take-two','take-two/2'),'score groups remain separate');
 r:=public.arcade_leaderboard(actor,'take-two','all',NULL,'take-two/2');
 PERFORM pg_temp.take_assert(r->>'currentRuleset'='take-two/2' AND r->'compatibleRulesets'='["take-two/2"]'::jsonb AND r->'availableRulesets' @> '["take-two/1","take-two/2"]'::jsonb,'current and selectable Legacy boards');
 r:=public.arcade_leaderboard(actor,'take-two','all',NULL,'take-two/1');
 PERFORM pg_temp.take_assert(r->'compatibleRulesets'='["take-two/1"]'::jsonb,'Legacy board remains independent');
END $$;
SELECT 'Take 2 v2 draw/reset/scoring/retries/versions passed' AS proof;
