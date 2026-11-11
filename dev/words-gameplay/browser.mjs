import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {openWordsDatabase} from './database.mjs';

const out = 'qualification.local/words-gameplay';
mkdirSync(out, {recursive:true});
const db = await openWordsDatabase(process.argv[2]);
const streams = new Set();
const errors = [], report = [];
const modes = ['live','async'];
const actorFixtures = new Map();
const preferences = new Map();
const actions = [];
const rpcNames = new Set(['ptown_words_snapshot','ptown_words_action','ptown_words_close','delayed_words_inspect','delayed_words_snapshot','delayed_words_action','delayed_home']);

function publish(fixture) {
  const update = fixture.mode === 'live'
    ? {table:'ptown_words_revisions',new:{dealer_game_id:fixture.id}}
    : {table:'delayed_match_updates',new:{match_id:fixture.match}};
  for (const stream of streams) stream.write('data: ' + JSON.stringify(update) + '\n\n');
}

const plugin = {
  name:'words-gameplay-qualification',
  configureServer(server) {
    server.middlewares.use(async (req,res,next) => {
      const url = new URL(req.url,'http://localhost');
      if (url.pathname === '/fixture/events') {
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
        res.write(': connected\n\n');
        streams.add(res);
        res.on('close',() => streams.delete(res));
        return;
      }
      if (!url.pathname.startsWith('/fixture/')) return next();
      res.setHeader('Content-Type','application/json');
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const {user,name,args,table} = JSON.parse(body);
        const fixture = actorFixtures.get(user);
        assert(fixture, 'Known synthetic actor');
        let data;
        if (url.pathname === '/fixture/read') {
          data = table === 'profiles' ? {play_sounds:preferences.get(user) ?? true} : null;
        } else if (name === 'set_gameplay_sound_preference') {
          assert.equal(args.p_user_id,user);
          preferences.set(user,args.p_enabled);
          data = args.p_enabled;
        } else {
          assert(rpcNames.has(name), 'Allowed fixture RPC: ' + name);
          if (name.endsWith('_action')) actions.push({mode:fixture.mode,action:args.p_action,items:args.p_items});
          data = await db.rpc(user,name,args);
          if (name.endsWith('_action') && !data.error) publish(fixture);
        }
        res.end(JSON.stringify({data,error:null,status:200}));
      } catch (error) {
        res.end(JSON.stringify({data:null,error:{message:error.message,code:error.code ?? 'fixture'},status:400}));
      }
    });
  },
};

function route(fixture,user = fixture.user) {
  return '/dev/words-gameplay/index.html?' + new URLSearchParams({
    mode:fixture.mode,id:fixture.id,child:fixture.id,match:fixture.match,session:fixture.match,user,actor:user,
  });
}

let server, browser;
const cell = (page,square) => page.locator('[data-square="' + square + '"]');
const rack = (page,face) => page.getByRole('button',{name:new RegExp('^' + face + ',')});
const countStaged = page => page.locator('.is-staged').count();
const scale = async page => Number(await page.locator('.words-viewport').getAttribute('data-zoom'));
const trace = page => page.evaluate(() => window.readWordsAudioTrace());
const countdownSounds = async page => (await page.evaluate(() => window.readWordsScheduledAudio()))
  .filter(entry => entry.context==='running' && entry.cue.startsWith('words:countdown:'));
const shot = (page,name) => page.screenshot({path:out + '/' + name + '.png',animations:'allow'});
const center = async locator => {
  const bounds = await locator.boundingBox();
  assert(bounds, 'Visible input target');
  return {x:bounds.x + bounds.width/2,y:bounds.y + bounds.height/2};
};

async function open(fixture,options = {},user = fixture.user) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  page.on('pageerror',error => errors.push({mode:fixture.mode,message:error.message}));
  await page.addInitScript(() => window.addEventListener('unhandledrejection',event => console.error(String(event.reason))));
  page.on('console',message => { if (message.type() === 'error') errors.push({mode:fixture.mode,message:message.text()}); });
  await page.route('**/*',request => new URL(request.request().url()).hostname === '127.0.0.1' ? request.continue() : request.abort());
  await page.clock.install();
  await page.goto(base + route(fixture,user));
  try {
    await page.locator('.words-grid').waitFor({timeout:30000});
  } catch (error) {
    console.log('Fixture load', fixture.mode, await page.locator('body').innerText(), (await page.content()).slice(0,900), errors);
    await shot(page,fixture.mode + '-load-failure');
    throw error;
  }
  return page;
}

