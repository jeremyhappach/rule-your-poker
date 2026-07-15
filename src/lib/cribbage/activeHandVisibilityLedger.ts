/**
 * Cribbage Active-Hand Visibility Ledger — P0 wartime instrumentation.
 *
 * Purpose: diagnose the intermittent regression in which the local
 * player's active Cribbage hand disappears during live gameplay and
 * is restored by a refresh. Captures every transition along the
 * ownership chain that can hide, unmount, suppress, or replace the
 * active hand:
 *
 *   authoritative round state → current hand identity → presentation
 *   / view state → CribbageMobileGameTable mount gates → CribbageMobileCardsTab
 *   render gates → DealRuntime transport gate → phase gate →
 *   ActiveHandFan mount → final DOM child count on
 *   [data-crib-active-hand-stage].
 *
 * Contract:
 * - Read-only. Recording MUST NOT alter gameplay.
 * - Bounded ring buffer, hard max 1500 entries, FIFO eviction.
 * - Arm/disarm is user-controlled from the pill; when disarmed,
 *   producer calls are near-zero-cost (single flag check).
 * - Dedupe by (group,tag,key) via a running signature. Contradictions
 *   and critical lifecycle tags bypass dedupe but never bypass eviction.
 * - No console, no network, no localStorage of payloads. Only the
 *   armed flag is persisted so pill state survives reload.
 */

export type CribbageActiveHandGroup =
  | 'lifecycle'
  | 'parent-gate'
  | 'child-gate'
  | 'deal-transport'
  | 'resolver'
  | 'identity'
  | 'dom'
  | 'contradiction';

export interface CribbageActiveHandEntry {
  seq: number;
  t: number;
  group: CribbageActiveHandGroup;
  tag: string;
  producer: string;
  fn: string;
  key: string;
  payload: unknown;
}

const HARD_MAX = 1500;
const ARM_STORAGE_KEY = 'CRIBBAGE_ACTIVE_HAND_WARTIME_ARMED';

const CRITICAL_TAGS = new Set<string>([
  'cards_tab_unmounted',
  'cards_tab_mounted',
  'active_hand_dom_empty_but_authoritative_present',
  'render_source_changed',
  'active_tab_changed',
  'render_mode_changed',
  'interactions_allowed_changed',
  'deal_phase_changed',
  'resolver_decision_changed',
  'active_hand_blocked_changed',
  'hand_identity_changed',
]);

let armed = false;
let seq = 0;
const ring: CribbageActiveHandEntry[] = [];
const sigMap = new Map<string, string>();
const listeners = new Set<() => void>();
const groupCounts: Record<CribbageActiveHandGroup, number> = {
  lifecycle: 0,
  'parent-gate': 0,
  'child-gate': 0,
  'deal-transport': 0,
  resolver: 0,
  identity: 0,
  dom: 0,
  contradiction: 0,
};
const contradictionTagCounts = new Map<string, number>();

function readArmed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(ARM_STORAGE_KEY) === '1';
  } catch { return false; }
}
function writeArmed(next: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    if (next) window.localStorage.setItem(ARM_STORAGE_KEY, '1');
    else window.localStorage.removeItem(ARM_STORAGE_KEY);
  } catch { /* */ }
}
armed = readArmed();

function notify(): void {
  for (const l of listeners) { try { l(); } catch { /* */ } }
}

function stableSig(payload: unknown): string {
  try {
    if (payload == null) return 'null';
    if (typeof payload !== 'object') return String(payload);
    const seen = new WeakSet();
    return JSON.stringify(payload, (_k, v) => {
      if (v && typeof v === 'object') {
        if (seen.has(v as object)) return '[cycle]';
        seen.add(v as object);
        if (!Array.isArray(v)) {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            sorted[k] = (v as Record<string, unknown>)[k];
          }
          return sorted;
        }
      }
      if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
      return v;
    });
  } catch { return '[unserialisable]'; }
}

export interface RecordCribbageActiveHandOpts {
  producer: string;
  fn: string;
  key?: string;
  bypassDedupe?: boolean;
}

export function recordCribbageActiveHand(
  group: CribbageActiveHandGroup,
  tag: string,
  payload: unknown,
  opts: RecordCribbageActiveHandOpts,
): void {
  if (!armed) return;
  const dedupeKey = `${group}::${tag}::${opts.key ?? ''}`;
  const bypass =
    opts.bypassDedupe === true ||
    group === 'contradiction' ||
    CRITICAL_TAGS.has(tag);
  if (!bypass) {
    const sig = stableSig(payload);
    if (sigMap.get(dedupeKey) === sig) return;
    sigMap.set(dedupeKey, sig);
  }
  const entry: CribbageActiveHandEntry = {
    seq: ++seq,
    t: Date.now(),
    group,
    tag,
    producer: opts.producer,
    fn: opts.fn,
    key: opts.key ?? '',
    payload,
  };
  ring.push(entry);
  groupCounts[group] += 1;
  if (group === 'contradiction') {
    contradictionTagCounts.set(tag, (contradictionTagCounts.get(tag) ?? 0) + 1);
  }
  while (ring.length > HARD_MAX) {
    const dropped = ring.shift();
    if (dropped) groupCounts[dropped.group] = Math.max(0, groupCounts[dropped.group] - 1);
  }
  notify();
}

export function recordCribbageActiveHandContradiction(
  tag: string,
  payload: unknown,
  opts: RecordCribbageActiveHandOpts,
): void {
  recordCribbageActiveHand('contradiction', tag, payload, { ...opts, bypassDedupe: true });
}

export function isCribbageActiveHandArmed(): boolean { return armed; }
export function armCribbageActiveHand(next: boolean): void {
  if (armed === next) return;
  armed = next;
  writeArmed(next);
  notify();
}
export function clearCribbageActiveHand(): void {
  ring.length = 0;
  sigMap.clear();
  contradictionTagCounts.clear();
  for (const g of Object.keys(groupCounts) as CribbageActiveHandGroup[]) groupCounts[g] = 0;
  seq = 0;
  notify();
}
export function subscribeCribbageActiveHand(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getCribbageActiveHandCounts(): {
  total: number;
  perGroup: Record<CribbageActiveHandGroup, number>;
  contradictionsByTag: Array<[string, number]>;
} {
  return {
    total: ring.length,
    perGroup: { ...groupCounts },
    contradictionsByTag: Array.from(contradictionTagCounts.entries()).sort(),
  };
}
export function exportCribbageActiveHandText(): string {
  const counts = getCribbageActiveHandCounts();
  const lines: string[] = [];
  lines.push('# Cribbage Active-Hand Visibility Ledger');
  lines.push(`# exported: ${new Date().toISOString()}`);
  lines.push(`# armed: ${armed}`);
  lines.push(`# total-entries: ${counts.total} (hard-max ${HARD_MAX})`);
  lines.push('# group-counts:');
  for (const [g, n] of Object.entries(counts.perGroup)) lines.push(`#   ${g}: ${n}`);
  lines.push('# contradictions-by-tag:');
  if (counts.contradictionsByTag.length === 0) lines.push('#   (none)');
  else for (const [tag, n] of counts.contradictionsByTag) lines.push(`#   ${tag}: ${n}`);
  lines.push('# ---');
  for (const e of ring) {
    const ts = new Date(e.t).toISOString();
    lines.push(
      `${String(e.seq).padStart(6, '0')} ${ts} [${e.group}] ${e.tag} ` +
      `producer=${e.producer} fn=${e.fn} key=${e.key || '-'} payload=${stableSig(e.payload)}`,
    );
  }
  return lines.join('\n');
}
