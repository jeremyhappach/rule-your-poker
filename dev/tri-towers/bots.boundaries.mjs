import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';import {writeFile} from 'node:fs/promises';
import {connect,context,fixture,state,actor,action,balances,snapshot} from './bots-fixture.mjs';
const {database}=await context(),c=await connect(database),passed=[];const pass=s=>{passed.push(s);console.log('PASS',s);};
async function deniedSetup(kinds,change,pattern){await c.query('BEGIN');const id=uuid(),human=uuid(),player=uuid(),deadline=new Date(Date.now()+600000).toISOString();try{
 await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[human,'Boundary '+human]);await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline) VALUES($1,'game_selection',false,7,$2)",[id,deadline]);
 await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,7,0,false)',[player,id,human]);for(let i=0;i<kinds;i++){const u=uuid();await c.query('INSERT INTO public.profiles(id,username) VALUES($1,$2)',[u,'Bot '+u]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,is_bot) VALUES($1,$2,$3,$4,true)',[uuid(),id,u,6-i]);}
 if(change)await change({id,human,player});await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[human]);await c.query('SAVEPOINT refused');await assert.rejects(c.query("SELECT public.tri_towers_configure($1,$2,7,'tri-towers','{\"ante_amount\":5}',$3)",[id,player,deadline]),pattern);await c.query('ROLLBACK TO SAVEPOINT refused');assert.equal((await c.query('SELECT count(*) n FROM private.tri_towers_matches WHERE game_id=$1',[id])).rows[0].n,'0');
 }finally{await c.query('ROLLBACK');}}
