import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {connect,fixture,state,actor} from './bots-fixture.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/tri-towers/scene-context.json','utf8')),db=await connect(database);
const reduce=async(s,a,t)=>(await db.query('SELECT private.tri_towers_reduce($1,$2,NULL,$3) s',[s,a,t])).rows[0].s;
try{
 for(let n=2;n<=7;n++){
  const f=await fixture(db,database,Array(n).fill(false));let s=(await state(db,f)).state;
  await assert.rejects(actor(database,f.users[0],'SELECT public.tri_towers_present($1) v',[f.dealer]),/Refresh/);
  const view=await actor(database,f.users[0],'SELECT public.tri_towers_present_scene($1) v',[f.dealer]);assert.equal(view.phase,'intro');assert(!('deck' in view));
  for(let i=0;i<n*2;i++){
   assert.equal(s.phase,'intro');assert.equal(s.stage,Math.floor(i/n)+1);assert.equal(s.turnIndex,i%n);
   const introEnd=s.deadline;s=await reduce(s,'tick',introEnd);assert.equal(s.phase,'ready');assert.equal(s.deadline,introEnd+30000);
   s=await reduce(s,'draw',introEnd+1);assert.equal(s.deadline,introEnd+120001);s=await reduce(s,'take_score',s.deadline-1);assert.equal(s.phase,'stage_complete');
   s=await reduce(s,'tick',s.deadline);
  }assert.equal(s.phase,'complete');assert.equal(s.stages.length,n*2);
 }
 const f=await fixture(db,database,[false,false]),original=(await state(db,f)).state;
 await db.query('BEGIN');
 await db.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.id]);
 const paused=(await state(db,f));assert.equal(paused.state.phase,'intro');assert(paused.paused_at);
 await db.query('SELECT private.tri_towers_recover()');assert.equal((await state(db,f)).state.deadline,original.deadline);
 await db.query('UPDATE public.games SET is_paused=false WHERE id=$1',[f.id]);
 const resumed=await state(db,f);assert.equal(resumed.state.phase,'intro');assert.equal(resumed.paused_at,null);assert(resumed.state.deadline>=original.deadline);
 await db.query('ROLLBACK');
 for(const score of [79999,80000,80001]){
  let s={...original,phase:'stage_complete',stage:2,turnIndex:1,deadline:1000,scores:{[original.players[0].id]:score,[original.players[1].id]:0}};
  s=await reduce(s,'tick',1000);if(score<80000)assert.equal(s.phase,'complete');else{assert.equal(s.phase,'intro');assert.equal(s.stage,3);assert.equal(s.deadline,3500);assert.equal(s.run,0);while(s.phase!=='complete')s=await reduce(s,'tick',s.deadline);assert.equal(s.qualified.length,1);}
 }
 console.log('PASS v3 2–7 participant order, full intro/Ready/playing periods, bonus qualification/reset, redaction and older-client refresh gate');
}finally{await db.end();}
