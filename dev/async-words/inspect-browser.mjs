// Actual route, shell, hook, board and CSS with a loopback-only RPC fixture.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/words-inspection';mkdirSync(dir,{recursive:true});
let actor='other',revision=4,requests=[];
const at=Date.now(),deadline=at+129600000,players=[{id:'me',userId:'me',name:'Alex',seat:1,isBot:false},{id:'other',userId:'other',name:'Blair',seat:2,isBot:false}];
const snapshot=()=>{const board=Array(225).fill(null);for(const [i,letter] of [...'HELLO'].entries())board[110+i]={id:20+i,face:letter,letter,value:1};return {identity:{sessionId:'match',dealerGameId:'words',roundId:'words'},revision,serverAt:Date.now(),rules:{version:'ptown-words/3',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:129600000},players,viewerId:'me',activePlayerId:actor,board,rack:[...'CATRISE'].map((face,i)=>({id:i+1,face,value:1})),scores:{me:12,other:24},turn:revision,deadline,canAct:actor==='me',paused:false,phase:'playing',bagCount:70,rackCounts:{me:7,other:7},pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[],event:{label:'Word played',points:12}};};
const home=()=>({id:'match',status:'active',revision,realMoney:false,organizer:'me',opponent:'other',players,createdAt:new Date(at).toISOString(),acceptedAt:new Date(at).toISOString(),held:false,completed:0,net:0,exposure:5,unsettled:5,receipt:null,serverAt:Date.now(),lineup:[{id:'words',ordinal:1,game:'ptown-words',stake:5,actor,terminal:false,expiresAt:new Date(deadline).toISOString(),lastCallAt:new Date(at+86400000).toISOString(),scores:{me:12,other:24},bagCount:70,result:null}]});
const fixture=resolve('dev/async-words/inspect-client.ts');
const server=await createServer({configFile:false,envFile:false,cacheDir:'node_modules/.vite-inspect',plugins:[react(),{name:'inspect-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__inspect/rpc'){let raw='';for await(const part of req)raw+=part;const q=JSON.parse(raw);requests.push(q);
  if(q.name==='delayed_words_action'){if(actor!=='me')throw Error('Opponent action');actor='other';revision++;}
  const data=q.name==='delayed_home'?home():q.name.startsWith('delayed_words_')?snapshot():null;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
 }
 if(req.url.startsWith('/delayed')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-words/inspect-fixture.tsx"></script></body></html>'));return;}next();
 });}}],resolve:{alias:[...['@/integrations/supabase/client','@/hooks/useAuthGuard','@/lib/delayed/playingPresence','@/components/delayed/NotificationBell'].map(find=>({find,replacement:fixture})),{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15427,strictPort:true}});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),results=[];
try{
 for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024],[1280,800]]){
  actor='other';revision=4;requests=[];const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:15427/delayed/match');await page.getByRole('link',{name:'View board'}).click();
  await page.getByText("Opponent's Turn — View Only").waitFor();assert.equal(await page.getByRole('gridcell').count(),225);
  assert.equal(await page.locator('.words-rack button:disabled').count(),7);assert.equal(await page.locator('.is-staged').count(),0);
  const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};};return {banner:rect('.words-view-only'),board:rect('.words-scroll'),rack:rect('.words-rack'),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(!geometry.overflow);assert(geometry.banner.bottom<=geometry.board.y+1);assert(geometry.banner.h<40);assert(geometry.board.h>60);assert(geometry.rack.right<=width+1);assert(geometry.rack.bottom<=height+1);
  await page.screenshot({path:`${dir}/${width}x${height}.png`});
  await page.locator('[data-square="112"]').evaluate(el=>el.click());await page.waitForFunction(()=>document.querySelector('.words-scroll')?.getAttribute('data-zoom')==='1');
  await page.locator('[data-square="112"]').evaluate(el=>el.click());await page.waitForFunction(()=>document.querySelector('.words-scroll')?.getAttribute('data-zoom')==='2');
  const scroll=await page.locator('.words-scroll').evaluate(el=>{el.scrollTo(0,0);return el.scrollWidth>el.clientWidth;});
  if(scroll){await page.getByRole('button',{name:'Pan →'}).click();await page.waitForFunction(()=>document.querySelector('.words-scroll').scrollLeft>0);}
  await page.locator('[data-square="112"]').press('Escape');await page.waitForFunction(()=>document.querySelector('.words-scroll')?.getAttribute('data-zoom')==='0');
  assert(requests.filter(q=>q.name.startsWith('delayed_words_')).every(q=>q.name==='delayed_words_inspect'));
  const reads=requests.length;actor='me';revision++;
  await page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(500);
  assert.equal(requests.length,reads);assert(await page.getByText("Opponent's Turn — View Only").isVisible());
  await page.getByRole('link',{name:'Match Home',exact:true}).click();await page.getByRole('link',{name:'Take Turn'}).click();
  await page.getByRole('button',{name:'Pass',exact:true}).waitFor();assert.equal(await page.getByText("Opponent's Turn — View Only").count(),0);
  await page.getByRole('button',{name:'Pass',exact:true}).click();await page.getByRole('button',{name:'Pass turn',exact:true}).click();await page.getByRole('link',{name:'View board'}).waitFor();
  assert.equal(requests.filter(q=>q.name==='delayed_words_action').length,1);assert.deepEqual(errors,[]);results.push({width,height,geometry,zoom:true,pan:scroll,passAfterReentry:true,inspectionWrites:0});await page.close();
 }
 writeFileSync(`${dir}/browser.json`,JSON.stringify({passed:true,transport:'loopback fixture; SQL proven separately',results},null,2));console.log('PASS',results.length,'viewports: board/rack/banner, zoom/pan, frozen view, authoritative reentry and normal pass');
}finally{await browser.close();await server.close();}
