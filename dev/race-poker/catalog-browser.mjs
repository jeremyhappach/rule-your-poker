import {chromium,expect} from '@playwright/test';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage(),errors=[],checks=[];
const out='qualification.local/race-poker/catalog';mkdirSync(out,{recursive:true});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
const fixture=JSON.parse(readFileSync('dev/lobby-catalog/production-fixture.json','utf8'));
await page.route('**/api/arcade',async route=>{const q=route.request().postDataJSON();assert.notEqual(q.game,'race-poker');await route.fulfill({json:{currentRuleset:fixture.arcadeRules.filter(r=>r.game===q.game&&r.enabled).at(-1)?.id}});});
const url=q=>'http://127.0.0.1:5228/dev/race-poker/catalog.html?'+q;
const calls=()=>page.evaluate(()=>window.__catalogCalls);
async function fits(label){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label);checks.push(label);}
try{
for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[390,664],[1280,800]]){
 await page.setViewportSize({width,height});await page.goto(url('surface=setup&humans=1&real=1'));
 await page.getByRole('button',{name:'Race Poker',exact:true}).click();await expect(page.getByLabel('Match stake ($)')).toHaveValue('5');
 await page.getByLabel('Match stake ($)').fill('9');await page.getByRole('button',{name:'Start Race Poker',exact:true}).scrollIntoViewIfNeeded();await fits('setup '+width+'x'+height);
 await page.screenshot({path:out+'/setup-'+width+'-'+height+'.png'});await page.getByRole('button',{name:'Start Race Poker',exact:true}).click();
 await page.getByText('$9',{exact:true}).waitFor();assert.equal((await calls()).filter(c=>c.name==='submit_ante_decision').length,0);await fits('ante '+width+'x'+height);
 const offer=(await calls()).find(c=>c.name==='race_poker_configure');assert.deepEqual(offer.args.p_config,{ante_amount:9});assert.equal(offer.args.p_game_type,'race-poker');
 await page.getByRole('button',{name:/Ante Up!/}).click();await page.getByText('Consent accepted').waitFor();assert.equal((await calls()).filter(c=>c.name==='submit_ante_decision').length,1);
 for(const surface of ['defaults','rules']){
  await page.goto(url('surface='+surface));if(surface==='defaults')await page.getByLabel('Default stake / ante ($)').waitFor();
  await page.getByRole('tab',{name:'Other',exact:true}).click();await page.getByRole('combobox',{name:'Game'}).selectOption('race-poker');
  if(surface==='rules'){await page.getByText(/Approved Ptown adaptation/).waitFor();await expect(page.getByText(/You have 30 seconds/)).toBeVisible();}
  else{await expect(page.getByLabel('Default stake / ante ($)')).toHaveValue('5');await page.getByLabel('Default stake / ante ($)').fill('11');}
  await fits(surface+' '+width+'x'+height);await page.screenshot({path:out+'/'+surface+'-'+width+'-'+height+'.png'});
  if(surface==='defaults'){await page.getByRole('button',{name:'Save Defaults',exact:true}).click();await page.waitForFunction(()=>window.__catalogWrites.some(w=>w.key==='race-poker'&&w.patch.ante_amount===11));}
 }
}
for(const q of ['closed=1&runback=1','players=1&humans=1','players=3&humans=2','players=2&humans=0']){
 await page.goto(url('surface=setup&'+q));await page.getByRole('tab',{name:'Other',exact:true}).waitFor();await page.waitForTimeout(200);
 const option=page.locator('[data-dealer-game-option="race-poker"]');if(q.startsWith('closed')){await expect(option).toHaveCount(0);await expect(page.getByRole('button',{name:/Run Back/})).toHaveCount(0);}else await expect(option).toBeDisabled();
 assert.equal((await calls()).filter(c=>c.name==='race_poker_configure').length,0);checks.push('eligibility '+q);
}
for(const humans of [1,2]){await page.goto(url('surface=setup&runback=1&humans='+humans));await page.getByRole('button',{name:/Run Back Race Poker/}).click();await page.getByText('$9',{exact:true}).waitFor();assert.deepEqual((await calls()).find(c=>c.name==='race_poker_configure').args.p_config,{ante_amount:9});checks.push('exact runback humans='+humans);}
await page.goto(url('surface=setup'));await page.getByRole('button',{name:'Race Poker',exact:true}).click();
for(const [width,height] of [[390,844],[390,664],[844,390],[320,568]]){await page.setViewportSize({width,height});await page.getByRole('button',{name:'Start Race Poker',exact:true}).scrollIntoViewIfNeeded();await fits('live resize '+width+'x'+height);}
assert.deepEqual(errors,[]);writeFileSync('qualification.local/race-poker/catalog-browser.json',JSON.stringify({passed:true,at:new Date().toISOString(),checks,errors,environment:'Headless Edge; actual UI with isolated mock transport, no financial proof or physical Safari claim'}));console.log(checks.length+' catalog browser checks PASS');
}catch(e){console.error(JSON.stringify({calls:await calls(),body:(await page.locator('body').innerText()).slice(-2500),errors}));await page.screenshot({path:out+'/failure.png'});throw e;}finally{await browser.close();}
