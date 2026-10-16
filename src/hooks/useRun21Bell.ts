import { useEffect, useRef } from 'react';
import { platformAudio } from '@/lib/audio/platformAudio';
import { boxingBellCue } from '@/lib/run21/boxingBell';

export function useRun21Bell(userId: string, introKey: string | null, remainingMs: number) {
  const deadline = useRef(0);
  deadline.current = performance.now() + remainingMs;
  useEffect(() => {
    if (!introKey) return;
    return platformAudio.request({ userId, id: `run21-bell:${introKey}`, expiresAt: deadline.current, cue: boxingBellCue });
    // The authoritative identity owns this effect; clock ticks must not renew its deadline.
  }, [introKey, userId]);
}
