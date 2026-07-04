/**
 * incidentReportTrigger — client-side helper that asks the
 * server-side `generate-incident-report` edge function to (re)build the
 * autopsy row for a given voice-incident correlation_id.
 *
 * Requirements:
 *  - Debounced per-incident (300ms) so bursts of events don't create N
 *    duplicate report generations, but every trigger reason is still
 *    coalesced into the next generation call.
 *  - Uses `fetch(..., keepalive:true)` so a trigger fired during tab
 *    teardown (pagehide, unload) still lands.
 *  - Never awaits, never throws.
 */

const SUPABASE_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
  reasons: string[];
}

const pending = new Map<string, Pending>();

export function triggerIncidentReport(
  correlationId: string | null | undefined,
  reason: string,
): void {
  if (!correlationId) return;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if (typeof fetch === "undefined") return;
  let slot = pending.get(correlationId);
  if (!slot) {
    slot = { timer: null, reasons: [] };
    pending.set(correlationId, slot);
  }
  slot.reasons.push(reason);
  if (slot.timer) return;
  slot.timer = setTimeout(() => {
    const cur = pending.get(correlationId);
    pending.delete(correlationId);
    const combined = cur?.reasons.join(",") ?? reason;
    fireNow(correlationId, combined);
  }, 300);
}

/** Fire immediately (used by pagehide / unload). Bypasses debounce. */
export function triggerIncidentReportImmediate(
  correlationId: string | null | undefined,
  reason: string,
): void {
  if (!correlationId) return;
  const slot = pending.get(correlationId);
  if (slot?.timer) clearTimeout(slot.timer);
  pending.delete(correlationId);
  fireNow(correlationId, reason);
}

function fireNow(correlationId: string, reason: string): void {
  try {
    void fetch(`${SUPABASE_URL}/functions/v1/generate-incident-report`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ correlation_id: correlationId, reason }),
    }).catch(() => {
      /* proof failure is itself proof */
    });
  } catch {
    /* swallow */
  }
}

// ── 10-second no-progress watchdog ──────────────────────────────────
//
// If an incident stays "open" locally but nothing new lands for 10s,
// force a report generation so the row is written with whatever last
// boundary is known. The tracer registers its active incident id via
// setActiveWatchdogIncident; the watchdog interval polls the timestamp
// of the last recorded event.

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let watchdogIncidentId: string | null = null;
let lastEventTsMs = 0;
let watchdogLastFiredForBoundaryTsMs = 0;

export function noteRuntimeEventForWatchdog(correlationId: string | null): void {
  if (!correlationId) return;
  if (watchdogIncidentId !== correlationId) {
    watchdogIncidentId = correlationId;
    watchdogLastFiredForBoundaryTsMs = 0;
  }
  lastEventTsMs = Date.now();
  ensureWatchdog();
}

export function clearWatchdogIncident(): void {
  watchdogIncidentId = null;
  lastEventTsMs = 0;
  watchdogLastFiredForBoundaryTsMs = 0;
}

function ensureWatchdog(): void {
  if (watchdogInterval || typeof setInterval === "undefined") return;
  watchdogInterval = setInterval(() => {
    if (!watchdogIncidentId) return;
    const age = Date.now() - lastEventTsMs;
    if (age > 10_000 && lastEventTsMs !== watchdogLastFiredForBoundaryTsMs) {
      watchdogLastFiredForBoundaryTsMs = lastEventTsMs;
      triggerIncidentReport(
        watchdogIncidentId,
        `watchdog-10s-no-progress-age=${age}ms`,
      );
    }
  }, 3_000);
}
