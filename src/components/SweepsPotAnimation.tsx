import { useEffect, useState, useRef } from "react";

interface SweepsPotAnimationProps {
  show: boolean;
  playerName: string;
  onComplete?: () => void;
}

export const SweepsPotAnimation = ({ show, playerName, onComplete }: SweepsPotAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const hasShownRef = useRef(false);
  
  // Keep ref updated
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (show && !hasShownRef.current) {
      hasShownRef.current = true;
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onCompleteRef.current?.();
      }, 5000); // 5 seconds as requested
      return () => clearTimeout(timer);
    } else if (!show) {
      hasShownRef.current = false;
    }
  }, [show]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-[200] pointer-events-none overflow-hidden">
      {/* Animated gold/rainbow background pulse */}
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/30 via-amber-400/40 to-yellow-500/30 animate-pulse" />
      
      {/* Firework sparkles */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-yellow-300 rounded-full animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random()}s`
            }}
          />
        ))}
      </div>
      
      {/* 357 Cards Display */}
      <div className="flex flex-col items-center gap-4 animate-scale-in z-10">
        {/* Flying 3-5-7 cards */}
        <div className="flex gap-2 mb-2">
          {['3', '5', '7'].map((rank, idx) => (
            <div
              key={rank}
              className="w-12 h-16 sm:w-16 sm:h-20 bg-white rounded-lg border-4 border-yellow-400 shadow-[0_0_20px_rgba(251,191,36,0.8)] flex items-center justify-center animate-bounce"
              style={{ animationDelay: `${idx * 0.2}s` }}
            >
              <span className="text-2xl sm:text-3xl font-black text-red-600">{rank}</span>
            </div>
          ))}
        </div>
        
        {/* Main celebration text */}
        <div className="bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 px-6 py-4 rounded-xl border-4 border-yellow-300 shadow-[0_0_40px_rgba(251,191,36,0.9)]">
          <div className="text-center">
            <div className="text-white font-black text-xl sm:text-2xl md:text-3xl tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mb-1">
              🎉 3-5-7! 🎉
            </div>
            <div className="text-yellow-100 font-bold text-lg sm:text-xl md:text-2xl tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {playerName} sweeps the pot!
            </div>
          </div>
        </div>
        
        {/* Trophy icons */}
        <div className="flex gap-4 text-4xl animate-pulse">
          <span>🏆</span>
          <span>💰</span>
          <span>🏆</span>
        </div>
      </div>
      
      {/* Radial glow overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-yellow-400/20 via-transparent to-transparent" />
    </div>
  );
};
