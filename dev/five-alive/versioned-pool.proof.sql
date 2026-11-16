-- Run after vocabulary-v2.sql in the SAME rollback-contained transaction.
-- Allocation only: no Auth, game settlement, recovery, or browser proof reruns.
CREATE TEMP TABLE fa_v2_before AS SELECT
 md5(pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure)) allocator,
 (SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/1') legacy_pool,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY mode,owner_id,round)::text,'')) FROM private.five_alive_allocations a WHERE version='esdb-five-alive/1') legacy_allocations,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM private.delayed_children c) children,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'')) FROM private.arcade_runs r) runs;
CREATE TEMP TABLE fa_v2_seen(epoch integer,word text,PRIMARY KEY(epoch,word));
CREATE TEMP TABLE fa_v2_observation(answers integer,three_word_games_before_repeat integer,first_repeating_game integer,cycles_checked integer,replays integer,boundary_safe boolean,legacy_preserved boolean);
DO $$ DECLARE
 owner uuid;first_owner uuid;first_words jsonb;first_mode text;mode_i text;words jsonb;replayed jsonb;
 pool_before jsonb;last_word text;epoch_i integer;baseline fa_v2_before;dealt jsonb;new_child uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO STRICT baseline FROM fa_v2_before;
 IF NOT EXISTS(SELECT FROM private.five_alive_pool WHERE version='esdb-five-alive/2' AND epoch=0 AND cursor=0)
 OR (SELECT count(*) FROM private.five_alive_answers WHERE version='esdb-five-alive/2')<>753 THEN RAISE EXCEPTION 'proof:v2_not_fresh';END IF;
 IF (SELECT config->>'poolVersion' FROM private.arcade_rulesets WHERE id='five-alive/2')<>'esdb-five-alive/2'
 OR strpos(pg_get_functiondef('public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure),'id=''five-alive/2''')=0
 OR strpos(pg_get_functiondef('private.chess_prior_delayed_capabilities()'::regprocedure),'id=''five-alive/2''')=0 THEN RAISE EXCEPTION 'proof:runtime_registration';END IF;
 FOR game_i IN 1..502 LOOP
  owner:=gen_random_uuid();mode_i:=CASE WHEN game_i%2=0 THEN 'arcade' ELSE 'async' END;
  words:=private.five_alive_allocate(mode_i,owner,'esdb-five-alive/2');
  IF game_i=1 THEN first_owner:=owner;first_words:=words;first_mode:=mode_i;END IF;
  IF jsonb_array_length(words)<>3 OR (SELECT count(DISTINCT a->>'word') FROM jsonb_array_elements(words) a)<>3 THEN RAISE EXCEPTION 'proof:distinct_three';END IF;
  IF words->0->>'word'=last_word THEN RAISE EXCEPTION 'proof:adjacent_repeat';END IF;
  last_word:=words->2->>'word';
  epoch_i:=CASE WHEN game_i<=251 THEN 1 ELSE 2 END;
  INSERT INTO fa_v2_seen SELECT epoch_i,a->>'word' FROM jsonb_array_elements(words) a;
  IF EXISTS(SELECT FROM jsonb_array_elements(words) a LEFT JOIN private.five_alive_answers b ON b.version='esdb-five-alive/2' AND b.word=a->>'word' WHERE b.word IS NULL OR b.difficulty<>(a->>'difficulty')::int) THEN RAISE EXCEPTION 'proof:reviewed_tiers';END IF;
  IF game_i=251 AND (SELECT count(*) FROM fa_v2_seen WHERE epoch=1)<>753 THEN RAISE EXCEPTION 'proof:early_repeat';END IF;
  IF game_i=252 AND (SELECT count(*) FROM jsonb_array_elements(words) a JOIN fa_v2_seen s ON s.epoch=1 AND s.word=a->>'word')<>3 THEN RAISE EXCEPTION 'proof:first_repeat_window';END IF;
  SELECT to_jsonb(p) INTO pool_before FROM private.five_alive_pool p WHERE version='esdb-five-alive/2';
  replayed:=private.five_alive_allocate(mode_i,owner,'esdb-five-alive/2');
  IF replayed<>words OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/2') THEN RAISE EXCEPTION 'proof:replay_consumed_words';END IF;
 END LOOP;
 IF (SELECT count(*) FROM fa_v2_seen WHERE epoch=2)<>753 THEN RAISE EXCEPTION 'proof:second_cycle';END IF;
 replayed:=private.five_alive_allocate(first_mode,first_owner,'esdb-five-alive/2');
 IF replayed<>first_words OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/2') THEN RAISE EXCEPTION 'proof:late_replay';END IF;
 BEGIN
  PERFORM private.five_alive_allocate(first_mode,first_owner,'esdb-five-alive/1');
  RAISE EXCEPTION 'proof:changed_version_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'five_alive:allocation_conflict' THEN RAISE;END IF;END;
 BEGIN
  UPDATE private.five_alive_answers SET difficulty=5 WHERE version='esdb-five-alive/2' AND word='ABOUT';
  RAISE EXCEPTION 'proof:changed_tier_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'five_alive:answers_frozen' THEN RAISE;END IF;END;
 owner:=gen_random_uuid();
 BEGIN
  PERFORM private.five_alive_allocate('arcade',owner,'esdb-five-alive/2');
  RAISE EXCEPTION 'proof:rollback_allocation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'proof:rollback_allocation' THEN RAISE;END IF;END;
 IF EXISTS(SELECT FROM private.five_alive_allocations WHERE owner_id=owner)
 OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/2') THEN RAISE EXCEPTION 'proof:rollback_advanced_pool';END IF;
 dealt:=private.five_alive_async_deal(new_child,gen_random_uuid(),gen_random_uuid(),'esdb-five-alive/2');
 IF dealt#>'{fiveAlive,rounds,0}'<>dealt#>'{fiveAlive,rounds,1}'
 OR (SELECT count(*) FROM private.five_alive_allocations WHERE owner_id=new_child AND version='esdb-five-alive/2')<>3 THEN RAISE EXCEPTION 'proof:shared_async_answers';END IF;
 IF baseline.legacy_pool<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/1')
 OR baseline.legacy_allocations<>(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY mode,owner_id,round)::text,'')) FROM private.five_alive_allocations a WHERE version='esdb-five-alive/1')
 OR baseline.children<>(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM private.delayed_children c)
 OR baseline.runs<>(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY id)::text,'')) FROM private.arcade_runs r)
 OR baseline.allocator<>md5(pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure)) THEN RAISE EXCEPTION 'proof:legacy_changed';END IF;
 IF EXISTS(SELECT FROM private.five_alive_release WHERE async_enabled OR async_real_qualified)
 OR EXISTS(SELECT FROM private.arcade_rulesets WHERE game='five-alive' AND enabled) THEN RAISE EXCEPTION 'proof:admission_opened';END IF;
 INSERT INTO fa_v2_observation VALUES(753,251,252,2,503,true,true);
END $$;
SELECT * FROM fa_v2_observation;
