import { useEffect, useState } from 'react';
import { platformAudio } from '@/lib/audio/platformAudio';
import { ginScratchCue } from '@/lib/audio/platformCues';

interface GinRummyGinOverlayProps {
  winnerName: string;
  onComplete: () => void;
}

/**
 * Cool blue overlay with record scratch sound for GIN declarations.
 * Auto-dismisses after ~3 seconds.
 */
export const GinRummyGinOverlay = ({ winnerName, onComplete }: GinRummyGinOverlayProps) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  useEffect(() => { platformAudio.play(ginScratchCue); }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 80);
    const t2 = setTimeout(() => setPhase('exit'), 2700);
    const t3 = setTimeout(() => onComplete(), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className={`
        absolute inset-0 z-[70] flex flex-col items-center justify-center
        transition-opacity duration-500
        ${phase === 'show' ? 'opacity-100' : 'opacity-0'}
      `}
      style={{
        background: 'radial-gradient(ellipse at center, hsla(210, 80%, 30%, 0.92) 0%, hsla(220, 90%, 12%, 0.95) 100%)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* GIN text */}
      <h2
        className={`
          text-6xl font-black tracking-widest transition-all duration-500
          ${phase === 'show' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
        `}
        style={{
          color: 'hsl(200, 100%, 80%)',
          textShadow: '0 0 30px hsla(200, 100%, 70%, 0.8), 0 0 60px hsla(200, 100%, 60%, 0.4), 0 4px 12px rgba(0,0,0,0.5)',
          letterSpacing: '0.15em',
        }}
      >
        GIN
      </h2>

      {/* Winner name */}
      <p
        className={`
          mt-3 text-xl font-bold transition-all duration-500 delay-150
          ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
        style={{ color: 'hsl(200, 60%, 90%)' }}
      >
        {winnerName}
      </p>
    </div>
  );
};
