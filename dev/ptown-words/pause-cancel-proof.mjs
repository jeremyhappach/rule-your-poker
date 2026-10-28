import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const database=JSON.parse(readFileSync('qualification.local/ptown-words/release/banks-route-context.json')).database;
assert.match(database,/^ptown_words_route_\d+$/);const db=await connect(database),patch=readFileSync('supabase/ptown-words/pause-request-cancel-local.sql','utf8');
const checks=[];
async function rpc(c,user,name,args){
 await c.query('SAVEPOINT actor_call');
 try{await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);await c.query('SET LOCAL ROLE authenticated');
  const answer=(await c.query(`SELECT public.${name}(${Object.keys(args).map((k,i)=>k+' => $'+(i+1)).join(',')}) v`,Object.entries(args).map(([k,v])=>k==='p_items'&&v!==null?JSON.stringify(v):v))).rows[0].v;
  await c.query('RESET ROLE');await c.query('RELEASE SAVEPOINT actor_call');return answer;
 }catch(e){await c.query('ROLLBACK TO SAVEPOINT actor_call');await c.query('RELEASE SAVEPOINT actor_call');throw e;}
}
async function fixture(c){
 const f={game:uuid(),users:[uuid(),uuid(),uuid()],players:[uuid(),uuid(),uuid()]};
 for(let i=0;i<3;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[f.users[i]]);await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[f.users[i],'Cancel '+f.users[i].slice(0,8)]);}
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,ante_decision_timer_seconds,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',false,2,clock_timestamp()+interval '10 minutes',120,0,false,false,$2)",[f.game,f.users[0]]);
 for(let i=0;i<3;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot,auto_ante,auto_ante_runback) VALUES($1,$2,$3,$4,100,false,false,true)',[f.players[i],f.game,f.users[i],2+i*2]);
 const frame=await rpc(c,f.users[0],'read_session_frame',{p_game_id:f.game}),config=await rpc(c,f.users[0],'ptown_words_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',p_config:{ante_amount:5},p_expected_config_deadline:frame.game.config_deadline});f.dealer=config.dealer_game.id;
 for(let i=1;i<3;i++)await rpc(c,f.users[i],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer,p_player_id:f.players[i],p_decision:'ante_up'});
 await rpc(c,f.users[0],'advance_ante_phase',{p_game_id:f.game,p_expected_dealer_game_id:f.dealer});return f;
}
const snapshot=(c,f,who=1)=>rpc(c,f.users[who],'ptown_words_snapshot',{p_dealer_game_id:f.dealer});
const action=(f,v,type,items=null,id=uuid())=>({p_dealer_game_id:f.dealer,p_request_id:id,p_revision:v.revision,p_action:type,p_items:items});
const cancel=(f,v,target=v.pauseRequest.id,id=uuid())=>action(f,v,'cancel_pause_request',[{requestId:target}],id);
const send=(c,f,args,who=1)=>rpc(c,f.users[who],'ptown_words_action',args);
const pause=(c,f,v,on)=>rpc(c,f.users[0],'set_game_paused',{p_game_id:f.game,p_paused:on,p_expected_dealer_game_id:f.dealer,p_expected_pause_version:v.pauseVersion});
async function containedProof(c){
 const f=await fixture(c);let v=await snapshot(c,f);v=await send(c,f,action(f,v,'request_pause'));
 const target=v.pauseRequest.id,command=cancel(f,v),before=(await c.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0].state;
 await assert.rejects(send(c,f,command,2),/pause_request_owner_required/);await assert.rejects(send(c,f,command,0),/cancel_request_unavailable/);
 await assert.rejects(rpc(c,uuid(),'ptown_words_action',command),/participant_required/);
 await assert.rejects(send(c,f,cancel(f,v,uuid())),/stale_pause_request/);
 await assert.rejects(send(c,f,{...command,p_request_id:uuid(),p_revision:v.revision-1}),/stale_revision/);
 for(const items of [null,{},[],[{requestId:'bad'}]])await assert.rejects(send(c,f,action(f,v,'cancel_pause_request',items)),/cancel_request_target/);
 const removed=await send(c,f,command);assert.equal(removed.pauseRequest,undefined);assert.equal(removed.revision,v.revision+1);assert.equal(removed.paused,false);
 const after=(await c.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0].state;delete before.pauseRequest;assert.deepEqual(after,before);
 assert.equal((await send(c,f,command)).revision,removed.revision);assert.equal((await send(c,f,cancel(f,v,target))).revision,removed.revision);
 v=await send(c,f,action(f,removed,'request_pause'));assert.notEqual(v.pauseRequest.id,target);
 await assert.rejects(send(c,f,cancel(f,v,target)),/stale_pause_request/);
 assert.equal((await send(c,f,command)).pauseRequest.id,v.pauseRequest.id,'old cancellation replay must return current new request');
 const second=cancel(f,v);assert.equal((await pause(c,f,v,true)).outcome,'paused');const paused=await snapshot(c,f);assert.equal(paused.pauseRequest,undefined);
 const raced=await send(c,f,second);assert.equal(raced.paused,true);assert.equal(raced.revision,paused.revision);assert.equal(raced.deadline,paused.deadline);
 assert.equal((await send(c,f,second)).paused,true);assert.equal((await pause(c,f,paused,false)).outcome,'resumed');v=await snapshot(c,f);
 await c.query('SAVEPOINT legacy');await c.query("UPDATE private.ptown_words_matches SET state=jsonb_set(state,'{rules}',private.ptown_words_rules_for('ptown-words/1')) WHERE dealer_game_id=$1",[f.dealer]);await assert.rejects(send(c,f,cancel(f,v,target)),/cancel_request_unavailable/);await c.query('ROLLBACK TO SAVEPOINT legacy');await c.query('RELEASE SAVEPOINT legacy');
 return f.game;
}
async function waitForLock(c,pid){for(let i=0;i<50;i++){if((await c.query("SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting)return;await new Promise(r=>setTimeout(r,20));}throw Error('Expected real concurrent lock wait');}
async function concurrentProof(){
 const a=await connect(database),b=await connect(database);
 try{
  await a.query('BEGIN');const f=await fixture(a);let v=await snapshot(a,f);v=await send(a,f,action(f,v,'request_pause'));await a.query('COMMIT');
  // Host commits first while cancellation is genuinely waiting on its round lock.
  await a.query('BEGIN');await pause(a,f,v,true);await b.query('BEGIN');const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const queued=send(b,f,cancel(f,v));await waitForLock(db,pid);await a.query('COMMIT');const observed=await queued;assert.equal(observed.paused,true);assert.equal(observed.pauseRequest,undefined);await b.query('COMMIT');
  await a.query('BEGIN');await pause(a,f,observed,false);v=await snapshot(a,f);v=await send(a,f,action(f,v,'request_pause'));await a.query('COMMIT');
  // Withdrawal commits first; canonical host pause may reject NOWAIT contention,
  // then retry as the same pause action. Cancellation never calls resume.
  await a.query('BEGIN');const removed=await send(a,f,cancel(f,v));await b.query('BEGIN');assert.equal((await pause(b,f,v,true)).outcome,'busy');await b.query('ROLLBACK');await a.query('COMMIT');
  await b.query('BEGIN');assert.equal((await pause(b,f,removed,true)).outcome,'paused');assert.equal((await snapshot(b,f)).paused,true);await b.query('COMMIT');
  await a.query('BEGIN');v=await snapshot(a,f);await pause(a,f,v,false);v=await snapshot(a,f);v=await send(a,f,action(f,v,'request_pause'));await a.query('COMMIT');
  // Separate connections retry the same UUID while the first writer holds locks.
  const command=cancel(f,v);await a.query('BEGIN');const first=await send(a,f,command);await b.query('BEGIN');const duplicate=send(b,f,command);await waitForLock(db,pid);await a.query('COMMIT');const replay=await duplicate;assert.equal(replay.revision,first.revision);assert.equal(replay.pauseRequest,undefined);await b.query('COMMIT');
 }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');await a.end();await b.end();}
}
try{
 await db.query('BEGIN');await db.query(patch);const rollbackGame=await containedProof(db);await db.query(readFileSync('qualification.local/ptown-words/polish-release-proof.sql','utf8'));await db.query('ROLLBACK');assert.equal((await db.query('SELECT count(*)::int n FROM public.games WHERE id=$1',[rollbackGame])).rows[0].n,0);
 checks.push('Candidate rollback: owner/other-player/host/outsider guards, target/version guards, replay, request again, pause-first and unchanged gameplay state','Existing core and canonical financial rollback proof');console.log('Candidate rollback and canonical regression PASS');
 if(process.argv.includes('--apply-local')){await db.query('BEGIN');await db.query(patch);await db.query('COMMIT');await db.query('BEGIN');await containedProof(db);await db.query('ROLLBACK');await concurrentProof();checks.push('Installed local authority proof','Independent-connection host-first, cancel-first and duplicate-UUID races');console.log('Installed local authority and real races PASS');}
 writeFileSync('dev/ptown-words/evidence/pause-cancel-database.json',JSON.stringify({passed:true,localOnly:true,installed:process.argv.includes('--apply-local'),checks},null,2));
}finally{await db.query('ROLLBACK');await db.end();}
