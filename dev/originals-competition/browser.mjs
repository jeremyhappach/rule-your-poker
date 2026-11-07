import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from 'playwright';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from '../quintzee/database.mjs';
const {database}=JSON.parse(read('qualification.local/originals/context.json')),c=await connect(database),users=[randomUUID(),randomUUID()],checks=[],errors=[];
const liveOnly=process.argv.includes('--live');const port=liveOnly?15490:15489;const origin='http://127.0.0.1:'+port,fixture=resolve('dev/originals-competition/browser-client.ts');let operation,lane=Promise.resolve(),browser,lastPage;
const queue=fn=>{const task=lane.then(fn);lane=task.catch(()=>{});return task;};
const sql=async(name,args={})=>{assert.match(name,/^(delayed_|originals_|platform_notification_)[a-z_]+$/);return(await c.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;};
const service=async(name,args)=>{await c.query('SET LOCAL ROLE service_role');const value=await sql(name,args);await c.query('RESET ROLE');return value;};
const authenticated=async(who,name,args)=>{await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[who]);await c.query('SET LOCAL ROLE authenticated');const value=await sql(name,args);await c.query('RESET ROLE');return value;};
const entry='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/originals-competition/browser-entry.tsx"></script></body></html>';
const server=await createServer({configFile:false,cacheDir:'qualification.local/originals/vite',plugins:[react(),{name:'originals-proof',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const path=req.url?.split('?')[0];if(path==='/fixture/rpc'||path==='/api/delayed'){
  let body='';for await(const part of req)body+=part;const data=JSON.parse(body),who=path==='/fixture/rpc'?req.headers['x-fixture-user']:req.headers.authorization?.replace('Bearer ','');
  res.setHeader('Content-Type','application/json');try{const result=await queue(async()=>{await c.query('SAVEPOINT request');try{const value=path==='/fixture/rpc'?await authenticated(who,data.name,data.args):await operation(who,data);await c.query('RELEASE SAVEPOINT request');return value;}catch(e){await c.query('ROLLBACK TO SAVEPOINT request');throw e;}});res.end(JSON.stringify(path==='/fixture/rpc'?{data:result,error:null}:result));}catch(e){res.statusCode=path==='/fixture/rpc'?200:409;res.end(JSON.stringify(path==='/fixture/rpc'?{data:null,error:{message:e.message}}:{error:e.message}));}return;
 }if(path?.startsWith('/delayed')||path?.startsWith('/live/')||path==='/choose'){res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));return;}next();});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},server:{hmr:false,watch:null,host:'127.0.0.1',port,strictPort:true}});
