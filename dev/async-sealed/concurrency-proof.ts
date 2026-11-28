import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {sealedOperation,recoverSealed} from '../../server/delayed/sealed';
import {RUN21_RULES} from '../../src/lib/run21/rulesets';
const {database}=JSON.parse(readFileSync('qualification.local/async-sealed/local-context.json','utf8'));
if(!/^async_sealed_race_\d+$/.test(database))throw Error('Disposable database required');
const db=await connect(database),peer=await connect(database),checks:string[]=[];
const pass=(s:string)=>{checks.push(s);console.log('PASS',s);};
const rpc=(client:any)=>async(name:string,args:any)=>{
 if(!/^delayed_[a-z_]+$/.test(name))throw Error('Unexpected RPC');
 const entries=Object.entries(args);return (await client.query('SELECT public.'+name+'('+entries.map(([key],i)=>key+'=>$'+(i+1)).join(',')+') value',entries.map(([,v])=>v))).rows[0].value;
};
const ra=rpc(db),rb=rpc(peer),a=randomUUID(),b=randomUUID();
const val=async(sql:string,args:any[]=[],c:any=db)=>(await c.query(sql,args)).rows[0]?.value;
const load=(r:any,child:string,who:string)=>r('delayed_sealed_load',{p_child:child,p_actor:who});
async function fixture(real:boolean,count=1){
 const id=randomUUID(),offer=Array.from({length:count},()=>({game:'run21',stake:3,config:RUN21_RULES}));
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,policy_version,accepted_at) VALUES($1,$2,$3,$4,'active',$5::jsonb,md5(($5::jsonb)::text),'delayed/sealed/1',clock_timestamp())",[id,a,b,real,JSON.stringify(offer)]);
 const ids=[];for(let i=0;i<count;i++){
  const child=randomUUID();ids.push(child);
  await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at) VALUES($1,$2,$3,'run21',3,$4,$5,$5,1,1,clock_timestamp())",[child,id,i+1,RUN21_RULES,a]);
  await db.query('UPDATE private.delayed_children c SET state=private.delayed_sealed_initial(c,m) FROM private.delayed_matches m WHERE c.id=$1 AND m.id=c.match_id',[child]);
 }
 return {id,ids};
}
function command(row:any,type:string){return {op:'action',childId:row.id,revision:row.revision,segment:row.segment,requestId:randomUUID(),intent:{type}};}
try{
 // Exact current settlement and canonical transfer owners, not approximations.
 for(const file of ['dev/async-sealed/evidence/current-financial.json','dev/async-sealed/preimages.json'])for(const f of JSON.parse(readFileSync(file,'utf8')).filter((f:any)=>['delayed_finalize','delayed_record_outcome','record_session_results','settle_gameplay_chip_transfers','finalize_gameplay_transfer_batch'].includes(f.name))){
  const actual=await val('SELECT pg_get_functiondef(p.oid) value FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',[f.schema,f.name]);assert.equal(actual.trim(),f.definition.trim());
 }
 pass('current hosted settlement and financial function definitions match exactly');
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'Sealed race fixture',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[id]);}
 const one=await fixture(false),child=one.ids[0];
 let [ar,br]=await Promise.all([load(ra,child,a),load(rb,child,b)]);const ca=command(ar,'start'),cb=command(br,'start');
 await Promise.all([sealedOperation(ra,a,ca,ar),sealedOperation(rb,b,cb,br)]);
 let state=await val('SELECT state value FROM private.delayed_children WHERE id=$1',[child]);assert(state.parts[a].board&&state.parts[b].board);assert.equal(state.round,1);
 assert.notDeepEqual(state.parts[a].deck.cards,state.parts[b].deck.cards);pass('simultaneous first starts survive peer CAS conflicts with separate private decks');
 const rev=await val('SELECT revision value FROM private.delayed_children WHERE id=$1',[child]);
 await Promise.all([sealedOperation(ra,a,ca),sealedOperation(rb,a,ca)]);assert.equal(await val('SELECT revision value FROM private.delayed_children WHERE id=$1',[child]),rev);pass('concurrent duplicate delivery has one immutable command receipt');
 await assert.rejects(()=>sealedOperation(ra,a,{...ca,requestId:randomUUID(),intent:{type:'collect'}}),/stale_action/);pass('stale same-player command cannot cross a newer board');
 await new Promise(resolve=>setTimeout(resolve,2600));
 [ar,br]=await Promise.all([load(ra,child,a),load(rb,child,b)]);
 await Promise.all([sealedOperation(ra,a,command(ar,'collect'),ar),sealedOperation(rb,b,command(br,'collect'),br)]);
 state=await val('SELECT state value FROM private.delayed_children WHERE id=$1',[child]);assert.equal(state.attempts.length,2);assert.equal(state.round,2);assert.equal(state.required.length,2);pass('simultaneous submissions reveal one paired round and open exactly one successor');
 for(const real of [false,true]){
  const parent=await fixture(real,2);
  for(const id of parent.ids){const row=await load(ra,id,a);await sealedOperation(ra,a,command(row,'start'),row);}
  await new Promise(resolve=>setTimeout(resolve,2600));
  for(const id of parent.ids){const row=await load(ra,id,a);await sealedOperation(ra,a,command(row,'collect'),row);}
  // Persist actual earlier clocks, then run the real worker adapter with no client.
  await db.query("UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '80 hours' WHERE match_id=$1",[parent.id]);
  await db.query('UPDATE public.account_access SET enabled=false WHERE user_id=$1',[a]);await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[a]);
  const rows=(await db.query('SELECT private.delayed_child_record(c) value FROM private.delayed_children c WHERE match_id=$1 ORDER BY ordinal',[parent.id])).rows.map((r:any)=>r.value);
  // The clone's record function is the preimage; recovery receives the same
  // sealed flag that the installed wrapper adds to the live claim projection.
  await Promise.all([recoverSealed(ra,{...rows[0],sealed:true}),recoverSealed(rb,{...rows[1],sealed:true})]);
  await db.query('UPDATE public.account_access SET enabled=true WHERE user_id=$1',[a]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[a]);
  assert.equal(await val('SELECT count(*)::int value FROM private.delayed_settlements WHERE match_id=$1',[parent.id]),1);
  assert.equal(await val('SELECT count(*)::int value FROM public.players WHERE game_id=$1',[parent.id]),2);
  assert.equal(await val('SELECT chips::int value FROM public.players WHERE game_id=$1 AND user_id=$2',[parent.id,a]),6);
  assert.equal(await val("SELECT count(*)::int value FROM public.gameplay_transfer_batches WHERE game_id=$1 AND unmatched_deltas='{}'",[parent.id]),1);
  assert.equal(await val('SELECT coalesce(sum(chips),0)::int value FROM public.players WHERE game_id=$1',[parent.id]),0);
  assert.equal(await val("SELECT count(*)::int value FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[parent.id]),real?2:0);
  await Promise.all([recoverSealed(ra,{...rows[0],sealed:true}),recoverSealed(rb,{...rows[1],sealed:true})]);
  assert.equal(await val('SELECT count(*)::int value FROM private.delayed_settlements WHERE match_id=$1',[parent.id]),1);
  pass('concurrent final children and disabled-account zero-client recovery settle once, real='+real);
 }
 writeFileSync('qualification.local/async-sealed/concurrency.json',JSON.stringify({passed:true,database,checks},null,2));
}finally{await db.end();await peer.end();}
