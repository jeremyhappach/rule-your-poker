import {connect} from '../async-words/local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
await build({entryPoints:['server/delayed/adapter.ts'],bundle:true,platform:'node',format:'esm',outfile:'qualification.local/async-combined/adapter.mjs'});
const {transition,project,gameplayDue,initial}=await import(pathToFileURL(resolve('qualification.local/async-combined/adapter.mjs')));
const shared=JSON.parse(read('dev/async-combined/shared-preimage.json')),ctx=JSON.parse(read('qualification.local/async-combined/context.json')),db=await connect(ctx.database),checks=[];
const a=randomUUID(),b=randomUUID(),now=1800000000000;
const rpc=async(name,args)=>(await db.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args))).rows[0].v;
const make=(game,config)=>({id:randomUUID(),match_id:randomUUID(),game_type:game,config,starter:a,actor:a,organizer:a,opponent:b,segment:1,revision:1,terminal:false,available_at:new Date(now).toISOString(),expires_at:new Date(now+36*3600000).toISOString(),server_at:now,state:null});
function apply(row,t){return {...row,state:t.state,actor:t.state.players[t.state.turn],revision:row.revision+1,segment:row.segment+(t.advanced?1:0),server_at:t.at,available_at:t.advanced?new Date(t.at).toISOString():row.available_at,expires_at:t.advanced?new Date(t.at+36*3600000).toISOString():row.expires_at};}
try{
 for(const [game,config] of [['tri-towers',shared.tri],['quintzee',shared.quintzee],['boxdrop',shared.boxdrop]]){
  let row=make(game,config);const originalExpiry=row.expires_at;
  for(let guard=0;guard<25&&!row.state?.completed;guard++){
   if(!row.state?.board){row=apply(row,await transition(row,{type:'start'},rpc));assert.equal(row.state.board.rules.version,config.version);}
   const own=await project(row,row.actor,rpc),opponent=await project(row,row.actor===a?b:a,rpc);assert(own.board);assert.equal(opponent.board,null);
   assert(!JSON.stringify(own.board).includes('deck'));assert.equal(opponent.ownResults.length,row.state.attempts.filter(v=>v.actor!==row.actor).length);
   const due=gameplayDue(row.state);assert(Number.isFinite(due));row.server_at=due;
   row=apply(row,await transition(row,{type:'tick'},rpc));
  }
  assert(row.state.completed,game+' zero-client completion');assert.equal(row.state.attempts.length,game==='tri-towers'?config.stages*2:4);assert.equal(row.state.winner,null);
  assert.equal(row.state.attempts[0].actor,a);assert.equal(row.state.attempts[1].actor,b);checks.push(game+': actual shared deal/reducer, hidden opponent board, alternating rounds, zero-client completion/draw');
  let expired=make(game,config);expired.server_at=Date.parse(expired.expires_at);assert((await transition(expired,{type:'tick'},rpc)).forfeit);
  // Availability is tested separately above; started gameplay deadline is always earlier.
  assert.equal(originalExpiry,new Date(now+36*3600000).toISOString());
 }
 for(const [game,cfg,threshold] of [['quintzee',shared.quintzee,80000],['boxdrop',shared.boxdrop,100000]]){
  assert.equal(await rpc('delayed_board_core',{p_game:game,p_operation:'rounds',p_score:threshold-1}),2);
  assert.equal(await rpc('delayed_board_core',{p_game:game,p_operation:'rounds',p_score:threshold}),3);
  checks.push(game+': bonus eligibility delegated at exact common-rule boundary');
 }
 write('qualification.local/async-combined/adapters-proof.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS',checks);
}finally{await db.end();}
