// Explicitly scoped hosted qualification. Existing credentials stay in memory.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const dealer=process.env.BATTLE31_HOSTED_FIXTURE_DEALER;
const game=process.env.BATTLE31_HOSTED_FIXTURE_GAME;
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
const late=process.argv.includes('--late-replay');const evidence={at:new Date().toISOString(),game,dealer,lateReplay:late};
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env[`PTOWN_E2E_PLAYER${i+1}_EMAIL`],password:env[`PTOWN_E2E_PLAYER${i+1}_PASSWORD`]});assert(!r.error,'Login failed');}
 for(const k of Object.keys(env))delete env[k];
 const before=await clients[0].rpc('battle31_snapshot',{p_dealer_game_id:dealer});assert(!before.error&&(late?before.data.finished:!before.data.settlement),'Expected fixture phase required');
 const args={p_dealer_game_id:dealer,p_request_id:late?'9d641c3a-2c68-40ac-bb62-76639c7c1bfd':randomUUID(),p_revision:late?0:before.data.revision,p_action:'resign'};
 await new Promise(r=>setTimeout(r,late?25000:3000));const start=Date.now();const results=await Promise.all([clients[0].rpc('battle31_action',args),clients[0].rpc('battle31_action',args)]);
 assert(results.every(r=>!r.error),'Concurrent terminal duplicate rejected');
 assert(results.every(r=>r.data.financial.resultId===results[0].data.financial.resultId),'Result identity mismatch');
 const final=results[0].data;assert.deepEqual(Object.values(final.financial.balances).sort((a,b)=>a-b),[95,105]);
 evidence.passed=true;evidence.elapsedMs=Date.now()-start;evidence.requestId=args.p_request_id;evidence.revisionBefore=args.p_revision;evidence.resultId=final.financial.resultId;evidence.balances=final.financial.balances;evidence.batchId=final.financial.batch.id;evidence.revisions=results.map(r=>r.data.revision);
}catch(error){evidence.passed=false;evidence.failure=error.message;process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));evidence.clientsClosedAt=new Date().toISOString();writeFileSync(late?'dev/battle31/evidence/hosted-late-replay.json':'dev/battle31/evidence/hosted-terminal-race.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));}
