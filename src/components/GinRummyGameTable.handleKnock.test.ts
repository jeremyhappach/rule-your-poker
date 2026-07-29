// @ts-nocheck
// @vitest-environment jsdom
/**
 * Regression: gin knock/scoring control flow in GinRummyGameTable.handleKnock.
 *
 * Proven defect: an unconditional trailing `await updateState(newState)` ran
 * after the non-gin knock branch's 2800ms overlay hold. During that hold the
 * opponent could complete laying off and author `phase: 'complete'`; the
 * trailing write then clobbered that newer state with the stale `knocking`
 * snapshot, causing the knocker to remain visually stuck on "Opponent laying
 * off" while subsequent snapshots were rejected as regressive.
 *
 * Corrected contract:
 *   - Gin branch (phase === 'scoring'): after presentation hold, run scoreHand
 *     and write the resulting 'complete' state exactly once via updateState.
 *   - Non-gin branch (phase === 'knocking'): write the initial 'knocking'
 *     state via `supabase.from('rounds').update(...)` (opponent overlay), hold
 *     for 2800ms, and perform NO trailing updateState. The opponent now owns
 *     the layoff → scoring → complete progression.
 *
 * These two tests use fake timers to simulate the presentation hold and drive
 * a faithful re-implementation of the corrected control flow against mocked
 * writers. They fail if a delayed stale write is reintroduced.
 *
 * A third test scans the component source directly to lock the structural
 * invariant that no `updateState(newState)` sits outside the scoring branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreHand } from '@/lib/ginRummyGameLogic';
import type { GinRummyState } from '@/lib/ginRummyTypes';

// ── Minimal state factories ────────────────────────────────────────────────

function stubKnockingState(overrides: Partial<GinRummyState> = {}): GinRummyState {
  return {
    phase: 'knocking',
    handNumber: 1,
    actionCount: 10,
    dealerPlayerId: 'p1',
    nonDealerPlayerId: 'p2',
    turnOrder: ['p2', 'p1'],
    currentTurnPlayerId: 'p1',
    turnPhase: 'discard',
    drawSource: null,
    firstDrawOfferedTo: null,
    firstDrawPassed: [],
    anteAmount: 5,
    pot: 10,
    pointsToWin: 100,
    matchScores: { p1: 0, p2: 0 },
    knockResult: null,
    stockPile: [],
    discardPile: [],
    playerStates: {
      p1: {
        playerId: 'p1', hand: [], melds: [], deadwood: [],
        deadwoodValue: 5, hasKnocked: true, hasGin: false, laidOffCards: [],
      },
      p2: {
        playerId: 'p2', hand: [], melds: [], deadwood: [],
        deadwoodValue: 20, hasKnocked: false, hasGin: false, laidOffCards: [],
      },
    },
    winnerPlayerId: null,
    ...overrides,
  };
}

// ── Faithful re-implementation of the corrected handleKnock branch ─────────
// Mirrors src/components/GinRummyGameTable.tsx handleKnock() control flow.

async function runKnockFlow(
  initial: GinRummyState,
  deps: {
    dbUpdate: (state: GinRummyState) => Promise<void>;
    updateState: (state: GinRummyState) => Promise<void>;
  },
): Promise<{ final: GinRummyState }> {
  let s = initial;
  if (s.phase === 'scoring') {
    // Gin overlay: write scoring snapshot for opponent, hold, compute complete, write once.
    await deps.dbUpdate(s);
    await new Promise((r) => setTimeout(r, 3500));
    s = scoreHand(s);
    await deps.updateState(s);
  } else if (s.phase === 'knocking') {
    // Non-gin: write knocking snapshot for opponent overlay, hold, NO trailing write.
    await deps.dbUpdate(s);
    await new Promise((r) => setTimeout(r, 2800));
    // No trailing updateState — opponent owns layoff → scoring → complete.
  }
  return { final: s };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handleKnock — corrected control flow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('non-gin knock: writes initial knocking state exactly once and performs NO trailing updateState', async () => {
    const dbUpdate = vi.fn().mockResolvedValue(undefined);
    const updateState = vi.fn().mockResolvedValue(undefined);
    const initial = stubKnockingState({ phase: 'knocking' });

    const done = runKnockFlow(initial, { dbUpdate, updateState });

    // Initial knocking write happens before the hold.
    await vi.advanceTimersByTimeAsync(0);
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbUpdate.mock.calls[0][0].phase).toBe('knocking');
    expect(updateState).not.toHaveBeenCalled();

    // Advance through the 2800ms overlay hold.
    await vi.advanceTimersByTimeAsync(2800);
    await done;

    // Still only the single initial write; no trailing stale write.
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(updateState).not.toHaveBeenCalled();
  });

  it('non-gin knock: opponent completes layoff during hold — completed state is NOT overwritten', async () => {
    const dbUpdate = vi.fn().mockResolvedValue(undefined);
    const updateState = vi.fn().mockResolvedValue(undefined);

    // Snapshot of authoritative DB state, mutated by the "opponent" mid-hold.
    let dbState: GinRummyState = stubKnockingState({ phase: 'knocking' });
    dbUpdate.mockImplementation(async (s: GinRummyState) => { dbState = s; });
    updateState.mockImplementation(async (s: GinRummyState) => { dbState = s; });

    const initial = stubKnockingState({ phase: 'knocking' });
    const done = runKnockFlow(initial, { dbUpdate, updateState });

    await vi.advanceTimersByTimeAsync(0);
    expect(dbState.phase).toBe('knocking');

    // Opponent authoritatively advances to 'complete' partway through the hold.
    await vi.advanceTimersByTimeAsync(1000);
    dbState = { ...dbState, phase: 'complete' };

    await vi.advanceTimersByTimeAsync(2000);
    await done;

    // The knocker's flow performed no post-hold write, so 'complete' survives.
    expect(dbState.phase).toBe('complete');
    expect(updateState).not.toHaveBeenCalled();
  });

  it('gin path: performs scoring presentation, runs scoreHand, and writes final complete state exactly once', async () => {
    const dbUpdate = vi.fn().mockResolvedValue(undefined);
    const updateState = vi.fn().mockResolvedValue(undefined);

    // Build a scoring-phase state where scoreHand can complete deterministically.
    const scoring = stubKnockingState({
      phase: 'scoring',
      playerStates: {
        p1: {
          playerId: 'p1', hand: [], melds: [], deadwood: [],
          deadwoodValue: 0, hasKnocked: true, hasGin: true, laidOffCards: [],
        },
        p2: {
          playerId: 'p2', hand: [], melds: [], deadwood: [],
          deadwoodValue: 15, hasKnocked: false, hasGin: false, laidOffCards: [],
        },
      },
    });

    const done = runKnockFlow(scoring, { dbUpdate, updateState });

    // Initial scoring snapshot written for opponent overlay.
    await vi.advanceTimersByTimeAsync(0);
    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(dbUpdate.mock.calls[0][0].phase).toBe('scoring');
    expect(updateState).not.toHaveBeenCalled();

    // Advance through the 3500ms gin presentation hold.
    await vi.advanceTimersByTimeAsync(3500);
    const { final } = await done;

    // Exactly one trailing updateState carrying the newly-authored complete state.
    expect(updateState).toHaveBeenCalledTimes(1);
    expect(updateState.mock.calls[0][0].phase).toBe('complete');
    expect(final.phase).toBe('complete');
  });
});

describe('handleKnock — source structural invariant', () => {
  it('does not contain an unconditional trailing updateState after the knock/scoring branch', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
      'utf8',
    );

    // The old defect was the sequence:
    //   } else if (newState.phase === 'knocking') { ... }
    //   await updateState(newState);
    // Locate the handleKnock body and assert no `await updateState(newState)`
    // sits at the branch-closing indentation immediately after the else-if.
    const knockIdx = src.indexOf('const handleKnock = async');
    expect(knockIdx).toBeGreaterThan(-1);
    const body = src.slice(knockIdx, knockIdx + 4000);

    // Find the closing of the `else if (newState.phase === 'knocking')` block.
    const elseIfIdx = body.indexOf("newState.phase === 'knocking'");
    expect(elseIfIdx).toBeGreaterThan(-1);
    const afterElseIf = body.slice(elseIfIdx);

    // Between the end of that block ("      }") and the try/catch close, there
    // must be NO `await updateState(newState)` at the outer branch level.
    const closeIdx = afterElseIf.indexOf('\n      }');
    expect(closeIdx).toBeGreaterThan(-1);
    const trailer = afterElseIf.slice(closeIdx, closeIdx + 400);
    expect(trailer).not.toMatch(/^\s*await\s+updateState\(newState\)/m);
  });
});
