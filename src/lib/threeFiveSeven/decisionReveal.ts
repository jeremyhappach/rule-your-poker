export const THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING = {
  countLeadInMs: 1000,
  countBeatMs: 900,
  dropMs: 1000,
  holdMs: 600,
  continuationDwellMs: 4000,
} as const;

export interface ThreeFiveSevenDecisionRevealWindow {
  id: string;
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: number;
  startedAtMs: number;
  countdownAtMs: number;
  dropAtMs: number;
  endsAtMs: number;
  continuationAtMs: number;
  /** Populated only by the exact-round server response after disclosure. */
  resolvedDecisions?: Readonly<Record<string, 'stay' | 'fold'>> | null;
}

export interface ThreeFiveSevenDecisionRevealClock {
  window: ThreeFiveSevenDecisionRevealWindow;
  serverOffsetMs: number;
  disclosureNotBeforeLocalMs?: number;
}

export type ThreeFiveSevenDecisionRevealBeat = 'locked' | '3' | '2' | '1' | 'DROP' | 'hold' | 'expired';

export interface ThreeFiveSevenDecisionRevealFrame {
  beat: ThreeFiveSevenDecisionRevealBeat;
  active: boolean;
  secrecyOpen: boolean;
  dropProgress: number;
  authoritativeNowMs: number;
}

export interface ThreeFiveSevenFoldedSeatCardBackGuardInput {
  /** True when the authoritative/player projection says this seat folded. */
  folded: boolean;
  /** The exact current round owns an admitted decision-reveal tableau. */
  decisionRevealRoundActive: boolean;
  /** A result/terminal presentation is now visible or has been reconstructed. */
  resultPresentationVisible: boolean;
}

/**
 * Retire only the ordinary seat-card-back fallback for a resolved fold.
 *
 * The dedicated decision-reveal stack remains the canonical 3-2-1-DROP
 * transition. Before that tableau or a resolved result is admitted, the
 * ordinary seat backs stay mounted even when a local projection already knows
 * that a player folded.
 */
export function shouldRetireThreeFiveSevenFoldedSeatCardBacks({
  folded,
  decisionRevealRoundActive,
  resultPresentationVisible,
}: ThreeFiveSevenFoldedSeatCardBackGuardInput): boolean {
  return folded && (decisionRevealRoundActive || resultPresentationVisible);
}

export function revealStackDepthPx(cardCount: number): number {
  return Math.min(6, Math.max(0, Math.round(cardCount) - 1));
}

