import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=JSON.parse(readFileSync('qualification.local/arcade-smoke/context.json')).database;if(!/^arcade_smoke_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=true,preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15389,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/horses-blitz/'+(polish?'polish-browser':'browser');
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/horses-blitz/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/horses-blitz/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],receipts=new Map();
let latest;
const server=await createServer({configFile:false,cacheDir:'qualification.local/horses-blitz/vite-'+port,plugins:[react(),{name:'lab-preview',configureServer(s){
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
          const {rows}=await c.query("select config from private.arcade_rulesets where game='horses-blitz' and id=$1",[input.args.p_ruleset]);
          return res.end(JSON.stringify(rows[0]?.config??null));
        }
        if(!operation||req.headers.authorization!=='Bearer '+actor||input.game!=='horses-blitz')throw Error('unavailable');
        const response=apiLane.then(()=>operation(input));apiLane=response.catch(()=>{});
        return res.end(JSON.stringify(await response));
      }catch(e){res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
    }
    if(preview&&path==='/'){res.writeHead(302,{Location:'/arcade/horses-blitz'});return res.end();}
    if(!/^\/arcade(?:\/horses-blitz(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/horses-blitz/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',cors:false,port,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Lab '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='horses-blitz' and enabled");
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[polish?'horses-blitz/3':'horses-blitz/1']);
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_horses_blitz_step','arcade_leaderboard'].includes(name));
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
  if(preview){
    console.log('Local Crib Lab preview: '+origin+'/arcade/horses-blitz');
    await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
  }else{

  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(origin+'/arcade/horses-blitz');await page.getByRole('button',{name:'Play',exact:true}).click();
  const roll=async()=>{await page.locator('.hb-roll').click();await page.getByText('Rolling…',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…');};
  await roll();
  for(const [width,height] of [[320,568],[375,667],[390,844]]){
   await page.setViewportSize({width,height});const bounds=await page.locator('.hb-die').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();const p=[...n.querySelectorAll('i')].map(i=>i.getBoundingClientRect());return {w:b.width,h:b.height,inside:p.every(r=>r.left>=b.left&&r.top>=b.top&&r.right<=b.right&&r.bottom<=b.bottom)};}));
   assert.equal(bounds.length,5);assert.ok(bounds.every(b=>Math.abs(b.w-b.h)<1&&b.inside),JSON.stringify(bounds));await page.screenshot({path:out+'/square-'+width+'.png'});
  }
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1)) where id=$1",[latest.id]);
  await page.reload();await page.locator('.hb-bank').filter({hasText:'390'}).waitFor();for(let i=0;i<5;i++)await page.locator('.hb-die').nth(i).click();
  await roll();assert.equal(latest.set.points,225);await page.waitForFunction(()=>document.querySelector('.hb-bank strong')?.textContent==='225');
  await roll();assert.equal(latest.roll,3);assert.equal(latest.phase,'playing');assert.equal(latest.set.points,90);await page.waitForFunction(()=>document.querySelector('.hb-bank strong')?.textContent==='90');assert.ok(await page.locator('.hb-roll').isDisabled());assert.ok(await page.locator('.hb-bank').isEnabled());
  const hand=latest.handId;await page.waitForTimeout(1200);assert.equal(latest.handId,hand);await page.screenshot({path:out+'/third-roll-manual-hold.png'});
  await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':2'));assert.equal(latest.hand,2);assert.equal(latest.base,90);await roll();
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[2,3,4,5,6]'::jsonb,'set',private.horses_blitz_set('[2,3,4,5,6]',1)) where id=$1",[latest.id]);await page.reload();await page.locator('.hb-die').first().waitFor();for(let i=0;i<5;i++)await page.locator('.hb-die').nth(i).click();await roll();await roll();assert.equal(latest.set.points,0);assert.equal(latest.phase,'playing');assert.ok(await page.locator('.hb-bank').isEnabled());await page.screenshot({path:out+'/zero-manual-bank.png'});await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':3'));
  await roll();await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1)) where id=$1",[latest.id]);await page.reload();await page.locator('.hb-bank').filter({hasText:'390'}).waitFor();
  const rollDef=(await c.query("select pg_get_functiondef('private.horses_blitz_roll(jsonb,integer[])'::regprocedure) d")).rows[0].d;await c.query(rollDef.replace('get_byte(extensions.gen_random_bytes(1),0)','5'));
  await roll();assert.equal(latest.set.points,1000);const presented=Number((await page.locator('.hb-bank strong').textContent()).replaceAll(',',''));assert.ok(presented>=390&&presented<1000);await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-bank-award')?.textContent==='+1,000');assert.equal(latest.bank.points,1000,'tap during count banks newest quote');
  assert.deepEqual(errors,[]);writeFileSync(out+'/smoke-evidence.json',JSON.stringify({passed:true,squareDice:true,fallingOffers:[390,225,90],manualThirdRoll:true,zeroBank:true,errors},null,2));console.log('PASS square dice/pip containment, decreasing full offers, third-roll hold, manual zero bank, next-hand progression');
  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
