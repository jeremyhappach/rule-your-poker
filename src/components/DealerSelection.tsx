import { useState, useEffect, useRef } from "react";

interface Player {
  id: string;
  position: number;
  profiles?: {
    username: string;
  };
  is_bot: boolean;
}

interface DealerSelectionProps {
  players: Player[];
  onComplete: (dealerPosition: number) => void;
}

export const DealerSelection = ({ players, onComplete }: DealerSelectionProps) => {
  const [currentPosition, setCurrentPosition] = useState(1);
  const [isSpinning, setIsSpinning] = useState(true);
  const [finalPosition, setFinalPosition] = useState<number | null>(null);
  const hasStoppedRef = useRef(false);

  useEffect(() => {
    // Randomly select final dealer position
    const selectedPosition = Math.floor(Math.random() * players.length) + 1;
    setFinalPosition(selectedPosition);
    hasStoppedRef.current = false;

    let spins = 0;
    const maxSpins = 15 + selectedPosition; // Spin around at least once then land on selected

    const spinInterval = setInterval(() => {
      // Check if we've already stopped - prevent any further updates
      if (hasStoppedRef.current) {
        return;
      }

      spins++;
      
      setCurrentPosition(prev => {
        const nextPosition = prev >= players.length ? 1 : prev + 1;
        
        if (spins >= maxSpins && nextPosition === selectedPosition) {
          // Stop immediately
          hasStoppedRef.current = true;
          setIsSpinning(false);
          clearInterval(spinInterval);
          
          // Complete after showing the announcement
          setTimeout(() => {
            onComplete(selectedPosition);
          }, 2000);
          
          return selectedPosition;
        }
        
        return nextPosition;
      });
    }, 100); // Constant speed for now

    return () => {
      clearInterval(spinInterval);
      hasStoppedRef.current = true;
    };
  }, [players.length]);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-xl p-8 border-4 border-poker-gold shadow-2xl animate-scale-in">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-poker-gold flex items-center justify-center border-8 border-amber-900 shadow-2xl animate-pulse">
              <span className="text-black font-black text-6xl">D</span>
            </div>
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[20px] border-r-[20px] border-t-[30px] border-l-transparent border-r-transparent border-t-poker-gold"></div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-poker-gold">Selecting Dealer...</h2>
            <div className="bg-poker-gold/20 backdrop-blur-sm rounded-lg p-4 border-2 border-poker-gold/40">
              <p className="text-2xl font-bold text-white">
                {players.find(p => p.position === currentPosition)?.profiles?.username || 
                 `Player ${currentPosition}`}
                {players.find(p => p.position === currentPosition)?.is_bot && ' 🤖'}
              </p>
            </div>
          </div>
          
          {!isSpinning && finalPosition && (
            <div className="animate-fade-in">
              <p className="text-xl text-poker-gold font-semibold">
                ✨ Dealer Selected! ✨
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
