import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';
const base='http://127.0.0.1:15307',out='qualification.local/ptown-words/polish';
const post=async(op,body={},token='')=>(await fetch(`${base}/__ptown_words_route/${op}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)})).json();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
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
  assert.equal(await page.getByRole('button',{name:'Zoom In',exact:true}).count(),0);assert.equal(await page.getByText(/15\s*×\s*15/).count(),0);assert.equal(await page.getByRole('button',{name:'Session',exact:true}).count(),0);
  const rules=page.getByRole('button',{name:'Rules',exact:true}),r=await rules.boundingBox();assert.ok(r.width>=44&&r.height>=44);await rules.click();await page.getByRole('heading',{name:'Ptown Words · Rules',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Rules');
  await page.locator('[data-square="112"]').tap();await page.locator('.is-zoom').waitFor();assert.equal(await page.locator('.is-staged').count(),0);
  const place=async(letter,square)=>{await page.getByRole('button',{name:`${letter}, ${letter==='C'?3:1} points`,exact:true}).tap();await page.locator(`[data-square="${square}"]`).tap();await page.waitForTimeout(350);};
  await place('C',112);const camera=await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));await page.getByRole('button',{name:'Submit Word',exact:true}).tap();await page.locator('.words-error').waitFor();
  assert.equal(await page.locator('.is-staged').count(),1);await page.locator('.is-zoom').waitFor();assert.deepEqual(await page.locator('.words-scroll').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),camera);await page.screenshot({path:`${out}/refinement-rejected-${label}.png`});
  await place('A',113);await place('T',114);assert.equal(await page.locator('.is-staged').count(),3);await page.getByRole('button',{name:'Submit Word',exact:true}).tap();await page.locator('.is-overview').waitFor();assert.equal(await page.locator('.is-staged').count(),0);await page.screenshot({path:`${out}/refinement-accepted-${label}.png`});
  await page.waitForFunction(()=>document.querySelectorAll('.is-revealing').length>0);await page.locator('.is-zoom').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.is-revealing').length===0&&document.querySelector('.is-overview')!==null);assert.ok(await page.getByRole('button',{name:'Pass',exact:true}).isEnabled());await page.screenshot({path:`${out}/refinement-restored-${label}.png`});
  const state=(await db.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[m.dealer_game_id])).rows[0].state;assert.equal(state.moves[0].words[0].word,'CAT');assert.equal(state.moves[1].playerId,opponent.id);assert.equal(state.moves[1].action,'place');assert.deepEqual(errors,[]);
  checks.push({label,width,height,rulesTarget:r,checks:['no redundant zoom/board-size controls','Rules panel and focus restoration','tap-to-inspect without placement','rejected word retains draft and camera','accepted CAT returns overview','bot reveal restores overview'],errors});await context.close();
 }
 writeFileSync('dev/ptown-words/evidence/refinement-browser.json',JSON.stringify({passed:true,localOnly:true,checks},null,2));console.log('Words local phone/desktop navigation and accepted-word camera PASS');
}finally{await browser.close();await db.end();}
