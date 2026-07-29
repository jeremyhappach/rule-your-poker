// @ts-nocheck
// @vitest-environment jsdom
/**
 * Regression: bot knock path in GinRummyGameTable's bot runner effect.
 *
 * Proven defect (score-rail reset after Non-Dealer Near-Knock harness smoke):
 * when the bot declared a non-gin knock, the runner wrote the 'knocking'
 * snapshot, held 2800ms for the overlay, then FELL THROUGH to the generic
 * trailing `rounds.update({ gin_rummy_state: state })` + setGinState(state).
 * `state` had not advanced during the hold, so that trailing write re-published
 * the stale pre-settlement 'knocking' snapshot (matchScores { bot: 0 }) over
 * the authoritative 'complete' state (matchScores { bot: 72 }) that the human
 * opponent authored while laying off. Result: the rail briefly showed 72, then
 * reverted to 0 for the remainder of the terminal sequence.
 *
 * Corrected contract: the bot knock branch RETURNS after the presentation hold.
 * The opponent owns layoff → scoring → complete, exactly like the human
 * handleKnock path. Both paths therefore share one scoring owner (scoreHand)
 * and one settlement writer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GinRummyState } from '@/lib/ginRummyTypes';

function knockingState(overrides: Partial<GinRummyState> = {}): GinRummyState {
  return {
    phase: 'knocking',
    handNumber: 1,
    actionCount: 12,
    dealerPlayerId: 'human',
    nonDealerPlayerId: 'bot',
    turnOrder: ['bot', 'human'],
    currentTurnPlayerId: 'human',
    turnPhase: 'discard',
    drawSource: null,
    firstDrawOfferedTo: null,
    firstDrawPassed: [],
    anteAmount: 5,
    pot: 10,
    pointsToWin: 50,
    matchScores: { human: 0, bot: 0 },
    knockResult: null,
    stockPile: [],
    discardPile: [],
    playerStates: {
      human: {
        playerId: 'human', hand: [], melds: [], deadwood: [],
        deadwoodValue: 30, hasKnocked: false, hasGin: false, laidOffCards: [],
      },
      bot: {
        playerId: 'bot', hand: [], melds: [], deadwood: [],
        deadwoodValue: 1, hasKnocked: true, hasGin: false, laidOffCards: [],
      },
    },
    winnerPlayerId: null,
    ...overrides,
  };
}

/** Faithful re-implementation of the corrected bot knock control flow. */
async function runBotKnockBranch(
  initial: GinRummyState,
  dbUpdate: (s: GinRummyState) => Promise<void>,
) {
  const state = initial;
  if (state.phase === 'knocking') {
    await dbUpdate(state);
    await new Promise((r) => setTimeout(r, 2800));
    return; // corrected: no fall-through to the generic trailing write
  }
  // generic trailing write (unreachable for the knock branch)
  await dbUpdate(state);
}

describe('bot knock branch — no stale trailing write', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes the knocking snapshot once and never re-publishes it after the hold', async () => {
    const dbUpdate = vi.fn().mockResolvedValue(undefined);
    const done = runBotKnockBranch(knockingState(), dbUpdate);

    await vi.advanceTimersByTimeAsync(0);
    expect(dbUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2800);
    await done;
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  it('settled matchScores authored during the hold survive (72 is not reset to 0)', async () => {
    let dbState = knockingState();
    const dbUpdate = vi.fn().mockImplementation(async (s: GinRummyState) => { dbState = s; });

    const done = runBotKnockBranch(knockingState(), dbUpdate);
    await vi.advanceTimersByTimeAsync(0);

    // Human finishes layoff → scoring → complete mid-hold (canonical scoreHand owner).
    await vi.advanceTimersByTimeAsync(1200);
    dbState = { ...dbState, phase: 'complete', matchScores: { human: 0, bot: 72 }, winnerPlayerId: 'bot' };

    await vi.advanceTimersByTimeAsync(1600);
    await done;

    expect(dbState.phase).toBe('complete');
    expect(dbState.matchScores.bot).toBe(72);
  });
});

describe('bot knock branch — source structural invariant', () => {
  it('both bot knocking branches return after the 2800ms hold', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
      'utf8',
    );
    const runnerIdx = src.indexOf('const runBotAction');
    expect(runnerIdx).toBeGreaterThan(-1);
    const runner = src.slice(runnerIdx, src.indexOf('const handleKnock = async'));

    // Each `setTimeout(resolve, 2800)` inside the bot runner must be followed
    // by a `return;` before the enclosing branch closes.
    const holds = [...runner.matchAll(/setTimeout\(resolve, 2800\)\);/g)];
    expect(holds.length).toBe(2);
    for (const h of holds) {
      const after = runner.slice(h.index, h.index + 700);
      expect(after).toMatch(/return;/);
      // and the return must come before the next branch keyword
      const retIdx = after.indexOf('return;');
      const elseIdx = after.indexOf('} else');
      expect(retIdx).toBeGreaterThan(-1);
      if (elseIdx > -1) expect(retIdx).toBeLessThan(elseIdx);
    }
    expect(runner).not.toContain("Don't return — fall through");
  });
});
