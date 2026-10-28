import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];const contexts=[];
try{
 await fetch('http://127.0.0.1:5180/__incident__/control',{method:'POST',body:JSON.stringify({action:'reset'})});
 for(const viewer of ['a','b']){const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:3});contexts.push(context);await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:5180/e2e/incidents/transition.html?viewer=${viewer}&ack=${viewer==='a'?'missing':'yes'}`);}
 const [a,b]=contexts.map(c=>c.pages()[0]);
 await expect(a.getByText('Hap Wins!',{exact:true})).toBeVisible();
 await expect(b.getByText('Hap Wins!',{exact:true})).toBeVisible();
 await expect(a.locator('[data-dealer-selection]')).toBeVisible({timeout:10000});
 await a.getByRole('tab',{name:'Other',exact:true}).click();
 await expect(a.getByRole('button',{name:'TriTowers',exact:true})).toBeVisible();
 await a.getByRole('button',{name:'TriTowers',exact:true}).click();
 await expect(a.locator('[data-tri-towers]')).toHaveAttribute('data-phase','ready',{timeout:10000});
 await expect(b.locator('[data-tri-towers]')).toHaveAttribute('data-phase','ready');
 await expect(a.locator('[data-connected]')).toHaveText('false');
 await expect(a.getByRole('button',{name:/Draw stock/})).toBeDisabled();
 await expect(b.getByRole('button',{name:/Draw stock/})).toBeDisabled();
 // Delayed ACK: authoritative ready is already loaded, but unsafe input stayed shut.
 await a.evaluate(()=>window.__incident.channels[0].status('SUBSCRIBED'));
 await expect(a.locator('[data-connected]')).toHaveText('true');
 await expect(a.getByRole('button',{name:/Draw stock/})).toBeEnabled();
 // Error replacement, then stale callback from disposed channel must not reopen input.
 await a.evaluate(()=>window.__incident.channels[0].status('CHANNEL_ERROR'));
 await expect(a.locator('[data-connected]')).toHaveText('false');
 await a.evaluate(()=>window.__incident.channels[0].status('SUBSCRIBED'));
 await expect(a.locator('[data-connected]')).toHaveText('false');
 await a.evaluate(()=>{window.__incident.ack=true;window.dispatchEvent(new Event('focus'));});
 await expect(a.locator('[data-connected]')).toHaveText('true');
 await a.getByRole('button',{name:/Draw stock/}).click();
 await expect(a.locator('[data-tri-towers]')).toHaveAttribute('data-phase','playing');
 await b.evaluate(()=>{window.__incident.drop=false;window.dispatchEvent(new Event('focus'));});
 await expect(b.locator('[data-tri-towers]')).toHaveAttribute('data-phase','playing');
 await a.screenshot({path:'../incident-visuals/two-client-tri.png'});
 await b.reload();await expect(b.locator('[data-tri-towers]')).toHaveAttribute('data-phase','playing');
 await expect(b.getByRole('button',{name:/Draw stock/})).toBeDisabled();
 const state=await fetch('http://127.0.0.1:5180/__incident__/state').then(r=>r.json());
 expect(state.commands).toHaveLength(1);expect(state.commands[0].viewer).toBe('a');expect(errors).toEqual([]);
 const evidence={cases:['actual Yahtzee winner overlay → actual dealer picker → actual Tri shell/board','two clients lost Intro→Ready notification','missing then delayed subscription ACK gates input','channel error, stale callback rejection, focus recovery','one authorized first command','observer refresh without stale command'],commands:state.commands,errors};
 await writeFile('../incident-visuals/two-client-transition.json',JSON.stringify(evidence,null,2));console.log(evidence);
}catch(e){console.error('Browser errors',errors);for(const c of contexts)console.error(await c.pages()[0].locator('body').innerText());throw e;}finally{await browser.close();}
