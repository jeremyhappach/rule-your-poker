import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {connect} from '../async-words/local.mjs';
const database=process.argv[2];
if(!/^async_latency_\d+$/.test(database))throw Error('Disposable local fixture required');
await build({entryPoints:['server/delayed/service.ts'],outfile:'qualification.local/latency-audit/service-races.mjs',bundle:true,platform:'node',format:'esm'});
const {delayedOperation}=await import('../../qualification.local/latency-audit/service-races.mjs');
const db=await connect(database),a=randomUUID(),b=randomUUID();
async function rpc(actor,name,args,databaseRole='service_role'){
 const connection=await connect(database);
 try{
  await connection.query('BEGIN');
  await connection.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
  await connection.query('SET LOCAL ROLE '+databaseRole);
  const {rows}=await connection.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.entries(args).map(([k,v])=>v&&typeof v==='object'?(Array.isArray(v)&&k==='p_items'&&!name.includes('words')?v:JSON.stringify(v)):v));
  await connection.query('COMMIT');return rows[0].v;
 }catch(e){await connection.query('ROLLBACK');throw e;}finally{await connection.end();}
}
const child=async id=>(await db.query('SELECT * FROM private.delayed_children WHERE id=$1',[id])).rows[0];
async function match(game){
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");

 const id=await rpc(a,'delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:false,p_lineup:[{game,stake:5}]},'authenticated');
 const hash=(await db.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[id])).rows[0].offer_hash;
 await rpc(b,'delayed_respond',{p_match:id,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'},'authenticated');
 return (await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[id])).rows[0];
}
try{
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[id]);}
 for(const game of ['take-two','quintzee','boxdrop']){
  const c=await match(game),call=body=>delayedOperation((n,args)=>rpc(c.actor,n,args),c.actor,{childId:c.id,game,...body});
  await call({op:'action',requestId:randomUUID(),revision:Number(c.revision),segment:Number(c.segment),intent:{type:'start'}});
  if(game!=='quintzee')await db.query("UPDATE private.delayed_children SET state=jsonb_set(state,'{board}',state->'board'||jsonb_build_object('phase','playing','deadline',$2::bigint)),gameplay_due_at=to_timestamp($2/1000.0) WHERE id=$1",[c.id,Date.now()+100000]);
  const cmd=v=>({op:'action',revision:v.revision,segment:v.segment,requestId:randomUUID(),intent:game==='take-two'?{type:'draw'}:game==='boxdrop'?{type:'place',items:[0,v.board.current.id]}:{type:'roll',items:[]}});
  const first=cmd(await call({op:'state'}));
  const [one,two]=await Promise.all([call(first),call(first)]);assert.equal(one.revision,two.revision);assert.deepEqual(one.board,two.board);
  const conflict=await Promise.allSettled([call(cmd(one)),call(cmd(one))]);assert.equal(conflict.filter(x=>x.status==='fulfilled').length,1);assert.match(conflict.find(x=>x.status==='rejected').reason.message,/stale_action/);
  const replay=await call(first);assert.equal(replay.revision,one.revision+1);
  await assert.rejects(()=>call({...first,intent:{type:'take_score'}}),/request_conflict|invalid_action/);
  console.log('PASS',game,'duplicate, competing action, late/changed replay');
 }
 const c=await match('ptown-words'),actor=c.actor;
 const action=(v,type,items=null,id=randomUUID())=>rpc(actor,'delayed_words_action',{p_child:c.id,p_request:id,p_revision:Number(v.revision),p_action:type,p_items:items},'authenticated');
 let v=await action(c,'begin_turn');
 const banks=await Promise.allSettled([action(v,'time_bank',[{slot:0}]),action(v,'pass')]);assert.equal(banks.filter(x=>x.status==='fulfilled').length,1);assert.match(banks.find(x=>x.status==='rejected').reason.message,/stale_revision|not_your_turn/);
 for(const type of ['pass','time_bank']){
  const row=await match('ptown-words'),p=row.actor;
  const execute=(type,v,items)=>rpc(p,'delayed_words_action',{p_child:row.id,p_request:randomUUID(),p_revision:Number(v.revision),p_action:type,p_items:items},'authenticated');
  v=await execute('begin_turn',row,null);
  await db.query("UPDATE private.delayed_children SET gameplay_due_at=to_timestamp($2/1000.0),state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE id=$1",[row.id,Date.now()-1]);
  const result=await Promise.allSettled([execute(type,v,type==='time_bank'?[{slot:0}]:null),rpc(p,'delayed_words_snapshot',{p_child:row.id},'authenticated'),db.query('SELECT private.delayed_words_recover_local()')]);
  assert.equal(result[1].status,'fulfilled');assert.equal(result[2].status,'fulfilled');
  const after=await child(row.id);assert.equal(after.state.moves.length,1);assert.equal(after.state.moves[0].action,'pass');assert.equal(after.gameplay_due_at,null);assert.equal(after.state.timeBankSpent?.[p]?.length??0,0);
 }
 console.log('PASS Words bank versus submission, timeout versus late submission/bank/snapshot/zero-client recovery');
}finally{await db.end();}
