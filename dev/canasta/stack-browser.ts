import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {chooseBotAction} from '../../src/lib/canasta/bot';
const base='http://127.0.0.1:4328';
await fetch(base+'/__canasta-fixture/reset',{method:'POST'});
let selected:any;
for(let step=0;step<400;step++){
 let snap=await fetch(base+'/__canasta-fixture/state?viewer=1').then(r=>r.json());
 const viewer=snap.state.hand.active.endsWith('000004')?2:1;
 if(viewer===2)snap=await fetch(base+'/__canasta-fixture/state?viewer=2').then(r=>r.json());
 const h=snap.state.hand;if(h.phase==='complete'){await fetch(base+'/__canasta-fixture/reset',{method:'POST'});continue;}
 const action=chooseBotAction(snap.state);assert(action);
 const command={matchId:snap.state.id,handId:h.id,turn:h.turn,generation:h.generation,revision:snap.state.revision,playerId:h.active,requestId:randomUUID(),action};
 if(action.type==='pickup'&&h.pileCount>=3){selected={viewer,snap,command};break;}
 const response=await fetch(base+'/__canasta-fixture/action?viewer='+viewer,{method:'POST',body:JSON.stringify(command)});assert(response.ok,await response.text());
}
assert(selected,'reachable whole-pile pickup');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/authority.html?viewer='+selected.viewer);await page.getByRole('button',{name:/^Arrange/}).waitFor();
 await page.evaluate(()=>{(window as any).seenStacks=[];new MutationObserver(()=>{for(const x of document.querySelectorAll('[data-card-stack-count]'))(window as any).seenStacks.push(x.textContent);}).observe(document.body,{childList:true,subtree:true});});
 const response=await page.request.post(base+'/__canasta-fixture/action?viewer='+selected.viewer,{data:selected.command});assert(response.ok(),await response.text());
 await page.waitForFunction((count:number)=>(window as any).seenStacks.includes(String(count)),selected.snap.state.hand.pileCount,{timeout:7000});
 await page.screenshot({path:'qualification.local/canasta/whole-stack.png'});
 const after=await fetch(base+'/__canasta-fixture/state?viewer='+selected.viewer).then(r=>r.json());assert.equal(after.state.hand.pileCount,0);assert.equal(after.state.hand.source,'pile');assert.deepEqual(errors,[]);
 writeFileSync('qualification.local/canasta/whole-stack.json',JSON.stringify({passed:true,count:selected.snap.state.hand.pileCount,sharedReducer:true,canonicalTransport:true,errors}));console.log('Whole-pile canonical transport passed: '+selected.snap.state.hand.pileCount+' cards');
}finally{await browser.close();}
