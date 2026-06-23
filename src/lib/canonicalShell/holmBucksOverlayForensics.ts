/**
 * holmBucksOverlayForensics — READ-ONLY forensic recorder for the
 * "BUCK'S ON YOU" overlay path. No state writes, no behavior change.
 *
 * Exposes:
 *   - recordBucksForensic(action, payload)
 *   - getBucksForensics() → snapshot
 *   - buildBucksForensicsText() → human-readable dump
 *   - window.__holmBucksForensics (live array + helpers)
 *
 * Actions vocabulary (do not mutate string casing — readers grep for them):
 *   OVERLAY_RENDERED, OVERLAY_MOUNTED, OVERLAY_UNMOUNTED,
 *   SHOW_REQUESTED, SHOW_GRANTED, SHOW_SUPPRESSED,
 *   DISMISSED, LATCH_SET, LATCH_CLEARED,
 *   EVENT_RESOLVED, EVENT_MISSING, EFFECT_EVAL,
 *   VIOLATION
 */

export type BucksForensicAction =
  | 'OVERLAY_RENDERED'
  | 'OVERLAY_MOUNTED'
  | 'OVERLAY_UNMOUNTED'
  | 'SHOW_REQUESTED'
  | 'SHOW_GRANTED'
  | 'SHOW_SUPPRESSED'
  | 'DISMISSED'
  | 'LATCH_SET'
  | 'LATCH_CLEARED'
  | 'EVENT_RESOLVED'
  | 'EVENT_MISSING'
  | 'EFFECT_EVAL'
  | 'VIOLATION'
  | 'SERVER_BUCK_TRANSFER_RECEIVED'
  | 'BUCKS_GATE_ARMED'
  | 'BUCKS_OVERLAY_SHOWN'
  | 'BUCKS_GATE_RELEASED';

export type BucksViolationCode =
  | 'HOLM_BUCKS_OVERLAY_SHOWN_WITHOUT_EVENT'
  | 'HOLM_BUCKS_OVERLAY_EVENT_HCI_MISMATCH'
  | 'HOLM_BUCKS_OVERLAY_EVENT_SOURCE_NOT_SERVER'
  | 'HOLM_BUCKS_OVERLAY_RENDERED_BY_NONCANONICAL_OWNER'
  | 'HOLM_BUCKS_OVERLAY_SHOWN_FROM_GENERIC_ANNOUNCEMENT'
  | 'HOLM_BUCKS_OVERLAY_LATCH_REARMED_WITHOUT_NEW_EVENT'
  | 'HOLM_BUCKS_OVERLAY_EVENT_ID_REUSED_ACROSS_HANDS'
  | 'HOLM_BUCKS_OVERLAY_SHOWN_MORE_THAN_ONCE_FOR_EVENT'
  | 'HOLM_BUCKS_OVERLAY_SHOWN_ON_HAND_WITH_NO_BUCK_EVENT';

export interface BucksForensicRecord {
  seq: number;
  ts: number;
  wall: string;
  action: BucksForensicAction;
  payload: Record<string, unknown>;
  stack?: string;
}

const MAX = 4000;
const _records: BucksForensicRecord[] = [];
const _violations: BucksForensicRecord[] = [];
let _seq = 0;

// Cross-record correlation state — pure observation, never read by app code.
let _lastShownEventId: string | null = null;
let _lastShownHci: string | null = null;
let _lastShownAtMs: number | null = null;
const _eventIdToHci = new Map<string, string>();
const _firedCountByEventId = new Map<string, number>();
const _firedHciSet = new Set<string>();

function captureStack(): string {
  try {
    const e = new Error('bucks-forensic-stack');
    const lines = (e.stack ?? '').split('\n').slice(2, 10);
    return lines.map((l) => l.trim()).join(' | ');
  } catch {
    return '';
  }
}

export function recordBucksForensic(
  action: BucksForensicAction,
  payload: Record<string, unknown> = {},
): void {
  const rec: BucksForensicRecord = {
    seq: ++_seq,
    ts: Date.now(),
    wall: new Date().toISOString(),
    action,
    payload,
    stack: captureStack(),
  };
  if (_records.length >= MAX) _records.splice(0, _records.length - MAX + 1);
  _records.push(rec);
  if (action === 'VIOLATION') _violations.push(rec);
}

export function recordBucksViolation(
  code: BucksViolationCode,
  payload: Record<string, unknown> = {},
): void {
  recordBucksForensic('VIOLATION', { code, ...payload });
}

/**
 * Correlation helper invoked from SHOW_REQUESTED / SHOW_GRANTED sites.
 * Returns derived violation flags WITHOUT mutating any app state.
 */
