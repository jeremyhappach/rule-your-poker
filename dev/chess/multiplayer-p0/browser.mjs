import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
const out='qualification.local/chess-multiplayer-p0';mkdirSync(out,{recursive:true});
const server=await createServer({configFile:false,envFile:false,cacheDir:out+'/vite-cache',plugins:[{name:'chess-p0-observation',enforce:'pre',transform(code,id){if(id.endsWith('/src/components/chess/ChessTable.tsx'))return code.replace(' const result=v?.settled?', '(window as any).__chessP0Observation={id:v?.id,finished:v?.finished,settled:v?.settled,now:game.now,deadline:v?.terminal?.deadline,cursor,net,ready}; const result=v?.settled?');}},react(),{name:'local-route',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/game/')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/dev/chess/multiplayer-p0/preview.tsx"></script></body></html>'));}else next();});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/chess/multiplayer-p0/client.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15449,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[],errors=[];
try{
 for(const [width,height] of [[393,852],[852,393]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto('http://127.0.0.1:15449/game/g');await page.getByRole('group',{name:'Chess board'}).waitFor({timeout:30000});
  const gear=page.getByRole('button',{name:'Player options'});await gear.click();await page.getByRole('menuitemcheckbox',{name:'Sit Out Next Hand'}).click();
  await page.waitForFunction(()=>window.p0.state().writes.some(w=>w.name==='set_session_player_intent'&&w.args.p_option==='sit_out_next_hand'));
  const header=await gear.boundingBox();assert(header.y>=0&&header.y+header.height<=height,'header remains on screen');
  await page.screenshot({path:out+`/active-${width}.png`});
  await page.evaluate(()=>window.p0.mate());await page.locator('.chess-check-cue').waitFor({timeout:10000});assert.equal(await page.locator('.chess-check-cue').textContent(),'Checkmate');
  assert.equal(await page.locator('[data-fullscreen-game-shell]').count(),1);await page.screenshot({path:out+`/checkmate-${width}.png`});
  await page.getByText('Checkmate · mcru81 wins · You −$5',{exact:true}).waitFor({timeout:10000});await page.screenshot({path:out+`/result-${width}.png`});
  console.log('result',width);await page.waitForFunction(()=>Date.now()>window.p0.state().chess.terminal.deadline,undefined,{timeout:10000});console.log('continuing',width);
  await page.evaluate(()=>window.p0.continue());await page.locator('.chess-board').waitFor({state:'detached',timeout:10000}).catch(async e=>{await page.screenshot({path:out+'/handoff-failure.png'});console.log('handoff-observation',await page.evaluate(()=>({observation:window.__chessP0Observation,server:window.p0.state().chess,visible:document.body.innerText})));throw e;});
  await page.waitForFunction(()=>document.querySelector('[data-shell-presentation-mode]')?.getAttribute('data-shell-presentation-mode')==='table',undefined,{timeout:10000});
  await gear.click();await page.getByRole('menuitemcheckbox',{name:'Sit Out Next Hand'}).waitFor();await page.keyboard.press('Escape');
  await page.getByText(/mcru81 is (choosing|setting up)/).first().waitFor();
  await page.screenshot({path:out+`/waiting-${width}.png`,animations:'disabled'});
  await page.evaluate(()=>window.p0.next());await page.locator('[data-square="e2"]').waitFor({timeout:10000});
  assert.equal(await page.locator('.chess-board').count(),1);assert.equal(await page.locator('.chess-check-cue').count(),0);
  await page.screenshot({path:out+`/successor-${width}.png`});results.push({width,height,header,headerMenu:'pass',mate:'pass',settlement:'-5',waiting:'pass',successor:'pass'});await page.close();
 }
 for(const scenario of ['bot-forfeit','bot-forfeit-end']){
  const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:15449/game/g?scenario='+scenario);
  await page.getByRole('group',{name:'Chess board'}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Forfeit',exact:true}).click();
  await page.getByRole('button',{name:'Confirm forfeit'}).click();
  await page.locator('.chess-forfeit-effect').waitFor({timeout:5000});
  assert.equal(await page.locator('[data-instance-label="status-keyed"]').count(),0);
  await page.screenshot({path:out+`/${scenario}-explosion.png`});
  await page.getByText('Hap forfeited · Bot wins · You −$5',{exact:true}).waitFor({timeout:10000});
  await page.screenshot({path:out+`/${scenario}-settlement.png`});
  await page.locator('.chess-board').waitFor({state:'detached',timeout:15000});
  assert.equal(await page.getByText(/reconnecting/i).count(),0);
  assert.equal(await page.getByText('P-Town Chess complete',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.p0.state().commands.length),1);
  await page.screenshot({path:out+`/${scenario}-handoff.png`});
  if(scenario==='bot-forfeit-end'){
   await page.getByRole('button',{name:'Back to Lobby'}).click();
   await page.getByText('Local lobby destination').waitFor();
  }else{
   await page.evaluate(()=>window.p0.next());await page.locator('[data-square="e2"]').waitFor({timeout:10000});
   assert.equal(await page.locator('.chess-forfeit-effect').count(),0);
  }
  results.push({scenario,forfeit:'confirmed once',settlement:'-5',handoff:'pass'});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await server.close();}
