/**
 * CHIP TRANSPORT DBG — persistent audit trail for canonical chip
 * transport (Economy Wave 1). Tracks every intent through its full
 * lifecycle so visible failures (no flight, no destination reaction,
 * stuck chips) are diagnosable from a single copyable log.
 *
 * Per-intent fields:
 *   intentId, variant, from, to,
 *   fromEndpointFound, toEndpointFound,
 *   transportMounted, transportVisible,
 *   settled, droppedReason,
 *   destinationReaction, destinationReactionApplied,
 *   destinationReactionTargetFound.
 */

import type {
  ChipDestinationReaction,
  ChipEndpointRef,
} from './GameplaySlotContract';

export interface ChipTransportDbgRecord {
  intentId: string;
  ts: number;
  variant: string;
  reason: string;
  from: string;
  to: string;
  amount: number;
  fromEndpointFound?: boolean;
  toEndpointFound?: boolean;
  transportMounted?: boolean;
  transportVisible?: boolean;
  settled?: boolean;
  droppedReason?: string;
  destinationReaction?: ChipDestinationReaction | null;
  destinationReactionApplied?: boolean;
  destinationReactionTargetFound?: boolean;
}

const MAX = 40;
let records: ChipTransportDbgRecord[] = [];
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* */ } });
}

export function subscribeChipTransportDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getChipTransportDbg(): ChipTransportDbgRecord[] {
  return records;
}

export function clearChipTransportDbg(): void {
  records = [];
  emit();
}

function describe(ref: ChipEndpointRef): string {
  return ref.kind === 'pot' ? 'pot' : `seat#${ref.position}`;
}

export function chipTransportDbgUpsert(
  intentId: string,
  patch: Partial<ChipTransportDbgRecord> & { from?: ChipEndpointRef | string; to?: ChipEndpointRef | string },
): void {
  const idx = records.findIndex((r) => r.intentId === intentId);
  const fromStr = typeof patch.from === 'object' && patch.from && 'kind' in patch.from
    ? describe(patch.from as ChipEndpointRef)
    : (patch.from as string | undefined);
  const toStr = typeof patch.to === 'object' && patch.to && 'kind' in patch.to
    ? describe(patch.to as ChipEndpointRef)
    : (patch.to as string | undefined);
  const normalized: Partial<ChipTransportDbgRecord> = {
    ...patch,
    ...(fromStr !== undefined ? { from: fromStr } : {}),
    ...(toStr !== undefined ? { to: toStr } : {}),
  };

  if (idx === -1) {
    const base: ChipTransportDbgRecord = {
      intentId,
      ts: Date.now(),
      variant: normalized.variant ?? 'default',
      reason: normalized.reason ?? '?',
      from: (normalized.from as string) ?? '?',
      to: (normalized.to as string) ?? '?',
      amount: normalized.amount ?? 0,
      ...normalized,
    };
    const next = records.concat(base);
    records = next.length > MAX ? next.slice(next.length - MAX) : next;
  } else {
    const merged = { ...records[idx], ...normalized };
    records = [...records.slice(0, idx), merged, ...records.slice(idx + 1)];
  }
  emit();
}

export function formatChipTransportDbgAsText(): string {
  if (records.length === 0) return 'CHIP TRANSPORT DBG (empty)\n';
  const lines: string[] = ['CHIP TRANSPORT DBG'];
  for (const r of records) {
    const iso = new Date(r.ts).toISOString();
    lines.push(
      `${iso} ${r.intentId}`,
      `  variant=${r.variant} reason=${r.reason} amt=${r.amount}`,
      `  from=${r.from} to=${r.to}`,
      `  fromEndpointFound=${r.fromEndpointFound ?? '?'}`,
      `  toEndpointFound=${r.toEndpointFound ?? '?'}`,
      `  transportMounted=${r.transportMounted ?? '?'}`,
      `  transportVisible=${r.transportVisible ?? '?'}`,
      `  settled=${r.settled ?? '?'}`,
      `  droppedReason=${r.droppedReason ?? '∅'}`,
      `  destinationReaction=${r.destinationReaction ? JSON.stringify(r.destinationReaction) : '∅'}`,
      `  destinationReactionTargetFound=${r.destinationReactionTargetFound ?? '?'}`,
      `  destinationReactionApplied=${r.destinationReactionApplied ?? '?'}`,
    );
  }
  return lines.join('\n') + '\n';
}
