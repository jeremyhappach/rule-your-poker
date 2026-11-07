import {connect} from '../quintzee/database.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const {database}=JSON.parse(read('qualification.local/originals/context.json'));
const c=await connect(database),server=await createServer({configFile:false,server:{hmr:false},appType:'custom'}),checks=[];
const {delayedOperation}=await server.ssrLoadModule('/server/delayed/service.ts');
const sqlRpc=async(name,args={})=>{
 assert.match(name,/^delayed_[a-z_]+$/);const entries=Object.entries(args);
 return (await c.query('SELECT public.'+name+'('+entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') value',entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].value;
};
const rpc=async(name,args)=>{await c.query('SET LOCAL ROLE service_role');try{return await sqlRpc(name,args);}finally{await c.query('RESET ROLE');}};
const authenticated=async(who,name,args)=>{await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[who]);await c.query('SET LOCAL ROLE authenticated');try{return await sqlRpc(name,args);}finally{await c.query('RESET ROLE');}};
try{
 await c.query('BEGIN');
 await c.query("update private.arcade_rulesets set enabled=false where game in('crib-lab','chucky-showdown');update private.arcade_rulesets set enabled=true where id in('crib-lab/2','chucky-showdown/3')");
 for(const file of ['gameplay','async','live-foundation','live'])await c.query(read('supabase/originals-competition/'+file+'.sql','utf8'));
 await c.query("UPDATE private.originals_release SET async_enabled=true,async_real_qualified=true;UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true;UPDATE private.delayed_recovery_state SET enabled=true");
 const a=randomUUID(),b=randomUUID();
 await c.query('INSERT INTO auth.users(id) VALUES($1),($2)',[a,b]);
 await c.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true),($2,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[a,b]);
 await c.query("UPDATE public.profiles SET is_active=true,username='Originals service '||id WHERE id IN($1,$2)",[a,b]);
 const caps=await authenticated(a,'delayed_capabilities');assert.ok(caps.games.some(g=>g.id==='crib-lab'));assert.ok(caps.games.some(g=>g.id==='chucky-showdown'));
 for(const realMoney of [false,true])for(const game of ['crib-lab','chucky-showdown']){
  const request=randomUUID(),match=await authenticated(a,'delayed_create',{p_request:request,p_opponent:b,p_real_money:realMoney,p_lineup:[{game,stake:7}]});
  assert.equal(await authenticated(a,'delayed_create',{p_request:request,p_opponent:b,p_real_money:realMoney,p_lineup:[{game,stake:7}]}),match);
  const hash=(await c.query('select offer_hash from private.delayed_matches where id=$1',[match])).rows[0].offer_hash;
  await authenticated(b,'delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'});
  const child=(await c.query('select id from private.delayed_children where match_id=$1',[match])).rows[0].id;
  let firstCommand,firstActor;
  for(let turn=0;turn<6;turn++){
   const row=(await c.query('select actor,segment,revision from private.delayed_children where id=$1',[child])).rows[0];
   const body={op:'action',game,childId:child,requestId:randomUUID(),revision:Number(row.revision),segment:Number(row.segment),intent:{type:'start'}};
   const started=await delayedOperation(rpc,row.actor,body);assert.ok(started.board);assert.equal(started.actor,row.actor);
   if(turn===0){firstCommand=body;firstActor=row.actor;}
   // Simulate an unattended started round. Future cards/scores and prior receipts are unchanged.
   await c.query("UPDATE private.delayed_children SET state=jsonb_set(jsonb_set(state,'{board}',private.originals_shift(state->'board',-3600000)),'{segmentStartedAt}',to_jsonb((state->>'segmentStartedAt')::bigint-3600000)),available_at=available_at-interval '1 hour',last_call_at=last_call_at-interval '1 hour',expires_at=expires_at-interval '1 hour',started_at=started_at-interval '1 hour',gameplay_due_at=gameplay_due_at-interval '1 hour' WHERE id=$1",[child]);
   const result=await delayedOperation(rpc,row.actor,{op:'state',game,childId:child});
   assert.equal(result.ownResults.length,Math.floor(turn/2)+1);
   if(turn<5)assert.notEqual(result.actor,row.actor);else assert.equal(result.terminal,true);
  }
  const final=(await c.query('select status from private.delayed_matches where id=$1',[match])).rows[0];assert.equal(final.status,'settled');
  await delayedOperation(rpc,firstActor,firstCommand);
  const count=(await c.query('select count(*)::int n from private.delayed_settlements where match_id=$1',[match])).rows[0].n;assert.equal(count,1);
  const home=await authenticated(a,'delayed_home',{p_match:match});assert.equal(home.lineup[0].terminal,true);
  checks.push({game,realMoney,invitation:true,acceptance:true,rounds:6,handoffs:5,zeroClient:true,finalResults:true,lateReplay:true});
 }
 await c.query('ROLLBACK');write('qualification.local/originals/service-proof.json',JSON.stringify({passed:true,checks,rollback:true},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){await c.query('ROLLBACK');console.error(e.message,e.where??'',e.stack);process.exitCode=1;}finally{await c.end();await server.close();}
