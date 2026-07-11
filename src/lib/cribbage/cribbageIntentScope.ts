/**
 * cribbageIntentScope — decides whether a given CardTransport intent is
 * Cribbage-owned so the wartime ledger's lifecycle helper can filter
 * non-Cribbage traffic out of the ring buffer.
 *
 * PRIMARY SIGNAL: explicit immutable game provenance passed by the
 * caller (`ctx.gameType` from CardTransportProvider). When provided, it
 * is authoritative: `gameType === 'cribbage'` → yes; any other
 * non-empty gameType → no. This never depends on shape or heuristics.
 *
 * FALLBACK SIGNAL (only if gameType is absent/null): a bounded registry
 * of active-hand handContextIds plus a `crib-play-` id prefix probe.
 * The fallback exists solely so instrumentation still works when the
 * runtime does not yet forward ctx.gameType.
 *
 * REGISTRY COLLISION/EVICTION CONTRACT
 *   - `handContextId` values in Cribbage are UUID-shaped and unique per
 *     hand (never reused by a non-Cribbage game), so reuse collisions
 *     are not a runtime risk.
 *   - The registry is bounded at 32 most-recent entries. Cribbage games
 *     at any given time have at most 2 concurrent active hand contexts;
 *     the 32-entry ring gives ~15× headroom over the tightest active
 *     window. FIFO eviction can therefore never remove a still-active
 *     Cribbage hand context in practice.
 *   - Completed hand identities are not retained indefinitely — they age
 *     out via FIFO as new hands are dispatched.
 * When `gameType` is authoritative (the current wiring in
 * CardTransportRuntime), the registry is functionally unused — kept
 * only as a defensive fallback and for pre-existing peg-play intents.
 */
const cribHandContexts = new Set<string>();
const REGISTRY_LIMIT = 32;

export function registerCribbageHandContext(handContextId: string | null | undefined): void {
  if (!handContextId) return;
  cribHandContexts.add(handContextId);
  if (cribHandContexts.size > REGISTRY_LIMIT) {
    const first = cribHandContexts.values().next().value as string | undefined;
    if (first) cribHandContexts.delete(first);
  }
}

export function isCribbageIntentLike(
  intent: {
    id?: string | null;
    handContextId?: string | null;
  },
  hint: { gameType?: string | null } = {},
): boolean {
  const gameType = hint.gameType ?? null;
  // Explicit provenance is authoritative.
  if (gameType) return gameType === 'cribbage';
  // Fallback: shape/registry only when no explicit provenance is given.
  const id = intent.id ?? '';
  if (id.startsWith('crib-play-')) return true;
  const hc = intent.handContextId ?? '';
  if (hc && cribHandContexts.has(hc)) return true;
  return false;
}
