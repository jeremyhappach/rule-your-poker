// Explicit release verification. Existing qualification accounts; no gameplay.
// API save is an idempotent write of the already-published layout.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync as write} from 'node:fs';
import {chromium} from '@playwright/test';
import {login,origin} from '../canasta/hosted-support.mjs';
const out='qualification.local/arcade-ordering';
mkdirSync(out,{recursive:true});
const auth=await login();
const results={at:new Date().toISOString(),checks:[],layoutRevision:null,productionBrowser:false};
let browser;
const read=async c=>{
 const result=await c.client.from('arcade_lobby_layout').select('layout,revision').eq('id',true).single();
 assert.ifError(result.error);return result.data;
};
try{
 const [admin,otherSession]=auth.clients;
 const role=await admin.client.rpc('is_admin',{_user_id:admin.user});
 assert.ifError(role.error);assert.equal(role.data,true);
 const initial=await read(admin);
 assert.deepEqual(await read(otherSession),initial);
 const saved=await admin.client.from('arcade_lobby_layout').update({layout:initial.layout})
  .eq('id',true).eq('revision',initial.revision).select('layout,revision').single();
 assert.ifError(saved.error);assert.deepEqual(saved.data,initial);
 const stale=await admin.client.from('arcade_lobby_layout').update({layout:initial.layout})
  .eq('id',true).eq('revision',initial.revision+100000).select('layout,revision').maybeSingle();
 assert.ifError(stale.error);assert.equal(stale.data,null);
 const forbidden=await admin.client.from('arcade_lobby_layout').update({revision:initial.revision+1}).eq('id',true);
 assert.equal(forbidden.error?.code,'42501');
 assert.deepEqual(await read(otherSession),initial);
 results.layoutRevision=initial.revision;
 results.checks.push('real Supabase Auth/PostgREST reads from separate sessions','admin idempotent Save succeeds without changing layout or revision','stale save returns no row','forbidden revision update rejected');
 if(process.argv.includes('--production')){
  const expected=process.argv[process.argv.indexOf('--production')+1];assert.match(expected,/^[a-f0-9]{40}$/);
  const manifest=await fetch(origin+'/build-manifest.json',{cache:'no-store'}).then(r=>r.json());
  assert.equal(manifest.buildId,expected);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  for(const [index,c] of auth.clients.entries()){
   const context=await browser.newContext({viewport:{width:index===0?390:320,height:844},isMobile:true,hasTouch:true});
   await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),c.session);
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
   await page.goto(origin+'/arcade',{waitUntil:'domcontentloaded'});
   await page.getByText('Click the info icon to view game rules',{exact:true}).waitFor();
   for(const [id,label]of[['originals','P-Town Originals'],['other','Other Games']]){
    await page.getByRole('region',{name:label}).waitFor();
    const actual=await page.getByRole('region',{name:label}).locator('.arcade-banner-link').evaluateAll(links=>links.map(link=>link.getAttribute('href').split('/').pop()));
    assert.deepEqual(actual,initial.layout[id]);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.arcade-tiles').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
   assert.equal(await page.locator('.arcade-banner-link').count(),13);
   assert.equal(await page.locator('a[href="/arcade/yahtzee"]').count(),0);
   await page.locator('.arcade-banner-art').first().evaluate(img=>img.decode());
   await page.screenshot({path:out+'/production-'+(index===0?'390':'320')+'.png',fullPage:true});
   await page.getByRole('button',{name:'Horses Blitz rules and info',exact:true}).click();
   await page.getByRole('dialog').waitFor();
   await page.keyboard.press('Escape');
   await page.reload();
   await page.getByRole('region',{name:'P-Town Originals'}).waitFor();
   results.checks.push('session '+(index+1)+': published sections/order/helper, two-column mobile layout, Rules and reload');
   if(index===0){
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Profile Settings',exact:true}).click();
    await page.getByRole('tab',{name:'Admin',exact:true}).click();
    const panel=page.getByRole('region',{name:'Arcade ordering',exact:true});
    await panel.getByLabel('Run21 section',{exact:true}).selectOption('originals');
    await panel.getByRole('button',{name:'Move Run21 up',exact:true}).click();
    assert.equal(await panel.getByRole('button',{name:'Save Arcade order'}).isEnabled(),true);
    assert.deepEqual(await read(otherSession),initial,'Production draft must not change published layout');
    await panel.getByRole('button',{name:'Reload published order'}).click();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Run21 section"]')?.value==='other');
    assert.equal(await panel.getByRole('button',{name:'Save Arcade order'}).isDisabled(),true);
    await panel.getByRole('heading',{name:'Arcade ordering'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:out+'/production-admin.png'});
    results.checks.push('existing full-app Admin tab: move/reorder stages only, reload discards draft, Save gate correct');
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
  results.productionBrowser=true;results.commit=expected;results.pageErrors=errors;
 }
 write(out+'/'+(results.productionBrowser?'production':'hosted-api')+'.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await auth.close();}
