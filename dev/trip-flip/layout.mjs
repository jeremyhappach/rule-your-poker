import {chromium} from '@playwright/test';import {existsSync,mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),evidence=[],errors=[];
const scenes=['ready','partial','cells','full','special','round-end','game-over','multi-active','multi-observer','multi-pills','multi-round-end','rules'];
mkdirSync('qualification.local/trip-flip/layout',{recursive:true});
try{for(const [width,height,scale,safe] of [[320,568,1],[390,844,1],[430,932,1],[844,390,1],[390,664,1],[390,844,1.2],[390,844,1,true]])for(const scene of scenes){
 if(process.argv.includes('--rules')&&scene!=='rules')continue;
 const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:5191/dev/trip-flip/layout.html?scene=${scene}`);await page.locator('.trip-board').waitFor();
 await page.evaluate(({scale,safe})=>{document.documentElement.style.fontSize=16*scale+'px';if(safe){const frame=document.querySelector('.arcade-run');frame.style.paddingTop='47px';frame.style.paddingBottom='34px';}}, {scale,safe});await page.waitForTimeout(scene==='rules'?650:250);
 const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};const board=rect(document.querySelector('.trip-board')),band=rect(document.querySelector('.trip-scoreband')),scores=rect(document.querySelector('.trip-scores'));return {board,band,scores,scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],viewport:[innerWidth,innerHeight],cards:[...document.querySelectorAll('.trip-columns .trip-card')].map(rect),bank:rect(document.querySelector('.trip-bank')),round:rect(document.querySelector('.trip-round'))};});
 assert.ok(Math.abs(geometry.scores.x+geometry.scores.w/2-width/2)<2,`${scene}: score centered`);assert.ok(geometry.board.bottom<=height+1,`${scene}: board fits`);
 assert.ok(geometry.scroll[0]<=width&&geometry.scroll[1]<=height,`${scene}: no page scroll`);
 assert.ok(geometry.round.right<=geometry.scores.x+1&&geometry.scores.right<=geometry.bank.x+1,`${scene}: scoreboard no overlap`);
 for(const c of geometry.cards)assert.ok(Math.abs(c.h/c.w-1.5)<.05,`${scene}: card aspect`);
 if(['round-end','game-over','multi-round-end'].includes(scene)){
  const center=await page.evaluate(()=>{const p=document.querySelector('.trip-score[data-active=true]').getBoundingClientRect(),v=document.querySelector('.trip-plane').getBoundingClientRect();return{x:p.x+p.width/2-v.x-v.width/2,y:p.y+p.height/2-v.y-v.height/2};});
  assert.ok(Math.abs(center.x)<1&&Math.abs(center.y)<1,scene+': active pill at true viewport center');
 }
 if(scene==='full'){
  const hit=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.trip-column:first-child>button[data-card]')],a=cards[0].getBoundingClientRect(),b=cards[1].getBoundingClientRect();return{x:a.x+a.width*.3,y:a.y+(b.y-a.y)/2,pitch:(b.y-a.y)/a.height,disabled:cards[0].disabled};});
  assert.ok(hit.pitch>.40&&hit.pitch<.46,'modest overlap reveals rank and suit');assert.equal(hit.disabled,true);
  await page.mouse.click(hit.x,hit.y);assert.equal(await page.locator('[data-selected=true]').count(),0,'buried face cannot select');
 }
 if(scale===1&&[320,430].includes(width)||scene==='full'&&width===844)await page.screenshot({path:`qualification.local/trip-flip/layout/${width}-${height}-${scene}.png`});
 evidence.push({width,height,scale,safe,scene,...geometry});await page.close();
}assert.deepEqual(errors,[]);writeFileSync('qualification.local/trip-flip/'+(process.argv.includes('--rules')?'rules-layout':'layout')+'.json',JSON.stringify(evidence));console.log(`${evidence.length} scene/viewport checks PASS: center, overlap, geometry, page overflow, portrait/landscape, shorter viewport, 120% text, simulated 47/34px safe areas`);}finally{await browser.close();}
