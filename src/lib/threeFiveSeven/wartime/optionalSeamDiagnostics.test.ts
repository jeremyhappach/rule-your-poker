// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOptionalSeamDiagnostics } from './optionalSeamDiagnostics';
import { isWartimeCaptureEnabled, setWartimeActiveGameContext } from './capture';
import * as seam from './h1r3ToH2r1';
import * as sites from './sourceSites';

vi.mock('./emit', () => ({ emitWartime: vi.fn() }));
const scope = { gameId: 'session-a', dealerGameId: 'dealer-a' };
const modules = [seam, sites] as const;
const enabled = (value: typeof scope) => isWartimeCaptureEnabled(value.gameId, value.dealerGameId);
const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };

describe('optional seam diagnostic boundary', () => {
  beforeEach(() => {
    setWartimeActiveGameContext({ enabled: true, gameId: scope.gameId, dealerGameId: scope.dealerGameId, gameType: '3-5-7' });
  });

  it('does no loading while capture is disabled, then allows explicit enablement', async () => {
    setWartimeActiveGameContext({ enabled: false, ...scope, gameType: '3-5-7' });
    const load = vi.fn().mockResolvedValue(modules);
    const diagnostic = vi.fn();
    const run = createOptionalSeamDiagnostics(load, enabled);
    for (let n = 0; n < 100; n++) run(scope, diagnostic);
    await flush();
    expect(load).not.toHaveBeenCalled();
    setWartimeActiveGameContext({ enabled: true, ...scope, gameType: '3-5-7' });
    run(scope, diagnostic);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith(seam, sites);
  });

  it.each(['seam', 'sites'])('contains a rejected %s module and never retries across repeated renders', async rejected => {
    const load = vi.fn(() => Promise.all([
      rejected === 'seam' ? Promise.reject(new Error('HTML is not JavaScript')) : Promise.resolve(seam),
      rejected === 'sites' ? Promise.reject(new Error('missing old asset')) : Promise.resolve(sites),
    ]));
    const diagnostic = vi.fn();
    const run = createOptionalSeamDiagnostics(load, enabled);
    for (let n = 0; n < 100; n++) run(scope, diagnostic);
    await flush();
    for (let n = 0; n < 100; n++) run(scope, diagnostic);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it('shares one pending load while preserving successful fingerprints and identities', async () => {
    let resolve!: (value: typeof modules) => void;
    const load = vi.fn(() => new Promise<typeof modules>(r => { resolve = r; }));
    const run = createOptionalSeamDiagnostics(load, enabled);
    const emit = vi.fn();
    const key = 'optional-loader-test:dealer-a#h2#r1:player-uuid';
    const diagnostic = (mod: typeof seam) => {
      if (mod.shouldEmitOnFingerprintChange(key, '3H|4S|5D')) emit(scope);
    };
    for (let n = 0; n < 20; n++) run(scope, diagnostic);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(modules);
    await flush();
    expect(emit).toHaveBeenCalledExactlyOnceWith(scope);
    let newIdentityAccepted = false;
    run(scope, mod => { newIdentityAccepted = mod.shouldEmitOnFingerprintChange('optional-loader-test:dealer-b#h1#r1:player-uuid', '3H|4S|5D'); });
    await flush();
    expect(newIdentityAccepted).toBe(true);
  });

  it.each(['disabled', 'unmounted', 'other-session', 'other-dealer', 'other-game'])('drops pending callbacks when the route becomes %s', async change => {
    let resolve!: (value: typeof modules) => void;
    const run = createOptionalSeamDiagnostics(() => new Promise<typeof modules>(r => { resolve = r; }), enabled);
    const diagnostic = vi.fn();
    run(scope, diagnostic);
    await flush();
    setWartimeActiveGameContext(change === 'unmounted' ? null : {
      enabled: change !== 'disabled', gameId: change === 'other-session' ? 'session-b' : scope.gameId,
      dealerGameId: change === 'other-dealer' ? 'dealer-b' : scope.dealerGameId,
      gameType: change === 'other-game' ? 'yahtzee' : '3-5-7',
    });
    resolve(modules);
    await flush();
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it('contains synchronous and asynchronous callback failures without disabling healthy diagnostics', async () => {
    const run = createOptionalSeamDiagnostics(async () => modules, enabled);
    run(scope, () => { throw new Error('optional callback'); });
    run(scope, async () => { throw new Error('optional async callback'); });
    const good = vi.fn();
    run(scope, good);
    await flush();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('contains synchronous loader and gate failures', async () => {
    const badLoad = vi.fn(() => { throw new Error('load'); });
    const run = createOptionalSeamDiagnostics(badLoad, enabled);
    run(scope, vi.fn());
    await flush();
    run(scope, vi.fn());
    await flush();
    expect(badLoad).toHaveBeenCalledTimes(1);
    const goodLoad = vi.fn().mockResolvedValue(modules);
    expect(() => createOptionalSeamDiagnostics(goodLoad, () => { throw new Error('gate'); })(scope, vi.fn())).not.toThrow();
    expect(goodLoad).not.toHaveBeenCalled();
  });

  it('routes all five production sites through this boundary without changing their event identities', () => {
    for (const [path, count, events] of [
      ['src/pages/Game.tsx', 1, ['h1r3.completion_observed']],
      ['src/components/MobileGameTable.tsx', 2, ['h2r1.local_hand_derived', 'h2r1.opponent_back_count_derived']],
      ['src/components/ThreeFiveSevenDealOrchestrator.tsx', 2, ['h2r1.deal_transport_armed', 'h2r1.deal_transport_settled']],
    ] as const) {
      const source = readFileSync(path, 'utf8');
      expect(source.match(/withH1r3H2r1Diagnostics\(/g)).toHaveLength(count);
      expect(source).not.toMatch(/import\(['"]@\/lib\/threeFiveSeven\/wartime\/(h1r3ToH2r1|sourceSites)/);
      for (const event of events) expect(source).toContain(event);
    }
  });
});
