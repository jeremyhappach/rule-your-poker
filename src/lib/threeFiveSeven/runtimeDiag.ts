/**
 * 3-5-7 Runtime-Branch Diagnostics (Release-Integrity Reconciliation).
 *
 * DIAGNOSTIC-ONLY. No behavioral effects. Never awaited, never throws.
 *
 * Every event emitted through this module carries the compile-time
 * build identity envelope (buildSha, buildTimestamp, deploymentId,
 * bundleFilename) so a `debug_events` row proves not only which
 * runtime branch executed but which build produced that branch.
 *
 * Events (A–I from the release-integrity contract):
 *   A. 357.runtime.sweep_parser_entered
 *   B. 357.runtime.show_cards_decision
 *   C. 357.runtime.sweep_wait_armed
 *   D. 357.runtime.sweep_wait_released
 *   E. 357.runtime.legs_phase_decision
 *   F. 357.runtime.pot_animation_begin
 *   G. 357.runtime.pot_animation_complete
 *   H. 357.runtime.dealer_game_boundary_reset
 *   I. 357.runtime.global_error
 */

import { supabase } from "@/integrations/supabase/client";
import { buildIdentityEnvelope } from "@/lib/buildIdentity";

export type ThreeFiveSevenRuntimeEventKind =
  | "sweep_parser_entered"
  | "show_cards_decision"
  | "sweep_wait_armed"
  | "sweep_wait_released"
  | "legs_phase_decision"
  | "pot_animation_begin"
  | "pot_animation_complete"
  | "dealer_game_boundary_reset"
  | "global_error"
  // A. Live deal ownership / transport
  | "deal_runtime_mount"
  | "wave_dispatch_decision"
  | "wave_dispatch_begin"
  | "wave_dispatch_complete"
  | "first_card_visible"
  | "full_hand_visible"
  // B. Show Cards eligibility (superset of show_cards_decision — emits
  //    every time the eligibility inputs change, incl. pre-deal flash).
  | "show_cards_eligibility_changed"
  // C. Active-hand geometry transitions
  | "active_hand_geometry_changed"
  // D. Pot destination resolution
  | "pot_destination_resolution"
  // E. Error toast invocation (the toast-producing owner boundary,
  //    complementary to window.onerror / unhandledrejection).
  | "error_toast_invoked"
  // F. Win-animation active flag transitions
  | "win_animation_active_changed"
  // G. Canonical 3-5-7 terminal-entry adapter (Slice 2). Fired ONLY from
  //    `enterCanonical357TerminalPresentation`. Diagnoses one-shot latch
  //    activation, duplicate-generation suppression, and Option-B
  //    identity-invariant mismatches between the existing normal-win
  //    identity and the descriptor-authored controller identity.
  | "canonical_entry_armed"
  | "canonical_entry_suppressed_duplicate"
  | "canonical_entry_invariant_mismatch"
  // H. Instant-357 controller (Slice 3). Emitted by the terminal
  //    controller when it takes exclusive prelude ownership for a
  //    descriptor generation, when its state machine transitions,
  //    and each time a legacy instant-win prelude entry point is
  //    behaviorally suppressed because the controller owns that
  //    generation.
  | "controller_ownership_acquired"
  | "controller_ownership_released"
  | "controller_state_transition"
  | "controller_deal_settled_signal"
  | "controller_proof_cards_complete"
  | "controller_sweep_legs_skipped"
  | "controller_sweep_legs_complete"
  | "controller_canonical_handoff"
  | "legacy_prelude_suppressed";

// ── Correlation envelope ─────────────────────────────────────────────
// A single per-page-load correlationId groups every 357.runtime.* row
// into one harness run. sequenceNumber is a monotonic counter across
// ALL runtime events (regardless of kind) so a consumer can order rows
// deterministically even when timestamps collide. previousLifecycleEvent
// is the full event_type of the previous successful runtime event and
// gives every row an explicit predecessor pointer.

function generateCorrelationId(): string {
  try {
    const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* noop */
  }
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const _correlationId: string = generateCorrelationId();
let _sequenceNumber = 0;
let _previousLifecycleEvent: string | null = null;

export function get357RuntimeCorrelationId(): string {
  return _correlationId;
}

export interface ThreeFiveSevenRuntimeIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  viewerPlayerId?: string | null;
  winnerPlayerId?: string | null;
  terminalResultIdentity?: string | null;
}

/** Last successful runtime event — surfaced by the global error handler. */
let _lastSuccessfulEvent: {
  eventType: string;
  identity: ThreeFiveSevenRuntimeIdentity;
  timestamp: string;
} | null = null;

export function getLastSuccessful357RuntimeEvent(): typeof _lastSuccessfulEvent {
  return _lastSuccessfulEvent;
}

/** Last-known terminal result identity — kept so the global error handler can attribute crashes. */
let _lastKnownTerminalResultIdentity: string | null = null;

