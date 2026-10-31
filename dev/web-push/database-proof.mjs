import {connect} from '../async-words/local.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {raceAndSchedulerProof} from './races.mjs';
import {installCreationFixture,notificationsProof} from './notifications-proof.mjs';
import assert from 'node:assert/strict';
const database='web_push_fe00_'+Date.now(),template='async_reviews_1793308358890';
const root=await connect('template1');let db,peer,passed=false;const checks=[];
if(process.argv.includes('--inspect')){
 try{
  const old='web_push_fe00_1793402041595';
  console.log(JSON.stringify({database:old,exists:(await root.query('SELECT datname FROM pg_database WHERE datname=$1',[old])).rowCount>0,
   runners:(await root.query("SELECT pid,datname,state,application_name FROM pg_stat_activity WHERE datname=$1 OR application_name='web-push-fe00-proof'",[old])).rows},null,2));
 }finally{await root.end();}
 process.exit(0);
}
const withTimezone=process.argv.includes('--with-timezone');
const sql=readFileSync('supabase/web-push/candidate.sql','utf8')+(withTimezone?'\n'+readFileSync('supabase/web-push/timezone.sql','utf8'):'');
try{
 await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);
 db=await connect(database);peer=await connect(database);
 // Auth sessions are absent in the old local fixture. This is explicit auth-shape scaffolding, not production proof.
 await db.query('CREATE TABLE IF NOT EXISTS auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)');
 await db.query('ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS not_after timestamptz');
 await installCreationFixture(db);
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID(),sid=randomUUID(),match=randomUUID(),oldMatch=randomUUID(),c1=randomUUID(),c2=randomUUID();
 const val=async(q,p=[])=>(await db.query(q,p)).rows[0]?.v;
 const user=async id=>{await db.query('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,session_id:sid})]);await db.query('SET ROLE authenticated');};
 const service=async()=>{await db.query('RESET ROLE');await db.query('SET ROLE service_role');};
 const reject=async(q,p=[])=>{await db.query('SAVEPOINT forbidden');await assert.rejects(db.query(q,p));await db.query('ROLLBACK TO SAVEPOINT forbidden');};
 const insertMatch=async id=>db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash) VALUES($1,$2,$3,false,'{}','local-push-proof')",[id,a,b]);
 await db.query('BEGIN');
 for(const id of [a,b,outsider]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Push '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,a]);await insertMatch(oldMatch);
 await db.query(sql);
 await user(a);await val('SELECT public.async_push_preference(NULL,true) v');
 assert.equal(await val('SELECT public.async_push_preference($1) v',[oldMatch]),false);checks.push('existing matches conservatively opt out');
 await db.query('RESET ROLE');await insertMatch(match);await user(a);
 assert.equal(await val('SELECT public.async_push_preference($1) v',[match]),true);
 await val('SELECT public.async_push_preference(NULL,false) v');assert.equal(await val('SELECT public.async_push_preference($1) v',[match]),true);
 await user(b);assert.equal(await val('SELECT public.async_push_preference($1) v',[match]),false);
 await user(outsider);await reject('SELECT public.async_push_preference($1,true)',[match]);await reject('SELECT public.async_push_claim()');checks.push('global snapshot only at admission; per-viewer overrides; unauthorized match and worker denied');
 await user(a);const sub=await val('SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/local-fe00','B'.repeat(87),'A'.repeat(22)]);
 const sub2=await val('SELECT public.async_push_subscribe($1,$2,$3) v',['https://fcm.googleapis.com/local-fe00','B'.repeat(87),'A'.repeat(22)]);
 assert.equal((await val('SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/local-fe00','B'.repeat(87),'A'.repeat(22)])).binding,sub.binding);
 await reject('SELECT public.async_push_subscribe($1,$2,$3)',['https://127.0.0.1/secret','B'.repeat(87),'A'.repeat(22)]);
 await reject('SELECT public.async_push_subscribe($1,$2,$3)',['https://webXpushXappleXcom/secret','B'.repeat(87),'A'.repeat(22)]);
 await reject('SELECT public.async_push_subscribe($1,$2,$3)',['https://web.push.apple.com.evil.invalid/secret','B'.repeat(87),'A'.repeat(22)]);
 await db.query('RESET ROLE');await db.query("UPDATE private.delayed_matches SET status='active',accepted_at=clock_timestamp() WHERE id=$1",[match]);
 for(const child of [c1,c2])await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,$3,'ptown-words',1,'{}',$4,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[child,match,child===c1?1:2,a]);
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 assert.equal(await val('SELECT count(*)::int v FROM private.push_events WHERE match_id=$1',[match]),2);
 await db.query('UPDATE private.delayed_children SET revision=revision+1 WHERE match_id=$1',[match]);
 assert.equal(await val('SELECT count(*)::int v FROM private.push_events WHERE match_id=$1',[match]),2);checks.push('two children one match episode; repeat updates deduplicate');
 await service();const claim=await val('SELECT public.async_push_claim() v');assert(claim);
 const args=[claim.eventId,claim.subscriptionId,claim.lease];assert(await val('SELECT public.async_push_authorize($1,$2,$3) v',args));
 await db.query('RESET ROLE');await db.query('SAVEPOINT past_due');await db.query("UPDATE private.delayed_children SET gameplay_due_at=now()-interval '1 second' WHERE match_id=$1",[match]);await service();
 assert.equal(await val('SELECT public.async_push_authorize($1,$2,$3) v',args),null);
 await db.query('ROLLBACK TO SAVEPOINT past_due');await service();
 for(const mutation of ["UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1","INSERT INTO private.delayed_incidents(match_id,reason) VALUES($1,'local push hold')","UPDATE private.delayed_matches SET status='settled' WHERE id=$1"]){
  await db.query('RESET ROLE');await db.query('SAVEPOINT suppression');await db.query(mutation,[mutation.startsWith('UPDATE auth.sessions')?sid:match]);await service();
  assert.equal(await val('SELECT public.async_push_authorize($1,$2,$3) v',args),null);await db.query('ROLLBACK TO SAVEPOINT suppression');
 }
 await service();checks.push('expired session, incident hold and terminal match status suppress sends');
 checks.push('exact provider hosts required; expired active gameplay is not actionable');
 await db.query('SAVEPOINT opt_out');await user(a);await val('SELECT public.async_push_preference($1,false) v',[match]);await service();assert.equal(await val('SELECT public.async_push_authorize($1,$2,$3) v',args),null);
 await db.query('ROLLBACK TO SAVEPOINT opt_out');await service();
 assert.equal(await val("SELECT public.async_push_receipt($1,$2,$3,'retry') v",args),true);
 assert.equal(await val("SELECT public.async_push_receipt($1,$2,$3,'sent') v",args),false);checks.push('delivery preference recheck and receipt idempotency');
 await db.query('RESET ROLE');await db.query("UPDATE private.push_deliveries SET retry_at=now()-interval '1 second' WHERE event_id=$1 AND subscription_id=$2",args.slice(0,2));
 await service();const retry=await val('SELECT public.async_push_claim() v');assert(retry);assert.notEqual(retry.lease,claim.lease);
 assert.equal(await val('SELECT public.async_push_authorize($1,$2,$3) v',args),null);
 const retryArgs=[retry.eventId,retry.subscriptionId,retry.lease];
 await val("SELECT public.async_push_receipt($1,$2,$3,'sent') v",retryArgs);
 // Drain the other device's turn. No reminder before its authoritative 24h boundary.
 const other=await val('SELECT public.async_push_claim() v');if(other)await val("SELECT public.async_push_receipt($1,$2,$3,'sent') v",[other.eventId,other.subscriptionId,other.lease]);
 assert.equal(await val('SELECT public.async_push_claim() v'),null);checks.push('per-device fanout and leased retries; stale lease cannot finish; no early Last Call');
 await db.query('RESET ROLE');await db.query("UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE match_id=$1",[match]);
 await db.query("UPDATE private.push_deliveries SET retry_at=now()-interval '1 second' WHERE state='pending'");
 await service();const reminder=await val('SELECT public.async_push_claim() v');assert(reminder);
 const remindArgs=[reminder.eventId,reminder.subscriptionId,reminder.lease];assert.equal((await val('SELECT public.async_push_authorize($1,$2,$3) v',remindArgs)).payload.kind,'last_call');
 await db.query('RESET ROLE');await db.query('UPDATE private.delayed_children SET actor=$2 WHERE match_id=$1',[match,b]);await service();assert.equal(await val('SELECT public.async_push_authorize($1,$2,$3) v',remindArgs),null);checks.push('24h reminder only while pending; stale turn suppressed');
 await val("SELECT public.async_push_receipt($1,$2,$3,'skipped') v",remindArgs);
 await db.query('RESET ROLE');await db.query('UPDATE private.delayed_children SET actor=$2,segment=segment+1 WHERE match_id=$1',[match,a]);await user(a);
 await val('SELECT public.async_push_device($1,$2,false,$3)',[sub.id,sub.binding,match]);await service();
 const next=await val('SELECT public.async_push_claim() v');if(next){assert.notEqual(next.subscriptionId,sub.id);await val("SELECT public.async_push_receipt($1,$2,$3,'gone') v",[next.eventId,next.subscriptionId,next.lease]);}
 await db.query('RESET ROLE');assert.equal(await val('SELECT disabled v FROM private.push_subscriptions WHERE id=$1',[sub2.id]),true);checks.push('visible-device suppression; expired endpoint disabled');
 await user(a);await val('SELECT public.async_push_device($1,$2,true)',[sub.id,sub.binding]);
 await db.query('RESET ROLE');assert.notEqual(await val('SELECT binding v FROM private.push_subscriptions WHERE id=$1',[sub.id]),sub.binding);checks.push('logout/device disable invalidates old binding');
 await db.query('ROLLBACK');
 assert.equal(await val('SELECT count(*)::int v FROM public.profiles WHERE id=ANY($1::uuid[])',[[a,b,outsider]]),0);
 checks.push('rollback removed all synthetic users and candidate schema');
 await raceAndSchedulerProof(db,peer,sql,checks);
 await notificationsProof(db,peer,checks);
 if(withTimezone){const {timezoneProof}=await import('./timezone-proof.mjs');await timezoneProof(db,checks);}
 passed=true;
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{
 await peer?.end();await db?.end();await root.query('DROP DATABASE IF EXISTS '+database);
 const cleanupVerified=(await root.query('SELECT FROM pg_database WHERE datname=$1',[database])).rowCount===0;await root.end();
 mkdirSync('qualification.local/web-push',{recursive:true});writeFileSync('qualification.local/web-push/database-proof-resumed.json',JSON.stringify({passed,cleanupVerified,template,database,sqlSha256:createHash('sha256').update(sql).digest('hex'),checks,limitations:['local auth.sessions shape','no hosted qualification or delivery','timezone compatibility is a separate activation blocker']},null,2));
}
