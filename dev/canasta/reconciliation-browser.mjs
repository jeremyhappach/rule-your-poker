import {chromium,expect} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4332',errors=[],layouts=[];
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
const read=async viewer=>(await fetch(`${base}/__canasta-fixture/state?viewer=${viewer}`)).json();
const output='docs/codex/evidence/canasta-mobile/';
try{
 await fetch(base+'/__canasta-fixture/reset',{method:'POST'});
 const pages=[];for(const viewer of [1,2]){
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`${base}/authority.html?viewer=${viewer}`);await p.getByRole('button',{name:/Arrange \d+ cards/}).waitFor();pages.push(p);
 }
 const first=await read(1),active=first.state.hand.active===first.state.viewer?1:2,p=pages[active-1];
 const initial=await read(active),own=initial.state.viewer;
 assert(initial.state.hand.players[own].cards.length===15);
 for(const [id,seat] of Object.entries(initial.state.hand.players))if(id!==own)assert(!seat.cards,'opponent cards must remain private');
 await p.getByRole('button',{name:/Arrange \d+ cards/}).click();await p.getByRole('button',{name:'Finish',exact:true}).click();
 await p.getByRole('button',{name:'Draw two',exact:true}).click();await expect.poll(async()=>(await read(active)).state.hand.phase).toBe('meld');
 const drawn=await read(active);assert.equal(drawn.state.hand.deadline,initial.state.hand.deadline);assert.equal(drawn.state.hand.players[own].cards.length,17);
 await p.getByRole('button',{name:'Hand',exact:true}).click();const card=p.locator('button[data-physical-id]').first();await card.click();
 await p.getByRole('button',{name:'Sort',exact:true}).click();await expect(p.getByText('1 selected',{exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Discard',exact:true}).click();await p.getByRole('button',{name:'Cancel draft',exact:true}).click();
 assert.equal((await read(active)).state.revision,drawn.state.revision);
 await p.getByRole('button',{name:'Hand',exact:true}).click();await p.locator('button[data-physical-id]').first().click();await p.getByRole('button',{name:'Discard',exact:true}).click();
 await p.getByRole('button',{name:'Submit turn',exact:true}).click();await expect.poll(async()=>(await read(active)).state.hand.turn).toBeGreaterThan(drawn.state.hand.turn);
 const committed=await read(active);assert.equal(committed.state.hand.players[own].cards.length,16);
 await p.reload();await p.getByRole('button',{name:'Arrange 16 cards',exact:true}).waitFor();
 assert.deepEqual((await read(active)).state.hand.players[own],committed.state.hand.players[own]);
 await p.getByRole('button',{name:'Expire test turn',exact:true}).click();
 await expect.poll(async()=>(await read(active)).state.automatic.length).toBe(1);
 const other=pages[2-active];await other.getByRole('checkbox',{name:'Auto-play'}).waitFor();await expect(other.getByRole('checkbox',{name:'Auto-play'})).toBeChecked();
 const beforePause=await read(active);await p.getByRole('button',{name:'Expire test turn',exact:true}).click();
 await expect.poll(async()=>!!(await read(active)).state.pause).toBe(true);
 const paused=await read(active);assert.equal(paused.state.hand.stockCount,beforePause.state.hand.stockCount);assert.equal(paused.state.hand.turn,beforePause.state.hand.turn);
 await p.getByRole('checkbox',{name:'Auto-play'}).click();await expect.poll(async()=>(await read(active)).state.automatic.includes(own)).toBe(false);
 assert((await read(active)).state.pause,'reclaim must not silently resume');
 await p.getByRole('button',{name:'Resume test match',exact:true}).click();await expect.poll(async()=>(await read(active)).state.pause).toBeNull();
 await p.screenshot({path:output+'reconciled-authority-portrait.png'});
 const layout=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});layout.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of [[320,568],[430,932],[812,375]])for(const [scene,count] of [['15',15],['30',30],['60',60],['maximum',71]]){
  await layout.setViewportSize({width,height});await layout.goto(`${base}/?scene=${scene}`);await layout.getByRole('button',{name:`Arrange ${count} cards`,exact:true}).click();
  await layout.locator('button[data-physical-id]').first().waitFor();const ids=new Set();let min=Infinity;
  for(let page=0;page<80;page++){
   await layout.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const cards=await layout.locator('button[data-physical-id]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.physicalId,w:r.width,h:r.height,x:r.x,y:r.y};}));
   for(const c of cards){ids.add(c.id);min=Math.min(min,c.w,c.h);assert(c.w>=44&&c.h>=44);assert(c.x>=0&&c.y>=0&&c.x+c.w<=width+1&&c.y+c.h<=height+1);}
   const next=layout.getByRole('button',{name:'Next',exact:true});if(await next.isDisabled())break;await next.click();
  }
  assert.equal(ids.size,count);assert.equal(await layout.locator('[data-canonical-shell-root]').count(),1);layouts.push({width,height,scene,count:ids.size,minTarget:min});
  if(scene==='maximum'&&width===812)await layout.screenshot({path:output+'reconciled-maximum-landscape.png'});
 }
 assert.deepEqual(errors,[]);const result={at:new Date().toISOString(),passed:true,checks:['two redacted human views','draw preserves deadline','selection survives sorting','draft cancellation has no commit','discard and reconnect preserve committed cards','eligible expiry Auto-play','all-human pause without drawing','reclaim separate from resume','single canonical shell'],layouts,errors,
 limitations:['loopback in-memory reducer transport; no hosted Auth/Realtime/financial evidence','emulated mobile viewports, not native iPhone acceptance']};
 writeFileSync(output+'reconciliation-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
