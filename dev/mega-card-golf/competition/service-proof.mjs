// Whole-flow proof in one rollback-only local transaction; no hosted credentials.
import {connect,databaseName} from './local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
await build({entryPoints:['server/megaCardGolf/multiplayer.ts','server/delayed/service.ts'],bundle:true,platform:'node',format:'esm',outdir:'qualification.local/mega-competition/services',outbase:'server'});
const {megaLiveOperation,synchronizeMegaMatch}=await import(pathToFileURL(resolve('qualification.local/mega-competition/services/megaCardGolf/multiplayer.js')));
const {delayedOperation}=await import(pathToFileURL(resolve('qualification.local/mega-competition/services/delayed/service.js')));
const db=await connect(databaseName()),checks=[];
const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
const as=async id=>q("SELECT set_config('request.jwt.claim.sub',$1,true) v",[id]);
const rpc=async(name,args)=>q('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v));
async function rejects(fn,pattern){await db.query('SAVEPOINT denied');try{await assert.rejects(fn,pattern);}finally{await db.query('ROLLBACK TO denied');}}
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 await db.query('BEGIN');
 await db.query('ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb');
 const golf=read('supabase/six-card-golf/rules.sql','utf8');
 await db.query(golf.slice(golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_points'),golf.indexOf('CREATE OR REPLACE FUNCTION private.golf_integrity')));
 if(!await q("SELECT to_regclass('private.arcade_mega_configs') v"))await db.query(read('supabase/mega-card-golf/candidate.sql','utf8'));
 await db.query("INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('mega-card-golf/4','mega-card-golf','{\"engine\":\"mega-card-golf/4\",\"opening\":\"sequential\",\"finalDraw\":\"stand-pat-or-replace\",\"standPat\":\"playable-hole\",\"score\":\"canonical-golf\"}',true) ON CONFLICT(id) DO UPDATE SET enabled=true");
 for(const f of [...JSON.parse(read('dev/mega-card-golf/competition/installed-functions.json')),...JSON.parse(read('dev/mega-card-golf/competition/installed-lifecycle.json'))])await db.query(f.definition);
 await db.query(read('supabase/mega-card-golf/competition.candidate.sql','utf8'));
 await db.query("UPDATE private.mega_competition_release SET live_enabled=true,async_enabled=true; UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp(); UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true; UPDATE private.delayed_recovery_state SET enabled=true; UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 const users=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 for(const u of users){await db.query('INSERT INTO auth.users(id) VALUES($1)',[u]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u,'Mega '+u.slice(0,8)]);}
 const config=await q("SELECT private.mega_competition_config() v");config.course.holes=3;
 for(const n of [2,3]){
  const g=randomUUID(),ids=users.slice(0,n).map(()=>randomUUID()),offer=new Date(Date.now()+600000).toISOString();await as(users[0]);
  await db.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,4,$2,0,false,false)",[g,offer]);
  for(let i=0;i<n;i++)await db.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[ids[i],g,users[i],4-i]);
  const setup=await rpc('mega_configure',{p_game_id:g,p_dealer_player_id:ids[0],p_expected_dealer_position:4,p_game_type:'mega-card-golf',p_config:{ante_amount:5,mega:config},p_expected_config_deadline:offer}),id=setup.dealer_game.id;
  for(let i=1;i<n;i++){await as(users[i]);await q("SELECT public.submit_ante_decision($1,$2,$3,'ante_up') v",[g,id,ids[i]]);}
  if(n===3){
   await db.query('CREATE SCHEMA IF NOT EXISTS net; CREATE TEMP TABLE mega_dispatch(headers jsonb)');
   await db.query("CREATE OR REPLACE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$BEGIN INSERT INTO mega_dispatch VALUES(headers);RETURN 1;END $$");
   await q("SELECT set_config('request.jwt.claim.sub','',true) v");await q("SELECT set_config('request.jwt.claim.role','service_role',true) v");
   await q('SELECT private.delayed_words_recover() v');
   const token=await q("SELECT headers->>'x-delayed-dispatch' v FROM mega_dispatch LIMIT 1");assert(token);
   await rpc('delayed_recovery_claim',{p_token:token});
   const due=await rpc('mega_live_recovery_claim',{p_token:token});assert(due.some(m=>m.dealer_game_id===id));
   for(const m of due)await synchronizeMegaMatch(rpc,m,null,token);
   await rpc('delayed_recovery_complete',{p_token:token,p_failure:null});
   await rejects(()=>rpc('mega_live_recovery_claim',{p_token:token}),/recovery_denied/);
   await as(users[0]);await q("SELECT set_config('request.jwt.claim.role','authenticated',true) v");
   pass('zero clients: existing authenticated dispatcher admits first hole; expired token cannot replay');
  }
  let v=await megaLiveOperation(rpc,users[0],{op:'state',matchId:id}),firstCommand;
  assert(v.board);assert(!JSON.stringify(v).includes('"decks"'));
  const beforePause=v.board.deadline;
  await db.query('UPDATE public.games SET is_paused=true WHERE id=$1',[g]);
  v=await megaLiveOperation(rpc,users[0],{op:'state',matchId:id});assert(v.paused);assert(!v.canAct);
  await db.query('SELECT pg_sleep(0.02)');await db.query('UPDATE public.games SET is_paused=false WHERE id=$1',[g]);
  v=await megaLiveOperation(rpc,users[0],{op:'state',matchId:id});assert(!v.paused);assert(v.board.deadline>beforePause);
  await rejects(()=>megaLiveOperation(rpc,users[3],{op:'state',matchId:id}),/participant_required/);
  await rejects(()=>rpc('mega_live_commit',{p_match:id,p_actor:null,p_revision:v.revision,p_state:{},p_token:randomUUID()}),/recovery_denied/);
  for(let turn=0;turn<n*3;turn++){
   const actor=users[ids.indexOf(v.actor)];
   for(const intent of [{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}]){
    const command={op:'action',matchId:id,requestId:randomUUID(),revision:v.revision,scope:v.scope,intent};
    v=await megaLiveOperation(rpc,actor,command);const repeated=await megaLiveOperation(rpc,actor,command);assert.equal(repeated.revision,v.revision);
    firstCommand??={actor,command};
   }
   assert.equal(v.results.length,turn+1);
   if(turn<n*3-1){await db.query("UPDATE private.mega_live_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=$1",[id]);v=await megaLiveOperation(rpc,users[0],{op:'state',matchId:id});}
  }
  assert(v.settled);assert.equal(v.results.length,n*3);assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[id]),1);
  assert.equal(await q('SELECT sum(chips)::int v FROM public.players WHERE game_id=$1',[g]),n*100);
  assert.deepEqual((await megaLiveOperation(rpc,firstCommand.actor,firstCommand.command)).settlement,v.settlement);
  await rejects(()=>megaLiveOperation(rpc,firstCommand.actor,{...firstCommand.command,intent:{type:'draw'}}),/request_conflict/);
  // Controlled local clock expiry, retaining the immutable result itself.
  await db.query('ALTER TABLE private.mega_live_matches DISABLE TRIGGER mega_live_guard');
  await db.query("UPDATE private.mega_live_matches SET state=jsonb_set(state,'{terminal,deadline}',to_jsonb(0::bigint)) WHERE dealer_game_id=$1",[id]);
  await db.query('ALTER TABLE private.mega_live_matches ENABLE TRIGGER mega_live_guard');
  v=await rpc('mega_live_finish',{p_match:id,p_actor:users[0]});assert(v.finished);assert(['game_selection','waiting_for_players'].includes(await q('SELECT status v FROM public.games WHERE id=$1',[g])));
  await megaLiveOperation(rpc,firstCommand.actor,firstCommand.command);assert.equal(await q('SELECT count(*)::int v FROM public.game_results WHERE dealer_game_id=$1',[id]),1);
  pass(n+' players: earned holes, private randomness, duplicate/late/conflicting replay, outsider denial, settlement, continuation');
 }
 for(const real of [false,true]){
  await as(users[0]);const id=await q('SELECT public.delayed_create($1,$2,$3,$4) v',[randomUUID(),users[1],real,JSON.stringify([{game:'mega-card-golf',stake:5,config},{game:'mega-card-golf',stake:7,config}])]);
  const hash=await q('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[id]);await as(users[1]);await q("SELECT public.delayed_respond($1,$2,$3,'accept') v",[id,randomUUID(),hash]);
  const children=(await db.query('SELECT id FROM private.delayed_children WHERE match_id=$1 ORDER BY ordinal',[id])).rows;
  const availability=await q("SELECT extract(epoch FROM expires_at-available_at)::bigint v FROM private.delayed_children WHERE id=$1",[children[0].id]);assert.equal(Number(availability),36*3600);
  assert.equal(Number(await q("SELECT extract(epoch FROM last_call_at-available_at)::bigint v FROM private.delayed_children WHERE id=$1",[children[0].id])),24*3600);
  for(const child of children){
   for(let turn=0;turn<6;turn++){
    const actor=await q('SELECT actor v FROM private.delayed_children WHERE id=$1',[child.id]);await as(actor);
    const reviews=await rpc('delayed_reviews',{p_child:child.id});
    for(const event of reviews.events.filter(e=>e.kind==='attempt'&&!e.seen)){const rev=await q('SELECT revision v FROM private.delayed_children WHERE id=$1',[child.id]);await rpc('delayed_review_begin',{p_event:event.id});await rpc('delayed_review_ack',{p_event:event.id});await rpc('delayed_review_ack',{p_event:event.id});assert.equal(await q('SELECT revision v FROM private.delayed_children WHERE id=$1',[child.id]),rev);}
    let v=await delayedOperation(rpc,actor,{op:'state',childId:child.id});
    for(const intent of [{type:'start'},{type:'open',indices:[0]},{type:'open',indices:[1]},{type:'stand-pat'}]){
     const command={op:'action',childId:child.id,requestId:randomUUID(),revision:v.revision,segment:v.segment,intent};
     v=await delayedOperation(rpc,actor,command);assert.equal((await delayedOperation(rpc,actor,command)).revision,v.revision);
    }
    assert(!JSON.stringify(v).includes('"decks"'));
   }
   if(child===children[0])assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[id]),0);
  }
  assert.equal(await q('SELECT count(*)::int v FROM private.delayed_outcomes WHERE match_id=$1',[id]),2);
  assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[id]),1);
  pass((real?'real':'fake')+' async: two earned courses, one hole per segment, durable review/duplicate ack, one final parent settlement');
 }
 // Availability expiration uses the existing canonical parent/forfeit owner.
 await as(users[0]);const expired=await q('SELECT public.delayed_create($1,$2,false,$3) v',[randomUUID(),users[1],JSON.stringify([{game:'mega-card-golf',stake:5,config}])]);
 const expiredHash=await q('SELECT offer_hash v FROM private.delayed_matches WHERE id=$1',[expired]);await as(users[1]);await q("SELECT public.delayed_respond($1,$2,$3,'accept') v",[expired,randomUUID(),expiredHash]);
 const timeoutChild=await q('SELECT id v FROM private.delayed_children WHERE match_id=$1',[expired]);
 await db.query("UPDATE private.delayed_children SET available_at=statement_timestamp()-interval '37 hours',last_call_at=statement_timestamp()-interval '13 hours',expires_at=statement_timestamp()-interval '1 hour' WHERE id=$1",[timeoutChild]);
 const loser=await q('SELECT actor v FROM private.delayed_children WHERE id=$1',[timeoutChild]);await as(loser);
 await delayedOperation(rpc,loser,{op:'state',childId:timeoutChild});await delayedOperation(rpc,loser,{op:'state',childId:timeoutChild});
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_outcomes WHERE child_id=$1',[timeoutChild]),1);
 assert.equal(await q("SELECT reason v FROM private.delayed_outcomes WHERE child_id=$1",[timeoutChild]),'timeout_forfeit');
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[expired]),1);pass('36-hour expiration forfeits exactly once through existing outcome and parent settlement');
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('ROLLBACK');
 assert.equal(await q("SELECT to_regclass('private.mega_live_matches') v"),null);
 write('qualification.local/mega-competition/service-proof.json',JSON.stringify({passed:true,checks},null,2));
}catch(e){await db.query('ROLLBACK');console.error(e.message,e.where??'',e.detail??'');write('qualification.local/mega-competition/service-proof.json',JSON.stringify({passed:false,checks,error:e.message,where:e.where},null,2));process.exitCode=1;}finally{await db.end();}
