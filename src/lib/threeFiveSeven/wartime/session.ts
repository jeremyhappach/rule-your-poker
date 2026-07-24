/**
 * 3-5-7 Wartime — Session + Envelope + Monotonic Sequence.
 *
 * Every wartime event carries a per-session monotonic sequence
 * allocated synchronously before buffering. A single wartimeSessionId
 * spans DG1 → settlement → modal → DG2 → advancement.
 */

let currentSessionId: string | null = null;
let sequence = 0;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensureWartimeSession(): string {
  if (!currentSessionId) {
    currentSessionId = makeId('war');
    sequence = 0;
  }
  return currentSessionId;
}

export function resetWartimeSession(): string {
  currentSessionId = makeId('war');
  sequence = 0;
  return currentSessionId;
}

export function getWartimeSessionId(): string | null {
  return currentSessionId;
}

/** Synchronous, monotonic allocation. Never gapped, never reordered. */
export function allocSequence(): number {
  sequence += 1;
  return sequence;
}

export function currentMaxSequence(): number {
  return sequence;
}

export function makeEventId(): string {
  return makeId('evt');
}
