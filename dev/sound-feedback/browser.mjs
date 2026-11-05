import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd(),out=resolve(root,'qualification.local/sound-feedback'),origin='http://127.0.0.1:15462';mkdirSync(out,{recursive:true});
const server=await createServer({configFile:false,envFile:false,cacheDir:resolve(out,'cache'),plugins:[react(),{name:'fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/fixture'))return next();s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/sound-feedback/fixture.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});});}}],optimizeDeps:{entries:['dev/sound-feedback/fixture.tsx']},resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve(root,'dev/async-input-audio/transport.ts')},{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15462,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
async function pageFor(query){
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.addInitScript(()=>{window.proof={sources:[],events:[],visuals:[],frames:[],intents:[]};const Real=window.AudioContext;window.AudioContext=class extends Real{
  createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...a)=>{if(n.buffer?.duration>.1)window.proof.sources.push({type:'sample',duration:n.buffer.duration,at:performance.now(),visual:document.querySelector('[data-run21-scoring]')?.getAttribute('data-outcome')});return start(...a);};return n;}
  createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...a)=>{window.proof.sources.push({type:n.type,at:performance.now()});return start(...a);};return n;}
 };});
 await page.goto(origin+'/fixture?'+query);await page.waitForFunction(()=>window.loaded&&window.manager.getSnapshot().enabled!==null);await page.getByRole('button',{name:'Arm',exact:true}).click();await page.waitForFunction(()=>window.manager.context?.state==='running');
 return {page,errors};
}
try{
 for(const scope of ['arcade','async','live']){
  const {page,errors}=await pageFor('scope='+scope);await page.getByRole('button',{name:'Bust',exact:true}).click();await page.locator('[data-outcome="bust"] .run21-failure-icon').waitFor();await page.waitForTimeout(80);
  let data=await page.evaluate(()=>window.proof);assert.deepEqual(errors,[]);assert.equal(data.sources.length,1);assert.equal(data.sources[0].type,'sample');assert(Math.abs(data.sources[0].duration-1.0200226757)<.001);assert.equal(data.sources[0].visual,'bust');assert(data.visuals[0].visible);
  const delta=data.sources[0].at-data.visuals[0].at;assert(delta>=0&&delta<50);assert.equal(data.events.filter(e=>e.id.startsWith('run21-failure:')).length,1);
  await page.getByRole('button',{name:'Repaint',exact:true}).click();assert.equal(await page.evaluate(()=>window.proof.sources.length),1);
  if(scope==='arcade')await page.screenshot({path:resolve(out,'bust-visual.png')});
  await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByRole('button',{name:'Timeout',exact:true}).click();data=await page.evaluate(()=>window.proof);assert.equal(data.sources.filter(s=>s.type==='sawtooth').length,2);assert.equal(data.sources.filter(s=>s.type==='sample').length,1);
  await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByRole('button',{name:'Mute',exact:true}).click();await page.getByRole('button',{name:'Bust',exact:true}).click();await page.getByRole('button',{name:'Unmute',exact:true}).click();assert.equal(await page.evaluate(()=>window.proof.sources.length),3);
  results.push({scope,bustSourceAfterVisualCommitMs:delta,oneCrumble:true,noOldBustTone:true,timeoutUnchanged:true,muteAndRerenderSilent:true});await page.close();
 }
 const old=await pageFor('old=bust');assert.equal(await old.page.evaluate(()=>window.proof.sources.length),0);await old.page.close();
 const {page,errors}=await pageFor('mode=tri');await page.locator('[data-tri-card="19"]').click();let data=await page.evaluate(()=>window.proof);assert.equal(data.sources.length,1);assert(Math.abs(data.sources[0].duration-.1800226757)<.001);assert.equal(data.intents.length,0);
 await page.locator('[data-tri-card="18"]').click();data=await page.evaluate(()=>window.proof);assert.equal(data.intents.length,1);assert.equal(data.sources.length,1);
 await page.getByRole('button',{name:'Mute',exact:true}).click();await page.locator('[data-tri-card="19"]').click();await page.getByRole('button',{name:'Unmute',exact:true}).click();assert.equal(await page.evaluate(()=>window.proof.sources.length),1);assert.deepEqual(errors,[]);
 results.push({triInvalidOneSelectedTone:true,invalidNeverDispatched:true,validDispatchPreserved:true,mutedSilent:true,freshRun21ResultMountSilent:true});await page.close();console.log(JSON.stringify(results,null,2));
}finally{writeFileSync(resolve(out,'browser.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
