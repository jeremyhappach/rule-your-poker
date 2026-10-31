import {randomUUID,createECDH} from 'node:crypto';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createScheduledHandler,scheduledBatch} from '../../server/webPush/scheduled.mjs';
import {createTransport} from '../../server/webPush/transport.mjs';
export async function raceAndSchedulerProof(db,peer,sql,checks){
 const a=randomUUID(),b=randomUUID(),sid=randomUUID(),sidB=randomUUID(),match=randomUUID(),children=[randomUUID(),randomUUID()];
 const query=(c,q,args=[])=>c.query(q,args).then(r=>r.rows[0]?.v);
 const role=async(c,id)=>{await c.query('RESET ROLE');if(id){await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,session_id:id===a?sid:sidB})]);await c.query('SET ROLE authenticated');}else await c.query('SET ROLE service_role');};
 await db.query('RESET ROLE');await db.query(sql);
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Push race '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[sid,a,sidB,b]);
 await role(db,a);await query(db,'SELECT public.async_push_preference(NULL,true) v');
 const ec=createECDH('prime256v1');ec.generateKeys();const key=ec.getPublicKey().toString('base64url');
 const devices=[];for(const endpoint of ['https://web.push.apple.com/local-race','https://fcm.googleapis.com/local-race'])devices.push(await query(db,'SELECT public.async_push_subscribe($1,$2,$3) v',[endpoint,key,'A'.repeat(22)]));
 await db.query('RESET ROLE');await db.query('BEGIN');
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at) VALUES($1,$2,$3,false,'{}','push-race','active',now())",[match,a,b]);
 for(const [i,id]of children.entries())await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,$3,'ptown-words',1,'{}',$4,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[id,match,i+1,a]);
 await db.query('COMMIT');await role(db);await role(peer);
 const claims=await Promise.all([query(db,'SELECT public.async_push_claim() v'),query(peer,'SELECT public.async_push_claim() v')]);
 const usable=claims.filter(Boolean);assert(usable.length>=1);assert.equal(new Set(usable.map(c=>c.eventId+':'+c.subscriptionId)).size,usable.length);
 const c=usable[0],args=[c.eventId,c.subscriptionId,c.lease];
 const receipts=await Promise.all([query(db,"SELECT public.async_push_receipt($1,$2,$3,'sent') v",args),query(peer,"SELECT public.async_push_receipt($1,$2,$3,'sent') v",args)]);
 assert.deepEqual(receipts.sort(),[false,true]);checks.push('two independent DB callers never claim same delivery; receipt race applies once');
 await db.query('RESET ROLE');await db.query('BEGIN');await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE id=$1',[children[0]]);await db.query('COMMIT');
 assert.equal(await query(db,'SELECT count(*)::int v FROM private.push_events WHERE match_id=$1',[match]),4);
 await Promise.all([db.query('UPDATE private.delayed_children SET revision=revision+1 WHERE id=$1',[children[0]]),peer.query('RESET ROLE').then(()=>peer.query('UPDATE private.delayed_children SET revision=revision+1 WHERE id=$1',[children[0]]))]);
 assert.equal(await query(db,'SELECT count(*)::int v FROM private.push_events WHERE match_id=$1',[match]),4);checks.push('new child turn while another waits creates one match transition; concurrent refresh writes create none');
 // Force a lost worker lease in synthetic state, then verify stale authorization/receipt fencing.
 await db.query("UPDATE private.push_deliveries SET lease_until=now()-interval '1 second' WHERE state='sending'");await role(db);
 const lost=await query(db,'SELECT public.async_push_claim() v');assert(lost);const lostArgs=[lost.eventId,lost.subscriptionId,lost.lease];
 await peer.query("UPDATE private.push_deliveries SET lease_until=now()-interval '1 second' WHERE event_id=$1 AND subscription_id=$2",lostArgs.slice(0,2));
 await role(peer);const recovered=await query(peer,'SELECT public.async_push_claim() v');assert(recovered);
 assert.equal(await query(db,'SELECT public.async_push_authorize($1,$2,$3) v',lostArgs),null);
 assert.equal(await query(db,"SELECT public.async_push_receipt($1,$2,$3,'sent') v",lostArgs),false);
 const recoveredArgs=[recovered.eventId,recovered.subscriptionId,recovered.lease];
 await role(db,a);await query(db,'SELECT public.async_push_preference($1,false) v',[match]);assert.equal(await query(peer,'SELECT public.async_push_authorize($1,$2,$3) v',recoveredArgs),null);
 await query(db,'SELECT public.async_push_preference($1,true) v',[match]);checks.push('crash lease recovery fences old worker; separately committed preference change stops authorized send');
 // Rebinding the same endpoint must invalidate every earlier account delivery.
 await role(db,b);const rebound=await query(db,'SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/local-race',key,'A'.repeat(22)]);assert.notEqual(rebound.binding,devices[0].binding);
 await db.query('RESET ROLE');assert.equal(await query(db,'SELECT user_id v FROM private.push_subscriptions WHERE id=$1',[rebound.id]),b);
 await db.query('DELETE FROM auth.sessions WHERE id=$1',[sid]);assert.equal(await query(peer,'SELECT public.async_push_authorize($1,$2,$3) v',recoveredArgs),null);
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[sid,a]);checks.push('account rebinding rotates ownership; session revocation stops old-account delivery');
 // Local scheduler calls the real SQL RPCs through HTTP, with temporary VAPID keys and mock network.
 await db.query("UPDATE private.push_deliveries SET state='skipped',lease_until=NULL WHERE state IN('sending','pending')");
 await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE match_id=$1',[match]);await role(db);
 const vapid=createECDH('prime256v1');vapid.generateKeys();const secret='local-only-ephemeral-scheduler-secret-'+randomUUID();let sends=0,ticks=0;
 const send=createTransport({publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url'),subject:'mailto:fixture@example.invalid'},async(url,options)=>{assert.equal(new URL(url).origin,'https://fcm.googleapis.com');assert.equal(options.headers['Content-Encoding'],'aes128gcm');assert(options.body.length>86);sends++;return {status:201};});
 const rpc=(name,args)=>query(db,'SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args));
 const handler=createScheduledHandler({enabled:true,secret,run:()=>{ticks++;return scheduledBatch(rpc,send);}}),server=createServer(handler);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret}})).status,405);assert.equal(sends,0);
  const run=()=>fetch(url,{headers:{Authorization:'Bearer '+secret}}).then(async r=>{assert.equal(r.status,200);return r.json();});
  await run();assert.equal(sends,1);await run();assert.equal(sends,1);
  await db.query('RESET ROLE');await db.query("UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE match_id=$1",[match]);
  await db.query("UPDATE private.push_deliveries SET retry_at=now()-interval '1 second' WHERE state='pending'");await role(db);await run();assert.equal(sends,2);await run();assert.equal(sends,2);assert(ticks>=4);
  // Deletion and terminal status independently suppress pending current-state deliveries.
  await db.query('RESET ROLE');await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE match_id=$1',[match]);await role(db,a);
  await query(db,"SELECT public.delayed_remove($1,$2) v",[match,randomUUID()]);await role(db);await run();assert.equal(sends,2);
  checks.push('authenticated local scheduled endpoint sends turn + due Last Call without browsers; no repeats; deleted match suppressed');
 }finally{await new Promise(r=>server.close(r));}
 checks.push('independent races and local scheduled HTTP sender passed');
}
