// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useThreeFiveSevenTerminalCompletion, type Terminal357CompletionFrame } from './useThreeFiveSevenTerminalCompletion';
import { getTerminal357CompletionReceipt, getTerminal357SweepCompletionReceipt } from '@/lib/threeFiveSeven/terminalCompletion';
import { buildTerminal357GenerationId, type Terminal357Descriptor } from '@/lib/threeFiveSeven/terminalDescriptor';

// Exact September 8 terminal identity. No production requests or mutations.
const identity = {
  gameId: '6c6306db-4d5c-4ae1-b1bf-ece4106a0548',
  dealerGameId: 'bb2d7fea-44c0-4dc8-b6b6-d3eeb47f29f6',
  roundId: '86ea9739-d89f-429e-b7d7-d1e9db5fd04a',
  handNumber: 4,
  handContextId: '86ea9739-d89f-429e-b7d7-d1e9db5fd04a',
  terminalResultIdentity: '🏆 Hap won the game!',
};
const descriptor: Terminal357Descriptor = {
  ...identity,
  terminalGenerationId: buildTerminal357GenerationId(identity),
  source: 'normal-win',
  winnerId: '11decb82-c14f-4e25-9d9e-7d3e6b6b480a',
  winnerName: 'Hap', winnerPosition: 7, targetLegs: 3,
  proofCards: null, hadAuthoritativeLegs: true,
};
const receipt = getTerminal357CompletionReceipt(descriptor)!;
const terminal: Terminal357CompletionFrame = {
  ...identity, enabled: true, status: 'game_over', revealBlocked: false, descriptor,
};
afterEach(cleanup);

