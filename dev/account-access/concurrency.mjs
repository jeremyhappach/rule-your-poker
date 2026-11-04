import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../async-words/local.mjs';
export async function concurrency(name){
 const [db,action,admin,observer]=await Promise.all([connect(name),connect(name),connect(name),connect(name)]);
 const user=randomUUID(),actor=randomUUID();
 try{
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[user,actor]);
  await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[user,actor]]);
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=ANY($1::uuid[])',[[user,actor]]);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[actor]);
  await admin.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);
  const pid=(await admin.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  await action.query('BEGIN');
  await action.query('SELECT private.require_account_enabled($1)',[user]);
  let suspended=false;
  const suspension=admin.query('SELECT public.admin_set_account_access($1,false)',[user]).then(()=>{suspended=true;});
  for(let attempt=0;attempt<40;attempt++){
   if((await observer.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked)break;
   await new Promise(r=>setTimeout(r,25));
  }
  assert.equal(suspended,false,'suspension waits for the admitted transaction');
  assert((await observer.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked);
  await action.query('COMMIT');await suspension;
  await assert.rejects(action.query('SELECT private.require_account_enabled($1)',[user]),{code:'42501'});
  await admin.query('SELECT public.admin_set_account_access($1,true)',[user]);
  await admin.query('BEGIN');await admin.query('SELECT public.admin_set_account_access($1,false)',[user]);
  let actionFinished=false;
  const rejected=action.query('SELECT private.require_account_enabled($1)',[user]).then(()=>{throw Error('admitted after suspension');},e=>{assert.equal(e.code,'42501');actionFinished=true;});
  const actionPid=(await db.query('SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query=$1', ['SELECT private.require_account_enabled($1)'])).rows[0]?.pid;
  assert.equal(actionFinished,false);
  await admin.query('COMMIT');await rejected;
  assert.equal(actionFinished,true);
  console.log('Independent transaction proof PASS: action first; suspension first; old identity denied; re-enable preserves account.');
 }finally{await Promise.all([db,action,admin,observer].map(c=>c.end()));}
}
