import {createRequire}from'node:module';import{createServer}from'node:http';import{resolve,extname}from'node:path';import{readFileSync,existsSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const require=createRequire('C:/Users/jerem/source/repos/rule-your-poker/node_modules/package.json'),{chromium}=require('@playwright/test');
const base='http://127.0.0.1:15414',root=resolve('qualification.local/web-push/app'),out='qualification.local/web-push';
const server=createServer((req,res)=>{const pathname=new URL(req.url,base).pathname;let file=resolve(root,'.'+pathname);if(!file.startsWith(root))return res.end();if(pathname==='/mock')file=resolve(out,'index.html');else if(pathname==='/preview.js')file=resolve(out,'preview.js');else if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(15414,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',match='11111111-1111-4111-8111-111111111111';let page;
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844}}),errors=[],external=[],prefs=new Map(),rpcCalls=[];
  let denied=false,removed=false,tableAvailable=true,settings={asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'};
  await context.routeWebSocket('**',ws=>ws.close());
  await context.addInitScript(()=>{
   const attempted=()=>{sessionStorage.setItem('unexpected-push-device-call','true');throw Error('Enrollment must stay disabled during settings smoke');};
   if('Notification'in window)Notification.requestPermission=attempted;
   if('serviceWorker'in navigator)navigator.serviceWorker.register=attempted;
   if('PushManager'in window)PushManager.prototype.subscribe=attempted;
  });
  const user={id:a,aud:'authenticated',role:'authenticated',email:'push-fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:a,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token})=>{if(!localStorage.getItem('fixture-signed-out'))localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{user,token});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(url.origin);return route.abort();}
   const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}),path=url.pathname;
   if(path.endsWith('/auth/v1/logout'))return route.fulfill({status:204,body:''});
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),args=req.postDataJSON();
    rpcCalls.push(name);
    if(name==='notification_preferences'){settings={...settings,...args?.p_patch};return send(settings);}
    if(name==='notification_table')return send(tableAvailable?{sessionId:args.p_session,realMoney:true}:null);
    if(name==='async_push_preference'){const key=args.p_match??'default';if(args.p_enabled!==undefined)prefs.set(key,args.p_enabled);return send(prefs.get(key)??false);}
    if(name==='delayed_home'){
     if(denied)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'delayed:match_denied',code:'42501'})});
     return send({id:match,status:'active',revision:1,realMoney:false,offerHash:'local',organizer:a,opponent:b,players:[{id:a,name:'Alex'},{id:b,name:'Blair'}],createdAt:new Date().toISOString(),invitationExpiresAt:new Date(Date.now()+86400000).toISOString(),acceptedAt:new Date().toISOString(),held:false,completed:0,net:0,unsettled:1,exposure:1,receipt:null,serverAt:Date.now(),removedAt:removed?new Date().toISOString():null,lineup:[]});
    }
    if(name==='platform_notification_center')return send({actionable:0,items:[]});if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
    if(name==='async_push_subscribe')throw Error('Browser proof must not create real subscriptions');return send([]);
   }
   if(path.startsWith('/rest/v1/')){const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object'),value=table==='profiles'?{id:a,username:'Alex',is_active:true,is_superuser:false}:null;return send(req.method()==='GET'?(single?value:table==='profiles'?[value]:[]):null);}
   return route.continue();
  });
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(base+'/delayed/'+match,{waitUntil:'domcontentloaded'});
  await page.getByText('Phone alerts are not active yet.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Enable on this device',exact:true}).count(),0);
  const checkbox=page.getByRole('checkbox',{name:'Enable push notifications for this match',exact:true});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);await checkbox.click();
  await page.waitForFunction(()=>document.querySelector('input[type=checkbox]')?.checked&&!document.querySelector('input[type=checkbox]').disabled);await page.reload();await checkbox.waitFor();await page.waitForFunction(()=>document.querySelector('input[type=checkbox]')?.checked);assert.equal(await checkbox.isChecked(),true);
  assert.equal(await page.locator('.delayed-bell').count(),0);
  await page.screenshot({path:out+'/match-'+width+'.png',fullPage:true});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.getByTitle('Profile Settings').click();
  await page.getByText('Phone alerts are not active yet.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Enable on this device',exact:true}).count(),0);
  const global=page.getByRole('checkbox',{name:'Enable push notifications by default for new async matches',exact:true});await global.waitFor();assert.equal(await global.isChecked(),false);await global.click();await page.getByText('Preferences saved.',{exact:true}).waitFor();assert.equal(settings.asyncDefault,true);assert.equal(prefs.get(match),true);
  const newTable=page.getByRole('checkbox',{name:'Notify me when a new real-money table opens',exact:true});assert.equal(await newTable.isChecked(),false);await newTable.click();await page.waitForFunction(()=>[...document.querySelectorAll('input[type=checkbox]')].filter(x=>x.checked).length>=2);assert.equal(settings.newTable,true);
  await page.getByLabel('Enable quiet hours',{exact:true}).check();await page.getByLabel('Start',{exact:true}).fill('22:00');await page.getByLabel('End',{exact:true}).fill('07:00');await page.getByLabel('Time zone (IANA)',{exact:true}).fill('America/Chicago');await page.getByRole('button',{name:'Save quiet hours',exact:true}).click();await page.getByText('Preferences saved.',{exact:true}).waitFor();assert.equal(settings.quietEnabled,true);assert.equal(settings.quietZone,'America/Chicago');
  await page.getByRole('heading',{name:'Notifications',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/settings-'+width+'.png',fullPage:true});
  await page.getByLabel('Start',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/quiet-hours-'+width+'.png',fullPage:true});
  await page.goto(base+'/delayed/'+match);await page.getByText(/Quiet hours: 22:00–07:00 \(America\/Chicago\)/).waitFor();assert.equal(await checkbox.isChecked(),true);await page.screenshot({path:out+'/match-'+width+'.png',fullPage:true});
  await page.goto(base+'/notifications/table/'+match);await page.getByRole('heading',{name:'This is a Real Money Game!'}).waitFor();tableAvailable=false;await page.getByRole('button',{name:'I Acknowledge',exact:true}).click();await page.getByText(/This table is no longer available to join/).waitFor();assert(!page.url().includes('/game/'));
  tableAvailable=true;await page.reload();await page.getByRole('button',{name:'I Acknowledge',exact:true}).click();await page.waitForURL('**/game/'+match);assert(!rpcCalls.includes('session_take_seat'));
  denied=true;await page.goto(base+'/delayed/'+match);await page.getByRole('alert').filter({hasText:'delayed:match_denied'}).waitFor();assert.equal(await checkbox.count(),0);
  denied=false;removed=true;await page.reload();await page.getByRole('heading',{name:'Match deleted'}).waitFor();assert.equal(await checkbox.count(),0);
  await page.goto(base+'/');await page.evaluate(()=>localStorage.setItem('fixture-signed-out','yes'));await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/auth');
  await page.goto(base+'/delayed/'+match);await page.waitForURL('**/auth');assert.equal(await checkbox.count(),0);
  await page.goto(base+'/notifications/table/'+match);await page.waitForURL('**/auth');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('unexpected-push-device-call')),null);
  assert(!rpcCalls.includes('async_push_subscribe'));assert(!rpcCalls.includes('async_push_device'));
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push({width,actualApp:true,enrollmentFlagFalse:true,noDevicePermissionRegistrationOrSubscription:true,matchPersistence:true,globalIndependent:true,quietHoursSavedAndDisplayed:true,newTableDefaultOff:true,tableWarningAndFreshRecheck:true,noSeatMutation:true,authorizedDeepLink:true,bellPreserved:true,logoutAndUnauthenticatedDeepLink:true});await context.close();
 }
 const mock=await browser.newContext({viewport:{width:390,height:844}});await mock.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());page=await mock.newPage();
 await page.goto(base+'/mock');await page.getByText('LOCAL MOCK', {exact:false}).waitFor();
 const global=page.getByRole('checkbox',{name:'Enable push notifications by default for new async matches',exact:true}),matchBox=page.getByRole('checkbox',{name:'Enable push notifications for this match',exact:true});
 await global.click();await page.waitForFunction(()=>document.querySelectorAll('input')[0].checked);assert.equal(await matchBox.isChecked(),false);
 await page.getByRole('button',{name:'Create mock match from defaults'}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Match push notifications"] input').checked);
 await matchBox.click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Match push notifications"] input').checked);await page.reload();await matchBox.waitFor();assert.equal(await matchBox.isChecked(),false);
 await page.getByLabel('Viewer',{exact:true}).selectOption('blair');assert.equal(await matchBox.isChecked(),false);assert.equal(await global.isChecked(),false);
 await page.getByLabel('Viewer',{exact:true}).selectOption('alex');await page.waitForFunction(()=>document.querySelectorAll('input')[0].checked);
 for(const [mode,text]of [['denied','Notifications are blocked.'],['revoked','Notification permission was removed.'],['unsupported','Push notifications are not supported'],['iphone-tab','On iPhone or iPad, add Ptown']]){
  await page.getByLabel('Device simulation',{exact:true}).selectOption(mode);await page.getByRole('status').filter({hasText:text}).first().waitFor();
  if(mode!=='revoked')assert.equal(await page.getByRole('button',{name:'Enable on this device',exact:true}).count(),0);
 }
 await page.getByLabel('Device simulation',{exact:true}).selectOption('supported');await page.getByRole('button',{name:'Enable on this device',exact:true}).first().click();await page.getByRole('status').filter({hasText:'This device is enabled.'}).first().waitFor();
 await page.screenshot({path:out+'/mock-permissions-390.png',fullPage:true});checks.push({mockPermissionScenarios:5,newMatchSeed:true,existingOverride:true,perViewer:true,reload:true,realPermissionPrompt:false});await mock.close();
 writeFileSync(out+'/browser-proof.json',JSON.stringify({passed:true,checks,realPermissionOrDelivery:false},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){if(page)await page.screenshot({path:out+'/browser-failure.png',fullPage:true}).catch(()=>{});console.log('BROWSER FAILURE',e.message,await page?.locator('body').innerText().catch(()=>''));throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));}
