// Local presentation review only: synthetic public snapshots, no database or gameplay writes.
// Run from the repository root: node dev/six-card-golf/cardback-seat-review.mjs [--check]
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium, webkit} from '@playwright/test';
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd().replaceAll('\\','/');
const out=resolve(root,'qualification.local/six-card-golf/cardback-seat-review');
mkdirSync(out,{recursive:true});
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const started=Date.now();
const boards=[[48,null,null,18,null,null],[50,null,null,35,null,null],[0,12,25,38,26,39],[3,null,null,7,null,null]];
const snapshots=[2,3,4].map(count=>{
 const players=Array.from({length:count},(_,i)=>({id:uuid(i+1),userId:uuid(i+101),name:i?'Bot'+i:'Owner',seat:i+1,isBot:i>0,chips:100}));
 return {identity:{sessionId:uuid(300+count),dealerGameId:uuid(400+count),roundId:uuid(500+count)},rules:{version:'six-card-golf/2',holes:9,turnSeconds:30,presentation:{version:1,scoringDelayMs:1200,resultsDurationMs:5000}},revision:1,stake:5,phase:'playing',hole:1,players,viewerId:players[0].id,turnIndex:1,dealerIndex:0,openingRemaining:0,tableaus:Object.fromEntries(players.map((p,i)=>[p.id,{cards:boards[i],exposed:boards[i].map(c=>c!==null)}])),scores:Object.fromEntries(players.map(p=>[p.id,0])),holes:[],playerControls:Object.fromEntries(players.map(p=>[p.id,{autoPlay:false,intentVersion:0,sitOutNextHand:false}])),financial:{balances:Object.fromEntries(players.map(p=>[p.id,100])),resultId:null,batch:null},settlement:null,pending:null,hasPending:false,stockCount:51-count*6,discardTop:40,consecutiveNoRevealTurns:0,finalQueue:[],finalReason:null,deadline:started+86400000,pausedAt:null,paused:false,canAct:false,finished:false,presentation:null};
});
const requests=[];
const fixture=s=>({id:s.identity.dealerGameId,session:s.identity.sessionId,user:s.players[0].userId,players:s.players.map(p=>({id:p.id,user:p.userId,seat:p.seat}))});
const server=await createServer({root,configFile:false,cacheDir:out+'/vite-cache',optimizeDeps:{entries:[]},plugins:[react(),{
 name:'golf-readonly-cardback-fixture',
 enforce:'pre',
 // Exercise the owner's Bears preference through the existing profile reader.
 transform(code,id){if(id.endsWith('/dev/six-card-golf/live.tsx'))return code.replace('<VisualPreferencesProvider>','<VisualPreferencesProvider userId="'+uuid(101)+'">').replace("'P-Town Poker'","'LOCAL REVIEW · static public cards'");},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__cardback-review'){
   const s=snapshots.find(v=>v.players.length===Number(url.searchParams.get('players')||2))??snapshots[0],f=fixture(s);
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script>sessionStorage.setItem('+JSON.stringify('golf-fixture:'+f.id)+','+JSON.stringify(JSON.stringify(f))+');location.replace('+JSON.stringify('/dev/six-card-golf/live.html?id='+f.id+'&user='+f.user)+');</script>');return;
  }
  if(url.pathname==='/__golf/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': synthetic read-only fixture\n\n');return;}
  if(!url.pathname.startsWith('/__golf/'))return next();
  let body='';for await(const chunk of req)body+=chunk;
  const q=JSON.parse(body||'{}');requests.push({path:url.pathname,name:q.name,table:q.table});
  let data=null,error=null;
  if(url.pathname==='/__golf/rpc'&&q.name==='golf_snapshot')data={...(snapshots.find(s=>s.identity.dealerGameId===q.args.p_dealer_game_id)??snapshots[0]),serverAt:Date.now()};
  else if(url.pathname==='/__golf/read'){
   const s=snapshots.find(s=>s.identity.sessionId===q.filters?.game_id)??snapshots[2];
   data=q.table==='players'?s.players.map(p=>({id:p.id,game_id:s.identity.sessionId,user_id:p.userId,position:p.seat,chips:100,is_bot:p.isBot,status:'active'})):q.table==='profiles'?s.players.map(p=>({id:p.userId,username:p.name,table_layout:'bridge',card_back_design:'bears',deck_color_mode:'two_color'})):[];
   if(q.single)data=data.find(p=>!q.filters?.id||p.id===q.filters.id)??null;
  }else error={code:'LOCAL_REVIEW',message:'Read-only review: gameplay actions are disabled.'};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));
 });}
}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:root+'/dev/six-card-golf/local-client.ts'},{find:'@',replacement:root+'/src'}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5221,strictPort:true,watch:{ignored:['**/qualification.local/**']}}});
await server.listen();
console.log('Local read-only preview: http://127.0.0.1:5221/__cardback-review?players=2 (also players=3 or 4)');
if(process.argv.includes('--check')){
 const evidence={cases:[],issues:[],errors:[],externalRequests:[],webkit:{available:existsSync(webkit.executablePath()),path:webkit.executablePath()}};
 const engines=[['Edge',()=>chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'})]];
 if(evidence.webkit.available)engines.push(['WebKit',()=>webkit.launch({headless:true})]);
 try{for(const [engine,launch] of engines){const browser=await launch();try{
  for(const count of [2,3,4])for(const viewport of [{width:390,height:680},{width:844,height:390},{width:1024,height:768}]){
   console.log('Checking '+engine+' '+count+' players '+viewport.width+'x'+viewport.height);
   const p=await browser.newPage({viewport,isMobile:true,hasTouch:true});p.setDefaultTimeout(5000);p.on('pageerror',e=>evidence.errors.push(e.message));
   await p.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){evidence.externalRequests.push(route.request().url());return route.abort();}return route.continue();});
   await p.goto('http://127.0.0.1:5221/__cardback-review?players='+count);await p.locator('.golf-local').waitFor();await p.waitForTimeout(200);
   const grid=p.locator('.golf-public-grid .golf-public-cards');assert.equal(await grid.evaluate(e=>e.tagName),'DIV');
   await grid.tap();assert.equal(await p.getByRole('dialog').count(),0);
   const sizes=await p.locator('.golf-public-grid .golf-public-cards>span').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect(),card=e.querySelector('[data-playing-card-root]').getBoundingClientRect();return {slot:[r.width,r.height],card:[card.width,card.height],back:!!e.querySelector('[data-playing-card-hidden]')};}));
   for(const x of sizes){assert.ok(x.card[1]>4);assert.ok(Math.abs(x.card[1]-x.card[0]*1.4)<.15);assert.ok(Math.abs(x.slot[1]-x.card[1])<.15);}
   const backs=p.locator('.golf-public-grid [data-canonical-card-back]');assert.equal(await backs.count(),4);assert.equal(await backs.first().getAttribute('data-cb-pref-id'),'bears');
   const targets=p.locator('[data-seat-card-inspect]');assert.equal(await targets.count(),count-1);
   const hitSizes=[];
   for(let i=0;i<count-1;i++){
    const target=targets.nth(i),box=await target.boundingBox();assert.ok(box.width>=44&&box.height>=44);hitSizes.push(box);
    // A full 44×44 area must be reachable, even when existing seat art extends
    // below a short felt; the canonical tab rail retains priority there.
    const hitArea=await target.evaluate(e=>{const r=e.getBoundingClientRect();for(let start=0;start<=r.width-44;start++)if([1,22,43].every(x=>[1,22,43].every(y=>document.elementFromPoint(r.x+start+x,r.y+y)===e)))return {x:r.x+start,y:r.y,width:44,height:44};return null;});
    if(!hitArea){evidence.issues.push({engine,count,viewport,player:i+1,issue:'Canonical seat/HUD overlap obstructs part of the 44px target',box});await p.screenshot({path:out+'/hit-target-'+count+'-'+viewport.width+'-'+i+'.png'});}
    const card=await target.locator('..').locator('[data-playing-card-root],[data-seat-card-exposed]').last().boundingBox();
    const tabs=await p.locator('[data-canonical-shell-tabbar]').boundingBox();
    await p.touchscreen.tap(card.x+card.width/2,Math.min(card.y+card.height/2,tabs.y-2));await p.getByRole('dialog').waitFor();
    assert.ok((await p.getByRole('dialog').innerText()).includes('Bot'+(i+1)+' · public tableau'));
    assert.equal(await p.locator('.golf-inspect [data-playing-card-hidden]').count(),i===1?0:4);
    await p.getByRole('button',{name:'Close',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});
   }
   for(const key of ['Enter','Space']){
    await targets.first().focus();await p.keyboard.press(key);await p.getByRole('dialog').waitFor();
    await p.getByRole('dialog').evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished));});
    await p.getByRole('button',{name:'Close',exact:true}).focus();await p.keyboard.press('Escape');await p.locator('[role="dialog"]').waitFor({state:'detached'});
   }
   // Retain shape even if implicit grid stretching stops supplying a height.
   const style=await p.addStyleTag({content:'.golf-public-grid .golf-public-cards>span{align-self:start}'});
   const stressed=await backs.first().boundingBox();assert.ok(Math.abs(stressed.height-stressed.width*1.4)<.15);await style.evaluate(e=>e.remove());
   await p.screenshot({path:out+'/'+engine+'-'+count+'-'+viewport.width+'x'+viewport.height+'.png'});
   evidence.cases.push({engine,count,viewport,sizes,hitSizes,keyboard:true,privacy:true,stretchIndependent:true});await p.close();
  }
 }finally{await browser.close();}}
 assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.externalRequests,[]);assert.ok(requests.every(r=>r.path==='/__golf/read'||r.name==='golf_snapshot'));
 writeFileSync(out+'/evidence.json',JSON.stringify({...evidence,requests},null,2));console.log(JSON.stringify({checked:evidence.cases.length,issues:evidence.issues,errors:evidence.errors,webkit:evidence.webkit}));
 if(evidence.issues.length)process.exitCode=1;
 }finally{await server.close();}
}
