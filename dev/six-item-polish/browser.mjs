import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='qualification.local/six-item-polish';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const evidence=[],errors=[];
async function touchDrag(cdp,from,to){
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y,id:1}]});
 for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/5,y:from.y+(to.y-from.y)*i/5,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
const center=async locator=>{const b=await locator.boundingBox();assert.ok(b);return {x:b.x+b.width/2,y:b.y+b.height/2};};
try{
 for(const mode of process.argv.includes('--surfaces')?[]:['multiplayer','async'])for(const [width,height] of [[390,844],[320,568],[430,932],[844,390],[1280,900]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:true}),page=await context.newPage(),cdp=await context.newCDPSession(page);
  page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:5189/?mode='+mode+'&committed=1');await page.locator('.words-viewport').waitFor();
  const viewport=page.locator('.words-viewport'),grid=page.locator('.words-grid');
  const b=await viewport.boundingBox();assert.ok(b.width>40&&b.height>40,JSON.stringify(b));
  for(const fx of [.04,.5,.96])for(const fy of [.04,.5,.96]){
   await viewport.focus();await page.keyboard.press('Escape');for(let i=0;i<4;i++)await page.keyboard.press('+');
   const before=await grid.getAttribute('style');
   const from={x:b.x+b.width*fx,y:b.y+b.height*fy},to={x:from.x+(fx>.5?-14:14),y:from.y+(fy>.5?-14:14)};
   const hit=await page.evaluate(p=>{const e=document.elementFromPoint(p.x,p.y);return {tag:e?.tagName,cls:e?.className};},from);
   await touchDrag(cdp,from,to);
   const after=await grid.getAttribute('style');
   assert.notEqual(after,before,JSON.stringify({mode,width,height,fx,fy,hit,before,after}));
  }
  await page.getByRole('button',{name:'Reset Zoom'}).tap();assert.equal(await viewport.getAttribute('data-zoom'),'1');
  // Native pinch retains the same camera owner.
  const mid={x:b.x+b.width/2,y:b.y+b.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mid.x-25,y:mid.y,id:1},{x:mid.x+25,y:mid.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid.x-45,y:mid.y,id:1},{x:mid.x+45,y:mid.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(Number(await viewport.getAttribute('data-zoom'))>1);
  await page.getByRole('button',{name:'Reset Zoom'}).tap();
  const ids=()=>page.locator('.words-rack button').evaluateAll(es=>es.map(e=>e.dataset.tileId));
  const original=await ids(),from=await center(page.locator('[data-tile-id="0"]')),target=await center(page.locator('[data-tile-id="3"]'));
  await touchDrag(cdp,from,target);assert.deepEqual(await ids(),['1','2','3','0','4','5','6']);
  await page.evaluate(()=>window.polishRerender());assert.deepEqual(await ids(),['1','2','3','0','4','5','6']);
  // Duplicate blank identity remains independent; returning a staged tile still works.
  await touchDrag(cdp,await center(page.locator('[data-tile-id="6"]')),await center(page.locator('[data-tile-id="1"]')));
  assert.equal((await ids())[0],'6');
  await touchDrag(cdp,await center(page.locator('[data-tile-id="2"]')),await center(page.locator('[data-square="113"]')));
  assert.equal(await page.locator('.is-staged').count(),1);
  await touchDrag(cdp,await center(page.locator('[data-square="113"]')),await center(page.locator('.words-rack')));
  assert.equal(await page.locator('.is-staged').count(),0);
  assert.deepEqual((await ids()).sort(),original.sort());
  await page.screenshot({path:out+'/'+mode+'-'+width+'x'+height+'.png'});
  evidence.push({mode,width,height,panLocations:9,pinch:true,rackReorder:true,rerender:true,boardRoundtrip:true});await context.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5189/?mode=async&cross=1');await page.locator('.words-grid').waitFor();
 await page.locator('[data-tile-id="0"]').tap();await page.locator('[data-square="112"]').tap();
 await page.locator('[data-tile-id="1"]').tap();await page.locator('[data-square="113"]').tap();
 await page.getByRole('button',{name:'Submit Word (+58)',exact:true}).waitFor();
 await page.getByRole('button',{name:'Submit Word (+58)',exact:true}).tap();
 await page.getByRole('alert').filter({hasText:'Invalid words: ZA, QX'}).waitFor();
 assert.equal(await page.locator('.is-staged').count(),2);
 await page.screenshot({path:out+'/invalid-crosswords.png'});
 await page.getByRole('button',{name:'Undo',exact:true}).tap();await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));
 evidence.push({serverPreview:58,allInvalidWords:['ZA','QX'],preservedDraft:true});
 await page.goto('http://127.0.0.1:5189/dev/six-item-polish/table.html?game=holm');await page.locator('[data-canonical-shell-hud-grid]').waitFor();
 await page.screenshot({path:out+'/actual-table.png'});
 await page.goto('http://127.0.0.1:5189/?mode=artifacts');await page.locator('[data-owner]').first().waitFor();
 const colors=await page.locator('[data-owner]').evaluateAll(rows=>rows.map(row=>({owner:row.dataset.owner,dice:[...row.querySelectorAll('button')].map(e=>getComputedStyle(e).backgroundColor)})));
 for(const row of colors){assert.equal(row.dice[0],'rgb(255, 255, 255)');assert.equal(row.dice[2],'rgb(255, 255, 255)');assert.notEqual(row.dice[1],row.dice[0]);}
 assert.equal(await page.locator('[data-hud-sample]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 await page.screenshot({path:out+'/artifacts.png'});evidence.push({artifacts:colors});
 await page.goto('http://127.0.0.1:5189/?mode=lobby');await page.locator('.midnight-match').first().waitFor();
 const cards=await page.locator('.midnight-match').evaluateAll(es=>es.map(e=>({href:e.querySelector('a').getAttribute('href'),action:e.dataset.turn,background:getComputedStyle(e).backgroundImage,border:getComputedStyle(e).borderColor})));
 assert.equal(cards.filter(c=>c.action==='own').length,4);assert.equal(cards.at(-1).action,'opponent');
 for(const c of cards.filter(c=>c.action==='own'))assert.ok(c.background.includes('22, 60, 44'));
 await page.screenshot({path:out+'/async-actions.png'});
 await page.evaluate(()=>window.polishClear());await page.waitForFunction(()=>document.querySelectorAll('.midnight-match[data-turn="own"]').length===0);
 await page.reload();await page.locator('.midnight-match').first().waitFor();assert.equal(await page.locator('.midnight-match[data-turn="own"]').count(),0);
 evidence.push({asyncCards:cards,clearedOnRealtime:true});
 assert.deepEqual(errors,[]);writeFileSync(out+(process.argv.includes('--surfaces')?'/surfaces.json':'/browser.json'),JSON.stringify({passed:true,evidence,errors},null,2));console.log(JSON.stringify({passed:true,viewports:evidence.filter(e=>e.mode).length,nativePanChecks:evidence.filter(e=>e.mode).length*9,evidence},null,2));
}catch(error){writeFileSync(out+'/failure.json',JSON.stringify({message:error.message,evidence,errors},null,2));throw error;}
finally{await browser.close();}
