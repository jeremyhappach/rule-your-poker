// Two real browser contexts, production hook/view/RPCs, isolated PostgreSQL.
// Supabase Realtime is substituted by LISTEN/NOTIFY + SSE locally; deployed
// publication delivery still requires an approved non-production Supabase smoke.
import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {randomUUID as uuid} from 'node:crypto';import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {database}=JSON.parse(await (await import('node:fs/promises')).readFile('qualification.local/tri-towers/polish-context.json','utf8'));
const options={host:'127.0.0.1',port:55439,user:'tri_test',database},admin=new pg.Client(options);await admin.connect();
const id=uuid(),users=[uuid(),uuid()],players=[uuid(),uuid()],deadline=new Date(Date.now()+600000).toISOString();
await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[id,deadline]);
for(let i=0;i<2;i++){await admin.query('INSERT INTO public.profiles(id,username) VALUES($1,$2)',[users[i],`${i?'Alex':'Jeremy'} ${users[i].slice(0,8)}`]);await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips) VALUES($1,$2,$3,$4,0)',[players[i],id,users[i],2-i]);}
const calls={tri_towers_configure:['p_game_id','p_dealer_player_id','p_expected_dealer_position','p_game_type','p_config','p_expected_config_deadline'],tri_towers_snapshot:['p_dealer_game_id'],tri_towers_action:['p_dealer_game_id','p_request_id','p_revision','p_action','p_index'],tri_towers_close:['p_dealer_game_id'],tri_towers_history:['p_dealer_game_id']};
async function rpc(user,name,args){assert(users.includes(user));assert(name in calls);const c=new pg.Client(options);await c.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');const values=calls[name].map(k=>args[k]);const result=await c.query(`SELECT public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) v`,values);await c.query('COMMIT');return {data:result.rows[0].v,error:null};}catch(e){return {data:null,error:{message:e.message}};}finally{await c.end();}}
await admin.query('UPDATE private.tri_towers_release SET enabled=true');const configured=await rpc(users[0],'tri_towers_configure',{p_game_id:id,p_dealer_player_id:players[0],p_expected_dealer_position:2,p_game_type:'tri-towers',p_config:{ante_amount:5},p_expected_config_deadline:deadline});assert.equal(configured.error,null);const dealer=configured.data.dealer_game.id;
await admin.query(`CREATE OR REPLACE FUNCTION public.tri_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('tri_local_revision',NEW.dealer_game_id::text);RETURN NEW;END $$;DROP TRIGGER IF EXISTS tri_local_notify ON public.tri_towers_revisions;CREATE TRIGGER tri_local_notify AFTER INSERT OR UPDATE ON public.tri_towers_revisions FOR EACH ROW EXECUTE FUNCTION public.tri_local_notify();`);
const streams=new Set();await admin.query('LISTEN tri_local_revision');admin.on('notification',e=>{if(e.payload===dealer)for(const res of streams)res.write('data: revision\n\n');});
const plugin={name:'tri-local-proof',configureServer(server){server.middlewares.use('/__tri-test',async(req,res)=>{if(req.url==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 try{let body='';for await(const chunk of req)body+=chunk;const {user,name,args}=JSON.parse(body);const result=await rpc(user,name,args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch{res.statusCode=400;res.end('{}');}});}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/tri-towers/local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5181,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'});
const passed=[],evidence={};const pass=s=>{passed.push(s);console.log('PASS',s);};
const get=async()=>(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[dealer])).rows[0];
const set=async patch=>{const m=await get();await admin.query('UPDATE private.tri_towers_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[dealer,{...m.state,...patch}]);};
const tick=async()=>admin.query('SELECT private.tri_towers_recover()');
// Emulate the existing server job on loopback only. No browser drives progression.
const recovery=setInterval(()=>void tick().catch(e=>console.error(e)),5000);
try{
 const errors=[];const pages=await Promise.all(users.map(async user=>{const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1:5181)/,r=>r.fulfill({status:200,body:'[]'}));await page.goto(`http://127.0.0.1:5181/dev/tri-towers/live.html?dealer=${dealer}&user=${user}`);return page;}));
 const [watcher,active]=pages;
 await active.getByRole('button',{name:'Start my turn'}).click();await watcher.getByRole('button',{name:'Take Score',exact:true}).waitFor();assert(await watcher.getByRole('button',{name:'Take Score',exact:true}).isDisabled());
 assert(await active.getByText('Your Turn',{exact:true}).isVisible());assert(await watcher.getByText(/^Watching /).isVisible());
 const board=p=>p.locator('[data-tri-card],.tri-waste').evaluateAll(nodes=>nodes.map(n=>[n.getAttribute('data-tri-card'),n.getAttribute('aria-label')]));
 for(const n of [23,10,1,0]){await set({cursor:52-n});for(const p of pages){await p.getByRole('button',{name:`Draw stock, ${n} stock cards remaining`,exact:true}).waitFor();assert.equal(await p.locator('.tri-stock-count').innerText(),String(n));}}
 await set({cursor:29});await active.getByRole('button',{name:/Draw stock, 23/}).click();await watcher.getByRole('button',{name:/Draw stock, 22/}).waitFor();assert.deepEqual(await board(active),await board(watcher));
 pass('Active/watcher roles, stock 23/10/1/0, draw visibility, disabled spectator inputs');
 await set({score:24000});await active.locator('.tri-scores [data-active=true] .tri-count-animated').filter({hasText:'24,000'}).waitFor();await active.getByRole('button',{name:'Take Score',exact:true}).click();
 for(const p of pages)await p.locator('[data-stage-result]').waitFor();
 const resultId=await active.locator('[data-stage-result]').getAttribute('data-stage-result');
 assert.equal(await watcher.locator('[data-stage-result]').getAttribute('data-stage-result'),resultId);
 const value=p=>p.locator('.tri-count-animated').last().innerText().then(x=>Number(x.replaceAll(',','')));
 const first=await value(watcher);await new Promise(r=>setTimeout(r,1200));const middle=await value(watcher);assert(middle>first&&middle<24000);
 const node=await active.locator('[data-stage-result]').elementHandle();
 for(const res of streams)res.write('data: revision\n\n');
 assert(await active.locator('[data-stage-result]').evaluate((el,old)=>el===old,node));
 await watcher.reload();await watcher.locator('[data-stage-result]').waitFor();assert(await value(watcher)>=middle);
 await Promise.all(pages.map(p=>p.getByRole('button',{name:'Take Score',exact:true}).waitFor()));
 let m=await get();assert.equal(m.state.stage,2);assert.equal(m.state.phase,'playing');assert.equal(m.state.score,24000);assert.equal(m.state.stages.length,1);
 pass('Both viewers count one immutable stage result; duplicate snapshots preserve node; reload resumes progress; stage 2 auto-starts');
 // Clear the final card of standard stage 2 using an isolated, deterministic board.
 await set({score:63000,deck:Array.from({length:52},(_,i)=>i),waste:12,removed:Array.from({length:27},(_,i)=>i+1),deadline:Date.now()+101000});
 await active.locator('[data-tri-card="0"]').click();
 for(const p of pages){await p.getByRole('heading',{name:'All Three Towers Cleared!'}).waitFor();assert(await p.locator('.tri-time-bonus').isVisible());}
 m=await get();const clearResult=m.state.stages.at(-1);assert(clearResult.score>=89000);assert.equal(clearResult.scoreBefore,24000);assert.equal(clearResult.stageScore,clearResult.score-24000);evidence.clearResult=clearResult;
 await Promise.all(pages.map(p=>p.getByRole('button',{name:'Take Score',exact:true}).waitFor()));m=await get();assert.equal(m.state.stage,3);assert.equal(m.state.turnIndex,0);
 await active.getByRole('button',{name:'Take Score',exact:true}).click();for(const p of pages)await p.getByRole('heading',{name:'Score Taken'}).waitFor();
 m=await get();assert.equal(m.state.stages.at(-1).stageScore,0);assert.equal(m.state.stages.at(-1).timeBonus,0);assert.equal(m.state.turnIndex,0);
 await watcher.getByRole('button',{name:'Start my turn'}).waitFor();m=await get();assert.equal(m.state.turnIndex,1);assert(m.state.deadline>Date.now()+29000);
 pass('Clear celebration/time bonus on both viewers; earned bonus auto-starts; final bonus hold completes before next human Ready');
 await watcher.getByRole('button',{name:'Start my turn'}).click();await watcher.getByRole('button',{name:'Give up',exact:true}).click();await watcher.getByRole('button',{name:'End turn',exact:true}).click();
 for(const p of pages)await p.getByRole('heading',{name:'Turn Ended'}).waitFor();
 await Promise.all(pages.map(p=>p.getByText('Settlement recorded.',{exact:false}).waitFor()));
 const result=(await admin.query('SELECT * FROM public.game_results WHERE dealer_game_id=$1',[dealer])).rows;assert.equal(result.length,1);
 const batches=(await admin.query('SELECT * FROM public.gameplay_transfer_batches WHERE dealer_game_id=$1',[dealer])).rows;assert.equal(batches.length,1);assert.deepEqual(batches[0].unmatched_deltas,{});
 const balances=(await admin.query('SELECT id,chips FROM public.players WHERE game_id=$1',[id])).rows;assert.deepEqual(balances.map(p=>Number(p.chips)).sort((a,b)=>a-b),[-5,5]);
 for(const p of [watcher,active]){const [response]=await Promise.all([p.waitForResponse(r=>r.url().includes('/__tri-test')&&r.request().postDataJSON()?.name==='tri_towers_close'),p.getByRole('button',{name:'Continue',exact:true}).click()]);assert.equal((await response.json()).error,null);}
 assert.equal((await admin.query('SELECT status FROM public.games WHERE id=$1',[id])).rows[0].status,'game_selection');assert.equal((await get()).finished,true);
 pass('Full competition: one canonical balanced batch/result, correct balances, both final views, idempotent return to normal setup');
 evidence.stages=(await get()).state.stages;assert.equal(new Set(evidence.stages.map(r=>r.id)).size,evidence.stages.length);
 await Promise.all(pages.map(p=>p.context().close()));
 // Fresh local session, then disconnect every browser. Real recovery owner runs all deadlines.
 const zId=uuid(),zUsers=[uuid(),uuid()],zPlayers=[uuid(),uuid()],zDeadline=new Date(Date.now()+600000).toISOString();
 await admin.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[zId,zDeadline]);
 for(let i=0;i<2;i++){await admin.query('INSERT INTO public.profiles(id,username) VALUES($1,$2)',[zUsers[i],`Zero ${i} ${zUsers[i].slice(0,8)}`]);await admin.query('INSERT INTO public.players(id,game_id,user_id,position,chips) VALUES($1,$2,$3,$4,0)',[zPlayers[i],zId,zUsers[i],2-i]);}
 const {actor}=await import('./polish-fixture.mjs');const zSetup=await actor(database,zUsers[0],"SELECT public.tri_towers_configure($1,$2,2,'tri-towers','{\"ante_amount\":5}',$3) v",[zId,zPlayers[0],zDeadline]);const zDealer=zSetup.dealer_game.id;
 let z=(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[zDealer])).rows[0];
 await actor(database,zUsers[1],"SELECT public.tri_towers_action($1,$2,$3,'start') v",[zDealer,uuid(),z.revision]);
 z=(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[zDealer])).rows[0];await actor(database,zUsers[1],"SELECT public.tri_towers_action($1,$2,$3,'take_score') v",[zDealer,uuid(),z.revision]);
 await new Promise(r=>setTimeout(r,10500));z=(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[zDealer])).rows[0];assert.equal(z.state.phase,'playing');assert.equal(z.state.stage,2);
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[zDealer]);await tick();z=(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[zDealer])).rows[0];assert.equal(z.state.phase,'stage_complete');
 await new Promise(r=>setTimeout(r,10500));z=(await admin.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[zDealer])).rows[0];assert.equal(z.state.phase,'ready');assert.equal(z.state.turnIndex,1);
 await admin.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[zDealer]);await tick();assert.equal((await admin.query('SELECT count(*) n FROM public.game_results WHERE dealer_game_id=$1',[zDealer])).rows[0].n,'1');
 pass('Zero connected browsers: full five-second holds, automatic stage start, timeout/handoff, next-player Ready expiry and one settlement');
 assert.deepEqual(errors,[]);await writeFile('qualification.local/tri-towers/polish-browser.json',JSON.stringify({passed,evidence,transport:'Production hook and authenticated SQL RPCs; local commit notifications replace Supabase Realtime. Existing recovery SQL scheduled by loopback harness.',productionWrites:0},null,2));
}catch(e){console.error('BROWSER PROOF FAILURE',e);throw e;}finally{clearInterval(recovery);for(const res of streams)res.end();await browser.close();await server.close();await admin.end();}
