// Separate database connections compete for the same run lock in a disposable clone.
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from '../quintzee/database.mjs';
const source=process.argv[2];if(!/^chucky_showdown_v[123]_\d+$/.test(source??''))throw Error('Expected Chucky Showdown fixture database');
const db='chucky_showdown_race_'+Date.now(),admin=await connect('postgres');
await admin.query('create database '+db+' template '+source);
const clients=[await connect(db),await connect(db)],c=clients[0],user=randomUUID(),token=randomUUID();
const get=async(conn,sql,params=[])=>(await conn.query(sql,params)).rows[0].r;
try{
  await c.query('insert into auth.users(id) values($1)',[user]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[user]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[user,'Lab '+user.slice(0,8)]);
  const v3=source.startsWith('chucky_showdown_v3_'),v2=v3||source.startsWith('chucky_showdown_v2_');
  await c.query("update private.arcade_rulesets set enabled=false where game='chucky-showdown' and enabled");
  await c.query('update private.arcade_rulesets set enabled=true where id=$1',[v3?'chucky-showdown/3':v2?'chucky-showdown/2':'chucky-showdown/1']);
  await c.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp(),claimed=true,token=$1,expires_at=clock_timestamp()+interval '1 minute'",[token]);
  const req=randomUUID();
  const starts=await Promise.all(clients.map(conn=>get(conn,"select public.arcade_start($1,$2,'chucky-showdown') r",[user,req])));
  assert.equal(starts[0].id,starts[1].id);const id=starts[0].id;
  const step=(conn,actor,rev=null,round=null,request=null,action=null,level=null)=>get(conn,'select public.arcade_chucky_showdown_step($1,$2,$3,$4,$5,$6,$7,$8) r',[actor,id,rev,round,request,action,level,actor?null:token]);
  await step(c,user);
  const ready=async()=>{
    await c.query("update private.arcade_runs set state=state||jsonb_build_object('phase',$2::text,'boardShown',4,'due',(extract(epoch from clock_timestamp())*1000)::bigint+30000) where id=$1",[id,v2?'choose':'decision']);
    return (await step(c,user)).projection;
  };
  const initial=await ready(),command=randomUUID();
  const concurrent=await Promise.all(clients.map(conn=>step(conn,user,initial.revision,initial.roundId,command,'press',7)));
  assert.deepEqual(concurrent.map(r=>r.outcome).sort(),['committed','duplicate']);
  assert.equal(await get(c,"select jsonb_array_length(state->'chucky') r from private.arcade_runs where id=$1",[id]),7);
  const v=await ready();
  const contested=await Promise.all(clients.map((conn,i)=>step(conn,user,v.revision,v.roundId,randomUUID(),'press',i+1)));
  assert.deepEqual(contested.map(r=>r.outcome).sort(),['committed','stale']);
  const active=(await step(c,user)).projection;
  await c.query("update private.arcade_runs set state=jsonb_set(state,'{due}','0') where id=$1",[id]);
  await c.query(`create function public.chucky_showdown_test_abort() returns trigger language plpgsql as $$begin raise exception 'injected_result_failure';end$$;
    create trigger chucky_showdown_fault after insert on private.arcade_results for each row execute function public.chucky_showdown_test_abort()`);
  await assert.rejects(()=>step(c,null),/injected_result_failure/);
  assert.equal(await get(c,'select revision::int r from private.arcade_runs where id=$1',[id]),active.revision);
  assert.equal(await get(c,'select count(*)::int r from private.arcade_results where run_id=$1',[id]),0);
  await c.query('drop trigger chucky_showdown_fault on private.arcade_results');
  const [worker,late]=await Promise.all([step(c,null),step(clients[1],user,active.revision,active.roundId,randomUUID(),'bank')]);
  assert.equal(late.outcome,'stale');assert.equal(worker.projection.status,'completed');
  assert.equal(late.projection.revision,worker.projection.revision);assert.equal(worker.projection.round,3);
  assert.equal(await get(c,'select count(*)::int r from private.arcade_results where run_id=$1',[id]),1);
  const replay=await step(c,user,initial.revision,initial.roundId,command,'press',7);
  assert.equal(replay.outcome,'duplicate');assert.equal(replay.projection.score,worker.projection.score);
  console.log('PASS — concurrent starts, duplicate UUIDs, competing commands, injected result rollback, worker/action terminal race and late replay.');
}finally{for(const conn of clients)await conn.end();await admin.query('drop database '+db);await admin.end();}
