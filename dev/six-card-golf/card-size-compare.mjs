import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='qualification.local/six-card-golf/review-20261022-card-size/';mkdirSync(out,{recursive:true});
const variants=[['published','568f8cc5d7eae5a8dac4097232860cad3132e570',5203],['candidate','08afbece2ce6e4bbe3bbcc48fbec8640e14c4556',5204],...(process.argv.includes('--corrected')?[['corrected',null,5205]]:[])];
const files=['src/components/golf/GolfTable.tsx','src/components/golf/golf.css','src/components/golf/useGolfCardPresentation.ts','src/components/golf/golfScoring.ts','src/lib/canonicalShell/CanonicalFeltSurface.tsx'];
const servers=[];const results={measurements:[],errors:[],state:'Identical browser-only public projection; four frozen seats; viewer turn; two public cards and four backs; same local route and canonical shell. No database requests.'};
const f={id:'cfe00000-0000-4000-8000-000000000001',session:'cfe00000-0000-4000-8000-000000000002',user:'cfe00000-0000-4000-8000-000000000003',players:Array.from({length:4},(_,i)=>({id:'player'+i,user:i===0?'cfe00000-0000-4000-8000-000000000003':'user'+i,seat:4-i}))};
const v={id:f.id,scope:'round',identity:{sessionId:f.session,dealerGameId:f.id,roundId:'round'},rules:{version:'six-card-golf/1',turnSeconds:30,holes:9},revision:1,stake:5,viewerId:'player0',players:f.players.map((p,i)=>({id:p.id,userId:p.user,seat:p.seat,name:i?'Bot'+i:'Jeremy',isBot:i>0,chips:100})),tableaus:Object.fromEntries(f.players.map(p=>[p.id,{cards:[0,null,null,9,null,null],exposed:[true,false,false,true,false,false]}])),scores:Object.fromEntries(f.players.map(p=>[p.id,0])),holes:[],phase:'playing',hole:1,turnIndex:0,dealerIndex:3,deadline:Date.now()+3600000,serverAt:Date.now(),paused:false,canAct:true,settlement:null,financial:{balances:Object.fromEntries(f.players.map(p=>[p.id,100])),resultId:null,batch:null},pending:null,hasPending:false,stockCount:27,discardTop:8,finalQueue:[],finalReason:null,finished:false};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const [name,revision,port]of variants){
 const overrides=new Map(revision?[...files,...(name==='candidate'?['src/components/golf/GolfScorecard.tsx']:[])].map(file=>[resolve(file).replaceAll('\\','/'),execFileSync('git',['show',revision+':'+file],{encoding:'utf8'})]):[]);
 const server=await createServer({configFile:false,cacheDir:out+'vite-'+name,optimizeDeps:{entries:[]},plugins:[{name:'readonly-published-source',enforce:'pre',load(id){return overrides.get(id.split('?')[0])??null;}},react()],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/six-card-golf/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qualification.local/**']}}});servers.push(server);await server.listen();
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>results.errors.push({name,message:e.message}));
 await page.addInitScript(f=>{sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f));window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.(),0);}close(){}};},f);
 await page.route('**/__golf/**',async route=>{const req=route.request().postDataJSON();const data=req.name==='golf_snapshot'?{...v,serverAt:Date.now()}:req.table==='players'?f.players.map((p,i)=>({id:p.id,game_id:f.session,user_id:p.user,position:p.seat,chips:100,is_bot:i>0})):req.single?null:[];await route.fulfill({json:{data,error:null,status:200}});});
 await page.goto('http://127.0.0.1:'+port+'/dev/six-card-golf/live.html?id='+f.id+'&user='+f.user);await page.locator('.golf-local').waitFor();
 for(const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:667,height:375},{width:844,height:390},{width:1024,height:768}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(250);
  const dimensions=await page.evaluate(()=>{const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};const get=s=>box(document.querySelector(s));const pane=document.querySelector('[data-hud-row="pane"]'),slot=document.querySelector('.golf-hand-slot'),local=document.querySelector('.golf-local');return {cards:[...document.querySelectorAll('[data-golf-position] .golf-card-artifact')].map(e=>({artifact:box(e),face:box(e.querySelector('[data-playing-card-root]')),visibleInPane:Math.max(0,Math.min(e.getBoundingClientRect().bottom,pane.getBoundingClientRect().bottom)-Math.max(e.getBoundingClientRect().top,pane.getBoundingClientRect().top))})),pane:box(pane),slot:box(slot),local:box(local),slotScrollHeight:slot.scrollHeight,grid:getComputedStyle(document.querySelector('.golf-hand-row')??slot).gridTemplateColumns,cardWidth:getComputedStyle(local).getPropertyValue('--golf-card-w'),cardHeight:getComputedStyle(local).getPropertyValue('--golf-card-h')};});
  if(name==='corrected'){
   const baseline=results.measurements.find(m=>m.name==='published'&&m.viewport.width===viewport.width);
   for(let i=0;i<6;i++){assert(Math.abs(dimensions.cards[i].face.width-baseline.cards[i].face.width)<.05);assert(Math.abs(dimensions.cards[i].face.height-baseline.cards[i].face.height)<.05);}
   assert.equal(await page.locator('.golf-leaderboard thead th').count(),2);
   if(viewport.width>viewport.height&&viewport.height<400){
    await page.locator('.golf-hand-slot').evaluate(e=>e.scrollTop=e.scrollHeight);
    dimensions.scrolled=await page.evaluate(()=>{const slot=document.querySelector('.golf-hand-slot'),s=slot.getBoundingClientRect(),b=document.querySelector('[data-golf-position="3"] .golf-card-artifact').getBoundingClientRect();return {scrollTop:slot.scrollTop,visible:Math.max(0,Math.min(s.bottom,b.bottom)-Math.max(s.top,b.top)),height:b.height};});
    assert(Math.abs(dimensions.scrolled.visible-dimensions.scrolled.height)<1);await page.screenshot({path:out+'corrected-scrolled-'+viewport.width+'.png'});await page.locator('.golf-hand-slot').evaluate(e=>e.scrollTop=0);
   }
  }
  results.measurements.push({name,revision,viewport,...dimensions});await page.screenshot({path:out+name+'-'+viewport.width+'.png'});
 }
 await page.close();
}writeFileSync(out+'measurements.json',JSON.stringify(results,null,2));console.log(JSON.stringify({errors:results.errors,measurements:results.measurements.map(m=>({name:m.name,viewport:m.viewport,card:m.cards[0].face,lowerVisible:m.cards[3].visibleInPane,slot:m.slot}))}));}
finally{await browser.close();await Promise.all(servers.map(s=>s.close()));}
