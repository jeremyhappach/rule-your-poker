import {db,q,rpc,fixture,state,command,operation,action,started,synchronize,people} from './service-fixture.mjs';
import {dir} from './local.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const checks=[];
try{
 for(const real of [false,true]){
  const f=await fixture(real),actor=await q('SELECT actor v FROM private.delayed_children WHERE id=$1',[f.child]);
  const initial=await state(actor,f.child),start=command(initial,{type:'start'});
  const both=await Promise.all([operation(actor,start),operation(actor,start)]);
  assert.deepEqual(both[0].board,both[1].board);
  assert.equal(await q('SELECT count(*)::int v FROM private.delayed_commands WHERE child_id=$1',[f.child]),1);
  await assert.rejects(()=>operation(actor,{...start,intent:{type:'draw'}}),/request_conflict/);
  await assert.rejects(()=>operation(actor,{...start,requestId:crypto.randomUUID()}),/stale_action/);
  assert.deepEqual((await state(actor,f.child)).board,both[0].board);
  const starts=[];
  for(let turn=0;turn<6;turn++){
   let s=turn===0?both[0]:await started(f);
   starts.push(s.board);
   assert.equal(s.round,Math.floor(turn/2)+1);
   if(turn%2===1){assert.deepEqual(s.board.slots,starts[turn-1].slots);assert.equal(s.board.current,starts[turn-1].current);}
   assert(!JSON.stringify(s).includes('"deck"'));
   await new Promise(r=>setTimeout(r,2600));
   s=await state(s.actor,f.child);
   if(turn===0){
    while(!s.board.legalPairs.length)s=await action(s,{type:'draw'});
    s=await action(s,{type:'pair',items:s.board.legalPairs[0]});
    assert(s.board.score>=450);
    const score=s.board.score,remaining=s.board.stockRemaining;
    s=await action(s,{type:'draw'});
    assert.equal(s.board.score,Math.max(0,score-100));assert.equal(s.board.stockRemaining,remaining-1);
   }
   const actor=s.actor,bank=command(s,{type:'take_score'}),banked=await Promise.all([operation(actor,bank),operation(actor,bank)]);
   assert.equal(banked[0].revision,banked[1].revision);
   const other=people.find(p=>p!==actor);
   if(turn===0)assert.deepEqual((await rpc(other,'delayed_reviews',{p_child:f.child},'authenticated')).events,[]);
  }
  const terminal=await state(actor,f.child);
  assert.equal(terminal.terminal,true);assert.equal(terminal.winner,actor);
  const summary=await q("SELECT jsonb_build_object('settlements',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),'balances',(SELECT jsonb_agg(chips ORDER BY chips) FROM public.players WHERE game_id=$1),'postings',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'),'attempts',jsonb_array_length(state->'attempts')) v FROM private.delayed_children WHERE id=$2",[f.match,f.child]);
  assert.equal(summary.settlements,1);assert.deepEqual(summary.balances,[-7,7]);assert.equal(summary.postings,real?2:0);assert.equal(summary.attempts,6);
  await operation(actor,start);assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[f.match]),1);
  checks.push({real,...summary,identicalDecks:true,duplicateStartAndFinalBank:true,canonicalWinner:true});
 }
 const expired=await fixture(false);
 await db.query("UPDATE private.delayed_children SET available_at=date_trunc('milliseconds',clock_timestamp())-interval '36 hours 1 second',last_call_at=date_trunc('milliseconds',clock_timestamp())-interval '12 hours 1 second',expires_at=date_trunc('milliseconds',clock_timestamp())-interval '1 second' WHERE id=$1",[expired.child]);
 const row=await rpc(null,'delayed_load',{p_child:expired.child,p_actor:null});
 await synchronize((n,a)=>rpc(null,n,a),row,null);
 assert.equal(await q('SELECT terminal v FROM private.delayed_children WHERE id=$1',[expired.child]),true);
 checks.push({zeroClientForfeit:true});
 writeFileSync(dir+'/service.json',JSON.stringify({passed:true,checks},null,2));
 console.log('PASS',JSON.stringify(checks));
}finally{await db.end();}
