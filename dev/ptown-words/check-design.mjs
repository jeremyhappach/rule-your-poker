import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=new URL('../../qualification.local/ptown-words/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1080,height:1050},colorScheme:'dark'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('http**/*',route=>route.abort());
const fixture=readFileSync(new URL('./design.html',import.meta.url),'utf8');
await page.setContent('<!doctype html><html style="color-scheme:dark"><body style="margin:0;background:#141d29"><script>window.Tweak=class{constructor(o){window.changeDesign=o.onChange;}addSelect(object){window.design=object;}};</script>'+fixture+'</body></html>');
try{
 for(const [device,size,players] of [['phone','390 × 760','2'],['landscape','390 × 760','2'],['desktop','390 × 760','2'],['phone','320 × 568','2'],['phone','390 × 760','4']]){
  await page.locator('button[data-device="'+device+'"]').click();
  await page.evaluate(({size,players})=>{window.design.phoneSize=size;window.design.players=players;window.changeDesign();},{size,players});
  for(const scene of ['overview','zoom','staged','opponent']){
   await page.locator('[data-scene="'+scene+'"]').click();await page.waitForTimeout(80);
   const geometry=await page.evaluate(()=>{
    const r=e=>{const b=e.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
    return {game:r(document.querySelector('.pt-game')),board:r(document.querySelector('.pt-viewport')),cell:r(document.querySelector('.pt-cell')),rack:[...document.querySelectorAll('.pt-rack button')].map(r),actions:r(document.querySelector('.pt-turn-actions')),submit:r(document.querySelector('.pt-submit')),cells:document.querySelectorAll('.pt-cell').length};
   });
   assert.equal(geometry.cells,225);
   assert.ok(geometry.board.height>=90,JSON.stringify({device,size,scene,geometry}));
   assert.ok(geometry.actions.bottom<=geometry.game.bottom,JSON.stringify({device,size,scene,geometry}));
   for(const tile of geometry.rack){assert.ok(tile.width>=44&&tile.height>=44);assert.ok(tile.right<=geometry.game.right&&tile.bottom<=geometry.game.bottom);}
   if(['zoom','staged'].includes(scene))assert.ok(geometry.cell.width>=48);
   assert.doesNotMatch(await page.locator('.pt-game').innerText(),/scrabble|NWL2023|word table/i);
   checks.push({device,size,players,scene,...geometry});
   await page.locator('.pt-game').screenshot({path:new URL(`${device}-${size.split(' ')[0]}-${players}-${scene}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')});
  }
 }
 await page.evaluate(()=>{window.design.players='2';window.design.phoneSize='390 × 760';window.changeDesign();});
 await page.locator('[data-scene="zoom"]').click();await page.locator('[data-rack="0"]').click();await page.locator('[data-row="8"][data-col="7"]').click();
 assert.equal(await page.locator('.pt-cell.staged').count(),1);await page.locator('.pt-undo').click();assert.equal(await page.locator('.pt-cell.staged').count(),0);
 await page.locator('[data-rack="6"]').click();await page.locator('[data-row="8"][data-col="7"]').click();await page.locator('[data-letter="R"]').click();assert.equal(await page.locator('.pt-cell.blank small').innerText(),'0');
 await page.locator('[data-scene="staged"]').click();await page.locator('.pt-submit').click();assert.equal(await page.locator('.pt-turn').innerText(),'Mara’s turn');
 await page.locator('[data-panel="Session"]').click();assert.match(await page.locator('.pt-dialog').innerText(),/ENABLE2K/);
 assert.deepEqual(errors,[]);writeFileSync(new URL('design-checks.json',out),JSON.stringify({checks,errors},null,2));console.log(`${checks.length} layout states and placement/undo/blank/submit checks PASS`);
}finally{await browser.close();}
