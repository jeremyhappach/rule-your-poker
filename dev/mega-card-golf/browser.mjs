import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='test-results/mega-card-golf';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[],external=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);return route.abort();}return route.continue();});
try{
 await page.goto('http://127.0.0.1:5187/dev/mega-card-golf/index.html');
 await page.getByRole('heading',{name:/Little cards/}).waitFor();
 await page.evaluate(()=>Promise.all(['/mega-card-golf/courses-v1.png','/mega-card-golf/sunny-meadows-v2.png'].map(src=>{const image=new Image();image.src=src;return image.decode();})));
 for(const [name,width,height] of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.screenshot({path:`${out}/selection-${name}.png`,fullPage:true});
  checks.push({view:'selection-'+name,overflow:await page.locator('.mega-app').evaluate(el=>el.scrollWidth>el.clientWidth+1),courses:await page.getByRole('button',{name:'Start course'}).count()});
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Defaults',exact:true}).click();
 await page.getByRole('heading',{name:'One course. One set of rules.'}).waitFor();await page.screenshot({path:`${out}/defaults-desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'Courses',exact:true}).click();await page.getByRole('button',{name:'Start course'}).first().click();
 await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();
 for(const [name,width,height] of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.screenshot({path:`${out}/game-${name}.png`,fullPage:true});
  checks.push({view:'game-'+name,overflow:await page.locator('.mega-app').evaluate(el=>el.scrollWidth>el.clientWidth+1),cards:await page.locator('.mega-tableau .mega-card').count(),buttons:await page.locator('.mega-draw-area').boundingBox()});
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Draw a card',exact:true}).click();
 await page.getByRole('button',{name:/Card 2 · concealed/}).click();
 await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor({state:'visible'});await page.reload();await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();
 checks.push({view:'reconnect',run:new URL(page.url()).searchParams.get('run'),concealed:await page.locator('.mega-tableau .mega-back').count(),stock:await page.locator('.mega-counters').innerText()});
 await page.screenshot({path:`${out}/game-reconnected.png`,fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});checks.push({view:'reduced-motion',animation:await page.locator('.mega-card').first().evaluate(el=>getComputedStyle(el).animationName)});
}finally{writeFileSync(`${out}/browser-evidence.json`,JSON.stringify({checks,errors,external},null,2));console.log(JSON.stringify({checks,errors,external},null,2));await browser.close();}
if(errors.length||external.length||checks.some(c=>c.overflow))process.exitCode=1;
