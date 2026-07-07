/**
 * Emergency containment tests for the incident-report pipeline.
 *
 * See src/lib/runtimeInstrumentation/incidentPipelineContainment.ts
 * for the outage context. These tests assert that:
 *
 *   1. Every client-side ingress produces zero network / DB work.
 *   2. The Edge Function's disabled path performs zero DB reads/writes.
 *      (Asserted structurally: the deployed handler contains no
 *      supabase-js import, no `.from(...)` call, and no
 *      `client_runtime_*` table reference.)
 *   3. Malformed correlation IDs produce zero outgoing requests.
 *   4. A disabled response cannot trigger a retry (the trigger module
 *      exposes no retry surface once contained).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
// @ts-expect-error vite raw import of the deployed edge function source
import edgeSource from "../../../supabase/functions/generate-incident-report/index.ts?raw";

import {
  INCIDENT_PIPELINE_DISABLED,
  isWellFormedCorrelationId,
} from "./incidentPipelineContainment";
import {
  triggerIncidentReport,
  triggerIncidentReportImmediate,
  noteRuntimeEventForWatchdog,
  clearWatchdogIncident,
} from "./incidentReportTrigger";

describe("incidentPipelineContainment", () => {
  it("is active in production builds", () => {
    expect(INCIDENT_PIPELINE_DISABLED).toBe(true);
  });

  it("rejects non-UUID correlation ids", () => {
    expect(isWellFormedCorrelationId(undefined)).toBe(false);
    expect(isWellFormedCorrelationId(null)).toBe(false);
    expect(isWellFormedCorrelationId("")).toBe(false);
    expect(isWellFormedCorrelationId("d0be90ac")).toBe(false); // truncated
    expect(isWellFormedCorrelationId("not-a-uuid")).toBe(false);
    expect(isWellFormedCorrelationId(123 as unknown)).toBe(false);
    expect(
      isWellFormedCorrelationId("11111111-2222-4333-8444-555555555555"),
    ).toBe(true);
  });
});

describe("incidentReportTrigger (contained)", () => {
  const validId = "11111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("triggerIncidentReport performs no fetch for any id (valid or malformed)", () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;

    triggerIncidentReport(validId, "test");
    triggerIncidentReport("d0be90ac", "malformed");
    triggerIncidentReport(null, "null");
    triggerIncidentReport(undefined, "undef");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("triggerIncidentReportImmediate performs no fetch", () => {
    const fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;

    triggerIncidentReportImmediate(validId, "test");
    triggerIncidentReportImmediate("d0be90ac", "malformed");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("noteRuntimeEventForWatchdog schedules no timer / no retry", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    noteRuntimeEventForWatchdog(validId);
    noteRuntimeEventForWatchdog("d0be90ac");
    clearWatchdogIncident();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe("generate-incident-report Edge Function (disabled path)", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../supabase/functions/generate-incident-report/index.ts"),
    "utf8",
  );

  it("does not import supabase-js", () => {
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/createClient\(/);
  });

  it("performs zero DB reads/writes on the disabled path", () => {
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/client_runtime_events/);
    expect(src).not.toMatch(/client_runtime_incident_reports/);
    expect(src).not.toMatch(/client_runtime_incidents/);
    expect(src).not.toMatch(/debug_events/);
  });

  it("returns a 200 no-op response so callers cannot retry on error", () => {
    expect(src).toMatch(/status:\s*200/);
    expect(src).toMatch(/disabled:\s*true/);
  });
});
