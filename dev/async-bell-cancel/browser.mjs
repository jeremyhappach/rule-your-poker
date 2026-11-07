import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {connect} from '../async-words/local.mjs';
const {database}=JSON.parse(readFileSync('qualification.local/async-bell-cancel/context.json')),out='qualification.local/async-bell-cancel',base='http://127.0.0.1:15414',root=resolve(out+'/app');
const a=randomUUID(),b=randomUUID(),admin=await connect(database),matches=[],checks=[],errors=[],rpcCalls=[];
const rpc=async(who,name,args={})=>{const c=await connect(database);try{await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[who]);await c.query('SET ROLE authenticated');return (await c.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;}finally{await c.end();}};
await admin.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
await admin.query('INSERT INTO auth.users(id) VALUES($1),($2)',[a,b]);
await admin.query("UPDATE public.profiles SET username='prior bell fixture '||id WHERE username='mcru81'");
await admin.query('INSERT INTO public.account_access(user_id,enabled,ever_enabled) VALUES($1,true,true),($2,true,true) ON CONFLICT(user_id) DO UPDATE SET enabled=true,ever_enabled=true',[a,b]);
await admin.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$3,true),($2,$4,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true',[a,b,'Bell browser '+a,'mcru81']);
for(let i=0;i<4;i++){
 const id=await rpc(a,'delayed_create',{p_request:randomUUID(),p_opponent:b,p_real_money:false,p_lineup:[{game:'run21',stake:7},{game:'run21',stake:7}]});
 const hash=(await admin.query('SELECT offer_hash FROM private.delayed_matches WHERE id=$1',[id])).rows[0].offer_hash;
 if(i<3){await rpc(b,'delayed_respond',{p_match:id,p_request:randomUUID(),p_offer_hash:hash,p_action:'accept'});
 await admin.query('UPDATE private.delayed_children SET actor=$2 WHERE match_id=$1',[id,i===2?b:a]);
 if(i===0)await admin.query('UPDATE private.delayed_children SET actor=$2 WHERE match_id=$1 AND ordinal=2',[id,b]);
 await admin.query("UPDATE private.delayed_children SET available_at=now()-interval '8 hours',last_call_at=now()+interval '16 hours',expires_at=now()+interval '28 hours' WHERE match_id=$1",[id]);
 if(i===1)await admin.query("UPDATE private.delayed_children SET gameplay_due_at=now()+interval '42 minutes' WHERE match_id=$1 AND ordinal=1",[id]);
 await admin.query('SELECT private.delayed_notify($1)',[id]);
 await admin.query("UPDATE public.platform_notifications SET actionable=true,payload=payload||'{\"completionCount\":2}' WHERE match_id=$1 AND user_id=$2 AND kind='results'",[id,a]);
 }
 matches.push(id);
}
const homes=await Promise.all(matches.map(id=>rpc(a,'delayed_home',{p_match:id})));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));if(!file.startsWith(root))return res.end();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(15414,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
let lastPage;
async function contextFor(who,width=390){
 const user={id:who,aud:'authenticated',role:'authenticated',email:'bell@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:who,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
 await context.routeWebSocket('**',ws=>ws.close());
 await context.addInitScript(({user,token})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{user,token});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(url.origin!==base)return route.abort();
  if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
  if(path.startsWith('/rest/v1/rpc/')){
   const name=path.split('/').at(-1),args=req.postDataJSON()??{};rpcCalls.push(name);
   if(['platform_notification_center','delayed_home','delayed_list','delayed_notification_read','delayed_respond'].includes(name)){
    try{return send(await rpc(who,name,args));}catch(e){return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message,code:e.code})});}
   }
   if(name==='account_access_snapshot')return send({userId:who,enabled:true,status:'enabled',revision:1,email:user.email,verified:true,admin:false});
   if(name==='mobile_onboarding_preference')return send({completedVersion:99,dismissedVersion:99});
   if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
   if(name==='delayed_reviews')return send({events:[],terminal:false,actor:who,started:false,segment:1,revision:1,serverAt:Date.now()});
   return send([]);
  }
  if(path==='/api/delayed')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Navigation verified; gameplay outside this fixture.'})});
  if(path.startsWith('/rest/v1/')){
   const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');
   const profile={id:who,username:who===a?'Hap':'mcru81',is_active:true,is_superuser:false};
   return send(req.method()==='GET'?(single?(table==='profiles'?profile:null):table==='profiles'?[profile]:[]):null);
  }
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));lastPage=page;return {context,page};
}
try{
 for(const width of [375,390,430]){
  const {context,page}=await contextFor(a,width);await page.goto(base);
  await page.getByRole('button',{name:/Notifications/}).first().click();
  await page.getByRole('button',{name:'YOUR TURN',exact:true}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:'YOUR TURN',exact:true}).count(),2);
  assert.equal(await page.getByText('vs mcru81',{exact:true}).count(),2);
  assert.equal(await page.getByText('2 game completions ready to view',{exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Notifications, 3 pending',exact:true}).count(),1);
  const text=await page.locator('.async-notification-list').innerText();assert(text.includes('(28h left)'));assert(text.includes('(42m left)'));assert(!/Earliest deadline|available turns|Your turn in an async/.test(text));
  await page.locator('.async-notification-popover').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const geometry=await page.locator('.async-notification-list li').evaluateAll(rows=>rows.map(r=>{const b=r.getBoundingClientRect();return {x:b.x,right:b.right,height:b.height,divider:getComputedStyle(r).borderTopWidth};}));
  assert(geometry.every(r=>r.x>=0&&r.right<=width),JSON.stringify(geometry));
  await page.screenshot({path:out+'/bell-'+width+'.png'});
  await page.locator('[data-match-id="'+matches[0]+'"]').getByRole('button',{name:'YOUR TURN'}).click();
  await page.waitForURL('**/delayed/'+matches[0]+'/play/'+homes[0].lineup.find(c=>c.actor===a).id);
  await page.goto(base);await page.getByRole('button',{name:/Notifications/}).first().click();
  await page.locator('[data-match-id="'+matches[1]+'"]').getByRole('button',{name:'YOUR TURN'}).click();
  await page.waitForURL('**/delayed/'+matches[1]);await page.getByRole('link',{name:'Take Turn',exact:true}).first().waitFor();
  checks.push({width,compact:true,sameOpponent:true,mixedResults:true,badge:3,oneTurnDirect:true,multiTurnLobby:true,geometry});await context.close();
 }
 const sender=await contextFor(a),recipient=await contextFor(b);
 await sender.page.goto(base+'/delayed/'+matches[3]);await recipient.page.goto(base+'/delayed');
 await sender.page.getByRole('button',{name:'Cancel invitation',exact:true}).click();await sender.page.waitForURL('**/delayed');
 await sender.page.reload();await recipient.page.reload();
 for(const page of [sender.page,recipient.page]){await page.getByRole('link',{name:'New Async Match',exact:true}).waitFor();assert.equal(await page.locator('a[href="/delayed/'+matches[3]+'"]').count(),0);}
 assert.equal((await admin.query('SELECT count(*)::int n FROM private.delayed_matches WHERE id=$1',[matches[3]])).rows[0].n,0);
 await recipient.page.goto(base+'/delayed/'+matches[3]);await recipient.page.waitForURL('**/delayed');
 await admin.query('UPDATE private.delayed_children SET actor=$2 WHERE match_id=$1',[matches[1],b]);
 await sender.page.goto(base);await sender.page.getByRole('button',{name:/Notifications/}).first().click();
 await sender.page.getByText('2 game completions ready to view',{exact:true}).first().waitFor();assert.equal(await sender.page.getByText('2 game completions ready to view',{exact:true}).count(),2);
 await sender.page.screenshot({path:out+'/results-returned-390.png'});
 checks.push({cancelGoneForBothAfterRefresh:true,deletedDeepLinkReturnsToList:true,resultsReturned:true});
 assert.deepEqual(errors,[]);writeFileSync(out+'/browser.json',JSON.stringify({passed:true,checks,rpcCalls},null,2));console.log(JSON.stringify({passed:true,checks}));
} catch(e){if(lastPage){await lastPage.screenshot({path:out+'/failure.png'}).catch(()=>{});console.log(JSON.stringify({errors,rpcCalls,body:(await lastPage.locator('body').innerText()).slice(0,2400)}));}throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));await admin.end();}

