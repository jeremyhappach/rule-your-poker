/**
 * Bounded, in-memory Cribbage presentation trace.
 *
 * This is diagnostic-only: producers never await it, it performs no network
 * writes, and gameplay never reads it. A visual bug report captures the tail
 * on demand so transient presentation gates can be reconstructed afterward.
 */

export interface CribbageForensicIdentity {
  gameId: string | null;
  dealerGameId: string | null;
  playerId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  currentHandKey: string | null;
  renderHandContextId: string | null;
  authoritativeHandContextId: string | null;
  phase: string | null;
  peggingSequenceIndex: number | null;
}

export interface CribbageForensicEntry {
  seq: number;
  recordedAt: string;
  group: string;
  tag: string;
  producer: string;
  producerFunction: string;
  dedupeKey: string | null;
  eventReason: string | null;
  contradictions: string[];
  identity: CribbageForensicIdentity;
  payload: unknown;
}

export interface RecordCribbageForensicOptions {
  producerComponent: string;
  producerFunction: string;
  dedupeKey?: string;
  eventReason?: string;
  contradictions?: string[];
}

interface LegacyCribbageForensicOptions {
  producer: string;
  fn: string;
  key?: string;
  bypassDedupe?: boolean;
}

const MAX_ENTRIES = 200;
const MAX_PAYLOAD_JSON_CHARS = 1_600;

const EMPTY_IDENTITY: CribbageForensicIdentity = {
  gameId: null,
  dealerGameId: null,
  playerId: null,
  roundId: null,
  handNumber: null,
  handContextId: null,
  currentHandKey: null,
  renderHandContextId: null,
  authoritativeHandContextId: null,
  phase: null,
  peggingSequenceIndex: null,
};

let identity: CribbageForensicIdentity = { ...EMPTY_IDENTITY };
let sequence = 0;
const entries: CribbageForensicEntry[] = [];
const latestSignatureByDedupeSlot = new Map<string, { signature: string; seq: number }>();

function stableJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, current) => {
      if (typeof current === 'number' && !Number.isFinite(current)) return String(current);
      if (!current || typeof current !== 'object') return current;
      if (seen.has(current)) return '[cycle]';
      seen.add(current);
      if (Array.isArray(current)) return current;
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }) ?? 'null';
  } catch {
    return '[unserializable]';
  }
}

function boundedPayload(payload: unknown): unknown {
  const serialized = stableJson(payload);
  if (serialized.length <= MAX_PAYLOAD_JSON_CHARS) {
    try {
      return JSON.parse(serialized) as unknown;
    } catch {
      return serialized;
    }
  }
  return {
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, MAX_PAYLOAD_JSON_CHARS),
  };
}

function resetForScope(
  nextGameId: string | null,
  nextDealerGameId: string | null = null,
): void {
  entries.length = 0;
  latestSignatureByDedupeSlot.clear();
  sequence = 0;
  identity = {
    ...EMPTY_IDENTITY,
    gameId: nextGameId,
    dealerGameId: nextDealerGameId,
  };
}

export function setCribbageForensicIdentity(
  next: Partial<CribbageForensicIdentity>,
): void {
  const nextGameId = next.gameId ?? identity.gameId;
  const nextDealerGameId = next.dealerGameId ?? identity.dealerGameId;
  if (identity.gameId && nextGameId && identity.gameId !== nextGameId) {
    resetForScope(nextGameId, nextDealerGameId);
  } else if (
    identity.dealerGameId &&
    nextDealerGameId &&
    identity.dealerGameId !== nextDealerGameId
  ) {
    resetForScope(nextGameId, nextDealerGameId);
  }
  identity = {
    ...identity,
    ...next,
    gameId: nextGameId,
    dealerGameId: nextDealerGameId,
  };
}

export function recordCribbageForensicEvent(
  group: string,
  tag: string,
  payload: Record<string, unknown>,
  options: RecordCribbageForensicOptions,
): void {
  const bounded = boundedPayload(payload);
  const dedupeSlot = `${group}:${tag}:${options.dedupeKey ?? ''}`;
  const signature = stableJson({ bounded, identity });
  const previous = latestSignatureByDedupeSlot.get(dedupeSlot);
  if (previous?.signature === signature) return;

  const entry: CribbageForensicEntry = {
    seq: ++sequence,
    recordedAt: new Date().toISOString(),
    group,
    tag,
    producer: options.producerComponent,
    producerFunction: options.producerFunction,
    dedupeKey: options.dedupeKey ?? null,
    eventReason: options.eventReason ?? null,
    contradictions: [...(options.contradictions ?? [])],
    identity: { ...identity },
    payload: bounded,
  };
  entries.push(entry);
  latestSignatureByDedupeSlot.set(dedupeSlot, { signature, seq: entry.seq });

  while (entries.length > MAX_ENTRIES) {
    const dropped = entries.shift();
    if (!dropped) continue;
    const droppedSlot = `${dropped.group}:${dropped.tag}:${dropped.dedupeKey ?? ''}`;
    if (latestSignatureByDedupeSlot.get(droppedSlot)?.seq === dropped.seq) {
      latestSignatureByDedupeSlot.delete(droppedSlot);
    }
  }
}

export function recordCribbageActiveHand(
  group: string,
  tag: string,
  payload: Record<string, unknown>,
  options: LegacyCribbageForensicOptions,
): void {
  recordCribbageForensicEvent(group, tag, payload, {
    producerComponent: options.producer,
    producerFunction: options.fn,
    dedupeKey: options.bypassDedupe
      ? `${options.key ?? ''}:${sequence + 1}`
      : options.key,
  });
}

export function recordCribbageActiveHandContradiction(
  tag: string,
  payload: Record<string, unknown>,
  options: LegacyCribbageForensicOptions,
): void {
  recordCribbageForensicEvent('contradiction', tag, payload, {
    producerComponent: options.producer,
    producerFunction: options.fn,
    dedupeKey: `${options.key ?? ''}:${sequence + 1}`,
    contradictions: [tag],
  });
}

export function setCribbageDealIdentityAmbient(
  next: Partial<{
    handContextId: string | null;
    currentHandKey: string | null;
    renderHandKey: string | null;
    roundId: string | null;
    handNumber: number | null;
    gameId: string | null;
    dealerGameId: string | null;
  }>,
): void {
  setCribbageForensicIdentity({
    gameId: next.gameId,
    dealerGameId: next.dealerGameId,
    roundId: next.roundId,
    handNumber: next.handNumber,
    handContextId: next.handContextId,
    currentHandKey: next.currentHandKey,
    renderHandContextId: next.renderHandKey,
  });
}

export function captureCribbageForensicTail(limit = 80): CribbageForensicEntry[] {
  const boundedLimit = Math.max(0, Math.min(limit, MAX_ENTRIES));
  return entries.slice(-boundedLimit).map((entry) => ({
    ...entry,
    contradictions: [...entry.contradictions],
    identity: { ...entry.identity },
  }));
}

export function clearCribbageForensicTrace(): void {
  resetForScope(null);
}

export const CRIBBAGE_FORENSIC_TRACE_MAX_ENTRIES = MAX_ENTRIES;
