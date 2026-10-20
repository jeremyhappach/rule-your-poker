import {connect,localContext} from './database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const c=await connect(localContext().database),moves=JSON.parse(readFileSync('dev/trip-flip/smoke-replay.json','utf8'));
try{
 const hashes=Object.fromEntries((await c.query("SELECT proname,md5(pg_get_functiondef(oid)) hash FROM pg_proc WHERE proname IN ('trip_flip_combination','trip_flip_board_reduce')")).rows.map(r=>[r.proname,r.hash]));
 assert.deepEqual(hashes,{trip_flip_combination:'970093f817902fda9e60865a987c49e4',trip_flip_board_reduce:'86bfcbae83713c762863e74e6d2daefe'});
 const played=moves.filter(m=>m.items[0]===7).map(m=>m.items[2]),deck=[...played,...Array.from({length:54},(_,i)=>i).filter(i=>!played.includes(i))];
 let b=(await c.query("SELECT private.trip_flip_board_deal(jsonb_build_object('rules',private.trip_flip_rules(),'score',0,'stage',1),0) b")).rows[0].b;
 // Only the played fan prefix is recoverable. Unplayed stock and the old Special
 // target are unknown; neither affects classification of these observed clears.
 Object.assign(b,{deck,fan:deck.slice(0,3),cursor:3,special:[0,1,2]});
 const events=[];
 for(const m of moves){
  const cards=m.items[1]<4?[...b.columns[m.items[1]],m.items[2]]:null;
  b=(await c.query("SELECT private.trip_flip_board_reduce($1,'move',$2,3000) b",[b,m.items])).rows[0].b;
  if(cards?.length===3)events.push({revision:m.revision,cards,event:b.event,score:b.score,trips:b.trips,runs:b.runs});
 }
 assert.equal(b.trips,0);assert.equal(b.runs,2);assert.equal(b.score,6200);assert.equal(b.suitedTotal,5000);
 assert.deepEqual(events.filter(e=>e.event.points>0).map(e=>[e.revision,e.cards,e.event.points]),[[9,[6,5,4],5600],[20,[3,28,40],600]]);
 b=(await c.query("SELECT private.trip_flip_board_reduce($1,'take_score',NULL,$2) b",[b,b.deadline-60000])).rows[0].b;
 assert.equal(b.result.score,7450);assert.equal(b.result.timeBonus,1250);
 writeFileSync('qualification.local/trip-flip/smoke-replay.json',JSON.stringify({hashes,events,result:b.result},null,2));
 console.log('PASS production receipt replay: 32 moves, 0 Trips, 2 Runs, 5000 suited + 1250 time = 7450',events.filter(e=>e.event.points>0));
}finally{await c.end();}
