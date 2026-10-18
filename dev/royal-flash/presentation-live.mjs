import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
const names={royal_flush:'Royal Flush',straight_flush:'Straight Flush',four_kind:'Four of a Kind',full_house:'Full House',flush:'Flush',straight:'Straight',three_kind:'Three of a Kind',two_pair:'Two Pair',pair:'One Pair',high_card:'High Card',incomplete:'Incomplete line'};
try{const evidence=await Promise.all([true,false].map(async solo=>{const cases=[];for(const reason of ['full_grid','exhausted','timeout']){const item=await(async()=>{
 const page=await browser.newPage({viewport:solo?{width:390,height:844}:{width:844,height:390}}),db=await connect(localContext().database),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 try{await page.goto('http://127.0.0.1:5186/dev/royal-flash/live.html');await page.getByRole('button',{name:solo?'Start solo Arcade':'Start two-player table'}).click();
  await page.locator('.royal-grid button').first().click();const f=Object.fromEntries(new URL(page.url()).searchParams);
  for(let i=1;i<(reason==='timeout'?4:reason==='exhausted'?52:25);i++)await page.locator('.royal-grid button').nth(reason==='exhausted'?i%24:i%25).click();
  assert.equal(await page.getByRole('button',{name:'Take Score'}).count(),0);
  if(reason==='timeout'){
   // Advance only this disposable fixture's clock; production data is never touched.
   const at=Date.now()+300;
   if(solo)await db.query("UPDATE private.arcade_runs SET state=jsonb_set(state,'{board,deadline}',to_jsonb($2::bigint)),due_at=$2 WHERE id=$1",[f.id,at]);
   else await db.query("UPDATE private.royal_flash_matches SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE dealer_game_id=$1",[f.id,at]);
  }
  await page.locator('.royal-breakdown').waitFor();
  const snapshot=await page.evaluate(async f=>(await (await fetch('/__royal/state',{method:'POST',body:JSON.stringify(f)})).json()),f);
  const result=solo?snapshot.view.result:snapshot.stages.at(-1);assert.equal(result.reason,reason);assert.equal(result.presentationMs,21000);
  console.log({solo,reason,arrivalMs:Date.now()-result.completedAt,step:await page.locator('.royal-breakdown').getAttribute('data-scoring-step')});
  const steps=[];for(let line=0;line<10;line++){
   await page.locator(`[data-scoring-step="line-${line}"]`).waitFor();
   const label=await page.locator('.royal-breakdown').innerText();assert.ok(label.includes(`+${result.lines[line].points.toLocaleString()} · ${names[result.lines[line].kind]}`),label);
   assert.equal(await page.locator('.royal-grid button').count(),25);assert.equal(await page.locator('.royal-grid [data-scored]').count(),5);
   const expected=result.scoreBefore+result.lines.slice(0,line+1).reduce((s,l)=>s+l.points,0);
   await page.waitForFunction(({line,expected})=>document.querySelector('.royal-breakdown')?.getAttribute('data-scoring-step')===`line-${line}`&&Number(document.querySelector('.royal-primary-score strong')?.textContent.replaceAll(',',''))===expected,{line,expected});
   steps.push(line);
  }
  await page.locator('[data-scoring-step="bonus"]').waitFor();assert.ok((await page.locator('.royal-breakdown').innerText()).includes(`+${result.timeBonus.toLocaleString()}`));
  await page.locator('[data-scoring-step="total"]').waitFor();assert.equal(Number((await page.locator('.royal-primary-score strong').innerText()).replaceAll(',','')),result.score);
  assert.equal(await page.locator('.royal-grid button').count(),25);await page.locator('.royal-breakdown').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);return {solo,reason,steps,score:result.score,bonus:result.timeBonus,authoritativeLabels:true,boardRetained:true,automaticAdvance:true};
 }finally{await page.close();await db.end();}
})();cases.push(item);}return cases;}));
 writeFileSync('qualification.local/royal-flash/presentation-live.json',JSON.stringify(evidence,null,2));console.log(evidence);
}finally{await browser.close();}
