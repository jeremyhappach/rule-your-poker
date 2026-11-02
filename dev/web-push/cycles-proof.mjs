import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const migration=()=>read('supabase/migrations/20261102154632_async_push_cycles_activity.sql','utf8');
export async function cyclesProof(db,peer,checks){
 await db.query('RESET ROLE');await peer.query('RESET ROLE');
 await db.query(migration());await db.query(migration());
 await db.query('BEGIN');
 try{
  await db.query(read('supabase/web-push/real-money-baseline-proof.sql','utf8'));
  const result=await db.query(read('supabase/web-push/cycles-proof.sql','utf8'));
  checks.push(...(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]).flatMap(r=>r.checks??[]));
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK');throw e;}
 await db.query('BEGIN');
 try{
  await db.query(read('supabase/delayed/real-money.candidate.sql','utf8').replaceAll('\r',''));
  await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
  await db.query('UPDATE private.delayed_release SET admission_enabled=true');
  await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
  const result=await db.query(read('supabase/delayed/real-money-proof.sql','utf8'));
  const groups=(Array.isArray(result)?result:[result]).flatMap(r=>r.rows??[]).find(r=>r.checks)?.checks;
  assert.equal(groups.length,26);checks.push('26 canonical financial groups pass with cycle/activity correction installed');
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK');throw e;}
 // Global claims are safe ONLY in this disposable local clone.
 await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 const a=randomUUID(),b=randomUUID(),sid=randomUUID(),m=randomUUID(),c=randomUUID(),c2=randomUUID();
 for(const id of[a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Cycle worker '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,a]);
 await db.query('INSERT INTO private.push_defaults(user_id,enabled) VALUES($1,true)',[a]);
 for(let i=0;i<2;i++)await db.query("INSERT INTO private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret) VALUES($1,$2,$3,repeat('B',87),repeat('A',22))",[a,sid,'https://web.push.apple.com/cycle-'+randomUUID()]);
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at) VALUES($1,$2,$3,true,'{}','cycle-worker','active',now())",[m,b,a]);
 const child=async(id,ordinal)=>db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,$3,'run21',1,'{}',$4,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[id,m,ordinal,a]);
 const claim=async(conn=db)=>{await conn.query('RESET ROLE');await conn.query('SET ROLE service_role');return (await conn.query('SELECT public.async_push_claim() v')).rows[0].v;};
 await child(c,1);
 // Two connections cannot claim the same device/event. Pending Last Call must not be consumed.
 const found=(await Promise.all([claim(),claim(peer)])).filter(Boolean);
 while(found.length<2){const next=await claim();assert(next);found.push(next);}
 assert.equal(new Set(found.map(x=>x.subscriptionId)).size,2);
 for(const x of found){
  assert.equal((await db.query('SELECT public.async_push_authorize($1,$2,$3) v',[x.eventId,x.subscriptionId,x.lease])).rows[0].v.payload.kind,'turn');
  await db.query("SELECT public.async_push_receipt($1,$2,$3,'sent')",[x.eventId,x.subscriptionId,x.lease]);
 }
 await db.query('RESET ROLE');await child(c2,2);assert.equal(await claim(),null);
 await db.query('RESET ROLE');await db.query('UPDATE private.delayed_children SET actor=$2 WHERE match_id=$1',[m,b]);
 await db.query('UPDATE private.delayed_children SET actor=$2,segment=segment+1 WHERE id=$1',[c,a]);
 await db.query("INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,status,interaction_age_ms) VALUES($1,'active-laptop','active',0)",[a]);
 assert.equal(await claim(),null);
 await db.query('RESET ROLE');
 assert.equal((await db.query("SELECT count(*)::int n FROM private.push_deliveries d JOIN private.push_events e ON e.id=d.event_id WHERE e.match_id=$1 AND e.kind='turn' AND e.epoch=(SELECT max(epoch) FROM private.push_events WHERE match_id=$1 AND kind='turn') AND d.state='skipped'",[m])).rows[0].n,2);
 await db.query("UPDATE public.voice_presence_heartbeats SET status='hidden' WHERE user_id=$1",[a]);assert.equal(await claim(),null);
 await db.query('RESET ROLE');
 await db.query("UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE match_id=$1",[m]);
 await db.query("UPDATE private.push_deliveries SET retry_at=now() WHERE state='pending'");
 const reminder=await claim();assert(reminder);
 assert.equal((await db.query('SELECT public.async_push_authorize($1,$2,$3) v',[reminder.eventId,reminder.subscriptionId,reminder.lease])).rows[0].v.payload.kind,'last_call');
 checks.push('parallel claims, per-device dedupe, no extra child turn, account-wide permanent claim suppression, Last Call survives');
 await db.query('RESET ROLE');await peer.query('RESET ROLE');
 const plan=(await db.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT 1 FROM public.voice_presence_heartbeats WHERE user_id=$1 AND status='active' AND updated_at>clock_timestamp()-interval '10 seconds' AND interaction_age_ms BETWEEN 0 AND 59999",[a])).rows;
 write('qualification.local/web-push/cycles-query-plan.json',JSON.stringify(plan,null,2));
 // Repeated ordinary revisions run the actual deferred notification trigger.
 // Compare the captured production owner with the candidate on the same clone.
 const original=JSON.parse(read('dev/web-push/cycles-preimage.json')).functions.find(f=>f.name==='private.push_sync').definition;
 const samples=[];
 for(const mode of ['before','after','after','before']){
  await db.query('BEGIN');await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await db.query(mode==='before'?original:migration());
  const before=(await db.query("SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid='private.push_episodes'::regclass")).rows[0].n_tup_upd;
  const heartbeatBefore=(await db.query("SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid='public.voice_presence_heartbeats'::regclass")).rows[0].n_tup_upd;
  const start=performance.now();
  await db.query(`DO $$ BEGIN FOR i IN 1..300 LOOP UPDATE private.delayed_children SET revision=revision+1 WHERE id='${c}'::uuid; END LOOP; END $$;`);
  const elapsedMs=performance.now()-start;
  const after=(await db.query("SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid='private.push_episodes'::regclass")).rows[0].n_tup_upd;
  const heartbeatAfter=(await db.query("SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid='public.voice_presence_heartbeats'::regclass")).rows[0].n_tup_upd;
  assert.equal(heartbeatAfter,heartbeatBefore);
  if(mode==='after')assert.equal(after,before);
  samples.push({mode,revisions:300,elapsedMs,msPerRevision:elapsedMs/300,episodeUpdates:Number(after)-Number(before),presenceUpdates:0});
  await db.query('ROLLBACK');
 }
 write('qualification.local/web-push/cycles-gameplay-cost.json',JSON.stringify(samples,null,2));
 checks.push('1200 actual child revisions: zero extra presence writes; unchanged availability performs zero episode updates');
}
