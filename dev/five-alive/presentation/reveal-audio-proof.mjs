import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';

// Actual browser animation events, visibility checks, mixer and approved PCM.
// Only the transport is the existing disposable Five Alive rule fixture.
const bytes=readFileSync('src/assets/audio/flip-soft.wav');
let expected;
for(let at=12;at+8<=bytes.length;){
 const length=bytes.readUInt32LE(at+4);
 if(bytes.toString('ascii',at,at+4)==='data'){
  let hash=2166136261;for(let i=0;i<length;i+=2)hash=Math.imul(hash^(bytes.readInt16LE(at+8+i)&65535),16777619)>>>0;
  expected={hash,length:length/2};break;
 }at+=8+length+(length%2);
}
assert.ok(expected);
const {server,url}=await startPreview(0),origin=new URL(url).origin;
const browser=await chromium.launch({channel:'msedge',headless:true});
const output='qualification.local/five-alive/reveal-audio';mkdirSync(output,{recursive:true});
const results=[],errors=[];
try{
 for(const mode of ['arcade','async'])for(const edgeOn of [true,false]){
  const context=await browser.newContext({viewport:{width:430,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.addInitScript(({edgeOn})=>{
   window.flipSources=[];window.flipEdges=[];
   const start=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(...args){
    if(this.buffer?.length>1){let hash=2166136261;for(const sample of this.buffer.getChannelData(0))hash=Math.imul(hash^(Math.round(sample*32768)&65535),16777619)>>>0;
     window.flipSources.push({at:performance.now(),hash,length:this.buffer.length});}
    return start.apply(this,args);
   };
   document.addEventListener('animationstart',event=>{
    if(!event.isTrusted||event.animationName!=='five-alive-flip-open')return;
    const tile=event.target,animation=tile.getAnimations().find(a=>a.animationName===event.animationName);
    // Deterministically exercise animationstart at t=0, when the tile is
    // exactly edge-on, rather than depending on a browser's first-frame delay.
    if(edgeOn){animation.pause();animation.currentTime=0;}
    window.flipEdges.push({at:performance.now(),width:tile.getBoundingClientRect().width,column:[...tile.parentElement.children].indexOf(tile)});
    queueMicrotask(()=>{
     if(edgeOn)animation.play();
     tile.dispatchEvent(new AnimationEvent('animationstart',{animationName:event.animationName,bubbles:true}));
    });
   },true);
  },{edgeOn});
  await context.request.post(origin+'/fixture/reset?mode='+mode);
  await page.goto(url+'?mode='+mode+'&player=a');
  await page.evaluate(async()=>{
   const {platformAudio}=await import('/src/lib/audio/platformAudio.ts');
   platformAudio.install();platformAudio.setUser('a');platformAudio.acquireGameplay();
   await (await import('/src/lib/audio/approvedSounds.ts')).preloadApprovedSounds();
   platformAudio.setPreference('a',true);window.testAudio=platformAudio;
  });
  const idle=()=>page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard button:not(:disabled)'));
  await idle();
  await page.keyboard.type('STARE',{delay:150});await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.flipEdges.length===5);await idle();
  const result=await page.evaluate(hash=>({flips:window.flipEdges,sources:window.flipSources.filter(source=>source.hash===hash)}),expected.hash);
  results.push({mode,edgeOn,...result});
  if(edgeOn)assert.ok(result.flips.every(f=>f.width===0));
  assert.equal(result.sources.length,5,mode+' plays each opening exactly once, including duplicate events');
  for(let i=0;i<5;i++){
   assert.equal(result.sources[i].length,expected.length);
   assert.ok(result.sources[i].at>=result.flips[i].at&&result.sources[i].at-result.flips[i].at<80,'synchronized with feedback opening');
  }
  await page.evaluate(()=>{window.testAudio.setPreference('a',false);window.flipSources=[];window.flipEdges=[];});
  await page.keyboard.type('AMPLE',{delay:100});await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.flipEdges.length===5);await idle();
  assert.deepEqual(await page.evaluate(()=>window.flipSources),[]);
  await page.reload();await idle();
  assert.deepEqual(await page.evaluate(()=>window.flipEdges),[]);
  assert.deepEqual(await page.evaluate(()=>window.flipSources),[]);
  assert.equal(await page.locator('.five-alive-row').nth(1).locator('[data-color]:not([data-color=""])').count(),5);
  await context.close();
 }
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/evidence.json',JSON.stringify({passed:true,results,mutedAndRestoredSilent:true,errors},null,2));
 console.log(JSON.stringify({passed:true,cases:results.map(r=>({mode:r.mode,edgeOn:r.edgeOn,flips:r.flips.length,sources:r.sources.length})),mutedAndRestoredSilent:true,errors}));
}catch(error){writeFileSync(output+'/failure.json',JSON.stringify({message:error.message,results,errors},null,2));throw error;}
finally{await browser.close();server.httpServer?.closeAllConnections();await server.close();}
