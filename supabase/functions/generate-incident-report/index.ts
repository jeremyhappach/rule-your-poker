// generate-incident-report
//
// Server-side autopsy generator. Given a `correlation_id` (voice
// incident id), joins all evidence from client_runtime_incidents,
// client_runtime_events, client_runtime_event_outbox,
// client_runtime_instances, chat_message_delivery_trace, and upserts
// one immutable report row into client_runtime_incident_reports.
//
// The report is EVIDENCE ONLY. Missing evidence is flagged as
// missing; no root cause is inferred from silence.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Expected voice-flow boundaries, in canonical order. Any name missing
// from the timeline is emitted in `missing_boundaries.voice`.
const EXPECTED_VOICE_BOUNDARIES = [
  "VOICE_CAPTURE_START",
  "VOICE_CAPTURE_STARTED",
  "VOICE_STOP_BUTTON_TAPPED",
  "VOICE_STOP_HANDLER_ENTERED",
  "VOICE_MEDIARECORDER_STOP_CALLED",
  "VOICE_MEDIARECORDER_ONSTOP_ENTERED",
  "VOICE_MEDIARECORDER_DATAAVAILABLE",
  "VOICE_BLOB_READY",
  "VOICE_ENCODE_START",
  "VOICE_ENCODE_COMPLETE",
  "VOICE_FN_INVOKE_START",
  "VOICE_FN_INVOKE_RESPONSE",
  "VOICE_FINALIZE_RETURN",
  "VOICE_SEND_BEGIN",
  "VOICE_SEND_COMPLETE",
  "VOICE_STOP_HANDLER_EXITED",
];

const EXPECTED_LIFECYCLE = [
  "PAGE_VISIBILITY_CHANGE",
  "PAGE_HIDE",
  "PAGE_SHOW",
  "BEFORE_UNLOAD",
  "UNLOAD",
  "FREEZE",
  "RESUME",
  "WINDOW_ERROR",
  "UNHANDLED_REJECTION",
];

const EXPECTED_NETWORK = [
  "NETWORK_ONLINE",
  "NETWORK_OFFLINE",
  "NETWORK_STATUS_SNAPSHOT",
];

const EXPECTED_RECOVERY = [
  "RUNTIME_BOOT_EARLY",
  "CAPSULE_SCAN_COMPLETE",
  "BOOT_RECOVERED_OPEN_INCIDENT",
  "CAPSULE_UPLOAD_COMPLETED",
];

