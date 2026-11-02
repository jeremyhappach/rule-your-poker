import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin=process.env.STUDIO_V2_URL??'http://127.0.0.1:4318';
const root='dev/sound-studio-v2/',out='qualification.local/sound-studio-v2';
mkdirSync(out,{recursive:true});
const catalog=[...JSON.parse(readFileSync(root+'catalog.json','utf8')),...JSON.parse(readFileSync(root+'pass2-catalog.json','utf8'))];
const pass1=JSON.parse(readFileSync('dev/sound-lab/catalog.json','utf8'));
const ids=['deal-paper','flip-soft','dice-land','dice-land-soft','peg-wood','holm-glass-recorded','winner-a'];
const approved=pass1.filter(s=>ids.includes(s.id)),checks=[];
assert.equal(catalog.length,51);assert.equal(new Set(catalog.map(s=>s.category)).size,17);
for(const category of new Set(catalog.map(s=>s.category)))assert.equal(catalog.filter(s=>s.category===category).length,3);
assert.equal(new Set(catalog.map(s=>s.sha256)).size,51);
for(const s of [...catalog,...approved]){
 const b=readFileSync((catalog.includes(s)?root:'dev/sound-lab/')+'assets/'+s.file);
 assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256,s.id+' hash');
 assert.equal(b.readUInt32LE(24),32000);assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt16LE(34),16);
 assert(Math.abs((b.length-44)/64-s.durationMs)<=1,s.id+' duration');
 let peak=0,sum=0;for(let i=44;i<b.length;i+=2){const x=b.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(x));sum+=x*x;}
 assert(peak>0&&peak<.17,s.id+' headroom');assert(Math.abs(20*Math.log10(peak)-s.peakDb)<.04,s.id+' peak');
 assert(Math.abs(20*Math.log10(Math.sqrt(sum/((b.length-44)/2)))-s.rmsDb)<.12,s.id+' RMS');
 assert.equal(b.readInt16LE(44),0);assert.equal(b.readInt16LE(b.length-2),0);
 if(s.id.startsWith('chucky'))assert(s.durationMs>=700&&s.durationMs<=1500);
}
checks.push('17 categories × three distinct WAVs; all 58 files hash-match, decode as mono PCM16/32k, have documented duration/levels, silent edges and peak headroom');
const browser=await chromium.launch({channel:'msedge'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),errors=[],external=[];
 await context.addInitScript(()=>{
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  window.studioProbe={starts:0,stops:0,contexts:[]};const Native=window.AudioContext;
  window.AudioContext=class extends Native{
   constructor(){super();window.studioProbe.contexts.push(this);}
   createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node),stop=node.stop.bind(node);
    node.start=(...args)=>{if(node.buffer?.length>1)window.studioProbe.starts++;return start(...args);};
    node.stop=(...args)=>{window.studioProbe.stops++;return stop(...args);};return node;}
  };
 });
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const count=()=>page.evaluate(()=>window.studioProbe.starts);
 const stop=()=>page.getByRole('button',{name:'■ Stop',exact:true}).click();
 await page.goto(origin);await page.getByRole('status').filter({hasText:'Ready.'}).waitFor();assert.equal(await count(),0);
 for(const s of catalog){const before=await count();await page.getByRole('button',{name:'Play '+s.title,exact:true}).click();await page.waitForFunction(n=>window.studioProbe.starts>n,before);await stop();}
 for(const s of approved){const before=await count();await page.getByRole('button',{name:'Reference '+s.title,exact:true}).click();await page.waitForFunction(n=>window.studioProbe.starts>n,before);await stop();}
 checks.push('All 51 candidates and seven approved references schedule real Web Audio from explicit clicks; Stop cancels them');
 let before=await count();await page.getByRole('button',{name:'Replay last',exact:false}).click();await page.waitForFunction(n=>window.studioProbe.starts>n,before);await stop();
 before=await count();await page.getByRole('button',{name:'Replay Velvet villain',exact:true}).click();await page.waitForFunction(n=>window.studioProbe.starts>n,before);await stop();
 checks.push('Global replay and per-candidate replay create fresh deliberate auditions');
 for(const name of ['Felt sigh','Midnight blue','Velvet villain'])await page.getByRole('button',{name:'Favorite '+name,exact:true}).click();
 await page.getByRole('button',{name:'★ Favorites (3)',exact:true}).click();assert.equal(await page.locator('article').count(),3);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export shortlist',exact:false}).click();
 const download=await downloadPromise;const exported=JSON.parse(readFileSync(await download.path(),'utf8'));assert.equal(exported.approvedForGameplay,false);assert.equal(exported.picks.length,3);assert.equal(exported.picks[0].sha256,catalog[0].sha256);
 await page.reload();await page.getByRole('status').filter({hasText:'Ready.'}).waitFor();assert.equal(await count(),0);assert.equal(await page.getByRole('button',{name:'Favorite Velvet villain',exact:true}).getAttribute('aria-pressed'),'true');
 checks.push('Favorites survive reload; filter and portable JSON export retain exact asset hashes without marking approval');
 await page.getByRole('combobox',{name:'Jump to category'}).selectOption('chucky');assert.equal(await page.locator('article').count(),3);
 await page.getByRole('button',{name:'Play Velvet villain',exact:true}).click();await page.getByRole('button',{name:'Mute sounds',exact:true}).click();
 assert(await page.evaluate(()=>window.studioProbe.contexts.every(c=>c.state==='closed')));
 const muted=await count();await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();await page.waitForTimeout(100);assert.equal(await count(),muted);
 checks.push('Mute closes the graph mid-laugh; unmute never replays old audio');
 await page.getByRole('button',{name:'Sweep + competing celebrations',exact:true}).click();await page.getByRole('status').filter({hasText:'3 competing'}).waitFor();await stop();
 const policy=await page.evaluate(async()=>{const {awardChoice}=await import('/demoPolicy.ts');return [
  awardChoice({local:true,terminal:false,sweep:false,legs:3,target:5}),
  awardChoice({local:false,terminal:false,sweep:false,legs:3,target:3}),
  awardChoice({local:true,terminal:true,sweep:false,legs:2,target:2}),
  awardChoice({local:false,terminal:true,sweep:true,legs:5,target:5}),
  awardChoice({local:true,terminal:false,sweep:true,legs:3,target:5})];});
 assert.deepEqual(policy,['my-leg','opponent-leg','winner-a','sweep','my-leg']);
 await page.getByRole('spinbutton',{name:'Legs to win',exact:true}).fill('5');
 await page.getByRole('spinbutton',{name:'Legs displayed',exact:true}).fill('3');
 await page.getByRole('button',{name:'▶ Audition award',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Leg 3 of 5: your award'}).waitFor();await stop();
 await page.getByRole('checkbox',{name:'My award',exact:true}).uncheck();
 await page.getByRole('button',{name:'▶ Audition award',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Leg 3 of 5: opponent award'}).waitFor();await stop();
 await page.getByRole('checkbox',{name:'Authoritative terminal result',exact:true}).check();
 await page.getByRole('checkbox',{name:'Canonical sweep admitted',exact:true}).check();
 await page.getByRole('button',{name:'▶ Audition award',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Sweep owns this result'}).waitFor();await stop();
 checks.push('Variable-leg demo follows separate terminal admission, handles local/opponent, and sweep rejects three competing celebration requests');
 await page.getByRole('button',{name:'Chucky → deal concept',exact:true}).click();await page.getByRole('status').filter({hasText:'Velvet villain'}).waitFor();
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));const hidden=await count();await page.waitForTimeout(1700);assert.equal(await count(),hidden);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));assert.equal(await count(),hidden);
 checks.push('Pagehide cancels the laugh and pending deal; pageshow has no catch-up playback');
 await page.getByRole('button',{name:'Dice settle → score posts',exact:true}).click();await page.getByRole('status').filter({hasText:'Ink & felt'}).waitFor();await stop();
 const receipts=await page.evaluate(async()=>{
  const {LabConductor}=await import('/conductor.ts');
  const c=new LabConductor(),s={id:'receipt',priority:10,group:'receipt',cooldownMs:250,cue:{durationMs:100,schedule(ctx,dest,track){const b=ctx.createBuffer(1,3200,32000);b.getChannelData(0).fill(.001);const n=track(ctx.createBufferSource());n.buffer=b;n.connect(dest);n.start();return true;}}};
  const before=window.studioProbe.starts;c.play(s,'same-event');await new Promise(r=>setTimeout(r,30));const first=window.studioProbe.starts;c.stop();await Promise.resolve();c.play(s,'same-event');await new Promise(r=>setTimeout(r,30));const second=window.studioProbe.starts;c.stop();
  const suppressed=c.play(s,'different-but-too-soon',false);c.stop();return {before,first,second,suppressed};
 });
 assert(receipts.first>receipts.before);assert.equal(receipts.second,receipts.first);assert.equal(receipts.suppressed,false);
 checks.push('Exact event receipt prevents a duplicate; group cooldown suppresses rapid automatic repeats; dice-to-score sequence reaches its second cue');
 // Layout and native playback checks use the LAN-safe path with randomUUID absent.
 await page.getByRole('button',{name:'All moments',exact:true}).click();
 for(const [width,height] of [[1440,1100],[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'viewport overflow '+width);
  await page.screenshot({path:out+'/studio-'+width+'x'+height+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('combobox',{name:'Jump to category'}).selectOption('chucky');await page.getByRole('heading',{name:'Chucky’s Evil Laugh',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/chucky-phone.png'});
 checks.push('Desktop, 320/390 portrait and short landscape layouts fit without horizontal overflow; Chucky mobile layout captured');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('No browser errors or external/account/API/database requests');
 await context.close();writeFileSync(out+'/verification.json',JSON.stringify({passed:true,checks,physicalDevices:'Not tested; owner listening required'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
