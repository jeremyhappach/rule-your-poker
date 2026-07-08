import { useSyncExternalStore } from 'react';

export type GinPhaseTraceKind =
  | 'trace-armed'
  | 'trace-exported'
  | 'tab-active-change'
  | 'tab-request'
  | 'tab-disabled-calculation'
  | 'pane-selected'
  | 'forced-tab-projection'
  | 'authoritative-state-update'
  | 'state-replacement'
  | 'ante-resolution'
  | 'deal-runtime-host'
  | 'deal-runtime-mount'
  | 'deal-runtime-unmount'
  | 'deal-runtime-reset'
  | 'deal-runtime-start'
  | 'deal-runtime-abort'
  | 'deal-runtime-complete'
  | 'deal-orchestrator-mount'
  | 'deal-orchestrator-unmount'
  | 'deal-orchestrator-start'
  | 'deal-orchestrator-skip'
  | 'card-transport-dispatch'
  | 'card-transport-settle'
  | 'card-projection';

export interface GinPhaseTraceIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  handContextId?: string | null;
  dealerPlayerId?: string | null;
  callerPlayerId?: string | null;
}

export interface GinPhaseTraceEvent {
  seq: number;
  tMs: number;
  wallIso: string;
  kind: GinPhaseTraceKind;
  summary: string;
  sourceFile: string;
  sourceFunction: string;
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 250;
const buffer: GinPhaseTraceEvent[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let armed = false;
let armedSessionKey: string | null = null;
let cachedSnapshot: { armed: boolean; events: GinPhaseTraceEvent[] } = { armed: false, events: [] };
let snapshotDirty = true;
let captureUntilMs: number | null = null;
const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function notify(): void {
  snapshotDirty = true;
  for (const l of listeners) {
    try { l(); } catch { /* UI observer only */ }
  }
}

function isCapturing(): boolean {
  if (!armed) return false;
  if (captureUntilMs == null) return true;
  return nowMs() <= captureUntilMs;
}

export function subscribeGinPhaseTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGinPhaseTraceSnapshot(): { armed: boolean; events: GinPhaseTraceEvent[] } {
  const capturing = isCapturing();
  if (snapshotDirty || cachedSnapshot.armed !== capturing) {
    cachedSnapshot = { armed: capturing, events: buffer.slice() };
    snapshotDirty = false;
  }
  return cachedSnapshot;
}

export function getGinPhaseTraceStatus(): {
  armedRaw: boolean;
  capturing: boolean;
  hasEvents: boolean;
  captureUntilMs: number | null;
  sessionKey: string | null;
  eventCount: number;
} {
  return {
    armedRaw: armed,
    capturing: isCapturing(),
    hasEvents: buffer.length > 0,
    captureUntilMs,
    sessionKey: armedSessionKey,
    eventCount: buffer.length,
  };
}

/** Store latest eligibility inputs so exports carry the exact predicate. */
let latestEligibility: Record<string, unknown> | null = null;
export function setGinPhaseTraceEligibility(inputs: Record<string, unknown>): void {
  latestEligibility = { ...inputs, evaluatedAtIso: new Date().toISOString() };
}
export function getGinPhaseTraceEligibility(): Record<string, unknown> | null {
  return latestEligibility;
}

export function armGinPhaseTrace(args: { sessionKey: string; identity?: GinPhaseTraceIdentity; detail?: Record<string, unknown> }): void {
  const reset = !armed || armedSessionKey !== args.sessionKey || !isCapturing();
  armed = true;
  armedSessionKey = args.sessionKey;
  captureUntilMs = null;
  if (reset) {
    buffer.length = 0;
    seq = 0;
  }
  recordGinPhaseTrace({
    kind: 'trace-armed',
    summary: 'GIN PHASE TRACE · ARMED',
    sourceFile: 'src/lib/ginPhaseTrace.tsx',
    sourceFunction: 'armGinPhaseTrace',
    identity: args.identity,
    detail: args.detail,
    force: true,
  });
}

export function markGinPhaseTraceAnteResolved(args: { identity?: GinPhaseTraceIdentity; detail?: Record<string, unknown> }): void {
  if (!armed) return;
  captureUntilMs = nowMs() + 30_000;
  recordGinPhaseTrace({
    kind: 'ante-resolution',
    summary: 'Ante resolved; capture closes 30s after this event',
    sourceFile: 'src/lib/ginPhaseTrace.tsx',
    sourceFunction: 'markGinPhaseTraceAnteResolved',
    identity: args.identity,
    detail: { captureUntilMs, ...(args.detail ?? {}) },
    force: true,
  });
}

export function recordGinPhaseTrace(args: {
  kind: GinPhaseTraceKind;
  summary: string;
  sourceFile: string;
  sourceFunction: string;
  identity?: GinPhaseTraceIdentity;
  detail?: Record<string, unknown>;
  force?: boolean;
}): void {
  if (!args.force && !isCapturing()) return;
  buffer.push({
    seq: ++seq,
    tMs: Math.round(nowMs() - t0),
    wallIso: new Date().toISOString(),
    kind: args.kind,
    summary: args.summary,
    sourceFile: args.sourceFile,
    sourceFunction: args.sourceFunction,
    identity: args.identity,
    detail: args.detail,
  });
  while (buffer.length > MAX_EVENTS) buffer.shift();
  notify();
}

const identityText = (i?: GinPhaseTraceIdentity): string => i
  ? `game=${i.gameId ?? '-'} | dealerGame=${i.dealerGameId ?? '-'} | round=${i.roundId ?? '-'} | hand=${i.handNumber ?? '-'} | hci=${i.handContextId ?? '-'} | dealer=${i.dealerPlayerId ?? '-'} | caller=${i.callerPlayerId ?? '-'}`
  : '-';

function findBoundary(name: 'tab' | 'forced' | 'visible' | 'duplicate'): GinPhaseTraceEvent | null {
  if (name === 'tab') {
    return buffer.find(e =>
      (e.kind === 'tab-request' && e.detail?.accepted === false) ||
      (e.kind === 'tab-disabled-calculation' && Object.values((e.detail?.disabledByTab ?? {}) as Record<string, unknown>).some(Boolean))
    ) ?? null;
  }
  if (name === 'forced') {
    return buffer.find(e => e.kind === 'forced-tab-projection' || (e.kind === 'tab-active-change' && e.detail?.cause !== 'user-request' && e.detail?.before !== e.detail?.after)) ?? null;
  }
  if (name === 'visible') {
    return buffer.find(e => e.kind === 'card-projection' && (e.detail?.boundary === 'all-cards-visible' || (e.detail?.projectionMode === 'full-authoritative' && e.detail?.renderedCount === e.detail?.authoritativeCount))) ?? null;
  }
  const starts = new Map<string, GinPhaseTraceEvent>();
  for (const e of buffer) {
    if (e.kind !== 'deal-runtime-start' && e.kind !== 'deal-orchestrator-start') continue;
    const key = e.identity?.handContextId ?? `${e.identity?.dealerGameId ?? '-'}|${e.identity?.roundId ?? '-'}|${e.identity?.handNumber ?? '-'}`;
    if (starts.has(key)) return e;
    starts.set(key, e);
  }
  return null;
}

function boundaryLine(label: string, e: GinPhaseTraceEvent | null): string[] {
  if (!e) return [`${label}: NO ROOT CAUSE PROVEN`, '  identity before/after: NO ROOT CAUSE PROVEN', '  classification: NO ROOT CAUSE PROVEN'];
  const classification = e.detail?.causeClass ?? e.detail?.cause ?? e.detail?.reason ?? e.detail?.boundaryCause ?? 'NO ROOT CAUSE PROVEN';
  return [
    `${label}: seq=${e.seq} ${e.sourceFile}:${e.sourceFunction}`,
    `  identity before/after: ${JSON.stringify({ before: e.detail?.beforeIdentity ?? null, after: e.detail?.afterIdentity ?? e.identity ?? null })}`,
    `  classification: ${String(classification)}`,
  ];
}

export function formatGinPhaseTraceText(): string {
  const lines = [
    '# Gin phase transition trace',
    `exportedAt=${new Date().toISOString()}`,
    `armed=${isCapturing()}`,
    `eventCount=${buffer.length}`,
    '',
    'seq | +ms | kind | source | identity | summary | detail',
  ];
  for (const e of buffer) {
    lines.push(`${e.seq} | +${e.tMs} | ${e.kind} | ${e.sourceFile}:${e.sourceFunction} | ${identityText(e.identity)} | ${e.summary} | ${e.detail ? JSON.stringify(e.detail) : '{}'}`);
  }
  lines.push('', '# Required boundary report');
  const boundaries = [
    findBoundary('tab'),
    findBoundary('forced'),
    findBoundary('visible'),
    findBoundary('duplicate'),
  ];
  lines.push(...boundaryLine('first tab-blocking boundary', boundaries[0]));
  lines.push(...boundaryLine('first forced-tab boundary', boundaries[1]));
  lines.push(...boundaryLine('first all-cards-visible boundary', boundaries[2]));
  lines.push(...boundaryLine('first duplicate-deal-start boundary', boundaries[3]));
  if (boundaries.some(b => !b)) lines.push('NO ROOT CAUSE PROVEN');
  return lines.join('\n');
}

export function exportGinPhaseTraceTxt(): void {
  recordGinPhaseTrace({
    kind: 'trace-exported',
    summary: 'Trace exported from UI pill',
    sourceFile: 'src/lib/ginPhaseTrace.tsx',
    sourceFunction: 'exportGinPhaseTraceTxt',
    force: true,
  });
  const blob = new Blob([formatGinPhaseTraceText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gin-phase-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function GinPhaseTracePill() {
  const snapshot = useSyncExternalStore(subscribeGinPhaseTrace, getGinPhaseTraceSnapshot, getGinPhaseTraceSnapshot);
  if (!snapshot.armed) return null;
  return (
    <button
      type="button"
      onClick={exportGinPhaseTraceTxt}
      className="fixed right-3 top-14 z-[120] rounded-md border border-poker-gold/70 bg-background/95 px-2.5 py-1 text-[11px] font-bold text-poker-gold shadow-lg"
      aria-label="Export Gin phase trace"
      data-gin-phase-trace-pill="armed"
    >
      GIN PHASE TRACE · ARMED
    </button>
  );
}
