import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './human-ready-local.mjs';
const c=await connect(context().database),out='qualification.local/eleven-up-timeout/smoke-browser';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const start=async()=>{await page.goto('http://127.0.0.1:5198/dev/eleven-up/live.html');await page.getByRole('button',{name:'Start two-player table'}).click();await page.waitForURL(/id=/);await page.locator('[data-phase="ready"]').waitFor();return new URL(page.url());};
const state=async id=>(await c.query('select * from private.eleven_up_matches where dealer_game_id=$1',[id])).rows[0];
try{
 let url=await start(),id=url.searchParams.get('id');let m=await state(id);const player=m.state.players[m.state.turnIndex].id;
 const slots=Array(22).fill(null);slots[0]=16;slots[9]=20;
 await c.query('begin');
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where id=$1',[player]);
 await c.query("update private.eleven_up_matches set state=state||jsonb_build_object('phase','playing','startedAt',$2::bigint,'deadline',$3::bigint,'slots',$4::jsonb,'current',44),revision=revision+1,bot_due_at=$3 where dealer_game_id=$1",[id,Date.now(),Date.now()+20000,JSON.stringify(slots)]);
 await c.query('update private.eleven_up_matches set bot_due_at=$2 where dealer_game_id=$1',[id,Date.now()+10000]);await c.query('commit');
 await page.getByRole('button',{name:/Ball 2, exposed/}).waitFor();await page.getByRole('checkbox',{name:'Auto-play',exact:true}).waitFor();
 await page.waitForTimeout(250);m=await state(id);const originalDeadline=m.state.deadline;
 await c.query("update private.eleven_up_matches set state=private.eleven_up_reduce(state,'group',ARRAY[16,44],$2),revision=revision+1 where dealer_game_id=$1",[id,Date.now()]);
 await page.waitForFunction(()=>document.querySelectorAll('.eleven-ball[aria-pressed=true],.eleven-draw[aria-pressed=true]').length===1);const first=Date.now();
 await page.waitForFunction(()=>document.querySelectorAll('.eleven-ball[aria-pressed=true],.eleven-draw[aria-pressed=true]').length===2);const spacing=Date.now()-first;
 assert(spacing>=450&&spacing<=1100,`selection spacing ${spacing}ms`);await page.screenshot({path:out+'/selected-combination.png'});
 await page.getByRole('button',{name:/Ball 2, exposed/}).waitFor({state:'detached'});assert.equal((await state(id)).state.deadline,originalDeadline);
 // Fresh human turn reproduces the observed zero-point expiry.
 url=await start();id=url.searchParams.get('id');await page.locator('.eleven-pass').click();await page.locator('[data-phase="playing"]').waitFor();
 await c.query("update private.eleven_up_matches set state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1 where dealer_game_id=$1",[id,Date.now()-1]);
 const checkbox=page.getByRole('checkbox',{name:'Auto-play',exact:true});await checkbox.waitFor();assert(await checkbox.isChecked());
 m=await state(id);assert.equal(m.state.result.reason,'timeout');assert.equal(m.state.result.stageScore,0);
 // Freeze only the local fixture through the canonical explicit pause for stable layouts/reclaim.
 await c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 await c.query('select public.set_game_paused($1,true,$2,(select pause_version from public.games where id=$1))',[url.searchParams.get('session'),id]);
 await page.reload();await checkbox.waitFor();assert(await checkbox.isChecked());
 const layouts=[];for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[844,390],[667,375]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);const box=await checkbox.boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight)));
  await page.screenshot({path:out+`/expiry-away-${width}x${height}.png`});layouts.push({width,height});
 }
 const before=(await state(id)).state;await checkbox.click();await checkbox.waitFor({state:'detached'});assert.deepEqual((await state(id)).state,before);
 assert.equal((await c.query('select is_paused from public.games where id=$1',[url.searchParams.get('session')])).rows[0].is_paused,true);
 await page.reload();await page.locator('[data-eleven-up]').waitFor();assert.equal(await checkbox.count(),0);assert.deepEqual(errors,[]);
 writeFileSync(out+'/results.json',JSON.stringify({selectionSpacingMs:spacing,layouts,errors,expiryScore:0,reclaimClearsCheckbox:true,pausedReclaimDoesNotResume:true,limitation:'Local SQL; desktop phone emulation, not physical device acceptance'},null,2));
 console.log('PASS actual SQL/browser sequential highlights, zero expiry, checked away/reload/reclaim and six phone layouts');
}finally{await browser.close();await c.end();}
