import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const mode=process.argv[2]??'after',exposed=process.argv[3]==='exposed',dir='dev/mega-card-golf/ui-transitions/evidence.local/';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5198/dev/mega-card-golf/ui-transitions/index.html?echoes');
 await page.getByRole('button',{name:'Stand Pat',exact:true}).waitFor();
 await page.evaluate(()=>{
  window.actionFrames=[];window.actionTransitions=[];let prior='';
  const sample=()=>{
   const state=name=>{const e=[...document.querySelectorAll('.mega-draw-area>button')].find(e=>e.textContent===name);return !e?'hidden':e.disabled?'disabled':'enabled';};
   const frame={at:performance.now(),stand:state('Stand Pat'),discard:state('Discard'),stage:document.querySelector('[data-replacement-stage]')?.getAttribute('data-replacement-stage')??'idle'};
   window.actionFrames.push(frame);const key=JSON.stringify([frame.stand,frame.discard,frame.stage]);if(key!==prior){window.actionTransitions.push(frame);prior=key;}
   window.actionFrameId=requestAnimationFrame(sample);
  };sample();
 });
 await page.locator('.mega-tableau>.mega-card').nth(exposed?0:1).tap();
 await page.locator('[data-replacement-stage="'+(exposed?'arrive':'reveal')+'"]').waitFor();
 await page.getByRole('button',{name:'Discard',exact:true}).waitFor();
 // Fixture echo arrives 700ms after response, later than the 350ms stock reveal.
 await page.waitForTimeout(1300);
 const evidence=await page.evaluate(()=>{cancelAnimationFrame(window.actionFrameId);return {frames:window.actionFrames,transitions:window.actionTransitions,events:window.megaFixture.events};});
 const states=evidence.transitions.map(x=>x.stand).filter((s,i,a)=>i===0||s!==a[i-1]);
 const afterHidden=states.slice(states.indexOf('hidden')+1);
 const pulse=afterHidden.some((s,i)=>s==='enabled'&&afterHidden[i+1]==='disabled'&&afterHidden[i+2]==='enabled');
 const discardStates=evidence.transitions.map(x=>x.discard).filter((s,i,a)=>i===0||s!==a[i-1]);
 writeFileSync(dir+'echo-'+mode+(exposed?'-exposed':'')+'.json',JSON.stringify({...evidence,states,discardStates,pulse,errors},null,2));
 console.log(JSON.stringify({mode,frames:evidence.frames.length,states,pulse,transitions:evidence.transitions,events:evidence.events,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(pulse,mode==='before');
 if(mode!=='before'){assert.deepEqual(afterHidden,['enabled']);assert.deepEqual(discardStates.slice(discardStates.indexOf('hidden')+1),['enabled']);}
}finally{await browser.close();}
