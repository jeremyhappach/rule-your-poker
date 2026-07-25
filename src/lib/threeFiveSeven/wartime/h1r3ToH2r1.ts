/**
 * 3-5-7 Wartime — Targeted H1R3 → H2R1 seam instrumentation.
 *
 * Fire-and-forget emit helpers that pass through the existing wartime
 * sink (`emitWartime`). Emissions are **seam-gated** so unrelated
 * rounds and games do not produce noise.
 *
 * Seam activation:
 *   - `noteH1r3CompletionObserved(dealerGameId)` — arms the seam and
 *     records the previous dealer-game identity.
 *   - `noteH2r1RoundIdentitySelected(dealerGameId)` — arms the seam
 *     when the H2/R1 row is first observed on the client.
 *
 * Seam deactivation:
 *   - `noteH2r1DealTransportSettled(dealerGameId)` — first stable
 *     settle for H2/R1 clears the seam.
 *
 * Diagnostic only. Never blocks, never mutates gameplay state.
 */

import { emitWartime, type WartimeIdentity } from './emit';

interface SeamState {
  active: boolean;
  activatedAt: number | null;
  previousDealerGameId: string | null;
  currentDealerGameId: string | null;
  settledForDealerGameId: string | null;
}

const state: SeamState = {
  active: false,
  activatedAt: null,
  previousDealerGameId: null,
  currentDealerGameId: null,
  settledForDealerGameId: null,
};

function now(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * The seam is active when either:
 *   - The previous authoritative identity was Hand 1 / Round 3, or
 *   - The current identity is Hand 2 / Round 1 before its first stable
 *     deal settle.
 * Identity is inferred from callers; callers pass `handNumber` /
 * `roundNumber` in their identity payload.
 */
export function isH1r3H2r1SeamActive(): boolean {
  return state.active;
}

export function getH1r3H2r1SeamState(): Readonly<SeamState> {
  return state;
}

export function noteH1r3CompletionObserved(dealerGameId: string | null): void {
  state.active = true;
  state.activatedAt = state.activatedAt ?? now();
  state.previousDealerGameId = dealerGameId ?? state.previousDealerGameId;
}

export function noteH2r1RoundIdentitySelected(dealerGameId: string | null): void {
  // Seam arms on the first H2/R1 sighting even if H1R3 completion was
  // missed (initial page load, reconnect).
  if (!state.active) {
    state.active = true;
    state.activatedAt = now();
  }
  state.currentDealerGameId = dealerGameId ?? state.currentDealerGameId;
}

export function noteH2r1DealTransportSettled(dealerGameId: string | null): void {
  state.settledForDealerGameId = dealerGameId ?? state.settledForDealerGameId;
  // First stable settle closes the seam.
  state.active = false;
}

export interface H1r3H2r1Identity extends WartimeIdentity {
  roundNumber?: number | null;
  currentGameUuid?: string | null;
  currentRoundId?: string | null;
  currentRoundStatus?: string | null;
  sourceRoundId?: string | null;
  sourceHandNumber?: number | null;
  sourceRoundNumber?: number | null;
  playerId?: string | null;
  playerPosition?: number | null;
  isLocalPlayer?: boolean | null;
}

export interface EmitH1r3H2r1Options {
  eventName: string;
  sourceSiteId: string;
  identity: H1r3H2r1Identity;
  payload?: Record<string, unknown>;
  /** Emit even when the seam is not armed (used by activator sites). */
  forceEmit?: boolean;
}

/**
 * Fire-and-forget emit for the H1R3 → H2R1 seam. Silently no-ops when
 * the seam is inactive (unless `forceEmit` is set).
 */
export function emitH1r3ToH2r1(opts: EmitH1r3H2r1Options): void {
  if (!opts.forceEmit && !state.active) return;
  try {
    const { roundNumber, currentGameUuid, currentRoundId, currentRoundStatus,
      sourceRoundId, sourceHandNumber, sourceRoundNumber, playerId, playerPosition,
      isLocalPlayer, ...envIdentity } = opts.identity;
    emitWartime({
      eventName: opts.eventName,
      sourceSiteId: opts.sourceSiteId,
      identity: envIdentity,
      payload: {
        ...(opts.payload ?? {}),
        h1r3h2r1SeamActive: state.active,
        h1r3h2r1SeamActivatedAt: state.activatedAt,
        h1r3h2r1PreviousDealerGameId: state.previousDealerGameId,
        h1r3h2r1CurrentDealerGameId: state.currentDealerGameId,
        roundNumber: roundNumber ?? null,
        currentGameUuid: currentGameUuid ?? null,
        currentRoundId: currentRoundId ?? null,
        currentRoundStatus: currentRoundStatus ?? null,
        sourceRoundId: sourceRoundId ?? null,
        sourceHandNumber: sourceHandNumber ?? null,
        sourceRoundNumber: sourceRoundNumber ?? null,
        playerId: playerId ?? null,
        playerPosition: playerPosition ?? null,
        isLocalPlayer: isLocalPlayer ?? null,
      },
    });
  } catch {
    /* fire-and-forget */
  }
}

/** Parse `${dealerGameId}#h${N}#r${M}` waveContextId. */
export function parseWaveContextId(waveContextId: string): {
  dealerGameId: string | null;
  handNumber: number | null;
  roundNumber: number | null;
} {
  const dgId = waveContextId.split('#')[0] ?? null;
  const h = waveContextId.match(/#h(\d+)/)?.[1];
  const r = waveContextId.match(/#r(\d+)/)?.[1];
  return {
    dealerGameId: dgId,
    handNumber: h ? Number(h) : null,
    roundNumber: r ? Number(r) : null,
  };
}
