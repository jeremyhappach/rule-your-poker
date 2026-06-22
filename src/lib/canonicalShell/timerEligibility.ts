import type { DealPhase } from '@/lib/canonicalShell/cardTransport/types';

export interface TimerEligibilityInput {
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
  dealPhase,
  dealSettled,
  readyReleased,
  activePlayerId,
}: TimerEligibilityInput): TimerEligibility {
  const visible = dealPhase === 'READY' || dealPhase === 'GAMEPLAY';
  const running =
    dealPhase === 'GAMEPLAY' &&
    dealSettled === true &&
    readyReleased === true &&
    !!activePlayerId;

  return { visible, running };
}