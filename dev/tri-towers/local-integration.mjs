import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
const options={host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'};
const admin=new pg.Client(options);await admin.connect();
const passed=[];
async function actor(user,sql,args=[],role='authenticated'){
 const c=new pg.Client(options);await c.connect();
 try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query(`SET LOCAL ROLE ${role}`);
  const result=await c.query(sql,args);await c.query('COMMIT');return result.rows[0]?.v??result.rows;
 }finally{await c.end();}
}
const snapshot=(f,user=f.users[0])=>actor(user,'SELECT public.tri_towers_snapshot($1) v',[f.dealer]);
const action=(f,user,revision,type,index=null,request=uuid())=>actor(user,'SELECT public.tri_towers_action($1,$2,$3,$4,$5) v',[f.dealer,request,revision,type,index]);
async function fixture(count=2,previousType=null){
 const id=uuid(),users=Array.from({length:count},uuid),players=Array.from({length:count},uuid);
 const deadline=new Date(Date.now()+600000).toISOString();
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,$2,$3,0,false,false)",[id,count,deadline]);
 for(let i=0;i<count;i++){
  await admin.query('INSERT INTO public.profiles(id,username) VALUES($1,$2)',[users[i],'Tri '+users[i]]);
  await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips) VALUES($1,$2,$3,$4,0)',[players[i],id,users[i],count-i]);
 }
 const setupArgs=[id,players[0],count,deadline];
 if(previousType){
  await admin.query('BEGIN');
  await admin.query("SELECT set_config('app.cribbage_authoritative_write','on',true),set_config('app.gin_rummy_authoritative_write','on',true),set_config('app.three_five_seven_authoritative_write','on',true),set_config('app.yahtzee_authoritative_write','on',true)");
  if(previousType==='farkle')await admin.query("SELECT private.farkle_claim_v1($1,NULL,NULL,'configure')",[id]);
  if(previousType==='run21')await admin.query("INSERT INTO private.run21_app_test_release(singleton,enabled,qualified,project_ref) VALUES(true,true,true,'local') ON CONFLICT(singleton) DO UPDATE SET enabled=true,qualified=true,project_ref='local'");
  await admin.query('UPDATE public.games SET game_type=$2 WHERE id=$1',[id,previousType]);await admin.query('COMMIT');
 }
 const setup=await actor(users[0],"SELECT public.tri_towers_configure($1,$2,$3,'tri-towers','{\"ante_amount\":5}',$4) v",setupArgs);
 return {id,users,players,setupArgs,dealer:setup.dealer_game.id};
}
const state=async f=>(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0];
const currentUser=s=>s.players[s.turnIndex].userId;
const point=(name)=>{passed.push(name);console.log('PASS',name);};
try{
 // Refresh only candidate functions after edits. The initial full DDL is tested by local-database.mjs.
 const candidate=await readFile('supabase/tri-towers/authority.sql','utf8');
 await admin.query('CREATE TABLE IF NOT EXISTS public.system_settings(key text PRIMARY KEY,value jsonb)');
 for(const fn of candidate.match(/CREATE FUNCTION [\s\S]*?\$\$;/g))await admin.query(fn.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await assert.rejects(actor(uuid(),"SELECT private.tri_towers_shuffle()"),/permission denied/);
 await assert.rejects(actor(uuid(),"SELECT * FROM private.tri_towers_matches"),/permission denied/);
 await assert.rejects(actor(uuid(),"SELECT public.tri_towers_snapshot($1)",[uuid()],'anon'),/permission denied/);
 await admin.query('UPDATE private.tri_towers_release SET enabled=false');
 await assert.rejects(fixture(),/release_closed/);await admin.query('UPDATE private.tri_towers_release SET enabled=true');
 point('ACLs deny raw decks/helpers/anonymous RPCs; release gate rejects direct configuration');

 for(const previous of ['3-5-7','cribbage','farkle','gin-rummy','holm','horses','run21','ship-captain-crew','yahtzee']){
  const prior=await fixture(2,previous);
  assert.equal((await snapshot(prior)).identity.sessionId,prior.id);
 }
 point('All nine existing game families can hand off through their unchanged authority guards');
 const seven=await fixture(7);assert.equal((await snapshot(seven)).players.length,7);
 assert.equal((await actor(seven.users[0],'SELECT public.tri_towers_capabilities($1) v',[seven.id])).enabled,true);
 await admin.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[seven.users[0]]);
 assert.equal((await actor(seven.users[0],'SELECT public.tri_towers_capabilities($1) v',[seven.id])).enabled,false);
 await assert.rejects(snapshot(seven),/membership_required/);
 await assert.rejects(action(seven,seven.users[0],0,'start'),/participant_required/);
 await admin.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[seven.users[0]]);
 point('Seven-player setup and revoked-account server-side capability/snapshot/action denial');

 const f=await fixture();let m=await state(f),s=m.state,view=await snapshot(f,currentUser(s));
 assert.equal(s.players[0].id,f.players[1]);assert.equal(new Set(s.deck).size,52);
 const watching=await snapshot(f,f.users[0]);assert.deepEqual(watching.cards,view.cards);assert.equal(watching.canAct,false);assert(!('deck'in view));assert.equal(view.cards.filter(v=>v!==null).length,10);
 await assert.rejects(action(f,f.users[0],0,'start'),/spectator/);
 assert.deepEqual(await actor(uuid(),'SELECT * FROM public.tri_towers_revisions'),[]);
 await assert.rejects(snapshot(f,uuid()),/membership_required/);
 point('Clockwise player order, same redacted spectator board, spectator rejection, membership RLS');

 const req=uuid(),dupes=await Promise.all([action(f,currentUser(s),0,'start',null,req),action(f,currentUser(s),0,'start',null,req)]);
 assert.equal(dupes[0].revision,dupes[1].revision);view=dupes[0];
 const racing=await Promise.allSettled([action(f,currentUser(s),view.revision,'draw'),action(f,currentUser(s),view.revision,'draw')]);
 assert.equal(racing.filter(r=>r.status==='fulfilled').length,1);assert.match(racing.find(r=>r.status==='rejected').reason.message,/stale_revision/);
 await assert.rejects(action(f,currentUser(s),0,'draw',null,req),/replay_conflict/);
 const recovered=await snapshot(f,currentUser(s));assert.equal(recovered.cursor,30);
 assert.deepEqual(recovered.cards,(await snapshot(f,f.users[0])).cards);
 point('Independent connections serialize duplicates and competing actions; reconnect resumes exact board');

 const before=(await state(f)).state.deadline;
 await admin.query('UPDATE public.games SET is_paused=true WHERE id=$1',[f.id]);
 await assert.rejects(action(f,currentUser(s),(await state(f)).revision,'draw'),/inactive/);
 await admin.query('UPDATE private.tri_towers_matches SET paused_at=paused_at-5000 WHERE dealer_game_id=$1',[f.dealer]);
 await admin.query('UPDATE public.games SET is_paused=false WHERE id=$1',[f.id]);
 assert((await state(f)).state.deadline>=before+5000);
 point('Pause blocks actions and resume extends the exact authoritative deadline');

 let completed={},deals=new Set([JSON.stringify(s.deck)]),lastUser,lastReq,lastRev,lastType,lastIdx;
 for(let step=0;step<1000;step++){
  m=await state(f);s=m.state;if(s.phase==='complete')break;
  for(const [id,score]of Object.entries(completed))assert.equal(s.scores[id],score);
  completed={...s.scores};lastUser=currentUser(s);lastReq=uuid();lastRev=m.revision;lastIdx=null;
  if(s.phase==='ready')lastType='start';else if(s.phase==='stage_complete')lastType='continue';
  else {lastIdx=(await admin.query('SELECT i FROM generate_series(0,27)i WHERE private.tri_towers_legal($1,i) ORDER BY i LIMIT 1',[s])).rows[0]?.i??null;lastType=lastIdx===null?'draw':'remove';}
  await action(f,lastUser,lastRev,lastType,lastIdx,lastReq);
  const next=await state(f);if(next.state.phase==='ready')deals.add(JSON.stringify(next.state.deck));
  if(next.state.phase!=='complete')assert.equal(next.settlement,null);
 }
 m=await state(f);assert.equal(m.state.phase,'complete');assert.equal(Object.keys(m.state.scores).length,2);assert(deals.size>=4);
 assert.equal((await admin.query('SELECT sum(chips) n FROM public.players WHERE game_id=$1',[f.id])).rows[0].n,'0');
 assert.equal((await admin.query('SELECT count(*) n FROM public.session_player_snapshots WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'2');
 await action(f,lastUser,lastRev,lastType,lastIdx,lastReq);await admin.query('SELECT private.tri_towers_settle($1)',[f.dealer]);
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[f.dealer])).rows[0].n,'1');
 assert((await actor(f.users[0],'SELECT public.tri_towers_history($1) v',[f.dealer])).length>20);
 await actor(f.users[0],'SELECT public.tri_towers_close($1)',[f.dealer]);await actor(f.users[0],'SELECT public.tri_towers_close($1)',[f.dealer]);
 assert.equal((await admin.query('SELECT status FROM public.games WHERE id=$1',[f.id])).rows[0].status,'game_selection');
 await assert.rejects(actor(f.users[0],"SELECT public.tri_towers_configure($1,$2,$3,'tri-towers','{\"ante_amount\":5}',$4)",f.setupArgs),/setup_retired/);
 assert.equal((await snapshot(f)).finished,true);
 point('Complete two-player competition, independent stage deals, immutable scores, one balanced settlement, snapshots/history, idempotent continuation');

 for(const scores of [[10,10,0],[0,0,0]]){
  const tie=await fixture(3),tm=await state(tie);const final={...tm.state,phase:'complete',turnIndex:3,deadline:0,scores:Object.fromEntries(tie.players.map((p,i)=>[p,scores[i]]))};
  await admin.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[tie.dealer,final]);
  await admin.query('SELECT private.tri_towers_settle($1)',[tie.dealer]);
  const result=(await state(tie)).settlement;assert.equal(Object.values(result).reduce((a,b)=>a+b,0),0);
  if(scores[0]){assert.equal(result[tie.players[2]],-5);assert.equal(result[tie.players[1]],3);assert.equal(result[tie.players[0]],2);}else assert(Object.values(result).every(n=>n===0));
 }
 point('Partial ties split indivisible chips clockwise; all-player ties move zero chips');

 await admin.query(`INSERT INTO public.system_settings VALUES('make_it_take_it','{"enabled":true}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
 const maker=await fixture(3),makerState=(await state(maker)).state;
 await admin.query('UPDATE private.tri_towers_matches SET state=$2 WHERE dealer_game_id=$1',[maker.dealer,{...makerState,phase:'complete',turnIndex:3,deadline:0,scores:{[maker.players[0]]:10,[maker.players[1]]:0,[maker.players[2]]:0}}]);
 await admin.query('SELECT private.tri_towers_settle($1)',[maker.dealer]);await actor(maker.users[0],'SELECT public.tri_towers_close($1)',[maker.dealer]);
 assert.equal((await admin.query('SELECT dealer_position FROM public.games WHERE id=$1',[maker.id])).rows[0].dealer_position,3);
 await admin.query(`UPDATE public.system_settings SET value='{"enabled":false}' WHERE key='make_it_take_it'`);
 point('Continuation honors the canonical make-it-take-it dealer setting');

 const timed=await fixture();const ts=(await state(timed)).state,oldDeck=ts.deck;
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[timed.dealer]);
 await admin.query('SELECT private.tri_towers_recover()');let after=await state(timed);
 assert.equal(after.state.turnIndex,1);assert.notDeepEqual(after.state.deck,oldDeck);assert.equal(after.settlement,null);
 await assert.rejects(action(timed,currentUser(ts),after.revision,'give_up'),/spectator/);
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[timed.dealer]);
 const user=currentUser(after.state);await Promise.allSettled([action(timed,user,after.revision,'give_up'),admin.query('SELECT private.tri_towers_recover()')]);
 after=await state(timed);assert.equal(after.state.phase,'complete');assert.equal(Object.keys(after.state.scores).length,2);
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[timed.dealer])).rows[0].n,'1');
 point('Zero-client timeout recovery, stale prior-player rejection, concurrent timeout/terminal race settles once');

 const money=await fixture();await admin.query('UPDATE public.games SET real_money=true WHERE id=$1',[money.id]);
 await assert.rejects(actor(money.users[0],"SELECT public.tri_towers_configure($1,$2,$3,'tri-towers','{\"ante_amount\":5}',$4)",money.setupArgs),/real_money_closed/);
 assert.equal((await admin.query("SELECT count(*) n FROM public.gameplay_transfer_batches WHERE unmatched_deltas<>'{}'")).rows[0].n,'0');
 point('Real-money configuration remains closed and deployed financial journal has zero unmatched deltas');
 await writeFile('qualification.local/tri-towers/local-integration-results.json',JSON.stringify({passed,productionWrites:0},null,2));
}finally{await admin.end();}
