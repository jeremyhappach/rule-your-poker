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

export function getCanonicalTimerEligibility({
  gameType,
  dealPhase,
  dealSettled,
  readyReleased,
  activePlayerId,
}: TimerEligibilityInput): TimerEligibility {
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