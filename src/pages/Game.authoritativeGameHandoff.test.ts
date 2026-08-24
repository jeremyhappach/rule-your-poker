// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');

describe('Game authoritative games-row handoffs', () => {
  it('applies the family publication policy before status-specific routing', () => {
    const callbackStart = source.indexOf('handler: (payload: any) => {');
    const policyIndex = source.indexOf(
      'const publishGamesRowDirectly = shouldPublishGamesRealtimeRowDirectly(newData);',
      callbackStart,
    );
    const mergeIndex = source.indexOf(
      'setGame((previous) => mergeAuthoritativeGameState(previous, newData));',
      callbackStart,
    );
    const statusRoutingIndex = source.indexOf(
      "if (newData && 'status' in newData)",
      callbackStart,
    );

    expect(callbackStart).toBeGreaterThan(-1);
    expect(policyIndex).toBeGreaterThan(callbackStart);
    expect(mergeIndex).toBeGreaterThan(policyIndex);
    expect(statusRoutingIndex).toBeGreaterThan(mergeIndex);
  });

  it('invalidates an older full snapshot only inside the direct-publication branch', () => {
    const directBranch = source.indexOf('if (publishGamesRowDirectly) {');
    const realtimeMerge = source.indexOf(
      'setGame((previous) => mergeAuthoritativeGameState(previous, newData));',
      directBranch,
    );
    const invalidation = source.lastIndexOf('fetchSeqRef.current += 1;', realtimeMerge);
    expect(directBranch).toBeGreaterThan(-1);
    expect(invalidation).toBeGreaterThan(directBranch);
    expect(invalidation).toBeLessThan(realtimeMerge);
  });

  it('uses an exact-frame refetch instead of a bare active 3-5-7 row', () => {
    expect(source).toContain('incomingIsAtomicThreeFiveSevenFrame');
    expect(source).toMatch(
      /if \(incomingIsAtomicThreeFiveSevenFrame\) \{\s*fetchGameData\('realtime_update'\);\s*return;/,
    );
  });

  it('carries an unseen session dealer draw through the neutral status-keyed surface', () => {
    const statusKeyedStart = source.indexOf('instanceLabel="status-keyed"');
    const statusKeyedEnd = source.indexOf('/>', statusKeyedStart);
    const statusKeyedProps = source.slice(statusKeyedStart, statusKeyedEnd);

    expect(statusKeyedStart).toBeGreaterThan(-1);
    expect(statusKeyedProps).toContain(
      'dealerSelectionPresentationActive={!!sessionDealerDrawReceiptHold}',
    );
    expect(statusKeyedProps).toContain(
      'onDealerSelectionPresentationVisible={handleSessionDealerDrawPresentationVisible}',
    );
  });

  it('keeps both dealer-setup mounts closed while this client drains a dealer-draw receipt', () => {
    const setupMounts = source.match(/<DealerGameSetup/g) ?? [];
    const setupBarriers = source.match(/!sessionDealerDrawPresentationPending/g) ?? [];

    expect(setupMounts).toHaveLength(2);
    expect(setupBarriers).toHaveLength(2);
    expect(source).toContain('getSessionDealerDrawPresentationFrameDwellMs');
    expect(source).toContain('advanceSessionDealerDrawPresentationFrame');
    expect(source).toContain('deriveSessionDealerDrawPresentationFrames');
  });

  it('consumes both Stay and Fold decision receipts before reconciliation fetches', () => {
    expect(source.match(/applyThreeFiveSevenDecisionReceipt\(/g)).toHaveLength(2);
    expect(source).not.toContain('setGame(gameDataToApply);');
  });
});