async function dimensions(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector), box = el.getBoundingClientRect();
      return [box.x,box.y,box.width,box.height];
    };
    const present = [...document.querySelectorAll('.words-rack button,.words-turn-actions button,.words-submit:not([hidden]),.words-bank,.words-pause')];
    const clipped = present.filter(element => {
      const box = element.getBoundingClientRect();
      return box.left < 0 || box.top < 0 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1
        || !element.contains(document.elementFromPoint(box.left + box.width/2,box.top + box.height/2));
    }).map(element => element.getAttribute('aria-label') || element.textContent);
    const viewport = document.querySelector('.words-viewport');
    return {board:rect('.words-viewport'),rack:rect('.words-rack'),status:rect('.words-status'),clipped,
      pageWidth:document.documentElement.scrollWidth, pageHeight:document.documentElement.scrollHeight,
      width:innerWidth,height:innerHeight,scrolled:viewport.scrollLeft !== 0 || viewport.scrollTop !== 0 || scrollY !== 0,
      boardOverflow:getComputedStyle(viewport).overflow};
  });
}
function assertGeometry(geometry,label) {
  assert(geometry.board[2] >= 120 && geometry.board[3] >= 100, label + ' usable board: ' + JSON.stringify(geometry.board));
  assert(geometry.pageWidth <= geometry.width + 1 && geometry.pageHeight <= geometry.height + 1,label + ' page overflow');
  assert.equal(geometry.boardOverflow,'clip');
  assert.equal(geometry.scrolled,false);
  assert.deepEqual(geometry.clipped,[],label + ' clipped or blocked controls');
}
function stable(initial,current) {
  for (const name of ['board','rack','status']) assert.deepEqual(current[name],initial[name],name + ' moved');
}

async function mouseDrag(page,from,to,midDrag) {
  const start = await center(from);
  const end = 'x' in to ? to : await center(to);
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(end.x,end.y,{steps:9});
  if (midDrag) await midDrag();
  await page.mouse.up();
}

async function touchGesture(page) {
  const cdp = await page.context().newCDPSession(page);
  return async (type,points = []) => cdp.send('Input.dispatchTouchEvent',{
    type,touchPoints:points.map(({x,y,id})=>({x,y,id})),
  });
}

const fixtureInput = () => ({viewport:{width:393,height:852},hasTouch:true,isMobile:true,deviceScaleFactor:1});
async function useSafeArea(page,mode,width,height) {
  const landscape = width > height;
  const container = mode==='live'?'[data-shell-presentation-mode="fullscreen"]':'.async-words-turn';
  await page.locator(container).evaluate((element,insets) => {
    Object.assign(element.style,insets);
  },landscape
    ? {paddingLeft:'47px',paddingRight:'47px',paddingBottom:'21px'}
    : {paddingTop:'59px',paddingBottom:'34px'});
}

async function viewportMatrix(fixture) {
  for (const [label,width,height,touch] of [
    ['desktop',1440,900,false],['narrow',520,760,false],['short',1024,430,false],
    ['portrait',393,852,true],['small-portrait',320,568,true],['landscape',844,390,true],
  ]) {
    const page = await open(fixture,{viewport:{width,height},hasTouch:touch,isMobile:touch});
    try {
      if (touch && width > 320) await useSafeArea(page,fixture.mode,width,height);
      await rack(page,'C').waitFor();
      const before = await dimensions(page);
      await shot(page,fixture.mode + '-' + label + '-default');
      assertGeometry(before,fixture.mode + ' ' + label);
      if (touch) {
        await rack(page,'C').tap();
        await cell(page,112).tap();
      } else {
        await mouseDrag(page,rack(page,'C'),cell(page,112));
      }
      assert.equal(await countStaged(page),1,fixture.mode + ' ' + label + ' local draft');
      const placed = await dimensions(page);
      assertGeometry(placed,fixture.mode + ' ' + label + ' draft');
      stable(before,placed);
      await shot(page,fixture.mode + '-' + label + '-placed');
      report.push({mode:fixture.mode,viewport:label,geometry:placed});
      await page.getByRole('button',{name:'Recall'}).click();
      assert.equal(await countStaged(page),0);
    } finally {
      await page.context().close();
    }
  }
}

