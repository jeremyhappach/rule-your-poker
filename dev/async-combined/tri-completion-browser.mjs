import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initialSibling,completedSibling} from './sibling-completion-fixtures.mjs';
const game=process.argv[2]??'tri-towers',sibling=game!=='tri-towers';
const root=process.cwd(),out='qualification.local/async-combined/'+(sibling?game+'-completion-':'tri-incident-'),errors=[],requests=[];
const initial=sibling?initialSibling(game,Date.now()):null;
const rules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};
let completedAt=0;
const expiresAt=new Date(Date.now()+129600000).toISOString();
const board={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i),removed:Array.from({length:27},(_,i)=>i),waste:0,stockRemaining:6,run:7,highRun:9,score:39200,deadline:Date.now()+120000};
function projection(){if(initial)return {...(completedAt?completedSibling(initial,completedAt):initial),serverAt:Date.now()};
 const base={id:'child',matchId:'match',game:'tri-towers',config:rules,revision:47,segment:1,actor:'me',round:1,board,totals:{me:0,other:0},terminal:false,held:false,expiresAt,serverAt:Date.now(),ownResults:[],winner:null,result:null};
 if(!completedAt)return base;
 const result={score:45780,scoreBefore:0,stageScore:45780,timeBonus:580,stockBonus:6000,reason:'cleared',completedAt};
 return {...base,revision:48,segment:2,actor:'other',board:null,totals:{me:45780,other:0},ownResults:[{round:1,score:45780,at:completedAt,result,board:{...board,phase:'stage_complete',removed:Array.from({length:28},(_,i)=>i),score:45780,deadline:completedAt+8000,result}}]};
}
const transport=resolve(root,'dev/async-combined/tri-completion-transport.ts');
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'fixture-html',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!['/turn','/delayed/match'].includes(req.url?.split('?')[0]))return next();
 server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-combined/tri-completion-fixture.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});
});}}],optimizeDeps:{entries:['dev/async-combined/tri-completion-fixture.tsx']},resolve:{alias:[{find:'@/integrations/supabase/client',replacement:transport},{find:'@/lib/delayed/client',replacement:transport},{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15322,strictPort:true}});
await server.listen();
console.log('Fixture listening at 127.0.0.1:15322');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){errors.push('External request '+url.origin);return route.abort();}
  if(url.pathname!=='/fixture-api')return route.continue();
  const body=route.request().postDataJSON();requests.push(body);
  if(body.op==='action'){const expected=game==='run21'?{type:'collect'}:game==='quintzee'?{type:'score',items:[11]}:game==='boxdrop'?{type:'take_score'}:{type:'remove',index:27};assert.deepEqual(body.intent,expected);assert.equal(body.revision,47);assert.equal(body.segment,1);assert.equal(completedAt,0);completedAt=Date.now();}
  return route.fulfill({json:projection()});
 });
 await page.goto('http://127.0.0.1:15322/turn',{waitUntil:'commit'});
 console.log('Fixture loaded');
 if(sibling)await page.getByRole('button',{name:game==='run21'?/Take Win/:game==='quintzee'?'Any: unfilled':'Take Score'}).click();
 else await page.locator('[data-tri-card="27"]').click();
 if(game==='run21')await page.getByText('INCREDIBLE 104!').waitFor();
 else if(sibling)await page.getByLabel('You score 0',{exact:true}).waitFor();
 else {await page.getByLabel('All three towers cleared').waitFor();assert.equal(await page.locator('[data-round-key]').getAttribute('data-round-key'),'child:1');}
 await page.screenshot({path:out+'celebration.png'});
 const selector=game==='run21'?'.arcade-run-score strong':sibling?'[aria-label^="You score "]':'.tri-score-group [aria-label^="Score "]',target=game==='run21'?50000:sibling?10000:45780;
 await page.waitForFunction(({selector,target})=>{const n=Number(document.querySelector(selector)?.textContent?.replaceAll(',',''));return n>1000&&n<target*.9;},{selector,target});
 const intermediate=await page.locator(selector).textContent();
 await page.screenshot({path:out+'count.png'});
 await page.evaluate(()=>window.fixtureUpdate());
 if(game!=='run21'){await page.getByLabel(sibling?'You score 10000':'Score 45780',{exact:true}).waitFor();await page.screenshot({path:out+'final.png'});}
 await page.waitForURL('**/delayed/match');const returnAfterMs=Date.now()-completedAt,expectedMs=game==='quintzee'?5000:8000;assert(returnAfterMs>=expectedMs-100&&returnAfterMs<expectedMs+3000);
 await page.goto('http://127.0.0.1:15322/turn');await page.waitForURL('**/delayed/match');
 assert.equal(requests.filter(r=>r.op==='action').length,1);assert.deepEqual(errors,[]);
 writeFileSync(out+'browser.json',JSON.stringify({passed:true,fixture:true,game,viewport:{width:390,height:844},intermediate,returnAfterMs,requests,errors,checks:['actual adapter and shared shell/board','completion action submits once','shared result and count-up','duplicate response retains window','automatic match return','fresh reentry returns without action']},null,2));
 console.log('PASS local synthetic browser',intermediate,'return after',returnAfterMs,'ms');
}catch(error){console.error('Browser boundary failure',error,'page errors:',errors,'requests:',requests);throw error;}
finally{await browser.close();await server.close();}
