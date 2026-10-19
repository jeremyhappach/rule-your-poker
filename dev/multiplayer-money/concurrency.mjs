import {connect} from '../royal-flash/database.mjs';import {readFileSync,writeFileSync} from 'node:fs';import {randomUUID as uuid} from 'node:crypto';import assert from 'node:assert/strict';
const dir='.codex/evidence/multiplayer-money/',database=JSON.parse(readFileSync(dir+'context.json')).database;
const a=await connect(database),b=await connect(database),admin=await connect(database),evidence=[];
const q=async(c,s,p=[])=>(await c.query(s,p)).rows[0]?.v;
const actor=async(c,u)=>{await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[u,JSON.stringify({sub:u,role:'authenticated'})]);await c.query('SET ROLE authenticated');};
try{
 await admin.query("INSERT INTO private.game_recovery_dispatch_state(singleton,last_completed_at,last_outcome) VALUES(true,clock_timestamp(),'completed') ON CONFLICT(singleton) DO UPDATE SET last_completed_at=excluded.last_completed_at,last_outcome=excluded.last_outcome");
 for(const family of ['tri_towers','eleven_up','royal_flash']){
  console.log('Concurrency:',family);
  const game=family.replaceAll('_','-'),fixture=await(await fetch('http://127.0.0.1:5192/__money/new',{method:'POST',body:'{}'})).json(),g=fixture.session,[u1,u2]=fixture.users,[p1,p2]=fixture.players;
  const deadline=(await admin.query('SELECT config_deadline::text FROM public.games WHERE id=$1',[g])).rows[0].config_deadline;
  await actor(a,u1);await actor(b,u2);
  const offer=await q(a,`SELECT public.${family}_configure($1,$2,2,$3,'{"ante_amount":9}',$4) v`,[g,p1,game,deadline]),d=offer.dealer_game.id;
  const race=await Promise.allSettled([q(a,`SELECT public.${family}_configure($1,$2,2,$3,'{"ante_amount":17}',$4) v`,[g,p1,game,deadline]),q(b,"SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,d,p2])]);
  assert.equal(race[0].status,'rejected');assert.match(race[0].reason.message,/setup_replay_conflict/);assert.equal(race[1].value.outcome,'accepted');
  assert.equal((await admin.query(`SELECT stake FROM private.${family}_matches WHERE dealer_game_id=$1`,[d])).rows[0].stake,9);
  await assert.rejects(q(a,`SELECT public.${family}_close($1) v`,[d]),/close_denied/);
  await assert.rejects(q(a,`SELECT private.${family}_settle($1) v`,[d]),/permission denied/);
  // Both actors submit the same final ante again: no second competition.
  await Promise.all([q(a,'SELECT public.advance_ante_phase($1,$2) v',[g,d]),q(b,'SELECT public.advance_ante_phase($1,$2) v',[g,d])]);
  assert.equal((await admin.query('SELECT count(*) n FROM public.rounds WHERE dealer_game_id=$1',[d])).rows[0].n,'1');
  await admin.query(`UPDATE private.${family}_matches SET state=state||jsonb_build_object('phase','stage_complete','deadline',0,'stage',2,'turnIndex',1,'scores',jsonb_build_object($2::text,100,$3::text,0)) WHERE dealer_game_id=$1`,[d,p1,p2]);
  for(const c of [a,b]){await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");}
  // Independent recovery connections contend on actual round/game/match locks.
  await Promise.all([a,b].map(c=>q(c,`SELECT private.${family}_recover() v`)));
  await Promise.all([a,b].map(c=>q(c,`SELECT private.${family}_settle($1) v`,[d])));
  const balances=(await admin.query('SELECT id,chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[g])).rows;
  assert.deepEqual(balances.map(p=>p.chips),[109,91]);
  const results=(await admin.query('SELECT id,player_chip_changes FROM public.game_results WHERE dealer_game_id=$1',[d])).rows;assert.equal(results.length,1);
  const batches=(await admin.query('SELECT id,cursor,transfers,unmatched_deltas FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[d])).rows;assert.equal(batches.length,1);assert.deepEqual(batches[0].unmatched_deltas,{});
  await actor(a,u1);await actor(b,u2);
  const snapshots=await Promise.all([a,b].map(c=>q(c,`SELECT public.${family}_snapshot($1) v`,[d])));assert.ok(snapshots.every(v=>v.settlement&&v.financial.resultId===results[0].id));
  await admin.query(`UPDATE private.${family}_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1`,[d]);
  await Promise.all([a,b].map(c=>q(c,`SELECT public.${family}_close($1) v`,[d])));
  const after=(await admin.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[g])).rows.map(p=>p.chips);assert.deepEqual(after,[109,91]);
  assert.equal((await admin.query(`SELECT count(*) n FROM private.${family}_matches WHERE game_id=$1`,[g])).rows[0].n,'1');
  evidence.push({game,session:g,dealerGameId:d,stakeRace:'changed offer rejected; exact nine-chip offer accepted',independentRecovery:'one result and transfer batch',before:[100,100],after,results,batches});
 }
 writeFileSync(dir+'concurrency.json',JSON.stringify({passed:true,evidence},null,2));console.log(JSON.stringify(evidence.map(e=>({game:e.game,before:e.before,after:e.after,batches:e.batches.length})),null,2));
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
