import {chromium} from 'playwright';
import {createReviewServer} from '../../async-combined/review-server.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qualification.local/five-alive/async-polish';mkdirSync(output,{recursive:true});
const port=15511,base='http://127.0.0.1:'+port,server=await createReviewServer({port,preview:true,cacheDir:'node_modules/.vite-five-alive-ending'});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
try{for(const won of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 const seen=new Set(),calls=[],winner=won?'me':'other',players=[{id:'me',name:won?'Hap':'Jeremy'},{id:'other',name:won?'Jeremy':'Hap'}];
 const word={answer:'DEPOT',difficulty:3,solved:true,score:1200,completed:true,guesses:[{word:'DEPOT',feedback:Array(5).fill('correct')}]};
 const pair={own:{...word,score:won?1200:412},opponent:{...word,score:won?412:1200}};
 const home=()=>({id:'match',status:'settled',revision:1+seen.size,organizer:'me',opponent:'other',players,net:won?1:-1,receipt:{match_id:'match'},finaleViewed:seen.has('finale'),reviewsComplete:seen.has('word3')&&seen.has('child'),realMoney:false,serverAt:Date.now(),completed:1,exposure:1,lineup:[{id:'child',ordinal:1,game:'five-alive',terminal:true,stake:1,viewed:seen.has('child'),pendingResults:{other:seen.has('word3')?0:1},result:{winner,delta:won?1:-1,reason:'normal'}}]});
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname!=='/fixture-review-api')return route.continue();const b=route.request().postDataJSON();calls.push(b);let result;
  if(b.op==='state')result={id:'child',revision:1,reviewRevision:1+seen.size,terminal:true,status:'settled',wordReviews:[{id:'word3',round:3,seen:seen.has('word3')}],view:{round:3,completed:true,ownScore:won?4400:1196,opponentScore:won?1196:4400,current:null,revealed:[pair,pair,pair],ownFinished:3,opponentFinished:3}};
  else if(b.name==='delayed_home'||b.name==='delayed_history_detail')result=home();
  else if(b.name==='delayed_reviews')result={events:[{id:'word3',kind:'attempt',actor:'other',round:3,seen:seen.has('word3'),receipt:{game:'five-alive'}},{id:'child',kind:'child',seen:seen.has('child'),receipt:{winner}}],terminal:true};
  else if(b.name==='delayed_review_begin')result={seen:seen.has(b.args.p_event)};
  else if(b.name==='delayed_review_ack'){seen.add(b.args.p_event);result=null;}
  else if(b.name==='delayed_finale_ack'){assert.ok(home().reviewsComplete);seen.add('finale');result=null;}
  else throw Error('Unexpected request '+JSON.stringify(b));await route.fulfill({json:result});
 });
 await page.goto(base+'/delayed/match/play/child');await page.getByText('Viewing '+(won?'Jeremy':'Hap')+'’s Word 3 results',{exact:true}).waitFor();await page.getByText('Word scores',{exact:true}).waitFor();await page.getByText('Hap won the $1 stake',{exact:true}).waitFor();await page.screenshot({path:output+'/stake-'+(won?'winner':'loser')+'.png'});
 await page.getByRole('img',{name:'Hap wins the match'}).waitFor();await page.screenshot({path:output+'/boxer-'+(won?'winner':'loser')+'.png'});await page.locator('.async-finale-exit').waitFor();assert.equal(seen.size,3);
 await page.reload();await page.getByRole('img',{name:'Hap wins the match'}).waitFor();assert.equal(seen.size,3);assert.ok(calls.every(b=>b.op===undefined||b.op==='state'));checks.push({won,acknowledged:[...seen],onlyReadAndPresentationAcknowledgements:true});await page.close();
}assert.deepEqual(errors,[]);writeFileSync(output+'/ending.json',JSON.stringify({checks,errors,scope:'Actual client route and components, isolated settled projection. No live settlement mutation.'},null,2));console.log(JSON.stringify({checks,errors}));}finally{await browser.close();await server.close();}