export function setLastKnown357TerminalResultIdentity(v: string | null): void {
  _lastKnownTerminalResultIdentity = v;
}

export function getLastKnown357TerminalResultIdentity(): string | null {
  return _lastKnownTerminalResultIdentity;
}

function serializeError(err: unknown): {
  name: string | null;
  message: string | null;
  stack: string | null;
  serialized: string | null;
} {
  if (!err) return { name: null, message: null, stack: null, serialized: null };
  if (typeof err === "string") {
    return { name: null, message: err, stack: null, serialized: err };
  }
  if (typeof err === "object") {
    const e = err as { name?: string; message?: string; stack?: string };
    let serialized: string | null = null;
    try {
      serialized = JSON.stringify(err, Object.getOwnPropertyNames(err as object));
    } catch {
      try {
        serialized = String(err);
      } catch {
        serialized = null;
      }
    }
    return {
      name: e.name ?? null,
      message: e.message ?? null,
      stack: e.stack ?? null,
      serialized,
    };
  }
  return { name: null, message: null, stack: null, serialized: String(err) };
}

/**
 * Fire-and-forget writer. Stamps buildIdentity + identity fields on
 * every event. NEVER awaited, NEVER throws.
 */
export function emit357RuntimeDiag(
  kind: ThreeFiveSevenRuntimeEventKind,
  identity: ThreeFiveSevenRuntimeIdentity,
  detail: Record<string, unknown> = {},
): void {
  try {
    const envelope = buildIdentityEnvelope();
    const eventType = `357.runtime.${kind}`;
    const timestamp = new Date().toISOString();

    // Serialize any embedded `error` field consistently.
    let detailOut: Record<string, unknown> = detail;
    if ("error" in detail && detail.error !== undefined) {
      const { name, message, stack, serialized } = serializeError(detail.error);
      const { error: _drop, ...rest } = detail;
      void _drop;
      detailOut = {
        ...rest,
        exceptionName: name,
        exceptionMessage: message,
        exceptionStack: stack,
        exceptionSerialized: serialized,
      };
    }

    _sequenceNumber += 1;
    const sequenceNumber = _sequenceNumber;
    const previousLifecycleEvent = _previousLifecycleEvent;

    const insertPayload: Record<string, unknown> = {
      ...envelope,
      buildShaShort: envelope.buildSha.slice(0, 12),
      correlationId: _correlationId,
      sequenceNumber,
      previousLifecycleEvent,
      ...identity,
      timestamp,
      ...detailOut,
    };

    // Update last-successful pointer BEFORE the fire-and-forget insert so
    // the global error handler always has the freshest correlation.
    if (kind !== "global_error") {
      _lastSuccessfulEvent = { eventType, identity: { ...identity }, timestamp };
      _previousLifecycleEvent = eventType;
      if (identity.terminalResultIdentity) {
        _lastKnownTerminalResultIdentity = identity.terminalResultIdentity;
      }
    }

    void supabase
      .from("debug_events")
      .insert({
        event_type: eventType,
        game_id: identity.gameId ?? undefined,
        round_id: identity.roundId ?? undefined,
        payload: insertPayload as unknown as Record<string, unknown>,
      } as never)
      .then(
        () => {},
        () => {},
      );
  } catch {
    /* diagnostic-only — never throw */
  }
}

/** ── I. Global error surface ────────────────────────────────
 *
 *  Installs window.onerror + window.onunhandledrejection listeners
 *  that persist `357.runtime.global_error` with the last-known
 *  terminal result identity and last successful runtime event.
 *
 *  Idempotent: safe to call multiple times.
 */
let _globalHandlersInstalled = false;

export function install357RuntimeGlobalErrorHandlers(): void {
  if (_globalHandlersInstalled) return;
  if (typeof window === "undefined") return;
  _globalHandlersInstalled = true;

  try {
    window.addEventListener("error", (ev: ErrorEvent) => {
      const { name, message, stack, serialized } = serializeError(ev.error ?? ev.message);
      emit357RuntimeDiag(
        "global_error",
        {
          terminalResultIdentity: _lastKnownTerminalResultIdentity,
        },
        {
          source: "window.onerror",
          filename: ev.filename ?? null,
          lineno: ev.lineno ?? null,
          colno: ev.colno ?? null,
          exceptionName: name,
          exceptionMessage: message,
          exceptionStack: stack,
          exceptionSerialized: serialized,
          lastSuccessfulEvent: _lastSuccessfulEvent,
        },
      );
    });
    window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const { name, message, stack, serialized } = serializeError(reason);
      emit357RuntimeDiag(
        "global_error",
        {
          terminalResultIdentity: _lastKnownTerminalResultIdentity,
        },
        {
          source: "window.onunhandledrejection",
          exceptionName: name,
          exceptionMessage: message,
          exceptionStack: stack,
          exceptionSerialized: serialized,
          lastSuccessfulEvent: _lastSuccessfulEvent,
        },
      );
    });
  } catch {
    /* noop */
  }
}
