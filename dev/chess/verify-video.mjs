// Decode the recorded AAC, verify motion/audio timing, and extract review frames/audio.
import {createServer} from 'node:http';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const out='qualification.local/chess/videos',evidence=JSON.parse(read(out+'/evidence.json'));
const server=createServer((req,res)=>{if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}const bytes=read(req.url==='/'?'public/chess-preview/index.html':out+'/'+req.url.slice(1));res.setHeader('Content-Type',req.url.endsWith('.mp4')?'video/mp4':'text/html');res.setHeader('Accept-Ranges','bytes');const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=Number(range[1]),end=range[2]?Number(range[2]):bytes.length-1;res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.setHeader('Content-Length',end-start+1);res.end(bytes.subarray(start,end+1));}else{res.setHeader('Content-Length',bytes.length);res.end(bytes);}});await new Promise(r=>server.listen(15440,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:15440/');await page.locator('h1').click();
 const rows=[];
 for(const ev of evidence){
  const result=await page.evaluate(async ev=>{
   const video=[...document.querySelectorAll('video')].find(v=>v.src.endsWith(ev.name+'.mp4'));
   if(video.readyState<1)await new Promise((ok,fail)=>{video.onloadedmetadata=ok;video.onerror=fail;});
   video.muted=false;await video.play();await new Promise(r=>setTimeout(r,150));video.pause();
   const ctx=new AudioContext(),audio=await ctx.decodeAudioData(await(await fetch(video.src)).arrayBuffer());await ctx.close();
   const samples=audio.getChannelData(0),rate=audio.sampleRate,windows=[];let peak=0;
   for(let start=0;start<samples.length;start+=Math.round(rate*.01)){let sum=0;const end=Math.min(samples.length,start+Math.round(rate*.01));for(let i=start;i<end;i++){sum+=samples[i]**2;peak=Math.max(peak,Math.abs(samples[i]));}windows.push({at:start/rate,rms:Math.sqrt(sum/(end-start))});}
   const wav=new ArrayBuffer(44+samples.length*2),data=new DataView(wav);const tag=(at,s)=>[...s].forEach((c,i)=>data.setUint8(at+i,c.charCodeAt(0)));
   tag(0,'RIFF');data.setUint32(4,wav.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');data.setUint32(16,16,true);data.setUint16(20,1,true);data.setUint16(22,1,true);data.setUint32(24,rate,true);data.setUint32(28,rate*2,true);data.setUint16(32,2,true);data.setUint16(34,16,true);tag(36,'data');data.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++)data.setInt16(44+i*2,Math.round(samples[i]*32767),true);
   const wav64=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(new Blob([wav]));});
   const canvas=document.createElement('canvas');canvas.width=393*5;canvas.height=500;const c=canvas.getContext('2d');
   const onset=(ev.animations.find(a=>a.kind==='animationstart').time-ev.startedAt)/1000;
   const times=ev.name==='capture-poof'?[onset+.04,onset+.24,onset+.48,onset+.72,onset+1.08]:[onset-.1,onset+.05,onset+.15,onset+.28,onset+.5];
   for(let i=0;i<times.length;i++){video.currentTime=times[i];await new Promise(r=>video.addEventListener('seeked',r,{once:true}));c.drawImage(video,0,210,video.videoWidth,500,393*i,0,393,500);}
   return{file:ev.name,width:video.videoWidth,height:video.videoHeight,duration:video.duration,audioDuration:audio.duration,channels:audio.numberOfChannels,peak,windows,wav64,frames:canvas.toDataURL('image/png').split(',')[1]};
  },ev);
  assert(result.width>=392&&result.height===852&&result.duration>2.5&&result.peak>.07);
  assert(Math.abs(result.audioDuration-result.duration)<.1,'Encoded audio retains the complete timeline, including silent holds');
  const starts=ev.animations.filter(a=>a.kind==='animationstart');assert.equal(ev.audio.length,starts.length);
  ev.audio.forEach((sound,i)=>assert(Math.abs(sound.time-starts[i].time)<20,'Sound scheduled within one frame of CSS start'));
  const onset=result.windows.find(w=>w.rms>.005).at,expected=(ev.audio[0].time-ev.startedAt)/1000;
  assert(Math.abs(onset-expected)<.055,`Encoded audio onset tracks the actual animation: ${onset} vs ${expected}`);
  assert(result.windows.filter(w=>w.rms>.006).length>15,'Sustained audible signal, not merely nonzero audio');
  write(out+'/'+ev.name+'.wav',Buffer.from(result.wav64,'base64'));write(out+'/'+ev.name+'-frames.png',Buffer.from(result.frames,'base64'));
  delete result.wav64;delete result.frames;rows.push(result);
 }
 write(out+'/playback.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.map(({windows,...r})=>({...r,audibleWindows:windows.filter(w=>w.rms>.006).length}))));
}finally{await browser.close();await new Promise(r=>server.close(r));}
