// Approved hosted qualification: new isolated fixtures only. Credentials stay in memory.
import {login} from '../canasta/hosted-support.mjs';
import {createClient} from '@supabase/supabase-js';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const path='qualification.local/async-combined/',f=JSON.parse(read(path+'presence-hosted-context.json'));
const auth=await login(),a=auth.byUser[f.a],b=auth.byUser[f.b],checks=[],extras=[];
assert(a&&b,'Exact authenticated fixture identities');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const topic=(actor=f.a,deadline=f.expires,match=f.match,child=f.child)=>`delayed-playing:${match}:${child}:${actor}:${deadline}`;
const pass=s=>{checks.push(s);console.log('PASS',s);};
async function fresh(principal){const c=createClient(a.client.supabaseUrl,a.client.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});extras.push(c);if(principal){const {error}=await c.auth.setSession({access_token:principal.session.access_token,refresh_token:principal.session.refresh_token});assert(!error,'Session qualification failed');}return c;}
async function join(client,name){
 const channel=client.channel(name,{config:{private:true,presence:{key:randomUUID()},broadcast:{ack:true}}});
 channel.on('presence',{event:'sync'},()=>{});
 const status=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('proof_timeout'),10000);channel.subscribe(s=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s)){clearTimeout(timer);resolve(s);}});});
 return {channel,status};
}
async function until(test,label){for(let i=0;i<100;i++){if(test())return;await sleep(30);}throw Error(label);}
const has=(channel,beat)=>JSON.stringify(channel.presenceState()).includes(beat);
async function deny(client,t,label){const result=await join(client,t);assert.notEqual(result.status,'SUBSCRIBED',label);await client.removeChannel(result.channel);}
try{
 let actor=await join(a.client,topic()),watcher=await join(b.client,topic());assert.equal(actor.status,'SUBSCRIBED');assert.equal(watcher.status,'SUBSCRIBED');
 const beat=randomUUID();assert.equal(await actor.channel.track({beat},{timeout:2000}),'ok');await until(()=>has(watcher.channel,beat),'actor Presence not delivered');pass('authenticated actor publishes and other participant receives private hosted Presence');
 const spoof=randomUUID();await watcher.channel.track({beat:spoof},{timeout:1500});await sleep(400);assert(!has(actor.channel,spoof));assert(!has(watcher.channel,spoof));pass('observer cannot publish Presence');
 await Promise.all([
  deny(await fresh(b),topic(f.a,f.expires,f.otherMatch,f.otherChild),'authenticated outsider'),
  deny(await fresh(a),topic(f.a,f.expires+1),'wrong deadline'),
  deny(await fresh(a),topic(f.a,f.expires,f.match,randomUUID()),'wrong child'),
  deny(await fresh(null),topic(),'anonymous')
 ]);pass('authenticated outsider, anonymous, wrong child and wrong deadline cannot join');
 const broadcast=await actor.channel.send({type:'broadcast',event:'qualification',payload:{probe:true}},{timeout:1500});assert.notEqual(broadcast,'ok');pass('Presence permission does not admit Broadcast');
 await actor.channel.untrack();await until(()=>!has(watcher.channel,beat),'untrack did not clear observer');await a.client.removeChannel(actor.channel);
 // Use a fresh authenticated socket after explicitly closing the only channel.
 // The SDK's last-channel disconnect is asynchronous; immediately reusing that
 // disconnecting single-channel client does not model a new transport connection.
 actor=await join(await fresh(a),topic());assert.equal(actor.status,'SUBSCRIBED');const reconnect=randomUUID();await actor.channel.track({beat:reconnect},{timeout:2000});await until(()=>has(watcher.channel,reconnect),'reconnect Presence missing');pass('untrack clears Playing Now and a fresh authenticated connection restores Presence');
 write(path+'presence-hosted-ready.json',JSON.stringify({match:f.match,phase:'awaiting-isolated-fixture-handoff'}));console.log('READY_FOR_FIXTURE_HANDOFF');
 const untilAt=Date.now()+120000;while(!existsSync(path+'presence-hosted-handoff.json')){if(Date.now()>untilAt)throw Error('Fixture handoff signal timed out');await sleep(100);}
 const signal=JSON.parse(read(path+'presence-hosted-handoff.json'));assert.equal(signal.match,f.match);
 // Cached authorization may permit an existing old-topic connection. It cannot
 // publish into the new actor/deadline topic used by the authoritative UI.
 const cached=randomUUID(),cachedStatus=await actor.channel.track({beat:cached},{timeout:1500});
 await deny(await fresh(a),topic(),'fresh old-topic membership');
 const nextActor=await join(b.client,topic(f.b,f.expires+1)),nextWatcher=await join(a.client,topic(f.b,f.expires+1));assert.equal(nextActor.status,'SUBSCRIBED');assert.equal(nextWatcher.status,'SUBSCRIBED');
 const stale=randomUUID();await nextWatcher.channel.track({beat:stale},{timeout:1500});await sleep(300);assert(!has(nextActor.channel,stale));assert(!has(nextWatcher.channel,cached));
 const next=randomUUID();await nextActor.channel.track({beat:next},{timeout:2000});await until(()=>has(nextWatcher.channel,next),'new actor Presence missing');pass('handoff isolates cached old topic, denies fresh old joins and old-actor writes, admits only new actor on exact new deadline');
 write(path+'presence-hosted-proof.json',JSON.stringify({passed:true,checks,cachedOldTrackStatus:cachedStatus,scope:'authenticated hosted private Realtime; isolated synthetic matches; no customer gameplay or finances'},null,2));
}finally{await Promise.all(extras.map(c=>c.removeAllChannels()));await auth.close();}
