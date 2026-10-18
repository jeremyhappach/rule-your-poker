import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('.codex/evidence/eleven-smoke');await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':resolve('src')}},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5188,strictPort:true}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true}),evidence=[];
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])for(const players of [1,2]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.goto(`http://127.0.0.1:5188/dev/eleven-up/polish.html?players=${players}&phase=complete`);
  await page.getByText(players===1?'Game complete':'Game Over',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
  assert.equal(await page.locator('[data-winner=true]').count(),players===1?0:1);
  if(players===2){assert.equal(await page.getByText('Hap wins with 103,000',{exact:true}).count(),1);assert.equal(await page.getByText('Hap: AN ALL-TIME HIGH SCORE!',{exact:true}).count(),1);}
  const fit=await page.evaluate(()=>{const r=document.querySelector('.eleven-result').getBoundingClientRect(),score=document.querySelector('.eleven-scores').getBoundingClientRect(),title=document.querySelector('.eleven-result>strong').getBoundingClientRect();return {noScroll:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,inside:r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,separate:score.bottom<=r.top,titleFits:title.x>=r.x&&title.right<=r.right&&title.bottom<=r.bottom,chipAlignment:getComputedStyle(document.querySelector('.eleven-score-pill small')??document.querySelector('.eleven-score-pill')).textAlign};});
  assert.ok(fit.noScroll&&fit.inside&&fit.separate&&fit.titleFits,JSON.stringify({width,players,fit}));if(players===2)assert.equal(fit.chipAlignment,'left');assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(out,`game-over-${width}-${players}.png`)});evidence.push({width,height,players,fit});await page.close();
 }
 await writeFile(resolve(out,'browser-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();await server.close();}
