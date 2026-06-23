/**
 * holmFullForensics — UNIFIED HOLM WARTIME FORENSICS BUFFER.
 *
 * One bounded append-only global ring buffer (10,000 records) that
 * aggregates every Holm-relevant forensic record from the existing
 * subsystems plus new prop-to-pixel timer derivations and Run-Back
 * lifecycle attributions. INSTRUMENTATION ONLY. No React state writes,
 * no behavior changing refs, no dependency changes, no timer changes,
 * no lifecycle changes, no transport changes, no CSS changes.
 *
 * Surfaces:
 *   window.__holmFullForensics = {
 *     records, identity, sessionStartedAt,
 *     count, dropped,
 *     build: () => string,
 *   }
 *
 * Producers:
 *   - holmSelfTimerForensics.recordHolmTimerEvent / Violation
 *   - holmHandBoundaryForensics.pushEvent / pushViolation
 *   - ActivePlayerHUD parent-derivation recorder
 *   - any future site calling recordHolmFull(...)
 *
 * Consumers:
 *   - HolmDealDbgPanel "FULL" button (text export + window dump)
 *
 * Every record carries:
 *   - monotonic sequence
 *   - performance.now()
 *   - ISO wall clock
 *   - category + event + source
 *   - canonical identity (sessionId, gameId, gameType, handContextId,
 *     handGeneration, dealerGameId) captured at record time
 *   - source category enum (where the value came from)
 *   - free-form payload (small JSON-safe object)
 *   - optional render commit id, instance id, parent component id
 *
 * No instrumentation in this file mutates app state.
 */

export type HolmFullCategory =
  | 'TIMER_EVENT'
  | 'TIMER_VIOLATION'
  | 'TIMER_PROP_DERIVATION'
  | 'HB_EVENT'
  | 'HB_VIOLATION'
  | 'HB_PRESENTATION'
  | 'RUNBACK_INTENT'
  | 'RUNTIME_WRITE'
  | 'TRANSPORT'
  | 'IDENTITY';

export type HolmFullSourceCategory =
  | 'SERVER_SNAPSHOT'
  | 'PARENT_DERIVATION'
  | 'RENDER_DERIVATION'
  | 'EFFECT'
  | 'LAYOUT_EFFECT'
  | 'RAF'
  | 'INTERVAL'
  | 'TIMEOUT'
  | 'STATE_SETTER'
  | 'REF_WRITE'
  | 'CSS_CLASS'
  | 'LIFECYCLE'
  | 'UNKNOWN';

export interface HolmFullIdentity {
  sessionId: string | null;
  gameId: string | null;
  gameType: string | null;
  handContextId: string | null;
  handGeneration: number | null;
  dealerGameId: string | null;
  selfPlayerId: string | null;
  activePlayerId: string | null;
}

export interface HolmFullRecord {
  seq: number;
  t: number;
  wall: string;
  category: HolmFullCategory;
  event: string;
  source: string;            // file:func / surface
  sourceCategory: HolmFullSourceCategory;
  callsite: string | null;
  instanceId: number | null;
  parentInstanceId: number | null;
  commitId: number | null;
  segmentId: string | null;
  identity: HolmFullIdentity;
  payload: Record<string, unknown>;
}

const RING = 10_000;
const records: HolmFullRecord[] = [];
let _seq = 0;
let _dropped = 0;
const _sessionStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

const _identity: HolmFullIdentity = {
  sessionId: null,
  gameId: null,
  gameType: null,
  handContextId: null,
  handGeneration: null,
  dealerGameId: null,
  selfPlayerId: null,
  activePlayerId: null,
};

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function setHolmFullIdentity(patch: Partial<HolmFullIdentity>): void {
  let changed = false;
  for (const k of Object.keys(patch) as (keyof HolmFullIdentity)[]) {
    const v = patch[k];
    if (v === undefined) continue;
    if (_identity[k] !== v) {
      (_identity as unknown as Record<string, unknown>)[k] = v as unknown;
      changed = true;
    }
  }
  if (changed) {
    pushRaw({
      category: 'IDENTITY',
      event: 'HOLM_FULL_IDENTITY_PATCH',
      source: 'holmFullForensics.setHolmFullIdentity',
      sourceCategory: 'STATE_SETTER',
      callsite: null,
      instanceId: null,
      parentInstanceId: null,
      commitId: null,
      segmentId: null,
      payload: { patch },
    });
  }
  publish();
}

export function getHolmFullIdentity(): HolmFullIdentity {
  return { ..._identity };
}

interface HolmFullInput {
  category: HolmFullCategory;
  event: string;
  source: string;
  sourceCategory?: HolmFullSourceCategory;
  callsite?: string | null;
  instanceId?: number | null;
  parentInstanceId?: number | null;
  commitId?: number | null;
  segmentId?: string | null;
  identityOverrides?: Partial<HolmFullIdentity>;
  payload?: Record<string, unknown>;
}

