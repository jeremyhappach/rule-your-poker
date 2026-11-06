-- Hosted Crib Lab qualification. All candidate DDL and fixtures roll back in the inner subtransaction.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='18s';
-- Run only via the transaction-contained hosted runner. All writable fixtures are generated here.
CREATE FUNCTION pg_temp.lab_expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'crib_lab_proof:%',label; END IF; END $$;

CREATE FUNCTION pg_temp.lab_action(actor uuid,v jsonb,action text,items integer[] DEFAULT '{}',req uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE reply jsonb;
BEGIN
  reply:=public.arcade_crib_lab_step(actor,(v->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',req,action,items);
  PERFORM pg_temp.lab_expect(reply->>'outcome'='committed',action||' committed');
  RETURN reply->'projection';
END $$;

DO $test$
#variable_conflict use_variable
DECLARE verified_digest text; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); who uuid; id uuid; req uuid:=gen_random_uuid(); oldreq uuid:=gen_random_uuid();
  token_i uuid:=gen_random_uuid(); run jsonb; other_run jsonb; initial jsonb; v jsonb; old jsonb; s jsonb; opening jsonb; expired jsonb; res jsonb;
  fixture record; i int; j int; h int; at_ms bigint; base_i int; scores int[]:='{}'; ranks int[]; tied_ids uuid[]:='{}'; board jsonb;
BEGIN
 BEGIN
  -- CANDIDATE_DDL (the release runner inserts the reviewed migration here for the pre-install proof).
  PERFORM pg_temp.lab_expect(NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='crib-lab' AND enabled),'closed on entry');
  PERFORM pg_temp.lab_expect(NOT has_function_privilege('authenticated','public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','EXECUTE')
    AND NOT has_function_privilege('anon','public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','EXECUTE')
    AND has_function_privilege('service_role','public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)','EXECUTE'),'service-only RPC');
  FOR fixture IN SELECT * FROM (VALUES
    ('50 51 52 J3 53','total',29),('30 31 42 53 K0','runs',6),('30 31 32 43 50','runs',9),('30 31 40 41 52','runs',12),
    ('20 40 60 80 Q1','flush',4),('20 40 60 80 Q0','flush',5),('20 40 60 81 Q0','flush',0),
    ('J1 20 43 62 K1','nobs',1),('J1 20 43 62 K0','nobs',0),('A0 21 32 43 50','runs',5)
  ) t(spec,category,points) LOOP
    SELECT jsonb_agg(jsonb_build_object('rank',left(card,1),'suit',(ARRAY['clubs','diamonds','hearts','spades'])[right(card,1)::int+1],
      'value',least(10,strpos('A23456789TJQK',left(card,1)))) ORDER BY n) INTO s FROM unnest(string_to_array(fixture.spec,' ')) WITH ORDINALITY AS x(card,n);
    PERFORM pg_temp.lab_expect((private.cribbage_hand_score(s-4,s->4,false)->>fixture.category)::int=fixture.points,fixture.spec);
  END LOOP;
  FOR fixture IN SELECT * FROM (VALUES (250000,300),(240000,300),(120000,200),(1,100),(0,100),(-1,100)) t(ms,m) LOOP
    PERFORM pg_temp.lab_expect(private.crib_lab_multiplier_v1(fixture.ms,240000)=fixture.m,'time multiplier');
  END LOOP;
  FOREACH who IN ARRAY ARRAY[a,b] LOOP
    INSERT INTO auth.users(id,raw_app_meta_data) VALUES(who,'{"crib_lab_rollback_proof":true}');
    UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=who;
    UPDATE public.profiles SET is_active=true WHERE profiles.id=who;
  END LOOP;
  BEGIN PERFORM public.arcade_start(a,req,'crib-lab'); RAISE EXCEPTION 'closed start accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:unavailable' THEN RAISE; END IF; END;
  UPDATE private.arcade_rulesets SET enabled=true WHERE game='crib-lab' AND arcade_rulesets.id='crib-lab/1';
  run:=public.arcade_start(a,req,'crib-lab');id:=(run->>'id')::uuid;
  PERFORM pg_temp.lab_expect(public.arcade_start(a,req,'crib-lab')->>'id'=id::text,'duplicate start');
  UPDATE public.game_defaults SET crib_lab_round_seconds=300 WHERE game_type='crib-lab';
  other_run:=public.arcade_start(b,gen_random_uuid(),'crib-lab');
  PERFORM pg_temp.lab_expect(public.arcade_start(a,gen_random_uuid(),'crib-lab')#>>'{config,durationMs}'='240000' AND other_run#>>'{config,durationMs}'='300000','frozen configurations');
  BEGIN PERFORM public.arcade_crib_lab_step(b,id);RAISE EXCEPTION 'cross-owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:not_found' THEN RAISE; END IF; END;
  BEGIN PERFORM public.arcade_crib_lab_step(NULL,id);RAISE EXCEPTION 'worker replay accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:recovery_denied' THEN RAISE; END IF; END;
  CREATE TEMP TABLE lab_writes ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del AS n FROM pg_stat_xact_user_tables
    WHERE schemaname IN ('public','private') AND relname NOT IN ('arcade_runs','arcade_results','arcade_revisions','arcade_command_receipts','arcade_recovery_state');
  initial:=public.arcade_crib_lab_step(a,id)->'projection';v:=initial;
  SELECT state INTO STRICT opening FROM private.arcade_runs WHERE arcade_runs.id=id AND user_id=a;
  PERFORM pg_temp.lab_expect(v->>'phase'='discard' AND v->>'offer' IS NULL AND v->>'cut' IS NULL AND NOT (v ? 'stock'),'private opening');
  PERFORM pg_temp.lab_expect((SELECT count(DISTINCT card) FROM (
    SELECT c card FROM jsonb_array_elements(opening->'hands') h1 CROSS JOIN LATERAL jsonb_array_elements(h1) c
    UNION ALL SELECT value FROM jsonb_array_elements(opening->'stock') UNION ALL SELECT opening->'cut')deck)=36
    AND (SELECT count(DISTINCT c) FROM jsonb_array_elements(private.cribbage_new_deck()) c)=52,'unique deck');
  expired:=private.crib_lab_advance_v1(opening,(opening->>'deadline')::bigint);
  FOR h IN 0..4 LOOP PERFORM pg_temp.lab_expect(expired->'hands'->h=(opening->'hands'->h)-5-4,'untouched discard fallback'); END LOOP;
  v:=pg_temp.lab_action(a,v,'select',ARRAY[0,0],oldreq);
  res:=public.arcade_crib_lab_step(a,id,(initial->>'revision')::bigint,initial->>'roundId',oldreq,'select',ARRAY[0,0]);
  PERFORM pg_temp.lab_expect(res->>'outcome'='duplicate' AND res#>>'{projection,revision}'=v->>'revision','duplicate action');
  BEGIN PERFORM public.arcade_crib_lab_step(a,id,(initial->>'revision')::bigint,initial->>'roundId',oldreq,'select',ARRAY[0,1]);RAISE EXCEPTION 'conflicting replay accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:request_conflict' THEN RAISE; END IF; END;
  SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=id;
  expired:=private.crib_lab_advance_v1(s,(s->>'deadline')::bigint);
  PERFORM pg_temp.lab_expect(expired#>'{hands,0}'=(opening#>'{hands,0}')-5-0 AND expired#>>'{results,0,multiplier}'='100','partial timeout');
  v:=pg_temp.lab_action(a,v,'select',ARRAY[0,0]);
  FOR j IN 1..2 LOOP
    FOR h IN 0..4 LOOP v:=pg_temp.lab_action(a,v,'select',ARRAY[h,4]);v:=pg_temp.lab_action(a,v,'select',ARRAY[h,5]); END LOOP;
    v:=pg_temp.lab_action(a,v,'lock');SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=id;
    expired:=private.crib_lab_advance_v1(s,(s->>'deadline')::bigint);
    PERFORM pg_temp.lab_expect(expired->'hands'=s->'hands' AND expired->>'stockIndex'='5','stock timeout');
    FOR i IN 0..4 LOOP
      PERFORM pg_temp.lab_expect((v->>'stockLeft')::int=5-i AND v->'offer'=s->'stock'->i AND v->>'cut' IS NULL,'private stock');
      IF j=1 AND i<2 THEN old:=v;v:=pg_temp.lab_action(a,v,'replace',ARRAY[0,0]);PERFORM pg_temp.lab_expect(v#>'{hands,0,0}'=old->'offer','replacement');
      ELSE v:=pg_temp.lab_action(a,v,'pass'); END IF;
    END LOOP;
    PERFORM pg_temp.lab_expect(v->>'phase'='cut' AND v->'cut'=s->'cut' AND v->>'offer' IS NULL,'reveal');
    UPDATE private.arcade_runs SET state=jsonb_set(state,'{phaseUntil}','0') WHERE arcade_runs.id=id AND user_id=a RETURNING state INTO s;
    PERFORM pg_temp.lab_expect(private.crib_lab_advance_v1(s,(s->>'deadline')::bigint)#>>'{results,-1,multiplier}'='100','cut timeout');
    v:=public.arcade_crib_lab_step(a,id)->'projection';
    IF j=1 THEN
      BEGIN PERFORM pg_temp.lab_action(a,v,'swap',ARRAY[0,0,0,1]);RAISE EXCEPTION 'same-hand swap accepted';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:illegal_action' THEN RAISE; END IF; END;
      FOR i IN 1..3 LOOP old:=v;v:=pg_temp.lab_action(a,v,'swap',ARRAY[0,0,1,0]);
        PERFORM pg_temp.lab_expect((v->>'swapsLeft')::int=3-i AND v#>'{hands,0,0}'=old#>'{hands,1,0}' AND v#>'{hands,1,0}'=old#>'{hands,0,0}','confirmed exchange'); END LOOP;
      BEGIN PERFORM pg_temp.lab_action(a,v,'swap',ARRAY[0,0,1,0]);RAISE EXCEPTION 'fourth swap accepted';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:illegal_action' THEN RAISE; END IF; END;
    ELSE
      SELECT state INTO s FROM private.arcade_runs WHERE arcade_runs.id=id;
      PERFORM pg_temp.lab_expect(private.crib_lab_advance_v1(s,(s->>'deadline')::bigint)->'hands'=s->'hands','swap timeout');
      old:=v;v:=pg_temp.lab_action(a,v,'stand');PERFORM pg_temp.lab_expect(v->'hands'=old->'hands','stand');
    END IF;
    PERFORM pg_temp.lab_expect(v->>'phase'='scoring' AND (v#>>'{result,award}')::int=(v#>>'{result,base}')::int*(v#>>'{result,multiplier}')::int,'atomic award');
    UPDATE private.arcade_runs SET state=jsonb_set(state,'{phaseUntil}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint)) WHERE arcade_runs.id=id AND user_id=a;
    v:=public.arcade_crib_lab_step(a,id)->'projection';
    PERFORM pg_temp.lab_expect((v->>'round')::int=j+1 AND v->>'phase'='discard','round continuation');
  END LOOP;
  UPDATE private.arcade_runs SET state=jsonb_set(state,'{deadline}','0') WHERE arcade_runs.id=id AND user_id=a;
  res:=public.arcade_crib_lab_step(a,id,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'select',ARRAY[0,0]);
  PERFORM pg_temp.lab_expect(res->>'outcome'='stale' AND res#>>'{projection,status}'='completed' AND res#>>'{projection,result,multiplier}'='100','expiry versus action');
  PERFORM pg_temp.lab_expect(public.arcade_crib_lab_step(a,id,(initial->>'revision')::bigint,initial->>'roundId',oldreq,'select',ARRAY[0,0])->>'outcome'='duplicate','late replay');
  PERFORM pg_temp.lab_expect((SELECT count(*)=1 AND bool_and(jsonb_array_length(final_state->'results')=3) FROM private.arcade_results WHERE run_id=id),'single record, three rounds');
  FOREACH s IN ARRAY ARRAY['"30"'::jsonb,'"all"'::jsonb] LOOP
    board:=public.arcade_leaderboard(a,'crib-lab',s#>>'{}',id,run->>'ruleset');
    PERFORM pg_temp.lab_expect(board#>>'{rows,0,score}'=res#>>'{projection,score}' AND board#>>'{rows,0,completedAt}' IS NOT NULL,'rank and timestamp');
  END LOOP;
  -- Lease only in this transaction. Do not change real health or dispatch another game's run.
  UPDATE private.arcade_recovery_state SET claimed=true,token=token_i,expires_at=clock_timestamp()+interval '10 seconds' WHERE singleton;
  id:=(other_run->>'id')::uuid; PERFORM public.arcade_crib_lab_step(b,id);
  UPDATE private.arcade_runs SET state=jsonb_set(state,'{deadline}','0') WHERE arcade_runs.id=id AND user_id=b;
  v:=public.arcade_crib_lab_step(NULL,id,p_token=>token_i)->'projection';
  PERFORM pg_temp.lab_expect(v->>'status'='completed' AND v->>'round'='3' AND public.arcade_crib_lab_step(NULL,id,p_token=>token_i)#>>'{projection,revision}'=v->>'revision','cold worker');
  FOREACH who IN ARRAY ARRAY[a,b] LOOP
    run:=public.arcade_start(who,gen_random_uuid(),'crib-lab');id:=(run->>'id')::uuid;tied_ids:=array_append(tied_ids,id);
    v:=public.arcade_crib_lab_step(who,id)->'projection';
    FOR j IN 1..3 LOOP
      UPDATE private.arcade_runs SET state=state||jsonb_build_object('hands',opening->'hands','cut',opening->'cut','deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)
        WHERE arcade_runs.id=id AND user_id=who;
      v:=public.arcade_crib_lab_step(who,id)->'projection';
      IF j<3 THEN
        UPDATE private.arcade_runs SET state=jsonb_set(state,'{phaseUntil}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint))
          WHERE arcade_runs.id=id AND user_id=who;
        v:=public.arcade_crib_lab_step(who,id)->'projection';
      END IF;
      EXIT WHEN v->>'status'='completed';
    END LOOP;
    scores:=array_append(scores,(v->>'score')::int);
  END LOOP;
  PERFORM pg_temp.lab_expect(scores[1]=scores[2],'controlled tie');
  board:=public.arcade_leaderboard(a,'crib-lab','all',NULL,other_run->>'ruleset');
  SELECT array_agg((e->>'rank')::int) INTO ranks FROM jsonb_array_elements(board->'rows') e WHERE (e->>'runId')::uuid=ANY(tied_ids);
  PERFORM pg_temp.lab_expect(cardinality(ranks)=2 AND ranks[1]=ranks[2],'shared tie rank');
  PERFORM pg_temp.lab_expect(NOT EXISTS(SELECT FROM pg_stat_xact_user_tables t JOIN pg_temp.lab_writes w USING(relid)
    WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>w.n),'non-Arcade writes');
  SET CONSTRAINTS ALL IMMEDIATE;
  verified_digest:=(SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='private' AND (left(p.proname,9)='crib_lab_' OR p.proname IN ('cribbage_new_deck','cribbage_hand_score','cribbage_rank_value','cribbage_card_value','secure_shuffle_key')))
    OR (n.nspname='public' AND p.proname IN ('arcade_crib_lab_step','arcade_start','arcade_commit','arcade_leaderboard')));
  RAISE EXCEPTION USING ERRCODE='ZCL01', MESSAGE='retire verified fixtures';
 EXCEPTION WHEN SQLSTATE 'ZCL01' THEN NULL;
 END;
 PERFORM pg_temp.lab_expect(verified_digest IS NOT NULL,'verification completed');
 PERFORM set_config('app.crib_lab_proof_digest',verified_digest,false);
END $test$;
COMMIT;
SELECT current_setting('app.crib_lab_proof_digest') AS verified_digest,
  to_regprocedure('public.arcade_crib_lab_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)') IS NOT NULL AS installed,
  (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'crib_lab_rollback_proof'='true') AS fixture_users,
  (SELECT count(*) FROM private.arcade_runs WHERE game='crib-lab') AS runs,
  (SELECT count(*) FROM private.arcade_rulesets WHERE game='crib-lab' AND enabled) AS enabled;
