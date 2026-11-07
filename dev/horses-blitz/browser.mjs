import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=JSON.parse(readFileSync('qualification.local/horses-blitz/context.json')).database;if(!/^horses_blitz_v1_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=process.argv.includes('--polish'),preview=process.argv.includes('--preview');
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
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[polish?'horses-blitz/2':'horses-blitz/1']);
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
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const button=name=>page.getByRole('button',{name,exact:true});
  const phase=p=>page.locator('.lab-table[data-phase="'+p+'"]');
  const action=async(name)=>{const confirmed=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');await button(name).click();assert.equal((await confirmed).status(),200);};
  const card=async(h,i,commit=true)=>{
    const el=page.locator('.lab-row').nth(h).locator('.lab-card').nth(i);
    const ack=commit?page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action'):null;
    await el.click();if(ack)assert.equal((await ack).status(),200);
  };

  await page.goto(origin+'/arcade');
  const tile=page.getByRole('link',{name:'Horses Blitz leaderboard'});
  await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
  const tileBounds=await tile.boundingBox();assert.ok(Math.abs(tileBounds.width/tileBounds.height-1466/564)<.02);
  await page.screenshot({path:out+'/tile.png'});
  await button('Horses Blitz rules and info').click();await page.getByText('Three rounds. Ten hands each.',{exact:false}).waitFor();
  await page.keyboard.press('Escape');await tile.click();await button('Play').click();
  await page.locator('.hb-die').first().waitFor();
  for(const [width,height] of [[320,568],[375,667],[390,844],[667,375],[844,390],[1280,720]]){
   await page.setViewportSize({width,height});
   const bounds=await page.locator('.hb-die,.hb-actions button,.hb-status,.hb-base').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert.ok(bounds.every(r=>r.x>=-1&&r.y>=-1&&r.x+r.w<=width+1&&r.y+r.h<=height+1&&r.w>0&&r.h>0),JSON.stringify({width,height,bounds}));
   assert.equal(await page.locator('.hb-die').count(),5);layouts.push({width,height,bounds});await page.screenshot({path:out+'/board-'+width+'.png'});
  }
  await page.setViewportSize({width:320,height:568});
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1)) where id=$1",[latest.id]);
  await page.reload();await button('Bank 390').waitFor();
  await page.locator('.hb-die').nth(0).click();await page.locator('.hb-die').nth(1).click();await page.locator('.hb-die').nth(2).click();
  assert.equal(await page.locator('.hb-die[data-held=true]').count(),3);assert.equal(await page.locator('.hb-die[data-wild=true]').count(),1);
  await page.screenshot({path:out+'/example.png'});
  await action('Roll 2');assert.deepEqual(latest.dice.slice(0,3),[1,4,4]);assert.equal(latest.roll,2);
  const beforeReload=latest;await page.reload();await page.locator('.hb-die').first().waitFor();assert.equal(latest.deadline,beforeReload.deadline);assert.deepEqual(latest.held,[0,1,2]);
  let dropReplies=2;
  const loseReply=async route=>{const input=route.request().postDataJSON();if(input.op==='action'&&input.intent.type==='bank'&&dropReplies>0){dropReplies--;await route.fetch();await route.abort('failed');}else await route.continue();};
  await page.route('**/api/arcade',loseReply);await page.locator('.hb-bank').click();await button('Reconnect').waitFor();
  await page.unroute('**/api/arcade',loseReply);await button('Reconnect').click();await page.waitForFunction(()=>document.querySelector('.hb-board')?.getAttribute('data-phase')==='playing');
  assert.equal(latest.hand,2);assert.equal(await page.locator('.hb-die[data-held=true]').count(),0);
  for(let round=1;round<=3;round++){
   while(latest.round===round&&latest.phase!=='summary'){
    await page.locator('.hb-board[data-phase=playing]').waitFor();
    const hand=latest.hand;
    if(latest.set.points>0){await action('Bank '+latest.set.points.toLocaleString());}
    else await action('Roll '+(latest.roll+1));
    if(latest.phase==='banking')await page.waitForFunction(old=>{const el=document.querySelector('.hb-board');return el?.getAttribute('data-phase')==='summary'||document.querySelector('.hb-hand')?.getAttribute('data-hand')!==old;},latest.handId);
    if(hand===10&&latest.phase==='summary')break;
   }
   assert.equal(latest.phase,'summary');assert.equal(latest.round,round);receipts.set(round,latest.result);
   await page.screenshot({path:out+'/summary-'+round+'.png'});
   if(round<3){
    const old=latest;await page.reload();await button('Next Round').waitFor();assert.equal(latest.round,round);assert.deepEqual(latest.result,old.result);
    await button('Next Round').evaluate(el=>{el.click();el.click();el.click();});
    await page.locator('.hb-board[data-phase=playing]').waitFor();assert.equal(latest.round,round+1);assert.equal(latest.hand,1);
   }
  }
  assert.equal(latest.status,'completed');assert.equal(latest.score,[...receipts.values()].reduce((n,r)=>n+r.total,0));
  await button('Play Again').waitFor({timeout:12000});
  assert.equal((await c.query('select count(*)::int n from private.arcade_results where user_id=$1',[actor])).rows[0].n,1);
  await button('Play Again').click();await page.locator('.hb-die').first().waitFor();
  await button('Mute sounds').click();await button('Unmute sounds').waitFor();await button('Unmute sounds').click();
  await button('Abandon run').click();await button('Keep Playing').click();assert.equal(latest.status,'active');
  await button('Abandon run').click();await action('Abandon Game');await button('Play Again').waitFor();
  assert.deepEqual(errors,[]);writeFileSync(out+'/evidence.json',JSON.stringify({layouts,log,rounds:[...receipts.values()],errors},null,2));
  console.log('PASS — three rounds, sample holds, lost bank response, summaries, burst Next Round, leaderboard, mute, abandon and six layouts');
  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
