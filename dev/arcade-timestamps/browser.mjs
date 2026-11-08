import {chromium,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='test-results/arcade-timestamps';mkdirSync(out,{recursive:true});
const games=['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','quintzee'];
const widths=[[320,568],[390,844],[844,390],[1280,800]];
const dates=['2026-11-03T02:42:00.123456+00:00',null,'bad-date','2025-01-01T00:30:00Z','2027-01-01T06:10:00Z'];
const browser=await chromium.launch({headless:true,channel:'msedge'}),checks=[],errors=[],requests=[];
const rows=(all,golf)=>dates.slice(0,all?5:3).map((completedAt,i)=>({runId:'result-'+i,userId:'local-fixture',name:i===0?'Player With An Exceptionally Long Display Name':'Ada',rank:i===1?1:i+1,score:golf?[-123,-123,0,3,150][i]:[12345678,12345678,7450,1200,1000][i],completedAt}));
try{
const context=await browser.newContext({timezoneId:'America/Chicago',locale:'en-US',hasTouch:true});
context.setDefaultTimeout(15000);
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Unexpected external request '+url.origin);
 if(url.pathname!=='/api/arcade')return route.continue();
 const q=route.request().postDataJSON();requests.push(q);
 if(q.op!=='leaderboard')throw Error('Unexpected mutation '+q.op);
 const entries=rows(q.window==='all',q.game==='mega-card-golf');
 return route.fulfill({json:{rows:entries,self:entries[0],personalBest:entries[0].score,previousBests:[],ruleset:q.game+'/1',currentRuleset:q.game+'/1'}});
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:5196/dev/arcade-timestamps/index.html';
for(const game of [...games,'mega-card-golf'])for(const [width,height] of widths){
 await page.setViewportSize({width,height});await page.goto(base+'?game='+game);
 const table=page.locator('.arcade-score-table').first();
 await expect(table.locator('tbody tr')).toHaveCount(3);
 for(const period of ['30','all']){
  if(period==='all')await page.getByRole(game==='mega-card-golf'?'button':'tab',{name:'All Time',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(period==='all'?5:3);
  await expect(table.locator('time').first()).toHaveText('11/02/26 8:42 PM');
  await expect(table.locator('[aria-label="Achievement time unavailable"]')).toHaveCount(2);
  if(period==='all'){
   await expect(table.locator('time').nth(1)).toHaveText('12/31/24 6:30 PM');
   await expect(table.locator('time').nth(2)).toHaveText('01/01/27 12:10 AM');
  }
  const metrics=await table.evaluate(table=>{
   const rect=table.getBoundingClientRect();
   const rows=[...table.tBodies[0].rows].map(row=>{
    const cells=[...row.cells],score=cells.at(-1),date=cells[2],name=cells[1];
    return {height:row.getBoundingClientRect().height,scoreFits:score.scrollWidth<=score.clientWidth,dateFits:date.scrollWidth<=date.clientWidth,nameWidth:name.clientWidth,nameTruncated:name.scrollWidth>name.clientWidth,right:score.getBoundingClientRect().right};
   });
   // Compare an unchanged short-name row to the original three-column markup.
   const original=table.cloneNode(true);original.className='';
   for(const row of original.rows){row.deleteCell(2);for(const cell of row.cells)cell.className='';}
   original.style.visibility='hidden';original.style.position='absolute';original.style.width=rect.width+'px';table.parentNode.append(original);
   const oldHeight=original.tBodies[0].rows[1].getBoundingClientRect().height;original.remove();
   return {rows,oldHeight,width:rect.width,containerFits:table.parentElement.scrollWidth<=table.parentElement.clientWidth+1,pageFits:document.documentElement.scrollWidth<=innerWidth+1};
  });
  expect(metrics.containerFits,JSON.stringify({game,width,metrics})).toBe(true);expect(metrics.pageFits).toBe(true);
  for(const row of metrics.rows){expect(row.scoreFits).toBe(true);expect(row.dateFits).toBe(true);expect(row.nameWidth).toBeGreaterThan(10);if(game==='mega-card-golf')expect(Math.abs(row.height-metrics.oldHeight)).toBeLessThan(1);else expect(row.height).toBeGreaterThanOrEqual(37);expect(row.right).toBe(metrics.rows[0].right);}
  checks.push({game,width,period,metrics});
  if(['run21','mega-card-golf'].includes(game)&&[320,390,1280].includes(width))await page.screenshot({path:`${out}/${game}-${width}-${period}.png`,fullPage:true});
 }
}
// Exercise all Golf courses and the persisted archived board, including historical years.
for(let course=0;course<3;course++){
 await page.setViewportSize({width:390,height:844});await page.goto(base+'?game=mega-card-golf&course='+course);
 await expect(page.locator('.mega-leaderboard time').first()).toHaveText('11/02/26 8:42 PM');
 await page.getByText(/Archived board ·/).click();
 await expect(page.locator('.mega-archive time')).toHaveText('12/31/24 5:59 PM');
 expect(await page.locator('.mega-course-board').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 checks.push({course,archive:true});
}
const dateTimeBefore=await page.locator('.mega-leaderboard time').first().getAttribute('datetime');
await page.reload();await expect(page.locator('.mega-leaderboard time').first()).toHaveAttribute('datetime',dateTimeBefore);
await context.close();
for(const [timezoneId,expected] of [['America/New_York','11/02/26 9:42 PM'],['Asia/Tokyo','11/03/26 11:42 AM']]){
 const ctx=await browser.newContext({timezoneId,locale:'en-GB',viewport:{width:390,height:844}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/api/arcade',route=>route.fulfill({json:{rows:rows(true,false),previousBests:[],self:null}}));
 await p.goto(base+'?game=run21');await expect(p.locator('time').first()).toHaveText(expected);
 checks.push({timezoneId,expected});await ctx.close();
}
expect(errors).toEqual([]);
writeFileSync(out+'/results.json',JSON.stringify({checks,requests:requests.map(({game,window,courseId})=>({game,window,courseId})),errors,environment:'Installed Edge; actual leaderboard components, local read-only API fixtures; no production writes; physical-device smoke pending'},null,2));
console.log(JSON.stringify({checks:checks.length,requests:requests.length,errors}));
}finally{await browser.close();}
