import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),evidence=[];
try{for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])for(const players of [1,2,7]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:5186/dev/royal-flash/layout.html?players=${players}`);await page.locator('.royal-grid button').last().waitFor();
 const geometry=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {board:box(document.querySelector('.royal-plane')),cards:[...document.querySelectorAll('.royal-grid button')].map(box),controls:[...document.querySelectorAll('.royal-controls,.royal-clock,.royal-score-band')].map(box),scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};});
 assert.deepEqual(errors,[]);assert.equal(geometry.scroll,false,'no page scroll');assert.equal(geometry.cards.length,25);
 for(const b of [...geometry.cards,...geometry.controls])assert.ok(b.x>=-.5&&b.right<=width+.5&&b.y>=-.5&&b.bottom<=height+.5,`fit ${width} ${players}`);
 for(const c of geometry.cards)assert.ok(c.h/c.w>1.4&&c.h/c.w<1.6,'fixed card ratio');
 await page.screenshot({path:`qualification.local/royal-flash/${width}-${players}.png`});evidence.push({width,height,players,...geometry});await page.close();
}writeFileSync('qualification.local/royal-flash/layout.json',JSON.stringify(evidence));console.log('12 layouts passed');}finally{await browser.close();}
