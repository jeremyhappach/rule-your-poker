// Compiled App -> controlled transport -> installed PostgreSQL functions.
// Synthetic identities and all database effects are contained in one rollback.
import {connect} from '../../dev/async-words/local.mjs';
import {createServer} from 'node:http';
import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15419',root=resolve('dist'),out='qualification.local/async-ux',ctx=JSON.parse(read('qualification.local/async-real-money/context.json'));
assert(/^async_real_\d+$/.test(ctx.database));
const db=await connect(ctx.database),a=randomUUID(),b=randomUUID(),calls=[],checks=[],errors=[];
let serial=Promise.resolve();
const locked=fn=>{const p=serial.then(fn);serial=p.catch(()=>{});return p;};
const owner=()=>db.query('RESET ROLE');
const val=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
const asUser=async(id,fn)=>{await owner();await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);await db.query('SET LOCAL ROLE authenticated');try{return await fn();}finally{await owner();}};
const rpc=(id,name,args={})=>locked(()=>asUser(id,()=>val('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))));
const inspect=id=>locked(async()=>{await owner();return val("SELECT jsonb_build_object('status',status,'real',real_money,'hash',offer_hash,'revision',revision,'acceptedAt',accepted_at,'stakes',(SELECT jsonb_agg(stake ORDER BY ordinal) FROM private.delayed_children WHERE match_id=m.id),'accounts',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=m.id),'receipts',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=m.id)) v FROM private.delayed_matches m WHERE id=$1",[id]);});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));if(file!==root&&!file.startsWith(root+sep))return res.end();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(read(file));});
let browser;
try{
 await db.query('BEGIN');
 await db.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
 for(const [id,name] of [[a,'UX Integration Organizer'],[b,'UX Integration Opponent']]){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
  await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true',[id,name]);
 }
 await new Promise(r=>server.listen(15419,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const pageFor=async(id,name)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.routeWebSocket('**',ws=>ws.close());
  const user={id,aud:'authenticated',role:'authenticated',email:id+'@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(url.origin!==base){errors.push('external request '+url.origin);return route.abort();}
   const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),args=req.postDataJSON()??{};
    if(['delayed_capabilities','delayed_opponent_page','delayed_create','delayed_respond','delayed_list','delayed_home','platform_notification_center','delayed_notification_read','delayed_history','delayed_history_detail','delayed_reviews'].includes(name)){
     try{const result=await rpc(id,name,args);calls.push({actor:id,name,args,result});return send(result);}
     catch(e){errors.push(name+': '+e.message);return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message,code:e.code})});}
    }
    if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
    return send([]);
   }
   if(path.startsWith('/rest/v1/')){
    const single=(req.headers().accept??'').includes('object'),table=path.split('/').at(-1),profile={id,username:name,is_active:true,is_superuser:false};
    return send(req.method()==='GET'?(single?profile:table==='profiles'?[{id:a,username:'UX Integration Organizer',is_active:true},{id:b,username:'UX Integration Opponent',is_active:true}]:[]):null);
   }
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
 };
 const creator=await pageFor(a,'UX Integration Organizer'),recipient=await pageFor(b,'UX Integration Opponent');
 for(const real of [false,true]){
  await creator.goto(base+'/delayed/new');
  await creator.getByLabel('Filter opponents').fill('UX Integration Opponent');
  await expect(creator.getByLabel('Opponent',{exact:true}).locator('option[value="'+b+'"]')).toHaveCount(1);
  await creator.getByLabel('Opponent',{exact:true}).selectOption(b);
  const toggle=creator.getByRole('switch',{name:'Real Money'});await expect(toggle).not.toBeChecked();
  if(real){await toggle.check();await creator.getByLabel('Game 1',{exact:true}).selectOption('run21');await creator.getByLabel('Stake 1',{exact:true}).fill('7');await creator.getByRole('button',{name:'Add game',exact:true}).click();await creator.getByLabel('Game 2',{exact:true}).selectOption('tri-towers');await creator.getByLabel('Stake 2',{exact:true}).fill('3');}
  const before=calls.filter(c=>c.name==='delayed_create').length;
  await creator.getByRole('button',{name:'Send Invitation',exact:true}).dblclick();await expect(creator).toHaveURL(base+'/delayed');
  const creates=calls.filter(c=>c.name==='delayed_create');assert.equal(creates.length,before+1);const sent=creates.at(-1),id=sent.result;
  assert.equal(await rpc(a,'delayed_create',sent.args),id);
  const pending=await inspect(id);assert.equal(pending.real,real);assert.equal(pending.status,'invited');assert.deepEqual(pending.stakes,real?[7,3]:[5]);
  const center=await rpc(b,'platform_notification_center');assert(center.items.some(n=>n.match_id===id&&n.kind==='invitation'&&n.actionable));
  await recipient.goto(base+'/');await recipient.getByRole('button',{name:/Notifications/}).first().click();await recipient.getByRole('link',{name:'Pending invite from UX Integration Organizer'}).click();await expect(recipient).toHaveURL(base+'/delayed/'+id);
  await recipient.getByRole('button',{name:'Accept lineup and stakes'}).click();
  if(real){
   await expect(recipient.getByRole('alertdialog')).toContainText('Maximum loss per player: $10');
   const count=calls.filter(c=>c.name==='delayed_respond').length;
   await recipient.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.filter(c=>c.name==='delayed_respond').length,count);assert.deepEqual(await inspect(id),pending);
   await recipient.reload();await recipient.getByRole('button',{name:'Accept lineup and stakes'}).click();await recipient.getByRole('button',{name:'I Acknowledge'}).dblclick();
  }else await expect(recipient.getByRole('alertdialog')).toHaveCount(0);
  await expect(recipient.getByRole('button',{name:'Accept lineup and stakes'})).toHaveCount(0);
  const accepted=await inspect(id);assert.equal(accepted.status,'active');assert.equal(accepted.accounts,0);assert.equal(accepted.receipts,0);
  const accept=calls.filter(c=>c.name==='delayed_respond'&&c.args.p_match===id);assert.equal(accept.length,1);assert.deepEqual(await rpc(b,'delayed_respond',accept[0].args),accept[0].result);assert.deepEqual(await inspect(id),accepted);
  await recipient.reload();await expect(recipient.locator('.delayed-game-card')).toHaveCount(real?2:1);assert.deepEqual(await inspect(id),accepted);
  checks.push({mode:real?'real':'fake',match:id,stakes:accepted.stakes,createRequests:1,acceptRequests:1,notificationDelivered:true,cancelNoSideEffects:real,replayAndRefreshStable:true,accountsAtAcceptance:accepted.accounts});
 }
 assert.deepEqual(errors,[]);
 await browser.close();browser=null;await serial;await owner();await db.query('ROLLBACK');
 const leftovers=await val('SELECT count(*)::int v FROM public.profiles WHERE id=ANY($1::uuid[])',[[a,b]]);assert.equal(leftovers,0);
 write(out+'/database-browser.json',JSON.stringify({passed:true,database:ctx.database,checks,rolledBack:true,remainingProfiles:leftovers},null,2));console.log('PASS compiled App -> installed SQL: fake/real creation, notification deep-link, warning/cancel/accept, duplicate/replay/refresh');
}catch(e){console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();await serial;await owner();await db.query('ROLLBACK');await db.end();if(server.listening)await new Promise(r=>server.close(r));}

