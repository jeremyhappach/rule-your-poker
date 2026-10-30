import { useEffect, useRef, useState } from 'react';

/** Reading dwell after exposed opponents paint; never a settlement timer. */
export function useHolmShowdownDelay(hand: string | null | undefined, exposed: boolean, delayMs: number) {
  const receipt = useRef<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);
  useEffect(() => {
    if (!hand || !exposed || receipt.current === hand) return;
    let cancelled = false;
    let timer: number | null = null;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        // Only a completed dwell is durable. Cleanup of a pending attempt
        // must leave this hand eligible to rearm on the next valid frame.
        receipt.current = hand;
        setCompleted(hand);
      }, delayMs);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [hand, exposed, delayMs]);
  return completed === hand;
}
