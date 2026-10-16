import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import WebSocket from 'ws';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const base='qualification.local/waiting-flicker/after/';
const status=JSON.parse(fs.readFileSync('qualification.local/farkle-full-stack/status.json'));
const accounts=JSON.parse(fs.readFileSync('qualification.local/farkle-full-stack/accounts.json'));
assert.equal(status.API_URL,'http://127.0.0.1:57321');assert.equal(new URL(status.DB_URL).hostname,'127.0.0.1');assert.equal(new URL(status.DB_URL).port,'57322');
const db=new pg.Client({connectionString:status.DB_URL});await db.connect();
const evidence={productionWrites:0,diagnosticOnlyTransforms:true,upstream:status.API_URL,clients:[],blocked:[],pageErrors:[],phases:[]};
evidence.routines=(await db.query("select n.nspname,p.proname,md5(pg_get_functiondef(p.oid)) hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('get_waiting_start_blocked','waiting_start_is_blocked','begin_session_dealer_selection')")).rows;
assert.equal(evidence.routines.length,3);
const browsers=[],pages=[];let gameId;let delayMs=0;let blockerFault=null;const startRequests=[];
const snapshot=async()=>({at:Date.now(),game:(await db.query('select id,status,current_host,current_game_uuid,pot,is_paused,pending_session_end,session_ended_at from games where id=$1',[gameId])).rows[0],players:(await db.query('select id,user_id,position,status,is_bot,sitting_out,waiting,created_at from players where game_id=$1 order by position',[gameId])).rows,blocked:(await db.query('select private.waiting_start_is_blocked($1) blocked',[gameId])).rows[0].blocked});
try{
 for(let i=0;i<2;i++){
  const browser=await chromium.launch({channel:i?'msedge':'chrome',headless:true});browsers.push(browser);
  const context=await browser.newContext(i?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin==='https://xvhmbuppghwmwpwrkzao.supabase.co'){
    if(u.pathname.endsWith('/begin_session_dealer_selection'))startRequests.push({client:i,at:Date.now()});
    if(blockerFault&&u.pathname.endsWith('/get_waiting_start_blocked')){
     await route.fulfill(blockerFault==='blocked'?{status:200,contentType:'application/json',body:'true'}:{status:503,contentType:'application/json',body:JSON.stringify({message:'Injected read failure'})});return;
    }
    const response=await route.fetch({url:status.API_URL+u.pathname+u.search});
    if(delayMs&&u.pathname.endsWith('/get_waiting_start_blocked'))await new Promise(r=>setTimeout(r,delayMs));
    await route.fulfill({response});return;
   }
   if(['127.0.0.1','localhost'].includes(u.hostname)){await route.continue();return;}
   evidence.blocked.push(u.origin);await route.abort();
  });
  await context.routeWebSocket('**/*',socket=>{
   const u=new URL(socket.url());if(u.hostname!=='xvhmbuppghwmwpwrkzao.supabase.co'){socket.close();return;}
   const upstream=new WebSocket('ws://127.0.0.1:57321'+u.pathname+u.search),queue=[];
   socket.onMessage(m=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(m);else queue.push(m);});
   upstream.on('open',()=>queue.splice(0).forEach(m=>upstream.send(m)));upstream.on('message',(d,b)=>socket.send(b?d:d.toString()));upstream.on('close',()=>socket.close());upstream.on('error',()=>socket.close());socket.onClose(()=>upstream.close());
  });
  const page=await context.newPage();pages.push(page);
  const client={userId:accounts[i].id,browser:i?'Edge mobile 390x844':'Chrome desktop 1440x900',mounts:[],errors:[]};evidence.clients.push(client);
  page.on('pageerror',e=>evidence.pageErrors.push({client:i,message:e.message}));
  page.on('console',m=>{const t=m.text();if(t.startsWith('[CanonicalShellWaitingSurface]'))client.mounts.push({at:Date.now(),text:t});});
  await page.addInitScript(()=>{
   const events=[],frames=[],mutations=[],rpc=[],counts={},refs=new WeakMap();let seq=0,prev='',lastPlayers,lastBoundary,lastSemantic;let lastFrame='',lastMutation='';
   const id=o=>{if(!o)return null;if(!refs.has(o))refs.set(o,++seq);return refs.get(o);};
   const add=(list,x)=>{if(list.length<2500)list.push({at:Date.now(),...x});};
   const projectBoundary=b=>Object.fromEntries(['status','current_game_uuid','pot','is_paused','pending_session_end','session_ended_at'].map(k=>[k,b[k]]));
   const projectPlayers=p=>p.map(x=>Object.fromEntries(['id','user_id','position','status','is_bot','sitting_out','waiting','created_at'].map(k=>[k,x[k]]))).sort((a,b)=>a.id.localeCompare(b.id));
   window.__waitProbe={events,frames,mutations,rpc,counts,event(type,detail){counts[type]=(counts[type]??0)+1;if(['snapshot-publish','announcement-effect','announcement-cleanup','lobby-reset-cleared'].includes(type))add(events,{type,...detail});},render(s){
    counts.renders=(counts.renders??0)+1;
    const semantic=JSON.stringify([projectPlayers(s.players),projectBoundary(s.startBoundary),s.currentHost,s.currentUserId]);
    const data={type:'render',gameId:s.gameId,userId:s.currentUserId,host:s.currentHost,playersRef:id(s.players),boundaryRef:id(s.startBoundary),checkScope:id(s.checkScope),request:s.blockerRead?.request,playersChanged:lastPlayers!==s.players,boundaryChanged:lastBoundary!==s.startBoundary,semanticChanged:lastSemantic!==semantic,start:s.start,hasEnoughPlayers:s.hasEnoughPlayers,canStartGame:s.canStartGame,failed:s.startCheckFailed,blocked:s.blockerRead?.blocked,boundary:projectBoundary(s.startBoundary),players:projectPlayers(s.players)};
    const key=JSON.stringify([data.playersRef,data.boundaryRef,data.checkScope,data.request,data.hasEnoughPlayers,data.canStartGame,data.failed]);
    if(key!==prev){add(events,data);prev=key;}
    lastPlayers=s.players;lastBoundary=s.startBoundary;lastSemantic=semantic;
   }};
   const state=()=>({start:!!document.querySelector('[data-start-game-btn]'),disabled:document.querySelector('[data-start-game-btn]')?.disabled??null,announcement:document.querySelector('[data-canonical-announcement-content]')?.textContent??null,waiting:!!document.querySelector('[data-canonical-shell-waiting-surface]')});
   const frame=()=>{const v=state(),k=JSON.stringify(v);if(k!==lastFrame){add(frames,v);lastFrame=k;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
   new MutationObserver(()=>{const v=state(),k=JSON.stringify(v);if(k!==lastMutation){add(mutations,v);lastMutation=k;}}).observe(document,{subtree:true,childList:true,characterData:true});
   const original=window.fetch.bind(window);window.fetch=async(...args)=>{
    const url=String(args[0]);if(!url.includes('/get_waiting_start_blocked'))return original(...args);
    const entry={start:Date.now()};rpc.push(entry);try{const response=await original(...args);entry.end=Date.now();entry.status=response.status;entry.body=await response.clone().text();return response;}catch(e){entry.end=Date.now();entry.error=String(e);throw e;}
   };
  });
  await page.goto('http://127.0.0.1:5183/auth');await page.locator('#login-email').fill(accounts[i].email);await page.locator('#login-password').fill(accounts[i].password);await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.getByText('Game Lobby',{exact:true}).first().waitFor({timeout:25000});
 }
 await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
 await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
 await pages[0].waitForURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];evidence.gameId=gameId;
 await pages[1].goto(`http://127.0.0.1:5183/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
 await pages[0].locator('[data-start-game-btn]').waitFor({timeout:20000});
 for(const page of pages)await expect(page.locator('[data-canonical-announcement-content]')).toContainText('Ready to Start!');
 evidence.before=await snapshot();evidence.phases.push({name:'natural unchanged waiting',at:Date.now()});
 await new Promise(r=>setTimeout(r,12500));
 evidence.afterNatural=await snapshot();
 delayMs=450;evidence.phases.push({name:'450ms blocker response latency, unchanged authority',at:Date.now()});
 await new Promise(r=>setTimeout(r,7000));
 evidence.afterLatency=await snapshot();
 delayMs=3500;evidence.phases.push({name:'3500ms latency, exceeding refresh cadence',at:Date.now()});
 await new Promise(r=>setTimeout(r,11000));
 evidence.stableEnd=Date.now();
 const stableStart=evidence.phases[0].at;
 for(const [i,page] of pages.entries()){
  const trace=await page.evaluate(()=>window.__waitProbe);
  const frames=trace.frames.filter(f=>f.at>=stableStart&&f.at<evidence.stableEnd);
  const mutations=trace.mutations.filter(f=>f.at>=stableStart&&f.at<evidence.stableEnd);
  const samples=[...frames,...mutations];
  const events=trace.events.filter(f=>f.at>=stableStart&&f.at<evidence.stableEnd);
  const metrics={falseWaitingFrames:samples.filter(f=>f.announcement?.includes('Waiting for Players')).length,missingReadyFrames:samples.filter(f=>!f.announcement?.includes('Ready to Start!')).length,startDisappearances:i?0:samples.filter(f=>!f.start||f.disabled).length,announcementEmits:events.filter(f=>f.type==='announcement-effect').length,announcementCleanups:events.filter(f=>f.type==='announcement-cleanup').length,rpcRechecks:trace.rpc.filter(f=>f.start>=stableStart).length,completedRechecks:trace.rpc.filter(f=>f.start>=stableStart&&f.end).length,renderCount:trace.counts.renders};
  assert.equal(metrics.falseWaitingFrames,0);assert.equal(metrics.startDisappearances,0);assert.equal(metrics.announcementEmits,0);assert.equal(metrics.announcementCleanups,0);assert(metrics.completedRechecks>=8);
  assert.equal(metrics.missingReadyFrames,0);
  await expect(page.locator('[data-canonical-announcement-content]')).toContainText('Ready to Start!');
  await page.screenshot({path:base+`stable-${i}.png`,fullPage:true});
  evidence.clients[i].stableMetrics=metrics;
  evidence.clients[i].stableTrace=trace;
 }
 delayMs=0;
 // The following writes are confined to this disposable loopback session.
 // They change fixture eligibility; no schema, gameplay or financial code changes.
 evidence.checks=[];
 for(const page of pages){await page.reload();await expect(page.locator('[data-canonical-announcement-content]')).toContainText('Ready to Start!',{timeout:20000});}
 await expect(pages[0].locator('[data-start-game-btn]')).toBeVisible();
 await expect(pages[1].locator('[data-start-game-btn]')).toHaveCount(0);
 evidence.checks.push('fresh authenticated reload reconstructs current waiting eligibility and announcement');
 await db.query('update games set current_host=$2 where id=$1',[gameId,accounts[1].id]);
 await expect(pages[0].locator('[data-start-game-btn]')).toHaveCount(0);
 await expect(pages[1].locator('[data-start-game-btn]')).toBeVisible();
 evidence.checks.push('host transfer leaves one authorized starter');
 await db.query('update players set sitting_out=true,waiting=false where game_id=$1 and user_id=$2',[gameId,accounts[0].id]);
 for(const page of pages)await expect(page.locator('[data-start-game-btn]')).toHaveCount(0);
 await pages[0].getByRole('button',{name:'Return to Play',exact:true}).click();
 await expect(pages[1].locator('[data-start-game-btn]')).toBeVisible();
 assert.equal((await snapshot()).players.find(p=>p.user_id===accounts[0].id).waiting,true);
 evidence.checks.push('sit-out revocation and authenticated queued rejoin');
 blockerFault='blocked';
 for(const page of pages)await expect(page.locator('[data-canonical-announcement-content]')).toContainText('Waiting for Players',{timeout:15000});
 await expect(pages[1].locator('[data-start-game-btn]')).toHaveCount(0);
 evidence.checks.push('server blocker response revokes successful proof');
 blockerFault='error';
 for(const page of pages)await expect(page.getByRole('button',{name:'Retry start check',exact:true})).toBeVisible({timeout:15000});
 await expect(pages[1].locator('[data-start-game-btn]')).toHaveCount(0);
 blockerFault=null;
 for(const page of pages)await page.getByRole('button',{name:'Retry start check',exact:true}).click();
 await expect(pages[1].locator('[data-start-game-btn]')).toBeVisible();
 evidence.checks.push('RPC failure fails closed; explicit Retry restores current authority');
 const button=pages[1].locator('[data-start-game-btn]');
 await button.evaluate(el=>{el.click();el.click();});
 await expect.poll(async()=> (await snapshot()).game.status).not.toBe('waiting');
 assert.equal(startRequests.length,1);assert.equal(startRequests[0].client,1);
 evidence.startRequests=startRequests;evidence.afterStart=await snapshot();
 evidence.checks.push('one authorized Start submission after duplicate clicks');
 for(const [i,page] of pages.entries()){
  await expect(page.locator('[data-canonical-shell-waiting-surface]')).toHaveCount(0);
  await expect(page.locator('[data-canonical-announcement-content]')).not.toContainText('Ready to Start!');
  evidence.clients[i].trace=await page.evaluate(()=>window.__waitProbe);
  await page.screenshot({path:base+`client-${i}.png`,fullPage:true});
 }
 evidence.checks.push('waiting announcement retires on actual dealer-selection transition in both browsers');
 assert.deepEqual(evidence.pageErrors,[]);
 assert.deepEqual(evidence.before.game,evidence.afterLatency.game);assert.deepEqual(evidence.before.players,evidence.afterLatency.players);assert.equal(evidence.afterLatency.blocked,false);
 console.log(JSON.stringify({gameId,unchangedAuthority:true,clients:evidence.clients.map(c=>({browser:c.browser,stableMetrics:c.stableMetrics})),checks:evidence.checks,pageErrors:evidence.pageErrors}));
}catch(e){evidence.failure=String(e);console.error(e);process.exitCode=1;
 for(const [i,page] of pages.entries()){evidence.clients[i].trace=await page.evaluate(()=>window.__waitProbe).catch(()=>null);await page.screenshot({path:base+`failure-${i}.png`}).catch(()=>{});}
}finally{
 for(const b of browsers)await b.close();
 if(gameId){await db.query('delete from games where id=$1',[gameId]);evidence.localCleanup=(await db.query('select count(*)::int n from games where id=$1',[gameId])).rows[0].n===0;}
 fs.writeFileSync(base+'evidence.json',JSON.stringify(evidence,null,2));await db.end();
}
