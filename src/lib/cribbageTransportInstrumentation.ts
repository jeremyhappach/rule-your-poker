/**
 * Minimal in-memory ledger for the Cribbage hand → pegging-row transport.
 *
 * Every play-card attempt (self OR opponent) records a single entry.
 * The animation lifecycle (mounted/started/settled/skipped) and any
 * cleanup that clears the intent update the same entry so the pill can
 * show — for the last-card failure specifically — exactly WHERE the
 * pipeline dropped: intent never created, intent never mounted, source
 * rect missing, dest rect missing, phase change before mount, unmount
 * before start, or cleanup by boundary reset.
 *
 * No console logs. No backend writes. No localStorage.
 */

export type SourceStatus = 'measured' | 'fallback' | 'missing';
export type DestStatus = 'measured' | 'fallback' | 'missing';
export type CleanupReason =
  | 'settled'
  | 'boundary-reset'
  | 'round-change'
  | 'safety-timeout'
  | 'superseded'
  | 'unmount'
  | null;

export interface PegTransportEntry {
  attemptId: string;
  ts: number;
  handContextId: string | null;
  roundId: string | null;
  handNumber: number | null;
  mode: 'self' | 'opponent';
  playedCardId: string | null;
  playedCardIndex: number | null;
  phaseBefore: string | null;
  phaseAfter: string | null;
  cardsRemainingBefore: number | null;
  cardsRemainingAfter: number | null;
  isFinalCardOfPegging: boolean | null;
  sourceRectStatus: SourceStatus;
  sourceRect: { x: number; y: number; width: number; height: number } | null;
  destRectStatus: DestStatus;
  destRect: { x: number; y: number; width: number; height: number } | null;
  intentCreated: boolean;
  intentMounted: boolean;
  animationStarted: boolean;
  animationSettled: boolean;
  skipReason: string | null;
  cleanupReason: CleanupReason;
  boundaryKeyBefore: string | null;
  boundaryKeyAfter: string | null;
  didPhaseChangeBeforeMount: boolean;
  didUnmountBeforeStart: boolean;
  activeInFlightIds: string[];
}

const MAX_ENTRIES = 24;
const entries: PegTransportEntry[] = [];
const byId = new Map<string, PegTransportEntry>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

export function subscribePegTransport(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getPegTransportEntries(): PegTransportEntry[] {
  return entries;
}

export function recordPegTransportAttempt(
  init: Omit<PegTransportEntry,
    | 'ts'
    | 'intentMounted'
    | 'animationStarted'
    | 'animationSettled'
    | 'phaseAfter'
    | 'cardsRemainingAfter'
    | 'cleanupReason'
    | 'boundaryKeyAfter'
    | 'didPhaseChangeBeforeMount'
    | 'didUnmountBeforeStart'
  >,
): void {
  const e: PegTransportEntry = {
    ...init,
    ts: Date.now(),
    intentMounted: false,
    animationStarted: false,
    animationSettled: false,
    phaseAfter: null,
    cardsRemainingAfter: null,
    cleanupReason: null,
    boundaryKeyAfter: null,
    didPhaseChangeBeforeMount: false,
    didUnmountBeforeStart: false,
  };
  entries.push(e);
  byId.set(e.attemptId, e);
  while (entries.length > MAX_ENTRIES) {
    const dropped = entries.shift();
    if (dropped) byId.delete(dropped.attemptId);
  }
  notify();
}

export function updatePegTransportEntry(
  attemptId: string,
  patch: Partial<PegTransportEntry>,
): void {
  const e = byId.get(attemptId);
  if (!e) return;
  Object.assign(e, patch);
  notify();
}

export function serializePegTransport(): string {
  const lines: string[] = [];
  lines.push(`peg-transport-ledger (${entries.length} entries, newest last)`);
  for (const e of entries) {
    lines.push('---');
    lines.push(`attemptId: ${e.attemptId}`);
    lines.push(`ts: ${new Date(e.ts).toISOString()}`);
    lines.push(`mode: ${e.mode}`);
    lines.push(`handContextId: ${e.handContextId ?? 'null'}`);
    lines.push(`roundId: ${e.roundId ?? 'null'}`);
    lines.push(`handNumber: ${e.handNumber ?? 'null'}`);
    lines.push(`phaseBefore: ${e.phaseBefore ?? 'null'} -> phaseAfter: ${e.phaseAfter ?? 'null'}`);
    lines.push(`playedCardId: ${e.playedCardId ?? 'null'} idx: ${e.playedCardIndex ?? 'null'}`);
    lines.push(`cardsRemainingBefore: ${e.cardsRemainingBefore ?? 'null'} -> after: ${e.cardsRemainingAfter ?? 'null'}`);
    lines.push(`isFinalCardOfPegging: ${e.isFinalCardOfPegging}`);
    lines.push(`sourceRectStatus: ${e.sourceRectStatus} rect: ${e.sourceRect ? JSON.stringify(e.sourceRect) : 'null'}`);
    lines.push(`destRectStatus: ${e.destRectStatus} rect: ${e.destRect ? JSON.stringify(e.destRect) : 'null'}`);
    lines.push(`intentCreated: ${e.intentCreated} intentMounted: ${e.intentMounted} animationStarted: ${e.animationStarted} animationSettled: ${e.animationSettled}`);
    lines.push(`skipReason: ${e.skipReason ?? '(none)'} cleanupReason: ${e.cleanupReason ?? '(none)'}`);
    lines.push(`boundaryKey: ${e.boundaryKeyBefore ?? 'null'} -> ${e.boundaryKeyAfter ?? 'null'}`);
    lines.push(`didPhaseChangeBeforeMount: ${e.didPhaseChangeBeforeMount} didUnmountBeforeStart: ${e.didUnmountBeforeStart}`);
    lines.push(`activeInFlightIds: [${e.activeInFlightIds.join(', ')}]`);
  }
  return lines.join('\n');
}
