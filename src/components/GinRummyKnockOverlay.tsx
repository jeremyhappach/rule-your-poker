import { useEffect, useState } from 'react';

interface GinRummyKnockOverlayProps {
  knockerName: string;
  deadwood: number;
  onComplete: () => void;
}

/**
 * Amber-themed overlay shown to all clients when a player knocks.
 * Auto-dismisses after ~2.5 seconds.
 */
export const GinRummyKnockOverlay = ({ knockerName, deadwood, onComplete }: GinRummyKnockOverlayProps) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 80);
    const t2 = setTimeout(() => setPhase('exit'), 2300);
    const t3 = setTimeout(() => onComplete(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className={`
        absolute inset-0 z-[70] flex flex-col items-center justify-center
        bg-black/75 backdrop-blur-sm transition-opacity duration-500
        ${phase === 'show' ? 'opacity-100' : 'opacity-0'}
      `}
    >
      {/* Knock text */}
      <h2
        className={`
          text-5xl font-black tracking-wider transition-all duration-400
          ${phase === 'show' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
        `}
        style={{
          color: 'hsl(45, 100%, 50%)',
          textShadow: '0 0 30px hsla(45, 100%, 50%, 0.6), 0 0 60px hsla(45, 100%, 50%, 0.3)',
        }}
      >
        KNOCK!
      </h2>

      {/* Knocker name + deadwood */}
      <p
        className={`
          mt-3 text-lg font-semibold text-white/80 transition-all duration-400 delay-100
          ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        {knockerName} • {deadwood} dw
      </p>
    </div>
  );
};
