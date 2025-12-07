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
      
      // After fly-in completes (2s), show landed state briefly
      const landTimer = setTimeout(() => {
        setAnimationPhase('landed');
      }, 2000);
      
      // Then hide after another 0.5s
      const hideTimer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 2500);
      
      return () => {
        clearTimeout(landTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [show, onComplete]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none overflow-hidden">
      {/* Subtle gold shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-400/20 via-transparent to-transparent animate-[pulse_0.5s_ease-in-out_2]" />
      
      {/* Flying leg indicator */}
      <div 
        className={`
          flex flex-col items-center gap-3
          ${animationPhase === 'flying' 
            ? 'animate-[flyInFromTop_2s_ease-out_forwards]' 
            : 'animate-[pulse_0.3s_ease-in-out_2]'
          }
        `}
      >
        {/* Large L indicator with glow */}
        <div className="relative">
          {/* Glow ring */}
          <div className="absolute inset-0 bg-amber-400 rounded-full blur-xl opacity-60 scale-150 animate-[pulse_0.4s_ease-in-out_infinite]" />
          
          {/* Main L circle */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white border-4 border-amber-500 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.8)]">
            <span className="text-slate-800 font-black text-4xl sm:text-5xl">L</span>
          </div>
          
          {/* Sparkle effects */}
          <div className="absolute -top-2 -right-2 text-2xl animate-[ping_0.5s_ease-out_infinite]">✨</div>
          <div className="absolute -bottom-1 -left-2 text-xl animate-[ping_0.6s_ease-out_infinite]" style={{ animationDelay: '0.2s' }}>✨</div>
        </div>
        
        {/* Player earned leg text */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-5 py-2 rounded-lg border-2 border-amber-300 shadow-[0_0_25px_rgba(245,158,11,0.6)]">
          <span className="text-white font-bold text-lg sm:text-xl tracking-wide drop-shadow-md">
            {playerName} EARNED A LEG!
          </span>
        </div>
      </div>
      
      {/* Custom keyframes for fly-in animation */}
      <style>{`
        @keyframes flyInFromTop {
          0% {
            transform: translateY(-100vh) scale(0.5) rotate(-20deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          70% {
            transform: translateY(10px) scale(1.1) rotate(5deg);
          }
          85% {
            transform: translateY(-5px) scale(1.05) rotate(-2deg);
          }
          100% {
            transform: translateY(0) scale(1) rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
};
