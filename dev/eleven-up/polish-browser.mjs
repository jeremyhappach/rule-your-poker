import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {existsSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('.codex/evidence/eleven-up-polish');await mkdir(out,{recursive:true});
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
   return {board:box('.eleven-plane'),draw:box('.eleven-draw'),pass:box('.eleven-pass'),take:box('.eleven-take-score'),sum:box('.eleven-selection'),timer:box('.eleven-clock'),balls,scroll:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth};
  });
  await page.screenshot({path:resolve(out,`${width}-${players}.png`)});
  assert.deepEqual(errors,[]);assert.equal(geometry.scroll,false,`scroll ${width}/${players}`);
  const {board,draw,pass,take,sum,timer,balls}=geometry;
  assert.ok(Math.abs(draw.x+draw.w/2-board.x-board.w/2)<1,'current ball centered');
  assert.ok(pass.x>=draw.right,'Pass right of ball');assert.ok(take.x>board.x+board.w/2,'Take Score right');
  const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  for(const [a,b] of [[sum,timer],[timer,draw],[sum,draw],[pass,draw]])assert.equal(overlap(a,b),false,`control overlap ${width}/${players}`);
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)assert.ok(Math.hypot(balls[i].x-balls[j].x,balls[i].y-balls[j].y)>=balls[i].r+balls[j].r-.5,`ball overlap ${width}/${players}: ${i}/${j}`);
  assert.ok(sum.y>=Math.max(...balls.map(b=>b.y+b.r))-.5,`sum below balls ${width}/${players}`);
  for(const b of [draw,pass,take,sum,timer])assert.ok(b.x>=board.x-.5&&b.right<=board.right+.5&&b.y>=board.y-.5&&b.bottom<=board.bottom+.5,`clipped ${width}/${players}`);
  assert.ok(draw.w>=44&&draw.h>=44&&pass.h>=44&&take.h>=44,'primary targets');
  evidence.push({width,height,players,boardHeight:board.h,ballDiameter:balls[0].r*2});await page.close();
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
