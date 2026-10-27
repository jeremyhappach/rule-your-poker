import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const dir='dev/quintzee/evidence/round-duration';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[],errors=[];
try{for(const [width,height]of [[320,568],[390,844],[844,390]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:15319/dev/quintzee/round-duration-preview.html');assert.equal(response.status(),200);
 await page.getByRole('tab',{name:'Dice',exact:true}).click();await page.getByRole('combobox',{name:'Game'}).selectOption('quintzee');
 const input=page.getByLabel('Round duration (seconds)');await input.waitFor();assert.equal(await input.inputValue(),'240');
 await input.fill('300');await page.getByLabel('Theme',{exact:true}).selectOption('modern');
 const geometry=await input.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1};});assert.ok(geometry.left>=0&&geometry.right<=width&&!geometry.overflow);
 await page.screenshot({path:`${dir}/defaults-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Save Defaults',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 const saved=await page.evaluate(()=>window.durationPreviewWrites.find(w=>w.key==='quintzee').patch);assert.equal(saved.quintzee_round_seconds,300);assert.equal(saved.decision_timer_seconds,10);assert.equal(saved.quintzee_theme,'modern');
 await page.getByRole('button',{name:'Open Defaults',exact:true}).click();await page.getByLabel('Round duration (seconds)').waitFor();assert.equal(await page.getByLabel('Round duration (seconds)').inputValue(),'300');
 checks.push({width,height,http:200,geometry,savedAndReloaded:300});await page.close();
 }assert.deepEqual(errors,[]);writeFileSync(`${dir}/browser.json`,JSON.stringify({passed:true,localMock:true,checks},null,2));console.log(JSON.stringify(checks));}finally{await browser.close();}
