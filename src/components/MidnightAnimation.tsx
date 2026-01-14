import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface MidnightAnimationProps {
  show: boolean;
  playerName?: string;
  onComplete?: () => void;
}

/**
 * A dramatic dark blue lightning animation that plays when someone
 * rolls a 12 (Midnight) in Ship Captain Crew.
 */
export const MidnightAnimation: React.FC<MidnightAnimationProps> = ({
  show,
  playerName,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'hidden' | 'flash1' | 'flash2' | 'reveal' | 'fadeout'>('hidden');
  const [lightningPaths, setLightningPaths] = useState<string[]>([]);

  // Generate random lightning bolt paths
  const generateLightningPath = () => {
    const startX = 50 + (Math.random() - 0.5) * 40;
    let x = startX;
    let y = 0;
    let path = `M ${x} ${y}`;
    
    while (y < 100) {
      y += 5 + Math.random() * 10;
      x += (Math.random() - 0.5) * 20;
      path += ` L ${x} ${y}`;
      
      // Occasionally add a branch
      if (Math.random() < 0.3 && y < 80) {
        const branchX = x + (Math.random() - 0.5) * 30;
        const branchY = y + 10 + Math.random() * 15;
        path += ` M ${x} ${y} L ${branchX} ${branchY} M ${x} ${y}`;
      }
    }
    
    return path;
  };

  useEffect(() => {
    if (show) {
      // Generate new lightning paths
      setLightningPaths([
        generateLightningPath(),
        generateLightningPath(),
        generateLightningPath(),
      ]);
      
      // Start animation sequence
      setPhase('flash1');
      
      const timers: number[] = [];
      
      // Quick flash sequence
      timers.push(window.setTimeout(() => setPhase('flash2'), 100));
      timers.push(window.setTimeout(() => setPhase('flash1'), 200));
      timers.push(window.setTimeout(() => setPhase('reveal'), 350));
      timers.push(window.setTimeout(() => setPhase('fadeout'), 2500));
      timers.push(window.setTimeout(() => {
        setPhase('hidden');
        onComplete?.();
      }, 3200));
      
      return () => timers.forEach(t => window.clearTimeout(t));
    } else {
      setPhase('hidden');
    }
  }, [show, onComplete]);

  if (phase === 'hidden') return null;

  const isFlashing = phase === 'flash1' || phase === 'flash2';

  return (
    <div
      className={cn(
        "absolute inset-0 z-[1000] pointer-events-none flex items-center justify-center overflow-hidden",
        phase === 'fadeout' && "transition-opacity duration-700 opacity-0"
      )}
      style={{
        background: isFlashing
          ? 'radial-gradient(ellipse at center, hsl(220 80% 60% / 0.9) 0%, hsl(220 90% 15% / 0.95) 100%)'
          : 'radial-gradient(ellipse at center, hsl(220 70% 20% / 0.9) 0%, hsl(220 90% 8% / 0.95) 100%)',
        transition: 'background 0.15s ease-out',
      }}
    >
      {/* Lightning bolts SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {lightningPaths.map((path, i) => (
          <g key={i}>
            {/* Glow layer */}
            <path
              d={path}
              fill="none"
              stroke="hsl(200 100% 70%)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "transition-opacity duration-100",
                isFlashing ? "opacity-80" : "opacity-30"
              )}
              style={{
                filter: 'blur(4px)',
              }}
            />
            {/* Main bolt */}
            <path
              d={path}
              fill="none"
              stroke="hsl(200 100% 90%)"
              strokeWidth="0.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "transition-opacity duration-100",
                isFlashing ? "opacity-100" : "opacity-50"
              )}
            />
          </g>
        ))}
      </svg>

      {/* Animated lightning flicker overlay */}
      {isFlashing && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(200 100% 80% / 0.4) 0%, transparent 70%)',
          }}
        />
      )}

      {/* Text container */}
      <div
        className={cn(
          "relative flex flex-col items-center gap-2",
          phase === 'reveal' && "animate-scale-in"
        )}
      >
        {/* MIDNIGHT text */}
        <h1
          className={cn(
            "text-5xl md:text-7xl font-black tracking-widest",
            "transition-all duration-300",
            phase === 'reveal' ? "opacity-100 scale-100" : "opacity-0 scale-90"
          )}
          style={{
            color: 'hsl(200 100% 90%)',
            textShadow: `
              0 0 10px hsl(200 100% 70%),
              0 0 20px hsl(200 100% 60%),
              0 0 40px hsl(220 100% 50%),
              0 0 80px hsl(220 100% 40%)
            `,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '0.15em',
          }}
        >
          MIDNIGHT
        </h1>

        {/* Player name subtitle */}
        {playerName && (
          <p
            className={cn(
              "text-lg md:text-xl font-semibold",
              "transition-all duration-500 delay-200",
              phase === 'reveal' ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
            style={{
              color: 'hsl(200 80% 75%)',
              textShadow: '0 0 10px hsl(200 100% 50%)',
            }}
          >
            {playerName} rolled a perfect 12!
          </p>
        )}

        {/* Moon/clock icon */}
        <div
          className={cn(
            "absolute -top-8 left-1/2 -translate-x-1/2 text-4xl",
            "transition-all duration-500 delay-100",
            phase === 'reveal' ? "opacity-80 scale-100" : "opacity-0 scale-50"
          )}
          style={{
            filter: 'drop-shadow(0 0 10px hsl(200 100% 60%))',
          }}
        >
          🌙
        </div>
      </div>

      {/* Corner lightning accents */}
      <div
        className={cn(
          "absolute top-0 left-0 w-32 h-32",
          "transition-opacity duration-100",
          isFlashing ? "opacity-60" : "opacity-20"
        )}
        style={{
          background: 'radial-gradient(ellipse at top left, hsl(200 100% 70% / 0.5) 0%, transparent 70%)',
        }}
      />
      <div
        className={cn(
          "absolute top-0 right-0 w-32 h-32",
          "transition-opacity duration-100",
          isFlashing ? "opacity-60" : "opacity-20"
        )}
        style={{
          background: 'radial-gradient(ellipse at top right, hsl(200 100% 70% / 0.5) 0%, transparent 70%)',
        }}
      />
    </div>
  );
};
