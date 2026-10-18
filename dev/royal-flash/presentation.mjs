import {chromium} from '@playwright/test';
import {existsSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),evidence=[];
try{for(const [width,height] of [[390,844],[844,390],[320,568]])for(const players of [1,2]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const face of [10,11,12,23,24,25,36,37,38,49,50,51]){
  await page.goto(`http://127.0.0.1:5186/dev/royal-flash/layout.html?players=${players}&face=${face}`);await page.locator('.royal-draw [data-card-suit]').waitFor();await page.waitForTimeout(40);
  const suits=await page.locator('.royal-card').evaluateAll(cards=>cards.map(card=>{const svg=card.querySelector('[data-cartoon-card-face]'),suit=card.querySelector('[data-card-suit]'),rank=card.querySelector('[data-card-rank]'),b=svg.getBoundingClientRect(),s=suit.getBoundingClientRect(),r=rank.getBoundingClientRect();return {name:card.getAttribute('aria-label'),suit:suit.textContent,rank:rank.textContent,visible:s.width>6&&s.height>9&&s.left>=b.left-.5&&s.right<=b.right+.5&&s.bottom<=b.bottom&&r.right<s.left+2};}));
  assert.equal(suits.length,26);assert.ok(suits.every(s=>s.visible&&s.name===s.rank+s.suit),JSON.stringify({width,players,face,suits}));
  assert.equal(await page.locator('.royal-lines').count(),0);
  if(face===51)await page.screenshot({path:`qualification.local/royal-flash/faces-${width}-${players}.png`});
 }
 for(let step=0;step<12;step++){
  await page.goto(`http://127.0.0.1:5186/dev/royal-flash/layout.html?players=${players}&face=51&step=${step}`);await page.locator('.royal-breakdown').waitFor();
  assert.equal(await page.locator('.royal-grid button').count(),25);assert.equal(await page.locator('.royal-grid [data-scored]').count(),step<10?5:0);
  assert.equal(await page.locator('.royal-breakdown').getAttribute('data-scoring-step'),step<10?`line-${step}`:step===10?'bonus':'total');
  const fit=await page.locator('.royal-breakdown').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1;});assert.ok(fit,`breakdown fits ${width}/${players}/${step}`);
  assert.equal(await page.locator('.royal-overlay').count(),0,'board unobscured');
  if(step===7)await page.screenshot({path:`qualification.local/royal-flash/scoring-${width}-${players}.png`});
 }
 assert.deepEqual(errors,[]);evidence.push({width,height,players,faces:12,locations:26,scoringSteps:12});await page.close();
}writeFileSync('qualification.local/royal-flash/presentation.json',JSON.stringify(evidence));console.log('PASS all 12 courts, grid + upcard, both modes, portrait/landscape; 72 scoring layouts',evidence);}finally{await browser.close();}
