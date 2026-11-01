import {readFileSync as read} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function realMoneyProof(db,peer,checks){
 await db.query('RESET ROLE');await peer.query('RESET ROLE');
 const migration=read('supabase/migrations/20261101172147_real_money_async_push.sql','utf8');
 for(const f of JSON.parse(read('dev/web-push/real-money-preimage.json'))){
  assert.equal((await db.query("SELECT md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) hash",[f.signature])).rows[0].hash,f.hash,f.signature);
 }
 await db.query('BEGIN');
 try{
  await db.query(read('supabase/web-push/real-money-baseline-proof.sql','utf8'));
  await db.query(migration);await db.query(migration);
  await db.query(read('supabase/web-push/real-money-proof.sql','utf8'));
  checks.push('both money modes: five-game turns, invitations, last call, multi-child/coalescing, current dispatch fences, payload privacy and financial isolation');
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK');throw e;}
 // Repeat the existing claim/receipt/quiet-hour checks against the final authority.
 await db.query(migration);
 await realClaimProof(db,peer,checks);
 const {notificationsProof}=await import('./notifications-proof.mjs');
 await notificationsProof(db,peer,checks);
 await db.query('BEGIN');
 try{
  await db.query(read('supabase/delayed/real-money.candidate.sql','utf8').replaceAll('\r',''));
  await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
  await db.query('UPDATE private.delayed_release SET admission_enabled=true');
  await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
  const results=await db.query(read('supabase/delayed/real-money-proof.sql','utf8'));
  const groups=(Array.isArray(results)?results:[results]).flatMap(r=>r.rows??[]).find(r=>r.checks)?.checks;
  assert.equal(groups.length,26);checks.push('26 canonical financial regression groups pass with corrected push triggers installed');
  await db.query('ROLLBACK');
 }catch(e){await db.query('ROLLBACK');throw e;}
}

async function realClaimProof(db,peer,checks){
 // Disposable local clone only: never run this queue-draining proof on hosted DB.
 await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 const a=randomUUID(),b=randomUUID(),sid=randomUUID();
 const q=async(sql,args=[],conn=db)=>(await conn.query(sql,args)).rows[0]?.v;
 for(const id of[a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Push real worker '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,a]);
 await db.query('INSERT INTO private.push_defaults(user_id,enabled,invitations_enabled) VALUES($1,true,true)',[a]);
 for(let i=0;i<2;i++)await db.query("INSERT INTO private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret) VALUES($1,$2,$3,repeat('B',87),repeat('A',22))",[a,sid,'https://web.push.apple.com/real-worker-'+randomUUID()]);
 const claim=async(conn=db)=>{await conn.query('RESET ROLE');await conn.query('SET ROLE service_role');return q('SELECT public.async_push_claim() v',[],conn);};
 const finish=async(c,expected)=>{
  const args=[c.eventId,c.subscriptionId,c.lease];
  const job=await q('SELECT public.async_push_authorize($1,$2,$3) v',args);
  assert.equal(job?.payload.kind,expected);
  assert.equal(await q("SELECT public.async_push_receipt($1,$2,$3,'sent') v",args),true);
  assert.equal(await q("SELECT public.async_push_receipt($1,$2,$3,'sent') v",args),false);
 };
 const drain=async kind=>{
  const first=await Promise.all([claim(),claim(peer)]);
  const found=first.filter(Boolean);assert(found.length>=1);
  assert.equal(new Set(found.map(c=>c.subscriptionId)).size,found.length);
  for(const c of found)await finish(c,kind);
  while(found.length<2){const c=await claim();assert(c);found.push(c);await finish(c,kind);}
  assert.equal(new Set(found.map(c=>c.subscriptionId)).size,2);
  assert.equal(await claim(),null);await db.query('RESET ROLE');await peer.query('RESET ROLE');
 };
 const m=randomUUID();
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash) VALUES($1,$2,$3,true,'{}','worker-real')",[m,b,a]);
 await drain('invite');
 await db.query('BEGIN');
 await db.query("UPDATE private.delayed_matches SET status='active',accepted_at=now() WHERE id=$1",[m]);
 for(const [i,g]of ['ptown-words','run21','tri-towers','quintzee','boxdrop'].entries())await db.query("INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,$3,1,'{}',$4,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[m,i+1,g,a]);
 await db.query('COMMIT');await drain('turn');
 await db.query("UPDATE private.delayed_children SET segment=segment+1 WHERE match_id=$1 AND ordinal=2",[m]);await drain('turn');
 await db.query("UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE match_id=$1",[m]);
 await db.query("UPDATE private.push_deliveries d SET retry_at=now() FROM private.push_events e WHERE e.id=d.event_id AND e.match_id=$1 AND d.state='pending'",[m]);
 await drain('last_call');
 checks.push('real-money end-to-end DB worker: invitation, simultaneous five-game turns, another child while waiting, due Last Call; two devices, parallel claims and duplicate receipts');
}
