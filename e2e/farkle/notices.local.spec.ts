import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {farkleCommittedHolds} from '../../src/lib/farkle/presentation';
import {createClient} from '@supabase/supabase-js';
import {cleanLocalFarkleGame} from './localDatabase';

// Qualification-only harness. Uses the actual client and normal authoritative RPCs.
test('HOT DICE and FARKLE are visible for their canonical lifetime on both clients',async({browser},info)=>{
 const cfg=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
 if(cfg.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated API required');
 const accounts=JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json','utf8'));
 const api=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));let gameId:string|undefined;
 const stages:any[]=[];const coverage={partial:false,rollN:false,hot:false,farkle:false,remote:false,history:false};
 try{
  for(const [i,p] of pages.entries()){
   await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
   await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  }
  await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];
  await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  await pages[0].locator('[data-start-game-btn]').click();let dealer=pages[0];
  await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75_000}).toBe(true);
  await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  await dealer.getByLabel('Stake',{exact:true}).fill('2');await dealer.getByLabel('Target Score',{exact:true}).fill('10000');await dealer.getByLabel('Endgame',{exact:true}).selectOption('one_last_turn');
  await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
  await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  const read=async()=>{
   const r=await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id',gameId!).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
   const p=await api.from('players').select('id,user_id,position,chips').eq('game_id',gameId!);if(p.error)throw p.error;
   return {round:r.data,state:r.data.farkle_state as any,players:p.data};
  };
  for(const page of pages)await page.evaluate(()=>{
   const w=window as any;w.farkleNoticeProof={active:{},visible:{}};
   const sample=()=>{
    const now=performance.timeOrigin+performance.now(),utc=new Date().toISOString(),log=w.farkleNoticeProof;
    const root=document.querySelector('[data-farkle-scope]') as any;
    let fiber=root&&root[Object.keys(root).find(k=>k.startsWith('__reactFiber'))!];
    for(let n=0;fiber&&n<100;n++,fiber=fiber.return){
     const value=fiber.memoizedProps?.value;
     if(value&&typeof value.emit==='function'&&'transient' in value){
      const event=value.active;
      if(event?.type==='gameplay_notice'&&event.id.startsWith('farkle/')&&!log.active[event.id])log.active[event.id]={utc,event:{id:event.id,type:event.type,payload:event.payload,ttlMs:event.ttlMs,scope:event.scope}};
      break;
     }
    }
    const visibleIds=new Set<string>();
    for(const node of document.querySelectorAll<HTMLElement>('[data-canonical-announcement-content][data-canonical-announcement-type="gameplay_notice"]')){
     const id=node.dataset.canonicalAnnouncementId;if(!id?.startsWith('farkle/'))continue;
     const rect=node.getBoundingClientRect();
     if(!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||rect.width<=0||rect.height<=0)continue;
     visibleIds.add(id);
     const frame=log.visible[id]??(log.visible[id]={id,text:node.textContent?.trim(),firstMs:now,firstUtc:utc,samples:0});
     frame.lastMs=now;frame.lastUtc=utc;frame.samples++;
    }
    for(const [id,value]of Object.entries(log.visible) as [string,any][])if(!visibleIds.has(id)&&!value.endedMs){value.endedMs=now;value.endedUtc=utc;value.durationMs=now-value.firstMs;}
    requestAnimationFrame(sample);
   };requestAnimationFrame(sample);
  });
  let snap=await read();const covered=new Set<string>();
  const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];
  for(let n=0;n<160&&covered.size<2;n++){
   const before=snap.state,actor=pageFor(before.currentTurnPlayerId);
   if(before.stage==='hold'){
    const hold=[...before.legalHolds].sort((a:any,b:any)=>b.indexes.length-a.indexes.length||b.points-a.points)[0];
    for(const index of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${index}"]`).click();
    await actor.getByRole('button',{name:/^Hold Dice/}).click();
   }else await actor.getByRole('button',{name:'Roll '+before.available.length,exact:true}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
   const event=snap.state.events.find((e:any)=>e.type==='hot_dice'||e.type==='farkle');if(!event)continue;
   const label=event.type==='hot_dice'?'HOT DICE':'FARKLE';
   const id=`farkle/${gameId}/${snap.round.dealer_game_id}/${snap.round.hand_number}/${snap.round.id}/${snap.state.actionSequence}/${event.type}`;
   const clientEvidence=await Promise.all(pages.map(async(page,client)=>{
    await expect.poll(()=>page.evaluate(id=>!!(window as any).farkleNoticeProof.visible[id]?.endedMs,id)).toBe(true);
    const evidence=await page.evaluate(id=>({active:(window as any).farkleNoticeProof.active[id],visible:(window as any).farkleNoticeProof.visible[id]}),id);
    expect(evidence.active.event.payload).toEqual({title:label});expect(evidence.active.event.ttlMs).toBe(1600);
    expect(evidence.visible.text).toBe(label);expect(evidence.visible.samples).toBeGreaterThan(2);
    // Account for animation-frame observation granularity around the unchanged 1600 ms TTL.
    expect(evidence.visible.durationMs).toBeGreaterThanOrEqual(1400);expect(evidence.visible.durationMs).toBeLessThan(2200);
    const modulePath='/src/lib/canonicalShell/announcements/renderers.tsx';
    expect(await page.evaluate(async({modulePath,event})=>(await import(modulePath)).renderAnnouncement(event)!==null,{modulePath,event:evidence.active.event})).toBe(true);
    return {client,role:page===actor?'actor':'peer',...evidence};
   }));
   stages.push({kind:'visible-canonical-notice',type:event.type,eventId:id,roundId:snap.round.id,actionSequence:snap.state.actionSequence,state:snap.state,clients:clientEvidence});
   covered.add(event.type);
  }
  expect([...covered].sort()).toEqual(['farkle','hot_dice']);
 }finally{
  fs.writeFileSync(info.outputPath('notice-proof.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),stages},null,2));
  try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
 }
});
