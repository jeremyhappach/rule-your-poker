import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {context,connect} from './database.mjs';
const {database}=await context(),c=await connect(database),other=await connect(database),ids=[],cases=[];
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
const call=(db,args)=>q(db,'SELECT quintzee_qualification.command($1,$2,$3,$4,$5,$6,$7) v',args);
async function fixture(count=1){const id=randomUUID(),players=Array.from({length:count},()=>randomUUID());ids.push(id);await c.query(`INSERT INTO quintzee_qualification.runs(id,state,theme,config,dependency_hash)
 SELECT $1,private.quintzee_start($2,private.quintzee_rules(),$3),'classic',private.quintzee_rules(),md5(pg_get_functiondef('private.yahtzee_category_score(jsonb,jsonb,text)'::regprocedure))`,[id,players,Date.now()-2600]);const v=await call(c,[id,players[0],null,null,null,null,null]);return {id,players,v};}
const record=name=>{cases.push(name);console.log('PASS',name);};
try{
 const tables=['public.games','public.players','public.game_results','public.session_player_snapshots','public.gameplay_transfer_batches','private.arcade_runs','private.arcade_results'];
 const existing=(await c.query('SELECT x name FROM unnest($1::text[]) x WHERE to_regclass(x) IS NOT NULL',[tables])).rows.map(x=>x.name);
 const counts=async()=>{const values={};for(const table of existing)values[table]=await q(c,`SELECT count(*)::text v FROM ${table}`);return values;};
 const before=await counts();
 const f=await fixture(2),req=randomUUID(),args=[f.id,f.players[0],req,f.v.revision,f.v.scope,'score',[11]];
 const pair=await Promise.all([call(c,args),call(other,args)]);assert.deepEqual(pair.map(x=>x.outcome).sort(),['committed','duplicate']);assert.deepEqual(pair[0].state,pair[1].state);record('independent-connection same-request race commits one score and one roll');
 const f2=await fixture();const pair2=await Promise.all([call(c,[f2.id,f2.players[0],randomUUID(),f2.v.revision,f2.v.scope,'roll',[]]),call(other,[f2.id,f2.players[0],randomUUID(),f2.v.revision,f2.v.scope,'roll',[]])]);assert.deepEqual(pair2.map(x=>x.outcome).sort(),['committed','stale']);record('different requests at same revision cannot both reroll');
 await assert.rejects(call(c,[f.id,f.players[0],req,f.v.revision,f.v.scope,'roll',[]]),/request_conflict/);record('request UUID payload tampering rejected');
 const live=await call(c,[f.id,f.players[0],null,null,null,null,null]);
 await assert.rejects(call(c,[f.id,f.players[1],randomUUID(),live.revision,live.scope,'roll',[]]),/not_your_turn/);record('inactive network participant cannot control the active card');
 const f3=await fixture();await c.query(`UPDATE quintzee_qualification.runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1`,[f3.id,Date.now()+200]);
 // Hold the same row lock beyond expiry, then prove the action samples time AFTER locking.
 await c.query('BEGIN');await c.query('SELECT 1 FROM quintzee_qualification.runs WHERE id=$1 FOR UPDATE',[f3.id]);
 const delayed=call(other,[f3.id,f3.players[0],randomUUID(),f3.v.revision,f3.v.scope,'score',[11]]);
 await new Promise(resolve=>setTimeout(resolve,300));await c.query('COMMIT');
 const expiry=await delayed;assert.equal(expiry.outcome,'stale');assert.equal(expiry.state.board.result.reason,'timeout');assert.deepEqual(expiry.state.board.scores,{});record('deadline race under row-lock contention rejects late score');
 // Carry an old request through autonomous continuation: it must not touch the next card.
 await c.query(`UPDATE quintzee_qualification.runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1`,[f3.id,Date.now()-1]);
 const advanced=await call(c,[f3.id,f3.players[0],null,null,null,null,null]);assert.equal(advanced.state.round,2);
 const late=await call(c,[f3.id,f3.players[0],randomUUID(),f3.v.revision,f3.v.scope,'score',[11]]);assert.equal(late.outcome,'stale');assert.deepEqual(late.state,advanced.state);record('old scope cannot score into the next round');
 const f4=await fixture();const preserved=await q(c,'SELECT config v FROM quintzee_qualification.runs WHERE id=$1',[f4.id]);await q(c,'SELECT private.quintzee_rules(240000,70) v');assert.deepEqual(await q(c,'SELECT config v FROM quintzee_qualification.runs WHERE id=$1',[f4.id]),preserved);record('future configuration does not alter an existing snapshot');
 const solo=await fixture(),abandonArgs=[solo.id,solo.players[0],randomUUID(),solo.v.revision,solo.v.scope,'abandon',[]];
 const abandoned=await call(c,abandonArgs);assert.equal(abandoned.status,'abandoned');assert.equal(abandoned.state.finished,false);assert.deepEqual(abandoned.state.results,[]);
 const abandonReplay=await call(other,abandonArgs);assert.equal(abandonReplay.outcome,'duplicate');assert.equal(abandonReplay.status,'abandoned');assert.deepEqual(abandonReplay.state,abandoned.state);
 const afterAbandon=await call(c,[solo.id,solo.players[0],randomUUID(),abandoned.revision,abandoned.scope,'score',[11]]);assert.equal(afterAbandon.outcome,'stale');assert.deepEqual(afterAbandon.state,abandoned.state);
 await c.query(`UPDATE quintzee_qualification.runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1`,[solo.id,Date.now()-1]);
 const abandonedExpired=await call(c,[solo.id,solo.players[0],null,null,null,null,null]);assert.equal(abandonedExpired.status,'abandoned');assert.deepEqual(abandonedExpired.state.results,[]);assert.equal(abandonedExpired.state.finished,false);
 await assert.rejects(call(c,[f.id,f.players[0],randomUUID(),live.revision,live.scope,'abandon',[]]),/solo_only/);
 record('solo abandonment is replay-safe, blocks later scores/recovery completion and rejects multiplayer abandonment');
 for(const theme of ['classic','modern']){
  const turn=await fixture(2),names={[turn.players[0]]:'Alex',[turn.players[1]]:'Jordan'};
  await c.query("UPDATE quintzee_qualification.runs SET theme=$2,player_names=$3,state=jsonb_set(state,'{board,deadline}',to_jsonb($4::bigint)) WHERE id=$1",[turn.id,theme,names,Date.now()-10000]);
  const handoff=await call(c,[turn.id,turn.players[0],null,null,null,null,null]);assert.equal(handoff.state.turnIndex,1);assert.equal(handoff.state.results[0].reason,'timeout');assert.equal(handoff.theme,theme);assert.deepEqual(handoff.playerNames,names);
  const reconnected=await call(other,[turn.id,turn.players[1],null,null,null,null,null]);assert.deepEqual(reconnected.state,handoff.state);assert.deepEqual(reconnected.playerNames,names);
  await c.query("UPDATE quintzee_qualification.runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)) WHERE id=$1",[turn.id,Date.now()-10]);
  const next=await call(c,[turn.id,turn.players[1],null,null,null,null,null]);assert.equal(next.state.board.phase,'playing');
  await assert.rejects(call(other,[turn.id,turn.players[0],randomUUID(),next.revision,next.scope,'roll',[]]),/not_your_turn/);
  const rolled=await call(c,[turn.id,turn.players[1],randomUUID(),next.revision,next.scope,'roll',[]]);assert.equal(rolled.outcome,'committed');assert.equal(rolled.state.board.deadline,next.state.board.deadline);
 }
 record('both-theme server snapshots preserve names and clock across expiration, whole-round handoff and reconnect; only new active actor can reroll');
 assert.deepEqual(await counts(),before);record('canonical session, financial and Arcade-result row counts unchanged (not an update audit)');
 writeFileSync('dev/quintzee/evidence/protocol.json',JSON.stringify({passed:true,cases,canonicalSettlement:'MISSING — qualification adapter is not session integration'},null,2));
}catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{
 await c.query('DELETE FROM quintzee_qualification.receipts WHERE run_id=ANY($1::uuid[])',[ids]);await c.query('DELETE FROM quintzee_qualification.runs WHERE id=ANY($1::uuid[])',[ids]);await c.end();await other.end();
}
