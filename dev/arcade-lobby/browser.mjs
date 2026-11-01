import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
const out='dev/arcade-lobby/evidence';fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync('dev/lobby-catalog/production-fixture.json','utf8'));
const games=['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf','quintzee'];
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true});
const page=await context.newPage(),errors=[],requests=[];let checks=0;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/arcade',async route=>{
  const q=route.request().postDataJSON();requests.push(q);
  if(q.op!=='leaderboard')throw Error('Unexpected mutation '+q.op);
  const rule=fixture.arcadeRules.filter(r=>r.game===q.game&&r.enabled).at(-1);
  await route.fulfill({json:{currentRuleset:q.game==='quintzee'?'quintzee/1':rule?.id,rows:[],previousBests:[]}});
});
const url='http://127.0.0.1:5191/dev/arcade-lobby/index.html';
try {
for(const [width,height] of [[320,568],[360,800],[375,667],[390,844],[393,852],[430,932],[568,320],[844,390],[768,1024],[1024,768],[1280,800],[1920,1080]]){
  await page.setViewportSize({width,height});await page.goto(url);
  await expect(page.locator('.arcade-banner-art')).toHaveCount(9);
  await page.waitForFunction(()=>[...document.querySelectorAll('.arcade-banner-art')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('.arcade-banner-art').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const geometry=await page.locator('.arcade-banner-tile').evaluateAll(tiles=>tiles.map(tile=>{
    const box=tile.getBoundingClientRect(),button=tile.querySelector('button').getBoundingClientRect(),face=tile.querySelector('.arcade-info-face').getBoundingClientRect();
    return {width:box.width,height:box.height,x:box.x,y:box.y,target:[button.width,button.height],faceInside:face.left>=button.left-1&&face.right<=button.right+1&&face.top>=button.top-1&&face.bottom<=button.bottom+1};
  }));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(geometry[0].y).toBe(geometry[1].y);
  expect(geometry[2].y).toBeGreaterThan(geometry[0].y);
  for(const g of geometry){expect(g.width/g.height).toBeCloseTo(1466/564,1);expect(g.target[0]).toBeGreaterThanOrEqual(44);expect(g.target[1]).toBeGreaterThanOrEqual(44);expect(g.faceInside).toBe(true);}
  await page.screenshot({path:`${out}/arcade-${width}.png`,fullPage:true,scale:'css'});checks++;
}
await page.setViewportSize({width:390,height:844});await page.goto(url);
expect(await page.locator('.arcade-banner-link').evaluateAll(a=>a.map(x=>x.getAttribute('href')))).toEqual(games.map(g=>'/arcade/'+g));checks++;
for(let i=0;i<games.length;i++){
  const info=page.locator('.arcade-info-button--banner').nth(i);
  // Keyboard focus on the full-tile link must never cover the sibling Info target.
  await page.locator('.arcade-banner-link').nth(i).focus();
  await info.locator('.arcade-info-face').tap();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.catalog-rules-copy [role="status"]')).toHaveCount(0);
  await expect(dialog.locator('.catalog-rules-copy p').first()).toBeVisible();
  await expect(dialog.locator('[role="alert"]')).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.keyboard.press('Escape');await expect(info).toBeFocused();
  await page.keyboard.press('Enter');await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(info).toBeFocused();
  await page.keyboard.press('Space');await expect(dialog).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();await expect(info).toBeFocused();
  await page.locator('.arcade-banner-link').nth(i).click({position:{x:20,y:20}});
  expect(new URL(page.url()).pathname).toBe('/arcade/'+games[i]);
  await page.goto(url);checks++;
}
await page.getByRole('link',{name:'Main Lobby'}).focus();
for(let i=0;i<9;i++){
  await page.keyboard.press('Tab');await expect(page.locator('.arcade-banner-link').nth(i)).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('.arcade-info-button--banner').nth(i)).toBeFocused();
}checks++;
await page.setViewportSize({width:320,height:568});await page.evaluate(()=>document.documentElement.style.fontSize='32px');
expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
await page.screenshot({path:out+'/arcade-320-text-200.png',fullPage:true,scale:'css'});checks++;
await page.emulateMedia({forcedColors:'active'});
await page.locator('.arcade-info-button--banner').first().focus();
await page.screenshot({path:out+'/arcade-forced-colors.png',fullPage:true,scale:'css'});checks++;
expect(errors).toEqual([]);
fs.writeFileSync(out+'/results.json',JSON.stringify({checks,errors,games,viewports:12,rulesRequests:requests.length,environment:'Installed Edge, touch emulation at 3x DPR; actual switchboard and Rules dialogs with local read-only adapters; no production writes; physical iPhone acceptance pending'},null,2));
console.log({checks,errors});
} finally {await browser.close();}
