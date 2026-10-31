import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
export async function invitationsProof(db,peer,checks){
 await db.query('RESET ROLE');await peer.query('RESET ROLE');
 await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 const host=randomUUID(),guest=randomUUID(),third=randomUUID(),hostSession=randomUUID(),guestSession=randomUUID();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
 const role=async(c,who)=>{await c.query('RESET ROLE');if(who){await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[who,JSON.stringify({sub:who,session_id:who===host?hostSession:guestSession})]);await c.query('SET ROLE authenticated');}else await c.query('SET ROLE service_role');};
 const settings=p=>q('SELECT public.notification_preferences($1::jsonb) v',[p]);
 const claim=()=>q('SELECT public.async_push_claim() v');
 const args=c=>[c.eventId,c.subscriptionId,c.lease];
 const authorize=c=>q('SELECT public.async_push_authorize($1,$2,$3) v',args(c));
 const finish=(c,result='sent')=>q('SELECT public.async_push_receipt($1,$2,$3,$4) v',[...args(c),result]);
 const insert=async({status='invited',invitee=guest,expiresSeconds=259200}={})=>{await db.query('RESET ROLE');const id=randomUUID();await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at,created_at,expires_at) VALUES($1,$2,$3,false,'{}','invitation-proof',$4,CASE WHEN $4='active' THEN clock_timestamp() ELSE NULL END,clock_timestamp(),clock_timestamp()+make_interval(secs=>$5))",[id,host,invitee,status,expiresSeconds]);return id;};
 const count=match=>q("SELECT count(*)::int v FROM private.push_events WHERE match_id=$1 AND kind='invite'",[match]);
 for(const id of[host,guest,third]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Invitation fixture '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[hostSession,host,guestSession,guest]);
 const historical=await insert();
 await db.query(readFileSync('supabase/web-push/invitations.sql','utf8'));
 assert.equal(await count(historical),0);await role(db,guest);
 assert.equal((await settings(null)).invitations,false);await settings({invitations:true,asyncDefault:false});
 const sub=await q('SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/invitation-'+guest,'B'.repeat(87),'A'.repeat(22)]);
 await role(db,host);await settings({invitations:true});await q('SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/invitation-'+host,'B'.repeat(87),'A'.repeat(22)]);
 const match=await insert();assert.equal(await count(match),1);
 assert.equal(await q("SELECT user_id v FROM private.push_events WHERE match_id=$1 AND kind='invite'",[match]),guest);
 assert.equal(await q('SELECT count(*)::int v FROM private.push_deliveries d JOIN private.push_events e ON e.id=d.event_id WHERE e.match_id=$1',[match]),1);
 assert.equal(await q('SELECT enabled v FROM private.push_match_preferences WHERE match_id=$1 AND user_id=$2',[match,guest]),false);
 await db.query('UPDATE private.delayed_matches SET revision=revision+1 WHERE id=$1',[match]);assert.equal(await count(match),1);
 await role(db);await role(peer);const simultaneous=await Promise.all([claim(),peer.query('SELECT public.async_push_claim() v').then(r=>r.rows[0].v)]);assert.equal(simultaneous.filter(Boolean).length,1);
 const c=simultaneous.find(Boolean),job=await authorize(c);assert.equal(job.payload.kind,'invite');assert.equal(job.payload.matchId,match);assert.equal(c.subscriptionId,sub.id);assert(job.payload.expiresAt>Date.now());
 const receipts=await Promise.all([finish(c),peer.query("SELECT public.async_push_receipt($1,$2,$3,'sent') v",args(c)).then(r=>r.rows[0].v)]);assert.deepEqual(receipts.sort(),[false,true]);
 checks.push('invitation default off; no historical backfill; separate from turn preference; invitee-only fanout; updates/parallel claims/receipts do not duplicate');

 await role(db,guest);await settings({invitations:false});const off=await insert();assert.equal(await count(off),0);await role(db,guest);await settings({invitations:true});await db.query('RESET ROLE');await db.query('UPDATE private.delayed_matches SET revision=revision+1 WHERE id=$1',[off]);assert.equal(await count(off),0);
 // Deferred creation plus acceptance in one commit must never create an invite.
 await db.query('BEGIN');const immediate=await insert();await db.query("UPDATE private.delayed_matches SET status='active',accepted_at=clock_timestamp() WHERE id=$1",[immediate]);await db.query('COMMIT');assert.equal(await count(immediate),0);
 for(const mutation of ["status='declined'","status='cancelled'","status='expired'","status='active',accepted_at=clock_timestamp()"]){
  const stale=await insert();await db.query('UPDATE private.delayed_matches SET '+mutation+' WHERE id=$1',[stale]);await role(db);assert.equal(await claim(),null);
 }
 const expiring=await insert({expiresSeconds:2});await role(db);const expiryClaim=await claim();assert(expiryClaim);await new Promise(r=>setTimeout(r,2200));assert.equal(await authorize(expiryClaim),null);await finish(expiryClaim,'skipped');
 checks.push('no opt-in replay or same-transaction invite/turn double event; accepted, declined, cancelled and expired invitations are discarded before claim');

 const race=await insert();await role(db);const pending=await claim();assert(pending);await peer.query('RESET ROLE');await peer.query("UPDATE private.delayed_matches SET status='active',accepted_at=clock_timestamp() WHERE id=$1",[race]);assert.equal(await authorize(pending),null);await finish(pending,'skipped');
 // A legal active turn can now create its own event; stale invitation stays skipped.
 await role(db,guest);await q('SELECT public.async_push_preference($1,true) v',[race]);await db.query('RESET ROLE');
 await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,1,'ptown-words',1,'{}',$3,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[randomUUID(),race,guest]);
 await role(db);const turn=await claim();assert(turn);assert.equal((await authorize(turn)).payload.kind,'turn');await finish(turn);
 checks.push('acceptance committed between claim and authorize suppresses invitation; existing turn path remains independently deliverable');

 await role(db,guest);await settings({quietEnabled:true,quietStart:'00:00',quietEnd:'00:00',quietZone:'UTC'});
 const quiet=await insert();await role(db);assert.equal(await claim(),null);
 await db.query('RESET ROLE');assert.equal(await q("SELECT count(*)::int v FROM private.push_deliveries d JOIN private.push_events e ON e.id=d.event_id WHERE e.match_id=$1 AND d.state='pending' AND d.retry_at='infinity'",[quiet]),1);
 await role(db,guest);await settings({quietEnabled:false});await role(db);const resumed=await claim();assert.equal((await authorize(resumed)).payload.kind,'invite');await finish(resumed);assert.equal(await claim(),null);
 const windowRace=await insert();await role(db);const beforeQuiet=await claim();await role(peer,guest);await peer.query("SELECT public.notification_preferences('{\"quietEnabled\":true}')");assert.equal(await authorize(beforeQuiet),null);assert.equal(await finish(beforeQuiet),false);
 await peer.query('RESET ROLE');await peer.query("UPDATE private.delayed_matches SET status='declined' WHERE id=$1",[windowRace]);await role(db,guest);await settings({quietEnabled:false});await role(db);assert.equal(await claim(),null);
 checks.push('quiet invitations defer once without changing deadlines; quiet-window race releases the lease; no deferred invitation survives decline');

 const optedOut=await insert();await role(db);const cancelled=await claim();await role(peer,guest);await peer.query("SELECT public.notification_preferences('{\"invitations\":false}')");assert.equal(await authorize(cancelled),null);assert.equal(await finish(cancelled),false);await role(db,guest);await settings({invitations:true});await role(db);assert.equal(await claim(),null);
 const retryMatch=await insert();await role(db);const first=await claim();assert(first);await finish(first,'retry');await db.query('RESET ROLE');await db.query("UPDATE private.push_deliveries SET retry_at=clock_timestamp()-interval '1 second' WHERE event_id=$1 AND subscription_id=$2",args(first).slice(0,2));await role(db);const retry=await claim();assert.equal(retry.eventId,first.eventId);assert.notEqual(retry.lease,first.lease);assert.equal(await authorize(first),null);await finish(retry);assert.equal(await claim(),null);
 checks.push('global invitation opt-out cancels pending/claimed alerts without replay; retry preserves event identity and rejects stale receipt ownership');

 await db.query('RESET ROLE');await db.query('BEGIN');
 for(const roleName of ['anon','authenticated','service_role']){
  assert.equal(await q('SELECT has_function_privilege($1,\'private.push_invited()\',\'EXECUTE\') v',[roleName]),false);
  assert.equal(await q('SELECT has_table_privilege($1,\'private.push_defaults\',\'SELECT,UPDATE\') v',[roleName]),false);
 }
 await role(db,guest);await db.query('SAVEPOINT invalid');await assert.rejects(settings({invitations:'yes'}));await db.query('ROLLBACK TO SAVEPOINT invalid');
 await db.query('SAVEPOINT other');await assert.rejects(settings({userId:host,invitations:true}));await db.query('ROLLBACK TO SAVEPOINT other');await db.query('ROLLBACK');
 checks.push('invitation settings remain own-user-only with strict boolean validation; no new public RPC or direct table/helper privileges');
}
