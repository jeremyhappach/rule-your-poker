import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qualification.local/run21-transition';await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5180,strictPort:true,watch:{ignored:['**/qualification.local/**']}},open:false});await server.listen();
const browser=await chromium.launch({headless:true,channel:'chrome'}),proof=[];
try{
 for(const [width,height] of [[1440,900],[390,844],[844,390],[320,568]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5180)/,route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:5180/dev/run21/fullscreen.html?scene=transition');
  const shell=page.locator('[data-canonical-shell-root]');await shell.waitFor();
  await page.evaluate(()=>{window.proof=[];window.originalShell=document.querySelector('[data-canonical-shell-root]');let prior='';function frame(){const shell=window.originalShell,column=shell.querySelector('[data-canonical-shell-column]');const value={phase:shell.dataset.shellTransition,mode:shell.dataset.shellPresentationMode,felts:document.querySelectorAll('[data-canonical-felt-surface]').length,fullscreens:document.querySelectorAll('[data-fullscreen-game-shell]').length,inert:column.inert,replaced:document.querySelector('[data-canonical-shell-root]')!==shell};const key=JSON.stringify(value);if(key!==prior){window.proof.push({...value,at:performance.now()});prior=key;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  const change=(mode,ready=true,blocked=false)=>page.evaluate(detail=>document.dispatchEvent(new CustomEvent('preview-surface',{detail})),{mode,ready,blocked});
  const stable=()=>page.waitForFunction(()=>document.querySelector('[data-canonical-shell-root]')?.getAttribute('data-shell-transition')==='stable');
  await change('fullscreen',false);await page.waitForFunction(()=>document.querySelector('[data-canonical-shell-root]').dataset.shellTransition==='bridge');
  await page.screenshot({path:`${out}/bridge-${width}x${height}.png`});
  await page.waitForTimeout(550);assert.equal(await shell.getAttribute('data-shell-transition'),'bridge');
  await change('fullscreen');await stable();
  const total=await page.locator('.run21-running-total').boundingBox(),help=await page.getByRole('button',{name:'Run21 scoring help'}).boundingBox();
  assert(help.x-(total.x+total.width)>=7);assert.equal(await page.locator('.run21-running-total small').innerText(),'/105');
  await page.screenshot({path:`${out}/ready-${width}x${height}.png`});
  await change('table',true,true);assert.equal(await shell.getAttribute('data-shell-transition'),'stable');assert.equal(await shell.getAttribute('data-shell-presentation-mode'),'fullscreen');
  await change('table');await stable();assert.equal(await page.locator('[data-canonical-felt-surface]').count(),1);
  await change('fullscreen');await page.setViewportSize({width:height,height:width});await page.setViewportSize({width,height});await stable();
  await change('fullscreen');await stable();
  const frames=await page.evaluate(()=>window.proof);assert(frames.every(f=>!f.replaced&&f.felts<=1&&f.fullscreens<=1));assert.equal(frames.filter(f=>f.phase==='outgoing').length,3);
  await page.emulateMedia({reducedMotion:'reduce'});await change('table');await stable();
  await page.reload();await stable();assert.equal(await shell.getAttribute('data-shell-presentation-mode'),'table');
  assert.deepEqual(errors,[]);proof.push({width,height,frames,helpGap:help.x-(total.x+total.width),passed:true});await context.close();
 }
 await writeFile(`${out}/evidence.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof.map(({width,height,helpGap})=>({width,height,helpGap,passed:true}))));
}finally{await browser.close();await server.close();}
