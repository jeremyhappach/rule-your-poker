import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { TransitionPresentationObserver } from './transitionPresentation';
import type { ChipEndpointRef } from '../../../src/lib/canonicalShell/GameplaySlotContract';

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

for (const game of ['cribbage', 'yahtzee', 'gin']) {
for (const { cancel, shortened } of [{ cancel: false, shortened: false }, { cancel: true, shortened: false }, { cancel: false, shortened: true }]) {
  test(`${game} payout CSS end precedes retirement, cancellation=${cancel}, shortened=${shortened}`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const observer = new TransitionPresentationObserver();
      await observer.attach(context, page);
      await page.goto('data:text/html,<div id="root"></div>');
      const origin: ChipEndpointRef = { kind: 'seat', position: 1 };
      await page.evaluate(({ cancelEarly, originKind, shortened, game }) => {
        const root = document.querySelector('#root')!;
        root.setAttribute(`data-${game}-presentation-scope`, JSON.stringify({ gameId: 'g', dealerGameId: 'd', roundId: 'r', handNumber: 1 }));
        root.innerHTML = `<style>@keyframes __chipTransport_control {from{transform:translateX(0)}to{transform:translateX(100px)}}${shortened ? '[data-chip-transport-intent]{animation-duration:100ms!important}' : ''}</style>
          <div data-canonical-announcement-type="match_win" data-canonical-announcement-id="win">Winner wins</div>
          <div data-canonical-celebration-id="win"><div style="display:none">Hidden overlay</div></div>
          <div data-chip-transport-intent="payout" data-chip-transport-from="${originKind}" data-chip-transport-completes-at="${Date.now() + 550}" style="width:30px;height:30px;background:gold;animation:__chipTransport_control 500ms linear"></div>`;
        setTimeout(() => root.querySelector('[data-chip-transport-intent]')!.remove(), cancelEarly ? 100 : 600);
      }, { cancelEarly: cancel, originKind: origin.kind, shortened, game });
      await expect.poll(() => observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout'))).toBe(true);
      await expect(page.locator('[data-chip-transport-intent]')).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout' && stage.finished))).toBe(!cancel && !shortened);
      expect(observer.samples.some(row => row.matchWin?.id === 'win' && row.scope?.roundId === 'r')).toBe(true);
      expect(observer.samples.some(row => row.celebration)).toBe(false);
    } finally { await context.close(); }
  });
}
}

for (const mode of ['css-then-pause', 'pause-without-css-end', 'early-removal', 'cancelled-css', 'shortened-css'] as const) {
  test(`payout completion evidence: ${mode}`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const observer = new TransitionPresentationObserver();
      await observer.attach(context, page);
      await page.goto('data:text/html,<div id="root"></div>');
      await page.evaluate(mode => {
        const root = document.querySelector('#root')!;
        root.setAttribute('data-cribbage-presentation-scope', JSON.stringify({ gameId: 'g', dealerGameId: 'd', roundId: 'r', handNumber: 1 }));
        root.innerHTML = `<style>@keyframes __chipTransport_capture {from{transform:translateX(0)}to{transform:translateX(100px)}}
          ${mode === 'shortened-css' ? '#disc{animation-duration:100ms!important}' : ''}</style>
          <div data-chip-transport-intent="payout" data-chip-transport-from="seat" data-chip-transport-completes-at="${Date.now() + 650}" style="width:30px;height:30px">
            <div id="disc" style="width:30px;height:30px;background:gold;animation:__chipTransport_capture 500ms linear forwards"></div></div>`;
        const node = root.querySelector('[data-chip-transport-intent]')!;
        const pauseAndRemove = (duration: number) => {
          const start = performance.now();
          while (performance.now() - start < duration) { /* Deliberate test-only main-thread stall. */ }
          node.remove();
        };
        if (mode === 'css-then-pause') {
          root.addEventListener('animationend', () => setTimeout(() => pauseAndRemove(250), 10), { once: true });
        } else if (mode === 'pause-without-css-end') {
          setTimeout(() => pauseAndRemove(350), 400);
        } else if (mode === 'early-removal') {
          setTimeout(() => pauseAndRemove(140), 200);
        } else {
          if (mode === 'cancelled-css') setTimeout(() => { (root.querySelector('#disc') as HTMLElement).style.animation = 'none'; }, 200);
          setTimeout(() => node.remove(), 750);
        }
      }, mode);
      await expect(page.locator('[data-chip-transport-intent]')).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const events = observer.samples.flatMap(row => row.completionEvidence ?? []);
      const finished = observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout' && stage.finished));
      expect(finished).toBe(mode === 'css-then-pause');
      const reason = mode === 'css-then-pause' ? 'retired-complete' : mode === 'pause-without-css-end' ? 'observation-gap' : mode;
      expect(events.some(event => event.reason === reason)).toBe(true);
      if (mode === 'css-then-pause') {
        const completion = events.find(event => event.reason === 'retired-complete')!;
        expect(completion.cssCompletedAt).not.toBeNull();
        expect(completion.at - completion.lastSeen!).toBeGreaterThan(100);
      }
    } finally { await context.close(); }
  });
}

