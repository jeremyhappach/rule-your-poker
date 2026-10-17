-- Run only inside BEGIN/ROLLBACK. No test row survives.
CREATE FUNCTION pg_temp.tri_assert_no_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Solo wrote non-Arcade authority %',TG_TABLE_NAME;END$$;
CREATE FUNCTION pg_temp.tri_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'tri injected result failure';END$$;
CREATE FUNCTION pg_temp.tri_run(actor uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 r:=public.arcade_start(actor,gen_random_uuid(),'tri-towers');
 RETURN public.arcade_tri_step(actor,(r->>'id')::uuid)->'record';
END $$;
-- Feed a server-owned cumulative chain through the actual immutable result writer.
CREATE FUNCTION pg_temp.tri_finish(actor uuid,points bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;s jsonb;b jsonb;
BEGIN
 r:=pg_temp.tri_run(actor);s:=r->'state';
 b:=private.tri_towers_board_finish_v2(jsonb_set(s->'board','{score}',to_jsonb(points)),'timeout',1000);
 s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',b));
 s:=private.arcade_tri_advance(s,6000);
 b:=private.tri_towers_board_finish_v2(s->'board','timeout',7000);s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',b));
 IF s->>'status'='active' THEN s:=private.arcade_tri_advance(s,12000);s:=private.arcade_tri_finish_round(jsonb_set(s,'{board}',private.tri_towers_board_finish_v2(s->'board','timeout',13000)));END IF;
 RETURN public.arcade_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s,NULL)->'record';
END $$;

UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
DO $$DECLARE a uuid:=gen_random_uuid();r jsonb;l jsonb;id2 uuid;id3 uuid;BEGIN
 INSERT INTO auth.users(id) VALUES(a);INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Scene compatibility proof',true) ON CONFLICT(id) DO UPDATE SET is_active=true;
 UPDATE private.tri_towers_release SET intro_enabled=false;UPDATE private.arcade_rulesets SET enabled=false WHERE id='tri-towers/3';
 r:=pg_temp.tri_finish(a,12000);id2:=(r->>'id')::uuid;
 UPDATE private.tri_towers_release SET intro_enabled=true;UPDATE private.arcade_rulesets SET enabled=true WHERE id='tri-towers/3';
 r:=pg_temp.tri_finish(a,12000);id3:=(r->>'id')::uuid;
 ASSERT (SELECT record->>'kind' FROM private.arcade_results WHERE run_id=id3)='matched','v3 compares v2 PB';
 ASSERT (SELECT ruleset FROM private.arcade_results WHERE run_id=id2)='tri-towers/2','v2 frozen version';
 ASSERT (SELECT ruleset FROM private.arcade_results WHERE run_id=id3)='tri-towers/3','v3 frozen version';
 r:=pg_temp.tri_finish(a,13000);ASSERT (SELECT record->>'kind' FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)='broken','v3 broken PB';
 l:=public.arcade_leaderboard(a,'tri-towers','all',id2);ASSERT l->>'personalBest'='13000','combined PB';ASSERT l#>>'{latestResult,rank}' IS NOT NULL,'v2 rank in v3 board';ASSERT jsonb_array_length(l->'availableRulesets')=1,'one compatible leaderboard';
 ASSERT public.arcade_leaderboard(a,'tri-towers','all',id3,'tri-towers/2')->>'personalBest'='13000','old version query also combines';
 UPDATE private.tri_towers_release SET intro_enabled=false;UPDATE private.arcade_rulesets SET enabled=false WHERE id='tri-towers/3';
 r:=pg_temp.tri_finish(a,12500);ASSERT (SELECT record->>'kind' FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)='lower','v2 compares v3 PB';
 END $$;
