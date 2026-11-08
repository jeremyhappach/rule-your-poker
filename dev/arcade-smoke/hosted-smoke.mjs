// Read-only production verification through real Auth, API and browser; no gameplay writes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {login,origin} from '../canasta/hosted-support.mjs';
const sha=process.argv[2];assert.match(sha??'',/^[a-f0-9]{40}$/);
const manifests=[];
for(const host of [origin,'https://ptown-poker.vercel.app']){const response=await fetch(host+'/build-manifest.json',{cache:'no-store'});assert.equal(response.status,200);const manifest=await response.json();assert.equal(manifest.buildId,sha);manifests.push({host,sha:manifest.buildId});}
const auth=await login();let browser;
try{
 const c=auth.clients[0],response=await fetch(origin+'/api/arcade',{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({op:'leaderboard',game:'ship-cap-voyage',window:'all',ruleset:null})});
 assert.equal(response.status,200);const leaderboard=await response.json();assert.equal(leaderboard.currentRuleset,'ship-cap-voyage/1');assert.equal(leaderboard.ruleset,'ship-cap-voyage/1');
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(origin+'/arcade',{waitUntil:'domcontentloaded'});
 const info=page.getByRole('button',{name:'Ship Cap Voyage rules and info',exact:true});await info.waitFor();assert.equal(await info.count(),1);
 await page.locator('a[href="/arcade/ship-cap-voyage"]').scrollIntoViewIfNeeded();
 mkdirSync('qualification.local/ship-cap-voyage/production',{recursive:true});await page.screenshot({path:'qualification.local/ship-cap-voyage/production/lobby-390.png'});
 await info.click();const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'How to play',exact:true}).waitFor();
 await dialog.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 await page.screenshot({path:'qualification.local/ship-cap-voyage/production/rules-390.png'});
 await page.keyboard.press('Escape');await page.locator('a[href="/arcade/ship-cap-voyage"]').click();await page.waitForURL('**/arcade/ship-cap-voyage');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Play'&&!b.disabled));
 assert.equal(await page.getByText('Loading scores…',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:'qualification.local/ship-cap-voyage/production/leaderboard-390.png'});
 writeFileSync('qualification.local/ship-cap-voyage/production/receipt.json',JSON.stringify({sha,manifests,ruleset:leaderboard.ruleset,errors,gameplayWrites:0},null,2));
 console.log('PASS: both production aliases, authenticated leaderboard, mobile lobby, one clickable gold Rules target and Play admission; zero gameplay writes.');
}finally{await browser?.close();await auth.close();}