async function touchFlow(fixture) {
  const page = await open(fixture,fixtureInput(fixture.mode));
  try {
    const touch = await touchGesture(page);
    const view = await page.locator('.words-viewport').boundingBox();
    const at = await center(cell(page,112));
    const p = (x,y,id=1) => ({x,y,id});
    const initial = await dimensions(page);
    const before = actions.length;
    await rack(page,'C').tap();
    await touch('touchStart',[p(at.x-35,at.y)]);
    await touch('touchStart',[p(at.x-35,at.y),p(at.x+35,at.y,2)]);
    await touch('touchMove',[p(at.x-73,at.y),p(at.x+73,at.y,2)]);
    await touch('touchEnd');
    assert((await scale(page)) > 2, 'pinch zoom in');
    const after = await center(cell(page,112));
    assert(Math.hypot(at.x-after.x,at.y-after.y) < 2,'pinch keeps center cell under midpoint');
    assert.equal(await countStaged(page),0,'second finger cancelled selected tile tap');
    stable(initial,await dimensions(page));
    await shot(page,fixture.mode + '-zoomed');
    await touch('touchStart',[p(at.x-70,at.y),p(at.x+70,at.y,2)]);
    await touch('touchMove',[p(at.x-55,at.y),p(at.x+55,at.y,2)]);
    await touch('touchCancel');
    const afterPinchCancel = await scale(page);
    assert(afterPinchCancel > 1 && afterPinchCancel < 2,'pinch out before cancel');
    const empty = await center(cell(page,128));
    await touch('touchStart',[p(empty.x,empty.y)]);
    await touch('touchMove',[p(empty.x-40,empty.y-25)]);
    await touch('touchEnd');
    const panned = await center(cell(page,112));
    assert(panned.x < after.x - 30 && panned.y < after.y - 18,'empty board drag pans after pinch cancel');
    await shot(page,fixture.mode + '-panned');
    const rackStart = await center(rack(page,'C'));
    const target = await center(cell(page,113));
    assert(target.y > view.y && target.y < view.y + view.height);
    await touch('touchStart',[p(rackStart.x,rackStart.y)]);
    await touch('touchMove',[p(target.x,target.y)]);
    await page.locator('.words-tile-ghost').waitFor();
    assert.equal(await cell(page,113).getAttribute('data-drop-target'),'true');
    assert.equal(await page.locator('.words-target-preview').innerText(),'I8');
    await shot(page,fixture.mode + '-dragging');
    await touch('touchEnd');
    assert.match(await cell(page,113).innerText(),/C\s*3/);
    const interruptedTarget = await center(cell(page,114));
    await touch('touchStart',[p(target.x,target.y)]);
    await touch('touchMove',[p(interruptedTarget.x,interruptedTarget.y)]);
    await page.locator('.words-tile-ghost').waitFor();
    await touch('touchStart',[p(interruptedTarget.x,interruptedTarget.y),p(interruptedTarget.x-50,interruptedTarget.y+30,2)]);
    await page.locator('.words-tile-ghost').waitFor({state:'hidden'});
    await touch('touchEnd');
    assert.match(await cell(page,113).innerText(),/C\s*3/,'pinch interruption preserved the original staged tile');
    await touch('touchStart',[p(target.x,target.y)]);
    await touch('touchMove',[p(rackStart.x,rackStart.y)]);
    await touch('touchEnd');
    assert.equal(await countStaged(page),0);
    await page.getByRole('button',{name:'Reset Zoom'}).tap();
    await page.locator('.words-viewport[data-zoom="1"]').waitFor();
    assert.equal(await scale(page),1);
    await cell(page,113).tap();
    await cell(page,113).tap();
    assert.equal(await scale(page),1);
    assert.equal(await page.evaluate(() => visualViewport.scale),1);
    assertGeometry(await dimensions(page),fixture.mode + ' after touch gestures');
    assert.equal(actions.length,before,'gestures made no server commands');
    report.push({mode:fixture.mode,touch:'pinch, focal point, cancel, pan, drag on panned board, rack return, reset, no scroll'});
  } finally {
    await page.context().close();
  }
}

