import {chromium} from '@playwright/test';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './bots-database.mjs';
const {database}=context(),c=await connect(database),out='qualification.local/eleven-up-bots/browser';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5196/dev/eleven-up/live.html');await page.getByRole('button',{name:'Start two-player table'}).click();
 await page.waitForURL(/id=/);const id=new URL(page.url()).searchParams.get('id');
 await page.locator('.eleven-ball').first().waitFor();
 const before=(await c.query('select state,revision from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0];assert(before.state.players[0].isBot);
 await page.waitForFunction(()=>document.querySelector('[data-phase="playing"]'),{timeout:15000});
 await page.screenshot({path:out+'/bot-turn-390.png'});assert(await page.locator('.eleven-pass').isDisabled());
 await page.reload();await page.locator('.eleven-ball').first().waitFor();assert(await page.locator('.eleven-pass').isDisabled());
 const layouts=[];
 for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[1280,800]]){
  await page.setViewportSize({width,height});
  const dimensions=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,scores:document.querySelectorAll('.eleven-score-pill').length}));
  assert.equal(dimensions.overflow,false);assert.equal(dimensions.scores,2);layouts.push({width,height,...dimensions});await page.screenshot({path:out+`/bot-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});let humanActions=0;
 for(let i=0;i<900;i++){
  const s=(await c.query('select state from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0].state;
  if(s.phase==='complete')break;
  if(['intro','stage_complete'].includes(s.phase))await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) where dealer_game_id=$1",[id,Date.now()-1]);
  else if(!s.players[s.turnIndex].isBot){
   const button=s.phase==='ready'?page.locator('.eleven-pass'):page.getByRole('button',{name:'Take Score',exact:true});
   if(await button.isEnabled()){await button.click();humanActions++;}
  }
  await page.waitForTimeout(300);
 }
 const m=(await c.query('select state,settlement from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0];assert.equal(m.state.phase,'complete');assert(m.settlement);assert(humanActions>=4);
 assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({database,id,layouts,humanActions,settlement:m.settlement,errors,limitations:'Desktop Chromium mobile emulation; synthetic SQL clocks accelerated only at intro/result holds. Not physical-phone or production smoke.'},null,2));console.log('PASS actual browser bot play, reload, human actions, settlement and six layouts');
}finally{await browser.close();await c.end();}
