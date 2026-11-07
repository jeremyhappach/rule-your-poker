// Separate database connections compete for the same run lock in a disposable clone.
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from '../quintzee/database.mjs';
const source=process.argv[2];if(!/^drop357_v[12]_\d+$/.test(source??''))throw Error('Expected Crib Lab fixture database');
const db='drop357_race_'+Date.now(),admin=await connect('postgres');
await admin.query('create database '+db+' template '+source);
const clients=[await connect(db),await connect(db)],c=clients[0],user=randomUUID(),token=randomUUID();
const get=async(conn,sql,params=[])=>(await conn.query(sql,params)).rows[0].r;
try{
  await c.query('insert into auth.users(id) values($1)',[user]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[user]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[user,'Lab '+user.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='357-drop' and enabled");
  await c.query('update private.arcade_rulesets set enabled=true where id=$1',['357-drop/3']);
  await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp(),claimed=true,token=$1,expires_at=clock_timestamp()+interval '1 minute'",[token]);
  const req=randomUUID();
  const starts=await Promise.all(clients.map(conn=>get(conn,"select public.arcade_start($1,$2,'357-drop') r",[user,req])));
  assert.equal(starts[0].id,starts[1].id);const id=starts[0].id;
  const step=(conn,actor,rev=null,round=null,request=null,action=null,items=[])=>get(conn,'select public.arcade_drop357_step($1,$2,$3,$4,$5,$6,$7,$8) r',[actor,id,rev,round,request,action,items,actor?null:token]);
  let initial=(await step(c,user)).projection;const command=randomUUID();
  if(initial.phase==='intro'){await new Promise(resolve=>setTimeout(resolve,initial.deadline-initial.serverAt+40));initial=(await step(c,user)).projection;}
  if(initial.transition){await new Promise(resolve=>setTimeout(resolve,initial.transition.endsAt-initial.serverAt+40));initial=(await step(c,user)).projection;}
  const concurrent=await Promise.all(clients.map(conn=>step(conn,user,initial.revision,initial.roundId,command,'place',[0,0])));
  assert.deepEqual(concurrent.map(r=>r.outcome).sort(),['committed','duplicate']);
  const v=concurrent[0].projection;
  const contested=await Promise.all(clients.map((conn,i)=>step(conn,user,v.revision,v.roundId,randomUUID(),'place',[i,i===0?1:3])));
  assert.deepEqual(contested.map(r=>r.outcome).sort(),['committed','stale']);
  const active=(await step(c,user)).projection;
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{deadline}','0') where id=$1",[id]);
  await c.query(`create function public.crib_lab_test_abort() returns trigger language plpgsql as $$begin raise exception 'injected_result_failure';end$$;
    create trigger crib_lab_fault after insert on private.arcade_results for each row execute function public.crib_lab_test_abort()`);
  await assert.rejects(()=>step(c,null),/injected_result_failure/);
  assert.equal(await get(c,'select revision::int r from private.arcade_runs where id=$1',[id]),active.revision);
  assert.equal(await get(c,'select count(*)::int r from private.arcade_results where run_id=$1',[id]),0);
  await c.query('drop trigger crib_lab_fault on private.arcade_results');
  const [worker,late]=await Promise.all([step(c,null),step(clients[1],user,active.revision,active.roundId,randomUUID(),'place',[2,5])]);
  assert.equal(late.outcome,'stale');assert.equal(worker.projection.status,'completed');
  assert.equal(late.projection.revision,worker.projection.revision);
  assert.equal(await get(c,'select count(*)::int r from private.arcade_results where run_id=$1',[id]),1);
  const replay=await step(c,user,initial.revision,initial.roundId,command,'place',[0,0]);
  assert.equal(replay.outcome,'duplicate');assert.equal(replay.projection.score,worker.projection.score);
  console.log('PASS — concurrent starts, duplicate UUIDs, competing commands, injected result rollback, worker/action terminal race and late replay.');
}finally{for(const conn of clients)await conn.end();await admin.query('drop database '+db);await admin.end();}
