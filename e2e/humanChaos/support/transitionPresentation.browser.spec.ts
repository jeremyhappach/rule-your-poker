import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { TransitionPresentationObserver } from './transitionPresentation';

for (const control of [{ winning: false, cancel: false, shortened: false }, { winning: true, cancel: false, shortened: false }, { winning: false, cancel: true, shortened: false }, { winning: false, cancel: false, shortened: true }]) {
test(`actual leg renderer: winning=${control.winning}, early cancellation=${control.cancel}, shortened=${control.shortened}`, async ({ browser }) => {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {LegEarnedAnimation} from './src/components/LegEarnedAnimation';
      const root = createRoot(document.getElementById('root'));
      root.render(<LegEarnedAnimation show playerName="Test" legValue={2} isWinningLeg={${control.winning}} />);
      ${control.cancel ? 'setTimeout(() => root.unmount(), 456);' : ''}`,
      resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
  });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const observer = new TransitionPresentationObserver();
    await observer.attach(context, page);
    await page.route('https://transition-control.invalid/**', route => route.fulfill({ contentType: 'text/html', body: `
      <style>[data-leg-award]{animation:${control.shortened ? 'flyToTarget 0.1s' : control.winning ? 'flyToTargetWinning 1.8s' : 'flyToTarget 1.5s'} ease-out forwards;width:40px;height:40px;background:gold}</style>
      <div id="root"></div><script>${bundle.outputFiles[0].text}</script>` }));
    await page.goto('https://transition-control.invalid/');
    await expect.poll(() => observer.samples.some(row => row.stages.some(stage => stage.kind === 'award'))).toBe(true);
    await expect(page.locator('[data-leg-award]')).toHaveCount(0);
    if (control.cancel || control.shortened) {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(observer.samples.some(row => row.stages.some(stage => stage.kind === 'award' && stage.finished))).toBe(false);
    } else {
      await expect.poll(() => observer.samples.some(row => row.stages.some(stage => stage.kind === 'award' && stage.finished))).toBe(true);
    }
  } finally { await context.close(); }
});
}

test('samples a brief premature setup and ignores hidden markers', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const observer = new TransitionPresentationObserver();
    await observer.attach(context, page);
    await page.goto('data:text/html,<div id="root"></div>');
    await page.evaluate(() => {
      const root = document.querySelector('#root')!;
      root.innerHTML = '<div data-dealer-game-setup-step="config" style="display:none">Setup</div>';
    });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(observer.samples.some(row => row.setup)).toBe(false);
    await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-dealer-game-setup-step]')!;
      node.style.display = 'block';
      requestAnimationFrame(() => requestAnimationFrame(() => { node.remove(); }));
    });
    await expect.poll(() => observer.samples.some(row => row.setup)).toBe(true);
  } finally { await context.close(); }
});

for (const cancel of [false, true]) {
  test(`Cribbage payout visibility and completion, cancellation=${cancel}`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const observer = new TransitionPresentationObserver();
      await observer.attach(context, page);
      await page.goto('data:text/html,<div id="root"></div>');
      await page.evaluate(cancelEarly => {
        const root = document.querySelector('#root')!;
        root.setAttribute('data-cribbage-presentation-scope', JSON.stringify({ gameId: 'g', dealerGameId: 'd', roundId: 'r', handNumber: 1 }));
        root.innerHTML = `<style>@keyframes __chipTransport_control {from{transform:translateX(0)}to{transform:translateX(100px)}}</style>
          <div data-canonical-announcement-type="match_win" data-canonical-announcement-id="win">Winner wins</div>
          <div data-canonical-celebration-id="win"><div style="display:none">Hidden overlay</div></div>
          <div data-chip-transport-intent="payout" data-chip-transport-from="player" data-chip-transport-completes-at="${Date.now() + 500}" style="width:30px;height:30px;background:gold;animation:__chipTransport_control 500ms linear"></div>`;
        setTimeout(() => root.querySelector('[data-chip-transport-intent]')!.remove(), cancelEarly ? 100 : 550);
      }, cancel);
      await expect.poll(() => observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout'))).toBe(true);
      await expect(page.locator('[data-chip-transport-intent]')).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout' && stage.finished))).toBe(!cancel);
      expect(observer.samples.some(row => row.matchWin?.id === 'win' && row.scope?.roundId === 'r')).toBe(true);
      expect(observer.samples.some(row => row.celebration)).toBe(false);
    } finally { await context.close(); }
  });
}
