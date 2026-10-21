import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),base='http://127.0.0.1:5198',cases=[],errors=[];
const post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)});return r.json();};
try{for(const n of [2,3,4]){
 const f=await post('new',{players:n});assert.ok(f.id,JSON.stringify(f));
 const g=(await post('read',{table:'games',filters:{id:f.session},single:true})).data;
 const paused=await post('rpc',{user:f.user,name:'set_game_paused',args:{p_game_id:f.session,p_paused:true,p_expected_dealer_game_id:f.id,p_expected_pause_version:g.pause_version}});assert.equal(paused.error,null);
 for(let viewer=0;viewer<n;viewer++){
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
  await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+f.users[viewer],{waitUntil:'domcontentloaded'});await p.locator('.golf-local').waitFor();
  for(const [width,height] of [[320,568],[390,844],[430,932],[568,320],[844,390],[932,430],[390,664]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(100);
   const result=await p.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    const local=[...document.querySelectorAll('[data-golf-position]')].map(rect),opponents=[...document.querySelectorAll('[data-public-seat-tableau]')].map(rect),pane=document.querySelector('[data-hud-row="pane"]');
    return {local,opponents,piles:rect(document.querySelector('.golf-piles')),chips:[...document.querySelectorAll('[data-canonical-seat-chip-cell]')].map(rect),pane:{...rect(pane),scroll:pane.scrollHeight},controls:rect(document.querySelector('.golf-controls'))};
   });
   for(const r of result.local){assert.ok(r.w>=43.9&&r.h>=43.9,JSON.stringify({n,viewer,width,height,r}));assert.ok(r.x>=0&&r.x+r.w<=width+.5&&r.y>=0&&r.y+r.h<=height+.5);}
   for(const r of result.opponents)assert.ok(r.x>=0&&r.x+r.w<=width+.5&&r.y>=0&&r.y+r.h<=height+.5,JSON.stringify({n,viewer,width,height,r}));
   assert.equal(result.opponents.length,n-1);assert.equal(await p.locator('[data-canonical-felt-interaction-layer]').count(),1);
   const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1;
   const artifacts=[...result.opponents,...result.local,result.piles];
   for(let i=0;i<artifacts.length;i++)for(let j=i+1;j<artifacts.length;j++)assert.ok(!intersects(artifacts[i],artifacts[j]),JSON.stringify({n,viewer,width,height,overlap:[i,j],a:artifacts[i],b:artifacts[j]}));
   cases.push({n,viewer,width,height,...result});
   await p.screenshot({path:'qualification.local/six-card-golf/layout-'+n+'-'+viewer+'-'+width+'x'+height+'.png'});
   const anchors=await p.evaluate(()=>{
    const chips=()=>[...document.querySelectorAll('[data-canonical-seat-chip-cell]')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
    const before=chips(),boards=[...document.querySelectorAll('[data-public-seat-tableau]')];boards.forEach(e=>e.style.display='none');const after=chips();boards.forEach(e=>e.style.display='');return {before,after};
   });assert.deepEqual(anchors.after,anchors.before,'public artifacts cannot move canonical chips');
   await p.locator('[data-public-seat-tableau]').first().click();await p.locator('.golf-inspect').waitFor();
   assert.equal(await p.locator('.golf-inspect').evaluate(e=>e.children.length),6);
   if(width===568)await p.screenshot({path:'qualification.local/six-card-golf/inspect-'+n+'-'+viewer+'.png'});
   await p.keyboard.press('Escape');await p.locator('.golf-inspect').waitFor({state:'hidden'});
  }await p.close();
 }}}catch(e){console.error(e);process.exitCode=1;}finally{writeFileSync('qualification.local/six-card-golf/layout.json',JSON.stringify({cases,errors},null,2));await browser.close();}
assert.deepEqual(errors,[]);console.log('Rendered layout cases:',cases.length);
