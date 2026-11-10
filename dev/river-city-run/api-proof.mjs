import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {build} from 'esbuild';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {login,origin} from '../canasta/hosted-support.mjs';
const database=JSON.parse(fs.readFileSync(new URL('./database.local.json',import.meta.url),'utf8')).database;
assert.match(database,/^river_city_run_\d+$/);const db=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await db.connect();
const auth=await login();const actor=auth.clients[0],other=auth.clients[1];
// Only the database transport is loopback. The unchanged handler validates each
// bearer through the real Supabase Auth service. No production gameplay writes.
globalThis.__riverProofClient=()=>({auth:actor.client.auth,rpc:async(name,args)=>{await db.query('SAVEPOINT request');try{const data=(await db.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;await db.query('RELEASE SAVEPOINT request');return {data,error:null,status:200};}catch(e){await db.query('ROLLBACK TO SAVEPOINT request');return{data:null,error:{code:e.code,message:e.message},status:400};}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{username:'Proof'}})})})})});
const bundled=await build({entryPoints:['api/arcade.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'local-database-only',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'db',namespace:'proof'}));b.onLoad({filter:/.*/,namespace:'proof'},()=>({contents:'export const createClient=(...args)=>globalThis.__riverProofClient(...args);'}));}}]});
const handler=(await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))).default;
process.env.RUN21_SUPABASE_URL='https://xvhmbuppghwmwpwrkzao.supabase.co';process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY='loopback-proof-only';
const call=async(body,token=actor.token,requestOrigin=origin)=>{const res={statusCode:200,setHeader(){},end(v){this.body=JSON.parse(v);}};await handler({method:'POST',headers:{host:new URL(origin).host,origin:requestOrigin,...(token?{authorization:'Bearer '+token}:{})},body},res);return res;};
try{await db.query('BEGIN');await db.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
for(const c of auth.clients){await db.query('insert into auth.users(id) values($1) on conflict(id) do nothing',[c.user]);await db.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[c.user]);await db.query('update public.profiles set is_active=true where id=$1',[c.user]);}
const board={game:'river-city-run',op:'leaderboard',courseId:'the-boat',window:'all'};
assert.equal((await call(board,null)).statusCode,401);assert.equal((await call(board,'invalid')).statusCode,401);assert.equal((await call(board,actor.token,'https://invalid.example')).statusCode,409);
const admitted=await call(board);assert.equal(admitted.statusCode,200,JSON.stringify(admitted.body));
let response=await call({game:'river-city-run',op:'start',courseId:'the-boat',requestId:randomUUID()});assert.equal(response.statusCode,200);let r=response.body;
assert.equal((await call({game:'river-city-run',op:'state',runId:r.id},other.token)).statusCode,409);
assert.equal((await call({game:'river-city-run',op:'leaderboard',courseId:'future-course',window:'all'})).statusCode,409);
response=await call({game:'river-city-run',op:'action',runId:r.id,revision:r.revision,requestId:randomUUID(),intent:{type:'abandon'}});assert.equal(response.body.status,'abandoned');
assert.equal(Number((await db.query('select count(*) n from private.arcade_results where run_id=$1',[r.id])).rows[0].n),0);
console.log('PASS actual API bundle, real Auth, missing/invalid bearer, origin, ownership, course scope, start and unranked abandon; local DB rollback');
}finally{await db.query('ROLLBACK');await db.end();delete globalThis.__riverProofClient;delete process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;await auth.close();}
