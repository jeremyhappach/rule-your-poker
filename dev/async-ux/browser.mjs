// Compiled App, loopback-only synthetic HTTP authority. No production access.
// Build with VITE_SUPABASE_URL=http://127.0.0.1:15419 and a fixture-only key.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15419',root=resolve('dist'),out='qualification.local/async-ux';
mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,base).pathname));if(file!==root&&!file.startsWith(root+sep))return res.end();if(!existsSync(file)||!extname(file))file=resolve(root,'index.html');res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
await new Promise(r=>server.listen(15419,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
let lastPage;
try{
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),calls=[],errors=[],external=[];
  await context.routeWebSocket('**',ws=>ws.close());
  const user={id:'me',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:'me',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addInitScript(({user,token})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
  const timestamp=new Date().toISOString();
  const home=(id='match',realMoney=true,status='invited')=>({id,status,revision:1,offerHash:'frozen-offer',organizer:'other',opponent:'me',players:[{id:'me',name:'Viewer'},{id:'other',name:'Opponent'}],createdAt:timestamp,invitationExpiresAt:new Date(Date.now()+72*3600000).toISOString(),acceptedAt:status==='invited'?null:timestamp,settledAt:status==='settled'?timestamp:null,realMoney,held:false,net:5,completed:status==='settled'?3:status==='active'?1:0,exposure:15,serverAt:Date.now(),reviewsComplete:true,finaleViewed:status==='settled',receipt:status==='settled'?{id:'receipt'}:null,
   lineup:['run21','tri-towers','quintzee'].map((game,i)=>({id:'child-'+i,ordinal:i+1,game,stake:5,actor:i?'other':'me',terminal:status==='settled'||(status==='active'&&i===2),viewed:true,pendingResults:i===1?{other:1}:{},scores:{me:100,other:i===1?null:90},expiresAt:new Date(Date.now()+3600000).toISOString(),lastCallAt:new Date(Date.now()+1800000).toISOString(),result:status==='settled'||(status==='active'&&i===2)?{winner:'me',delta:5,reason:'score'}:null}))});
  const accepted=new Set();let created=false;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(url.origin);return route.abort();}
   const path=url.pathname,send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   if(path.startsWith('/auth/v1/'))return send(path.endsWith('/user')?user:{user,access_token:token});
   if(path.startsWith('/rest/v1/rpc/')){
    const name=path.split('/').at(-1),args=req.postDataJSON()??{};calls.push({name,args});
    if(name==='platform_notification_center')return send({actionable:1,items:[{id:'notice',match_id:'match',kind:'invitation',revision:1,read_revision:0,actionable:true,payload:{opponentId:'other'}}]});
    if(name==='delayed_home'||name==='delayed_history_detail')return send(home(args.p_match,args.p_match!=='fake',args.p_match==='done'?'settled':args.p_match==='mixed'||accepted.has(args.p_match)?'active':'invited'));
    if(name==='delayed_list')return send([home(),home('fake',false),home('mixed',true,'active'),...(created?[{...home('created',false),organizer:'me',opponent:'other'}]:[])]);
    if(name==='delayed_capabilities')return send({enabled:true,fake_money_only:false,max_children:32,games:['ptown-words','run21','tri-towers','quintzee','boxdrop'].map(id=>({id,stake:5}))});
    if(name==='delayed_opponent_page')return send({items:[{id:'other',name:'Opponent',isHuman:true}],hasMore:false,next:null});
    if(name==='delayed_create'){created=true;await new Promise(r=>setTimeout(r,250));return send('created');}
    if(name==='delayed_respond'){accepted.add(args.p_match);await new Promise(r=>setTimeout(r,250));return send(null);}
    if(name==='delayed_history')return send([{id:'done',opponent:'Opponent',count:3,net:5,realMoney:true,startedAt:timestamp,completedAt:timestamp}]);
    if(name==='account_statement')return send({balance:'0.00',transactions:[],has_more:false,next_cursor:null});
    return send([]);
   }
   if(path.startsWith('/rest/v1/')){
    const table=path.split('/').at(-1),single=(req.headers().accept??'').includes('object');
    const value=table==='profiles'?{id:'me',username:'Viewer',is_active:true,is_superuser:false}:null;
    return send(req.method()==='GET'?(single?value:table==='profiles'?[value]:[]):null);
   }
   return route.continue();
  });
  const page=await context.newPage();lastPage=page;page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await expect(page.getByRole('button',{name:'Async Mode',exact:true})).toBeVisible({timeout:30000});
  const asyncBox=await page.getByRole('button',{name:'Async Mode',exact:true}).boundingBox(),arcadeBox=await page.getByRole('button',{name:'Arcade Mode',exact:true}).boundingBox();assert(asyncBox.y+asyncBox.height<=arcadeBox.y);
  await page.getByRole('button',{name:'Create New Game',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Start a live multiplayer session');await expect(page.getByRole('dialog')).not.toContainText('Asynchronous');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Async Mode',exact:true}).click();await expect(page).toHaveURL(base+'/delayed');
  await page.getByRole('link',{name:'New Async Match',exact:true}).click();const toggle=page.getByRole('switch',{name:'Real Money'});await expect(toggle).not.toBeChecked();
  await page.getByLabel('Opponent',{exact:true}).selectOption('other');await toggle.check();await page.getByLabel('Stake 1',{exact:true}).fill('0');await expect(page.getByRole('button',{name:'Send Invitation',exact:true})).toBeDisabled();await page.getByLabel('Stake 1',{exact:true}).fill('700');
  await page.getByRole('button',{name:'Add game',exact:true}).click();await page.getByLabel('Game 2',{exact:true}).selectOption('tri-towers');
  await page.screenshot({path:out+'/setup-'+viewport.width+'.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'setup overflow');
  await toggle.uncheck();await expect(page.getByLabel('Stake 1',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Send Invitation',exact:true}).dblclick();await expect(page).toHaveURL(base+'/delayed');await expect(page.getByText('Invitation sent',{exact:true})).toBeVisible();
  const creates=calls.filter(c=>c.name==='delayed_create');assert.equal(creates.length,1);assert.equal(creates[0].args.p_real_money,false);assert.deepEqual(creates[0].args.p_lineup,[{game:'ptown-words',stake:5},{game:'tri-towers',stake:5}]);
  await page.goto(base+'/delayed/match');await page.getByRole('button',{name:'Accept lineup and stakes'}).click();await expect(page.getByRole('alertdialog')).toContainText('Maximum loss per player: $15');await expect(page.getByRole('alertdialog')).toContainText('36-hour');
  await page.screenshot({path:out+'/confirmation-'+viewport.width+'.png',animations:'disabled'});
  const dialogBox=await page.getByRole('alertdialog').boundingBox();assert(dialogBox.height<=viewport.height+2&&dialogBox.y>=-2,'confirmation exceeds viewport');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(calls.filter(c=>c.name==='delayed_respond').length,0);
  await page.getByRole('button',{name:'Accept lineup and stakes'}).click();await page.getByRole('button',{name:'I Acknowledge'}).click();await expect(page.getByText('Your turn',{exact:true})).toBeVisible();assert.equal(calls.filter(c=>c.name==='delayed_respond').length,1);
  await page.goto(base+'/delayed/mixed');await expect(page.locator('.delayed-game-card')).toHaveCount(3);await expect(page.getByText('Your turn',{exact:true})).toBeVisible();await expect(page.getByText('Opponent’s turn',{exact:true})).toBeVisible();await expect(page.getByText('Pending',{exact:true})).toBeVisible();await expect(page.locator('.delayed-match-heading [aria-label="Real money"]')).toHaveCount(1);
  await page.screenshot({path:out+'/mixed-'+viewport.width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mixed session overflow');
  await page.goto(base+'/delayed/fake');await page.getByRole('button',{name:'Accept lineup and stakes'}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.getByText('Your turn',{exact:true})).toBeVisible();await expect(page.locator('.delayed-match-heading [aria-label="Real money"]')).toHaveCount(0);
  await page.goto(base+'/');await page.getByRole('button',{name:/Notifications/}).first().click();await expect(page.getByRole('link',{name:/My Async/})).toHaveCount(0);await page.getByRole('link',{name:'Pending invite from Opponent'}).click();await expect(page).toHaveURL(base+'/delayed/match');
  await page.goto(base+'/?sessions=completed');await expect(page.locator('.async-history-heading [aria-label="Real money"]')).toHaveCount(1);await page.getByRole('link',{name:'See Results',exact:true}).click();await expect(page).toHaveURL(base+'/delayed/done?finale=1');await expect(page.getByRole('link',{name:'Match home',exact:true}).locator('[aria-label="Real money"]')).toHaveCount(1);
  await page.getByRole('link',{name:'Match home',exact:true}).click();await page.getByRole('link',{name:'All matches',exact:false}).click();await page.getByRole('link',{name:'Lobby',exact:true}).click();await expect(page.getByRole('button',{name:'Async Mode',exact:true})).toBeVisible();
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);checks.push({viewport,passed:true,createCalls:creates.length,externalRequests:external.length,consoleErrors:errors.length});console.log('PASS',viewport);await context.close();
 }
 writeFileSync(out+'/browser.json',JSON.stringify({passed:true,checks},null,2));
}catch(error){if(lastPage){console.log('FAILED AT',lastPage.url(),(await lastPage.locator('body').innerText()).slice(0,2200));await lastPage.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}
