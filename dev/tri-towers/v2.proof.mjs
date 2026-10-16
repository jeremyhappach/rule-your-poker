import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {randomUUID as uuid} from 'node:crypto';
import {connect,fixture,state,balances,actor,action,configure,snapshot} from './bots-fixture.mjs';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/v2-context.json','utf8')),c=await connect(database),passed=[],financial=[];
const pass=s=>{passed.push(s);console.log('PASS',s);};
const reduce=async(s,a,i,t)=>(await c.query('SELECT private.tri_towers_reduce($1,$2,$3,$4) s',[s,a,i,t])).rows[0].s;
const board=async(s,a,i,t)=>(await c.query('SELECT private.tri_towers_board_reduce_v2($1,$2,$3,$4) s',[s,a,i,t])).rows[0].s;
try{
 const human=await fixture(c,database,[false,false]),m=await state(c,human),deck=Array.from({length:52},(_,i)=>i);
 let b={...m.state,deck,removed:[],waste:4,run:0,score:0,scoreBefore:0,phase:'ready',deadline:30000};
 await assert.rejects(board(b,'remove',0,1000),/illegal_move/);
 let s=await board(b,'remove',18,1000);assert.equal(s.deadline,121000);assert.equal(s.score,100);assert.equal(s.phase,'playing');
 s=await board(s,'remove',19,2000);assert.equal(s.score,300);
 for(let run=0;run<14;run++){const t=await board({...b,phase:'playing',deadline:121000,run},'remove',18,1000);assert.equal(t.score,[100,200,400,600,800,1000,1200,1500,2000][Math.min(run,8)]);}
 for(const score of [0,50,100,90000]){const t=await board({...b,score,run:7},'draw',null,1000);assert.equal(t.score,Math.max(0,score-100));assert.equal(t.run,0);assert.equal(t.cursor,30);}
 s=await board({...b,phase:'playing',deadline:121000,removed:Array.from({length:27},(_,i)=>i+1),waste:12},'remove',0,1000);
 assert.equal(s.result.timeBonus,1200);assert.equal(s.result.stockBonus,23000);assert.equal(s.score,39300);
 s=await board({...b,phase:'playing',deadline:121000,score:10000},'take_score',null,119001);assert.equal(s.score,10010);assert.equal(s.result.stockBonus,0);
 for(const phase of ['ready','playing']){const t=await board({...b,phase,score:9900},'tick',null,30000);assert.equal(t.score,9900);assert.equal(t.result.timeBonus,0);assert.equal(t.result.stockBonus,0);assert.equal(t.phase,'stage_complete');}
 pass('Exact streak schedule, draw/clamp, peak + clear stock/time, whole-second Take Score, first-action clock and timeout semantics');
 for(let n=2;n<=7;n++){
  const f=await fixture(c,database,Array(n).fill(false)),initial=await state(c,f);let current=initial.state;
  for(let j=0;j<n*2;j++){
   assert.equal(current.phase,'ready');assert.equal(current.stage,Math.floor(j/n)+1);assert.equal(current.turnIndex,j%n);
   const start=current.deadline-29900;current=await reduce(current,'draw',null,start);assert.equal(current.deadline-start,120000);
   current=await reduce(current,'take_score',null,start+1000);assert.equal(current.phase,'stage_complete');
   assert.equal(current.deadline-current.stages.at(-1).completedAt,5000);current=await reduce(current,'tick',null,current.deadline);
  }
  assert.equal(current.phase,'complete');assert.equal(current.stages.length,n*2);
 }
 for(const score of [79999,80000,80001]){
  let t={...m.state,phase:'stage_complete',stage:2,turnIndex:1,deadline:0,scores:{[m.state.players[0].id]:score,[m.state.players[1].id]:0}};
  t=await reduce(t,'tick',null,1);
  if(score<80000)assert.equal(t.phase,'complete');
  else{assert.equal(t.stage,3);assert.equal(t.turnIndex,0);t=await reduce(t,'tick',null,t.deadline);t=await reduce(t,'tick',null,t.deadline);assert.equal(t.phase,'complete');assert.equal(t.qualified.length,1);}
 }
 pass('2–7 participants alternate complete base rounds; 79,999/80,000/80,001 qualification freezes once; bonus timeout cannot award another round');
 const v=await snapshot(database,human,human.users[1]);assert.equal(v.canAct,true);
 const started=await action(database,human,human.users[1],v.revision,'draw');assert.equal(started.phase,'playing');assert(started.deadline-started.serverAt>119000);
 await assert.rejects(action(database,human,human.users[0],started.revision,'draw'),/spectator/);
 await assert.rejects(action(database,human,human.users[1],v.revision,'draw'),/stale_revision/);
 const request=uuid(),collected=await action(database,human,human.users[1],started.revision,'take_score',null,request);
 const duplicate=await action(database,human,human.users[1],started.revision,'take_score',null,request);assert.equal(duplicate.revision,collected.revision);
 await assert.rejects(actor(database,human.users[1],'SELECT private.tri_towers_board_reduce_v2($1,$2,NULL,0) v',[b,'draw']),/permission denied/);
 pass('Authenticated first action, duplicate UUID, stale revision, spectator and private-core authorization');
 for(const [name,scores,deltas] of [['human-win',[30,10,20],[10,-5,-5]],['bot-win',[10,30,20],[-5,10,-5]],['mixed-tie',[30,30,10],[2,3,-5]],['all-tie',[10,10,10],[0,0,0]]]){
  const f=await fixture(c,database,[false,true,true]),initial=await state(c,f),before=await balances(c,f);
  await c.query('BEGIN');
  try{
   await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,{...initial.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(f.players.map((id,i)=>[id,scores[i]]))}]);
   await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');
   const after=await balances(c,f),journal=(await c.query('SELECT * FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows;
   for(let i=0;i<3;i++)assert.equal(Number(after.find(p=>p.id===f.players[i]).chips),f.chips[i]+deltas[i]);
   assert.equal(after.reduce((n,p)=>n+Number(p.chips),0),f.chips.reduce((a,b)=>a+b));
   assert.equal(journal.length,name==='all-tie'?0:1);for(const j of journal)assert.deepEqual(j.unmatched_deltas,{});
   const snaps=(await c.query('SELECT player_id,chips FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;assert.equal(snaps.length,3);
   for(const p of after)assert.equal(Number(snaps.find(s=>s.player_id===p.id).chips),Number(p.chips));
   for(let i=0;i<3;i++)await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);
   assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);
   const terminal=(await c.query('SELECT public.tri_towers_snapshot($1) v',[f.dealer])).rows[0].v;
   assert(terminal.financial.resultId);assert.equal(terminal.financial.batch?.id??null,journal[0]?.id??null);
   for(const p of after)assert.equal(Number(terminal.financial.balances[p.id]),Number(p.chips));
   await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);assert.deepEqual(await balances(c,f),after);
   assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'game_selection');
   const next=(await c.query("SELECT public.tri_towers_configure($1,$2,3,'tri-towers','{\"ante_amount\":5}',(SELECT config_deadline FROM public.games WHERE id=$1)) v",[f.id,f.players[0]])).rows[0].v;assert.notEqual(next.dealer_game.id,f.dealer);
   await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);assert.deepEqual(await balances(c,f),after);
   financial.push({case:name,initial:f.chips,deltas,actual:f.players.map(id=>Number(after.find(p=>p.id===id).chips)),balanced:true,resultCount:1,snapshotCount:3,transferCount:journal.length});
  }finally{await c.query('ROLLBACK');}
  assert.deepEqual(await balances(c,f),before);assert.equal((await state(c,f)).settlement,null);
 }
 pass('Four canonical financial outcomes, exact chips/ledger/results/snapshots, duplicate settlement, continuation, Run Back, late replay and rollback');
 const f=await fixture(c,database,[false,true]),initial=await state(c,f),before=await balances(c,f);
 const terminal={...initial.state,phase:'stage_complete',stage:2,turnIndex:1,deadline:0,scores:{[f.players[0]]:10,[f.players[1]]:20}};
 await c.query('BEGIN');
 await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,terminal]);await c.query('SAVEPOINT injected');
 await c.query("CREATE FUNCTION pg_temp.tri_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_financial_failure';END $$");
 await c.query('CREATE TRIGGER tri_fail BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.tri_fail()');
 await assert.rejects(c.query('SELECT private.tri_towers_recover()'),/injected_financial_failure/);await c.query('ROLLBACK TO SAVEPOINT injected');
 assert.deepEqual(await balances(c,f),before);assert.equal((await state(c,f)).settlement,null);assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'0');await c.query('ROLLBACK');
 await c.query('BEGIN');await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[f.id]);
 await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,terminal]);await c.query('SELECT private.tri_towers_recover()');await c.query('SET CONSTRAINTS ALL IMMEDIATE');
 const ended=await balances(c,f);assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'session_ended');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);assert.deepEqual(await balances(c,f),ended);await c.query('ROLLBACK');
 await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,terminal]);
 const peer=await connect(database);await Promise.all([c.query('SELECT private.tri_towers_recover()'),peer.query('SELECT private.tri_towers_recover()')]);await peer.end();
 const after=await balances(c,f);assert.equal(Number(after.find(p=>p.id===f.players[0]).chips),95);assert.equal(Number(after.find(p=>p.id===f.players[1]).chips),115);
 assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
 await c.query('SELECT private.tri_towers_recover()');assert.deepEqual(await balances(c,f),after);
 pass('Actual financial trigger failure rollback, terminal Session Ended carryover and competing independent worker settlement exactly once');
 let first;
 for(let i=0;i<40;i++){
  const hidden=[...Array(18).keys(),...Array.from({length:23},(_,j)=>j+29)],d=[...initial.state.deck];
  for(let j=hidden.length-1;j>0;j--){const k=(j*7+i*13)%(j+1);[d[hidden[j]],d[hidden[k]]]=[d[hidden[k]],d[hidden[j]]];}
  const choice=(await c.query('SELECT private.tri_towers_bot_choice(private.tri_towers_visible($1),$2) v',[{...initial.state,deck:d},initial.state.deadline-10000])).rows[0].v;
  if(i===0)first=choice;else assert.deepEqual(choice,first);
 }
 await assert.rejects(c.query('SELECT private.tri_towers_bot_choice($1,0)',[initial.state]),/bot_private_input/);
 pass('Equivalent visible state produces identical bot choices; private deck input rejected');
 await writeFile('qualification.local/tri-towers/v2-proof.json',JSON.stringify({passed,financial,productionWrites:0},null,2));
}finally{await c.end();}
