import { expect, test as base, type Page } from '@playwright/test';
import { build } from 'esbuild';

type AwardProps = { show: boolean; presentationCycleId?: string | null; isWinningLeg?: boolean };
type Completion = { generation: string | null; duration: number; currentTime: number; state: string; nativeEnd: boolean };
type Fixture = {
  renderAward: (props: AwardProps) => void;
  completions: Completion[];
  ends: { node: Element; name: string; trusted: boolean }[];
};
let bundle: string;
const award = '[data-leg-award]';
const test = base.extend<{ awardPage: Page }>({
  awardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    let requests = 0;
    await context.route(/^https?:/, route => { requests++; return route.abort(); });
    try {
      const page = await context.newPage();
      // Supply Tailwind's two declarations; the actual component emits its
      // own keyframes, manages its lifecycle and invokes its real callback.
      await page.setContent(`<style>
        [data-leg-award]{width:56px;height:56px;animation:flyToTarget 1.5s ease-out forwards}
        [data-leg-award-winning="1"]{animation-name:flyToTargetWinning;animation-duration:1.8s}
      </style><div id="root"></div>`);
      await page.addScriptTag({ content: bundle });
      await use(page);
      expect(requests, 'renderer controls never access a backend').toBe(0);
    } finally { await context.close(); }
  },
});

test.beforeAll(async () => {
  const result = await build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
    import {LegEarnedAnimation} from './src/components/LegEarnedAnimation';
    const root=createRoot(document.querySelector('#root'));
    window.completions=[];window.ends=[];
    document.addEventListener('animationend',event=>window.ends.push({node:event.target,name:event.animationName,trusted:event.isTrusted}),true);
    window.renderAward=props=>flushSync(()=>root.render(<React.StrictMode><LegEarnedAnimation {...props} playerName="Fixture" legValue={2} onComplete={()=>{
      const node=document.querySelector('[data-leg-award]');
      const animation=node.getAnimations().find(a=>a.animationName?.startsWith('flyToTarget'));
      window.completions.push({generation:props.presentationCycleId??null,
        duration:animation?.effect.getComputedTiming().duration,currentTime:animation?.currentTime,state:animation?.playState,
        nativeEnd:window.ends.some(e=>e.node===node&&e.name===animation?.animationName&&e.trusted)});
    }}/></React.StrictMode>));
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic' });
  bundle = result.outputFiles[0].text;
});

async function render(page: Page, props: AwardProps) {
  await page.evaluate(props => (window as unknown as Fixture).renderAward(props), props);
}
async function results(page: Page) {
  return page.evaluate(() => (window as unknown as Fixture).completions);
}
async function assertFinished(page: Page, count: number, duration: number) {
  await expect.poll(async () => (await results(page)).length).toBe(count);
  const completion = (await results(page))[count - 1];
  expect(completion).toMatchObject({ duration, state: 'finished', nativeEnd: true });
  expect(completion.currentTime).toBeGreaterThanOrEqual(duration);
  await expect(page.locator(award)).toHaveCount(0);
}

for (const winning of [false, true]) {
  for (const delay of [0, 350]) {
    test(`${winning ? 'winning' : 'ordinary'} flight completes only after native end with ${delay} ms render delay`, async ({ awardPage: page }) => {
      if (delay) {
        // Deterministically separate CSS startup from the effect's former JS
        // deadline. Main-thread contention can create the same ordering.
        await page.addStyleTag({ content: `[data-leg-award]{animation-delay:${delay}ms}` });
      }
      await render(page, { show: true, isWinningLeg: winning, presentationCycleId: 'generation-a' });
      await assertFinished(page, 1, winning ? 1800 : 1500);
      await render(page, { show: true, isWinningLeg: winning, presentationCycleId: 'generation-a' });
      await expect(page.locator(award)).toHaveCount(0);
      expect(await results(page)).toHaveLength(1);
    });
  }
}

test('child effects and synthetic end events cannot complete a paused flight', async ({ awardPage: page }) => {
  await page.addStyleTag({ content: '[data-leg-award]{animation-play-state:paused}' });
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-a' });
  await page.locator(award).evaluate(node => {
    const child = node.firstElementChild as HTMLElement;
    child.style.animation = 'flyToTargetWinning 0.02s forwards';
    node.dispatchEvent(new AnimationEvent('animationend', { animationName: 'flyToTargetWinning', elapsedTime: 1.8, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as Fixture).ends.some(e => e.trusted))).toBe(true);
  expect(await results(page)).toHaveLength(0);
  await page.locator(award).evaluate(node => { (node as HTMLElement).style.animationPlayState = 'running'; });
  await assertFinished(page, 1, 1800);
});

test('native cancellation never emits success after the old deadline', async ({ awardPage: page }) => {
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-a' });
  await page.locator(award).evaluate(async node => {
    const animation = node.getAnimations()[0];
    await animation.ready;
    animation.cancel();
    // Cross the former completion timer deliberately: cancellation is not success.
    await new Promise(resolve => setTimeout(resolve, 2000));
  });
  expect(await results(page)).toHaveLength(0);
  await render(page, { show: false, presentationCycleId: 'generation-a' });
  await render(page, { show: true, presentationCycleId: 'generation-a' });
  await expect(page.locator(award)).toHaveCount(0);
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-b' });
  await assertFinished(page, 1, 1800);
});

test('a new generation remounts the flight even with show true and the same timestamp', async ({ awardPage: page }) => {
  await page.evaluate(() => { const now = Date.now(); Date.now = () => now; });
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-a' });
  const oldNode = await page.locator(award).elementHandle();
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-b' });
  expect(await oldNode!.evaluate(node => node.isConnected)).toBe(false);
  await expect(page.locator(award)).toHaveAttribute('data-leg-award-generation', 'generation-b');
  await assertFinished(page, 1, 1800);
  expect((await results(page))[0].generation).toBe('generation-b');
});

test('winning flight stays locked when unrelated props change mid-flight', async ({ awardPage: page }) => {
  await render(page, { show: true, isWinningLeg: true, presentationCycleId: 'generation-a' });
  const oldNode = await page.locator(award).elementHandle();
  await render(page, { show: true, isWinningLeg: false, presentationCycleId: 'generation-a' });
  expect(await oldNode!.evaluate(node => node.isConnected)).toBe(true);
  await expect(page.locator(award)).toHaveAttribute('data-leg-award-winning', '1');
  await assertFinished(page, 1, 1800);
});

test('ordinary cancellation resets locally and permits one subsequent award', async ({ awardPage: page }) => {
  await render(page, { show: true });
  await render(page, { show: false });
  await expect(page.locator(award)).toHaveCount(0);
  expect(await results(page)).toHaveLength(0);
  await render(page, { show: true });
  await assertFinished(page, 1, 1500);
  await render(page, { show: true });
  expect(await results(page)).toHaveLength(1);
  await expect(page.locator(award)).toHaveCount(0);
});
