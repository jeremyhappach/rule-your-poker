import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { approvedCountdownBeat } from '@/lib/audio/approvedSounds';
import { platformAudio } from '@/lib/audio/platformAudio';
import { isSoundSurfaceVisible } from '@/lib/audio/presentationSound';

const firstSecond = 10;
// The shared Words clock ticks every 100 ms. A sample well past an onset is history.
const liveOnsetMs = 250;

export function useWordsCountdown(identity: string | null, deadline: number, now: number, surface: RefObject<HTMLElement>, connected: boolean) {
  const remaining = identity ? deadline - now : 0;
  const seconds = Math.ceil(remaining / 1000);
  const sample = useRef<{ identity: string | null; deadline: number; seconds: number } | null>(null);

  useEffect(() => {
    const reset = () => { sample.current = null; };
    window.addEventListener('pagehide', reset);
    window.addEventListener('pageshow', reset);
    window.addEventListener('offline', reset);
    window.addEventListener('online', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('pageshow', reset);
      window.removeEventListener('offline', reset);
      window.removeEventListener('online', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, []);

  useLayoutEffect(() => {
    const previous = sample.current;
    sample.current = !connected || document.hidden || !navigator.onLine ? null : { identity, deadline, seconds };
    if (!sample.current || !identity || seconds < 1 || seconds > firstSecond) return;
    if (previous?.identity !== identity || previous.deadline !== deadline || previous.seconds !== seconds + 1) return;
    if (seconds * 1000 - remaining > liveOnsetMs) return;

    const { userId } = platformAudio.getSnapshot();
    if (!userId) return;
    const beat = isSoundSurfaceVisible(surface.current) ? approvedCountdownBeat(String(Math.min(3, seconds))) : undefined;
    const cue = beat ? {
      ...beat,
      // Match the placement cue's priority so the mixer can play both together.
      policy: beat.policy && { ...beat.policy, priority: 45 },
      schedule: (context: AudioContext, destination: AudioNode, track: Parameters<typeof beat.schedule>[2]) => {
        if (seconds <= 3) return beat.schedule(context, destination, track);
        const gain = track(context.createGain());
        gain.gain.value = 0.55;
        gain.connect(destination);
        return beat.schedule(context, gain, track);
      },
    } : undefined;
    platformAudio.present({ userId, id: `words:countdown:${identity}:${seconds}`, cue });
  }, [identity, deadline, seconds, remaining, surface, connected]);

  return seconds >= 1 && seconds <= firstSecond ? seconds : null;
}
