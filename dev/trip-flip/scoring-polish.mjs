import {connect,localContext} from './database.mjs';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=await connect(localContext().database),proof=[];
const post=async(op,body)=>{const r=await fetch('http://127.0.0.1:5191/__tripFlip/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error??JSON.stringify(v));return v;};
const prefix=[0,13,26,5,18,52,1,15,29,7,8,9],deck=[...prefix,...Array.from({length:54},(_,i)=>i).filter(i=>!prefix.includes(i))];
try{
 for(const [cards,kind,suited] of [[[0,13,26],'trip',false],[[5,18,52],'trip',false],[[5,52,53],'trip',false],[[1,15,29],'run',false],[[7,8,9],'run',true],[[17,16,18],null,false]]){
  const r=(await db.query('SELECT private.trip_flip_combination($1) c',[JSON.stringify(cards)])).rows[0].c;
  assert.equal(r?.kind??null,kind);if(r)assert.equal(r.suited,suited);
 }
 for(const solo of [true,false]){
  const f=await post('new',{solo}),table=solo?'private.arcade_runs':'private.trip_flip_matches',key=solo?'id':'dealer_game_id';
  const state=(await db.query('SELECT state FROM '+table+' WHERE '+key+'=$1',[f.id])).rows[0].state,b=solo?state.board:state;
  Object.assign(b,{phase:'playing',columns:[[],[],[],[]],cells:[null,null,null],deck,fan:deck.slice(0,3),cursor:3,score:0,scoreBefore:0,trips:0,runs:0,suitedTotal:0,specialTotal:0,specialClaimed:false,special:[10,11,12],deadline:Date.now()+180000});
  await db.query('UPDATE '+table+' SET state=$2,revision=revision+1 WHERE '+key+'=$1',[f.id,state]);
  let snapshot=await post('state',f),v=solo?snapshot.view:snapshot;
  for(let i=0;i<prefix.length;i++){
   const command={requestId:randomUUID(),revision:snapshot.revision,scope:solo?v.roundId:'unused',intent:{type:'move',items:[7,0,prefix[i]]}};
   snapshot=await post('action',{...f,command});v=solo?snapshot.view:snapshot;
   if(i%3===2){
    const n=(i+1)/3,expected=[3000,6000,6600,12200][n-1];
    assert.equal(v.score,expected);assert.equal(v.trips,Math.min(n,2));assert.equal(v.runs,Math.max(0,n-2));assert.deepEqual(v.columns[0],[]);
    const duplicate=await post('action',{...f,command});assert.equal((solo?duplicate.view:duplicate).score,expected);assert.equal(duplicate.revision,snapshot.revision);
    await assert.rejects(post('action',{...f,command:{...command,requestId:randomUUID()}}),/stale/);
    proof.push({mode:solo?'Arcade':'multiplayer',combination:n,score:v.score,trips:v.trips,runs:v.runs,revision:snapshot.revision});
   }
  }
  snapshot=await post('action',{...f,command:{requestId:randomUUID(),revision:snapshot.revision,scope:solo?v.roundId:'unused',intent:{type:'take_score'}}});
  const r=solo?snapshot.view.result:snapshot.stages.at(-1);
  assert.equal(r.tripPoints,6000);assert.equal(r.runPoints,1200);assert.equal(r.suitedBonus,5000);
  assert.equal(r.score,r.scoreBefore+r.tripPoints+r.runPoints+r.suitedBonus+r.specialBonus+r.timeBonus);
 }
 writeFileSync('qualification.local/trip-flip/scoring-polish.json',JSON.stringify(proof,null,2));
 console.log('PASS ordinary/Joker/2-Joker Trips, ordered/mixed/suited Runs, unordered rejection; both adapters score consecutive clears exactly once across duplicate/stale requests');
}finally{await db.end();}
