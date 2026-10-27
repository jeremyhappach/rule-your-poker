import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const base='http://127.0.0.1:15307',out='qualification.local/ptown-words/polish';
const post=async(op,body={},token='')=>(await fetch(`${base}/__ptown_words_route/${op}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)})).json();
const browserServer=await chromium.launchServer({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),browser=await chromium.connect(browserServer.wsEndpoint());
const db=await connect(JSON.parse(readFileSync('qualification.local/ptown-words/release/route-context.json','utf8')).database),checks=[];
mkdirSync(out,{recursive:true});
try{
 for(const [label,width,height] of [['phone',390,760],['desktop',1024,760]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:label==='phone',hasTouch:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/dev/ptown-words/polish-preview.html`);await page.getByRole('button',{name:'Start a fresh preview'}).click();await page.waitForURL('**/game/**');await page.locator('.words-grid').waitFor();
  const game=new URL(page.url()).pathname.split('/').at(-1),token=new URL(page.url()).searchParams.get('token'),user=(await post('auth',{},token)).data.session.user.id;
  const m=(await db.query('SELECT * FROM private.ptown_words_matches WHERE game_id=$1',[game])).rows[0],viewer=m.state.players.find(p=>p.userId===user),opponent=m.state.players.find(p=>p.isBot);
  // Only synthetic loopback sessions: keep all tile identities while choosing a repeatable rack.
  const s=(await db.query('SELECT private.ptown_words_deal($1,$2) state',[{identity:m.state.identity,players:m.state.players,rules:m.state.rules,presentationConfig:m.state.presentationConfig},Date.now()])).rows[0].state;
  const pool=[...s.bag,...Object.values(s.racks).flat()],take=face=>pool.splice(pool.findIndex(t=>t.face===face),1)[0];
  s.racks[viewer.id]=['C','A','T','S','E','R','?'].map(take);s.racks[opponent.id]=['Q','U','I','Z','E','R','T'].map(take);s.bag=pool;s.turnIndex=s.players.findIndex(p=>p.id===viewer.id);
  await db.query('UPDATE private.ptown_words_matches SET state=$2,revision=revision+1,last_request_at=0 WHERE dealer_game_id=$1',[m.dealer_game_id,s]);await page.reload();await page.locator('.words-grid').waitFor();
  await page.getByText('tap an area to zoom in',{exact:true}).waitFor();
  const rules=page.getByRole('button',{name:'Rules',exact:true});await rules.click();await page.getByRole('heading',{name:'Ptown Words · Rules'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  const rackC=page.getByRole('button',{name:'C, 3 points',exact:true});
  for(const gesture of ['click','tap']){await rackC[gesture]();await page.locator('.is-overview').waitFor();assert.equal(await page.locator('.is-staged').count(),0);await rackC[gesture]();}
  await rackC.tap();await page.locator('.is-overview').waitFor();
  await page.locator('[data-square="112"]').tap();await page.getByText('double tap for full board',{exact:true}).waitFor();assert.equal(await page.locator('.is-staged').count(),0);
  const rackCamera=await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));await rackC.tap();await rackC.tap();assert.deepEqual(await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),rackCamera);
  const cdp=await context.newCDPSession(page),box=await page.locator('.words-scroll').boundingBox(),beforePan=await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));
  const x=box.x+box.width*.6,y=box.y+box.height*.65;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*6,y:y-i*14}]});await page.waitForTimeout(30);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
  const afterPan=await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));assert.ok(Math.abs(afterPan.x-beforePan.x)+Math.abs(afterPan.y-beforePan.y)>40,'touch drag pans');assert.equal(await page.locator('.is-staged').count(),0);assert.equal(await page.getByRole('button',{name:'C, 3 points',exact:true}).getAttribute('aria-pressed'),'true');
  await page.touchscreen.tap(x,y);await page.waitForTimeout(100);await page.touchscreen.tap(x,y);await page.locator('.is-overview').waitFor();
  await page.locator('[data-square="112"]').tap();await page.getByRole('button',{name:'Inspect',exact:true}).tap();
  const place=async(letter,square)=>{await page.getByRole('button',{name:`${letter}, ${letter==='C'?3:1} points`,exact:true}).tap();await page.locator(`[data-square="${square}"]`).tap();await page.waitForTimeout(350);};
  await place('C',112);await place('T',113);assert.equal(await page.getByRole('button',{name:'Exchange',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Pass',exact:true}).count(),0);
  const rackIds=()=>page.locator('.words-rack button').evaluateAll(bs=>bs.map(b=>b.dataset.tileId));const beforeRack=await rackIds();for(let i=0;i<3;i++){const prior=await rackIds();await page.getByRole('button',{name:'Shuffle rack'}).tap();assert.notDeepEqual(await rackIds(),prior);}assert.deepEqual((await rackIds()).sort(),beforeRack.sort());assert.equal(await page.locator('.is-staged').count(),2);
  const beforeInvalid=(await db.query('SELECT state,revision FROM private.ptown_words_matches WHERE dealer_game_id=$1',[m.dealer_game_id])).rows[0],camera=await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));
  await page.evaluate(()=>{window.__invalidWindows=[];let start=null;new MutationObserver(()=>{const shown=!!document.querySelector('.words-invalid');if(shown&&start===null)start=performance.now();if(!shown&&start!==null){window.__invalidWindows.push(performance.now()-start);start=null;}}).observe(document.body,{subtree:true,childList:true});});
  for(let i=0;i<2;i++){await page.getByRole('button',{name:'Submit Word'}).tap();await page.getByRole('alert').filter({hasText:'invalid word'}).waitFor();if(i===0)await page.screenshot({path:`${out}/pass-invalid-${label}.png`});await page.locator('.words-invalid').waitFor({state:'hidden'});assert.equal(await page.locator('.is-staged').count(),2);assert.deepEqual(await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),camera);}
  const afterInvalid=(await db.query('SELECT state,revision FROM private.ptown_words_matches WHERE dealer_game_id=$1',[m.dealer_game_id])).rows[0];assert.equal(afterInvalid.state.deadline,beforeInvalid.state.deadline);assert.equal(afterInvalid.revision,beforeInvalid.revision);const invalidWindows=await page.evaluate(()=>window.__invalidWindows);assert.equal(invalidWindows.length,2);assert.ok(invalidWindows.every(ms=>ms>=1400&&ms<=1850));
  await page.getByRole('button',{name:'Undo',exact:true}).tap();await place('A',113);await place('T',114);
  for(const [w,h] of label==='phone'?[[320,568],[390,760],[844,390]]:[[1024,760]]){await page.setViewportSize({width:w,height:h});await page.waitForTimeout(120);const layout=await page.locator('.words-turn-actions button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent,w:r.width,h:r.height,bottom:r.bottom};}));assert.deepEqual(layout.map(b=>b.name),['Undo','Recall']);assert.ok(layout.every(b=>b.w>=44&&b.h>=44&&b.bottom<=h));await page.locator('.is-staged').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/pass-staged-${w}.png`});}
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'Submit Word'}).tap();await page.locator('.is-overview').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.is-revealing').length>0);assert.equal(await page.locator('.words-rack').getAttribute('data-actionable'),'false');assert.equal(await page.locator('.words-your-turn').count(),0);await page.screenshot({path:`${out}/pass-opponent-${label}.png`});
  await page.waitForFunction(()=>document.querySelector('.words-rack')?.getAttribute('data-actionable')==='true');await page.locator('.is-overview').waitFor();assert.equal(await page.locator('.words-your-turn').count(),1);
  const scoreBoxes=await page.locator('.words-scores>div').evaluateAll(es=>es.map(e=>({border:getComputedStyle(e).borderTopWidth,color:getComputedStyle(e).backgroundColor,active:e.dataset.active})));assert.ok(scoreBoxes.every(s=>parseInt(s.border)>=1));assert.notEqual(scoreBoxes[0].color,scoreBoxes[1].color);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.words-your-turn').evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  const exchange=page.getByRole('button',{name:'Exchange',exact:true});
  await exchange.click();let dialog=page.getByRole('dialog');await dialog.waitFor();assert.ok(await page.getByRole('button',{name:'Exchange 0 tiles'}).isDisabled());
  const colors=await dialog.evaluate(e=>{const style=x=>({fg:getComputedStyle(x).color,bg:getComputedStyle(x).backgroundColor});return {dialog:style(e),title:style(e.querySelector('h2')),tiles:[...e.querySelectorAll('.words-exchange button')].map(style),buttons:[...e.querySelectorAll('button')].map(style)};});assert.equal(colors.dialog.bg,'rgb(28, 41, 57)');assert.equal(colors.title.fg,'rgb(243, 242, 232)');assert.ok(colors.tiles.every(c=>c.bg==='rgb(242, 238, 224)'&&c.fg==='rgb(24, 43, 59)'));
  await page.screenshot({path:`${out}/pass-exchange-${label}.png`});await page.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Exchange',null,{timeout:5000});
  await exchange.click();await page.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Exchange');
  await exchange.click();await page.keyboard.press('Tab');assert.ok(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await exchange.click();await dialog.locator('.words-exchange button').first().click();assert.equal(await dialog.locator('.words-exchange button[aria-pressed=true]').count(),1);await page.screenshot({path:`${out}/pass-exchange-selected-${label}.png`});await page.getByRole('button',{name:'Exchange 1 tiles'}).click();await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.words-rack')?.getAttribute('data-actionable')==='true');let state=(await db.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[m.dealer_game_id])).rows[0].state;assert.ok(state.moves.some(move=>move.playerId===viewer.id&&move.action==='exchange'));
  await page.reload();await page.locator('.words-grid').waitFor();await page.waitForFunction(()=>document.querySelector('.words-rack')?.getAttribute('data-actionable')==='true');await page.screenshot({path:`${out}/pass-ready-${label}.png`});assert.deepEqual(errors,[]);
  checks.push({label,width,height,touchDrag:{beforePan,afterPan,emulated:true},invalidWindows,noDeadlineExtension:true,shufflePreservedIds:true,scoreBoxes,modalColors:colors,exchangeConfirmCancelCloseFocus:true,reducedMotion:true,reconnect:true,errors});await cdp.detach();await context.close();
 }
 writeFileSync('dev/ptown-words/evidence/polish-pass-browser.json',JSON.stringify({passed:true,localOnly:true,checks},null,2));console.log('Combined Words polish: phone/desktop gestures, invalid overlay, shuffle, handoff, exchange and reconnect PASS');
}catch(e){console.error(e);throw e;}finally{await db.end();const forceClose=setTimeout(()=>void browserServer.kill(),5000);try{await browserServer.close();}finally{clearTimeout(forceClose);}}
