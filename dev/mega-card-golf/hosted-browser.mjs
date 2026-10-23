import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {login,origin} from '../canasta/hosted-support.mjs';
const fixture=JSON.parse(readFileSync('dev/mega-card-golf/backend.local/hosted-fixture.json','utf8'));
const auth=await login(),actor=auth.byUser[fixture.user],other=auth.clients.find(c=>c.user!==fixture.user),passed=[],errors=[];
assert(actor&&other);let browser;
async function api(body,person=actor){const response=await fetch(origin+'/api/arcade',{method:'POST',headers:{Authorization:'Bearer '+person.token,'Content-Type':'application/json'},body:JSON.stringify({game:'mega-card-golf',...body})});return {status:response.status,body:await response.json()};}
const pass=label=>{passed.push(label);console.log('PASS '+label);};
try{
 let r=await api({op:'catalog'});assert.equal(r.status,200);assert.equal(r.body.admission,false);assert.deepEqual(r.body.courses.map(c=>[c.holes,c.stockAllowance,c.discardAllowance,c.initialExposed,c.completionSeconds]),[[9,16,5,2,300],[9,12,3,2,300],[9,8,1,2,300]]);
 assert.equal((await api({op:'start',courseId:'sunny-meadows',requestId:randomUUID()},other)).status,409);
 assert.equal((await api({op:'state',runId:fixture.run},other)).status,409);
 assert.equal((await api({op:'catalog'},{token:'invalid'})).status,401);
 const anon=await fetch(origin+'/api/arcade',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"op":"catalog","game":"mega-card-golf"}'});assert.equal(anon.status,401);
 const denied=await actor.client.rpc('arcade_mega_commit',{p_actor:actor.user,p_run:fixture.run,p_revision:0,p_state:{score:-999}});assert(denied.error);
 pass('real Supabase authentication, closed admission, other-owner refusal and direct RPC denial');
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(session=>localStorage.setItem('sb-xvhmbuppghwmwpwrkzao-auth-token',JSON.stringify(session)),actor.session);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/arcade/mega-card-golf?run='+fixture.run);
 await page.getByRole('button',{name:'Reveal selected',exact:true}).waitFor({timeout:30000});
 const peer=await context.newPage();await peer.goto(origin+'/arcade/mega-card-golf?run='+fixture.run);await peer.getByRole('button',{name:'Reveal selected',exact:true}).waitFor({timeout:30000});
 for(let hole=1;hole<=9;hole++){
  await page.getByRole('button',{name:'Reveal selected',exact:true}).waitFor({timeout:15000});
  await page.getByRole('button',{name:/^Card 1 · concealed/}).click();await page.getByRole('button',{name:/^Card 6 · concealed/}).click();await page.getByRole('button',{name:'Reveal selected',exact:true}).click();await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();
  if(hole===1){await peer.getByRole('button',{name:'Draw a card',exact:true}).waitFor({timeout:15000});pass('second browser tab receives the opening through hosted Realtime');await peer.close();await page.reload();await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();pass('authenticated reload restores private projection and progress');await page.screenshot({path:'dev/mega-card-golf/evidence/production-opening.png'});}
  for(const index of [2,3,4,5]){await page.getByRole('button',{name:'Draw a card',exact:true}).click();await page.getByRole('button',{name:new RegExp('^Card '+index+' · concealed')}).click();}
 }
 await page.getByText('COURSE COMPLETE',{exact:false}).waitFor({timeout:15000});r=await api({op:'state',runId:fixture.run});assert.equal(r.body.status,'completed');assert.equal(r.body.results.length,9);assert.equal(r.body.score,r.body.results.reduce((sum,x)=>sum+x.score,0));
 const board=(await api({op:'leaderboard',courseId:'sunny-meadows',window:'all'})).body;assert(board.rows.some(x=>x.runId===fixture.run&&x.score===r.body.score));
 await page.getByLabel('Leaderboard period').selectOption('all');await page.screenshot({path:'dev/mega-card-golf/evidence/production-complete.png'});pass('nine-hole production API/browser completion and authoritative per-course result');
 await page.reload();await page.getByRole('heading',{name:'Little cards.',exact:false}).waitFor({timeout:15000}).catch(()=>{});
 assert.deepEqual(errors,[]);pass('no browser runtime errors');
}finally{writeFileSync('dev/mega-card-golf/evidence/hosted-browser.json',JSON.stringify({run:fixture.run,account:fixture.user,passed,errors},null,2));await browser?.close();await auth.close();}
