import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.CANASTA_REVIEW_URL??'http://127.0.0.1:4338',out='qualification.local/canasta/summary/';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage(),errors=[],evidence={fixture:true,passed:false,layouts:[],checks:[]};
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
const scene=async name=>{await page.goto(base+'/?scene='+name);await page.locator('.canasta-card').first().waitFor();};
const close=()=>page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
async function readable(scope){
 const result=await scope.locator('.canasta-fan-slot').evaluateAll(slots=>slots.map((slot,i)=>{
  const root=slot.querySelector('[data-playing-card-root]'),r=root.getBoundingClientRect(),next=slots[i+1]?.getBoundingClientRect();
  const right=next&&Math.abs(next.y-r.y)<5?Math.min(r.right,next.x):r.right;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),marks=[];let node;
  while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);const b=range.getBoundingClientRect();marks.push({text:node.textContent.trim(),left:b.left,right:b.right});}
  return {id:slot.dataset.fanCard,marks,clear:marks.every(b=>b.left>=r.left-.5&&b.right<=right+.5),width:r.width};
 }));
 assert(result.every(r=>r.clear),'Covered rank/suit/Joker: '+JSON.stringify(result.filter(r=>!r.clear)));
 return result.length;
}
try{
 for(const [width,height] of (process.argv.includes('--landscape-only')?[[812,375]]:[[390,844],[430,932],[320,568],[812,375]])){
  await page.setViewportSize({width,height});await scene('melds');
  const summary=page.getByLabel('Opponent meld summary');await summary.waitFor().catch(async error=>{
    await page.screenshot({animations:'disabled',path:out+'packing-failure.png'});
    console.log(await page.locator('[data-canonical-felt-interaction-layer], [data-canonical-felt-plate], [data-canonical-seat-cluster], [data-card-anchor^="opp-stack-"], .canasta-piles').evaluateAll(es=>es.map(e=>({tag:e.outerHTML.slice(0,220),rect:e.getBoundingClientRect().toJSON()}))));throw error;
  });
  assert.equal(await summary.locator('[data-playing-card-root]').count(),0);assert.equal(await summary.getByRole('button').count(),5);
  assert.equal(await summary.locator('[data-complete=true]').count(),2);
  const containment=await page.locator('.canasta-meld-summary,.canasta-piles').evaluateAll(es=>{const layer=es[0].closest('[data-canonical-felt-interaction-layer]'),r=layer.getBoundingClientRect();return es.map(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;});});assert(containment.every(Boolean));
  assert.equal(await readable(page.locator('.canasta-hand-grid')),7);
  await page.screenshot({animations:'disabled',path:out+'table-'+width+'.png'});
  await summary.locator('[data-summary-rank="7"]').click();const dialog=page.getByRole('dialog');
  assert.equal(await readable(dialog),7);assert.equal(await dialog.locator('small').count(),0);
  await page.screenshot({animations:'disabled',path:out+'inspect-'+width+'.png'});await close();
  await page.getByRole('button',{name:/^Melds/}).click();
  assert.match(await page.locator('.canasta-meld-list > section').first().innerText(),/^RED THREES/);
  assert.deepEqual(await page.locator('[data-meld-rank]').evaluateAll(es=>es.map(e=>e.dataset.meldRank)),['8','Q','A','5','10']);
  await readable(page.getByRole('dialog'));await page.screenshot({animations:'disabled',path:out+'own-'+width+'.png'});
  await page.getByRole('button',{name:'Opponent melds',exact:true}).click();assert.equal(await readable(page.getByRole('dialog')),25);
  await page.screenshot({animations:'disabled',path:out+'opponent-'+width+'.png'});await close();
  evidence.layouts.push({width,height,summaryRows:5,canastas:2,opponentCardsReadable:25});
 }
 await page.setViewportSize({width:390,height:844});await scene('15');
 for(const id of ['fixture-0-0-Q','fixture-1-0-Q'])await page.locator(`[data-physical-id="${id}"]`).click();
 assert.equal(await page.locator('.canasta-card[aria-pressed=true]').count(),2);await readable(page.locator('.canasta-hand-grid'));
 const targets=await page.locator('.canasta-card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height};}));assert(targets.every(t=>t.width>=44&&t.height>=44));
 await page.screenshot({animations:'disabled',path:out+'duplicates-390.png'});
 await page.getByRole('button',{name:'Geometry Lab',exact:true}).click();await page.getByRole('combobox').first().click();await page.getByRole('option',{name:'Canasta',exact:true}).click();
 const input=page.getByLabel('Canasta Card width');await input.fill('60');await input.press('Enter');
 assert.equal(await page.locator('.canasta-hand-grid [data-playing-card-root]').first().evaluate(e=>e.getBoundingClientRect().width),60);
 const overlap=page.getByLabel('Canasta Hand fan overlap');await overlap.fill('0');await overlap.press('Enter');
 assert.equal(await page.locator('.canasta-card').first().evaluate(e=>e.getBoundingClientRect().width),60);
 await page.screenshot({animations:'disabled',path:out+'geometry-lab.png'});await close();
 assert.equal(await page.locator('.canasta-hand-grid [data-playing-card-root]').first().evaluate(e=>e.getBoundingClientRect().width),48);
 assert.equal(await page.locator('.canasta-card[aria-pressed=true]').count(),2);
 await scene('out');await page.locator('[data-summary-rank]').first().click();
 const snap=await(await page.request.get(base+'/__canasta-fixture/state?viewer=2')).json(),state=snap.state,h=state.hand;
 const finished=await page.request.post(base+'/__canasta-fixture/action?viewer=2',{data:{matchId:state.id,handId:h.id,turn:h.turn,generation:h.generation,revision:state.revision,requestId:crypto.randomUUID(),playerId:state.viewer,action:{type:'finish',groups:[],discard:h.players[state.viewer].cards[0].id}}});
 assert.equal(finished.status(),200);await page.getByRole('dialog').waitFor({state:'hidden'});
 evidence.checks=['summary-only felt; complete/incomplete distinction; tap to inspect','rank/suit/Joker text unobscured in every fan','44px effective hand targets and duplicate physical selection','actual Geometry Lab controls preview; close restores; selection retained'];
 evidence.checks.push('an authoritative completed hand closes the public card inspector');
 assert.deepEqual(errors,[]);evidence.passed=true;
}finally{writeFileSync(out+'browser.json',JSON.stringify({...evidence,errors},null,2));await browser.close();}
console.log(JSON.stringify(evidence,null,2));
