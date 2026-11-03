import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync as write} from 'node:fs';
import {login,origin,dir} from './hosted-support.mjs';
const a=await login(),g=a.f.live[0],e={passed:false,checks:[],errors:[]};let browser;const pages=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [i,c] of a.clients.slice(0,2).entries()){
  const ctx=await browser.newContext({viewport:i?{width:1280,height:900}:{width:390,height:844},isMobile:i===0,hasTouch:i===0});
  await ctx.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),c.session);
  const p=await ctx.newPage();pages.push(p);p.on('pageerror',error=>e.errors.push(error.message));
  await p.goto(origin+'/game/'+g.id,{waitUntil:'domcontentloaded'});await p.locator('.mega-competition-summary').waitFor({timeout:45000});
  await p.locator('.mega-competition-summary').click();await p.getByRole('region',{name:'Hole-by-hole scores'}).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.screenshot({path:dir+'hosted-live-'+i+'.png'});
 }
 e.checks.push('two authenticated clients render the canonical live table, leaderboard and expandable scorecard');
 await pages[0].reload({waitUntil:'domcontentloaded'});await pages[0].locator('.mega-competition-summary').waitFor({timeout:30000});
 e.checks.push('live reconnect restores the current table');
 await pages[0].getByText('Session Ended',{exact:true}).first().waitFor({timeout:180000});
 await pages[0].screenshot({path:dir+'hosted-live-ended.png'});e.checks.push('connected client retains terminal presentation and enters Session Ended');
 await pages[0].reload({waitUntil:'domcontentloaded'});await pages[0].waitForURL(origin+'/',{timeout:30000});e.checks.push('fresh ended-session mount routes to lobby');
 assert.deepEqual(e.errors,[]);e.passed=true;
}catch(error){e.error=error.message;e.pages=await Promise.all(pages.map(async p=>({url:p.url(),body:(await p.locator('body').innerText()).slice(0,3000)})));console.error(error.stack);process.exitCode=1;}
finally{if(browser)await browser.close();await a.close();write(dir+'hosted-live-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
