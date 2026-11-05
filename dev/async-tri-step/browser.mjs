import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd(),out=resolve(root,'qualification.local/async-tri-step/browser'),origin='http://127.0.0.1:15469';
mkdirSync(out,{recursive:true});
const rules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000,holdMs:5000};
const server=await createServer({configFile:false,envFile:false,cacheDir:resolve(out,'cache'),plugins:[react(),{name:'fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/turn'))return next();s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-input-audio/entry.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});});}}],optimizeDeps:{entries:['dev/async-input-audio/entry.tsx']},resolve:{alias:[...['@/integrations/supabase/client','@/lib/delayed/client','@/lib/arcade/client'].map(find=>({find,replacement:resolve(root,'dev/async-input-audio/transport.ts')})),{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15469,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
try{
for(const delay of [180,600])for(const phase of ['ready','playing'])for(const mode of ['async','arcade'])for(const mute of [false,true]){
 let revision=1,board={rules,phase,cards:Array.from({length:28},(_,i)=>i<18?null:i%13),removed:[],waste:4,stockRemaining:24,run:0,highRun:0,score:0,deadline:Date.now()+120000,result:null};
 const commands=[],errors=[];
 const project=()=>mode==='arcade'?{id:'child',game:'tri-towers',ruleset:rules.version,revision,status:'active',serverAt:Date.now(),score:board.score,dueAt:board.deadline,events:[],view:{...board,roundId:'round',round:1,scorePresentation:null,event:{label:'Playing',points:0}}}:{id:'child',matchId:'match',game:'tri-towers',config:rules,revision,segment:1,actor:'me',round:1,board,totals:{me:0,other:0},terminal:false,held:false,expiresAt:new Date(Date.now()+3600000).toISOString(),serverAt:Date.now(),ownResults:[],winner:null,result:null};
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.proof={events:[],nodes:[],taps:[],frames:[]};
  document.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-tri-card]');if(!el)return;const tap={index:Number(el.dataset.triCard),at:performance.now(),disabled:el.disabled,phase:document.querySelector('[data-phase]')?.dataset.phase};window.proof.taps.push(tap);const poll=()=>{const card=document.querySelector('[data-tri-card="'+tap.index+'"]');if(!card){tap.removal=performance.now()-tap.at;return;}if(card.dataset.pending==='true'&&tap.pending==null)tap.pending=performance.now()-tap.at;if(performance.now()-tap.at<3500)requestAnimationFrame(poll);};requestAnimationFrame(poll);},true);
  document.addEventListener('click',e=>{const el=e.target.closest('[data-tri-card]');if(!el)return;const t=window.proof.taps.findLast(t=>t.index===Number(el.dataset.triCard));if(t)t.click=performance.now()-t.at;},true);
  let last=performance.now();requestAnimationFrame(function frame(at){window.proof.frames.push(at-last);last=at;requestAnimationFrame(frame);});
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname!=='/fixture-api')return route.continue();const c=route.request().postDataJSON();if(c.op==='action'){
  commands.push({intent:c.intent,revision:c.revision,at:Date.now()});await new Promise(r=>setTimeout(r,delay));
  const i=c.intent.index;if(c.intent.type==='remove'&&Math.abs((board.cards[i]%13)-(board.waste%13))===1&&!board.removed.includes(i)){
   revision++;board={...board,phase:'playing',removed:[...board.removed,i],waste:board.cards[i],score:board.score+1000,run:board.run+1};
  }else return route.fulfill({status:400,json:{error:'invalid fixture move'}});
 }return route.fulfill({json:project()});});
 await page.goto(origin+'/turn?mode='+mode+'&mute='+Number(mute));
 await page.locator('[data-tri-card="18"]:not([disabled])').waitFor();
 await page.waitForTimeout(250);
 const positions=await page.locator('[data-tri-card]').evaluateAll(els=>[18,19,20,21].map(i=>{const b=els.find(e=>+e.dataset.triCard===i).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};}));
 for(const pos of positions){await page.touchscreen.tap(pos.x,pos.y);await page.waitForTimeout(75);}
 await page.waitForTimeout(delay*4+250);
 const data=await page.evaluate(()=>({taps:window.proof.taps,events:window.proof.events,frames:window.proof.frames,message:document.querySelector('.tri-input-status')?.textContent??'',removed:[18,19,20,21].filter(i=>!document.querySelector('[data-tri-card="'+i+'"]'))}));
 const result={delay,phase,mode,mute,errors,commands,...data};results.push(result);assert.equal(commands.length,4);assert.deepEqual(data.removed,[18,19,20,21]);assert.equal(errors.length,0);assert.ok(data.taps.every(t=>t.pending!=null&&t.pending<100));
 console.log(JSON.stringify({...result,events:undefined,frames:undefined}));await page.close();
}
}finally{writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
