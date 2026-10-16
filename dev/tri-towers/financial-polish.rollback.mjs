import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {randomUUID as uuid} from 'node:crypto';
import {connect,actor,fixture,state} from './polish-fixture.mjs';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/polish-context.json','utf8')),c=await connect(database),passed=[];
const pass=s=>{passed.push(s);console.log('PASS',s);};
try{
 const f=await fixture(c,database,3),m=await state(c,f),ids=m.state.players.map(p=>p.id);
 const baseline=async()=>({players:(await c.query('SELECT id,chips FROM public.players WHERE game_id=$1 ORDER BY id',[f.id])).rows,
  results:(await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,
  snapshots:(await c.query('SELECT count(*) n FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,
  batches:(await c.query('SELECT count(*) n FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,
  match:await state(c,f)});
 const before=await baseline();
 for(const scores of [[30,20,10],[30,30,10],[10,10,10]]){
  await c.query('BEGIN');await c.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(ids.map((id,i)=>[id,scores[i]]))}]);
  await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  for(let i=0;i<3;i++)await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);
  const players=(await c.query('SELECT id,chips FROM public.players WHERE game_id=$1',[f.id])).rows;assert.equal(players.reduce((sum,p)=>sum+Number(p.chips),0),0);
  assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
  const batches=(await c.query('SELECT * FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows;
  assert.equal(batches.length,scores[0]===scores[2]?0:1);for(const b of batches)assert.deepEqual(b.unmatched_deltas,{});
  const snapshots=(await c.query('SELECT player_id,chips FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;assert.equal(snapshots.length,3);
  for(const p of players)assert.equal(Number(snapshots.find(x=>x.player_id===p.id).chips),Number(p.chips));
  await c.query('ROLLBACK');assert.deepEqual(await baseline(),before);
 }
 pass('Rollback winner, partial tie and all-player tie: balanced canonical transfers, one result, matching snapshots, repeated/late settlement and full restoration');
 await c.query('BEGIN');await c.query('SAVEPOINT injected_failure');
 await c.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(ids.map((id,i)=>[id,3-i]))}]);
 await c.query("CREATE FUNCTION pg_temp.tri_fail_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qualification_injected_snapshot_failure';END $$");
 await c.query('CREATE TRIGGER tri_polish_injected_failure BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.tri_fail_snapshot()');
 await assert.rejects(c.query('SELECT private.tri_towers_settle($1)',[f.dealer]),/qualification_injected_snapshot_failure/);
 await c.query('ROLLBACK TO SAVEPOINT injected_failure');assert.deepEqual(await baseline(),before);await c.query('ROLLBACK');
 pass('Injected snapshot failure rolls back chips, ledger, result and terminal state atomically with existing financial triggers enabled');
 await assert.rejects(actor(database,uuid(),'SELECT public.tri_towers_close($1) v',[f.dealer]),/close_denied/);
 await assert.rejects(actor(database,f.users[0],'SELECT public.tri_towers_close($1) v',[f.dealer]),/close_denied/);
 await assert.rejects(actor(database,f.users[0],'SELECT private.tri_towers_settle($1) v',[f.dealer]),/permission denied/);
 await assert.rejects(actor(database,f.users[0],"SELECT public.tri_towers_configure($1,$2,3,'tri-towers','{\"ante_amount\":0}',clock_timestamp()+interval '1 minute') v",[f.id,f.players[0]]),/config/);
 pass('Unauthorized/private settlement, early continuation and invalid stake rejected');
 await c.query('BEGIN');await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[f.id]);
 await c.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(ids.map(id=>[id,0]))}]);
 await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'session_ended');
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);assert.equal((await state(c,f)).finished,true);
 assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'session_ended');await c.query('ROLLBACK');assert.deepEqual(await baseline(),before);
 pass('Pending Session Ended remains terminal through duplicate close; rollback leaves no financial artifacts');
 await writeFile('qualification.local/tri-towers/polish-financial.json',JSON.stringify({passed,actualFinancialTriggers:true,productionWrites:0},null,2));
}finally{await c.end();}
