import {readFileSync as read} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './local.mjs';
const db=await connect(JSON.parse(read('.polish-authority/context.json')).database);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
try{
 await db.query('BEGIN');
 for(const d of JSON.parse(read('.polish-authority/recovery.json')))await db.query(d.definition);
 await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 for(const game of ['tri-towers','boxdrop','royal-flash']){
  const f=await q('SELECT public.qualification_bonus_fixture($1,false) v',[game]),prefix=game.replaceAll('-','_');
  await db.query(`UPDATE private.${prefix}_matches SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE dealer_game_id=$1`,[f.id,Date.now()-1000000]);
  await db.query("SELECT set_config('request.jwt.claim.sub','',true)");
  for(let boundary=0;boundary<3;boundary++){
   await db.query(`SELECT private.${prefix}_recover()`);
   // Advance the disposable clock through the existing result hold, without
   // a browser continue command or changing any production timer duration.
   await db.query(`UPDATE private.${prefix}_matches SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE dealer_game_id=$1 AND settlement IS NULL`,[f.id,Date.now()-1000000]);
  }
  const count=await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[f.id]);
  if(count!==1)console.log(await q(`SELECT jsonb_build_object('phase',state->'phase','deadline',state->'deadline','finished',finished,'settlement',settlement,'optionalBonus',state->'optionalBonus') v FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[f.id]));
  assert.equal(count,1,game+' zero client result');
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  const batches=await q('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[f.match]);
  if(batches!==1)console.log(game,await q(`SELECT jsonb_build_object('scores',state->'scores','stages',state->'stages','settlement',settlement,'stake',stake) v FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[f.id]));
  assert.equal(batches,1,game+' recovery transfer');
  await db.query('SET CONSTRAINTS ALL DEFERRED');
 }
 // 11 Up retains its existing ready timeout/auto-fold ownership. The pending
 // decision does not turn that timeout into an explicit Skip.
 const f=await q("SELECT public.qualification_bonus_fixture('eleven-up',false) v");
 await db.query("UPDATE private.eleven_up_matches SET state=state||jsonb_build_object('phase','playing','startedAt',$2::bigint-120000,'deadline',$2::bigint) WHERE dealer_game_id=$1",[f.id,Date.now()-10000]);
 await db.query("SELECT set_config('request.jwt.claim.sub','',true)");await db.query('SELECT private.eleven_up_recover()');
 await db.query("UPDATE private.eleven_up_matches SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE dealer_game_id=$1",[f.id,Date.now()-1000000]);
 await db.query('SELECT private.eleven_up_recover()');await db.query('SELECT private.eleven_up_recover()');
 assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[f.id]),1,'11 Up zero client');
 for(const game of ['tri-towers','quintzee','boxdrop']){
  const f=await q('SELECT public.qualification_bonus_fixture($1,true) v',[game]);
  const expiry=await q("WITH t AS MATERIALIZED(SELECT date_trunc('milliseconds',clock_timestamp())-interval '1 second' AS at_time) UPDATE private.delayed_children SET expires_at=t.at_time,available_at=t.at_time-interval '36 hours',last_call_at=t.at_time-interval '12 hours' FROM t WHERE id=$1 RETURNING expires_at v",[f.id]);
  await db.query("SELECT set_config('request.jwt.claim.sub','',true)");await db.query('SELECT private.delayed_expire($1,$2,$3)',[f.id,f.segment,expiry]);await db.query('SELECT private.delayed_expire($1,$2,$3)',[f.id,f.segment,expiry]);
  assert.equal(await q('SELECT count(*)::int v FROM private.delayed_outcomes WHERE child_id=$1',[f.id]),1);
  assert.equal(await q("SELECT reason v FROM private.delayed_outcomes WHERE child_id=$1",[f.id]),'timeout_forfeit','unchosen availability expiry preserves prior rules');
 }
 console.log('PASS 7 zero-client recovery/expiry paths with existing production workers');
}finally{await db.query('ROLLBACK');await db.end();}
