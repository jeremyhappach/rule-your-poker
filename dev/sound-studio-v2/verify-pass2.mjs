import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:4318',out='qualification.local/sound-studio-v2';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),checks=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],external=[];
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 await context.addInitScript(()=>{window.probe=[];const Native=window.AudioContext;window.AudioContext=class extends Native{createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...args)=>{if(n.buffer?.length>1)window.probe.push({type:'start',at:performance.now(),loop:n.loop,duration:n.buffer.duration});return start(...args);};n.stop=(...args)=>{window.probe.push({type:'stop',at:performance.now(),loop:n.loop});return stop(...args);};return n;}};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.goto(origin);await page.getByRole('status').filter({hasText:'Ready.'}).waitFor();
 const roll=()=>page.getByRole('button',{name:'▶ Roll selected take',exact:true}).click();
 for(const kind of ['quintzee-roll','cup-roll'])for(const take of ['a','b','c']){
  await page.getByLabel('Roll experience').selectOption(kind);await page.getByLabel('Roll take',{exact:true}).selectOption(take);await page.evaluate(()=>window.probe=[]);await roll();
  await page.locator('.demo-status').filter({hasText:kind==='quintzee-roll'?'Stopped cleanly':'Landed —'}).waitFor();
  const events=await page.evaluate(()=>window.probe),starts=events.filter(e=>e.type==='start'),stops=events.filter(e=>e.type==='stop'&&e.loop);
  assert.equal(starts.filter(e=>e.loop).length,1);assert(stops.length>0);
  const elapsed=stops[0].at-starts[0].at;assert(elapsed>(kind==='quintzee-roll'?1400:850)&&elapsed<(kind==='quintzee-roll'?1700:1150),JSON.stringify({kind,elapsed}));
  assert.equal(starts.length,kind==='quintzee-roll'?1:2);
  if(kind==='cup-roll'){assert(Math.abs(starts[1].duration-.38)<.002);assert(starts[1].at>=stops[0].at);assert(starts[1].at-stops[0].at<65);}
  checks.push({kind,take,elapsed,starts:starts.length});
 }
 for(let i=1;i<=4;i++)await page.getByLabel('Hold die '+i,{exact:true}).check();
 await page.evaluate(()=>window.probe=[]);await roll();await page.locator('.demo-status').filter({hasText:'Dice Landing B'}).waitFor();
 let events=await page.evaluate(()=>window.probe);assert(Math.abs(events.filter(e=>e.type==='start').at(-1).duration-.34)<.002);checks.push('Four held dice produce exactly one Landing B');
 await page.getByLabel('Hold die 5',{exact:true}).check();assert(await page.getByRole('button',{name:'▶ Roll selected take',exact:true}).isDisabled());
 for(let i=1;i<=5;i++)await page.getByLabel('Hold die '+i,{exact:true}).uncheck();
 for(const action of ['cancel','mute','pagehide']){
  await page.evaluate(()=>window.probe=[]);await roll();await page.locator('.demo-status').filter({hasText:'Rolling'}).waitFor();
  if(action==='cancel')await page.getByRole('button',{name:'Cancel roll',exact:true}).click();
  if(action==='mute')await page.getByRole('button',{name:'Mute sounds',exact:true}).click();
  if(action==='pagehide')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForTimeout(1150);events=await page.evaluate(()=>window.probe);assert.equal(events.filter(e=>e.type==='start').length,1);assert(events.some(e=>e.type==='stop'&&e.loop));
  if(action==='mute')await page.getByRole('button',{name:'Unmute sounds',exact:true}).click();
  if(action==='pagehide')await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));
  checks.push(action+' cancels shake with no landing/catch-up');
 }
 await page.getByRole('button',{name:'▶ 3–2–1 countdown',exact:true}).click();for(const value of ['3','2','1','0'])await page.locator('[data-countdown="'+value+'"]').waitFor();checks.push('Countdown displays three aligned numbers then silent DROP');
 await page.getByRole('button',{name:'Cancel roll',exact:true}).click();
 for(const [width,height] of [[1440,1000],[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.locator('#rolling-demos').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/rolling-'+width+'.png'});
 }
 await page.reload();await page.getByRole('status').filter({hasText:'Ready.'}).waitFor();assert.equal((await page.evaluate(()=>window.probe)).filter(e=>e.type==='start').length,0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const lan=await context.request.get('http://192.168.1.242:4318');assert.equal(lan.status(),200);
 checks.push('Four viewports fit; reload silent; LAN reachable from host; no errors/external requests');
 writeFileSync(out+'/pass2-verification.json',JSON.stringify({passed:true,checks,physicalPhone:'Not tested'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
