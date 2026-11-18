import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';

// Match the actual native AudioBuffer samples against the approved WAV bytes.
function fingerprint(name){
 const bytes=readFileSync(resolve('src/assets/audio/'+name+'.wav'));
 for(let at=12;at+8<=bytes.length;){const length=bytes.readUInt32LE(at+4);
  if(bytes.toString('ascii',at,at+4)==='data'){
   let hash=2166136261;for(let i=0;i<length;i+=2)hash=Math.imul(hash^(bytes.readInt16LE(at+8+i)&65535),16777619)>>>0;
   return {hash,length:length/2};
  }at+=8+length+(length%2);
 }throw Error('Missing approved PCM');
}
const expected={peg:fingerprint('peg-wood'),flip:fingerprint('flip-soft')};
const {server,url}=await startPreview(5198),origin=new URL(url).origin;
const output=resolve('qualification.local/five-alive/polish');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1000,height:1100}}),page=await context.newPage(),errors=[],external=[];
page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
await page.addInitScript(()=>{
 window.faPcm=[];window.faFlips=[];
 const NativeContext=window.AudioContext;window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.faAudioContext=this;}};
 const start=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){
  if(this.buffer?.length>1){let hash=2166136261;for(const sample of this.buffer.getChannelData(0))hash=Math.imul(hash^(Math.round(sample*32768)&65535),16777619)>>>0;
   window.faPcm.push({time:performance.now(),hash,length:this.buffer.length,rate:this.buffer.sampleRate});
  }return start.apply(this,args);
 };
 document.addEventListener('animationstart',e=>{if(e.animationName==='five-alive-flip-open')window.faFlips.push({time:performance.now(),column:[...e.target.parentElement.querySelectorAll('.five-alive-tile')].indexOf(e.target)});},true);
});
const idle=()=>page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard')&&!document.querySelector('.five-alive-keyboard button:disabled'));
try{
 await page.goto(url.replace('index.html','polish.html'));assert.equal(new URL(page.url()).origin,origin);await idle();
 await page.evaluate(async()=>{await(await import('/src/lib/audio/approvedSounds.ts')).preloadApprovedSounds();});
 await page.getByRole('button',{name:'Enable sounds',exact:true}).click();await page.waitForFunction(()=>window.faAudioContext?.state==='running');
 await page.locator('.five-alive-tile').first().scrollIntoViewIfNeeded();
 await page.keyboard.type('STARE',{delay:220});
 const placed=await page.evaluate(()=>window.faPcm);assert.equal(placed.length,5);assert.ok(placed.every(p=>p.hash===expected.peg.hash&&p.length===expected.peg.length));
 await page.keyboard.type('X');await page.keyboard.press('Backspace');assert.equal((await page.evaluate(()=>window.faPcm)).length,5);
 await page.keyboard.type('E');assert.equal((await page.evaluate(()=>window.faPcm)).length,6);
 await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));await idle();
 const pcm=await page.evaluate(()=>window.faPcm),flips=await page.evaluate(()=>window.faFlips),flipPcm=pcm.filter(p=>p.hash===expected.flip.hash);
 assert.equal(flipPcm.length,5);assert.deepEqual(flips.map(f=>f.column),[0,1,2,3,4]);
 for(let i=0;i<5;i++){assert.equal(flipPcm[i].length,expected.flip.length);assert.ok(flipPcm[i].time>=flips[i].time&&flipPcm[i].time-flips[i].time<80,'audio begins at that tile’s feedback opening edge');}
 await page.getByRole('button',{name:'Mute sounds',exact:true}).click();await page.getByRole('button',{name:'Enable sounds',exact:true}).waitFor();
 await page.evaluate(()=>{window.faPcm=[];window.faFlips=[];});await page.locator('.five-alive-tile').first().scrollIntoViewIfNeeded();
 await page.keyboard.type('AMPLE',{delay:130});await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));await idle();
 assert.deepEqual(await page.evaluate(()=>window.faPcm),[]);assert.equal((await page.evaluate(()=>window.faFlips)).length,5);
 await page.reload();await idle();assert.deepEqual(await page.evaluate(()=>window.faPcm),[]);assert.deepEqual(await page.evaluate(()=>window.faFlips),[]);
 assert.deepEqual(await page.locator('.five-alive-row').evaluateAll(rows=>rows.slice(0,2).map(row=>[...row.querySelectorAll('.five-alive-tile')].map(t=>t.textContent).join(''))),['STARE','AMPLE']);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const evidence={passed:true,expected,placementSources:6,flipSources:5,pcm,flips,mutedSources:0,restoredSources:0,history:['STARE','AMPLE'],errors,external};
 writeFileSync(output+'/placement-flip-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}catch(error){writeFileSync(output+'/placement-flip-failure.json',JSON.stringify({message:error.message,stack:error.stack,pcm:await page.evaluate(()=>window.faPcm),flips:await page.evaluate(()=>window.faFlips),errors,external},null,2));throw error;}
finally{await browser.close();server.httpServer?.closeAllConnections();await server.close();}
