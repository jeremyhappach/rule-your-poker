/**
 * holmBuckPresentationGate — local presentation gate for the "BUCKS ON YOU"
 * overlay. While armed for a given handContextId, local deal presentation
 * (HolmDealOrchestrator hands wave) must NOT launch. Server-authored next
 * hand/manifest is preserved; only the visible dispatch is delayed.
 *
 * Armed when a SERVER_BUCK_TRANSFER event with toPosition === self is
 * received. Released once when the BucksOnYouAnimation completes.
 *
 * No timers, no fallbacks. Pure observation + boolean gate.
 */

const gated = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* noop */ }
  }
}

export function armBuckPresentationGate(handContextId: string | null | undefined): void {
  if (!handContextId) return;
  if (gated.has(handContextId)) return;
  gated.add(handContextId);
  notify();
}

export function releaseBuckPresentationGate(handContextId: string | null | undefined): void {
  if (!handContextId) return;
  if (!gated.has(handContextId)) return;
  gated.delete(handContextId);
  notify();
}

export function isBuckPresentationGated(handContextId: string | null | undefined): boolean {
  if (!handContextId) return false;
  return gated.has(handContextId);
}

export function subscribeBuckPresentationGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
