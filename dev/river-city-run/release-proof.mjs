import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {createRun,applyIntent,recoverRun} from '../../src/lib/riverCityRun/authority.mjs';
import {createCasino,beginDeal,advanceCasino,blackjackAct} from '../../src/lib/riverCityRun/core.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./database.local.json',import.meta.url),'utf8'));
assert.match(config.database,/^river_city_run_\d+$/);
const db=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:config.database});await db.connect();
const rpc=async(name,args)=>(await db.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;
const bundle=await build({entryPoints:['server/arcade/service.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
const {recoverArcade,arcadeOperation}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const passed=[],pass=s=>{passed.push(s);console.log('PASS '+s);};
try{
 await db.query('BEGIN');
 // Isolate the dispatcher to these transaction-contained fixtures in the clone.
 await db.query("update private.arcade_runs set due_at=null where status='active'");
 await db.query("update private.arcade_recovery_state set failure=null,last_completed_at=clock_timestamp()");
 const actor=randomUUID();await db.query('insert into auth.users(id) values($1)',[actor]);await db.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);await db.query('update public.profiles set is_active=true,username=$2 where id=$1',[actor,'River rollback '+actor.slice(0,8)]);
 const start=()=>rpc('arcade_river_start',{p_actor:actor,p_request:randomUUID(),p_course:'the-boat'});
 const commit=(r,s)=>rpc('arcade_river_commit',{p_actor:actor,p_run:r.id,p_revision:r.revision,p_state:s});
 const token=async()=>{const t=randomUUID();await db.query("update private.arcade_recovery_state set token=$1,claimed=false,expires_at=clock_timestamp()+interval '25 seconds'",[t]);return t;};
 let row=await start(),state=createRun(row.id,actor,Date.now()-22000);await commit(row,state);
 assert.equal(await recoverArcade(rpc,await token()),1);
 row=await rpc('arcade_load',{p_actor:actor,p_run:row.id});assert.equal(row.status,'completed');assert.equal(row.state.road.resultKind,'crash');assert.equal(Number((await db.query('select count(*) n from private.arcade_results where run_id=$1',[row.id])).rows[0].n),1);
 assert.equal(await recoverArcade(rpc,await token()),0);pass('real shared recovery claim/dispatch/complete, no connected client, one crash result, repeat recovery');
 const crash=row,foreign=randomUUID();
 await db.query("insert into private.arcade_runs(id,user_id,game,ruleset,config,status,score,revision,state,ended_at) select $1,user_id,game,ruleset,jsonb_set(config,'{id}','\"future-course\"'),status,99999999,revision,jsonb_set(state,'{config,id}','\"future-course\"'),ended_at from private.arcade_runs where id=$2",[foreign,crash.id]);
 await db.query("insert into private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record) select $1,user_id,game,ruleset,99999999,revision,completed_at,jsonb_set(final_state,'{config,id}','\"future-course\"'),record from private.arcade_results where run_id=$2",[foreign,crash.id]);
 for(const window of ['30','all']){const board=await arcadeOperation(rpc,actor,'Fixture',{game:'river-city-run',op:'leaderboard',courseId:'the-boat',window});assert.equal(board.courseId,'the-boat');assert.ok(!board.rows.some(x=>x.runId===foreign));assert.equal(board.personalBest,crash.score/100);assert.equal(board.self.runId,crash.id);}
 pass('second synthetic course cannot affect either leaderboard, personal best, self rank or results return');
 row=await start();const at=Date.now()-22000;state=createRun(row.id,actor,at);state.road.phase='casino';state.casino=createCasino(100);beginDeal(state.casino,100,'10 10 6 9 K'.split(' ').map(rank=>({rank,suit:'♠'})));for(let i=0;i<200;i++)advanceCasino(state.casino,.01);assert.ok(blackjackAct(state.casino,'hit'));await commit(row,state);assert.equal(await recoverArcade(rpc,await token()),1);
 assert.equal((await rpc('arcade_load',{p_actor:actor,p_run:row.id})).score,0);
 pass('disconnected all-in bust finishes dealer/payout animation and persists zero exactly once');
 const before=(await db.query('select count(*) n from private.arcade_results where user_id=$1',[actor])).rows[0].n;
 row=await start();await arcadeOperation(rpc,actor,'Fixture',{game:'river-city-run',op:'action',runId:row.id,revision:0,requestId:randomUUID(),intent:{type:'abandon'}});
 assert.equal((await db.query('select count(*) n from private.arcade_results where user_id=$1',[actor])).rows[0].n,before);pass('production service dispatch keeps Abandon unranked');
 await db.query('ROLLBACK');fs.writeFileSync(new URL('./evidence/release-proof.json',import.meta.url),JSON.stringify({passed,rolledBack:true},null,2));
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();}
