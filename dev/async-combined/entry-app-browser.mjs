// Real production App/Index/routes/auth/release gate/client. Only HTTP authority
// responses are synthetic, at loopback; no component, hook or module aliases.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {polishResponse} from './polish-preview-state.mjs';
const base='http://127.0.0.1:15401',root=resolve('dist'),out='qualification.local/async-combined';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));if(!file.startsWith(root))return res.end();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(15401,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let lastPage,diagnostic;
try{
 for(const reduced of [false,true])for(const game of ['run21','tri-towers','quintzee','boxdrop']){
  if(process.env.ENTRY_ONE&&game!==process.env.ENTRY_ONE)continue;
  polishResponse({op:'fixture_reset'});
  const context=await browser.newContext({viewport:{width:reduced?320:390,height:844},reducedMotion:reduced?'reduce':'no-preference'}),commands=[],rpcCalls=[],errors=[],unknown=new Set();let lazyReads=0;
  await context.routeWebSocket('**',ws=>ws.close());
  const user={id:'me',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:'me',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token})=>{
   localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
   window.entryTrace={bad:[],phases:[],reviewFinal:null,handoff:null,board:null,gaps:[]};
   const observe=()=>{const body=document.body;if(!body)return;const text=body.innerText??'',e=window.entryTrace;
    const bad=text.match(/Preparing your turn|Preparing next hand|Preparing saved result|Loading Async Words|Checking current build|Connecting…|Begin round|Availability deadline:/gi);if(bad)e.bad.push(...bad);
    const title=document.querySelector('.async-winner-overlay strong')?.textContent;
    if(e.handoff&&!e.board&&!document.querySelector('.async-result-review')&&title!=='Your turn!'&&!document.querySelector('.async-turn'))e.gaps.push(text.slice(0,200));if(title&&e.phases.at(-1)!==title)e.phases.push(title);
    if(document.querySelector('.async-result-review')&&text.includes('39,848'))e.reviewFinal??=Date.now();
    if(title==='Your turn!')e.handoff??=Date.now();
    if(!document.querySelector('.async-result-review')&&(document.querySelector('[data-run21-player-actions]')||document.querySelector('.tri-shared-board')||document.querySelector('[data-quintzee]')||document.querySelector('[data-boxdrop]')))e.board??=Date.now();
   };new MutationObserver(observe).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
  },{user,token});
  const invitation=id=>({id,match_id:id,kind:'invitation',revision:1,read_revision:0,actionable:true,created_at:id==='invite-old'?'2026-10-28T00:00:00Z':new Date().toISOString(),payload:{opponentId:'other',status:'invited',availableCount:0}});
  const inviteHome=id=>({id,status:'invited',revision:1,organizer:'other',opponent:'me',players:[{id:'other',name:id==='invite-old'?'Existing Inviter':'New Inviter'},{id:'me',name:'Hap'}],lineup:[],createdAt:new Date().toISOString(),invitationExpiresAt:new Date(Date.now()+3600000).toISOString(),realMoney:false,net:0,completed:0,exposure:0,serverAt:Date.now()});
  const home=()=>{const h=polishResponse({name:'delayed_home',args:{p_match:'turns'}}),reviews=polishResponse({name:'delayed_reviews',args:{p_child:'turn-'+game}});return {...h,lineup:h.lineup.filter(c=>c.game===game).map(c=>({...c,pendingResults:{other:reviews.events.some(e=>!e.seen)?1:0}}))};};
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base){unknown.add(url.origin);return route.abort();}
   const path=url.pathname;
   if(path.startsWith('/assets/Delayed-')&&path.endsWith('.js')){lazyReads++;await pause(900);return route.continue();}
   if(path==='/build-manifest.json'){await pause(350);return route.continue();}
   const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path==='/api/delayed'){
    const body=req.postDataJSON();commands.push({body,at:Date.now()});await pause(body.op==='state'?650:900);
    return send(polishResponse(body));
   }
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),args=req.postDataJSON()??{};rpcCalls.push({name,args,at:Date.now()});
    if(name==='platform_notification_center')return send({actionable:3,items:[invitation('invite-new'),invitation('invite-old'),{id:'turn-notice',match_id:'turns',kind:'turn',actionable:true,revision:1,read_revision:0,payload:{opponentId:'other',availableCount:1,status:'active'}}]});
    if(name==='delayed_notification_read')return send(null);
    if(name==='delayed_home'){await pause(args.p_match.startsWith('invite-')?750:600);return send(args.p_match.startsWith('invite-')?inviteHome(args.p_match):home());}
    if(name==='delayed_list')return send([home()]);
    if(name.startsWith('delayed_review')){await pause(name==='delayed_review_ack'?700:450);return send(polishResponse({name,args}));}
    if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
    return send([]);
   }
   if(path.startsWith('/rest/v1/')){
    const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');
    const value=table==='profiles'?{id:'me',username:'Hap',is_active:true,is_superuser:false}:null;
    return send(req.method()==='GET'?(single?value:table==='profiles'?[value]:[]):null);
   }
   return route.continue();
  });
  const page=await context.newPage();lastPage=page;diagnostic={errors,rpcCalls,commands,unknown};page.on('pageerror',e=>errors.push(e.stack??e.message));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Notifications/}).first().click({timeout:30000});
  await page.getByText('Pending invite from New Inviter',{exact:true}).waitFor();await page.getByText('Pending invite from Existing Inviter',{exact:true}).waitFor();
  assert.equal(await page.getByText(/Pending invite from (your opponent|player one)/i).count(),0);
  await page.getByRole('link',{name:'Your turn',exact:true}).click();await page.locator('.delayed-match-home').waitFor();
  await page.getByRole('link',{name:'Take Turn',exact:true}).click();
  await page.getByText("Showing Jeremy's results",{exact:true}).waitFor();
  assert.equal(commands.filter(c=>c.body.op==='action').length,0);
  if(reduced&&game==='run21'){await page.reload({waitUntil:'domcontentloaded'});await page.getByText("Showing Jeremy's results",{exact:true}).waitFor();}
  await page.getByText('Your turn!',{exact:true}).waitFor({timeout:30000});
  await page.waitForFunction(()=>window.entryTrace.board!==null,null,{timeout:15000});
  let trace=await page.evaluate(()=>window.entryTrace);
  assert.deepEqual(trace.bad,[]);assert.deepEqual(trace.gaps,[]);assert(trace.handoff-trace.reviewFinal>=2900,JSON.stringify(trace));
  const flow=structuredClone(trace);
  if(game==='quintzee'){
   assert.equal(commands.filter(c=>c.body.op==='action').length,0);assert.equal(await page.locator('.q-dice button').count(),0);
   await page.waitForTimeout(1000);assert.equal(commands.filter(c=>c.body.op==='action').length,0);
   await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Start',exact:true}).waitFor();assert.equal(commands.filter(c=>c.body.op==='action').length,0);
   await page.getByRole('button',{name:'Start',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.q-dice button').length===5);
  }
  const starts=commands.filter(c=>c.body.op==='action'&&c.body.intent.type==='start');assert.equal(starts.length,1);assert(starts[0].at>=trace.handoff);
  assert.equal(commands.filter(c=>c.body.intent?.type==='roll').length,0);
  const before=polishResponse({op:'state',childId:'turn-'+game});const deadline=before.board.deadline;
  // Refresh a resumed attempt through App, auth, release gate, lazy route and review gate.
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.entryTrace.board!==null,null,{timeout:20000});
  assert.equal(commands.filter(c=>c.body.intent?.type==='start').length,1);assert.equal(polishResponse({op:'state',childId:'turn-'+game}).board.deadline,deadline);
  trace=await page.evaluate(()=>window.entryTrace);assert.deepEqual(trace.bad,[]);assert.equal(await page.locator('.async-result-review').count(),0);assert(!trace.phases.some(p=>p.startsWith('Showing ')),JSON.stringify(trace));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual([...unknown],[]);assert(lazyReads>=1,'actual lazy route was not exercised');
  await page.screenshot({path:out+'/entry-app-'+game+(reduced?'-reduced':'')+'.png'});
  checks.push({game,reduced,actualApp:true,invitationNames:true,commands:commands.map(c=>c.body.op+':'+(c.body.intent?.type??'')),phases:flow.phases,resumedPhases:trace.phases,holdMs:flow.handoff-flow.reviewFinal,lazyReads});
  console.log('PASS',JSON.stringify(checks.at(-1)));await context.close();
 }
 writeFileSync(out+'/entry-app-browser.json',JSON.stringify({passed:true,checks},null,2));
}catch(error){if(lastPage){await lastPage.screenshot({path:out+'/entry-app-failure.png'}).catch(()=>{});console.log('DIAGNOSTIC',JSON.stringify({...diagnostic,unknown:[...diagnostic.unknown],url:lastPage.url(),body:(await lastPage.locator('body').innerText().catch(()=>'' )).slice(0,2500)}));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