function pushRaw(input: HolmFullInput): void {
  const rec: HolmFullRecord = {
    seq: ++_seq,
    t: now(),
    wall: new Date().toISOString(),
    category: input.category,
    event: input.event,
    source: input.source,
    sourceCategory: input.sourceCategory ?? 'UNKNOWN',
    callsite: input.callsite ?? null,
    instanceId: input.instanceId ?? null,
    parentInstanceId: input.parentInstanceId ?? null,
    commitId: input.commitId ?? null,
    segmentId: input.segmentId ?? null,
    identity: input.identityOverrides ? { ..._identity, ...input.identityOverrides } : { ..._identity },
    payload: input.payload ?? {},
  };
  if (records.length >= RING) {
    records.shift();
    _dropped += 1;
  }
  records.push(rec);
}

export function recordHolmFull(input: HolmFullInput): void {
  try {
    pushRaw(input);
    publish();
  } catch { /* never throw from instrumentation */ }
}

export function getHolmFullRecords(): HolmFullRecord[] { return records; }
export function getHolmFullCount(): number { return records.length; }
export function getHolmFullDropped(): number { return _dropped; }

function publish(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __holmFullForensics?: Record<string, unknown> };
  if (!w.__holmFullForensics) w.__holmFullForensics = {};
  const d = w.__holmFullForensics;
  d.records = records;
  d.count = records.length;
  d.dropped = _dropped;
  d.identity = { ..._identity };
  d.sessionStartedAt = _sessionStartedAt;
  d.build = buildHolmFullForensicsText;
}

export function buildHolmFullForensicsText(): string {
  const lines: string[] = [];
  lines.push('=== HOLM FULL WARTIME FORENSICS (unified) ===');
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push(`sessionStartedAt(perf): ${_sessionStartedAt.toFixed(1)}`);
  lines.push(`records=${records.length} (cap ${RING}) dropped=${_dropped}`);
  lines.push(`identity=${JSON.stringify(_identity)}`);
  lines.push('');

  // Tally per category for fast triage.
  const byCat = new Map<string, number>();
  for (const r of records) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  lines.push('--- COUNT BY CATEGORY ---');
  for (const [k, v] of Array.from(byCat.entries()).sort()) lines.push(`${k}: ${v}`);
  lines.push('');

  // Violations only (timer + hand-boundary) for quick top-of-export read.
  const vios = records.filter((r) => r.category === 'TIMER_VIOLATION' || r.category === 'HB_VIOLATION');
  lines.push(`--- VIOLATIONS (${vios.length}) ---`);
  for (const r of vios) {
    lines.push(`#${r.seq} +${r.t.toFixed(1)} ${r.category} ${r.event} src=${r.source} seg=${r.segmentId} ${JSON.stringify(r.payload)}`);
  }
  lines.push('');

  // Two required end-of-export causal chains, mechanically extracted.
  lines.push('--- CHAIN A: SELF-TIMER (auth → parent → MPT → bootstrap → writers → first below-full → SVG) ---');
  const timerChain = records.filter((r) =>
    r.category === 'TIMER_EVENT' ||
    r.category === 'TIMER_VIOLATION' ||
    r.category === 'TIMER_PROP_DERIVATION'
  );
  for (const r of timerChain) {
    lines.push(`#${r.seq} +${r.t.toFixed(1)} ${r.event} seg=${r.segmentId} inst=${r.instanceId} commit=${r.commitId} src=${r.source} ${JSON.stringify(r.payload)}`);
  }
  lines.push('');

  lines.push('--- CHAIN B: RUN-BACK (intent → teardown → dealer-game → stale sources → new HCI → manifest → reset → beginDeal → beginWave → transport) ---');
  const rbChain = records.filter((r) =>
    r.category === 'RUNBACK_INTENT' ||
    r.category === 'HB_EVENT' ||
    r.category === 'HB_VIOLATION' ||
    r.category === 'HB_PRESENTATION' ||
    r.category === 'RUNTIME_WRITE' ||
    r.category === 'TRANSPORT'
  );
  for (const r of rbChain) {
    lines.push(`#${r.seq} +${r.t.toFixed(1)} ${r.event} src=${r.source} ${JSON.stringify(r.payload)}`);
  }
  lines.push('');

  lines.push('--- FULL CHRONOLOGICAL ---');
  for (const r of records) {
    lines.push(`#${r.seq} +${r.t.toFixed(1)} ${r.category}:${r.event} src=${r.source} sc=${r.sourceCategory} cs=${r.callsite ?? '-'} inst=${r.instanceId ?? '-'} par=${r.parentInstanceId ?? '-'} commit=${r.commitId ?? '-'} seg=${r.segmentId ?? '-'} id=${JSON.stringify(r.identity)} pl=${JSON.stringify(r.payload)}`);
  }
  return lines.join('\n');
}

// Eagerly publish so window.__holmFullForensics is reachable even
// before the first record lands.
publish();
