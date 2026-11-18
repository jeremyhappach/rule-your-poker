import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const base='http://127.0.0.1:5198',output='qualification.local/async-records';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],network=[],cases=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();network.push(url);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{window.recordAnimations=[];document.addEventListener('animationstart',e=>window.recordAnimations.push(e.animationName));});
 await page.goto(base+'/dev/async-records/index.html',{waitUntil:'domcontentloaded',timeout:60000});
 try{await page.getByRole('link',{name:'See Results'}).click();}catch(error){await page.screenshot({path:output+'/failure.png'});console.error(await page.locator('body').innerText());throw error;}
 await page.getByRole('list',{name:'Completed match games'}).waitFor();
 assert.equal(await page.getByLabel('Final game scores').count(),11);
 await page.screenshot({path:output+'/lineup-phone.png',fullPage:true});
 const links=await page.locator('a[href*="&game="]').evaluateAll(elements=>elements.map(a=>({name:a.textContent,path:a.getAttribute('href')})));
 for(const link of links){
  await page.getByRole('link',{name:link.name,exact:true}).click();
  await page.getByRole('region',{name:/completed record/}).waitFor();
  for(const summary of await page.locator('details>summary').all())await summary.click();
  assert.equal(await page.locator('.async-boxing,.async-confetti,.async-winner-overlay,.async-finale').count(),0);
  const game=new URL(page.url()).searchParams.get('game');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,game+' horizontal overflow');
  if(['chess','quintzee','five-alive','run21','tri-towers'].includes(game))await page.screenshot({path:output+'/'+game+'-phone.png',fullPage:true});
  await page.reload();await page.getByRole('region',{name:/completed record/}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.recordAnimations),[]);
  cases.push({game,reload:true,static:true});
  await page.getByRole('link',{name:'← Match record'}).click();await page.getByRole('list',{name:'Completed match games'}).waitFor();
 }
 for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(viewport);await page.getByRole('link',{name:'View completed Quintzee'}).click();
  await page.getByText('Quintzee scores by round').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  cases.push({viewport,quintzee:true});await page.getByRole('link',{name:'← Match record'}).click();
 }
 const calls=await fetch(base+'/fixture/calls').then(r=>r.json());
 assert(calls.every(name=>['calls','delayed_history','delayed_match_record'].includes(name)));
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const evidence={cases,calls,errors,externalRequests:network};writeFileSync(output+'/browser.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({pass:true,games:links.length,layouts:4,readOnlyCalls:calls.length,errors}));
}finally{await browser.close();}
