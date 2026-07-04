/**
 * runtimePipelineProof — verified writes for critical voice/lifecycle
 * events. Each verifier performs the underlying persistence action
 * (IndexedDB append + read-back, DB incident patch, DB instance
 * upsert), then emits a DB-persisted proof event describing the
 * result. Emissions bypass the batched runtimeTracer queue and use
 * `fetch(..., keepalive:true)` so a proof lands even if the tab dies.
 *
 * These verifiers NEVER mutate voice/recording/transcription state.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  appendCapsuleEventVerified,
  readCapsuleManifest,
  setManifestUploadState,
  listCapsuleManifests,
  type CapsuleAppendVerifyResult,
} from "@/lib/runtimeInstrumentation/voiceCrashCapsule";

const SUPABASE_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export interface DirectEventInput {
  event_family: string;
  event_name: string;
  severity: "info" | "warn" | "error" | "critical";
  correlation_id: string | null;
  client_instance_id: string;
  tab_session_id: string | null;
  user_id: string | null;
  route: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * Bypass the batched queue and send a single event row via keepalive.
 * Returns true if the fetch was dispatched. Never awaits response.
 */
export function emitDirectDbEvent(input: DirectEventInput): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (typeof fetch === "undefined") return false;
  const nowIso = new Date().toISOString();
  const row = {
    occurred_at_client: nowIso,
    client_instance_id: input.client_instance_id,
    tab_session_id: input.tab_session_id,
    user_id: input.user_id,
    correlation_id: input.correlation_id,
    voice_operation_id: input.correlation_id,
    event_family: input.event_family,
    event_name: input.event_name,
    severity: input.severity,
    route: input.route,
    visibility_state:
      typeof document !== "undefined" ? document.visibilityState : null,
    online_state:
      typeof navigator !== "undefined" ? navigator.onLine : null,
    payload: input.payload,
    game_id: null,
    table_id: null,
    dealer_game_id: null,
    session_id: null,
    message_id: null,
    active_tab: null,
    game_status: null,
    game_type: null,
    is_committed_active_session: null,
    error_name: null,
    error_message: null,
    error_stack: null,
  };
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/client_runtime_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify([row]),
    }).catch(() => {
      /* proof failure is itself proof */
    });
    return true;
  } catch {
    return false;
  }
}

