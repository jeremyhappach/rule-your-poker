import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface HolmWinCelebrationProps {
  winnerName: string;
  handDescription: string;
  potAmount: number;
  onComplete: () => void;
}

export const HolmWinCelebration: React.FC<HolmWinCelebrationProps> = ({
  winnerName,
  handDescription,
  potAmount,
  onComplete,
}) => {
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    // Fire confetti immediately
    const duration = 3000;
    const end = Date.now() + duration;
    
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#FFD700', '#FFA500', '#FFEC8B', '#DAA520']
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#FFD700', '#FFA500', '#FFEC8B', '#DAA520']
      });
      
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Complete after 5s total
    const completeTimer = setTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onComplete();
      }
    }, 5000);

    return () => {
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4">
      <div className="max-w-3xl w-full text-center space-y-6 animate-fade-in">
        {/* Winner announcement */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 blur-3xl animate-pulse" />
          
          {/* Winner name */}
          <h1 
            className="relative text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 animate-pulse drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]"
            style={{
              textShadow: '0 0 40px rgba(251, 191, 36, 0.8), 0 0 80px rgba(251, 191, 36, 0.4)'
            }}
          >
            {winnerName}
          </h1>
          
          {/* Beat Chucky text */}
          <p className="text-2xl sm:text-4xl font-bold text-white mt-4 tracking-wide">
            BEAT CHUCKY!
          </p>
        </div>

        {/* Hand description */}
        <div className="inline-block bg-gradient-to-r from-amber-900/80 to-amber-800/80 px-8 py-4 rounded-2xl border-2 border-amber-500/50">
          <p className="text-xl sm:text-3xl font-bold text-amber-100">
            with a <span className="text-amber-300">{handDescription}</span>
          </p>
        </div>

        {/* Pot amount */}
        <div className="inline-flex items-center gap-3 bg-gradient-to-r from-green-900/90 to-emerald-800/90 px-10 py-5 rounded-2xl border-2 border-green-400/60 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
          <span className="text-3xl sm:text-5xl font-black text-green-300">
            +${potAmount}
          </span>
          <span className="text-xl sm:text-2xl text-green-200 font-semibold">
            POT WON!
          </span>
        </div>

        {/* Decorative elements */}
        <div className="flex justify-center gap-4 mt-6">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i}
              className="w-3 h-3 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper function to parse the result message and extract components
export const parseHolmWinMessage = (message: string): { winnerName: string; handDescription: string; potAmount: number } | null => {
  // Split by ||| to separate display message from pot data
  const [displayPart, potPart] = message.split('|||');
  
  // Extract pot amount
  let potAmount = 0;
  if (potPart) {
    const potMatch = potPart.match(/POT:(\d+)/);
    if (potMatch) {
      potAmount = parseInt(potMatch[1], 10);
    }
  }
  
  // Format: "PlayerName beat Chucky with a Full House Kings over Jacks!"
  const match = displayPart.match(/^(.+?) beat Chucky with (.+?)!?$/);
  if (match) {
    return {
      winnerName: match[1],
      handDescription: match[2],
      potAmount
    };
  }
  
  // Format for multiple winners: "Player1 and Player2 beat Chucky!"
  const multiMatch = displayPart.match(/^(.+?) beat Chucky!?$/);
  if (multiMatch) {
    return {
      winnerName: multiMatch[1],
      handDescription: 'a winning hand',
      potAmount
    };
  }
  
  return null;
};

export default HolmWinCelebration;
