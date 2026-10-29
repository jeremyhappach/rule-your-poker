import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync as write,readFileSync} from 'node:fs';
// DOM observations allow one 100ms presentation-clock tick for render scheduling.
const base='http://127.0.0.1:15327',out='qualification.local/async-combined',checks=process.argv.includes('--reduced')?fsReadPrior():[];
function fsReadPrior(){return JSON.parse(readFileSync(out+'/holds-browser-normal.json','utf8'));}
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const warm=await browser.newPage();await warm.goto(base+'/review-warmup',{waitUntil:'domcontentloaded',timeout:120000});await warm.waitForFunction(()=>document.body.dataset.reviewReady==='true',null,{timeout:120000});await warm.close();
 for(const reduced of process.argv.includes('--reduced')?[true]:[false,true])for(const game of ['quintzee','run21','tri-towers','boxdrop']){
  await fetch(base+'/fixture-review-api',{method:'POST',body:JSON.stringify({op:'fixture_reset'})});
  const finalMatch=reduced&&game==='quintzee',terminal=game==='tri-towers'||finalMatch;
  if(terminal)await fetch(base+'/fixture-review-api',{method:'POST',body:JSON.stringify({op:'fixture_terminal',childId:'turn-'+game,matchFinale:finalMatch})});
  const page=await browser.newPage({viewport:{width:reduced?320:390,height:844},reducedMotion:reduced?'reduce':'no-preference'}),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')requests.push(r.postDataJSON());});
  const cells=game==='quintzee'?'.q-players .tri-score-cell':game==='run21'?'.async-score-pills .tri-score-cell':game==='tri-towers'?'.tri-score-group .tri-score-cell':'.box-scores .box-score',final=game==='run21'?130000:game==='tri-towers'?125780:90000;
  await page.addInitScript(({cells,final})=>{
   window.holdEvidence={};const check=()=>{const t=performance.now(),v=window.holdEvidence,p=document.querySelectorAll(cells),review=document.querySelector('.async-result-review');
    if(review&&p.length===2&&p[1].textContent.includes('39,848'))v.opponentSettled??=t;
    if(document.body?.textContent.includes('Your turn!'))v.handoff??=t;
    if(!review&&p.length===2&&p[0].textContent.includes(final.toLocaleString()))v.ownSettled??=t;
    if(v.ownSettled&&(document.querySelector('.delayed-match-home')||document.querySelector('.async-winner-overlay')))v.returned??=t;
   };new MutationObserver(check).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
  },{cells,final});
  await page.goto(base+'/delayed/turns/play/turn-'+game);await page.locator('.async-result-review').waitFor();
  if(reduced&&game==='run21'){await page.reload();await page.locator('.async-result-review').waitFor();}
  await page.getByText('Your turn!',{exact:true}).waitFor({timeout:30000});
  const opponent=await page.evaluate(()=>window.holdEvidence.handoff-window.holdEvidence.opponentSettled);assert(opponent>=2900,'opponent hold '+opponent);assert.equal(requests.filter(r=>r.op==='action').length,0);
  await page.waitForFunction(selector=>!document.querySelector('.async-result-review')&&document.querySelectorAll(selector).length===2,cells);
  if(game==='quintzee')await page.getByRole('button',{name:'Start',exact:true}).click();
  const button=game==='quintzee'?page.getByRole('button',{name:'Any: unfilled'}):game==='run21'?page.getByRole('button',{name:/Take Win|Give Up/}):page.getByRole('button',{name:'Take Score',exact:true});await button.click();
  await page.waitForFunction(()=>window.holdEvidence.returned!==undefined,null,{timeout:25000});
  const own=await page.evaluate(()=>window.holdEvidence.returned-window.holdEvidence.ownSettled);assert(own>=2900,'own hold '+own);
  if(terminal){await page.getByText('Game Complete',{exact:true}).waitFor();if(finalMatch){await page.getByRole('link',{name:'Back to Lobby',exact:true}).waitFor({timeout:15000});await page.waitForTimeout(4000);assert.equal(await page.locator('.async-finale[data-phase=breakdown]').count(),1);await page.screenshot({path:out+'/holds-persistent-final.png'});await page.getByRole('link',{name:'Back to Lobby',exact:true}).click();await page.getByRole('heading',{name:'Completed Sessions'}).waitFor();}else await page.locator('.delayed-match-home').waitFor();}
  else {await page.reload();await page.locator('.delayed-match-home').waitFor();}
  assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const ack=requests.filter(r=>r.name==='delayed_review_ack'&&r.args.p_event==='review-turn-'+game);assert.equal(ack.length,1);
  const result={game,reduced,terminal,finalMatch,opponentHold:opponent,ownHold:own};checks.push(result);console.log('PASS',JSON.stringify(result));await page.close();
 }
 write(out+'/holds-browser.json',JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
