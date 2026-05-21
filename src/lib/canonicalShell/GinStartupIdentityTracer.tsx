import { useEffect, useRef } from 'react';
import { ginTrace } from '@/lib/ginStartupTrace';

interface Props {
  currentGameUuid: string | null;
  currentRoundId: string | null;
  currentRoundDealerGameId: string | null;
}

/**
 * Logs the exact moments the two identity inputs to the readyToMount gate
 * become non-null / change, relative to gin T0. Pure instrumentation.
 */
export function GinStartupIdentityTracer({
  currentGameUuid,
  currentRoundId,
  currentRoundDealerGameId,
}: Props) {
  const lastUuidRef = useRef<string | null>(null);
  const lastRoundRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentGameUuid !== lastUuidRef.current) {
      ginTrace('game.current_game_uuid changed', {
        prev: lastUuidRef.current?.slice(0, 8) ?? null,
        next: currentGameUuid?.slice(0, 8) ?? null,
      });
      lastUuidRef.current = currentGameUuid;
    }
  }, [currentGameUuid]);

  useEffect(() => {
    if (currentRoundId !== lastRoundRef.current) {
      ginTrace('currentRound.id changed', {
        prev: lastRoundRef.current?.slice(0, 8) ?? null,
        next: currentRoundId?.slice(0, 8) ?? null,
        roundDealerGameId: currentRoundDealerGameId?.slice(0, 8) ?? null,
        scopeMatch:
          currentRoundDealerGameId != null &&
          currentGameUuid != null &&
          currentRoundDealerGameId === currentGameUuid,
      });
      lastRoundRef.current = currentRoundId;
    }
  }, [currentRoundId, currentRoundDealerGameId, currentGameUuid]);

  return null;
}
