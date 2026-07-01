/**
 * 3-5-7 self-card deal landing trace.
 *
 * Trace-only recorder for the active-hand transport landing invariant:
 * visible self-card transports must not launch from provisional geometry.
 * This module does not gate, delay, or resize anything — it only records
 * timestamps, rects, fallback usage, and owning render keys into a
 * copyable on-screen diagnostic stream.
 */

export interface LandingTraceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ThreeFiveSevenDealLandingTraceEntry {
  cardId: string;
  intentId?: string | null;
  handContextId?: string | null;
  handIdentity?: string | null;
  roundIdentity?: string | null;
  recipientPlayerId?: string | null;
  transportLaunchTimestamp?: number | null;
  finalLayoutPublishedTimestamp?: number | null;
  anchorRectAtLaunch?: LandingTraceRect | null;
  flyingCardDestinationRectAtLaunch?: LandingTraceRect | null;
  renderedCardRectOnFirstSettledFrame?: LandingTraceRect | null;
  firstPostSettleResizeRect?: LandingTraceRect | null;
  fallbackUsed?: boolean | null;
  activeHandFanRenderKey?: string | null;
  transportAnchorRenderKey?: string | null;
  flyingCardRenderKey?: string | null;
  renderedActiveCardRenderKey?: string | null;
  publishedCardRect?: { cardWidthPx: number; cardHeightPx: number } | null;
  updatedAt: number;
}

type TracePatch = Partial<Omit<ThreeFiveSevenDealLandingTraceEntry, 'cardId' | 'updatedAt'>>;

const MAX = 80;
const entries = new Map<string, ThreeFiveSevenDealLandingTraceEntry>();
const order: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
}

export function rectFromDomRect(r: DOMRect | ClientRect): LandingTraceRect {
  return {
    x: +r.x.toFixed(2),
    y: +r.y.toFixed(2),
    w: +r.width.toFixed(2),
    h: +r.height.toFixed(2),
  };
}

export function record357DealLandingTrace(cardId: string, patch: TracePatch): void {
  if (!cardId) return;
  const prev = entries.get(cardId);
  if (!prev) {
    order.push(cardId);
    while (order.length > MAX) {
      const oldest = order.shift();
      if (oldest) entries.delete(oldest);
    }
  }
  entries.set(cardId, {
    cardId,
    ...(prev ?? {}),
    ...patch,
    updatedAt: Date.now(),
  });
  emit();
}

export function subscribe357DealLandingTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function get357DealLandingTrace(): ThreeFiveSevenDealLandingTraceEntry[] {
  return order.map((id) => entries.get(id)).filter(Boolean) as ThreeFiveSevenDealLandingTraceEntry[];
}

export function clear357DealLandingTrace(): void {
  entries.clear();
  order.length = 0;
  emit();
}

export function format357DealLandingTrace(): string {
  const rows = get357DealLandingTrace();
  if (!rows.length) return '357 DEAL LANDING TRACE (empty)\n';
  const lines = ['357 DEAL LANDING TRACE'];
  for (const r of rows) {
    lines.push(
      `${new Date(r.updatedAt).toISOString()} ${r.cardId}`,
      `  handContextId=${r.handContextId ?? '∅'} hand=${r.handIdentity ?? '∅'} round=${r.roundIdentity ?? '∅'} recipient=${r.recipientPlayerId ?? '∅'}`,
      `  intentId=${r.intentId ?? '∅'}`,
      `  transportLaunchTimestamp=${r.transportLaunchTimestamp ?? '∅'}`,
      `  finalLayoutPublishedTimestamp=${r.finalLayoutPublishedTimestamp ?? '∅'}`,
      `  anchorRectAtLaunch=${JSON.stringify(r.anchorRectAtLaunch ?? null)}`,
      `  flyingCardDestinationRectAtLaunch=${JSON.stringify(r.flyingCardDestinationRectAtLaunch ?? null)}`,
      `  renderedCardRectOnFirstSettledFrame=${JSON.stringify(r.renderedCardRectOnFirstSettledFrame ?? null)}`,
      `  firstPostSettleResizeRect=${JSON.stringify(r.firstPostSettleResizeRect ?? null)}`,
      `  fallbackUsed=${r.fallbackUsed ?? '∅'}`,
      `  activeHandFanRenderKey=${r.activeHandFanRenderKey ?? '∅'}`,
      `  transportAnchorRenderKey=${r.transportAnchorRenderKey ?? '∅'}`,
      `  flyingCardRenderKey=${r.flyingCardRenderKey ?? '∅'}`,
      `  renderedActiveCardRenderKey=${r.renderedActiveCardRenderKey ?? '∅'}`,
      `  publishedCardRect=${JSON.stringify(r.publishedCardRect ?? null)}`,
    );
  }
  return lines.join('\n') + '\n';
}
