import { expect, test as base, type Page } from '@playwright/test';
import { build } from 'esbuild';
import type { ThreeFiveSevenDecisionRevealClock } from '../../../src/lib/threeFiveSeven/decisionReveal';

type Fixture = {
  testNow: number;
  renderClock: (clock: ThreeFiveSevenDecisionRevealClock | null) => void;
  flushFrame: (now: number) => void;
};
const windowIdentity = {
  id: 'ba0ed990-acdf-4574-be10-4ccc397eea6a:6225c654-1de6-4d50-aed1-fe8c53a9e471',
  gameId: '40c5a462-e9a6-4537-90e4-51491d772b87',
  dealerGameId: 'ba0ed990-acdf-4574-be10-4ccc397eea6a',
  roundId: '6225c654-1de6-4d50-aed1-fe8c53a9e471', handNumber: 2, roundNumber: 2,
  startedAtMs: 10_000, countdownAtMs: 11_000, dropAtMs: 13_700,
  endsAtMs: 15_300, continuationAtMs: 19_300,
};
const clock: ThreeFiveSevenDecisionRevealClock = { window: windowIdentity, serverOffsetMs: 0 };
let bundle: string;

const test = base.extend<{ clockPage: Page }>({
  clockPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    let networkRequests = 0;
    await context.route(/^https?:/, route => { networkRequests++; return route.abort(); });
    try {
      const page = await context.newPage();
      await page.setContent('<div data-canonical-felt-surface style="width:600px;height:400px"></div><div data-chip-center="1" style="width:44px;height:44px"></div><div id="root"></div>');
      await page.evaluate(() => {
        const fixture = window as unknown as Fixture & { frames: Map<number, FrameRequestCallback> };
        fixture.testNow = 15_299;
        Date.now = () => fixture.testNow;
        fixture.frames = new Map();
        let id = 0;
        window.requestAnimationFrame = fn => { fixture.frames.set(++id, fn); return id; };
        window.cancelAnimationFrame = key => { fixture.frames.delete(key); };
      });
      await page.addScriptTag({ content: bundle });
      await use(page);
      expect(networkRequests, 'renderer regression never accesses a backend').toBe(0);
    } finally { await context.close(); }
  },
});

test.beforeAll(async () => {
  const result = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {ThreeFiveSevenDecisionReveal} from './src/components/ThreeFiveSevenDecisionReveal';
    const root=createRoot(document.querySelector('#root'));
    const players=[{id:'f4791032-1469-475d-a509-ae571854c27e',user_id:'11111111-1111-4111-8111-111111111111',position:1,status:'active',current_decision:'stay'}];
    window.renderClock=clock=>flushSync(()=>root.render(<ThreeFiveSevenDecisionReveal clock={clock} players={players} currentUserId={players[0].user_id} dealerPosition={1} cardCount={7}/>));
    window.flushFrame=now=>{window.testNow=now;const queue=[...window.frames.values()];window.frames.clear();flushSync(()=>queue.forEach(fn=>fn(now)));};
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
    // Keep the production reveal's clock, hooks and DOM; isolate only artwork.
    plugins: [{ name: 'reveal-card-artwork', setup(builder) {
      builder.onResolve({ filter: /\/canonicalShell\/CanonicalCardBack$/ }, () => ({ path: 'card-art', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
        `import React from 'react';export function CanonicalCardBack(){return React.createElement('div',{style:{width:76,height:114,background:'navy'}});}` }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

async function expire(page: Page) {
  await page.evaluate(clock => {
    const fixture = window as unknown as Fixture;
    fixture.renderClock(clock);
    fixture.flushFrame(15_299);
  }, clock);
  await expect(page.locator('[data-357-reveal-beat="hold"]')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Fixture).flushFrame(15_304));
  await expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0);
}

for (const serverOffsetMs of [0, -59.5, 30]) {
  test(`expired reveal stays absent before the next animation frame after offset ${serverOffsetMs}`, async ({ clockPage: page }) => {
    await expire(page);
    await page.evaluate(clock => {
      const fixture = window as unknown as Fixture;
      fixture.testNow = 18_384;
      fixture.renderClock(clock);
    }, { ...clock, serverOffsetMs });
    // No animation frame runs between the clock update and this assertion.
    await expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0);
    await page.evaluate(() => (window as unknown as Fixture).flushFrame(18_384));
    await expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0);
  });
}

test('an authoritative pause extension resumes the current beat of the same reveal', async ({ clockPage: page }) => {
  await expire(page);
  const resumed = { ...clock, window: { ...windowIdentity, startedAtMs: 14_000,
    countdownAtMs: 15_000, dropAtMs: 17_700, endsAtMs: 19_300, continuationAtMs: 23_300 } };
  await page.evaluate(clock => {
    const fixture = window as unknown as Fixture;
    fixture.testNow = 16_300;
    fixture.renderClock(clock);
  }, resumed);
  await expect(page.locator('[data-357-decision-reveal]')).toHaveAttribute('data-357-reveal-beat', '2');
  await expect(page.locator('[data-357-decision-reveal]')).toHaveAttribute('data-357-reveal-local-end', '19300');
  await page.evaluate(() => (window as unknown as Fixture).flushFrame(19_301));
  await expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0);
});

test('a successor identity starts at its current beat without a prior round timestamp', async ({ clockPage: page }) => {
  await expire(page);
  const successor = { ...clock, window: { ...windowIdentity,
    id: 'ba0ed990-acdf-4574-be10-4ccc397eea6a:11111111-1111-4111-8111-111111111112',
    roundId: '11111111-1111-4111-8111-111111111112', roundNumber: 3,
    startedAtMs: 30_000, countdownAtMs: 31_000, dropAtMs: 33_700,
    endsAtMs: 35_300, continuationAtMs: 39_300 } };
  await page.evaluate(clock => {
    const fixture = window as unknown as Fixture;
    fixture.testNow = 32_800;
    fixture.renderClock(clock);
  }, successor);
  await expect(page.locator('[data-357-decision-reveal]')).toHaveAttribute('data-357-reveal-beat', '1');
  await expect(page.locator('[data-357-decision-reveal]')).toHaveAttribute('data-357-reveal-round', successor.window.roundId);
});

test('a late mount of an expired reveal stays absent and an active late mount uses DROP', async ({ clockPage: page }) => {
  await page.evaluate(clock => {
    const fixture = window as unknown as Fixture;
    fixture.testNow = 18_384;
    fixture.renderClock(clock);
    fixture.flushFrame(18_384);
  }, clock);
  await expect(page.locator('[data-357-decision-reveal]')).toHaveCount(0);
  const active = { ...clock, window: { ...windowIdentity, startedAtMs: 16_000,
    countdownAtMs: 17_000, dropAtMs: 19_700, endsAtMs: 21_300, continuationAtMs: 25_300 } };
  await page.evaluate(clock => {
    const fixture = window as unknown as Fixture;
    fixture.renderClock(null);
    fixture.testNow = 19_800;
    fixture.renderClock(clock);
    fixture.flushFrame(19_800);
  }, active);
  await expect(page.locator('[data-357-decision-reveal]')).toHaveAttribute('data-357-reveal-beat', 'DROP');
});
