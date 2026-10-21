// Explicitly scoped hosted qualification. Existing credentials stay in memory.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const dealer='35f06ec6-f3bd-4227-a284-305df895d476';
const game='2eac8320-cc06-4535-b7e9-6e5486e045db';
assert(process.argv.includes('--run-installed-fixture'),'Explicit fixture execution required');
const env=Object.fromEntries(readFileSync('C:/Users/jerem/source/repos/rule-your-poker/.env.e2e.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
const html=await fetch('https://holm357.com').then(r=>r.text());
const script=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(script,'Production script required');
const scriptUrl=new URL(script,'https://holm357.com');assert.equal(scriptUrl.origin,'https://holm357.com');
const bundle=await fetch(scriptUrl).then(r=>r.text());
const url=(bundle.match(/https:\/\/[a-z0-9]+\.supabase\.co/g)||[]).find(u=>new URL(u).hostname==='xvhmbuppghwmwpwrkzao.supabase.co');
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});
assert(url&&key,'Verified production configuration required');
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
const evidence={at:new Date().toISOString(),game,dealer,projectVerified:true,events:[[],[]],statuses:[[],[]],systems:[[],[]]};
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert(!r.error,`${name} rejected (${r.error?.code??'unknown'})`);return r.data};
try {
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env[`PTOWN_E2E_PLAYER${i+1}_EMAIL`],password:env[`PTOWN_E2E_PLAYER${i+1}_PASSWORD`]});assert(!r.error,'Qualification login failed');}
 for(const k of Object.keys(env))delete env[k];
 const caps=await Promise.all(clients.map(c=>rpc(c,'battle31_capabilities',{p_session_id:game})));assert(caps.every(c=>c.enabled===false));
 const views=await Promise.all(clients.map(c=>rpc(c,'battle31_snapshot',{p_dealer_game_id:dealer})));
 for(const v of views){const own=v.players.findIndex(p=>p.id===v.viewerId);assert.deepEqual(v.hands[1-own],[null,null,null]);assert(!('deck' in v));}
 evidence.masking=true;evidence.admissionClosed=true;
 const channels=clients.map((c,i)=>c.channel('battle31-hosted-'+randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'battle31_revisions',filter:'dealer_game_id=eq.'+dealer},p=>evidence.events[i].push({revision:p.new.revision,keys:Object.keys(p.new).sort(),at:Date.now()})).on('system',{},p=>evidence.systems[i].push({status:p.status,message:p.message})));
 await Promise.all(channels.map((ch,i)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscribe deadline')),15000);ch.subscribe(s=>{evidence.statuses[i].push(s);if(s==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){clearTimeout(timer);reject(Error('Realtime subscription failed'));}})})));
 const fresh=await rpc(clients[1],'battle31_snapshot',{p_dealer_game_id:dealer});assert(fresh.canAct,'Fixture actor unavailable');
 const command={p_dealer_game_id:dealer,p_request_id:randomUUID(),p_revision:fresh.revision,p_action:'swap',p_items:[0,2]};
 const started=Date.now();
 const duplicate=await Promise.all([clients[1].rpc('battle31_action',command),clients[1].rpc('battle31_action',command)]);
 assert(duplicate.every(r=>!r.error),'Concurrent duplicate failed');assert(duplicate.every(r=>r.data.revision===fresh.revision+1));
 const next=duplicate[0].data;
 const competing=await Promise.all([clients[0].rpc('battle31_action',{p_dealer_game_id:dealer,p_request_id:randomUUID(),p_revision:next.revision,p_action:'pass'}),clients[0].rpc('battle31_action',{p_dealer_game_id:dealer,p_request_id:randomUUID(),p_revision:next.revision,p_action:'pass'})]);
 assert.equal(competing.filter(r=>!r.error).length,1,'One competing request must win');assert(competing.find(r=>r.error).error.message.includes('stale_revision'));
 const until=Date.now()+10000;while(Date.now()<until&&!evidence.events.every(e=>e.some(r=>r.revision===next.revision)&&e.some(r=>r.revision===next.revision+1)))await new Promise(r=>setTimeout(r,100));
 assert(evidence.events.every(e=>e.some(r=>r.revision===next.revision)&&e.some(r=>r.revision===next.revision+1)),'Both peers must receive both committed revisions');
 evidence.duplicate={responses:2,from:fresh.revision,to:next.revision};evidence.competing={accepted:1,stale:1,to:next.revision+1};evidence.deliveryMs=evidence.events.map(e=>e.find(r=>r.revision===next.revision).at-started);evidence.passed=true;
} catch(error){evidence.passed=false;evidence.failure=error.message;process.exitCode=1;}
finally {
 await Promise.all(clients.map(async c=>{await c.removeAllChannels();await c.auth.signOut({scope:'local'});}));
 evidence.clientsClosedAt=new Date().toISOString();
 writeFileSync('dev/battle31/evidence/hosted-transport.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}
