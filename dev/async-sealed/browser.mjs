// Actual card components, synthetic local transport; no hosted writes.
import {chromium,expect} from '@playwright/test';
import {createReviewServer} from '../async-combined/review-server.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('qualification.local/async-sealed');mkdirSync(out,{recursive:true});
const games=['chucky-showdown','run21','tri-towers','quintzee','boxdrop','take-two','crib-lab','mega-card-golf','five-alive'];
const now=Date.now(),home={id:'match',policyVersion:'delayed/sealed/1',status:'active',revision:1,organizer:'me',opponent:'other',players:[{id:'me',name:'Jeremy'},{id:'other',name:'Hap'}],realMoney:true,net:0,unsettled:27,completed:0,exposure:27,acceptedAt:new Date(now).toISOString(),serverAt:now,lineup:games.map((game,i)=>({id:game,game,ordinal:i+1,stake:3,actor:'me',terminal:false,playable:i%2===0,opponentPlayable:true,flowVersion:game==='five-alive'?undefined:'delayed/sealed/1',round:2,completedRounds:{me:i%2?2:1,other:1},scores:{me:2400,other:1700},progress:{me:'1',other:'1'},expiresAt:new Date(now+72*3600e3).toISOString(),lastCallAt:new Date(now+48*3600e3).toISOString()}))};
const server=await createReviewServer({port:15435,preview:true,cacheDir:'node_modules/.vite-sealed'});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],metrics=[];let resultMode=false,acknowledged=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();if(url.pathname!=='/fixture-review-api')return route.continue();
  const body=route.request().postDataJSON();let value;
  if(body.name==='delayed_home')value=resultMode?{...home,lineup:home.lineup.map((c,i)=>i===0?{...c,terminal:true,viewed:acknowledged,result:{winner:'other',delta:-3,reason:'normal'}}:c)}:home;
  else if(body.name==='delayed_reviews')value={terminal:true,actor:'me',segment:1,revision:1,started:false,expiresAt:new Date(now+72*3600e3).toISOString(),serverAt:now,events:[{id:'final-event',kind:'child',seen:acknowledged,receipt:{game:'chucky-showdown',winner:'other',stake:3}}]};
  else if(body.name==='delayed_review_ack'){acknowledged=true;value=null;}
  else if(body.name==='notification_preferences')value={invitations:true,asyncDefault:true,quietEnabled:false};
  else if(body.name==='async_push_preference')value=false;
  else if(body.name==='notification_list')value=[];
  else if(body.op==='state')value={id:'five-alive',revision:1,wordReviews:[],view:{round:2,ownFinished:1,opponentFinished:1,revealed:[]}};
  else throw Error('Unexpected fixture request '+JSON.stringify(body));
  await route.fulfill({json:value});
 });
 for(const width of [320,390,1024]){
  await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:15435/delayed/match');
  await expect(page.locator('.delayed-game-card')).toHaveCount(9,{timeout:60000});
  await expect(page.getByRole('link',{name:'Play next round'})).toHaveCount(5);
  await expect(page.getByText('Waiting for opponent.',{exact:true})).toHaveCount(4);
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow);metrics.push({width,overflow,cards:9});
  await page.screenshot({path:resolve(out,'cards-'+width+'.png'),fullPage:true});
 }
 resultMode=true;await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:15435/delayed/match?review=chucky-showdown');
 await expect(page.getByRole('button',{name:'OK',exact:true})).toBeVisible();assert(!acknowledged);
 await page.screenshot({path:resolve(out,'settlement-ok.png')});await page.getByRole('button',{name:'OK',exact:true}).click();await expect(page).toHaveURL('http://127.0.0.1:15435/delayed/match');assert(acknowledged);
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'browser.json'),JSON.stringify({metrics,errors,explicitSettlementAck:true},null,2));console.log(JSON.stringify({metrics,errors,explicitSettlementAck:true}));
}finally{await browser.close();await server.close();}
