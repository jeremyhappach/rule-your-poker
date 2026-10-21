import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './human-ready-local.mjs';
const c=await connect(context().database),out='qualification.local/eleven-up-timeout/secondary-resume-browser';mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5198/dev/eleven-up/secondary-ready.generated.html');await page.getByRole('button',{name:'Start two-player table'}).click();await page.waitForURL(/id=/);
 const url=new URL(page.url()),id=url.searchParams.get('id'),session=url.searchParams.get('session');
 const host=(await c.query('select user_id from public.players where game_id=$1 order by position desc limit 1',[session])).rows[0].user_id;
 // The historical preview fixture predates current_host; give this synthetic
 // local session its existing human creator before testing host authorization.
 await c.query('update public.games set current_host=$2 where id=$1',[session,host]);
 await c.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
 await c.query('select public.set_game_paused($1,true,$2,(select pause_version from public.games where id=$1))',[session,id]);
 await c.query("select set_config('app.session_pause_write','on',false)");
 await c.query('update public.players set auto_fold=true,sit_out_next_hand=true where game_id=$1 and user_id=$2',[session,host]);
 await c.query("select set_config('app.session_pause_write','',false)");
 url.searchParams.set('user',host);await page.goto(url.href);const box=page.getByRole('checkbox',{name:'Auto-play',exact:true});await box.waitFor();assert(await box.isChecked());
 await box.click();const resume=page.getByRole('button',{name:'Resume game',exact:true});await resume.waitFor();assert.equal(await box.count(),0);
 assert.equal((await c.query('select is_paused from public.games where id=$1',[session])).rows[0].is_paused,true);
 await page.reload();await resume.waitFor();
 const layouts=[];for(const [width,height] of [[320,568],[390,844],[667,375]]){
  await page.setViewportSize({width,height});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight)));
  assert(await resume.isVisible());await page.screenshot({path:out+'/'+width+'x'+height+'.png'});layouts.push({width,height});
 }
 await resume.click();await resume.waitFor({state:'detached'});
 assert.equal((await c.query('select is_paused from public.games where id=$1',[session])).rows[0].is_paused,false);
 const p=(await c.query('select auto_fold,sit_out_next_hand from public.players where game_id=$1 and user_id=$2',[session,host])).rows[0];assert(!p.auto_fold&&!p.sit_out_next_hand);assert.deepEqual(errors,[]);
 write(out+'/results.json',JSON.stringify({reclaimDoesNotResume:true,explicitCanonicalResume:true,reload:true,layouts,errors},null,2));console.log('PASS local paused reclaim, reload and explicit canonical Resume on three phone layouts');
}catch(e){console.log({errors,body:await page.locator('body').innerText()});await page.screenshot({path:out+'/failure.png'});throw e;}finally{await browser.close();await c.end();}
