/**
 * Cribbage Label Wartime Ledger
 * ─────────────────────────────
 * Read-only, in-memory ring buffer for instrumentation of:
 *   - The crib-owner felt-label render decision + post-commit DOM state
 *     (owned by CribbageAnchoredCribCutMount).
 *   - The discard-to-crib transport destination + source resolution
 *     (owned by CribbageDiscardToCribAnimation).
 *
 * No production behavior is derived from this ledger. It exists purely
 * so a small in-app pill can display the last N events and export them
 * as plain text for published-runtime bug reports.
 */

export interface CribLabelWartimeEvent {
  seq: number;
  ts: number;
  kind: string;
  payload: Record<string, unknown>;
}

const CAPACITY = 400;
const buffer: CribLabelWartimeEvent[] = [];
let seqCounter = 0;
const subscribers = new Set<() => void>();

// Signature-based dedupe so a stable render decision does not spam the
// ring buffer with identical events every frame.
const lastSigByKind = new Map<string, string>();

function notify() {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      /* subscriber errors must never break gameplay */
    }
  });
}

export function emitCribLabelWartimeEvent(
  kind: string,
  payload: Record<string, unknown>,
  options?: { signature?: string },
): void {
  if (options?.signature !== undefined) {
    const key = `${kind}::${options.signature}`;
    if (lastSigByKind.get(kind) === key) return;
    lastSigByKind.set(kind, key);
  }
  seqCounter += 1;
  buffer.push({ seq: seqCounter, ts: Date.now(), kind, payload });
  if (buffer.length > CAPACITY) buffer.splice(0, buffer.length - CAPACITY);
  notify();
}

export function getCribLabelWartimeEvents(): CribLabelWartimeEvent[] {
  return buffer.slice();
}

export function clearCribLabelWartimeEvents(): void {
  buffer.length = 0;
  lastSigByKind.clear();
  notify();
}

export function subscribeCribLabelWartime(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function exportCribLabelWartimeAsText(): string {
  const lines: string[] = [];
  lines.push(`# Cribbage Label + Discard-Transport Wartime Trace`);
  lines.push(`# exported=${new Date().toISOString()} count=${buffer.length}`);
  for (const ev of buffer) {
    lines.push(
      `[${ev.seq}] ${new Date(ev.ts).toISOString()} ${ev.kind} ${JSON.stringify(
        ev.payload,
      )}`,
    );
  }
  return lines.join('\n');
}
