import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

export async function smokeV2({page,actor,c,origin,out,errors,log,act,phase,button}){
  const samples=[],played=[];
  const mode=name=>c.query("select set_config('app.showdown_cards',$1,true)",[name]);
  const sounds=()=>page.evaluate(()=>window.audioEvents);
  const fold=n=>n===1?'FOLD (Bank Total)':'FOLD ('+n+' remaining)';
  const stay=()=>act('STAY (Choose Chucky level after reveal)');
  const level=(n,left)=>'Level '+n+', '+n*100+' points, '+left+' uses remaining';
  async function layout(width,height,label){
    await page.setViewportSize({width,height});
    const sample=await page.evaluate(()=>{
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
      return {rows:[...document.querySelectorAll('.cs-table>section')].map(box),
        buttons:[...document.querySelectorAll('.cs-choice button')].map(box),
        cards:[...document.querySelectorAll('.cs-slot')].map(box),suits:[...document.querySelectorAll('[data-megatouch-suit]')].map(e=>getComputedStyle(e).fontSize)};
    });
    assert.equal(sample.rows.length,5);assert.ok(sample.suits.length>=6);
    for(const r of [...sample.rows,...sample.cards,...sample.buttons])assert.ok(r.x>=-.5&&r.y>=-.5&&r.x+r.w<=width+1&&r.y+r.h<=height+1,JSON.stringify({width,height,r}));
    for(const r of sample.cards)assert.ok(r.w>=19&&r.h>=26,JSON.stringify(r));
    assert.ok(sample.rows.every((r,i)=>!i||r.y>=sample.rows[i-1].y+sample.rows[i-1].h-.5));
    samples.push({width,height,label,suits:sample.suits.length});
    await page.screenshot({path:out+'/'+label+'-'+width+'.png'});
  }
  const next=async(round,hand)=>{
    await page.locator('.cs-table[data-phase="fold_stay"][data-round="'+round+'"][data-hand="'+hand+'"]').waitFor();
    assert.equal(await page.locator('.cs-community .cs-slot').count(),4);
    assert.equal(await page.locator('.cs-community [aria-label="Face-down card"]').count(),2);
    assert.equal(await page.locator('[data-winning=true]').count(),0);
  };
  const challenge=async(n,left)=>{
    await stay();await phase('choose').waitFor();
    assert.equal(await page.locator('.cs-community [aria-label="Face-down card"]').count(),0);
    await act(level(n,left));await phase('showdown').waitFor();
  };
  await page.goto(origin+'/arcade');
  const tile=page.getByRole('link',{name:'Chucky Showdown leaderboard'});
  await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  await button('Chucky Showdown rules and info').click();await page.getByRole('heading',{name:'Fold or Stay'}).waitFor();
  await page.keyboard.press('Escape');await tile.click();await button('Play').click();
  await next(1,1);await button(fold(3)).waitFor();
  for(const [width,height] of [[320,568],[390,844],[844,390],[667,375]])await layout(width,height,'fold-stay');
  await page.setViewportSize({width:390,height:844});
  await stay();await phase('choose').waitFor();await layout(320,568,'selection');
  await act(level(7,2));await phase('showdown').waitFor();
  await page.locator('.cs-dealer .cs-slot').nth(6).waitFor();
  await layout(320,568,'seven-cards');await page.setViewportSize({width:390,height:844});
  await phase('win').waitFor();await mode('crack');
  await next(1,2);await challenge(1,2);
  await page.getByText('YOU GOT CRACKED!',{exact:true}).waitFor();
  await page.getByText('Chucky cracked you with Four of a Kind!',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-winning=true]').count(),5);
  const countBefore=(await sounds()).filter(x=>x.endsWith(':glass')).length;assert.equal(countBefore,1);
  await page.screenshot({path:out+'/cracked-390.png'});await mode('win');
  await next(1,3);await challenge(1,1);await phase('win').waitFor();await mode('tie');
  await next(1,4);await challenge(2,2);await page.getByText('Chucky wins the tie with a Straight!',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-winning=true]').count(),5);await mode('crack');
  await next(1,5);await page.getByLabel('1 crack remaining',{exact:true}).waitFor();
  assert.equal(await page.locator('.cs-cracks [data-active=true]').count(),1);
  await challenge(3,2);await page.getByText('YOU GOT CRACKED!',{exact:true}).waitFor();
  await mode('win');played.push(...await sounds());
  const timeline=await page.evaluate(()=>window.audioTimeline);
  const first=timeline.find(e=>e.id.startsWith('palette:chip:')&&e.id.endsWith(':commit'));
  const scope=first.id.slice('palette:chip:'.length,-':commit'.length);
  const placements=timeline.filter(e=>e.id.startsWith('palette:slide:'+scope+':chucky'));
  const flips=timeline.filter(e=>e.id.startsWith('palette:flip:'+scope+':face:'));
  assert.equal(placements.length,7);assert.equal(flips.length,7);
  assert.ok(Math.abs(placements[6].at-placements[0].at-1080)<170);
  for(let i=1;i<7;i++)assert.ok(flips[i].at-flips[i-1].at>=640&&flips[i].at-flips[i-1].at<1050,JSON.stringify(flips));
  for(const e of timeline.filter(e=>e.id.endsWith(':glass')))assert.equal(e.highlights,5);
  await page.reload();
  await page.getByText('ROUND BUSTED',{exact:true}).waitFor();
  assert.equal((await sounds()).filter(id=>id.endsWith(':glass')).length,0,'reload replayed crack');
  await next(2,1);await button(fold(3)).waitFor();
  await button('Mute sounds').click();const muteAt=(await sounds()).length;
  await challenge(1,2);await phase('win').waitFor();await next(2,2);
  assert.equal((await sounds()).length,muteAt);
  await button('Unmute sounds').click();
  for(let n=3;n>=1;n--){await act(fold(n));if(n>1)await next(2,6-n);}
  await page.getByText('ROUND BANKED',{exact:true}).waitFor();await next(3,1);
  await button('Chucky Showdown rules and info').click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
  const deadline=log.filter(r=>r.phase==='fold_stay').at(-1).due;
  await page.getByRole('link',{name:'Back to Chucky Showdown leaderboard'}).click();await page.getByRole('link',{name:'Resume'}).click();await next(3,1);
  assert.equal(log.at(-1).due,deadline);
  for(let n=3;n>=1;n--){await act(fold(n));if(n>1)await next(3,5-n);}
  await page.getByText('TOTAL SCORE:',{exact:false}).waitFor();await page.getByText('Game Over',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'All Time'}).click();await page.locator('.leaderboard-achieved time').first().waitFor();
  await page.getByText('My score history',{exact:true}).click();await page.locator('details li time').first().waitFor();
  const results=(await c.query("select score,final_state from private.arcade_results where user_id=$1 and ruleset='chucky-showdown/2'",[actor])).rows;
  assert.equal(results.length,1);assert.deepEqual(results[0].final_state.results.map(r=>[r.reason,r.score]),[['busted',0],['folds',100],['folds',0]]);
  played.push(...await sounds());
  assert.equal(new Set(played).size,played.length);assert.deepEqual(errors,[]);
  assert.ok(!played.some(id=>id.startsWith('palette:chucky:')||id.includes('laugh')));
  assert.equal(played.filter(id=>id.endsWith(':glass')).length,3);
  assert.equal(played.filter(id=>id.includes(':crack:')&&id.endsWith(':count')).length,2,'two positive crack countdowns');
  assert.ok(played.some(id=>id.includes(':win:')&&id.endsWith(':count')));
  const seven=played.find(id=>id.startsWith('palette:chip:')&&id.endsWith(':commit')).slice('palette:chip:'.length,-':commit'.length);
  for(let i=1;i<=7;i++){
    assert.ok(played.includes('palette:flip:'+seven+':face:'+i),'flip '+i);
    assert.ok(played.includes('palette:slide:'+seven+':chucky'+(i-1)),'placement '+i);
  }
  assert.equal(played.filter(id=>id.includes(':board_reveal:')&&id.includes(':face:')).length,10);
  writeFileSync(out+'/v2-result.json',JSON.stringify({samples,played,placements,flips,results:results[0].final_state.results},null,2));
  console.log('PASS v2 — mobile layout and lifecycle checks, authenticated service fixture, lost acknowledgement, complete three-round run, winning fives, synchronized flips, crack audio and silent recovery.');
}
