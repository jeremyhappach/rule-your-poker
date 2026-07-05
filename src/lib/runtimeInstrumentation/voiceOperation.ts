/**
 * voiceOperation — single-source-of-truth for the currently active voice
 * operation correlation id. Created synchronously BEFORE any async work
 * (MediaRecorder, timers, streams, network) so every downstream event
 * carries a stable correlation_id.
 *
 * Contract:
 *  - Exactly one active voice operation at a time.
 *  - `beginVoiceOperation` creates the id + opens the runtime incident.
 *  - `getActiveVoiceOperationId()` is durable across component remount
 *    (persisted in sessionStorage) and survives cancellation/error
 *    until `endVoiceOperation()` has drained pipeline acks.
 *  - After `endVoiceOperation()`, the id is retained in an "ending"
 *    grace window (~1500ms) so late events (capsule ack, manifest,
 *    incident patch, report trigger) still attribute to the same
 *    correlation.
 *  - Events emitted through the tracer while an operation is active
 *    are guaranteed to carry the operation's correlation_id.
 */

import {
  beginRuntimeIncident,
  endRuntimeIncident,
  registerVoiceOperationIdGetter,
} from "@/lib/runtimeInstrumentation/runtimeTracer";

const SS_KEY = "runtime-tracer:active-voice-operation-v1";
const GRACE_MS = 1500;

interface VoiceOperationRecord {
  id: string;
  startedAt: string;
  meta: Record<string, unknown>;
  ended: boolean;
  endReason: string | null;
  endedAt: string | null;
}

let active: VoiceOperationRecord | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

function readSession(): VoiceOperationRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoiceOperationRecord;
    if (parsed && typeof parsed.id === "string") return parsed;
  } catch {
    /* noop */
  }
  return null;
}

function writeSession(rec: VoiceOperationRecord | null): void {
  if (typeof window === "undefined") return;
  try {
    if (rec) window.sessionStorage.setItem(SS_KEY, JSON.stringify(rec));
    else window.sessionStorage.removeItem(SS_KEY);
  } catch {
    /* noop */
  }
}

// Bootstrap: recover any operation left dangling by a remount.
function ensureLoaded(): void {
  if (active !== null) return;
  const rec = readSession();
  if (rec && !rec.ended) {
    active = rec;
  }
}

// Register with tracer at module load so enforceVoiceCorrelation can
// consult the durable voice-operation id without importing back.
try {
  registerVoiceOperationIdGetter(() => {
    ensureLoaded();
    return active?.id ?? null;
  });
} catch { /* noop */ }

/**
 * Synchronously create the active voice operation. This MUST be called
 * before any recording state, MediaRecorder, timer, or async work.
 * Returns the correlation id.
 */
export function beginVoiceOperation(
  meta: Record<string, unknown> = {},
): string {
  ensureLoaded();
  // If a prior operation is still in grace, force-close it now — a new
  // capture supersedes any lingering pipeline ack window.
  if (active) {
    try {
      endRuntimeIncident("superseded-by-new-voice-op");
    } catch {
      /* noop */
    }
    active = null;
    writeSession(null);
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  }
  const id = beginRuntimeIncident("voice_capture", meta);
  active = {
    id,
    startedAt: new Date().toISOString(),
    meta,
    ended: false,
    endReason: null,
    endedAt: null,
  };
  writeSession(active);
  return id;
}

export function getActiveVoiceOperation(): VoiceOperationRecord | null {
  ensureLoaded();
  return active;
}

/**
 * Returns the active operation id, INCLUDING during the post-end grace
 * window. Downstream events (capsule ack, manifest update, incident
 * patch, report trigger) attribute to the operation until it fully
 * drains.
 */
export function getActiveVoiceOperationId(): string | null {
  ensureLoaded();
  return active?.id ?? null;
}

/**
 * Mark the operation as ending but keep the correlation id valid for
 * GRACE_MS so late pipeline acknowledgements land under the same id.
 * The runtime incident is closed only after the grace window.
 */
export function endVoiceOperation(reason: string): string | null {
  ensureLoaded();
  if (!active) return null;
  if (active.ended) return active.id;
  active.ended = true;
  active.endReason = reason;
  active.endedAt = new Date().toISOString();
  writeSession(active);
  const closingId = active.id;
  if (graceTimer) clearTimeout(graceTimer);
  graceTimer = setTimeout(() => {
    try {
      endRuntimeIncident(reason);
    } catch {
      /* noop */
    }
    active = null;
    writeSession(null);
    graceTimer = null;
  }, GRACE_MS);
  return closingId;
}

/** Test/self-check helper: end immediately without grace. */
export function endVoiceOperationImmediate(reason: string): string | null {
  ensureLoaded();
  if (!active) return null;
  const closingId = active.id;
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  try {
    endRuntimeIncident(reason);
  } catch {
    /* noop */
  }
  active = null;
  writeSession(null);
  return closingId;
}
