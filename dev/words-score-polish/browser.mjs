import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
const out='qualification.local/words-score-polish';mkdirSync(out,{recursive:true});
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':resolve('src')}},server:{host:'127.0.0.1',port:5191}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[],errors=[];
try{
 for(const [width,height] of [[390,844],[320,568],[844,390],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const mode of ['local','opponent','async','replay']){
   await page.goto(`http://127.0.0.1:5191/dev/words-score-polish/?mode=${mode}`);
   await page.locator('.words-grid').waitFor();
   const start=mode==='local'?1000:1980;
   await page.evaluate(t=>window.setWordsTime(t),start+100);
   const sample=()=>page.evaluate(()=>{
    const el=document.querySelector('.words-score-flight'),r=el.getBoundingClientRect(),css=getComputedStyle(el);
    const target=document.querySelector(`[data-score-player="${el.dataset.scoreFlight}"]`).getBoundingClientRect();
    const word=[112,113,114].map(s=>document.querySelector(`[data-square="${s}"]`).getBoundingClientRect());
    return {x:r.x+r.width/2,y:r.y+r.height/2,target:{x:target.x+target.width/2,y:target.y+target.height/2},origin:{x:(word[0].left+word[2].right)/2,y:word[0].y+word[0].height/2},font:parseFloat(css.fontSize),opacity:css.opacity,pointer:css.pointerEvents,visibility:css.visibility};
   });
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.words-score-flight')).visibility==='visible');
   const hold=await sample();assert(Math.abs(hold.x-hold.origin.x)<2&&Math.abs(hold.y-hold.origin.y)<2,'Starts on rendered word');assert(hold.font>=32&&hold.pointer==='none');
   await page.screenshot({path:`${out}/${width}-${mode}-hold.png`});
   await page.evaluate(t=>window.setWordsTime(t),start+1590);
   await page.waitForTimeout(40);const landing=await sample();assert(Math.hypot(landing.x-landing.target.x,landing.y-landing.target.y)<3,'Lands at numeric pill');assert.equal(landing.opacity,'1');assert.equal(landing.font,hold.font);
   await page.evaluate(t=>window.setWordsTime(t),start+1700);assert.equal(await page.locator(`[data-score-player="${mode==='local'?'me':'other'}"] strong`).textContent(),'10');
   report.push({width,height,mode,hold,landing});
  }
  for(const action of ['pass','timeout','exchange']){
   await page.goto(`http://127.0.0.1:5191/dev/words-score-polish/?mode=async&action=${action}`);
   const text=action==='pass'?'mcrew81 passed':action==='timeout'?'mcrew81 timed out':'mcrew81 exchanged 5 tiles';
   await page.getByRole('dialog',{name:text}).waitFor();assert.equal(await page.locator('.words-score-flight').count(),0);
   await page.waitForTimeout(250);await page.screenshot({path:`${out}/${width}-${action}.png`});
   await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
   await page.reload();await page.locator('.words-grid').waitFor();assert.equal(await page.getByRole('dialog').count(),0);
   report.push({width,height,action,text});
  }
  // Read-only audit: sample exposed hit targets, ancestor touch policies and scroll owners.
  const audit=await page.evaluate(()=>{
   const selectors=['.fullscreen-game-toolbar','.words-scores','.words-navigation','.words-viewport','[data-square="0"]','[data-square="14"]','[data-square="112"]','[data-square="210"]','[data-square="224"]','.words-rack button','.words-turn-actions button','.words-status'];
   return selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),chain=[];for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n);chain.push({tag:n.className,touch:c.touchAction,overflow:c.overflowY,scroll:n.scrollHeight>n.clientHeight+1});}return {selector,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className,chain};});
  });report.push({width,height,audit});
  if(width===390){
   const cdp=await context.newCDPSession(page),swipes=[];
   const swipe=async(selector)=>{
    const r=await page.locator(selector).first().boundingBox();const x=r.x+r.width/2,y=r.y+r.height/2;
    const before=await page.locator('.words-grid').evaluate(el=>el.style.transform);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*5,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    swipes.push({selector,before,after:await page.locator('.words-grid').evaluate(el=>el.style.transform),scroll:await page.evaluate(()=>scrollY)});
   };
   for(const selector of ['.words-scores','[data-square="0"]','[data-square="14"]','[data-square="112"]','[data-square="210"]','[data-square="224"]','.words-rack button','.words-status','.words-turn-actions button'])await swipe(selector);
   await page.locator('.words-viewport').press('+');
   for(const selector of ['[data-square="112"]','[data-square="96"]'])await swipe(selector);
   report.push({width,height,swipes});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(`Passed ${report.length} layout, animation, modal and audit cases; zero browser errors.`);
}finally{await browser.close();await server.close();}
