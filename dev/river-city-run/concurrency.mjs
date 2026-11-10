import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createRun,recoverRun} from '../../src/lib/riverCityRun/authority.mjs';
const database=JSON.parse(fs.readFileSync(new URL('./database.local.json',import.meta.url),'utf8')).database;
const connections=await Promise.all([0,1].map(async()=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}));
const rpc=async(c,name,args)=>(await c.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;
try{const db=connections[0],actor=randomUUID();await db.query('insert into auth.users(id) values($1)',[actor]);await db.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);await db.query('update public.profiles set is_active=true,username=$2 where id=$1',[actor,'River concurrency '+actor.slice(0,8)]);
const row=await rpc(db,'arcade_river_start',{p_actor:actor,p_request:randomUUID(),p_course:'the-boat'}),start=Date.parse(row.created_at),state=recoverRun(createRun(row.id,actor,start),start+22000),request=randomUUID();assert.equal(state.status,'completed');
const args={p_actor:actor,p_run:row.id,p_revision:0,p_state:state,p_request:request,p_fingerprint:'same concurrent command'};
const results=await Promise.all(connections.map(c=>rpc(c,'arcade_river_commit',args)));assert.deepEqual(results.map(r=>r.outcome).sort(),['committed','duplicate']);
assert.equal((await rpc(db,'arcade_river_commit',{...args,p_request:randomUUID()})).outcome,'conflict');
assert.equal(Number((await db.query('select count(*) n from private.arcade_results where run_id=$1',[row.id])).rows[0].n),1);
console.log('PASS independent connection race, duplicate receipt, terminal stale revision, exactly one crash result');
}finally{await Promise.all(connections.map(c=>c.end()));}
