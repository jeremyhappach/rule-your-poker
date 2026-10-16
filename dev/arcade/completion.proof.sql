-- Always execute inside BEGIN/ROLLBACK, including against installed definitions.
CREATE FUNCTION pg_temp.arcade_finish(actor uuid, points bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;s jsonb;answer jsonb;
BEGIN
 r:=public.arcade_start(actor,gen_random_uuid(),'run21');
 s:=jsonb_build_object('runId',r->>'id','userId',actor,'config',r->'config','status','completed','round',3,'score',points,
  'results',jsonb_build_array(jsonb_build_object('score',0),jsonb_build_object('score',0),jsonb_build_object('score',points)));
 answer:=public.arcade_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s,NULL,gen_random_uuid(),'proof');
 RETURN answer->'record';
END $$;
CREATE FUNCTION pg_temp.arcade_completion_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'completion proof injected failure';END$$;
CREATE TRIGGER arcade_completion_failure BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN(NEW.score=7777777) EXECUTE FUNCTION pg_temp.arcade_completion_failure();
DO $$
DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();r jsonb;first_r jsonb;best_r jsonb;board jsonb;n integer;old_id uuid:=gen_random_uuid();version_i text;config_i jsonb;before_i bigint;
BEGIN
 INSERT INTO private.arcade_rulesets(id,game,config,enabled) SELECT 'run21/zz-completion-current-proof','run21',config,true FROM private.arcade_rulesets WHERE game='run21' AND enabled ORDER BY id DESC LIMIT 1;
 INSERT INTO auth.users(id) VALUES(a),(b),(c);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Arcade completion proof A',true),(b,'Arcade completion proof B',true),(c,'Arcade completion proof C',true)
 ON CONFLICT(id) DO UPDATE SET is_active=true;
 SELECT count(*) INTO before_i FROM private.arcade_runs WHERE user_id=a;
 BEGIN PERFORM pg_temp.arcade_finish(a,7777777);RAISE EXCEPTION 'injected failure not raised';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'completion proof injected failure' THEN RAISE;END IF;END;
 ASSERT (SELECT count(*) FROM private.arcade_runs WHERE user_id=a)=before_i,'atomic completion failure';
 r:=pg_temp.arcade_finish(a,100);first_r:=r;
 ASSERT r#>>'{completion,kind}'='first' AND r#>'{completion,priorBest}'='null'::jsonb,'first baseline';
 ASSERT (public.arcade_load(a,(r->>'id')::uuid))->'completion'=r->'completion','owner reload receipt';
 BEGIN PERFORM public.arcade_load(b,(r->>'id')::uuid);RAISE EXCEPTION 'foreign read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=pg_temp.arcade_finish(a,100);
 ASSERT r#>>'{completion,kind}'='matched' AND (r#>>'{completion,priorBest}')::bigint=100,'tie';
 r:=pg_temp.arcade_finish(a,90);ASSERT r#>>'{completion,kind}'='lower','lower';
 r:=pg_temp.arcade_finish(a,200);best_r:=r;
 ASSERT r#>>'{completion,kind}'='broken' AND (r#>>'{completion,priorBest}')::bigint=100,'strict prior record';
 ASSERT public.arcade_commit(a,(r->>'id')::uuid,(r->>'revision')::bigint,r->'state',NULL)->>'outcome'='conflict','late completion';
 ASSERT (public.arcade_load(a,(r->>'id')::uuid))->'completion'=r->'completion','receipt immutable on replay';
 ASSERT public.arcade_commit(a,(r->>'id')::uuid,0,r->'state',NULL,
  (SELECT request_id FROM private.arcade_command_receipts WHERE run_id=(r->>'id')::uuid AND fingerprint='proof'),'proof')->>'outcome'='duplicate','duplicate command receipt';
 BEGIN UPDATE private.arcade_results SET record='{}' WHERE run_id=(r->>'id')::uuid;RAISE EXCEPTION 'result mutable';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'arcade:immutable_result' THEN RAISE;END IF;END;
 FOR n IN 1..11 LOOP PERFORM pg_temp.arcade_finish(b,1000);END LOOP;
 r:=pg_temp.arcade_finish(c,500);
 board:=public.arcade_leaderboard(a,'run21','30',(best_r->>'id')::uuid);
 ASSERT jsonb_array_length(board->'rows')=10,'exact ten tied entries';
 ASSERT (SELECT count(DISTINCT x->>'userId') FROM jsonb_array_elements(board->'rows') x)=1,'same player repeated';
 ASSERT (board#>>'{self,rank}')::int=13 AND (board#>>'{latestResult,rank}')::int=13,'outside-ten best and run rank';
 ASSERT (board#>>'{personalBest}')::int=200,'all-time best';
 ASSERT (SELECT count(DISTINCT x->>'runId') FROM jsonb_array_elements(board->'rows') x)=10,'unique result identities';
 ASSERT (SELECT array_agg((x->>'runId')::uuid ORDER BY ord) FROM jsonb_array_elements(board->'rows') WITH ORDINALITY v(x,ord))=
  (SELECT array_agg(run_id ORDER BY completed_at,run_id) FROM (SELECT run_id,completed_at FROM private.arcade_results WHERE user_id=b ORDER BY completed_at,run_id LIMIT 10)t),'stable tie cutoff';
 board:=public.arcade_leaderboard(c,'run21','all');
 ASSERT (board#>>'{self,rank}')::int=12,'competition rank counts entries';
 SELECT ruleset,config INTO version_i,config_i FROM private.arcade_runs WHERE id=(best_r->>'id')::uuid;
 INSERT INTO private.arcade_runs(id,user_id,game,ruleset,config,status,score) VALUES(old_id,a,'run21',version_i,config_i,'completed',5000);
 INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state)
 VALUES(old_id,a,'run21',version_i,5000,0,statement_timestamp()-interval '31 days','{}');
 board:=public.arcade_leaderboard(a,'run21','30',(first_r->>'id')::uuid);
 ASSERT (board#>>'{personalBest}')::int=5000 AND (board#>>'{self,rank}')::int=13,'rolling window versus all-time PB';
 ASSERT (board#>>'{latestResult,rank}')::int=14,'run-specific rank differs from personal rank';
 ASSERT (public.arcade_leaderboard(a,'run21','all')#>>'{self,rank}')::int=1,'all-time includes old verified scores';
 r:=pg_temp.arcade_finish(a,4000);ASSERT r#>>'{completion,kind}'='lower','PB includes old compatible results';
 INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('run21/completion-proof','run21',config_i,false);
 old_id:=gen_random_uuid();
 INSERT INTO private.arcade_runs(id,user_id,game,ruleset,config,status,score) VALUES(old_id,a,'run21','run21/completion-proof',config_i,'completed',999999);
 INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state)
 VALUES(old_id,a,'run21','run21/completion-proof',999999,0,statement_timestamp(),'{}');
 r:=pg_temp.arcade_finish(a,6000);ASSERT r#>>'{completion,kind}'='broken' AND (r#>>'{completion,priorBest}')::int=5000,'ruleset separation';
 ASSERT NOT has_function_privilege('authenticated','public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)','EXECUTE'),'commit service only';
 ASSERT NOT has_function_privilege('anon','public.arcade_leaderboard(uuid,text,text,uuid,text)','EXECUTE'),'leaderboard service only';
 ASSERT NOT has_function_privilege('authenticated','private.arcade_record(private.arcade_runs)','EXECUTE'),'receipt private';
END $$;
