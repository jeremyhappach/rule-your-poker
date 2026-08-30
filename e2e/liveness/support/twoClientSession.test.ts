import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./twoClientSession.ts', import.meta.url), 'utf8');

describe('two-client session chaos ownership', () => {
  it('labels the deliberate session-start peer outage before the tracked click', () => {
    const start = source.slice(
      source.indexOf('export async function startSessionUnderChaos'),
      source.indexOf('export async function configureDealerGameUnderChaos'),
    );
    const marker = start.indexOf('__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__');
    const click = start.indexOf("hostPage.locator('[data-start-game-btn]').click()");
    const outage = start.indexOf('runOfflineBurst(peerContext, 1_750)');

    expect(marker).toBeGreaterThan(-1);
    expect(click).toBeGreaterThan(marker);
    expect(outage).toBeGreaterThan(click);
  });
});
