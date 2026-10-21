import {connect,localContext,candidate} from './database.mjs';
import {randomUUID as uuid} from 'node:crypto';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const db=localContext().database,a=await connect(db),b=await connect(db),admin=await connect(db);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 if(!(await admin.query("SELECT to_regclass('private.race_poker_matches') present")).rows[0].present)await admin.query(candidate());
 await admin.query("UPDATE private.race_poker_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=true");
 for(const real of [false]){
 const u=[uuid(),uuid()],p=[uuid(),uuid()],g=uuid(),offer=new Date(Date.now()+600000).toISOString();
 await admin.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
 for(let i=0;i<2;i++){await admin.query('INSERT INTO auth.users(id) VALUES($1)',[u[i]]);await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[u[i],'Race Poker proof '+u[i]]);}
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',$3,2,$2,0,false,false)",[g,offer,real]);
 for(let i=0;i<2;i++)await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,$5)',[p[i],g,u[i],2-i,i===1]);
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[0]]);
 const config=await q(admin,"SELECT public.race_poker_configure($1,$2,2,'race-poker','{\"ante_amount\":9}',$3) v",[g,p[0],offer]),d=config.dealer_game.id;
 await q(admin,"SELECT set_config('request.jwt.claim.sub',$1,false) v",[u[1]]);await q(admin,'SELECT public.advance_ante_phase($1,$2) v',[g,d]);
 const state=await q(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]);
 const botIndex=state.players.findIndex(p=>p.isBot);assert.notEqual(botIndex,-1);
 await admin.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{turnIndex}',to_jsonb($2::int)) WHERE dealer_game_id=$1",[d,botIndex]);
 const beforePause=await q(admin,"SELECT (state->>'deadline')::bigint v FROM private.race_poker_matches WHERE dealer_game_id=$1",[d]);
 await admin.query('UPDATE public.games SET is_paused=true WHERE id=$1',[g]);
 await new Promise(r=>setTimeout(r,200));await q(admin,'SELECT private.race_poker_recover() v');
 assert.equal(await q(admin,'SELECT bot_due_at v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]),null);
 await admin.query('UPDATE public.games SET is_paused=false WHERE id=$1',[g]);
 assert.ok(Number(await q(admin,"SELECT (state->>'deadline')::bigint v FROM private.race_poker_matches WHERE dealer_game_id=$1",[d]))>=Number(beforePause)+190);
 for(let pick=0;pick<5;pick++){
  await new Promise(r=>setTimeout(r,800));
  await Promise.all([a,b].map(c=>q(c,'SELECT private.race_poker_recover() v')));
  const current=await q(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]);
  assert.equal(current.hand.length,pick+1,'one durable bot choice per due work item');
 }
 const completeHand=await q(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]);
 assert.equal(completeHand.phase,'stage_complete');assert.equal(completeHand.choices.length,0);assert.equal(completeHand.deck,undefined);
 // Force policy computation across the deadline inside a rollback-only fixture.
 await admin.query('BEGIN');
 const policy=await q(admin,"SELECT pg_get_functiondef('private.race_poker_bot_choice(integer[],integer[])'::regprocedure) v");
 await admin.query(policy.replace('BEGIN','BEGIN PERFORM pg_sleep(0.1);'));
 await admin.query('ALTER TABLE private.race_poker_matches DISABLE TRIGGER race_poker_bot_schedule');
 await admin.query("UPDATE private.race_poker_matches SET state=private.race_poker_deal(state,floor(extract(epoch FROM clock_timestamp())*1000)::bigint)||jsonb_build_object('deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint+50),bot_due_at=0 WHERE dealer_game_id=$1",[d]);
 await admin.query('ALTER TABLE private.race_poker_matches ENABLE TRIGGER race_poker_bot_schedule');
 await q(admin,'SELECT private.race_poker_recover() v');
 assert.equal(await q(admin,"SELECT state#>>'{result,reason}' v FROM private.race_poker_matches WHERE dealer_game_id=$1",[d]),'timeout');
 assert.equal(await q(admin,"SELECT state#>>'{result,points}' v FROM private.race_poker_matches WHERE dealer_game_id=$1",[d]),'0');
 await admin.query('ROLLBACK');
 // A process-free gap beyond all remaining deadlines must finish the race and settle without browsers.
 await admin.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-2000000)) WHERE dealer_game_id=$1",[d]);
 await q(admin,'SELECT private.race_poker_recover() v');
 const final=await q(admin,'SELECT state v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]);
 assert.equal(final.phase,'complete');assert.equal(final.stages.length,32);assert.equal(final.stage,16);
 assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[d])).rows[0].n,'1');
 await admin.query("UPDATE private.race_poker_matches SET state=jsonb_set(state,'{terminal,deadline}','0') WHERE dealer_game_id=$1",[d]);await q(admin,'SELECT private.race_poker_recover() v');
 assert.equal(await q(admin,'SELECT finished v FROM private.race_poker_matches WHERE dealer_game_id=$1',[d]),true);
 console.log('PASS durable strategic bot, competing recovery workers, canonical bot pause, policy/deadline race, zero-client 32-hand completion, settlement and continuation');
 }
 writeFileSync('qualification.local/race-poker/recovery.json',JSON.stringify({passed:true,at:new Date().toISOString()}));
}finally{await Promise.all([a.end(),b.end(),admin.end()]);}
