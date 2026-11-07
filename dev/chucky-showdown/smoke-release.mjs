import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function smokeV2({page,actor,c,origin,out,errors,act,phase,button}){
 const bonus=[100,250,500,800,1250,2000,3000],sounds=()=>page.evaluate(()=>window.audioEvents);
 const level=(n,left=2)=>'Level '+n+', '+bonus[n-1]+' points, '+left+' uses remaining';
 const challenge=async(n,left=2)=>{await phase('fold_stay').waitFor();await act('STAY (Choose Chucky level after reveal)');await phase('choose').waitFor();await act(level(n,left));};
 const fold=async(n)=>{await phase('fold_stay').waitFor();await act(n===1?'FOLD (Bank Total)':'FOLD ('+n+' remaining)');};
 await page.goto(origin+'/arcade/chucky-showdown');await button('Play').click();
 for(const n of [1,6,7]){await challenge(n);await phase('win').waitFor();await page.waitForFunction(()=>window.audioEvents.some(id=>id.includes(':win:')&&id.endsWith(':count')));}
 assert.equal((await sounds()).filter(id=>/^palette:chucky(Win|Six|Seven):/.test(id)).length,0);
 for(const n of [3,2,1])await fold(n);
 await phase('round_over').waitFor();await page.waitForFunction(()=>window.audioEvents.some(id=>id.includes(':round_over:')&&id.endsWith(':count')));
 // One win supplies a positive at-risk score, followed by three real crack outcomes.
 await challenge(1);await phase('win').waitFor();await c.query("select set_config('app.showdown_cards','crack',true)");
 for(const [n,left] of [[1,1],[2,2],[2,1]]){await challenge(n,left);await phase('crack').waitFor();}
 await phase('round_over').waitFor();await page.waitForFunction(()=>window.audioEvents.filter(id=>id.startsWith('chucky-round-bust:')).length===1);
 const events=await sounds();assert.equal(events.filter(id=>id.startsWith('palette:cracked:')).length,3);
 assert.ok(events.some(id=>id.includes(':crack:')&&id.endsWith(':count')));
 assert.equal(events.filter(id=>id.startsWith('chucky-shatter:')).length,0);
 await c.query("select set_config('app.showdown_cards','win',true)");
 await phase('fold_stay').waitFor();await page.reload();await phase('fold_stay').waitFor();
 assert.equal((await sounds()).filter(id=>id.startsWith('chucky-round-bust:')).length,0,'reload does not replay a bust');
 await page.getByRole('heading',{name:'Chucky Showdown',exact:true}).click();
 for(const n of [3,2,1])await fold(n);
 try{await page.getByRole('button',{name:'Play Again',exact:true}).waitFor({timeout:15000});}catch(error){console.error(await page.locator('body').innerText());console.error((await c.query("select status,state->>'phase' phase,state->>'round' round,state->>'due' due from private.arcade_runs where user_id=$1",[actor])).rows);throw error;}
 const rows=(await c.query("select status,score,(select count(*)::int from private.arcade_results where user_id=$1) results from private.arcade_runs where user_id=$1",[actor])).rows;
 assert.equal(rows[0].status,'completed');assert.equal(rows[0].results,1);assert.deepEqual(errors,[]);
 writeFileSync(out+'/release-sounds.json',JSON.stringify({passed:true,standardSixSevenWinCounts:true,noWinTones:true,glass:3,descendingCount:true,noFollowupTone:true,positiveBankCount:true,oneBustCue:true,silentReload:true,rows,events},null,2));
 console.log('PASS all four Chucky sound outcomes, levels 1/6/7, silent reload and completed run.');
}