async function fullCountdown(fixture) {
  await db.setDeadline(fixture,28000);
  const page = await open(fixture,{viewport:{width:1024,height:680}});
  try {
    await page.locator('body[data-audio-loaded=true]').waitFor();
    await rack(page,'C').click();
    await rack(page,'C').click();
    await page.waitForFunction(() => window.readWordsAudioTrace().some(entry=>entry.contextState==='running'));
    const clockSeconds = async () => {
      const [m,s] = (await page.locator('time').innerText()).split(':').map(Number);
      return m*60+s;
    };
    await page.clock.fastForward(((await clockSeconds())-12)*1000);
    for (let second=10;second>=0;second--) {
      let displayed = await clockSeconds();
      for (let step=0;displayed>second && step<25;step++) {
        await page.clock.runFor(100);
        displayed = await clockSeconds();
      }
      assert.equal(displayed,second,'authoritative clock rendered each sampled second');
    }
    const scheduled = (await countdownSounds(page)).map(beat=>Number(beat.cue.split(':').at(-1)));
    assert.deepEqual(scheduled,[10,9,8,7,6,5,4,3,2,1]);
    await page.locator('.words-countdown').waitFor({state:'hidden'});
    report.push({mode:fixture.mode,fullCountdown:scheduled});
  } finally {
    await page.context().close();
    await db.setDeadline(fixture,180000);
  }
}

