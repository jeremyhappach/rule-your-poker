// Records the actual ChessView CSS animations and actual platform Web Audio output.
// CDP screen frames are painted into an offscreen capture canvas; no effects are recreated.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
const out='qualification.local/chess/videos';mkdirSync(out,{recursive:true});
const photos=JSON.parse(read('src/lib/gameBackgrounds/photos.json'));
let soundEnabled=true;
const server=await createServer({configFile:false,envFile:false,cacheDir:'qualification.local/chess/video-cache',optimizeDeps:{entries:['dev/chess/index.html']},plugins:[react(),{name:'video-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/fixture/live.json'){const v=JSON.parse(read('qualification.local/chess/live.json'));v.deadline=Date.now()+300000;v.identity.dealerGameId=crypto.randomUUID();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));return;}
 if(path.startsWith('/fixture/photo/')){const p=photos.find(p=>path.endsWith('/'+p.id+'.png'));if(p){res.setHeader('Content-Type','image/png');res.end(read('qualification.local/game-backgrounds/assets/'+p.id+'.png'));return;}}
 if(path==='/fixture/rpc'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const value=JSON.parse(body);soundEnabled=value.args.p_enabled;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:soundEnabled,error:null}));});return;}
 if(path.startsWith('/fixture/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{play_sounds:soundEnabled},error:null}));return;}next();
 });}}],resolve:{alias:[{find:'@/lib/arcade/artwork',replacement:resolve('dev/game-backgrounds/artwork.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/words-gameplay/client.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15439,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  const Native=window.AudioContext,connect=AudioNode.prototype.connect;
  window.audioEvidence=[];
  window.AudioContext=class extends Native{constructor(...args){super(...args);this.recording=this.createMediaStreamDestination();const clock=this.createConstantSource();clock.offset.value=0;clock.connect(this.recording);clock.start();window.recordingAudio=this;}};
  AudioNode.prototype.connect=function(dest,...rest){if(dest===this.context.destination&&this.context.recording)connect.call(this,this.context.recording);return connect.call(this,dest,...rest);};
  const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.audioEvidence.push({time:performance.now(),audioAt:args[0]??0,audioNow:this.context.currentTime,samples:this.buffer?.length,duration:this.buffer?.duration});return start.apply(this,args);};
 });
 const page=await context.newPage();await page.goto('http://127.0.0.1:15439/dev/chess/index.html');await page.locator('.chess-square').first().waitFor();await page.locator('.chess-square').first().click();
 await page.waitForFunction(()=>window.recordingAudio?.state==='running');
 await page.waitForFunction(()=>document.querySelector('.game-photo-background img')?.naturalWidth>0);
 // Let the native output clock stabilize after the real unlock gesture.
 await page.waitForTimeout(400);
 await page.evaluate(()=>{window.captureCanvas=document.createElement('canvas');window.captureCanvas.width=393;window.captureCanvas.height=852;window.captureContext=window.captureCanvas.getContext('2d');window.animations=[];for(const kind of ['animationstart','animationend'])document.addEventListener(kind,e=>{if(['chess-slide','chess-hop','chess-poof'].includes(e.animationName))window.animations.push({name:e.animationName,kind,time:performance.now()});});});
 const cdp=await context.newCDPSession(page);let pending=Promise.resolve(),painting=false;
 const frameTiming=[];
 cdp.on('Page.screencastFrame',frame=>{
  // Acknowledge immediately and never queue stale pictures behind live audio.
  void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId});
  if(painting)return;painting=true;
  pending=page.evaluate(async ({data,stamp})=>{const img=new Image();img.src='data:image/jpeg;base64,'+data;await img.decode();window.captureContext.drawImage(img,0,0,393,852);return{captured:stamp*1000,painted:Date.now()};},{data:frame.data,stamp:frame.metadata.timestamp}).then(t=>frameTiming.push(t)).catch(e=>console.error('Frame failed:',e.message)).finally(()=>painting=false);
 });
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:393,maxHeight:852,everyNthFrame:1});
 const move=async(a,b)=>{await page.locator(`[data-square="${a}"]`).click();await page.locator(`[data-square="${b}"]`).click();};
 const evidence=[];
 async function clip(name,action){
  const source={"standard-slide":"e2","capture-poof":"e4","knight-hop":"g8"}[name];
  const visual=await page.locator(`[data-square="${source}"]`).boundingBox();
  const mime=await page.evaluate(()=>{
   const mime=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/webm;codecs=vp8,opus'].find(m=>MediaRecorder.isTypeSupported(m));
   const stream=new MediaStream([...window.captureCanvas.captureStream(30).getVideoTracks(),...window.recordingAudio.recording.stream.getAudioTracks()]);
   window.videoChunks=[];window.recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000,audioBitsPerSecond:128000});window.recorder.ondataavailable=e=>window.videoChunks.push(e.data);window.audioEvidence=[];window.animations=[];window.frameTimer=setInterval(()=>window.captureContext.drawImage(window.captureCanvas,0,0),33);window.recordingStartedAt=performance.now();window.recorder.start();return mime;
  });
  await page.waitForTimeout(650);await action();await page.waitForTimeout(2100);
  const result=await page.evaluate(async()=>{
   await new Promise(resolve=>{window.recorder.onstop=resolve;window.recorder.stop();clearInterval(window.frameTimer);});
   const blob=new Blob(window.videoChunks,{type:window.recorder.mimeType});const data=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.slice(r.result.lastIndexOf(',')+1));r.readAsDataURL(blob);});return{data,audio:window.audioEvidence,animations:window.animations,startedAt:window.recordingStartedAt};
  });
  const extension=mime.includes('mp4')?'mp4':'webm',path=out+'/'+name+'.'+extension,bytes=Buffer.from(result.data,'base64');assert(bytes.length>10000,'Playable clip contains encoded video');write(path,bytes);assert(result.audio.length>0,'Actual Web Audio sources were recorded');evidence.push({name,path,bytes:bytes.length,mime,visual,audio:result.audio,animations:result.animations,startedAt:result.startedAt});
 }
 await clip('standard-slide',()=>move('e2','e4'));
 await page.evaluate(()=>window.opponentMove('d7','d5'));await page.waitForTimeout(600);
 await clip('capture-poof',()=>move('e4','d5'));
 await clip('knight-hop',()=>page.evaluate(()=>window.opponentMove('g8','f6')));
 await cdp.send('Page.stopScreencast');await pending;
 write(out+'/evidence.json',JSON.stringify(evidence,null,2));
 write(out+'/frame-timing.json',JSON.stringify(frameTiming,null,2));
 await page.getByRole('button',{name:'Mute sounds',exact:true}).click();
 await page.getByRole('button',{name:'Unmute sounds',exact:true}).waitFor();
 await page.evaluate(()=>window.audioEvidence=[]);await move('g1','f3');await page.waitForTimeout(1100);
 assert.equal(await page.evaluate(()=>window.audioEvidence.filter(s=>s.duration>.1).length),0,'Muted movement stays silent');
 await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();await page.waitForFunction(()=>window.recordingAudio.state==='running');
 await page.evaluate(()=>{window.audioEvidence=[];window.remount();});await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.audioEvidence.filter(s=>s.duration>.1).length),0,'Unmute/remount cannot replay a consumed move');
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.opponentMove('b8','c6'));await page.waitForTimeout(100);
 assert.equal(await page.locator('.chess-motion').count(),0,'Reduced motion settles immediately');
 assert.equal(await page.evaluate(()=>window.audioEvidence.filter(s=>s.duration>.1).length),0,'Reduced motion stays silent');
 await page.emulateMedia({reducedMotion:'no-preference'});await move('a2','a3');await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.audioEvidence.filter(s=>s.duration>.1).length),1,'A fresh move sounds after unmute');
 write(out+'/native-audio-guards.json',JSON.stringify({browser:await browser.version(),trustedGestureUnlock:true,mute:true,unmuteFreshMove:true,remountNoReplay:true,reducedMotion:true},null,2));
 console.log(JSON.stringify(evidence));
}finally{await browser.close();await server.close();}
