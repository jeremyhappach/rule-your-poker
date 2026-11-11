import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const output='.quintzee-layout';mkdirSync(output,{recursive:true});
const baseline=process.argv.includes('--baseline'),hosted=process.env.QUINTZEE_HOSTED_URL;
const postRollReference=JSON.parse(readFileSync('dev/quintzee-layout/post-roll-reference.json','utf8'));
let publishedCss='';
if(hosted){
 const html=await (await fetch(hosted)).text();
 const scripts=[...html.matchAll(/src="([^"]+\.js)"/g)].map(m=>m[1]);
 const modules=await Promise.all(scripts.map(p=>fetch(new URL(p,hosted)).then(r=>r.text())));
 const cssPaths=[...new Set([...html.matchAll(/href="([^"]+\.css)"/g)].map(m=>m[1]).concat(modules.flatMap(s=>[...s.matchAll(/["'](assets\/[^"']+\.css)["']/g)].map(m=>m[1]))))];assert(cssPaths.length>=4,'include published lazy route CSS');
 console.log('Published styles:',cssPaths.join(', '));
 publishedCss=(await Promise.all(cssPaths.map(p=>fetch(new URL(p,hosted)).then(r=>r.text())))).join('\n');
 assert(publishedCss.includes('q-confirm-controls'),'published CSS includes candidate');
}
const server=await createServer({configFile:false,envFile:false,plugins:[react(),{name:'quintzee-layout',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/layout'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="root"></div><script type="module" src="/dev/quintzee-layout/view.tsx"></script>'));});}}],resolve:{alias:[{find:'@/hooks/useAuthGuard',replacement:resolve('dev/async-combined/live-preview-auth.ts')},{find:'@/integrations/supabase/client',replacement:resolve('dev/async-combined/live-preview-transport.ts')},{find:'@',replacement:resolve('src')}]},server:{host:'127.0.0.1',port:15462,strictPort:true}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[];
const geometry=page=>page.evaluate(()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
 const get=s=>box(document.querySelector(s)),css=s=>getComputedStyle(document.querySelector(s));
 return {plane:get('.quintzee-plane'),board:get('.fullscreen-game-board'),players:get('.q-players'),timing:get('.q-timing'),scorecard:get('.q-scorecard'),bonus:get('.q-bonuses'),guide:get('.q-roll-guide'),dice:[...document.querySelectorAll('.q-dice button')].map(box),faces:[...document.querySelectorAll('.q-die')].map(box),roll:get('.q-roll'),selectors:[...document.querySelectorAll('.q-selector')].map(box),bonusFont:parseFloat(css('.q-bonuses').fontSize),holdFont:parseFloat(css('.q-dice small')?.fontSize||0),buttonFont:parseFloat(css('.q-roll').fontSize),scrollHeight:document.querySelector('.fullscreen-game-board').scrollHeight,clientHeight:document.querySelector('.fullscreen-game-board').clientHeight,scrollTop:document.querySelector('.fullscreen-game-board').scrollTop,bodyOverflow:document.documentElement.scrollHeight>innerHeight+1};
});
const update=async(page,change)=>{await page.evaluate(change);await page.waitForTimeout(40);};
const stableGeometry=page=>page.evaluate(()=>{
 const rect=e=>{const b=e.getBoundingClientRect();return {top:b.top,left:b.left,width:b.width,height:b.height};};
 return {parts:Object.fromEntries(['.q-players','.q-timing','.q-scorecard','.q-bonuses','.q-dice','.q-roll'].map(s=>[s,rect(document.querySelector(s))])),rows:[...document.querySelectorAll('.q-category')].map(rect),gaps:[...document.querySelectorAll('.q-scorecard section')].flatMap(s=>[...s.children].slice(1).map((e,i)=>e.getBoundingClientRect().top-s.children[i].getBoundingClientRect().bottom))};
});
const differences=(before,after)=>{
 const diffs=[];
 for(const key of Object.keys(before.parts))for(const dimension of ['top','left','width','height'])if(Math.abs(before.parts[key][dimension]-after.parts[key][dimension])>1)diffs.push(key+'.'+dimension+': '+before.parts[key][dimension]+' -> '+after.parts[key][dimension]);
 before.rows.forEach((b,i)=>{for(const key of ['top','height'])if(Math.abs(b[key]-after.rows[i][key])>1)diffs.push('row '+i+' '+key+': '+b[key]+' -> '+after.rows[i][key]);});
 before.gaps.forEach((gap,i)=>{if(Math.abs(gap-after.gaps[i])>1)diffs.push('row gap '+i+': '+gap+' -> '+after.gaps[i]);});return diffs;
};
try{
 for(const [width,height,top,bottom]of [[375,667,20,0],[375,812,44,34],[390,844,47,34],[393,852,59,34],[430,932,59,34]])for(const mode of ['arcade','async','multiplayer']){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:15462/layout?mode='+mode);await page.locator('.q-roll').waitFor();
  if(hosted){await page.evaluate(()=>document.querySelectorAll('style[data-vite-dev-id]').forEach(e=>e.remove()));await page.addStyleTag({content:publishedCss});}
  // Browser emulation does not expose native env() insets; inject the shell's
  // resolved iPhone padding, never a game-specific safe-area override.
  await page.locator('[data-shell-presentation-mode]').evaluate((e,{top,bottom})=>{e.style.paddingTop=top+'px';e.style.paddingBottom=bottom+'px';},{top,bottom});
  const initial=await geometry(page);
  const postRoll=await stableGeometry(page),states=[];
  if(!baseline){const reference=postRollReference.cases.find(r=>r.width===width&&r.height===height&&r.mode===mode);assert(reference,'frozen approved post-roll reference');assert.deepEqual(differences(reference.geometry,postRoll),[],mode+' '+width+'x'+height+' preserves approved post-roll layout');}
  const capture=async name=>{const geometry=await stableGeometry(page),changes=differences(postRoll,geometry);states.push({name,geometry,changes});if(!baseline)assert.deepEqual(changes,[],mode+' '+width+'x'+height+' '+name+' must preserve post-roll geometry');if(width===393&&['before first roll: ready','first roll'].includes(name))await page.screenshot({path:output+'/'+(hosted?'hosted':baseline?'baseline':'candidate')+'-'+mode+'-'+(name==='first roll'?'after-first-roll':'before-first-roll')+'.png'});};
  await page.evaluate(()=>{window.layoutInitial=structuredClone(window.snapshot);});
  await update(page,()=>window.setSnapshot(v=>({...v,state:{...v.state,board:{...v.state.board,phase:'ready',dice:[],held:[],rollsRemaining:3}}})));
  await capture('before first roll: ready');assert.equal(await page.locator('.q-dice button,.q-die').count(),0,'no placeholder dice');
  await update(page,()=>window.setSnapshot(v=>({...v,state:{...v.state,board:{...v.state.board,phase:'playing'}}})));
  await capture('before first roll: empty');
  await update(page,()=>window.setSnapshot(window.layoutInitial));
  await capture('first roll');
  if(!baseline){
   assert(initial.roll.height>=64,mode+' primary target >=64');
   assert(initial.bonusFont>=16,'readable bonus text');
   assert(!initial.bodyOverflow,'no document scrolling');
   assert(initial.scrollHeight<=initial.clientHeight+1,'no gameplay scrolling');
   assert(initial.board.bottom<=height-bottom,'shell reserves bottom safe area');
   for(const die of initial.dice){assert(die.width>=44&&die.height>=64,'comfortable dice target');}
   for(const face of initial.faces){assert(face.width>=40&&Math.abs(face.width-face.height)<1,'square full-sized dice');}
   for(const target of initial.selectors)assert(target.width>=48&&target.height>=48,'48px category targets retained');
   const bands=[initial.players,initial.timing,initial.scorecard,initial.bonus,initial.guide,...initial.dice,initial.roll].filter(b=>b.height>0);
   for(const b of bands)assert(b.y>=initial.board.y-1&&b.bottom<=initial.board.bottom+1,'every control visible without scrolling');
   for(let i=0;i<bands.length;i++)for(let j=i+1;j<bands.length;j++){const a=bands[i],b=bands[j];assert(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,'controls never overlap '+i+':'+j);}
   const bonus=await page.locator('.q-bonuses').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,children:[...e.children].map(c=>c.getBoundingClientRect().y)}));
   assert(bonus.scroll<=bonus.width,'bonus fits one line');assert(Math.abs(bonus.children[0]-bonus.children[1])<2,'bonuses aligned');
   const content=await page.evaluate(()=>({scores:[...document.querySelectorAll('.q-players .tri-score-cell')].map(e=>{const a=e.getBoundingClientRect(),b=e.closest('.q-players').getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1;}),labels:[...document.querySelectorAll('.q-category>span')].map(e=>e.scrollWidth<=e.clientWidth+1),targets:[...document.querySelectorAll('.q-selector,.q-dice button,.q-roll')].map(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})}));
   assert(content.scores.every(Boolean),'score pills and chip balances fit their row');assert(content.labels.every(Boolean),'category labels not clipped');assert(content.targets.every(Boolean),'actual targets unobstructed');
   const rolled=await geometry(page);assert(rolled.roll.bottom<=rolled.board.bottom+1,'action reachable above safe area');
   await page.locator('.q-dice button').nth(1).tap();await page.locator('.q-dice button').nth(4).tap();
   assert.equal(await page.locator('.q-dice [data-held=true]').count(),2);
   await page.locator('.q-dice button').nth(1).tap();assert.equal(await page.locator('.q-dice [data-held=true]').count(),1);await page.locator('.q-dice button').nth(1).tap();
   const held=await geometry(page);assert.deepEqual(held.dice,rolled.dice,'holding never shifts dice boxes');assert.deepEqual(held.faces,rolled.faces,'held face size stays fixed');
   await capture('held/released');
   await page.locator('.q-roll').tap();assert.deepEqual(await page.evaluate(()=>window.intents.pop()),{type:'roll',items:[4,1]});
   await update(page,()=>{window.setPending(true);});assert(await page.locator('.q-roll').isDisabled());assert.equal((await geometry(page)).roll.height,initial.roll.height);
   await update(page,()=>{window.setPending(false);window.setSnapshot(v=>({...v,revision:2,state:{...v.state,board:{...v.state.board,dice:[6,2,6,6,2],held:[1,4],rollsRemaining:1,rollSerial:1}}}));});
   await page.locator('.q-dice [data-rolling=true]').first().waitFor();assert.equal(await page.locator('.q-dice [data-rolling=true]').count(),3);assert.equal(await page.locator('.q-dice [data-held=true][data-rolling=false]').count(),2);
   await capture('reroll animation');
   await page.waitForFunction(()=>document.querySelectorAll('.q-dice [data-rolling=true]').length===0);
   await capture('rerolled');
   await update(page,()=>{window.setPending(false);window.setSnapshot(v=>({...v,revision:3,state:{...v.state,board:{...v.state.board,dice:[5,2,4,1,2],held:[1,4],rollsRemaining:0}}}));});
   assert(await page.locator('.q-roll').isDisabled());assert((await page.locator('.q-roll').innerText()).includes('CHOOSE A CATEGORY'));
   await capture('zero rerolls');
   assert.equal((await geometry(page)).roll.height,initial.roll.height);
   if(width===393)await page.screenshot({path:output+'/'+(hosted?'hosted':'candidate')+'-'+mode+'-zero-rerolls.png'});
   await page.locator('[data-category=ones]>span').dispatchEvent('click');assert.equal(await page.evaluate(()=>window.intents.length),0);
   await page.locator('[data-category=ones] .q-selector').tap();assert.deepEqual(await page.evaluate(()=>window.intents.pop()),{type:'score',items:[0]});
   await update(page,()=>window.setSnapshot(v=>({...v,revision:3,state:{...v.state,board:{...v.state.board,scores:{ones:1},rollsRemaining:2}}})));
   assert.equal(await page.locator('[data-category=ones] .q-selector').count(),0);assert.equal(await page.locator('[data-category=ones] strong').innerText(),'1');
   await capture('category completed');
   await page.locator('[data-category=sixes] .q-selector').tap();await page.getByRole('button',{name:'Confirm 0',exact:true}).waitFor();
   await page.getByRole('button',{name:'Confirm 0',exact:true}).click({trial:true});
   const confirm=await page.getByRole('button',{name:'Confirm 0',exact:true}).boundingBox();assert(confirm.height>=64,'confirm target >=64');
   await page.getByRole('button',{name:'Cancel',exact:true}).tap();
   await update(page,()=>window.setSnapshot(v=>({...v,scope:'layout:2',revision:4,state:{...v.state,round:2,board:{...v.state.board,phase:'ready',dice:[],held:[],scores:{},rollsRemaining:3,rollSerial:0}}})));
   assert.equal(await page.locator('.q-dice button').count(),0);assert((await page.locator('.fullscreen-game-heading').innerText()).includes('Round 2 of 2'));
   await capture('new round: ready');
   await page.locator('.q-roll').tap();assert.deepEqual(await page.evaluate(()=>window.intents.pop()),{type:'start',items:[]});
   assert.equal((await page.locator('.q-roll').boundingBox()).height,initial.roll.height);
   await update(page,()=>window.setSnapshot(v=>({...v,revision:5,state:{...v.state,board:{...v.state.board,phase:'playing',dice:[5,2,4,1,2],rollsRemaining:2}}})));
   assert.equal(await page.locator('.q-dice [data-held=true]').count(),0,'new round clears held state');
   await capture('new round: rolled');
   const final=await geometry(page);assert.equal(final.scrollTop,0,'interactions never scroll gameplay');assert(final.scrollHeight<=final.clientHeight+1);
  }
  await page.screenshot({path:output+'/'+(hosted?'hosted':baseline?'baseline':'candidate')+'-'+mode+'-'+width+'x'+height+'.png'});
  results.push({width,height,top,bottom,mode,...initial,postRoll,states});await page.close();
 }
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/'+(hosted?'hosted':baseline?'baseline':'candidate')+'.json',JSON.stringify({hosted:hosted??null,renderedComponents:'production QuintzeeView + FullscreenGameShell, fixture state/outer mode wrappers',results,errors},null,2)+'\n');
 console.log(baseline?'MEASURED':'PASS',results.length,'rendered mode/viewport cases, turn states, safe area, target geometry and interaction checks');
}finally{await browser.close();await server.close();}
