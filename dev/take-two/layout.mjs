import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),evidence=[];
try{for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])for(const players of [1,2,7]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5187/dev/take-two/layout.html?players=${players}&stage=3`);await page.locator('.take-tableau button').last().waitFor();
 const geometry=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {cabinet:box(document.querySelector('.take-cabinet')),cards:[...document.querySelectorAll('.take-tableau [data-playing-card-root]')].map(box),controls:[...document.querySelectorAll('.take-stock,.take-current,.take-bank')].map(box),scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};});
 assert.deepEqual(errors,[]);assert.equal(geometry.scroll,false);assert.equal(geometry.cards.length,33);
 for(const b of [...geometry.cards,...geometry.controls])assert.ok(b.w>0&&b.h>0&&b.x>=-.5&&b.right<=width+.5&&b.y>=-.5&&b.bottom<=height+.5,`fit ${width}/${players}: ${JSON.stringify(b)}`);
 for(const c of geometry.cards)assert.ok(Math.abs(c.h/c.w-1.5)<.02,'card proportions');
 assert.equal(await page.locator('.take-clock i[data-lit=true]').count(),15);
 await page.screenshot({path:`qualification.local/take-two/${width}-${players}.png`});evidence.push({width,height,players,...geometry});await page.close();
}writeFileSync('qualification.local/take-two/layout.json',JSON.stringify(evidence));console.log('12 layouts: 33 cards, timer, controls and fixed proportions passed');}finally{await browser.close();}
