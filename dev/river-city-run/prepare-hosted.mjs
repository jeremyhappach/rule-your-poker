import fs from 'node:fs';
import {createRun,applyIntent,recoverRun} from '../../src/lib/riverCityRun/authority.mjs';
const paths=JSON.parse(fs.readFileSync(new URL('./approved-paths.json',import.meta.url),'utf8'));
let run=createRun('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',1000000);
for(const input of paths.elevated)run=applyIntent(run,{type:'input',...input},1000000+input.at*1000+100);
run=applyIntent(recoverRun(run,1188000),{type:'bank'},1188100);
const state="'"+JSON.stringify(run).replaceAll("'","''")+"'::jsonb";
const candidate=fs.readFileSync(new URL('../../supabase/river-city-run/candidate.sql',import.meta.url),'utf8');
const proof=`
DECLARE actor uuid;other uuid;r jsonb;s jsonb;answer jsonb;successor jsonb;request uuid:=gen_random_uuid();command uuid:=gen_random_uuid();failed boolean;win_id uuid;foreign_id uuid:=gen_random_uuid();before_count bigint;guard record;
BEGIN
 SELECT p.id INTO actor FROM public.profiles p JOIN public.account_access a ON a.user_id=p.id WHERE p.is_active AND a.enabled ORDER BY p.id LIMIT 1;
 SELECT p.id INTO other FROM public.profiles p JOIN public.account_access a ON a.user_id=p.id WHERE p.is_active AND a.enabled AND p.id<>actor ORDER BY p.id LIMIT 1;
 IF actor IS NULL OR other IS NULL THEN RAISE EXCEPTION 'river:qualification_identity';END IF;
 IF EXISTS(SELECT 1 FROM private.arcade_runs WHERE game='river-city-run') THEN RAISE EXCEPTION 'river:existing_runs_require_review';END IF;
 IF has_function_privilege('anon','public.arcade_river_start(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.arcade_river_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'river:public_privilege';END IF;
 failed:=false;BEGIN PERFORM public.arcade_river_start(actor,request,'the-boat');EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;failed:=true;END;IF NOT failed THEN RAISE EXCEPTION 'river:admission_open';END IF;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='river-city-run/1';
 r:=public.arcade_river_start(actor,request,'the-boat');win_id:=(r->>'id')::uuid;
 IF public.arcade_river_start(actor,request,'the-boat')->>'id'<>r->>'id' THEN RAISE EXCEPTION 'river:duplicate_start';END IF;
 failed:=false;BEGIN PERFORM public.arcade_load(other,win_id);EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_found%' THEN RAISE;END IF;failed:=true;END;IF NOT failed THEN RAISE EXCEPTION 'river:owner';END IF;
 s:=${state}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config');
 failed:=false;BEGIN PERFORM public.arcade_river_commit(actor,win_id,0,s||'{"score":1}');EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalid_score%' THEN RAISE;END IF;failed:=true;END;IF NOT failed THEN RAISE EXCEPTION 'river:score_forgery';END IF;
 answer:=public.arcade_river_commit(actor,win_id,0,s,command,'terminal');
 IF answer->>'outcome'<>'committed' OR answer#>>'{record,score}'<>'1667200' THEN RAISE EXCEPTION 'river:score';END IF;
 IF public.arcade_river_commit(actor,win_id,0,s,command,'terminal')->>'outcome'<>'duplicate' THEN RAISE EXCEPTION 'river:duplicate';END IF;
 IF public.arcade_river_commit(actor,win_id,0,s,gen_random_uuid(),'stale')->>'outcome'<>'conflict' THEN RAISE EXCEPTION 'river:terminal';END IF;
 IF public.arcade_river_start(actor,request,'the-boat')->>'id'<>win_id::text THEN RAISE EXCEPTION 'river:late_replay';END IF;
 successor:=public.arcade_river_start(actor,gen_random_uuid(),'the-boat');
 IF successor->>'id'=win_id::text THEN RAISE EXCEPTION 'river:successor';END IF;
 PERFORM public.arcade_river_commit(actor,(successor->>'id')::uuid,0,s||jsonb_build_object('id',successor->>'id','status','abandoned','score',0));
 r:=public.arcade_river_start(other,gen_random_uuid(),'the-boat');
 PERFORM public.arcade_river_commit(other,(r->>'id')::uuid,0,s||jsonb_build_object('id',r->>'id','owner',other));
 INSERT INTO private.arcade_runs(id,user_id,game,ruleset,config,status,score,revision,state,ended_at) SELECT foreign_id,user_id,game,ruleset,jsonb_set(config,'{id}','"future-course"'),status,99999999,revision,jsonb_set(state,'{config,id}','"future-course"'),ended_at FROM private.arcade_runs WHERE id=win_id;
 INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record) SELECT foreign_id,user_id,game,ruleset,99999999,revision,completed_at,jsonb_set(final_state,'{config,id}','"future-course"'),record FROM private.arcade_results WHERE run_id=win_id;
 answer:=public.arcade_river_board(actor,'the-boat','30');IF jsonb_array_length(answer->'rows')<>2 OR answer#>>'{rows,0,rank}'<>'1' OR answer#>>'{rows,1,rank}'<>'1' OR answer#>>'{rows,0,completedAt}' IS NULL THEN RAISE EXCEPTION 'river:30_board';END IF;
 answer:=public.arcade_river_board(actor,'the-boat','all');IF jsonb_array_length(answer->'rows')<>2 OR (answer->>'personalBest')::numeric<>16672 THEN RAISE EXCEPTION 'river:all_board';END IF;
 failed:=false;BEGIN PERFORM public.arcade_river_board(actor,'future-course','all');EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalid_course%' THEN RAISE;END IF;failed:=true;END;IF NOT failed THEN RAISE EXCEPTION 'river:course';END IF;
 failed:=false;BEGIN UPDATE private.arcade_results SET score=0 WHERE run_id=win_id;EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%immutable_result%' THEN RAISE;END IF;failed:=true;END;IF NOT failed THEN RAISE EXCEPTION 'river:immutable';END IF;
END;`;
// The exception subtransaction rolls back candidate DDL and every synthetic row.
for(const installed of [false,true]){
 const query=`SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';CREATE TEMP TABLE river_proof_result(value jsonb) ON COMMIT DROP;
DO $outer$ DECLARE passed boolean:=false;BEGIN BEGIN
${installed?'':candidate}
${proof.replace(' FOREACH guard IN ARRAY ARRAY[]::record[] LOOP END LOOP;','')}
passed:=true;RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='river:rollback';
EXCEPTION WHEN SQLSTATE 'P0004' THEN IF SQLERRM<>'river:rollback' THEN RAISE;END IF;END;
IF NOT passed THEN RAISE EXCEPTION 'river:proof_failed';END IF;
IF EXISTS(SELECT 1 FROM private.arcade_runs WHERE game='river-city-run') THEN RAISE EXCEPTION 'river:containment';END IF;
INSERT INTO river_proof_result VALUES(jsonb_build_object('passed',true,'installed',${installed},'rolled_back',true,'checks','closed admission, ownership, actual score, duplicate, replay, late replay, terminal, successor, abandon, ties, both course windows, timestamps, immutable results'));
END $outer$;SELECT value FROM river_proof_result;`;
 fs.writeFileSync(new URL(installed?'./hosted-installed.local.sql':'./hosted-candidate.local.sql',import.meta.url),query);
}
