import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
const requests=[];page.on('response',async r=>{if(r.url().endsWith('/__river'))requests.push(await r.json());});
try{
await page.goto('http://127.0.0.1:4319/dev/river-city-run/index.html?tiles');await page.locator('.arcade-banner-art').waitFor();await page.locator('.arcade-banner-art').evaluate(async el=>{await el.decode();});
const box=await page.locator('.arcade-banner-art').boundingBox();assert.ok(Math.abs(box.width/box.height-1466/564)<.02);await page.screenshot({path:'dev/river-city-run/evidence/lobby-tile.png'});
await page.goto('http://127.0.0.1:4319/dev/river-city-run/index.html');await page.getByRole('button',{name:'Select The Boat'}).click();await page.getByRole('button',{name:'Play',exact:true}).click();await page.frameLocator('iframe').locator('#start').waitFor({state:'hidden'});
await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('heading',{name:'The Boat',exact:true}).waitFor();assert.equal(requests.filter(v=>v.status==='abandoned').length,1);console.log('PASS portrait Arcade tile aspect, course navigation, explicit Abandon');
await page.getByRole('button',{name:'Play',exact:true}).click();const frame=page.frameLocator('iframe');await frame.locator('#official').waitFor({state:'visible',timeout:30000});await page.screenshot({path:'dev/river-city-run/evidence/crash.png'});assert.ok(requests.some(v=>v.status==='completed'&&v.road?.resultKind==='crash'));await frame.getByRole('button',{name:'Leaderboard →'}).click();await page.getByRole('heading',{name:'The Boat',exact:true}).waitFor();console.log('PASS crash-out official result returns to The Boat');
}finally{await browser.close();}
