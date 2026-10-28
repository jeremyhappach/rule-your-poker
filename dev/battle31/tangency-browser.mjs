// Disposable loopback fixtures only. Exercises actual Game, shared chip/life
// renderers, and authoritative Knock/Stand transitions; never a hosted runner.
import {chromium} from '@playwright/test';
import {existsSync,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,localContext} from './database.mjs';
import {measureLifeGeometry,assertLifeGeometry} from './life-geometry.mjs';

const base='http://127.0.0.1:5199',db=await connect(localContext().database);
const f=await(await fetch(base+'/__battle31_route/new',{method:'POST',body:'{}'})).json();
const browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
const pages=[],errors=[],layouts=[],losses=[];
const allowViewportClip=process.argv.includes('--diagnose-clipping');
let id;
const match=async()=>(await db.query('SELECT state,revision FROM private.battle31_matches WHERE dealer_game_id=$1',[id])).rows[0];
const until=async(fn,label)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error(label);};
const evidence=()=>({passed:!errors.length&&!layouts.some(g=>g.markers.some(m=>m.bounds.right>g.width))&&!losses.some(l=>l.frames.some(g=>g.markers.some(m=>m.opacity>=.1&&m.bounds.right>g.width))),layouts,losses,errors});

try{
 for(const token of f.tokens){
  const p=await browser.newPage({viewport:{width:390,height:844}});
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await p.addInitScript('window.__lifeGeometry='+measureLifeGeometry.toString()+';');
  await p.addInitScript(()=>{window.__lifeFrames=[];const sample=()=>{if(document.querySelector('[data-canonical-leg-anchor="seat"] [data-life-dissolve]')){const g=window.__lifeGeometry();if(g)window.__lifeFrames.push(g);}requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await p.goto(base+'/game/'+f.game+'?token='+token,{waitUntil:'commit'});pages.push(p);
 }
 await pages[0].getByRole('button',{name:/Battle 31/}).click();
 await pages[0].locator('#ante-simple').fill('9');
 await pages[0].getByRole('button',{name:'Start Battle 31',exact:true}).click();
 await pages[1].getByRole('button',{name:/Ante Up!/}).click();
 id=(await db.query('SELECT current_game_uuid FROM public.games WHERE id=$1',[f.game])).rows[0].current_game_uuid;
 await until(async()=>(await match())?.state.phase==='playing','initial deal');

 for(const previousLosses of [0,1,2])for(const loserIndex of [0,1]){
  const m=await match(),stage=m.state.stage;
  // Isolate each presentation edge in this newly created fixture. No settled
  // match is modified; the ensuing round result comes from real game actions.
  const weak=[0,1,10],strong=[16,17,18]; // 15 versus 24, no initial special.
  const state={...m.state,phase:'playing',turn:1,turnIndex:0,hands:loserIndex===0?[weak,strong]:[strong,weak],center:[2,11,20],losses:[previousLosses,previousLosses],moves:[],knock:null,result:null,presentation:null,closing:false,deadline:Date.now()+300000,rules:{...m.state.rules,turnMs:300000}};
  await db.query('UPDATE private.battle31_matches SET state=$2::jsonb,revision=revision+1 WHERE dealer_game_id=$1',[id,JSON.stringify(state)]);
  await db.query('UPDATE public.battle31_revisions SET revision=revision+1 WHERE dealer_game_id=$1',[id]);
  for(const p of pages){await p.reload();await p.locator('[data-battle-phase="playing"]').waitFor();}
  if(previousLosses===0&&loserIndex===0){
   for(let viewer=0;viewer<pages.length;viewer++)for(const [width,height]of [[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[932,430],[1280,720]]){
    const p=pages[viewer];await p.setViewportSize({width,height});await p.waitForTimeout(350);
    const g=await p.evaluate(measureLifeGeometry);assertLifeGeometry(g,{allowViewportClip});layouts.push({viewer,...g});
    await p.screenshot({path:`qualification.local/battle31/tangent-${viewer}-${width}x${height}.png`});
   }
  }
  for(const p of pages){await p.setViewportSize({width:390,height:844});await p.waitForTimeout(350);await p.evaluate(()=>window.__lifeFrames=[]);}
  let active=pages[f.users.indexOf((await match()).state.players[(await match()).state.turnIndex].userId)];
  await active.getByRole('button',{name:'Knock',exact:true}).click();
  await until(async()=>(await match()).state.closing,'knock accepted');
  const closing=await match();active=pages[f.users.indexOf(closing.state.players[closing.state.turnIndex].userId)];
  await active.getByRole('button',{name:'Stand',exact:true}).click();
  await until(async()=>(await match()).state.phase==='round_result','showdown');
  const result=await match();assert.notEqual(result.state.result.loser,null,'fixture must lose one life');
  const loserUser=result.state.players[result.state.result.loser].userId,viewer=f.users.findIndex(u=>u!==loserUser),p=pages[viewer];
  await p.waitForFunction(()=>{const n=document.querySelector('[data-canonical-leg-anchor="seat"] [data-life-dissolve]');const elapsed=n?-parseFloat(n.style.animationDelay):0;return elapsed>=450&&elapsed<=1000;},undefined,{timeout:12000});
  await p.screenshot({path:`qualification.local/battle31/tangent-loss-${3-previousLosses}-${viewer}.png`});
  await until(async()=>(await match()).state.stage>stage,'next deal');
  const frames=await p.evaluate(()=>window.__lifeFrames);assert(frames.length>0,'live opponent loss was recorded');
  losses.push({previousLosses,viewer,frames});
  for(const g of frames)assertLifeGeometry(g,{allowViewportClip});
  const moving=frames.flatMap(g=>g.markers.filter(m=>m.animating));
  assert(moving.some(m=>m.elapsed>=350&&m.elapsed<=1000&&Math.abs(m.scale-2.6)<.05&&m.opacity>=.99),'2.6x visible hold');
  assert(moving.some(m=>m.elapsed>=1350&&m.opacity<.5),'dissolve after hold');
  await until(async()=>(await match()).state.phase==='playing','next round ready');
 }
 assert.equal(errors.length,0);
 write('qualification.local/battle31/tangency-proof.json',JSON.stringify(evidence(),null,2));
 console.log(JSON.stringify({passed:evidence().passed,layouts:layouts.length,lossCases:losses.length,frames:losses.map(x=>x.frames.length),maxTangencyError:Math.max(...layouts.map(g=>Math.abs(g.markers[0].tangentError))),clippedLayouts:layouts.filter(g=>g.markers.some(m=>m.bounds.right>g.width)).map(g=>({viewer:g.viewer,width:g.width,overflow:Math.max(...g.markers.map(m=>m.bounds.right))-g.width})),errors}));
 if(!allowViewportClip)assert(evidence().passed);
}catch(e){errors.push(e.message);write('qualification.local/battle31/tangency-proof.json',JSON.stringify(evidence(),null,2));throw e;}
finally{await db.end();await browser.close();}
