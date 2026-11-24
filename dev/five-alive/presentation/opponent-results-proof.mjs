import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';
const {server,url}=await startPreview(),origin=new URL(url).origin;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
try{
 await page.request.post(origin+'/fixture/demo?case=opponent');await page.goto(url+'?mode=async&player=a&demo=opponent');
 await page.getByRole('button',{name:'Play opponent result'}).click();
 await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));
 await page.evaluate(()=>{
  window.samples=[];window.monitor=true;
  function sample(){const board=document.querySelector('[aria-label="Guess board"]'),revealing=!!document.querySelector('[data-reveal]');
   if(board)window.samples.push({revealing,letters:board.textContent,label:document.querySelector('.five-alive-review-label')?.textContent});
   if(window.monitor)requestAnimationFrame(sample);
  }requestAnimationFrame(sample);
 });
 await page.waitForFunction(()=>!!document.querySelector('.five-alive-review-label')&&!document.querySelector('[data-reveal]'),{},{timeout:30000});
 const samples=await page.evaluate(()=>{window.monitor=false;return window.samples;});
 assert.ok(samples.filter(s=>s.revealing).length>50);
 for(const s of samples.filter(s=>s.revealing)){assert.equal(s.letters,'');assert.ok(!/Opponent: (3 guesses|Failed)/.test(s.label));}
 const rows=await page.locator('.five-alive-row').evaluateAll(rows=>rows.map(r=>({letters:r.textContent,colors:[...r.querySelectorAll('[data-color]')].map(t=>t.dataset.color)})));
 assert.equal(rows[0].letters,'');assert.deepEqual(rows[0].colors,['present','present','present','absent','absent']);
 assert.equal(rows[1].letters,'');assert.equal(rows[2].letters,'APPLE');assert.deepEqual(rows[2].colors,Array(5).fill('correct'));
 assert.ok(rows[1].colors.includes('present')||rows[1].colors.includes('correct'));
 mkdirSync('qualification.local/opponent-results',{recursive:true});
 for(const width of [320,390,1000]){await page.setViewportSize({width,height:844});await page.screenshot({path:'qualification.local/opponent-results/five-alive-'+width+'.png'});}
 assert.deepEqual(errors,[]);
 writeFileSync('qualification.local/opponent-results/browser.json',JSON.stringify({passed:true,frames:samples.length,rows,errors},null,2));
 console.log(JSON.stringify({passed:true,frames:samples.length,rows,errors}));
}finally{
 await browser.close();server.httpServer?.closeAllConnections();await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,1000))]);
}
process.exit(0);

