import { useState, useEffect, useRef } from "react";
import { getBotAlias } from "@/lib/botAlias";

interface Player {
  id: string;
  user_id: string;
  position: number;
  created_at?: string;
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(true);
  const [finalPosition, setFinalPosition] = useState<number | null>(null);
  const hasStoppedRef = useRef(false);

  // Sort players by position for consistent cycling
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  const currentPlayer = sortedPlayers[currentIndex];

  useEffect(() => {
    // Filter to only human players
    const humanPlayers = sortedPlayers.filter(p => !p.is_bot);
    
    if (humanPlayers.length === 0) {
      // Fallback: if all are bots, just pick the first one
      onComplete(sortedPlayers[0]?.position || 1);
      return;
    }
    
    // Randomly select final dealer from human players only
    const randomIndex = Math.floor(Math.random() * humanPlayers.length);
    const selectedPlayer = humanPlayers[randomIndex];
    const selectedPosition = selectedPlayer.position;
    setFinalPosition(selectedPosition);
    hasStoppedRef.current = false;

    // Find the index of the selected player in the sorted array
    const targetIndex = sortedPlayers.findIndex(p => p.position === selectedPosition);

    let spins = 0;
    const minSpins = 15; // Minimum cycles before stopping
    let canStop = false;

    const spinInterval = setInterval(() => {
      // Check if we've already stopped - prevent any further updates
      if (hasStoppedRef.current) {
        return;
      }

      spins++;
      
      // After minimum spins, allow stopping on target
      if (spins >= minSpins) {
        canStop = true;
      }
      
      setCurrentIndex(prev => {
        const nextIndex = (prev + 1) % sortedPlayers.length;
        
        if (canStop && nextIndex === targetIndex) {
          // Stop immediately
          hasStoppedRef.current = true;
          setIsSpinning(false);
          clearInterval(spinInterval);
          
          // Complete after showing the announcement
          setTimeout(() => {
            onComplete(selectedPosition);
          }, 2000);
          
          return targetIndex;
        }
        
        return nextIndex;
      });
    }, 150); // Slightly slower for readability

    return () => {
      clearInterval(spinInterval);
      hasStoppedRef.current = true;
    };
  }, [players.length]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-xl p-4 sm:p-8 border-4 border-poker-gold shadow-2xl animate-scale-in max-w-[90vw]">
        <div className="text-center space-y-4 sm:space-y-6">
          <div className="relative mx-auto w-fit">
            <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-poker-gold flex items-center justify-center border-4 sm:border-8 border-amber-900 shadow-2xl animate-pulse">
              <span className="text-black font-black text-4xl sm:text-6xl">D</span>
            </div>
            <div className="absolute -bottom-3 sm:-bottom-4 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[15px] sm:border-l-[20px] border-r-[15px] sm:border-r-[20px] border-t-[22px] sm:border-t-[30px] border-l-transparent border-r-transparent border-t-poker-gold"></div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl sm:text-3xl font-bold text-poker-gold">Selecting Dealer...</h2>
            <div className="bg-poker-gold/20 backdrop-blur-sm rounded-lg p-3 sm:p-4 border-2 border-poker-gold/40">
              <p className="text-lg sm:text-2xl font-bold text-white truncate max-w-[200px] sm:max-w-none mx-auto">
                {currentPlayer?.is_bot 
                  ? getBotAlias(sortedPlayers, currentPlayer.user_id) 
                  : (currentPlayer?.profiles?.username || `Seat ${currentPlayer?.position}`)}
                {currentPlayer?.is_bot && ' 🤖'}
              </p>
            </div>
          </div>
          
          {!isSpinning && finalPosition && (
            <div className="animate-fade-in">
              <p className="text-lg sm:text-xl text-poker-gold font-semibold">
                ✨ Dealer Selected! ✨
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
