import { build } from 'esbuild';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const bundle = await build({entryPoints: ['dev/audio/fixture.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic',
  alias: {'@/lib/audio/platformAudio': resolve('dev/audio/fixtureOwner.ts'), '@': resolve('src')}, define: {'process.env.NODE_ENV': '"development"'}});
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url.startsWith('/fixture.js') ? 'application/javascript' : 'text/html');
  res.end(req.url.startsWith('/fixture.js') ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const results = [];
const targets = [ ['Chrome desktop', chromium, {channel: 'chrome'}, false], ['Chrome touch emulation', chromium, {channel: 'chrome'}, true], ['Edge desktop', chromium, {channel: 'msedge'}, false] ];
if (existsSync(webkit.executablePath())) targets.push(['Playwright WebKit (not physical Safari)', webkit, {}, true]);
try {
  for (const [name, type, launch, touch] of targets) {
    const browser = await type.launch({...launch, headless: true, ...(type === chromium ? {args: ['--autoplay-policy=document-user-activation-required', '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies']} : {})});
    try {
      const context = await browser.newContext({hasTouch: touch, isMobile: touch});
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const count = () => page.evaluate(() => window.audioProbe.probe.starts.length);
      const enter = (id, remaining = 2500) => page.evaluate(({id,remaining}) => window.audioProbe.enter(id,remaining), {id,remaining});
      await page.goto(url); await page.waitForFunction(() => !!window.audioProbe);
      assert.equal(await page.evaluate(() => window.audioProbe.probe.contexts), 0);
      if (touch) await page.locator('#pregame').tap(); else await page.locator('#pregame').click();
      await page.waitForFunction(() => window.audioProbe.probe.starts.length === 8);
      const first = await page.evaluate(() => ({starts: window.audioProbe.probe.starts, state: window.audioProbe.probe.context.state, contexts: window.audioProbe.probe.contexts}));
      assert.equal(first.state, 'running'); assert.equal(first.contexts, 1);
      assert.equal(new Set(first.starts).size, 2); assert.ok(Math.abs(first.starts[4] - first.starts[0] - .32) < .00001);
      await page.evaluate(() => window.audioProbe.leave()); await page.waitForTimeout(30);
      await enter('session:game:hand:1:player1'); await page.waitForTimeout(30); assert.equal(await count(), 8);
      for (const id of ['session:game:hand:1:player2','session:game:hand:2:player1','session:game:hand:3:player1']) {
        const before = await count(); await enter(id); await page.waitForFunction(n => window.audioProbe.probe.starts.length === n, before+8);
      }
      await page.evaluate(() => window.audioProbe.existing()); assert.equal(await count(), 37); // 32 bell + 2 door + 3 knock oscillators
      assert.equal(await page.evaluate(() => window.audioProbe.probe.contexts), 1);
      await page.evaluate(() => window.audioProbe.mute(true)); await enter('muted'); await page.waitForTimeout(30); assert.equal(await count(),37);
      await page.evaluate(() => window.audioProbe.mute(false)); await page.waitForFunction(() => window.audioProbe.probe.starts.length === 45);
      await page.reload(); await page.waitForFunction(() => !!window.audioProbe);
      await enter('session:game:hand:1:player1'); await page.waitForTimeout(30); assert.equal(await count(),0);

      // Fresh document: autoplay cannot consume an event, and an expired one cannot catch up.
      // Start through the page itself: Playwright evaluate() can grant synthetic user activation.
      const locked = await context.newPage(); await locked.goto(url+'/?locked');
      await locked.waitForTimeout(1100);
      const blocked = await locked.evaluate(() => ({state: window.audioProbe.probe.context.state, starts: window.audioProbe.probe.starts.length}));
      assert.equal(blocked.starts,0);
      if (touch) await locked.locator('#pregame').tap(); else await locked.locator('#pregame').click();
      await locked.waitForFunction(() => window.audioProbe.probe.starts.length === 8);
      await locked.waitForTimeout(200); assert.equal(await locked.evaluate(() => window.audioProbe.probe.starts.length),8);
      await locked.close();

      const delayed = await context.newPage(); await delayed.goto(url+'/?delayed'); await delayed.waitForFunction(() => !!window.audioProbe?.probe.resolvePreference);
      if (touch) await delayed.locator('#pregame').tap(); else await delayed.locator('#pregame').click();
      await delayed.waitForTimeout(100); assert.equal(await delayed.evaluate(() => window.audioProbe.probe.starts.length),0);
      await delayed.evaluate(() => window.audioProbe.probe.resolvePreference(true));
      await delayed.waitForFunction(() => window.audioProbe.probe.starts.length === 8);
      await delayed.close();
      assert.deepEqual(errors, []);
      results.push({browser: name, version: browser.version(), passed: true, firstRound: first, blockedState: blocked.state});
      await context.close();
    } finally { await browser.close(); }
  }
  const evidence = {recordedAt: new Date().toISOString(), results, physicalSafari: 'Not available on this Windows host; device mute/background interruption require production smoke.'};
  writeFileSync('dev/audio/browser.evidence.json', JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} finally { server.close(); }
