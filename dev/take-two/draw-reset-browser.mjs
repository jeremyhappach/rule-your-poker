import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5187',evidence=[];
const post=async(op,body)=>{const r=await fetch(base+'/__takeTwo/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 for(const solo of [true,false]){
  const fixture=await post('new',{solo}),page=await browser.newPage({viewport:{width:393,height:662}});
  await page.goto(base+'/dev/take-two/live.html?'+new URLSearchParams(fixture));await page.bringToFront();
  await page.locator('.take-stock:not([disabled])').waitFor();
  await page.waitForFunction(()=>document.querySelector('[role=meter]')?.getAttribute('aria-valuenow')==='50');
  const board=s=>solo?s.view:s;
  let before=board(await post('state',fixture));assert.equal(before.rules.version,'take-two/2');
  const isAction=r=>r.url().endsWith('/__takeTwo/action')||r.url().endsWith('/__takeTwo/rpc')&&r.request().postDataJSON()?.name==='take_two_action';
  const response=page.waitForResponse(isAction);await page.locator('.take-stock').click();const accepted=await response;
  const request=accepted.request().postDataJSON();await page.waitForFunction(()=>Number(document.querySelector('[role=meter]')?.getAttribute('aria-valuenow'))>350);
  let drawn=board(await post('state',fixture));assert.equal(drawn.deadline,before.deadline);assert.equal(drawn.score,Math.max(0,before.score-100));assert.ok(drawn.meterAt>before.meterAt);
  await page.screenshot({path:`qualification.local/take-two/draw-reset-${solo?'arcade':'multiplayer'}.png`});
  await post(solo?'action':'rpc',request);const replay=board(await post('state',fixture));assert.equal(replay.meterAt,drawn.meterAt);assert.equal(replay.stockRemaining,drawn.stockRemaining);
  while(!drawn.legalPairs.length){const r=page.waitForResponse(isAction);await page.locator('.take-stock:not([disabled])').click();await r;drawn=board(await post('state',fixture));}
  const pair=drawn.legalPairs[0],cards=pair.map(i=>i===-1?drawn.current:drawn.slots[i]);
  const matchedResponse=page.waitForResponse(isAction);
  for(const i of pair){if(i===-1)await page.locator('.take-current').click();else{const pos=drawn.layout[i];await page.getByRole('button',{name:new RegExp(`^Row ${pos.row+1}, card ${pos.column+1}:`)}).click();}}
  await matchedResponse;const matched=board(await post('state',fixture));
  const rules=drawn.rules,bonus=Math.max(rules.meterMin,rules.meterMax-rules.meterStep*Math.floor(Math.max(0,matched.meterAt-drawn.meterAt-rules.meterHoldMs)*rules.meterStepsPerSecond/1000));
  const expected=(cards[0]%13===cards[1]%13?1200:400)+bonus;
  assert.equal(matched.score-drawn.score,expected);assert.equal(matched.deadline,before.deadline);
  await page.reload();await page.locator('[role=meter]').waitFor();
  assert.equal(board(await post('state',fixture)).meterAt,matched.meterAt);
  evidence.push({mode:solo?'Arcade':'multiplayer',drawPenalty:100,resetValue:500,duplicateAnchorUnchanged:true,matchPoints:expected,matchBonus:bonus,roundDeadlineUnchanged:true,reloadAnchorUnchanged:true});
  await page.close();
 }
 writeFileSync('qualification.local/take-two/draw-reset-browser.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await browser.close();}
