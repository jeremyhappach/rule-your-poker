import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const fixture=resolve('e2e/pauseAudit/browser');
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),cacheDir:'.cache/pause-browser',server:{host:'127.0.0.1',port:15348,strictPort:true},plugins:[react()],resolve:{alias:[
 {find:'@/integrations/supabase/client',replacement:resolve(fixture,'client.ts')},
 {find:/^@\/hooks\/use(Run21Access|TriTowersTestAccess|ElevenUpAccess|RoyalFlashAccess|TakeTwoAccess|TripFlipAccess|BoxdropAccess|QuintzeeAccess|PtownWordsAccess|CanastaAccess|GolfAccess|RacePokerAccess|Battle31Access)$/,replacement:resolve(fixture,'access.ts')},
 {find:'@/lib/debugHarness/activeHarnessWarning',replacement:resolve(fixture,'access.ts')},
 {find:'@',replacement:resolve('src')},
 ]}});
await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true}),reports=[];
try{
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  const context=await browser.newContext({viewport,hasTouch:true});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:15348/e2e/pauseAudit/browser/index.html');
  const pause=page.getByRole('button',{name:'Pause game',exact:true});await pause.waitFor();
  // Reproduce the original hit boundary with the actual header and setup scrim.
  const headerBlocked=await page.locator('[data-player-options-trigger]').evaluate(el=>{const r=el.getBoundingClientRect();return !el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  assert.equal(headerBlocked,true);
  // Keyboard can reach the original menu even though pointer hit-testing cannot.
  await page.locator('[data-player-options-trigger]').focus();await page.keyboard.press('Enter');
  await page.getByRole('menuitem',{name:'Pause Game'}).click();
  await page.getByRole('button',{name:'Resume game',exact:true}).tap();
  for(const kind of ['selection','simple','card','farkle']){
   if(kind==='simple'){await page.getByRole('tab',{name:'Dice',exact:true}).click();await page.locator('[data-dealer-game-option="yahtzee"]').click();}
   if(kind==='card'){await page.getByRole('button',{name:/Back/}).first().click();await page.getByRole('tab',{name:'Cards',exact:true}).click();await page.locator('[data-dealer-game-option="holm-game"]').click();}
   if(kind==='farkle'){await page.getByRole('button',{name:/Back/}).first().click();await page.getByRole('tab',{name:'Dice',exact:true}).click();await page.locator('[data-dealer-game-option="farkle"]').click();}
   await pause.tap();await page.getByText('Paused',{exact:true}).waitFor();await page.getByRole('button',{name:'Resume game',exact:true}).tap();await pause.waitFor();
   reports.push({viewport,kind,pointerAndTouch:true,headerBlocked,keyboardOriginal:true});
  }
  await page.goto('http://127.0.0.1:15348/e2e/pauseAudit/browser/index.html?host=false');
  await page.getByText('Dealer Setup',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Pause game',exact:true}).count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 writeFileSync('e2e/pauseAudit/evidence/focused-browser.json',JSON.stringify({engine:'Chromium',syntheticTransport:true,physicalPhone:false,reports},null,2));
 console.log(JSON.stringify({passed:reports.length,reports}));
}finally{await browser.close();await server.close();}
