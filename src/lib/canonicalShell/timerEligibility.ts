import type { DealPhase } from '@/lib/canonicalShell/cardTransport/types';

export interface TimerEligibilityInput {
  gameType?: string | null;
  dealPhase: DealPhase;
  dealSettled: boolean;
  readyReleased: boolean;
  activePlayerId: string | null | undefined;
}

export interface TimerEligibility {
  visible: boolean;
  running: boolean;
}

/**
 * Canonical timer eligibility.
 *
 * Holm: explicitly BYPASSES DealRuntime gating. Holm timers are derived
 * from actionability (`canPlayerAct(playerId)`) by their consumers,
 * NOT from deal phase. We return `{ visible: true, running: true }` so
 * the consumer's own actionability check controls visibility/running.
 *
 * IMPORTANT: this bypass is for TIMERS ONLY. Holm card-render gating
 * still uses DealRuntime ownership/settle (PlayerHand boundary guard,
 * community/chucky settle gating). Do not extend this bypass to card
 * visibility paths.
 *
 * 357: keep the strict GAMEPLAY + settled gate.
 *
 * Other games: legacy behavior (visible during READY/GAMEPLAY, running
 * during GAMEPLAY).
 */
export function getCanonicalTimerEligibility({
  gameType,
  dealPhase,
  dealSettled,
  readyReleased,
  activePlayerId,
}: TimerEligibilityInput): TimerEligibility {
  const isHolm = gameType === 'holm-game';
  if (isHolm) {
    // Pass-through: consumer (ActivePlayerHUD / ShellTimerRail) already
    // gates on `isActive` / `canAct`. DealRuntime must not suppress.
    return { visible: true, running: true };
  }

  const is357 = gameType === 'three-five-seven' || gameType === '3-5-7' || gameType === '3-5-7-game' || gameType === '357';
  const timerAllowed = !is357 || (dealPhase === 'GAMEPLAY' && dealSettled === true && readyReleased === true);
  const visible = timerAllowed && (dealPhase === 'READY' || dealPhase === 'GAMEPLAY');
  const running =
    timerAllowed &&
    dealPhase === 'GAMEPLAY' &&
    dealSettled === true &&
    readyReleased === true &&
    !!activePlayerId;

  return { visible, running };
}
