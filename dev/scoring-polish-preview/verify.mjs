import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:4346',out='qualification.local/scoring-polish';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),errors=[],results=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.locator('.drop357-current [data-arcade-classic-suit]').waitFor();
 const larger=await page.locator('.drop357-current [data-arcade-classic-suit] path').boundingBox();
 await page.screenshot({path:out+'/357-drop-larger-suits.png'});
 await page.getByRole('button',{name:'Show original suits',exact:true}).click();
 const original=await page.locator('.drop357-current [data-arcade-classic-suit] path').boundingBox();
 assert(Math.abs(larger.height/original.height-1.4)<.03);
 await page.screenshot({path:out+'/357-drop-original-suits.png'});
 await page.getByRole('button',{name:'Show larger suits',exact:true}).click();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow);
 await page.getByRole('button',{name:'Cribbage',exact:true}).click();await page.locator('[data-ready=true]').waitFor();
 for(const name of ['Pair +2','Opponent +2','Last +1','Go','31 +2']){
  await page.getByRole('button',{name,exact:true}).click();
  await page.waitForFunction(()=>window.peggingEvidence.cues.length>0);
  const evidence=await page.evaluate(()=>window.peggingEvidence);
  if(name==='Go'){
   assert.equal(evidence.cues.length,1);assert(evidence.cues[0].id.startsWith('cribbage-go:'));
   assert(evidence.cues[0].scheduledAt!==null);assert.equal(evidence.landedAt,null);
   assert.deepEqual(evidence.scores,{p1:10,p2:20});
   await page.getByText('Go declared — no points',{exact:true}).waitFor();
   await page.waitForFunction(()=>{const bubble=document.querySelector('[data-cribbage-go-bubble]');return bubble&&getComputedStyle(bubble).opacity==='1';});
   await page.screenshot({path:out+'/cribbage-go.png'});results.push({name,evidence});continue;
  }
  assert(evidence.landedAt!==null&&evidence.cues[0].at>=evidence.landedAt,JSON.stringify(evidence));
  assert(evidence.transitionAt!==null,JSON.stringify(evidence));
  const onset=evidence.cues[0].scheduledAt;
  assert(onset!==null&&onset>=evidence.transitionAt&&onset-evidence.transitionAt<=120,JSON.stringify(evidence));
  assert(evidence.cues[0].duration>0);assert(evidence.cues[0].title.includes(name.includes('+1')?'+1':'+2'));
  if(name==='Opponent +2'){assert(evidence.cues[0].title.startsWith('Opponent:'));assert.deepEqual(evidence.scores,{p1:10,p2:22});}
  if(name==='Last +1'){
   await page.screenshot({path:out+'/cribbage-last-point.png'});
   await page.waitForFunction(()=>window.peggingEvidence.countingAt!==null);
   const finished=await page.evaluate(()=>window.peggingEvidence);
   assert(finished.countingAt>=finished.cues[0].at+finished.cues[0].duration);assert.equal(finished.cues.length,1);
  }
  results.push({name,evidence});
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/evidence.json',JSON.stringify({larger,original,results,errors},null,2));
 console.log('PASS: suits 40% larger; self/opponent, Last and 31 audio starts within 120 ms of visual landing; Go has its own tone and no points; final cue and notice finish before counting.');
}finally{await browser.close();}
