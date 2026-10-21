// Explicit approved two-account, fake-money hosted qualification only.
// Credentials stay in memory; evidence never includes tokens or hidden cards.
import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
assert(process.argv.includes('--run-approved-fixture'));
const f=JSON.parse(read('qualification.local/six-card-golf/hosted-live-fixture.json','utf8'));
assert.equal(f.real_money,false);
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
const e={at:new Date().toISOString(),passed:false,layouts:[]};let browser;
try{
 const login=await clients[0].auth.signInWithPassword({email:env.PTOWN_E2E_PLAYER1_EMAIL,password:env.PTOWN_E2E_PLAYER1_PASSWORD});assert(!login.error);
 const race=JSON.parse(read('dev/six-card-golf/evidence/hosted-final-race.json','utf8'));assert(race.passed);
 const zero=JSON.parse(read('qualification.local/six-card-golf/zero-client-result.json','utf8'));
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);assert(executablePath);
 browser=await chromium.launch({headless:true,executablePath});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),login.data.session);
 const page=await context.newPage(),errors=[];page.on('pageerror',x=>errors.push(x.message));
 await page.goto('https://holm357.com/game/'+race.game,{waitUntil:'domcontentloaded'});
 await page.locator('.golf-local').waitFor({timeout:30000});
 for(const [width,height]of[[390,844],[844,390],[430,932],[932,430]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(150);
  const cards=page.locator('.golf-local [data-golf-position]');assert.equal(await cards.count(),6);
  const boxes=await cards.evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}));
  assert(boxes.every(b=>b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1),'Visible six-card geometry');
  await page.screenshot({path:'qualification.local/six-card-golf/production-'+width+'x'+height+'.png'});e.layouts.push({width,height,cards:6});
 }
 await page.goto('https://holm357.com/game/'+zero.game_id,{waitUntil:'domcontentloaded'});
 await page.waitForURL('https://holm357.com/',{timeout:15000});assert.equal(await page.locator('[data-golf-position]').count(),0);
 assert.deepEqual(errors,[]);e.coldEndedRoutesToLobby=true;e.errors=errors;e.passed=true;
}catch(error){e.failure=error.message;process.exitCode=1;}
finally{if(browser)await browser.close();await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));write('qualification.local/six-card-golf/production-browser.json',JSON.stringify(e,null,2));console.log(JSON.stringify(e));}
