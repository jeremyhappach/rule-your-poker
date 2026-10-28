import {connect,rpcFor} from '../database.mjs';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const dir='dev/mega-card-golf/final-stock/evidence.local/';
const baseline=JSON.parse(read(dir+'baseline.json'));
const migration=read('supabase/migrations/20261024234530_mega_final_stock_stand_pat.sql','utf8');
const activation=read('supabase/migrations/20261024234531_mega_final_stock_activate.sql','utf8');
const database='mega_golf_stand_pat_'+Date.now(),admin=await connect('template1');
await admin.query('CREATE DATABASE '+database+' TEMPLATE mega_golf_1792719651984');await admin.end();
const db=await connect(database),rpc=rpcFor(db),passed=[];
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
const pass=s=>{passed.push(s);console.log('PASS',s);};
try{
 const {createRun,applyIntent,recoverRun}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
 const {megaOperation}=await vite.ssrLoadModule('/server/megaCardGolf/service.ts');
 const {recoverArcade}=await vite.ssrLoadModule('/server/arcade/service.ts');
 for(const f of baseline.functions)await db.query(f.definition);
 for(const r of baseline.rulesets)await db.query('INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',[r.id,r.game,r.config,r.enabled]);
 const actors=(await db.query("SELECT id FROM public.profiles p WHERE private.arcade_allowed(id) AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p.id) AND NOT EXISTS(SELECT 1 FROM private.arcade_runs r WHERE r.user_id=p.id AND status='active') LIMIT 2")).rows.map(r=>r.id);
 assert.equal(actors.length,2);const [actor,other]=actors;
 const hash=async()=> (await db.query("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) h FROM private.arcade_results t")).rows[0].h;
 const history=await hash();await db.query('BEGIN');await db.query(migration);
 await db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
 const oldRequest=randomUUID(),old=await rpc('arcade_mega_start',{p_actor:actor,p_request:oldRequest,p_course:'sunny-meadows'});assert.equal(old.ruleset,'mega-card-golf/2');
 await db.query(activation);assert.equal((await rpc('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:'sunny-meadows'})).id,old.id);
 await db.query("UPDATE private.arcade_runs SET status='abandoned' WHERE id=$1",[old.id]);assert.equal((await rpc('arcade_mega_start',{p_actor:actor,p_request:oldRequest,p_course:'sunny-meadows'})).id,old.id);
 pass('Disabled /3 falls back to /2; activation preserves old active runs and late receipts');
 const action=(v,intent,requestId=randomUUID(),client=rpc)=>megaOperation(client,actor,{op:'action',runId:v.id,revision:v.revision,hole:v.hole,requestId,intent});
 const adminActor=(await db.query("SELECT id FROM public.profiles WHERE is_superuser LIMIT 1")).rows[0].id;
 const saveSettings=async(course,values)=>{const c=(await db.query('SELECT c.* FROM private.arcade_mega_configs c JOIN private.arcade_mega_courses p ON p.config_id=c.id WHERE p.id=$1',[course])).rows[0];return rpc('arcade_mega_save',{p_actor:adminActor,p_course:course,p_revision:Number(c.revision),p_settings:{...c.settings,...values},p_choice:'retain'});};
 const tiny=allowance=>saveSettings('sunny-meadows',{holes:1,initialExposed:0,stockAllowance:1,discardAllowance:allowance});
 for(const allowance of [0,1]){
  await tiny(allowance);let v=await megaOperation(rpc,actor,{op:'start',courseId:'sunny-meadows',requestId:randomUUID()});assert.equal(v.ruleset,'mega-card-golf/3');v=await action(v,{type:'draw'});
  const row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),req=randomUUID(),next=await action(v,{type:'stand-pat'},req);
  assert.deepEqual(next.cards,row.state.cards);assert.equal(next.discards,0);assert.equal(next.results.length,1);assert.equal(next.results[0].hidden.length,6);
  assert.equal((await action(v,{type:'stand-pat'},req)).revision,next.revision);
  assert.equal((await megaOperation(rpc,actor,{op:'state',runId:v.id})).revision,next.revision);
  assert.equal(Number((await db.query('SELECT count(*) FROM private.arcade_results WHERE run_id=$1',[v.id])).rows[0].count),1);
 }
 pass('Actual service + SQL: zero/nonzero allowance, six concealed cards, canonical score, duplicate/reconnect and exact-once receipt/result');
 // The actual shared worker recognizes /3 and completes uninitialized, expired runs.
 let empty=await rpc('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:'sunny-meadows'});

 const token=randomUUID();await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '60 seconds'",[token]);
 await recoverArcade(rpc,token);
 const initialized=await rpc('arcade_load',{p_actor:actor,p_run:empty.id});assert.equal(initialized.state.ruleset,'mega-card-golf/3');
 const elapsed=createRun(initialized.id,actor,initialized.config,initialized.state.decks,Date.now()-1e9,'mega-card-golf/3');
 await db.query('UPDATE private.arcade_runs SET state=$2,due_at=$3 WHERE id=$1',[empty.id,elapsed,elapsed.deadline]);
 const nextToken=randomUUID();
 await db.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=false,expires_at=clock_timestamp()+interval '60 seconds'",[nextToken]);
 await recoverArcade(rpc,nextToken);assert.equal((await rpc('arcade_load',{p_actor:actor,p_run:empty.id})).status,'completed');
 pass('Shared zero-client worker initializes and completes /3 exactly once');
 await db.query('ROLLBACK');assert.equal(await hash(),history);
 // Durable fixtures exist only in this disposable local database for independent connections.
 await db.query('BEGIN');await db.query(migration);await db.query(activation);await tiny(0);await db.query('COMMIT');
 await db.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
 const a=await connect(database),b=await connect(database);
 try{
  for(const sameRequest of [false,true]){
   let v=await megaOperation(rpc,actor,{op:'start',courseId:'sunny-meadows',requestId:randomUUID()});v=await action(v,{type:'draw'});
   const row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),done=applyIntent(row.state,{type:'stand-pat'},Number(row.server_at)),req=randomUUID();
   const args={p_actor:actor,p_run:v.id,p_revision:v.revision,p_state:done,p_request:req,p_fingerprint:'race'};
   const results=await Promise.all([rpcFor(a)('arcade_mega_commit',args),rpcFor(b)('arcade_mega_commit',{...args,p_request:sameRequest?req:randomUUID()})]);
   assert.deepEqual(results.map(r=>r.outcome).sort(),sameRequest?['committed','duplicate']:['committed','conflict']);
   assert.equal(Number((await db.query('SELECT count(*) FROM private.arcade_results WHERE run_id=$1',[v.id])).rows[0].count),1);
  }
  let v=await megaOperation(rpc,actor,{op:'start',courseId:'sunny-meadows',requestId:randomUUID()});v=await action(v,{type:'draw'});
  const row=await rpc('arcade_load',{p_actor:actor,p_run:v.id}),done=applyIntent(row.state,{type:'stand-pat'},Number(row.server_at));
  await a.query('BEGIN');await a.query("UPDATE private.arcade_runs SET due_at=floor(extract(epoch FROM clock_timestamp())*1000)+100,state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)+100)) WHERE id=$1",[v.id]);
  const waiting=rpcFor(b)('arcade_mega_commit',{p_actor:actor,p_run:v.id,p_revision:v.revision,p_state:done,p_request:randomUUID(),p_fingerprint:'deadline'});
  await new Promise(resolve=>setTimeout(resolve,180));await a.query('COMMIT');assert.equal((await waiting).outcome,'deadline');
  const expired=await megaOperation(rpc,actor,{op:'state',runId:v.id});assert.equal(expired.results[0].reason,'timeout');assert.deepEqual(expired.cards,row.state.cards);
  assert.equal(Number((await db.query('SELECT count(*) FROM private.arcade_results WHERE run_id=$1',[v.id])).rows[0].count),1);
  pass('Independent connections: competing actions, duplicate request, and blocked commit crossing expiry; one result and no forced replacement');
 }finally{await a.end();await b.end();}
 // Portable rollback proof checks actual hosted start/commit contracts without leaving fixtures.
 const config=baseline.courses[0],deck=Array.from({length:52},(_,i)=>i);
 let template=createRun('fixture','fixture',config,Array.from({length:config.holes},()=>deck),0,'mega-card-golf/3');
 while(template.status==='active'){
  let at=template.deadline-config.completionSeconds*1000+1;
  while(template.phase==='opening')template=applyIntent(template,{type:'open',indices:[template.exposed.findIndex(x=>!x)]},at++);
  while(template.phase==='playing'){
   template=applyIntent(template,{type:'draw'},at++);
   template=applyIntent(template,template.draws===config.stockAllowance?{type:'stand-pat'}:template.discards<config.discardAllowance?{type:'discard'}:{type:'replace',index:0},at++);
  }
  if(template.status==='active')template=recoverRun(template,template.deadline);
 }
 const q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
 const proof=`BEGIN; SET LOCAL lock_timeout='2s';
DO $proof$ DECLARE actor uuid;other uuid;r jsonb;old jsonb;done jsonb;answer jsonb;h text;request uuid:=gen_random_uuid(); BEGIN
 SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) INTO h FROM private.arcade_results t;
 SELECT p.id INTO actor FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE private.arcade_allowed(p.id) AND NOT EXISTS(SELECT 1 FROM private.arcade_runs r WHERE r.user_id=p.id AND status='active') ORDER BY p.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'proof:no_idle_actor';END IF;
 SELECT id INTO other FROM public.profiles WHERE id<>actor LIMIT 1;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='mega-card-golf/3';
 old:=public.arcade_mega_start(actor,request,'sunny-meadows');IF old->>'ruleset'<>'mega-card-golf/2' THEN RAISE EXCEPTION 'proof:legacy';END IF;
 UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/3';
 IF public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows')->>'id'<>old->>'id' THEN RAISE EXCEPTION 'proof:active';END IF;
 UPDATE private.arcade_runs SET status='abandoned' WHERE id=(old->>'id')::uuid;
 IF public.arcade_mega_start(actor,request,'sunny-meadows')->>'id'<>old->>'id' THEN RAISE EXCEPTION 'proof:receipt';END IF;
 r:=public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows');IF r->>'ruleset'<>'mega-card-golf/3' THEN RAISE EXCEPTION 'proof:v3';END IF;
 done:=${q(template)}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config');
 BEGIN PERFORM public.arcade_mega_commit(other,(r->>'id')::uuid,0,done);RAISE EXCEPTION 'proof:owner';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_found%' AND SQLERRM NOT LIKE '%forbidden%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,0,done||jsonb_build_object('ruleset','mega-card-golf/2'));RAISE EXCEPTION 'proof:version';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalid_state%' THEN RAISE;END IF;END;
 answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,0,done);IF answer->>'outcome'<>'committed' THEN RAISE EXCEPTION 'proof:commit';END IF;
 answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,0,done);IF answer->>'outcome'<>'conflict' OR (SELECT count(*) FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'proof:once';END IF;
 IF public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows')->>'id'=r->>'id' THEN RAISE EXCEPTION 'proof:continuation';END IF;
 IF has_function_privilege('anon','public.arcade_mega_start(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'proof:grants';END IF;
 IF (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) FROM private.arcade_results t WHERE run_id<>(r->>'id')::uuid)<>h THEN RAISE EXCEPTION 'proof:history';END IF;
END $proof$; ROLLBACK; SELECT 'PASS: frozen legacy admission/receipts, /3 start, ownership/version guards, canonical Stand Pat completion, exact-once, continuation, service-only grants and history; rolled back' qualification;`;
 // Restore the real course configuration before the portable proof.
 for(const c of baseline.courses)await saveSettings(c.id,Object.fromEntries(Object.entries(c).filter(([k])=>!['id','configId','boardId','revision'].includes(k))));
 await db.query(proof);write(dir+'installed-proof.sql',proof);write(dir+'candidate-proof.sql','BEGIN;\n'+migration+'\n'+proof.replace(/^BEGIN;/,''));
 pass('Portable hosted rollback proof passes on matching local contracts');
 const opts={entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022'};
 const previous=(await build({...opts,plugins:[{name:'prior-mega',setup(b){b.onLoad({filter:/(src[\\/]lib[\\/]megaCardGolf[\\/](config|engine)|server[\\/]megaCardGolf[\\/]service)\.ts$/},args=>({contents:execFileSync('git',['show','f694c3d97:'+args.path.replaceAll('\\','/').split('/rule-your-poker/').at(-1)],{encoding:'utf8'}),loader:'ts',resolveDir:args.path.replace(/[\\/][^\\/]+$/,'')}));}}]})).outputFiles[0].text;
 assert.equal(previous.trim(),read(dir+'installed-worker.ts','utf8').trim(),'Unrelated worker source differs from hosted; stop before deployment');
 const bundle=(await build(opts)).outputFiles[0].text;write(dir+'recovery-index.ts',bundle);
 pass('Prior worker reproduces hosted v14 exactly; only approved Mega modules change');
 write(dir+'proof.json',JSON.stringify({database,passed,workerSha256:createHash('sha256').update(bundle).digest('hex')},null,2));
}finally{await vite.close();await db.end();}
