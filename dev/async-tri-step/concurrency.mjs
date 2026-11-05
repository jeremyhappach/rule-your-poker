import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/async-tri-step',database=JSON.parse(readFileSync(dir+'/context.json')).database;
const db=await connect(database),checks=[];
const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
async function rpc(actor,name,args={},role='service_role'){
 const c=await connect(database);try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor??'']);await c.query('SET LOCAL ROLE '+role);
 const v=(await c.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;await c.query('COMMIT');return v;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
const state=(id,actor)=>rpc(actor,'delayed_tri_step',{p_child:id,p_actor:actor});
const cmd=(s,intent,request=randomUUID())=>({p_child:s.id,p_actor:s.actor,p_request:request,p_revision:s.revision,p_segment:s.segment,p_intent:intent});
const step=c=>rpc(c.p_actor,'delayed_tri_step',c);
try{
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 for(const real of [false,true]){
  const a=randomUUID(),b=randomUUID();for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[id]);}
  const match=await rpc(a,'delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:real,p_lineup:[{game:'tri-towers',stake:7}]},'authenticated');
  const hash=await q('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[match]);await rpc(b,'delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'},'authenticated');
  let c=await q('SELECT to_jsonb(c) v FROM private.delayed_children c WHERE match_id=$1',[match]);
  for(let turn=0;turn<4;turn++){
   c=await q('SELECT to_jsonb(c) v FROM private.delayed_children c WHERE id=$1',[c.id]);
   let s=await step(cmd(await state(c.id,c.actor),{type:'start'}));
   await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('phase','ready','deadline',$2::bigint)),gameplay_due_at=to_timestamp($2/1000.0) WHERE id=$1",[c.id,Date.now()+30000]);s=await state(c.id,c.actor);
   const request=cmd(s,{type:'draw'});const duplicate=await Promise.all([step(request),step(request)]);assert.equal(duplicate[0].revision,duplicate[1].revision);assert.equal(duplicate[0].revision,s.revision+1);s=duplicate[0];
   const conflict=await Promise.all([step(cmd(s,{type:'draw'})),step(cmd(s,{type:'draw'}))]);assert.equal(conflict.filter(x=>x.error==='delayed:stale_action').length,1);
   s=conflict.find(x=>!x.error);
   const at=Date.now()-10;await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('score',(state#>>ARRAY['totals',actor::text])::bigint+CASE WHEN actor=$3 THEN 1000 ELSE 0 END,'deadline',$2::bigint)),gameplay_due_at=to_timestamp($2/1000.0) WHERE id=$1",[c.id,at,a]);
   const raced=await Promise.all([state(c.id,c.actor),step(cmd(s,{type:'draw'})),state(c.id,c.actor)]);
   assert.equal(raced[1].error,'delayed:stale_action');assert.equal(raced[0].revision,raced[2].revision);assert.equal(raced[0].segment,s.segment+1);
  }
  assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[match]),1);
  assert.equal(await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[match]),1);
  assert.equal(await q('SELECT count(*)::int v FROM public.players WHERE game_id=$1 AND chips=CASE WHEN user_id=$2 THEN 7 ELSE -7 END',[match,a]),2);
  checks.push({real,duplicate:true,competingRevision:true,deadlineRace:true,terminalSettlementOnce:true});
 }
 writeFileSync(dir+'/concurrency.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await db.end();}
