import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
const photos=JSON.parse(readFileSync('src/lib/gameBackgrounds/photos.json','utf8'));
const out='qualification.local/game-backgrounds';
const server=await createServer({configFile:false,envFile:false,cacheDir:'qualification.local/game-backgrounds/vite-cache',optimizeDeps:{entries:['dev/game-backgrounds/index.html']},plugins:[react(),{
 name:'background-fixtures',configureServer(server){server.middlewares.use((req,res,next)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture/live.json'||path==='/fixture/async.json'){res.setHeader('Content-Type','application/json');res.end(readFileSync(out+'/'+path.split('/').at(-1)));return;}
  if(path.startsWith('/fixture/photo/')){
   const photo=photos.find(p=>path.endsWith('/'+p.id+'.png'));
   if(!photo){res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type','image/png');res.end(readFileSync(out+'/assets/'+photo.id+'.png'));return;
  }
  if(path.startsWith('/fixture/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{play_sounds:false},error:null}));return;}
  next();
 });}
}],resolve:{alias:[
 {find:'@/lib/arcade/artwork',replacement:resolve('dev/game-backgrounds/artwork.ts')},
 {find:'@/integrations/supabase/client',replacement:resolve('dev/words-gameplay/client.ts')},
 {find:'@',replacement:resolve('src')}
]},server:{host:'127.0.0.1',port:15438,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const checks=[],errors=[];
try{
 for(const mode of ['live','async'])for(const [width,height]of [[393,852],[375,667],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:15438/dev/game-backgrounds/index.html?mode=${mode}`);
  await page.locator('.words-grid').waitFor();
  const measure=()=>page.evaluate(()=>Object.fromEntries(['.words-grid','.words-viewport','.words-rack','.fullscreen-game-toolbar','.words-turn-actions'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
  const before=await measure();
  const expected=Math.min(before['.words-viewport'].width-2,before['.words-viewport'].height-2,736);
  assert(expected>0&&Math.abs(before['.words-grid'].width-expected)<1,'Board must fill its existing fitted square');
  assert(Math.abs(before['.words-grid'].width-before['.words-grid'].height)<1,'Board stays square');
  for(const photo of photos){
   await page.evaluate(id=>window.setPhoto(id),photo.id);
   await page.waitForFunction(id=>{const bg=document.querySelector('.game-photo-background'),img=bg?.querySelector('img');return bg?.getAttribute('data-background-id')===id&&img?.complete&&img.naturalWidth>0;},photo.id);
   assert.deepEqual(await measure(),before,'Background must not move or shrink any controls');
   assert((await page.locator('.game-photo-background').boundingBox()).height>400,'Photo fills the available game surface');
   assert.equal(await page.locator('.words-viewport').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   if(width===393)await page.screenshot({path:`${out}/${mode}-${photo.id}.png`});
  }
  checks.push({mode,width,height,photos:photos.length,geometry:'unchanged'});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/browser.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
}finally{await browser.close();await server.close();}
