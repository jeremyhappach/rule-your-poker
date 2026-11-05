import {connect,database,dir} from './local.mjs';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const db=await connect(database());
export const q=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
await build({entryPoints:['server/delayed/service.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/service.mjs'});
export const {delayedOperation,synchronize}=await import(pathToFileURL(resolve(dir+'/service.mjs')));
export const people=[randomUUID(),randomUUID()];
await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();UPDATE private.delayed_take_two_release SET enabled=true");
for(const id of people){
 await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);
 await db.query("UPDATE public.profiles SET is_active=true,username=$2 WHERE id=$1",[id,'Take 2 test '+id.slice(0,6)]);
}
export async function rpc(actor,name,args={},role='service_role'){
 if(!/^[a-z_]+$/.test(name))throw Error('invalid RPC');
 const c=await connect(database());
 try{
  await c.query('BEGIN');
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor??'']);
  await c.query('SET LOCAL ROLE '+role);
  const result=await q('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',
   Object.entries(args).map(([k,v])=>k==='p_items'?v:v&&typeof v==='object'?JSON.stringify(v):v),c);
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
}
export async function fixture(real=false){
 const [a,b]=people,match=await rpc(a,'delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:real,p_lineup:[{game:'take-two',stake:7}]},'authenticated');
 const hash=await q('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[match]);
 await rpc(b,'delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'},'authenticated');
 const child=await q('SELECT id v FROM private.delayed_children WHERE match_id=$1',[match]);
 return {match,child,people,real};
}
export const operation=(actor,body)=>delayedOperation((n,a)=>rpc(actor,n,a),actor,body);
export const state=(actor,child)=>operation(actor,{op:'state',childId:child});
export const command=(s,intent,id=randomUUID())=>({op:'action',childId:s.id,revision:s.revision,segment:s.segment,requestId:id,intent});
export const action=(s,intent)=>operation(s.actor,command(s,intent));
export async function started(f){
 const actor=await q('SELECT actor v FROM private.delayed_children WHERE id=$1',[f.child]);
 return action(await state(actor,f.child),{type:'start'});
}
