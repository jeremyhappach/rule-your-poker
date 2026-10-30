import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15403',out='qualification.local/async-combined',checks=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,ignoreDefaultArgs:['--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling']});
try{
 const make=async()=>{const c=await browser.newContext({viewport:{width:540,height:720}});await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p;};
 const a=await make();await a.goto(base+'/delayed/match/play/words?viewer=a&zoom=2&fresh=1');
 const b=await make();await b.goto(base+'/delayed/match?viewer=b');
 await expect.poll(()=>a.evaluate(()=>document.visibilityState)).toBe('visible');
 await expect.poll(()=>b.evaluate(()=>document.visibilityState)).toBe('visible');
 await expect(b.locator('.delayed-playing')).toHaveCount(1);
 assert.equal(await b.locator('.delayed-game-card').last().locator('.delayed-playing').count(),0);
 checks.push('two real browser windows visible: only Alex current child pulses for Blair');
 await b.screenshot({path:out+'/owner-pulse-visible.png'});
 // Automation keeps pages visible even when switching tabs. Exercise the hook's
 // hidden/visible input explicitly; this does not prove native tab occlusion.
 await a.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(b.locator('.delayed-playing')).toHaveCount(0);
 checks.push('simulated document.hidden removes pulse through actual visibility handler');
 await a.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await expect(b.locator('.delayed-playing')).toHaveCount(1);
 checks.push('restoring visible input restores pulse without refresh');
 const tap=async n=>{await a.locator(`[data-square="${n}"]`).click();await a.waitForTimeout(340);};
 await a.getByRole('button',{name:'C, 3 points'}).click();await tap(112);
 await a.getByRole('button',{name:'A, 1 points'}).click();await tap(113);
 await a.getByRole('button',{name:'T, 1 points'}).click();
 await a.getByRole('button',{name:'Submit Word'}).click();
 await expect(b.locator('.delayed-game-card').first().getByRole('link',{name:'Take Turn'})).toBeVisible();
 await expect(b.locator('.delayed-playing')).toHaveCount(0);
 await expect(b.locator('.delayed-game-card').first().locator('[data-pending="true"]')).toHaveText('—');
 assert.equal(new URL(b.url()).pathname,'/delayed/match');
 checks.push('Alex submission updates Blair first card to Take Turn and clears pulse, with score masked and no navigation');
 await b.screenshot({path:out+'/owner-pulse-handoff.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/owner-pulse.json',JSON.stringify({passed:true,checks,errors,scope:'headed Edge two-window pulse/handoff; simulated hidden input (automation did not hide tabs); local synthetic HTTP/SSE, not hosted Realtime'},null,2));
 console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
