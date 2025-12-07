import { useEffect, useState } from "react";

interface LegEarnedAnimationProps {
  show: boolean;
  playerName: string;
  onComplete?: () => void;
}

export const LegEarnedAnimation = ({ show, playerName, onComplete }: LegEarnedAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'flying' | 'landed'>('flying');

  useEffect(() => {
    if (show) {
      setVisible(true);
      setAnimationPhase('flying');
      
      // After fly-in completes (1.5s), show landed state briefly
      const landTimer = setTimeout(() => {
        setAnimationPhase('landed');
      }, 1500);
      
      // Then hide after another 0.5s
      const hideTimer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 2000);
      
      return () => {
        clearTimeout(landTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [show, onComplete]);

  if (!visible) return null;

  return (
    <>
      {/* Flying L chip - positioned to land near bottom-right of felt (near dealer button) */}
      <div 
        className={`
          absolute z-50 pointer-events-none
          ${animationPhase === 'flying' 
            ? 'animate-[flyToDealer_1.5s_ease-out_forwards]' 
            : 'animate-[pulse_0.3s_ease-in-out_2]'
          }
        `}
        style={{
          // Start position - will animate to bottom-right near dealer button
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Glow effect during flight */}
        <div className={`absolute inset-0 bg-amber-400 rounded-full blur-lg opacity-60 scale-150 ${animationPhase === 'flying' ? 'animate-pulse' : ''}`} />
        
        {/* L chip */}
        <div className="relative w-10 h-10 rounded-full bg-white border-3 border-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.8)]">
          <span className="text-slate-800 font-black text-xl">L</span>
        </div>
        
        {/* Sparkle during flight */}
        {animationPhase === 'flying' && (
          <div className="absolute -top-1 -right-1 text-sm animate-ping">✨</div>
        )}
      </div>
      
      {/* Custom keyframes - fly from center to bottom-right near dealer button position */}
      <style>{`
        @keyframes flyToDealer {
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
            top: 85%;
            left: 65%;
            transform: translate(-50%, -50%) scale(1) rotate(0deg);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};