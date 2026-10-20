import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/take-two/round-end';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),evidence=[];
try{
 for(const [width,height]of [[393,662],[393,587],[852,393],[852,300],[1440,900]])for(const players of [1,2,7])for(const [ending,elapsed]of [['clear',1500],['clear',4200],['normal',2600]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(`http://127.0.0.1:5187/dev/take-two/layout.html?players=${players}&stage=3&result=${ending}&elapsed=${elapsed}`);
  await page.locator('.take-result').waitFor();await page.waitForTimeout(150);
  const g=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,cx:r.x+r.width/2,cy:r.y+r.height/2,h:r.height};};
   return {cabinet:rect(document.querySelector('.take-cabinet')),pill:rect(document.querySelector('.take-total .tri-score-pill')),texts:[...document.querySelectorAll('.take-round-result h2,.take-round-result strong')].map(rect),phase:document.querySelector('.take-result').dataset.resultPhase,scroll:document.documentElement.scrollHeight>innerHeight};
  });
  assert.equal(g.scroll,false);for(const r of [g.pill,...g.texts])assert.ok(r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height,'fit '+JSON.stringify({width,height,players,ending,elapsed,r}));
  if(elapsed>=3000||ending==='normal'){assert.equal(g.phase,'score');assert.ok(Math.abs(g.pill.cx-g.cabinet.cx)<1);assert.ok(Math.abs(g.pill.cy-(g.cabinet.y+g.cabinet.h*.48))<1);assert.ok(g.texts[0].bottom<g.pill.y,'title/pill overlap '+JSON.stringify({width,height,players,g}));}
  else assert.equal(g.phase,'clear');
  await page.screenshot({path:`${dir}/${width}x${height}-${players}-${ending}-${elapsed}.png`});evidence.push({width,height,players,ending,elapsed,...g});await page.close();
 }
 writeFileSync(`${dir}/geometry.json`,JSON.stringify(evidence,null,2));console.log(evidence.length,'round-end layouts passed');
}finally{await browser.close();}
