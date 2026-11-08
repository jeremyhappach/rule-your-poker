import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {connect} from '../quintzee/database.mjs';

const database=process.argv[2]??JSON.parse(readFileSync('qualification.local/ptown-polish/context.json')).database;if(!/^ptown_polish_\d+$/.test(database??''))throw Error('Expected disposable database');
const polish=true,preview=process.argv.includes('--preview');
const port=preview?Number(process.env.CRIB_LAB_PREVIEW_PORT??15370):polish?15371:15389,origin='http://127.0.0.1:'+port;
let operation,apiLane=Promise.resolve();
const c=await connect(database),actor=randomUUID(),out='qualification.local/horses-blitz/'+(polish?'polish-browser':'browser');
mkdirSync(out,{recursive:true});
const fixture=resolve('dev/horses-blitz/browser-client.ts');
const entry=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><script>sessionStorage.setItem("lab-proof-user",${JSON.stringify(actor)})</script><div id="root"></div><script type="module" src="/dev/horses-blitz/browser-entry.tsx"></script></body></html>`;
const errors=[],log=[],layouts=[],played=[],commands=[],receipts=new Map();
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
  await c.query("update private.arcade_rulesets set enabled=true where id=$1",[polish?'horses-blitz/4':'horses-blitz/1']);
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
        if(input.intent)commands.push(input);
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
  if(process.argv.includes('--notes')){
   const samples=[];
   const measure=()=>page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    const note=document.querySelector('.hb-bonus-note'),lines=[...note.children];
    return {note:rect('.hb-bonus-note'),dice:rect('.hb-dice'),result:rect('.hb-set'),hand:rect('.hb-hand'),lines:lines.map(n=>({text:n.textContent,height:n.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(n).lineHeight),fits:n.scrollWidth<=n.clientWidth})),align:getComputedStyle(note).textAlign,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   for(const [width,height] of [[320,568],[375,667],[390,844],[393,852],[430,932]]){
    await page.setViewportSize({width,height});await page.goto(origin+'/arcade/horses-blitz');await page.getByRole('button',{name:'Play',exact:true}).click();await page.locator('.hb-roll').waitFor();await page.evaluate(async()=>{await document.fonts.ready;const image=new Image();image.src='/arcade/approved-v1/horses-blitz-trackside.png';await image.decode();});
    const states=[];
    const capture=async state=>{const g=await measure();states.push({state,...g});assert.deepEqual(g.lines.map(x=>x.text),['Early Bank Bonus · Roll 1 +30% · Roll 2 +10%','Natty earns +20%']);assert.ok(g.lines.every(x=>x.fits&&Math.abs(x.height-x.lineHeight)<1),JSON.stringify(g));assert.equal(g.align,'center');assert.ok(Math.abs(g.dice.w-g.hand.w)<1,'dice retain full available width');assert.ok(Math.abs(g.note.x+g.note.w/2-g.dice.x-g.dice.w/2)<1);assert.ok(g.dice.y-g.note.bottom>=16,JSON.stringify(g));assert.equal(g.overflow,false);await page.screenshot({path:out+'/notes-'+width+'-'+state+'.png'});};
    await capture('before-roll');assert.equal(await page.locator('.hb-die').count(),0);
    await page.locator('.hb-roll').click();await page.getByText('Rolling…',{exact:true}).waitFor();await capture('rolling');
    await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…'&&!document.querySelector('.hb-bank').disabled);await capture('settled');assert.equal(await page.locator('.hb-die').count(),5);
    await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':2'));await capture('next-hand');assert.equal(await page.locator('.hb-die').count(),0);
    const initial=states[0];for(const g of states)for(const part of ['note','dice','result'])for(const coordinate of ['x','y','w','h'])assert.ok(Math.abs(g[part][coordinate]-initial[part][coordinate])<.1,JSON.stringify({width,state:g.state,part,coordinate,initial:initial[part],actual:g[part]}));
    samples.push({width,height,states});const id=latest.id;await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon Game',exact:true}).click();await page.waitForURL(origin+'/arcade/horses-blitz?result='+id);
   }
   assert.deepEqual(errors,[]);writeFileSync(out+'/notes-layout.json',JSON.stringify({passed:true,physicalIPhone:false,samples},null,2));console.log('PASS: 5 phone sizes × before Roll (1), animation, settled, next hand; exact two lines, no wrapping/overflow, centered, stable note/dice/result bounds');
  }else{
  const acceptance=[];
  const heldIndices=()=>page.locator('.hb-die').evaluateAll(nodes=>nodes.flatMap((n,i)=>n.getAttribute('aria-pressed')==='true'?[i]:[]));
  const setHolds=async indices=>{for(let i=0;i<5;i++)if((await page.locator('.hb-die').nth(i).getAttribute('aria-pressed')==='true')!==indices.includes(i))await page.locator('.hb-die').nth(i).click();};
  const rollDefinition=(await c.query("select pg_get_functiondef('private.horses_blitz_roll(jsonb,integer[])'::regprocedure) d")).rows[0].d;
  for(const [faces,label,natural,points,holds] of [[[5,6,6,5,5],'Three 5s',true,382,[0,3,4]],[[5,2,1,3,5],'Three 5s',false,319,[0,2,4]],[[6,2,1,3,4],'Pair of 6s',false,99,[0,2]],[[2,3,4,5,6],'High card',false,33,[]]]){
   await c.query(rollDefinition.replace('get_byte(extensions.gen_random_bytes(1),0)','(ARRAY['+faces.map(n=>n-1).join(',')+'])[i+1]'));
   await page.goto(origin+'/arcade/horses-blitz');await page.getByRole('button',{name:'Play',exact:true}).click();
   await page.locator('.hb-roll').click();await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…'&&document.querySelectorAll('.hb-die').length===5&&!document.querySelector('.hb-bank').disabled);
   assert.equal(latest.ruleset,'horses-blitz/4');assert.equal(latest.roll,1);assert.deepEqual(latest.dice,faces);
   assert.equal(await page.locator('.hb-set>span').innerText(),label);assert.equal(await page.locator('.hb-natty').count(),natural?1:0);
   assert.deepEqual(await heldIndices(),holds,'suggested dice match the actual Bank offer');
   if(natural)assert.equal(await page.locator('.hb-natty').innerText(),'Natty +20%');
   await page.waitForFunction(n=>document.querySelector('.hb-bank strong')?.textContent===String(n),points);
   assert.equal(await page.locator('.hb-bonus-note').innerText(),'Early Bank Bonus · Roll 1 +30% · Roll 2 +10%\nNatty earns +20%');
   if(natural){
    const count=()=>page.evaluate(()=>window.audioEvents.filter(id=>id.startsWith('quintzee-hold:')).length);
    const before=await count();await page.locator('.hb-die').first().click();assert.equal(await page.locator('.hb-die').first().getAttribute('aria-pressed'),'false');await page.waitForFunction(n=>window.audioEvents.filter(id=>id.startsWith('quintzee-hold:')).length===n,before+1);
    await page.locator('.hb-die').first().click();assert.equal(await page.locator('.hb-die').first().getAttribute('aria-pressed'),'true');await page.waitForFunction(n=>window.audioEvents.filter(id=>id.startsWith('quintzee-hold:')).length===n,before+2);
    await page.getByRole('button',{name:'Mute sounds',exact:true}).click();const muted=await count();await page.locator('.hb-die').first().click();await page.locator('.hb-die').first().click();assert.equal(await count(),muted);await page.waitForTimeout(1050);await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();
   }
   await page.screenshot({path:out+'/acceptance-'+points+'.png'});
   const before=latest.score,id=latest.id;
   await page.locator('.hb-bank').click({clickCount:2});await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':2'));
   const stored=(await c.query('select state from private.arcade_runs where id=$1',[id])).rows[0].state;
   assert.equal(latest.score-before,points);assert.equal(stored.hands.length,1);assert.equal(stored.hands[0].points,points);assert.equal(stored.base,points);
   acceptance.push({dice:faces,displayedResult:label,natty:natural,suggestedHolds:holds,offer:points,banked:latest.score-before,storedBank:stored.hands[0].points});
   await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon Game',exact:true}).click();await page.waitForURL(origin+'/arcade/horses-blitz?result='+id);
  }
  // Override a wild-assisted suggestion, refresh the same roll, then reroll the exact manual mask.
  await c.query(rollDefinition.replace('get_byte(extensions.gen_random_bytes(1),0)','(ARRAY[4,1,0,2,4])[i+1]'));
  await page.goto(origin+'/arcade/horses-blitz');await page.getByRole('button',{name:'Play',exact:true}).click();await page.locator('.hb-roll').click();
  await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…'&&!document.querySelector('.hb-bank').disabled);
  assert.deepEqual(await heldIndices(),[0,2,4]);await setHolds([1,4]);
  await page.waitForFunction(()=>document.querySelector('.hb-bank strong')?.textContent==='319');
  const overrideId=latest.id;
  await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});
  await page.waitForFunction(()=>!document.querySelector('.hb-roll').disabled);await page.waitForTimeout(900);
  assert.deepEqual(await heldIndices(),[1,4]);assert.equal(await page.locator('.hb-set>span').innerText(),'Three 5s');assert.equal(latest.set.points,319);
  await page.screenshot({path:out+'/override-before-reroll.png'});
  await c.query(rollDefinition.replace('get_byte(extensions.gen_random_bytes(1),0)','(ARRAY[5,0,2,3,0])[i+1]'));
  await page.locator('.hb-roll').click();await page.getByText('Rolling…',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.hb-die').evaluateAll(nodes=>nodes.flatMap((n,i)=>n.dataset.rolling==='true'?[i]:[])),[0,2,3]);
  await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…'&&!document.querySelector('.hb-bank').disabled);
  assert.deepEqual([...commands.at(-1).intent.items].sort(),[1,4]);assert.deepEqual(latest.dice,[6,2,3,4,5]);assert.equal(latest.set.label,'High card');assert.deepEqual(await heldIndices(),[]);
  const persisted=(await c.query('select state from private.arcade_runs where id=$1',[overrideId])).rows[0].state;
  assert.deepEqual([...persisted.held].sort(),[1,4]);assert.deepEqual(persisted.dice,[6,2,3,4,5]);
  await page.screenshot({path:out+'/override-reroll-high-card.png'});
  acceptance.push({override:true,manualHolds:[1,4],rerolled:[0,2,3],landed:latest.dice,suggestionAfterReroll:[],offer:latest.set.points});
  await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Abandon Game',exact:true}).click();await page.waitForURL(origin+'/arcade/horses-blitz?result='+overrideId);
  await c.query(rollDefinition);
  writeFileSync(out+'/acceptance.json',JSON.stringify({physicalIPhone:false,simulation:'Edge touch viewport, actual Arcade UI/API service/PostgreSQL rules and bank receipts; deterministic local random source',cases:acceptance,holdUnholdMute:true},null,2));
  console.log(JSON.stringify(acceptance));
  await page.goto(origin+'/arcade/horses-blitz');await page.getByRole('button',{name:'Play',exact:true}).click();
  const roll=async()=>{await page.locator('.hb-roll').click();await page.getByText('Rolling…',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.hb-set')?.textContent!=='Rolling…');};
  await page.locator('.hb-roll').waitFor();assert.equal(latest.durationMs,180000);assert.equal(latest.deadline-latest.startedAt,180000);assert.equal(await page.locator('.hb-roll').innerText(),'Roll (1)');await page.getByText('Early Bank Bonus',{exact:true}).waitFor();await page.getByText('Early Bank Bonus · Roll 1 +30% · Roll 2 +10%',{exact:true}).waitFor();await page.getByText('Natty earns +20%',{exact:true}).waitFor();await roll();assert.equal(await page.locator('.hb-roll').innerText(),'Roll (2)');
  for(const [width,height] of [[320,568],[375,667],[390,844]]){
   await page.setViewportSize({width,height});const bounds=await page.locator('.hb-die').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();const p=[...n.querySelectorAll('i')].map(i=>i.getBoundingClientRect());return {w:b.width,h:b.height,inside:p.every(r=>r.left>=b.left&&r.top>=b.top&&r.right<=b.right&&r.bottom<=b.bottom)};}));
   assert.equal(bounds.length,5);assert.ok(bounds.every(b=>Math.abs(b.w-b.h)<1&&b.inside),JSON.stringify(bounds));const widths=await page.locator('.hb-dice-clock').evaluate(el=>({dice:el.querySelector('.hb-dice').getBoundingClientRect().width,clock:el.querySelector('[role=timer]').getBoundingClientRect().width}));assert.ok(Math.abs(widths.dice-widths.clock)<1);assert.equal(await page.locator('.hb-rolls,time').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/square-'+width+'.png'});
  }
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1,state->'config')) where id=$1",[latest.id]);
  await page.reload();await page.locator('.hb-bank').filter({hasText:'260'}).waitFor();await setHolds([0,1,2,3,4]);
  await roll();assert.equal(await page.locator('.hb-roll').innerText(),'Roll (3)');assert.equal(latest.set.points,220);await page.waitForFunction(()=>document.querySelector('.hb-bank strong')?.textContent==='220');
  await setHolds([0,1,2,3,4]);await roll();assert.equal(latest.roll,3);assert.equal(latest.phase,'playing');assert.equal(latest.set.points,200);await page.waitForFunction(()=>document.querySelector('.hb-bank strong')?.textContent==='200');assert.ok(await page.locator('.hb-roll').isDisabled());assert.ok(await page.locator('.hb-bank').isEnabled());
  const hand=latest.handId;await page.waitForTimeout(1200);assert.equal(latest.handId,hand);await page.screenshot({path:out+'/third-roll-manual-hold.png'});
  await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':2'));assert.equal(latest.hand,2);assert.equal(latest.base,200);await roll();
  await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[2,3,4,5,6]'::jsonb,'set',private.horses_blitz_set('[2,3,4,5,6]',1,state->'config')) where id=$1",[latest.id]);await page.reload();await page.locator('.hb-die').first().waitFor();await setHolds([0,1,2,3,4]);await roll();await setHolds([0,1,2,3,4]);await roll();assert.equal(latest.set.points,25);assert.equal(latest.phase,'playing');assert.ok(await page.locator('.hb-bank').isEnabled());await page.screenshot({path:out+'/high-card-manual-bank.png'});await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-hand')?.getAttribute('data-hand')?.endsWith(':3'));
  await roll();await c.query("update private.arcade_runs set state=state||jsonb_build_object('dice','[1,4,4,2,6]'::jsonb,'set',private.horses_blitz_set('[1,4,4,2,6]',1,state->'config')) where id=$1",[latest.id]);await page.reload();await page.locator('.hb-bank').filter({hasText:'260'}).waitFor();
  const rollDef=(await c.query("select pg_get_functiondef('private.horses_blitz_roll(jsonb,integer[])'::regprocedure) d")).rows[0].d;await c.query(rollDef.replace('get_byte(extensions.gen_random_bytes(1),0)','5'));await setHolds([]);
  await roll();assert.equal(latest.set.points,2798);const presented=Number((await page.locator('.hb-bank strong').textContent()).replaceAll(',',''));assert.ok(presented>=260&&presented<2798);await page.locator('.hb-bank').click();await page.waitForFunction(()=>document.querySelector('.hb-bank-award')?.textContent==='+2,798');assert.equal(latest.bank.points,2798,'tap during count banks newest quote');
  await page.getByRole('button',{name:'Horses Blitz rules and info'}).click();await page.getByRole('heading',{name:'Examples',exact:true}).waitFor();await page.getByText('Roll 1 natural three 4s: 200 × 1.30 × 1.20 = 312.',{exact:true}).waitFor();await page.screenshot({path:out+'/rules.png'});assert.deepEqual(errors,[]);writeFileSync(out+'/smoke-evidence.json',JSON.stringify({passed:true,squareDice:true,fallingOffers:[260,220,200],manualThirdRoll:true,positiveHighCard:true,errors},null,2));console.log('PASS square dice/pip containment, decreasing full offers, third-roll hold, manual positive high-card bank, next-hand progression');
  }
  }
}catch(e){console.error(JSON.stringify({latest,errors,audio:browser?await browser.contexts()[0]?.pages()[0]?.evaluate(()=>window.audioEvents):[]}));if(browser)await browser.contexts()[0]?.pages()[0]?.screenshot({path:out+'/failure.png'});throw e;}finally{await browser?.close();await server.close();await c.query('rollback');await c.end();}
