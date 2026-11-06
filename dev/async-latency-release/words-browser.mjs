import {connect} from '../async-words/local.mjs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import assert from 'node:assert/strict';
const database=process.argv[2];if(!/^async_latency_\d+$/.test(database))throw Error('Disposable fixture required');
const db=await connect(database),a=randomUUID(),b=randomUUID();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const rpc=async(actor,name,args)=>{
 const session=await connect(database);
 try{await session.query('BEGIN');await session.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);await session.query('SET LOCAL ROLE authenticated');
 const value=(await session.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(x=>x&&typeof x==='object'?JSON.stringify(x):x))).rows[0].v;
 await session.query('COMMIT');return value;}catch(e){await session.query('ROLLBACK');throw e;}finally{await session.end();}
};
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url.startsWith('/clock?'))return next();res.setHeader('Content-Type','text/html');s.transformIndexHtml(req.url,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dev/async-latency-release/words.tsx"></script>').then(html=>res.end(html));});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:resolve('dev/async-latency-release/words-client.ts')},{find:'@',replacement:resolve('src')}]},optimizeDeps:{entries:['dev/async-latency-release/words.tsx']},server:{host:'127.0.0.1',port:15480,strictPort:true,watch:null,hmr:false}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 await db.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1',[id]);await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[id]);}
 const match=await rpc(a,'delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:false,p_lineup:[{game:'ptown-words',stake:7}]});
 await rpc(b,'delayed_respond',{p_match:match,p_request:randomUUID(),p_offer_hash:(await q('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[match])).offer_hash,p_action:'accept'});
 const c=await q('SELECT * FROM private.delayed_children WHERE match_id=$1',[match]),first=c.actor,second=first===a?b:a;
 const command=(actor,rev,type,items=null)=>rpc(actor,'delayed_words_action',{p_child:c.id,p_request:randomUUID(),p_revision:rev,p_action:type,p_items:items});
 const start=await command(first,c.revision,'begin_turn');
 const {state}=await q('SELECT state FROM private.delayed_children WHERE id=$1',[c.id]);
 const lists=[state.racks[first],state.racks[second],state.bag];
 for(const [i,letter] of [...'CAT'].entries()){const source=lists.find(l=>l.some(t=>t.face===letter)),j=source.findIndex(t=>t.face===letter);[source[j],lists[0][i]]=[lists[0][i],source[j]];}
 await db.query('UPDATE private.delayed_children SET state=$2 WHERE id=$1',[c.id,JSON.stringify(state)]);
 const placed=await command(first,start.revision,'place',lists[0].slice(0,3).map((t,i)=>({tileId:t.id,letter:t.face,square:112+i})));assert(placed.movePresentation && !placed.error,JSON.stringify(placed.error));
 const row=()=>q('SELECT revision,segment,actor,gameplay_due_at::text deadline,state FROM private.delayed_children WHERE id=$1',[c.id]);
 async function open(actor){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on('pageerror',e=>console.error('page error',e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname!=='/fixture-rpc')return route.continue();
   const {name,args}=route.request().postDataJSON();assert(['delayed_words_inspect','delayed_words_action','delayed_words_snapshot','delayed_home'].includes(name));
   try{return await route.fulfill({json:{data:await rpc(actor,name,args),error:null,status:200}});}catch(e){return await route.fulfill({json:{data:null,error:{code:e.code,message:e.message},status:409}});}
  });
  await page.goto('http://127.0.0.1:15480/clock?child='+c.id+'&match='+match+'&actor='+actor);return page;
 }
 const observer=await open(first);await observer.locator('.words-view-only').waitFor();assert.equal((await row()).deadline,null);
 const page=await open(second);await page.locator('.words-rack').waitFor();assert.equal((await row()).deadline,null);
 await page.locator('.words-turn-announcement').waitFor({timeout:15000});assert.equal((await row()).deadline,null);assert.equal(await page.locator('.words-rack button:enabled').count(),0);
 await page.locator('.words-bank:enabled').first().waitFor();assert.equal(await page.locator('.words-pause').count(),0);assert.equal(await page.locator('.words-bank').count(),2);
 const initial=Date.parse((await row()).deadline);
 await page.locator('.words-bank').first().click();await page.waitForFunction(()=>document.querySelectorAll('.words-bank').length===1);assert.equal(Date.parse((await row()).deadline)-initial,180000);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('offline'));});
 await page.reload();await page.locator('.words-bank:enabled').waitFor();assert.equal(Date.parse((await row()).deadline)-initial,180000);
 await page.locator('.words-bank').click();await page.waitForFunction(()=>!document.querySelector('.words-bank'));assert.equal(Date.parse((await row()).deadline)-initial,360000);
 await page.close();const rejoined=await open(second);await rejoined.locator('.words-rack button:enabled').first().waitFor();assert.equal(await rejoined.locator('.words-bank').count(),0);assert.equal(Date.parse((await row()).deadline)-initial,360000);
 await db.query("UPDATE private.delayed_children SET gameplay_due_at=to_timestamp($2/1000.0),state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)) WHERE id=$1",[c.id,Date.now()-10]);
 await db.query('SELECT private.delayed_words_recover_local()');const next=await row();assert.equal(next.actor,first);assert.equal(next.deadline,null);assert.equal(next.state.moves.at(-1).action,'pass');
 console.log('PASS browser + SQL: view-only, opponent CAT/review/count/hold, YOUR TURN with disabled input, clock entry, two banks, no pause, hidden/offline, reload/rejoin, zero-client timeout');
}finally{await browser.close();await server.close();await db.end();}
