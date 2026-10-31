// Compiled App, real routes/auth/adapters/audio; only HTTP responses are synthetic.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';

export async function verifyApp(browser,out){
 const origin='http://127.0.0.1:15414',root=resolve(out,'build'),checks=[];
 // Derive the configured auth storage namespace from this exact local bundle.
 // All authority traffic below is fulfilled synthetically before any network I/O.
 const authorities=[...new Set(readdirSync(resolve(root,'assets')).filter(n=>/^index-.*\.js$/.test(n)).flatMap(n=>readFileSync(resolve(root,'assets',n),'utf8').match(/https:\/\/[a-z0-9-]+\.supabase\.co/g)??[]))];
 assert.equal(authorities.length,1);const authStorageKey='sb-'+new URL(authorities[0]).hostname.split('.')[0]+'-auth-token';
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
 const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,origin).pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.statusCode=403;return res.end();}
  if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
 await new Promise(r=>server.listen(15414,'127.0.0.1',r));
 try{for(const [width,height,viewer] of [[320,740,'me'],[390,844,'me'],[1440,900,'me'],[390,844,'other']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500}),errors=[],commands=[],external=[];
  await context.routeWebSocket('**',ws=>ws.close());
  const user={id:viewer,aud:'authenticated',role:'authenticated',email:'local@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:viewer,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.');
  await context.addInitScript(({user,token,authStorageKey})=>{
   const session=JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user});
   localStorage.setItem(authStorageKey,session);
   window.polishAppAudio=[];const Real=window.AudioContext;
   window.AudioContext=class extends Real{createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(at=0)=>{window.polishAppAudio.push(at);start(at);};return osc;}};
  },{user,token,authStorageKey});
  const rules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};
  let board={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i<3?5+i:null),removed:Array.from({length:25},(_,i)=>i+3),waste:4,stockRemaining:12,run:5,highRun:5,score:20000,deadline:Date.now()+120000};
  let revision=1,end=null;const receipts=new Map();
  const expiresAt=new Date(Date.now()+129600000).toISOString(),players=[{id:'me',name:'Alexandria Very Long Player Name'},{id:'other',name:'BlairWithAnExtremelyLongUnbrokenName'}];
  const snapshot=()=>({id:'tri',matchId:'polish',game:'tri-towers',config:rules,revision,segment:end?2:1,actor:end?'other':'me',round:1,board:end?null:board,totals:{me:end?.score??0,other:0},terminal:false,held:false,expiresAt,serverAt:Date.now(),ownResults:end?[{round:1,score:end.score,at:end.completedAt,result:end,board:{...board,result:end}}]:[],winner:null,result:null});
  const home=()=>({id:'polish',status:'active',revision,realMoney:false,offerHash:'synthetic',organizer:'me',opponent:'other',players,createdAt:'2026-10-30T00:00:00Z',invitationExpiresAt:expiresAt,acceptedAt:'2026-10-30T01:00:00Z',settledAt:null,held:false,net:viewer==='me'?-1234567.89:1234567.89,unsettled:9876543.21,completed:0,exposure:9876543.21,receipt:null,serverAt:Date.now(),lineup:[{id:'tri',ordinal:1,game:'tri-towers',stake:5,config:rules,starter:'me',actor:end?'other':'me',segment:end?2:1,revision,terminal:false,availableAt:null,lastCallAt:expiresAt,expiresAt,startedAt:'2026-10-30T01:00:00Z',scores:{[viewer]:20000,[viewer==='me'?'other':'me']:null},pendingResults:{},progress:{me:'Round 1',other:'Not started'},result:null}]});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1);
    if(name==='delayed_home')return send(home());
    if(name==='delayed_reviews')return send({events:[],terminal:false,actor:'me',segment:1,revision,started:true,expiresAt,held:false,serverAt:Date.now()});
    if(name==='platform_notification_center')return send({actionable:0,items:[]});
    return send([]);
   }
   if(path.startsWith('/rest/v1/')){const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');const value=table==='profiles'?{id:viewer,username:viewer,is_active:true,is_superuser:false,play_sounds:true}:null;return send(single?value:value?[value]:[]);}
   if(url.origin!==origin){external.push(url.origin);return route.abort();}
   if(path==='/api/delayed'){
    const command=req.postDataJSON();commands.push(command);
    if(command.op==='action'){
     if(receipts.has(command.requestId))return send(receipts.get(command.requestId));
     assert.equal(command.intent.type,'remove');assert.equal(command.revision,revision);assert.equal(command.segment,1);
     const index=command.intent.index;assert(!board.removed.includes(index));assert.equal(Math.abs(board.cards[index]-board.waste),1);
     revision++;board={...board,removed:[...board.removed,index],waste:board.cards[index]};
     if(board.removed.length===28){const at=Date.now();end={score:50000,scoreBefore:20000,stageScore:30000,timeBonus:0,stockBonus:0,reason:'cleared',completedAt:at};board={...board,phase:'stage_complete',score:50000,deadline:at+8000};}
     const value=snapshot();receipts.set(command.requestId,value);return send(value);
    }
    return send(snapshot());
   }
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/delayed/polish');await page.getByRole('region',{name:'Current Net'}).waitFor({timeout:30000});
   const layout=await page.locator('.async-current-net').evaluate(root=>({height:root.getBoundingClientRect().height,rows:[...root.children].map(row=>{const a=row.children[0].getBoundingClientRect(),b=row.children[1].getBoundingClientRect();return {top:a.top,bottom:a.bottom,oneLine:Math.abs(a.top-b.top)<5,noOverlap:a.right<=b.left};})}));
   assert(layout.rows.every(row=>row.oneLine&&row.noOverlap));assert(layout.rows[1].top>=layout.rows[0].bottom&&layout.rows[2].top>=layout.rows[1].bottom);assert(layout.height<120);
   assert.equal(await page.locator('.async-current-net-player').first().textContent(),'Alexandria Very Long Player Name−$1,234,567.89');
   assert.equal(await page.locator('.delayed-scoreboard strong[data-pending]').textContent(),'—');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/app-net-${width}-${viewer}.png`});
   if(viewer==='me'){
    await page.getByRole('link',{name:'Resume turn',exact:true}).click();await page.locator('[data-tri-card="0"]').waitFor();
    for(const i of [0,1,2]){await page.locator(`[data-tri-card="${i}"]`).click();await page.getByLabel(`Waste ${6+i} of spades`,{exact:true}).waitFor();assert.equal(await page.locator('.tri-card-flight').count(),0);assert.equal(await page.locator('.tri-upcard-flip').evaluate(el=>getComputedStyle(el).visibility),'visible');}
    await page.getByLabel('All three towers cleared').waitFor();await page.waitForFunction(()=>window.polishAppAudio.length>=25);
    await page.screenshot({path:`${out}/app-tri-${width}.png`});await page.waitForURL('**/delayed/polish',{timeout:13000});
    assert(Date.now()-end.completedAt>=7900);assert.equal(commands.filter(c=>c.op==='action').length,3);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push({width,height,viewer,actualCompiledApp:true,layout,commands:commands.map(c=>c.op),audioSources:await page.evaluate(()=>window.polishAppAudio.length),passed:true});
  }catch(error){console.log('Full App failure',JSON.stringify({width,viewer,errors,external,commands,body:(await page.locator('body').innerText()).slice(0,2000)}));throw error;}finally{await context.close();}
 }
 writeFileSync(out+'/app-browser-results.json',JSON.stringify({passed:true,configuredAuthority:authorities[0],syntheticAuthorityOnly:true,checks},null,2));console.log('Full App checks passed:',checks.length);
 }finally{await new Promise(r=>server.close(r));}
}
