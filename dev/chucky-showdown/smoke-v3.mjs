import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function smokeV2({page,actor,c,origin,out,errors,act,phase,button}){
 const bonuses=[100,250,500,800,1250,2000,3000],samples=[],sounds=()=>page.evaluate(()=>window.audioEvents);
 const wins=ids=>ids.filter(id=>/^palette:chucky(Win|Six|Seven):/.test(id));
 const level=(n,left=2)=>'Level '+n+', '+bonuses[n-1]+' points, '+left+' uses remaining';
 await page.goto(origin+'/arcade/chucky-showdown');
 await button('Play').click();await phase('fold_stay').waitFor();
 for(const [width,height] of [[320,568],[390,844],[844,390]]){
  await page.setViewportSize({width,height});
  const box=await button('Abandon run').boundingBox(),header=await page.locator('.cs-header').boundingBox();
  assert.ok(Math.abs(box.y-header.y)<4&&Math.abs(box.x+box.width-header.x-header.width)<3,JSON.stringify({box,header}));
  await button('Abandon run').click();await page.getByRole('alertdialog').getByRole('button',{name:'Keep playing',exact:true}).click();
  await page.getByRole('alertdialog').waitFor({state:'hidden'});
  assert.equal((await c.query("select count(*)::int n from private.arcade_runs where user_id=$1 and status='active'",[actor])).rows[0].n,1);
  samples.push({width,height,box});await page.screenshot({path:out+'/v3-header-'+width+'.png'});
 }
 await page.setViewportSize({width:390,height:844});
 let risk=0;
 for(const n of [1,6,7]){
  await phase('fold_stay').waitFor();await act('STAY (Choose Chucky level after reveal)');await phase('choose').waitFor();
  if(n===1)for(let i=1;i<=7;i++)await button(level(i)).waitFor();
  const before=wins(await sounds()).length;
  await act(level(n));await phase('win').waitFor();
  await page.waitForFunction(expected=>window.audioEvents.filter(id=>/^palette:chucky(Win|Six|Seven):/.test(id)).length===expected,before+1);
  const played=wins(await sounds());assert.equal(played.length,before+1);assert.ok(played.at(-1).startsWith('palette:'+({1:'chuckyWin',6:'chuckySix',7:'chuckySeven'}[n])+':'));
  risk+=bonuses[n-1];
  assert.equal((await c.query("select (state->>'risk')::int n from private.arcade_runs where user_id=$1 and status='active'",[actor])).rows[0].n,risk);
  await page.getByText('+'+bonuses[n-1].toLocaleString()+' points',{exact:true}).waitFor();
 }
 // Hold this fixture's authoritative result across the full document reload.
 await c.query("update private.arcade_runs set state=jsonb_set(state,'{due}',to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint+4000)) where user_id=$1 and status='active'",[actor]);
 await page.reload();await phase('win').waitFor();assert.deepEqual(wins(await sounds()),[],'restored win is silent');
 await page.getByRole('heading',{name:'Chucky Showdown',exact:true}).click();
 await phase('fold_stay').waitFor();
 await act('FOLD (3 remaining)');await phase('fold').waitFor();
 await page.locator('[data-folding=true]').waitFor();await page.screenshot({path:out+'/v3-fold.png'});
 await phase('fold_stay').waitFor();assert.equal((await sounds()).filter(id=>id.startsWith('palette:chuckyFold:')).length,1);
 await page.reload();await phase('fold_stay').waitFor();assert.equal((await sounds()).filter(id=>id.startsWith('palette:chuckyFold:')).length,0);
 await button('Mute sounds').click();const muted=(await sounds()).length;
 await act('FOLD (2 remaining)');await phase('fold_stay').waitFor();
 await act('STAY (Choose Chucky level after reveal)');await phase('choose').waitFor();await act(level(6,1));await phase('win').waitFor();
 assert.equal((await sounds()).length,muted,'mute suppresses fold and special win');
 await button('Unmute sounds').click();assert.equal((await sounds()).length,muted,'unmute does not replay result');
 await button('Abandon run').click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon run',exact:true}).click();
 await page.getByRole('button',{name:'Play',exact:true}).waitFor();
 const rows=(await c.query("select status,(select count(*)::int from private.arcade_results where user_id=$1) results from private.arcade_runs where user_id=$1",[actor])).rows;
 assert.deepEqual(rows,[{status:'abandoned',results:0}]);assert.deepEqual(errors,[]);
 writeFileSync(out+'/v3-result.json',JSON.stringify({bonuses,samples,rows},null,2));
 console.log('PASS v3 mobile cancel/abandon, all bonuses, standard/6/7 cues, fold sweep once, lost acknowledgement, mute and silent reload.');
}
