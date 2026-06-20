/**
 * DEST REACTION DBG — per-intent destination-reaction audit for the
 * "settled=true, destinationReactionApplied=true, but no visible bounce"
 * failure mode (Economy Wave 1).
 *
 * Captures, for each reaction attach:
 *   intentId, to, destinationReaction
 *   destinationReactionTargetFound, targetSelector
 *   targetElement: { tagName, className, dataChipCenter, rect,
 *     visibility, display, opacity, parentTagName, parentDataAttrs }
 *   reactionMounted (animation property assigned),
 *   reactionStarted (animationstart fired),
 *   reactionFinished (animationend fired),
 *   computedAnimationName, computedAnimationDuration,
 *   computedTransformBefore, computedTransformDuring,
 *   computedTransformAfter,
 *   overriddenDuringReaction (transform changed mid-animation by
 *     another writer).
 */

import type { ChipDestinationReaction, ChipEndpointRef } from './GameplaySlotContract';

export interface DestReactionDbgRecord {
  ts: number;
  intentId: string;
  to: string;
  destinationReaction: ChipDestinationReaction | null;
  targetSelector?: string;
  destinationReactionTargetFound?: boolean;
  targetElement?: {
    tagName: string;
    className: string;
    dataChipCenter: string | null;
    rect: { x: number; y: number; w: number; h: number } | null;
    visibility: string;
    display: string;
    opacity: string;
    parentTagName?: string;
    parentDataAttrs?: string;
  };
  reactionMounted?: boolean;
  reactionStarted?: boolean;
  reactionFinished?: boolean;
  computedAnimationName?: string;
  computedAnimationDuration?: string;
  computedTransformBefore?: string;
  computedTransformDuring?: string;
  computedTransformAfter?: string;
  overriddenDuringReaction?: boolean;
  note?: string;
}

const MAX = 40;
let records: DestReactionDbgRecord[] = [];
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => { try { l(); } catch { /* */ } }); };

export function subscribeDestReactionDbg(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getDestReactionDbg(): DestReactionDbgRecord[] { return records; }
export function clearDestReactionDbg(): void { records = []; emit(); }

function describe(ref: ChipEndpointRef | string | undefined): string {
  if (!ref) return '?';
  if (typeof ref === 'string') return ref;
  return ref.kind === 'pot' ? 'pot' : `seat#${ref.position}`;
}

export type DestReactionDbgPatch = Omit<Partial<DestReactionDbgRecord>, 'to'> & {
  to?: ChipEndpointRef | string;
};

export function destReactionDbgUpsert(
  intentId: string,
  patch: DestReactionDbgPatch,
): void {
  const idx = records.findIndex((r) => r.intentId === intentId);
  const toStr = patch.to !== undefined ? describe(patch.to) : undefined;
  const normalized: Partial<DestReactionDbgRecord> = {
    ...(patch as Omit<DestReactionDbgPatch, 'to'>),
    ...(toStr !== undefined ? { to: toStr } : {}),
  };

  if (idx === -1) {
    const base: DestReactionDbgRecord = {
      ts: Date.now(),
      intentId,
      to: normalized.to ?? '?',
      destinationReaction: normalized.destinationReaction ?? null,
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

export function snapshotTargetElement(
  el: HTMLElement,
): NonNullable<DestReactionDbgRecord['targetElement']> {
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  try {
    const r = el.getBoundingClientRect();
    rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  } catch { /* */ }
  let visibility = '?'; let display = '?'; let opacity = '?';
  try {
    const cs = window.getComputedStyle(el);
    visibility = cs.visibility;
    display = cs.display;
    opacity = cs.opacity;
  } catch { /* */ }
  const parent = el.parentElement;
  let parentDataAttrs = '';
  if (parent) {
    try {
      parentDataAttrs = Array.from(parent.attributes)
        .filter((a) => a.name.startsWith('data-'))
        .map((a) => `${a.name}=${a.value}`)
        .join(' ');
    } catch { /* */ }
  }
  return {
    tagName: el.tagName,
    className: typeof el.className === 'string' ? el.className : String((el as unknown as { className?: { baseVal?: string } }).className?.baseVal ?? ''),
    dataChipCenter: el.getAttribute('data-chip-center'),
    rect,
    visibility,
    display,
    opacity,
    parentTagName: parent?.tagName,
    parentDataAttrs,
  };
}

export function formatDestReactionDbgAsText(): string {
  if (records.length === 0) return 'DEST REACTION DBG (empty)\n';
  const lines: string[] = ['DEST REACTION DBG'];
  for (const r of records) {
    lines.push(
      `${new Date(r.ts).toISOString()} ${r.intentId}`,
      `  to=${r.to} reaction=${r.destinationReaction ? JSON.stringify(r.destinationReaction) : '∅'}`,
      `  selector=${r.targetSelector ?? '?'} targetFound=${r.destinationReactionTargetFound ?? '?'}`,
      `  mounted=${r.reactionMounted ?? '?'} started=${r.reactionStarted ?? '?'} finished=${r.reactionFinished ?? '?'}`,
      `  animName=${r.computedAnimationName ?? '?'} dur=${r.computedAnimationDuration ?? '?'}`,
      `  transformBefore=${r.computedTransformBefore ?? '?'}`,
      `  transformDuring=${r.computedTransformDuring ?? '?'}`,
      `  transformAfter=${r.computedTransformAfter ?? '?'}`,
      `  overriddenDuringReaction=${r.overriddenDuringReaction ?? '?'}`,
    );
    if (r.targetElement) {
      const t = r.targetElement;
      lines.push(
        `  el=${t.tagName}.${t.className.slice(0, 60)} dcc=${t.dataChipCenter ?? '∅'}`,
        `  rect=${t.rect ? `${t.rect.x},${t.rect.y} ${t.rect.w}x${t.rect.h}` : '∅'}`,
        `  vis=${t.visibility} disp=${t.display} op=${t.opacity}`,
        `  parent=${t.parentTagName ?? '∅'} [${t.parentDataAttrs ?? ''}]`,
      );
    }
    if (r.note) lines.push(`  note=${r.note}`);
  }
  return lines.join('\n') + '\n';
}
