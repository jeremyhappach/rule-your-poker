-- Use on a v1-admitting database. The candidate DDL, clock fixtures and test results roll back together.
BEGIN;
SET LOCAL lock_timeout='350ms';
SET LOCAL statement_timeout='22s';
CREATE OR REPLACE FUNCTION pg_temp.cs_check(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'showdown_v2_proof:%',label; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.cs_cards(spec text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('rank',left(c,-1),'suit',right(c,1)) ORDER BY n)
 FROM unnest(string_to_array(spec,' ')) WITH ORDINALITY a(c,n)
$$;
CREATE OR REPLACE FUNCTION pg_temp.cs_edge(actor uuid,rid uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
 UPDATE private.arcade_runs SET state=jsonb_set(state,'{due}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1))
 WHERE id=rid AND user_id=actor AND game='chucky-showdown';
 IF NOT FOUND THEN RAISE EXCEPTION 'fixture missing'; END IF;
 RETURN public.arcade_chucky_showdown_step(actor,rid)->'projection';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.cs_act(actor uuid,v jsonb,op text,lvl int DEFAULT NULL,req uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 r:=public.arcade_chucky_showdown_step(actor,(v->>'id')::uuid,(v->>'revision')::bigint,v->>'roundId',req,op,lvl);
 PERFORM pg_temp.cs_check(r->>'outcome'='committed','accepted '||op);RETURN r->'projection';
END $$;
DO $proof$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); who uuid; rid uuid; legacy uuid; req uuid:=gen_random_uuid();
  v jsonb; opening jsonb; old jsonb; s jsonb; result jsonb; fixture record; board jsonb; player jsonb; five jsonb; rank_i int[];
  n int; h int; lvl int; before_i int; ordinal int:=0; digest_i text; mode text;
BEGIN
 BEGIN
  -- CANDIDATE_DDL
  UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled; UPDATE private.arcade_rulesets SET enabled=true WHERE id='chucky-showdown/1';
  PERFORM pg_temp.cs_check(EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND config->>'version'='chucky-showdown/1' AND enabled),'v1 open on entry');
  PERFORM pg_temp.cs_check(NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE game='chucky-showdown' AND config->>'version'='chucky-showdown/3' AND enabled),'v2 staged');
  PERFORM pg_temp.cs_check(NOT has_function_privilege('authenticated','public.arcade_chucky_showdown_step(uuid,uuid,bigint,text,uuid,text,integer,uuid)','execute')
    AND NOT has_function_privilege('anon','private.chucky_showdown_best_v2(jsonb)','execute'),'private authority');
  FOR fixture IN SELECT * FROM (VALUES
    ('A♠ K♠ Q♠ J♠ 10♠ 10♦','Straight Flush'),('A♠ A♥ A♦ A♣ K♠','Four of a Kind'),('3♠ 3♥ 3♦ 9♣ 9♦','Full House'),
    ('A♣ J♣ 9♣ 5♣ 2♣','Flush'),('A♣ 2♠ 3♥ 4♠ 5♦','Straight'),('8♦ 8♥ 8♠ K♣ J♦','Three of a Kind'),
    ('K♠ K♦ 8♠ 8♦ A♣','Two Pair'),('3♠ 3♥ 8♠ 4♦ A♣','One Pair'),('A♣ K♦ 9♣ 4♦ 2♥','High Card')) f(spec,name) LOOP
    SELECT hand_value,best_cards INTO rank_i,five FROM private.chucky_showdown_best_v2(pg_temp.cs_cards(fixture.spec));
    PERFORM pg_temp.cs_check(jsonb_array_length(five)=5 AND public.holm_hand_label(rank_i)=fixture.name AND public.holm_five_card_value(five)=rank_i,fixture.name);
  END LOOP;
  SELECT best_cards INTO five FROM private.chucky_showdown_best_v2(pg_temp.cs_cards('A♣ 2♠ 3♥ 4♠ 5♦ 5♣'));
  PERFORM pg_temp.cs_check(five=pg_temp.cs_cards('A♣ 2♠ 3♥ 4♠ 5♦'),'equal fives resolved by stable ordinal');
  FOREACH who IN ARRAY ARRAY[a,b] LOOP
    INSERT INTO auth.users(id,raw_app_meta_data) VALUES(who,'{"cs_v2_proof":true}');
    INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES(who,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true;
    INSERT INTO public.profiles(id,username,is_active) VALUES(who,'Chucky proof '||who::text,true) ON CONFLICT(id) DO UPDATE SET is_active=true;
  END LOOP;
  FOR n IN 1..7 LOOP
    PERFORM pg_temp.cs_check(private.chucky_showdown_bonus('{"version":"chucky-showdown/2"}',n)=100*n,'old bonus '||n);
    PERFORM pg_temp.cs_check(private.chucky_showdown_bonus((SELECT config FROM private.arcade_rulesets WHERE id='chucky-showdown/3'),n)=('[100,250,500,800,1250,2000,3000]'::jsonb->>(n-1))::int,'new bonus '||n);
  END LOOP;
  legacy:=(public.arcade_start(b,gen_random_uuid(),'chucky-showdown')->>'id')::uuid;
  v:=public.arcade_chucky_showdown_step(b,legacy)->'projection';
  PERFORM pg_temp.cs_check(jsonb_array_length(v->'community')=4 AND NOT(v?'uses'),'legacy projection');
  UPDATE private.arcade_rulesets SET enabled=false WHERE game='chucky-showdown' AND enabled;
  UPDATE private.arcade_rulesets SET enabled=true WHERE id='chucky-showdown/3';
  rid:=(public.arcade_start(a,req,'chucky-showdown')->>'id')::uuid;
  PERFORM pg_temp.cs_check(public.arcade_start(a,req,'chucky-showdown')->>'id'=rid::text,'idempotent start');
  UPDATE public.game_defaults SET chucky_max_folds=2,chucky_max_cracks=4,chucky_selection_seconds=10,decision_timer_seconds=12 WHERE game_type='chucky-showdown';
  PERFORM pg_temp.cs_check(EXISTS(SELECT FROM private.arcade_rulesets WHERE id='chucky-showdown/3-12000-10000-2-4' AND enabled),'four configured defaults');
  UPDATE private.arcade_runs SET state=jsonb_set(state,'{due}','0') WHERE id=legacy AND user_id=b;
  v:=public.arcade_chucky_showdown_step(b,legacy)->'projection';
  PERFORM pg_temp.cs_check(v->>'hand'='9' AND v->>'status'='completed' AND v->>'ruleset' LIKE 'chucky-showdown/1%','v1 completes under old rules');
  v:=public.arcade_start(b,gen_random_uuid(),'chucky-showdown');
  PERFORM pg_temp.cs_check(v->>'ruleset'='chucky-showdown/3-12000-10000-2-4','new custom run');
  BEGIN PERFORM public.arcade_chucky_showdown_step(b,rid);RAISE EXCEPTION 'unauthorized';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:not_found' THEN RAISE; END IF; END;
  BEGIN PERFORM public.arcade_chucky_showdown_step(NULL,rid);RAISE EXCEPTION 'worker token accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'arcade:recovery_denied' THEN RAISE; END IF; END;
  CREATE TEMP TABLE cs2_writes ON COMMIT DROP AS SELECT relid,n_tup_ins+n_tup_upd+n_tup_del n FROM pg_stat_xact_user_tables
    WHERE schemaname IN ('public','private') AND relname NOT IN ('arcade_runs','arcade_results','arcade_revisions','arcade_command_receipts');
  v:=public.arcade_chucky_showdown_step(a,rid)->'projection';
  PERFORM pg_temp.cs_check(v->'uses'='[2,2,2,2,2,2,2]' AND v->>'folds'='3' AND v->>'cracks'='3' AND jsonb_array_length(v->'community')=2 AND v->'chucky'='[]','fresh private projection');
  -- Round one exercises both automatic decisions, wins, and one physical five on a tie.
  FOR h IN 1..3 LOOP
    player:=v->'player';v:=pg_temp.cs_edge(a,rid);
    PERFORM pg_temp.cs_check((v->>'due')::bigint-(v->>'since')::bigint=30000 AND v->>'phase'='fold_stay','frozen Fold/Stay clock');
    opening:=v;IF h=1 THEN req:=gen_random_uuid(); END IF;
    v:=pg_temp.cs_act(a,v,'stay',NULL,CASE WHEN h=1 THEN req ELSE gen_random_uuid() END);
    PERFORM pg_temp.cs_check(jsonb_array_length(v->'community')=2,'Stay does not leak hidden board');
    v:=pg_temp.cs_edge(a,rid);PERFORM pg_temp.cs_check(jsonb_array_length(v->'community')=3,'third card only');
    v:=pg_temp.cs_edge(a,rid);board:=v->'community';PERFORM pg_temp.cs_check(jsonb_array_length(board)=4 AND v->>'phase'='board_reveal','fourth card before clock');
    v:=pg_temp.cs_edge(a,rid);PERFORM pg_temp.cs_check(v->>'phase'='choose' AND (v->>'due')::bigint-(v->>'since')::bigint=30000,'fresh selection clock');
    BEGIN PERFORM pg_temp.cs_act(a,v,'fold');RAISE EXCEPTION 'fold after Stay';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:illegal_action' THEN RAISE; END IF;END;
    IF h=1 THEN old:=opening;v:=pg_temp.cs_edge(a,rid);lvl:=1; ELSE lvl:=7;v:=pg_temp.cs_act(a,v,'press',lvl);END IF;
    PERFORM pg_temp.cs_check(v->>'phase'='showdown' AND (v->>'level')::int=lvl AND v->'chucky'='[]' AND v->'community'=board AND v->'best'='null','redacted commitment');
    SELECT state INTO s FROM private.arcade_runs WHERE id=rid;
    PERFORM pg_temp.cs_check((SELECT count(DISTINCT c) FROM jsonb_array_elements((s->'player')||(s->'community')||(s->'chucky')) c)=8+lvl,'disjoint draw');
    FOR n IN 1..lvl LOOP v:=pg_temp.cs_edge(a,rid);PERFORM pg_temp.cs_check(jsonb_array_length(v->'chucky')=n AND v->'community'=board AND v->'best'='null','reveal prefix'); END LOOP;
    IF h=2 THEN
      UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',pg_temp.cs_cards('10♠ 2♥ 3♦ 5♣'),'community',pg_temp.cs_cards('A♠ K♥ Q♦ J♣'),'chucky',pg_temp.cs_cards('10♥ 2♦ 3♣ 5♦ 6♣ 7♦ 8♥')) WHERE id=rid AND user_id=a;
    ELSE
      UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',pg_temp.cs_cards('A♠ K♠ Q♠ J♠'),'community',pg_temp.cs_cards('10♠ 2♥ 3♦ 4♣'),
        'chucky',(SELECT jsonb_agg(c ORDER BY i) FROM jsonb_array_elements(pg_temp.cs_cards('8♦ 8♥ 7♣ 7♥ 6♣ 6♥ 5♠')) WITH ORDINALITY t(c,i) WHERE i<=lvl)) WHERE id=rid AND user_id=a;
    END IF;
    v:=pg_temp.cs_edge(a,rid);
    IF h=2 THEN PERFORM pg_temp.cs_check(v->>'phase'='crack' AND v->>'tie'='true' AND v->>'beforeRisk'='100' AND v->>'risk'='0' AND v->>'cracks'='2' AND jsonb_array_length(v->'best')=5 AND v->>'label'='Straight','tie crack');
    ELSE PERFORM pg_temp.cs_check(v->>'phase'='win' AND (v->>'risk')::int=private.chucky_showdown_bonus(v->'config',lvl),'win');END IF;
    v:=pg_temp.cs_edge(a,rid);
    PERFORM pg_temp.cs_check(v->'player'<>player AND v->>'phase'='deal' AND jsonb_array_length(v->'community')=2 AND v->'best'='null','fresh hand');
  END LOOP;
  PERFORM pg_temp.cs_check(v->'config'=(SELECT config FROM private.arcade_rulesets WHERE id='chucky-showdown/3'),'frozen admitted bonus config');
  PERFORM pg_temp.cs_check(v->'uses'->6='0' AND v->'uses'->0='1','win and loss consume uses');
  FOR n IN 1..3 LOOP
    v:=pg_temp.cs_edge(a,rid);
    IF n=1 THEN v:=pg_temp.cs_edge(a,rid); ELSE v:=pg_temp.cs_act(a,v,'fold'); END IF;
    PERFORM pg_temp.cs_check(v#>>'{lastFold,phase}'='fold' AND jsonb_array_length(v#>'{lastFold,community}')=2 AND v#>'{lastFold,chucky}'='[]','accepted fold receipt redacts hidden cards');
    IF n<3 THEN PERFORM pg_temp.cs_check(v->>'risk'='3000' AND (v->>'folds')::int=3-n,'ordinary fold'); END IF;
  END LOOP;
  PERFORM pg_temp.cs_check(v->>'phase'='round_over' AND v->>'score'='3000' AND v->>'reason'='folds','third fold banks');
  v:=pg_temp.cs_edge(a,rid);
  -- Round two: all fourteen committed uses, arbitrary order, automatic bank after final victory.
  FOREACH lvl IN ARRAY ARRAY[7,1,7,2,6,5,4,3,1,2,3,4,5,6] LOOP
    ordinal:=ordinal+1;
    v:=pg_temp.cs_edge(a,rid);v:=pg_temp.cs_act(a,v,'stay');
    FOR n IN 1..3 LOOP v:=pg_temp.cs_edge(a,rid);END LOOP;
    IF ordinal=4 THEN
      BEGIN PERFORM pg_temp.cs_act(a,v,'press',7);RAISE EXCEPTION 'third use accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'arcade:illegal_action' THEN RAISE; END IF;END;
    END IF;
    IF ordinal=9 THEN v:=pg_temp.cs_edge(a,rid); ELSE v:=pg_temp.cs_act(a,v,'press',lvl);END IF;
    PERFORM pg_temp.cs_check((v->>'level')::int=lvl,'chosen level');
    UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',pg_temp.cs_cards('A♠ K♠ Q♠ J♠'),'community',pg_temp.cs_cards('10♠ 2♥ 3♦ 4♣'),
      'chucky',(SELECT jsonb_agg(c ORDER BY i) FROM jsonb_array_elements(pg_temp.cs_cards('8♦ 8♥ 7♣ 7♥ 6♣ 6♥ 5♠')) WITH ORDINALITY t(c,i) WHERE i<=lvl)) WHERE id=rid AND user_id=a;
    FOR n IN 1..lvl+2 LOOP v:=pg_temp.cs_edge(a,rid);END LOOP;
  END LOOP;
  PERFORM pg_temp.cs_check(v->>'reason'='exhausted' AND v->>'score'='18800' AND v->>'beforeRisk'='15800','all uses bank');
  v:=pg_temp.cs_edge(a,rid);
  -- Round three: three losses, including a final bust that protects both earlier rounds.
  FOR h IN 1..3 LOOP
    v:=pg_temp.cs_edge(a,rid);v:=pg_temp.cs_act(a,v,'stay');
    FOR n IN 1..3 LOOP v:=pg_temp.cs_edge(a,rid);END LOOP;
    v:=pg_temp.cs_edge(a,rid);
    PERFORM pg_temp.cs_check((v->>'level')::int=CASE WHEN h=3 THEN 2 ELSE 1 END,'lowest still-available timeout');
    UPDATE private.arcade_runs SET state=state||jsonb_build_object('player',pg_temp.cs_cards('2♣ 4♥ 6♣ 8♦'),'community',pg_temp.cs_cards('A♠ K♠ Q♠ J♠'),'chucky',
      CASE WHEN h=3 THEN pg_temp.cs_cards('10♠ 9♥') ELSE pg_temp.cs_cards('10♠') END) WHERE id=rid AND user_id=a;
    FOR n IN 1..(v->>'level')::int+1 LOOP v:=pg_temp.cs_edge(a,rid);END LOOP;
    PERFORM pg_temp.cs_check(v->>'phase'='crack' AND (v->>'cracks')::int=3-h AND v->>'tie'='false' AND v->>'label'='Straight Flush','crack sequence');
    v:=pg_temp.cs_edge(a,rid);
  END LOOP;
  PERFORM pg_temp.cs_check(v->>'status'='completed' AND v->>'reason'='busted' AND v->>'score'='18800','exact terminal score');
  result:=public.arcade_chucky_showdown_step(a,rid,(old->>'revision')::bigint,old->>'roundId',req,'stay');
  PERFORM pg_temp.cs_check(result->>'outcome'='duplicate' AND result#>>'{projection,score}'='18800','late immutable replay');
  PERFORM pg_temp.cs_check((SELECT count(*) FROM private.arcade_results WHERE run_id=rid)=1,'one immutable result');
  FOREACH mode IN ARRAY ARRAY['30','all'] LOOP
    board:=public.arcade_leaderboard(a,'chucky-showdown',mode,rid,'chucky-showdown/3');
    PERFORM pg_temp.cs_check(board#>>'{rows,0,score}'='18800' AND board#>>'{rows,0,completedAt}' IS NOT NULL,'v2 leaderboard');
    board:=public.arcade_leaderboard(b,'chucky-showdown',mode,legacy,'chucky-showdown/1');
    PERFORM pg_temp.cs_check(NOT EXISTS(SELECT FROM jsonb_array_elements(board->'rows') e WHERE e->>'runId'=rid::text),'separate v1 leaderboard');
  END LOOP;
  PERFORM pg_temp.cs_check(NOT EXISTS(SELECT FROM pg_stat_xact_user_tables t JOIN pg_temp.cs2_writes w USING(relid) WHERE t.n_tup_ins+t.n_tup_upd+t.n_tup_del<>w.n),'no non-Arcade writes');
  -- An abandoned run is terminal and cannot produce a result, even on duplicate delivery.
  v:=public.arcade_start(a,gen_random_uuid(),'chucky-showdown');
  v:=public.arcade_chucky_showdown_step(a,(v->>'id')::uuid)->'projection';old:=v;req:=gen_random_uuid();
  v:=pg_temp.cs_act(a,v,'abandon',NULL,req);
  PERFORM pg_temp.cs_check(v->>'status'='abandoned' AND NOT EXISTS(SELECT FROM private.arcade_results WHERE run_id=(v->>'id')::uuid),'abandoned has no result');
  result:=public.arcade_chucky_showdown_step(a,(v->>'id')::uuid,(old->>'revision')::bigint,old->>'roundId',req,'abandon');
  PERFORM pg_temp.cs_check(result->>'outcome'='duplicate' AND result#>>'{projection,status}'='abandoned','abandon duplicate');
  PERFORM pg_temp.cs_check(public.arcade_chucky_showdown_step(a,(v->>'id')::uuid)#>>'{projection,status}'='abandoned','abandon reload');
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT md5(string_agg(pg_get_functiondef(p.oid),chr(10) ORDER BY p.oid::regprocedure::text)) INTO digest_i
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='private' AND (left(p.proname,15)='chucky_showdown_' OR p.proname IN ('secure_shuffle_key')))
    OR (n.nspname='public' AND p.proname IN ('holm_hand_label','holm_best_hand_value','holm_five_card_value','holm_deterministic_chucky_cards','arcade_chucky_showdown_step','arcade_chucky_showdown_history','arcade_start','arcade_commit','arcade_leaderboard'));
  RAISE EXCEPTION USING ERRCODE='ZCS02',MESSAGE='retire proof';
 EXCEPTION WHEN SQLSTATE 'ZCS02' THEN NULL;
 END;
 PERFORM pg_temp.cs_check(digest_i IS NOT NULL,'proof completed');
 PERFORM set_config('app.cs2_test_digest',digest_i,false);
END $proof$;
COMMIT;
SELECT current_setting('app.cs2_test_digest') AS digest,
 to_regprocedure('private.chucky_showdown_advance_v2(jsonb,bigint)') IS NOT NULL AS installed,
 (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'cs_v2_proof'='true') fixture_users,
 (SELECT count(*) FROM private.arcade_runs WHERE game='chucky-showdown' AND ruleset LIKE 'chucky-showdown/3%') fixture_runs,
 (SELECT count(*) FROM private.arcade_rulesets WHERE game='chucky-showdown' AND config->>'version'='chucky-showdown/3' AND enabled) v2_enabled;
