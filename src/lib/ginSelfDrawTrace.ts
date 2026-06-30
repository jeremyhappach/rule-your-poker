/**
 * GIN SELF-DRAW TRACE — passive, instrumentation-only.
 *
 * Single-question harness for diagnosing the self-draw card-identity gap:
 * "stock self-draw choppy; discard self-draw may not appear in the active
 * pane until the NEXT draw flushes it."
 *
 * Ring buffer (200), zero console output, no DOM observation, no timers.
 * Consumers call `recordGinSelfDrawEvent` at the documented sites; the
 * pill renders the buffer.
 */

export type GinSelfDrawEventKind =
  | 'SELF_DRAW_ACTION_STARTED'
  | 'SELF_DRAW_OPTIMISTIC_STATE'
  | 'SELF_DRAW_AUTHORITATIVE_STATE'
  | 'SELF_DRAW_TRANSPORT_INTENT'
  | 'SELF_DRAW_TRANSPORT_SETTLED'
  | 'SELF_DRAW_RENDERED_HAND'
  | 'SELF_DRAW_DISPLAY_DIFF';

export interface GinSelfDrawEvent {
  seq: number;
  tMs: number;
  drawTraceId: string | null;
  kind: GinSelfDrawEventKind;
  detail: Record<string, unknown>;
}

const MAX = 200;
const buffer: GinSelfDrawEvent[] = [];
const listeners = new Set<() => void>();
let snapshot: GinSelfDrawEvent[] = [];
let seq = 0;
const t0 = typeof performance !== 'undefined' && performance.now
  ? performance.now()
  : Date.now();

// ── correlation id ──────────────────────────────────────────────
let currentDrawTraceId: string | null = null;
let drawCounter = 0;

export function beginGinSelfDrawTrace(source: 'stock' | 'discard'): string {
  drawCounter += 1;
  currentDrawTraceId = `gsd-${source}-${Date.now().toString(36)}-${drawCounter}`;
  return currentDrawTraceId;
}

export function getCurrentGinSelfDrawTraceId(): string | null {
  return currentDrawTraceId;
}

export function clearCurrentGinSelfDrawTraceId(): void {
  currentDrawTraceId = null;
}

// ── recording ───────────────────────────────────────────────────
function notify() {
  snapshot = buffer.slice();
  for (const l of listeners) { try { l(); } catch { /* */ } }
}

export function recordGinSelfDrawEvent(
  kind: GinSelfDrawEventKind,
  detail: Record<string, unknown>,
  drawTraceIdOverride?: string | null,
): void {
  const now = typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
  buffer.push({
    seq: ++seq,
    tMs: Math.round(now - t0),
    drawTraceId: drawTraceIdOverride ?? currentDrawTraceId,
    kind,
    detail,
  });
  while (buffer.length > MAX) buffer.shift();
  notify();
}

export function getGinSelfDrawTrace(): GinSelfDrawEvent[] {
  return snapshot;
}

export function subscribeGinSelfDrawTrace(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearGinSelfDrawTrace(): void {
  buffer.length = 0;
  notify();
}

export function formatGinSelfDrawTraceAsText(events: GinSelfDrawEvent[] = snapshot): string {
  const lines = [`# Gin self-draw trace (${events.length} events)`];
  for (const e of events) {
    lines.push(
      `+${e.tMs}ms  #${e.seq}  [${e.drawTraceId ?? '—'}]  ${e.kind}  ${JSON.stringify(e.detail)}`,
    );
  }
  return lines.join('\n');
}

// ── card-id helper ──────────────────────────────────────────────
export function cardId(c: { rank: string; suit: string } | null | undefined): string | null {
  if (!c) return null;
  return `${c.rank}${c.suit}`;
}

export function cardIds(hand: Array<{ rank: string; suit: string }> | null | undefined): string[] {
  if (!hand) return [];
  return hand.map(c => `${c.rank}${c.suit}`);
}

export function diffIds(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const ps = new Set(prev);
  const ns = new Set(next);
  return {
    added: next.filter(x => !ps.has(x)),
    removed: prev.filter(x => !ns.has(x)),
  };
}
