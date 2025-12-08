import { useEffect, useState, useRef } from "react";

interface LegEarnedAnimationProps {
  show: boolean;
  playerName: string;
  targetPosition?: { top: string; left: string }; // Target coordinates for the leg indicator
  onComplete?: () => void;
}

export const LegEarnedAnimation = ({ show, playerName, targetPosition, onComplete }: LegEarnedAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const hasShownRef = useRef(false);
  
  // Keep ref updated
  onCompleteRef.current = onComplete;

  // Default target if not provided
  const finalTarget = targetPosition || { top: '85%', left: '65%' };

  useEffect(() => {
    if (show && !hasShownRef.current) {
      hasShownRef.current = true;
      setVisible(true);
      
      // Hide after fly-in completes (1.5s) - no landed phase, just disappear
      const hideTimer = setTimeout(() => {
        setVisible(false);
        onCompleteRef.current?.();
      }, 1500);
      
      return () => {
        clearTimeout(hideTimer);
      };
    } else if (!show) {
      // Reset when show becomes false
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <>
      {/* Flying L chip - positioned to land at player's leg indicator position */}
      <div 
        className="absolute z-50 pointer-events-none animate-[flyToTarget_1.5s_ease-out_forwards]"
        style={{
          // Start position - will animate to target
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Glow effect during flight */}
        <div className="absolute inset-0 bg-amber-400 rounded-full blur-lg opacity-60 scale-150 animate-pulse" />
        
        {/* L chip */}
        <div className="relative w-10 h-10 rounded-full bg-white border-3 border-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.8)]">
          <span className="text-slate-800 font-black text-xl">L</span>
        </div>
        
        {/* Sparkle during flight */}
        <div className="absolute -top-1 -right-1 text-sm animate-ping">✨</div>
      </div>
      
      {/* Custom keyframes - fly from center to target position */}
      <style>{`
        @keyframes flyToTarget {
          0% {
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%) scale(2) rotate(-20deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            top: ${finalTarget.top};
            left: ${finalTarget.left};
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};
