import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {verifyApp} from './polish-app-browser.mjs';
// Keep browser and loopback server in the same permission/network context.
const {server}=await import('./polish-preview.mjs');
const origin='http://127.0.0.1:15413',out='qualification.local/tri-polish';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
async function pageFor(width=390,height=844,options={}){
 const page=await browser.newPage({viewport:{width,height},...options}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(/^https?:\/\/(?!127\.0\.0\.1:15413)/,route=>route.abort());
 return {page,errors};
}
const metrics=page=>page.evaluate(()=>window.polishEvidence);
try{
 if(!process.argv.includes('--app-only')){
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,900]]){
  const {page,errors}=await pageFor(width,height);await page.goto(origin);await page.locator('[data-tri-card="0"]').waitFor();
  await page.locator('[data-tri-card="0"]').click();await page.getByLabel('Waste 6 of spades',{exact:true}).waitFor();
  assert.equal(await page.locator('.tri-upcard-flip').evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal(await page.locator('.tri-card-flight').count(),0);
  await page.waitForFunction(()=>window.polishEvidence.starts.length>0,null,{timeout:1500});
  let data=await metrics(page);assert(data.events.some(id=>id.endsWith(':0:1')));assert(data.starts.length>0);
  await page.locator('summary').click();await page.getByRole('button',{name:'Duplicate snapshot',exact:true}).click();
  assert.equal(new Set((await metrics(page)).events.filter(id=>id.startsWith('tri-tower:'))).size,1);
  await page.locator('summary').click();await page.locator('[data-tri-card="1"]').click();await page.getByLabel('Waste 7 of spades',{exact:true}).waitFor();
  await page.locator('[data-tri-card="2"]').click();await page.getByLabel('All three towers cleared').waitFor();
  data=await metrics(page);assert.equal(new Set(data.events.filter(id=>id.startsWith('tri-tower:'))).size,2);assert.equal(data.events.filter(id=>id.startsWith('tri-clear:')).length,1);
  assert.equal(await page.locator('.tri-card-flight').count(),0);await page.screenshot({path:`${out}/tri-${width}x${height}.png`});
  await page.waitForFunction(()=>document.querySelector('[aria-label="You score 45000"]'),{},{timeout:12000});
  assert.equal(await page.getByLabel('All three towers cleared').count(),0);assert.deepEqual(errors,[]);
  results.push({scenario:'three clears and final hold',width,height,...data});await page.close();
 }
 for(const scenario of ['rejection','rapid','reconnect','muted','reduced','history']){
  const {page,errors}=await pageFor(390,844,scenario==='reduced'?{reducedMotion:'reduce'}:{});await page.goto(origin+(scenario==='history'?'/?history=1':''));await page.locator('[data-tri-card="0"]').waitFor();
  if(['rejection','reconnect','muted'].includes(scenario)){
   await page.locator('summary').click();await page.getByRole('button',{name:scenario==='rejection'?'Reject next':scenario==='muted'?'Mute':'Reconnect with two cleared',exact:true}).click();await page.locator('summary').click();
  }
  if(scenario==='rapid'){
   await page.locator('[data-tri-card="0"]').click();await page.locator('[data-tri-card="1"]').click({force:true});await page.locator('[data-tri-card="2"]').click({force:true});
   await page.getByLabel('Waste 8 of spades',{exact:true}).waitFor();assert.equal((await metrics(page)).requests,3);
  }else if(scenario==='reconnect')assert.equal((await metrics(page)).events.filter(id=>id.startsWith('tri-tower:')).length,0);
  else{
   await page.locator('[data-tri-card="0"]').click();
   if(scenario==='rejection'){await page.getByText(/Synthetic action rejected/).waitFor();assert.equal(await page.locator('[data-tri-card="0"]').count(),1);assert.equal((await metrics(page)).events.length,0);}
   else {await page.getByLabel('Waste 6 of spades',{exact:true}).waitFor();assert.equal((await metrics(page)).starts.length,0);}
  }
  assert.deepEqual(errors,[]);results.push({scenario,...await metrics(page)});await page.close();
 }
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,900]]){
  const {page,errors}=await pageFor(width,height);await page.goto(origin+'/?net=1');await page.getByRole('region',{name:'Current Net'}).waitFor();
  const layout=await page.locator('.async-current-net').evaluate(root=>{
   const box=root.getBoundingClientRect();return {height:box.height,width:box.width,overflow:document.documentElement.scrollWidth>innerWidth,rows:[...root.children].map(row=>{
    const [name,amount]=row.children,a=name.getBoundingClientRect(),b=amount.getBoundingClientRect();return {top:a.top,bottom:a.bottom,sameLine:Math.abs(a.top-b.top)<5,noOverlap:a.right<=b.left,text:row.textContent};
   })};
  });assert(!layout.overflow);assert(layout.rows.every(row=>row.sameLine&&row.noOverlap));assert.equal(layout.rows.length,3);assert(layout.height<120);
  assert(layout.rows[1].top>=layout.rows[0].bottom);assert(layout.rows[2].top>=layout.rows[1].bottom);
  await page.screenshot({path:`${out}/net-${width}x${height}.png`});assert.deepEqual(errors,[]);results.push({scenario:'compact net',width,height,...layout});await page.close();
 }
 await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,output:out}));
 }
 await verifyApp(browser,out);
}finally{for(const context of browser.contexts())for(const page of context.pages())console.log('Last preview evidence',await metrics(page).catch(()=>null));await browser.close();if(!process.argv.includes('--serve'))await server.close();}
