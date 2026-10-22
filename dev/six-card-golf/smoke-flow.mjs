import {chromium} from '@playwright/test';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5198',out=process.env.GOLF_REVIEW_OUT??'qualification.local/six-card-golf/',evidence={opening:[],moves:[],errors:[],scoring:[]};
mkdirSync(out,{recursive:true});
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const pairExample=process.env.GOLF_PAIR_REVIEW==='1';
const browser=await chromium.launch({headless:true,executablePath});
const post=async(op,body)=>(await fetch(base+'/__golf/'+op,{method:'POST',body:JSON.stringify(body)})).json();
const rpc=async(user,name,args)=>{const r=await post('rpc',{user,name,args});assert.equal(r.error,null,JSON.stringify(r));return r.data;};
try{for(const n of pairExample?[2]:[2,3,4]){
 const f=await post('new',{players:n});assert(f.id);
 const snap=user=>rpc(user??f.user,'golf_snapshot',{p_dealer_game_id:f.id});
 const act=(v,action,items=null)=>rpc(v.players[v.turnIndex].userId,'golf_action',{p_dealer_game_id:f.id,p_round_id:v.identity.roundId,p_request_id:randomUUID(),p_revision:v.revision,p_action:action,p_items:items});
 let v=await snap();
 for(let i=0;i<n;i++){for(const u of f.users){const s=await snap(u);assert.equal(s.discardTop,null);assert(s.tableaus[s.viewerId].cards.every((c,j)=>s.tableaus[s.viewerId].exposed[j]||c===null));}v=await act(v,'open',[0,3]);}
 assert.equal(v.phase,'playing');assert(Number.isInteger(v.discardTop));evidence.opening.push({n,allViewersRedacted:true,upcardAfterFinalOpening:true});
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 p.on('pageerror',err=>evidence.errors.push(err.message));await p.addInitScript(f=>sessionStorage.setItem('golf-fixture:'+f.id,JSON.stringify(f)),f);
 // Mount as the current actor so the complete private-draw/replacement sequence is exercised.
 const user=v.players[v.turnIndex].userId;await p.goto(base+'/dev/six-card-golf/live.html?id='+f.id+'&user='+user);await p.locator('.golf-local').waitFor();
 await p.evaluate(()=>{window.__golfBlank=[];window.__golfMoves=[];const check=()=>{for(const el of document.querySelectorAll('[data-golf-position]'))if(!el.querySelector('[data-playing-card-root]')||getComputedStyle(el.querySelector('[data-playing-card-root]')).visibility==='hidden')window.__golfBlank.push(el.dataset.golfPosition);window.__golfMoves.push({at:performance.now(),pending:!!document.querySelector('[data-golf-pending]'),flip:!!document.querySelector('.golf-discard-flip')});};window.__golfMonitor=setInterval(check,16);});
 await p.locator('[data-golf-discard]:not([disabled])').click();await p.screenshot({path:out+'smoke-'+n+'-selected-discard.png'});assert.equal(await p.locator('[data-golf-discard]').getAttribute('data-golf-selected'),'true');
 await p.locator('[data-golf-stock]:not([disabled])').click();await p.locator('[data-golf-pending]:not([disabled])').waitFor();
 assert.equal(await p.locator('[data-golf-discard]').isDisabled(),true);await p.screenshot({path:out+'smoke-'+n+'-pending.png'});
 const pending=await snap(user);assert(pending.pending);for(const u of f.users.filter(x=>x!==user))assert.equal((await snap(u)).pending,null);
 await p.locator('[data-golf-position="1"]:not([disabled])').click();await p.locator('[data-golf-displaced="incoming"]').waitFor();await p.screenshot({path:out+'smoke-'+n+'-offset.png'});await p.waitForFunction(()=>window.__golfMoves.some(x=>x.flip),null,{timeout:5000}).catch(async e=>{console.log('MOVE DEBUG',JSON.stringify(await p.evaluate(()=>({moves:window.__golfMoves.slice(-100),text:document.querySelector('.golf-helper')?.textContent,trace:window.__CARD_TRANSPORT_DBG__}))));throw e;});await p.screenshot({path:out+'smoke-'+n+'-discard-flip.png'});await p.locator('.golf-discard-flip').waitFor({state:'detached'});
 assert.deepEqual(await p.evaluate(()=>window.__golfBlank),[]);assert.equal(await p.locator('[data-golf-public-tableau]').count(),1);await p.screenshot({path:out+'smoke-'+n+'-opponent.png'});
 evidence.moves.push({n,noBlankSlots:true,pendingPrivate:true,discardFlip:true,activeOpponentOnly:true});
 // Finish a real hole through legal actions, stopping before the final completed turn.
 v=await snap();let steps=0;
 while(!(v.finalQueue?.length===1&&v.hasPending)){assert(++steps<100);if(v.hasPending){const b=v.tableaus[v.players[v.turnIndex].id],index=b.exposed.findIndex(x=>!x);v=await act(v,'replace',[index<0?0:index]);}else v=await act(v,'draw');}
 await p.waitForTimeout(400);
 let seconds=60,review=null;
 await p.locator('.golf-final-turn').waitFor();await p.screenshot({path:out+'smoke-'+n+'-final-turn.png'});for(const [width,height] of [[320,568],[844,390]]){await p.setViewportSize({width,height});await p.screenshot({path:out+'smoke-'+n+'-final-turn-'+width+'.png'});const overlap=await p.evaluate(()=>{const a=document.querySelector('.golf-final-turn').getBoundingClientRect();return [...document.querySelectorAll('.golf-public-cards,[data-canonical-felt-plate-title]')].some(e=>{const b=e.getBoundingClientRect();return Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);});});assert.equal(overlap,false,'final turn has dedicated space above cards');}await p.setViewportSize({width:390,height:844});
 // Explicit local visual proposal: intercept only this browser's projection.
 // The isolated database keeps its current six-second results deadline.
 await p.route('**/__golf/rpc',async route=>{const response=await route.fetch();const body=await response.json();if(body.data?.phase==='hole_complete'||review&&body.data?.identity?.dealerGameId===f.id){if(!review){review=body.data;
 // Controlled PUBLIC presentation fixture only. This does not write cards, scores,
 // settlement or timing to the database, and is not authoritative scoring evidence.
 if(pairExample){const order=[...review.players.filter(p=>p.id!==review.viewerId),...review.players.filter(p=>p.id===review.viewerId)];const hands=[[3,8,10,5,21,12],[13,15,17,19,22,24]],totals=[20,36];order.forEach((p,i)=>{p.name='Player '+(i+1);review.tableaus[p.id]={cards:hands[i],exposed:Array(6).fill(true)};review.scores[p.id]=totals[i];review.holes.find(h=>h.roundId===review.identity.roundId).scores[p.id]=totals[i];});}
 if(pairExample){const order=[...review.players.filter(p=>p.id!==review.viewerId),...review.players.filter(p=>p.id===review.viewerId)];const startedAt=review.presentation.startedAt;review.presentation={version:1,startedAt,resultsAt:startedAt+22560,endsAt:startedAt+27560,hidden:{[order[0].id]:[1,4],[order[1].id]:[0]}};review.deadline=review.presentation.endsAt;}seconds=(review.presentation.endsAt-review.presentation.startedAt)/1000;}body.data={...review,serverAt:Date.now()};}await route.fulfill({response,json:body});});
 await p.evaluate(seconds=>{history.replaceState(null,'',location.href+'&timingReview='+seconds);const header=document.querySelector('[data-canonical-shell-header]')??document.querySelector('header');if(header)header.textContent='LOCAL REVIEW · scoring 1200ms · results 5000ms';},seconds);
 await p.evaluate(()=>{window.__staleGolfScoring=[];const check=()=>{if(document.querySelector('.golf-scoring-hand')){const text=(document.querySelector('[data-canonical-announcement-content]')?.textContent??'')+' '+(document.querySelector('.golf-helper')?.textContent??'');if(/Final turns/i.test(text))window.__staleGolfScoring.push(text);}window.__scoreMonitor=requestAnimationFrame(check);};check();});
 v=await act(v,'replace',[0]);assert.equal(v.phase,'hole_complete');
 await p.locator('[data-golf-score-kind="intro"]').waitFor();await p.screenshot({path:out+'smoke-'+n+'-scoring.png'});

 const seen=[];for(let i=0;i<(seconds+2)*10;i++){const state=await p.locator('.golf-scoring-hand').evaluate(el=>({player:el.dataset.golfScorePlayer,kind:el.dataset.golfScoreKind,step:el.dataset.golfScoreStep,flipQuarter:Math.floor(Number(el.querySelector('.golf-scoring-flip')?.getAnimations()[0]?.currentTime??0)/300),announcement:document.querySelector('[data-canonical-announcement-content]')?.textContent??'',helper:document.querySelector('.golf-helper')?.textContent??'',highlights:el.querySelectorAll('.golf-score-highlight').length,dim:el.querySelectorAll('.golf-scored').length}));if(!seen.length||seen.at(-1).signature!==JSON.stringify(state)){const image='smoke-'+n+'-step-'+seen.length+'.png';await p.screenshot({path:out+image});seen.push({...state,signature:JSON.stringify(state),image,at:Date.now()});}if(await p.getByRole('dialog').filter({hasText:'Completed hole scores'}).count()){assert.equal(await p.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).count(),0);break;}await p.waitForTimeout(100);}
 assert.deepEqual(await p.evaluate(()=>window.__staleGolfScoring),[],'no Final turns survives into scoring');
 assert.equal(new Set(seen.filter(x=>x.kind==='total').map(x=>x.player)).size,n);assert(seen.some(x=>x.highlights>0));await p.screenshot({path:out+'smoke-'+n+'-results.png'});
 if(pairExample){
  assert(seen.some(s=>s.announcement==='4: +4'&&s.helper==='Scoring Player 1/Hole 1: +4'));
  assert(seen.some(s=>s.announcement==='6: +6'&&s.helper==='Scoring Player 1/Hole 1: +10'));
  assert(seen.some(s=>s.announcement==='Pair: +0'&&s.helper==='Scoring Player 1/Hole 1: +10'&&s.highlights===2));
 }
 evidence.scoring.push({n,proposedSeconds:seconds,sequence:seen,serverSeconds:pairExample?null:seconds,presentationFixture:pairExample?'Controlled public pair example; browser projection only':null});
 await p.reload();await p.getByRole('dialog').filter({hasText:'Completed hole scores'}).waitFor();assert.equal(await p.locator('.golf-score-highlight').count(),0);
 evidence.scoring.at(-1).reconnectSeeksResults=true;
 await p.close();
 console.log('PASS local smoke',n);
 }
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}catch(e){console.error(e);evidence.failure=e.stack;process.exitCode=1;}finally{writeFileSync(out+'smoke-flow.json',JSON.stringify(evidence,null,2));await browser.close();}

