import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {login,origin} from '../canasta/hosted-support.mjs';
const auth=await login(),actor=auth.clients[0],errors=[];let browser;
try {
 const response=await fetch(origin+'/api/arcade',{method:'POST',headers:{Authorization:'Bearer '+actor.token,'Content-Type':'application/json'},body:JSON.stringify({game:'mega-card-golf',op:'catalog'})});
 assert.equal(response.status,200);const catalog=await response.json();assert.equal(catalog.admission,true);assert.equal(catalog.active,null);
 assert.deepEqual(catalog.courses.map(c=>[c.id,c.enabled,c.holes,c.stockAllowance,c.discardAllowance,c.initialExposed,c.completionSeconds]),[['sunny-meadows',true,9,16,5,2,300],['coastal-links',true,9,12,3,2,300],['devils-canyon',true,9,8,1,2,300]]);
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),actor.session);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/arcade/mega-card-golf');
 const start=page.getByRole('button',{name:'Start course'});await start.first().waitFor({timeout:30000});assert.equal(await start.count(),3);
 for(let i=0;i<3;i++)assert.equal(await start.nth(i).isEnabled(),true);
 await page.screenshot({path:'dev/mega-card-golf/evidence/production-courses.png',fullPage:true});assert.deepEqual(errors,[]);
 const evidence={verifiedAt:new Date().toISOString(),admission:true,courses:catalog.courses.map(c=>({id:c.id,enabled:c.enabled})),enabledStartButtons:3,errors,createdRuns:0};
 writeFileSync('dev/mega-card-golf/evidence/activation-browser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} finally {await browser?.close();await auth.close();}
