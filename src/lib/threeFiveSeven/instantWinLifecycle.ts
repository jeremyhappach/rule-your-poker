/**
 * 3-5-7 Instant Dealer Win — persistent lifecycle instrumentation.
 *
 * Single correlationId per instant-win lifecycle, strictly monotonic
 * sequenceNumber, and previousLifecycleEvent on every event. Every
 * emission is persisted synchronously to `debug_events` so that a
 * single repro produces a complete forensic chain with zero ambiguity
 * about where execution stopped.
 *
 * Do NOT remove existing `trace357InstantWin` events — this is additive.
 */
import { supabase } from "@/integrations/supabase/client";

type Payload = Record<string, unknown>;

type Ctx = {
  correlationId: string;
  sequence: number;
  previous: string | null;
  startedAt: number;
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  playerId: string | null;
  viewerId: string | null;
};

let ACTIVE: Ctx | null = null;

function makeCorrelationId(gameId: string | null): string {
  const seed = gameId ? gameId.slice(0, 8) : "orphan";
  return `iw-${seed}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureCtx(gameId: string | null): Ctx {
  if (!ACTIVE) {
    ACTIVE = {
      correlationId: makeCorrelationId(gameId),
      sequence: 0,
      previous: null,
      startedAt: Date.now(),
      gameId,
      dealerGameId: null,
      roundId: null,
      handNumber: null,
      playerId: null,
      viewerId: null,
    };
  }
  return ACTIVE;
}

/** Start a fresh lifecycle. Replaces any prior ctx (previous should have ended). */
export function begin357InstantWinLifecycle(gameId: string): Ctx {
  ACTIVE = {
    correlationId: makeCorrelationId(gameId),
    sequence: 0,
    previous: null,
    startedAt: Date.now(),
    gameId,
    dealerGameId: null,
    roundId: null,
    handNumber: null,
    playerId: null,
    viewerId: null,
  };
  return ACTIVE;
}

export function has357InstantWinLifecycle(): boolean {
  return ACTIVE !== null;
}

export function get357InstantWinCorrelationId(): string | null {
  return ACTIVE?.correlationId ?? null;
}

export function end357InstantWinLifecycle(): void {
  ACTIVE = null;
}

async function fetchGameStateSnapshot(ctx: Ctx): Promise<Payload> {
  if (!ctx.gameId) return {};
  try {
    const gameP = supabase
      .from("games")
      .select(
        "status,last_round_result,game_over_at,awaiting_next_round,pending_session_end,pot,current_round,current_game_uuid",
      )
      .eq("id", ctx.gameId)
      .maybeSingle();
    const roundP = ctx.roundId
      ? supabase.from("rounds").select("status").eq("id", ctx.roundId).maybeSingle()
      : Promise.resolve({ data: null } as { data: { status?: string } | null });
    const dealerP = ctx.dealerGameId
      ? supabase.from("dealer_games").select("status").eq("id", ctx.dealerGameId).maybeSingle()
      : Promise.resolve({ data: null } as { data: { status?: string } | null });
    const [g, r, d] = await Promise.all([gameP, roundP, dealerP]);
    const game = (g as { data: Record<string, unknown> | null }).data ?? null;
    const round = (r as { data: Record<string, unknown> | null }).data ?? null;
    const dealer = (d as { data: Record<string, unknown> | null }).data ?? null;
    return {
      games_status: game?.status ?? null,
      games_last_round_result: game?.last_round_result ?? null,
      games_game_over_at: game?.game_over_at ?? null,
      games_awaiting_next_round: game?.awaiting_next_round ?? null,
      games_pending_session_end: game?.pending_session_end ?? null,
      games_pot: game?.pot ?? null,
      games_current_round_snapshot: game?.current_round ?? null,
      games_current_game_uuid: game?.current_game_uuid ?? null,
      rounds_status: round?.status ?? null,
      dealer_games_status: dealer?.status ?? null,
    };
  } catch (e) {
    return { snapshot_error: (e as Error)?.message ?? String(e) };
  }
}

export type EmitOptions = Payload & {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  playerId?: string | null;
  viewerId?: string | null;
  currentRound?: number | null;
  success?: boolean;
  exception?: unknown;
  promiseRejected?: boolean;
};

/**
 * Emit a lifecycle event. Auto-creates a ctx if none exists so late-arriving
 * global-error paths still produce a chained record with previousLifecycleEvent.
 */
export async function emit357InstantWinEvent(
  eventName: string,
  opts: EmitOptions = {},
): Promise<void> {
  try {
    const ctx = ensureCtx((opts.gameId as string | null | undefined) ?? null);
    if (opts.gameId !== undefined && opts.gameId !== null) ctx.gameId = opts.gameId;
    if (opts.dealerGameId !== undefined && opts.dealerGameId !== null) ctx.dealerGameId = opts.dealerGameId;
    if (opts.roundId !== undefined && opts.roundId !== null) ctx.roundId = opts.roundId;
    if (opts.handNumber !== undefined && opts.handNumber !== null) ctx.handNumber = opts.handNumber;
    if (opts.playerId !== undefined && opts.playerId !== null) ctx.playerId = opts.playerId;
    if (opts.viewerId !== undefined && opts.viewerId !== null) ctx.viewerId = opts.viewerId;

    const sequence = ++ctx.sequence;
    const previous = ctx.previous;
    ctx.previous = eventName;

    const now = Date.now();
    const state = await fetchGameStateSnapshot(ctx);

    const err = opts.exception as
      | { name?: string; message?: string; stack?: string }
      | undefined
      | null
      | string;
    const errName =
      typeof err === "object" && err && "name" in err ? (err as { name?: string }).name ?? null : null;
    const errMessage =
      typeof err === "string"
        ? err
        : typeof err === "object" && err && "message" in err
          ? (err as { message?: string }).message ?? null
          : null;
    const errStack =
      typeof err === "object" && err && "stack" in err ? (err as { stack?: string }).stack ?? null : null;

    const {
      gameId: _gid,
      dealerGameId: _dgid,
      roundId: _rid,
      handNumber: _hn,
      playerId: _pid,
      viewerId: _vid,
      currentRound: _cr,
      success: _s,
      exception: _e,
      promiseRejected: _pr,
      ...rest
    } = opts;

    const payload = {
      correlationId: ctx.correlationId,
      sequenceNumber: sequence,
      previousLifecycleEvent: previous,
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - ctx.startedAt,
      gameId: ctx.gameId,
      dealerGameId: ctx.dealerGameId,
      roundId: ctx.roundId,
      handNumber: ctx.handNumber,
      currentGameUuid: ctx.dealerGameId,
      currentRound: (opts.currentRound ?? (state.games_current_round_snapshot as number | null | undefined)) ?? null,
      playerId: ctx.playerId,
      viewerId: ctx.viewerId,
      eventName,
      success: opts.success ?? (err ? false : true),
      exceptionName: errName,
      exceptionMessage: errMessage,
      exceptionStack: errStack,
      promiseRejected: opts.promiseRejected ?? false,
      games_status: state.games_status ?? null,
      rounds_status: state.rounds_status ?? null,
      dealer_games_status: state.dealer_games_status ?? null,
      games_last_round_result: state.games_last_round_result ?? null,
      games_game_over_at: state.games_game_over_at ?? null,
      games_awaiting_next_round: state.games_awaiting_next_round ?? null,
      games_pending_session_end: state.games_pending_session_end ?? null,
      games_pot: state.games_pot ?? null,
      ...rest,
    };

    await supabase.from("debug_events").insert({
      event_type: `357.instant_win.${eventName}`,
      game_id: ctx.gameId,
      round_id: ctx.roundId,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch {
    /* diagnostic-only — never throw */
  }
}

/**
 * Wrap an awaited Supabase (or arbitrary) operation with begin/complete
 * lifecycle events. Emits `${name}.begin` before, `${name}.complete` on
 * resolve (including caller-provided completion payload), and re-throws
 * after emitting `${name}.complete` with success=false + exception details.
 */
export async function trace357Awaited<T>(
  name: string,
  op: () => Promise<T>,
  toCompletePayload?: (result: T) => Payload,
): Promise<T> {
  await emit357InstantWinEvent(`${name}.begin`);
  try {
    const result = await op();
    const extra = toCompletePayload ? toCompletePayload(result) : {};
    await emit357InstantWinEvent(`${name}.complete`, { success: true, ...extra });
    return result;
  } catch (e) {
    await emit357InstantWinEvent(`${name}.complete`, {
      success: false,
      exception: e as unknown,
    });
    throw e;
  }
}

/** Serialize a Supabase `{ data, error, status, count }` result to a compact payload. */
export function summarizeSupabaseResult(
  label: string,
  res: { data?: unknown; error?: unknown; status?: number; count?: number | null },
): Payload {
  const err = res.error as
    | { message?: string; code?: string; details?: string; hint?: string }
    | null
    | undefined;
  return {
    [`${label}_status`]: res.status ?? null,
    [`${label}_count`]: res.count ?? null,
    [`${label}_rowsWritten`]: Array.isArray(res.data)
      ? (res.data as unknown[]).length
      : res.data
        ? 1
        : 0,
    [`${label}_returnedPayload`]: res.data ?? null,
    [`${label}_errorCode`]: err?.code ?? null,
    [`${label}_errorMessage`]: err?.message ?? null,
    [`${label}_errorDetails`]: err?.details ?? null,
    [`${label}_errorHint`]: err?.hint ?? null,
  };
}

// ── Global failure capture ────────────────────────────────────────────
let GLOBAL_HANDLERS_INSTALLED = false;

export function install357InstantWinGlobalHandlers(): void {
  if (typeof window === "undefined" || GLOBAL_HANDLERS_INSTALLED) return;
  GLOBAL_HANDLERS_INSTALLED = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    void emit357InstantWinEvent("global_error", {
      success: false,
      promiseRejected: false,
      exception: event.error ?? { name: "ErrorEvent", message: event.message, stack: null },
      global_source: "window.onerror",
      global_filename: event.filename ?? null,
      global_lineno: event.lineno ?? null,
      global_colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    let reasonSerialized: unknown;
    try {
      reasonSerialized =
        event.reason instanceof Error
          ? {
              name: event.reason.name,
              message: event.reason.message,
              stack: event.reason.stack,
            }
          : JSON.parse(JSON.stringify(event.reason));
    } catch {
      reasonSerialized = String(event.reason);
    }
    void emit357InstantWinEvent("global_error", {
      success: false,
      promiseRejected: true,
      exception: event.reason,
      global_source: "window.onunhandledrejection",
      global_reason_serialized: reasonSerialized,
    });
  });
}
