import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin=process.env.SOUND_LAB_URL??'http://127.0.0.1:4317';
const out='qualification.local/sound-lab';mkdirSync(out,{recursive:true});
const catalog=JSON.parse(readFileSync('dev/sound-lab/catalog.json','utf8'));
const checks=[];
for(const item of catalog){
 const bytes=readFileSync('dev/sound-lab/assets/'+item.file);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 let peak=0,sum=0;for(let i=44;i<bytes.length;i+=2){const x=bytes.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(x));sum+=x*x;}
 assert(peak>0&&peak<.21,item.id+' peak');assert(Math.sqrt(sum/((bytes.length-44)/2))>0,item.id+' silent');
 assert(Math.abs(20*Math.log10(peak)-item.peakDb)<.03,item.id+' normalization');
}
checks.push('21 WAV hashes, non-silence, peak headroom and proposed levels');
const browser=await chromium.launch({channel:'msedge'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],external=[];
 await context.addInitScript(()=>{
  // The same-Wi-Fi HTTP entry has no secure-context randomUUID on mobile.
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  window.labProbe={starts:0,stops:0,contexts:[]};const Native=window.AudioContext;
  window.AudioContext=class extends Native{
   constructor(){super();window.labProbe.contexts.push(this);}
   createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node),stop=node.stop.bind(node);
    node.start=(...args)=>{if(node.buffer?.length>1)window.labProbe.starts++;return start(...args);};
    node.stop=(...args)=>{window.labProbe.stops++;return stop(...args);};return node;}
   createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=(...args)=>{window.labProbe.starts++;return start(...args);};return node;}
  };
 });
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.getByRole('status').filter({hasText:'Ready'}).waitFor();
 const count=()=>page.evaluate(()=>window.labProbe.starts);
 for(const item of catalog){const before=await count();await page.getByRole('button',{name:'Play '+item.title,exact:true}).click();await page.waitForFunction(n=>window.labProbe.starts>n,before);await page.getByRole('button',{name:'Stop playback'}).click();}
 checks.push('Every candidate starts native Web Audio from a real click and can be cancelled'); console.log('21 candidates passed');
 for(const title of ['Approved card play','Approved card pass / draw','Canonical card flight','Shared score count-up','TriTowers / Run21 fanfare','Mega Card Golf · hole','Mega Card Golf · final','Mega Card Golf · cup','Mega Card Golf · tee']){
  const before=await count();await page.getByRole('button',{name:'▶ '+title,exact:true}).click();await page.waitForFunction(n=>window.labProbe.starts>n,before).catch(()=>{throw Error('Reference did not start: '+title);});await page.getByRole('button',{name:'Stop playback'}).click();
 }
 checks.push('Nine unchanged reference generators play through the shared manager');
 await page.getByRole('button',{name:'Play Major win · full resolution',exact:true}).click();
 await page.getByRole('button',{name:'Mute sounds',exact:true}).click();
 assert(await page.evaluate(()=>window.labProbe.contexts.every(c=>c.state==='closed')));
 const muted=await count();await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();await page.waitForTimeout(150);assert.equal(await count(),muted);
 checks.push('Mute closes the active graph; unmute creates fresh context without old playback');
 await page.getByRole('button',{name:'Winner + 12 competing deals',exact:true}).click();
 assert.match(await page.getByRole('status').innerText(),/12 competing deal requests suppressed/);
 await page.getByRole('button',{name:'Stop playback'}).click();
 checks.push('Winner priority suppresses 12 rapid lower-priority requests');
 const results=await page.evaluate(async()=>{
  const {LabConductor}=await import('/conductor.ts'),{platformAudio}=await import('/labAudio.ts');
  const {pcmCue,decodePCM}=await import('/pcm.ts');
  const pcm=decodePCM(await(await fetch('/assets/peg-wood.wav')).arrayBuffer());
  const c=new LabConductor(),s={id:'peg',priority:10,group:'peg',cooldownMs:100,cue:pcmCue(pcm)};
  const before=window.labProbe.starts;c.play(s,'persistent-replay-probe');await new Promise(r=>setTimeout(r,20));
  const first=window.labProbe.starts;c.stop();await Promise.resolve();c.play(s,'persistent-replay-probe');await Promise.resolve();
  const second=window.labProbe.starts;c.stop();await Promise.resolve();
  const fresh=new LabConductor();const one=fresh.play(s,'cooldown-first',false),two=fresh.play(s,'cooldown-second',false);fresh.stop();
  platformAudio.setPreference('00000000-0000-4000-8000-000000000001',true);
  return{before,first,second,one,two};
 });
 assert(results.first>results.before);assert.equal(results.second,results.first);assert.equal(results.one,true);assert.equal(results.two,false);
 checks.push('Exact repeated event receipt is silent; group cooldown suppresses a rapid repeat');
 await page.reload();await page.getByRole('status').filter({hasText:'Ready'}).waitFor();assert.equal(await count(),0);
 await page.getByRole('button',{name:'Play Wooden peg · A',exact:true}).click();await page.getByRole('button',{name:'Stop playback'}).click();
 const repeat=await page.evaluate(async()=>{const {platformAudio,LAB_USER}=await import('/labAudio.ts');const {references}=await import('/references.ts');const before=window.labProbe.starts;platformAudio.follow({userId:LAB_USER,id:'lab:persistent-replay-probe',startedAt:performance.now(),expiresAt:performance.now()+500,cueAt:()=>references[0].cue});await Promise.resolve();return[before,window.labProbe.starts];});assert.equal(repeat[0],repeat[1]);
 checks.push('Refresh is silent and the prior event receipt remains consumed');
 await page.getByRole('button',{name:'Dice roll → landing',exact:true}).click();
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
 const hidden=await count();await page.waitForTimeout(1400);assert.equal(await count(),hidden);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));
 checks.push('Pagehide cancels the roll and scheduled landing; pageshow does not replay them');
 for(const [width,height] of [[320,740],[390,844],[844,390],[1440,1000]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+'/lab-'+width+'x'+height+'.png',fullPage:true});
 }
 checks.push('Four viewport widths fit without horizontal overflow');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push('No browser errors and zero external/API/database requests');
 await context.close();
 writeFileSync(out+'/verification.json',JSON.stringify({passed:true,checks,physicalDevices:'Not tested'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