export function evaluateBucksShowRequest(args: {
  currentHandContextId: string | null;
  authoritativeEventId: string | null;
  authoritativeEventHci: string | null;
  eventSource: string;
  ownerFile: string;
  ownerComponent: string;
}): { violations: BucksViolationCode[]; eventIdReused: boolean; duplicate: boolean } {
  const {
    currentHandContextId,
    authoritativeEventId,
    authoritativeEventHci,
    eventSource,
    ownerFile,
    ownerComponent,
  } = args;
  const violations: BucksViolationCode[] = [];
  if (!authoritativeEventId) {
    violations.push('HOLM_BUCKS_OVERLAY_SHOWN_WITHOUT_EVENT');
  }
  if (authoritativeEventId && authoritativeEventHci !== currentHandContextId) {
    violations.push('HOLM_BUCKS_OVERLAY_EVENT_HCI_MISMATCH');
  }
  if (authoritativeEventId && eventSource !== 'SERVER') {
    violations.push('HOLM_BUCKS_OVERLAY_EVENT_SOURCE_NOT_SERVER');
  }
  if (ownerFile !== 'src/components/MobileGameTable.tsx' || ownerComponent !== 'MobileGameTable') {
    violations.push('HOLM_BUCKS_OVERLAY_RENDERED_BY_NONCANONICAL_OWNER');
  }
  let eventIdReused = false;
  if (authoritativeEventId) {
    const priorHci = _eventIdToHci.get(authoritativeEventId);
    if (priorHci && priorHci !== currentHandContextId) {
      eventIdReused = true;
      violations.push('HOLM_BUCKS_OVERLAY_EVENT_ID_REUSED_ACROSS_HANDS');
    }
    _eventIdToHci.set(authoritativeEventId, currentHandContextId ?? '');
  }
  const fired = authoritativeEventId ? (_firedCountByEventId.get(authoritativeEventId) ?? 0) : 0;
  let duplicate = false;
  if (fired > 0) {
    duplicate = true;
    violations.push('HOLM_BUCKS_OVERLAY_SHOWN_MORE_THAN_ONCE_FOR_EVENT');
  }
  return { violations, eventIdReused, duplicate };
}

export function notifyBucksShowGranted(args: {
  currentHandContextId: string | null;
  authoritativeEventId: string | null;
}): void {
  const { currentHandContextId, authoritativeEventId } = args;
  if (authoritativeEventId) {
    _firedCountByEventId.set(
      authoritativeEventId,
      (_firedCountByEventId.get(authoritativeEventId) ?? 0) + 1,
    );
  }
  if (currentHandContextId) _firedHciSet.add(currentHandContextId);
  _lastShownEventId = authoritativeEventId;
  _lastShownHci = currentHandContextId;
  _lastShownAtMs = Date.now();
}

export function getBucksLastShown() {
  return {
    lastShownEventId: _lastShownEventId,
    lastShownHci: _lastShownHci,
    lastShownAtMs: _lastShownAtMs,
    firedHciCount: _firedHciSet.size,
    firedHcis: Array.from(_firedHciSet),
    firedEventIds: Array.from(_firedCountByEventId.entries()),
  };
}

export function getBucksForensics() {
  return {
    records: _records.slice(),
    violations: _violations.slice(),
    lastShown: getBucksLastShown(),
    totalRecords: _records.length,
    totalViolations: _violations.length,
  };
}

export function buildBucksForensicsText(): string {
  const snap = getBucksForensics();
  const header = [
    '# HOLM BUCKS OVERLAY FORENSICS',
    `generatedAt=${new Date().toISOString()}`,
    `totalRecords=${snap.totalRecords} totalViolations=${snap.totalViolations}`,
    `lastShown=${JSON.stringify(snap.lastShown)}`,
    '',
    '## VIOLATIONS',
    JSON.stringify(snap.violations, null, 2),
    '',
    '## RECORDS',
  ].join('\n');
  const body = snap.records
    .map((r) => {
      let pl = '';
      try { pl = JSON.stringify(r.payload); } catch { pl = '[unserializable]'; }
      return `${String(r.seq).padStart(5, '0')} ${r.wall} ${r.action} ${pl}${r.stack ? ` :: ${r.stack}` : ''}`;
    })
    .join('\n');
  return `${header}\n${body}`;
}

if (typeof window !== 'undefined') {
  try {
    (window as unknown as { __holmBucksForensics?: unknown }).__holmBucksForensics = {
      get records() { return _records.slice(); },
      get violations() { return _violations.slice(); },
      get lastShown() { return getBucksLastShown(); },
      snapshot: getBucksForensics,
      text: buildBucksForensicsText,
    };
  } catch { /* noop */ }
}
