/**
 * holmDealBarrier — single source of truth for "Holm initial deal is
 * complete" across the client (timer eligibility + bot decision trigger).
 *
 * DealRuntime marks the barrier when phase enters GAMEPLAY (which itself
 * is gated by HolmDealPhaseHost on: community-3 settled in multi, OR
 * last chucky settled in solo). Consumers read `isHolmHandReady` and
 * MUST NOT proceed with timers/bot decisions until it returns true.
 */

const ready = new Set<string>();
const listeners = new Set<() => void>();

export function markHolmHandReady(handContextId: string) {
  if (!handContextId) return;
  if (ready.has(handContextId)) return;
  ready.add(handContextId);
  for (const l of listeners) {
    try { l(); } catch { /* noop */ }
  }
}

export function isHolmHandReady(handContextId: string | null | undefined): boolean {
  if (!handContextId) return false;
  return ready.has(handContextId);
}

export function clearHolmHandReady(handContextId: string) {
  ready.delete(handContextId);
}

export function subscribeHolmHandReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
