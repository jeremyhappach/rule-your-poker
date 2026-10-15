import {c,opts,pg,fixture,finalArgs,read,seed,rpc,scalar,identity,actionSql,state,verify,result,dir} from './helpers.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const fixed=process.argv.includes('--fixed');
const peers=[new pg.Client(opts),new pg.Client(opts)];
try {
 await c.query('BEGIN');const f=await fixture();const args=await finalArgs(f);const actor=f.users[f.players.indexOf(args[1])];
 let s=await read(f);s.turnDeadline=new Date(Date.now()-10000).toISOString();await seed(f,s);await c.query('COMMIT');
 for(const p of peers)await p.connect();
 const pids=await Promise.all(peers.map(p=>scalar('select pg_backend_pid() v',[],p)));
 await c.query('BEGIN');await c.query('select id from games where id=$1 for update',[f.game]);
 const run=async(db,worker)=>{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");try{
  let out;if(worker){await identity(null,'service_role',db);out=await scalar('select private.advance_due_canonical_game_timers(64) v',[],db);}else out=await rpc(actionSql,args,actor,db);
  await db.query('COMMIT');return out;
 }catch(e){await db.query('ROLLBACK');return {error:e.message,code:e.code,detail:e.detail,where:e.where};}};
 const a=run(peers[0],false);await new Promise(r=>setTimeout(r,120));
 const b=run(peers[1],true);await new Promise(r=>setTimeout(r,120));
 const dependencies=(await c.query('select pid,wait_event_type,wait_event,pg_blocking_pids(pid) blockers,query from pg_stat_activity where pid=any($1::int[])',[pids])).rows;
 const locks=(await c.query('select pid,locktype,relation::regclass::text relation,page,tuple,transactionid,mode,granted from pg_locks where pid=any($1::int[]) and (not granted or locktype in (\'transactionid\',\'tuple\'))',[pids])).rows;
 await c.query('COMMIT');const outcomes=await Promise.all([a,b]);
 const timers=(await c.query('select timer_kind,state,attempt_count,last_error from private.game_timer_registry where game_id=$1',[f.game])).rows;
 const deadlock=outcomes.some(x=>x.code==='40P01')||timers.some(t=>t.last_error?.includes('40P01'));
 assert.equal(deadlock,!fixed,JSON.stringify({outcomes,timers}));
 const beforeRetry=await state(f);
 if(beforeRetry.results.length===0){
  assert.ok(Object.values(beforeRetry.balances).every(x=>x===0));assert.equal(beforeRetry.snapshots.length,0);assert.equal(beforeRetry.batches.length,0);assert.equal(beforeRetry.pending,0);assert.equal(beforeRetry.handoffs,0);
  await new Promise(r=>setTimeout(r,5500));await c.query('BEGIN');await identity(null,'service_role');await scalar('select private.advance_due_canonical_game_timers(64) v');await c.query('COMMIT');
 }
 await c.query('BEGIN');await verify(f,fixed?'Corrected recovery/action ordering settles once':'Deadlock rollback and clientless retry settle once');await c.query('COMMIT');
 writeFileSync(dir+(fixed?'race-fixed':'race-before')+'.json',JSON.stringify({fixed,fixture:f,pids,dependencies,locks,outcomes,timers,beforeRetry,financial:result.cases},null,2));
 console.log(JSON.stringify({fixed,dependencies,outcomes:outcomes.map(x=>({outcome:x.outcome,failed:x.failed,error:x.error,code:x.code})),timers},null,2));
}finally {await c.query('ROLLBACK');await Promise.all(peers.map(p=>p.end()));await c.end();}
