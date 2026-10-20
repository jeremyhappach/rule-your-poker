import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const label=process.argv[2]??'after',dir=`qualification.local/take-two/${label}`;
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)}),samples=[],layouts=[];
const base='http://127.0.0.1:5187';
const post=async(path,body)=>{const r=await fetch(`${base}/__takeTwo/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();};
try {
 if(!process.argv.includes('--actions-only'))for(const [width,height] of [[390,844],[390,664],[393,587],[844,390],[844,300],[320,568],[1440,900]])for(const players of [1,2,7])for(const stage of [1,3]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(`${base}/dev/take-two/layout.html?players=${players}&stage=${stage}`);
  await page.locator('.take-tableau [data-playing-card-root]').last().waitFor();
  await page.waitForTimeout(100);
  const geometry=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {cabinet:box(document.querySelector('.take-cabinet')),tableau:box(document.querySelector('.take-tableau')),cards:[...document.querySelectorAll('.take-tableau [data-playing-card-root]')].map(box),controls:[...document.querySelectorAll('.take-stock,.take-current,.take-bank,.take-right>button,.take-clock,.take-counters,.take-meter')].map(box),scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};});
  assert.equal(geometry.scroll,false);
  for(const c of geometry.cards)assert.ok(Math.abs(c.h/c.w-1.5)<.02);
  geometry.clipped=[...geometry.cards,...geometry.controls].filter(c=>!(c.w>0&&c.h>0&&c.x>=-.5&&c.y>=-.5&&c.right<=width+.5&&c.bottom<=height+.5));
  if(label!=='before'){
   assert.equal(geometry.clipped.length,0,`fit ${width}x${height}/${players}: ${JSON.stringify(geometry.clipped)}`);
   const c=geometry.cards[0],stagger=geometry.cards[6];
   assert.ok(Math.abs((stagger.x-c.x)/c.w-.506)<.02,'half-card stagger');
   assert.ok((stagger.y-c.y)/c.w>=.74&&(stagger.y-c.y)/c.w<=1.07,'readable overlapping rows');
   assert.ok(geometry.cards.every(c=>c.bottom<=geometry.tableau.bottom+.5),'tableau bounds');
   const targets=await page.evaluate(()=>{const buttons=[...document.querySelectorAll('.take-tableau button')].slice(-5),controls=[...document.querySelectorAll('footer button')];return [...buttons,...controls].every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height*.8)?.closest('button')===b;});});
   assert.ok(targets,'exposed cards and controls remain reachable');
  }
  await page.screenshot({path:`${dir}/${width}x${height}-${players}${stage===1?'-stage1':''}.png`});layouts.push({width,height,players,stage,...geometry});await page.close();
 }
 for(const solo of [true,false]){
  const f=await post('new',{solo}),page=await browser.newPage({viewport:{width:390,height:664}});
  await page.addInitScript(()=>{
   window.measurements=[];let current=null;
   const fetchBase=window.fetch.bind(window);
   window.fetch=async(...args)=>{const body=JSON.parse(args[1]?.body??'{}'),pair=body.command?.intent?.type==='pair'||body.args?.p_action==='pair';if(!pair)return fetchBase(...args);current={tap:window.lastTap,request:performance.now(),feedback:false};window.measurements.push(current);const r=await fetchBase(...args);const json=r.json.bind(r);r.json=async()=>{const v=await json();current.response=performance.now();return v;};return r;};
   document.addEventListener('click',e=>{if(e.target.closest('.take-tableau button,.take-current'))window.lastTap=performance.now();},true);
   const observed=new Map();
   const tick=()=>{const cards=[...document.querySelectorAll('.take-tableau button')];if(current&&!current.visible){if(document.querySelectorAll('[data-selected=true]').length>=2&&!current.feedback)current.feedback=performance.now();if([...observed.keys()].some(label=>!cards.some(c=>c.getAttribute('aria-label')===label)))current.visible=performance.now();if(current.visible){current.enabled=!!document.querySelector('.take-tableau button:not([disabled])');}}observed.clear();for(const c of cards)observed.set(c.getAttribute('aria-label'),true);requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });
  await page.goto(`${base}/dev/take-two/live.html?${new URLSearchParams(f)}`);
  await page.locator('.take-stock:not([disabled])').waitFor({timeout:15000});
  for(let n=0;n<8;n++){
   let state=await post('state',f),b=solo?state.view:state;
   while(!b.legalPairs.length){await page.locator('.take-stock').click();await page.locator('.take-stock:not([disabled])').waitFor();state=await post('state',f);b=solo?state.view:state;}
   const pair=b.legalPairs.find(p=>!p.includes(-1))??b.legalPairs[0];
   for(const i of pair){const pos=b.layout[i];await (i===-1?page.locator('.take-current'):page.getByRole('button',{name:new RegExp(`^Row ${pos.row+1}, card ${pos.column+1}:`)})).click();}
   await page.waitForFunction(n=>window.measurements.length>n&&window.measurements[n].visible,n);
   await page.locator('.take-stock:not([disabled])').waitFor();
  }
  samples.push({mode:solo?'Arcade':'multiplayer',measurements:await page.evaluate(()=>window.measurements)});await page.close();
 }
 writeFileSync(`${dir}/measurements.json`,JSON.stringify({layouts,samples},null,2));
 for(const {mode,measurements}of samples){const vals=key=>measurements.map(m=>m[key]).sort((a,b)=>a-b),summary=f=>{const a=measurements.map(f).sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],max:a.at(-1)};};console.log(mode,JSON.stringify({tapToRequest:summary(m=>m.request-m.tap),requestToResponse:summary(m=>m.response-m.request),responseToVisible:summary(m=>m.visible-m.response),tapToVisible:summary(m=>m.visible-m.tap),feedback:measurements.map(m=>m.feedback&&m.feedback-m.tap)}));}
 console.log(label,layouts.length,'layouts and 16 authoritative pair actions passed');
}finally{await browser.close();}
