// Disposable loopback database only. Never uses project credentials or hosted URLs.
import {connect,rpcFor} from '../database.mjs';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='dev/mega-card-golf/stand-pat-anytime/evidence.local/';
const baseline=JSON.parse(read(dir+'baseline.json'));
const registration=read('supabase/mega-card-golf/stand-pat-v4-register.sql','utf8');
const activation=read('supabase/mega-card-golf/stand-pat-v4-activate.sql','utf8');
const database='mega_golf_anytime_'+Date.now(),admin=await connect('template1');
await admin.query('CREATE DATABASE '+database+' TEMPLATE mega_golf_1792719651984');await admin.end();
const db=await connect(database),rpc=rpcFor(db),passed=[];
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
const pass=s=>{passed.push(s);console.log('PASS',s);};
try{
 const {createRun,applyIntent}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
 const {megaOperation}=await vite.ssrLoadModule('/server/megaCardGolf/service.ts');
 const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');
 for(const f of baseline.functions)await db.query(f.definition);
 for(const r of baseline.rulesets)await db.query('INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',[r.id,r.game,r.config,r.enabled]);
 // Git's Windows checkout has CRLF; PostgreSQL fingerprints qualified LF bodies.
 await db.query(read('supabase/migrations/20261024234530_mega_final_stock_stand_pat.sql','utf8').replaceAll('\r\n','\n'));
 await db.query(read('supabase/migrations/20261024234531_mega_final_stock_activate.sql','utf8'));
 const actor=(await db.query("SELECT id FROM public.profiles p WHERE private.arcade_allowed(id) AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id) AND NOT EXISTS(SELECT 1 FROM private.arcade_runs r WHERE r.user_id=p.id AND status='active') LIMIT 1")).rows[0].id;
 const other=(await db.query('SELECT id FROM public.profiles WHERE id<>$1 LIMIT 1',[actor])).rows[0].id;
 const hash=async()=> (await db.query("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) h FROM private.arcade_results t")).rows[0].h;
 const history=await hash();await db.query('BEGIN');await db.query(registration);
 await db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
 for(const version of [1,2,3]){
  await db.query("UPDATE private.arcade_rulesets SET enabled=(id=$1) WHERE game='mega-card-golf'",['mega-card-golf/'+version]);
  const req=randomUUID(),old=await rpc('arcade_mega_start',{p_actor:actor,p_request:req,p_course:'sunny-meadows'});assert.equal(old.ruleset,'mega-card-golf/'+version);
  await db.query(activation);assert.equal((await rpc('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:'sunny-meadows'})).id,old.id);
  await db.query("UPDATE private.arcade_runs SET status='abandoned' WHERE id=$1",[old.id]);
  assert.equal((await rpc('arcade_mega_start',{p_actor:actor,p_request:req,p_course:'sunny-meadows'})).ruleset,old.ruleset);
 }
 await db.query('ROLLBACK');assert.equal(await hash(),history);
 pass('Rollback: /1-/3 active runs and late receipts retain original versions; history unchanged');
 await db.query('BEGIN');await db.query(registration);await db.query(activation);await db.query('COMMIT');
 const adminActor=(await db.query('SELECT id FROM public.profiles WHERE is_superuser LIMIT 1')).rows[0].id;
 const settings=async(values)=>{const c=(await db.query("SELECT c.* FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id WHERE p.id='sunny-meadows'")).rows[0];return rpc('arcade_mega_save',{p_actor:adminActor,p_course:'sunny-meadows',p_revision:Number(c.revision),p_settings:{...c.settings,...values},p_choice:'retain'});};
 const action=(v,intent,requestId=randomUUID())=>megaOperation(rpc,actor,{op:'action',runId:v.id,revision:v.revision,hole:v.hole,requestId,intent});
 const start=async()=>{await db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");return megaOperation(rpc,actor,{op:'start',courseId:'sunny-meadows',requestId:randomUUID()});};
 const count=async(id)=>Number((await db.query('SELECT count(*) FROM private.arcade_results WHERE run_id=$1',[id])).rows[0].count);
 let cases=0;
 for(const stock of [1,3])for(const allowance of [0,1])for(const exposed of [0,2,5])for(const pending of [false,true]){
  await settings({holes:1,initialExposed:exposed,stockAllowance:stock,discardAllowance:allowance});let v=await start();assert.equal(v.ruleset,'mega-card-golf/4');
  if(exposed)await assert.rejects(action(v,{type:'stand-pat'}),/opening/);
  for(let i=0;i<exposed;i++)v=await action(v,{type:'open',indices:[i]});
  if(pending)v=await action(v,{type:'draw'});
  const row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),request=randomUUID(),next=await action(v,{type:'stand-pat'},request);
  assert.deepEqual(next.cards,row.state.cards);assert.equal(next.draws,v.draws);assert.equal(next.discards,v.discards);assert.equal(next.results[0].reason,'stand-pat');assert.equal(next.results[0].hidden.length,6-exposed);
  assert.equal((await action(v,{type:'stand-pat'},request)).revision,next.revision);
  await assert.rejects(action(v,{type:'draw'},request),/request_conflict/);
  await assert.rejects(action(v,{type:'draw'}),/stale_action/);
  await assert.rejects(megaOperation(rpc,other,{op:'state',runId:v.id}),/not_found|forbidden/);
  assert.equal((await megaOperation(rpc,actor,{op:'state',runId:v.id})).revision,next.revision);assert.equal(await count(v.id),1);cases++;
 }
 pass(cases+' actual service + SQL cases: remaining/final stock, zero/nonzero discards, pending/no pending, concealed/exposed, retry/conflict/reconnect/ownership');
 await settings({holes:1,initialExposed:0,stockAllowance:3,discardAllowance:0});
 const a=await connect(database),b=await connect(database);
 try{
  for(const sameRequest of [true,false]){
   const v=await start(),row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),done=applyIntent(row.state,{type:'stand-pat'},Number(row.server_at));
   const args={p_actor:actor,p_run:v.id,p_revision:v.revision,p_state:done,p_request:randomUUID(),p_fingerprint:'pat'};
   const results=await Promise.all([rpcFor(a)('arcade_mega_commit',args),rpcFor(b)('arcade_mega_commit',sameRequest?args:{...args,p_request:randomUUID(),p_fingerprint:'draw',p_state:applyIntent(row.state,{type:'draw'},Number(row.server_at))})]);
   assert.deepEqual(results.map(r=>r.outcome).sort(),sameRequest?['committed','duplicate']:['committed','conflict']);
   const current=await megaOperation(rpc,actor,{op:'state',runId:v.id});if(current.status==='active')await action(current,{type:'stand-pat'});assert.equal(await count(v.id),1);
  }
  const v=await start(),row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),done=applyIntent(row.state,{type:'stand-pat'},Number(row.server_at));
  await a.query('BEGIN');await a.query("UPDATE private.arcade_runs SET due_at=floor(extract(epoch FROM clock_timestamp())*1000)+100,state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)+100)) WHERE id=$1",[v.id]);
  const waiting=rpcFor(b)('arcade_mega_commit',{p_actor:actor,p_run:v.id,p_revision:v.revision,p_state:done,p_request:randomUUID(),p_fingerprint:'expiry'});
  await new Promise(r=>setTimeout(r,180));await a.query('COMMIT');assert.equal((await waiting).outcome,'deadline');
  const expired=await megaOperation(rpc,actor,{op:'state',runId:v.id});assert.equal(expired.results[0].reason,'timeout');assert.deepEqual(expired.cards,row.state.cards);assert.equal(await count(v.id),1);
  pass('Independent connections: duplicate, Stand Pat versus draw, and locked commit crossing expiry; exactly one result');
 }finally{await a.end();await b.end();}
 const raw=await rpc('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:'sunny-meadows'});
 async function recover(){const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '60 seconds'",[token]);await recoverArcade(rpc,token);}
 await recover();const initialized=await rpc('arcade_load',{p_actor:actor,p_run:raw.id});assert.equal(initialized.state.ruleset,'mega-card-golf/4');
 const elapsed=createRun(raw.id,actor,raw.config,initialized.state.decks,Date.now()-1e9,'mega-card-golf/4');
 await db.query('UPDATE private.arcade_runs SET state=$2,due_at=$3 WHERE id=$1',[raw.id,elapsed,elapsed.deadline]);await recover();assert.equal(await count(raw.id),1);
 pass('Shared recovery initializes /4 and completes elapsed zero-client runs');
 const bundle=(await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022'})).outputFiles[0].text;
 write(dir+'recovery-index.ts',bundle);write(dir+'proof.json',JSON.stringify({database,passed,cases,workerSha256:createHash('sha256').update(bundle).digest('hex')},null,2));
}finally{await vite.close();await db.end();}
