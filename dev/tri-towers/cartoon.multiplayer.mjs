// Reuse the accepted authenticated SQL/SSE browser harness, with a bounded polish scenario.
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
let source=readFileSync('dev/tri-towers/v2.browser.mjs','utf8').split(/try\{\r?\n f=await fixture/)[0];
source=source.replaceAll("'./bots-fixture.mjs'","'./dev/tri-towers/bots-fixture.mjs'").replaceAll('v2-context.json','cartoon-context.json')
 .replace('const calls={','const calls={tri_towers_present:[\'p_dealer_game_id\',\'p_request_id\',\'p_revision\',\'p_action\',\'p_index\'],')
 .replace('assert.equal(q.user,f.users[0])','assert(f.users.includes(q.user))');
source+=`try{
 f=await fixture(admin,database,[false,false]);const initial=await state(admin,f),active=initial.state.players[initial.state.turnIndex];
 // Allow initial dev-module compilation before exercising the real first-action clock.
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint+600000)),revision=revision+1 WHERE dealer_game_id=$1",[f.dealer]);
 f.users=[active.userId,...f.users.filter(u=>u!==active.userId)];
 const phone=await open(),desktop=await open(1440,900);
 await phone.locator('[data-phase=ready]').waitFor();
 let legal=phone.locator('[data-tri-card][data-legal=true]:enabled');if(await legal.count())await legal.first().click();else await phone.locator('.tri-stock').click();
 await phone.locator('[data-phase=playing]').waitFor();
 for(let i=0;i<12;i++){
  legal=phone.locator('[data-tri-card][data-legal=true]:enabled');if(await legal.count())await legal.first().click();else await phone.locator('.tri-stock:enabled').click();
  await phone.waitForTimeout(120);if((await state(admin,f)).state.run>=2)break;
 }
 const before=await actor(database,f.users[0],'SELECT public.tri_towers_present($1) v',[f.dealer]);assert(before.highRun>=before.run);
 const expected=(await admin.query("SELECT max((frame->>'run')::int) n FROM private.tri_towers_history WHERE dealer_game_id=$1 AND frame->>'stage'=$2 AND frame->>'activePlayerId'=$3",[f.dealer,String(before.stage),before.activePlayerId])).rows[0].n;
 assert.equal(before.highRun,expected);
 await phone.locator('.tri-stock:enabled').click();await phone.waitForTimeout(200);await phone.reload();await phone.locator('[data-phase=playing]').waitFor();
 await phone.getByLabel('Round highest streak '+before.highRun).waitFor();assert.equal(await phone.getByLabel('Current removal streak').textContent(),'0');
 await phone.screenshot({path:'qualification.local/tri-towers/cartoon-ui/multiplayer-390.png'});
 await phone.setViewportSize({width:844,height:390});await phone.screenshot({path:'qualification.local/tri-towers/cartoon-ui/multiplayer-844.png'});
 await desktop.screenshot({path:'qualification.local/tri-towers/cartoon-ui/multiplayer-1440.png'});
 await phone.getByRole('button',{name:'Take Score',exact:true}).click();await phone.locator('[data-stage-result]').waitFor();
 assert.deepEqual(errors,[]);assert(requests.some(r=>r.name==='tri_towers_present'&&r.action==='draw'));
 console.log('PASS multiplayer authenticated first actions, shared Cartoon board, exact history HI-RUN, draw/reload retention, result hold and phone/landscape/desktop');
 await writeFile('qualification.local/tri-towers/cartoon-ui/multiplayer.json',JSON.stringify({highRun:before.highRun,requests,errors}));
}finally{await Promise.all(pages.map(p=>p.context().close()));await browser.close();for(const res of streams)res.end();await server.close();await admin.end();}
`;
const result=spawnSync(process.execPath,['--input-type=module','-'],{input:source,encoding:'utf8',stdio:['pipe','inherit','inherit']});process.exitCode=result.status;
