// Explicit approved two-account, fake-money hosted qualification only.
// Credentials stay in memory; evidence never includes tokens or hidden cards.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/six-card-golf/hosted-race-identity.json','utf8'));
assert.equal(f.users.length,2);
const env=Object.fromEntries(read('C:/Users/jerem/source/repos/rule-your-poker/.env.e2e.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
const html=await fetch('https://holm357.com').then(r=>r.text());
const script=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(script);
const scriptUrl=new URL(script,'https://holm357.com');assert.equal(scriptUrl.origin,'https://holm357.com');
const bundle=await fetch(scriptUrl).then(r=>r.text());
const url=(bundle.match(/https:\/\/[a-z0-9]+\.supabase\.co/g)||[]).find(u=>new URL(u).hostname==='xvhmbuppghwmwpwrkzao.supabase.co');
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});
assert(url&&key);
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const e={game:f.game,dealer:f.dealer,passed:false};let c;
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error);if(r.data.user.id===f.oldActor)c=clients[i];}assert(c);
 write('qualification.local/six-card-golf/held-replay-ready','ready');console.log('Held replay ready');
 const until=Date.now()+120000;while(!existsSync('qualification.local/six-card-golf/held-replay-go-2')&&Date.now()<until)await new Promise(r=>setTimeout(r,100));assert(existsSync('qualification.local/six-card-golf/held-replay-go-2'));
 const scheduled=Number(read('qualification.local/six-card-golf/held-replay-go-2','utf8').trim());assert(Number.isFinite(scheduled));await new Promise(r=>setTimeout(r,Math.max(0,scheduled-Date.now())));
 const args={p_dealer_game_id:f.dealer,p_round_id:f.oldRound,p_request_id:f.oldRequest,p_revision:f.oldRevision,p_action:'open',p_items:[0,3]};
 const start=Date.now(),responses=await Promise.all([c.rpc('golf_action',args),c.rpc('golf_action',args)]);
 assert(responses.every(r=>!r.error));responses.forEach(r=>assert.deepEqual(r.data.receipt,f.oldReceipt));
 e.elapsedMs=Date.now()-start;assert(e.elapsedMs>2500,'Real held-lock overlap required');e.receipts=2;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));write('dev/six-card-golf/evidence/hosted-held-replay-2.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
