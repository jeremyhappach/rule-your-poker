import {connect} from '../async-words/local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {build} from 'esbuild';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
await build({entryPoints:['server/delayed/service.ts'],bundle:true,platform:'node',format:'esm',outfile:'qualification.local/async-combined/service-proof.mjs'});
const {delayedOperation}=await import(pathToFileURL(resolve('qualification.local/async-combined/service-proof.mjs')));
const ctx=JSON.parse(read('qualification.local/async-combined/context.json')),db=await connect(ctx.database),a=randomUUID(),b=randomUUID(),checks=[];
const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
async function user(id){await db.query('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('SET LOCAL ROLE authenticated');}
async function rejects(sql,args=[]){await db.query('SAVEPOINT deny');let error;try{await db.query(sql,args);}catch(e){error=e;}await db.query('ROLLBACK TO SAVEPOINT deny');assert(error);}
const rpc=async(name,args)=>{await db.query('RESET ROLE');await db.query('SET LOCAL ROLE service_role');return val('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.entries(args).map(([k,v])=>k==='p_items'?v:Array.isArray(v)?JSON.stringify(v):v));};
try{
 await db.query('BEGIN');for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'FiveProof '+id]);}
 await db.query('UPDATE private.delayed_release SET admission_enabled=true');await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 const lineup=['ptown-words','run21','tri-towers','quintzee','boxdrop'].map((game,i)=>({game,stake:i+5}));
 await user(a);await rejects('SELECT public.delayed_create($1,$2,false,$3)',[randomUUID(),b,JSON.stringify(lineup)]);assert.equal((await val('SELECT public.delayed_capabilities() v')).max_children,1);
 await db.query('RESET ROLE');await db.query('UPDATE private.delayed_recovery_state SET enabled=true');await user(a);
 assert.equal((await val('SELECT public.delayed_capabilities() v')).games.length,5);
 const request=randomUUID(),parent=await val('SELECT public.delayed_create($1,$2,false,$3) v',[request,b,JSON.stringify(lineup)]);
 assert.equal(await val('SELECT public.delayed_create($1,$2,false,$3) v',[request,b,JSON.stringify(lineup)]),parent);
 await rejects('SELECT public.delayed_create($1,$2,true,$3)',[randomUUID(),b,JSON.stringify(lineup)]);
 await rejects('SELECT public.delayed_create($1,$2,false,$3)',[randomUUID(),b,JSON.stringify(Array.from({length:33},()=>lineup[0]))]);
 await val('SELECT public.delayed_create($1,$2,false,$3) v',[randomUUID(),b,JSON.stringify(Array.from({length:32},()=>lineup[0]))]);
 const home=await val('SELECT public.delayed_home($1) v',[parent]);assert.equal(home.exposure,35);assert.deepEqual(home.lineup.map(c=>c.game),lineup.map(c=>c.game));
 await user(b);await val("SELECT public.delayed_respond($1,$2,$3,'accept') v",[parent,randomUUID(),home.offerHash]);
 const accepted=await val('SELECT public.delayed_home($1) v',[parent]);assert(accepted.lineup.every(c=>[a,b].includes(c.starter)&&c.actor===c.starter));assert(accepted.lineup.every(c=>Date.parse(c.expiresAt)-Date.parse(c.availableAt)===36*3600000&&Date.parse(c.lastCallAt)-Date.parse(c.availableAt)===24*3600000));
 await db.query('RESET ROLE');assert.equal(await val('SELECT count(*)::int v FROM public.games WHERE id=$1',[parent]),0);assert.equal(await val('SELECT count(*)::int v FROM public.player_transactions WHERE source_game_id=$1',[parent]),0);
 checks.push('five-game ordered frozen offer, per-child stakes, persisted randomized starters, exact 36h/24h, zero admission finance; 32 allowed/33 rejected; real money denied');
 const words=accepted.lineup[0];for(let i=0;i<4;i++){
  await db.query('RESET ROLE');const c=(await db.query('SELECT * FROM private.delayed_children WHERE id=$1',[words.id])).rows[0];await user(c.actor);
  await val("SELECT public.delayed_words_action($1,$2,$3,'pass',NULL) v",[words.id,randomUUID(),c.revision]);
 }
 await db.query('RESET ROLE');assert.equal(await val('SELECT count(*)::int v FROM private.delayed_outcomes WHERE match_id=$1',[parent]),1);assert.equal(await val('SELECT count(*)::int v FROM public.games WHERE id=$1',[parent]),0);
 for(const child of accepted.lineup.slice(1)){
  await db.query('RESET ROLE');await db.query("WITH t AS(SELECT clock_timestamp()-interval '1 second' AS due_at) UPDATE private.delayed_children SET available_at=t.due_at-interval '36 hours',last_call_at=t.due_at-interval '12 hours',expires_at=t.due_at FROM t WHERE id=$1",[child.id]);
  await user(a);await rejects('SELECT public.delayed_words_snapshot($1)',[child.id]);
  const view=await delayedOperation(rpc,a,{op:'state',childId:child.id});assert.equal(view.terminal,true);assert.equal(view.result.reason,'timeout_forfeit');
 }
 await db.query('RESET ROLE');await db.query('SET CONSTRAINTS ALL IMMEDIATE');const receipt=await val('SELECT to_jsonb(s) v FROM private.delayed_settlements s WHERE match_id=$1',[parent]);assert(receipt);
 assert.equal(Number(receipt.organizer_delta),Number(await val('SELECT sum(organizer_delta) v FROM private.delayed_outcomes WHERE match_id=$1',[parent])));
 assert.equal(await val('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[parent]),receipt.organizer_delta===0?0:1);
 assert.equal(await val('SELECT count(*)::int v FROM public.player_transactions WHERE source_game_id=$1',[parent]),0);
 checks.push('shared Words completion remains provisional; all four other child forfeitures recover through trusted service; one aggregate receipt/transfer and no real-account writes');
 await db.query('ROLLBACK');write('qualification.local/async-combined/admission-proof.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS',checks);
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
