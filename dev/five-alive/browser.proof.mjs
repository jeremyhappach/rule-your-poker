// Browser + actual API handlers + service + local SQL. Supabase Auth/Realtime
// are synthetic local fixtures; no production service or credentials are used.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../async-words/local.mjs';

const template='coordinated_scores_1794288498120',database='five_alive_browser_'+Date.now();
const admin=await connect('postgres');let db,server,browser,created=false;
const oldUrl=process.env.RUN21_SUPABASE_URL,oldKey=process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
try{
 assert.equal((await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[template])).rows[0].n,0);
 await admin.query(`CREATE DATABASE ${database} TEMPLATE ${template}`);created=true;db=await connect(database);
 for(const file of ['pool','arcade','async','notifications','registration']){
  if(file==='registration'){
   await db.query('ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check');
   await db.query("ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown'))");
  }
  await db.query(readFileSync(`supabase/five-alive/${file}.sql`,'utf8'));
 }
 const words=readFileSync('server/fiveAlive/answers.reviewed.txt','utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(' '));
 await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) SELECT 'esdb-five-alive/1',word,tier::int FROM unnest($1::text[],$2::text[]) x(word,tier)",[words.map(row=>row[0]),words.map(row=>row[1])]);
 await db.query("INSERT INTO private.five_alive_pool(version) VALUES('esdb-five-alive/1')");
 await db.query('UPDATE private.five_alive_release SET async_enabled=true,async_real_qualified=true');
 await db.query('UPDATE private.delayed_release SET admission_enabled=true,real_qualified=true');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 await db.query('UPDATE private.delayed_recovery_state SET enabled=true');
 await db.query("UPDATE private.arcade_rulesets SET enabled=true WHERE id='five-alive/1'");
 await db.query('UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL');
 const a=randomUUID(),b=randomUUID(),outsider=randomUUID(),tokens=new Map([[randomUUID(),a],[randomUUID(),b],[randomUUID(),outsider]]);
 const tokenFor=user=>[...tokens].find(([,id])=>id===user)[0];
 await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3)',[a,b,outsider]);
 await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=ANY($1::uuid[])',[[a,b,outsider]]);
 await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,'FA browser A',true),($2,'FA browser B',true),($3,'FA browser outsider',true) ON CONFLICT(id) DO UPDATE SET is_active=true",[a,b,outsider]);
 globalThis.fiveAliveFixture={actor:token=>tokens.get(token)??null,rpc:async(name,args)=>{
  const connection=await connect(database);
  try{
   await connection.query('SET ROLE service_role');
   const keys=Object.keys(args);return (await connection.query('SELECT public.'+name+'('+keys.map((key,i)=>key+'=> $'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value;
  }finally{await connection.end();}
 }};
 // The handlers require this fixed URL, but the SDK is replaced by the local
 // fixture above; this process never opens a connection to that URL.
 process.env.RUN21_SUPABASE_URL='https://xvhmbuppghwmwpwrkzao.supabase.co';process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY='local-fixture-only';
 let arcadeHandler,delayedHandler;const streams=new Set();
 const api={name:'five-alive-local-api',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url==='/fixture/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': connected\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;
  }
  if(req.url==='/api/arcade'||req.url==='/api/delayed'){
   const target=req.url,parts=[];for await(const chunk of req)parts.push(chunk);req.body=JSON.parse(Buffer.concat(parts).toString());
   const end=res.end;res.end=function(...args){
    const notify=req.body.op==='action'&&res.statusCode===200;const result=end.apply(this,args);
    if(notify){const table=target==='/api/arcade'?'arcade_revisions':'delayed_match_updates';for(const stream of streams)stream.write('data: '+JSON.stringify({table})+'\n\n');}
    return result;
   };
   return void (target==='/api/arcade'?arcadeHandler(req,res):delayedHandler(req,res));
  }
  return next();
 });}};
 server=await createServer({configFile:false,plugins:[react(),api],resolve:{alias:[
  {find:'@/integrations/supabase/client',replacement:resolve('dev/five-alive/browser/client.ts')},
  {find:'@supabase/supabase-js',replacement:resolve('dev/five-alive/browser/server-client.ts')},
  {find:'@',replacement:resolve('src')},
 ]},server:{host:'127.0.0.1',port:0},optimizeDeps:{entries:['dev/five-alive/browser/index.html']},appType:'spa'});
 arcadeHandler=(await server.ssrLoadModule('/api/arcade.ts')).default;
 delayedHandler=(await server.ssrLoadModule('/api/delayed.ts')).default;
 await server.listen();
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;
 const post=async(user,path,body)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokenFor(user)}:{})},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 };
 assert.equal((await post(null,'/api/arcade',{op:'leaderboard',game:'five-alive',window:'all'})).status,401);
 const invalidToken=await fetch(base+'/api/arcade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer invalid'},body:JSON.stringify({op:'leaderboard',game:'five-alive',window:'all'})});assert.equal(invalidToken.status,401);
 const start=await post(a,'/api/arcade',{op:'start',game:'five-alive',requestId:randomUUID()});assert.equal(start.status,200);
 const run=start.data.id,runGame=(await db.query('SELECT state FROM private.arcade_runs WHERE id=$1',[run])).rows[0].state;
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
 const match=(await db.query("SELECT public.delayed_create($1,$2,false,$3::jsonb) id",[randomUUID(),b,JSON.stringify([{game:'five-alive',stake:7}])])).rows[0].id;
 const hash=(await db.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[match])).rows[0].offer_hash;
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[b]);await db.query("SELECT public.delayed_respond($1,$2,$3,'accept')",[match,randomUUID(),hash]);
 const childRow=(await db.query('SELECT id,state FROM private.delayed_children WHERE match_id=$1',[match])).rows[0],child=childRow.id,answers=childRow.state.fiveAlive.answers;
 assert.equal((await post(outsider,'/api/delayed',{op:'state',game:'five-alive',childId:child,userId:a,actor:a})).status,409);
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 mkdirSync('qualification.local/five-alive/browser',{recursive:true});
 async function open(mode,user,id,matchId){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  page.on('pageerror',error=>console.error('browser:',error.message));
  page.setDefaultTimeout(10000);
  const params=new URLSearchParams({mode,user,id,token:tokenFor(user),...(matchId?{match:matchId}:{})});
  await page.goto(base+'/dev/five-alive/browser/index.html?'+params,{waitUntil:'domcontentloaded'});
  await page.getByLabel('Guess board').waitFor();return {context,page};
 }
 async function play(page,word){
  const pending=page.waitForResponse(response=>response.request().method()==='POST'&&/\/api\/(arcade|delayed)$/.test(response.url())&&response.request().postDataJSON()?.op==='action');
  await page.keyboard.type(word);await page.keyboard.press('Enter');
  const response=await pending;assert.equal(response.status(),200,await response.text());return response.json();
 }
 async function ready(page){await page.locator('.five-alive-keyboard button:not([disabled])').first().waitFor();}
 const refreshed=page=>page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/delayed')&&response.request().postDataJSON()?.op==='state'&&response.status()===200);
 const solo=await open('arcade',a,run);
 let p=await post(a,'/api/arcade',{op:'state',game:'five-alive',runId:run});
 assert.equal(JSON.stringify(p.data).includes(runGame.rounds[0].answer),false);
 const wrong=runGame.rounds[0].answer==='STONE'?'BREAD':'STONE';
 await play(solo.page,wrong);await ready(solo.page);await solo.page.reload({waitUntil:'domcontentloaded'});
 await solo.page.getByText('+700',{exact:true}).waitFor();await solo.page.waitForTimeout(500);
 await solo.page.route('**/api/arcade',route=>route.abort());
 await solo.page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await solo.page.getByRole('button',{name:'Reconnect'}).waitFor().catch(async error=>{console.error('offline UI:',await solo.page.locator('body').innerText());throw error;});
 await solo.page.unroute('**/api/arcade');await solo.page.getByRole('button',{name:'Reconnect'}).click();
 await solo.page.getByText('+700',{exact:true}).waitFor();await ready(solo.page);
 for(const item of runGame.rounds){await play(solo.page,item.answer);if(item!==runGame.rounds.at(-1))await ready(solo.page);}
 await solo.page.getByText('Game Over',{exact:true}).waitFor();
 await solo.page.getByRole('button',{name:'View Leaderboard'}).click();
 await solo.page.getByText('Leaderboard',{exact:true}).waitFor();
 await solo.page.getByText('Game Over',{exact:true}).waitFor();
 await solo.page.screenshot({path:'qualification.local/five-alive/browser/arcade-result.png'});
 console.log('PASS synthetic authenticated Arcade browser: private answer, guess resume, completion and real leaderboard route');
 const alice=await open('async',a,child,match),bob=await open('async',b,child,match);
 const bad=answers[0].word==='STONE'?'BREAD':'STONE';
 let bobRefresh=refreshed(bob.page);await play(alice.page,bad);await bobRefresh;await ready(alice.page);await alice.page.reload({waitUntil:'domcontentloaded'});await alice.page.getByText('+700',{exact:true}).waitFor();
 p=await post(b,'/api/delayed',{op:'state',game:'five-alive',childId:child});
 assert.equal(p.status,200);assert.deepEqual(p.data.view.current.guesses,[]);assert.equal(JSON.stringify(p.data).includes(answers[0].word),false);assert.equal(JSON.stringify(p.data).includes(bad),false);
 bobRefresh=refreshed(bob.page);await play(alice.page,answers[0].word);await bobRefresh;await alice.page.getByText('Waiting for the other player.').waitFor();
 p=await post(b,'/api/delayed',{op:'state',game:'five-alive',childId:child});
 assert.equal(p.data.view.opponentScore,0);assert.equal(JSON.stringify(p.data).includes(answers[0].word),false);assert.equal('ownResult' in p.data.view,false);
 const bobWrong=['STONE','BREAD','CLOUD'].find(word=>word!==bad&&word!==answers[0].word),aliceRefresh=refreshed(alice.page);
 await play(bob.page,bobWrong);await aliceRefresh;await ready(bob.page);
 p=await post(a,'/api/delayed',{op:'state',game:'five-alive',childId:child});
 assert.equal(JSON.stringify(p.data).includes(bobWrong),false);assert.equal(p.data.view.opponentScore,0);
 await play(bob.page,answers[0].word);await ready(bob.page);await alice.page.reload({waitUntil:'domcontentloaded'});await alice.page.getByText('Word 2 of 3').waitFor();
 for(let i=1;i<3;i++){
  bobRefresh=refreshed(bob.page);await play(alice.page,answers[i].word);await bobRefresh;await alice.page.getByText('Waiting for the other player.').waitFor();
  await play(bob.page,answers[i].word);
  if(i<2){await ready(bob.page);await alice.page.reload({waitUntil:'domcontentloaded'});await alice.page.getByText('Word 3 of 3').waitFor();}
 }
 await bob.page.getByText('Match complete').waitFor();await alice.page.reload({waitUntil:'domcontentloaded'});await alice.page.getByText('Match complete').waitFor();
 assert.equal(await alice.page.locator('.five-alive-history-word').count(),3);
 await alice.page.screenshot({path:'qualification.local/five-alive/browser/async-result.png'});
 console.log('PASS synthetic authenticated Async browser: sealed guesses/results, resume, unlocks and terminal results');
 await Promise.all([solo.context.close(),alice.context.close(),bob.context.close()]);
}finally{
 if(browser)await browser.close();if(server)await server.close();if(db)await db.end();
 delete globalThis.fiveAliveFixture;
 if(oldUrl===undefined)delete process.env.RUN21_SUPABASE_URL;else process.env.RUN21_SUPABASE_URL=oldUrl;
 if(oldKey===undefined)delete process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY;else process.env.RUN21_SUPABASE_SERVICE_ROLE_KEY=oldKey;
 if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
