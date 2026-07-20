/**
 * 3-5-7 Instant Dealer Win — minimal terminal diagnostics.
 *
 * The full wartime lifecycle instrumentation was retired after it
 * conclusively proved the missing lifecycle edges (see git history).
 * Persistent instrumentation on the gameplay critical path is
 * forbidden — every awaited `debug_events` insert compounded into a
 * multi-second stall between deal and celebration.
 *
 * This module now emits only four terminal events, all fire-and-forget:
 *
 *   - `357.instant_win.detected`               (backend, right after has357Hand=true)
 *   - `357.instant_win.settlement_completed`   (backend, once game_over + chips + game_results committed)
 *   - `357.instant_win.presentation_completed` (frontend, once celebration finished)
 *   - `357.instant_win.failed`                 (either side, on error)
 *
 * Every emission returns immediately; the DB insert runs in the
 * background and its promise is intentionally swallowed. Gameplay
 * MUST NEVER await these calls.
 */
import { supabase } from "@/integrations/supabase/client";

export type Instant357TerminalKind =
  | "detected"
  | "settlement_completed"
  | "presentation_completed"
  | "failed";

export interface Instant357TerminalPayload {
  correlationId?: string | null;
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  winnerPlayerId?: string | null;
  eventKind?: string | null;
  error?: unknown;
  [key: string]: unknown;
}

/**
 * Fire-and-forget terminal diagnostic. Never awaits, never throws.
 * Do NOT add pre-op / begin-op instrumentation here — this is the
 * ONLY approved persistent surface for the instant-win path.
 */
export function emit357InstantWinTerminal(
  kind: Instant357TerminalKind,
  payload: Instant357TerminalPayload = {},
): void {
  try {
    const { error, gameId, roundId, ...rest } = payload;
    let errName: string | null = null;
    let errMessage: string | null = null;
    let errStack: string | null = null;
    if (error) {
      if (typeof error === "string") {
        errMessage = error;
      } else if (typeof error === "object") {
        const e = error as { name?: string; message?: string; stack?: string };
        errName = e.name ?? null;
        errMessage = e.message ?? null;
        errStack = e.stack ?? null;
      }
    }
    const insertPayload = {
      ...rest,
      gameId: gameId ?? null,
      roundId: roundId ?? null,
      exceptionName: errName,
      exceptionMessage: errMessage,
      exceptionStack: errStack,
      timestamp: new Date().toISOString(),
    };
    // Fire-and-forget. Swallow the returned promise so no caller can
    // accidentally await it and block gameplay.
    void supabase
      .from("debug_events")
      .insert({
        event_type: `357.instant_win.${kind}`,
        game_id: gameId ?? undefined,
        round_id: roundId ?? undefined,
        payload: insertPayload as unknown as Record<string, unknown>,
      } as never)
      .then(() => {}, () => {});
  } catch {
    /* diagnostic-only — never throw */
  }
}

/** Deterministic correlation id for a single instant-win event flight. */
export function make357InstantWinCorrelationId(gameId: string | null): string {
  const seed = gameId ? gameId.slice(0, 8) : "orphan";
  return `iw-${seed}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
