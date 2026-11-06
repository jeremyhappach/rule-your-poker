import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useCompletionRetry } from './useCompletionRetry';
import type { CountingTime } from '@/lib/cribbage/countingClock';
import type { CribbageState } from '@/lib/cribbageTypes';

export type CountRelease = {
  outcome: 'activated' | 'already_active' | 'presentation_pending' | 'terminal';
  presentation_release_at?: string;
  state?: CribbageState;
};

const monotonicNow = () => performance.now();

// A visible completion survives interruption. Only a fresh exact-hand clock
// may send/retry it or apply its result. Both winning and ordinary counts enter here.
export function useCribbageCountRelease(scope: string, time: CountingTime | null,
  submit: () => Promise<CountRelease>, apply: (result: CountRelease) => void, failed: (error: unknown) => void) {
  const retry = useCompletionRetry(scope, monotonicNow);
  const hand = useMemo(() => ({
    presented: false, done: false, deadlineTried: NaN, timer: undefined as ReturnType<typeof setTimeout> | undefined,
  }), [scope]);
  const live = useRef({ hand, time, retry, submit, apply, failed });
  live.current = { hand, time, retry, submit, apply, failed };
  const attempt = useCallback(async function send() {
    const current = live.current;
    const { hand, time } = current;
    if (!hand.presented || hand.done || hand.timer !== undefined || !time?.current()) return;
    const receipt = current.retry.begin();
    if (!receipt) return;
    const stillCurrent = () => live.current.hand === hand && live.current.time === time && time.current();
    try {
      const result = await current.submit();
      if (!receipt.isCurrent()) return;
      if (!stillCurrent()) {
        receipt.defer();
        if (live.current.hand === hand) void send();
        return;
      }
      if (result.outcome === 'presentation_pending') {
        const deadline = Date.parse(result.presentation_release_at ?? '');
        if (!Number.isFinite(deadline)) throw new Error('Missing Cribbage release deadline');
        const delay = time.releaseDelay(deadline);
        if (hand.deadlineTried === deadline && delay <= 25) {
          // A second pending receipt past our lower bound is uncertain, never a 25 ms request loop.
          receipt.fail(() => {});
          return;
        }
        receipt.defer();
        hand.deadlineTried = deadline;
        const due = monotonicNow() + delay;
        hand.timer = setTimeout(() => {
          hand.timer = undefined;
          if (live.current.hand === hand && live.current.time === time && time.current(monotonicNow() - due)) void send();
        }, delay);
      } else {
        current.apply(result);
        receipt.succeed(() => { hand.done = true; });
      }
    } catch (error) {
      if (!receipt.isCurrent()) return;
      if (stillCurrent()) receipt.fail(() => current.failed(error));
      else {
        receipt.defer();
        if (live.current.hand === hand) void send();
      }
    }
  }, []);
  useLayoutEffect(() => {
    if (hand.presented) void attempt();
    return () => {
      clearTimeout(hand.timer);
      hand.timer = undefined;
    };
  }, [hand, time, attempt]);
  useLayoutEffect(() => { if (retry.revision) void attempt(); }, [retry.revision, attempt]);
  return useCallback(() => {
    if (!time?.current() || live.current.hand !== hand || live.current.time !== time) return;
    hand.presented = true;
    void attempt();
  }, [hand, time, attempt]);
}
