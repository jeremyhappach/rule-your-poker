import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';
import {diceLandingSound} from '@/lib/audio/approvedSounds';
import {presentSound} from '@/lib/audio/presentationSound';

export function useDiceLandingAudio(identity: string, landed: boolean, count: number, surface: RefObject<HTMLElement>) {
  const interruption = useRef<string | null>(null);
  const current = useRef(identity); current.current = identity;
  useEffect(() => {
    const retire = () => { interruption.current = current.current; };
    const hidden = () => { if (document.hidden) retire(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('offline', retire);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('offline', retire); };
  }, []);
  useLayoutEffect(() => {
    const sound = diceLandingSound(Array.from({length: count}, (_, i) => i), count);
    if (landed && sound) presentSound(sound, identity, interruption.current === identity ? null : surface.current);
  }, [identity, landed, count, surface]);
}
