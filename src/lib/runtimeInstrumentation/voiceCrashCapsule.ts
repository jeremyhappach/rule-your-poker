/**
 * voiceCrashCapsule — durable local capture of the full causal chain
 * around a voice-to-text operation, so the record survives even when
 * the device loses connectivity (or reboots) and no browser-side DB
 * write can succeed.
 *
 * Storage
 * -------
 *   IndexedDB database:  voice_network_crash_capsule_v1
 *   Object stores:
 *     - "capsules": keyPath = voiceCrashIncidentId
 *         { voiceCrashIncidentId, openedAt, closedAt|null, uploadedAt|null,
 *           clientInstanceId, tabSessionId, origin, route, userId,
 *           maxSequence, meta }
 *     - "events":   keyPath = internal "__k" (auto-incrementing);
 *                    indexed by "voiceCrashIncidentId" and "uploaded"
 *         { __k, voiceCrashIncidentId, monotonicSequence, localTimestamp,
 *           route, origin, clientInstanceId, tabSessionId,
 *           navigatorOnline, connectionType, effectiveType, downlink, rtt,
 *           eventFamily, eventName, severity, payload, uploaded }
 *
 * The capsule NEVER stores transcript text, audio bytes, or base64.
 *
 * Recovery
 * --------
 *   On every boot, `pageshow`, `online` event, and authenticated session
 *   restoration (`setRuntimeAmbient({user_id})`), we scan the store and
 *   upload any capsule whose events are not yet marked `uploaded`.
 *   Events are uploaded to `client_runtime_events` and only marked
 *   uploaded after the insert is acknowledged. The owning capsule's
 *   `client_runtime_incidents` row is patched with
 *   `recovered_from_local_capsule=true`, `recovery_upload_completed_at`,
 *   `last_local_capsule_sequence`, and `network_lost_observed=true`
 *   whenever an OFFLINE marker exists inside the capsule.
 */

import { supabase } from "@/integrations/supabase/client";

export const DB_NAME = "voice_network_crash_capsule_v1";
export const DB_VERSION = 2;
export const STORE_CAPSULES = "capsules";
export const STORE_EVENTS = "events";
export const STORE_MANIFESTS = "manifests";

export interface CapsuleMeta {
  clientInstanceId: string;
  tabSessionId: string;
  origin: string | null;
  route: string | null;
  userId: string | null;
  opened_at: string;
  openedTsMs: number;
  extra?: Record<string, unknown>;
}

export interface CapsuleEventRecord {
  __k?: number;
  voiceCrashIncidentId: string;
  monotonicSequence: number;
  localTimestamp: string;
  localTimestampMs: number;
  route: string | null;
  origin: string | null;
  clientInstanceId: string;
  tabSessionId: string;
  navigatorOnline: boolean | null;
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  eventFamily: string;
  eventName: string;
  severity: string;
  payload: Record<string, unknown> | null;
  uploaded: 0 | 1;
}

// ── Utilities ──────────────────────────────────────────────────────

function connectionSnapshot(): {
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
} {
  if (typeof navigator === "undefined") {
    return { connectionType: null, effectiveType: null, downlink: null, rtt: null };
  }
  const conn = (navigator as Navigator & {
    connection?: {
      type?: string;
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  }).connection;
  if (!conn) {
    return { connectionType: null, effectiveType: null, downlink: null, rtt: null };
  }
  return {
    connectionType: conn.type ?? null,
    effectiveType: conn.effectiveType ?? null,
    downlink: typeof conn.downlink === "number" ? conn.downlink : null,
    rtt: typeof conn.rtt === "number" ? conn.rtt : null,
  };
}

// ── IndexedDB plumbing ─────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CAPSULES)) {
          db.createObjectStore(STORE_CAPSULES, { keyPath: "voiceCrashIncidentId" });
        }
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const s = db.createObjectStore(STORE_EVENTS, {
            keyPath: "__k",
            autoIncrement: true,
          });
          s.createIndex("byIncident", "voiceCrashIncidentId", { unique: false });
          s.createIndex("byUploaded", "uploaded", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
}

