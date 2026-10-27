import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15308',out='qualification.local/ptown-words/pause-cancel';mkdirSync(out,{recursive:true});
const post=async(op,body={},token='')=>(await fetch(base+'/__ptown_words_route/'+op,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)})).json();
const f=await post('new'),rpc=async(name,args,who=0)=>{const r=await post('rpc',{name,args},f.tokens[who]);if(r.error)throw Error(r.error.message);return r.data;};
const frame=await rpc('read_session_frame',{p_game_id:f.game}),config=await rpc('ptown_words_configure',{p_game_id:f.game,p_dealer_player_id:f.players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',p_config:{ante_amount:5},p_expected_config_deadline:frame.game.config_deadline}),d=config.dealer_game.id;
await rpc('submit_ante_decision',{p_game_id:f.game,p_expected_dealer_game_id:d,p_player_id:f.players[1],p_decision:'ante_up'},1);await rpc('advance_ante_phase',{p_game_id:f.game,p_expected_dealer_game_id:d});
const server=await chromium.launchServer({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),browser=await chromium.connect(server.wsEndpoint());
const hostContext=await browser.newContext({viewport:{width:1280,height:800}}),guestContext=await browser.newContext({viewport:{width:390,height:760},isMobile:true,hasTouch:true}),host=await hostContext.newPage(),guest=await guestContext.newPage(),errors=[],checks=[];
const pending=p=>p.getByText(/is requesting a pause/),cancel=()=>guest.getByRole('button',{name:'Cancel pause request',exact:true}),request=()=>guest.getByRole('button',{name:'Request pause',exact:true});
async function focus(p){await p.bringToFront();await p.waitForTimeout(500);}
async function redTarget(){const r=await cancel().evaluate(e=>{const b=e.getBoundingClientRect();return {color:getComputedStyle(e).color,width:b.width,height:b.height,x:!!e.querySelector('.lucide-x'),disabled:e.disabled};});assert.equal(r.color,'rgb(255, 138, 138)');assert.ok(r.width>=44&&r.height>=44&&r.x&&!r.disabled);return r;}
try{
 for(const [p,i] of [[host,0],[guest,1]]){p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/game/'+f.game+'?token='+f.tokens[i]);await p.locator('.words-grid').waitFor();}
 await focus(guest);await request().tap();await cancel().waitFor();await pending(host).waitFor();await pending(guest).waitFor();const portrait=await redTarget();await guest.screenshot({path:out+'/portrait-cancel.png'});
 const first=(await rpc('ptown_words_snapshot',{p_dealer_game_id:d},1)).pauseRequest.id;
 await guest.reload();await cancel().waitFor();await redTarget();await cancel().tap();await request().waitFor();for(const p of [guest,host])await pending(p).waitFor({state:'hidden'});
 await guest.reload();await request().waitFor();assert.equal((await rpc('ptown_words_snapshot',{p_dealer_game_id:d},1)).pauseRequest,undefined);checks.push('request -> reconnect with red X -> revoke -> all-client notice removal -> reconnect without request');
 await focus(guest);await request().tap();await cancel().waitFor();await pending(host).waitFor();const second=(await rpc('ptown_words_snapshot',{p_dealer_game_id:d},1)).pauseRequest.id;assert.notEqual(first,second);
 await guest.setViewportSize({width:1280,height:800});const desktop=await redTarget();await guest.screenshot({path:out+'/desktop-cancel.png'});checks.push('request again has new authoritative identity; red X is 44px and accessible in portrait and desktop');
 // Hold only this cancellation request while the real host UI commits pause.
 let release,intercepted;const gate=new Promise(r=>release=r),seen=new Promise(r=>intercepted=r);
 await guest.route('**/__ptown_words_route/rpc',async route=>{const body=route.request().postDataJSON();if(body.name==='ptown_words_action'&&body.args.p_action==='cancel_pause_request'){intercepted();await gate;}await route.continue();});
 await cancel().tap();await seen;await focus(host);await host.getByRole('button',{name:'Pause game',exact:true}).click();
 for(const p of [host,guest])await p.locator('[data-paused=true]').waitFor();assert.equal(await cancel().count(),0);assert.ok(await guest.getByRole('button',{name:'Resume game',exact:true}).isDisabled());release();
 await guest.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith('ptown:words:1:')));await guest.unroute('**/__ptown_words_route/rpc');const paused=await rpc('ptown_words_snapshot',{p_dealer_game_id:d},1);assert.equal(paused.paused,true);assert.equal(paused.pauseRequest,undefined);for(const p of [guest,host])await pending(p).waitFor({state:'hidden'});checks.push('host pause wins delayed cancellation; all clients remain paused, no red X, guest cannot resume');
 await host.getByRole('button',{name:'Resume game',exact:true}).click();await guest.locator('[data-paused=false]').waitFor();await focus(guest);await request().click();await cancel().waitFor();await pending(host).waitFor();await cancel().focus();await guest.keyboard.press('Enter');await request().waitFor();for(const p of [guest,host])await pending(p).waitFor({state:'hidden'});checks.push('host resume preserved; later request/revoke works with keyboard');
 assert.deepEqual(errors,[]);writeFileSync('dev/ptown-words/evidence/pause-cancel-browser.json',JSON.stringify({passed:true,localOnly:true,checks,portrait,desktop,errors},null,2));console.log('Pause request cancellation: cross-client, reconnect, red X and host race PASS');
}catch(e){console.error(e);process.exitCode=1;}finally{await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,4000))]);if(server.process()?.exitCode===null)server.process()?.kill();process.exit(process.exitCode??0);}