export function revealDealerBubbleOrientation(
  dealerUserId: string,
  currentUserId?: string,
): 'local' | 'remote' {
  return dealerUserId === currentUserId ? 'local' : 'remote';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requiredInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseThreeFiveSevenDecisionRevealWindow(
  raw: unknown,
): ThreeFiveSevenDecisionRevealWindow | null {
  if (raw == null) return null;
  if (!isRecord(raw)) throw new Error('three_five_seven_decision_reveal:malformed_window');

  const id = requiredString(raw.id);
  const gameId = requiredString(raw.game_id);
  const dealerGameId = requiredString(raw.dealer_game_id);
  const roundId = requiredString(raw.round_id);
  const handNumber = requiredInteger(raw.hand_number);
  const roundNumber = requiredInteger(raw.round_number);
  const startedAtMs = timestampMs(raw.started_at);
  const countdownAtMs = timestampMs(raw.countdown_at) ?? startedAtMs;
  const dropAtMs = timestampMs(raw.drop_at);
  const endsAtMs = timestampMs(raw.ends_at);
  const continuationAtMs = timestampMs(raw.continuation_at);
  let resolvedDecisions: Record<string, 'stay' | 'fold'> | null = null;
  if (raw.resolved_decisions != null) {
    if (!isRecord(raw.resolved_decisions)) {
      throw new Error('three_five_seven_decision_reveal:malformed_decisions');
    }
    resolvedDecisions = Object.create(null) as Record<string, 'stay' | 'fold'>;
    for (const [playerId, decision] of Object.entries(raw.resolved_decisions)) {
      if (!playerId || (decision !== 'stay' && decision !== 'fold')) {
        throw new Error('three_five_seven_decision_reveal:malformed_decisions');
      }
      resolvedDecisions[playerId] = decision;
    }
    Object.freeze(resolvedDecisions);
  }

  if (
    !id || !gameId || !dealerGameId || !roundId || handNumber == null || roundNumber == null
    || startedAtMs == null || countdownAtMs == null || dropAtMs == null || endsAtMs == null || continuationAtMs == null
    || !(startedAtMs <= countdownAtMs && countdownAtMs < dropAtMs && dropAtMs < endsAtMs && endsAtMs < continuationAtMs)
  ) {
    throw new Error('three_five_seven_decision_reveal:malformed_window');
  }

  return {
    id,
    gameId,
    dealerGameId,
    roundId,
    handNumber,
    roundNumber,
    startedAtMs,
    countdownAtMs,
    dropAtMs,
    endsAtMs,
    continuationAtMs,
    resolvedDecisions,
  };
}

export function sampleThreeFiveSevenServerOffset(
  serverNow: unknown,
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
): number {
  const serverNowMs = timestampMs(serverNow);
  if (serverNowMs == null) throw new Error('three_five_seven_decision_reveal:malformed_server_now');
  return serverNowMs - ((requestStartedAtMs + responseReceivedAtMs) / 2);
}

export function reconcileThreeFiveSevenDecisionRevealClock(
  current: ThreeFiveSevenDecisionRevealClock | null,
  incoming: ThreeFiveSevenDecisionRevealWindow | null,
  serverOffsetMs: number,
  exactRoundId: string | null,
  serverNow?: string,
  responseReceivedAtMs?: number,
): ThreeFiveSevenDecisionRevealClock | null {
  if (!incoming) {
    return current && current.window.roundId === exactRoundId ? current : null;
  }
  if (incoming.roundId !== exactRoundId) {
    throw new Error('three_five_seven_decision_reveal:round_identity_mismatch');
  }
  // Schedule a refused/early disclosure read from the server's remaining delay,
  // not from the estimated midpoint clock (which can run ahead under latency).
  const serverNowMs = timestampMs(serverNow);
  const disclosureNotBeforeLocalMs = !incoming.resolvedDecisions && serverNowMs != null
    && responseReceivedAtMs != null && serverNowMs < incoming.dropAtMs
    ? responseReceivedAtMs + incoming.dropAtMs - serverNowMs
    : undefined;
  if (current?.window.id === incoming.id) {
    // The identity is stable, but pause authority may shift the derived
    // timestamps via presentation_fallback_at. Refreshing that immutable
    // projection resumes rather than restarts the exact same ritual.
    if (current.window.gameId !== incoming.gameId
      || current.window.dealerGameId !== incoming.dealerGameId
      || current.window.handNumber !== incoming.handNumber
      || current.window.roundNumber !== incoming.roundNumber) {
      throw new Error('three_five_seven_decision_reveal:scope_identity_mismatch');
    }
    if (current.window.resolvedDecisions && incoming.resolvedDecisions
      && JSON.stringify(Object.entries(current.window.resolvedDecisions).sort())
        !== JSON.stringify(Object.entries(incoming.resolvedDecisions).sort())) {
      throw new Error('three_five_seven_decision_reveal:conflicting_snapshot');
    }
    return {
      window: { ...incoming, resolvedDecisions: incoming.resolvedDecisions ?? current.window.resolvedDecisions },
      serverOffsetMs,
      disclosureNotBeforeLocalMs,
    };
  }
  return { window: incoming, serverOffsetMs, disclosureNotBeforeLocalMs };
}

export function deriveThreeFiveSevenDecisionRevealFrame(
  clock: ThreeFiveSevenDecisionRevealClock,
  localNowMs: number,
): ThreeFiveSevenDecisionRevealFrame {
  const { window, serverOffsetMs } = clock;
  const authoritativeNowMs = localNowMs + serverOffsetMs;
  const elapsed = Math.max(0, authoritativeNowMs - window.countdownAtMs);
  const countBeatMs = THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.countBeatMs;
  let beat: ThreeFiveSevenDecisionRevealBeat;
  if (authoritativeNowMs >= window.endsAtMs) beat = 'expired';
  else if (authoritativeNowMs >= window.dropAtMs + THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.dropMs) beat = 'hold';
  else if (authoritativeNowMs >= window.dropAtMs) beat = 'DROP';
  else if (authoritativeNowMs < window.countdownAtMs) beat = 'locked';
  else if (elapsed >= countBeatMs * 2) beat = '1';
  else if (elapsed >= countBeatMs) beat = '2';
  else beat = '3';

  return {
    beat,
    active: beat !== 'expired',
    secrecyOpen: authoritativeNowMs >= window.dropAtMs,
    dropProgress: Math.max(0, Math.min(1,
      (authoritativeNowMs - window.dropAtMs) / THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.dropMs,
    )),
    authoritativeNowMs,
  };
}

export function remainingThreeFiveSevenContinuationDelayMs(
  clock: ThreeFiveSevenDecisionRevealClock,
  localNowMs: number,
): number {
  return Math.max(0, clock.window.continuationAtMs - (localNowMs + clock.serverOffsetMs));
}

export function parseThreeFiveSevenDecisionRevealReceipt(
  raw: unknown,
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
): { window: ThreeFiveSevenDecisionRevealWindow; serverOffsetMs: number } | null {
  if (!isRecord(raw) || raw.decision_reveal == null) return null;
  const window = parseThreeFiveSevenDecisionRevealWindow(raw.decision_reveal);
  if (!window) return null;
  return {
    window,
    serverOffsetMs: sampleThreeFiveSevenServerOffset(
      raw.server_now,
      requestStartedAtMs,
      responseReceivedAtMs,
    ),
  };
}