async function playAndResume(fixture) {
  const options = {viewport:fixture.mode==='async'?{width:393,height:852}:{width:1024,height:680}};
  const page = await open(fixture,options);
  const peer = fixture.mode === 'live' ? await open(fixture,options,fixture.other) : null;
  try {
    const commits = () => actions.filter(action => action.mode === fixture.mode && action.action === 'place');
    const before = commits().length;
    const initialOrder = await page.locator('.words-rack button').evaluateAll(nodes=>nodes.map(node=>node.dataset.tileId));
    await mouseDrag(page,rack(page,'C'),cell(page,112));
    await mouseDrag(page,rack(page,'A'),page.getByRole('button',{name:'Submit Word'}));
    assert.equal(commits().length,before,'dropping on Submit Word never submits');
    await mouseDrag(page,cell(page,112),cell(page,113));
    await mouseDrag(page,rack(page,'A'),cell(page,113));
    assert.equal(await countStaged(page),1,'occupied staging rejected');
    await mouseDrag(page,cell(page,113),rack(page,'C'));
    assert.equal(await countStaged(page),0);
    assert.deepEqual(await page.locator('.words-rack button').evaluateAll(nodes=>nodes.map(node=>node.dataset.tileId)),initialOrder);
    await mouseDrag(page,rack(page,'Blank'),cell(page,112));
    await page.getByRole('button',{name:'Cancel'}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await countStaged(page),0);
    await mouseDrag(page,rack(page,'Blank'),cell(page,112));
    await page.getByRole('button',{name:'T',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await cell(page,112).locator('b').filter({hasText:'T'}).waitFor();
    await mouseDrag(page,cell(page,112),cell(page,113));
    assert.match(await cell(page,113).innerText(),/T\s*0/);
    await page.getByRole('button',{name:'Recall'}).click();

    await mouseDrag(page,rack(page,'Q'),cell(page,112));
    await mouseDrag(page,rack(page,'T'),cell(page,113));
    assert.equal(commits().length,before);
    await page.getByRole('button',{name:'Submit Word'}).click();
    await page.locator('.words-invalid').waitFor();
    assert.equal(await countStaged(page),2,'dictionary rejection kept the draft');
    await page.getByRole('button',{name:'Recall'}).click();
    await page.locator('.words-invalid').waitFor({state:'hidden'});

    await db.setDeadline(fixture,24000);
    await page.reload();
    await rack(page,'C').waitFor();
    await page.locator('body[data-audio-loaded=true]').waitFor();
    await rack(page,'C').click(); // trusted gesture starts the shared audio context
    await rack(page,'C').click();
    const time = await page.locator('time').innerText();
    const [minutes,seconds] = time.split(':').map(Number);
    await page.clock.fastForward((minutes*60+seconds-11)*1000);
    await page.clock.runFor(1050);
    await page.locator('.words-countdown').filter({hasText:'10'}).waitFor();
    assert.equal(await page.locator('.words-countdown').evaluate(element=>getComputedStyle(element).pointerEvents),'none');
    assert.equal(await page.locator('.words-countdown span').evaluate(element=>getComputedStyle(element).pointerEvents),'none');
    await shot(page,fixture.mode + '-countdown-10');
    await page.getByRole('button',{name:'Mute sounds'}).click();
    const muted = (await countdownSounds(page)).length;
    await page.clock.runFor(1050);
    assert.equal((await countdownSounds(page)).length,muted,'global mute silences the next countdown beat');
    await page.getByRole('button',{name:'Unmute sounds'}).click();

    await mouseDrag(page,rack(page,'C'),cell(page,112));
    await rack(page,'A').click(); await cell(page,113).click();
    await mouseDrag(page,rack(page,'T'),cell(page,114));
    assert.equal(await countStaged(page),3);
    const beforeReload = fixture.mode==='async'?await countdownSounds(page):[];
    if (fixture.mode === 'async') {
      // Reload at the real server deadline and verify the private draft is restored.
      await page.reload();
      await page.locator('.is-staged').nth(2).waitFor();
      assert.equal(await countStaged(page),3);
      assert.equal((await countdownSounds(page)).length,0,'remount did not replay countdown');
      const unlock = await center(page.locator('.words-navigation span'));
      await page.mouse.click(unlock.x,unlock.y);
    }

    const current = await page.locator('time').innerText();
    const [m,s] = current.split(':').map(Number);
    const untilThree = (m*60+s-3)*1000;
    if (untilThree > 0) await page.clock.runFor(untilThree);
    await page.locator('.words-countdown[data-tone=urgent]').waitFor();
    await shot(page,fixture.mode + '-countdown-urgent');
    const beeps = [...beforeReload,...await countdownSounds(page)];
    writeFileSync(out + '/' + fixture.mode + '-audio.json',JSON.stringify({beeps,trace:await trace(page)},null,2));
    assert(beeps.length > 0,fixture.mode + ' scheduled countdown on native Chrome Web Audio');
    assert.equal(new Set(beeps.map(beat=>beat.cue)).size,beeps.length,'one beep per second');
    await page.getByRole('button',{name:'Submit Word'}).click();
    await page.locator('.words-countdown').waitFor({state:'hidden'});
    if (fixture.mode === 'async') {
      await page.waitForURL('**/delayed/' + fixture.match);
    } else {
      await peer.locator('.words-viewport[aria-busy=true]').waitFor();
      await peer.locator('.words-viewport[aria-busy=false]').waitFor();
      await peer.locator('.words-rack[data-actionable=true]').waitFor();
      await peer.reload();
      await peer.locator('.words-rack[data-actionable=true]').waitFor();
      assert.match(await cell(peer,112).innerText(),/C/);
    }
    const row = await db.row(fixture);
    assert.equal(row.state.moves.at(-1).words[0].word,'CAT');
    assert.equal(row.state.moves.at(-1).points,10);
    assert.equal(row.state.racks[fixture.actor].length,7,'authoritative rack refilled');
    assert.equal(commits().length,before+2);
    if (fixture.mode === 'live') {
      await page.getByText('Last: CAT (10)',{exact:true}).waitFor();
    } else {
      const prior = await open(fixture,options);
      await prior.locator('.words-view-only').waitFor();
      await prior.getByText('Last: CAT (10)',{exact:true}).waitFor();
      assert.equal(await prior.locator('.words-countdown').count(),0);
      await prior.context().close();
      const next = await open(fixture,options,fixture.other);
      await next.locator('.words-rack[data-actionable=true]').waitFor({timeout:15000});
      const deadline = (await db.row(fixture)).gameplay_due_at;
      await next.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).click();
      await next.getByRole('button',{name:'Use time bank 1: add 3 minutes'}).waitFor({state:'hidden'});
      await next.reload();
      await next.getByRole('button',{name:'Use time bank 2: add 3 minutes'}).waitFor();
      assert.equal((await db.row(fixture)).gameplay_due_at - deadline,180000);
      await next.context().close();
    }
    report.push({mode:fixture.mode,submission:'real RPCs, invalid QT, CAT +10, refill, Last score, handoff/reload',scheduledSeconds:beeps.map(beat=>beat.cue.split(':').at(-1))});
  } finally {
    await page.context().close();
    await peer?.context().close();
  }
}

async function expiryRace(fixture) {
  const prior = await db.row(fixture);
  await db.setDeadline(fixture,-20);
  const row = await db.row(fixture);
  const actorRack = row.state.racks[fixture.opponent];
  const item = {tileId:actorRack[0].id,square:115,letter:actorRack[0].face};
  const live = fixture.mode === 'live';
  const action = live ? 'ptown_words_action' : 'delayed_words_action';
  const identity = live ? {p_dealer_game_id:fixture.id} : {p_child:fixture.id};
  const args = {...identity,[live?'p_request_id':'p_request']:randomUUID(),p_revision:row.revision,p_action:'place',p_items:[item]};
  await Promise.allSettled([
    db.rpc(fixture.other,action,args),
    live ? db.sql('SELECT private.ptown_words_recover()') : db.rpc(fixture.other,'delayed_words_snapshot',identity),
  ]);
  const after = await db.row(fixture);
  assert.equal(after.state.moves.length,prior.state.moves.length+1,fixture.mode+' one deadline action');
  assert.equal(after.state.moves.at(-1).action,'pass');
  assert.deepEqual(after.state.scores,prior.state.scores);
  assert.deepEqual(after.state.board,prior.state.board);
  report.push({mode:fixture.mode,timeout:'real competing SQL calls produced one pass and no placement'});
}

let base;
try {
  const fixtures = {};
  for (const mode of modes) {
    const fixture = await db.prepare(mode);
    fixtures[mode] = fixture;
    actorFixtures.set(fixture.user,fixture);
    actorFixtures.set(fixture.other,fixture);
  }
  server = await createServer({
    configFile:false, envFile:false, cacheDir:resolve(out,'vite-cache'), plugins:[react(),plugin],
    resolve:{alias:[
      {find:'@/integrations/supabase/client',replacement:resolve('dev/words-gameplay/client.ts')},
      {find:'@',replacement:resolve('src')},
    ]},
    define:{__DEV__:true,__RUN21_APP_TEST_LANE__:false},
    optimizeDeps:{entries:['dev/words-gameplay/index.html']},
    server:{host:'127.0.0.1',port:15558,strictPort:true,watch:null,hmr:false},
  });
  await server.listen();
  base = 'http://127.0.0.1:15558';
  browser = await chromium.launch({channel:'chrome',headless:true});
  for (const fixture of Object.values(fixtures)) {
    if (fixture.mode === 'async') {
      const start = await open(fixture,fixtureInput());
      await start.locator('.words-rack[data-actionable=true]').waitFor();
      await start.context().close();
    }
    if (fixture.mode === 'live') await fullCountdown(fixture);
    await viewportMatrix(fixture);
    await touchFlow(fixture);
    console.log('PASS layout matrix and touch gestures',fixture.mode);
    await playAndResume(fixture);
    await expiryRace(fixture);
    console.log('PASS dictionary, scoring, handoff, countdown and timeout',fixture.mode);
  }
  assert.deepEqual(errors,[]);
} finally {
  writeFileSync(out + '/browser.json',JSON.stringify({report,errors},null,2));
  await browser?.close();
  for (const stream of streams) stream.end();
  await server?.close();
  await db.close();
}
