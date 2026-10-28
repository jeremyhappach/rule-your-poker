import {connect,rpcFor} from './database.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir='dev/mega-card-golf/backend.local';mkdirSync(dir,{recursive:true});
const database='mega_golf_'+Date.now(),root=await connect('template1');
await root.query('CREATE DATABASE '+database+' TEMPLATE golf_installed_1792622077466');await root.end();
const db=await connect(database),rpc=rpcFor(db),passed=[];
const vite=await createServer({configFile:false,cacheDir:resolve(dir,'vite'),server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',resolve:{alias:{'@':resolve('src')}},optimizeDeps:{noDiscovery:true,entries:[]}});
const pass=s=>{passed.push(s);console.log('PASS',s);};
const scalar=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.value;
const reject=async(fn,match)=>{await db.query('SAVEPOINT expected_failure');try{await assert.rejects(fn,match);}finally{await db.query('ROLLBACK TO SAVEPOINT expected_failure');await db.query('RELEASE SAVEPOINT expected_failure');}};
const sql=readFileSync('supabase/mega-card-golf/candidate.sql','utf8');
const {createRun,recoverRun,applyIntent}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
const {megaOperation}=await vite.ssrLoadModule('/server/megaCardGolf/service.ts');
const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');
const deck=()=>Array.from({length:52},(_,i)=>i),now=()=>Date.now();
const users=[randomUUID(),randomUUID(),randomUUID()];
try{
 const schema=(await db.query("SELECT conrelid::regclass::text relation,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN('private.arcade_runs'::regclass,'private.arcade_results'::regclass,'private.arcade_command_receipts'::regclass)")).rows;
 const indexes=(await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='private' AND tablename LIKE 'arcade_%'")).rows;
 writeFileSync(dir+'/schema.json',JSON.stringify({source:'local clone of golf_installed_1792622077466',schema,indexes},null,2));
 // Existing clone is isolated; source databases and production remain untouched.
 if(!await scalar("SELECT to_regprocedure('private.golf_score(jsonb)')::text value"))throw Error('Canonical Golf scorer missing from local baseline');
 if(!await scalar("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='arcade_results' AND column_name='record') value"))throw Error('Arcade completion baseline missing');
 for(const [i,id]of users.entries()){await db.query('INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active,is_superuser) VALUES($1,$2,true,$3)',[id,'Mega proof '+i,i===0]);}
 await db.query("UPDATE private.arcade_runs SET status='abandoned' WHERE status='active'");
 const guardTargets=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','private') AND tablename NOT LIKE 'arcade_%'")).rows;
 async function enableGuards(){await db.query("CREATE OR REPLACE FUNCTION private.mega_proof_no_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Mega non-Arcade write: %',TG_TABLE_NAME;END$$");for(const t of guardTargets)await db.query('CREATE TRIGGER mega_proof_guard BEFORE INSERT OR UPDATE OR DELETE ON "'+t.schemaname+'"."'+t.tablename+'" FOR EACH STATEMENT EXECUTE FUNCTION private.mega_proof_no_write()');}
 const beat=()=>db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
 const start=async(actor=users[0],course='sunny-meadows',request=randomUUID())=>rpc('arcade_mega_start',{p_actor:actor,p_request:request,p_course:course});
 const commit=(row,state,request=null,client=rpc)=>client('arcade_mega_commit',{p_actor:row.user_id,p_run:row.id,p_revision:Number(row.revision),p_state:state,p_request:request,p_fingerprint:request?'proof':null});
 async function cases(label){
  await beat();await reject(()=>start(),/unavailable/);
  await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1'");
  for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);await reject(()=>db.query('SELECT * FROM private.arcade_mega_configs'),/permission denied/);await reject(()=>start(),/permission denied/);await db.query('RESET ROLE');}
  pass(label+': roles and closed admission');
  const request=randomUUID(),row=await start(users[0],'sunny-meadows',request);assert.equal((await start(users[0],'sunny-meadows',request)).id,row.id);
  await reject(()=>rpc('arcade_load',{p_actor:users[1],p_run:row.id}),/not_found/);
  let state=createRun(row.id,row.user_id,row.config,Array.from({length:9},deck),now()-1000);
  let current=(await commit(row,state)).record;
  const opened=applyIntent(state,{type:'open',indices:[0,5]},now());const actionId=randomUUID();
  current=(await commit(current,opened,actionId)).record;
  assert.equal((await commit({...current,revision:0},opened,actionId)).outcome,'duplicate');
  const completed=recoverRun(opened,now()+1e9);
  const bad={...completed,score:completed.score+1};await reject(()=>commit(current,bad),/invalid_completion/);
  await db.query("CREATE FUNCTION private.mega_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected mega result';END$$;CREATE TRIGGER mega_fail_result BEFORE INSERT ON private.arcade_results FOR EACH ROW WHEN(NEW.game='mega-card-golf') EXECUTE FUNCTION private.mega_fail_result()");
  await reject(()=>commit(current,completed),/injected mega result/);assert.equal(Number(await scalar('SELECT revision value FROM private.arcade_runs WHERE id=$1',[row.id])),Number(current.revision));
  await db.query('DROP TRIGGER mega_fail_result ON private.arcade_results;DROP FUNCTION private.mega_fail_result()');
  current=(await commit(current,completed)).record;assert.equal((await commit(current,completed)).outcome,'conflict');assert.equal(Number(await scalar('SELECT count(*) value FROM private.arcade_results WHERE run_id=$1',[row.id])),1);
  assert.equal((await start(users[0],'sunny-meadows',request)).id,row.id);const successor=await start();assert.notEqual(successor.id,row.id);
  pass(label+': winner, immutable actual score, rollback, duplicate, replay, late replay, continuation and terminal');
  const c=(await rpc('arcade_mega_catalog',{p_actor:users[0]})).courses[0];const {id,configId,boardId,revision,...base}=c;
  await reject(()=>rpc('arcade_mega_save',{p_actor:users[1],p_course:id,p_revision:revision,p_settings:base,p_choice:'retain'}),/admin_required/);
  await reject(()=>rpc('arcade_mega_save',{p_actor:users[0],p_course:id,p_revision:revision,p_settings:{...base,stockAllowance:15}}),/board_choice_required/);
  const next=await rpc('arcade_mega_save',{p_actor:users[0],p_course:id,p_revision:revision,p_settings:{...base,stockAllowance:15},p_choice:'archive'});assert.notEqual(next.boardId,boardId);
  assert.equal((await rpc('arcade_load',{p_actor:users[0],p_run:successor.id})).config.boardId,boardId);
  const oldBoard=await rpc('arcade_mega_board',{p_actor:users[0],p_course:id,p_board:boardId,p_window:'all'});assert.equal(oldBoard.rows.length,1);
  const other=await start(users[1]);const otherState=recoverRun(createRun(other.id,other.user_id,other.config,Array.from({length:9},deck),now()),now()+1e9);await commit(other,otherState);
  const third=await start(users[2]);await commit(third,recoverRun(createRun(third.id,third.user_id,third.config,Array.from({length:9},deck),now()),now()+1e9));
  const board=await rpc('arcade_mega_board',{p_actor:users[0],p_course:id,p_window:'all'});assert.deepEqual(board.rows.map(r=>r.rank),[1,1]);assert.equal((await rpc('arcade_mega_board',{p_actor:users[0],p_course:'coastal-links'})).rows.length,0);
  await reject(()=>db.query("UPDATE private.arcade_mega_configs SET settings='{}' WHERE id=$1",[next.configId]),/immutable_config/);
  await reject(()=>db.query('UPDATE private.arcade_results SET score=0 WHERE run_id=$1',[row.id]),/immutable_result/);
  pass(label+': ties, course isolation, admin auth, archive, frozen active config and immutable history');
  // Abandoned/incomplete runs never record scores. Untouched opening hands recover with six concealed cards.
  const abandoned=createRun(successor.id,successor.user_id,successor.config,Array.from({length:9},deck),now());await commit(successor,applyIntent(abandoned,{type:'abandon'},now()));
  assert.equal(Number(await scalar('SELECT count(*) value FROM private.arcade_results WHERE run_id=$1',[successor.id])),0);
  pass(label+': incomplete and abandoned exclusion');
 }
 await db.query('BEGIN');await db.query(sql);await enableGuards();await cases('rollback');await db.query('ROLLBACK');pass('entire candidate proof rolled back before installation');
 assert.equal(await scalar("SELECT to_regclass('private.arcade_mega_configs')::text value"),null);
 await db.query('BEGIN');await db.query(sql);await db.query('COMMIT');await db.query('BEGIN');await enableGuards();await cases('installed local');await db.query('COMMIT');
 const peer=await connect(database);try{
  await beat();const row=await start();const state=createRun(row.id,row.user_id,row.config,Array.from({length:9},deck),now());const race=await Promise.all([commit(row,state,null,rpc),commit(row,state,null,rpcFor(peer))]);assert.deepEqual(race.map(x=>x.outcome).sort(),['committed','conflict']);
  pass('independent PostgreSQL connections commit one revision');
  const old=createRun(row.id,row.user_id,row.config,Array.from({length:9},deck),now()-1e9);const r=race.find(x=>x.outcome==='committed').record;await commit(r,old);
  const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);await recoverArcade(rpc,token);
  assert.equal(await scalar('SELECT status value FROM private.arcade_runs WHERE id=$1',[row.id]),'completed');pass('existing Arcade recovery dispatch finishes nine untouched holes with zero clients');
 }finally{await peer.end();}
 await db.query("UPDATE private.arcade_rulesets SET enabled=false WHERE id='mega-card-golf/1'");
 pass('zero writes guarded across '+guardTargets.length+' existing non-Arcade tables; local admission restored closed');
 writeFileSync(dir+'/context.json',JSON.stringify({database,users}));
 writeFileSync('dev/mega-card-golf/evidence/backend-proof.json',JSON.stringify({database,source:'local snapshot, not hosted verification',passed,nonArcadeTablesGuarded:guardTargets.length,productionWrites:0},null,2));
}catch(e){console.error(e);writeFileSync(dir+'/failure.json',JSON.stringify({database,passed,error:String(e)},null,2));process.exitCode=1;}
finally{await vite.close();await db.end();}
