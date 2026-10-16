import {createServer} from 'vite';import react from '@vitejs/plugin-react-swc';import {chromium} from '@playwright/test';
import {connect,fixture,state,actor,balances,configure} from './bots-fixture.mjs';
import {resolve} from 'node:path';import {writeFile,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {database}=JSON.parse(await readFile('qualification.local/tri-towers/v2-context.json','utf8'));
const admin=await connect(database),streams=new Set(),errors=[],passed=[],evidence={database},requests=[];let f;
const calls={tri_towers_snapshot:['p_dealer_game_id'],tri_towers_action:['p_dealer_game_id','p_request_id','p_revision','p_action','p_index'],tri_towers_close:['p_dealer_game_id'],tri_towers_history:['p_dealer_game_id']};
await admin.query(`CREATE OR REPLACE FUNCTION public.tri_v2_local_notify() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n jsonb; BEGIN
 n:=to_jsonb(NEW);n:=CASE TG_TABLE_NAME WHEN 'players' THEN jsonb_build_object('id',n->'id','game_id',n->'game_id','position',n->'position','chips',n->'chips','chip_transfer_cursor',n->'chip_transfer_cursor')
 WHEN 'games' THEN jsonb_build_object('id',n->'id','pot',n->'pot','pot_transfer_cursor',n->'pot_transfer_cursor') ELSE n END;
 PERFORM pg_notify('tri_v2_browser',jsonb_build_object('schema','public','table',TG_TABLE_NAME,'eventType',TG_OP,'new',n)::text);RETURN NEW;END $$;
 DROP TRIGGER IF EXISTS tri_v2_local_notify ON public.tri_towers_revisions;CREATE TRIGGER tri_v2_local_notify AFTER INSERT OR UPDATE ON public.tri_towers_revisions FOR EACH ROW EXECUTE FUNCTION public.tri_v2_local_notify();
 DROP TRIGGER IF EXISTS tri_v2_local_notify ON public.players;CREATE TRIGGER tri_v2_local_notify AFTER INSERT OR UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.tri_v2_local_notify();
 DROP TRIGGER IF EXISTS tri_v2_local_notify ON public.games;CREATE TRIGGER tri_v2_local_notify AFTER INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.tri_v2_local_notify();
 DROP TRIGGER IF EXISTS tri_v2_local_notify ON public.gameplay_transfer_batches;CREATE TRIGGER tri_v2_local_notify AFTER INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION public.tri_v2_local_notify();`);
await admin.query('LISTEN tri_v2_browser');admin.on('notification',e=>{for(const res of streams)res.write('data: '+e.payload+'\n\n');});
const plugin={name:'tri-v2-proof',configureServer(server){server.middlewares.use('/__tri-test',async(req,res)=>{
 if(req.url==='/events'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 try{let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body);assert.equal(q.user,f.users[0]);let data;
 if(req.url==='/rpc'){assert(q.name in calls);const values=calls[q.name].map(k=>q.args[k]);data=await actor(database,q.user,`SELECT public.${q.name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) v`,values);requests.push({name:q.name,action:q.args.p_action});}
 else {if(!['players','games','gameplay_transfer_batches'].includes(q.table))data=q.single?null:[];else{const params=[f.id],conditions=[q.table==='games'?'id=$1':'game_id=$1'];for(const [k,v]of Object.entries(q.filters)){assert(['id','game_id','cursor'].includes(k));params.push(v);conditions.push(`${k}=$${params.length}`);}const rows=(await admin.query(`SELECT * FROM public.${q.table} WHERE ${conditions.join(' AND ')}`,params)).rows;data=q.single?rows[0]??null:rows;}}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message}}));}});}};
