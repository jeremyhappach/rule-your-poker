/**
 * Yahtzee Wartime Truth ledger.
 *
 * Bounded, direct-producer instrumentation for Yahtzee-only defect diagnosis
 * (scorecard flash, scatter instability, held/scatter contradictions, roll
 * abort/reset). Read-only: emitting an event MUST NOT alter gameplay.
 *
 * Contract highlights:
 * - Single global ring, hard max 1200 entries, FIFO eviction (no exceptions).
 * - Dedupe by (group,tag,key) using a running signature; contradictions and
 *   critical lifecycle tags bypass dedupe but never bypass eviction.
 * - Every entry carries provenance: producer component + function + dedupe key
 *   + monotonic seq.
 * - Arm/disarm gates all emission and rAF sampling; when disarmed the module
 *   is a no-op.
 * - No console dependency. No auto-bridging of legacy logs.
 */

export type YahtzeeWartimeGroup =
  | 'lifecycle'
  | 'auth-dice'
  | 'presentation'
  | 'scatter'
  | 'transport'
  | 'scorecard'
  | 'active-pane'
  | 'writer'
  | 'contradiction';

export interface YahtzeeWartimeEntry {
  seq: number;
  t: number;
  group: YahtzeeWartimeGroup;
  tag: string;
  producer: string;
  fn: string;
  key: string;
  payload: unknown;
}

const HARD_MAX = 1200;
const ARM_STORAGE_KEY = 'YAHTZEE_WARTIME_ARMED';

const CRITICAL_LIFECYCLE_TAGS = new Set<string>([
  'turn_identity_changed',
  'phase_changed',
  'active_player_changed',
  'roll_number_changed',
  'dice_set_identity_changed',
  'turn_advance_observed',
]);

let armed = false;
let seqCounter = 0;
const ring: YahtzeeWartimeEntry[] = [];
const dedupeSignatures = new Map<string, string>();
const listeners = new Set<() => void>();

const groupCounts: Record<YahtzeeWartimeGroup, number> = {
  lifecycle: 0,
  'auth-dice': 0,
  presentation: 0,
  scatter: 0,
  transport: 0,
  scorecard: 0,
  'active-pane': 0,
  writer: 0,
  contradiction: 0,
};
const contradictionTagCounts = new Map<string, number>();

function safeReadStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(ARM_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function safeWriteStorage(next: boolean) {
  try {
    if (typeof window === 'undefined') return;
    if (next) window.localStorage.setItem(ARM_STORAGE_KEY, '1');
    else window.localStorage.removeItem(ARM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Initialise armed state from storage (module-eval time is safe here).
armed = safeReadStorage();

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

function stableSignature(payload: unknown): string {
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
  } catch {
    return '[unserialisable]';
  }
}

export interface RecordOptions {
  producer: string;
  fn: string;
  key?: string;
  /** When true, bypass dedupe (never eviction). Defaults to true for contradictions. */
  bypassDedupe?: boolean;
}

export function recordYahtzeeWartime(
  group: YahtzeeWartimeGroup,
  tag: string,
  payload: unknown,
  opts: RecordOptions,
): void {
  if (!armed) return;
  const dedupeKey = `${group}::${tag}::${opts.key ?? ''}`;
  const bypass =
    opts.bypassDedupe === true ||
    group === 'contradiction' ||
    CRITICAL_LIFECYCLE_TAGS.has(tag);

  if (!bypass) {
    const sig = stableSignature(payload);
    if (dedupeSignatures.get(dedupeKey) === sig) return;
    dedupeSignatures.set(dedupeKey, sig);
  }

  const entry: YahtzeeWartimeEntry = {
    seq: ++seqCounter,
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
    if (dropped) {
      groupCounts[dropped.group] = Math.max(0, groupCounts[dropped.group] - 1);
      // Contradiction tag counts are cumulative across the session; do NOT
      // decrement — the header must report every contradiction ever seen so
      // FIFO eviction can never hide an intermittent defect.
    }
  }
  notify();
}

export function recordYahtzeeContradiction(
  tag: string,
  payload: unknown,
  opts: RecordOptions,
): void {
  recordYahtzeeWartime('contradiction', tag, payload, { ...opts, bypassDedupe: true });
}

export function isYahtzeeWartimeArmed(): boolean {
  return armed;
}

export function armYahtzeeWartime(next: boolean): void {
  if (armed === next) return;
  armed = next;
  safeWriteStorage(next);
  if (!next) {
    // Do not clear the ledger on disarm — user may still want to export it.
  }
  notify();
}

export function clearYahtzeeWartime(): void {
  ring.length = 0;
  dedupeSignatures.clear();
  contradictionTagCounts.clear();
  for (const g of Object.keys(groupCounts) as YahtzeeWartimeGroup[]) {
    groupCounts[g] = 0;
  }
  seqCounter = 0;
  notify();
}

export function subscribeYahtzeeWartime(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getYahtzeeWartimeCounts(): {
  total: number;
  perGroup: Record<YahtzeeWartimeGroup, number>;
  contradictionsByTag: Array<[string, number]>;
} {
  return {
    total: ring.length,
    perGroup: { ...groupCounts },
    contradictionsByTag: Array.from(contradictionTagCounts.entries()).sort(),
  };
}

export function exportYahtzeeWartimeText(): string {
  const counts = getYahtzeeWartimeCounts();
  const lines: string[] = [];
  lines.push('# Yahtzee Wartime Truth Ledger');
  lines.push(`# exported: ${new Date().toISOString()}`);
  lines.push(`# armed: ${armed}`);
  lines.push(`# total-entries: ${counts.total} (hard-max ${HARD_MAX})`);
  lines.push('# group-counts:');
  for (const [g, n] of Object.entries(counts.perGroup)) {
    lines.push(`#   ${g}: ${n}`);
  }
  lines.push('# contradictions-by-tag:');
  if (counts.contradictionsByTag.length === 0) {
    lines.push('#   (none)');
  } else {
    for (const [tag, n] of counts.contradictionsByTag) {
      lines.push(`#   ${tag}: ${n}`);
    }
  }
  lines.push('# ---');
  for (const e of ring) {
    const ts = new Date(e.t).toISOString();
    const payloadStr = stableSignature(e.payload);
    lines.push(
      `${String(e.seq).padStart(6, '0')} ${ts} [${e.group}] ${e.tag} ` +
      `producer=${e.producer} fn=${e.fn} key=${e.key || '-'} payload=${payloadStr}`,
    );
  }
  return lines.join('\n');
}
