import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect} from './database.mjs';

const baseline=process.argv.includes('--baseline'),base='http://127.0.0.1:15308';
const out='qualification.local/ptown-words/jitter';mkdirSync(out,{recursive:true});
const dbName=JSON.parse(readFileSync('qualification.local/ptown-words/release/banks-route-context.json','utf8')).database;
assert.match(dbName,/^ptown_words_route_\d+$/);const db=await connect(dbName);
const post=async(op,body={},token='')=>(await fetch(base+'/__ptown_words_route/'+op,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})).json();
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),checks=[];

async function sample(page,label,duration=2600){
 const frames=await page.evaluate(duration=>new Promise(resolve=>{
  const frames=[],start=performance.now();
  const frame=()=>{
   const nodes={};for(const selector of ['.fullscreen-game-board','.words-scroll','.words-grid']){
    const e=document.querySelector(selector),r=e.getBoundingClientRect(),s=getComputedStyle(e);
    nodes[selector]={x:r.x,y:r.y,w:r.width,h:r.height,scrollX:e.scrollLeft,scrollY:e.scrollTop,clientW:e.clientWidth,clientH:e.clientHeight,scrollW:e.scrollWidth,scrollH:e.scrollHeight,transform:s.transform};
   }
   const tiles=[...document.querySelectorAll('.words-cell.has-tile')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {square:Number(e.dataset.square),letter:e.querySelector('b').textContent,score:e.querySelector('small').textContent,w:r.width,h:r.height,transform:s.transform,shadow:s.boxShadow,clip:s.clipPath,opacity:s.opacity};});
   const pulse=document.querySelector('.words-your-turn');
   frames.push({at:performance.now()-start,nodes,tiles,timer:document.querySelector('time').textContent,pulse:pulse?getComputedStyle(pulse).backgroundColor:null,busy:document.querySelector('.words-scroll').getAttribute('aria-busy')});
   if(performance.now()-start<duration)requestAnimationFrame(frame);else resolve(frames);
  };frame();
 }),duration);
 const variations=Object.fromEntries(Object.keys(frames[0].nodes).map(key=>[key,[...new Set(frames.map(f=>JSON.stringify(f.nodes[key])))]]));
 console.log(label,Object.fromEntries(Object.entries(variations).map(([k,v])=>[k,v.length])));
 return {label,frames,variations};
}
function stable(result){for(const [key,values] of Object.entries(result.variations))assert.equal(values.length,1,result.label+' '+key+' moved at rest');}
try{
 for(const [label,width,height] of [['phone',390,760],['landscape',844,390],['desktop',1280,800]]){
  const f=await post('new'),rpc=async(name,args,who=0)=>{const r=await post('rpc',{name,args},f.tokens[who]);if(r.error)throw Error(r.error.message);return r.data;};
  const frame=await rpc('read_session_frame',{p_game_id:f.game}),config=await rpc('ptown_words_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',p_config:{ante_amount:5},p_expected_config_deadline:frame.game.config_deadline}),d=config.dealer_game.id;
  await rpc('submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:d,p_player_id:f.players[1],p_decision:'ante_up'},1);await rpc('advance_ante_phase',{p_game_id:f.game,p_expected_dealer_game_id:d});
  let m=(await db.query('SELECT * FROM private.ptown_words_matches WHERE dealer_game_id=$1',[d])).rows[0];
  const s=m.state,pool=[...s.bag,...Object.values(s.racks).flat()],take=face=>pool.splice(pool.findIndex(t=>t.face===face),1)[0];
  s.racks[f.players[0]]=['C','A','T','S','E','R','?'].map(take);s.racks[f.players[1]]=pool.splice(0,7);s.bag=pool;s.turnIndex=s.players.findIndex(p=>p.id===f.players[0]);
  await db.query('UPDATE private.ptown_words_matches SET state=$2,revision=revision+1,last_request_at=0 WHERE dealer_game_id=$1',[d,s]);
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:label==='phone',deviceScaleFactor:1.25}),page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/game/'+f.game+'?token='+f.tokens[1]);await page.locator('.words-grid').waitFor();await page.waitForTimeout(300);
  const rests=[];rests.push(await sample(page,label+' waiting'));
  m=(await db.query('SELECT revision FROM private.ptown_words_matches WHERE dealer_game_id=$1',[d])).rows[0];
  const revealPromise=sample(page,label+' reveal',6000);
  await rpc('ptown_words_action',{p_dealer_game_id:d,p_request_id:crypto.randomUUID(),p_revision:m.revision,p_action:'place',p_items:['C','A','T'].map((letter,i)=>({tileId:s.racks[f.players[0]].find(t=>t.face===letter).id,letter,square:112+i}))});
  const reveal=await revealPromise;
  await page.getByRole('button',{name:'Pass',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.words-turn-actions button:last-child').disabled);await page.waitForTimeout(300);
  rests.push(await sample(page,label+' active pulse and timer'));
  const flat=await page.locator('.words-cell.has-tile').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {shadow:s.boxShadow,clip:s.clipPath,transform:s.transform};}));
  const overviewReadability=await page.locator('.words-cell.has-tile').evaluateAll(es=>es.map(e=>{const letter=e.querySelector('b').getBoundingClientRect(),score=e.querySelector('small').getBoundingClientRect();return letter.right<=score.left||letter.bottom<=score.top||score.right<=letter.left||score.bottom<=letter.top;}));if(!baseline)assert.ok(overviewReadability.every(Boolean),'overview letters and values separated');
  if(!baseline){assert.ok(flat.every(s=>s.shadow==='none'&&s.clip==='none'&&s.transform==='none'));assert.ok(reveal.frames.every(f=>f.tiles.every(t=>t.transform==='none')));}
  const first=[112,113,114].map(square=>reveal.frames.find(f=>f.tiles.some(t=>t.square===square))?.at);assert.ok(first.every(Number.isFinite));for(let i=1;i<first.length;i++)assert.ok(first[i]-first[i-1]>=120,'sequential contents');
  assert.ok(new Set(rests.at(-1).frames.map(f=>f.pulse)).size>1,'Your turn pulse preserved');assert.ok(new Set(rests.at(-1).frames.map(f=>f.timer)).size>1,'timer updates exercised');
  await page.screenshot({path:`${out}/${baseline?'before':'after'}-${label}-full.png`});
  await page.locator('[data-square="112"]').tap();await page.waitForTimeout(350);rests.push(await sample(page,label+' zoom'));
  const readability=await page.locator('.words-cell.has-tile').evaluateAll(es=>es.map(e=>{const tile=e.getBoundingClientRect(),letter=e.querySelector('b').getBoundingClientRect(),score=e.querySelector('small').getBoundingClientRect();return {letter:letter.width>0&&letter.height>0,score:score.width>0&&score.height>0,separated:letter.right<=score.left||letter.bottom<=score.top||score.right<=letter.left||score.bottom<=letter.top,inside:score.right<=tile.right&&score.bottom<=tile.bottom};}));assert.ok(readability.every(r=>r.letter&&r.score&&r.separated&&r.inside),'zoomed letter and corner score readable');
  await page.screenshot({path:`${out}/${baseline?'before':'after'}-${label}-zoom.png`});
  await page.getByRole('button',{name:'Pan →',exact:true}).tap();await page.waitForTimeout(700);rests.push(await sample(page,label+' after pan',1200));
  await page.getByRole('button',{name:'Chat',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForTimeout(300);rests.push(await sample(page,label+' after HUD',1200));
  await page.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).click();await page.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).waitFor({state:'hidden'});await page.waitForTimeout(300);rests.push(await sample(page,label+' after bank',1200));
  const snap=await rpc('ptown_words_snapshot',{p_dealer_game_id:d});assert.equal((await rpc('set_game_paused',{p_game_id:f.game,p_paused:true,p_expected_dealer_game_id:d,p_expected_pause_version:snap.pauseVersion})).outcome,'paused');await page.locator('[data-paused=true]').waitFor();assert.equal(await page.locator('.words-cell b,.words-rack small').count(),0);await page.waitForTimeout(300);rests.push(await sample(page,label+' paused',1200));
  rests.forEach(stable);assert.deepEqual(errors,[]);checks.push({label,width,height,flat,first,overviewReadability,readability,rests,reveal,errors});await context.close();
 }
 writeFileSync(out+'/'+(baseline?'baseline':'verified')+'-geometry.json',JSON.stringify({passed:true,checks}));console.log(baseline?'Baseline geometry recorded':'Geometry, sequential reveal, flat tile readability and preserved controls PASS');
}finally{await db.end();await browser.close();}
