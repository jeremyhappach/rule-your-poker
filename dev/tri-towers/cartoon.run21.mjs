import {createServer} from 'vite';import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true,watch:{ignored:['**/qualification.local/**']}}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const [width,height] of [[1440,900],[390,844],[844,390]]){
 const page=await browser.newPage({viewport:{width,height}});await page.route(/^https?:\/\/(?!127\.0\.0\.1:5194)/,r=>r.fulfill({status:200,body:'[]'}));
 await page.goto('http://127.0.0.1:5194/dev/run21/fullscreen.html?scene=maximum-depth',{waitUntil:'networkidle',timeout:120000});
 await page.locator('.run21-stacked-card').last().waitFor();
 const boxes=await page.locator('.run21-column-stack').first().evaluate(el=>({stack:el.getBoundingClientRect().toJSON(),cards:[...el.querySelectorAll('.run21-stacked-card')].map(e=>({rect:e.getBoundingClientRect().toJSON(),transform:getComputedStyle(e).transform,face:e.querySelector('[data-playing-card-face]').getBoundingClientRect().toJSON()}))}));
 await page.screenshot({path:`qualification.local/tri-towers/cartoon-ui/run21-depth-${width}.png`,animations:'disabled'});
 for(const card of boxes.cards){assert(card.rect.x>=boxes.stack.x-1&&card.rect.right<=boxes.stack.right+1);assert(card.face.right<=card.rect.right+1);}
 console.log(`PASS Cartoon stack bounds at ${width}x${height}`);await page.close();
}}finally{await browser.close();await server.close();}
