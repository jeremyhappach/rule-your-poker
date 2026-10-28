// Read-only publication check against the completed, approved fake-money fixture.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {chromium} from '@playwright/test';
import {login} from '../canasta/hosted-support.mjs';
const sha=process.argv[2];assert(/^[a-f0-9]{40}$/.test(sha??''));
const fixture=JSON.parse(read('qualification.local/six-card-golf/forward-browser.json','utf8'));assert(fixture.passed);
const origin='https://holm357.com',manifest=await fetch(origin+'/build-manifest.json',{headers:{'Cache-Control':'no-cache'}}).then(r=>r.json());assert.equal(manifest.buildId,sha);
const auth=await login(),e={sha,manifest,passed:false};let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),auth.clients[0].session);
 const p=await context.newPage(),errors=[];p.on('pageerror',x=>errors.push(x.message));await p.goto(origin+'/game/'+fixture.game,{waitUntil:'domcontentloaded'});await p.waitForURL(origin+'/',{timeout:20000});
 assert.equal(await p.locator('[data-golf-position]').count(),0);assert.deepEqual(errors,[]);e.endedReconnectLobby=true;e.passed=true;
}finally{if(browser)await browser.close();await auth.close();write('qualification.local/six-card-golf/forward-production-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
