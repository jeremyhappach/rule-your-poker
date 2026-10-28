// Actual canonical Golf UI with synthetic public snapshots. No database access.
// Reuse the established local shell fixture; only the scenario transport differs.
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
let source=read('dev/six-card-golf/cardback-seat-review.mjs','utf8');
source=source.slice(0,source.indexOf("if(process.argv.includes('--check'))"));
source=source.replaceAll('5221','5234').replace("const requests=[];","const requests=[];const initialSnapshots=structuredClone(snapshots);const clients=new Set();const publish=()=>{for(const res of clients)res.write('data: '+JSON.stringify({table:'golf_revisions',new:{revision:snapshots[0].revision}})+'\\n\\n');};");
source=source.replace("  if(url.pathname==='/__cardback-portrait'){",`  if(url.pathname==='/__completion-review'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Golf local completion review</title><style>body{background:#e5e7eb;font:14px system-ui;text-align:center}button{padding:10px;margin:4px}iframe{display:block;width:390px;height:680px;border:0;margin:16px auto;background:white}</style><h2>Golf · local review only</h2><p>Synthetic public snapshots. No database connection.</p><button onclick="fetch(&quot;/__completion-scene?scene=fresh&quot;).then(()=>document.querySelector(&quot;iframe&quot;).src=&quot;/__cardback-review?players=2&quot;)">Reset fresh table</button><button onclick="fetch(&quot;/__completion-scene?scene=autoplay&quot;)">Simulate timeout / rejoin</button><button onclick="fetch(&quot;/__completion-scene?scene=final&quot;)">Last opponent move → scoring</button><p>Tap the blue standings for the pencil scorecard. Reset before replaying a scenario.</p><iframe title="Actual Golf table" src="/__cardback-review?players=2"></iframe>');return;
  }
  if(url.pathname==='/__completion-scene'){
   if(url.searchParams.get('scene')==='fresh'){const revision=snapshots[0].revision+1;snapshots[0]=structuredClone(initialSnapshots[0]);snapshots[0].revision=revision;publish();res.end('ok');return;}
   const s=snapshots[0],self=s.players[0].id,other=s.players[1].id,scene=url.searchParams.get('scene');
   s.revision++;s.hole=3;s.holes=[{hole:1,roundId:'old1',scores:{[self]:4,[other]:0}},{hole:2,roundId:'old2',scores:{[self]:-2,[other]:3}}];s.scores={[self]:2,[other]:3};
   if(scene==='autoplay'){s.playerControls[self]={autoPlay:true,sitOutNextHand:true,intentVersion:4};}
   if(scene==='final'){
    s.phase='hole_complete';s.turnIndex=0;s.canAct=true;s.discardTop=8;
    s.tableaus[self]={cards:[48,2,3,18,4,5],exposed:Array(6).fill(true)};
    s.tableaus[other]={cards:[50,40,5,35,6,7],exposed:Array(6).fill(true)};
    s.holes.push({hole:3,roundId:s.identity.roundId,scores:{[self]:6,[other]:9}});s.scores={[self]:8,[other]:12};
    const at=Date.now();s.presentation={version:1,startedAt:at,resultsAt:at+60000,endsAt:at+65000,hidden:{[self]:[1,2,4,5],[other]:[2,4,5]}};
   }
   publish();res.end('ok');return;
  }
  if(url.pathname==='/__cardback-portrait'){
`);
source=source.replace("res.write(': synthetic read-only fixture\\n\\n');return;","res.write(': synthetic read-only fixture\\n\\n');clients.add(res);req.on('close',()=>clients.delete(res));return;");
source=source.replace("  if(url.pathname==='/__golf/rpc'&&q.name==='golf_snapshot')",`  if(url.pathname==='/__golf/rpc'&&q.name==='golf_reclaim_control'){
   const s=snapshots[0],id=s.players[0].id;
   assert.equal(q.args.p_expected_version,s.playerControls[id].intentVersion);assert.equal(q.args.p_round_id,s.identity.roundId);
   s.playerControls[id]={autoPlay:false,sitOutNextHand:false,intentVersion:5};s.revision++;data={...s,serverAt:Date.now()};publish();
  }else if(url.pathname==='/__golf/rpc'&&q.name==='golf_snapshot')`);
