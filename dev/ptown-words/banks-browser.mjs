import {chromium} from '@playwright/test';import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';import {connect} from './database.mjs';
const base='http://127.0.0.1:15308',out='qualification.local/ptown-words/banks';mkdirSync(out,{recursive:true});
const post=async(op,body={},token='')=>(await fetch(base+'/__ptown_words_route/'+op,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})).json();
const db=await connect(JSON.parse(read('qualification.local/ptown-words/release/banks-route-context.json','utf8')).database);
const server=await chromium.launchServer({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),browser=await chromium.connect(server.wsEndpoint()),checks=[];
try{
 for(const [kind,width,height] of [['human-horizontal',390,760],['human-vertical',1024,760],['bot',390,760]]){
  console.log('Browser case',kind);const bot=kind==='bot',vertical=kind==='human-vertical',f=await post('new',{bot}),viewer=bot?0:1;
  const rpc=async(name,args,who=0)=>{const r=await post('rpc',{name,args},f.tokens[who]);if(r.error)throw Error(r.error.message);if(r.data?.error)throw Error(r.data.error);return r.data;};
  const frame=await rpc('read_session_frame',{p_game_id:f.game}),cfg=await rpc('ptown_words_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',p_config:{ante_amount:5},p_expected_config_deadline:frame.game.config_deadline}),d=cfg.dealer_game.id;
  if(!bot)await rpc('submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:d,p_player_id:f.players[1],p_decision:'ante_up'},1);await rpc('advance_ante_phase',{p_game_id:f.game,p_expected_dealer_game_id:d});
  const get=async()=>(await db.query('SELECT * FROM private.ptown_words_matches WHERE dealer_game_id=$1',[d])).rows[0];let m=await get();const s=(await db.query('SELECT private.ptown_words_deal($1,$2) s',[{identity:m.state.identity,players:m.state.players,rules:m.state.rules,presentationConfig:m.state.presentationConfig},Date.now()])).rows[0].s;
  const pool=[...s.bag,...Object.values(s.racks).flat()],take=face=>pool.splice(pool.findIndex(t=>t.face===face),1)[0],actor=bot?f.players[1]:f.players[0];
  if(vertical){s.board[112]={...take('A'),letter:'A'};s.board[113]={...take('T'),letter:'T'};}
  s.racks[actor]=(bot?['A','I','R','S','E','N','T']:['C','A','T','S','E','R','?']).map(take);s.racks[f.players[bot?0:1]]=pool.splice(0,7);s.bag=pool;s.turnIndex=s.players.findIndex(p=>p.id===f.players[0]);
  await db.query('UPDATE private.ptown_words_matches SET state=$2,revision=revision+1,last_request_at=0 WHERE dealer_game_id=$1',[d,s]);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/game/'+f.game+'?token='+f.tokens[viewer]);await page.locator('.words-grid').waitFor();
  await page.evaluate(()=>{window.__tileFrames=[];window.__stopFrames=false;const sample=()=>{const tiles=[...document.querySelectorAll('.words-grid .words-cell b')].map(e=>({square:Number(e.parentElement.dataset.square),letter:e.textContent}));const value=JSON.stringify(tiles);if(window.__tileFrames.at(-1)?.value!==value)window.__tileFrames.push({at:Date.now(),value,tiles});if(!window.__stopFrames)requestAnimationFrame(sample);};sample();});
  m=await get();let result;
  if(bot){s.turnIndex=s.players.findIndex(p=>p.id===actor);await db.query('UPDATE private.ptown_words_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[d,s]);await page.waitForFunction(()=>document.querySelectorAll('.words-cell.is-revealing').length>0);result=await rpc('ptown_words_snapshot',{p_dealer_game_id:d});}
  else{const faces=vertical?['C','A']:['C','A','T'],squares=vertical?[83,98]:[112,113,114],items=faces.map((face,i)=>({tileId:s.racks[actor].find(t=>t.face===face).id,letter:face,square:squares[i]}));const args={p_dealer_game_id:d,p_request_id:crypto.randomUUID(),p_revision:m.revision,p_action:'place',p_items:items};result=await rpc('ptown_words_action',args);assert.deepEqual(await rpc('ptown_words_action',args),result);}
  await page.getByText(new RegExp('played .* \\+'+result.event.points)).waitFor();assert.ok(await page.getByRole('button',{name:'Pass',exact:true}).isDisabled());await page.screenshot({path:out+'/'+kind+'-notice.png'});
  await page.waitForFunction(()=>!document.querySelector('.words-turn-actions button:last-child')?.disabled);await page.waitForTimeout(120);
  const frames=await page.evaluate(()=>{window.__stopFrames=true;return window.__tileFrames;}),squares=[...result.movePresentation.squares].sort((a,b)=>a-b),first=squares.map(square=>frames.find(frame=>frame.tiles.some(t=>t.square===square))?.at);assert.ok(first.every(Number.isFinite));
  for(let i=1;i<first.length;i++)assert.ok(first[i]-first[i-1]>=120,JSON.stringify({kind,first,frames}));if(vertical)assert.ok(frames.every(frame=>frame.tiles.some(t=>t.square===112&&t.letter==='A')&&frame.tiles.some(t=>t.square===113&&t.letter==='T')));
  assert.ok(Date.now()>=result.movePresentation.readyAt);assert.equal(result.deadline-result.movePresentation.readyAt,180000);
  await page.reload();await page.locator('.words-grid').waitFor();assert.equal(await page.locator('.is-revealing').count(),0);
  console.log('Sequential event path PASS',kind,first);
  if(!bot){
   const hostContext=await browser.newContext({viewport:{width,height}}),host=await hostContext.newPage();host.setDefaultTimeout(15000);await host.goto(base+'/game/'+f.game+'?token='+f.tokens[0]);await host.locator('.words-grid').waitFor();
   console.log('Pause roles',await page.locator('.words-pause').getAttribute('aria-label'),await host.locator('.words-pause').getAttribute('aria-label'));
   await page.bringToFront();await page.waitForTimeout(600);await page.getByRole('button',{name:'Request pause',exact:true}).click();await host.getByText(/is requesting a pause/).waitFor();await host.bringToFront();await host.waitForTimeout(600);await host.getByRole('button',{name:'Pause game',exact:true}).click();
   for(const p of [host,page]){await p.locator('[data-paused=true]').waitFor();assert.equal(await p.locator('.words-cell b,.words-rack small').count(),0);assert.equal(await p.locator('.words-rack').evaluate(e=>getComputedStyle(e).filter),'blur(8px)');}
   await page.reload();await page.locator('[data-paused=true]').waitFor();assert.equal(await page.locator('.words-cell b,.words-rack small').count(),0);await page.screenshot({path:out+'/'+kind+'-paused.png'});
   await host.bringToFront();await host.waitForTimeout(600);await host.getByRole('button',{name:'Resume game',exact:true}).click();await page.locator('[data-paused=false]').waitFor();await page.bringToFront();await page.waitForTimeout(600);await page.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).click();await page.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).waitFor({state:'hidden'});await page.reload();await page.locator('.words-grid').waitFor();assert.equal(await page.locator('.words-bank').count(),1);
   await page.screenshot({path:out+'/'+kind+'-bank.png'});await hostContext.close();
  }
  for(const [w,h] of width<500?[[320,568],[390,760],[844,390]]:[[1024,760]]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:out+'/'+kind+'-'+w+'.png'});const buttons=await page.locator('.words-bank,.words-pause').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,right:r.right,bottom:r.bottom};}));assert.ok(buttons.every(b=>b.w>=44&&b.h>=44&&b.right<=w+1&&b.bottom<=h+1),JSON.stringify(buttons));}
  assert.deepEqual(errors,[]);checks.push({kind,first,squares,frames,errors,realRpcAndRevisionEvent:true});await context.close();
 }
 write('dev/ptown-words/evidence/banks-pause-browser.json',JSON.stringify({passed:true,localOnly:true,checks},null,2));console.log('Real event-path reveal, pause/request, bank persistence and mobile layout PASS');
}catch(e){console.error(e);process.exitCode=1;}finally{await db.end();await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,4000))]);if(server.process()?.exitCode===null)server.process()?.kill();process.exit(process.exitCode??0);}
