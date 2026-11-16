-- Run inside BEGIN/ROLLBACK, after candidate seed or against installed v3.
-- Handles a cycle boundary inside a three-word game (1021 is not divisible by 3).
CREATE TEMP TABLE fa_v3_before AS SELECT
 md5(pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure)) allocator,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY version) FROM private.five_alive_pool p WHERE version<>'esdb-five-alive/3') old_pools,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY version,word)::text,'')) FROM private.five_alive_answers a WHERE version<>'esdb-five-alive/3') old_answers,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY mode,owner_id,round)::text,'')) FROM private.five_alive_allocations a WHERE version<>'esdb-five-alive/3') old_allocations;
CREATE TEMP TABLE fa_v3_seen(epoch integer,word text,PRIMARY KEY(epoch,word));
CREATE TEMP TABLE fa_v3_observation(answers integer,three_word_games_before_repeat integer,first_repeating_game integer,cycles_checked integer,allocations integer,replays integer,boundary_safe boolean,prior_versions_preserved boolean);
DO $$ DECLARE
 owner uuid;first_owner uuid;first_words jsonb;mode_i text;words jsonb;replayed jsonb;answer_i jsonb;
 pool_before jsonb;last_word text;epoch_i integer;position_i integer:=0;baseline fa_v3_before;
BEGIN
 SELECT * INTO STRICT baseline FROM fa_v3_before;
 IF NOT EXISTS(SELECT FROM private.five_alive_pool WHERE version='esdb-five-alive/3' AND epoch=0 AND cursor=0)
 OR (SELECT count(*) FROM private.five_alive_answers WHERE version='esdb-five-alive/3')<>1021 THEN RAISE EXCEPTION 'proof:v3_not_fresh';END IF;
 FOR game_i IN 1..681 LOOP
  owner:=gen_random_uuid();mode_i:=CASE WHEN game_i%2=0 THEN 'arcade' ELSE 'async' END;
  words:=private.five_alive_allocate(mode_i,owner,'esdb-five-alive/3');
  IF game_i=1 THEN first_owner:=owner;first_words:=words;END IF;
  IF jsonb_array_length(words)<>3 OR (SELECT count(DISTINCT x->>'word') FROM jsonb_array_elements(words) x)<>3 THEN RAISE EXCEPTION 'proof:distinct_three';END IF;
  FOR answer_i IN SELECT value FROM jsonb_array_elements(words) LOOP
   position_i:=position_i+1;epoch_i:=((position_i-1)/1021)+1;
   IF answer_i->>'word'=last_word THEN RAISE EXCEPTION 'proof:adjacent_repeat';END IF;
   IF position_i=1022 AND NOT EXISTS(SELECT FROM fa_v3_seen WHERE epoch=1 AND word=answer_i->>'word') THEN RAISE EXCEPTION 'proof:first_repeat_window';END IF;
   INSERT INTO fa_v3_seen VALUES(epoch_i,answer_i->>'word');
   last_word:=answer_i->>'word';
   IF NOT EXISTS(SELECT FROM private.five_alive_answers b WHERE b.version='esdb-five-alive/3' AND b.word=answer_i->>'word' AND b.difficulty=(answer_i->>'difficulty')::int) THEN RAISE EXCEPTION 'proof:reviewed_tiers';END IF;
  END LOOP;
  SELECT to_jsonb(p) INTO pool_before FROM private.five_alive_pool p WHERE version='esdb-five-alive/3';
  IF (pool_before->>'epoch')::int<>epoch_i OR (pool_before->>'cursor')::int<>((position_i-1)%1021)+1 THEN RAISE EXCEPTION 'proof:pool_position';END IF;
  replayed:=private.five_alive_allocate(mode_i,owner,'esdb-five-alive/3');
  IF replayed<>words OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/3') THEN RAISE EXCEPTION 'proof:replay_consumed_words';END IF;
 END LOOP;
 IF (SELECT count(*) FROM fa_v3_seen WHERE epoch=1)<>1021 OR (SELECT count(*) FROM fa_v3_seen WHERE epoch=2)<>1021 THEN RAISE EXCEPTION 'proof:cycle_coverage';END IF;
 replayed:=private.five_alive_allocate('async',first_owner,'esdb-five-alive/3');
 IF replayed<>first_words OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/3') THEN RAISE EXCEPTION 'proof:late_replay';END IF;
 BEGIN PERFORM private.five_alive_allocate('async',first_owner,'esdb-five-alive/2');RAISE EXCEPTION 'proof:changed_version_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'five_alive:allocation_conflict' THEN RAISE;END IF;END;
 BEGIN UPDATE private.five_alive_answers SET difficulty=5 WHERE version='esdb-five-alive/3' AND word='ABOUT';RAISE EXCEPTION 'proof:changed_tier_accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'five_alive:answers_frozen' THEN RAISE;END IF;END;
 owner:=gen_random_uuid();
 BEGIN PERFORM private.five_alive_allocate('arcade',owner,'esdb-five-alive/3');RAISE EXCEPTION 'proof:rollback_allocation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'proof:rollback_allocation' THEN RAISE;END IF;END;
 IF EXISTS(SELECT FROM private.five_alive_allocations WHERE owner_id=owner)
 OR pool_before<>(SELECT to_jsonb(p) FROM private.five_alive_pool p WHERE version='esdb-five-alive/3') THEN RAISE EXCEPTION 'proof:rollback_advanced_pool';END IF;
 IF baseline.old_pools<>(SELECT jsonb_agg(to_jsonb(p) ORDER BY version) FROM private.five_alive_pool p WHERE version<>'esdb-five-alive/3')
 OR baseline.old_answers<>(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY version,word)::text,'')) FROM private.five_alive_answers a WHERE version<>'esdb-five-alive/3')
 OR baseline.old_allocations<>(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY mode,owner_id,round)::text,'')) FROM private.five_alive_allocations a WHERE version<>'esdb-five-alive/3')
 OR baseline.allocator<>md5(pg_get_functiondef('private.five_alive_allocate(text,uuid,text)'::regprocedure)) THEN RAISE EXCEPTION 'proof:prior_versions_changed';END IF;
 IF EXISTS(SELECT FROM private.five_alive_release WHERE async_enabled OR async_real_qualified)
 OR EXISTS(SELECT FROM private.arcade_rulesets WHERE game='five-alive' AND enabled) THEN RAISE EXCEPTION 'proof:admission_opened';END IF;
 INSERT INTO fa_v3_observation VALUES(1021,340,341,2,681,682,true,true);
END $$;
SELECT * FROM fa_v3_observation;
