// Real browser/provider/worker/API calls, isolated authenticated HTTP fixtures.
// Actual iPhone Home Screen rendering remains owner smoke.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qualification.local/app-badge';mkdirSync(dir,{recursive:true});
const user=randomUUID(),other=randomUUID(),token=randomUUID(),errors=[],streams=new Set();
let count=3,version=100,offline=false;
const snapshot=()=>({serverAt:Date.now(),badge:{count,version},matches:count?[{id:'mixed',organizer:user,opponent:other,status:'active',revision:version,held:false,players:[],lineup:[{id:'turn',game:'quintzee',actor:user,playable:true,terminal:false,expiresAt:new Date(Date.now()+3600000).toISOString()}]}]:[]});
const server=await createServer({configFile:false,envFile:false,cacheDir:dir+'/vite',plugins:[react(),{name:'badge-http',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://local');
 if(!url.pathname.startsWith('/__delayed_route/')&&url.pathname!=='/api/delayed'){
  if(url.pathname==='/')req.url='/dev/web-push/app-badge.html';return next();
 }
 if((req.headers.authorization?.replace(/^Bearer /,'')??url.searchParams.get('token'))!==token){res.writeHead(401);res.end('{}');return;}
 const op=url.pathname.split('/').at(-1);
 if(op==='events'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 let raw='';for await(const part of req)raw+=part;const q=JSON.parse(raw||'{}');let value=null;
 if(op==='auth')value={session:{user:{id:user},access_token:token}};
 else if(op==='rpc'){
  if(q.name==='delayed_lobby'){if(offline){res.end(JSON.stringify({error:{message:'Offline'}}));return;}value=snapshot();}
  if(q.name==='platform_notification_center')value={items:[],actionable:0};
  if(q.name==='delayed_review_ack'){count=0;version++;}
 }else if(op==='delayed'){count=1;version++;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:value,error:null}));
});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-words/route-client.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15461,strictPort:true,hmr:false}});
await server.listen();const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:15461/?token='+token);
 const stored=()=>page.evaluate(async()=>{const cache=await caches.open('ptown-push-v1');return (await cache.match(new URL('/__push_local__/app-badge',location.origin)))?.json();});
 const waitCount=async n=>{await page.waitForFunction(async n=>{const c=await caches.open('ptown-push-v1');return (await (await c.match(new URL('/__push_local__/app-badge',location.origin)))?.json())?.snapshot?.count===n;},n);};
 await waitCount(3);await page.getByRole('heading',{name:'Async (1)'}).waitFor();
 await page.getByRole('button',{name:'Take turn'}).click();await waitCount(1);
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(150);assert.equal((await stored()).snapshot.count,1);
 offline=false;await page.getByRole('button',{name:'View result'}).click();await waitCount(0);await page.getByRole('heading',{name:'Async (0)'}).waitFor();
 count=2;version++;await page.reload();await waitCount(2);
 const worker=context.serviceWorkers()[0];assert(worker);
 const support=await worker.evaluate(()=>typeof self.navigator.setAppBadge==='function'&&typeof self.navigator.clearAppBadge==='function');assert(support);
 const results={passed:true,nativeBadgingApi:support,initialCombinedCount:3,tabMatchCount:1,afterTurn:1,failedRefreshPreserves:true,afterResult:0,reopen:2,errors};
 assert.deepEqual(errors,[]);writeFileSync(dir+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();for(const s of streams)s.end();await server.close();}
