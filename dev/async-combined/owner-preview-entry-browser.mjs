import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15403',out='qualification.local/async-combined',checks=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 for(const [name,viewport,touch] of [['laptop',{width:1054,height:582},false],['phone',{width:390,height:844},true]]){
  const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/');await expect(page.locator('.words-scroll')).toHaveAttribute('data-zoom','0');
  assert.equal(new URL(page.url()).pathname,'/delayed/match/play/words');assert.equal(await page.locator('.delayed-bell').count(),0);
  assert.equal(await page.getByText('Main lobby · local fixture',{exact:true}).count(),0);assert.equal(await page.locator('[role="gridcell"]').count(),225);
  await expect(page.getByRole('button',{name:'C, 3 points'})).toBeVisible();
  const css=await page.locator('.words-scroll').evaluate(e=>({background:getComputedStyle(e).backgroundColor,height:e.clientHeight}));assert.notEqual(css.background,'rgba(0, 0, 0, 0)');assert(css.height>150);
  const widths=[];
  const click=async()=>{const cell=page.locator('[data-square="112"]');if(touch)await cell.tap();else await cell.click();await page.waitForTimeout(340);};
  for(const level of [0,1,2]){
   if(level)await click();await expect(page.locator('.words-scroll')).toHaveAttribute('data-zoom',String(level));
   widths.push(await page.locator('[data-square="112"]').evaluate(e=>e.getBoundingClientRect().width));
   await page.screenshot({path:`${out}/owner-words-${name}-${level}.png`});
  }
  assert(widths[0]<widths[1]&&widths[1]<widths[2]);assert.equal(widths[2],48);
  for(const level of [1,0]){
   const cell=page.locator('[data-square="112"]');if(touch){await cell.tap();await page.waitForTimeout(80);await cell.tap();}else await cell.dblclick({delay:80});
   await page.waitForTimeout(340);await expect(page.locator('.words-scroll')).toHaveAttribute('data-zoom',String(level));
  }
  for(const level of [0,1,2]){await page.goto(base+`/delayed/match/play/words?viewer=a&zoom=${level}&fresh=1`);await expect(page.locator('.words-scroll')).toHaveAttribute('data-zoom',String(level));await expect(page.getByRole('button',{name:'C, 3 points'})).toBeEnabled();}
  await page.goto(base+'/scenarios');await expect(page.getByRole('heading',{name:'Secondary preview scenarios'})).toBeVisible();
  await page.getByRole('link',{name:'Notification visibility check (test screen)'}).click();await expect(page.getByRole('heading',{name:'Notification visibility check'})).toBeVisible();
  const bell=await page.locator('.delayed-bell').boundingBox();assert(bell.width<=60&&bell.height<=50);await page.screenshot({path:`${out}/owner-secondary-bell-${name}.png`});
  assert.deepEqual(errors,[]);checks.push({name,rootOpensWords:true,widths,singleAndDoubleTaps:true,exactLinks:true,secondaryBell:bell,errors});console.log('PASS',JSON.stringify(checks.at(-1)));await context.close();
 }
 writeFileSync(out+'/owner-preview-entry.json',JSON.stringify({passed:true,checks,scope:'local preview entry only; actual game components unchanged'},null,2));
}finally{await browser.close();}
