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
const e={at:new Date().toISOString(),game:f.game,dealer:f.dealer,passed:false},byUser={};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert(!r.error,name+': '+r.error?.message?.slice(0,160));return r.data;};
const waitFile=async(name,ms)=>{const until=Date.now()+ms;while(!existsSync('qualification.local/six-card-golf/'+name)&&Date.now()<until)await sleep(100);assert(existsSync('qualification.local/six-card-golf/'+name),'Missing coordination '+name);};
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error);assert(f.users.includes(r.data.user.id));byUser[r.data.user.id]=clients[i];}
 for(const k of Object.keys(env))delete env[k];
 const snap=()=>rpc(byUser[f.actor],'golf_snapshot',{p_dealer_game_id:f.dealer});
 let v=await snap();assert(v.paused&&v.hole===9&&v.finalQueue.length===1&&!v.hasPending);
 write('qualification.local/six-card-golf/race-armed.json',JSON.stringify({game:f.game,dealer:f.dealer,round:f.round}));
 console.log('Race armed while deliberately paused');
 await waitFile('race-resume-go',120000);
 const g=(await clients[0].from('games').select('pause_version').eq('id',f.game).single()).data;assert(g);
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:f.dealer,p_expected_pause_version:g.pause_version});
 v=await snap();assert(!v.paused);
 write('qualification.local/six-card-golf/race-resumed.json',JSON.stringify({round:f.round,revision:v.revision}));
 console.log('Race resumed and waiting for locked action signal');
 await waitFile('race-actions-go',15000);
 const command=id=>({p_dealer_game_id:f.dealer,p_round_id:f.round,p_request_id:id,p_revision:v.revision,p_action:'discard',p_items:[0]});
 const ids=[uuid(),uuid()],started=Date.now();
 const results=await Promise.all(ids.map(id=>byUser[f.actor].rpc('golf_action',command(id))));
 assert.equal(results.filter(r=>!r.error).length,1);assert(/inactive|stale_revision/.test(results.find(r=>r.error).error.message));
 const accepted=results.findIndex(r=>!r.error),final=results[accepted].data;
 assert.equal(final.holes.length,9);assert(final.settlement);assert.equal(Object.values(final.financial.balances).reduce((a,b)=>a+b,0),200);
 const duplicate=await rpc(byUser[f.actor],'golf_action',command(ids[accepted]));assert.deepEqual(duplicate.receipt,final.receipt);
 e.finalRace={accepted:1,rejected:1,elapsedMs:Date.now()-started};e.resultId=final.financial.resultId;e.balances=final.financial.balances;e.batchId=final.financial.batch?.id??null;
 const replay=()=>rpc(byUser[f.oldActor],'golf_action',{p_dealer_game_id:f.dealer,p_round_id:f.oldRound,p_request_id:f.oldRequest,p_revision:f.oldRevision,p_action:'open',p_items:[0,3]});
 assert.deepEqual((await replay()).receipt,f.oldReceipt);
 await sleep(4500);assert((await snap()).finished);e.actualSchedulerContinuation=true;
 let game;
 for(let i=0;i<30;i++){const r=await clients[0].from('games').select('status,dealer_position,config_deadline,pause_version').eq('id',f.game).single();assert(!r.error);game=r.data;if(game.status==='game_selection')break;await sleep(300);}
 assert.equal(game.status,'game_selection');
 const seats=(await clients[0].from('players').select('id,user_id,position').eq('game_id',f.game)).data;
 const caller=seats.find(p=>p.position===game.dealer_position);assert(caller);
 const next=await rpc(byUser[caller.user_id],'golf_configure',{p_game_id:f.game,p_dealer_player_id:caller.id,p_expected_dealer_position:game.dealer_position,p_game_type:'six-card-golf',p_config:{ante_amount:5},p_expected_config_deadline:game.config_deadline});
 const nextId=next.dealer_game.id;assert.notEqual(nextId,f.dealer);
 const nextBeforeConsent=await byUser[caller.user_id].rpc('golf_snapshot',{p_dealer_game_id:nextId});assert(nextBeforeConsent.error,'Fresh consent must precede match');
 const peer=seats.find(p=>p.id!==caller.id);
 await rpc(byUser[peer.user_id],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:nextId,p_player_id:peer.id,p_decision:'ante_up'});
 const before=await rpc(clients[0],'golf_snapshot',{p_dealer_game_id:nextId});assert.equal(before.hole,1);assert.equal(before.phase,'opening');
 assert.deepEqual((await replay()).receipt,f.oldReceipt);
 const after=await rpc(clients[0],'golf_snapshot',{p_dealer_game_id:nextId});assert.deepEqual({...after,serverAt:0},{...before,serverAt:0});
 const g2=(await clients[0].from('games').select('pause_version').eq('id',f.game).single()).data;
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:nextId,p_expected_pause_version:g2.pause_version});
 e.runBack={dealer:nextId,freshConsent:true,newMatchUnchangedByOldReceipt:true,retainedDeliberatelyPaused:true};
 const zero=JSON.parse(read('qualification.local/six-card-golf/zero-client-result.json','utf8'));
 const outsider=await byUser[f.users[1]].rpc('golf_snapshot',{p_dealer_game_id:zero.dealer_game_id});assert(outsider.error,'Authenticated outsider denied');
 const revisions=await byUser[f.users[1]].from('golf_revisions').select('*').eq('dealer_game_id',zero.dealer_game_id);assert(!revisions.error&&revisions.data.length===0);e.authenticatedOutsiderDenied=true;
 e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));e.clientsClosedAt=new Date().toISOString();write('dev/six-card-golf/evidence/hosted-final-race.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
