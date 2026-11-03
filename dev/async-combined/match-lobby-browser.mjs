// Loopback-only presentation proof; no production RPCs, pushes or financial writes.
import {chromium,expect} from '@playwright/test';
import {createReviewServer} from './review-server.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const baseline=process.argv.includes('--baseline'),out=resolve('qualification.local/async-lobby');
mkdirSync(out,{recursive:true});
const server=await createReviewServer({port:15433,preview:true,cacheDir:'node_modules/.vite-match-lobby'});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const requests=[],errors=[],metrics=[];let enabled=false,realMoney=true,longNames=false;
const at=Date.now(),players=()=>[{id:'me',name:longNames?'Alexandria Verylong Playername':'Hap'},{id:'other',name:longNames?'Christopher Anotherlong Playername':'mcru81'}];
const child=(id,ordinal,patch)=>({id,ordinal,game:'run21',stake:3,actor:'other',terminal:false,expiresAt:new Date(at+36*3600000).toISOString(),lastCallAt:new Date(at+24*3600000).toISOString(),scores:{me:30000,other:25000},...patch});
function home(){return {id:'match',status:'active',revision:1,organizer:'other',opponent:'me',players:players(),realMoney,net:3,unsettled:6,completed:3,exposure:15,acceptedAt:new Date(at).toISOString(),serverAt:Date.now(),lineup:[
 child('win',1,{terminal:true,viewed:true,result:{winner:'me',delta:3,reason:'normal'}}),
 child('opponent',2,{game:'ptown-words',bagCount:42}),
 child('review',3,{game:'tri-towers',terminal:true,viewed:false,scores:{me:30000,other:null},pendingResults:{other:1},result:null}),
 child('own',4,{game:'boxdrop',actor:'me'}),
 child('tie',5,{game:'quintzee',terminal:true,viewed:true,result:{winner:null,delta:0,reason:'normal'}})
 ]};}
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
  if(url.pathname.endsWith('/dev/async-combined/review-transport.ts'))return route.fulfill({contentType:'text/javascript',body:`
   async function send(body){const r=await fetch('/fixture-review-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();}
   export const delayedRpc=(name,args={})=>send({name,args});export const delayedRequest=send;
   export class DelayedRequestError extends Error{};export const gameName=g=>g;export const signed=String;
   export const supabase={channel:()=>{const c={on:()=>c,subscribe:cb=>{cb?.('SUBSCRIBED');return c;},presenceState:()=>({}),untrack:async()=>{}};return c;},removeChannel:async()=>{}};
  `});
  if(url.pathname!=='/fixture-review-api')return route.continue();
  const body=route.request().postDataJSON();requests.push(body);let result;
  if(body.name==='delayed_home')result=home();
  else if(body.name==='notification_preferences')result={invitations:true,asyncDefault:true,quietEnabled:false};
  else if(body.name==='async_push_preference'){if(body.args.p_enabled!==undefined)enabled=body.args.p_enabled;result=enabled;}
  else if(body.name==='notification_list')result=[];
  else throw Error('Unexpected request '+JSON.stringify(body));
  return route.fulfill({json:result});
 });
 for(const width of baseline?[390]:[390,360,320,430,1024]){
  await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:15433/delayed/match',{waitUntil:'domcontentloaded'});
  await page.locator('.delayed-game-card').first().waitFor({timeout:120000});
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const measurement=await page.evaluate(()=>{
   const info=document.querySelector('.async-match-info')??document.querySelector('.delayed-match-heading');
   return {width:innerWidth,metadataHeight:document.querySelector('.delayed-lineup').getBoundingClientRect().top-info.getBoundingClientRect().top,
    infoHeight:info.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,
    groups:[...document.querySelectorAll('.delayed-game-card')].map(c=>c.dataset.group),
    buttons:[...document.querySelectorAll('.async-completed-toggle,.async-match-info-trigger,[aria-label="Notification details"]')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),
    infoColor:getComputedStyle(info).backgroundColor,cardColor:getComputedStyle(document.querySelector('.delayed-game-card')).backgroundColor};
  });metrics.push(measurement);assert(!measurement.overflow);
  if(!baseline){assert.deepEqual(measurement.groups,['0','1','2','3','3']);assert.notEqual(measurement.infoColor,measurement.cardColor);assert(measurement.buttons.every(b=>b.height>=44&&b.width>=44));assert.equal(await page.locator('.async-brand-ordinal').count(),0);}
  await page.screenshot({path:resolve(out,`${baseline?'before':'after'}-${width}.png`),fullPage:true});
 }
 if(!baseline){
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Match information'}).click();
  await page.getByRole('dialog').waitFor();assert(await page.getByText('Real Money',{exact:true}).isVisible());assert(await page.getByText('3/5 Complete').isVisible());
  await page.screenshot({path:resolve(out,'info-phone.png'),animations:'disabled'});
  assert.equal(await page.getByRole('dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(40, 59, 80)');
  assert((await page.getByRole('dialog').boundingBox()).width<390);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  const details=page.getByRole('button',{name:'Notification details'});await details.click();assert.equal(await details.getAttribute('aria-expanded'),'true');
  const checkbox=page.getByRole('checkbox',{name:'Enable push notifications for this match'});await checkbox.click();await expect(checkbox).toBeChecked();assert(enabled);assert.equal(await details.getAttribute('aria-expanded'),'true');await details.click();
  const win=page.locator('.async-completed-toggle').nth(0),tie=page.locator('.async-completed-toggle').nth(1);
  await win.click();assert.equal(await win.getAttribute('aria-expanded'),'true');await tie.click();assert.equal(await win.getAttribute('aria-expanded'),'false');assert.equal(await tie.getAttribute('aria-expanded'),'true');
  await page.reload();await win.waitFor();assert.equal(await win.getAttribute('aria-expanded'),'false');assert.equal(await tie.getAttribute('aria-expanded'),'false');await expect(checkbox).toBeChecked();
  assert.equal(await page.getByRole('link',{name:'View Results'}).count(),1);
  longNames=true;realMoney=false;await page.setViewportSize({width:320,height:844});await page.reload();await win.waitFor();assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  await page.getByRole('button',{name:'Match information'}).click();assert(await page.getByText('Fake Money',{exact:true}).isVisible());await page.getByRole('button',{name:'Done'}).click();
  assert(!requests.some(r=>r.name?.includes('ack')||r.op));
 }
 assert.deepEqual(errors,[]);
 writeFileSync(resolve(out,baseline?'before.json':'after.json'),JSON.stringify({metrics,errors,requests:requests.map(r=>r.name),scope:'Synthetic loopback transport; desktop Edge with emulated touch/viewports, not physical devices.'},null,2));
 console.log(JSON.stringify({baseline,metrics,errors},null,2));
}finally{await browser.close();await server.close();}
