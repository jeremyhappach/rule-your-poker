import {chromium} from '@playwright/test';import {existsSync,readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {connect} from '../royal-flash/database.mjs';
const dir='.codex/evidence/multiplayer-money/',db=await connect(JSON.parse(readFileSync(dir+'context.json')).database),evidence=JSON.parse(readFileSync(dir+'browser.json')).evidence;
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
try{for(const item of evidence){const {fixture,family}=item,prefix=family.replaceAll('-','_');
 await db.query("UPDATE public.games SET config_deadline=clock_timestamp()+interval '10 minutes' WHERE id=$1 AND status='game_selection'",[fixture.session]);
 const old=(await db.query('SELECT current_game_uuid, dealer_position,status FROM public.games WHERE id=$1',[fixture.session])).rows[0];console.log(family,old);
 const caller=(await db.query('SELECT user_id FROM public.players WHERE game_id=$1 AND position=$2',[fixture.session,old.dealer_position])).rows[0].user_id;
 const pages=await Promise.all(fixture.users.map(async user=>{const p=await browser.newPage({viewport:{width:390,height:844}});await p.goto('http://127.0.0.1:5192/dev/multiplayer-money/live.html?'+new URLSearchParams({session:fixture.session,user,previous:JSON.stringify({game_type:family,ante_amount:9,run_back_config:{ante_amount:9}})}));return p;}));
 const callerPage=pages[fixture.users.indexOf(caller)],other=pages[1-fixture.users.indexOf(caller)];
 callerPage.on('response',async r=>{if(r.url().endsWith('/__money/rpc')){const body=await r.json();if(body.error)console.log('RPC error',r.request().postDataJSON().name,body);}});
 await callerPage.getByRole('button',{name:/Run Back/}).click();await other.getByRole('button',{name:/Ante Up!/}).waitFor({timeout:15000});assert.ok((await other.locator('body').innerText()).includes('$9'));
 const offer=(await db.query('SELECT current_game_uuid,status FROM public.games WHERE id=$1',[fixture.session])).rows[0];assert.equal(offer.status,'ante_decision');assert.notEqual(offer.current_game_uuid,old.current_game_uuid);
 assert.equal((await db.query(`SELECT count(*) n FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[offer.current_game_uuid])).rows[0].n,'0');
 await other.getByRole('button',{name:/Ante Up!/}).click();await other.waitForFunction(()=>!document.querySelector('[data-authoritative-action-surface="ante-decision"]'));
 assert.equal((await db.query(`SELECT count(*) n FROM private.${prefix}_matches WHERE dealer_game_id=$1`,[offer.current_game_uuid])).rows[0].n,'1');
 const balances=(await db.query('SELECT chips FROM public.players WHERE game_id=$1 ORDER BY position DESC',[fixture.session])).rows.map(p=>p.chips);assert.deepEqual(balances,item.after);
 item.runBack={stake:9,explicitNewConsent:true,newDealerGameId:offer.current_game_uuid,unchangedBalances:balances};console.log(family,'Run Back passed');for(const p of pages)await p.close();
 }writeFileSync(dir+'browser.json',JSON.stringify({evidence,errors:[]},null,2));}finally{await browser.close();await db.end();}
