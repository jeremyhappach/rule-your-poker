// Compiled-app PWA launch proof. Synthetic signed-out auth, no backend writes.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const remote=process.env.PTOWN_PWA_PREVIEW_URL;
const origin=remote?new URL(remote).origin:'http://127.0.0.1:15445';
assert(!['holm357.com','ptown-poker.vercel.app','ptown-poker-jeremy-8e2b.vercel.app','ptown-poker-git-main-jeremy-8e2b.vercel.app'].includes(new URL(origin).hostname),'Never target production');
if(remote)assert.equal(new URL(origin).protocol,'https:');
const root=resolve('dist'),out=process.env.PTOWN_PWA_EVIDENCE??'qualification.local/pwa-signed-out';
mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.webmanifest':'application/manifest+json','.json':'application/json'};
let server;
if(!remote){
 server=createServer((req,res)=>{
  const path=new URL(req.url,origin).pathname;let file=resolve(root,'.'+path);
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  if(!extname(file))file=root+'/index.html';
  if(!existsSync(file)){res.writeHead(404);return res.end();}
  const body=readFileSync(file);res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
  if(req.headers.range){const[,a,b]=/bytes=(\d+)-(\d*)/.exec(req.headers.range);const start=+a,end=b?+b:body.length-1;res.writeHead(206,{'Content-Range':'bytes '+start+'-'+end+'/'+body.length,'Accept-Ranges':'bytes'});return res.end(body.subarray(start,end+1));}
  res.end(body);
 });await new Promise(r=>server.listen(15445,'127.0.0.1',r));
}
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
const cases=[
 {name:'signed-out-home',path:'/?launch=home',show:true},
 {name:'signed-out-existing-root',path:'/',show:true},
 {name:'signed-out-landscape',path:'/?launch=home',show:true,landscape:true},
 {name:'signed-out-slow-js',path:'/?launch=home',show:true,slow:true},
 {name:'signed-out-resume-during-video',path:'/?launch=home',show:true,resume:true},
 {name:'signed-out-reduced-motion',path:'/?launch=home',show:true,fallback:true,reduced:true},
 {name:'signed-out-autoplay-rejected',path:'/?launch=home',show:true,fallback:true,rejected:true},
 {name:'signed-out-opening-unavailable',path:'/?launch=home',missing:true},
 {name:'browser-root',path:'/',browser:true},
 {name:'direct-auth',path:'/auth'},
 {name:'cold-async-entry',path:'/delayed/22222222-2222-4222-8222-222222222222'},
 {name:'cold-push-entry',path:'/notifications/table/22222222-2222-4222-8222-222222222222'},
 {name:'password-reset',path:'/auth?reset=true'}
];
try{
 for(const c of cases){
  const context=await browser.newContext({viewport:c.landscape?{width:844,height:390}:{width:390,height:844},reducedMotion:c.reduced?'reduce':'no-preference',...(process.env.PTOWN_PWA_ACCESS_STATE?{storageState:process.env.PTOWN_PWA_ACCESS_STATE}:{})});
  await context.routeWebSocket('**',ws=>ws.close());
  await context.addInitScript(c=>{
   Object.defineProperty(navigator,'standalone',{value:!c.browser});
   window.pwaEvidence={phases:[],media:[],handoffs:[]};
   if(c.rejected)HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError'));
   let last;
   const observe=()=>{
    const overlay=document.querySelector('[data-launch-splash]'),phase=overlay?.getAttribute('data-launch-splash')??'none',video=overlay?.querySelector('video');
    if(phase!==last){window.pwaEvidence.phases.push({phase,at:performance.now(),login:!!document.querySelector('input[type=password]')});last=phase;}
    if(video&&!video.dataset.pwaObserved){video.dataset.pwaObserved='1';for(const event of ['loadedmetadata','playing','timeupdate','ended'])video.addEventListener(event,()=>window.pwaEvidence.media.push({event,time:video.currentTime,duration:video.duration,width:video.videoWidth,height:video.videoHeight,at:performance.now()}));}
   };
   new MutationObserver(observe).observe(document,{subtree:true,childList:true,attributes:true});
   window.addEventListener('ptown:launch-cover-ready',()=>{
    const overlay=document.querySelector('[data-launch-splash]'),img=overlay?.querySelector('img');
    window.pwaEvidence.handoffs.push({phase:overlay?.getAttribute('data-launch-splash')??'none',imageReady:!!img?.complete&&img.naturalWidth>0,login:!!document.querySelector('input[type=password]'),at:performance.now()});
   });
  },c);
  let backendIntercepted=0;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(url.origin!==origin||path.startsWith('/api/')||!['GET','HEAD'].includes(req.method())){
    backendIntercepted++;return route.fulfill({status:401,contentType:'application/json',body:'{"error":"Synthetic signed-out session"}'});
   }
   if(c.slow&&/^\/assets\/index-.*\.js$/.test(path))await new Promise(r=>setTimeout(r,2400));
   if(c.missing&&path.endsWith('/approved-v1-opening.png'))return route.fulfill({status:404,body:''});
   return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+c.path,{waitUntil:'domcontentloaded'});
   await page.locator('input[type=password]').first().waitFor();
   if(c.show&&!c.fallback){
    await page.locator('[data-launch-splash="showing"]').waitFor({timeout:8000});
    await page.screenshot({path:out+'/'+c.name+'-splash.png'});
    if(c.resume)await page.evaluate(()=>window.dispatchEvent(new Event('app:page-resumed')));
   }
   await page.waitForFunction(()=>!document.querySelector('[data-launch-splash]')&&!document.querySelector('#splash-screen'),{},{timeout:9000});
   const evidence=await page.evaluate(()=>window.pwaEvidence);
   assert.equal(evidence.phases.some(x=>x.phase==='showing'||x.phase==='fading'),!!c.show,JSON.stringify({c,evidence}));
   assert.deepEqual(errors,[]);
   if(c.show&&!c.fallback&&!c.resume){
    assert(evidence.media.some(x=>x.event==='playing'));
    assert(evidence.media.some(x=>x.time>2.4&&x.width===720&&x.height===1280),'Full approved clip must play before login is uncovered');
    assert(evidence.handoffs.some(x=>x.imageReady&&['preparing','showing'].includes(x.phase)),'Decoded overlay must receive startup cover');
   }
   await page.screenshot({path:out+'/'+c.name+'-login.png'});
   if(c.show){
    await page.evaluate(()=>{window.dispatchEvent(new Event('app:page-resumed'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.locator('[data-launch-splash]').count(),0);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('input[type=password]').first().waitFor();
    assert(!(await page.evaluate(()=>window.pwaEvidence.phases)).some(x=>x.phase!=='none'),'Reload must not replay');
   }
   results.push({name:c.name,passed:true,backendIntercepted,errors,evidence});console.log('PASS',c.name);
  }catch(error){await page.screenshot({path:out+'/'+c.name+'-failure.png'});writeFileSync(out+'/'+c.name+'-failure.json',JSON.stringify({error:String(error),errors,evidence:await page.evaluate(()=>window.pwaEvidence)},null,2));throw error;}
  finally{await context.close();}
 }
 writeFileSync(out+'/results.json',JSON.stringify({browser:'Desktop Edge with standalone emulation; physical iPhone acceptance pending',origin,allBackendRequestsIntercepted:true,results},null,2)+'\n');
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
