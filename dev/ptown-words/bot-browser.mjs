import {chromium} from '@playwright/test';import {readFileSync as read,writeFileSync as write} from 'node:fs';import {connect} from './database.mjs';import assert from 'node:assert/strict';
const base='http://127.0.0.1:15307',post=async(op,body={},token='')=>(await fetch(base+'/__ptown_words_route/'+op,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})).json();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],checks=[];
const db=await connect(JSON.parse(read('qualification.local/ptown-words/release/route-context.json','utf8')).database);
try{
const f=await post('new',{bot:true});const page=await browser.newPage({viewport:{width:390,height:760},isMobile:true,hasTouch:true});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/game/'+f.game+'?token='+f.tokens[0]);await page.getByRole('tab',{name:'Other',exact:true}).click();await page.getByText('Ptown Words',{exact:true}).click();await page.getByRole('button',{name:'Start Ptown Words',exact:true}).click();await page.locator('.words-grid').waitFor();
await page.getByRole('button',{name:'Pass',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.words-turn-actions button')?.disabled);
await page.getByRole('button',{name:'Pass',exact:true}).click();await page.getByRole('button',{name:'Pass turn',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('.words-cell.has-tile').length>=2&&!document.querySelector('.words-turn-actions button')?.disabled,{},{timeout:20000});
assert.equal(await page.locator('.words-rack button').count(),7);await page.reload();await page.locator('.words-cell.has-tile').first().waitFor();checks.push('one browser canonical setup, bot consent, autonomous legal word, turn handoff and reconnect');
await page.getByRole('button',{name:'Zoom In',exact:true}).click();
for(const [width,height] of [[320,568],[390,760],[844,390],[1024,760]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(150);
 const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return [...document.querySelectorAll('.words-cell.has-tile')].map(tile=>({tile:rect(tile),letter:rect(tile.querySelector('b')),score:rect(tile.querySelector('small'))}));});
 assert.ok(geometry.length>1);for(const g of geometry){assert.ok(g.score.x>=g.letter.right||g.score.y>=g.letter.bottom,JSON.stringify(g));assert.ok(g.score.x>g.tile.x+g.tile.width*.65);assert.ok(g.score.y>g.tile.y+g.tile.height*.65);assert.ok(g.tile.right-g.score.right<4);assert.ok(g.tile.bottom-g.score.bottom<4);}
 await page.screenshot({path:`qualification.local/ptown-words/browser/bot-${width}.png`});checks.push(`${width}×${height} tile points in bottom-right corner without letter overlap`);
}
const m=(await db.query('SELECT * FROM private.ptown_words_matches WHERE game_id=$1',[f.game])).rows[0];
assert.ok(m.state.moves.some(m=>m.action==='place'&&m.playerId===f.players[1]));assert.deepEqual(errors,[]);
write('dev/ptown-words/evidence/bot-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('One-device bot gameplay and four tile-score layouts PASS');
}finally{await browser.close();await db.end();}
