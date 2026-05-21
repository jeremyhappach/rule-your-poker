/**
 * Gin startup timeline tracer.
 *
 * Captures absolute timestamps + delta-from-t0 for every gating event on
 * the gin-rummy bootstrap critical path. t0 is set at ante completion
 * handler entry (the moment the user-triggered submit-equivalent chain
 * begins). All events log under the same console namespace
 * [GIN_RUNTIME_TIMELINE] so they sort naturally with existing traces.
 *
 * Instrumentation only — no behavior changes.
 */

let _t0: number | null = null;
let _t0GameId: string | null = null;

export function markGinSubmit(gameId: string | null | undefined): void {
  _t0 = performance.now();
  _t0GameId = gameId ?? null;
  // eslint-disable-next-line no-console
  console.log('[GIN_RUNTIME_TIMELINE] T0 submit', {
    t0Abs: Date.now(),
    gameId: _t0GameId,
  });
}

export function ginTrace(event: string, data?: Record<string, unknown>): void {
  const now = performance.now();
  const dt = _t0 != null ? Math.round(now - _t0) : null;
  // eslint-disable-next-line no-console
  console.log(`[GIN_RUNTIME_TIMELINE] ${event}`, {
    tAbs: Date.now(),
    dtMs: dt,
    gameId: _t0GameId,
    ...(data ?? {}),
  });
}

export function getGinT0(): number | null {
  return _t0;
}
