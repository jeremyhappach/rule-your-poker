DO $$
DECLARE b jsonb;before_final jsonb;done jsonb;legacy jsonb;i integer;old_records jsonb;
BEGIN
 PERFORM pg_temp.royal_assert(private.royal_flash_rules_v2()-ARRAY['version','autoFinishFullGrid']=private.royal_flash_rules()-'version','only legal full-grid completion changes');
 PERFORM pg_temp.royal_assert(private.arcade_score_group('royal-flash','royal-flash/1')=private.arcade_score_group('royal-flash','royal-flash/2'),'one existing leaderboard');
 PERFORM pg_temp.royal_assert(private.arcade_score_group('tri-towers','tri-towers/5')='tri-towers/2' AND private.arcade_score_group('run21','run21/3')='run21/2','other compatibility unchanged');
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules_v2(),'score',1234),0);
 FOR i IN 0..23 LOOP b:=private.royal_flash_board_reduce(b,'place',ARRAY[i],3000+i);END LOOP;
 PERFORM pg_temp.royal_assert(b->>'phase'='playing','24 occupied cells remain active');before_final:=b;
 done:=private.royal_flash_board_reduce(b,'place',ARRAY[24],4000);
 PERFORM pg_temp.royal_assert(done->>'phase'='stage_complete' AND done#>>'{result,reason}'='full_grid' AND done->>'placements'='25','25th occupied cell ends active play atomically');
 PERFORM pg_temp.royal_assert(done#>>'{result,timeBonus}'='37250' AND (done->>'score')::bigint=1234+(done->>'handPoints')::bigint+37250,'unchanged full-grid bonus and cumulative points');
 PERFORM pg_temp.royal_assert(done->>'deadline'='25000' AND done#>>'{result,presentationMs}'='21000' AND done#>>'{result,presentationVersion}'='2','single slower presentation deadline');
 BEGIN PERFORM private.royal_flash_board_reduce(done,'place',ARRAY[0],4001);RAISE EXCEPTION 'further placement allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'royal_flash:phase' THEN RAISE;END IF;END;
 done:=private.royal_flash_board_reduce(before_final,'place',ARRAY[24],(before_final->>'deadline')::bigint);
 PERFORM pg_temp.royal_assert(done#>>'{result,reason}'='timeout' AND done->>'placements'='24' AND done#>>'{result,timeBonus}'='0','timeout wins exact final-placement boundary');
 done:=private.royal_flash_board_reduce(before_final,'take_score',NULL,4000);
 PERFORM pg_temp.royal_assert(done#>>'{result,reason}'='take_score' AND done#>>'{result,timeBonus}'='0','incomplete Take Score preserved');
 -- Historical/in-progress v1 legality stays frozen.
 legacy:=jsonb_set(before_final,'{rules}',private.royal_flash_rules());
 done:=private.royal_flash_board_reduce(legacy,'place',ARRAY[24],4000);
 PERFORM pg_temp.royal_assert(done->>'phase'='playing','v1 full grid remains playable');
 -- Replacing occupied cells does not count as filling a new cell, and exhaustion remains legal.
 b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules_v2(),'score',0),0);
 FOR i IN 0..51 LOOP b:=private.royal_flash_board_reduce(b,'place',ARRAY[0],3000+i);END LOOP;
 PERFORM pg_temp.royal_assert(b#>>'{result,reason}'='exhausted' AND b->>'placements'='52' AND b#>>'{result,timeBonus}'='0','replacement and 52-card partial exhaustion preserved');
END $$;
DO $$
DECLARE u uuid:=gen_random_uuid();oldrun jsonb;newrun jsonb;oldresult jsonb;board jsonb;current_board jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);INSERT INTO public.profiles(id,username,is_active) VALUES(u,'Royal legacy proof '||u,true) ON CONFLICT(id) DO NOTHING;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='royal-flash/2';
 oldrun:=public.arcade_start(u,gen_random_uuid(),'royal-flash');PERFORM public.arcade_royal_step(u,(oldrun->>'id')::uuid);
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE id=(oldrun->>'id')::uuid;
 PERFORM public.arcade_royal_step(u,(oldrun->>'id')::uuid);
 SELECT to_jsonb(r) INTO oldresult FROM private.arcade_results r WHERE run_id=(oldrun->>'id')::uuid;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='royal-flash/2';
 newrun:=public.arcade_start(u,gen_random_uuid(),'royal-flash');PERFORM public.arcade_royal_step(u,(newrun->>'id')::uuid);
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000000)) WHERE id=(newrun->>'id')::uuid;
 PERFORM public.arcade_royal_step(u,(newrun->>'id')::uuid);
 current_board:=public.arcade_leaderboard(u,'royal-flash','all',NULL,NULL);
 PERFORM pg_temp.royal_assert(oldresult=(SELECT to_jsonb(r) FROM private.arcade_results r WHERE run_id=(oldrun->>'id')::uuid),'existing v1 immutable record preserved');
 PERFORM pg_temp.royal_assert(newrun->>'ruleset'='royal-flash/2' AND current_board->>'personalBest'='0','v2 admission and shared v1/v2 personal best');
 PERFORM pg_temp.royal_assert((SELECT record->>'priorBest'='0' FROM private.arcade_results WHERE run_id=(newrun->>'id')::uuid),'new result compares against existing v1 best');
END $$;
SELECT 'full-grid v2 PASS: automatic completion, timeout precedence, partial Take Score, legacy v1 and shared leaderboard' proof;
