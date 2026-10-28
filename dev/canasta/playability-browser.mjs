import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.CANASTA_REVIEW_URL??'http://127.0.0.1:4338',out='qualification.local/canasta/playability/';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],e={passed:false,layouts:[],checks:[]};
page.setDefaultTimeout(10000);page.on('pageerror',x=>errors.push(x.message));
const read=async()=>await(await page.request.get(base+'/__canasta-fixture/state?viewer=2')).json();
const scene=async name=>{await page.goto(base+'/?scene='+name);await page.locator('.canasta-card').first().waitFor();};
const button=name=>page.getByRole('button',{name,exact:true});
const card=id=>page.locator('button[data-physical-id="'+id+'"]');
const melds=()=>page.getByRole('button',{name:/^Melds/}).click();
const commit=action=>Promise.all([page.waitForResponse(r=>r.url().includes('/action?')).then(r=>assert.equal(r.status(),200)),action()]);
const group=async(rank,ids)=>{for(const id of ids)await card(id).click();await melds();await page.getByLabel('New meld rank').selectOption(rank);await button('Add selected').click();};
try{
 for(const [width,height] of [[390,844],[430,932],[320,568],[812,375]]){
  await page.setViewportSize({width,height});
  for(const [name,count] of [['15',15],['30',30],['60',60],['maximum',71]]){
   await scene(name);
   const r=await page.locator('.canasta-card').evaluateAll(es=>{const box=es[0].closest('.canasta-hand-scroll').getBoundingClientRect();return{cards:es.map(e=>{const r=e.getBoundingClientRect();return{id:e.dataset.physicalId,w:r.width,h:r.height,x:r.x,visible:r.top>=box.top&&r.bottom<=box.bottom+1};}),pageWidth:document.documentElement.scrollWidth};});
   assert.equal(r.cards.length,count);assert.equal(new Set(r.cards.map(c=>c.id)).size,count);assert(r.cards.every(c=>c.w>=44&&c.h>=44&&c.x>=0&&c.x+c.w<=width+1));assert(r.pageWidth<=width);
   assert.equal(await page.getByRole('button',{name:/^(Next|Previous|Arrange|Finish|Sort)$/}).count(),0);
   if(name==='15'&&width>=390&&height>=844)assert(r.cards.every(c=>c.visible),'15 cards must be visible together');
   await page.locator('.canasta-card').last().scrollIntoViewIfNeeded();assert(await page.locator('.canasta-card').last().isVisible());
   await page.locator('.canasta-hand-scroll').evaluate(n=>n.scrollTop=0);await page.locator('.canasta-hand-area').evaluate(n=>n.scrollTop=0);
   await page.screenshot({animations:'disabled',path:out+name+'-'+width+'.png'});e.layouts.push({width,height,count,allCardsTogether:r.cards.every(c=>c.visible)});
  }
 }
 await page.setViewportSize({width:390,height:844});
 await scene('15');await card('fixture-0-0-Q').click();await card('fixture-1-0-Q').click();assert.equal(await page.locator('.canasta-card[aria-pressed=true]').count(),2);
 await melds();await page.getByLabel('New meld rank').selectOption('Q');await button('Add selected').click();await card('fixture-0-0-A').click();await button('Discard').click();assert(await button('Done').isDisabled());assert.match(await page.locator('.canasta-turn-status').innerText(),/at least three/);
 await card('fixture-joker-1-0').click();await melds();await button('Add selected to Q').click();
 await group('7',['fixture-0-0-7','fixture-0-1-7','fixture-0-2-7']);await card('fixture-joker-1-0').click();await melds();await button('Add selected to 7').click();
 assert.equal(await card('fixture-joker-1-0').locator('.canasta-card-note').innerText(),'→ 7');
 await melds();await button('Cancel draft').click();assert.equal(await page.locator('.canasta-card-note').count(),0);assert.equal((await read()).state.revision,1);
 e.checks.push('duplicate identities, invalid draft blocked, multiple drafts, wild reassignment, cancel without commit');
 await page.request.post(base+'/__canasta-fixture/reset');await page.goto(base+'/authority.html?viewer=2');await page.locator('.canasta-card').first().waitFor();
 const before=await read();let sends=0;const listener=req=>{if(req.url().includes('/action?'))sends++;};page.on('request',listener);
 await commit(()=>button('Draw two from stock').evaluate(n=>{n.click();n.click();}));
 const drawn=await read();assert.equal(drawn.state.revision,before.state.revision+1);assert.equal(drawn.state.hand.phase,'meld');assert.equal(drawn.state.hand.deadline,before.state.hand.deadline);assert.equal(sends,1);page.off('request',listener);
 e.checks.push('stock tap draws once despite repeated taps; deadline unchanged');
 await scene('frozen');const frozen=await read(),p=frozen.state.hand.players[frozen.state.viewer];
 await page.getByRole('button',{name:/^Discard pile:/}).click();assert(await button('Yes').isDisabled());await button('No').click();assert.equal((await read()).state.revision,1);
 await group('A',p.cards.filter(c=>c.face.rank==='A').map(c=>c.id));for(const c of p.cards.filter(c=>c.face.rank==='Q'))await card(c.id).click();
 await page.getByRole('button',{name:/^Discard pile:/}).click();assert(await button('Yes').isEnabled());await page.screenshot({animations:'disabled',path:out+'pickup-confirmation.png'});await commit(()=>button('Yes').click());
 const picked=await read();assert.equal(picked.state.hand.source,'pile');assert.equal(picked.state.hand.pileCount,0);assert.equal(picked.state.hand.deadline,frozen.state.hand.deadline);
 await page.goto(base+'/authority.html?viewer=2');await page.locator('.canasta-card').first().waitFor();assert.equal((await read()).state.revision,picked.state.revision);
 e.checks.push('frozen pickup Yes/No, opening qualification, committed pickup reconnect');
 await scene('reconnect');const initial=await read(),me=initial.state.viewer,cards=initial.state.hand.players[me].cards,q=cards.find(c=>c.face.rank==='Q');assert(q);
 await card(q.id).click();await melds();await page.screenshot({animations:'disabled',path:out+'add-to-meld.png'});await button('Add selected to Q').click();await card(cards.find(c=>c.id!==q.id).id).click();await button('Discard').click();
 assert(await button('Done').isEnabled());await commit(()=>button('Done').click());const done=await read();assert.equal(done.state.hand.players[me].melds.find(m=>m.rank==='Q').cards.length,4);assert.notEqual(done.state.hand.active,me);
 e.checks.push('existing meld extension and legal Done');
 for(const mode of ['out','out-meld']){
  await scene(mode);assert(await button('Go Out').isDisabled());await page.locator('.canasta-card').click();
  if(mode==='out')await button('Discard').click();else{await melds();await button('Add selected to Q').click();}
  assert(await button('Go Out').isEnabled());assert(await button('Done').isDisabled());await page.screenshot({animations:'disabled',path:out+mode+'-ready.png'});await commit(()=>button('Go Out').click());assert.equal((await read()).state.hand.phase,'complete');
 }
 e.checks.push('Go Out with final discard and without discard');assert.deepEqual(errors,[]);e.passed=true;
}catch(error){e.failure=error.stack;process.exitCode=1;await page.screenshot({animations:'disabled',path:out+'failure.png'});}
finally{e.errors=errors;writeFileSync(out+'browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));await browser.close();}
