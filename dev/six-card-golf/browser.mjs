import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),base='http://127.0.0.1:5198',errors=[];
const post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
const rpc=async(user,name,args)=>{const v=await post('rpc',{user,name,args});if(v.error)throw Error(v.error.message);return v.data;};
try{
 console.log('Browser launched');const f=await post('new',{players:2}),pages=[];console.log('Fixture admitted',f.id);
 for(const user of f.users) {
  const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({f})=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),{f});
  await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user,{waitUntil:'domcontentloaded',timeout:60000});console.log('Page loaded',user);await p.screenshot({path:'qualification.local/six-card-golf/initial.png'});
 }
 const snap=user=>rpc(user,'golf_snapshot',{p_dealer_game_id:f.id});
 for(let i=0;i<2;i++){
  const v=await snap(f.users[0]),actor=v.players[v.turnIndex],p=pages[f.users.indexOf(actor.userId)];
  await p.locator('[data-golf-position="0"]:not([disabled])').click();
  await p.locator('[data-golf-position="3"]:not([disabled])').click();
  await p.getByRole('button',{name:'Reveal selected two',exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('button[aria-label="Row 1, column 1, face down"]:not([disabled])'),null,{timeout:5000});
 }
 let v=await snap(f.users[0]);assert.equal(v.phase,'playing');
 const actor=v.players[v.turnIndex],p=pages[f.users.indexOf(actor.userId)],other=f.users.find(u=>u!==actor.userId);
 await p.locator('[data-golf-stock]:not([disabled])').click();await p.locator('[data-golf-pending]').waitFor();
 const drawn=await snap(actor.userId),concealed=await snap(other);assert.ok(drawn.pending);assert.equal(concealed.pending,null);
 await p.reload();await p.locator('[data-golf-pending]').waitFor();
 assert.equal((await snap(actor.userId)).pending.card,drawn.pending.card);
 await p.locator('[data-golf-position="1"]:not([disabled])').click();
 await p.waitForFunction(()=>!document.querySelector('[data-golf-pending]'));
 for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[390,664]]) {
  await p.setViewportSize({width,height});await p.waitForTimeout(200);
  const geometry=await p.locator('.golf-local').boundingBox();assert.ok(geometry&&geometry.width>0&&geometry.height>0);
  assert.equal(await p.locator('[data-canonical-felt-interaction-layer]').count(),1);
  assert.equal(await p.locator('[data-canonical-shell-hud-grid]').count(),1);
  await p.screenshot({path:'qualification.local/six-card-golf/table-'+width+'x'+height+'.png'});
 }
 assert.deepEqual(errors,[]);
 writeFileSync('qualification.local/six-card-golf/browser.json',JSON.stringify({passed:true,fixture:f,errors}));
 console.log('PASS canonical two-human opening, stock draw/privacy, reload, replace, five rendered viewports');
}catch(e){console.error(e);process.exitCode=1;}finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))]);process.exit(process.exitCode??0);}
