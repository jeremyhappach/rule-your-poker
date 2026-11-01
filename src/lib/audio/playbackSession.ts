type Session = {type: string; state?: string; addEventListener?: EventTarget['addEventListener']; removeEventListener?: EventTarget['removeEventListener']};

/** Same ownership/restoration pattern as the House Recipes and Homestead assistants.
 * Unsupported Android/older Safari browsers retain ordinary Web Audio behavior. */
export function createPlaybackSession(read = () => (navigator as Navigator & {audioSession?: Session}).audioSession) {
  let session: Session | undefined;
  let previous = 'auto';
  return {
    observe(interrupted: () => void, recovered: () => void) {
      let target: Session | undefined;
      let wasInterrupted = false;
      const changed = () => {
        if (target?.state === 'interrupted') { wasInterrupted = true; interrupted(); }
        else if (wasInterrupted) { wasInterrupted = false; recovered(); }
      };
      try { target = read(); target?.addEventListener?.('statechange', changed); }
      catch { /* Optional platform recovery notification. */ }
      return () => { target?.removeEventListener?.('statechange', changed); };
    },
    activate() {
      try {
        if (!session) { session = read(); previous = session?.type ?? 'auto'; }
        if (session) session.type = 'playback';
      } catch { /* Experimental API must never block gameplay or standard audio. */ }
    },
    release() {
      try { if (session?.type === 'playback') session.type = previous; }
      catch { /* Best-effort restoration. */ }
      session = undefined;
    },
  };
}
