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
  sitting_out?: boolean;
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
  const hasInitializedRef = useRef(false);

  // Sort players by position for consistent cycling
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  
  // Filter to only human players who are NOT sitting out (eligible dealers)
  const eligibleDealers = sortedPlayers.filter(p => !p.is_bot && !p.sitting_out);
  
  const currentPlayer = sortedPlayers[currentIndex];

  useEffect(() => {
    // Prevent re-initialization
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // Handle edge cases first
    if (eligibleDealers.length === 0) {
      // Fallback: if all humans are sitting out, try any non-sitting-out player
      const activePlayers = sortedPlayers.filter(p => !p.sitting_out);
      if (activePlayers.length === 0) {
        // Ultimate fallback: just pick the first player
        onComplete(sortedPlayers[0]?.position || 1);
      } else {
        onComplete(activePlayers[0]?.position || 1);
      }
      return;
    }
    
    // SINGLE ELIGIBLE DEALER: Bypass selection entirely
    if (eligibleDealers.length === 1) {
      console.log('[DEALER SELECTION] Only one eligible dealer, bypassing selection');
      // Immediate callback - no animation needed
      onComplete(eligibleDealers[0].position);
      return;
    }
    
    // MULTIPLE ELIGIBLE DEALERS: Run the spinning selection animation
    console.log('[DEALER SELECTION] Multiple eligible dealers, running selection animation');
    
    // Randomly select final dealer from eligible human players
    const randomIndex = Math.floor(Math.random() * eligibleDealers.length);
    const selectedPlayer = eligibleDealers[randomIndex];
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

  // If single eligible dealer, don't render anything (immediate bypass)
  if (eligibleDealers.length <= 1) {
    return null;
  }

  const getPlayerName = (player: Player) => {
    if (player.is_bot) {
      return getBotAlias(sortedPlayers, player.user_id);
    }
    return player.profiles?.username || `Seat ${player.position}`;
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
      {/* Yellow announcement banner - matches dealer setup message style */}
      <div className="bg-poker-gold/95 backdrop-blur-sm rounded-xl px-6 py-4 shadow-2xl border-4 border-amber-900 animate-scale-in max-w-[85vw]">
        <div className="text-center space-y-3">
          {/* Header */}
          <div className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-amber-900 flex items-center justify-center border-2 border-amber-700 shadow-lg">
              <span className="text-poker-gold font-black text-lg">D</span>
            </div>
            <h2 className="text-slate-900 font-bold text-lg sm:text-xl">
              {isSpinning ? 'Selecting Dealer...' : 'Dealer Selected!'}
            </h2>
          </div>
          
          {/* Player name cycling display */}
          <div className="bg-amber-900/80 rounded-lg px-4 py-2 border border-amber-700">
            <p className={`text-poker-gold font-bold text-base sm:text-lg truncate max-w-[200px] sm:max-w-[300px] mx-auto ${isSpinning ? 'animate-pulse' : ''}`}>
              {getPlayerName(currentPlayer)}
              {currentPlayer?.is_bot && ' 🤖'}
            </p>
          </div>
          
          {/* Confirmation message when stopped */}
          {!isSpinning && finalPosition && (
            <div className="animate-fade-in">
              <p className="text-slate-900 font-semibold text-sm">
                ✨ Shuffle up and deal! ✨
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
