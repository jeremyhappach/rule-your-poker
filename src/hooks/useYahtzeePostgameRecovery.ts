import {useCallback, useEffect, useRef, useState} from 'react';
import {advanceYahtzeePostgame} from '@/lib/yahtzeeAuthority';
import {useCompletionRetry} from './useCompletionRetry';

type Scope = Parameters<typeof advanceYahtzeePostgame>[0];
const keyOf = (s: Scope) => `${s.gameId}:${s.dealerGameId}:${s.roundId}:${s.handNumber}`;

/** Presentation completes once. Only its immutable authority request is retried. */
export function useYahtzeePostgameRecovery(gameId: string | undefined, paused: boolean, refresh: () => unknown) {
  const [pending, setPending] = useState<{scope: Scope; key: string} | null>(null);
  const session = useRef(gameId); session.current = gameId;
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const retry = useCompletionRetry(`${gameId}:${pending?.key ?? 'idle'}`);
  const enqueue = useCallback((scope: Scope) => {
    if (scope.gameId !== session.current) return;
    const key = keyOf(scope);
    setPending(previous => previous?.key === key ? previous : {scope: {...scope}, key});
  }, []);
  useEffect(() => {
    if (!pending || pending.scope.gameId !== gameId || paused) return;
    const receipt = retry.begin();
    if (!receipt) return;
    void advanceYahtzeePostgame(pending.scope).then(() => receipt.succeed(() => {
      setPending(current => current?.key === pending.key ? null : current);
      void refreshRef.current();
    })).catch(error => receipt.fail(() => {
      console.error('[YAHTZEE] Exact postgame request failed; retaining recovery receipt', error);
      void refreshRef.current();
    }));
  }, [gameId, paused, pending, retry.revision, retry.begin]);
  return enqueue;
}
