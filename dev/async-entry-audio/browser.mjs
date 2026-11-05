import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = process.cwd(), dir = resolve(root, 'dev/async-entry-audio'), out = resolve(root, 'qualification.local/async-entry-audio'), origin = 'http://127.0.0.1:15464';
mkdirSync(out, {recursive: true});
const rules = {...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json', 'utf8')), version: 'tri-towers/5', roundIntroMs: 2500, clearCelebrationMs: 3000, holdMs: 5000};
const server = await createServer({configFile: false, envFile: false, cacheDir: resolve(out, 'cache'), plugins: [react(), {name: 'entry-fixture', configureServer(s) {
  s.middlewares.use((req, res, next) => {if (!req.url?.startsWith('/delayed')) return next(); s.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/async-entry-audio/entry.tsx"></script></body></html>').then(html => {res.setHeader('Content-Type', 'text/html'); res.end(html);});});
}}], optimizeDeps: {entries: ['dev/async-entry-audio/entry.tsx']}, resolve: {alias: [...['@/integrations/supabase/client', '@/lib/delayed/client'].map(find => ({find, replacement: resolve(dir, 'transport.ts')})), {find: '@', replacement: resolve(root, 'src')}]}, server: {host: '127.0.0.1', port: 15464, strictPort: true}});
await server.listen();
const browser = await chromium.launch({headless: true, channel: 'msedge'}), results = [];
try {
  for (const [retain, mute] of process.argv.includes('--retained-only') ? [[true, false], [true, true]] : [[false, false], [true, false], [true, true]]) {
    let seen = false, board = null, revision = 1; const errors = [], commands = [];
    const freshBoard = () => ({rules, phase: 'intro', cards: Array.from({length: 28}, (_, i) => i < 18 ? null : i % 13), removed: [], waste: 4, stockRemaining: 24, run: 0, highRun: 0, score: 0, deadline: Date.now() + 2500, result: null});
    const saved = {...freshBoard(), phase: 'stage_complete', score: 100, result: {id: 'opponent-result', stage: 1, reason: 'take_score', scoreBefore: 0, score: 100, stageScore: 100, timeBonus: 0, stockBonus: 0, completedAt: Date.now()}};
    const project = () => {
      if (board?.phase === 'intro' && board.deadline <= Date.now()) {board = {...board, phase: 'ready', deadline: Date.now() + 30000}; revision++;}
      return {id: 'child', matchId: 'match', game: 'tri-towers', config: rules, revision, segment: 2, actor: 'me', round: 1, board, totals: {me: 0, other: 100}, terminal: false, held: false, expiresAt: new Date(Date.now() + 3600000).toISOString(), serverAt: Date.now(), ownResults: [], winner: null, result: null};
    };
    const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      // Explicit autoplay model; this is NOT WebKit or physical-device proof.
      let gesture = false; window.proof = {contexts: [], oscillators: []};
      for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown']) document.addEventListener(name, e => {if (e.isTrusted) {gesture = true; setTimeout(() => {gesture = false;}, 0);}}, true);
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        unlocked = false;
        constructor(...args) {super(...args); this.record = {createdAt: performance.now(), closedAt: null, resumes: []}; window.proof.contexts.push(this.record);}
        get state() {return super.state === 'closed' ? 'closed' : this.unlocked ? super.state : 'suspended';}
        get currentTime() {return this.unlocked ? super.currentTime : 0;}
        resume() {this.record.resumes.push({gesture, at: performance.now()}); if (!gesture) return new Promise(() => {}); this.unlocked = true; return super.resume();}
        close() {this.record.closedAt = performance.now(); return super.close();}
        createOscillator() {const node = super.createOscillator(), start = node.start.bind(node); node.start = (...args) => {window.proof.oscillators.push({at: performance.now(), type: node.type}); return start(...args);}; return node;}
      };
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== origin) return route.abort(); if (url.pathname !== '/fixture-api') return route.continue();
      const command = route.request().postDataJSON(); commands.push(command);
      if (command.op === 'rpc') {
        if (command.name === 'delayed_review_begin') return route.fulfill({json: {elapsed: 0, seen: false}});
        if (command.name === 'delayed_review_ack') {seen = true; return route.fulfill({json: {ok: true}});}
        return route.fulfill({json: {events: [{id: 'review', kind: 'attempt', actor: 'other', round: 1, score: 100, receipt: {game: 'tri-towers'}, board: saved, seen}], terminal: false, actor: 'me', segment: 2, revision: 2, started: false, expiresAt: new Date(Date.now() + 3600000).toISOString(), serverAt: Date.now()}});
      }
      if (command.op === 'action' && command.intent.type === 'start') {await new Promise(r => setTimeout(r, 180)); board = freshBoard(); revision++;}
      return route.fulfill({json: project()});
    });
    await page.goto(origin + '/delayed/match?retain=' + Number(retain) + '&mute=' + Number(mute));
    await page.getByRole('button', {name: mute ? 'Unmute sounds' : 'Mute sounds', exact: true}).waitFor();
    await page.getByText('Take turn', {exact: true}).click();
    await page.getByText("Showing Other's results", {exact: true}).waitFor();
    await page.getByText('Your turn!', {exact: true}).waitFor();
    await page.locator('[data-tri-card="18"]:not([disabled])').waitFor();
    const beforeLateTap = await page.evaluate(() => ({...window.proof, trace: JSON.parse(window.trace.export())}));
    writeFileSync(resolve(out, `case-${retain}-${mute}.json`), JSON.stringify({errors, commands, ...beforeLateTap}, null, 2));
    assert.deepEqual(errors, []); assert.equal(commands.filter(c => c.op === 'action' && c.intent.type === 'start').length, 1);
    const bell = beforeLateTap.trace.entries.filter(e => e.event === 'sources-scheduled' && e.cue?.startsWith('run21-bell:tri:'));
    assert.equal(bell.length, retain && !mute ? 1 : 0);
    assert.equal(beforeLateTap.oscillators.length, retain && !mute ? 8 : 0);
    assert.equal(beforeLateTap.contexts.length, mute ? 0 : retain ? 1 : 2);
    if (!retain) {assert(beforeLateTap.contexts[0].closedAt); assert(beforeLateTap.trace.entries.some(e => e.event === 'timeline-retired' && e.reason === 'expired' && e.scheduled === false));}
    // No extra tap was made before the intro/ready assertions. A late unrelated
    // trusted tap must never resurrect the baseline's expired bell.
    await page.mouse.click(5, 800); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.proof.oscillators.length), beforeLateTap.oscillators.length);
    if (retain && !mute) {
      await page.getByRole('button', {name: 'Mute sounds', exact: true}).click();
      assert(await page.evaluate(() => window.proof.contexts[0].closedAt !== null));
    }
    await page.getByText('Leave Async', {exact: true}).click(); await page.getByText('Lobby', {exact: true}).waitFor();
    assert(await page.evaluate(() => window.proof.contexts.every(c => c.closedAt !== null)));
    const result = {retain, mute, errors, bellCount: bell.length, contextCount: beforeLateTap.contexts.length, oscCount: beforeLateTap.oscillators.length, trace: beforeLateTap.trace}; results.push(result);
    console.log(JSON.stringify({retain, mute, errors, bellCount: bell.length, contextCount: result.contextCount, oscillatorCount: result.oscCount}));
    await page.close();
  }
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
} finally {await browser.close(); await server.close();}
