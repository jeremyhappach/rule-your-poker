import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const label=process.argv[2]??'after',dir=`qualification.local/take-two/layout-pass-${label}`;
mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)}),layouts=[];
try{
 for(const [width,height] of [[393,662],[393,587],[393,852],[852,393],[852,300],[320,568],[1440,900]])for(const players of [1,2,7])for(const stage of [1,3]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(`http://127.0.0.1:5187/dev/take-two/layout.html?players=${players}&stage=${stage}`);
  await page.locator('.take-tableau [data-playing-card-root]').last().waitFor();await page.waitForTimeout(100);
  const g=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,cx:r.x+r.width/2};},get=s=>box(document.querySelector(s));
   const buttons=[...document.querySelectorAll('.take-tableau>button')];
   const cards=buttons.map(b=>({button:box(b),face:box(b.querySelector('[data-playing-card-root]')),rank:box(b.querySelector('[data-card-rank]')),covered:b.hasAttribute('data-covered'),row:Number(b.getAttribute('aria-label').match(/^Row (\d+)/)[1])}));
   const rankClearance=cards.filter(c=>c.covered).map(c=>Math.min(...cards.filter(n=>n.row===c.row+1).map(n=>n.face.y))-c.rank.bottom);
   const targets=[...buttons.filter(b=>!b.disabled),...document.querySelectorAll('.take-current,.take-stock,.take-bank')];
   const hits=targets.every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height*.8)?.closest('button')===b;});
   return{cards,rankClearance,hits,tableau:get('.take-tableau'),cabinet:get('.take-cabinet'),score:get('.take-total'),current:get('.take-current'),stock:get('.take-stock'),clock:get('.take-clock'),badge:document.querySelector('.take-stock-count')?get('.take-stock-count'):null,controls:[...document.querySelectorAll('.take-stock,.take-current,.take-bank,.take-clock,.take-counters,.take-meter')].map(box),scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
  });
  if(label!=='before'){
   const context=`${width}x${height}/${players}/round${stage}`;
   assert.equal(g.scroll,false,context+' scroll');assert.ok(g.hits,context+' hit targets');
   for(const c of g.cards){assert.ok(Math.abs(c.face.h/c.face.w-1.5)<.02,context+' ratio');assert.ok(Math.abs(c.face.w-c.button.w)<.5&&Math.abs(c.face.h-c.button.h)<.5,context+' face/button bounds');assert.ok(c.face.bottom<=g.tableau.bottom+.5,context+' tableau bounds');}
   for(const c of [...g.cards.map(c=>c.face),...g.controls,g.badge])assert.ok(c.w>0&&c.h>0&&c.x>=-.5&&c.y>=-.5&&c.right<=width+.5&&c.bottom<=height+.5,context+' fit '+JSON.stringify(c));
   assert.ok(Math.min(...g.rankClearance)>=-.5,context+' covered ranks '+Math.min(...g.rankClearance));
   assert.ok(Math.abs(g.score.cx-g.cabinet.cx)<.5,context+' centered score');assert.ok(Math.abs(g.current.cx-g.cabinet.cx)<.5,context+' centered current');
   assert.ok(g.clock.y>=g.tableau.bottom-1&&g.clock.bottom<=g.current.y+.5,context+' timer order');assert.ok(g.stock.x>g.current.right,context+' right stock');
   assert.ok(g.badge.cx>=g.stock.x&&g.badge.cx<g.stock.x+g.badge.w/2&&g.badge.y<g.stock.y,context+' upper-left badge');
   const first=g.cards[0].face,next=g.cards[6].face;assert.ok(Math.abs((next.x-first.x)/first.w-.506)<.02,context+' horizontal stagger');assert.ok(next.y<first.bottom,context+' overlap');
  }
  await page.screenshot({path:`${dir}/${width}x${height}-${players}-round${stage}.png`});layouts.push({width,height,players,stage,...g});await page.close();
 }
 writeFileSync(`${dir}/geometry.json`,JSON.stringify(layouts,null,2));console.log(label,layouts.length,'layouts captured',label==='before'?'':'and checked');
}finally{await browser.close();}
