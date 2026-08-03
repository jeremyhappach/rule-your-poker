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
 * Holm: actionability is published by the game consumer, but DealRuntime's
 * readyReleased latch still owns when that timer may become visible. This
 * keeps an authoritative server deadline from appearing while the initial
 * card transports are still active.
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
    // Canonical animation contract: timers MUST NOT run while the
    // initial deal (hands + community + chucky) is still in flight.
    // We still defer presence (visible) to actionability, but suppress
    // visibility AND running until the deal has fully settled and
    // readyReleased = true before DealRuntime enters GAMEPLAY.
    const settled = dealSettled === true && readyReleased === true;
    return { visible: settled, running: settled && !!activePlayerId };
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
