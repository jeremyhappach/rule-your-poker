/**
 * cribbageIntentScope — small registry that lets the canonical
 * CardTransportRuntime decide whether a given intent belongs to Cribbage
 * without importing Cribbage code. The Cribbage deal orchestrator
 * registers each handContextId it dispatches. Peg-play intents are
 * identified by their id prefix (`crib-play-`). No behavior side effects.
 */
const cribHandContexts = new Set<string>();

export function registerCribbageHandContext(handContextId: string | null | undefined): void {
  if (!handContextId) return;
  cribHandContexts.add(handContextId);
  // Bounded — keep at most the 20 most recent contexts.
  if (cribHandContexts.size > 20) {
    const first = cribHandContexts.values().next().value as string | undefined;
    if (first) cribHandContexts.delete(first);
  }
}

export function isCribbageIntentLike(intent: {
  id?: string | null;
  handContextId?: string | null;
}): boolean {
  const id = intent.id ?? '';
  if (id.startsWith('crib-play-')) return true;
  const hc = intent.handContextId ?? '';
  if (hc && cribHandContexts.has(hc)) return true;
  return false;
}
