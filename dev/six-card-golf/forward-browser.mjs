// Explicit fresh fake-money release fixture; exercise the actual Game route.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {login,rpc,sleep} from '../canasta/hosted-support.mjs';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/six-card-golf/forward-live-fixture.json','utf8'));assert.equal(f.real_money,false);
const auth=await login(),base='http://127.0.0.1:5199',e={game:f.game,passed:false,errors:[],events:[0,0]},pages=[];let browser,dealer;
try{
 const setup=await rpc(auth.byUser[f.users[0]],'golf_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'six-card-golf',p_config:{ante_amount:5},p_expected_config_deadline:f.offer});
 dealer=setup.dealer_game.id;e.dealer=dealer;
 const prior=await auth.byUser[f.users[0]].client.from('games').select('is_paused,pause_version,status').eq('id',f.game).single();
 if(prior.data?.is_paused&&prior.data.status==='ante_decision')await rpc(auth.byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:dealer,p_expected_pause_version:prior.data.pause_version});
 if(prior.data.status==='ante_decision')await rpc(auth.byUser[f.users[1]],'submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:dealer,p_player_id:f.players[1],p_decision:'ante_up'});
 const active=await auth.byUser[f.users[0]].client.from('games').select('timer_generation,pending_session_end,is_paused,pause_version').eq('id',f.game).single();assert(!active.error);
 if(!active.data.pending_session_end)await rpc(auth.byUser[f.users[0]],'request_session_end',{p_game_id:f.game,p_expected_dealer_game_id:dealer,p_expected_timer_generation:active.data.timer_generation});
 if(!active.data.is_paused)await rpc(auth.byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:dealer,p_expected_pause_version:active.data.pause_version});
 const snap=c=>rpc(c,'golf_snapshot',{p_dealer_game_id:dealer});
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const [i,c] of auth.clients.entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),c.session);
  const page=await context.newPage();pages.push(page);page.on('pageerror',x=>e.errors.push(x.message));await page.goto(base+'/game/'+f.game,{waitUntil:'domcontentloaded'});await page.locator('.golf-local').waitFor({timeout:25000});
  c.client.channel('golf-forward-'+randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'golf_revisions',filter:'dealer_game_id=eq.'+dealer},()=>e.events[i]++).subscribe();
 }
 for(const c of auth.clients){const state=await snap(c);if(state.playerControls[state.viewerId].autoPlay)await rpc(c,'golf_reclaim_control',{p_dealer_game_id:dealer,p_round_id:state.identity.roundId,p_expected_version:state.playerControls[state.viewerId].intentVersion});}
 const paused=await auth.byUser[f.users[0]].client.from('games').select('pause_version').eq('id',f.game).single();
 await rpc(auth.byUser[f.users[0]],'set_game_paused',{p_game_id:f.game,p_paused:false,p_expected_dealer_game_id:dealer,p_expected_pause_version:paused.data.pause_version});
 let v=await snap(auth.clients[0]),lastHole=0,moves=0,duplicate=false;
 while(v.phase!=='complete'){
  assert(moves<500);assert.equal(v.paused,false);
  if(v.hole!==lastHole){lastHole=v.hole;console.log('Hosted Game route hole',v.hole);}
  for(const board of Object.values(v.tableaus))board.cards.forEach((card,i)=>{if(!board.exposed[i])assert.equal(card,null);});
  if(v.phase==='opening')assert.equal(v.discardTop,null);
  if(v.pending)assert.equal(v.pending.actor,v.viewerId);
  if(v.phase==='hole_complete'){await sleep(400);v=await snap(auth.clients[0]);continue;}
  const actor=v.players[v.turnIndex],c=auth.byUser[actor.userId];v=await snap(c);
  const action=v.phase==='opening'?'open':v.hasPending?'replace':'draw';const hidden=v.tableaus[actor.id].exposed.findIndex(x=>!x);
  const args={p_dealer_game_id:dealer,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:action,p_items:action==='open'?[0,3]:action==='replace'?[Math.max(0,hidden)]:null};
  if(!duplicate){const results=await Promise.all([rpc(c,'golf_action',args),rpc(c,'golf_action',args)]);assert.deepEqual(results[0].receipt,results[1].receipt);duplicate=true;v=results[0];}
  else v=await rpc(c,'golf_action',args);
  moves++;
 }
 e.moves=moves;e.holes=v.holes.length;assert.equal(e.holes,9);assert(v.settlement);
 assert(v.terminal.startedAt>=v.presentation.endsAt);assert.equal(v.presentation.endsAt-v.presentation.resultsAt,5000);
 e.settlementBeforePresentationEnd=Date.now()<v.presentation.endsAt;assert(e.settlementBeforePresentationEnd);
 for(const p of pages){await p.locator('[data-session-ended-panel]').waitFor({timeout:Math.max(20000,v.terminal.deadline-Date.now()+15000)});assert.equal(await p.locator('[data-golf-position]').count(),0);}
 e.connectedSessionEnded=true;await pages[0].screenshot({path:'qualification.local/six-card-golf/forward-session-ended.png'});
 await pages[0].reload({waitUntil:'domcontentloaded'});await pages[0].waitForURL(base+'/',{timeout:20000});e.coldReconnectLobby=true;
 assert.deepEqual(e.errors,[]);assert(e.events.every(x=>x>0));e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;if(pages[0])await pages[0].screenshot({path:'qualification.local/six-card-golf/forward-browser-failure.png'}).catch(()=>{});
 if(dealer){const c=auth.byUser[f.users[0]],g=await c.client.from('games').select('pause_version,status,is_paused').eq('id',f.game).single();if(g.data&&!g.data.is_paused&&g.data.status!=='session_ended')await rpc(c,'set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:dealer,p_expected_pause_version:g.data.pause_version}).catch(()=>{});}
}finally{if(browser)await browser.close();await auth.close();write('qualification.local/six-card-golf/forward-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
