import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true}),cases=[],errors=[];
mkdirSync('qualification.local/royal-startup',{recursive:true});
try{
 for(const solo of [true,false]){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');
  let delay=true;await page.route('**/__royal/**',async route=>{const body=route.request().postDataJSON();if(delay&&(route.request().url().endsWith('/state')||body?.name==='royal_flash_snapshot')){await new Promise(r=>setTimeout(r,600));}await route.continue();});
  await page.getByRole('button',{name:solo?'Start solo Arcade':'Start two-player table',exact:true}).click();
  await page.getByText('Loading Royal Flash…',{exact:true}).waitFor();assert.equal(await page.locator('[data-fullscreen-game-shell]').count(),1);assert.equal(await page.getByRole('button',{name:'Reconnect',exact:true}).count(),0);delay=false;
  await page.locator('.royal-grid button').first().waitFor();assert.doesNotMatch(await page.locator('.royal-draw').innerText(),/Next card|cards left/i);assert.equal(await page.locator('.royal-draw > small').count(),0);
  const started=Date.now();await page.locator('.royal-grid button').first().click({timeout:7000});await page.getByRole('progressbar',{name:'Round time remaining'}).waitFor();const firstPlacementMs=Date.now()-started;assert(firstPlacementMs<3500);
  const before=await page.locator('.royal-grid button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));await page.evaluate(()=>window.__retainedRoyalBoard=document.querySelector('.royal-grid'));await context.setOffline(true);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await page.getByRole('alert').waitFor();
  assert.deepEqual(await page.locator('.royal-grid button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))),before);assert(await page.evaluate(()=>window.__retainedRoyalBoard===document.querySelector('.royal-grid')));assert.equal(await page.locator('.royal-grid button:disabled').count(),25);assert.equal(await page.locator('[data-fullscreen-game-shell]').count(),1);
  await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.locator('.royal-grid button').nth(1).click({timeout:15000});
  await page.screenshot({path:`qualification.local/royal-startup/${solo?'arcade':'multiplayer'}.png`});
  await page.setViewportSize({width:844,height:390});await page.screenshot({path:`qualification.local/royal-startup/${solo?'arcade':'multiplayer'}-landscape.png`});
  assert.doesNotMatch(await page.locator('.royal-draw').innerText(),/Next card|cards left/i);assert.equal(await page.locator('.royal-draw > small').count(),0);cases.push({mode:solo?'Arcade':'multiplayer',firstPlacementMs,checks:'loading shell; no false reconnect; intro/first placement; no helper text; offline board retention/input lock; recovery; portrait/landscape'});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/royal-startup/evidence.json',JSON.stringify({cases,errors},null,2));console.log(JSON.stringify({cases,errors}));
}finally{await browser.close();}
