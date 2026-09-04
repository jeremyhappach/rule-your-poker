import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dealerGameSetupTab } from './twoClientSession';

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

  it('observes dealer configuration success before waiting for an ante surface', () => {
    const configure = source.slice(
      source.indexOf('export async function configureDealerGameUnderChaos'),
      source.indexOf('export async function submitOutstandingAnteUnderChaos'),
    );
    const responseWait = configure.indexOf("pathname.endsWith('/rest/v1/rpc/configure_dealer_game')");
    const click = configure.indexOf('data-dealer-game-start');
    const responseRead = configure.indexOf('const response = await configureResponse');
    const statusCheck = configure.indexOf('if (!response.ok())');
    const ante = configure.indexOf('await submitOutstandingAnteUnderChaos(session)');

    expect(responseWait).toBeGreaterThan(-1);
    expect(click).toBeGreaterThan(responseWait);
    expect(responseRead).toBeGreaterThan(click);
    expect(statusCheck).toBeGreaterThan(responseRead);
    expect(ante).toBeGreaterThan(statusCheck);
  });

  it('selects the target game family rather than inheriting the prior dealer setup tab', () => {
    expect(dealerGameSetupTab('cribbage')).toBe('Card Games');
    expect(dealerGameSetupTab('holm-game')).toBe('Card Games');
    expect(dealerGameSetupTab('yahtzee')).toBe('Dice Games');
    expect(dealerGameSetupTab('ship-captain-crew')).toBe('Dice Games');
  });
});
