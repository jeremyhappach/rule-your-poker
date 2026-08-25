import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cribbageSource = readFileSync(new URL('../components/CribbageMobileGameTable.tsx', import.meta.url), 'utf8');
const ginSource = readFileSync(new URL('../components/GinRummyGameTable.tsx', import.meta.url), 'utf8');
const identitySource = readFileSync(new URL('./gameStateSync/authoritativeIdentity.ts', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');

describe('gameplay supplemental Realtime catch-up wiring', () => {
  it('repairs both Cribbage private state and dealer-selection state on resubscribe', () => {
    expect(cribbageSource).toContain('source: `cribbage-private-${currentRoundId}`');
    expect(cribbageSource).toContain('source: `cribbage-dealer-selection-${gameId}`');
    expect(cribbageSource.match(/handleAuthoritativeRealtimeStatus\(status, err/g)).toHaveLength(2);
    expect(cribbageSource.match(/subscribeAuthoritativeRecoverySnapshot\(\(source\)/g)).toHaveLength(2);
    expect(cribbageSource.match(/\.dispose\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('repairs caller-specific Gin state on resubscribe', () => {
    expect(ginSource).toContain('source: `gin-private-${roundId}`');
    expect(ginSource).toContain('catchUp: exactStateLoader.refresh');
    expect(ginSource).toContain('exactStateLoader.dispose()');
    expect(ginSource).toContain('exactStateLoader.refresh(`parent-${source}`)');
  });

  it('repairs dealer-game-scoped authoritative round identity on resubscribe', () => {
    expect(identitySource).toContain('source: `authoritative-identity-${dealerGameId}`');
    expect(identitySource).toContain('catchUp: identityLoader.refresh');
    expect(identitySource).toContain('identityLoader.invalidate()');
    expect(identitySource).toContain('identityLoader.dispose()');
    expect(identitySource).toContain('identityLoader.refresh(`parent-${source}`)');
  });

  it('fans successful reconnect, resume, and fallback snapshots out from the central owner', () => {
    expect(gameSource).toContain("fetchGameData('realtime_fallback')");
    expect(gameSource).toContain('dispatchAuthoritativeRecoverySnapshot(fetchTrigger)');
    expect(gameSource).toContain("window.addEventListener('online', handleOnline)");
    expect(gameSource).toContain("window.removeEventListener('online', handleOnline)");
    expect(gameSource).toContain("dispatchAuthoritativeRecoverySnapshot('online')");
    expect(gameSource).toContain("fetchTrigger === 'online'");
    expect(gameSource).toContain("fetchTrigger === 'realtime_reconnect'");
    expect(gameSource).toContain("fetchTrigger === 'realtime_fallback'");
  });
});
