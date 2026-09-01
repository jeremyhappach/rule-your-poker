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
}

export interface ThreeFiveSevenDecisionRevealClock {
  window: ThreeFiveSevenDecisionRevealWindow;
  serverOffsetMs: number;
}

export type ThreeFiveSevenDecisionRevealBeat = 'locked' | '3' | '2' | '1' | 'DROP' | 'hold' | 'expired';

export interface ThreeFiveSevenDecisionRevealFrame {
  beat: ThreeFiveSevenDecisionRevealBeat;
  active: boolean;
  secrecyOpen: boolean;
  dropProgress: number;
  authoritativeNowMs: number;
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
): ThreeFiveSevenDecisionRevealClock | null {
  if (!incoming) {
    return current && current.window.roundId === exactRoundId ? current : null;
  }
  if (incoming.roundId !== exactRoundId) {
    throw new Error('three_five_seven_decision_reveal:round_identity_mismatch');
  }
  if (current?.window.id === incoming.id) {
    // The identity is stable, but pause authority may shift the derived
    // timestamps via presentation_fallback_at. Refreshing that immutable
    // projection resumes rather than restarts the exact same ritual.
    return { window: incoming, serverOffsetMs };
  }
  return { window: incoming, serverOffsetMs };
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
