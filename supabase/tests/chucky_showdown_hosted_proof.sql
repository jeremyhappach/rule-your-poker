-- Run only while Chucky admission is closed. The inner subtransaction retires all candidate DDL and fixtures.
BEGIN;
SET LOCAL lock_timeout='250ms';
SET LOCAL statement_timeout='18s';
CREATE OR REPLACE FUNCTION pg_temp.cs_expect(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'chucky_proof:%',label; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.cs_cards(spec text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('rank',left(c,-1),'suit',right(c,1)) ORDER BY n)
 FROM unnest(string_to_array(spec,' ')) WITH ORDINALITY a(c,n)
$$;
CREATE OR REPLACE FUNCTION pg_temp.cs_edge(actor uuid,run_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{due}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint-1))
 WHERE id=run_id AND user_id=actor AND game='chucky-showdown';
 IF NOT FOUND THEN RAISE EXCEPTION 'chucky_proof:fixture missing'; END IF;
 RETURN public.arcade_chucky_showdown_step(actor,run_id)->'projection';
END $$;

DO $proof$
DECLARE actor uuid:=gen_random_uuid(); peer uuid:=gen_random_uuid(); who uuid; run_id uuid; request_id uuid:=gen_random_uuid();
  press_id uuid:=gen_random_uuid(); opening jsonb; v jsonb; reply jsonb; run jsonb; state_i jsonb; draw jsonb;
  cards jsonb; private_cards jsonb; h int; n int; verified text; period text; board jsonb;
