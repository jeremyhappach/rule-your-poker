// Actual result/board/finale components and CSS, with isolated loopback RPC data.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/words-final-review';mkdirSync(dir,{recursive:true});
let data,requests=[],began=0;
const client=resolve('dev/async-words/final-review-client.ts');
const server=await createServer({configFile:false,envFile:false,cacheDir:'node_modules/.vite-words-final',plugins:[react(),{name:'final-review-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__inspect/rpc'){
  let raw='';for await(const chunk of req)raw+=chunk;const q=JSON.parse(raw);requests.push({...q,at:Date.now()});let result;
  if(q.name==='delayed_home'||q.name==='delayed_history_detail')result={...data.home,reviewsComplete:!!data.home.receipt&&data.events.every(e=>e.seen)};
  else if(q.name==='delayed_reviews')result={events:data.events,terminal:true};
  else if(q.name==='delayed_words_inspect')result=data.snapshot;
  else if(q.name==='delayed_review_begin'){began=Date.now();result={elapsed:0,seen:false};}
  else if(q.name==='delayed_review_ack'){data.events.find(e=>e.id===q.args.p_event).seen=true;result=null;}
  else if(q.name==='delayed_finale_ack')result=null;
  else throw Error('Unexpected RPC '+q.name);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:result,error:null}));return;
 }
 if(req.url.startsWith('/delayed/')){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-words/final-review-preview.tsx"></script></body></html>'));return;}next();
 });}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:client},{find:'@/components/GameplaySoundButton',replacement:client},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15437,strictPort:true}});
await server.listen();const {finalWordsFixture,opponent,viewer,matchId,childId}=await server.ssrLoadModule('/src/lib/delayed/wordsFinalReview.fixture.ts');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),results=[];
try{
 for(const [width,height,matchEnds] of [[390,844,true],[844,390,false]]){
  data=finalWordsFixture(matchEnds);requests=[];began=0;
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:15437/delayed/${matchId}?review=${childId}`);await page.locator('.words-grid').waitFor();
  assert.equal(await page.getByRole('gridcell').count(),225);assert.equal(await page.locator('[data-square="10"] b').textContent(),'D');
  assert.equal(await page.locator('[data-word-highlight="true"]').count(),3);assert.match(await page.locator('.delayed-turn-nav').textContent(),/UP, PA/);
  assert.equal(requests.filter(q=>q.name==='delayed_review_begin').length,1);assert.equal(requests.find(q=>q.name==='delayed_review_begin').args.p_event,'turn-5');
  await page.screenshot({path:`${dir}/${width}-reveal.png`});
  const score=page.locator(`[data-score-player="${opponent}"] strong`);
  await page.waitForFunction(id=>{const n=Number(document.querySelector(`[data-score-player="${id}"] strong`)?.textContent);return n>376&&n<384;},opponent);
  await page.screenshot({path:`${dir}/${width}-count.png`});
  await page.waitForFunction(id=>document.querySelector(`[data-score-player="${id}"] strong`)?.textContent==='385',opponent);
  const settled=Date.now();assert.equal(await page.locator(`[data-score-player="${viewer}"] strong`).textContent(),'245');assert(await page.getByText('Opponent wins',{exact:true}).isVisible());
  assert.equal(await page.locator('.words-scroll').getAttribute('data-zoom'),'0');assert.equal(requests.filter(q=>q.name==='delayed_review_ack').length,0);
  await page.screenshot({path:`${dir}/${width}-settled.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByText('Game Complete',{exact:true}).waitFor();const announced=Date.now();assert(announced-settled>=2800);
  assert.deepEqual(requests.filter(q=>q.name==='delayed_review_ack').map(q=>q.args.p_event),['turn-1','turn-3','turn-5']);
  assert(requests.find(q=>q.name==='delayed_review_ack').at-began>=7600);await page.screenshot({path:`${dir}/${width}-game-complete.png`});
  if(matchEnds){await page.locator('.async-finale').waitFor();assert(page.url().includes('finale=1'));await page.getByRole('link',{name:'Back to Lobby'}).waitFor({timeout:15000});assert.equal(requests.filter(q=>q.name==='delayed_finale_ack').length,1);}
  else {await page.getByRole('heading',{name:'Match home · other games remain'}).waitFor();assert(!page.url().includes('finale=1'));assert.equal(requests.filter(q=>q.name==='delayed_finale_ack').length,0);}
  assert.deepEqual(errors,[]);results.push({width,height,matchEnds,settledBoardMs:announced-settled,requests:requests.map(q=>({name:q.name,event:q.args?.p_event}))});console.log('PASS',width,height,'matchEnds='+matchEnds);await page.close();
 }
 writeFileSync(`${dir}/browser.json`,JSON.stringify({passed:true,transport:'loopback fixture; no production writes',results},null,2));
}finally{await browser.close();await server.close();}
