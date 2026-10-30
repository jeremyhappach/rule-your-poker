import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15407',out='qualification.local/async-combined',errors=[],checks=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'no-preference'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/pulse');
 const alex=page.frameLocator('iframe[title="Alex active board"]'),blair=page.frameLocator('iframe[title="Blair waiting card"]');
 const pulse=blair.locator('.delayed-turn-status:has(.delayed-playing)');
 await expect(alex.getByRole('button',{name:'C, 3 points'})).toBeEnabled();
 await expect(blair.locator('.delayed-playing')).toHaveText('Playing now');
 await expect(blair.getByRole('link',{name:'Take Turn'})).toHaveCount(0);
 const frames=page.frames().filter(f=>f!==page.mainFrame());
 const identities=[];
 for(const frame of frames){const state=await frame.evaluate(async()=>{const v=new URLSearchParams(location.search).get('viewer');const r=await fetch('/preview/api',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Viewer':v},body:JSON.stringify({name:'delayed_words_snapshot'})});const s=await r.json();return {viewer:s.viewerId,actor:s.activePlayerId,canAct:s.canAct,revision:s.revision,finished:s.finished,hidden:document.hidden};});identities.push(state);}
 assert.deepEqual(identities.map(s=>[s.viewer,s.actor,s.canAct,s.hidden]),[['a','a',true,false],['b','a',false,false]]);
 checks.push('one visible page: Alex active, Blair waiting, exact viewer identities; initial pulse requires no actions');
 const samples=[];
 for(let i=0;i<9;i++){samples.push(await pulse.evaluate(e=>{const c=getComputedStyle(e);return {bounds:JSON.stringify(e.getBoundingClientRect().toJSON()),border:c.borderColor,background:c.backgroundColor,shadow:c.boxShadow,animation:c.animationName,duration:c.animationDuration,time:e.getAnimations()[0]?.currentTime};}));await page.waitForTimeout(430);}
 assert(samples.every(s=>s.animation==='delayed-playing-pulse'&&s.duration==='3s'));assert(new Set(samples.map(s=>s.background)).size>4);assert(samples.at(-1).time>samples[0].time+3000);assert.equal(new Set(samples.map(s=>s.bounds)).size,1);assert(new Set(samples.map(s=>s.border)).size>4);await expect(pulse.locator('strong')).toHaveCSS('animation-name','none');
 await page.screenshot({path:out+'/isolated-pulse-visible.png'});
 checks.push('real CSS pulse advances across a complete 3-second cycle; rendered background changes over time');
 const rejected=await context.request.post(base+'/preview/api',{headers:{'X-Preview-Viewer':'a'},data:{name:'delayed_words_action',args:{p_action:'pass'}}});assert.equal(rejected.status(),400);
 for(let i=0;i<3;i++){await page.reload();await expect(blair.locator('.delayed-playing')).toHaveCount(1);await expect(blair.getByRole('link',{name:'Take Turn'})).toHaveCount(0);}
 const second=await context.newPage();await second.goto(base+'/pulse');await expect(second.frameLocator('iframe[title="Blair waiting card"]').locator('.delayed-playing')).toHaveCount(1);await second.close();
 checks.push('turn-changing action rejected; three reloads and repeat opening retain Alex turn and restore real presence');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(pulse).toHaveCSS('animation-name','none');await expect(blair.locator('.delayed-playing')).toHaveCount(1);await expect(page.locator('#motion')).toContainText('Reduced motion is enabled');
 checks.push('reduced-motion preference remains static and is explicitly explained');
 assert.deepEqual(errors,[]);writeFileSync(out+'/isolated-pulse.json',JSON.stringify({passed:true,checks,identities,samples,errors,scope:'actual components and CSS in two visible iframe documents; isolated local HTTP/SSE only; no hosted Realtime'},null,2));console.log(JSON.stringify({passed:true,checks,sampleColors:samples.map(s=>s.background)}));
}finally{await browser.close();}
