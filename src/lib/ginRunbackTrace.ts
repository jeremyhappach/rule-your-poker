export type GinRunbackDropReason =
  | 'round latch'
  | 'hand mismatch'
  | 'progress vector'
  | 'bootstrap mismatch'
  | 'other'
  | null;

export type GinRunbackOverlayStateSource =
  | 'accepted authoritative snapshot'
  | 'local optimistic/pre-write state'
  | 'stale presentation state'
  | 'null/bootstrap state';

export interface GinRunbackTraceFields {
  gameId: string | null;
  oldRoundId: string | null;
  newRoundId: string | null;
  oldHandNumber: number | null;
  newHandNumber: number | null;
  authIdentity: unknown | null;
  currentRoundId: string | null;
  currentHandNumber: number | null;
  payloadRoundId: string | null;
  payloadHandNumber: number | null;
  payloadPhase: string | null;
  viewState: unknown | null;
  ginState: unknown | null;
  isStaleHandPresentation: boolean | null;
  isPlayable: boolean | null;
  selfHandCount: number | null;
  opponentHandCount: number | null;
  dealRuntime: unknown | null;
  activePaneAnchorHostPresent: boolean | null;
  overlayPredicateInputs: unknown | null;
  overlayStateSource: GinRunbackOverlayStateSource | null;
  overlayFired: boolean | null;
  skippedReason: string | null;
  applyState: 'accepted' | 'dropped' | null;
  dropReason: GinRunbackDropReason;
  note: string | null;
}

export interface GinRunbackTraceEvent extends GinRunbackTraceFields {
  seq: number;
  timestamp: string;
  tMs: number;
  event: string;
}

const MAX_EVENTS = 1000;
const listeners = new Set<() => void>();
const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
let seq = 0;
let buffer: GinRunbackTraceEvent[] = [];
let snapshot: GinRunbackTraceEvent[] = [];
let context: Partial<GinRunbackTraceFields> = {};

const DEFAULT_FIELDS: GinRunbackTraceFields = {
  gameId: null,
  oldRoundId: null,
  newRoundId: null,
  oldHandNumber: null,
  newHandNumber: null,
  authIdentity: null,
  currentRoundId: null,
  currentHandNumber: null,
  payloadRoundId: null,
  payloadHandNumber: null,
  payloadPhase: null,
  viewState: null,
  ginState: null,
  isStaleHandPresentation: null,
  isPlayable: null,
  selfHandCount: null,
  opponentHandCount: null,
  dealRuntime: null,
  activePaneAnchorHostPresent: null,
  overlayPredicateInputs: null,
  overlayStateSource: null,
  overlayFired: null,
  skippedReason: null,
  applyState: null,
  dropReason: null,
  note: null,
};

function notify() {
  snapshot = buffer.slice();
  for (const listener of listeners) {
    try { listener(); } catch { /* trace must never affect gameplay */ }
  }
}

export function setGinRunbackTraceContext(next: Partial<GinRunbackTraceFields>): void {
  context = { ...context, ...next };
}

export function recordGinRunbackTrace(
  event: string,
  fields: Partial<GinRunbackTraceFields> = {},
): void {
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const row: GinRunbackTraceEvent = {
    ...DEFAULT_FIELDS,
    ...context,
    ...fields,
    seq: ++seq,
    timestamp: new Date().toISOString(),
    tMs: Math.round(now - t0),
    event,
  };
  buffer.push(row);
  while (buffer.length > MAX_EVENTS) buffer.shift();
  notify();
}

export function getGinRunbackTrace(): GinRunbackTraceEvent[] {
  return snapshot;
}

export function subscribeGinRunbackTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearGinRunbackTrace(): void {
  buffer = [];
  notify();
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function formatGinRunbackTraceAsText(): string {
  const lines = ['# GIN RUNBACK TRACE (oldest first)'];
  for (const e of buffer) {
    lines.push([
      `#${e.seq}`,
      `+${e.tMs}ms`,
      e.timestamp,
      e.event,
      `gameId=${compact(e.gameId)}`,
      `oldRoundId=${compact(e.oldRoundId)}`,
      `newRoundId=${compact(e.newRoundId)}`,
      `oldHandNumber=${compact(e.oldHandNumber)}`,
      `newHandNumber=${compact(e.newHandNumber)}`,
      `authIdentity=${compact(e.authIdentity)}`,
      `currentRoundId=${compact(e.currentRoundId)}`,
      `currentHandNumber=${compact(e.currentHandNumber)}`,
      `payloadRoundId=${compact(e.payloadRoundId)}`,
      `payloadHandNumber=${compact(e.payloadHandNumber)}`,
      `payloadPhase=${compact(e.payloadPhase)}`,
      `viewState=${compact(e.viewState)}`,
      `ginState=${compact(e.ginState)}`,
      `isStaleHandPresentation=${compact(e.isStaleHandPresentation)}`,
      `isPlayable=${compact(e.isPlayable)}`,
      `selfHandCount=${compact(e.selfHandCount)}`,
      `opponentHandCount=${compact(e.opponentHandCount)}`,
      `dealRuntime=${compact(e.dealRuntime)}`,
      `activePaneAnchorHostPresent=${compact(e.activePaneAnchorHostPresent)}`,
      `overlayPredicateInputs=${compact(e.overlayPredicateInputs)}`,
      `overlayStateSource=${compact(e.overlayStateSource)}`,
      `overlayFired=${compact(e.overlayFired)}`,
      `skippedReason=${compact(e.skippedReason)}`,
      `applyState=${compact(e.applyState)}`,
      `dropReason=${compact(e.dropReason)}`,
      `note=${compact(e.note)}`,
    ].join(' | '));
  }
  return lines.join('\n');
}

if (typeof window !== 'undefined') {
  (window as any).__ginRunbackTraceExport = formatGinRunbackTraceAsText;
  (window as any).__ginRunbackTraceEvents = getGinRunbackTrace;
}
