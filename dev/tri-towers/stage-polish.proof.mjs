import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect,actor,fixture,state,action,expire} from './polish-fixture.mjs';
const database=`tri_polish_${Date.now()}`,root=await connect('postgres');
await root.query(`CREATE DATABASE ${database} TEMPLATE postgres`);await root.end();
const c=await connect(database),passed=[];
const pass=s=>{passed.push(s);console.log('PASS',s);};
const migration='20261016011439_tri_towers_stage_results';
const untouched=async()=> (await c.query("SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' name,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f' AND p.proname NOT IN ('tri_towers_reduce','tri_towers_snapshot','tri_towers_action','tri_towers_finish_stage') ORDER BY 1")).rows;
const records=async()=>Promise.all(['private.tri_towers_matches','private.tri_towers_history','private.tri_towers_requests','public.game_results','public.session_player_snapshots','public.gameplay_transfer_batches'].map(async t=>(await c.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) hash FROM ${t} t`)).rows[0].hash));
try{
 const compatibility=await fixture(c,database);const legacyUser=(await state(c,compatibility)).state.players[0].userId;
 const oldSnapshot=await actor(database,legacyUser,'SELECT public.tri_towers_snapshot($1) v',[compatibility.dealer]);delete oldSnapshot.serverAt;
 const oldFunctions=await untouched(),oldRecords=await records();
 await c.query(await readFile(`supabase/migrations/${migration}.sql`,'utf8'));
 assert.deepEqual(await untouched(),oldFunctions);assert.deepEqual(await records(),oldRecords);
 const newSnapshot=await actor(database,legacyUser,'SELECT public.tri_towers_snapshot($1) v',[compatibility.dealer]);delete newSnapshot.serverAt;assert.deepEqual(newSnapshot,oldSnapshot);
 assert((await c.query("SELECT count(*) n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)")).rows[0].n>=80);
 pass('Migration preserves existing matches, history, financial records, all unrelated routines and actual shared triggers');
 const f=await fixture(c,database);let m=await state(c,f),s=m.state,user=s.players[0].userId;
 await assert.rejects(action(database,f,user,m.revision,'take_score'),/phase/);
 await assert.rejects(action(database,f,f.users[0],m.revision,'take_score'),/spectator/);
 let v=await action(database,f,user,m.revision,'start');
 await c.query("UPDATE private.tri_towers_matches SET state=state||'{\"score\":24000}'::jsonb WHERE dealer_game_id=$1",[f.dealer]);
 const req=uuid();const duplicates=await Promise.all([action(database,f,user,v.revision,'take_score',null,req),action(database,f,user,v.revision,'take_score',null,req)]);
 assert.equal(duplicates[0].revision,duplicates[1].revision);m=await state(c,f);assert.equal(m.state.stages.length,1);assert.equal(m.state.score,24000);
 const result=m.state.stages[0],hold=m.state.deadline;assert.equal(hold-result.completedAt,5000);
 await assert.rejects(action(database,f,user,v.revision,'draw',null,req),/replay_conflict/);
 await assert.rejects(action(database,f,user,v.revision,'take_score'),/stale_revision/);
 await assert.rejects(action(database,f,user,m.revision,'give_up'),/phase/);
 await action(database,f,user,m.revision,'continue');assert.deepEqual((await state(c,f)).state,m.state);
 await c.query('SELECT private.tri_towers_recover()');assert.equal((await state(c,f)).state.deadline,hold);
 pass('Take Score, duplicate UUID, replay/stale/actor checks and legacy actions preserve one immutable five-second result');
 await expire(c,f);m=await state(c,f);assert.equal(m.state.stage,2);assert.equal(m.state.phase,'playing');assert.equal(m.state.score,24000);
 await c.query("UPDATE private.tri_towers_matches SET state=state||'{\"score\":63000}'::jsonb WHERE dealer_game_id=$1",[f.dealer]);
 const race=await Promise.allSettled([action(database,f,user,m.revision,'take_score'),action(database,f,user,m.revision,'draw')]);
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 m=await state(c,f);if(m.state.phase==='playing')await action(database,f,user,m.revision,'take_score');m=await state(c,f);
 assert.deepEqual([m.state.stages.at(-1).scoreBefore,m.state.stages.at(-1).stageScore,m.state.stages.at(-1).score],[24000,39000,63000]);
 await expire(c,f);m=await state(c,f);assert.equal(m.state.turnIndex,1);assert.equal(m.state.phase,'ready');assert.equal(m.state.scores[f.players[1]],63000);assert(m.state.deadline>Date.now()+29000);
 pass('Concurrent actions serialize; same-player stage auto-starts; final result precedes next-human 30-second Ready');
 // Existing old-format records require no backfill and keep their original deadlines/scores.
 const legacy={...s,phase:'stage_complete',stage:1,score:12345,deadline:Date.now()+5000,stages:[{playerId:s.players[0].id,stage:1,score:12345,reason:'cleared'}]};
 let l=(await c.query("SELECT private.tri_towers_reduce($1,'continue',NULL,$2) s",[legacy,legacy.deadline-1])).rows[0].s;assert.deepEqual(l,legacy);
 l=(await c.query("SELECT private.tri_towers_reduce($1,'tick',NULL,$2) s",[legacy,legacy.deadline])).rows[0].s;assert.equal(l.phase,'playing');assert.equal(l.stage,2);assert.equal(l.score,12345);
 for(const phase of ['ready','playing']){const old={...s,phase,deadline:Date.now()+10000};const preserved=(await c.query("SELECT private.tri_towers_reduce($1,'tick',NULL,$2) s",[old,Date.now()])).rows[0].s;assert.deepEqual(preserved,old);}
 pass('Legacy ready, playing and completed-stage snapshots survive without historical rewrites or deadline resets');
 // Deterministic local last-card fixture: real reducer/action/hold, including final bonus stage.
 const clear=await fixture(c,database);let cm=await state(c,clear);const cs=cm.state;const clearUser=cs.players[0].userId;
 await c.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[clear.dealer,{...cs,phase:'playing',stage:2,score:80000,deadline:Date.now()+101000,deck:Array.from({length:52},(_,i)=>i),waste:12,removed:Array.from({length:27},(_,i)=>i+1)}]);
 let cv=await action(database,clear,clearUser,cm.revision,'remove',0);assert.equal(cv.phase,'stage_complete');assert(cv.stages.at(-1).timeBonus>=10000);assert.equal(cv.stages.at(-1).finishTurn,false);
 await expire(c,clear);cm=await state(c,clear);assert.equal(cm.state.stage,3);assert.equal(cm.state.phase,'playing');
 cv=await action(database,clear,clearUser,cm.revision,'take_score');assert.equal(cv.stages.at(-1).timeBonus,0);assert.equal(cv.stages.at(-1).finishTurn,true);
 await expire(c,clear);assert.equal((await state(c,clear)).state.turnIndex,1);
 pass('Last-card clear awards its time bonus once; earned bonus starts automatically and final bonus receives its hold');
 for(const reason of ['give_up','timeout']){const t=await fixture(c,database);let tm=await state(c,t);await action(database,t,tm.state.players[0].userId,tm.revision,'start');tm=await state(c,t);
  await c.query('UPDATE private.tri_towers_matches SET state=state||$2::jsonb WHERE dealer_game_id=$1',[t.dealer,{score:81000,...(reason==='timeout'?{deadline:0}:{})}]);
  if(reason==='timeout')await Promise.allSettled([action(database,t,tm.state.players[0].userId,tm.revision,'take_score'),c.query('SELECT private.tri_towers_recover()')]);else await action(database,t,tm.state.players[0].userId,tm.revision,'give_up');
  tm=await state(c,t);assert.equal(tm.state.stages.at(-1).reason,reason);assert.equal(tm.state.stages.at(-1).finishTurn,true);assert.equal(tm.state.stages.length,1);
  await expire(c,t);tm=await state(c,t);assert.equal(tm.state.turnIndex,1);assert.equal(tm.state.scores[t.players[1]],81000);
 }
 pass('Give Up and timeout retain full-turn abandonment; deadline/action races produce one stage result');
 // Exhaustion only when there is no legal move; time bonus stays zero.
 const exhausted={...s,phase:'playing',cursor:51,deadline:Date.now()+10000,deck:Array.from({length:52},(_,i)=>i),removed:Array.from({length:27},(_,i)=>i)};exhausted.deck[51]=exhausted.deck[27];
 const ex=(await c.query("SELECT private.tri_towers_reduce($1,'draw',NULL,$2) s",[exhausted,Date.now()])).rows[0].s;
 assert.equal(ex.stages.at(-1).reason,'exhausted');assert.equal(ex.stages.at(-1).timeBonus,0);pass('Empty stock without legal moves produces exactly one exhausted result');
 // Roll back actual canonical settlement and deferred financial triggers, not mocked balances.
 const money=await fixture(c,database);const mm=await state(c,money),winner=mm.state.players[0].id,loser=mm.state.players[1].id;
 await c.query('BEGIN');await c.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[money.dealer,{...mm.state,phase:'complete',turnIndex:2,deadline:0,scores:{[winner]:63000,[loser]:1000}}]);
 await c.query('SELECT private.tri_towers_settle($1)',[money.dealer]);await c.query('SET CONSTRAINTS ALL IMMEDIATE');
 const balances=(await c.query('SELECT id,chips FROM public.players WHERE game_id=$1',[money.id])).rows;assert.equal(Number(balances.find(p=>p.id===winner).chips),5);assert.equal(Number(balances.find(p=>p.id===loser).chips),-5);
 await c.query('SELECT private.tri_towers_settle($1)',[money.dealer]);assert.equal(Number((await c.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[money.dealer])).rows[0].n),1);
 const batches=(await c.query('SELECT * FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[money.dealer])).rows;assert.equal(batches.length,1);assert.deepEqual(batches[0].unmatched_deltas,{});
 const snaps=(await c.query('SELECT player_id,chips FROM public.session_player_snapshots WHERE dealer_game_id=$1',[money.dealer])).rows;assert.equal(snaps.length,2);for(const p of balances)assert.equal(Number(snaps.find(x=>x.player_id===p.id).chips),Number(p.chips));
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[money.users[0]]);await c.query('SELECT public.tri_towers_close($1)',[money.dealer]);await c.query('SELECT public.tri_towers_close($1)',[money.dealer]);assert.equal((await c.query('SELECT status FROM public.games WHERE id=$1',[money.id])).rows[0].status,'game_selection');
 await c.query('ROLLBACK');assert.equal((await state(c,money)).settlement,null);assert((await c.query('SELECT chips FROM public.players WHERE game_id=$1',[money.id])).rows.every(p=>Number(p.chips)===0));
 pass('Financial rollback: actual +5/-5 balances, one balanced canonical batch/result, matching snapshots, replay-safe continuation; rollback restores all');
 await writeFile('qualification.local/tri-towers/polish-context.json',JSON.stringify({database,migration}));
 await writeFile('qualification.local/tri-towers/polish-database.json',JSON.stringify({database,migration,passed,productionWrites:0},null,2));
}finally{await c.end();}
