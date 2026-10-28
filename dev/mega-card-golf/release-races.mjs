import {connect,rpcFor} from './database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const context=JSON.parse(readFileSync('dev/mega-card-golf/backend.local/context.json','utf8'));
const a=await connect(context.database),b=await connect(context.database),rpc=rpcFor(a),peer=rpcFor(b),passed=[];
const vite=await createServer({configFile:false,cacheDir:resolve('dev/mega-card-golf/backend.local/race-cache'),server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
const {createRun,applyIntent,recoverRun}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
const actor=context.users[1],admin=context.users[0],deck=()=>Array.from({length:52},(_,i)=>i);
const beat=()=>a.query("UPDATE private.arcade_recovery_state SET failure=NULL,last_completed_at=clock_timestamp()");
const start=()=>rpc('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:'coastal-links'});
const commit=(r,state,fn=rpc,extra={})=>fn('arcade_mega_commit',{p_actor:actor,p_run:r.id,p_revision:Number(r.revision),p_state:state,...extra});
try{
 await a.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/1'");
 for(const expired of [false,true]){
  await beat();let row=await start(),at=Date.now()-60000;
  let s=createRun(row.id,actor,row.config,Array.from({length:9},deck),at);
  for(let hole=1;hole<=9;hole++){
   s=applyIntent(s,{type:'open',indices:[0,5]},at);
   for(const i of hole===9?[1,2,3]:[1,2,3,4]){s=applyIntent(s,{type:'draw'},at);s=applyIntent(s,{type:'replace',index:i},at);}
   if(hole<9){at=s.deadline;s=recoverRun(s,at);}
  }
  s=applyIntent(s,{type:'draw'},at);const accepted=applyIntent(s,{type:'replace',index:4},at);
  if(expired)s.deadline=Date.now()-100;
  row=(await commit(row,s)).record;
  const token=randomUUID();await a.query("UPDATE private.arcade_recovery_state SET token=$1,claimed=true,expires_at=clock_timestamp()+interval '25 seconds'",[token]);
  const recovered=recoverRun(s,Date.now());
  const outcomes=await Promise.all([commit(row,accepted,rpc,{p_request:randomUUID(),p_fingerprint:'terminal-race'}),peer('arcade_mega_commit',{p_actor:null,p_run:row.id,p_revision:Number(row.revision),p_state:recovered,p_token:token})]);
  if(expired){assert.ok(outcomes.every(x=>['deadline','conflict','committed'].includes(x.outcome)));}
  let saved=await rpc('arcade_load',{p_actor:actor,p_run:row.id});
  if(saved.status==='active'){saved=(await commit(saved,applyIntent(saved.state,{type:'replace',index:4},Date.now()),rpc,{p_request:randomUUID(),p_fingerprint:'retry-after-recovery'})).record;}
  assert.equal(saved.status,'completed');assert.equal(Number((await a.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[row.id])).rows[0].n),1);
  if(expired)assert.equal(saved.state.results.at(-1).reason,'timeout');
  passed.push(expired?'expired terminal action loses to recovery':'terminal submit/recovery serialize to one immutable result');
 }
 await beat();const catalog=await rpc('arcade_mega_catalog',{p_actor:admin}),c=catalog.courses.find(c=>c.id==='coastal-links'),{id,revision,configId,boardId,...settings}=c;
 await a.query('BEGIN');
 const changed=await rpc('arcade_mega_save',{p_actor:admin,p_course:id,p_revision:revision,p_settings:{...settings,stockAllowance:settings.stockAllowance===12?11:12},p_choice:'retain'});
 let finished=false;const waiting=peer('arcade_mega_start',{p_actor:actor,p_request:randomUUID(),p_course:id}).then(r=>{finished=true;return r;});
 await new Promise(r=>setTimeout(r,150));assert.equal(finished,false);await a.query('COMMIT');const admitted=await waiting;assert.equal(admitted.config.configId,changed.configId);
 await commit(admitted,applyIntent(createRun(admitted.id,actor,admitted.config,Array.from({length:9},deck),Date.now()),{type:'abandon'},Date.now()));
 passed.push('admin edit blocks admission; admitted config is the complete committed revision');
 await beat();await a.query('BEGIN');const admittedFirst=await start();let edited=false;
 const pending=peer('arcade_mega_save',{p_actor:admin,p_course:id,p_revision:changed.revision,p_settings:settings,p_choice:'retain'}).then(c=>{edited=true;return c;});await new Promise(r=>setTimeout(r,150));assert.equal(edited,false);await a.query('COMMIT');await pending;
 const frozen=await rpc('arcade_load',{p_actor:actor,p_run:admittedFirst.id});assert.equal(frozen.config.configId,changed.configId);
 await commit(frozen,applyIntent(createRun(frozen.id,actor,frozen.config,Array.from({length:9},deck),Date.now()),{type:'abandon'},Date.now()));
 passed.push('admission blocks admin edit; active run keeps its original revision');
 writeFileSync('dev/mega-card-golf/evidence/release-races.json',JSON.stringify({database:context.database,independentConnections:true,passed},null,2));console.log(JSON.stringify({passed}));
}finally{await a.query('ROLLBACK');await a.end();await b.end();await vite.close();}
