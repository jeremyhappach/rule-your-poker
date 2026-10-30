import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15403',out='qualification.local/async-combined',checks=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function verify(page,expected,paceExpected){
 const styles=[];for(const [i,selector] of ['.q-upper-bonus','.q-filled-bonus'].entries()){
  const item=page.locator(selector);await expect(item).toBeVisible();if(expected[i]===null)await expect(item).not.toHaveAttribute('data-earned');else await expect(item).toHaveAttribute('data-earned',String(expected[i]));
  assert.equal(await item.locator('em').count(),expected[i]===false?0:1);
  const style=await item.locator(':scope > span').evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,weight:c.fontWeight,decoration:c.textDecorationLine};});
  if(expected[i]===true){assert.equal(style.color,'rgb(155, 229, 162)');assert(+style.weight>=700);await expect(item.locator('em')).toHaveCSS('color','rgb(155, 229, 162)');}
  else if(expected[i]===false){assert.equal(style.color,'rgb(255, 158, 158)');assert(style.decoration.includes('line-through'));}
  else{assert(!style.decoration.includes('line-through'));assert.notEqual(style.color,'rgb(155, 229, 162)');}
  styles.push(style);
 }
 const upper=page.locator('.q-upper-bonus'),label=await upper.locator(':scope > span').boundingBox(),counter=await upper.locator('[data-upper-progress]').boundingBox(),column=await upper.boundingBox(),filled=await page.locator('.q-filled-bonus').boundingBox(),bonuses=await page.locator('.q-bonuses').boundingBox();
 assert(Math.abs(label.y+label.height/2-counter.y-counter.height/2)<1);assert(Math.abs(counter.x+counter.width-column.x-column.width)<1);assert(label.x+label.width<=counter.x);assert(column.x+column.width<filled.x);assert(filled.x+filled.width<=bonuses.x+bonuses.width+1);
 const pace=upper.locator('[data-upper-pace]');if(paceExpected===null)await expect(pace).toHaveCount(0);else{await expect(pace).toHaveText(paceExpected);await expect(pace).toHaveCSS('color','rgb(255, 255, 255)');const r=await pace.boundingBox();assert(r.y>=counter.y+counter.height);assert(Math.abs(r.x+r.width-counter.x-counter.width)<1);}
 return {styles,geometry:{label,counter,column,filled},pace:paceExpected};
}
try{
 for(const [device,width,height] of [['phone',390,844],['desktop',1054,720]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:device==='phone',isMobile:device==='phone'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [mid,expected,pace] of [['pending',[null,null],'0'],['upper_achieved',[true,null],'+18'],['upper_failed',[false,null],null],['fill_failed',[null,false],'-3']]){
   await page.goto(base+'/quintzee?mid='+mid);const styles=await verify(page,expected,pace);await page.screenshot({path:out+`/quintzee-mid-${device}-${mid}.png`});await page.reload();await verify(page,expected,pace);checks.push({device,mid,expected,styles,reload:true});
  }
  await page.goto(base+'/quintzee?mid=upper_achieved&theme=classic');await verify(page,[true,null],'+18');checks.push({device,theme:'classic',achievedHelperGreen:true});
  if(device==='phone'){await page.setViewportSize({width:320,height:568});await page.goto(base+'/quintzee?mid=upper_achieved');await verify(page,[true,null],'+18');checks.push({device:'narrow-phone',alignment:true,pace:'+18'});await page.setViewportSize({width,height});}
  for(const bonus of ['upper','fill','both','neither'])for(const replay of [false,true]){
   await page.goto(base+`/quintzee?bonus=${bonus}${replay?'&replay=1':''}`);await page.waitForTimeout(5600);const expected=[bonus==='upper'||bonus==='both',bonus==='fill'||bonus==='both'];await verify(page,expected,expected[0]?'+6':null);checks.push({device,bonus,replay,expected});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/quintzee-early-browser.json',JSON.stringify({passed:true,checks,errors,scope:'real shared view; local scripted committed-score snapshots, no production data or gameplay'},null,2));console.log(JSON.stringify({passed:true,count:checks.length,errors}));
}finally{await browser.close();}
