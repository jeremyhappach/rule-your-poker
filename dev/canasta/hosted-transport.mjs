// Explicit two-account fake-money qualification. No credentials in evidence.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/canasta/hosted-live-fixture.json','utf8'));
assert.equal(f.real_money,false);
const env=Object.fromEntries(read('C:/Users/jerem/source/repos/rule-your-poker/.env.e2e.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
const html=await fetch('https://holm357.com').then(r=>r.text());
const script=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(script);
const scriptUrl=new URL(script,'https://holm357.com');assert.equal(scriptUrl.origin,'https://holm357.com');
const bundle=await fetch(scriptUrl).then(r=>r.text());
const url='https://xvhmbuppghwmwpwrkzao.supabase.co';
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});assert(key);
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
const e={at:new Date().toISOString(),game:f.game,events:[[],[]],passed:false};
const rpc=async(c,n,a)=>{const r=await c.rpc(n,a);assert(!r.error,n+': '+r.error?.message?.slice(0,120));return r.data;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let byUser={};
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error,'Login failed');assert(f.users.includes(r.data.user.id));byUser[r.data.user.id]=clients[i];}
 for(const k of Object.keys(env))delete env[k];assert.equal(Object.keys(byUser).length,2);e.authenticated=true;
 for(const c of clients){assert((await rpc(c,'canasta_capabilities',{p_session_id:f.game})).enabled);assert(!(await rpc(c,'canasta_capabilities',{})).enabled);}
 await Promise.all(clients.map((c,i)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Realtime subscribe deadline')),10000);c.channel('canasta-hosted-'+f.game+'-'+i).on('postgres_changes',{event:'*',schema:'public',table:'canasta_revisions',filter:'game_id=eq.'+f.game},p=>e.events[i].push({keys:Object.keys(p.new).sort(),revision:p.new.revision})).subscribe(s=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve();}if(s==='CHANNEL_ERROR'){clearTimeout(t);reject(Error(s));}});})));e.subscribed=true;
 const setup=await rpc(byUser[f.users[0]],'canasta_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:4,p_game_type:'canasta',p_config:{ante_amount:5},p_expected_config_deadline:f.offer});
 e.dealer=setup.dealer_game.id;write('qualification.local/canasta/hosted-live-match.json',JSON.stringify({...f,dealer:e.dealer}));
 const denied=await clients[0].rpc('canasta_server_load',{p_match:e.dealer,p_user:f.users[0]});assert(denied.error,'Client must not read service-only state');
 const consent=await rpc(byUser[f.users[1]],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:e.dealer,p_player_id:f.players[1],p_decision:'ante_up',p_auto_ante:null,p_auto_ante_runback:null});
 assert.equal(consent.outcome,'accepted');assert.equal(consent.phase.outcome,'advanced');e.freshConsent=true;
 const until=Date.now()+20000;while(Date.now()<until&&!e.events.every(v=>v.some(x=>x.revision>=1)))await sleep(250);
 assert(e.events.every(v=>v.some(x=>x.revision>=1)),'Scheduled initial deal revision must reach both clients');
 assert(e.events.flat().every(x=>JSON.stringify(x.keys)===JSON.stringify(['dealer_game_id','game_id','revision'])),'Only public revision fields');
 e.scheduledInitialDeal=true;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await Promise.all(clients.map(async c=>{await c.removeAllChannels();await c.auth.signOut({scope:'local'});}));mkdirSync('dev/canasta/evidence',{recursive:true});write('dev/canasta/evidence/hosted-transport.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
