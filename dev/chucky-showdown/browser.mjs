import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2];if(!/^chucky_showdown_v[123]_\d+$/.test(database??''))throw Error('Expected disposable database');
const v3=database.startsWith('chucky_showdown_v3_'),v2=v3||database.startsWith('chucky_showdown_v2_');
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
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[],log=[],layouts=[],played=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    let dropped=false;
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname!=='/api/arcade')return route.continue();
      const req=route.request().postDataJSON();
      const response=await route.fetch(),value=await response.json();
      log.push({op:req.op,action:req.intent?.type,phase:value.phase,revision:value.revision,due:value.due,hand:value.hand,chucky:value.chucky?.length});
      // Lose the first acknowledgement only after the database has committed it.
      if(!dropped&&req.intent?.type==='press'){dropped=true;return route.abort('connectionreset');}
      if(v2&&value.phase==='crack'&&req.op==='state')await new Promise(resolve=>setTimeout(resolve,360));
      await route.fulfill({response});
    });
    const button=name=>page.getByRole('button',{name,exact:true});
    const phase=p=>page.locator('.cs-table[data-phase="'+p+'"]');
    const act=async(name)=>{
      const ack=page.waitForResponse(r=>r.url().endsWith('/api/arcade')&&r.request().postDataJSON().op==='action');
      await button(name).click();assert.equal((await ack).status(),200);
    };
    if(v2){
      const {smokeV2}=await import(v3?(process.argv.includes('--release-sounds')?'./smoke-release.mjs':'./smoke-v3.mjs'):'./smoke-v2.mjs');
      await smokeV2({page,actor,c,origin,out,errors,log,act,phase,button});
    }else{
    const level=n=>'Level '+n+', '+(n*100)+' points';
    await page.goto('http://127.0.0.1:15473/arcade');
    const tile=page.getByRole('link',{name:'Chucky Showdown leaderboard'});
    await tile.waitFor();await tile.locator('img').evaluate(img=>img.decode());
    await button('Chucky Showdown rules and info').click();
    await page.getByText('Choose a showdown',{exact:true}).waitFor();
    await page.keyboard.press('Escape');await tile.click();await button('Play').click();
    await phase('decision').waitFor();
    const layout=async(width,height,label)=>{
      await page.setViewportSize({width,height});
      const sample=await page.evaluate(()=>{
        const rect=e=>{const {left,right,top,bottom,width,height}=e.getBoundingClientRect();return {left,right,top,bottom,width,height};};
        const rows=[...document.querySelectorAll('.cs-table>section')].map(rect);
        const controls=[...document.querySelectorAll('.cs-levels button,.cs-bank-actions button')].map(rect);
        const cards=[...document.querySelectorAll('.cs-card')].map(rect);
        return {rows,controls,cards};
      });
      await page.screenshot({path:out+'/'+label+'-'+width+'.png'});
      assert.equal(sample.rows.length,5);assert.equal(sample.controls.length,8);
      for(const b of [...sample.rows,...sample.controls,...sample.cards]){
        assert.ok(b.top>=0&&b.bottom<=height+1&&b.left>=0&&b.right<=width+1,JSON.stringify({width,height,b}));
      }
      assert.ok(sample.rows.every((r,i)=>i===0||r.top>=sample.rows[i-1].bottom-.5));
      assert.ok(sample.controls.every(r=>r.width>=30&&r.height>=24));
      assert.ok(sample.cards.every(r=>r.width>=20&&r.height>=27),JSON.stringify({width,height,sample}));
      layouts.push({width,height,label,card:sample.cards[0],rows:sample.rows});
    };
    for(const [w,h] of [[320,568],[390,844],[844,390],[667,375]])await layout(w,h,'decision');
    await page.setViewportSize({width:390,height:844});
    const privateCards=()=>page.locator('.cs-player .cs-card').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')));
    const first=await privateCards();
    await act(level(7));await phase('showdown').waitFor();
    await page.locator('.cs-dealer .cs-card').nth(6).waitFor();
    await layout(320,568,'seven-cards');await page.setViewportSize({width:390,height:844});
    await phase('win').waitFor();
    await page.screenshot({path:out+'/showdown-390.png'});
    // Next board tests a crack after the player has accumulated points.
    await c.query("select set_config('app.showdown_cards','crack',true)");
    await phase('decision').waitFor();
    assert.deepEqual(await privateCards(),first);
    assert.equal(await button(level(7)+', completed').isDisabled(),true);
    const at=log.at(-1).due;
    played.push(...await page.evaluate(()=>window.audioEvents));
    await page.reload();await phase('decision').waitFor();
    assert.equal(log.at(-1).due,at);assert.deepEqual(await page.evaluate(()=>window.audioEvents),[]);
    await page.getByRole('link',{name:'Back to Chucky Showdown leaderboard'}).click();
    await page.getByRole('link',{name:'Resume'}).click();
    await phase('decision').waitFor();assert.equal(log.at(-1).due,at);assert.deepEqual(await privateCards(),first);
    await act(level(1));await page.getByText('YOU GOT CRACKED!',{exact:true}).waitFor();
    await page.screenshot({path:out+'/cracked.png'});
    await c.query("select set_config('app.showdown_cards','win',true)");
    await phase('decision').waitFor();assert.equal(await phase('decision').getAttribute('data-hand'),'2');
    await button('Mute sounds').click();
    const muteCount=await page.evaluate(()=>window.audioEvents.length);
    await act(level(1));await phase('win').waitFor();await phase('decision').waitFor();
    assert.equal(await page.evaluate(()=>window.audioEvents.length),muteCount);
    await button('Unmute sounds').click();await act('Bank');await phase('payout').waitFor();
    await c.query("select set_config('app.showdown_cards','random',true)");
    for(let hand=3;hand<=8;hand++){
      await phase('decision').waitFor();assert.equal(await phase('decision').getAttribute('data-hand'),String(hand));
      await act('Bank');await phase('payout').waitFor();
    }
    await phase('decision').waitFor();assert.equal(await phase('decision').getAttribute('data-hand'),'9');
    const id=page.url().split('/').at(-1);
    await c.query("update private.arcade_runs set state=jsonb_set(state,'{due}',to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint+1800)) where id=$1",[id]);
    played.push(...await page.evaluate(()=>window.audioEvents));
    await page.reload();await phase('decision').waitFor();await page.getByRole('heading',{name:'My cards'}).click();
    await page.getByText('Time up · hand banked').waitFor();
    await page.getByText('TOTAL SCORE:',{exact:false}).waitFor();
    await page.getByText('Game Over',{exact:true}).waitFor();
    await page.locator('.leaderboard-achieved time').waitFor();
    await page.getByRole('tab',{name:'All Time'}).click();await page.locator('.leaderboard-achieved time').waitFor();
    await page.getByText('My score history',{exact:true}).click();await page.locator('details li time').waitFor();
    const saved=(await c.query("select score,final_state from private.arcade_results where run_id=$1",[id])).rows;
    assert.equal(saved.length,1);assert.equal(Number(saved[0].score),100);
    assert.equal(saved[0].final_state.results.length,3);
    assert.equal(await page.locator('.arcade-score-table tbody tr').first().locator('td').last().textContent(),'100');
    assert.deepEqual(errors,[]);
    played.push(...await page.evaluate(()=>window.audioEvents));
    writeFileSync(out+'/result.json',JSON.stringify({layouts,played,requests:log,score:100},null,2));
    for(const key of ['palette:slide:','palette:riffle:','palette:flip:',':count:','palette:cracked:','palette:chip:','palette:scorePost:'])
      assert.ok(played.some(id=>id.includes(key)),key+' missing '+JSON.stringify(played));
    const firstCommit=played.find(id=>id.includes('palette:chip:')&&id.endsWith(':commit'));
    const firstShowdown=firstCommit.split(':').slice(2,-1).join(':');
    for(let i=0;i<7;i++){
      assert.ok(played.includes('palette:slide:'+firstShowdown+':chucky'+i),'missing card placement '+i);
      assert.ok(played.includes('palette:flip:'+firstShowdown+':flip'+(i+1)),'missing individual flip '+i);
    }
    const bankCount=played.find(id=>id.includes(':count:payout:'));
    assert.ok(played.includes('palette:chip:'+bankCount.replace(':count:',':')+':payout'),'missing transfer before bank count');
    assert.equal(new Set(played).size,played.length);
    const presses=log.filter(r=>r.action==='press');
    assert.equal(presses[0].revision,presses[1].revision);
    console.log('PASS: Arcade tile, rules, actual service/SQL, four viewports, seven-card reveal, win/crack/bank/timeout, reload, mute and timestamped leaderboard/history.');
    }
  }
}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