for (const mode of ['normal', 'paused', 'cancelled', 'shortened'] as const) {
  test(`actual canonical payout renderer: ${mode}`, async ({ browser }) => {
    const bundle = await build({
      stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ChipTransportRuntime} from './src/lib/canonicalShell/ChipTransportRuntime';
        const host = document.querySelector('#host');
        createRoot(document.querySelector('#root')).render(<ChipTransportRuntime containerRef={{current:host}} overlayRootRef={{current:host}}/>);`,
        resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true, write: false, format: 'iife', jsx: 'automatic',
      plugins: [{ name: 'isolated-payout-context', setup(builder) {
        // Use the real motion/retirement owner with local identity and endpoints;
        // this control has no Supabase or application-session connection.
        builder.onResolve({ filter: /\/ChipTransportProvider$/ }, args => ({ path: args.path, namespace: 'fixture-context' }));
        builder.onResolve({ filter: /\/chipEndpoints$/ }, args => ({ path: args.path, namespace: 'fixture-endpoints' }));
        builder.onResolve({ filter: /\/(chipTransportDbg|winnerChipEndpointDbg|destReactionDbg|visibleChipDbg)$/ }, args => ({ path: args.path, namespace: 'fixture-debug' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture-context' }, () => ({ resolveDir: process.cwd(), contents: `
          import React from 'react';
          export function useChipTransportInternal() {
            const [active,setActive] = React.useState([{id:'payout',from:{kind:'seat',position:1},to:{kind:'seat',position:2},amount:10,reason:'transfer',variant:'canonicalWinTransfer',enqueueSeq:1}]);
            return {gameType:'cribbage',__activeIntents:active,__markDeparted(){},__markArrived(){},
              __markSettled(id,duration){window.rendererSettlement={id,duration,at:Date.now()};setActive([])},
              __markDropped(){throw Error('Missing fixture endpoint')}};
          }` }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture-endpoints' }, () => ({ contents: `export const resolveChipEndpoint=({ref})=>({x:ref.position===1?900:400,y:ref.position===1?100:370});` }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture-debug' }, () => ({ contents: `export const chipTransportDbgUpsert=()=>{};export const captureWinnerChipEndpoint=()=>{};export const destReactionDbgUpsert=()=>{};export const snapshotTargetElement=()=>({});export const recordVisibleChipScan=()=>{};` }));
      } }],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      const observer = new TransitionPresentationObserver();
      await observer.attach(context, page);
      await page.goto('data:text/html,<div id="host" style="position:relative;width:1200px;height:800px"><div id="root"></div></div>');
      await page.evaluate(() => document.querySelector('#host')!.setAttribute('data-cribbage-presentation-scope',
        JSON.stringify({ gameId: 'g', dealerGameId: 'd', roundId: 'r', handNumber: 1 })));
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await expect(page.locator('[data-chip-transport-intent]')).toHaveCount(1);
      const deadline = await page.evaluate(mode => {
        const node = document.querySelector('[data-chip-transport-intent]')!;
        const deadline = Number(node.getAttribute('data-chip-transport-completes-at'));
        if (mode === 'paused') setTimeout(() => {
          const start = performance.now();
          while (performance.now() - start < 150) { /* Test-only pause across retirement. */ }
        }, Math.max(0, deadline - Date.now() - 90));
        if (mode === 'cancelled') setTimeout(() => { (node.firstElementChild as HTMLElement).style.animation = 'none'; }, 200);
        if (mode === 'shortened') {
          const style = document.createElement('style');
          style.textContent = '[data-chip-transport-intent] > div {animation-duration:300ms!important}';
          document.head.appendChild(style);
        }
        return deadline;
      }, mode);
      await expect(page.locator('[data-chip-transport-intent]')).toHaveCount(0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const settlement = await page.evaluate(() => (window as unknown as { rendererSettlement: { duration: number; at: number } }).rendererSettlement);
      expect(settlement.duration).toBe(2400);
      expect(settlement.at).toBeGreaterThanOrEqual(deadline);
      const events = observer.samples.flatMap(row => row.completionEvidence ?? []);
      const completed = observer.samples.some(row => row.stages.some(stage => stage.kind === 'payout' && stage.finished));
      if (mode === 'cancelled' || mode === 'shortened') {
        expect(completed).toBe(false);
        expect(events.some(event => event.reason === `${mode}-css`)).toBe(true);
      } else if (mode === 'paused' && !completed) {
        // Missing native completion must remain a named, failing observation gap.
        expect(events.some(event => event.reason === 'observation-gap')).toBe(true);
      } else expect(completed).toBe(true);
    } finally { await context.close(); }
  });
}