// ── Public capsule lifecycle ───────────────────────────────────────

export async function openCapsule(
  voiceCrashIncidentId: string,
  meta: CapsuleMeta,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = tx(db, [STORE_CAPSULES], "readwrite");
      t.objectStore(STORE_CAPSULES).put({
        voiceCrashIncidentId,
        openedAt: meta.opened_at,
        openedTsMs: meta.openedTsMs,
        closedAt: null,
        uploadedAt: null,
        clientInstanceId: meta.clientInstanceId,
        tabSessionId: meta.tabSessionId,
        origin: meta.origin,
        route: meta.route,
        userId: meta.userId,
        maxSequence: 0,
        meta: meta.extra ?? {},
      });
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function closeCapsule(
  voiceCrashIncidentId: string,
  reason: string,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = tx(db, [STORE_CAPSULES], "readwrite");
      const store = t.objectStore(STORE_CAPSULES);
      const getReq = store.get(voiceCrashIncidentId);
      getReq.onsuccess = () => {
        const row = getReq.result as Record<string, unknown> | undefined;
        if (row) {
          row.closedAt = new Date().toISOString();
          row.closeReason = reason;
          store.put(row);
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Fire-and-forget capsule append. Never blocks the caller. If an active
 * incident is provided, the event is persisted to IndexedDB with a
 * monotonic per-capsule sequence and full network snapshot.
 */
export function appendCapsuleEvent(input: {
  voiceCrashIncidentId: string;
  eventFamily: string;
  eventName: string;
  severity: string;
  route: string | null;
  clientInstanceId: string;
  tabSessionId: string;
  payload?: Record<string, unknown> | null;
}): void {
  const nowMs = Date.now();
  const iso = new Date(nowMs).toISOString();
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const online = nav ? nav.onLine : null;
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  const snap = connectionSnapshot();
  void (async () => {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const t = tx(db, [STORE_CAPSULES, STORE_EVENTS], "readwrite");
        const capsules = t.objectStore(STORE_CAPSULES);
        const events = t.objectStore(STORE_EVENTS);
        const getReq = capsules.get(input.voiceCrashIncidentId);
        getReq.onsuccess = () => {
          const cap = getReq.result as
            | { voiceCrashIncidentId: string; maxSequence?: number }
            | undefined;
          if (!cap) {
            // No capsule row — synthesize a minimal one so events survive.
            capsules.put({
              voiceCrashIncidentId: input.voiceCrashIncidentId,
              openedAt: iso,
              openedTsMs: nowMs,
              closedAt: null,
              uploadedAt: null,
              clientInstanceId: input.clientInstanceId,
              tabSessionId: input.tabSessionId,
              origin,
              route: input.route,
              userId: null,
              maxSequence: 1,
              meta: { synthesized: true },
            });
          } else {
            cap.maxSequence = (cap.maxSequence ?? 0) + 1;
            capsules.put(cap);
          }
          const nextSeq = cap ? (cap.maxSequence ?? 1) : 1;
          const evt: CapsuleEventRecord = {
            voiceCrashIncidentId: input.voiceCrashIncidentId,
            monotonicSequence: nextSeq,
            localTimestamp: iso,
            localTimestampMs: nowMs,
            route: input.route,
            origin,
            clientInstanceId: input.clientInstanceId,
            tabSessionId: input.tabSessionId,
            navigatorOnline: online,
            connectionType: snap.connectionType,
            effectiveType: snap.effectiveType,
            downlink: snap.downlink,
            rtt: snap.rtt,
            eventFamily: input.eventFamily,
            eventName: input.eventName,
            severity: input.severity,
            payload: input.payload ?? null,
            uploaded: 0,
          };
          events.add(evt);
        };
        t.oncomplete = () => resolve();
        t.onerror = () => resolve();
        t.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
}

// ── Recovery / upload ──────────────────────────────────────────────

interface CapsuleRow {
  voiceCrashIncidentId: string;
  openedAt: string;
  closedAt: string | null;
  uploadedAt: string | null;
  clientInstanceId: string;
  tabSessionId: string;
  origin: string | null;
  route: string | null;
  userId: string | null;
  maxSequence: number;
  meta: Record<string, unknown>;
}

async function listCapsules(): Promise<CapsuleRow[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const t = tx(db, [STORE_CAPSULES], "readonly");
      const req = t.objectStore(STORE_CAPSULES).getAll();
      req.onsuccess = () => resolve((req.result as CapsuleRow[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function listPendingEventsForIncident(
  incidentId: string,
): Promise<CapsuleEventRecord[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const t = tx(db, [STORE_EVENTS], "readonly");
      const idx = t.objectStore(STORE_EVENTS).index("byIncident");
      const req = idx.getAll(IDBKeyRange.only(incidentId));
      req.onsuccess = () => {
        const rows = (req.result as CapsuleEventRecord[]) ?? [];
        resolve(rows.filter((r) => r.uploaded === 0));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function markEventsUploaded(keys: number[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = tx(db, [STORE_EVENTS], "readwrite");
      const store = t.objectStore(STORE_EVENTS);
      for (const k of keys) {
        const getReq = store.get(k);
        getReq.onsuccess = () => {
          const row = getReq.result as CapsuleEventRecord | undefined;
          if (row) {
            row.uploaded = 1;
            store.put(row);
          }
        };
      }
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function markCapsuleUploaded(incidentId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = tx(db, [STORE_CAPSULES], "readwrite");
      const store = t.objectStore(STORE_CAPSULES);
      const getReq = store.get(incidentId);
      getReq.onsuccess = () => {
        const row = getReq.result as CapsuleRow | undefined;
        if (row) {
          row.uploadedAt = new Date().toISOString();
          store.put(row);
        }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

let uploadInFlight = false;

/**
 * Scan IndexedDB for unresolved capsules and upload their events to
 * `client_runtime_events`, then patch the owning `client_runtime_incidents`
 * row with recovery metadata.
 */
export async function uploadUnresolvedCapsules(
  triggerReason: string,
): Promise<{ uploadedCapsules: number; uploadedEvents: number }> {
  if (uploadInFlight) return { uploadedCapsules: 0, uploadedEvents: 0 };
  uploadInFlight = true;
  let uploadedCapsules = 0;
  let uploadedEvents = 0;
  try {
    const capsules = await listCapsules();
    for (const cap of capsules) {
      const events = await listPendingEventsForIncident(cap.voiceCrashIncidentId);
      if (events.length === 0) {
        // Still patch the incident row so we mark closed capsules as fully
        // recovered when the DB row already had all events.
        if (cap.closedAt && !cap.uploadedAt) {
          await markCapsuleUploaded(cap.voiceCrashIncidentId);
        }
        continue;
      }
      const rows = events.map((e) => ({
        occurred_at_client: e.localTimestamp,
        client_instance_id: e.clientInstanceId,
        tab_session_id: e.tabSessionId,
        user_id: cap.userId,
        game_id: null,
        table_id: null,
        dealer_game_id: null,
        session_id: null,
        message_id: null,
        voice_operation_id: cap.voiceCrashIncidentId,
        correlation_id: cap.voiceCrashIncidentId,
        event_family: e.eventFamily,
        event_name: e.eventName,
        severity: e.severity,
        route: e.route,
        active_tab: null,
        game_status: null,
        game_type: null,
        is_committed_active_session: null,
        visibility_state: null,
        online_state: e.navigatorOnline,
        payload: {
          ...(e.payload ?? {}),
          recoveredFromLocalCapsule: true,
          capsuleMonotonicSequence: e.monotonicSequence,
          capsuleNetwork: {
            connectionType: e.connectionType,
            effectiveType: e.effectiveType,
            downlink: e.downlink,
            rtt: e.rtt,
          },
          capsuleTriggerReason: triggerReason,
        },
        error_name: null,
        error_message: null,
        error_stack: null,
      }));
      try {
        const { error } = await supabase
          .from("client_runtime_events")
          .insert(rows as never);
        if (error) continue;
        const keys = events.map((e) => e.__k).filter((k): k is number => typeof k === "number");
        await markEventsUploaded(keys);
        uploadedEvents += events.length;
      } catch {
        continue;
      }
      // Patch the incidents row with recovery metadata.
      const observedOffline = events.some(
        (e) => e.eventName === "NETWORK_OFFLINE" || e.navigatorOnline === false,
      );
      const maxSeq = events.reduce(
        (m, e) => (e.monotonicSequence > m ? e.monotonicSequence : m),
        0,
      );
      try {
        await supabase
          .from("client_runtime_incidents")
          .update({
            recovered_from_local_capsule: true,
            recovery_upload_completed_at: new Date().toISOString(),
            last_local_capsule_sequence: maxSeq,
            network_lost_observed: observedOffline || undefined,
          } as never)
          .eq("correlation_id", cap.voiceCrashIncidentId);
      } catch {
        /* diagnostic; swallow */
      }
      await markCapsuleUploaded(cap.voiceCrashIncidentId);
      uploadedCapsules += 1;
    }
  } finally {
    uploadInFlight = false;
  }
  return { uploadedCapsules, uploadedEvents };
}

// ── Network state listeners + module boot ──────────────────────────

let booted = false;

/**
 * Install online/offline/pageshow listeners and run an initial recovery
 * scan. Safe to call once at module load, before React mounts.
 */
export function bootVoiceCrashCapsule(
  emit: (name: string, severity: string, payload?: Record<string, unknown>) => void,
): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const snapshot = () => ({
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    ...connectionSnapshot(),
    ts: Date.now(),
  });

  emit("NETWORK_STATUS_SNAPSHOT", "info", snapshot());

  window.addEventListener("online", () => {
    emit("NETWORK_ONLINE", "info", snapshot());
    void uploadUnresolvedCapsules("online-event").then((r) => {
      if (r.uploadedCapsules > 0 || r.uploadedEvents > 0) {
        emit("CAPSULE_UPLOAD_COMPLETED", "info", r);
      }
    });
  });
  window.addEventListener("offline", () => {
    emit("NETWORK_OFFLINE", "warn", snapshot());
  });
  window.addEventListener("pageshow", () => {
    void uploadUnresolvedCapsules("pageshow").then((r) => {
      if (r.uploadedCapsules > 0 || r.uploadedEvents > 0) {
        emit("CAPSULE_RECOVERED_AFTER_BOOT", "warn", r);
      }
    });
  });

  const conn = (navigator as Navigator & {
    connection?: { addEventListener?: (t: string, l: () => void) => void };
  }).connection;
  if (conn && typeof conn.addEventListener === "function") {
    try {
      conn.addEventListener("change", () => {
        emit("NETWORK_STATUS_SNAPSHOT", "info", snapshot());
      });
    } catch {
      /* noop */
    }
  }

  // Initial recovery scan (fires on every boot).
  void uploadUnresolvedCapsules("boot").then((r) => {
    if (r.uploadedCapsules > 0 || r.uploadedEvents > 0) {
      emit("CAPSULE_RECOVERED_AFTER_BOOT", "warn", r);
    }
  });
}

/**
 * Called by runtimeTracer whenever a user session is (re)authenticated
 * so we can flush any capsules that outlived a signed-out interval.
 */
export function onAuthenticatedSessionRestored(
  emit: (name: string, severity: string, payload?: Record<string, unknown>) => void,
): void {
  void uploadUnresolvedCapsules("auth-session-restored").then((r) => {
    if (r.uploadedCapsules > 0 || r.uploadedEvents > 0) {
      emit("CAPSULE_UPLOAD_COMPLETED", "info", r);
    }
  });
}
