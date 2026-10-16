import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import WebSocket from 'ws';
import {commitmentFor} from '../../src/lib/run21/shuffle.server';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
pg.types.setTypeParser(20,Number);
const root='qualification.local/farkle-full-stack/';
const status=JSON.parse(fs.readFileSync(root+'status.json','utf8'));
const accounts=JSON.parse(fs.readFileSync(root+'accounts.json','utf8'));
if(status.API_URL!=='http://127.0.0.1:57321'||new URL(status.DB_URL).port!=='57322')throw Error('Local only');
const virtualOrigin='https://xvhmbuppghwmwpwrkzao.supabase.co';
const terminalFaults=process.env.RUN21_TERMINAL_FAULTS==='1';
for(const next of ['run21','farkle'])test(`One Run21 dollar flight per viewer and one continuation to ${next}`,async({browser},info)=>{
 const db=new pg.Client({connectionString:status.DB_URL});await db.connect();
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const evidence:any={next,virtualOrigin,upstream:status.API_URL,blockedRequests:[],pageErrors:[],networkErrors:[],routes:[],actions:[]};let gameId:string|undefined;
 const read=async()=>({game:(await db.query('select * from games where id=$1',[gameId])).rows[0],match:(await db.query('select * from private.run21_matches where game_id=$1 order by created_at desc limit 1',[gameId])).rows[0],players:(await db.query('select id,user_id,chips,position from players where game_id=$1 order by position',[gameId])).rows});
 const oldSettings=(await db.query("select key,value from system_settings where key in ('harnesses_mode','make_it_take_it')")).rows;
 const oldHarness=(await db.query("select debug_harness,ante_amount from game_defaults where game_type='run21'")).rows[0];
 try{
  await db.query('insert into private.run21_production_release(singleton,qualified) values(true,true) on conflict(singleton) do update set qualified=true');
  await db.query("insert into system_settings(key,value) values('harnesses_mode','{\"enabled\":true}') on conflict(key) do update set value=excluded.value");
  await db.query("update system_settings set value=$1 where key='make_it_take_it'",[{enabled:next==='farkle'}]);
  await db.query("update game_defaults set debug_harness='always_105',ante_amount=1 where game_type='run21'");
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
   p.on('response',async r=>{if(new URL(r.url()).pathname.endsWith('/state'))(evidence.stateResponses??=[]).push({client:i,status:r.status()});if(new URL(r.url()).pathname.endsWith('/close'))(evidence.closeResponses??=[]).push({client:i,status:r.status(),at:Date.now()});if(r.status()>=400)evidence.networkErrors.push({status:r.status(),url:r.url().split('?')[0],body:(await r.text().catch(()=>'')).slice(0,500)});});
   await p.addInitScript(()=>{
    const original=window.fetch.bind(window);const w=window as any;w.__run21Streams=[];
    window.fetch=async(...args)=>{const response=await original(...args);
      if(String(args[0]).includes('/events?')){
        const reader=response.clone().body?.getReader();
        if(reader)void (async()=>{let pending='';const decoder=new TextDecoder();try{while(true){
          const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let end;
          while((end=pending.indexOf('\n\n'))>=0){const part=pending.slice(0,end);pending=pending.slice(end+2);
            if(part.startsWith('data: ')){w.__run21Streams.push({at:Date.now(),snapshot:JSON.parse(part.slice(6))});}
          }
        }}catch{} })();
      }return response;
    };
   });
   await p.addInitScript((enabled)=>{
    if(!enabled)return;const original=window.fetch.bind(window),w=window as any;
    w.__terminalFaults={dropped:0,disconnected:0,reordered:0};let disconnected=false;
    window.fetch=async(...args)=>{const response=await original(...args);
      if(!String(args[0]).includes('/events?')||!response.body)return response;
      const reader=response.body.getReader();let prior:string|null=null;
      const body=new ReadableStream({async start(controller){let pending='';const decoder=new TextDecoder(),encoder=new TextEncoder();
        try{while(true){const {done,value}=await reader.read();if(done){controller.close();break;}pending+=decoder.decode(value,{stream:true});let end;
          while((end=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,end);pending=pending.slice(end+2);
            const snapshot=frame.startsWith('data: ')?JSON.parse(frame.slice(6)):null;
            if(snapshot?.view?.settlement){w.__terminalFaults.dropped++;
              if(!disconnected){disconnected=true;w.__terminalFaults.disconnected++;controller.close();await reader.cancel();return;}
              continue;
            }
            controller.enqueue(encoder.encode(frame+'\n\n'));
            if(snapshot&&prior){controller.enqueue(encoder.encode(prior+'\n\n'+frame+'\n\n'));w.__terminalFaults.reordered++;}
            if(snapshot)prior=frame;
          }
        }}catch(e){controller.error(e);}
      },cancel(){void reader.cancel();}});
      return new Response(body,{status:response.status,headers:response.headers});
    };
   },terminalFaults&&i===1);
   await p.addInitScript(()=>{const w=window as any;w.__frames=[];w.__flights=[];w.__arrivals=[];const seen=new WeakSet();const observe=()=>{for(const el of document.querySelectorAll('[data-chip-transport-intent]')){if(!seen.has(el)){seen.add(el);w.__flights.push({id:el.getAttribute('data-chip-transport-intent'),variant:el.getAttribute('data-chip-transport-variant'),text:(el as HTMLElement).innerText,at:Date.now(),keyframes:el.getAnimations({subtree:true}).flatMap((a:any)=>a.effect?.getKeyframes()??[])});}}for(const el of document.querySelectorAll('[data-chip-dest-reaction]')){const seat=el.getAttribute('data-chip-reaction-target');if(!w.__arrivals.includes(seat))w.__arrivals.push(seat);}};new MutationObserver(observe).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-chip-dest-reaction']});let prior='';let shell:Element|null=null;const frame=()=>{const s=document.querySelector('[data-canonical-shell-root]');const v={path:location.pathname,mode:s?.getAttribute('data-shell-presentation-mode'),transition:s?.getAttribute('data-shell-transition'),shell:!!s,replaced:!!shell&&!!s&&shell!==s,hud:document.querySelectorAll('[data-canonical-shell-hud-grid]').length,felts:document.querySelectorAll('[data-canonical-felt-surface]').length,neutral:document.querySelectorAll('[data-canonical-shell-neutral]').length,run21:document.querySelectorAll('[data-run21-live]').length,fullscreen:document.querySelectorAll('[data-fullscreen-game-shell]').length};if(s)shell=s;const key=JSON.stringify(v);if(prior!==key){w.__frames.push({at:Date.now(),...v});prior=key;}requestAnimationFrame(frame);};requestAnimationFrame(frame);});
   await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  }
  await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];evidence.gameId=gameId;
  await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();await pages[0].locator('[data-start-game-btn]').click();
  let dealer=pages[0];
  const findDealer=async()=>{await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75000}).toBe(true);};
  const configure=async(kind:string)=>{await dealer.getByRole('tab',{name:kind==='farkle'?'Dice Games':'Other',exact:true}).click();await dealer.locator(`[data-dealer-game-option="${kind}"]`).click();if(kind==='farkle'){await dealer.getByLabel('Stake',{exact:true}).fill('5');await dealer.getByLabel('Target Score',{exact:true}).fill('100');}else {const stake=dealer.locator('#ante-simple');await expect(stake).toHaveValue('1');}await dealer.getByRole('button',{name:kind==='farkle'?'Start Game':'Start Run21',exact:true}).click();if(kind==='farkle')await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();};
  await findDealer();await configure('run21');
  for(const p of pages)await expect(p.locator('[data-fullscreen-game-shell]')).toBeVisible();
  let snapshot=await read();const original=snapshot.match.dealer_game_id;evidence.initial=snapshot;expect(snapshot.match.stake).toBe(1);
  expect(snapshot.match.deck_version).toBe(2);expect(snapshot.match.state.dealingVersion).toBe(2);
  const reloaded=new Set<string>();
  for(const [i,p] of pages.entries())await p.screenshot({path:info.outputPath(`fullscreen-client-${i}.png`),fullPage:true});
  for(let step=0;step<120&&!snapshot.match.state?.settlement;step++){
   const state=snapshot.match.state;const round=state?.rounds?.at(-1);const actor=round?.active_player_id;
   if(!actor||round.scorePresentation){await expect.poll(async()=>{snapshot=await read();return snapshot.match.revision;},{timeout:30000}).toBeGreaterThan(snapshot.match.revision);continue;}
   const actorIndex=accounts.findIndex((a:any)=>a.id===snapshot.players.find((p:any)=>p.id===actor)?.user_id);const page=pages[actorIndex];const revision=snapshot.match.revision;
   if(!reloaded.has(actor)){
    const frozen=JSON.stringify(round.secret),frames=await page.evaluate(()=>(window as any).__frames);
    await page.reload();await expect(page.locator('[data-fullscreen-game-shell]')).toBeVisible();
    await expect(page.locator('[data-canonical-shell-root]')).toHaveAttribute('data-shell-transition','stable');
    // A reload creates a new document/shell. Exclude its bootstrap from the
    // continuous-document transition recorder; deck stability is checked below.
    await page.evaluate(frames=>(window as any).__frames=frames,frames);
    expect(JSON.stringify((await read()).match.state.rounds.at(-1).secret)).toBe(frozen);reloaded.add(actor);
   }
   const spectator=pages[1-actorIndex];
   await expect(page.locator('[data-run21-turn-state="active"]')).toBeVisible();
   await expect(spectator.locator('[data-run21-turn-state="watching"]')).toBeVisible();
   await expect(spectator.locator('.run21-live-card')).toHaveText(await page.locator('.run21-live-card').innerText(),{useInnerText:true});
   if(actorIndex===1)await page.getByRole('button',{name:/^Give Up/}).click();
   else {const board=round.boards[actor];const placed=board.columns.flat().length;expect(placed).toBeLessThan(11);await page.getByRole('button',{name:new RegExp(`^Place in column ${[0,1,2,3,0,1,2,3,4,4,4][placed]+1},`)}).click();}
   await expect.poll(async()=>{snapshot=await read();return snapshot.match.revision;}).toBeGreaterThan(revision);evidence.actions.push({revision:snapshot.match.revision,round:round.number,actor});
  }
  expect(snapshot.match.state.settlement).toBeTruthy();expect(snapshot.match.finished).toBe(true);expect(snapshot.game.status).toBe('game_selection');evidence.settled=snapshot;
  const receipt=snapshot.match.state.settlement;
  for(const round of snapshot.match.state.rounds){
    expect(Object.keys(round.secret.decks).sort()).toEqual(snapshot.match.state.players.map((p:any)=>p.id).sort());
    for(const player of snapshot.match.state.players){
      const deck=round.secret.decks[player.id];expect(deck.playerId).toBe(player.id);expect(deck.roundId).toBe(round.id);
      expect(new Set(deck.cards.map((c:any)=>c.rank+':'+c.suit)).size).toBe(52);
      expect(deck.commitment).toBe(await commitmentFor(snapshot.match.state.identity,round.id,deck,player.id));
      expect(round.boards[player.id].presented).toEqual(deck.cards.slice(0,round.boards[player.id].presented.length));
    }
    expect(round.boards[receipt.winnerId].result).toMatchObject({reason:'collect',aggregate:105,multiplier:1000});
    expect(round.boards[receipt.winnerId].current).toBeNull();
    expect(round.boards[receipt.winnerId].presented).toHaveLength(11);
  }
  const batches=(await db.query('select * from gameplay_transfer_batches where game_id=$1 and id=$2',[gameId,receipt.transferBatchId])).rows;
  expect(batches).toHaveLength(1);const batch=batches[0];expect(batch.transfers).toHaveLength(1);expect(batch.transfers[0].amount).toBe(1);
  expect(batch.transfers[0].from.playerId).toBe(receipt.loserId);expect(batch.transfers[0].to.playerId).toBe(receipt.winnerId);
  expect(batch.closing_balances['player:'+receipt.winnerId]-batch.opening_balances['player:'+receipt.winnerId]).toBe(1);
  expect(batch.closing_balances['player:'+receipt.loserId]-batch.opening_balances['player:'+receipt.loserId]).toBe(-1);
  evidence.batch=batch;
  await findDealer();for(const p of pages)await expect(p.locator('[data-run21-live]')).toHaveCount(0);snapshot=await read();evidence.handoff=snapshot;
  for(const [i,p] of pages.entries()){
    const flights=await p.evaluate(()=>(window as any).__flights);evidence['flights'+i]=flights;
    expect(flights).toHaveLength(1);expect(flights[0].id).toBe(batch.transfers[0].id);expect(flights[0].text).toBe('$1');expect(flights[0].variant).toBe('canonicalWinTransfer');
    expect(flights[0].keyframes.length).toBeGreaterThan(8);
    const arrivals=await p.evaluate(()=>(window as any).__arrivals);expect(arrivals).toContain(String(snapshot.players.find((x:any)=>x.id===receipt.winnerId).position));evidence['arrival'+i]=arrivals;
  }
  expect((await db.query('select count(*)::int n from private.run21_settlements where dealer_game_id=$1',[original])).rows[0].n).toBe(1);
  expect((await db.query('select count(*)::int n from game_results where dealer_game_id=$1',[original])).rows[0].n).toBe(1);expect(evidence.closeResponses?.some((r:any)=>r.status===200)).toBe(true);expect(new Set(evidence.closeResponses.map((r:any)=>r.client)).size).toBe(evidence.closeResponses.length);expect(snapshot.game.status).toBe('game_selection');expect(snapshot.game.current_game_uuid).toBeNull();expect(snapshot.match.finished).toBe(true);
  for(const [i,p] of pages.entries()){
   await expect(p.locator('[data-canonical-shell-root]')).toHaveAttribute('data-shell-presentation-mode','table');await expect(p.locator('[data-canonical-felt-surface]')).toHaveCount(1);await expect(p.locator('[data-canonical-shell-hud-grid]')).toHaveCount(1);await expect(p.locator('[data-run21-live]')).toHaveCount(0);await expect(p.locator('[data-fullscreen-game-shell]')).toHaveCount(0);await p.screenshot({path:info.outputPath(`neutral-client-${i}.png`),fullPage:true});
  }
  for(const p of pages){const frames=await p.evaluate(()=>(window as any).__frames);const entered=frames.findIndex((f:any)=>f.transition==='outgoing');expect(entered).toBeGreaterThan(-1);expect(frames.slice(entered).every((f:any)=>!f.replaced&&f.felts<=1&&f.fullscreen<=1)).toBe(true);expect(frames.filter((f:any)=>f.transition==='outgoing')).toHaveLength(2);}
  if(terminalFaults){const faults=await pages[1].evaluate(()=>(window as any).__terminalFaults);expect(faults.dropped).toBeGreaterThan(0);expect(faults.disconnected).toBe(1);expect(faults.reordered).toBeGreaterThan(0);expect(evidence.stateResponses?.some((r:any)=>r.client===1&&r.status===200)).toBe(true);evidence.terminalFaults=faults;}
  for(const [i,p] of pages.entries())evidence['terminalStreams'+i]=await p.evaluate(()=>(window as any).__run21Streams);
  await configure(next);await expect.poll(async()=>(await read()).game.current_game_uuid).not.toBe(original);
  for(const [i,p] of pages.entries()){await expect(p.locator(next==='run21'?'[data-fullscreen-game-shell]':'[data-farkle-scope]')).toBeVisible();await expect(p.locator('[data-canonical-shell-root]')).toHaveAttribute('data-shell-presentation-mode',next==='run21'?'fullscreen':'table');await p.screenshot({path:info.outputPath(`successor-client-${i}.png`),fullPage:true});}
  evidence.successor=await read();
  expect((await db.query('select count(*)::int n from private.run21_matches where game_id=$1',[gameId])).rows[0].n).toBe(next==='run21'?2:1);
  expect((await db.query('select count(*)::int n from private.run21_settlements where dealer_game_id=$1',[original])).rows[0].n).toBe(1);
  for(const p of pages){await p.reload();await expect(p.locator(next==='run21'?'[data-fullscreen-game-shell]':'[data-farkle-scope]')).toBeVisible();expect(await p.evaluate(()=>(window as any).__flights)).toEqual([]);}expect(evidence.successor.players).toEqual(snapshot.players);expect(evidence.pageErrors).toEqual([]);expect(evidence.blockedRequests).toEqual([]);
 }finally{
  for(const [i,p] of pages.entries()){
   evidence['streams'+i]=await p.evaluate(()=>(window as any).__run21Streams).catch(()=>[]);
   evidence['frames'+i]=await p.evaluate(()=>(window as any).__frames).catch(()=>[]);
   evidence['lastDocumentFlights'+i]=await p.evaluate(()=>(window as any).__flights).catch(()=>[]);
   evidence['accepted'+i]=await p.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('run21-presentation:')).map(([key,value])=>{const s=JSON.parse(value).snapshot;return {key,revision:s.revision,eventSequence:s.eventSequence,settled:!!s.view.settlement,scorePresentation:s.view.scorePresentation};})).catch(()=>[]);
   evidence['lastText'+i]=await p.locator('body').innerText().catch(()=>'');await p.screenshot({path:info.outputPath(`last-client-${i}.png`),fullPage:true}).catch(()=>{});
  }
  fs.writeFileSync(info.outputPath('evidence.json'),JSON.stringify(evidence,null,2));await Promise.all(contexts.map(c=>c.close()));
  for(const setting of oldSettings)await db.query('update system_settings set value=$2 where key=$1',[setting.key,setting.value]);
  if(!oldSettings.some((s:any)=>s.key==='harnesses_mode'))await db.query("delete from system_settings where key='harnesses_mode'");
  await db.query("update game_defaults set debug_harness=$1,ante_amount=$2 where game_type='run21'",[oldHarness.debug_harness,oldHarness.ante_amount]);await db.end();
 }
});
