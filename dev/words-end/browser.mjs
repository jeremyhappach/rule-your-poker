import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/words-end-browser';mkdirSync(dir,{recursive:true});
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
let reads=0;
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'words-end-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!=='/__fixture/rpc')return next();let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert.equal(body.name,'ptown_words_final_racks');reads++;const racks={[a]:[{id:1,face:'A',value:1}],[b]:[]},before={[a]:246,[b]:384},scores={[a]:245,[b]:385};if(body.four)for(let i=3;i<=4;i++){racks['player-'+i]=Array.from({length:7},(_,n)=>({id:i*10+n,face:'E',value:1}));before['player-'+i]=107;scores['player-'+i]=100;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:body.args.p_id,revision:7,racks,before,scores}));});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/words-end/supabase.ts')},{find:'@/lib/ptownWords/client',replacement:resolve('dev/words-end/client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15460,strictPort:true,hmr:false}});
await server.listen();const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
const evidence=[];
try{
 for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(size);await page.goto('http://127.0.0.1:15460/dev/words-end/index.html?four');await page.getByRole('heading',{name:'Remaining tiles',exact:true}).waitFor();
  await page.screenshot({path:dir+`/${size.width}-racks.png`});
  const geometry=await page.locator('.words-end-sequence').evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scroll:e.scrollHeight>e.clientHeight};});assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=size.width+1&&geometry.bottom<=size.height+1);evidence.push({size,geometry});
 }
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:15460/dev/words-end/index.html');await page.getByText('246 − 1 = 245',{exact:true}).waitFor();await page.getByText('384 + 1 = 385',{exact:true}).waitFor();await page.screenshot({path:dir+'/adjustments.png'});await page.getByText('Opponent wins',{exact:true}).waitFor();
 const before=reads;await page.goto('http://127.0.0.1:15460/dev/words-end/index.html?active');await page.getByLabel('Opponent: 4 tiles remaining',{exact:true}).waitFor();assert.equal(await page.locator('.words-tile-back').count(),4);assert.equal(await page.locator('.words-final-tile').count(),0);assert.equal(reads,before);await page.screenshot({path:dir+'/tile-backs.png'});assert.deepEqual(errors,[]);
 writeFileSync(dir+'/evidence.json',JSON.stringify({evidence,reads,errors,qualification:'isolated HTTP fixture; database privacy tested separately'},null,2));console.log(JSON.stringify({layouts:evidence.length,reads,errors}));
}catch(e){console.error({reads,errors,text:(await page.locator('body').innerText()).slice(0,1600)});throw e;}finally{await browser.close();await server.close();}
