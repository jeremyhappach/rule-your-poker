import {chromium,expect} from '@playwright/test';import fs from 'node:fs';
const browser=await chromium.launch({headless:true,channel:'msedge'});const out='dev/lobby-catalog/screenshots';fs.mkdirSync(out,{recursive:true});let checks=0;const errors=[];
const fixtures=JSON.parse(fs.readFileSync('dev/lobby-catalog/production-fixture.json','utf8'));
const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/arcade',async route=>{const q=route.request().postDataJSON();if(q.op!=='leaderboard')throw Error('Unexpected mutation');const rules=fixtures.arcadeRules.filter(r=>r.game===q.game&&r.enabled).at(-1);await route.fulfill({json:{currentRuleset:rules.id,ruleset:rules.id,rows:[],self:null,personalBest:null,previousBests:[],activeRun:null,latestResult:null}});});
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[1280,800]]){
 await page.setViewportSize({width,height});
 for(const surface of ['dealer','defaults','rules','arcade']){
  await page.goto('http://127.0.0.1:5187/dev/lobby-catalog/index.html?surface='+surface);if(surface==='dealer'||surface==='arcade')await page.getByRole('button',{name:'Open '+surface,exact:true}).waitFor();
  if(surface==='defaults')await page.getByLabel('Default stake / ante ($)').waitFor();
  if(surface==='rules')await page.getByText('3-5-7 Overview').waitFor();
  if(surface==='dealer'){await page.getByRole('tab',{name:'Dice',exact:true}).click();await page.getByRole('button',{name:'Ship Captain Crew',exact:true}).waitFor();}
  if(surface==='arcade')await page.getByRole('link',{name:'Run21 leaderboard'}).waitFor();
  await page.screenshot({path:out+'/'+surface+'-'+width+'.png',fullPage:true,animations:"disabled"});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error(surface+' horizontal overflow '+width);checks++;
  if(surface==='defaults'){await page.getByText('Timing',{exact:true}).click();await page.getByLabel('Decision Timer (seconds)',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/defaults-expanded-'+width+'.png',fullPage:true,animations:"disabled"});checks++;}
 }
}
await page.setViewportSize({width:320,height:568});await page.goto('http://127.0.0.1:5187/dev/lobby-catalog/index.html?surface=dealer&game=run21&players=3');await page.getByRole('button',{name:'Run21 Exactly 2 players'}).waitFor();if(await page.getByRole('button',{name:'Run21 Exactly 2 players'}).isEnabled())throw Error('invalid count enabled');await page.screenshot({path:out+'/dealer-disabled-320.png',animations:'disabled'});checks++;
await page.evaluate(()=>document.documentElement.style.fontSize='24px');await page.screenshot({path:out+'/dealer-enlarged-320.png',fullPage:true,animations:"disabled"});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('enlarged overflow');checks++;

// Exercise every registered Rules article through the real category and game controls.
await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5187/dev/lobby-catalog/index.html?surface=rules');
for(const [category,ids] of [['Cards',['holm-game','3-5-7','cribbage','gin-rummy']],['Dice',['horses','ship-captain-crew','yahtzee','farkle']],['Other',['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash']]]){
 await page.getByRole('tab',{name:category,exact:true}).click();
 for(const id of ids){await page.getByRole('combobox',{name:'Game'}).selectOption(id);await page.locator('.catalog-rules-copy p').first().waitFor();await page.waitForFunction(()=>!document.querySelector('.catalog-rules-copy [role="status"]'));if(await page.locator('.catalog-rules-copy [role="alert"]').count())throw Error('Rules failed '+id);checks++;}
}
await page.getByRole('combobox',{name:'Game'}).focus();await page.keyboard.press('Space');await page.screenshot({path:out+'/rules-dropdown-390.png',animations:'disabled'});await page.keyboard.press('Escape');
await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Open rules',exact:true}).waitFor({state:'visible'});checks++;
await page.goto('http://127.0.0.1:5187/dev/lobby-catalog/index.html?surface=arcade');
for(const id of ['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash']){if(await page.locator('a[href="/arcade/'+id+'"]').count()!==1)throw Error('Leaderboard route '+id);checks++;}
await page.getByRole('button',{name:'TriTowers rules and info'}).click();await page.getByText(/tri-towers\/5/).waitFor();await page.screenshot({path:out+'/arcade-info-390.png',animations:'disabled'});await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'TriTowers rules and info'})).toBeFocused();checks++;
await browser.close();fs.writeFileSync('dev/lobby-catalog/browser-results.json',JSON.stringify({checks,errors,environment:'Headless Chromium; mocked local adapters; no production writes; not physical iPhone'},null,2));console.log({checks,errors});if(errors.length)process.exitCode=1;