/** Verify a local capsule append and emit CAPSULE_LOCAL_APPEND_(VERIFIED|FAILED). */
export async function verifyCapsuleAppendAndEmit(input: {
  incidentId: string;
  eventFamily: string;
  eventName: string;
  severity: string;
  route: string | null;
  clientInstanceId: string;
  tabSessionId: string;
  userId: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<CapsuleAppendVerifyResult> {
  const result = await appendCapsuleEventVerified({
    voiceCrashIncidentId: input.incidentId,
    eventFamily: input.eventFamily,
    eventName: input.eventName,
    severity: input.severity,
    route: input.route,
    clientInstanceId: input.clientInstanceId,
    tabSessionId: input.tabSessionId,
    payload: input.payload ?? null,
  });
  const ok = result.appendSuccess && result.readBackSuccess;
  emitDirectDbEvent({
    event_family: "environment",
    event_name: ok ? "CAPSULE_LOCAL_APPEND_VERIFIED" : "CAPSULE_LOCAL_APPEND_FAILED",
    severity: ok ? "info" : "error",
    correlation_id: input.incidentId,
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    route: input.route,
    payload: {
      forEventName: input.eventName,
      monotonicSequence: result.monotonicSequence,
      dbName: result.dbName,
      storeName: result.storeName,
      recordKey: result.recordKey,
      appendSuccess: result.appendSuccess,
      readBackSuccess: result.readBackSuccess,
      idbErrorName: result.idbErrorName,
      idbErrorMessage: result.idbErrorMessage,
      storagePersisted: result.storagePersisted,
      quotaEstimateBytes: result.quotaEstimateBytes,
      usageEstimateBytes: result.usageEstimateBytes,
    },
  });
  // The verified-append transaction also upserts the manifest row for this
  // incident (see appendCapsuleEventVerified). Emit a separate proof event
  // so `CAPSULE_MANIFEST_UPDATED` can be queried independently of the
  // append proof.
  if (ok) {
    emitDirectDbEvent({
      event_family: "environment",
      event_name: "CAPSULE_MANIFEST_UPDATED",
      severity: "info",
      correlation_id: input.incidentId,
      client_instance_id: input.clientInstanceId,
      tab_session_id: input.tabSessionId,
      user_id: input.userId,
      route: input.route,
      payload: {
        forEventName: input.eventName,
        monotonicSequence: result.monotonicSequence,
        manifestStore: "manifests",
        dbName: result.dbName,
      },
    });
  }
  return result;
}

/** Patch incident row and emit INCIDENT_PATCH_VERIFIED with DB ack. */
export async function verifyIncidentPatchAndEmit(input: {
  incidentId: string;
  clientInstanceId: string;
  tabSessionId: string;
  userId: string | null;
  route: string | null;
  eventFamily: string;
  eventName: string;
  sequence: number | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    last_event_at: new Date().toISOString(),
    last_route: input.route,
    last_visibility_state:
      typeof document !== "undefined" ? document.visibilityState : null,
  };
  if (input.eventFamily === "voice") patch.last_voice_phase = input.eventName;
  if (
    input.eventFamily === "environment" ||
    input.eventFamily === "session" ||
    input.eventFamily === "route" ||
    input.eventFamily === "fatal"
  ) {
    patch.last_lifecycle_event = input.eventName;
  }
  let ackStatus = "unknown";
  let errorMessage: string | null = null;
  let updatedRowCount = 0;
  try {
    const { data, error, status } = await supabase
      .from("client_runtime_incidents")
      .update(patch as never)
      .eq("correlation_id", input.incidentId)
      .select("id");
    if (error) {
      ackStatus = "error";
      errorMessage = error.message;
    } else {
      ackStatus = String(status);
      updatedRowCount = Array.isArray(data) ? data.length : 0;
    }
  } catch (err) {
    ackStatus = "throw";
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  emitDirectDbEvent({
    event_family: "environment",
    event_name: "INCIDENT_PATCH_VERIFIED",
    severity: updatedRowCount > 0 ? "info" : "warn",
    correlation_id: input.incidentId,
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    route: input.route,
    payload: {
      forEventName: input.eventName,
      eventFamily: input.eventFamily,
      sequence: input.sequence,
      ackStatus,
      errorMessage,
      updatedRowCount,
      patchKeys: Object.keys(patch),
    },
  });
}

/** Upsert instance row and emit INSTANCE_HEARTBEAT_VERIFIED with DB ack. */
export async function verifyInstanceHeartbeatAndEmit(input: {
  incidentId: string | null;
  clientInstanceId: string;
  tabSessionId: string;
  userId: string | null;
  route: string | null;
  lifecycleLabel: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const row = {
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    last_seen_at: new Date().toISOString(),
    last_route: input.route,
    last_visibility_state:
      typeof document !== "undefined" ? document.visibilityState : null,
    last_online_state:
      typeof navigator !== "undefined" ? navigator.onLine : null,
    origin:
      typeof window !== "undefined" ? window.location.origin : null,
    active_incident_id: input.incidentId,
    last_lifecycle_event: input.lifecycleLabel,
    document_was_discarded:
      typeof document !== "undefined"
        ? (document as Document & { wasDiscarded?: boolean }).wasDiscarded ??
          null
        : null,
  };
  let ackStatus = "unknown";
  let errorMessage: string | null = null;
  try {
    const { error, status } = await supabase
      .from("client_runtime_instances")
      .upsert(row as never, { onConflict: "client_instance_id" });
    if (error) {
      ackStatus = "error";
      errorMessage = error.message;
    } else {
      ackStatus = String(status);
    }
  } catch (err) {
    ackStatus = "throw";
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  emitDirectDbEvent({
    event_family: "environment",
    event_name: "INSTANCE_HEARTBEAT_VERIFIED",
    severity: errorMessage ? "warn" : "info",
    correlation_id: input.incidentId,
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    route: input.route,
    payload: {
      lifecycleLabel: input.lifecycleLabel,
      ackStatus,
      errorMessage,
      wroteRow: row,
      ...(input.extra ?? {}),
    },
  });
}

/** Manifest lookup + upload lifecycle emitter. */
export async function runManifestUpload(input: {
  incidentId: string;
  clientInstanceId: string;
  tabSessionId: string;
  userId: string | null;
  route: string | null;
  triggerReason: string;
}): Promise<{ found: boolean; uploadState: string | null }> {
  const manifest = await readCapsuleManifest(input.incidentId);
  emitDirectDbEvent({
    event_family: "environment",
    event_name: manifest ? "CAPSULE_MANIFEST_FOUND" : "CAPSULE_MANIFEST_MISSING",
    severity: "info",
    correlation_id: input.incidentId,
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    route: input.route,
    payload: { manifest, triggerReason: input.triggerReason },
  });
  if (!manifest) return { found: false, uploadState: null };
  emitDirectDbEvent({
    event_family: "environment",
    event_name: "CAPSULE_UPLOAD_STARTED",
    severity: "info",
    correlation_id: input.incidentId,
    client_instance_id: input.clientInstanceId,
    tab_session_id: input.tabSessionId,
    user_id: input.userId,
    route: input.route,
    payload: {
      triggerReason: input.triggerReason,
      manifestSequence: manifest.latestSequence,
    },
  });
  await setManifestUploadState(input.incidentId, "uploading");
  // Upload is performed elsewhere via uploadUnresolvedCapsules; here we
  // just track the manifest lifecycle. The tracer's existing capsule
  // upload path will emit the terminal COMPLETED / FAILED event.
  return { found: true, uploadState: manifest.uploadState };
}

export async function listAllManifests() {
  return listCapsuleManifests();
}
