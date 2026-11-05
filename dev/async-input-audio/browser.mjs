import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=resolve(root,'dev/async-input-audio'),out=resolve(root,'qualification.local/async-input-audio'),origin='http://127.0.0.1:15461';
mkdirSync(out,{recursive:true});
const rules={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json','utf8')),version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000,holdMs:5000};
const transport=resolve(dir,'transport.ts');
const server=await createServer({configFile:false,envFile:false,cacheDir:resolve(out,'cache'),plugins:[react(),{name:'fixture-html',configureServer(s){s.middlewares.use((req,res,next)=>{if(!['/turn','/diagnostics'].some(p=>req.url?.startsWith(p)))return next();s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-input-audio/entry.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});});}}],optimizeDeps:{entries:['dev/async-input-audio/entry.tsx']},resolve:{alias:[...['@/integrations/supabase/client','@/lib/delayed/client','@/lib/arcade/client'].map(find=>({find,replacement:transport})),{find:'@',replacement:resolve(root,'src')}]},server:{host:'127.0.0.1',port:15461,strictPort:true}});
await server.listen();
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[];
const late=process.argv.includes('--late');
try{for(const mode of process.argv.includes('--controls-only')?[]:late?['async']:['async','arcade'])for(const mute of late?[false]:[false,true]){
 const errors=[],commands=[];let board=null,revision=1,ended=false;
 const freshBoard=()=>({rules,phase:'intro',cards:Array.from({length:28},(_,i)=>i<3?i+2:i>=18?(i-13)%13:null),removed:Array.from({length:15},(_,i)=>i+3),waste:4,stockRemaining:12,run:0,highRun:0,score:0,deadline:Date.now()+2500,result:null});
 if(mode==='arcade')board=freshBoard();
 const project=()=>{const now=Date.now();if(board?.phase==='intro'&&now>=board.deadline){board={...board,phase:'ready',deadline:now+30000};revision++;}
  if(mode==='arcade')return {id:'child',game:'tri-towers',ruleset:rules.version,revision,status:'active',serverAt:now,score:board.score,dueAt:board.deadline,events:[],view:{...board,roundId:'round',round:1,highRun:board.highRun,scorePresentation:null,event:{label:'Playing',points:0}}};
  return {id:'child',matchId:'match',game:'tri-towers',config:rules,revision,segment:ended?2:1,actor:ended?'other':'me',round:1,board:ended?null:board,totals:{me:ended?board.score:0,other:0},terminal:ended,held:false,expiresAt:new Date(now+129600000).toISOString(),serverAt:now,ownResults:ended?[{round:1,score:board.score,at:board.result.completedAt,result:board.result,board}]:[],winner:null,result:null};};
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.proof={events:[],nodes:[],clicks:[],frames:[]};const Real=window.AudioContext;window.AudioContext=class extends Real{createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...args)=>{window.proof.nodes.push({type:n.type,at:performance.now()});return start(...args);};return n;}createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...args)=>{if(n.buffer?.duration>.02)window.proof.nodes.push({type:'sample',at:performance.now()});return start(...args);};return n;}};
  document.addEventListener('click',e=>{const el=e.target.closest('[data-tri-card]');if(!el)return;const entry={index:Number(el.dataset.triCard),at:performance.now()};window.proof.clicks.push(entry);const poll=()=>{const card=document.querySelector('[data-tri-card="'+entry.index+'"]');if(!card){entry.removed=performance.now();return;}if(card.dataset.pending==='true'&&!entry.pending)entry.pending=performance.now();if(performance.now()-entry.at<2000)requestAnimationFrame(poll);};requestAnimationFrame(poll);},true);
  let last=performance.now();const frame=at=>{window.proof.frames.push(at-last);last=at;requestAnimationFrame(frame);};requestAnimationFrame(frame);
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname!=='/fixture-api')return route.continue();const c=route.request().postDataJSON();commands.push(c);project();if(c.op==='action'){await new Promise(r=>setTimeout(r,180));revision++;if(c.intent.type==='start')board=freshBoard();else if(c.intent.type==='remove'){const i=c.intent.index;board={...board,phase:'playing',removed:[...board.removed,i],waste:board.cards[i],score:board.score+1000,deadline:Date.now()+120000};if(board.removed.length===28){ended=true;const completedAt=Date.now();board={...board,phase:'stage_complete',deadline:completedAt+8000,result:{id:'result',stage:1,reason:'cleared',scoreBefore:0,score:board.score,stageScore:board.score,timeBonus:0,stockBonus:0,completedAt}};}}if(late&&(c.intent.type==='start'||ended))await new Promise(r=>setTimeout(r,ended?3200:1800));}return route.fulfill({json:project()});});
 await page.goto(origin+'/turn?mode='+mode+'&mute='+(mute?'1':'0')+'&trace='+(mode==='async'&&!mute?'1':'0'));
 if(mode==='async')await page.getByRole('button',{name:'Begin round 1'}).click();else await page.mouse.click(5,5);
 await page.locator('[data-tri-card="18"]:not([disabled])').waitFor();
 for(const i of [...Array.from({length:10},(_,j)=>18+j),0,1,2]){await page.locator('[data-tri-card="'+i+'"]:not([disabled])').click();await page.locator('[data-tri-card="'+i+'"]').waitFor({state:'detached'});}
 await page.waitForTimeout(500);
 const data=await page.evaluate(()=>({events:window.proof.events,nodes:window.proof.nodes,clicks:window.proof.clicks,frames:window.proof.frames,preference:window.manager.getSnapshot(),celebration:!!document.querySelector('.tri-all-clear')}));
 results.push({mode,mute,errors,commands:commands.length,...data});console.log(JSON.stringify({mode,mute,errors,nodes:data.nodes.reduce((out,n)=>(out[n.type]=(out[n.type]||0)+1,out),{}),events:data.events.filter(e=>e.id.startsWith('run21-bell')||e.id.startsWith('tri-clear')||e.id.startsWith('tri-tower')),latency:data.clicks.map(c=>({remove:Math.round(c.removed-c.at),pending:c.pending?Math.round(c.pending-c.at):null})),celebration:data.celebration}));
 assert.deepEqual(errors,[]);assert(data.clicks.every(c=>c.pending&&c.pending-c.at<100));
 const nodes=type=>data.nodes.filter(n=>n.type===type).length;
 if(mute)assert.equal(data.nodes.length,0);else if(!late){assert.equal(nodes('sine'),15);assert.equal(nodes('triangle'),12);assert.equal(nodes('custom'),6);assert(data.celebration);}
 if(mode==='async'&&!mute){await page.evaluate(()=>window.trace.stop());const trace=await page.evaluate(()=>JSON.parse(window.trace.export()));assert(trace.entries.some(e=>e.event==='tri-presentation'));assert(trace.entries.some(e=>e.event==='sources-scheduled'&&e.cue?.startsWith('tri-clear:')));writeFileSync(resolve(out,'browser-trace.json'),JSON.stringify(trace,null,2));}
 if(mode==='async')await page.getByText('Match destination').waitFor();await page.close();
 }
 // Real shared Quintzee view: exact selection edges, reset silence and mute cutoff.
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await page.addInitScript(()=>{window.proof={events:[],nodes:[],stops:0};const Real=window.AudioContext;window.AudioContext=class extends Real{createOscillator(){const n=super.createOscillator(),set=n.frequency.setValueAtTime.bind(n.frequency),stop=n.stop.bind(n);n.frequency.setValueAtTime=(...a)=>{window.proof.nodes.push(a[0]);return set(...a);};n.stop=(...a)=>{window.proof.stops++;return stop(...a);};return n;}};});
 await page.route(/^https?:\/\/(?!127\.0\.0\.1:15461)/,route=>route.abort());
 await page.goto(origin+'/turn?mode=quintzee');const die=page.getByRole('button',{name:/Die 1:/});await page.getByRole('button',{name:'Mute sounds',exact:true}).waitFor();
 // This fixture mounts an already-rolled board; supply its preceding navigation gesture.
 await page.mouse.click(5,5);await page.waitForFunction(()=>window.manager.context?.state==='running');await die.click();await die.click();
 assert.deepEqual(await page.evaluate(()=>window.proof.nodes),[660,880]);await page.evaluate(()=>window.resetDice());assert.deepEqual(await page.evaluate(()=>window.proof.nodes),[660,880]);
 await die.click();await page.getByRole('button',{name:'Mute sounds',exact:true}).click();const stopped=await page.evaluate(()=>window.proof.stops);assert(stopped>=4);await die.click();assert.equal(await page.evaluate(()=>window.proof.nodes.length),3);
 await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();assert.equal(await page.evaluate(()=>window.proof.nodes.length),3);await die.click();assert.equal(await page.evaluate(()=>window.proof.nodes.length),4);
 // The same iPhone-sized diagnostic dialog supplies native share, download, copy fallback and persisted reload.
 await page.goto(origin+'/diagnostics');await page.getByRole('button',{name:'Start trace',exact:true}).click();await page.reload();await page.getByText('Recording sound events',{exact:true}).waitFor();await page.getByRole('button',{name:'Stop trace',exact:true}).click();
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async v=>{window.sharedTrace=await v.files[0].text();}});});
 await page.getByRole('button',{name:'Share trace',exact:true}).click();await page.waitForFunction(()=>!!window.sharedTrace);assert.equal(await page.evaluate(()=>JSON.parse(window.sharedTrace).version),1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save trace',exact:true}).click();await (await download).saveAs(resolve(out,'export.json'));
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked');}}}));await page.getByRole('button',{name:'Copy trace',exact:true}).click();assert((await page.getByRole('textbox',{name:'Audio trace text'}).inputValue()).includes('trace-start'));
 await page.screenshot({path:resolve(out,'diagnostics-iphone.png')});await page.getByRole('button',{name:'Clear trace',exact:true}).click();assert.equal(await page.evaluate(()=>window.trace.export()),'null');await page.close();
 results.push({scenario:'Quintzee hold/release/mute and iPhone-sized diagnostic share/save/copy/reload',passed:true});
 }finally{writeFileSync(resolve(out,process.argv.includes('--controls-only')?'controls.json':'browser.json'),JSON.stringify(results,null,2));await browser.close();await server.close();}
