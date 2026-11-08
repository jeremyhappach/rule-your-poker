// Actual compiled App and native worker/MessageChannel/WindowClient APIs in Edge.
// Synthetic notificationclick + HTTP fixtures: NOT APNs or physical iPhone evidence.
import {createServer} from 'node:http';
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=resolve('dist'),origin='http://127.0.0.1:15439',out='qualification.local/push-tap';mkdirSync(out,{recursive:true});
const authority=[...new Set(readdirSync(root+'/assets').filter(n=>/^index-.*\.js$/.test(n)).flatMap(n=>readFileSync(root+'/assets/'+n,'utf8').match(/https:\/\/[a-z0-9-]+\.supabase\.co/g)??[]))];assert.equal(authority.length,1);
const worker=readFileSync('public/ptown-push-sw.js','utf8');
const testWorker=`const register=self.addEventListener.bind(self);let tapHandler;self.addEventListener=(name,fn,...args)=>{if(name==='notificationclick')tapHandler=fn;return register(name,fn,...args);};\n${worker}\nregister('message',e=>{if(e.data?.type==='test-tap')tapHandler({notification:{data:e.data.payload,close(){}},waitUntil(p){e.waitUntil(p);p.then(()=>e.ports[0].postMessage('done'));}});});`;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,origin).pathname;
 if(pathname==='/ptown-push-sw.js'){res.setHeader('Content-Type','text/javascript');return res.end(testWorker);}
 let file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
 if(!existsSync(file)||!extname(file))file=root+'/index.html';res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(15439,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const owner='11111111-1111-4111-8111-111111111111',match='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
const user={id:owner,aud:'authenticated',role:'authenticated',email:'tap@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.');
const results=[];
try{for(const scenario of ['warm','background-desktop','pending','retry','lobby-exit','suspended','cold','stale-same-match']){
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.routeWebSocket('**',ws=>ws.close());
 let accountCalls=0,homeCalls=0,hold=scenario==='pending',fail=false,release;const held=new Promise(r=>release=r);const errors=[];
 let home={id:match,status:'active',revision:1,organizer:owner,opponent:other,realMoney:false,held:false,players:[{id:owner,name:'Owner'},{id:other,name:'Opponent'}],createdAt:new Date().toISOString(),acceptedAt:new Date().toISOString(),serverAt:Date.now(),net:0,completed:0,exposure:0,receipt:null,
  lineup:[{id:child,ordinal:1,game:'run21',stake:0,terminal:false,actor:owner,expiresAt:new Date(Date.now()+3600000).toISOString(),lastCallAt:new Date(Date.now()+1800000).toISOString(),scores:{[owner]:0,[other]:0}}]};
 await context.addInitScript(({user,token,key})=>{localStorage.setItem(key,JSON.stringify({user,access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer'}));window.documentIdentity=crypto.randomUUID();},{user,token,key:'sb-'+new URL(authority[0]).hostname.split('.')[0]+'-auth-token'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token,refresh_token:'synthetic',expires_in:3600});
  if(path.startsWith('/rest/v1/rpc/')){
   if(path.endsWith('/account_access_snapshot')){accountCalls++;if(hold)await held;if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Test outage'})});return send({userId:owner,enabled:scenario!=='suspended',status:scenario==='suspended'?'suspended':'enabled',revision:1,verified:true,email:user.email});}
   if(path.endsWith('/delayed_home')){assert.equal(req.postDataJSON().p_match,match);homeCalls++;return send({...home,serverAt:Date.now()});}
   if(path.endsWith('/delayed_list'))return send([home]);
   if(path.endsWith('/platform_notification_center'))return send({actionable:0,items:[]});
   if(path.endsWith('/account_statement'))return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
   return send([]);
  }
  if(path.startsWith('/rest/v1/')){const value=path.endsWith('/profiles')?{id:owner,username:'Owner',is_active:true,is_superuser:false,play_sounds:false}:null;return send((req.headers().accept??'').includes('object')?value:value?[value]:[]);}
  if(url.origin!==origin)return route.abort();if(path.startsWith('/api/'))return send({});return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+(scenario==='cold'||scenario==='stale-same-match'?'/delayed/'+match:'/delayed'),{waitUntil:'domcontentloaded'});
 const identity=await page.evaluate(()=>window.documentIdentity);
 if(scenario==='pending')await page.getByText('Checking account access…').waitFor();
 else if(scenario==='suspended')await page.getByText('Account Suspended — Contact Administrator.').waitFor();
 else await page.getByRole('heading',{name:'Async Matches',exact:true}).waitFor();
 await page.evaluate(async owner=>{
  await navigator.serviceWorker.register('/ptown-push-sw.js',{scope:'/'});const reg=await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
  await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();resolve();};reg.active.postMessage({type:'push-binding',value:{binding:'test-binding',userId:owner}},[c.port2]);});
 },owner);
 const tap=eventId=>page.evaluate(async({owner,match,eventId})=>{const reg=await navigator.serviceWorker.ready;await new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();resolve();};reg.active.postMessage({type:'test-tap',payload:{kind:'turn',binding:'test-binding',matchId:match,eventId}},[c.port2]);});},{owner,match,eventId});
 if(scenario==='retry'||scenario==='lobby-exit'){
  fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForFunction(()=>document.readyState==='complete');
 }
 if(scenario==='stale-same-match'){await page.getByRole('link',{name:'Take Turn',exact:true}).waitFor();home={...home,revision:2,lineup:home.lineup.map(c=>({...c,actor:other}))};}
 if(scenario==='background-desktop'){const otherPage=await context.newPage();await otherPage.goto('about:blank');await otherPage.bringToFront();}
 const eventId='55555555-5555-4555-8555-555555555555';await tap(eventId);
 if(scenario==='pending'){assert.equal(new URL(page.url()).pathname,'/delayed');assert.equal(accountCalls,1);hold=false;release();}
 if(scenario==='retry'){await page.getByRole('button',{name:'Retry',exact:true}).waitFor();fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();}
 if(scenario==='lobby-exit'){await page.getByRole('button',{name:'Back to Lobby'}).click();await page.waitForURL(origin+'/');}
 else if(scenario==='suspended'){assert.equal(homeCalls,0);assert.equal(new URL(page.url()).pathname,'/delayed');}
 else {await page.waitForURL(origin+'/delayed/'+match);if(scenario==='stale-same-match'){await page.getByText('Opponent’s turn',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Take Turn',exact:true}).count(),0);assert.equal(homeCalls,2);}else{await page.getByRole('link',{name:'Take Turn',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Take Turn',exact:true}).getAttribute('href'),'/delayed/'+match+'/play/'+child);}}
 const before=homeCalls;await tap(eventId);assert.equal(homeCalls,before);assert.equal(await page.evaluate(()=>window.documentIdentity),identity);assert.deepEqual(errors,[]);
 await page.screenshot({path:out+'/'+scenario+'.png'});results.push({scenario,accountCalls,homeCalls,path:new URL(page.url()).pathname,sameDocument:true,errors});await context.close();
 }}finally{await browser.close();server.close();}
writeFileSync(out+'/results.json',JSON.stringify({browser:'Desktop Edge',notification:'synthetic worker click; not a physical-device push',results},null,2));console.log(JSON.stringify(results,null,2));
