// Explicit approved two-account, fake-money hosted qualification only.
// Credentials stay in memory; evidence never includes tokens or hidden cards.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/six-card-golf/hosted-live-fixture.json','utf8'));
assert.equal(f.real_money,false);
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
const e={at:new Date().toISOString(),game:f.game,events:[[],[]],passed:false};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert(!r.error,name+': '+r.error?.message?.slice(0,160));return r.data;};
const call=(c,v,id,action,items=null)=>c.rpc('golf_action',{p_dealer_game_id:e.dealer,p_round_id:v.identity.roundId,p_request_id:id,p_revision:v.revision,p_action:action,p_items:items});
let byUser={},channels=[];
const snapshot=c=>rpc(c,'golf_snapshot',{p_dealer_game_id:e.dealer});
const privacy=v=>{assert(!('stock'in v));for(const b of Object.values(v.tableaus))b.cards.forEach((card,i)=>{if(!b.exposed[i])assert.equal(card,null);});if(v.pending)assert.equal(v.pending.actor,v.viewerId);};
try{
 for(let i=0;i<2;i++){const r=await clients[i].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+(i+1)+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+(i+1)+'_PASSWORD']});assert(!r.error,'Login failed');assert(f.users.includes(r.data.user.id));byUser[r.data.user.id]=clients[i];}
 assert.equal(Object.keys(byUser).length,2);for(const k of Object.keys(env))delete env[k];
 const caps=await Promise.all(clients.map(c=>rpc(c,'golf_capabilities',{p_session_id:f.game})));assert(caps.every(c=>c.enabled));
 assert((await Promise.all(clients.map(c=>rpc(c,'golf_capabilities',{})))).every(c=>!c.enabled),'Global discovery must remain closed');
 const setup=await rpc(byUser[f.users[0]],'golf_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:4,p_game_type:'six-card-golf',p_config:{ante_amount:5},p_expected_config_deadline:f.offer});
 e.dealer=setup.dealer_game.id;
 write('qualification.local/six-card-golf/hosted-live-identity.json',JSON.stringify({game:f.game,dealer:e.dealer}));
 channels=clients.map((c,i)=>c.channel('golf-qualification-'+uuid()).on('postgres_changes',{event:'*',schema:'public',table:'golf_revisions',filter:'dealer_game_id=eq.'+e.dealer},p=>{e.events[i].push({revision:p.new.revision,keys:Object.keys(p.new).sort(),at:Date.now()});}));
 await Promise.all(channels.map(ch=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Realtime deadline')),15000);ch.subscribe(s=>{if(s==='SUBSCRIBED'){clearTimeout(t);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(s)){clearTimeout(t);reject(Error('Realtime '+s));}})})));
 await rpc(byUser[f.users[1]],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:e.dealer,p_player_id:f.players[1],p_decision:'ante_up'});
 let v=await snapshot(clients[0]);privacy(v);
 assert((await anonymous.rpc('golf_snapshot',{p_dealer_game_id:e.dealer})).error,'Anonymous snapshot denied');
 const privateRead=await clients[0].schema('private').from('golf_matches').select('state').eq('dealer_game_id',e.dealer);assert(privateRead.error,'Raw private state denied');
 let actor=v.players[v.turnIndex],c=byUser[actor.userId],id=uuid();
 const opening=await Promise.all([call(c,v,id,'open',[0,3]),call(c,v,id,'open',[0,3])]);
 assert(opening.every(r=>!r.error));assert.deepEqual(opening[0].data.receipt,opening[1].data.receipt);assert.equal(opening[0].data.revision,v.revision+1);
 assert((await call(c,v,id,'open',[1,4])).error?.message.includes('replay_conflict'));
 v=opening[0].data;actor=v.players[v.turnIndex];c=byUser[actor.userId];
 const competing=await Promise.all([call(c,v,uuid(),'open',[0,3]),call(c,v,uuid(),'open',[0,3])]);
 assert.equal(competing.filter(r=>!r.error).length,1);assert(competing.find(r=>r.error).error.message.includes('stale_revision'));
 v=competing.find(r=>!r.error).data;actor=v.players[v.turnIndex];c=byUser[actor.userId];id=uuid();
 const old={v,id,action:'draw',actor:actor.userId};
 const draw=await call(c,v,id,'draw');assert(!draw.error);const retry=await call(c,v,id,'draw');assert(!retry.error);assert.deepEqual(draw.data.pending,retry.data.pending);e.lostDrawResponse=true;
 old.receipt=draw.data.receipt;v=draw.data;assert(v.pending&&v.pending.card!==null);
 const peer=clients.find(x=>x!==c),peerView=await snapshot(peer);assert.equal(peerView.pending,null);assert.equal(peerView.hasPending,true);privacy(peerView);privacy(v);e.privacy=true;
 const game=await clients[0].from('games').select('pause_version').eq('id',f.game).single();assert(!game.error);
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:e.dealer,p_expected_pause_version:game.data.pause_version});
 const paused=await snapshot(c),control=paused.playerControls[paused.viewerId];
 await rpc(c,'set_automatic_play',{p_game_id:f.game,p_round_id:paused.identity.roundId,p_dealer_game_id:e.dealer,p_player_id:paused.viewerId,p_expected_version:control.intentVersion,p_enabled:true});
 let controls=await snapshot(c);assert(controls.playerControls[controls.viewerId].autoPlay);
 await rpc(c,'golf_reclaim_control',{p_dealer_game_id:e.dealer,p_round_id:controls.identity.roundId,p_expected_version:controls.playerControls[controls.viewerId].intentVersion});
 console.log('Hosted deliberate pause: checking retained private draw across 31 seconds');
 await sleep(31000);
 const held=await snapshot(c);assert(held.paused);assert.deepEqual(held.tableaus,paused.tableaus);assert.deepEqual(held.pending,paused.pending);assert.deepEqual(held.finalQueue,paused.finalQueue);assert.equal(held.consecutiveNoRevealTurns,paused.consecutiveNoRevealTurns);
 const g2=await clients[0].from('games').select('pause_version').eq('id',f.game).single();assert(!g2.error);
 await rpc(byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:e.dealer,p_expected_pause_version:g2.data.pause_version});
 e.deliberatePause=true;e.reclaimPreservedPause=true;v=await snapshot(c);
 // No-reveal choices exercise public warning and the all-participant final queue.
 let warning=false,prolonged=false,moves=0,lastHole=0;
 while(v.phase!=='complete'){
  assert(++moves<650);privacy(v);assert(!v.paused);
  if(v.hole!==lastHole){console.log('Hosted hole '+v.hole);lastHole=v.hole;}
  if(v.phase==='hole_complete'){await sleep(300);v=await snapshot(clients[0]);continue;}
  actor=v.players[v.turnIndex];c=byUser[actor.userId];assert(c);
  v=await snapshot(c);
  let action,items=null;
  if(v.phase==='opening'){action='open';items=[0,3];}
  else if(!v.hasPending)action='draw';
  else if(v.hole===1)action='reject';
  else{action='replace';const i=v.tableaus[actor.id].exposed.findIndex(x=>!x);items=[i<0?0:i];}
  if(v.hole===1&&v.consecutiveNoRevealTurns>=8&&!v.finalReason)warning=true;
  if(v.finalReason==='prolonged_play')prolonged=true;
  if(v.hole===1)assert(Object.values(v.scores).every(s=>s===0),'No concealed current-hole totals');
  const final=v.hole===9&&v.finalQueue.length===1&&action==='replace';
  if(final){
   write('qualification.local/six-card-golf/final-race-ready.json',JSON.stringify({game:f.game,dealer:e.dealer,round:v.identity.roundId,revision:v.revision}));
   console.log('Hosted final race ready');
   const until=Date.now()+15000;while(!existsSync('qualification.local/six-card-golf/final-race-go')&&Date.now()<until)await sleep(100);
   assert(existsSync('qualification.local/six-card-golf/final-race-go'),'Final race coordination required');
   const started=Date.now(),race=await Promise.all([call(c,v,uuid(),action,items),call(c,v,uuid(),action,items)]);
   assert.equal(race.filter(r=>!r.error).length,1);assert(/inactive|stale_revision/.test(race.find(r=>r.error).error.message));
   v=race.find(r=>!r.error).data;e.finalRace={accepted:1,rejected:1,elapsedMs:Date.now()-started};
  }else{const r=await call(c,v,uuid(),action,items);assert(!r.error,r.error?.message);v=r.data;}
 }
 assert(warning&&prolonged);e.prolongedPlay=true;
 assert.equal(v.holes.length,9);assert(v.settlement);assert.equal(Object.values(v.financial.balances).reduce((a,b)=>a+b,0),200);
 e.resultId=v.financial.resultId;e.balances=v.financial.balances;e.batchId=v.financial.batch?.id??null;
 const late=await call(byUser[old.actor],old.v,old.id,old.action);assert(!late.error);assert.deepEqual(late.data.receipt,old.receipt);
 e.moves=moves;e.holes=9;e.completedAt=new Date().toISOString();
 await sleep(4500);assert((await snapshot(clients[0])).finished,'Actual cron terminal continuation');
 e.schedulerTerminalContinuation=true;
 assert(e.events.every(events=>events.length>4));assert(e.events.flat().every(x=>JSON.stringify(x.keys)===JSON.stringify(['dealer_game_id','game_id','revision'])));e.realtime=true;
 e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{
 await Promise.all(clients.map(async c=>{await c.removeAllChannels();await c.auth.signOut({scope:'local'});}));
 e.clientsClosedAt=new Date().toISOString();write('dev/six-card-golf/evidence/hosted-live.json',JSON.stringify(e,null,2));console.log(JSON.stringify({...e,events:e.events.map(x=>x.length)}));
}
