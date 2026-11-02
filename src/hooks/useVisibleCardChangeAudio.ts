import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {presentSound} from '@/lib/audio/presentationSound';

interface Frame {scope: string; revision: number; epoch: number; active: boolean; signature: string}
/** Only adjacent, continuously viewed commits. Hydration and recovery establish
 * a baseline, never replay the cards which happen to be in the new snapshot. */
export function useVisibleCardChangeAudio(frame: Frame, kind: 'slide' | 'flip', surface: RefObject<HTMLElement>) {
  const previous = useRef<Frame | null>(null);
  useLayoutEffect(() => {
    const old = previous.current; previous.current = frame;
    if (!old?.active || !frame.active || old.scope !== frame.scope || old.epoch !== frame.epoch
      || frame.revision !== old.revision + 1 || old.signature === frame.signature) return;
    presentSound(kind, `${frame.scope}:${frame.revision}:cards`, surface.current);
  }, [frame.scope, frame.revision, frame.epoch, frame.active, frame.signature, kind, surface]);
  useEffect(() => {
    const reset = () => { previous.current = null; };
    const hidden = () => { if (document.hidden) reset(); };
    window.addEventListener('offline', reset); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('offline', reset); document.removeEventListener('visibilitychange', hidden); };
  }, []);
}
