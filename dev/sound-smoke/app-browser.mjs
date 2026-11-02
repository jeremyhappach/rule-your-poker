// Compiled App, actual routes/components and native Web Audio. All authority
// responses are synthetic; every external request is intercepted or blocked.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {initialSibling} from '../async-combined/sibling-completion-fixtures.mjs';
const origin='http://127.0.0.1:15429',root=resolve(process.env.AUDIO_BASELINE_DIST??'dist'),out='qualification.local/sound-smoke/browser';
mkdirSync(out,{recursive:true});
const authorities=[...new Set(readdirSync(resolve(root,'assets')).filter(n=>/^index-.*\.js$/.test(n)).flatMap(n=>readFileSync(resolve(root,'assets',n),'utf8').match(/https:\/\/[a-z0-9-]+\.supabase\.co/g)??[]))];
assert.equal(authorities.length,1);const authKey='sb-'+new URL(authorities[0]).hostname.split('.')[0]+'-auth-token';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,origin).pathname));if(!file.startsWith(root+sep)){res.statusCode=403;return res.end();}if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');let bytes=readFileSync(file);if(extname(file)==='.js'){let code=bytes.toString(),m=code.match(/(\w+)\.present\(\{userId:\w+,id:"run21-swoosh:/);if(m)code+=';window.audioAdmission=[];for(const method of ["present","follow","schedule"]){const manager='+m[1]+',original=manager[method].bind(manager);manager[method]=(...args)=>{window.audioAdmission.push({method,at:performance.now(),enabled:manager.enabled,context:manager.context?.state,cue:args[0]?.cue?.durationMs??args[0]?.durationMs,id:args[0]?.id,policy:args[0]?.policy,voices:[...manager.voices.values()],groups:[...manager.lastGroup]});return original(...args);};}';bytes=Buffer.from(code);}res.end(bytes);});
await new Promise(r=>server.listen(15429,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[];
const triRules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};
function fixture(game){
 const base=initialSibling(game,Date.now());if(game==='tri-towers'){base.game=game;base.config=triRules;}
 return {...base,id:'child',matchId:'match',revision:1,board:null,round:1,segment:1,reviewRevision:0};
}
function startBoard(s){
 const at=Date.now();
 if(s.game==='run21')return {playerId:s.actor,columns:Array.from({length:5},()=>[]),passesUsed:0,presented:[],current:{rank:'2',suit:'spades'},cardIndex:0,revision:0,startedAt:at+2500,deadline:at+122500,result:null};
 if(s.game==='tri-towers')return {rules:triRules,phase:'intro',cards:Array.from({length:28},(_,i)=>i>=18?i-13:null),removed:[],waste:4,stockRemaining:23,run:0,highRun:0,score:0,deadline:at+2500,result:null};
 return {...initialSibling('boxdrop',at).board,phase:'intro',deadline:at+2500};
}
async function scenario(game,width,mode='async'){
 let state=fixture(game),invited=mode==='async',sound=true,arcadeEvents=[],rejectPass=false;
 const contexts=[],errors=[],external=[],commands=[],receipts=new Map();
 const advance=()=>{if(state.board?.phase==='intro'&&Date.now()>=state.board.deadline){state={...state,revision:state.revision+1,board:{...state.board,phase:'ready',deadline:Date.now()+30000}};}};
 const current=viewer=>{advance();return {...state,board:state.actor===viewer?state.board:null,serverAt:Date.now()};};
 const home=()=>({id:'match',status:invited?'invited':'active',revision:state.revision,offerHash:'fixture',realMoney:false,held:false,organizer:'other',opponent:'me',players:[{id:'me',name:'Alex'},{id:'other',name:'Blair'}],createdAt:new Date().toISOString(),invitationExpiresAt:state.expiresAt,acceptedAt:invited?null:new Date().toISOString(),net:0,unsettled:0,completed:0,exposure:5,receipt:null,serverAt:Date.now(),lineup:[{id:'child',game,ordinal:1,stake:5,config:state.config,actor:state.actor,segment:state.segment,revision:state.revision,terminal:false,expiresAt:state.expiresAt,lastCallAt:state.expiresAt,startedAt:state.board?new Date().toISOString():null,scores:{me:0,other:0},pendingResults:{},progress:{me:'Round '+state.round,other:'Round '+state.round}}]});
 const arcade=()=>({id:'run',game,ruleset:state.config.preset??state.config.version,revision:state.revision,status:'active',serverAt:Date.now(),score:0,dueAt:state.board?.deadline,events:arcadeEvents,
  view:game==='tri-towers'?{...state.board,roundId:'round',round:1,scorePresentation:null,event:{label:'Ready',points:0}}:
   {config:state.config,roundId:'round',roundNumber:1,viewerId:'me',boards:{me:state.board},players:[{id:'me',name:'Alex'}],active_player_id:'me',liveBoards:true,revealed:false,cumulative:{me:0},scorePresentation:null,presentationKey:'run'}});
 const perform=command=>{
  if(receipts.has(command.requestId))return receipts.get(command.requestId);
  assert.equal(command.revision,state.revision);if(mode==='async')assert.equal(command.segment,state.segment);
  const intent=command.intent;state=structuredClone(state);state.revision++;
  if(intent.type==='start')state.board=startBoard(state);
  else if(game==='run21'){
   const b=state.board;assert(Date.now()>=b.startedAt);if(intent.type==='place')b.columns[intent.column].push(b.current);else {assert.equal(intent.type,'pass');b.passesUsed++;}
   b.cardIndex++;b.revision++;b.current={rank:String(2+b.cardIndex%7),suit:'hearts'};
   if(intent.type==='place')arcadeEvents=[{sequence:state.revision,type:intent.type==='place'?'card_placed':'pass_used',actorId:state.actor,operands:intent.type==='place'?{column:intent.column}:{},frame:{config:state.config,boards:{me:b}}}];
  }else {assert.equal(intent.type,'remove');const b=state.board;b.removed.push(intent.index);b.waste=b.cards[intent.index];b.phase='playing';b.deadline=Date.now()+120000;}
  const result=mode==='async'?current(state.actor):arcade();receipts.set(command.requestId,structuredClone(result));return result;
 };
 async function client(viewer='me'){
  const context=await browser.newContext({viewport:{width,height:width<500?844:900},hasTouch:width<500,isMobile:width<500});contexts.push(context);
  // A closed test socket is a real interruption to Arcade's recovery owner.
  // Keep an acknowledged local channel instead; no upstream socket is opened.
  await context.routeWebSocket('**',ws=>ws.onMessage(raw=>{
   const packet=JSON.parse(String(raw)),array=Array.isArray(packet);
   const [join_ref,ref,topic,event,payload]=array?packet:[packet.join_ref,packet.ref,packet.topic,packet.event,packet.payload];
   const response=event==='phx_join'?{postgres_changes:(payload?.config?.postgres_changes??[]).map((c,i)=>({...c,id:i+1}))}:{};
   const reply={status:'ok',response};ws.send(JSON.stringify(array?[join_ref,ref,topic,'phx_reply',reply]:{join_ref,ref,topic,event:'phx_reply',payload:reply}));
  }));
  const user={id:viewer,aud:'authenticated',role:'authenticated',email:viewer+'@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:viewer,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token,authKey})=>{
   localStorage.setItem(authKey,JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
   window.audioProof={events:[],contexts:[],stops:0};const Real=window.AudioContext;
   window.AudioContext=class extends Real{constructor(){super();window.audioProof.contexts.push(this);}
    createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...args)=>{window.audioProof.events.push({kind:'bell',at:performance.now()});return start(...args);};return n;}
    createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...args)=>{if(n.buffer?.duration>.02)window.audioProof.events.push({kind:'sample',at:performance.now(),duration:n.buffer.duration,placed:document.querySelectorAll('.run21-stacked-card').length});return start(...args);};n.stop=(...args)=>{window.audioProof.stops++;return stop(...args);};return n;}
   };
  },{user,token,authKey});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){const name=path.split('/').at(-1);
    if(name==='delayed_home')return send(home());
    if(name==='delayed_respond'){assert.equal(req.postDataJSON().p_action,'accept');invited=false;return send(null);}
    if(name==='delayed_reviews')return send({events:[],terminal:false,actor:state.actor,segment:state.segment,revision:state.revision,started:!!state.board,expiresAt:state.expiresAt,held:false,serverAt:Date.now()});
    if(name==='platform_notification_center')return send({actionable:0,items:[]});return send([]);
   }
   if(path.startsWith('/rest/v1/')){const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');if(table==='profiles'&&req.method()==='PATCH'){sound=req.postDataJSON().play_sounds;return send({play_sounds:sound});}const value=table==='profiles'?{id:viewer,username:viewer,is_active:true,play_sounds:sound}:null;return send(single?value:value?[value]:[]);}
   if(url.origin!==origin){external.push(req.url());return route.abort();}
   if(path==='/api/delayed'||path==='/api/arcade'){
    const command=req.postDataJSON();commands.push({viewer,...command});advance();
    if(command.op==='leaderboard')return send({ruleset:state.config.preset??state.config.version,rows:[],self:null,personalBest:null,previousBests:[],activeRun:null,latestResult:null});
    if(command.op==='start'){state.board=startBoard(state);state.revision++;return send(arcade());}
    if(command.op==='action'&&command.intent?.type==='pass'&&rejectPass){rejectPass=false;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:mode==='async'?'delayed:stale_action':'arcade:stale_action'})});}
    if(command.op==='action')return send(perform(command));
    return send(mode==='async'?current(viewer):arcade());
   }
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
 }
 const count=(page,kind)=>page.evaluate(kind=>window.audioProof.events.filter(e=>e.kind===kind).length,kind);
 const stable=async(page,kind)=>{const n=await count(page,kind);await page.waitForTimeout(250);assert.equal(await count(page,kind),n);return n;};
 const boardSelector=game==='run21'?'[data-run21-gameplay]':game==='tri-towers'?'.tri-shared-board':'[data-boxdrop]';
 let page;
 try{
  page=await client();await page.goto(origin+(mode==='async'?'/delayed/match':'/arcade/'+game));
  if(!process.env.AUDIO_BASELINE_DIST&&game==='run21'){
   const initial=mode==='async'?'/delayed/match':'/arcade/'+game;
   for(const path of mode==='async'?['/delayed','/delayed/match']:['/arcade','/arcade/run21']){
    await page.goto(origin+path);await page.getByRole('button',{name:'Mute sounds',exact:true}).waitFor();
    for(const w of [320,360,390,844,1440]){await page.setViewportSize({width:w,height:900});const box=await page.getByRole('button',{name:'Mute sounds',exact:true}).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=w,'speaker inside header '+path+' '+w);}
    await page.setViewportSize({width,height:width<500?844:900});
   }
   await page.getByRole('button',{name:'Mute sounds',exact:true}).click();await page.getByRole('button',{name:'Unmute sounds',exact:true}).waitFor();
   await page.goto(origin+initial);await page.getByRole('button',{name:'Unmute sounds',exact:true}).waitFor();
   await page.reload();await page.getByRole('button',{name:'Unmute sounds',exact:true}).waitFor();
   await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();await page.getByRole('button',{name:'Mute sounds',exact:true}).waitFor();
  }

  if(mode==='async'){await page.getByRole('button',{name:'Accept lineup and stakes'}).click();assert.equal(await count(page,'bell'),0);await page.getByRole('link',{name:'Take Turn',exact:true}).click();}
  else await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.locator(boardSelector).waitFor();await page.waitForFunction(()=>window.audioProof.events.some(e=>e.kind==='bell'));
  assert.equal(await stable(page,'bell'),8); // Eight partials, exactly one existing bell.
  await page.waitForTimeout(2600);
  if(game==='run21'){
   const place=column=>page.getByRole('button',{name:new RegExp('Place in column '+column+',')}).click();
   const before=await count(page,'sample');await place(1);await page.waitForFunction(n=>window.audioProof.events.filter(e=>e.kind==='sample').length>n,before);
   assert.equal(await count(page,'sample'),before+1);assert.equal(await page.evaluate(()=>window.audioProof.events.filter(e=>e.kind==='sample').at(-1).placed),1);
   if(!process.env.AUDIO_BASELINE_DIST){rejectPass=true;const rejectedBefore=await count(page,'sample');await page.getByRole('button',{name:'Pass',exact:true}).click();await page.waitForTimeout(350);assert.equal(await count(page,'sample'),rejectedBefore,'rejected Pass is silent');}
   if(!process.env.AUDIO_BASELINE_DIST){await page.reload();await page.locator(boardSelector).waitFor();await page.waitForLoadState('networkidle');assert.equal(await stable(page,'sample'),0);}
   const passBefore=await count(page,'sample');await page.getByRole('button',{name:'Pass',exact:true}).click();if(process.env.AUDIO_BASELINE_DIST){await page.waitForTimeout(300);assert.equal(await count(page,'sample'),passBefore,'baseline Arcade Pass is silent');console.log('REPRODUCED: actual Arcade response shape commits Pass but starts no audio');}else await page.waitForFunction(n=>window.audioProof.events.filter(e=>e.kind==='sample').length===n+1,passBefore);
   if(mode==='async'){
    // Another client opens the same accepted turn: no old bell or card playback.
    const second=await client();await second.goto(origin+'/delayed/match/play/child');await second.locator(boardSelector).waitFor();await second.waitForLoadState('networkidle');assert.equal(await stable(second,'bell'),0);assert.equal(await stable(second,'sample'),0);
    // Existing placement retains its 25 ms policy; explicitly establish a running context.
    await second.getByRole('button',{name:'Mute sounds',exact:true}).click();await second.getByRole('button',{name:'Unmute sounds',exact:true}).click();await second.waitForFunction(()=>window.audioProof.contexts.some(c=>c.state==='running'));
    await second.getByRole('button',{name:/Place in column 2,/}).click();await second.waitForFunction(()=>window.audioProof.events.some(e=>e.kind==='sample'),null,{timeout:7000}).catch(async error=>{console.error('SECOND',await second.evaluate(()=>({admission:window.audioAdmission,events:window.audioProof.events,contexts:window.audioProof.contexts.map(c=>c.state),hidden:document.hidden,receipts:Object.keys(sessionStorage).filter(k=>k.startsWith('ptown-audio:'))})));throw error;});
    await page.reload();await page.locator(boardSelector).waitFor();await page.waitForLoadState('networkidle');assert.equal(await stable(page,'bell'),0);assert.equal(await stable(page,'sample'),0);
    // Unlock through the actual next card gesture after a reload.
    await place(3);await page.waitForFunction(()=>window.audioProof.events.some(e=>e.kind==='sample'));
    await page.getByRole('button',{name:'Mute sounds',exact:true}).click();await page.getByRole('button',{name:'Unmute sounds',exact:true}).waitFor();const muted=await count(page,'sample');await place(4);assert.equal(await count(page,'sample'),muted);
    await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();await stable(page,'sample');await place(5);await page.waitForFunction(n=>window.audioProof.events.filter(e=>e.kind==='sample').length===n+1,muted);
    await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('focus'));});
    const resumed=await stable(page,'sample');await place(1);await page.waitForFunction(n=>window.audioProof.events.filter(e=>e.kind==='sample').length===n+1,resumed);
    // The other participant then receives a genuinely new segment on a separate client.
    state={...fixture(game),actor:'other',segment:2,revision:state.revision+1};const opponent=await client('other');await opponent.goto(origin+'/delayed/match');await opponent.getByRole('link',{name:'Take Turn',exact:true}).click();await opponent.locator(boardSelector).waitFor();await opponent.waitForFunction(()=>window.audioProof.events.some(e=>e.kind==='bell'));assert.equal(await stable(opponent,'bell'),8);
   }
  }else if(game==='tri-towers'){
   const before=await count(page,'sample');await page.locator('[data-tri-card="18"]').click();await page.waitForFunction(n=>window.audioProof.events.filter(e=>e.kind==='sample').length>n,before);
  }
  await page.screenshot({path:`${out}/${mode}-${game}-${width}.png`});
  if(mode==='async'&&game!=='run21'){await page.reload();await page.locator(boardSelector).waitFor();assert.equal(await stable(page,'bell'),0);}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push({mode,game,width,passed:true,commands:commands.length,nativeAudio:true});
  writeFileSync(out+'/browser.json',JSON.stringify({passed:false,inProgress:true,syntheticAuthorityOnly:true,checks},null,2));console.log('PASS',mode,game,width);
 }catch(error){console.error(JSON.stringify({mode,game,width,errors,external,commands,body:page?(await page.locator('body').innerText()).slice(0,1800):'',audio:page?await page.evaluate(()=>window.audioProof.events):null}));throw error;}
 finally{await Promise.all(contexts.map(c=>c.close()));}
}
try{
 if(!process.env.AUDIO_BASELINE_DIST)for(const width of process.env.AUDIO_FOCUS?[1440]:[390,1440])for(const game of process.env.AUDIO_FOCUS?['run21']:['run21','tri-towers','boxdrop'])await scenario(game,width);
 if(!process.env.AUDIO_FOCUS)for(const game of process.env.AUDIO_BASELINE_DIST?['run21']:['run21','tri-towers'])await scenario(game,390,'arcade');
 writeFileSync(out+'/browser.json',JSON.stringify({passed:true,syntheticAuthorityOnly:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
