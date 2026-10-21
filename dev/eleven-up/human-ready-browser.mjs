import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './human-ready-local.mjs';
const c=await connect(context().database),out='qualification.local/eleven-up-timeout/browser';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5198/dev/eleven-up/live.html');await page.getByRole('button',{name:'Start two-player table'}).click();
 await page.waitForURL(/id=/);const url=new URL(page.url()),id=url.searchParams.get('id');
 await page.locator('[data-phase="ready"]').waitFor();
 const before=(await c.query('select state from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0].state;
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[id,Date.now()-1]);
 const checkbox=page.getByRole('checkbox',{name:'Auto-play',exact:true});await checkbox.waitFor();await page.locator('[data-phase="playing"]').waitFor();
 const playing=(await c.query('select state from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0].state;
 assert(playing.groups>0||playing.cursor>before.cursor);assert(await checkbox.isChecked());assert(await page.locator('.eleven-pass').isDisabled());
 await page.reload();await checkbox.waitFor();assert(await checkbox.isChecked());
 const opponent=await browser.newPage({viewport:{width:390,height:844}});
 const opponentUser=(await c.query('select user_id from public.players where game_id=$1 and user_id<>$2',[url.searchParams.get('session'),url.searchParams.get('user')])).rows[0].user_id;
 const otherUrl=new URL(url);otherUrl.searchParams.set('user',opponentUser);await opponent.goto(otherUrl.href);await opponent.getByRole('img',{name:/Auto-play/}).waitFor();
 const layouts=[];
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const box=await checkbox.boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight);assert(!overflow);
  layouts.push({width,height,checkbox:box,overflow});await page.screenshot({path:out+`/autoplay-${width}x${height}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 // Retry only a definitive stale control revision; never mint gameplay actions.
 for(let i=0;i<4&&await checkbox.count();i++){await checkbox.click();await page.waitForTimeout(300);}
 await checkbox.waitFor({state:'detached'});await opponent.getByRole('img',{name:/Auto-play/}).waitFor({state:'detached'});
 const after=(await c.query('select state,bot_due_at from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0];
 assert.equal(after.state.deadline,playing.deadline);assert.equal(after.bot_due_at,null);assert(await page.locator('.eleven-pass').isEnabled());
 await page.reload();await page.locator('[data-phase="playing"]').waitFor();assert.equal(await checkbox.count(),0);assert(await page.locator('.eleven-pass').isEnabled());
 assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({database:context().database,id,layouts,errors,checks:['actual SQL takeover','reconnect persistence','opponent robot','checkbox reclaim','unchanged scoring deadline','reclaimed reload'],limitation:'Desktop browser phone emulation; not physical iPhone acceptance'},null,2));console.log('PASS SQL/browser takeover, reload, robot, reclaim and six phone layouts');
}finally{await browser.close();await c.end();}
