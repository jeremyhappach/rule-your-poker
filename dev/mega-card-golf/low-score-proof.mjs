import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createServer} from 'vite';
import {resolve} from 'node:path';
const dir='dev/mega-card-golf/backend.local',v=await createServer({configFile:false,cacheDir:resolve(dir,'low-score-cache'),server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
const {createRun,recoverRun}=await v.ssrLoadModule('/src/lib/megaCardGolf/engine.ts'),{INITIAL_COURSES}=await v.ssrLoadModule('/src/lib/megaCardGolf/config.ts');
const heads=[[1,14,12,0,25,39],[1,14,12,0,25,39],[0,1,2,3,4,5],[1,14,12,25,38,51]];
const states=heads.map(h=>{const deck=[...h,...Array.from({length:52},(_,i)=>i).filter(i=>!h.includes(i))];return recoverRun(createRun('fixture','fixture',INITIAL_COURSES[0],Array.from({length:9},()=>deck),Date.now()),Date.now()+1e9);});await v.close();
const migration=read('supabase/migrations/20261023150143_mega_card_golf_low_score_facts.sql','utf8');
const hash="SELECT md5(coalesce(string_agg(x,'|' ORDER BY x),'')) FROM(SELECT to_jsonb(row_data)::text x FROM private.arcade_results row_data UNION ALL SELECT to_jsonb(row_data)::text FROM private.arcade_runs row_data UNION ALL SELECT to_jsonb(row_data)::text FROM private.arcade_mega_configs row_data UNION ALL SELECT to_jsonb(row_data)::text FROM private.arcade_mega_courses row_data)t";
for(const installed of [false,true])write(dir+'/low-score-'+(installed?'installed':'candidate')+'.sql',`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='40s';
CREATE TEMP TABLE mega_facts_evidence(value jsonb) ON COMMIT DROP;
DO $proof$ DECLARE actor uuid:='d7dc1928-3727-4351-b0ff-0e80c81c2953';c jsonb;r jsonb;s jsonb;facts jsonb;expected jsonb;i integer:=0;g record;id_i uuid;before_hash text;passed boolean:=false;games jsonb:='[]';BEGIN
before_hash:=(${hash});BEGIN
${installed?'':`EXECUTE $migration$${migration}$migration$;`}
c:=public.arcade_mega_catalog(actor)#>'{courses,0}';
PERFORM public.arcade_mega_save(actor,'sunny-meadows',(c->>'revision')::bigint,c-ARRAY['id','configId','boardId','revision'],'archive');
UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1';
FOR s IN SELECT value FROM jsonb_array_elements('${JSON.stringify(states)}'::jsonb) LOOP
 i:=i+1;r:=public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows');s:=s||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config');
 PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s);
 SELECT record INTO facts FROM private.arcade_results WHERE run_id=(r->>'id')::uuid;
 IF facts->>'kind' IS DISTINCT FROM (ARRAY['first','matched','higher','broken'])[i] OR (facts->>'priorBest')::integer IS DISTINCT FROM (CASE WHEN i=1 THEN NULL ELSE -18 END) THEN RAISE EXCEPTION 'mega:low_score_fact_%_%',i,facts;END IF;
END LOOP;
FOR g IN SELECT DISTINCT ON(game) game,id,config FROM private.arcade_rulesets WHERE enabled AND game<>'mega-card-golf' ORDER BY game,id DESC LOOP
 expected:=private.score_record(g.game,g.id,actor,0);
 INSERT INTO private.arcade_runs(user_id,game,ruleset,config,status,score,revision) VALUES(actor,g.game,g.id,g.config,'completed',0,1) RETURNING id INTO id_i;
 INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record) VALUES(id_i,actor,g.game,g.id,0,1,clock_timestamp(),'{}','{}') RETURNING record INTO facts;
 IF facts IS DISTINCT FROM expected THEN RAISE EXCEPTION 'mega:existing_facts_changed_%',g.game;END IF;
 games:=games||to_jsonb(g.game);
END LOOP;
passed:=true;RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='mega:rollback';
EXCEPTION WHEN SQLSTATE 'P0004' THEN IF SQLERRM<>'mega:rollback' THEN RAISE;END IF;END;
IF NOT passed OR before_hash IS DISTINCT FROM (${hash}) THEN RAISE EXCEPTION 'mega:facts_containment';END IF;
INSERT INTO mega_facts_evidence VALUES(jsonb_build_object('passed',true,'installed',${installed},'lowScoreKinds','first, matched, higher, broken','courseBoardIsolation',true,'existingGames',games,'allFixtureRowsRolledBack',true));
END $proof$;SELECT value FROM mega_facts_evidence;`);
console.log('Prepared low-score facts rollback proofs.');
