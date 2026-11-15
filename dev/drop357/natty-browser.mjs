import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^drop357_v2_\d+$/.test(database??''))throw Error('Expected disposable database');
const carry=!process.argv.includes('--original'),polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15389,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/drop357-natty/browser';
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/drop357/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/drop357/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],receipts=new Map();
let latest;
const server=await createServer({configFile:false,cacheDir:'qualification.local/drop357/vite-'+port,plugins:[react(),{name:'lab-preview',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
    const path=req.url?.split('?')[0];
    if(path==='/api/arcade'||path==='/fixture/rpc'){
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      if(req.method!=='POST'||(req.headers.origin&&req.headers.origin!==origin)||req.headers.host!=='127.0.0.1:'+port){
        res.statusCode=403;return res.end('{}');
      }
      try{
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('request too large');}
        const input=JSON.parse(raw);
        if(path==='/fixture/rpc'){
          if(input.name!=='arcade_rules_help')throw Error('unsupported fixture read');
          const {rows}=await c.query("select config from private.arcade_rulesets where game='357-drop' and id=$1",[input.args.p_ruleset]);
          return res.end(JSON.stringify(rows[0]?.config??null));
        }
        if(!operation||req.headers.authorization!=='Bearer '+actor||input.game!=='357-drop')throw Error('unavailable');
        const response=apiLane.then(()=>operation(input));apiLane=response.catch(()=>{});
        return res.end(JSON.stringify(await response));
      }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
    }
    if(preview&&path==='/'){res.writeHead(302,{Location:'/arcade/357-drop'});return res.end();}
    if(!/^\/arcade(?:\/357-drop(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/drop357/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',cors:false,port,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='357-drop' and enabled");
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[carry?'357-drop/7':'357-drop/2']);
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_drop357_step','arcade_leaderboard'].includes(name));
    const entries=Object.entries(args);
    const sql='select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result';
    return (await c.query(sql,entries.map(([,value])=>value))).rows[0].result;
  };
  operation=async input=>{
    await c.query('savepoint local_request');
    try{
      if(input.op==='start')await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
      const value=await arcadeOperation(rpc,actor,'Lab',input);
      if(!preview){
        if(value.roundId)latest=value;
        if(value.result)receipts.set(value.round,value.result);
        log.push([input.op,input.intent?.type,value.phase,value.revision]);
      }
      await c.query('release savepoint local_request');return value;
    }catch(e){await c.query('rollback to local_request');await c.query('release savepoint local_request');throw e;}
  };

  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(origin+'/arcade/357-drop');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.locator('.drop357-page[data-phase="playing"]').waitFor({timeout:12000});
  const prefix=[48,16,35,38,47,34,8,39,43,11,49,44];
  const deck=[...prefix,...Array.from({length:52},(_,i)=>i).filter(i=>!prefix.includes(i))];
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('deck',$2::jsonb,'current',$3::integer) where id=$1",[latest.id,JSON.stringify(deck),deck[0]]);
  await page.reload();
  await page.locator('.drop357-page[data-phase="playing"]').waitFor();
  async function action(locator){
   const response=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');
   await locator.click();assert.equal((await response).status(),200);
  }
  const place=(lane,slot)=>action(page.getByRole('button',{name:'Place in '+lane+' lane slot '+slot,exact:true}));
  for(let slot=1;slot<=3;slot++)await place(3,slot);
  await page.locator('[data-lane="3"] [data-carry-choice="true"]').nth(1).click();
  await action(page.locator('[data-lane="3"]').getByRole('button',{name:'Confirm',exact:true}));
  for(let slot=2;slot<=5;slot++)await place(5,slot);
  await page.locator('[data-lane="5"] [data-carry-choice="true"]').nth(2).click();
  await page.locator('[data-lane="5"] [data-carry-choice="true"]').nth(4).click();
  await action(page.locator('[data-lane="5"]').getByRole('button',{name:'Confirm',exact:true}));
  for(let slot=3;slot<=7;slot++)await place(7,slot);
  const row=page.locator('[data-lane="7"]');
  await row.getByText('Natty +20%',{exact:true}).waitFor();
  assert.equal((await row.locator('.drop357-lane-result strong').innerText()).replaceAll(',',''),'1584');
  assert.deepEqual(latest.laneResults[2].selected,[0,2,3,5,6]);
  assert.deepEqual(latest.laneResults[2].vector,[5,12,10,7,6,2]);
  assert.equal(latest.laneResults[2].bonus,264);
  assert.equal(await row.locator('[data-selected="true"]').count(),5);
  assert.equal(await row.locator('[data-muted="true"]').count(),2);
  await page.screenshot({path:out+'/natural-flush-phone.png'});
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:out+'/natural-flush-landscape.png'});
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/browser.json',JSON.stringify({passed:true,ruleset:latest.ruleset,lanes:latest.laneResults,log,errors},null,2));
  console.log('PASS: native Edge browser → Arcade service → PostgreSQL → projection → Natty badge/1,584/selected five; portrait and landscape');
}catch(e){console.error(JSON.stringify({latest,errors,log:log.slice(-12),audio:browser?await browser.contexts()[0].pages()[0].evaluate(()=>window.audioEvents):[]}));if(browser)await browser.contexts()[0]?.pages()[0]?.screenshot({path:out+'/failure.png'});throw e;}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
