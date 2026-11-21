import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qualification.local/midnight-blue';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],checks=[];
try{
 for(const [width,height] of [[390,844],[320,568],[844,390],[1280,800]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:5197'?route.continue():route.abort());
  async function shot(name){await page.screenshot({path:output+'/'+width+'-'+name+'.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow: '+name);for(const art of await page.locator('.midnight-illustration').all()){assert.ok(await art.evaluate(el=>el.getBoundingClientRect().width<=el.parentElement.getBoundingClientRect().width+1),'Illustration fits its container: '+name);}checks.push({width,height,name});}
  await page.goto('http://127.0.0.1:5197/');await expect(page.getByRole('button',{name:'Re-Join',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Async (2)'})).toBeVisible();await shot('multiplayer');
  await page.getByRole('button',{name:'More options'}).click();await expect(page.getByRole('menuitem',{name:'Defaults'})).toBeVisible();await expect(page.getByRole('menuitem',{name:'Notification settings'})).toBeVisible();await page.getByRole('menuitem',{name:'Notifications',exact:true}).click();await expect(page.getByRole('dialog',{name:'Notifications'})).toBeVisible();await expect(page.getByRole('button',{name:'YOUR TURN'})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link',{name:'Async (2)'}).click();await expect(page.getByText('2x Run21, P-Town Words')).toBeVisible();await expect(page.getByText(/Current Net/)).toHaveCount(0);await expect(page.locator('.delayed-card-link time')).toHaveCount(0);await shot('async');
  await page.getByRole('link',{name:'Arcade',exact:true}).click();await expect(page.getByRole('link',{name:'Run21 leaderboard'})).toBeVisible();await shot('arcade');
  await page.goto('http://127.0.0.1:5197/setup');await expect(page.locator('[data-dealer-game-option="holm-game"]')).toBeVisible();assert.ok(await page.locator('[data-dealer-game-option="holm-game"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.width/r.height>=1.5&&getComputedStyle(el.querySelector('.midnight-art')).mixBlendMode==='lighten';}),'Short Cards tiles and blended artwork');await shot('cards');
  await page.getByRole('tab',{name:'Dice',exact:true}).click();await expect(page.locator('[data-dealer-game-option="quintzee"]')).toHaveCount(0);await shot('dice');
  await page.getByRole('tab',{name:'Other',exact:true}).click();await expect(page.locator('[data-dealer-game-option="quintzee"]')).toBeVisible();await shot('other');
  for(const [game,category] of [['holm-game','Cards'],['3-5-7','Cards'],['cribbage','Cards'],['gin-rummy','Cards'],['horses','Dice'],['yahtzee','Dice'],['run21','Other']]){
   await page.getByRole('tab',{name:category,exact:true}).click();await page.locator('[data-dealer-game-option="'+game+'"]').click();
   const start=page.locator('[data-dealer-game-start="'+game+'"]');await expect(start).toBeVisible();await expect(start).toBeInViewport();
   if(['horses','yahtzee','run21'].includes(game)){const amount=page.getByRole('textbox');await amount.scrollIntoViewIfNeeded();await expect(amount).toBeInViewport();}
   await shot('setup-'+game);
   if(game==='holm-game'){
    await page.getByRole('button',{name:/Pussy Tax \$/}).click();await expect(page.getByLabel('Pussy Tax enabled')).toBeVisible();await expect(page.getByLabel('Ante ($)',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/Pot Max \$/}).click();await expect(page.getByLabel('Pussy Tax enabled')).not.toBeVisible();await expect(page.getByLabel('Pot Max enabled')).toBeVisible();
    await page.getByLabel('Rabbit Hunt').scrollIntoViewIfNeeded();await expect(page.getByLabel('Rabbit Hunt')).toBeInViewport();
   }
   await expect(page.locator('.midnight-setup-heading .midnight-art')).toHaveCount(1);await expect(page.locator('.midnight-setup .midnight-illustration')).toHaveCount(0);assert.equal(await page.locator('.midnight-scene-header').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px');
   if(game==='cribbage'){
    await expect(page.getByRole('combobox',{name:'Game Mode'})).toBeVisible();await expect(page.getByRole('switch',{name:/Skunks/})).toBeVisible();await page.getByRole('combobox',{name:'Game Mode'}).selectOption('custom');await expect(page.getByLabel('Points to Win')).toBeVisible();await expect(page.getByRole('switch',{name:/Skunks/})).toHaveCount(0);await page.getByRole('combobox',{name:'Game Mode'}).selectOption('full');
   }
   await page.getByRole('button',{name:/← Back/}).click();
  }
  await page.goto('http://127.0.0.1:5197/delayed/new');await expect(page.getByRole('button',{name:'Run21',exact:true})).toBeVisible();await shot('async-picker');
  await expect(page.getByText('PLAY ON YOUR SCHEDULE')).toHaveCount(0);await expect(page.getByText(/Two humans/)).toHaveCount(0);
  await expect(page.getByText('The first player in each game is selected randomly.')).toHaveCount(0);await page.getByRole('button',{name:'Match information'}).click();await expect(page.getByRole('dialog',{name:'Match information'})).toBeVisible();await expect(page.getByText('Invitations expire in 72 hours.')).toBeVisible();await shot('async-info');await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Ptown Words',exact:true}).click();await shot('async-words-config');assert.ok(await page.locator('.midnight-illustration').evaluate(el=>{const art=el.querySelector('.midnight-art').getBoundingClientRect(),frame=el.getBoundingClientRect(),title=el.querySelector('h3').getBoundingClientRect();return art.top>=frame.top&&art.bottom<=frame.bottom&&art.left>=title.right&&art.right<=frame.right;}),'Words artwork stays beside its title and above Stake');await page.getByRole('button',{name:'← Back to games'}).click();
  await page.getByRole('button',{name:'Run21',exact:true}).click();await expect(page.getByText('Enter a whole-number stake from 1 to 9,999.')).toHaveCount(0);await page.getByLabel('Stake 1',{exact:true}).fill('0');await expect(page.getByRole('alert')).toHaveText('Stake must be a whole number from 1 to 9,999.');await expect(page.getByRole('button',{name:'OK',exact:true})).toBeDisabled();await shot('async-invalid-stake');await page.getByLabel('Stake 1',{exact:true}).fill('3');await expect(page.getByRole('alert')).toHaveCount(0);await shot('async-config');await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByRole('button',{name:'Remove one Run21, $3'}).click();await expect(page.locator('.midnight-review-card')).toHaveCount(0);await expect(page.getByRole('button',{name:'Choose Opponent'})).toBeDisabled();await page.getByRole('button',{name:'Add Game'}).click();await page.getByRole('button',{name:'Run21',exact:true}).click();await page.getByLabel('Stake 1',{exact:true}).fill('3');await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByRole('button',{name:'Copy Run21, $3'}).click();await page.getByRole('button',{name:'Add Game'}).click();await page.getByRole('button',{name:'Run21',exact:true}).click();await page.getByRole('button',{name:'OK',exact:true}).click();await expect(page.getByText('Edit individual games or order')).toHaveCount(0);await expect(page.getByRole('button',{name:'Remove one Run21, $5'})).toBeVisible();await shot('async-review');
  await page.getByRole('button',{name:'Choose Opponent'}).click();await expect(page.getByRole('button',{name:'Send Invite'})).toBeDisabled();await expect(page.getByText('Choose a human opponent to send your invitation.')).toHaveCount(0);await page.getByLabel('Opponent',{exact:true}).selectOption('22222222-2222-4222-8222-222222222222');await expect(page.getByText('2× $3 Run21, 1× $5 Run21')).toBeVisible();await shot('async-opponent');
  await page.getByRole('button',{name:/Games \(3\)/}).click();await page.getByRole('button',{name:'Choose Opponent'}).click();await expect(page.getByLabel('Opponent',{exact:true})).toHaveValue('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button',{name:'Send Invite'}).click();await expect(page).toHaveURL('http://127.0.0.1:5197/delayed');
  const send=await page.evaluate(()=>window.midnightCalls.filter(c=>c.name==='delayed_create'));assert.equal(send.length,1);assert.deepEqual(send[0].args.p_lineup,[{game:'run21',stake:3},{game:'run21',stake:3},{game:'run21',stake:5}]);
  await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(output+'/report.json',JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify({passed:true,layouts:checks.length,errors}));
