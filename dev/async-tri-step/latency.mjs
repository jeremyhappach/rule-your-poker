// Real reducers/commit/projection in the disposable DB; controlled transport RTT.
import {connect} from '../async-words/local.mjs';
import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/async-tri-step',db=await connect(JSON.parse(readFileSync(dir+'/context.json')).database);
await build({entryPoints:['server/delayed/service.ts'],outfile:dir+'/service.mjs',bundle:true,platform:'node',format:'esm'});
const {delayedOperation}=await import('../../'+dir+'/service.mjs');
const rpc=async(name,args)=>(await db.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;
const results=[];
try{
 await db.query('BEGIN');await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 const a=randomUUID(),b=randomUUID();for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[id]);}
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[a]);
 const match=await rpc('delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:false,p_lineup:[{game:'tri-towers',stake:7}]});
 const hash=(await db.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[match])).rows[0].offer_hash;
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[b]);await rpc('delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'});
 const child=(await db.query('SELECT id,actor FROM private.delayed_children WHERE match_id=$1',[match])).rows[0];
 const s=await rpc('delayed_tri_step',{p_child:child.id,p_actor:child.actor});
 await rpc('delayed_tri_step',{p_child:child.id,p_actor:child.actor,p_request:randomUUID(),p_revision:s.revision,p_segment:s.segment,p_intent:{type:'start'}});
 for(const phase of ['ready','playing'])for(const prior of [false,true])for(const delay of [40,120])for(const mode of ['before','after']){
  await db.query('SAVEPOINT sample');
  await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('phase',$2::text,'deadline',$3::bigint)),gameplay_due_at=to_timestamp($3/1000.0) WHERE id=$1",[child.id,phase,Date.now()+120000]);
  if(prior)await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{attempts}',jsonb_build_array(jsonb_build_object('actor',actor,'round',1,'score',0,'at',0,'board',state->'board'))) WHERE id=$1",[child.id]);
  let view=await rpc('delayed_tri_step',{p_child:child.id,p_actor:child.actor});
  const calls=[],times=[];let first;
  const transport=async(name,args)=>{calls.push(name);await new Promise(r=>setTimeout(r,delay));return rpc(name,args);};
  for(let i=0;i<4;i++){
   const command={op:'action',...(mode==='after'?{game:'tri-towers'}:{}),childId:child.id,requestId:randomUUID(),revision:view.revision,segment:view.segment,intent:{type:'draw'}};
   const at=performance.now();view=await delayedOperation(transport,child.actor,command);times.push(Math.round(performance.now()-at));if(i===0)first=command;
  }
  // Receipts survive either deployment direction: late replay returns current state.
  const replay=await delayedOperation(rpc,child.actor,{...first,...(mode==='before'?{game:'tri-towers'}:{game:undefined})});assert.equal(replay.revision,view.revision);
  results.push({mode,phase,priorOwnResult:prior,rpcDelayMs:delay,moveMs:times,totalMs:times.reduce((a,b)=>a+b),calls: calls.length,crossPathReplay:true});
  await db.query('ROLLBACK TO SAVEPOINT sample');
 }
 writeFileSync(dir+'/latency.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await db.query('ROLLBACK');await db.end();}
