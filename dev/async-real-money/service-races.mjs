// Isolated clone only. Synthetic identities; independent connections exercise real locks/receipts.
import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/jerem/source/repos/rule-your-poker/node_modules/package.json');
const dir='qualification.local/async-real-money',ctx=JSON.parse(read(dir+'/context.json'));
assert(/^async_real_\d+$/.test(ctx.database));
await require('esbuild').build({entryPoints:['server/delayed/service.ts','server/delayed/adapter.ts'],bundle:true,platform:'node',format:'esm',outdir:dir+'/server',nodePaths:['C:/Users/jerem/source/repos/rule-your-poker/node_modules']});
const {delayedOperation,synchronize}=await import(pathToFileURL(resolve(dir+'/server/service.js')));
const {transition,project,gameplayDue}=await import(pathToFileURL(resolve(dir+'/server/adapter.js')));
const db=await connect(ctx.database),peer=await connect(ctx.database),checks=[],a=randomUUID(),b=randomUUID(),outside=randomUUID();
const val=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
const owner=async(c=db)=>c.query('RESET ROLE');
const user=async(id,c=db)=>{await owner(c);await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query('SET ROLE authenticated');};
const rpcFor=c=>async(name,args)=>{await owner(c);await c.query('SET ROLE service_role');return val('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.entries(args).map(([k,v])=>Array.isArray(v)&&k!=='p_items'?JSON.stringify(v):v),c);};
const rpc=rpcFor(db),rpcPeer=rpcFor(peer);
async function fixture(games,real=true){await user(a);const id=await val('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),b,real,JSON.stringify(games.map((game,i)=>({game,stake:i?3:7})))]);const home=await val('SELECT public.delayed_home($1) v',[id]);await user(b);await val("SELECT public.delayed_respond($1,$2,$3,'accept') v",[id,randomUUID(),home.offerHash]);await owner();return {id,children:(await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1 ORDER BY ordinal',[id])).rows};}
const count=async(id)=>{await owner();return val("SELECT jsonb_build_object('outcomes',(SELECT count(*) FROM private.delayed_outcomes WHERE match_id=$1),'receipts',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=$1),'accounts',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1)) v",[id]);};
try{
 await db.query(read('supabase/delayed/real-money.candidate.sql','utf8'));
 await db.query('UPDATE private.delayed_release SET real_qualified=true,admission_enabled=true');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 for(const id of [a,b,outside]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true',[id,'Async real race '+id]);}
 for(const game of ['ptown-words','run21','tri-towers','quintzee','boxdrop']){
  const f=await fixture([game]),c=f.children[0],requestId=randomUUID();
  if(game==='ptown-words'){
   await user(c.actor);await user(c.actor,peer);
   const args=[c.id,requestId,c.revision];
   const replies=await Promise.all([val("SELECT public.delayed_words_action($1,$2,$3,'pass',NULL) v",args),val("SELECT public.delayed_words_action($1,$2,$3,'pass',NULL) v",args,peer)]);
   assert.deepEqual(replies[0],replies[1]);await owner();
   assert.equal(await val('SELECT count(*)::int v FROM private.delayed_word_commands WHERE child_id=$1',[c.id]),1);
  }else{
   const body={op:'action',childId:c.id,requestId,revision:1,segment:1,intent:{type:'start'}};
   const replies=await Promise.all([delayedOperation(rpc,c.actor,body),delayedOperation(rpcPeer,c.actor,body)]);
   assert.equal(replies[0].revision,replies[1].revision);await owner();
   assert.equal(await val('SELECT count(*)::int v FROM private.delayed_commands WHERE child_id=$1',[c.id]),1);
   assert.equal((await delayedOperation(rpc,c.actor,body)).revision,replies[0].revision);
   await assert.rejects(()=>delayedOperation(rpc,outside,{op:'state',childId:c.id}),/not_authorized/);
   await assert.rejects(()=>delayedOperation(rpc,c.actor,{...body,intent:{type:'collect'}}),/request_conflict/);
   // Advance only this synthetic clock fixture. Actual shared reducers and trusted
   // zero-client service resolve an earlier gameplay deadline, then availability.
   await owner();const due=Date.now()-2000,expiry=Date.now()+3600000;
   await db.query("UPDATE private.delayed_children SET available_at=to_timestamp($2/1000.0)-interval '36 hours',last_call_at=to_timestamp($2/1000.0)-interval '12 hours',expires_at=to_timestamp($2/1000.0),gameplay_due_at=to_timestamp($3/1000.0),state=jsonb_set(jsonb_set(state,'{board,deadline}',to_jsonb($3::bigint)),'{board,startedAt}',to_jsonb($3::bigint-300000)) WHERE id=$1",[c.id,expiry,due]);
   let row=await rpc('delayed_load',{p_child:c.id,p_actor:null});row=await synchronize(rpc,row,null);
   assert.equal(row.terminal,false);assert(row.revision>2);assert.equal(await val('SELECT count(*)::int v FROM private.delayed_outcomes WHERE child_id=$1',[c.id]).catch(()=>-1),-1); // service cannot read private outcome table
   await owner();await db.query("WITH t AS(SELECT date_trunc('milliseconds',clock_timestamp())-interval '1 second' d) UPDATE private.delayed_children SET available_at=t.d-interval '36 hours',last_call_at=t.d-interval '12 hours',expires_at=t.d FROM t WHERE id=$1",[c.id]);
   row=await rpc('delayed_load',{p_child:c.id,p_actor:null});row=await synchronize(rpc,row,null);assert.equal(row.terminal,true);
   assert.equal((await count(f.id)).accounts,2);
  }
  checks.push(game+': real command duplicate/receipt safety and actual adapter boundary');
  const race=await fixture([game,game]);await owner();await owner(peer);
  const outcomes=await Promise.all([val("SELECT private.delayed_record_outcome($1,$2,'normal',$3,'{\"proof\":\"synthetic financial race\"}') v",[race.children[0].id,1,a]),val("SELECT private.delayed_record_outcome($1,$2,'normal',$3,'{\"proof\":\"synthetic financial race\"}') v",[race.children[1].id,1,b],peer)]);
  assert.deepEqual(await count(race.id),{outcomes:2,receipts:1,batches:1,accounts:2});
  assert.equal(Number(await val('SELECT organizer_delta v FROM private.delayed_settlements WHERE match_id=$1',[race.id])),4);
  await Promise.all(race.children.map((child,i)=>val("SELECT private.delayed_record_outcome($1,$2,'normal',$3,'{\"proof\":\"synthetic financial race\"}') v",[child.id,1,i?b:a],i?peer:db)));
  assert.deepEqual(await count(race.id),{outcomes:2,receipts:1,batches:1,accounts:2});
  checks.push(game+': concurrent last children, +4/-4 canonical accounting and retry exactly once');
 }
 // Shared reducers determine normal scores and ties without browser-provided totals.
 for(const game of ['run21','tri-towers','quintzee','boxdrop']){
  const f=await fixture([game],false),base=f.children[0];
  let row={...base,revision:1,segment:1,organizer:a,opponent:b,server_at:Date.now(),state:null,available_at:new Date().toISOString(),expires_at:new Date(Date.now()+36*3600000).toISOString()};
  const apply=t=>{row={...row,state:t.state,actor:t.state.players[t.state.turn],revision:row.revision+1,segment:row.segment+(t.advanced?1:0),server_at:t.at,available_at:t.advanced?new Date(t.at).toISOString():row.available_at,expires_at:t.advanced?new Date(t.at+36*3600000).toISOString():row.expires_at};};
  let attempts=0;
  for(let guard=0;guard<40&&!row.state?.completed;guard++){
   if(!row.state?.board)apply(await transition(row,{type:'start'},rpc));
   const opponent=row.actor===a?b:a;assert.equal((await project(row,opponent,rpc)).board,null);
   // Empty timed boards give ties; Run21 ties must continue instead of paying.
   row.server_at=gameplayDue(row.state);apply(await transition(row,{type:'tick'},rpc));
   attempts=row.state.attempts.length;
   if(game==='run21'&&attempts>=row.config.rounds*2)break;
  }
  if(game==='run21'){assert.equal(row.state.completed,false);assert.equal(row.state.winner,null);assert(row.state.round>row.config.rounds);}
  else {assert.equal(row.state.completed,true);assert.equal(row.state.winner,null);}
  checks.push(game+': shared rules, hidden opponent board, normal score computation and tie '+(game==='run21'?'continuation':'completion'));
 }
 write(dir+'/service-races.json',JSON.stringify({passed:true,database:ctx.database,checks,scope:'isolated synthetic clone; current server adapters and real canonical financial functions'},null,2));console.log('PASS',checks.length,'service/race/shared-rule checks');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await db.end();await peer.end();}