describe('3-5-7 exact terminal completion permission', () => {
  it('replays settlement during reveal: no setup through DROP, hold, award, legs or pot flight', () => {
    const { result, rerender } = renderHook(useThreeFiveSevenTerminalCompletion, {
      initialProps: { ...terminal, revealBlocked: true, descriptor: null },
    });
    // At resolution +456ms the old browser poll called the generic owner.
    expect(result.current.canAdvance()).toBe(false);
    expect(result.current.acceptCompletion(receipt)).toBe(false);
    rerender({ ...terminal, revealBlocked: true });
    expect(result.current.acceptCompletion(receipt)).toBe(false);
    // Reveal expiry admits animations, not next-game setup.
    rerender(terminal);
    for (const phase of ['final-leg', 'legs-to-player', 'sweep-credit', 'pot-to-player']) {
      expect(result.current.canAdvance(), phase).toBe(false);
      expect(result.current.canAdvance(receipt), phase).toBe(false);
    }
    expect(result.current.acceptCompletion(receipt)).toBe(true);
    expect(result.current.canAdvance(receipt)).toBe(true);
    expect(result.current.canAdvance()).toBe(false);
    expect(result.current.acceptCompletion(receipt)).toBe(false);
  });

  it('permits two completed clients, then rejects the late client after server handoff', () => {
    const a = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
    const b = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
    expect(a.result.current.canAdvance()).toBe(false);
    expect(b.result.current.canAdvance()).toBe(false);
    expect(a.result.current.acceptCompletion(receipt)).toBe(true);
    expect(b.result.current.acceptCompletion(receipt)).toBe(true);
    expect(a.result.current.canAdvance(receipt)).toBe(true);
    expect(b.result.current.canAdvance(receipt)).toBe(true);
    // Simultaneous requests carry the same DB identity; the unchanged RPC dedupes.
    const lateRequest = b.result.current.canAdvance;
    b.rerender({ ...terminal, status: 'game_selection', dealerGameId: null, roundId: null });
    expect(lateRequest(receipt)).toBe(false);
  });

  it('never rebinds an old callback to a later dealer game, even with identical winner text', () => {
    const { result, rerender } = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
    const oldCallback = result.current.acceptCompletion;
    const nextIdentity = { ...identity, dealerGameId: 'b87408fc-a01f-4f7f-8059-81b36bc75d3a' };
    const next = { ...descriptor, ...nextIdentity, terminalGenerationId: buildTerminal357GenerationId(nextIdentity) };
    rerender({ ...terminal, ...nextIdentity, descriptor: next });
    expect(oldCallback(receipt)).toBe(false);
    const nextReceipt = getTerminal357CompletionReceipt(next)!;
    expect(result.current.canAdvance(nextReceipt)).toBe(false);
    expect(result.current.acceptCompletion(nextReceipt)).toBe(true);
    expect(result.current.canAdvance(nextReceipt)).toBe(true);
  });

  it.each(['gameId', 'dealerGameId', 'roundId', 'handNumber', 'terminalGenerationId'] as const)(
    'rejects a mismatched %s without consuming the valid completion', (field) => {
      const { result } = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
      expect(result.current.acceptCompletion({ ...receipt, [field]: field === 'handNumber' ? 5 : 'other' })).toBe(false);
      expect(result.current.acceptCompletion(receipt)).toBe(true);
    },
  );

  it('admits instant sweeps and session-ended presentation without a next-game inference', () => {
    const instant = { ...descriptor, source: 'instant-357' as const };
    const { result, rerender } = renderHook(useThreeFiveSevenTerminalCompletion, {
      initialProps: { ...terminal, status: 'session_ended', descriptor: instant },
    });
    expect(result.current.canAdvance()).toBe(false);
    expect(result.current.acceptCompletion(receipt)).toBe(true);
    rerender({ ...terminal, enabled: false, status: 'session_ended', descriptor: instant });
    expect(result.current.canAdvance(receipt)).toBe(false);
  });

  it('does not authorize cold mount or unmounted callbacks; server recovery remains independent', () => {
    const { result, unmount } = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
    const completion = result.current.acceptCompletion;
    expect(result.current.canAdvance(receipt)).toBe(false);
    unmount();
    expect(completion(receipt)).toBe(false);
  });

  it('requires a fully resolved immutable presentation identity', () => {
    expect(getTerminal357CompletionReceipt(null)).toBe(null);
    expect(getTerminal357CompletionReceipt({ ...receipt, roundId: null })).toBe(null);
    expect(getTerminal357CompletionReceipt({ ...receipt, handNumber: 0 })).toBe(null);
    expect(getTerminal357CompletionReceipt({ ...receipt, handNumber: 1.5 })).toBe(null);
  });

  it('preserves terminal completion when authority clears the live round pointer', () => {
    const { result } = renderHook(useThreeFiveSevenTerminalCompletion, {
      initialProps: { ...terminal, roundId: null },
    });
    expect(result.current.acceptCompletion(receipt)).toBe(true);
    expect(result.current.canAdvance(receipt)).toBe(true);
  });

  it('waits for the exact descriptor on legacy sweep release and rejects stale descriptors', () => {
    const legacy = { ...identity, roundId: null };
    expect(getTerminal357SweepCompletionReceipt(legacy, null)).toBe(null);
    expect(getTerminal357SweepCompletionReceipt(legacy, descriptor)).toEqual(receipt);
    expect(getTerminal357SweepCompletionReceipt({ ...legacy, dealerGameId: 'other' }, descriptor)).toBe(null);
    expect(getTerminal357SweepCompletionReceipt({ ...legacy, roundId: 'other' }, descriptor)).toBe(null);
    expect(getTerminal357SweepCompletionReceipt({ ...legacy, handContextId: 'other' }, descriptor)).toBe(null);
    expect(getTerminal357SweepCompletionReceipt({ ...legacy, terminalResultIdentity: 'other' }, descriptor)).toBe(null);
    const { result } = renderHook(useThreeFiveSevenTerminalCompletion, { initialProps: terminal });
    const captured = getTerminal357SweepCompletionReceipt(legacy, descriptor)!;
    expect(result.current.acceptCompletion(captured)).toBe(true);
    expect(result.current.canAdvance(captured)).toBe(true);
  });
});
