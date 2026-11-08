import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^ptown_polish_\d+$/.test(database??''))throw Error('Expected disposable database');
const v3=true,v2=true;
const preview=process.argv.includes('--preview'), port=(preview?15474:15473)+(v2?4:0);
const origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/'+(v2?'chucky-v2':'chucky-showdown')+'/browser';
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/chucky-showdown/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script>sessionStorage.setItem("showdown-local-user",${JSON.stringify(actor)});</script><script type="module" src="/dev/chucky-showdown/browser-entry.tsx"></script></body></html>`;
const server=await createServer({configFile:false,cacheDir:'qualification.local/chucky-showdown/vite',plugins:[react(),{name:'showdown-preview',configureServer(s){
  s.middlewares.use(async(req,res,next)=>{
    const path=req.url?.split('?')[0];
    if(path==='/api/arcade'||path==='/fixture/rpc'){
      if(req.method!=='POST'||req.headers.origin!==origin||req.headers.host!=='127.0.0.1:'+port){res.statusCode=403;return res.end();}
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>4096){res.statusCode=413;return res.end();}}
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      try{
        const input=JSON.parse(body);
        if(path==='/fixture/rpc'){
          if(input.name!=='arcade_rules_help'||!String(input.args?.p_ruleset).startsWith('chucky-showdown/'))return res.end('null');
          const result=await c.query("select config from private.arcade_rulesets where game='chucky-showdown' and id=$1",[input.args.p_ruleset]);
          return res.end(JSON.stringify(result.rows[0]?.config??null));
        }
        if(!operation||input.game!=='chucky-showdown'){res.statusCode=409;return res.end(JSON.stringify({error:'arcade:unavailable'}));}
        const task=apiLane.then(()=>operation(input));
        apiLane=task.catch(()=>{});
        return res.end(JSON.stringify(await task));
      }catch(e){console.error(e.message);res.statusCode=409;return res.end(JSON.stringify({error:e.message}));}
    }
    if(preview&&(path==='/'||path?.startsWith('/arcade/')&&!path.startsWith('/arcade/chucky-showdown')&&!path.startsWith('/arcade/approved-v1/'))){
      res.writeHead(302,{Location:'/arcade/chucky-showdown'});return res.end();
    }
    if(!/^\/arcade(?:\/chucky-showdown(?:\/run\/[a-f0-9-]+)?)?$/.test(path??''))return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(path,entry));
  });
}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:fixture},{find:'@/hooks/useAuthGuard',replacement:fixture},{find:'@',replacement:resolve('src')}]},
  optimizeDeps:{entries:['dev/chucky-showdown/browser-entry.tsx']},
  define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"local"',__APP_BUILD_SHA__:'"local"',__BUILD_TIMESTAMP__:'"local"'},
  server:{hmr:false,watch:null,host:'127.0.0.1',port,strictPort:true}});
let browser;
try{
  await c.query('begin');
  await c.query('insert into auth.users(id) values($1)',[actor]);
  await c.query('insert into public.account_access(user_id,enabled,ever_enabled) values($1,true,true) on conflict(user_id) do update set enabled=true,ever_enabled=true',[actor]);
  await c.query('insert into public.profiles(id,username,is_active) values($1,$2,true) on conflict(id) do update set is_active=true',[actor,'Showdown '+actor.slice(0,8)]);
  await c.query("update private.arcade_rulesets set enabled=false where game='chucky-showdown' and enabled");
  await c.query('update private.arcade_rulesets set enabled=true where id=$1',[v3?'chucky-showdown/3':v2?'chucky-showdown/2':'chucky-showdown/1']);
  // Script only the draw source, within the disposable transaction. All timing, outcome,
  // revisions, bank/timeout and result posting still run through the installed authority.
  if(!preview){
    const original=(await c.query("select pg_get_functiondef('public.holm_deterministic_chucky_cards(uuid,jsonb,integer)'::regprocedure) d")).rows[0].d;
    await c.query(original.replace('public.holm_deterministic_chucky_cards','pg_temp.random_draw'));
    await c.query(`create or replace function public.holm_deterministic_chucky_cards(p_round_id uuid,p_used_cards jsonb,p_card_count integer)
      returns jsonb language plpgsql volatile as $$declare symbols text[];mode text:=current_setting('app.showdown_cards',true);
      begin
        if mode='tie' then
          if jsonb_array_length(p_used_cards)=0 then symbols:=array['10♠','2♥','3♦','5♣'];
          elsif jsonb_array_length(p_used_cards)=4 then symbols:=array['A♠','K♥','Q♦','J♣'];
          else symbols:=array['10♥','8♣','7♥','5♠','4♣','3♣','2♠'];end if;
        elsif mode in ('win','crack') then
          if jsonb_array_length(p_used_cards)=0 then symbols:=case when mode='crack' then array['A♥','K♦','9♥','J♣'] else array['A♠','K♠','Q♠','J♠'] end;
          elsif jsonb_array_length(p_used_cards)=4 and mode='win' then symbols:=array['10♠','2♥','3♦','4♣'];
          elsif jsonb_array_length(p_used_cards)=4 then symbols:=array['2♠','2♥','2♦','4♣'];
          elsif mode='crack' then symbols:=array['2♣','5♥','6♦','7♣','8♠','9♥','10♦']; end if;
        end if;
        if symbols is null then return pg_temp.random_draw(p_round_id,p_used_cards,p_card_count); end if;
        return (select jsonb_agg(jsonb_build_object('rank',left(sym,-1),'suit',right(sym,1)) order by n)
          from unnest(symbols) with ordinality as t(sym,n) where n<=p_card_count);
      end $$`);
    await c.query("select set_config('app.showdown_cards','win',true)");
  }
  await server.listen();
  const {arcadeOperation}=await server.ssrLoadModule('/server/arcade/service.ts');
  const rpc=async(name,args)=>{
    assert.ok(['arcade_start','arcade_load','arcade_chucky_showdown_step','arcade_chucky_showdown_history','arcade_leaderboard'].includes(name));
    const entries=Object.entries(args);
    const sql='select public.'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result';
    return (await c.query(sql,entries.map(([,value])=>value))).rows[0].result;
  };
  operation=async(req)=>{
    if(req.op==='start')await c.query("update private.arcade_recovery_state set last_completed_at=clock_timestamp(),failure=null");
    // Rejected preview requests leave the outer rollback fixture usable.
    await c.query('savepoint preview_request');
    try{
      const value=await arcadeOperation(rpc,actor,'Local player',req);
      await c.query('release savepoint preview_request');
      return value;
    }catch(e){await c.query('rollback to savepoint preview_request');await c.query('release savepoint preview_request');throw e;}
  };
  if(preview){
    console.log('Chucky Showdown local preview — '+origin+'/arcade/chucky-showdown');
    await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
  }else{

    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    const phase=p=>page.locator('.cs-table[data-phase="'+p+'"]');
    await page.goto(origin+'/arcade/chucky-showdown');await page.getByRole('button',{name:'Play',exact:true}).click();await phase('fold_stay').waitFor();
    const before=await page.locator('.cs-player .cs-slot').first().boundingBox();
    await page.getByRole('button',{name:/STAY/}).click();await phase('choose').waitFor();const after=await page.locator('.cs-player .cs-slot').first().boundingBox();assert.ok(Math.abs(before.y-after.y)<1,JSON.stringify({before,after}));
    await page.getByRole('button',{name:'Level 1, 100 points, 2 uses remaining',exact:true}).click();await phase('win').waitFor();await phase('fold_stay').waitFor();
    for(let n=3;n>=1;n--){
      await page.getByRole('button',{name:/FOLD/}).click();await phase('fold').waitFor();const started=Date.now();assert.equal(await page.locator('.cs-player .cs-slot').count(),0);assert.equal(await page.locator('.cs-community .cs-slot').count(),4);await page.screenshot({path:out+'/rabbit-'+n+'.png'});
      await page.waitForTimeout(2200);assert.ok(await phase('fold').count());assert.equal(await page.locator('.cs-player .cs-slot').count(),0);
      if(n===1){await phase('round_over').waitFor();assert.ok(Date.now()-started>=2800);assert.equal(await page.locator('.cs-player .cs-slot').count(),0);await page.waitForTimeout(600);assert.equal(await page.locator('.cs-player .cs-slot').count(),0);await page.screenshot({path:out+'/last-fold-count.png'});}
      else await phase('fold_stay').waitFor();
    }
    await page.locator('.cs-table[data-round="2"][data-phase="fold_stay"]').waitFor();assert.equal(await page.locator('.cs-player .cs-slot').count(),4);assert.deepEqual(errors,[]);writeFileSync(out+'/polish-evidence.json',JSON.stringify({passed:true,stableHandY:before.y,rabbitMs:3000,finalFoldHidden:true,errors}));console.log('PASS fixed hand position, simultaneous rabbit reveal, three-second hold, hidden final-fold count and next hand');
  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
