import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const root=process.cwd(),base='http://127.0.0.1:15421',dir='qualification.local/async-runback';
mkdirSync(dir,{recursive:true});
const shared=JSON.parse(read('dev/async-combined/shared-preimage.json'));
const games=[{id:'run21',rules:shared.run21},{id:'tri-towers',rules:shared.tri},{id:'quintzee',rules:shared.quintzee}];
let calls=[],sent=new Map(),lost=false,fixture={real:true,eligible:true,opponent:true,unsupported:false};
const home=id=>({id,status:'settled',revision:2,realMoney:fixture.real,organizer:'me',opponent:'other',players:[{id:'me',name:'Hap'},{id:'other',name:'Other Player'}],policyVersion:'delayed/1',opponentEligible:fixture.opponent,runbackEligible:fixture.eligible,reviewsComplete:true,finaleViewed:false,receipt:{match_id:id},net:7,createdAt:'2026-11-01T12:00:00Z',acceptedAt:'2026-11-01T13:00:00Z',settledAt:'2026-11-02T12:00:00Z',exposure:27,completed:3,serverAt:Date.now(),lineup:games.map((g,i)=>({id:'child'+i,ordinal:i+1,game:g.id,stake:7+2*i,terminal:true,result:{delta:i?0:7,winner:'me',reason:'normal'},config:fixture.unsupported&&i===0?{version:'removed/1'}:g.rules}))});
function rpc(name,args={}){
 calls.push({name,args});
 if(name==='delayed_capabilities')return {enabled:true,fake_money_only:false,max_children:32,games:games.map(g=>({...g,stake:5}))};
 if(name==='delayed_opponent_page')return {items:[{id:'replacement',name:'Another Player',isHuman:true}],hasMore:false,next:null};
 if(name==='delayed_history_detail'||name==='delayed_home')return home(args.p_match);
 if(name==='delayed_history')return [{id:'original',opponent:'Other Player',realMoney:fixture.real,startedAt:'2026-11-01T12:00:00Z',completedAt:'2026-11-02T12:00:00Z',count:3,net:7}];
 if(name==='delayed_list')return [];
 if(name==='delayed_finale_ack')return null;
 if(name==='delayed_create'){const fingerprint=JSON.stringify(args);if(sent.has(args.p_request)){assert.equal(sent.get(args.p_request),fingerprint);}else sent.set(args.p_request,fingerprint);if(lost){lost=false;throw Error('Response lost after commit');}return 'new-'+args.p_request;}
 if(name==='platform_notification_center')return {items:[],actionable:0};
 return {};
}
const server=await createServer({configFile:false,envFile:false,cacheDir:resolve(dir,'vite-cache'),plugins:[react(),{name:'local-runback-proof',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];
 if(path==='/runback-fixture'){try{let body='';for await(const chunk of req)body+=chunk;const {name,args}=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(rpc(name,args)));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}return;}
 if(path!=='/'&&!path?.startsWith('/delayed'))return next();
 const html=await s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-runback/fixture.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);
});}}],resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-combined/review-auth.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/async-runback/transport.ts')},{find:'@/lib/delayed/client',replacement:resolve('dev/async-runback/transport.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15421,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]){
  fixture={real:true,eligible:true,opponent:true,unsupported:false};const context=await browser.newContext({viewport,isMobile:viewport.width<1000,hasTouch:viewport.width<1000}),page=await context.newPage(),errors=[],external=[];
  await page.addInitScript(()=>{const native=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true;},onchange:null}:native(query);Object.defineProperty(navigator,'standalone',{value:true});});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){external.push(url.origin);return route.abort();}return route.continue();});
  await page.goto(base+'/',{waitUntil:'networkidle'});await page.getByRole('link',{name:'Completed Sessions',exact:true}).click();
  const archiveAction=page.getByRole('link',{name:/Run It Back against Other Player/});await expect(archiveAction).toBeVisible();
  await page.screenshot({path:dir+'/archive-'+viewport.width+'.png'});const prior=sent.size;await archiveAction.click();
  await expect(page.getByLabel('Stake 3',{exact:true})).toHaveValue('11');await expect(page.getByLabel('Opponent',{exact:true})).toHaveValue('other');
  await expect(page.getByRole('switch')).toBeChecked();assert.equal(sent.size,prior);
  await page.screenshot({path:dir+'/draft-'+viewport.width+'.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('link',{name:'← Cancel Run It Back'}).click();await expect(archiveAction).toBeVisible();assert.equal(sent.size,prior);
  await page.goto(base+'/delayed');await page.getByRole('link',{name:'Archived / Completed Sessions'}).click();await expect(archiveAction).toBeVisible();await archiveAction.click();
  await expect(page.getByLabel('Stake 1',{exact:true})).toHaveValue('7');await page.getByRole('button',{name:'Move game 3 up'}).click();await page.getByLabel('Stake 2',{exact:true}).fill('13');
  await page.getByRole('button',{name:'Send Invitation',exact:true}).click();await expect(page).toHaveURL(base+'/delayed');assert.equal(sent.size,prior+1);
  pass(viewport.width+' main/async archive → populated draft → cancel/edit/send; no overflow; standalone iPhone/PWA simulation');
  if(viewport.width===390){
   fixture.unsupported=true;fixture.opponent=false;await page.goto(base+'/?sessions=completed');await archiveAction.click();
   await expect(page.getByRole('button',{name:'Send Invitation',exact:true})).toBeDisabled();await expect(page.getByText(/no longer eligible/)).toBeVisible();
   await page.getByRole('button',{name:'Use current rules for game 1'}).click();await page.getByLabel('Opponent',{exact:true}).selectOption('replacement');
   await expect(page.getByRole('button',{name:'Send Invitation',exact:true})).toBeEnabled();await page.getByRole('link',{name:'← Cancel Run It Back'}).click();
   fixture.unsupported=false;fixture.opponent=true;await archiveAction.click();await expect(page.getByLabel('Stake 1',{exact:true})).toHaveValue('7');lost=true;const before=sent.size;
   await page.getByRole('button',{name:'Send Invitation',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Response lost');assert.equal(sent.size,before+1);
   await page.reload();await expect(page.getByText(/A send was attempted/)).toBeVisible();await page.getByRole('button',{name:'Send Invitation',exact:true}).click();await expect(page).toHaveURL(base+'/delayed');assert.equal(sent.size,before+1);
   pass('390 unsupported config and inactive opponent explicitly resolved; response-loss reload reuses one invitation identity');
  }
  fixture.eligible=true;await page.goto(base+'/delayed/original?finale=1');await expect(page.getByRole('link',{name:'Run It Back',exact:true})).toBeVisible({timeout:15000});
  const run=page.getByRole('link',{name:'Run It Back',exact:true});await run.scrollIntoViewIfNeeded();
  const rect=await run.boundingBox();assert(rect&&rect.x>=0&&rect.x+rect.width<=viewport.width+1&&rect.height>=44,'visible touch target');
  await expect(page.getByRole('link',{name:'Back to Lobby'})).toBeVisible();await page.screenshot({path:dir+'/finale-'+viewport.width+'.png'});await run.click();await expect(page.getByLabel('Stake 1',{exact:true})).toHaveValue('7');
  await page.getByRole('link',{name:'← Cancel Run It Back'}).click();await expect(page).toHaveURL(base+'/delayed/original?finale=1');
  pass(viewport.width+' last-viewer finale primary/secondary actions and cancellation return');
  if(viewport.width===390){fixture.eligible=false;await page.goto(base+'/delayed/original?finale=1');await expect(page.getByRole('link',{name:'Back to Lobby'})).toBeVisible({timeout:15000});await expect(page.getByRole('link',{name:'Run It Back',exact:true})).toHaveCount(0);pass('first viewer has Back to Lobby only');}
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
 }
 write(dir+'/browser.json',JSON.stringify({passed:true,checks,scope:'actual route/components with loopback synthetic RPC; Edge touch/standalone simulation, not physical Safari'},null,2));
}finally{await browser.close();await server.close();}
