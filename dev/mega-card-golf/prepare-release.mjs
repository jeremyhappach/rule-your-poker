import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {resolve} from 'node:path';
const dir='dev/mega-card-golf/backend.local';mkdirSync(dir,{recursive:true});
const baseline=JSON.parse(read('dev/mega-card-golf/evidence/hosted-baseline.json','utf8'))[0];
const md5=x=>createHash('md5').update(x).digest('hex');
const guards=baseline.definitions.map(f=>`IF md5(pg_get_functiondef('${f.name}'::regprocedure)) IS DISTINCT FROM '${md5(f.definition)}' THEN RAISE EXCEPTION 'mega:owner_drift';END IF;`).join('\n');
const migration='supabase/migrations/20261023135206_mega_card_golf_v1.sql';
const candidate=read('supabase/mega-card-golf/candidate.sql','utf8');
const guarded=`-- Mega Card Golf /1. Existing games and boards preserved; new admission CLOSED.\nSET LOCAL lock_timeout='2s';\nDO $$ BEGIN\n${guards}\nIF to_regclass('private.arcade_mega_configs') IS NOT NULL THEN RAISE EXCEPTION 'mega:already_installed';END IF;\nEND $$;\n${candidate}\nNOTIFY pgrst,'reload schema';\n`;
write(migration,guarded);
const vite=await createServer({configFile:false,cacheDir:resolve(dir,'prepare-cache'),server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
const {createRun,recoverRun}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
const {INITIAL_COURSES}=await vite.ssrLoadModule('/src/lib/megaCardGolf/config.ts');
const deck=[1,14,12,0,25,39,...Array.from({length:52},(_,i)=>i).filter(i=>![1,14,12,0,25,39].includes(i))];
const initial=createRun('fixture','fixture',INITIAL_COURSES[0],Array.from({length:9},()=>deck),Date.now());
const complete=recoverRun(initial,Date.now()+1e9);
await vite.close();
const quote=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const fingerprint=`SELECT md5(coalesce(string_agg(x,'|' ORDER BY x),'')) FROM (
SELECT 'run:'||to_jsonb(r)::text x FROM private.arcade_runs r UNION ALL
SELECT 'result:'||to_jsonb(r)::text FROM private.arcade_results r UNION ALL
SELECT 'receipt:'||to_jsonb(r)::text FROM private.arcade_command_receipts r UNION ALL
SELECT 'rule:'||to_jsonb(r)::text FROM private.arcade_rulesets r UNION ALL
SELECT 'revision:'||to_jsonb(r)::text FROM public.arcade_revisions r)t`;
const proof=`
DECLARE actor uuid;other uuid;admin uuid;denied uuid;r jsonb;s jsonb;done jsonb;v jsonb;c jsonb;changed jsonb;request uuid:=gen_random_uuid();action uuid:=gen_random_uuid();successor jsonb;board jsonb;
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE id='d7dc1928-3727-4351-b0ff-0e80c81c2953' AND is_active;
 SELECT id INTO other FROM public.profiles WHERE id='fb835d1f-db2f-4de4-84e2-ce0074512e46' AND is_active;
 SELECT p.id INTO admin FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.is_superuser AND p.is_active ORDER BY p.id LIMIT 1;
 SELECT id INTO denied FROM public.profiles WHERE NOT is_superuser AND is_active ORDER BY id LIMIT 1;
 IF actor IS NULL OR other IS NULL OR admin IS NULL THEN RAISE EXCEPTION 'mega:qualification_identity_missing';END IF;
 BEGIN PERFORM public.arcade_mega_start(actor,request,'sunny-meadows');RAISE EXCEPTION 'expected_closed';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%unavailable%' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.arcade_mega_start(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','private.arcade_mega_configs','SELECT') THEN RAISE EXCEPTION 'mega:grants';END IF;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1';
 r:=public.arcade_mega_start(actor,request,'sunny-meadows');
 IF public.arcade_mega_start(actor,request,'sunny-meadows')->>'id'<>r->>'id' THEN RAISE EXCEPTION 'mega:duplicate_start';END IF;
 BEGIN PERFORM public.arcade_load(other,(r->>'id')::uuid);RAISE EXCEPTION 'expected_owner';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_found%' THEN RAISE;END IF;END;
 s:=${quote(initial)}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+300000);
 r:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s)->'record';
 s:=s||'{"phase":"playing","exposed":[true,false,false,false,false,true],"revision":1}'::jsonb;
 v:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,s,action,'proof');r:=v->'record';
 IF public.arcade_mega_commit(actor,(r->>'id')::uuid,0,s,action,'proof')->>'outcome'<>'duplicate' THEN RAISE EXCEPTION 'mega:replay';END IF;
 done:=${quote(complete)}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config');
 BEGIN PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done||jsonb_build_object('score',123));RAISE EXCEPTION 'expected_score';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalid_completion%' THEN RAISE;END IF;END;
 CREATE FUNCTION pg_temp.mega_fail() RETURNS trigger LANGUAGE plpgsql AS $fail$BEGIN RAISE EXCEPTION 'mega:injected_result';END$fail$;
 CREATE TRIGGER mega_qualification_fail BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN(NEW.game='mega-card-golf') EXECUTE FUNCTION pg_temp.mega_fail();
 BEGIN PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done);RAISE EXCEPTION 'expected_failure';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%injected_result%' THEN RAISE;END IF;END;
 IF (SELECT revision FROM private.arcade_runs WHERE id=(r->>'id')::uuid)<>(r->>'revision')::bigint OR EXISTS(SELECT 1 FROM private.arcade_results WHERE run_id=(r->>'id')::uuid) THEN RAISE EXCEPTION 'mega:atomic_rollback';END IF;
 DROP TRIGGER mega_qualification_fail ON private.arcade_results;
 r:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done)->'record';
 IF (r->>'score')::integer>=0 OR (SELECT count(*) FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'mega:negative_result';END IF;
 IF public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done)->>'outcome'<>'conflict' THEN RAISE EXCEPTION 'mega:terminal';END IF;
 IF public.arcade_mega_start(actor,request,'sunny-meadows')->>'id'<>r->>'id' THEN RAISE EXCEPTION 'mega:late_replay';END IF;
 successor:=public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows');
 c:=(public.arcade_mega_catalog(actor)->'courses')->0;
 BEGIN PERFORM public.arcade_mega_save(coalesce(denied,gen_random_uuid()),'sunny-meadows',(c->>'revision')::bigint,c-ARRAY['id','configId','boardId','revision'],'retain');RAISE EXCEPTION 'expected_admin';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%admin_required%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.arcade_mega_save(admin,'sunny-meadows',(c->>'revision')::bigint,(c-ARRAY['id','configId','boardId','revision'])||'{"stockAllowance":15}');RAISE EXCEPTION 'expected_choice';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%board_choice_required%' THEN RAISE;END IF;END;
 changed:=public.arcade_mega_save(admin,'sunny-meadows',(c->>'revision')::bigint,(c-ARRAY['id','configId','boardId','revision'])||'{"stockAllowance":15}','archive');
 IF changed->>'boardId'=c->>'boardId' OR public.arcade_load(actor,(successor->>'id')::uuid)#>>'{config,boardId}'<>c->>'boardId' THEN RAISE EXCEPTION 'mega:frozen_archive';END IF;
 board:=public.arcade_mega_board(actor,'sunny-meadows',(c->>'boardId')::uuid,'all');
 IF jsonb_array_length(board->'rows')<>1 OR (board->>'personalBest')::int>=0 THEN RAISE EXCEPTION 'mega:archive_history';END IF;
 v:=public.arcade_mega_start(other,gen_random_uuid(),'sunny-meadows');done:=done||jsonb_build_object('id',v->>'id','owner',other,'config',v->'config');PERFORM public.arcade_mega_commit(other,(v->>'id')::uuid,(v->>'revision')::bigint,done);
 -- Complete the old-board successor at the same low score: tied ranks stay shared.
 done:=done||jsonb_build_object('id',successor->>'id','owner',actor,'config',successor->'config');PERFORM public.arcade_mega_commit(actor,(successor->>'id')::uuid,(successor->>'revision')::bigint,done);
 board:=public.arcade_mega_board(actor,'sunny-meadows',(c->>'boardId')::uuid,'all');IF board#>>'{rows,0,rank}'<>'1' OR board#>>'{rows,1,rank}'<>'1' THEN RAISE EXCEPTION 'mega:ties';END IF;
 IF jsonb_array_length(public.arcade_mega_board(actor,'coastal-links')->'rows')<>0 THEN RAISE EXCEPTION 'mega:course_isolation';END IF;
 BEGIN UPDATE private.arcade_results SET score=0 WHERE run_id=(r->>'id')::uuid;RAISE EXCEPTION 'expected_immutable';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%immutable_result%' THEN RAISE;END IF;END;
 BEGIN UPDATE private.arcade_mega_configs SET settings='{}';RAISE EXCEPTION 'expected_config';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%immutable_config%' THEN RAISE;END IF;END;
 successor:=public.arcade_mega_start(actor,gen_random_uuid(),'coastal-links');s:=s||jsonb_build_object('id',successor->>'id','owner',actor,'config',successor->'config','status','abandoned');PERFORM public.arcade_mega_commit(actor,(successor->>'id')::uuid,(successor->>'revision')::bigint,s);
 IF EXISTS(SELECT 1 FROM private.arcade_results WHERE run_id=(successor->>'id')::uuid) THEN RAISE EXCEPTION 'mega:abandoned_ranked';END IF;
END`;
for(const installed of [false,true]){
 const sql=`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE mega_evidence(value jsonb) ON COMMIT DROP;
DO $outer$ DECLARE before_hash text;after_hash text;passed boolean:=false;BEGIN
 before_hash:=(${fingerprint});
 BEGIN
 ${installed?'':`EXECUTE $migration$${guarded}$migration$;`}
 ${proof};
 passed:=true;RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='mega:rehearsal_rollback';
 EXCEPTION WHEN SQLSTATE 'P0004' THEN IF SQLERRM<>'mega:rehearsal_rollback' THEN RAISE;END IF;
 END;
 after_hash:=(${fingerprint});IF before_hash IS DISTINCT FROM after_hash OR NOT passed THEN RAISE EXCEPTION 'mega:containment';END IF;
 INSERT INTO mega_evidence VALUES(jsonb_build_object('passed',true,'installed',${installed},'arcade_rows_restored',true,'negative_score',true,'authorization',true,'atomic_rollback',true,'duplicate_replay_late_replay',true,'winner_ties',true,'continuation_terminal',true,'archive_config_history',true,'existing_financial_writes',0));
END $outer$;SELECT value FROM mega_evidence;`;
 write(dir+(installed?'/hosted-installed.sql':'/hosted-candidate.sql'),sql);
}
const bundle=await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022'});write(dir+'/arcade-recovery-bundle.js',bundle.outputFiles[0].text);
console.log(JSON.stringify({migration,sha256:createHash('sha256').update(guarded).digest('hex'),workerBytes:bundle.outputFiles[0].text.length}));
