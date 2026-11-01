import {useEffect, useLayoutEffect, useRef} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {cardSwooshCueAt} from '@/lib/audio/cardSwoosh';

interface Props {
  userId: string; scope: string; epoch: number; active: boolean; replay: boolean;
  view: {cards: (number | null)[]; removed: number[]; waste: number; stockRemaining: number; phase: string};
}

/** Confirmed gameplay deltas own sound even when upcards appear immediately or motion is reduced. */
export function useTriCardAudio({userId, scope, epoch, active, replay, view: v}: Props) {
  const prior = useRef<Props | null>(null);
  useLayoutEffect(() => {
    const p = prior.current;
    const enabled = active && !replay && !document.hidden;
    const same = p?.scope === scope && p.userId === userId && p.epoch === epoch;
    const regressive = same && (p.view.removed.some(i => !v.removed.includes(i)) || v.stockRemaining > p.view.stockRemaining);
    if (regressive) return;
    if (same && enabled && p.active && ['ready', 'playing'].includes(p.view.phase)) {
      const removed = v.removed.filter(i => !p.view.removed.includes(i));
      const played = removed.length === 1 && p.view.cards[removed[0]] === v.waste && v.stockRemaining === p.view.stockRemaining;
      const drew = removed.length === 0 && v.stockRemaining === p.view.stockRemaining - 1;
      if (played || drew) {
        // A generous dispatch deadline is separate from the 98ms source lifetime;
        // expiry/receipts still prevent catch-up after an interruption or remount.
        platformAudio.request({userId, id: `tri-card:${scope}:${v.removed.length}:${v.stockRemaining}:${v.waste}`,
          expiresAt: performance.now() + 125, cue: cardSwooshCueAt(0, 100)});
      }
    }
    prior.current = {userId, scope, epoch, active: enabled, replay, view: v};
  }, [userId, scope, epoch, active, replay, v.cards, v.removed, v.waste, v.stockRemaining, v.phase]);
  useEffect(() => {
    const retire = () => { prior.current = null; };
    const hidden = () => { if (document.hidden) retire(); };
    window.addEventListener('offline', retire);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('offline', retire); document.removeEventListener('visibilitychange', hidden); };
  }, []);
}
