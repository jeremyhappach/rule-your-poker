import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { requireTwoPlayerEnvironment } from './liveness/support/env';
test.beforeEach(async ({ page }) => { await page.goto('/e2e/fixtures/cardVisibility.html'); await page.waitForSelector('#action'); });
test('loss capture, H1/H2 identity, legitimate transitions, clipping and bounded idle cost', async ({ page }) => {
  await page.evaluate(() => (window as any).cardTest.start());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).cardTest.events.length)).toBe(0);
  const count = await page.evaluate(() => (window as any).cardTest.costs.length);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).cardTest.costs.length)).toBe(count);
  for (const fault of ['remove', 'hidden', 'clip', 'identity', 'board']) {
    await page.evaluate(fault => {
      const t = (window as any).cardTest;
      t.contract.handNumber++; t.contract.handContextId = `h${t.contract.handNumber}`; t.contract.runtimeHandContextId = t.contract.handContextId;
      t.render(); document.getElementById('hand')!.style.cssText = 'display:flex;height:100px'; t.update();
    }, fault);
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => (window as any).cardTest.events.length);
    await page.evaluate(fault => {
      const t = (window as any).cardTest, hand = document.getElementById('hand')!;
      if (fault === 'remove') hand.innerHTML = '';
      if (fault === 'hidden') hand.style.opacity = '0';
      if (fault === 'clip') hand.style.cssText = 'height:0;overflow:hidden';
      if (fault === 'identity') { t.contract.runtimeHandContextId = 'stale-hand'; t.update(); }
      if (fault === 'board') document.getElementById('board')!.innerHTML = '';
    }, fault);
    await expect.poll(() => page.evaluate(() => (window as any).cardTest.events.length)).toBe(before + 1);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => (window as any).cardTest.events.length)).toBe(before + 1);
  }
  await page.evaluate(() => { const t = (window as any).cardTest; t.contract.active = false; t.update(); document.getElementById('table')!.style.display = 'none'; });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).cardTest.events.length)).toBe(5);
});

test('interleaved response and frame budget with 357 waves and Holm slots', async ({ page }, info) => {
  const result = await page.evaluate(async () => {
    const t = (window as any).cardTest;
    const result: any = { disabled: [], enabled: [], costs: [] };
    for (const enabled of [false, true, true, false, false, true, true, false]) {
      t.stop(); t.events.length = 0; t.costs.length = 0;
      t.contract.active = true; t.contract.runtimeHandContextId = t.contract.handContextId;
      if (enabled) t.start(); else t.render();
      await new Promise(r => setTimeout(r, 300));
      const frames: number[] = [], input: number[] = [];
      let previous = performance.now();
      for (let i = 0; i < 120; i++) {
        const now = await new Promise<number>(r => requestAnimationFrame(r)); frames.push(now - previous); previous = now;
        const start = performance.now(); document.getElementById('action')!.click();
        await Promise.resolve(); input.push(performance.now() - start);
        if (i % 20 === 0) {
          t.contract.gameType = i % 40 === 0 ? '3-5-7' : 'holm-game';
          t.contract.selfExpected = t.contract.gameType === 'holm-game' ? 4 : [3, 5, 7][(i / 20) % 3];
          t.contract.selfDataCount = t.contract.selfExpected; t.render(); t.update();
        }
      }
      result[enabled ? 'enabled' : 'disabled'].push({ frames, input });
      result.costs.push(...t.costs);
      if (t.events.length) throw new Error('False incident during healthy wave changes');
    }
    t.stop(); return result;
  });
  const p95 = (a: number[]) => [...a].sort((a,b) => a-b)[Math.ceil(a.length * .95)-1];
  const summary = Object.fromEntries(['enabled','disabled'].map(k => [k, { frameP95: p95(result[k].flatMap((x: any) => x.frames)), inputP95: p95(result[k].flatMap((x: any) => x.input)) }]));
  const costP95 = p95(result.costs);
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.writeFileSync(info.outputPath('responsiveness.json'), JSON.stringify({ summary, costP95, maxCheck: Math.max(...result.costs), samples: result.costs.length }));
  await info.attach('responsiveness', { body: JSON.stringify({ summary, costP95, maxCheck: Math.max(...result.costs), samples: result.costs.length }), contentType: 'application/json' });
  expect(costP95).toBeLessThanOrEqual(2);
  expect(Math.max(...result.costs)).toBeLessThan(10);
  expect(summary.enabled.frameP95 - summary.disabled.frameP95).toBeLessThanOrEqual(4);
  expect(summary.enabled.inputP95 - summary.disabled.inputP95).toBeLessThanOrEqual(2);
});

test('normal authenticated client durably captures with debug off and cleans its synthetic rows', async ({ page }) => {
  const credentials = requireTwoPlayerEnvironment();
  await page.evaluate(async credentials => { const t = (window as any).cardTest; await t.login(credentials.email, credentials.password); t.start(); }, credentials.player2);
  try {
    await page.waitForTimeout(350);
    await page.evaluate(() => document.getElementById('hand')!.replaceChildren());
    await expect.poll(() => page.evaluate(async () => ((await (window as any).cardTest.rows()) ?? []).length)).toBe(1);
    const rows = await page.evaluate(async () => (window as any).cardTest.rows());
    expect(rows[0].payload.sample.failures).toContain('self-cards-missing');
    expect(JSON.stringify(rows)).not.toMatch(/"rank"|"suit"|password|access_token/);
    await page.evaluate(async () => { await (window as any).cardTest.flush(); });
    expect((await page.evaluate(async () => (window as any).cardTest.rows())).length).toBe(1);
  } finally { await page.evaluate(async () => (window as any).cardTest.clean()); }
});

test('offline first loss survives refresh and is delivered once', async ({ page, context }) => {
  const credentials = requireTwoPlayerEnvironment();
  const gameId = await page.evaluate(async credentials => { const t = (window as any).cardTest; await t.login(credentials.email, credentials.password); t.start(); return t.contract.gameId; }, credentials.player2);
  try {
    await page.waitForTimeout(350); await context.setOffline(true);
    await page.evaluate(() => document.getElementById('hand')!.replaceChildren());
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ptp:card-visibility-incidents:v1') ?? '[]').length)).toBe(1);
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('ptp:card-visibility-incidents:v1')!)[0].id);
    await context.setOffline(false); await page.reload(); await page.waitForSelector('#action');
    await page.evaluate(async ({ credentials, gameId }) => { const t = (window as any).cardTest; await t.login(credentials.email, credentials.password); t.contract.gameId = gameId; await t.flush(); }, { credentials: credentials.player2, gameId });
    const rows = await page.evaluate(async () => (window as any).cardTest.rows());
    expect(rows).toHaveLength(1); expect(rows[0].id).toBe(id);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptp:card-visibility-incidents:v1') ?? '[]').length)).toBe(0);
  } finally { await context.setOffline(false); await page.evaluate(async gameId => { const t = (window as any).cardTest; t.contract.gameId = gameId; await t.clean(); }, gameId); }
});
