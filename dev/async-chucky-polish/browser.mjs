// Native browser + real components over isolated HTTP fixtures. Live lobby is a
// read-only SQL export; Chucky boards come from installed shared rule functions.
// ACKs/actions here mutate only in-memory fixtures, never production records.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/async-chucky-polish';mkdirSync(dir,{recursive:true});
const live=JSON.parse(readFileSync(dir+'/live-activity.json','utf8'));
const boards=JSON.parse(readFileSync(dir+'/chucky-fixtures.json','utf8'));
const user='d7dc1928-3727-4351-b0ff-0e80c81c2953',token=randomUUID(),streams=new Set(),errors=[],results=[];
let homes=structuredClone(live.matches),final=false;
const currentBoard=()=>boards.find(b=>b.final===final).fixture;
const notify=()=>{for(const res of streams)res.write('data: '+JSON.stringify({table:'delayed_match_updates',eventType:'UPDATE',new:{user_id:user}})+'\n\n');};
const server=await createServer({configFile:false,envFile:false,cacheDir:dir+'/vite',plugins:[react(),{name:'polish-http',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://local');
 if(!url.pathname.startsWith('/__delayed_route/')&&url.pathname!=='/api/delayed'){
  if(!url.pathname.includes('.')&&!url.pathname.startsWith('/@')&&!url.pathname.startsWith('/src/')&&!url.pathname.startsWith('/node_modules/'))req.url='/dev/async-chucky-polish/browser.html';
  return next();
 }
 if((req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'))!==token){res.writeHead(401);res.end('{}');return;}
 const op=url.pathname.split('/').at(-1);
 if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 let raw='';for await(const part of req)raw+=part;const q=JSON.parse(raw||'{}');let value=null;
 if(op==='auth')value={session:{user:{id:user,email:'fixture@local.test'},access_token:token,refresh_token:token,expires_at:Math.floor(Date.now()/1000)+3600}};
 else if(op==='rpc'){
  if(q.name==='delayed_lobby')value={serverAt:Date.now(),matches:homes.filter(h=>h.status!=='settled'||!h.finaleViewed)};
  else if(q.name==='platform_notification_center')value={items:[],actionable:0,serverAt:Date.now()};
  else if(q.name==='get_account_access')value={enabled:true};
  else if(['delayed_home','delayed_history_detail'].includes(q.name))value=homes.find(h=>h.id===q.args.p_match);
  else if(q.name==='delayed_finale_ack'){const h=homes.find(h=>h.id===q.args.p_match);assert(h.reviewsComplete);h.finaleViewed=true;h.revision++;}
  else if(q.name==='fixture_chucky_start')value=currentBoard().initial;
  else if(q.name==='fixture_chucky_fold')value=currentBoard().next;
 }else if(op==='read')value=q.single?null:[];
 else if(op==='delayed'){assert.equal(q.op,'action');const h=homes.find(h=>h.id==='turn-fixture');h.lineup[0].actor=h.opponent;h.lineup[0].playable=false;h.revision++;res.setHeader('Content-Type','application/json');res.end('{}');return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:value,error:null}));
});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:15459,strictPort:true,hmr:false}});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const origin='http://127.0.0.1:15459';
const luminance=hex=>{const v=hex.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
try{
 const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(20000);p.setDefaultNavigationTimeout(30000);p.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await p.goto(origin+'/delayed?token='+token,{waitUntil:'domcontentloaded'});await p.getByRole('link',{name:'Async (2)'}).waitFor();console.log('Loaded live activity fixture');
 assert.equal(await p.locator('.midnight-match').count(),6);assert.equal(await p.getByRole('link',{name:'View Match Result'}).count(),2);
 assert.equal(await p.getByRole('link',{name:'Take Turn'}).count(),0);
 const selected=await p.getByRole('link',{name:'Async (2)'}).evaluate(e=>getComputedStyle(e).color);assert.equal(selected,'rgb(101, 5, 31)');
 assert(contrast('#65051f','#c79b50')>=4.5&&contrast('#65051f','#f7dda1')>=4.5);
 await p.screenshot({path:dir+'/activity-selected-phone.png',fullPage:true});
 await p.getByRole('link',{name:'Live',exact:true}).click();await p.getByRole('link',{name:'Async (2)'}).waitFor();
 const unselected=await p.getByRole('link',{name:'Async (2)'}).evaluate(e=>getComputedStyle(e).color);assert.equal(unselected,'rgb(255, 130, 155)');assert(contrast('#ff829b','#061323')>=4.5);
 await p.screenshot({path:dir+'/activity-unselected-phone.png',fullPage:true});
 for(const count of [1,0]){await p.getByRole('link',{name:'View Match Result'}).first().click();await p.getByRole('link',{name:'Back to Lobby',exact:true}).waitFor({timeout:30000});await p.getByRole('link',{name:'Back to Lobby',exact:true}).click();await p.getByRole('link',{name:count?'Async (1)':'Async',exact:true}).waitFor();}
 assert.equal(await p.getByRole('link',{name:'Async',exact:true}).getAttribute('data-activity'),null);assert.equal(await p.locator('.midnight-match').count(),4);
 results.push('Exact four waiting matches + two pending finales; both reachable through real finale owner; ACKs reconcile badge and lobby to zero');
 const turn=structuredClone(live.matches.find(h=>h.id==='eb05040b-8be1-4ec7-8a75-4419e46a5532'));turn.id='turn-fixture';turn.lineup=[{...turn.lineup[0],actor:user,playable:true}];homes=[turn];notify();
 await p.getByRole('link',{name:'Async (1)'}).waitFor();assert((await p.getByRole('link',{name:'Take Turn'}).getAttribute('href')).includes('/play/'));
 await p.evaluate(async()=>{const {delayedRequest}=await import('/src/lib/delayed/client.ts');await delayedRequest({op:'action',intent:{type:'submit'}});});
 await p.getByRole('link',{name:'Async',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'Take Turn'}).count(),0);
 results.push('Real command transport invalidates shared activity after successful submission, without realtime');
 for(const mode of ['arcade','async'])for(final of [false,true]){
  console.log('Checking '+mode+' '+(final?'final':'regular')+' fold');
  await p.goto(origin+'/fixture/'+mode+'?token='+token,{waitUntil:'domcontentloaded'});await p.locator('.cs-table[data-phase=fold_stay]').waitFor();
  const initial=await p.locator('.cs-player .cs-card').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
  const box=await p.locator('.cs-player .cs-cards').boundingBox();await p.getByRole('button',{name:/FOLD/}).click();await p.locator('.cs-table[data-phase=fold]').waitFor();
  assert.equal(await p.locator('.cs-player .cs-card').count(),4);assert.equal(await p.locator('.cs-dealer .cs-card').count(),0);
  assert.deepEqual(await p.locator('.cs-player .cs-card').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),initial);
  assert.equal(await p.locator('.cs-community .cs-card[aria-label="Face-down card"]').count(),0);
  const gray=await p.locator('.cs-player .cs-slot').first().evaluate(e=>({filter:getComputedStyle(e).filter,opacity:getComputedStyle(e).opacity}));assert(gray.filter.includes('grayscale(1)'));assert.equal(gray.opacity,'1');
  const after=await p.locator('.cs-player .cs-cards').boundingBox();assert(Math.abs(box.y-after.y)<1&&Math.abs(box.x-after.x)<1);
  await p.screenshot({path:dir+'/'+mode+'-'+(final?'final':'regular')+'-fold.png'});
  const rabbit=await p.locator('.cs-community .cs-card').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
  await p.evaluate(()=>window.advance(5600));await p.locator('.cs-table[data-phase='+(final?'round_over':'deal')+']').waitFor();
  if(final){
   for(const at of [5600,6250,7000]){await p.evaluate(t=>window.advance(t),at);assert.deepEqual(await p.locator('.cs-community .cs-card').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),rabbit);assert.equal(await p.locator('.cs-player [data-folded=true] .cs-card').count(),4);}
   await p.screenshot({path:dir+'/'+mode+'-bank-count.png'});await p.evaluate(()=>window.advance(10000));await p.getByRole('heading',{name:'Next screen'}).waitFor();assert.equal(await p.locator('.cs-card').count(),0);
  }else{await p.evaluate(()=>window.advance(7400));await p.locator('.cs-community .cs-card').nth(3).waitFor();assert.equal(await p.locator('.cs-player [data-folded=true]').count(),0);assert.equal(await p.locator('.cs-community .cs-card[aria-label="Face-down card"]').count(),2);}
  results.push(mode+': '+(final?'last fold preserves rabbit + gray own cards throughout banking and clears on exit':'ordinary fold keeps own cards gray/in place, no Chucky hand, next deal resets'));
 }
 assert.deepEqual(errors,[]);writeFileSync(dir+'/browser-evidence.json',JSON.stringify({passed:true,results,errors,selected,unselected,contrast:{gold:contrast('#65051f','#c79b50'),dark:contrast('#ff829b','#061323')}},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();for(const s of streams)s.end();await server.close();}
