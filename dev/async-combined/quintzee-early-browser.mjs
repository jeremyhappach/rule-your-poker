import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15403',out='qualification.local/async-combined',checks=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function verify(page,expected){
 const styles=[];for(const [i,selector] of ['.q-upper-bonus','.q-filled-bonus'].entries()){
  const item=page.locator(selector);await expect(item).toBeVisible();if(expected[i]===null)await expect(item).not.toHaveAttribute('data-earned');else await expect(item).toHaveAttribute('data-earned',String(expected[i]));
  assert.equal(await item.locator('em').count(),expected[i]===false?0:1);
  const style=await item.locator(':scope > span').evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,weight:c.fontWeight,decoration:c.textDecorationLine};});
  if(expected[i]===true){assert.equal(style.color,'rgb(155, 229, 162)');assert(+style.weight>=700);await expect(item.locator('em')).toHaveCSS('color','rgb(155, 229, 162)');}
  else if(expected[i]===false){assert.equal(style.color,'rgb(255, 158, 158)');assert(style.decoration.includes('line-through'));}
  else{assert(!style.decoration.includes('line-through'));assert.notEqual(style.color,'rgb(155, 229, 162)');}
  styles.push(style);
 }return styles;
}
try{
 for(const [device,width,height] of [['phone',390,844],['desktop',1054,720]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:device==='phone',isMobile:device==='phone'});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [mid,expected] of [['pending',[null,null]],['upper_achieved',[true,null]],['upper_failed',[false,null]],['fill_failed',[null,false]]]){
   await page.goto(base+'/quintzee?mid='+mid);const styles=await verify(page,expected);await page.screenshot({path:out+`/quintzee-mid-${device}-${mid}.png`});await page.reload();await verify(page,expected);checks.push({device,mid,expected,styles,reload:true});
  }
  await page.goto(base+'/quintzee?mid=upper_achieved&theme=classic');await verify(page,[true,null]);checks.push({device,theme:'classic',achievedHelperGreen:true});
  for(const bonus of ['upper','fill','both','neither'])for(const replay of [false,true]){
   await page.goto(base+`/quintzee?bonus=${bonus}${replay?'&replay=1':''}`);await page.waitForTimeout(5600);const expected=[bonus==='upper'||bonus==='both',bonus==='fill'||bonus==='both'];await verify(page,expected);checks.push({device,bonus,replay,expected});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/quintzee-early-browser.json',JSON.stringify({passed:true,checks,errors,scope:'real shared view; local scripted committed-score snapshots, no production data or gameplay'},null,2));console.log(JSON.stringify({passed:true,count:checks.length,errors}));
}finally{await browser.close();}
