import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='qualification.local/arcade-leaderboards';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const checks=[],requests=[],errors=[],external=[];
const names=['RiverAce','Alexandria Montgomery-Smythe','Hap','Jeremy','PocketRocket','Maya Chen','NightOwl','CaptainJ','LuckyLou','Sam'];
const versions={'357-drop':'357-drop/5','horses-blitz':'horses-blitz/4','crib-lab':'crib-lab/4','chucky-showdown':'chucky-showdown/4'};
const rows=game=>names.map((name,i)=>({runId:'sample-'+i,userId:i===3?'local-fixture':'sample-user-'+i,name,rank:i+1,score:game==='mega-card-golf'?-42+i*5:123456789-i*1500,completedAt:'2026-11-08T15:41:00Z'}));
let scenario='normal';
try{
 const context=await browser.newContext({timezoneId:'America/Chicago',locale:'en-US',hasTouch:true});
 context.setDefaultTimeout(15000);
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);return route.abort();}
  if(url.pathname!=='/api/arcade')return route.continue();
  const q=route.request().postDataJSON();requests.push(q);
  if(q.op==='history')return route.fulfill({json:[{runId:'history',score:123456789,completedAt:'2026-11-08T15:41:00Z',ruleset:'chucky-showdown/4'}]});
  if(q.op==='start')return route.fulfill({json:{id:'fixture-start'}});
  if(q.op!=='leaderboard')throw Error('Unexpected fixture operation '+q.op);
  if(scenario==='error')return route.fulfill({status:403,json:{error:'arcade:forbidden'}});
  const entries=rows(q.game),ruleset=versions[q.game]??q.game+'/1';
  return route.fulfill({json:{rows:scenario==='empty'?[]:entries,self:scenario==='outside'?{...entries[3],runId:'outside',rank:12}:entries[3],personalBest:entries[3].score,previousBests:[],ruleset:q.ruleset??ruleset,currentRuleset:ruleset,availableRulesets:q.game==='357-drop'?[ruleset,'357-drop/4']:[ruleset],activeRun:scenario==='resume'?'fixture-active':null,...(scenario==='result'?{latestResult:{score:123456789,rank:2,status:'completed',ruleset}}:{})}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:5196/dev/arcade-timestamps/index.html';
 const open=game=>page.goto(base+'?game='+game);
 await open('run21');
 const catalog=await page.evaluate(async()=>{const {ARCADE_GAMES}=await import('/src/lib/gameCatalog/index.ts');return ARCADE_GAMES.map(({id,name})=>({id,name}));});
 expect(catalog).toHaveLength(14);
 for(const {id:game,name} of catalog)for(const [width,height] of [[320,568],[375,812],[430,932]]){
  scenario='normal';
  await page.setViewportSize({width,height});await open(game);
  const table=page.locator('.arcade-score-table').first();
  await expect(table.locator('tbody tr')).toHaveCount(10);
  for(const period of ['30','all']){
   if(period==='all')await page.getByRole(game==='mega-card-golf'?'button':'tab',{name:'All Time',exact:true}).click();
   await expect(table.locator('tbody tr')).toHaveCount(10);
   await expect(table.locator('time').first()).toHaveText('11/08/26 9:41 AM');
   const metrics=await table.evaluate(t=>({pageFits:document.documentElement.scrollWidth<=innerWidth+1,tableFits:t.scrollWidth<=t.clientWidth+1,rows:[...t.tBodies[0].rows].map(r=>({nameFits:r.cells[1].scrollWidth<=r.cells[1].clientWidth+1,dateFits:r.cells[2].scrollWidth<=r.cells[2].clientWidth+1,scoreFits:r.cells[3].scrollWidth<=r.cells[3].clientWidth+1}))}));
   expect(metrics.pageFits,game+' '+width).toBe(true);expect(metrics.tableFits,game+' '+width).toBe(true);
   for(const row of metrics.rows){expect(row.dateFits).toBe(true);expect(row.scoreFits).toBe(true);if(game!=='mega-card-golf')expect(row.nameFits).toBe(true);}
   checks.push({game,width,period,metrics});
  }
  if(game!=='mega-card-golf'){
   await expect(page.locator('h1')).toHaveText(name);
   await expect(page.getByRole('heading',{name:'Top 10 verified scores'})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
   if(game==='chucky-showdown'){
    const title=await page.locator('h1').evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),fits:el.scrollWidth<=el.clientWidth+1}));
    expect(title.fits).toBe(true);expect(title.height).toBeLessThanOrEqual(title.line+1);
   }
   const images=await page.locator('.scene-art img').evaluateAll(els=>els.map(el=>el.complete&&el.naturalWidth>0));
   expect(images.every(Boolean)).toBe(true);
  }
  if(width===375||width===320)await page.screenshot({path:out+'/'+game+'-'+width+'.png',fullPage:true});
 }
 await page.setViewportSize({width:375,height:812});
 for(const {id:game,name} of catalog.filter(g=>g.id!=='mega-card-golf')){
  scenario='normal';await open(game);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:name+' rules and info'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByRole('heading',{name:name+' · Rules & info',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Last 30 Days'}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'All Time'})).toHaveAttribute('aria-selected','true');
  if(game==='quintzee'){
   await page.getByRole('switch',{name:'Classic Mode'}).click();
   await expect(page.getByRole('switch',{name:'Classic Mode'})).toHaveAttribute('aria-checked','true');
  }
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page).toHaveURL(new RegExp('/arcade/'+game+'/run/fixture-start$'));
  const start=requests.filter(q=>q.op==='start').at(-1);expect(start.game).toBe(game);expect(start.requestId).toBeTruthy();
  if(game==='quintzee')expect(start.theme).toBe('classic');
  checks.push({game,controls:true});
 }
 scenario='resume';await open('quintzee');await expect(page.getByRole('link',{name:'Resume'})).toHaveAttribute('href','/arcade/quintzee/run/fixture-active');await expect(page.getByRole('switch')).toBeDisabled();
 scenario='result';await open('chucky-showdown');await expect(page.getByRole('button',{name:'Play Again'})).toBeEnabled();await expect(page.locator('.arcade-result')).toContainText('123,456,789');
 await page.getByText('My score history',{exact:true}).click();await expect(page.locator('details ol li')).toHaveCount(1);
 scenario='outside';await open('run21');await expect(page.locator('.arcade-your-rank')).toContainText('#12');
 scenario='empty';await open('run21');await expect(page.getByText('No qualifying games yet. Set the first score.')).toBeVisible();
 scenario='error';await open('run21');await expect(page.getByRole('alert')).toContainText('Your account cannot access Arcade.');
 scenario='normal';await open('357-drop');await page.getByRole('button',{name:'357 Drop rules and info'}).click();await page.getByRole('combobox',{name:'Leaderboard rules'}).selectOption('357-drop/4');await page.keyboard.press('Escape');await expect(page.getByText('Legacy leaderboard',{exact:true})).toBeVisible();await expect(page.locator('.arcade-rules-hint')).toContainText('Partial carry playtest');
 checks.push({resume:true,result:true,history:true,outside:true,empty:true,error:true,legacy:true});
 expect(errors).toEqual([]);expect(external).toEqual([]);
 writeFileSync(out+'/results.json',JSON.stringify({catalog,checks,requests,errors,external,environment:'Installed Edge touch browser; actual GameBoard and CourseClubhouse; local mocked account and API responses; no production writes; physical iPhone smoke pending'},null,2));
 console.log(JSON.stringify({games:catalog.length,checks:checks.length,requests:requests.length,errors,external}));
}finally{await browser.close();}
