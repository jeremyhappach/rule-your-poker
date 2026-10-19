import {chromium} from '@playwright/test';import {existsSync,readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {connect} from '../royal-flash/database.mjs';
import {play} from './play.mjs';
const root='http://127.0.0.1:5192',dir='.codex/evidence/multiplayer-money/',db=await connect(JSON.parse(readFileSync(dir+'context.json')).database);
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)}),errors=[],evidence=[];
try{
 for(const family of ['tri-towers','eleven-up','royal-flash']){
  console.log('Browser setup:',family);
  const fixture=await(await fetch(root+'/__money/new',{method:'POST',body:'{}'})).json();
  const pages=await Promise.all(fixture.users.map(async user=>{const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.goto(root+'/dev/multiplayer-money/live.html?'+new URLSearchParams({session:fixture.session,user}));return p;}));
  const caller=pages[0],other=pages[1];await caller.getByRole('tab',{name:'Other',exact:true}).click({timeout:20000});
  await caller.locator(`[data-dealer-game-option="${family}"]`).click();
  const input=caller.locator('#ante-simple');await input.waitFor();const defaultStake=await input.inputValue();assert.ok(Number(defaultStake)>0);
  await input.fill('9');
  assert.equal(await input.inputValue(),'9','caller edit remains nine');
  if(process.argv.includes('--probe')){console.log(await caller.locator('body').innerText());await caller.screenshot({path:dir+'setup.png'});break;}
  await caller.getByRole('button',{name:/start|confirm|set game/i}).click();
  await other.getByRole('button',{name:/Ante Up!/}).waitFor();assert.ok((await other.locator('body').innerText()).includes('$9'));
  const pending=(await db.query('SELECT status,current_game_uuid FROM public.games WHERE id=$1',[fixture.session])).rows[0];assert.equal(pending.status,'ante_decision');
  const prefix=family.replaceAll('-','_');assert.equal((await db.query(`SELECT count(*) n FROM private.${prefix}_matches WHERE game_id=$1`,[fixture.session])).rows[0].n,'0');
  await other.screenshot({path:dir+family+'-ante.png'});await other.getByRole('button',{name:/Ante Up!/}).click();
  await caller.waitForFunction(()=>!document.querySelector('[data-authoritative-action-surface="ante-decision"]'));
  await other.waitForFunction(()=>!document.querySelector('[data-authoritative-action-surface="ante-decision"]'));
  await other.screenshot({path:dir+family+'-play.png'});
  const result=await play({db,fixture,family,pages,dir});
  evidence.push({family,fixture,defaultStake,changedStake:9,explicitAnte:true,...result});
  for(const p of pages)await p.close();
 }
 console.log(JSON.stringify({evidence,errors},null,2));writeFileSync(dir+'browser.json',JSON.stringify({evidence,errors},null,2));assert.deepEqual(errors,[]);
}catch(e){console.error(e.message);console.log('Page errors:',errors);for(const p of browser.contexts().flatMap(c=>c.pages()))console.log((await p.locator('body').innerText()).slice(0,6000));process.exitCode=1;}finally{await browser.close();await db.end();}
