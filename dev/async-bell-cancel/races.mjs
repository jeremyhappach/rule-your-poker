import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const {database}=JSON.parse(readFileSync('qualification.local/async-bell-cancel/context.json'));
const admin=await connect(database),first=await connect(database),second=await connect(database),checks=[];
const a=randomUUID(),b=randomUUID();
const identity=async(c,id)=>{await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query('SET ROLE authenticated');};
const action=(c,m,hash,op,request=randomUUID())=>c.query('SELECT public.delayed_respond($1,$2,$3,$4) v',[m,request,hash,op]).then(r=>({ok:true,value:r.rows[0].v}),e=>({ok:false,code:e.code,message:e.message}));
try {
 await admin.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)',[a,b]);
 await admin.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true),($2,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[a,b]);
 await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$3,true),($2,$4,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true',[a,b,'Bell local '+a,'Bell local '+b]);
 for(const mode of [false,true])for(const winner of ['cancel','accept','duplicate']){
  await identity(admin,a);
  const m=(await admin.query("SELECT public.delayed_create($1,$2,$3,'[{\"game\":\"run21\",\"stake\":7}]') v",[randomUUID(),b,mode])).rows[0].v;
  await admin.query('RESET ROLE');
  const hash=(await admin.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[m])).rows[0].offer_hash;
  const request=randomUUID(),firstOp=winner==='accept'?'accept':'cancel',secondOp=winner==='duplicate'?'cancel':winner==='accept'?'cancel':'accept';
  await identity(first,firstOp==='cancel'?a:b);await identity(second,secondOp==='cancel'?a:b);
  await first.query('BEGIN');const result=await action(first,m,hash,firstOp,request);assert(result.ok,result.message);
  await second.query('BEGIN');await second.query("SET LOCAL statement_timeout='8s'");
  const waiting=action(second,m,hash,secondOp,winner==='duplicate'?request:randomUUID());
  let blocked=false;
  for(let i=0;i<30;i++){blocked=(await admin.query('SELECT $1=ANY(pg_blocking_pids($2)) v',[first.processID,second.processID])).rows[0].v;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
  assert(blocked,'competing RPC must wait on the actual row/request lock');
  await first.query('COMMIT');const other=await waiting;
  if(winner==='duplicate'){assert.deepEqual(other,result);await second.query('COMMIT');}
  else {assert.equal(other.ok,false);assert.equal(other.code,winner==='cancel'?'P0002':'P0001');await second.query('ROLLBACK');}
  const match=(await admin.query('SELECT status,accepted_at FROM private.delayed_matches WHERE id=$1',[m])).rows[0];
  if(winner==='accept')assert.equal(match.status,'active');else assert.equal(match,undefined);
  checks.push({mode,winner,blocked:true,first:result.value,second:other});
 }
 writeFileSync('qualification.local/async-bell-cancel/races.json',JSON.stringify({database,passed:true,checks},null,2));
 console.log(JSON.stringify({passed:true,checks}));
}finally{for(const c of [first,second,admin]){await c.query('ROLLBACK').catch(()=>{});await c.end();}}

