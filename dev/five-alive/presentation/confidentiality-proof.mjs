import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';
const {server,url}=await startPreview(),origin=new URL(url).origin;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],evidence=[];
page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const fixture=(path)=>page.request.post(origin+path);
try{
 for(const mode of ['arcade','async']){
  await fixture('/fixture/reset?mode='+mode);await page.goto(url+'?mode='+mode);
  await page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard button:not(:disabled)'));
  await page.evaluate(()=>{
   window.framesSeen=[];window.monitor=true;
   function sample(){const tile=document.querySelector('[data-reveal]');if(tile)window.framesSeen.push({keyboard:!!document.querySelector('.five-alive-keyboard'),finished:document.querySelector('section.five-alive').hasAttribute('data-finished')});if(window.monitor)requestAnimationFrame(sample);}requestAnimationFrame(sample);
  });
  await page.keyboard.type('APPLE');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.framesSeen.length>5);
  await page.waitForFunction(()=>!document.querySelector('[data-reveal]'));
  const frames=await page.evaluate(()=>{window.monitor=false;return window.framesSeen;});
  assert.ok(frames.every(f=>f.keyboard&&!f.finished));evidence.push({mode,revealFrames:frames.length,keyboardPreserved:true});
 }
 await fixture('/fixture/demo?case=opponent');await page.goto(url+'?mode=async&player=a&demo=opponent');
 await page.getByRole('button',{name:'Play opponent result'}).click();
 await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));
 await page.waitForFunction(()=>!document.querySelector('[data-reveal]'));
 const rows=await page.locator('.five-alive-row').evaluateAll(rows=>rows.map(r=>r.textContent));
 assert.ok(!rows.join('').includes('PLANT')&&!rows.join('').includes('TRACE'));
 const state=await page.request.post(origin+'/fixture/request',{data:{mode:'async',player:'a',op:'state'}}).then(r=>r.json());
 assert.deepEqual(state.view.revealed[0].opponent.guesses.map(g=>g.word),['','','APPLE']);
 evidence.push({opponentRowsMasked:true,projection:state.view.revealed[0].opponent.guesses.map(g=>g.word)});
 for(const width of [320,390,1000]){
  await page.setViewportSize({width,height:844});await page.goto(url.replace('index.html','gear.html')+(width===1000?'?desktop=1':''));
  const gear=page.getByRole('button',{name:'Player options'});await gear.waitFor();
  const color=await gear.evaluate(e=>getComputedStyle(e).color);assert.equal(color,'rgb(240, 235, 224)');
  await gear.click();await page.getByRole('menuitem',{name:/Blast This Game/}).click();assert.equal(await page.locator('output').textContent(),'blast');
  await gear.click();await page.getByRole('menuitemcheckbox',{name:'Auto Ante (All)',exact:true}).click();assert.equal(await page.locator('output').textContent(),'auto');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Turn control'}).click();assert.equal(await page.locator('output').textContent(),'turn');
  evidence.push({width,gearColor:color,blast:true,autoAnte:true,turnControl:true});
 }
 await page.goto(url.replace('index.html','gear.html')+'?restricted=1');await page.getByRole('button',{name:'Player options'}).click();assert.equal(await page.getByRole('menuitem',{name:/Blast This Game/}).count(),0);
 assert.deepEqual(errors,[]);mkdirSync('qualification.local/five-alive',{recursive:true});writeFileSync('qualification.local/five-alive/confidentiality-browser.json',JSON.stringify({passed:true,evidence,errors},null,2));console.log(JSON.stringify({passed:true,evidence,errors}));
}catch(error){console.error(error);process.exitCode=1;}
finally{
 // Bound disposal of the local SSE/Vite fixture, including failure paths.
 await Promise.race([(async()=>{await context.close();await browser.close();server.httpServer?.closeAllConnections();await server.close();})(),new Promise(resolve=>setTimeout(resolve,5000))]);
}
process.exit(process.exitCode??0);
