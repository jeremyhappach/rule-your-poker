// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');

describe('Game authoritative games-row handoffs', () => {
  it('merges the complete Realtime row before status-specific routing', () => {
    const callbackStart = source.indexOf('handler: (payload: any) => {');
    const mergeIndex = source.indexOf(
      'setGame((previous) => mergeAuthoritativeGameState(previous, newData));',
      callbackStart,
    );
    const statusRoutingIndex = source.indexOf(
      "if (newData && 'status' in newData)",
      callbackStart,
    );

    expect(callbackStart).toBeGreaterThan(-1);
    expect(mergeIndex).toBeGreaterThan(callbackStart);
    expect(statusRoutingIndex).toBeGreaterThan(mergeIndex);
  });

  it('invalidates an older full snapshot before publishing a Realtime receipt', () => {
    const realtimeMerge = source.indexOf(
      'setGame((previous) => mergeAuthoritativeGameState(previous, newData));',
    );
    const invalidation = source.lastIndexOf('fetchSeqRef.current += 1;', realtimeMerge);
    expect(invalidation).toBeGreaterThan(-1);
    expect(invalidation).toBeLessThan(realtimeMerge);
  });

  it('consumes both Stay and Fold decision receipts before reconciliation fetches', () => {
    expect(source.match(/applyThreeFiveSevenDecisionReceipt\(/g)).toHaveLength(2);
    expect(source).not.toContain('setGame(gameDataToApply);');
  });
});
