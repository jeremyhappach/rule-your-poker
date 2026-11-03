import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync as write,readFileSync as read} from 'node:fs';
import {login,rpc,origin,dir,sleep} from './hosted-support.mjs';
const a=await login(),fixture=JSON.parse(read(dir+'hosted-browser-fixture.json','utf8')),c=a.byUser[fixture.viewer],e={passed:false,checks:[],errors:[]};let browser,p;
try{
 const before=await rpc(c,'delayed_reviews',{p_child:fixture.child}),pending=before.events.filter(x=>x.kind==='attempt'&&!x.seen);assert(pending.length>=2);
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),c.session);
 p=await context.newPage();p.on('pageerror',error=>e.errors.push(error.message));
 await p.goto(origin+'/delayed/'+fixture.match+'/play/'+fixture.child,{waitUntil:'domcontentloaded'});
 await p.getByRole('button',{name:'Skip Animation',exact:true}).waitFor({timeout:45000});
 await p.screenshot({path:dir+'hosted-unfinished-replay.png'});
 await p.reload({waitUntil:'domcontentloaded'});
 const afterReload=await rpc(c,'delayed_reviews',{p_child:fixture.child});assert.equal(afterReload.events.filter(x=>x.kind==='attempt'&&!x.seen).length,pending.length);
 await p.getByRole('button',{name:'Skip Animation',exact:true}).waitFor({timeout:45000});e.checks.push('reload during unfinished replay preserves pending acknowledgement');
 for(const event of pending){
  if(event===pending[0]){
   const deadline=Date.now()+30000;let completed=false;
   while(Date.now()<deadline){const current=await rpc(c,'delayed_reviews',{p_child:fixture.child});if(current.events.find(x=>x.id===event.id).seen){completed=true;break;}await sleep(250);}
   assert(completed,'natural opponent scoring animation must acknowledge its result');
  }else await p.getByRole('button',{name:'Skip Animation',exact:true}).click();
  await p.waitForTimeout(800);
  const seen=await rpc(c,'delayed_reviews',{p_child:fixture.child});assert(seen.events.find(x=>x.id===event.id).seen);
  if(event!==pending.at(-1))await p.getByRole('button',{name:'Skip Animation',exact:true}).waitFor({timeout:15000});
 }
 e.checks.push('multiple unviewed opponent results replay in order; natural animation and Skip Animation both acknowledge results');
 await p.locator('.mega-competition-summary').waitFor({timeout:30000});
 await p.locator('.mega-competition-summary').click();await p.getByRole('region',{name:'Hole-by-hole scores'}).waitFor();
 const home=await rpc(c,'delayed_home',{p_match:fixture.match});assert(home.lineup.find(x=>x.id===fixture.child).holeResults.length>=4);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.equal(await p.getByRole('alert').count(),0);assert(!(await p.locator('body').innerText()).includes('Conflicting turn snapshot'));
 await p.screenshot({path:dir+'hosted-scorecard-mobile.png'});e.checks.push('acknowledged opponent scores enter expandable scorecard without mobile overflow');
 await p.setViewportSize({width:844,height:390});await p.screenshot({path:dir+'hosted-scorecard-landscape.png'});
 assert.deepEqual(e.errors,[]);e.passed=true;
}catch(error){e.error=error.message;if(p){e.url=p.url();e.body=(await p.locator('body').innerText()).slice(0,4000);await p.screenshot({path:dir+'hosted-browser-failure.png'});}console.error(error.stack);process.exitCode=1;}
finally{if(browser)await browser.close();await a.close();write(dir+'hosted-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
