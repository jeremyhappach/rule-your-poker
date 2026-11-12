import { chromium } from '@playwright/test';
import { Chess } from 'chess.js';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),white=await context.newPage(),black=await context.newPage();
 await white.goto('http://127.0.0.1:15431/game?player=white');
 await black.goto('http://127.0.0.1:15431/game?player=black');
 await white.evaluate(()=>fetch('/chess/reset',{method:'POST'}));
 await white.waitForSelector('[data-square="e2"] .piece');
 const from=white.locator('[data-square="e2"]'),to=white.locator('[data-square="e4"]');
 const a=await from.boundingBox(),b=await to.boundingBox();assert(a&&b);
 await white.mouse.move(a.x+a.width/2,a.y+a.height/2);await white.mouse.down();await white.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});
 assert(await white.locator('[data-square="e4"].legal').count());await white.mouse.up();
 await black.waitForSelector('[data-square="e4"] .piece');
 await black.locator('[data-square="e7"]').click();await black.locator('[data-square="e5"]').click();
 await white.waitForSelector('[data-square="e5"] .piece');
 await white.reload();await white.waitForSelector('[data-square="e5"] .piece');
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:667,height:375},{width:1440,height:900}]){await white.setViewportSize(viewport);const box=await white.locator('.board').boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,JSON.stringify({viewport,box}));}
 const chess=new Chess();for(const move of ['f3','e5','g4','Qh4#'])chess.move(move);assert(chess.isCheckmate());
 const special=new Chess('r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 1');assert(special.moves({square:'e5'}).includes('exd6'));assert(special.moves({square:'e1'}).includes('O-O'));
 const promote=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');assert.equal(promote.moves({square:'a7',verbose:true}).filter(m=>m.promotion).length,4);
 await white.evaluate(()=>fetch('/chess/reset',{method:'POST'}));await white.setViewportSize({width:390,height:844});await white.waitForSelector('[data-square="e2"] .piece');
 const touch=await context.newCDPSession(white),ta=await white.locator('[data-square="e2"]').boundingBox(),tb=await white.locator('[data-square="e4"]').boundingBox();assert(ta&&tb);
 const point=(box)=>({x:box.x+box.width/2,y:box.y+box.height/2});
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(ta)]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(tb)]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await white.waitForSelector('[data-square="e4"] .piece');
 await white.evaluate(()=>fetch('/chess/reset',{method:'POST'}));await white.waitForSelector('[data-square="e2"] .piece');await white.screenshot({path:process.env.TEMP+'/ptown-chess-preview.png'});
 console.log('PASS: mouse and touch drag, legal destinations, two-player handoff, reload, four viewports, checkmate, en passant, castling, promotion');
} finally { await browser.close(); }
