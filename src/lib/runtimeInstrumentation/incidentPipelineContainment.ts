/**
 * incidentPipelineContainment — emergency global switch.
 *
 * The `generate-incident-report` Edge Function was proven runaway
 * (181 invocations / 20 min, 13s avg, 54s max, timing out on
 * `client_runtime_events WHERE correlation_id = ...` and producing
 * 500/retry loops that saturated PostgREST/DB capacity, making game
 * transitions take minutes).
 *
 * While this flag is `true`, EVERY ingress into the incident-report
 * pipeline is a no-op:
 *   - no Edge Function invocations
 *   - no client_runtime_events writes
 *   - no client_runtime_incident_reports upserts
 *   - no client_runtime_incidents writes
 *   - no client_runtime_event_outbox writes
 *   - no debug_events writes caused by incident reporting
 *   - no retries, deferred retries, queue drains, watchdogs,
 *     recovery replays, unload handlers, timers, background flushes
 *
 * Existing rows are preserved. Function signatures are preserved.
 * Consumers cannot detect containment except via this constant.
 */
export const INCIDENT_PIPELINE_DISABLED = true;

/** Strict RFC-4122 UUID v1-v5 check. Anything else is rejected locally. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isWellFormedCorrelationId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