interface TimelineRow {
  t: string;
  source: string;
  name: string;
  family: string | null;
  severity: string | null;
  client_instance_id: string | null;
  tab_session_id: string | null;
  route: string | null;
  detail: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const correlationId: string | undefined = body?.correlation_id;
    const reason: string = body?.reason ?? "trigger";
    if (!correlationId) {
      return json({ error: "correlation_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Incident row (may be null for synthetic pre-open cases).
    const { data: incidentRow } = await supabase
      .from("client_runtime_incidents")
      .select("*")
      .eq("correlation_id", correlationId)
      .maybeSingle();

    // 2. All events with this correlation_id (chronological).
    const { data: events } = await supabase
      .from("client_runtime_events")
      .select(
        "id, occurred_at_client, occurred_at_server, event_family, event_name, severity, client_instance_id, tab_session_id, user_id, route, payload, error_name, error_message, visibility_state, online_state",
      )
      .eq("correlation_id", correlationId)
      .order("occurred_at_server", { ascending: true })
      .limit(2000);

    // 3. Outbox rows for this correlation_id.
    const { data: outbox } = await supabase
      .from("client_runtime_event_outbox")
      .select(
        "id, status, transport, attempts, event_family, event_name, severity, client_instance_id, tab_session_id, created_at, delivered_at, failed_at, error_message",
      )
      .eq("correlation_id", correlationId)
      .order("created_at", { ascending: true })
      .limit(2000);

    // 4. Instance rows related to the incident (original + recoveries).
    const clientInstanceIds = new Set<string>();
    if (incidentRow?.client_instance_id) clientInstanceIds.add(incidentRow.client_instance_id);
    (events ?? []).forEach((e: { client_instance_id: string | null }) => {
      if (e.client_instance_id) clientInstanceIds.add(e.client_instance_id);
    });
    let instances: unknown[] = [];
    if (clientInstanceIds.size > 0) {
      const { data: inst } = await supabase
        .from("client_runtime_instances")
        .select(
          "client_instance_id, tab_session_id, user_id, last_seen_at, last_route, last_visibility_state, last_online_state, origin, active_incident_id, last_lifecycle_event, document_was_discarded",
        )
        .in("client_instance_id", Array.from(clientInstanceIds));
      instances = inst ?? [];
    }

    // 5. Chat delivery rows tied to voice_operation_id / correlation.
    const { data: chatTrace } = await supabase
      .from("chat_message_delivery_trace")
      .select(
        "message_id, correlation_id, voice_operation_id, delivery_status, render_status, unread_status, failure_reason, send_intent_at, db_insert_success_at, realtime_broadcast_at, recipient_realtime_receipt_at",
      )
      .eq("correlation_id", correlationId)
      .limit(200);

    // ── Merge into a strict chronological timeline. ──────────────
    const timeline: TimelineRow[] = [];

    (events ?? []).forEach((e) => {
      timeline.push({
        t: (e.occurred_at_client ?? e.occurred_at_server) as string,
        source: "event",
        name: e.event_name as string,
        family: e.event_family as string,
        severity: e.severity as string,
        client_instance_id: e.client_instance_id as string | null,
        tab_session_id: e.tab_session_id as string | null,
        route: e.route as string | null,
        detail: {
          payload: e.payload,
          error_name: e.error_name,
          error_message: e.error_message,
          visibility_state: e.visibility_state,
          online_state: e.online_state,
          event_id: e.id,
        },
      });
    });
    (outbox ?? []).forEach((o) => {
      timeline.push({
        t: (o.delivered_at ?? o.failed_at ?? o.created_at) as string,
        source: "outbox",
        name: `OUTBOX_${(o.status as string).toUpperCase()}:${o.event_name}`,
        family: o.event_family as string,
        severity: o.severity as string | null,
        client_instance_id: o.client_instance_id as string | null,
        tab_session_id: o.tab_session_id as string | null,
        route: null,
        detail: {
          outbox_id: o.id,
          status: o.status,
          attempts: o.attempts,
          transport: o.transport,
          error_message: o.error_message,
        },
      });
    });
    (instances as Array<{ last_seen_at: string; client_instance_id: string; tab_session_id: string | null; last_route: string | null; last_lifecycle_event: string | null; origin: string | null }>).forEach((i) => {
      timeline.push({
        t: i.last_seen_at,
        source: "instance",
        name: `INSTANCE_LAST_SEEN:${i.last_lifecycle_event ?? "n/a"}`,
        family: "environment",
        severity: "info",
        client_instance_id: i.client_instance_id,
        tab_session_id: i.tab_session_id,
        route: i.last_route,
        detail: { origin: i.origin },
      });
    });

    timeline.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));

    // ── Compute findings ──────────────────────────────────────────
    const observedNames = new Set(timeline.map((r) => r.name));
    const observedRawEventNames = new Set(
      (events ?? []).map((e) => e.event_name as string),
    );

    const missing = {
      voice: EXPECTED_VOICE_BOUNDARIES.filter((n) => !observedRawEventNames.has(n)),
      lifecycle: EXPECTED_LIFECYCLE.filter((n) => !observedRawEventNames.has(n)),
      network: EXPECTED_NETWORK.filter((n) => !observedRawEventNames.has(n)),
      recovery: EXPECTED_RECOVERY.filter((n) => !observedRawEventNames.has(n)),
    };

    const firstEvent = timeline[0] ?? null;
    const lastServerEventRow = (events ?? []).slice(-1)[0] ?? null;
    const lastLocalCapsuleRow = (events ?? [])
      .filter((e) => e.event_name === "CAPSULE_LOCAL_APPEND_VERIFIED")
      .slice(-1)[0] ?? null;
    const lastCapsuleEventRow = (events ?? [])
      .filter((e) => (e.event_name as string).startsWith("CAPSULE_"))
      .slice(-1)[0] ?? null;
    const lastOutboxRow = (outbox ?? []).slice(-1)[0] ?? null;
    const lastIncidentPatchRow = (events ?? [])
      .filter((e) => e.event_name === "INCIDENT_PATCH_VERIFIED")
      .slice(-1)[0] ?? null;
    const lastHeartbeatRow = (events ?? [])
      .filter((e) => e.event_name === "INSTANCE_HEARTBEAT_VERIFIED")
      .slice(-1)[0] ?? null;

    const recoveryEvents = (events ?? []).filter((e) =>
      EXPECTED_RECOVERY.includes(e.event_name as string),
    );

    const uploadCompleted = (events ?? []).some(
      (e) => e.event_name === "CAPSULE_UPLOAD_COMPLETED",
    );
    const sendComplete = (events ?? []).some(
      (e) => e.event_name === "VOICE_SEND_COMPLETE",
    );
    const terminalError = (events ?? []).some(
      (e) =>
        e.event_name === "VOICE_FN_INVOKE_ERROR" ||
        e.event_name === "VOICE_REQUEST_NETWORK_FAILURE" ||
        e.event_name === "WINDOW_ERROR" ||
        e.event_name === "UNHANDLED_REJECTION",
    );

    const originalInstanceId = incidentRow?.client_instance_id ?? firstEvent?.client_instance_id ?? null;
    const recoveryInstance =
      (instances as Array<{ client_instance_id: string; tab_session_id: string | null; origin: string | null; last_route: string | null }>).find(
        (i) => i.client_instance_id !== originalInstanceId,
      ) ?? null;
    const originalInstance =
      (instances as Array<{ client_instance_id: string; tab_session_id: string | null; origin: string | null; last_route: string | null }>).find(
        (i) => i.client_instance_id === originalInstanceId,
      ) ?? null;

    const nowIso = new Date().toISOString();
    const lastEventT = timeline.length > 0 ? timeline[timeline.length - 1].t : null;
    const ageMs = lastEventT
      ? Date.now() - new Date(lastEventT).getTime()
      : Number.POSITIVE_INFINITY;
    const noProgress10s = ageMs > 10_000;

    let status: "pending" | "complete" | "incomplete" = "pending";
    let completedAt: string | null = null;
    let voiceOutcome:
      | "voice-send-completed"
      | "voice-terminal-error"
      | "voice-in-progress"
      | "voice-no-progress-timeout"
      | "unknown" = "unknown";

    if (sendComplete) {
      status = "complete";
      completedAt = nowIso;
      voiceOutcome = "voice-send-completed";
    } else if (uploadCompleted) {
      status = "complete";
      completedAt = nowIso;
      voiceOutcome = "voice-terminal-error";
    } else if (terminalError && (recoveryEvents.length > 0 || noProgress10s)) {
      status = noProgress10s && recoveryEvents.length === 0 ? "incomplete" : "complete";
      completedAt = nowIso;
      voiceOutcome = "voice-terminal-error";
    } else if (incidentRow?.status === "closed") {
      status = "complete";
      completedAt = nowIso;
      voiceOutcome = terminalError ? "voice-terminal-error" : "voice-send-completed";
    } else if (noProgress10s) {
      status = "incomplete";
      completedAt = nowIso;
      voiceOutcome = "voice-no-progress-timeout";
    } else {
      status = "pending";
      voiceOutcome = "voice-in-progress";
    }

    // ── Surface attribution (from incident payload or first voice event) ──
    const incidentPayload =
      (incidentRow?.payload as Record<string, unknown> | null) ?? null;
    const firstVoiceEvent = (events ?? []).find((e) =>
      (e.event_name as string).startsWith("VOICE_"),
    );
    const firstVoicePayload =
      (firstVoiceEvent?.payload as Record<string, unknown> | null) ?? null;
    const firstSurfaceCtx =
      (firstVoicePayload?.__voice_surface_context as
        | Record<string, unknown>
        | undefined) ?? null;
    const surface =
      (incidentPayload?.voice_surface as string | undefined) ??
      (firstSurfaceCtx?.voice_surface as string | undefined) ??
      "unknown";

    // ── Capsule persistence status ─────────────────────────────────
    const capsuleAppendCount = (events ?? []).filter(
      (e) => e.event_name === "CAPSULE_LOCAL_APPEND_VERIFIED",
    ).length;
    const capsuleAppendFailedCount = (events ?? []).filter(
      (e) => e.event_name === "CAPSULE_LOCAL_APPEND_FAILED",
    ).length;
    const capsuleManifestUpdatedCount = (events ?? []).filter(
      (e) => e.event_name === "CAPSULE_MANIFEST_UPDATED",
    ).length;
    const capsuleUploadCompletedCount = (events ?? []).filter(
      (e) => e.event_name === "CAPSULE_UPLOAD_COMPLETED",
    ).length;
    let capsulePersistenceStatus:
      | "verified"
      | "partial"
      | "absent"
      | "failed" = "absent";
    if (capsuleAppendFailedCount > 0) capsulePersistenceStatus = "failed";
    else if (capsuleAppendCount > 0 && capsuleManifestUpdatedCount > 0)
      capsulePersistenceStatus = "verified";
    else if (capsuleAppendCount > 0 || capsuleManifestUpdatedCount > 0)
      capsulePersistenceStatus = "partial";

    const lastObservedBoundary =
      (events ?? [])
        .filter((e) => (e.event_name as string).startsWith("VOICE_"))
        .slice(-1)[0]?.event_name ??
      lastServerEventRow?.event_name ??
      null;

    // Post-boundary evidence: any event AFTER the last VOICE_* boundary.
    const lastVoiceIdx = (() => {
      const arr = events ?? [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if ((arr[i].event_name as string).startsWith("VOICE_")) return i;
      }
      return -1;
    })();
    const postBoundaryEvidencePresent =
      lastVoiceIdx >= 0 && lastVoiceIdx < (events?.length ?? 0) - 1;

    const nextEvidenceExpected =
      status === "complete"
        ? "none"
        : status === "incomplete"
          ? "boot-recovery-or-capsule-upload"
          : "next-voice-boundary-or-10s-watchdog";

    const outcomeBlock = {
      surface,
      voiceOutcome,
      incidentStatus: incidentRow?.status ?? "unknown",
      lastObservedBoundary,
      postBoundaryEvidencePresent,
      capsulePersistenceStatus,
      capsulePersistenceCounts: {
        append_verified: capsuleAppendCount,
        append_failed: capsuleAppendFailedCount,
        manifest_updated: capsuleManifestUpdatedCount,
        upload_completed: capsuleUploadCompletedCount,
      },
      reportFinalizedAt: completedAt,
      nextEvidenceExpected,
      surface_context: firstSurfaceCtx ?? incidentPayload ?? null,
    };

    // Narrative — evidence only.
    const narrativeLines: string[] = [];
    narrativeLines.push(`Correlation: ${correlationId}`);
    narrativeLines.push(`Surface: ${surface}`);
    narrativeLines.push(`Voice outcome: ${voiceOutcome}`);
    narrativeLines.push(
      `Capsule persistence: ${capsulePersistenceStatus} (append_verified=${capsuleAppendCount}, manifest_updated=${capsuleManifestUpdatedCount})`,
    );
    narrativeLines.push(`Trigger reason: ${reason}`);
    narrativeLines.push(`Events persisted: ${events?.length ?? 0}`);
    narrativeLines.push(`Outbox rows: ${outbox?.length ?? 0}`);
    narrativeLines.push(`Instances observed: ${instances.length}`);
    narrativeLines.push(
      `First recorded event: ${firstEvent?.name ?? "none"} @ ${firstEvent?.t ?? "n/a"}`,
    );
    narrativeLines.push(
      `Last observed voice boundary: ${lastObservedBoundary ?? "none"}`,
    );
    narrativeLines.push(
      `Missing voice boundaries: ${missing.voice.join(", ") || "none"}`,
    );
    narrativeLines.push(
      `Send completed: ${sendComplete ? "yes" : "no"}; upload completed: ${uploadCompleted ? "yes" : "no"}; terminal error observed: ${terminalError ? "yes" : "no"}.`,
    );
    narrativeLines.push(
      status === "incomplete"
        ? "No conclusion possible from current evidence — recovery evidence missing."
        : "Report reflects only persisted evidence. No behavioral root cause is inferred.",
    );


    const dataCompleteness = {
      has_incident_row: !!incidentRow,
      event_count: events?.length ?? 0,
      outbox_count: outbox?.length ?? 0,
      instance_count: instances.length,
      chat_trace_count: chatTrace?.length ?? 0,
      recovery_events: recoveryEvents.map((r) => r.event_name),
      last_event_age_ms: Number.isFinite(ageMs) ? ageMs : null,
      no_progress_10s: noProgress10s,
    };

    const upsertRow = {
      correlation_id: correlationId,
      incident_row_id: incidentRow?.id ?? null,
      user_id: incidentRow?.user_id ?? null,
      original_client_instance_id: originalInstanceId,
      original_tab_session_id: incidentRow?.tab_session_id ?? firstEvent?.tab_session_id ?? null,
      original_origin: incidentRow?.origin ?? originalInstance?.origin ?? null,
      original_route: incidentRow?.route ?? firstEvent?.route ?? null,
      recovery_client_instance_id: recoveryInstance?.client_instance_id ?? null,
      recovery_tab_session_id: recoveryInstance?.tab_session_id ?? null,
      recovery_origin: recoveryInstance?.origin ?? null,
      recovery_route: recoveryInstance?.last_route ?? null,
      report_status: status,
      first_event: firstEvent,
      last_confirmed_local_event: lastLocalCapsuleRow,
      last_capsule_event: lastCapsuleEventRow,
      last_server_event: lastServerEventRow,
      last_outbox_result: lastOutboxRow,
      last_incident_patch: lastIncidentPatchRow,
      last_instance_heartbeat: lastHeartbeatRow,
      recovery_status: {
        recovery_events: recoveryEvents.map((r) => ({
          name: r.event_name,
          at: r.occurred_at_client ?? r.occurred_at_server,
          client_instance_id: r.client_instance_id,
        })),
        upload_completed: uploadCompleted,
      },
      network_findings: {
        observed_online: (events ?? []).filter((e) => e.event_name === "NETWORK_ONLINE").length,
        observed_offline: (events ?? []).filter((e) => e.event_name === "NETWORK_OFFLINE").length,
        request_failures: (events ?? []).filter(
          (e) => e.event_name === "VOICE_REQUEST_NETWORK_FAILURE",
        ).length,
      },
      lifecycle_findings: {
        observed: EXPECTED_LIFECYCLE.filter((n) => observedRawEventNames.has(n)),
        missing: missing.lifecycle,
      },
      route_findings: {
        original_route: incidentRow?.route ?? firstEvent?.route ?? null,
        route_redirects: (events ?? [])
          .filter((e) => e.event_name === "ROUTE_REDIRECT")
          .map((e) => e.payload),
      },
      auth_findings: {
        auth_state_changes: (events ?? [])
          .filter((e) => e.event_family === "auth")
          .map((e) => ({ name: e.event_name, at: e.occurred_at_client })),
      },
      session_findings: {
        legacy_fallbacks: (events ?? [])
          .filter((e) => e.event_name === "ACTIVE_SESSION_LEGACY_JOIN_FALLBACK")
          .map((e) => e.payload),
        chat_trace_rows: chatTrace ?? [],
      },
      missing_boundaries: missing,
      timeline,
      narrative: narrativeLines.join("\n"),
      data_completeness: { ...dataCompleteness, outcome: outcomeBlock },
      outcome: outcomeBlock,
      event_count: events?.length ?? 0,
      outbox_count: outbox?.length ?? 0,
      last_generated_reason: reason,
      completed_at: completedAt,
      updated_at: nowIso,
    };

    const { data: upsertData, error: upsertErr } = await supabase
      .from("client_runtime_incident_reports")
      .upsert(upsertRow, { onConflict: "correlation_id" })
      .select("id, report_status, updated_at")
      .maybeSingle();

    if (upsertErr) {
      return json({ error: upsertErr.message, correlation_id: correlationId }, 500);
    }

    return json({
      ok: true,
      correlation_id: correlationId,
      report_id: upsertData?.id ?? null,
      report_status: status,
      event_count: events?.length ?? 0,
      missing,
      reason,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
