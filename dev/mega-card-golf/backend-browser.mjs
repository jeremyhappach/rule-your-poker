import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {tokens}=JSON.parse(readFileSync('dev/mega-card-golf/backend.local/browser-auth.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
const base='http://127.0.0.1:5188',errors=[],external=[],passed=[];
await context.addCookies([{name:'mega_backend',value:tokens[0],url:base,httpOnly:true,sameSite:'Strict'}]);
page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});
const request=async(body,token=tokens[0])=>{const response=await context.request.post(base+'/__mega',{data:body,headers:{Authorization:'Bearer '+token}});return {status:response.status(),data:await response.json()};};
const pass=s=>{passed.push(s);console.log('PASS',s);};
try{
 assert.equal((await request({op:'catalog'},'0'.repeat(64))).status,401);
 let catalog=(await request({op:'catalog'})).data;assert.equal(catalog.isAdmin,true);
 // Restore owner-approved defaults only in this synthetic local course, with a fresh board.
 const c=catalog.courses[0],{id,configId,boardId,revision,...settings}=c;
 assert.match((await request({op:'defaults',id,revision,settings,boardChoice:'retain'},tokens[1])).data.error,/admin_required/);
 await request({op:'defaults',id,revision,settings:{...settings,stockAllowance:16,holes:9,discardAllowance:5,initialExposed:2,completionSeconds:300},boardChoice:'archive'});
 pass('HTTP missing/invalid identity and non-admin mutation rejection');
 await page.goto(base+'/dev/mega-card-golf/index.html');await page.getByRole('button',{name:'Start course'}).first().click();
 let runId;
 for(let hole=1;hole<=9;hole++){
  await page.getByRole('button',{name:'Reveal selected',exact:true}).waitFor({timeout:15000});
  if(hole===1)runId=new URL(page.url()).searchParams.get('run');
  await page.getByRole('button',{name:/^Card 1 · concealed/}).click();await page.getByRole('button',{name:/^Card 6 · concealed/}).click();await page.getByRole('button',{name:'Reveal selected',exact:true}).click();
  await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();
  if(hole===1){await page.screenshot({path:'dev/mega-card-golf/evidence/backend-opening.png'});await page.reload();await page.getByRole('button',{name:'Draw a card',exact:true}).waitFor();pass('player-selected opening and authenticated reload');}
  for(const index of [2,3,4,5]){await page.getByRole('button',{name:'Draw a card',exact:true}).click();await page.getByRole('button',{name:new RegExp('^Card '+index+' · concealed')}).click();}
 }
 await page.getByText('COURSE COMPLETE',{exact:false}).waitFor({timeout:15000});
 const complete=(await request({op:'state',runId})).data;assert.equal(complete.status,'completed');assert.equal(complete.results.length,9);
 assert.equal((await request({op:'state',runId},tokens[1])).status,409);pass('full nine-hole browser completion and other-owner refusal');
 await page.screenshot({path:'dev/mega-card-golf/evidence/backend-complete.png'});
 await page.getByRole('button',{name:'Defaults',exact:true}).click();await page.getByLabel('Stock draws per hole',{exact:true}).fill('15');
 await page.getByRole('radio',{name:'Retain the current board and its scores'}).check();await page.getByRole('button',{name:'Save local defaults'}).click();
 await page.getByText('Settings saved.',{exact:false}).waitFor();catalog=(await request({op:'catalog'})).data;assert.equal(catalog.boards.find(b=>b.id==='sunny-meadows').rows.length,1);pass('browser retains board after meaningful settings change');
 await page.getByLabel('Stock draws per hole',{exact:true}).fill('14');await page.getByRole('radio',{name:'Archive this course’s board and start a fresh board'}).check();await page.getByRole('button',{name:'Save local defaults'}).click();
 await page.waitForResponse(r=>r.url().endsWith('/__mega')&&r.request().postData()?.includes('catalog'));
 catalog=(await request({op:'catalog'})).data;assert.equal(catalog.boards.find(b=>b.id==='sunny-meadows').rows.length,0);assert.ok(catalog.archives.some(a=>a.rows.some(r=>r.runId===runId)));pass('browser archives only the course and preserves completed history');
 await page.screenshot({path:'dev/mega-card-golf/evidence/backend-archive.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}finally{writeFileSync('dev/mega-card-golf/evidence/backend-browser.json',JSON.stringify({passed,errors,external},null,2));await browser.close();}
