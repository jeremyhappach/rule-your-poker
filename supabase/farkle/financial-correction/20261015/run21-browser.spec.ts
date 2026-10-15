import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import WebSocket from 'ws';
import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
pg.types.setTypeParser(20,Number);
const root='qualification.local/farkle-full-stack/';
const status=JSON.parse(fs.readFileSync(root+'status.json','utf8'));
const accounts=JSON.parse(fs.readFileSync(root+'accounts.json','utf8'));
if(status.API_URL!=='http://127.0.0.1:57321'||new URL(status.DB_URL).port!=='57322')throw Error('Local only');
const virtualOrigin='https://xvhmbuppghwmwpwrkzao.supabase.co';
for(const next of ['farkle','run21'])test(`Run21 fullscreen through neutral setup to ${next}`,async({browser},info)=>{
 const db=new pg.Client({connectionString:status.DB_URL});await db.connect();
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const evidence:any={next,virtualOrigin,upstream:status.API_URL,blockedRequests:[],pageErrors:[],networkErrors:[],routes:[],actions:[]};let gameId:string|undefined;
 const read=async()=>({game:(await db.query('select * from games where id=$1',[gameId])).rows[0],match:(await db.query('select * from private.run21_matches where game_id=$1 order by created_at desc limit 1',[gameId])).rows[0],players:(await db.query('select id,user_id,chips,position from players where game_id=$1 order by position',[gameId])).rows});
 const oldSettings=(await db.query("select key,value from system_settings where key in ('harnesses_mode','make_it_take_it')")).rows;
 const oldHarness=(await db.query("select debug_harness from game_defaults where game_type='run21'")).rows[0].debug_harness;
 try{
  await db.query('insert into private.run21_production_release(singleton,qualified) values(true,true) on conflict(singleton) do update set qualified=true');
  await db.query("insert into system_settings(key,value) values('harnesses_mode','{\"enabled\":true}') on conflict(key) do update set value=excluded.value");
  await db.query("update system_settings set value='{\"enabled\":false}' where key='make_it_take_it'");
  await db.query("update game_defaults set debug_harness='always_105' where game_type='run21'");
  for(const [i,p] of pages.entries()){
   await contexts[i].route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin===virtualOrigin){await route.fulfill({response:await route.fetch({url:status.API_URL+u.pathname+u.search})});return;}
    if(['127.0.0.1','localhost'].includes(u.hostname)){await route.continue();return;}
    evidence.blockedRequests.push(u.origin);await route.abort();
   });
   await contexts[i].routeWebSocket('**/*',socket=>{
    const url=new URL(socket.url());
    if(url.hostname!=='xvhmbuppghwmwpwrkzao.supabase.co'){socket.close();return;}
    const upstream=new WebSocket('ws://127.0.0.1:57321'+url.pathname+url.search);const queue:any[]=[];
    socket.onMessage(message=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(message);else queue.push(message);});
    upstream.on('open',()=>queue.splice(0).forEach(message=>upstream.send(message)));
    upstream.on('message',(data,binary)=>socket.send(binary?data as Buffer:data.toString()));
    upstream.on('close',()=>socket.close());upstream.on('error',()=>socket.close());socket.onClose(()=>upstream.close());
   });
   p.on('pageerror',e=>evidence.pageErrors.push(e.message));p.on('framenavigated',f=>{if(f===p.mainFrame())evidence.routes.push({client:i,url:f.url(),at:Date.now()});});
   p.on('response',async r=>{if(r.status()>=400)evidence.networkErrors.push({status:r.status(),url:r.url().split('?')[0],body:(await r.text().catch(()=>'')).slice(0,500)});});
   await p.addInitScript(()=>{const w=window as any;w.__frames=[];let prior='';let shell:Element|null=null;const frame=()=>{const s=document.querySelector('[data-canonical-shell-root]');const v={path:location.pathname,mode:s?.getAttribute('data-shell-presentation-mode'),shell:!!s,replaced:!!shell&&!!s&&shell!==s,hud:document.querySelectorAll('[data-canonical-shell-hud-grid]').length,felts:document.querySelectorAll('[data-canonical-felt-surface]').length,neutral:document.querySelectorAll('[data-canonical-shell-neutral]').length,run21:document.querySelectorAll('[data-run21-live]').length,fullscreen:document.querySelectorAll('[data-fullscreen-game-shell]').length};if(s)shell=s;const key=JSON.stringify(v);if(prior!==key){w.__frames.push({at:Date.now(),...v});prior=key;}requestAnimationFrame(frame);};requestAnimationFrame(frame);});
   await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  }
  await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];evidence.gameId=gameId;
  await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();await pages[0].locator('[data-start-game-btn]').click();
  let dealer=pages[0];
  const findDealer=async()=>{await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75000}).toBe(true);};
  const configure=async(kind:string)=>{await dealer.getByRole('tab',{name:kind==='farkle'?'Dice Games':'Other',exact:true}).click();await dealer.locator(`[data-dealer-game-option="${kind}"]`).click();if(kind==='farkle'){await dealer.getByLabel('Stake',{exact:true}).fill('5');await dealer.getByLabel('Target Score',{exact:true}).fill('100');}else await dealer.locator('#ante-simple').fill('5');await dealer.getByRole('button',{name:kind==='farkle'?'Start Game':'Start Run21',exact:true}).click();if(kind==='farkle')await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();};
  await findDealer();await configure('run21');
  for(const p of pages)await expect(p.locator('[data-fullscreen-game-shell]')).toBeVisible();
  let snapshot=await read();const original=snapshot.match.dealer_game_id;evidence.initial=snapshot;
  for(const [i,p] of pages.entries())await p.screenshot({path:info.outputPath(`fullscreen-client-${i}.png`),fullPage:true});
  for(let step=0;step<120&&!snapshot.match.state?.settlement;step++){
   const state=snapshot.match.state;const round=state?.rounds?.at(-1);const actor=round?.active_player_id;
   if(!actor||round.scorePresentation){await expect.poll(async()=>{snapshot=await read();return snapshot.match.revision;},{timeout:30000}).toBeGreaterThan(snapshot.match.revision);continue;}
   const actorIndex=accounts.findIndex((a:any)=>a.id===snapshot.players.find((p:any)=>p.id===actor)?.user_id);const page=pages[actorIndex];const revision=snapshot.match.revision;
   if(actorIndex===1)await page.getByRole('button',{name:/^Give Up/}).click();
   else {const board=round.boards[actor];const placed=board.columns.flat().length;if(placed>=11)await page.getByRole('button',{name:/^Take Win/}).click();else await page.getByRole('button',{name:new RegExp(`^Place in column ${[0,1,2,3,0,1,2,3,4,4,4][placed]+1},`)}).click();}
   await expect.poll(async()=>{snapshot=await read();return snapshot.match.revision;}).toBeGreaterThan(revision);evidence.actions.push({revision:snapshot.match.revision,round:round.number,actor});
  }
  expect(snapshot.match.state.settlement).toBeTruthy();evidence.settled=snapshot;
  await findDealer();snapshot=await read();evidence.handoff=snapshot;expect(snapshot.game.status).toBe('game_selection');expect(snapshot.game.current_game_uuid).toBeNull();expect(snapshot.match.finished).toBe(true);
  for(const [i,p] of pages.entries()){
   await expect(p.locator('[data-canonical-shell-root]')).toHaveAttribute('data-shell-presentation-mode','table');await expect(p.locator('[data-canonical-felt-surface]')).toHaveCount(1);await expect(p.locator('[data-canonical-shell-hud-grid]')).toHaveCount(1);await expect(p.locator('[data-run21-live]')).toHaveCount(0);await expect(p.locator('[data-fullscreen-game-shell]')).toHaveCount(0);await p.screenshot({path:info.outputPath(`neutral-client-${i}.png`),fullPage:true});
  }
  await configure(next);await expect.poll(async()=>(await read()).game.current_game_uuid).not.toBe(original);
  for(const [i,p] of pages.entries()){await expect(p.locator(next==='run21'?'[data-fullscreen-game-shell]':'[data-farkle-scope]')).toBeVisible();await expect(p.locator('[data-canonical-shell-root]')).toHaveAttribute('data-shell-presentation-mode',next==='run21'?'fullscreen':'table');await p.screenshot({path:info.outputPath(`successor-client-${i}.png`),fullPage:true});}
  evidence.successor=await read();expect(evidence.successor.players).toEqual(snapshot.players);expect(evidence.pageErrors).toEqual([]);expect(evidence.blockedRequests).toEqual([]);
 }finally{
  for(const [i,p] of pages.entries()){evidence['frames'+i]=await p.evaluate(()=>(window as any).__frames).catch(()=>[]);evidence['lastText'+i]=await p.locator('body').innerText().catch(()=>'');await p.screenshot({path:info.outputPath(`last-client-${i}.png`),fullPage:true}).catch(()=>{});}
  fs.writeFileSync(info.outputPath('evidence.json'),JSON.stringify(evidence,null,2));await Promise.all(contexts.map(c=>c.close()));
  for(const setting of oldSettings)await db.query('update system_settings set value=$2 where key=$1',[setting.key,setting.value]);
  if(!oldSettings.some((s:any)=>s.key==='harnesses_mode'))await db.query("delete from system_settings where key='harnesses_mode'");
  await db.query("update game_defaults set debug_harness=$1 where game_type='run21'",[oldHarness]);await db.end();
 }
});