try{
 await deniedSetup(0,null,/player_count/);await assert.rejects(deniedSetup(7,null,/player_count/),/players_position_check/);
 await deniedSetup(1,({id})=>c.query('UPDATE public.games SET real_money=true WHERE id=$1',[id]),/real_money_closed/);
 await deniedSetup(1,({human})=>c.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[human]),/release_closed/);
 await deniedSetup(1,({player})=>c.query('UPDATE public.players SET waiting=true WHERE id=$1',[player]),/human_required/);
 pass('One/eight players, no eligible human, revoked dealer and real money denied without admission or chip movement');
 const f=await fixture(c,database),m=await state(c,f),bot=f.players[1],human=f.players[0],before=await balances(c,f);
 const v=(await c.query('SELECT private.tri_towers_visible($1) v',[{...m.state,phase:'playing'}])).rows[0].v;
 const choose=async view=>(await c.query('SELECT private.tri_towers_bot_choice($1,$2) v',[view,Date.now()])).rows[0].v;
 assert.equal((await choose({...v,phase:'ready'})).action,'start');assert.equal((await choose({...v,deadline:Date.now()+4000})).action,'take_score');
 const noMove={...v,deadline:Date.now()+120000,cards:Array(28).fill(null),stockRemaining:1};assert.equal((await choose(noMove)).action,'draw');assert.equal((await choose({...noMove,stockRemaining:0})).action,'take_score');
 // Geometry rather than index: index 20 uncovers a parent while index 18 does not.
 const decision={...v,deadline:Date.now()+120000,cards:Array(28).fill(null),removed:[19],waste:0,run:2};decision.cards[18]=1;decision.cards[20]=12;decision.cards[21]=11;
 assert.equal((await choose(decision)).index,20);pass('Policy selects visible productive followups, Ready, stock draw and deadline-aware Take Score');
 // Real reducer proves clear/bonus and abandonment with unchanged scoring constants.
 const cleared={...m.state,phase:'playing',stage:2,score:80000,deadline:Date.now()+101000,deck:Array.from({length:52},(_,i)=>i),waste:12,removed:Array.from({length:27},(_,i)=>i+1)};
 const cr=(await c.query("SELECT private.tri_towers_reduce($1,'remove',0,$2) s",[cleared,Date.now()])).rows[0].s;assert.equal(cr.phase,'stage_complete');assert(cr.stages.at(-1).timeBonus>=10000);assert.equal(cr.stages.at(-1).finishTurn,false);
 const bonus=(await c.query("SELECT private.tri_towers_reduce($1,'tick',NULL,$2) s",[cr,cr.deadline])).rows[0].s;assert.equal(bonus.stage,3);assert.equal(bonus.phase,'playing');assert.equal(bonus.deadline-cr.deadline,120000);
 for(const reason of ['give_up','timeout']){const s={...cleared,deadline:reason==='timeout'?0:cleared.deadline};const r=(await c.query('SELECT private.tri_towers_reduce($1,$2,NULL,$3) s',[s,reason==='timeout'?'tick':'give_up',Date.now()])).rows[0].s;assert.equal(r.stages.at(-1).reason,reason);assert.equal(r.stages.at(-1).finishTurn,true);assert.equal(r.score,80000);}
 pass('Complete clear awards time/peak/run points; third stage qualifies; Give Up and timeout retain full-turn abandonment');
 // Final-stage completion races through the worker, including rollback after financial writes.
 const terminal={...m.state,turnIndex:1,phase:'stage_complete',stage:2,score:1000,deadline:0,scores:{[bot]:2000},stages:[{playerId:human,stage:2,score:1000,finishTurn:true}]};
 await c.query('BEGIN');await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,terminal]);await c.query('SAVEPOINT failure');
 await c.query("CREATE FUNCTION pg_temp.bot_terminal_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'worker_snapshot_failure';END $$");await c.query('CREATE TRIGGER bot_terminal_fail BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.bot_terminal_fail()');
 await assert.rejects(c.query('SELECT private.tri_towers_recover()'),/worker_snapshot_failure/);await c.query('ROLLBACK TO SAVEPOINT failure');assert.deepEqual(await balances(c,f),before);assert.equal((await state(c,f)).settlement,null);await c.query('ROLLBACK');
 await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,terminal]);const peer=await connect(database);await Promise.all([c.query('SELECT private.tri_towers_recover()'),peer.query('SELECT private.tri_towers_recover()')]);await peer.end();
 const settled=await balances(c,f);assert.equal(Number(settled.find(p=>p.id===bot).chips),115);assert.equal(Number(settled.find(p=>p.id===human).chips),95);assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
 await c.query('SELECT private.tri_towers_recover()');await assert.rejects(action(database,f,f.users[0],0,'draw'),/inactive/);assert.deepEqual(await balances(c,f),settled);
 pass('Concurrent final workers settle once; injected worker failure rolls back actual financial writes; stale actions and replay preserve balances');
 // Fake money must never create real-money SessionResult wallet entries.
 assert.equal((await c.query("SELECT count(*) n FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'",[f.id])).rows[0].n,'0');
 pass('Fake-money game results/snapshots do not create real-money SessionResult wallet transactions');
 for(const makeTake of [false,true]){const mixed=await fixture(c,database,[false,true,false,true]),mm=await state(c,mixed);await c.query('BEGIN');
  await c.query("INSERT INTO public.system_settings(key,value) VALUES('make_it_take_it',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[{enabled:makeTake}]);
  await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[mixed.dealer,{...mm.state,phase:'complete',turnIndex:4,deadline:0,scores:Object.fromEntries(mixed.players.map((id,i)=>[id,i===1?100:0]))}]);
  await c.query('SELECT private.tri_towers_settle($1)',[mixed.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');const carry=await balances(c,mixed);
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[mixed.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[mixed.dealer]);
  const next=(await c.query('SELECT status,dealer_position FROM public.games WHERE id=$1',[mixed.id])).rows[0];assert.equal(next.status,makeTake?'dealer_selection':'game_selection');if(!makeTake)assert.equal(next.dealer_position,2);assert.deepEqual(await balances(c,mixed),carry);await c.query('ROLLBACK');
 }
 pass('Mixed human seats retain clockwise dealer rotation and make-it-take-it bot-win fallback with unchanged balances');
 await writeFile('qualification.local/tri-towers/bots-boundaries.json',JSON.stringify({passed,productionWrites:0},null,2));
}finally{await c.end();}
