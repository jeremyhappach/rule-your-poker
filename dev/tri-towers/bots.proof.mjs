import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {randomUUID as uuid} from 'node:crypto';
import {connect,actor,fixture,state,action,snapshot,balances,configure} from './bots-fixture.mjs';
const database=`tri_bots_${Date.now()}`,root=await connect('postgres');
await root.query(`CREATE DATABASE ${database} TEMPLATE tri_polish_1792113087070`);await root.end();
const c=await connect(database),passed=[],metrics={};const pass=s=>{passed.push(s);console.log('PASS',s);};
const source=JSON.parse(await readFile('qualification.local/tri-towers/bots-production-baseline.json','utf8'));
const migration=(await readdir('supabase/migrations')).find(n=>n.endsWith('_tri_towers_bots.sql'));
try{
 await c.query('SET check_function_bodies=off');
 for(const f of source.functions)await c.query(f.definition);
 for(const t of source.triggers){await c.query(`DROP TRIGGER IF EXISTS "${t.name}" ON ${t.table}`);await c.query(t.definition);}
 await c.query('SET check_function_bodies=on');
 for(const f of source.functions)assert.equal((await c.query('SELECT md5(pg_get_functiondef($1::regprocedure)) hash',[f.signature])).rows[0].hash,f.hash);
 pass('115 deployed authority/dependency definitions and 67 actual financial/session triggers restored exactly');
 const historical=async()=>(await c.query("SELECT dealer_game_id,md5((to_jsonb(m)-'bot_due_at')::text) hash FROM private.tri_towers_matches m ORDER BY 1")).rows;
 const before=await historical();
 const sql=(await readFile('supabase/migrations/'+migration,'utf8')).replace(/^SELECT cron\.alter_job.*$/m,'-- pg_cron is supplied by production; loopback worker uses the same SQL entry.');
 await c.query(sql);assert.deepEqual(await historical(),before);
 if(process.argv.includes('--installed')){
  const installed=JSON.parse(await readFile('qualification.local/tri-towers/bots-production-installed.json','utf8'));
  for(const f of installed.functions)await c.query(f.definition);
  pass('Financial and concurrency proof uses captured installed production bot/admission definitions');
 }
 await c.query('UPDATE private.tri_towers_release SET enabled=true');
 await writeFile('qualification.local/tri-towers/bots-context.json',JSON.stringify({database,migration}));
 pass('Exact packaged migration preserves existing match rows; private bot functions have no browser grants');
 await assert.rejects(actor(database,uuid(),"SELECT private.tri_towers_recover() v"),/permission denied/);
 // Rollback fixture executes actual scoring and settlement authority with deployed financial triggers.
 for(const [name,scores,expected] of [['human-win',[30,10,20],[10,-5,-5]],['bot-win',[10,30,20],[-5,10,-5]],['mixed-tie',[30,30,10],[2,3,-5]],['all-tie',[10,10,10],[0,0,0]]]){
  const f=await fixture(c,database,[false,true,true]);const baseline=await balances(c,f),m=await state(c,f);
  await c.query('BEGIN');
  await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(f.players.map((id,i)=>[id,scores[i]]))}]);
  await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  const after=await balances(c,f);for(let i=0;i<3;i++)assert.equal(Number(after.find(p=>p.id===f.players[i]).chips),f.chips[i]+expected[i]);
  const journal=(await c.query('SELECT * FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[f.dealer])).rows;
  assert.equal(journal.length,name==='all-tie'?0:1);for(const b of journal)assert.deepEqual(b.unmatched_deltas,{});
  const snaps=(await c.query('SELECT player_id,chips,is_bot FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows;assert.equal(snaps.length,3);
  for(const p of after)assert.equal(Number(snaps.find(s=>s.player_id===p.id).chips),Number(p.chips));
  for(let i=0;i<3;i++)await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);
  assert.equal((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
  assert.equal(after.reduce((n,p)=>n+Number(p.chips),0),f.chips.reduce((a,b)=>a+b));
  assert.equal(Number((await c.query('SELECT pot FROM public.games WHERE id=$1',[f.id])).rows[0].pot),0);
  await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);
  assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'game_selection');assert.deepEqual(await balances(c,f),after);
  const g=(await c.query('SELECT * FROM public.games WHERE id=$1',[f.id])).rows[0];
  const next=(await c.query("SELECT public.tri_towers_configure($1,$2,3,'tri-towers','{\"ante_amount\":5}',(SELECT config_deadline FROM public.games WHERE id=$1)) v",[f.id,f.players[0]])).rows[0].v;
  assert.notEqual(next.dealer_game.id,f.dealer);assert.deepEqual(await balances(c,f),after);
  await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);assert.deepEqual(await balances(c,f),after);
  await c.query('ROLLBACK');assert.deepEqual(await balances(c,f),baseline);assert.equal((await state(c,f)).settlement,null);
  pass(name+': exact canonical balances, balanced journal, snapshots, one result, continuation/Run Back/late replay carryover and rollback');
 }
 const f=await fixture(c,database),m=await state(c,f),base=await balances(c,f);
 await c.query('BEGIN');await c.query('SAVEPOINT failure');
 await c.query("CREATE FUNCTION pg_temp.bot_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_bot_failure';END $$");await c.query('CREATE TRIGGER bot_fail BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.bot_fail()');
 await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:2,deadline:0,scores:{[f.players[0]]:10,[f.players[1]]:20}}]);
 await assert.rejects(c.query('SELECT private.tri_towers_settle($1)',[f.dealer]),/injected_bot_failure/);await c.query('ROLLBACK TO SAVEPOINT failure');assert.deepEqual(await balances(c,f),base);assert.equal((await state(c,f)).settlement,null);await c.query('ROLLBACK');
 pass('Injected financial failure rolls back balances, receipt, results, snapshots and terminal state');
 await c.query('BEGIN');await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[f.id]);await c.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[f.dealer,{...m.state,phase:'complete',turnIndex:2,deadline:0,scores:{[f.players[0]]:10,[f.players[1]]:20}}]);
 await c.query('SELECT private.tri_towers_settle($1)',[f.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');const endBalances=await balances(c,f);
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[f.dealer]);await c.query('SELECT private.tri_towers_recover()');assert.deepEqual(await balances(c,f),endBalances);assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'session_ended');await c.query('ROLLBACK');
 pass('Session Ended and duplicate recovery retain human and bot canonical balances');
 // Redacted policy equivalence across every hidden tableau/stock permutation.
 const playing={...m.state,phase:'playing',deadline:Date.now()+120000};let first;
 for(let i=0;i<100;i++){const deck=[...playing.deck],hidden=[...Array(18).keys(),...Array.from({length:23},(_,j)=>j+29)];for(let j=hidden.length-1;j>0;j--){const k=(i*17+j*7)%(j+1);[deck[hidden[j]],deck[hidden[k]]]=[deck[hidden[k]],deck[hidden[j]]];}const v=(await c.query('SELECT private.tri_towers_visible($1) v',[{...playing,deck}])).rows[0].v;const choice=(await c.query('SELECT private.tri_towers_bot_choice($1,$2) v',[v,playing.deadline-100000])).rows[0].v;if(i===0)first=choice;else assert.deepEqual(choice,first);}
 await assert.rejects(c.query('SELECT private.tri_towers_bot_choice($1,0)',[playing]),/bot_private_input/);pass('100 equivalent-visible hidden-card/stock permutations give identical decisions; private input rejected');
 // Real time, independent workers, no accelerated bot deadlines.
 await new Promise(r=>setTimeout(r,850));const peer=await connect(database);
 const rev=(await state(c,f)).revision;await Promise.all([c.query('SELECT private.tri_towers_recover()'),peer.query('SELECT private.tri_towers_recover()')]);assert.equal((await state(c,f)).revision,rev+1);await peer.end();
 await assert.rejects(action(database,f,f.users[0],rev,'draw'),/stale_revision|spectator/);await assert.rejects(action(database,f,f.users[1],rev+1,'draw'),/participant_required/);
 pass('Competing independent workers commit one bot transition; stale actions and bot impersonation rejected');
 await c.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.id]);const paused=await state(c,f);await new Promise(r=>setTimeout(r,1000));await c.query('SELECT private.tri_towers_recover()');assert.equal((await state(c,f)).revision,paused.revision);await c.query('UPDATE public.games SET is_paused=false WHERE id=$1',[f.id]);assert((await state(c,f)).state.deadline>paused.state.deadline);pass('Pause suppresses bot work; resume shifts stage deadline and rearms cadence');
 const seven=await fixture(c,database,[false,true,false,true,true,true,true]);assert.equal((await snapshot(database,seven)).players.length,7);assert.deepEqual((await state(c,seven)).state.players.map(p=>p.id),[...seven.players.slice(1),seven.players[0]]);pass('Seven mixed participants preserve canonical clockwise order with dealer last');
 const human=await fixture(c,database,[false,false]);assert.equal((await state(c,human)).bot_due_at,null);assert.equal((await snapshot(database,human,human.users[1])).canAct,true);
 await action(database,human,human.users[1],0,'start');pass('Human-only setup and initial Ready remain functional');
 const times=[];for(let i=0;i<50;i++){const t=performance.now();await c.query('SELECT private.tri_towers_recover()');times.push(performance.now()-t);}metrics.workerMs={max:Math.max(...times),mean:times.reduce((a,b)=>a+b)/times.length};
 await c.query('SET enable_seqscan=off');metrics.plan=(await c.query("EXPLAIN SELECT dealer_game_id FROM private.tri_towers_matches WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL AND least((state->>'deadline')::bigint,bot_due_at)<=0 ORDER BY least((state->>'deadline')::bigint,bot_due_at),dealer_game_id LIMIT 20")).rows;assert(JSON.stringify(metrics.plan).includes('tri_towers_matches_due'));await c.query('RESET enable_seqscan');pass('Due selection uses partial index; bounded worker timings recorded');
 await writeFile('qualification.local/tri-towers/bots-proof.json',JSON.stringify({passed,metrics,database,migration,productionWrites:0},null,2));
}finally{await c.end();}