const server=await createServer({configFile:false,plugins:[react(),plugin],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/tri-towers/v2-local-client.ts')},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},server:{host:'127.0.0.1',port:5181,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),pages=[];
async function open(width=390,height=844){const ctx=await browser.newContext({viewport:{width,height}}),page=await ctx.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1:5181)/,r=>r.fulfill({status:200,body:'[]'}));
 await page.addInitScript(()=>{window.__flights=[];new MutationObserver(()=>{for(const el of document.querySelectorAll('[data-chip-transport-intent]')){const id=el.getAttribute('data-chip-transport-intent');if(!window.__flights.includes(id))window.__flights.push(id);}}).observe(document,{childList:true,subtree:true});});
 await page.goto(`http://127.0.0.1:5181/dev/tri-towers/live.html?dealer=${f.dealer}&user=${f.users[0]}&session=${f.id}`,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-tri-towers]').waitFor({timeout:120000});return page;}
const pass=s=>{passed.push(s);console.log('PASS',s);};
async function until(fn,ms=180000){const start=Date.now();while(Date.now()-start<ms){const m=await state(admin,f);if(await fn(m))return m;await new Promise(r=>setTimeout(r,250));}throw Error('browser authority timeout');}
try{
 f=await fixture(admin,database);const phone=await open(),desktop=await open(1440,900);await phone.locator('[data-tri-towers][data-phase="playing"]').waitFor();
 const frames=[];for(let i=0;i<8;i++){frames.push({at:Date.now(),revision:(await state(admin,f)).revision,cards:await phone.locator('[data-tri-card]').count()});assert.equal(await phone.getByRole('button',{name:'Take Score',exact:true}).count(),0);await phone.waitForTimeout(1000);}
 assert(new Set(frames.map(x=>x.revision)).size>=5);assert(frames.at(-1).revision-frames[0].revision<=10);evidence.frames=frames;
 await phone.screenshot({path:'qualification.local/tri-towers/v2-iphone.png'});await desktop.screenshot({path:'qualification.local/tri-towers/v2-desktop.png'});pass('Progressive bot moves on phone/desktop; spectators have no Take Score');
 for(let round=1;round<=2;round++){
  await until(m=>m.state.phase==='ready'&&!m.state.players[m.state.turnIndex].isBot&&m.state.stage===round);
  await phone.locator('[data-tri-towers][data-phase="ready"][data-turn="active"]').waitFor();assert.equal(await phone.getByRole('button',{name:'Start my turn'}).count(),0);
  let legal=phone.locator('[data-tri-card][data-legal="true"]:enabled');const at=Date.now();if(await legal.count())await legal.first().click();else await phone.locator('.tri-stock').click();
  let m=await until(m=>m.state.phase==='playing');assert(m.state.deadline-at>=119000);assert(m.state.deadline-at<=122000);
  for(let i=0;i<5;i++){legal=phone.locator('[data-tri-card][data-legal="true"]:enabled');if(await legal.count()){await legal.first().click();break;}await phone.locator('.tri-stock:enabled').click();await phone.waitForTimeout(150);}
  await until(m=>m.state.removed.length>0);await desktop.locator('[data-tri-towers][data-phase="playing"][data-turn="active"]').waitFor();
  assert.equal(await phone.getByRole('button',{name:'Take Score',exact:true}).count(),1);assert.equal(await phone.getByRole('button',{name:/give up/i}).count(),0);
  if(round===1){await phone.screenshot({path:'qualification.local/tri-towers/v2-human-iphone.png'});await phone.setViewportSize({width:844,height:390});await phone.screenshot({path:'qualification.local/tri-towers/v2-landscape.png'});await phone.setViewportSize({width:390,height:844});}
  await phone.getByRole('button',{name:'Take Score',exact:true}).click();m=await until(m=>m.state.phase==='stage_complete');assert.equal(m.state.deadline-m.state.stages.at(-1).completedAt,5000);
  pass(`Round ${round}: first action admits full clock, real card touch succeeds, Take Score holds five seconds`);
 }
 const final=await until(m=>!!m.settlement),settled=await balances(admin,f);await phone.getByRole('button',{name:'Continue',exact:true}).waitFor();await until(async()=>await phone.getByRole('button',{name:'Continue',exact:true}).isEnabled(),15000);
 for(const p of settled)assert.equal(await phone.locator(`[data-tri-balance="${p.id}"]`).textContent(),`${p.chips} chips`);
 const flights=await phone.evaluate(()=>window.__flights);assert.equal(flights.length,Object.values(final.settlement).some(x=>x!==0)?1:0);evidence.flights=flights;evidence.balances=settled;evidence.settlement=final.settlement;
 await phone.reload();await phone.locator('[data-tri-towers][data-phase="complete"]').waitFor();await phone.waitForTimeout(1200);assert.deepEqual(await phone.evaluate(()=>window.__flights),[]);
 await phone.getByRole('button',{name:'Continue',exact:true}).click();await until(m=>m.finished,10000);assert.deepEqual(await balances(admin,f),settled);await configure(database,f);assert.deepEqual(await balances(admin,f),settled);
 pass('Canonical balances and one chip flight; reload does not replay it; Continue and Run Back preserve balances');
 assert.deepEqual(errors,[]);evidence.passed=passed;evidence.requests=requests;evidence.productionWrites=0;await writeFile('qualification.local/tri-towers/v2-browser.json',JSON.stringify(evidence,null,2));
}catch(e){await writeFile('qualification.local/tri-towers/v2-browser-failure.json',JSON.stringify({error:e.message,errors,requests,body:await pages[0]?.locator('body').innerText(),flights:await pages[0]?.evaluate(()=>window.__flights)},null,2));throw e;
}finally{await Promise.all(pages.map(p=>p.context().close()));await browser.close();for(const res of streams)res.end();await server.close();await admin.end();}
