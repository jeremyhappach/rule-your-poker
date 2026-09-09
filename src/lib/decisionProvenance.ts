import { BUILD_META } from './buildMeta';

export type DecisionInput = {
  source: 'button' | 'auto_fold' | 'unknown';
  activatedAt: number;
  modality?: 'mouse' | 'touch' | 'pen' | 'keyboard_or_assistive' | 'unknown';
  trusted?: boolean;
};
export type DecisionProvenance = DecisionInput & {
  version: 1; requestId: string; build: string;
  gameId: string; dealerGameId: string; roundId: string; playerId: string;
  decision: 'stay' | 'fold';
};

// Supabase already sends this header. Reusing its name avoids a new CORS
// preflight-cache key on the first decision. Only this request's client label changes.
export const DECISION_PROVENANCE_HEADER = 'x-client-info';
export const DECISION_PROVENANCE_PREFIX = 'ptown-decision/1 ';
export const DECISION_PROVENANCE_STORAGE = 'ptown:decision-provenance:v1';
const CAPACITY = 64;
type RecordEntry = DecisionProvenance & { recordedAt: number; outcome: string; elapsedMs?: number };
const records: RecordEntry[] = [];
let flushScheduled = false;

/** Capture at the button, before manual and automatic call paths converge. */
export function captureDecisionInput(event: {
  nativeEvent: { isTrusted: boolean; pointerType?: string; detail?: number };
}): DecisionInput {
  const native = event.nativeEvent;
  const pointer = native.pointerType;
  return { source: 'button', activatedAt: Date.now(), trusted: native.isTrusted === true,
    modality: pointer === 'mouse' || pointer === 'touch' || pointer === 'pen' ? pointer
      : native.detail === 0 ? 'keyboard_or_assistive' : 'unknown' };
}

export function createDecisionProvenance(
  identity: Pick<DecisionProvenance, 'gameId' | 'dealerGameId' | 'roundId' | 'playerId' | 'decision'>,
  input?: DecisionInput,
): DecisionProvenance | undefined {
  try {
    const value: DecisionProvenance = { ...identity, ...(input ?? { source: 'unknown', activatedAt: Date.now() }),
      version: 1, requestId: crypto.randomUUID(), build: BUILD_META.commitSha };
    append({ ...value, recordedAt: Date.now(), outcome: 'handler_entered' });
    return value;
  } catch { return undefined; } // Diagnostics must never prevent an action.
}

function append(entry: RecordEntry) {
  records.push(entry);
  if (records.length > CAPACITY) records.splice(0, records.length - CAPACITY);
}

/** No network or storage operation runs on the click/request path. */
export function finishDecisionProvenance(value: DecisionProvenance | undefined, outcome: string, startedAt: number) {
  if (!value) return;
  try {
    append({ ...value, recordedAt: Date.now(), outcome: outcome.slice(0, 80), elapsedMs: Date.now() - startedAt });
    if (flushScheduled || typeof window === 'undefined') return;
    flushScheduled = true;
    const flush = () => {
      flushScheduled = false;
      try { window.localStorage.setItem(DECISION_PROVENANCE_STORAGE, JSON.stringify(records)); } catch { /* best effort */ }
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(flush);
    else window.setTimeout(flush, 0);
  } catch { /* best effort */ }
}

export function decisionProvenanceSnapshot() { return records.map(record => ({ ...record })); }

/** Per-request header: never mutate the shared client's headers. */
export async function withDecisionProvenance<T extends { data: unknown; error: unknown }>(
  request: PromiseLike<T> & { setHeader(name: string, value: string): unknown },
  value?: DecisionProvenance,
): Promise<T> {
  const startedAt = Date.now();
  if (value) {
    try { request.setHeader(DECISION_PROVENANCE_HEADER, DECISION_PROVENANCE_PREFIX + JSON.stringify(value)); } catch { /* retain ordinary request */ }
  }
  try {
    const response = await request;
    const data = response.data as { outcome?: string; deduped?: boolean } | null;
    finishDecisionProvenance(value, response.error ? 'server_rejected'
      : data?.deduped ? 'server_replayed' : data?.outcome ?? 'server_responded', startedAt);
    return response;
  } catch (error) {
    finishDecisionProvenance(value, 'transport_error', startedAt);
    throw error;
  }
}
