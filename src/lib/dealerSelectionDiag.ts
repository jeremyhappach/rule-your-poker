/**
 * dealerSelectionDiag — persisted dealer-selection lifecycle tracer.
 *
 * Emits canonical checkpoints to the `debug_events` table so a single
 * repro can identify exactly where the dealer-selection presentation
 * path diverges from the outcome path.
 *
 * Checkpoints (all canonical, one per stage):
 *   - dealer_selection_created
 *   - dealer_selection_state_published
 *   - dealer_selection_cards_published
 *   - dealer_selection_surface_mounted
 *   - dealer_selection_animation_triggered
 *   - dealer_selection_cards_visible
 *   - dealer_selection_completed
 *   - dealer_selection_announcement_published
 *
 * Payload fields (all optional; include whichever the call site knows):
 *   sessionId, dealerGameId, dealerSelectionId, roundId, handNumber,
 *   viewerPosition, currentStatus, animationTriggerId, cardCount,
 *   winnerPosition, presentationVisibilityState, scope ('session' | 'cribbage' | string)
 *
 * Storage: appended to `public.debug_events` via a small batching queue,
 * mirroring the pattern in `lifecycleDebug.ts`. Fire-and-forget; never
 * blocks gameplay.
 */

import { supabase } from '@/integrations/supabase/client';

export type DealerSelectionCheckpoint =
  | 'dealer_selection_created'
  | 'dealer_selection_state_published'
  | 'dealer_selection_cards_published'
  | 'dealer_selection_surface_mounted'
  | 'dealer_selection_animation_triggered'
  | 'dealer_selection_cards_visible'
  | 'dealer_selection_completed'
  | 'dealer_selection_announcement_published';

export interface DealerSelectionDiagPayload {
  sessionId?: string | null;
  dealerGameId?: string | null;
  dealerSelectionId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  viewerPosition?: number | null;
  currentStatus?: string | null;
  animationTriggerId?: string | null;
  cardCount?: number | null;
  winnerPosition?: number | null;
  presentationVisibilityState?:
    | 'unmounted'
    | 'mounted-empty'
    | 'mounted-rendering'
    | 'mounted-suppressed'
    | 'visible'
    | 'cleared'
    | string
    | null;
  scope?: 'session' | 'cribbage' | string | null;
  /** Free-form extra context — kept under `extra` in the persisted payload. */
  extra?: Record<string, unknown>;
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// ── Context (caller-managed enrichment) ─────────────────────────────

interface DiagContext {
  clientSessionId: string;
  userId: string | null;
  gameId: string | null;
  viewerPosition: number | null;
  viewerRole: 'host' | 'player' | 'observer' | 'unknown';
  currentStatus: string | null;
  dealerGameId: string | null;
}

const ctx: DiagContext = {
  clientSessionId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  userId: null,
  gameId: null,
  viewerPosition: null,
  viewerRole: 'unknown',
  currentStatus: null,
  dealerGameId: null,
};

export function setDealerSelectionDiagContext(
  partial: Partial<Omit<DiagContext, 'clientSessionId'>>,
): void {
  for (const k of Object.keys(partial) as (keyof DiagContext)[]) {
    const v = (partial as any)[k];
    if (v === undefined) continue;
    (ctx as any)[k] = v;
  }
}

let userIdResolved = false;
async function ensureUserId(): Promise<void> {
  if (userIdResolved) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id && !ctx.userId) ctx.userId = data.user.id;
  } catch {
    // ignore — instrumentation must never break gameplay
  }
  userIdResolved = true;
}

// ── Persistence queue ───────────────────────────────────────────────

type Queued = {
  game_id: string;
  round_id: string | null;
  user_id: string | null;
  event_type: string;
  client_role: string;
  payload: Record<string, unknown>;
};

const queue: Queued[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await (supabase.from('debug_events') as any).insert(batch);
  } catch {
    // swallow
  }
}

function schedule(): void {
  if (queue.length >= 20) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, 400);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flush();
  });
  window.addEventListener('beforeunload', () => {
    void flush();
  });
}

// ── Public API ──────────────────────────────────────────────────────

export function recordDealerSelectionDiag(
  checkpoint: DealerSelectionCheckpoint,
  payload: DealerSelectionDiagPayload = {},
): void {
  void ensureUserId();

  const merged: Record<string, unknown> = {
    ts_client_iso: new Date().toISOString(),
    client_session_id: ctx.clientSessionId,
    checkpoint,
    sessionId: payload.sessionId ?? ctx.gameId ?? null,
    dealerGameId: payload.dealerGameId ?? ctx.dealerGameId ?? null,
    dealerSelectionId: payload.dealerSelectionId ?? null,
    roundId: payload.roundId ?? null,
    handNumber: payload.handNumber ?? null,
    viewerPosition: payload.viewerPosition ?? ctx.viewerPosition ?? null,
    currentStatus: payload.currentStatus ?? ctx.currentStatus ?? null,
    animationTriggerId: payload.animationTriggerId ?? null,
    cardCount: payload.cardCount ?? null,
    winnerPosition: payload.winnerPosition ?? null,
    presentationVisibilityState: payload.presentationVisibilityState ?? null,
    scope: payload.scope ?? null,
    viewerRole: ctx.viewerRole,
    ...(payload.extra ?? {}),
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[dealer_selection_diag] ${checkpoint}`, merged);
  }

  queue.push({
    game_id: (payload.sessionId ?? ctx.gameId ?? NIL_UUID) as string,
    round_id: payload.roundId ?? null,
    user_id: ctx.userId,
    event_type: `dealer_selection_diag.${checkpoint}`,
    client_role: ctx.viewerRole,
    payload: merged,
  });
  schedule();
}
