/**
 * incidentReportTrigger — CONTAINED.
 *
 * Every export is a production no-op. See
 * ./incidentPipelineContainment.ts for the reason. Signatures are
 * preserved so callers do not crash. No fetch, no timer, no watchdog,
 * no localStorage, no retry.
 */
import {
  INCIDENT_PIPELINE_DISABLED,
  isWellFormedCorrelationId,
} from "./incidentPipelineContainment";

export function triggerIncidentReport(
  correlationId: string | null | undefined,
  _reason: string,
): void {
  if (INCIDENT_PIPELINE_DISABLED) return;
  if (!isWellFormedCorrelationId(correlationId)) return;
}

export function triggerIncidentReportImmediate(
  correlationId: string | null | undefined,
  _reason: string,
): void {
  if (INCIDENT_PIPELINE_DISABLED) return;
  if (!isWellFormedCorrelationId(correlationId)) return;
}

export function noteRuntimeEventForWatchdog(
  _correlationId: string | null,
): void {
  if (INCIDENT_PIPELINE_DISABLED) return;
}

export function clearWatchdogIncident(): void {
  if (INCIDENT_PIPELINE_DISABLED) return;
}
