import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),base='http://127.0.0.1:5198',cases=[],errors=[];
const quick=process.argv.includes('--quick');
const post=async(op,body)=>{const r=await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)});return r.json();};
try{for(const n of quick?[2,4]:[2,3,4]){
 const f=await post('new',{players:n});assert.ok(f.id,JSON.stringify(f));
 const g=(await post('read',{table:'games',filters:{id:f.session},single:true})).data;
 const paused=await post('rpc',{user:f.user,name:'set_game_paused',args:{p_game_id:f.session,p_paused:true,p_expected_dealer_game_id:f.id,p_expected_pause_version:g.pause_version}});assert.equal(paused.error,null);
 for(let viewer=0;viewer<(quick?1:n);viewer++){
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
  await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+f.users[viewer],{waitUntil:'domcontentloaded'});await p.locator('.golf-local').waitFor();
  for(const [width,height] of quick?[[390,844],[844,390]]:[[320,568],[390,844],[430,932],[568,320],[844,390],[932,430],[390,664]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(100);
   const result=await p.evaluate(()=>{
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    const local=[...document.querySelectorAll('[data-golf-position]')].map(rect),opponents=[...document.querySelectorAll('[data-golf-public-tableau]')].map(rect),pane=document.querySelector('[data-hud-row="pane"]');
    const shapes=[...document.querySelectorAll('.golf-felt [data-playing-card-root]')].map(el=>{const r=rect(el),s=getComputedStyle(el),radius=s.borderTopLeftRadius;return {...r,face:el.hasAttribute('data-playing-card-face'),radius,clipPath:s.clipPath,radiusFraction:radius.endsWith('%')?parseFloat(radius)/100:parseFloat(radius)/r.w};});
    const seatBounds=[...document.querySelectorAll('[data-canonical-shell-gameplay-opponent-seat-layer] [data-canonical-seat-name-row],[data-canonical-shell-gameplay-opponent-seat-layer] [data-card-anchor^="opp-stack"],[data-canonical-shell-gameplay-opponent-seat-layer] [data-canonical-dealer-pip],[data-canonical-shell-gameplay-opponent-seat-layer] [data-chip-center]')].filter(e=>getComputedStyle(e).opacity!=='0').map(rect);
    return {local,opponents,shapes,seatBounds,badgeRadius:getComputedStyle(document.querySelector('[data-canonical-card-count]')).borderRadius,piles:rect(document.querySelector('.golf-piles')),pileCards:[...document.querySelectorAll('.golf-piles button')].map(rect),stock:rect(document.querySelector('[data-card-anchor="stock"]')),discard:rect(document.querySelector('[data-card-anchor="discard"]')),opponentCard:rect(document.querySelector('.golf-public-cards>span')),badge:rect(document.querySelector('[data-canonical-card-count]')),chips:[...document.querySelectorAll('[data-canonical-seat-chip-cell]')].map(rect),pane:{...rect(pane),scroll:pane.scrollHeight},grid:rect(document.querySelector('.golf-local')),felt:rect(document.querySelector('.golf-felt')),center:rect(document.querySelector('.golf-opponents')),title:rect(document.querySelector('[data-canonical-felt-plate-title]'))};
   });
   for(const r of result.seatBounds)assert.ok(r.x>=-.5&&r.x+r.w<=width+.5,JSON.stringify({n,viewer,width,height,seatClip:r}));
   for(const r of result.local){assert.ok(r.w>=43.9&&r.h>=43.9,JSON.stringify({n,viewer,width,height,r}));assert.ok(r.x>=0&&r.x+r.w<=width+.5);}
   // Short landscape panes retain full touch targets with contained scrolling;
   // no local card may escape into the felt or identity row.
   for(const card of await p.locator('[data-golf-position]').all()){
    assert.ok(await card.evaluate(e=>!!e.closest('[data-hud-row="pane"]')));
    await card.scrollIntoViewIfNeeded();const r=await card.boundingBox();
    assert.ok(r&&r.y>=result.pane.y-.5&&r.y+r.height<=result.pane.y+result.pane.h+.5,JSON.stringify({n,viewer,width,height,r,pane:result.pane}));
    const hit=await card.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {inside:e.contains(hit),target:hit?.outerHTML.slice(0,200),rect:{x:r.x,y:r.y,w:r.width,h:r.height}};});
    assert.ok(hit.inside,JSON.stringify({n,viewer,width,height,hit}));
   }
   for(const r of result.opponents)assert.ok(r.x>=0&&r.x+r.w<=width+.5&&r.y>=0&&r.y+r.h<=height+.5,JSON.stringify({n,viewer,width,height,r}));
   assert.ok(result.opponents.length<=1);assert.equal(await p.locator('[data-canonical-felt-interaction-layer]').count(),1);
   assert.equal(await p.locator('[data-public-seat-tableau]').count(),0,'seat clusters must not contain Golf grids');
   assert.ok(Math.abs(result.grid.x+result.grid.w/2-result.pane.x-result.pane.w/2)<1,'MY grid horizontally centered');

   if(result.felt.h>160)assert.ok(Math.abs(result.piles.x+result.piles.w/2-result.felt.x-result.felt.w/2)<1,'piles centered on felt');
   if(result.felt.h>160)assert.ok(Math.abs(result.center.x+result.center.w/2-result.felt.x-result.felt.w/2)<1,'opponent group centered on felt');
   for(const r of result.opponents)assert.ok(result.felt.h<=160?r.x+r.w<=result.piles.x:r.y+r.h<=result.piles.y+.5,'separate tableau and piles');
   for(const r of result.opponents)assert.ok(r.y>=result.title.y+result.title.h-.5,JSON.stringify({n,viewer,width,height,opponent:r,title:result.title,felt:result.felt,center:result.center}));
   assert.ok(result.discard.x<result.stock.x,'discard left, stock right');
   assert.ok(Math.abs(result.stock.x-result.discard.x-result.discard.w-8)<.5,'visible piles 8px apart');
   if(result.opponentCard)assert.ok(result.opponentCard.w>result.stock.w*1.23&&result.opponentCard.w<result.stock.w*1.27,JSON.stringify({n,width,height,opponent:result.opponentCard,stock:result.stock}));
   assert.equal(result.shapes.length,6*result.opponents.length+2);
   for(const shape of result.shapes){assert.ok(shape.radiusFraction<=.101,JSON.stringify({n,width,height,shape}));assert.equal(shape.clipPath,'none');assert.ok(Math.abs(shape.h/shape.w-1.4)<.04);}
   assert.equal(result.badgeRadius,'50%','only the count badge retains a circular radius');
   assert.ok(result.badge.x<result.stock.x&&result.badge.y<result.stock.y,'count attached to stock upper-left');
   assert.equal(await p.locator('[data-golf-stock]').innerText(),String(52-6*n-1),'stock has count only, no visible Stock word');
   const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1;
   for(const r of result.pileCards)assert.ok(r.w>=43.9&&r.h>=43.9&&r.x>=0&&r.x+r.w<=width+.5&&r.y>=0&&r.y+r.h<=height+.5);
   const artifacts=[...result.opponents,...result.local,...result.pileCards];
   for(let i=0;i<artifacts.length;i++)for(let j=i+1;j<artifacts.length;j++)assert.ok(!intersects(artifacts[i],artifacts[j]),JSON.stringify({n,viewer,width,height,overlap:[i,j],a:artifacts[i],b:artifacts[j]}));
   cases.push({n,viewer,width,height,...result});
   await p.screenshot({path:'qualification.local/six-card-golf/layout-'+n+'-'+viewer+'-'+width+'x'+height+'.png'});
   const anchors=await p.evaluate(()=>{
    const chips=()=>[...document.querySelectorAll('[data-canonical-seat-chip-cell]')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
    const before=chips(),boards=[...document.querySelectorAll('[data-golf-public-tableau]')];boards.forEach(e=>e.style.display='none');const after=chips();boards.forEach(e=>e.style.display='');return {before,after};
   });assert.deepEqual(anchors.after,anchors.before,'public artifacts cannot move canonical chips');
   if(result.opponents.length){await p.locator('[data-golf-public-tableau]').first().click();await p.locator('.golf-inspect').waitFor();
   assert.equal(await p.locator('.golf-inspect').evaluate(e=>e.children.length),6);
   if(width===568)await p.screenshot({path:'qualification.local/six-card-golf/inspect-'+n+'-'+viewer+'.png'});
   await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await p.locator('.golf-inspect').waitFor({state:'detached'});
   await p.waitForFunction(()=>getComputedStyle(document.body).pointerEvents!=='none'&&!document.querySelector('[role="dialog"]'));}
  }await p.close();
 }}}catch(e){console.error(e);process.exitCode=1;}finally{writeFileSync('qualification.local/six-card-golf/layout.json',JSON.stringify({cases,errors},null,2));await browser.close();}
assert.deepEqual(errors,[]);console.log('Rendered layout cases:',cases.length);
