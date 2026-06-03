import { useEffect, useRef } from 'react';
import { ginTrace } from '@/lib/ginStartupTrace';

interface Props {
  gameStatus: string | null;
  gameType: string | null;
  currentGameUuid: string | null;
  currentRoundId: string | null;
  currentRoundDealerGameId: string | null;
  currentRoundHandNumber: number | null;
  hasGinRummyState: boolean;
  isInProgress: boolean;
  isAnteDecision: boolean;
  isGinRummyDealerSelection: boolean;
  isGinRummyGameOver: boolean;
  effectivePropRoundId: string;
  effectivePropDealerGameId: string | null;
}

/**
 * Pure instrumentation: emits ginTrace events whenever any input to the
 * Gin identity gate changes. Lets us reconstruct the timeline of:
 *   dealer_selected → currentRound created → currentRound.id →
 *   currentRound.dealer_game_id → gating phase flips → propRoundId non-empty
 */
export function GinIdentityGateTracer(props: Props) {
  const prev = useRef<Props | null>(null);

  useEffect(() => {
    const p = prev.current;
    const changes: Record<string, unknown> = {};
    let any = false;
    (Object.keys(props) as (keyof Props)[]).forEach((k) => {
      const cur = props[k] as unknown;
      const old = p ? (p[k] as unknown) : undefined;
      if (!p || cur !== old) {
        changes[k as string] = cur;
        any = true;
      }
    });
    if (!any) return;
    ginTrace('gin.identity-gate change', {
      firstSnapshot: p === null,
      ...changes,
      // Always include effective gating verdict
      effectivePropRoundIdNonEmpty: !!props.effectivePropRoundId,
      effectivePropDealerGameIdNonNull: props.effectivePropDealerGameId != null,
    });
    prev.current = props;
  });

  return null;
}
