import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd(),out='qualification.local/async-combined/tri-incident-',errors=[],requests=[];
const rules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000};
let completedAt=0;
const expiresAt=new Date(Date.now()+129600000).toISOString();
const board={rules,phase:'playing',cards:Array.from({length:28},(_,i)=>i),removed:Array.from({length:27},(_,i)=>i),waste:0,stockRemaining:6,run:7,highRun:9,score:39200,deadline:Date.now()+120000};
function projection(){const base={id:'child',matchId:'match',game:'tri-towers',config:rules,revision:47,segment:1,actor:'me',round:1,board,totals:{me:0,other:0},terminal:false,held:false,expiresAt,serverAt:Date.now(),ownResults:[],winner:null,result:null};
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
  if(body.op==='action'){assert.deepEqual(body.intent,{type:'remove',index:27});assert.equal(body.revision,47);assert.equal(body.segment,1);assert.equal(completedAt,0);completedAt=Date.now();}
  return route.fulfill({json:projection()});
 });
 await page.goto('http://127.0.0.1:15322/turn',{waitUntil:'commit'});
 console.log('Fixture loaded');
 await page.locator('[data-tri-card="27"]').click();
 await page.getByLabel('All three towers cleared').waitFor();
 assert.equal(await page.locator('[data-round-key]').getAttribute('data-round-key'),'child:1');
 await page.screenshot({path:out+'celebration.png'});
 await page.waitForFunction(()=>{const node=document.querySelector('.tri-score-group [aria-label^="Score "]');const n=Number(node?.getAttribute('aria-label')?.slice(6));return n>1000&&n<44000;});
 const intermediate=await page.locator('.tri-score-group [aria-label^="Score "]').getAttribute('aria-label');
 await page.screenshot({path:out+'count.png'});
 await page.evaluate(()=>window.fixtureUpdate());
 await page.getByLabel('Score 45780',{exact:true}).waitFor();
 await page.screenshot({path:out+'final.png'});
 await page.waitForURL('**/delayed/match');const returnAfterMs=Date.now()-completedAt;assert(returnAfterMs>=7900&&returnAfterMs<11000);
 await page.goto('http://127.0.0.1:15322/turn');await page.waitForURL('**/delayed/match');
 assert.equal(requests.filter(r=>r.op==='action').length,1);assert.deepEqual(errors,[]);
 writeFileSync(out+'browser.json',JSON.stringify({passed:true,fixture:true,viewport:{width:390,height:844},intermediate,returnAfterMs,requests,errors,checks:['actual adapter and shared shell/board','final card submits once','all-clear and count-up','duplicate response retains window','automatic match return','fresh reentry returns without action']},null,2));
 console.log('PASS local synthetic browser',intermediate,'return after',returnAfterMs,'ms');
}catch(error){console.error('Browser boundary failure',error,'page errors:',errors,'requests:',requests);throw error;}
finally{await browser.close();await server.close();}
