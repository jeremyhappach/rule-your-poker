// Bounded BFCache / back-forward restore handler.
//
// A BFCache restore is NOT an application error — the browser has handed us
// back a live, already-hydrated page. Forcing `window.location.reload()` on
// restore causes the observed "booted → blank table → eventually hydrates"
// symptom on iOS Safari when a foreground tab is evicted to BFCache and
// then resumed.
//
// Instead of reloading we dispatch a single internal `app:page-resumed`
// event. Consumers (realtime channel health checks, session refreshers)
// listen for this and perform bounded reconciliation. This handler itself
// must never navigate, reload, clear auth/session, unmount the shell, or
// mutate route state.
export function handlePageShow(event: PageTransitionEvent) {
  const persisted = event.persisted;
  const navEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const backForward = navEntry?.type === "back_forward";
  if (!persisted && !backForward) return;
  try {
    window.dispatchEvent(
      new CustomEvent("app:page-resumed", {
        detail: { persisted, backForward },
      }),
    );
  } catch {
    /* noop */
  }
}

export function installPageShowHandler() {
  window.addEventListener("pageshow", (event) => {
    handlePageShow(event as PageTransitionEvent);
  });
}
