import { useEffect, useState, useRef } from 'react';

interface CribbageSkunkOverlayProps {
  multiplier: number; // 2 = skunk, 3 = double skunk
  onComplete: () => void;
}

/**
 * Skunk/Double-Skunk overlay shown before chip animation.
 * Uses emoji skunks with animation.
 */
export const CribbageSkunkOverlay = ({ multiplier, onComplete }: CribbageSkunkOverlayProps) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  
  // Keep ref in sync without triggering effect re-runs
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('show'), 100);
    
    // Show for 3.5 seconds (longer for dramatic effect)
    const showTimer = setTimeout(() => setPhase('exit'), 3600);
    
    // Complete after exit animation
    const completeTimer = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, 4100);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(showTimer);
      clearTimeout(completeTimer);
    };
  }, []); // Run once on mount only

  const isDoubleSkunk = multiplier >= 3;
  const title = isDoubleSkunk ? 'DOUBLE SKUNK!' : 'SKUNK!';
  const subtitle = isDoubleSkunk ? '3x Payout!' : '2x Payout!';

  return (
    <div 
      className={`
        absolute inset-0 z-[100] flex flex-col items-center justify-center
        bg-black/80 backdrop-blur-sm transition-opacity duration-500
        ${phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Skunk emojis */}
      <div 
        className={`
          flex items-center gap-4 mb-4 transition-all duration-500
          ${phase === 'show' ? 'scale-100 translate-y-0' : 'scale-50 translate-y-8'}
        `}
      >
        <span 
          className="text-7xl animate-bounce" 
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        >
          🦨
        </span>
        {isDoubleSkunk && (
          <span 
            className="text-7xl animate-bounce" 
            style={{ animationDelay: '150ms', animationDuration: '1s' }}
          >
            🦨
          </span>
        )}
      </div>

      {/* Title */}
      <h2 
        className={`
          text-4xl font-black text-white drop-shadow-lg
          transition-all duration-500
          ${phase === 'show' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
        `}
        style={{
          textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 200, 0, 0.3)',
        }}
      >
        {title}
      </h2>

      {/* Subtitle */}
      <p 
        className={`
          text-xl font-bold text-amber-400 mt-2
          transition-all duration-500 delay-100
          ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        {subtitle}
      </p>
    </div>
  );
};

export default CribbageSkunkOverlay;
