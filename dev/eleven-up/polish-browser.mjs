import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {existsSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const out=resolve('.codex/evidence/eleven-up-correction');await mkdir(out,{recursive:true});
const originalCss=execFileSync('git',['show','28d90e7c2:src/components/elevenUp/elevenUp.css'],{encoding:'utf8'});
const originalModel=ts.transpileModule(execFileSync('git',['show','28d90e7c2:src/lib/elevenUp/model.ts'],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ballPosition}=await import('data:text/javascript;base64,'+Buffer.from(originalModel).toString('base64'));
const positions=Array.from({length:22},(_,i)=>ballPosition(i));
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':resolve('src')}},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5187,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,executablePath}),evidence=[];
const run21=(await server.ssrLoadModule('/src/lib/run21/model.ts')).DEFAULT_CONFIG;
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]])for(const players of [1,2,7]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.goto(`http://127.0.0.1:5187/dev/eleven-up/polish.html?players=${players}`);await page.locator('.eleven-ball').first().waitFor();
  const geometry=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
   const balls=[...document.querySelectorAll('.eleven-ball')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};});
   return {board:box('.eleven-plane'),field:box('.eleven-playfield'),round:box('.eleven-round'),scores:box('.eleven-scores'),pills:[...document.querySelectorAll('.eleven-score-pill')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}),draw:box('.eleven-draw'),pass:box('.eleven-pass'),take:box('.eleven-take-score'),sum:box('.eleven-selection'),timer:box('.eleven-clock'),balls,scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
  });
  await page.screenshot({path:resolve(out,`${width}-${players}.png`)});
  assert.deepEqual(errors,[]);assert.equal(geometry.scroll,false,`scroll ${width}/${players}`);
  const {board,field,round,scores,pills,draw,pass,take,sum,timer,balls}=geometry;
  assert.ok(Math.abs(draw.x+draw.w/2-board.x-board.w/2)<1,'current ball centered');
  assert.ok(pass.x>=draw.right,'Pass right of ball');assert.ok(take.x>board.x+board.w/2,'Take Score right');
  const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  assert.ok(Math.abs(scores.x+scores.w/2-board.x-board.w/2)<1,'scores centered in entire viewport');
  for(const b of [round,take])assert.ok(Math.abs(b.y+b.h/2-scores.y-scores.h/2)<1,'common scoreboard centerline');
  assert.equal(overlap(round,scores)||overlap(take,scores),false,'scoreboard slots separated');
  if(players<=2){assert.ok(Math.abs((pills[0].x+pills.at(-1).right)/2-board.x-board.w/2)<1,'pill cluster centered');for(const pill of pills)assert.ok(pill.x>=scores.x-.5&&pill.right<=scores.right+.5,'score pill fits');}
  if(players===2){assert.ok(pills[0].bottom<pills[1].y,'two score pills stacked');assert.ok(pills[1].bottom<=Math.min(...balls.map(b=>b.y-b.r)),'score stack above balls');}
  if(players>2)assert.equal(await page.locator('.eleven-score-pill').first().getAttribute('data-active'),'true','active player first');
  for(const [a,b] of [[sum,timer],[timer,draw],[sum,draw],[pass,draw]])assert.equal(overlap(a,b),false,`control overlap ${width}/${players}`);
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)assert.ok(Math.hypot(balls[i].x-balls[j].x,balls[i].y-balls[j].y)>=balls[i].r+balls[j].r-.5,`ball overlap ${width}/${players}: ${i}/${j}`);
  assert.ok(sum.y>=Math.max(...balls.map(b=>b.y+b.r))-.5,`sum below balls ${width}/${players}`);
  for(const b of [draw,pass,take,sum,timer])assert.ok(b.x>=board.x-.5&&b.right<=board.right+.5&&b.y>=board.y-.5&&b.bottom<=board.bottom+.5,`clipped ${width}/${players}`);
  assert.ok(draw.w>=44&&draw.h>=44&&pass.h>=44&&take.h>=44,'primary targets');
  // Render the Git version in an isolated frame with the same available felt.
  // Compare every center and diameter, not just absence of collisions.
  const reference=await page.evaluate(async({css,positions,w,h})=>{
   const frame=document.createElement('iframe');Object.assign(frame.style,{position:'fixed',left:'-10000px',width:w+'px',height:h+'px',border:'0'});
   const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc='<style>html,body{margin:0;width:100%;height:100%;font-size:16px}'+css+'</style><div class="eleven-plane"><div class="eleven-rack">'+positions.map(([x,y])=>'<button class="eleven-ball" style="left:'+x+'%;top:'+y+'%"></button>').join('')+'</div></div>';document.body.append(frame);await loaded;
   const bounds=[...frame.contentDocument.querySelectorAll('.eleven-ball')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2};});frame.remove();return bounds;
  },{css:originalCss,positions,w:field.w,h:field.h});
  balls.forEach((b,i)=>{assert.ok(Math.abs(b.x-field.x-reference[i].x)<.5,'original horizontal position');assert.ok(Math.abs(b.y-field.y-reference[i].y)<.5,'original vertical position');assert.ok(Math.abs(b.r-reference[i].r)<.5,'original diameter');});
  evidence.push({width,height,players,originalGeometryMatched:true,boardHeight:board.h,ballDiameter:balls[0].r*2});await page.close();
 }
 for(const players of [1,2])for(const [phase,fraction,lit] of [['ready',1,null],['playing',.4,10],['playing',.1,3],['playing',.05,2]]){
  const page=await browser.newPage({viewport:{width:320,height:568}});
  await page.route('https://**/*',r=>r.abort());
  await page.goto(`http://127.0.0.1:5187/dev/eleven-up/polish.html?players=${players}&phase=${phase}&fraction=${fraction}&large`);
  const timer=page.getByRole(phase==='ready'?'timer':'progressbar');await timer.waitFor();
  if(phase==='ready')assert.equal(await timer.textContent(),'Select or pass · 0:30');
  else {assert.equal(await timer.locator('i[data-lit=true]').count(),lit);assert.equal(await timer.textContent(),'');if(fraction<=.1){const colors=await timer.locator('i[data-lit=true]').evaluateAll(dots=>dots.map(dot=>getComputedStyle(dot).backgroundColor));assert.ok(colors.every(color=>color===(fraction===.1?'rgb(245, 212, 49)':'rgb(238, 73, 63)')),'urgency colors');}}
  const fit=await page.evaluate(()=>{
   const box=s=>document.querySelector(s).getBoundingClientRect(),round=box('.eleven-round'),scores=box('.eleven-scores'),take=box('.eleven-take-score'),timer=box('.eleven-clock'),draw=box('.eleven-draw'),sum=box('.eleven-selection');
   return {scoresFit:[...document.querySelectorAll('.eleven-score-pill strong,.eleven-score-pill small')].every(e=>{const r=e.getBoundingClientRect();return r.x>=scores.x&&r.right<=scores.right;}),slotsFit:round.right<=scores.x&&scores.right<=take.x,timerFit:timer.x>=0&&timer.right<=innerWidth&&timer.bottom<=draw.y&&timer.y>=sum.bottom,noScroll:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight};
  });
  assert.ok(Object.values(fit).every(Boolean),JSON.stringify({players,phase,fit}));
  await page.screenshot({path:resolve(out,`320-${players}-${phase}-${fraction}.png`)});evidence.push({players,phase,fraction,lit,largeScoreAndBonusFit:true});await page.close();
 }
 for(const game of ['eleven-up','tri-towers','run21','yahtzee']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://**/*',async route=>{if(route.request().url().includes('arcade_rules_help'))await route.fulfill({json:game==='tri-towers'?JSON.parse(await readFile('src/lib/triTowers/rules-v2.json','utf8')):run21});else await route.abort();});
  await page.goto(`http://127.0.0.1:5187/dev/eleven-up/polish.html?info=${game}`);await page.getByRole('button',{name:/rules and info/}).click();
  await page.getByRole('dialog').waitFor();if(['tri-towers','run21'].includes(game))await page.getByText('Loading rules…').waitFor({state:'hidden'});
  const palette=await page.getByRole('dialog').evaluate(el=>({background:getComputedStyle(el).backgroundColor,colors:[...el.querySelectorAll('h2,h3,p,button')].map(e=>getComputedStyle(e).color)}));
  const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const bg=luminance(palette.background),ratios=palette.colors.map(c=>(bg+.05)/(luminance(c)+.05));
  assert.equal(palette.background,'rgb(255, 253, 246)');assert.ok(ratios.every(r=>r>=4.5),'text and close contrast');palette.minimumContrast=Math.min(...ratios);
  await page.screenshot({path:resolve(out,`info-${game}.png`),animations:'disabled'});evidence.push({game,palette});await page.close();
 }
 await writeFile(resolve(out,'results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();await server.close();}