BEGIN
 BEGIN
  -- CANDIDATE_DDL
  PERFORM pg_temp.cs_expect(NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled),'admission closed');
  PERFORM pg_temp.cs_expect(EXISTS(SELECT FROM private.arcade_rulesets WHERE game='crib-lab' AND enabled),'Crib Lab still open');
  PERFORM pg_temp.cs_expect(NOT has_function_privilege('authenticated','public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','execute')
    AND NOT has_function_privilege('anon','public.arcade_chucky_showdown_history(uuid,uuid)','execute')
    AND has_function_privilege('service_role','public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','execute'),'service-only step');
  FOR n IN 1..7 LOOP
    SELECT coalesce(jsonb_agg(card ORDER BY ord),'[]') INTO cards FROM jsonb_array_elements(pg_temp.cs_cards('8♥ J♦ 6♣ Q♥ 9♥ 7♥')) WITH ORDINALITY a(card,ord) WHERE ord<n;
    PERFORM pg_temp.cs_expect(public.holm_best_hand_value(pg_temp.cs_cards('A♠ 2♠ 3♠ 4♠')||cards||pg_temp.cs_cards('5♠'))=ARRAY[8,5],'best five at level '||n);
  END LOOP;
  FOREACH who IN ARRAY ARRAY[actor,peer] LOOP
    INSERT INTO auth.users(id,raw_app_meta_data) VALUES(who,'{"chucky_showdown_rollback":true}');
    UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=who;
    UPDATE public.profiles SET is_active=true WHERE id=who;
  END LOOP;
  BEGIN PERFORM public.arcade_start(actor,request_id,'chucky-showdown'); RAISE EXCEPTION 'closed start accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:unavailable' THEN RAISE; END IF; END;
  UPDATE private.arcade_rulesets SET enabled=true WHERE id='chucky-showdown/1' AND game='chucky-showdown';
  run:=public.arcade_start(actor,request_id,'chucky-showdown'); run_id:=(run->>'id')::uuid;
  PERFORM pg_temp.cs_expect(public.arcade_start(actor,request_id,'chucky-showdown')->>'id'=run_id::text,'start replay');
  BEGIN PERFORM public.arcade_chucky_showdown_step(peer,run_id); RAISE EXCEPTION 'foreign owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:not_found' THEN RAISE; END IF; END;
  BEGIN PERFORM public.arcade_chucky_showdown_step(NULL,run_id); RAISE EXCEPTION 'missing worker token accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:recovery_denied' THEN RAISE; END IF; END;
  CREATE TEMP TABLE cs_writes ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables
    WHERE schemaname IN ('public','private') AND relname NOT IN ('arcade_runs','arcade_results','arcade_revisions','arcade_command_receipts');
  v:=public.arcade_chucky_showdown_step(actor,run_id)->'projection';
  PERFORM pg_temp.cs_expect(v->>'phase'='deal' AND v->'chucky'='[]' AND jsonb_array_length(v->'player')=4,'opening redaction');
  opening:=pg_temp.cs_edge(actor,run_id);
  PERFORM pg_temp.cs_expect(opening->>'phase'='decision' AND (opening->>'due')::bigint-(opening->>'since')::bigint=30000,'decision clock');
  reply:=public.arcade_chucky_showdown_step(actor,run_id,(opening->>'revision')::bigint,opening->>'roundId',press_id,'press',7);
  PERFORM pg_temp.cs_expect(reply->>'outcome'='committed' AND reply#>'{projection,chucky}'='[]','private press');
  SELECT state INTO STRICT state_i FROM private.arcade_runs WHERE id=run_id AND user_id=actor;
  draw:=state_i->'chucky';
  PERFORM pg_temp.cs_expect(jsonb_array_length(draw)=7 AND (SELECT count(DISTINCT c) FROM jsonb_array_elements(draw||(state_i->'player')||(state_i->'community')) c)=15,'secure draw uniqueness');
  reply:=public.arcade_chucky_showdown_step(actor,run_id,(opening->>'revision')::bigint,opening->>'roundId',press_id,'press',7);
  PERFORM pg_temp.cs_expect(reply->>'outcome'='duplicate','press replay');
  FOR n IN 1..7 LOOP
    v:=pg_temp.cs_edge(actor,run_id);
    PERFORM pg_temp.cs_expect(jsonb_array_length(v->'chucky')=n AND v->'chucky'->(n-1)=draw->(n-1),'authorized reveal prefix');
  END LOOP;
  private_cards:=pg_temp.cs_cards('A♠ K♠ Q♠ J♠');
  UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',private_cards,'community',pg_temp.cs_cards('10♠ 2♥ 3♦ 4♣'),
    'chucky',pg_temp.cs_cards('8♦ 8♥ 7♣ 7♥ 6♣ 6♥ 5♠')) WHERE id=run_id AND user_id=actor;
  v:=pg_temp.cs_edge(actor,run_id);
  PERFORM pg_temp.cs_expect(v->>'phase'='win' AND v->>'risk'='700' AND v->'levels'='[7]','level seven win');
  v:=pg_temp.cs_edge(actor,run_id);
  PERFORM pg_temp.cs_expect(v->>'phase'='deal' AND v->'player'=private_cards AND v->'chucky'='[]','new board keeps hand');
  v:=pg_temp.cs_edge(actor,run_id);
  BEGIN PERFORM public.arcade_chucky_showdown_step(actor,run_id,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'press',7); RAISE EXCEPTION 'level reused';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:illegal_action' THEN RAISE; END IF; END;
  v:=public.arcade_chucky_showdown_step(actor,run_id,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'bank')->'projection';
  PERFORM pg_temp.cs_expect(v->>'bank'='700' AND v->>'risk'='0','bank transfer');
  v:=pg_temp.cs_edge(actor,run_id); PERFORM pg_temp.cs_expect(v->>'hand'='2' AND v->'levels'='[]','new hand resets levels');
  v:=pg_temp.cs_edge(actor,run_id);
  v:=public.arcade_chucky_showdown_step(actor,run_id,(v->>'revision')::bigint,v->>'roundId',gen_random_uuid(),'press',1)->'projection';
  UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',pg_temp.cs_cards('10♠ 2♥ 3♦ 5♣'),'community',pg_temp.cs_cards('A♠ K♥ Q♦ J♣'),
    'chucky',pg_temp.cs_cards('10♥')) WHERE id=run_id AND user_id=actor;
  v:=pg_temp.cs_edge(actor,run_id); v:=pg_temp.cs_edge(actor,run_id);
  PERFORM pg_temp.cs_expect(v->>'reason'='cracked' AND v->>'bank'='700','tie favors Chucky');
  FOR h IN 3..9 LOOP
    v:=pg_temp.cs_edge(actor,run_id); v:=pg_temp.cs_edge(actor,run_id);
    PERFORM pg_temp.cs_expect((v->>'hand')::int=h AND v->>'phase'='decision','nine hand structure');
    IF h=3 THEN UPDATE private.arcade_runs SET state=state||'{"risk":100,"levels":[1]}' WHERE id=run_id AND user_id=actor; END IF;
    v:=pg_temp.cs_edge(actor,run_id);
    PERFORM pg_temp.cs_expect(v->>'reason'='timeout','timeout banks');
  END LOOP;
  PERFORM pg_temp.cs_expect(v->>'status'='completed' AND v->>'score'='800','cumulative terminal');
  reply:=public.arcade_chucky_showdown_step(actor,run_id,(opening->>'revision')::bigint,opening->>'roundId',press_id,'press',7);
  PERFORM pg_temp.cs_expect(reply->>'outcome'='duplicate' AND reply#>>'{projection,score}'='800','late replay');
  PERFORM pg_temp.cs_expect((SELECT count(*) FROM private.arcade_results r WHERE r.user_id=actor AND r.run_id=(run->>'id')::uuid)=1,'single result');
  PERFORM pg_temp.cs_expect(public.arcade_chucky_showdown_history(actor)#>>'{0,score}'='800' AND public.arcade_chucky_showdown_history(peer)='[]','owner history');
  FOREACH period IN ARRAY ARRAY['30','all'] LOOP
    board:=public.arcade_leaderboard(actor,'chucky-showdown',period,run_id,'chucky-showdown/1');
    PERFORM pg_temp.cs_expect(board#>>'{rows,0,score}'='800' AND (board#>>'{rows,0,completedAt}')::timestamptz IS NOT NULL,'timestamped leaderboard');
  END LOOP;
  PERFORM pg_temp.cs_expect(NOT EXISTS(SELECT FROM pg_stat_xact_user_tables t JOIN pg_temp.cs_writes w USING(relid)
    WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>w.n),'no non-Arcade writes');
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO verified
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='private' AND (left(p.proname,15)='chucky_showdown_' OR p.proname IN ('secure_shuffle_key')))
    OR (n.nspname='public' AND p.proname IN ('holm_best_hand_value','holm_five_card_value','holm_deterministic_chucky_cards','arcade_chucky_showdown_step','arcade_chucky_showdown_history','arcade_start','arcade_commit','arcade_leaderboard'));
  RAISE EXCEPTION USING ERRCODE='ZCS01',MESSAGE='retire verified fixtures';
 EXCEPTION WHEN SQLSTATE 'ZCS01' THEN NULL;
 END;
 PERFORM pg_temp.cs_expect(verified IS NOT NULL,'proof finished');
 PERFORM set_config('app.chucky_showdown_proof_digest',verified,false);
END $proof$;
COMMIT;
SELECT current_setting('app.chucky_showdown_proof_digest') AS verified_digest,
 to_regprocedure('public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)') IS NOT NULL AS installed,
 (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'chucky_showdown_rollback'='true') AS fixture_users,
 (SELECT count(*) FROM private.arcade_runs WHERE game='chucky-showdown') AS runs,
 (SELECT count(*) FROM private.arcade_rulesets WHERE game='chucky-showdown' AND enabled) AS enabled;
