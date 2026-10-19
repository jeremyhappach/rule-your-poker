import assert from 'node:assert/strict';
export async function play({db,fixture,family,pages,dir}){
 const prefix=family.replaceAll('-','_');const initial=(await db.query('SELECT current_game_uuid d FROM public.games WHERE id=$1',[fixture.session])).rows[0].d;
 for(const p of pages)await p.evaluate(()=>{window.__moneySeen={chip:false,celebration:false};new MutationObserver(()=>{if(document.querySelector('[data-chip-transport-intent]'))window.__moneySeen.chip=true;if(document.querySelector('canvas'))window.__moneySeen.celebration=true;}).observe(document.body,{childList:true,subtree:true,attributes:true});});
 let actions=0;
 for(let step=0;step<800;step++){
  const s=(await db.query(`SELECT private.${prefix}_visible(state) s FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[initial])).rows[0].s;
  if(s.phase==='complete')break;
  if(['intro','stage_complete'].includes(s.phase)){
   await db.query(`UPDATE private.${prefix}_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)) WHERE dealer_game_id=$1`,[initial]);await db.query(`SELECT private.${prefix}_recover()`);continue;
  }
  const user=s.players[s.turnIndex].userId,index=fixture.users.indexOf(user),page=pages[index];assert.ok(index>=0);
  let click;
  if(family==='royal-flash')click=()=>page.locator('.royal-grid button').nth(s.slots.indexOf(null)).click();
  else if(family==='tri-towers'){
   if(s.phase==='playing'&&(index===1||s.removed.length>=8||s.stockRemaining===0))click=()=>page.getByRole('button',{name:'Take Score',exact:true}).click();
   else{
    const choice=(await db.query('SELECT private.tri_towers_bot_choice($1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) v',[s])).rows[0].v;
    click=choice.action==='remove'?()=>page.locator(`[data-tri-card="${choice.index}"]`).click():()=>page.getByRole('button',{name:/Draw stock/}).click();
   }
  }else{
   if(s.phase==='playing'&&(index===1||s.groups>=3||!s.canPass))click=()=>page.getByRole('button',{name:'Take Score',exact:true}).click();
   else{
    const available=[...s.exposed.map(slot=>({id:s.slots[slot],slot})),...(s.current===null?[]:[{id:s.current,slot:null}])];
    const val=id=>id<16?1:2+Math.floor((id-16)/4);
    function group(i,sum,chosen){if(sum===11&&chosen.length>1)return chosen;if(i===available.length||sum>11)return null;return group(i+1,sum+val(available[i].id),[...chosen,available[i]])??group(i+1,sum,chosen);}
    const items=index===0?group(0,0,[]):null;
    click=items?async()=>{for(const item of items)await(item.slot===null?page.locator('.eleven-draw'):page.getByRole('button',{name:new RegExp('position '+(item.slot+1)+'$')})).click();}:()=>page.getByRole('button',{name:/^Pass,/}).click();
   }
  }
  const response=page.waitForResponse(r=>{if(!r.url().endsWith('/__money/rpc'))return false;const body=r.request().postDataJSON();return body?.name===(family==='tri-towers'?'tri_towers_present_celebration':prefix+'_action')&&!!body.args?.p_request_id;},{timeout:15000});
  response.catch(()=>{});
  await click();const result=await(await response).json();assert.equal(result.error,null,JSON.stringify(result.error));actions++;
 }
 const state=(await db.query(`SELECT settlement,state->>'phase' phase FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[initial])).rows[0];assert.equal(state.phase,'complete');assert.ok(state.settlement);
 const balances=(await db.query('SELECT id,chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[fixture.session])).rows;
 assert.equal(balances.reduce((sum,p)=>sum+p.chips,0),200);
 for(let i=0;i<2;i++){
  await pages[i].waitForFunction(expected=>{const text=[...document.querySelectorAll('[data-chip-center]')].map(e=>e.textContent).join(' ');return expected.every(n=>text.includes(String(n)));},balances.map(p=>p.chips),{timeout:15000});
  await pages[i].screenshot({path:dir+family+'-settled-'+i+'.png'});
 }
 const seen=await pages[0].evaluate(()=>window.__moneySeen);
 if(balances[0].chips!==100)assert.equal(seen.chip,true,'canonical chip movement observed');
 if(family==='tri-towers')await pages[0].getByRole('button',{name:/Continue/}).click();
 // Normal automatic continuation on 11 Up/Royal Flash is permitted to finish its real presentation hold.
 await pages[0].waitForFunction(()=>document.body.innerText.includes('Waiting for caller setup')||document.body.innerText.includes('Select Game')||document.body.innerText.includes('Run Back'),null,{timeout:20000});
 const after=(await db.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[fixture.session])).rows.map(p=>p.chips);assert.deepEqual(after,balances.map(p=>p.chips));
 await pages[0].reload();assert.deepEqual((await db.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[fixture.session])).rows.map(p=>p.chips),after);
 const batch=(await db.query('SELECT id,cursor,transfers,unmatched_deltas FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[initial])).rows;assert.ok(batch.length<=1);
 return {actions,before:[100,100],after,seen,batch};
}
