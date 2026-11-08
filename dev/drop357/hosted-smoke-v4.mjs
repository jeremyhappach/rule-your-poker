// Read-only production verification; does not admit or mutate gameplay.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {login,origin} from '../canasta/hosted-support.mjs';
const sha=process.argv[2];assert.match(sha??'',/^[a-f0-9]{40}$/);
const manifests=[];
for(const host of [origin,'https://ptown-poker.vercel.app']){const response=await fetch(host+'/build-manifest.json',{cache:'no-store'});assert.equal(response.status,200);const manifest=await response.json();assert.equal(manifest.buildId,sha);manifests.push({host,sha:manifest.buildId});}
const auth=await login();let browser;
try{const c=auth.clients[0],request=async ruleset=>{const response=await fetch(origin+'/api/arcade',{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({op:'leaderboard',game:'357-drop',window:'all',ruleset})});assert.equal(response.status,200);return response.json();};
 const current=await request(null),original=await request('357-drop/2');assert.equal(current.currentRuleset,'357-drop/4');assert.equal(current.ruleset,'357-drop/4');assert.equal(original.ruleset,'357-drop/2');assert.ok(!current.compatibleRulesets.includes('357-drop/2'));
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/arcade/357-drop');
 await page.getByText('Partial carry playtest · Separate leaderboard',{exact:true}).waitFor();await page.getByRole('button',{name:'357 Drop rules and info',exact:true}).click();
 await page.getByText('Partial carry playtest: twelve permanent placements.',{exact:false}).waitFor();assert.deepEqual(errors,[]);
 mkdirSync('qualification.local/drop357/production',{recursive:true});await page.screenshot({path:'qualification.local/drop357/production/rules-320.png'});
 await page.keyboard.press('Escape');await page.goto(origin+'/arcade');await page.getByRole('link',{name:'Ship Cap Voyage leaderboard'}).waitFor();
 const tileGeometry=await page.locator('.arcade-banner-tile').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,name:n.querySelector('a')?.getAttribute('aria-label')})));assert.ok(tileGeometry.every(t=>Math.abs(t.height-tileGeometry[0].height)<1),JSON.stringify(tileGeometry));
 await page.getByRole('button',{name:'Ship Cap Voyage rules and info',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.screenshot({path:'qualification.local/drop357/production/ship-rules-320.png'});
 writeFileSync('qualification.local/drop357/production/receipt.json',JSON.stringify({sha,manifests,current:current.ruleset,original:original.ruleset,errors,gameplayWrites:0},null,2));console.log('PASS: both production aliases, authenticated isolated leaderboards and mobile playtest rules; zero gameplay writes.');
}finally{await browser?.close();await auth.close();}
