-- Run with the complete Royal financial/core/acceptance proofs inside a rollback.
DO $$
DECLARE b jsonb;legacy jsonb;done jsonb;i integer;at_ms bigint;
BEGIN
 PERFORM pg_temp.royal_assert(private.royal_flash_rules_v3()-ARRAY['version','allowTakeScore']=private.royal_flash_rules_v2()-'version','only manual score legality changes');
 PERFORM pg_temp.royal_assert(private.arcade_score_group('royal-flash','royal-flash/3')=private.arcade_score_group('royal-flash','royal-flash/1'),'existing score group preserved');
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules_v3(),'score',1234),0);
 FOR i IN 0..23 LOOP b:=private.royal_flash_board_reduce(b,'place',ARRAY[i],3000+i);END LOOP;
 FOREACH at_ms IN ARRAY ARRAY[4000::bigint,(b->>'deadline')::bigint] LOOP
  BEGIN PERFORM private.royal_flash_board_reduce(b,'take_score',NULL,at_ms);RAISE EXCEPTION 'manual score accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'royal_flash:invalid_action' THEN RAISE;END IF;END;
 END LOOP;
 done:=private.royal_flash_board_reduce(b,'place',ARRAY[24],4000);
 PERFORM pg_temp.royal_assert(done#>>'{result,reason}'='full_grid' AND done#>>'{result,timeBonus}'='37250' AND done#>>'{result,presentationMs}'='21000','automatic full-grid score, bonus and presentation unchanged');
 legacy:=jsonb_set(b,'{rules}',private.royal_flash_rules_v2());
 done:=private.royal_flash_board_reduce(legacy,'take_score',NULL,4000);
 PERFORM pg_temp.royal_assert(done#>>'{result,reason}'='take_score','admitted v2 rules remain frozen');
 done:=private.royal_flash_board_reduce(b,'tick',NULL,(b->>'deadline')::bigint);
 PERFORM pg_temp.royal_assert(done#>>'{result,reason}'='timeout' AND done#>>'{result,timeBonus}'='0' AND (done->>'score')::bigint=1234+(b->>'handPoints')::bigint,'timeout automatically scores partial board unchanged');
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules_v3(),'score',1234),0);
 FOR i IN 0..51 LOOP b:=private.royal_flash_board_reduce(b,'place',ARRAY[i%24],3000+i);END LOOP;
 PERFORM pg_temp.royal_assert(b#>>'{result,reason}'='exhausted' AND b#>>'{result,timeBonus}'='0' AND (b->>'score')::bigint=1234+(b->>'handPoints')::bigint,'exhaustion automatically scores partial board unchanged');
END $$;
DO $$
DECLARE u uuid:=gen_random_uuid();run jsonb;v jsonb;after_v jsonb;req uuid:=gen_random_uuid();before_records bigint;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Royal no manual '||u,true) ON CONFLICT(id) DO NOTHING;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 run:=public.arcade_start(u,gen_random_uuid(),'royal-flash');v:=public.arcade_royal_step(u,(run->>'id')::uuid);
 PERFORM pg_temp.royal_assert(run->>'ruleset'='royal-flash/3','new Arcade admission freezes v3');
 UPDATE private.arcade_runs SET state=jsonb_set(jsonb_set(state,'{board,phase}','"ready"'),'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+20000)) WHERE id=(run->>'id')::uuid;
 v:=public.arcade_royal_step(u,(run->>'id')::uuid);
 v:=public.arcade_royal_step(u,(run->>'id')::uuid,(v#>>'{projection,revision}')::bigint,v#>>'{projection,view,roundId}',gen_random_uuid(),'place',ARRAY[0]);
 SELECT count(*) INTO before_records FROM private.arcade_command_receipts WHERE user_id=u;
 BEGIN PERFORM public.arcade_royal_step(u,(run->>'id')::uuid,(v#>>'{projection,revision}')::bigint,v#>>'{projection,view,roundId}',req,'take_score');RAISE EXCEPTION 'manual Arcade score accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'royal_flash:invalid_action' THEN RAISE;END IF;END;
 after_v:=public.arcade_royal_step(u,(run->>'id')::uuid);
 PERFORM pg_temp.royal_assert(after_v->'record'=v->'record' AND before_records=(SELECT count(*) FROM private.arcade_command_receipts WHERE user_id=u),'manual score rejection has no Arcade state or receipt writes');
 after_v:=public.arcade_royal_step(u,(run->>'id')::uuid,(v#>>'{projection,revision}')::bigint,v#>>'{projection,view,roundId}',gen_random_uuid(),'abandon');
 PERFORM pg_temp.royal_assert(after_v#>>'{record,status}'='abandoned' AND NOT EXISTS(SELECT 1 FROM private.arcade_results WHERE run_id=(run->>'id')::uuid),'explicit abandonment remains unranked');
END $$;
SELECT 'PASS: no manual scoring in either mode; automatic full-grid/timeout/exhaustion, abandonment and frozen records preserved' proof;
