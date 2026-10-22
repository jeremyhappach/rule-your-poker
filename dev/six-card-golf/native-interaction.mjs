// Real approved-account Auth; Golf requests execute only in isolated local authority.
// Credentials stay in memory; evidence never includes tokens or hidden cards.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
assert(process.argv.includes('--run-approved-fixture'));
const env=Object.fromEntries(read('C:/Users/jerem/source/repos/rule-your-poker/.env.e2e.local','utf8').split(/\r?\n/).filter(l=>/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')]}));
const html=await fetch('https://holm357.com').then(r=>r.text());
const script=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(script);
const scriptUrl=new URL(script,'https://holm357.com');assert.equal(scriptUrl.origin,'https://holm357.com');
const bundle=await fetch(scriptUrl).then(r=>r.text());
const url=(bundle.match(/https:\/\/[a-z0-9]+\.supabase\.co/g)||[]).find(u=>new URL(u).hostname==='xvhmbuppghwmwpwrkzao.supabase.co');
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});
assert(url&&key);
const clients=[0,1].map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {chromium}=await import('@playwright/test');
const e={at:new Date().toISOString(),passed:false,errors:[],authenticatedUsers:[],actions:[]},base='http://127.0.0.1:5201';let browser;
const post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)});return r.json();};
try{
 const sessions=[];
 for(let i=1;i<=2;i++){const r=await clients[i-1].auth.signInWithPassword({email:env['PTOWN_E2E_PLAYER'+i+'_EMAIL'],password:env['PTOWN_E2E_PLAYER'+i+'_PASSWORD']});assert(!r.error);sessions.push(r.data.session);}
 assert.deepEqual(sessions.map(x=>x.user.id).sort(),['d7dc1928-3727-4351-b0ff-0e80c81c2953','fb835d1f-db2f-4de4-84e2-ce0074512e46'].sort());
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
 browser=await chromium.launch({headless:true,executablePath});const pages=new Map(),verified=new Map();
 for(const session of sessions){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(s=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(s)),session);
  await context.route('**/rest/v1/rpc/golf_*',async route=>{
   const req=route.request(),token=req.headers().authorization?.replace(/^Bearer /,'');assert(token);
   let user=verified.get(token);if(!user){const r=await anonymous.auth.getUser(token);assert(!r.error);user=r.data.user.id;assert(sessions.some(s=>s.user.id===user));verified.set(token,user);e.authenticatedUsers.push(user);}
   const name=new URL(req.url()).pathname.split('/').at(-1);assert(['golf_snapshot','golf_action','golf_history'].includes(name),'No production gameplay RPC permitted');
   const r=await post('rpc',{user,name,args:req.postDataJSON()});
   if(name==='golf_action')e.actions.push({user,action:req.postDataJSON().p_action,status:r.status});
   await route.fulfill({status:r.status,contentType:'application/json',body:JSON.stringify(r.error??r.data)});
  });
  // Only Golf RPCs are routed to the isolated database. Production tables are read-only.
  await context.route('**/rest/v1/**',async route=>{const req=route.request();if(new URL(req.url()).pathname.includes('/rpc/golf_'))return route.fallback();assert.equal(req.method(),'GET','Production data writes forbidden');await route.continue();});
  const page=await context.newPage();pages.set(session.user.id,page);page.on('pageerror',x=>e.errors.push(x.message));await page.goto(base+'/dev/six-card-golf/live.html',{waitUntil:'domcontentloaded'});
 }
 const fixture=await post('new',{players:2});assert(fixture.id);const snap=async user=>{const r=await post('rpc',{user,name:'golf_snapshot',args:{p_dealer_game_id:fixture.id}});assert.equal(r.error,null);return r.data;};
 for(const [user,page]of pages){await page.evaluate(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),fixture);await page.goto(base+'/dev/six-card-golf/live.html?id='+fixture.id+'&user='+user);await page.locator('.golf-local').waitFor();}
 for(let i=0;i<2;i++){const v=await snap(fixture.users[0]),actor=v.players[v.turnIndex],p=pages.get(actor.userId);await p.reload();await p.locator('[data-golf-position="0"]:not([disabled])').tap();assert.equal(await p.locator('.golf-selection').count(),1);await p.locator('[data-golf-position="3"]').tap();await p.waitForFunction(()=>document.querySelector('[data-golf-position="0"]').getAttribute('aria-label').includes('face down')===false);}
 let v=await snap(fixture.users[0]);assert.equal(v.phase,'playing');let actor=v.players[v.turnIndex],p=pages.get(actor.userId);await p.reload();
 await p.locator('[data-golf-stock]:not([disabled])').tap();await p.locator('[data-golf-pending]').waitFor();const pending=(await snap(actor.userId)).pending;assert(pending);assert.equal((await snap(fixture.users.find(x=>x!==actor.userId))).pending,null);
 await p.reload();await p.locator('[data-golf-pending]').waitFor();assert.deepEqual((await snap(actor.userId)).pending,pending);await p.locator('[data-golf-position="1"]').tap();await p.locator('[data-golf-pending]').waitFor({state:'hidden'});
 v=await snap(fixture.users[0]);actor=v.players[v.turnIndex];p=pages.get(actor.userId);await p.reload();await p.locator('[data-golf-discard]:not([disabled])').tap();await p.locator('[data-golf-position="2"]').tap();await p.waitForFunction(()=>document.querySelector('[data-golf-discard]').disabled);assert.equal((await snap(actor.userId)).tableaus[actor.id].exposed[2],true);
 assert.deepEqual(e.actions.map(x=>x.action),['open','open','draw','replace','discard']);assert(e.actions.every(x=>x.status===200));assert.equal(e.authenticatedUsers.length,2);assert.deepEqual(e.errors,[]);e.passed=true;e.authority='Isolated local PostgreSQL authenticated role, real Auth-validated JWTs; no production gameplay writes';
}catch(error){e.failure=error.stack;process.exitCode=1;}finally{if(browser)await browser.close();await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));write('qualification.local/six-card-golf/native-interaction.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