source+=`
if(process.argv.includes('--check')){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const p=await browser.newPage({viewport:{width:390,height:680},isMobile:true,hasTouch:true});const errors=[];const external=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});
 try{
  await p.goto('http://127.0.0.1:5234/__cardback-review?players=2');await p.locator('.golf-local').waitFor();
  assert.equal(await p.getByRole('checkbox',{name:'Auto-play'}).count(),0);assert.equal(await p.getByRole('button',{name:'Table information'}).count(),0);
  await p.request.get('http://127.0.0.1:5234/__completion-scene?scene=autoplay');const checkbox=p.getByRole('checkbox',{name:'Auto-play'});await checkbox.waitFor();assert.ok(await checkbox.isChecked());
  const label=await checkbox.locator('..').boundingBox(),pane=await p.locator('.golf-pane').boundingBox();assert.ok(label.height>=44&&label.y>=pane.y&&label.y+label.height<=pane.y+pane.height+1,'rejoin target must fit active pane');
  await p.screenshot({path:out+'/completion-autoplay.png'});await checkbox.click();await checkbox.waitFor({state:'detached'});await p.reload();await p.locator('.golf-local').waitFor();assert.equal(await checkbox.count(),0);
  assert.deepEqual(await p.locator('.golf-leaderboard tbody td').allTextContents(),['+2','+3']);await p.getByRole('button',{name:'Open nine-hole scorecard'}).click();
  assert.deepEqual(await p.locator('.golf-scorecard tbody tr').first().locator('td').allTextContents(),['+4','-2','','','','','','','','+2']);
  await p.getByRole('dialog').evaluate(async e=>{await Promise.all(e.getAnimations({subtree:true}).map(a=>a.finished));});
  await p.screenshot({path:out+'/completion-scorecard.png'});await p.getByRole('button',{name:'Close',exact:true}).click();
  await p.evaluate(()=>{window.__golfFrames=[];const check=()=>{window.__golfFrames.push({at:performance.now(),piles:!!document.querySelector('.golf-piles')&&getComputedStyle(document.querySelector('.golf-piles')).visibility!=='hidden',owner:!!document.querySelector('[data-viewer-turn]'),scoring:!!document.querySelector('.golf-scoring-hand')});window.__golfRaf=requestAnimationFrame(check);};check();});
  await p.request.get('http://127.0.0.1:5234/__completion-scene?scene=final');await p.locator('.golf-scoring-hand').waitFor();
  const frames=await p.evaluate(()=>{cancelAnimationFrame(window.__golfRaf);return window.__golfFrames;});assert.ok(frames.some(f=>f.piles),'final animation anchors retained');assert.ok(frames.every(f=>!f.owner),'no stale owner turn flash');
  const waiting=frames.filter(f=>!f.piles&&!f.scoring);assert.ok(waiting.length>0&&waiting.at(-1).at-waiting[0].at>=1100,'configured 1200ms pre-scoring hold retained');
  assert.deepEqual(await p.locator('.golf-leaderboard tbody td').allTextContents(),['+2','+3']);assert.equal(await p.locator('.golf-piles').count(),0);
  await p.screenshot({path:out+'/completion-scoring.png'});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  writeFileSync(out+'/completion-evidence.json',JSON.stringify({passed:true,viewport:{width:390,height:680},label,pane,frames,requests,errors,external},null,2));console.log('Local completion browser checks passed');
 }finally{await browser.close();await server.close();}
}
`;
const folder=resolve('qualification.local/golf-local-completion');mkdirSync(folder,{recursive:true});const generated=folder+'/browser-fixture.mjs';write(generated,source);await import(pathToFileURL(generated).href+'?run='+Date.now());
