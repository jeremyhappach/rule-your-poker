import {useEffect, useLayoutEffect, useRef} from 'react';
import type {ApprovedSound} from '@/lib/audio/approvedSounds';
import {presentSound} from '@/lib/audio/presentationSound';

/** A presentation receipt, never a gameplay owner. Initial state is history;
 * interruptions retire pending audio and the first recovery snapshot. */
export function useLiveSoundEvent(identity:string|null, ready:boolean, sound:ApprovedSound, surface:()=>Element|null) {
  const receipt = useRef({identity, consumed:true, recovering:false});
  const start = (visibleSurface?:Element|null) => {
    if (!identity || receipt.current.identity !== identity || receipt.current.consumed) return;
    receipt.current.consumed = true;
    presentSound(sound, identity, visibleSurface === undefined ? surface() : visibleSurface);
  };
  useEffect(() => {
    const retire = () => { receipt.current.consumed = true; receipt.current.recovering = true; };
    const hidden = () => { if (document.hidden) retire(); };
    window.addEventListener('offline', retire); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('offline', retire); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  useLayoutEffect(() => {
    const previous = receipt.current;
    if (previous.identity !== identity) receipt.current = {
      identity, consumed:previous.recovering || document.hidden || !navigator.onLine,
      recovering:identity === null && previous.recovering,
    };
    if (ready) start();
  }, [identity, ready, sound, surface]);
  return start;
}