async function pageFor(who){const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});await context.addInitScript(who=>sessionStorage.setItem('originals-user',who),who);await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));lastPage=page;return page;}
try{
 await c.query('BEGIN');await c.query("UPDATE private.arcade_rulesets SET enabled=false WHERE game IN('crib-lab','chucky-showdown');UPDATE private.arcade_rulesets SET enabled=true WHERE id IN('crib-lab/2','chucky-showdown/3')");
 for(const file of ['gameplay','async','live-foundation','live'])await c.query(read('supabase/originals-competition/'+file+'.sql','utf8'));
 await c.query('UPDATE private.originals_release SET live_enabled=true,async_enabled=true,live_real_qualified=true,async_real_qualified=true');await c.query('UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true');await c.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 for(let i=0;i<2;i++){await c.query('INSERT INTO auth.users(id) VALUES($1)',[users[i]]);await c.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[users[i]]);await c.query('UPDATE public.profiles SET is_active=true,username=$2 WHERE id=$1',[users[i],'Originals browser '+i]);}
 await server.listen();const {delayedOperation}=await server.ssrLoadModule('/server/delayed/service.ts');operation=(who,data)=>delayedOperation(service,who,data);
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=await Promise.all(users.map(pageFor));
 for(const game of (liveOnly?[]:['crib-lab','chucky-showdown'])){
  const page=pages[0];lastPage=page;await page.goto(origin+'/delayed/new');await page.getByLabel('Game 1',{exact:true}).selectOption(game);await page.getByLabel('Opponent',{exact:true}).selectOption(users[1]);
  await queue(()=>c.query('UPDATE private.delayed_release SET admission_enabled=false'));await page.getByRole('button',{name:'Send Invitation',exact:true}).click();await page.getByRole('alert').filter({hasText:'delayed:admission_closed'}).waitFor();await queue(()=>c.query('UPDATE private.delayed_release SET admission_enabled=true'));await page.getByRole('button',{name:'Send Invitation',exact:true}).click();await page.waitForURL(origin+'/delayed');assert.equal(await page.getByText('Invitation sent',{exact:true}).count(),0);
  const match=await queue(async()=>(await c.query('SELECT id FROM private.delayed_matches WHERE organizer=$1 ORDER BY created_at DESC LIMIT 1',[users[0]])).rows[0].id);
  await pages[1].goto(origin+'/delayed/'+match);lastPage=pages[1];await pages[1].getByRole('button',{name:'Accept lineup and stakes',exact:true}).click();
  const child=await queue(async()=>(await c.query('SELECT * FROM private.delayed_children WHERE match_id=$1',[match])).rows[0]);
  for(let turn=0;turn<6;turn++){
   const current=await queue(async()=>(await c.query('SELECT actor FROM private.delayed_children WHERE id=$1',[child.id])).rows[0]);const p=pages[users.indexOf(current.actor)];lastPage=p;
   await p.goto(origin+'/delayed/'+match+'/play/'+child.id+'?start=1');
   const start=p.getByRole('button',{name:/^Start/});if(await start.count())await start.first().click();
   await p.locator(game==='crib-lab'?'.lab-table[data-phase=discard]':'.cs-table[data-phase=fold_stay]').waitFor({timeout:90000});
   if(game==='crib-lab'){await p.getByRole('group',{name:'Hand 1',exact:true}).getByRole('button').first().click();}else{await p.getByRole('button',{name:'FOLD (3 remaining)',exact:true}).click();await p.getByRole('button',{name:'FOLD (2 remaining)',exact:true}).waitFor();}
   await queue(()=>c.query("UPDATE private.delayed_children SET state=jsonb_set(jsonb_set(state,'{board}',private.originals_shift(state->'board',-3600000)),'{segmentStartedAt}',to_jsonb((state->>'segmentStartedAt')::bigint-3600000)),available_at=available_at-interval '1 hour',last_call_at=last_call_at-interval '1 hour',expires_at=expires_at-interval '1 hour',started_at=started_at-interval '1 hour',gameplay_due_at=gameplay_due_at-interval '1 hour' WHERE id=$1",[child.id]));
   const resolved=await queue(()=>operation(current.actor,{op:'state',game,childId:child.id}));assert.ok(turn===5?resolved.terminal:resolved.actor!==current.actor);await p.goto(origin+'/delayed/'+match);
  }
  assert.equal(await queue(async()=>(await c.query('SELECT status FROM private.delayed_matches WHERE id=$1',[match])).rows[0].status),'settled');
  checks.push({game,mode:'async',picker:true,send:true,accept:true,boards:6,handoffs:5,settled:true});
 }

 if(liveOnly)for(const game of ['crib-lab','chucky-showdown']){
  const p=pages[0];lastPage=p;await p.goto(origin+'/choose');await p.getByText('Other',{exact:true}).click();await p.locator('[data-dealer-game-option="'+game+'"]').click();await p.getByText('Selected '+game,{exact:true}).waitFor();
  const g=randomUUID(),ids=[randomUUID(),randomUUID()],offer=new Date(Date.now()+600000).toISOString();
  const id=await queue(async()=>{await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,2,$2,0,false,false)",[g,offer]);for(let i=0;i<2;i++)await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[ids[i],g,users[i],2-i]);
   const setup=await authenticated(users[0],'originals_configure',{p_game_id:g,p_dealer_player_id:ids[0],p_expected_dealer_position:2,p_game_type:game,p_config:{ante_amount:5},p_expected_config_deadline:offer});await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[users[1]]);await c.query("SELECT public.submit_ante_decision($1,$2,$3,'ante_up')",[g,setup.dealer_game.id,ids[1]]);await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[g]);return setup.dealer_game.id;});
  await p.goto(origin+'/live/'+id);await p.locator(game==='crib-lab'?'.lab-table':'.cs-table').waitFor();
  if(game==='crib-lab')await p.getByRole('group',{name:'Hand 1',exact:true}).getByRole('button').first().click();else{await p.getByRole('button',{name:'FOLD (3 remaining)',exact:true}).click();await p.getByRole('button',{name:'FOLD (2 remaining)',exact:true}).waitFor();}
  await p.screenshot({path:'qualification.local/originals/live-'+game+'.png'});
  await queue(()=>c.query('UPDATE private.originals_live_matches SET state=private.originals_shift(state,-3600000) WHERE dealer_game_id=$1',[id]));
  await p.reload();await p.locator(game==='crib-lab'?'.lab-table[data-phase=scoring]':'.cs-table[data-phase=round_over]').waitFor();
  await p.screenshot({path:'qualification.local/originals/live-final-'+game+'.png'});
  const result=await queue(async()=>(await c.query('SELECT settlement,finished FROM private.originals_live_matches WHERE dealer_game_id=$1',[id])).rows[0]);assert.ok(result.settlement);
  if(game==='chucky-showdown')await p.getByRole('heading',{name:'Session Ended',exact:true}).waitFor({timeout:15000});
  checks.push({game,mode:'live',pickerOther:true,selection:true,setupConsent:true,legalAction:true,earnedCompletedBoard:true,settlement:true,fullGameShell:false});
 }
 assert.deepEqual(errors,[]);write('qualification.local/originals/'+(liveOnly?'live-browser':'browser')+'.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){if(lastPage){console.error((await lastPage.locator('body').innerText()).slice(0,5000));await lastPage.screenshot({path:'qualification.local/originals/browser-failure.png'});}console.error(errors);throw e;}
finally{await browser?.close();await server.close();await c.query('ROLLBACK');await c.end();}
