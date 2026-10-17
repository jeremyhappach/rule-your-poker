import {readFileSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
mkdirSync('qualification.local/tri-towers/scene-ui',{recursive:true});
let source=readFileSync('dev/tri-towers/v2.browser.mjs','utf8').split(/try\{\r?\n f=await fixture/)[0];
source=source.replaceAll("'./bots-fixture.mjs'","'./dev/tri-towers/bots-fixture.mjs'").replace('v2-context.json','scene-context.json').replace('const calls={',"const calls={tri_towers_present_scene:['p_dealer_game_id','p_request_id','p_revision','p_action','p_index'],").replace('assert.equal(q.user,f.users[0])','assert(f.users.includes(q.user))');
source+=`try{
 for(const n of [2,4,7]){
 f=await fixture(admin,database,Array(n).fill(false));let s=(await state(admin,f)).state;const active=s.players[s.turnIndex];f.users=[active.userId,...f.users.filter(u=>u!==active.userId)];
 // Keep the locally created introduction visible while first-time dev modules compile.
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+600000)),revision=revision+1 WHERE dealer_game_id=$1",[f.dealer]);
 const page=await open();await page.locator('[data-phase=intro]').waitFor();assert.equal(await page.locator('.tri-score-pill').count(),n);assert.equal(await page.locator('.tri-stock:enabled').count(),0);
 await page.screenshot({path:'qualification.local/tri-towers/scene-ui/multi-'+n+'-intro.png'});
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint)),revision=revision+1 WHERE dealer_game_id=$1",[f.dealer]);await until(async m=>{if(m.state.phase==='ready')return true;await admin.query('SELECT private.tri_towers_recover()');return false;},15000);
 await page.locator('[data-phase=ready]').waitFor();await page.locator('.tri-stock:enabled').click();await page.locator('[data-phase=playing]').waitFor();
 for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1440,height:900}]){
 await page.setViewportSize(size);await page.waitForTimeout(80);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const box=await page.locator('.tri-tableau').boundingBox(),high=await page.locator('.tri-high-run').boundingBox(),stock=await page.locator('.tri-stock').boundingBox();assert(high.y+high.height<=box.y+2);assert(stock.width>=44&&stock.height>=44);
 const scores=await page.locator('.tri-score-pill').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert.equal(scores.length,n);for(const score of scores)assert(score.width>40&&score.y>=0&&score.bottom<box.y+2);
 await page.screenshot({path:'qualification.local/tri-towers/scene-ui/multi-'+n+'-'+size.width+'.png'});
 }
 if(n===2){
 const remaining=await page.locator('[data-tri-card]').count();await page.getByRole('button',{name:'Take Score',exact:true}).click();await page.locator('[data-stage-result]').waitFor();assert.equal(await page.locator('[data-tri-card]').count(),remaining);
 await page.locator('.tri-score-pill[data-centered=true]').waitFor();await page.waitForTimeout(3200);assert.equal(await page.locator('.tri-score-pill[data-centered=true]').count(),0);assert.equal(await page.locator('[data-phase=stage_complete]').count(),1);
 await page.reload();await page.locator('[data-tri-towers]').waitFor();assert.equal(await page.locator('.tri-score-pill[data-centered=true]').count(),0,'reconnect no animation replay');
 }
 await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS multiplayer 2/4/7 score pills, intro action suppression, portrait/landscape containment, completion card retention/return and reconnect suppression');
 await writeFile('qualification.local/tri-towers/scene-ui/multiplayer.json',JSON.stringify({requests,errors}));
}finally{await browser.close();for(const res of streams)res.end();await server.close();await admin.end();}`;
const result=spawnSync(process.execPath,['--input-type=module','-'],{input:source,encoding:'utf8',stdio:['pipe','inherit','inherit']});process.exitCode=result.status;
