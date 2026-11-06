import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({optimizeDeps:{entries:['dev/run21/fullscreen.html','dev/async-latency-release/table.html']},server:{host:'127.0.0.1',port:15479,strictPort:true,watch:null,hmr:false}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const route of ['run21/fullscreen','async-latency-release/table'])for(const [width,height] of [[390,844],[320,568],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>console.error('page error',e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:15479/dev/'+route+'.html');
  await page.locator('button[aria-label="Pass"]').waitFor({timeout:8000});
  const result=await page.evaluate(()=>{
   const rect=e=>{const {x,y,width,height}=e.getBoundingClientRect();return {x,y,width,height};};
   const controls=[document.querySelector('.run21-collect-button'),document.querySelector('button[aria-label="Pass"]')],columns=[...document.querySelectorAll('.run21-column')];
   return {controls:controls.map(rect),columns:columns.map(rect),hit:controls.map(e=>{const r=rect(e);return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e;})};
  });
  console.log(JSON.stringify({route,width,height,...result}));
  const [end,pass]=result.controls;assert(end.y+end.height<=pass.y+1);
  for(const x of result.controls)for(const y of result.columns)assert(x.x+x.width<=y.x||x.x>=y.x+y.width||x.y+x.height<=y.y||x.y>=y.y+y.height);
  assert(result.hit.every(Boolean));await page.close();
 }
} finally{await browser.close();await server.close();}
