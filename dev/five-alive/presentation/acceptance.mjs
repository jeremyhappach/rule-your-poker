import assert from 'node:assert/strict';

// Run before navigation. Observe actual committed DOM, score changes and flight.
export function observeAwards(){
 window.fiveAliveAwards=[];
 let active=null;
 const observe=()=>{
  const element=document.querySelector('.five-alive-award:has(.five-alive-award-calculation)'),now=performance.now();
  if(element&&!active){active={shownAt:now,score:document.querySelector('.five-alive-score strong')?.textContent,calculation:element.querySelector('.five-alive-award-calculation')?.textContent,firstCountAt:null,firstFlightAt:null};window.fiveAliveAwards.push(active);}
  if(active){
   if(!active.firstCountAt&&document.querySelector('.five-alive-score strong')?.textContent!==active.score)active.firstCountAt=now;
   const total=element?.querySelector('.five-alive-award-total');
   if(total&&!active.firstFlightAt){const transform=getComputedStyle(total).transform;if(transform!=='none'&&transform!=='matrix(1, 0, 0, 1, 0, 0)')active.firstFlightAt=now;}
   if(!element){active.removedAt=now;active=null;}
  }
 };
 new MutationObserver(observe).observe(document,{subtree:true,childList:true,characterData:true});
 const frame=()=>{observe();requestAnimationFrame(frame);};requestAnimationFrame(frame);
}

export async function assertAwards(page,{reduced=false}={}){
 const events=await page.evaluate(()=>window.fiveAliveAwards);
 assert.ok(events.length>0,'at least one solved award observed');
 for(const event of events){
  assert.match(event.calculation,/\d[\d,]* base × [01]\.\d · /);
  assert.ok(event.firstCountAt-event.shownAt>=5000,JSON.stringify(event));
  assert.ok(event.removedAt-event.shownAt>=5000,JSON.stringify(event));
  if(!reduced)assert.ok(event.firstFlightAt-event.shownAt>=5000,JSON.stringify(event));
 }
 return events;
}

export async function assertPhoneLayout(page){
 const geometry=await page.evaluate(()=>{
  const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  return {grid:rect('.five-alive-grid'),keyboard:rect('.five-alive-keyboard'),body:rect('.five-alive-body'),shell:rect('[data-shell-presentation-mode="fullscreen"]'),keys:[...document.querySelectorAll('.five-alive-keyboard button')].map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}),safeBottom:parseFloat(getComputedStyle(document.querySelector('[data-shell-presentation-mode="fullscreen"]')).paddingBottom)};
 });
 const gap=geometry.keyboard.y-geometry.grid.bottom;
 assert.ok(gap>=0&&gap<=8,`keyboard gap ${gap}`);
 assert.ok(geometry.keys.every(key=>key.height>=40&&key.width>=24),'preserve 40px-high keys and usable widths');
 assert.ok(geometry.keyboard.bottom<=geometry.shell.bottom-geometry.safeBottom-7,'keyboard respects shell safe area and body padding');
 assert.ok(geometry.keyboard.bottom<=(await page.evaluate(()=>innerHeight))-geometry.safeBottom,'keyboard stays within phone screen');
 return {...geometry,gap};
}
// Dismissal is a smoke precondition, not an assumption about an Escape key event.
// Waiting for the actual panel to leave also prevents a queued review being
// mistaken for a delivery failure while the user is still reading results.
export async function closeWordResults(page){
 const dialog=page.getByRole('dialog',{name:'Word Results',exact:true});
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
}
