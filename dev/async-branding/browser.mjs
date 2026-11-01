import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const out='dev/async-branding/evidence';fs.mkdirSync(out,{recursive:true});
const origin='http://127.0.0.1:5194',url=origin+'/delayed/00000000-0000-4000-8000-000000000003';
const games=['ptown-words','run21','tri-towers','quintzee','boxdrop'];
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});
const errors=[],failures=[],geometry=[];let checks=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))failures.push('External request '+r.url());});
async function load(query=''){
  await page.goto(url+query);await expect(page.locator('.delayed-game-card')).toHaveCount(5);
  await page.locator('.async-brand-logo').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
try{
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[768,1024],[1024,768],[1280,800]]){
  await page.setViewportSize({width,height});await load();
  expect(await page.locator('.async-brand-heading').evaluateAll(nodes=>nodes.map(n=>n.dataset.brand))).toEqual(games);
  const dims=await page.locator('.delayed-game-card').evaluateAll(cards=>cards.map(card=>{const b=card.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
  expect(new Set(dims.map(b=>b.x)).size).toBe(1);
  for(let i=1;i<dims.length;i++)expect(dims[i].y).toBeGreaterThan(dims[i-1].y+dims[i-1].height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.locator('.async-brand-heading button,.async-brand-heading a').count()).toBe(0);
  await page.screenshot({path:`${out}/match-${width}.png`,fullPage:true,scale:'css'});
  if(width===390||width===1280)await page.locator('.delayed-lineup').screenshot({path:`${out}/cards-${width}.png`,scale:'css'});
  await page.locator('.delayed-game-card').first().screenshot({path:`${out}/words-${width}.png`,scale:'css'});
  const baseline=await page.locator('.delayed-game-card').evaluateAll(cards=>cards.map(card=>{
    const header=card.querySelector('.async-brand-heading'),before=card.getBoundingClientRect().height;
    const text=header.querySelector('h3').textContent.replace('ABC',''),stake=header.querySelector('.async-brand-stake').textContent;
    const old=document.createElement('div');old.className='delayed-game-heading';const title=document.createElement('h3');title.textContent=text;const s=document.createElement('span');s.textContent=stake;old.append(title,s);header.replaceWith(old);
    return before-card.getBoundingClientRect().height;
  }));
  geometry.push({width,addedHeight:baseline});for(const delta of baseline)expect(delta).toBeLessThanOrEqual(24);checks++;
}
await page.setViewportSize({width:390,height:844});
for(const state of ['own','opponent','pending','completed','forfeit','held','expired','last-call','resume','invited','live']){
  await load('?state='+state);
  if(state==='own')await expect(page.getByRole('link',{name:'Take Turn',exact:true})).toHaveCount(5);
  if(state==='opponent')await expect(page.getByText('Opponent’s turn',{exact:true})).toHaveCount(5);
  if(state==='pending'){await expect(page.getByRole('link',{name:'View Results',exact:true})).toHaveCount(5);await expect(page.locator('.async-pending')).toHaveCount(5);}
  if(state==='forfeit')await expect(page.getByText(/· Forfeit/)).toHaveCount(5);
  if(state==='held')await expect(page.getByText('On hold',{exact:true})).toHaveCount(5);
  if(state==='expired')await expect(page.getByText('Deadline reached — awaiting server result',{exact:true})).toHaveCount(5);
  if(state==='resume')await expect(page.getByRole('link',{name:'Resume turn'})).toHaveCount(3);
  if(state==='invited')await expect(page.getByRole('button',{name:'Cancel invitation'})).toBeVisible();
  if(state==='live')await expect(page.getByText('Playing now',{exact:true})).toHaveCount(2);
  if(['pending','completed','forfeit','held','expired','invited','opponent'].includes(state))await expect(page.getByRole('link',{name:'Take Turn',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`${out}/state-${state}.png`,fullPage:true,scale:'css'});checks++;
}
await page.setViewportSize({width:320,height:568});await load('?long=1');
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
await page.screenshot({path:out+'/long-names-320.png',fullPage:true,scale:'css'});checks++;
await page.evaluate(()=>document.documentElement.style.fontSize='32px');
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
await page.screenshot({path:out+'/text-200-320.png',fullPage:true,scale:'css'});checks++;
await page.setViewportSize({width:390,height:844});await load('?state=own');
const timer=page.locator('.delayed-turn-status time').first();
await page.evaluate(()=>{const f=window.asyncBrandingFixture,child=f.home.lineup[0];child.stake=12.5;child.scores[f.home.players[0].id]=98765;child.progress[f.home.players[0].id]='Next Round: 3';child.actor=f.home.players[1].id;child.expiresAt=new Date(Date.now()+61_000).toISOString();f.update({});});
await expect(page.locator('.async-brand-stake').first()).toHaveText('Stake $12.5');
await expect(page.locator('.delayed-scoreboard').first()).toContainText('98,765');
await expect(page.locator('.delayed-turn-status').first()).toContainText('Opponent’s turn');
const firstTime=await timer.textContent();await expect(timer).not.toHaveText(firstTime,{timeout:4000});checks++;
await page.getByRole('button',{name:'Notification details',exact:true}).click();
await expect(page.getByText(/Your turn alerts and 24-hour Last Call/)).toBeVisible();checks++;
await load('?state=own');const turn=page.getByRole('link',{name:'Take Turn',exact:true}).first();await turn.focus();await page.keyboard.press('Enter');
await expect(page.getByRole('heading',{name:'Verified existing destination'})).toBeVisible();expect(page.url()).toContain('/play/');checks++;
await load('?state=pending');await page.getByRole('link',{name:'View Results',exact:true}).first().tap();expect(page.url()).toContain('?review=');checks++;
await load('?state=completed');await page.getByRole('link',{name:'View match results',exact:true}).click();expect(page.url()).toContain('?finale=1');checks++;
await page.route('**/*-logo.webp',route=>route.abort());await page.goto(url);
await expect(page.locator('.delayed-game-card')).toHaveCount(5);await expect(page.locator('.async-brand-title[data-loaded]')).toHaveCount(0);
for(const heading of ['Run 21','Tri Towers','Quintzee','Box Drop'])await expect(page.getByRole('heading',{name:new RegExp(heading)})).toBeVisible();
await page.screenshot({path:out+'/image-fallback.png',fullPage:true,scale:'css'});await page.unroute('**/*-logo.webp');checks++;
await page.goto(origin+'/brands');await expect(page.locator('.async-brand-heading')).toHaveCount(10);
await page.locator('.async-brand-logo').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
await page.screenshot({path:out+'/all-ten-prepared.png',fullPage:true,scale:'css'});checks++;
await page.emulateMedia({forcedColors:'active'});
await expect(page.locator('.async-brand-logo').first()).toBeHidden();
await expect(page.getByRole('heading',{name:/Run21/})).toBeVisible();
await page.screenshot({path:out+'/forced-colors.png',fullPage:true,scale:'css'});checks++;
expect(errors).toEqual([]);expect(failures).toEqual([]);
fs.writeFileSync(out+'/results.json',JSON.stringify({checks,errors,failures,geometry,environment:'Installed Edge; real Delayed page, native headers and actions; synthetic read/write adapters on loopback only; destination interception after navigation; no hosted changes or gameplay mutation'},null,2));
console.log({checks,errors,failures,geometry});
}finally{await browser.close();}
