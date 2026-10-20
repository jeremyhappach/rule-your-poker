import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),errors=[];
const base='http://127.0.0.1:5194',post=async(op,body)=>{const r=await fetch(base+'/__boxdrop/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/dev/boxdrop/live.html');await page.getByRole('button',{name:'Start solo Arcade'}).click();
 await page.locator('.box-bank:not([disabled])').waitFor({timeout:15000});const f=Object.fromEntries(new URL(page.url()).searchParams);
 let state=await post('state',f),value=state.view.current.value;
 await page.locator('.box-shaft').first().click();await page.waitForFunction(()=>document.querySelector('.box-shaft .box-stack').children.length===1);
 state=await post('state',f);assert.equal(state.view.scales[0].sum,value);
 for(let i=0;i<7;i++){await page.locator('.box-recycle:not([disabled])').waitFor();await page.locator('.box-recycle').click();await page.waitForTimeout(100);}
 await page.locator('.box-recycle:not([disabled])').waitFor();state=await post('state',f);assert.equal(state.view.queue.length,6);assert.equal(state.view.current.recycled,true);
 await page.reload();await page.locator('.box-bank:not([disabled])').waitFor();assert.equal(await page.locator('.box-queue .box-crate').count(),6);
 await page.screenshot({path:'qualification.local/boxdrop/live-solo.png'});
 await page.locator('.box-bank').click();await page.locator('.box-round').filter({hasText:'Round 2/2'}).waitFor({timeout:15000});
 await page.locator('.box-bank:not([disabled])').waitFor();await page.locator('.box-bank').click();await page.getByRole('heading',{name:'Boxdrop leaderboard'}).waitFor({timeout:18000});
 const m=await post('new',{solo:false}),p1=await browser.newPage({viewport:{width:390,height:844}}),p2=await browser.newPage({viewport:{width:390,height:844}}),watcher=await browser.newPage({viewport:{width:390,height:844}});
 for(const [p,user] of [[p1,m.user],[p2,m.other],[watcher,m.watcher]]){p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/dev/boxdrop/live.html?'+new URLSearchParams({...m,user}));}
 const observed=await post('state',{...m,user:m.watcher});assert.ok(!('serial' in observed)&&!('freshDraws' in observed));assert.equal(observed.canAct,false);
 for(let i=0;i<4;i++){
  await Promise.any([p1,p2].map(p=>p.locator('.box-bank:not([disabled])').waitFor({timeout:18000})));
  const active=await p1.locator('.box-bank:not([disabled])').count()?p1:p2;
  await active.locator('.box-bank').click();await active.waitForTimeout(200);
  assert.equal(await watcher.locator('.box-bank:not([disabled])').count(),0);
  if(i===0)await p1.screenshot({path:'qualification.local/boxdrop/live-multiplayer.png'});
  if(i<3)await active.waitForTimeout(9500);
 }
 await p1.getByText('Game Over',{exact:true}).waitFor({timeout:15000});
 await p1.waitForTimeout(3500);const end=await post('state',{...m,user:m.user});assert.ok(end.settlement);assert.equal(end.finished,true);
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/boxdrop/browser.json',JSON.stringify({passed:true,solo:f.id,multiplayer:m.id,errors}));console.log('PASS live SQL-backed placement, FIFO, reload, Arcade completion/leaderboard, four multiplayer turns, observer and terminal continuation');
}finally{await browser.close();}
