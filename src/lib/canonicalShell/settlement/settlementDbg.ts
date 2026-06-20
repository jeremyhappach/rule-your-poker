/**
 * SETTLEMENT DBG — persistent audit trail for the canonical settlement
 * phase machine. Ring buffer + subscribe/format helpers consumed by
 * <SettlementDbgPanel/>.
 *
 * Event kinds:
 *   - 'submit'         — game submitted a SettlementIntent (or, in W1,
 *                        shadow-recorded one).
 *   - 'phase'          — provider transitioned phase.
 *   - 'flag'           — economySettled / celebrationComplete flipped.
 *   - 'shadow'         — Wave 1 shadow-mode record from a game that has
 *                        not yet cut over to submit(); intent is logged
 *                        for inspection but does not drive runtime.
 */

import type { SettlementIntent, SettlementPhase } from './types';

const MAX = 40;
let seq = 0;

export type SettlementDbgKind = 'submit' | 'phase' | 'flag' | 'shadow';

export interface SettlementDbgEntry {
  seq: number;
  ts: number;
  kind: SettlementDbgKind;
  caller: string;
  // submit / shadow:
  intent?: SettlementIntent;
  // phase:
  fromPhase?: SettlementPhase;
  toPhase?: SettlementPhase;
  // flag:
  flag?: 'economySettled' | 'celebrationComplete';
  value?: boolean;
  note?: string;
}

let entries: SettlementDbgEntry[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* */ } });
}

export function subscribeSettlementDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getSettlementDbgEntries(): SettlementDbgEntry[] {
  return entries;
}

export function recordSettlementDbg(
  e: Omit<SettlementDbgEntry, 'seq' | 'ts'>,
): void {
  const next = entries.concat({ ...e, seq: ++seq, ts: Date.now() });
  entries = next.length > MAX ? next.slice(next.length - MAX) : next;
  emit();
}

export function clearSettlementDbg(): void {
  entries = [];
  emit();
}

/**
 * Wave 1 shadow-mode helper. Games that have not yet cut over to the
 * live SettlementProvider.submit() pipeline call this to record the
 * intent they WOULD have submitted, so its shape and timing are
 * inspectable in the SETTLEMENT DBG pill before Wave 2 makes the cut.
 */
export function recordSettlementIntent(args: {
  caller: string;
  intent: SettlementIntent;
  note?: string;
}): void {
  recordSettlementDbg({
    kind: 'shadow',
    caller: args.caller,
    intent: args.intent,
    note: args.note,
  });
}

function fmtEndpoint(e: { kind: string; position?: number }): string {
  if (e.kind === 'seat') return `seat#${e.position}`;
  return e.kind;
}

export function formatSettlementDbgAsText(): string {
  if (entries.length === 0) return 'SETTLEMENT DBG (empty)\n';
  const lines: string[] = ['SETTLEMENT DBG'];
  for (const e of entries) {
    const iso = new Date(e.ts).toISOString();
    if (e.kind === 'phase') {
      lines.push(`${iso} [PHASE] ${e.fromPhase ?? '?'} → ${e.toPhase ?? '?'} (${e.caller})`);
    } else if (e.kind === 'flag') {
      lines.push(`${iso} [FLAG ] ${e.flag}=${e.value} (${e.caller})`);
    } else {
      const i = e.intent!;
      lines.push(
        `${iso} [${e.kind.toUpperCase()}] caller=${e.caller} game=${i.gameId.slice(0, 8)} hand=${i.handNumber}`,
        `  prelude=${i.prelude?.type ?? '∅'}`,
        ...i.transfers.map((t, idx) =>
          `  transfer[${idx}] ${fmtEndpoint(t.from)}→${fmtEndpoint(t.to)} amt=${t.amount} variant=${t.variant ?? 'default'} reaction=${JSON.stringify(t.destinationReaction ?? {})}`,
        ),
        `  celebration winners=${i.celebration.winners.length} ann="${i.celebration.announcement}" confetti=${!!i.celebration.confetti} spotlight=${!!i.celebration.spotlight} minMs=${i.celebration.minDurationMs ?? '∅'}`,
        e.note ? `  note=${e.note}` : '',
      );
    }
  }
  return lines.filter(Boolean).join('\n') + '\n';
}
