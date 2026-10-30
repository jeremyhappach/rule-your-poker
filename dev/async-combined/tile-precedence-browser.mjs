import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15409',out='qualification.local/async-combined',checks=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 for(const [device,width,height,touch] of [['phone',390,844,true],['desktop',1054,720,false]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  const cell=n=>p.locator(`[data-square="${n}"]`),input=async locator=>touch?locator.tap():locator.click(),tap=async n=>{await input(cell(n));},zoom=n=>expect(p.locator('.words-scroll')).toHaveAttribute('data-zoom',String(n));
  for(const scale of [0,1,2]){
   await p.goto(base+`/delayed/match/play/words?viewer=a&zoom=${scale}&fresh=1`);await zoom(scale);
   await input(p.getByRole('button',{name:'C, 3 points'}));await tap(112);await expect(p.locator('.is-staged')).toHaveCount(1);await p.waitForTimeout(350);await zoom(scale);
   await tap(112);await expect(p.getByRole('button',{name:'C, 3 points'})).toHaveAttribute('aria-pressed','true');await tap(113);await zoom(scale);await expect(cell(113)).toHaveClass(/is-staged/);
   await tap(113);await p.waitForTimeout(80);await tap(113);await p.waitForTimeout(350);await zoom(scale);await expect(cell(113)).toHaveClass(/is-staged/);
   const a=p.getByRole('button',{name:'A, 1 points'});await input(a);await input(a);await zoom(scale);await input(a);await tap(114);await input(p.getByRole('button',{name:'T, 1 points'}));await expect(p.locator('.is-staged')).toHaveCount(3);await zoom(scale);
   await input(p.getByRole('button',{name:'Undo',exact:true}));await input(p.getByRole('button',{name:'Recall',exact:true}));await zoom(scale);await expect(p.locator('.is-staged')).toHaveCount(0);
   // Only an unselected, non-tile navigation gesture may change scale.
   if(scale<2){await tap(112);await p.waitForTimeout(350);await zoom(scale+1);}
   else {const before=await p.locator('.words-scroll').evaluate(e=>e.scrollLeft);await input(p.getByRole('button',{name:'Pan →'}));await p.waitForTimeout(450);assert(await p.locator('.words-scroll').evaluate(e=>e.scrollLeft)>before);}
   const current=scale<2?scale+1:2;await tap(112);await p.waitForTimeout(80);await tap(112);await p.waitForTimeout(350);await zoom(current-1);
   checks.push(`${device} scale ${scale}: placement, staged selection/move, rapid taps, deselection, autoplace, undo/recall preserve scale; navigation/pan works`);
  }
  // Moving a pointer over the board is not a navigation tap, with a tile selected.
  await p.goto(base+'/delayed/match/play/words?viewer=a&zoom=2&fresh=1');await zoom(2);await input(p.getByRole('button',{name:'C, 3 points'}));
  const box=await cell(112).boundingBox();if(touch){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+20,y:box.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+90,y:box.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await p.mouse.move(box.x+20,box.y+20);await p.mouse.down();await p.mouse.move(box.x+90,box.y+20,{steps:5});await p.mouse.up();}
  await p.waitForTimeout(400);await zoom(2);await expect(p.locator('.is-staged')).toHaveCount(0);checks.push(`${device}: drag with selected tile does not zoom`);
  await input(p.getByRole('button',{name:'C, 3 points'}));await tap(112);await p.waitForTimeout(350);await zoom(2);
  await input(p.getByRole('button',{name:'C, 3 points'}));await tap(112);await input(p.getByRole('button',{name:'A, 1 points'}));await tap(113);await input(p.getByRole('button',{name:'T, 1 points'}));await input(p.getByRole('button',{name:'Submit Word'}));await zoom(0);checks.push(`${device}: accepted word resets to full`);
  await p.screenshot({path:out+`/tile-precedence-${device}.png`});await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(out+'/tile-precedence-browser.json',JSON.stringify({passed:true,checks,errors,scope:'actual async Words view with native mouse/touch and isolated synthetic HTTP/SSE; shared-view sync coverage in unit tests'},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
