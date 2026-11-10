import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('./evidence/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const paths=JSON.parse(fs.readFileSync(new URL('./approved-paths.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],responses=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',async response=>{if(response.url().endsWith('/__river')){const data=await response.json().catch(()=>null);responses.push({status:response.status(),op:response.request().postDataJSON()?.op,data});}});
try{
 await page.goto('http://127.0.0.1:4319/dev/river-city-run/index.html');
 await page.getByRole('button',{name:'Select The Boat'}).waitFor();
 await page.screenshot({path:new URL('courses.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
 await page.getByRole('button',{name:'Select The Boat'}).click();await page.getByRole('button',{name:'Play',exact:true}).waitFor();
 await page.screenshot({path:new URL('leaderboard.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
 for(const route of ['elevated','ground']){
  const startResponse=page.waitForResponse(r=>r.url().endsWith('/__river')&&r.request().postDataJSON()?.op==='start');
  await page.getByRole('button',{name:/^(Play|Play Again)$/}).click();const run=await(await startResponse).json();
  const frame=page.frameLocator('iframe');await frame.locator('#start').waitFor({state:'hidden'});await frame.locator('#scene').click({position:{x:195,y:500}});
  for(const input of paths[route]){
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,run.startedAt+input.at*1000+40-Date.now())));
   await page.keyboard.press({left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown'}[input.direction]);
   if(await page.locator('.river-error').count()){await page.screenshot({path:new URL('connection-failure.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});throw Error(await page.locator('.river-error').innerText());}
   if(await frame.locator('#official').isVisible())throw Error('Run ended before the planned clear: '+await frame.locator('#officialDetail').textContent());
   if(input.at===20.9||input.at===90.35)await page.screenshot({path:new URL(route+'-'+input.at+'.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }
  await frame.getByRole('button',{name:'Bank & Leave'}).waitFor({state:'visible',timeout:20000});
  await page.screenshot({path:new URL(route+'-arrival.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
  console.log('ARRIVAL',route,(await frame.locator('#hitStatus').textContent()),await frame.locator('#totalScore').textContent());
  if(route==='elevated'){
   await frame.getByRole('button',{name:'Bank & Leave'}).click();
  }else{
   await frame.getByRole('button',{name:'Go Inside'}).click();await frame.locator('#betAmount').waitFor();
   assert.equal(await frame.locator('#betAmount').inputValue(),'0');await frame.locator('#chip250').click();await frame.getByRole('button',{name:'Deal',exact:true}).click();
   await new Promise(resolve=>setTimeout(resolve,2500));await page.screenshot({path:new URL('blackjack.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
   if(await frame.getByRole('button',{name:'Stand',exact:true}).isEnabled())await frame.getByRole('button',{name:'Stand',exact:true}).click();
   await frame.locator('#leaveButton').waitFor({state:'visible',timeout:15000});await frame.locator('#leaveButton').click();
  }
  await frame.locator('#official').waitFor({state:'visible',timeout:15000});console.log('FINAL',route,await frame.locator('#finalScore').textContent());
  await frame.getByRole('button',{name:'Leaderboard →'}).click();await page.getByRole('heading',{name:'The Boat',exact:true}).waitFor();
  for(const name of ['All Time','Last 30 Days']){await page.getByRole('button',{name,exact:true}).click();await new Promise(resolve=>setTimeout(resolve,250));assert.ok((await page.locator('.river-rankings').innerText()).includes('River local'));}
  await page.screenshot({path:new URL(route+'-results.png',dir).pathname.replace(/^\/([A-Z]:)/,'$1')});
  console.log('PASS route / final score / course results',route);
 }
 const failed=responses.filter(r=>r.status!==200);assert.deepEqual(failed,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(new URL('browser.json',dir),JSON.stringify({viewport:{width:390,height:844},errors,responses:responses.map(x=>({status:x.status,op:x.op,id:x.data?.id,revision:x.data?.revision,statusResult:x.data?.status,score:x.data?.score,courseId:x.data?.courseId}))},null,2));
 console.log('PASS browser full routes, Bank & Leave, blackjack exit, both course boards');
}finally{fs.writeFileSync(new URL('transport.local.json',dir),JSON.stringify(responses,null,2));if(errors.length)console.log('ERRORS',errors);await browser.close();}
