import {chromium} from '@playwright/test';import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const f=JSON.parse(read('qualification.local/ptown-words/live.json','utf8')),errors=[],checks=[];mkdirSync('qualification.local/ptown-words/browser',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 for(const [width,height] of [[320,568],[390,760],[844,390],[1024,760]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5197/dev/ptown-words/live.html?${new URLSearchParams({id:f.id,session:f.session,user:f.users[0]})}`);await page.locator('.words-grid').waitFor();
  for(const scene of ['overview','zoom']){
   if(scene==='zoom')await page.getByRole('button',{name:'Zoom In',exact:true}).click();
   const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {board:rect(document.querySelector('.words-scroll')),rack:[...document.querySelectorAll('.words-rack button')].map(rect),cells:document.querySelectorAll('.words-cell').length,cell:rect(document.querySelector('.words-cell')),scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],actions:rect(document.querySelector('.words-turn-actions'))};});
   checks.push({width,height,scene,...geometry});await page.screenshot({path:`qualification.local/ptown-words/browser/${width}-${height}-${scene}.png`});
   assert.equal(geometry.cells,225);assert.ok(geometry.board.h>=90,JSON.stringify({width,height,geometry}));assert.ok(geometry.actions.bottom<=height+1,JSON.stringify({width,height,geometry}));assert.ok(geometry.rack.every(r=>r.w>=43.9&&r.h>=44),JSON.stringify({width,height,geometry}));assert.ok(geometry.scroll[0]<=width&&geometry.scroll[1]<=height,JSON.stringify({width,height,geometry}));if(scene==='zoom')assert.equal(geometry.cell.w,48);
  }await page.close();
 }
 assert.deepEqual(errors,[]);write('qualification.local/ptown-words/browser.json',JSON.stringify({checks,errors},null,2));console.log('8 live SQL viewport states PASS');
}finally{await browser.close();}
