import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
const source=`
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {Run21PlayerPane} from './src/components/run21/Run21PlayerPane';
import {DEFAULT_CONFIG} from './src/lib/run21/model';
import {emptyBoard,moveBoardCard,presentBoardCard} from './src/lib/run21/board';
import './src/components/run21/run21.css';
import './src/components/run21/run21Space.css';
const config={...DEFAULT_CONFIG,roundIntroMs:0},board=emptyBoard('self',config);
board.columns=[19,19,19,20,20].map(n=>[{rank:'10',suit:'clubs'},{rank:String(n-10),suit:'hearts'}]);
board.startedAt=0;board.deadline=100000;presentBoardCard(board,Array.from({length:10},()=>({rank:'A',suit:'diamonds'})));
const view={config,roundId:'r',roundNumber:1,viewerId:'self',boards:{self:board},players:[{id:'self',name:'You'}],active_player_id:'self',revealed:false,cumulative:{self:0}};
const root=createRoot(document.querySelector('#root'));let pending=false;
const render=()=>flushSync(()=>root.render(<Run21PlayerPane view={view} now={1000} pending={pending} onIntent={()=>{}}/>));
window.probe={pending(v){pending=v;render()},place(column){moveBoardCard(board,config,{type:'place',column},1000);presentBoardCard(board,Array.from({length:10},()=>({rank:'A',suit:'diamonds'})));render()},pause(){view.pausedAt=1000;render()}};render();
`;
const result=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,format:'iife',outfile:'fixture.js',write:false,jsx:'automatic',logLevel:'silent'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:'<html><head><style>'+css+'</style></head><body class="run21-space-theme"><div id="root"></div><script src="/fixture.js"></script></body></html>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('.run21-collect-button');
 await page.evaluate(()=>window.originalButton=document.querySelector('.run21-collect-button'));
 const measure=()=>page.evaluate(()=>{const b=document.querySelector('.run21-collect-button'),s=getComputedStyle(b);return {same:b===window.originalButton,background:s.backgroundColor,opacity:s.opacity,disabled:b.disabled,eligible:b.hasAttribute('data-eligible'),animation:s.animationName}});
 const before=await measure(),samples=[];assert.match(await page.locator('.run21-collect-button').innerText(),/Take Win/);
 for(let i=0;i<3;i++){await page.evaluate(()=>window.probe.pending(true));const busy=await measure();assert.equal(busy.disabled,true);assert.equal(busy.background,before.background);assert.equal(busy.opacity,before.opacity);assert.equal(busy.same,true);await page.evaluate(i=>window.probe.place(i),i);await page.evaluate(()=>window.probe.pending(false));const after=await measure();assert.equal(after.disabled,false);assert.equal(after.background,before.background);assert.equal(after.same,true);samples.push({busy,after});}
 await page.evaluate(()=>window.probe.pause());const paused=await measure();assert.equal(paused.disabled,true);assert.equal(paused.eligible,false);assert.notEqual(paused.background,before.background);
 console.log(JSON.stringify({passed:true,placements:3,before,samples,legitimatePause:paused}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
