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
const e={game:f.game,passed:false},byUser={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=async(c,n,a)=>{const r=await c.rpc(n,a);assert(!r.error,n+': '+r.error?.message);return r.data;};
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error);byUser[r.data.user.id]=clients[i];}
 const prior=JSON.parse(read('dev/six-card-golf/evidence/hosted-final-race.json','utf8'));assert(prior.passed);const d=prior.runBack.dealer;e.dealer=d;
 const g=(await clients[0].from('games').select('pause_version').eq('id',f.game).single()).data;
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:d,p_expected_pause_version:g.pause_version});
 const v=await rpc(clients[0],'golf_snapshot',{p_dealer_game_id:d}),actor=v.players[v.turnIndex],c=byUser[actor.userId];assert(v.phase==='opening');
 console.log('Waiting for genuine whole-turn deadline');
 await sleep(Math.max(0,v.deadline-v.serverAt+50));
 const expired=await c.rpc('golf_action',{p_dealer_game_id:d,p_round_id:v.identity.roundId,p_request_id:uuid(),p_revision:v.revision,p_action:'open',p_items:[0,3]});
 assert(expired.error&&/deadline|stale_revision|inactive/.test(expired.error.message));
 let after;
 for(let i=0;i<20;i++){after=await rpc(c,'golf_snapshot',{p_dealer_game_id:d});if(after.playerControls[actor.id].autoPlay)break;await sleep(250);}
 assert(after.playerControls[actor.id].autoPlay);assert(after.playerControls[actor.id].sitOutNextHand);assert.equal(after.openingRemaining,v.openingRemaining-1);
 await rpc(c,'golf_reclaim_control',{p_dealer_game_id:d,p_round_id:after.identity.roundId,p_expected_version:after.playerControls[actor.id].intentVersion});
 const reclaimed=await rpc(c,'golf_snapshot',{p_dealer_game_id:d});assert(!reclaimed.playerControls[actor.id].autoPlay&&!reclaimed.playerControls[actor.id].sitOutNextHand);
 const g2=(await clients[0].from('games').select('pause_version').eq('id',f.game).single()).data;
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:d,p_expected_pause_version:g2.pause_version});
 e.passed=true;e.expiredActionRejected=true;e.actualSchedulerOneOpening=true;e.reclaimed=true;e.retainedPaused=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));write('dev/six-card-golf/evidence/hosted-timeout.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
