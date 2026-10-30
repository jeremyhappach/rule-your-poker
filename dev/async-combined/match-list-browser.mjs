// Real production App/Index/routes/auth/release gate/client. Only HTTP authority
// responses are synthetic, at loopback; no component, hook or module aliases.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {polishResponse} from './polish-preview-state.mjs';
const base='http://127.0.0.1:15402',root=resolve('dist'),out='qualification.local/async-combined';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));if(!file.startsWith(root))return res.end();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(15402,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let lastPage,diagnostic;
const baseline=process.argv.includes('--baseline');
try{
 for(const width of baseline?[390]:[390,1280])for(const kind of baseline?['active']:['active','empty','completed','fetch-error','chunk-error','malformed']){
  polishResponse({op:'fixture_reset'});
  const context=await browser.newContext({viewport:{width,height:844}}),errors=[],rpcCalls=[],mutations=[],external=[];let lazyReads=0,listReads=0,fail=kind==='fetch-error',badChunk=kind==='chunk-error';
  await context.routeWebSocket('**',ws=>ws.close());
  const user={id:'me',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:'me',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{user,token});
  const active=polishResponse({name:'delayed_home',args:{p_match:'turns'}});
  const rows=()=>kind==='empty'?[]:kind==='completed'?[{...active,status:'settled',completed:active.lineup.length}]:kind==='malformed'?{}:[active];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(url.origin);return route.abort();}
   const path=url.pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path.startsWith('/assets/Delayed-')&&path.endsWith('.js')){lazyReads++;await pause(600);if(badChunk)return route.abort('failed');return route.continue();}
   if(path==='/build-manifest.json'){await pause(200);return route.continue();}
   if(path==='/api/delayed'){mutations.push(req.postDataJSON());return send({error:'No gameplay allowed in list proof'});}
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1);rpcCalls.push(name);
    if(name==='platform_notification_center')return send({actionable:0,items:[]});
    if(name==='delayed_list'){listReads++;await pause(700);return fail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Match list temporarily unavailable',code:'fixture_503'})}):send(rows());}
    if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
    if(/delayed_.*(ack|action|respond|remove|finalize|commit)/.test(name))mutations.push(name);
    return send([]);
   }
   if(path.startsWith('/rest/v1/')){const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');const value=table==='profiles'?{id:'me',username:'Hap',is_active:true,is_superuser:false}:null;return send(req.method()==='GET'?(single?value:table==='profiles'?[value]:[]):null);}
   return route.continue();
  });
  const page=await context.newPage();lastPage=page;diagnostic={kind,width,errors,rpcCalls,mutations,external};page.on('pageerror',e=>errors.push(e.message));
  const clickBell=async()=>{await page.getByRole('button',{name:/Notifications/}).first().click();await page.getByRole('link',{name:'My Async matches',exact:true}).click();};
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await clickBell();
  if(baseline){await page.waitForTimeout(1400);const body=await page.locator('body').innerText();assert(errors.some(e=>e.includes('reviewPending')),JSON.stringify({errors,body}));assert.equal(listReads,0);await page.screenshot({path:out+'/list-baseline-blank.png'});writeFileSync(out+'/list-baseline.json',JSON.stringify({errors,body,listReads,lazyReads,url:page.url()},null,2));console.log('REPRODUCED',JSON.stringify({errors,body,listReads,lazyReads}));await context.close();continue;}
  const expectList=async()=>{await page.getByRole('heading',{name:'Async Matches',exact:true}).waitFor();await page.getByRole('link',{name:'Set Up Asynchronous Match',exact:true}).waitFor();
   if(kind==='empty'||kind==='completed'){await page.getByText('No active async matches.',{exact:true}).waitFor();assert.equal(await page.locator('.delayed-card-link').count(),0);}else await page.locator('.delayed-card-link').first().waitFor();
   assert.equal(await page.getByRole('link',{name:'Archived / Completed Sessions',exact:true}).count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));};
  if(kind==='chunk-error'||kind==='malformed'){
   await page.getByRole('heading',{name:'Async matches unavailable',exact:true}).waitFor();assert.equal(await page.getByText('No active async matches.',{exact:true}).count(),0);
   await page.screenshot({path:out+'/list-'+kind+'-'+width+'.png'});
   if(kind==='chunk-error'){badChunk=false;await page.getByRole('button',{name:'Reload',exact:true}).click();await expectList();}
   // Malformed data is visibly reported by the route boundary, never fabricated as an empty result.
  }else{
   if(kind==='fetch-error'){await page.getByRole('alert').filter({hasText:'Match list temporarily unavailable'}).waitFor();assert.equal(await page.getByText('No active async matches.',{exact:true}).count(),0);fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();}
   await expectList();await page.screenshot({path:out+'/list-'+kind+'-'+width+'.png'});
   // Warm notification navigation after the lazy module has already loaded.
   const coldReads=lazyReads;await page.getByRole('link',{name:'Lobby',exact:true}).click();await clickBell();await expectList();assert.equal(lazyReads,coldReads);
   await page.reload({waitUntil:'domcontentloaded'});await expectList();
   // A fresh browser context was used for bell entry; explicit navigation tests direct entry too.
   await page.goto(base+'/delayed',{waitUntil:'domcontentloaded'});await expectList();assert.deepEqual(errors,[]);
  }
  assert.deepEqual(mutations,[]);assert.deepEqual(external,[]);assert(lazyReads>0);
  checks.push({kind,width,lazyReads,listReads,errors,passed:true});console.log('PASS',JSON.stringify(checks.at(-1)));await context.close();
 }
 if(!baseline)writeFileSync(out+'/list-browser.json',JSON.stringify({passed:true,checks},null,2));
}catch(error){if(lastPage){await lastPage.screenshot({path:out+'/list-failure.png'}).catch(()=>{});console.log('DIAGNOSTIC',JSON.stringify({...diagnostic,url:lastPage.url(),body:(await lastPage.locator('body').innerText().catch(()=>'' )).slice(0,2200)}));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
