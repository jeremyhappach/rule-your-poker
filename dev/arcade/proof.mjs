// Disposable loopback database. Actual cloned canonical triggers stay enabled.
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const options={host:'127.0.0.1',port:55439,user:'tri_test'},database='arcade_phase1_'+Date.now();
const root=new pg.Client({...options,database:'template1'});await root.connect();
await root.query('CREATE DATABASE '+database+' TEMPLATE postgres');
const db=new pg.Client({...options,database});await db.connect();
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const cases=[],pass=name=>{cases.push(name);console.log('PASS',name);};
const scalar=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.value;
const rpcFor=client=>async(name,args)=>{const keys=Object.keys(args);return (await client.query('SELECT public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;};
const rpc=rpcFor(db);
try{
 await db.query("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY); CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE IF NOT EXISTS cron.job(jobid bigserial,jobname text,schedule text,active boolean); CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$ INSERT INTO cron.job(jobname,schedule,active) VALUES($1,$2,true) RETURNING jobid $$");
 const sql=readFileSync('supabase/arcade/phase-one.sql','utf8').replace(/\r\n/g,'\n');
 await db.query('BEGIN');await db.query(sql);await db.query('ROLLBACK');pass('candidate DDL rolls back without artifacts');
 assert.equal(await scalar("SELECT to_regclass('private.arcade_runs') value"),null);
 await db.query(sql);
 if(process.argv.includes('--installed')){
  const installed=JSON.parse(readFileSync('dev/arcade/installed.evidence.json','utf8'));
  for(const f of installed.functions)assert.equal(await scalar("SELECT md5(pg_get_functiondef($1::regprocedure)) value",[f.signature]),f.hash,f.signature);
  const indexes=(await db.query("SELECT indexdef FROM pg_indexes WHERE tablename LIKE 'arcade_%' ORDER BY indexname")).rows.map(r=>r.indexdef);
  assert.deepEqual(indexes,installed.indexes);
  pass('installed production function hashes and indexes match complete proof authority');
 }
 const {createSoloRun,applySolo,advanceSolo,nextDue,soloProjection}=await vite.ssrLoadModule('/src/lib/arcade/run21.ts');
 const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');
 const users=Array.from({length:14},()=>randomUUID());
 for(const [i,user]of users.entries()){
  await db.query('INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
  await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[user,'Arcade proof '+i]);
 }
 await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp()");
 const targets=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','private') AND tablename NOT LIKE 'arcade_%' AND tablename NOT IN('profiles','system_settings')")).rows;
 await db.query("CREATE FUNCTION private.arcade_proof_no_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Arcade wrote non-Arcade table %',TG_TABLE_NAME;END$$");
 for(const t of targets)await db.query('CREATE TRIGGER arcade_proof_no_write BEFORE INSERT OR UPDATE OR DELETE ON "'+t.schemaname+'"."'+t.tablename+'" FOR EACH STATEMENT EXECUTE FUNCTION private.arcade_proof_no_write()');
 const begin=async(user=users[0],request=randomUUID())=>rpc('arcade_start',{p_actor:user,p_request:request,p_game:'run21'});
 const req=randomUUID(),run=await begin(users[0],req);
 assert.equal((await begin(users[0],req)).id,run.id);assert.equal((await begin()).id,run.id);pass('idempotent start and one unfinished run');
 await assert.rejects(()=>rpc('arcade_load',{p_actor:users[1],p_run:run.id}),/not_found/);
 await assert.rejects(()=>rpc('arcade_start',{p_actor:users[1],p_request:randomUUID(),p_game:'yahtzee'}),/unavailable/);
 for(const role of ['anon','authenticated']){
  await db.query('SET ROLE '+role);
  await assert.rejects(()=>rpc('arcade_load',{p_actor:users[0],p_run:run.id}),/permission denied/);
  await assert.rejects(()=>db.query('SELECT * FROM private.arcade_runs'),/permission denied/);
  await db.query('RESET ROLE');
 }
 pass('authorization and private schema deny browser access');
 await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[users[0]]);
 await assert.rejects(()=>begin(),/forbidden/);
 await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[users[0]]);
 await assert.rejects(()=>db.query("UPDATE private.arcade_rulesets SET config='{}'"),/immutable_ruleset/);
 pass('revocation and immutable rules');
 let state=createSoloRun(run,Date.now()-10000);
 const commit=async(row,s,request=null,fingerprint=null,client=rpc)=>client('arcade_commit',{p_actor:row.user_id,p_run:row.id,p_revision:row.revision,p_state:s,p_due:nextDue(s),p_request:request,p_fingerprint:fingerprint});
 let result=await commit(run,state),row=result.record;
 const at=state.updatedAt+2500;state=applySolo(state,{type:'place',column:0},at);
 const request=randomUUID();result=await commit(row,state,request,'place');
 assert.equal(result.outcome,'committed');assert.equal((await commit(row,state,request,'place')).outcome,'duplicate');
 await assert.rejects(()=>commit(row,state,request,'different'),/request_conflict/);
 assert.equal((await commit(row,state,randomUUID(),'late')).outcome,'conflict');row=result.record;
 pass('duplicate, mismatched replay and stale revision');
 const peer=new pg.Client({...options,database});await peer.connect();
 const raced=applySolo(state,{type:'pass'},at+10);
 const concurrent=await Promise.all([commit(row,raced,randomUUID(),'race',rpc),commit(row,raced,randomUUID(),'race',rpcFor(peer))]);await peer.end();
 assert.deepEqual(concurrent.map(x=>x.outcome).sort(),['committed','conflict']);row=concurrent.find(x=>x.outcome==='committed').record;state=raced;pass('competing independent connections commit once');
 for(let n=0;n<3;n++){
  if(state.board.startedAt===null)state=applySolo(state,{type:'place',column:0},state.board.firstPlacementDeadline-30000);
  state=advanceSolo(state,state.board.deadline);
  if(n<2)state=advanceSolo(state,state.presentation.endsAt);
 }
 assert.equal(state.status,'completed');assert.equal(state.results.length,3);
 await db.query("CREATE FUNCTION private.arcade_proof_fail_result() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected result failure';END$$; CREATE TRIGGER arcade_fail_result BEFORE INSERT ON private.arcade_results FOR EACH ROW EXECUTE FUNCTION private.arcade_proof_fail_result()");
 await assert.rejects(()=>commit(row,state),/injected result failure/);
 assert.equal(Number(await scalar('SELECT revision value FROM private.arcade_runs WHERE id=$1',[row.id])),row.revision);
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[row.id]),0);
 await db.query('DROP TRIGGER arcade_fail_result ON private.arcade_results');
 row=(await commit(row,state)).record;
 assert.equal((await commit(row,state)).outcome,'conflict');
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[row.id]),1);
 await assert.rejects(()=>db.query('UPDATE private.arcade_results SET score=1 WHERE run_id=$1',[row.id]),/immutable_result/);
 pass('atomic final state/result, failure rollback and exactly once completion');
 assert.equal((await begin(users[0],req)).id,run.id);
 const successor=await begin();assert.notEqual(successor.id,run.id);
 assert.equal((await commit(row,state)).outcome,'conflict');pass('late start replay and successor isolation');
 const abandoned=applySolo(createSoloRun(successor,Date.now()),{type:'abandon'},Date.now());
 await commit(successor,abandoned);assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[successor.id]),0);pass('abandonment excluded');
 const expired=await begin();let expiredState=createSoloRun(expired,Date.now()-40000);await commit(expired,expiredState);
 const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[token]);
 await recoverArcade(rpc,token);
 assert.equal(await scalar('SELECT status value FROM private.arcade_runs WHERE id=$1',[expired.id]),'expired');
 await assert.rejects(()=>recoverArcade(rpc,token),/recovery_denied/);pass('zero-client expiry recovery and single-use dispatch');
 const terminalRun=await begin();let terminal=createSoloRun(terminalRun,Date.now()-1000000);
 for(let i=0;i<3;i++){
  terminal=applySolo(terminal,{type:'place',column:0},terminal.board.firstPlacementDeadline-30000);
  if(i<2){terminal=advanceSolo(terminal,terminal.board.deadline);terminal=advanceSolo(terminal,terminal.presentation.endsAt);}
 }
 await commit(terminalRun,terminal);
 const coldToken=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[coldToken]);
 await promisify(execFile)(process.execPath,['dev/arcade/recovery-worker.mjs',database,coldToken],{windowsHide:true});
 assert.equal(await scalar('SELECT status value FROM private.arcade_runs WHERE id=$1',[terminalRun.id]),'completed');
 assert.equal(await scalar('SELECT count(*)::int value FROM private.arcade_results WHERE run_id=$1',[terminalRun.id]),1);
 pass('fresh worker process finalizes third round with zero browsers');
 for(let i=0;i<users.length;i++){
  const item=await begin(users[i]);let s=createSoloRun(item,Date.now());
  s.status='completed';s.round=3;s.score=i===0?0:100+i;s.results=[0,0,s.score].map(score=>({reason:'collect',score,at:Date.now(),aggregate:100,totals:[],aceElevations:[],multiplier:200,speed:1}));
  await commit(item,s);
 }
 const board=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'30',p_result:run.id});
 assert.equal(board.rows.length,10);assert.equal(board.self.rank,14);assert.equal(board.personalBest,0);assert.equal(board.latestResult.score,0);
 assert.equal(new Set(board.rows.map(x=>x.userId)).size,10);
 pass('top ten distinct players, outside-ten rank and permanent personal best');
 const seed=async(user,score,age,version='run21/arcade-1')=>{
  const id=randomUUID();
  await db.query("INSERT INTO private.arcade_runs(id,user_id,game,ruleset,config,status,score) SELECT $1,$2,'run21',$3,config,'completed',$4 FROM private.arcade_rulesets WHERE id=$3",[id,user,version,score]);
  await db.query("INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state) VALUES($1,$2,'run21',$3,$4,0,statement_timestamp()-$5::interval,'{}')",[id,user,version,score,age]);
 };
 await seed(users[0],9999,'31 days');await seed(users[12],113,'1 hour');
 const monthly=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'30'});
 const lifetime=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all'});
 assert.equal(monthly.self.rank,14);assert.equal(monthly.personalBest,9999);assert.equal(lifetime.self.rank,1);
 assert.equal(monthly.rows[0].rank,1);assert.equal(monthly.rows[1].rank,1);assert.equal(monthly.rows[2].rank,3);
 await db.query("INSERT INTO private.arcade_rulesets SELECT 'run21/arcade-0',game,config,false FROM private.arcade_rulesets WHERE id='run21/arcade-1'");
 await seed(users[0],100000,'1 hour','run21/arcade-0');
 const versions=await rpc('arcade_leaderboard',{p_actor:users[0],p_game:'run21',p_window:'all'});
 assert.equal(versions.personalBest,9999);assert.equal(versions.previousBests[0].score,100000);
 pass('rolling eligibility, equal-score ranks, lifetime best and incompatible-version separation');
 const safe=soloProjection({...row,state,server_at:Date.now()},'You',Date.now());assert.equal('deck' in safe,false);assert.equal('deck' in safe.view,false);pass('redacted projection');
 if(process.argv.includes('--scoring')){
  const {proveScoring}=await import('./scoring.proof.mjs');
  await proveScoring({db,rpc,scalar,users,begin,commit,vite,database,pass});
 }
 assert.ok(targets.length>50);pass('zero writes across '+targets.length+' non-Arcade tables with canonical triggers enabled');
 mkdirSync('dev/arcade',{recursive:true});writeFileSync(process.argv.includes('--scoring')?'dev/arcade/scoring.proof.evidence.json':'dev/arcade/proof.evidence.json',JSON.stringify({database,productionWrites:0,passed:cases,at:new Date().toISOString()},null,2));
}finally{await vite.close();await db.end();await root.query('DROP DATABASE '+database+' WITH (FORCE)');await root.end();}

