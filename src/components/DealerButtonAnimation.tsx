import { useState, useEffect, useRef } from "react";

interface Player {
  id: string;
  position: number;
  profiles?: {
    username: string;
  };
  is_bot: boolean;
}

interface DealerButtonAnimationProps {
  players: Player[];
  onComplete: (dealerPosition: number) => void;
}

export const DealerButtonAnimation = ({ players, onComplete }: DealerButtonAnimationProps) => {
  const [currentPosition, setCurrentPosition] = useState<number>(players[0]?.position || 1);
  const [isSpinning, setIsSpinning] = useState(true);
  const [finalPosition, setFinalPosition] = useState<number | null>(null);
  const hasCompletedRef = useRef(false);
  const animationStartRef = useRef<number>(Date.now());

  useEffect(() => {
    // Filter to only human players for selection
    const humanPlayers = players.filter(p => !p.is_bot);
    
    if (humanPlayers.length === 0) {
      // Fallback: if all are bots, just pick the first one
      onComplete(players[0]?.position || 1);
      return;
    }
    
    // Randomly select final dealer position from human players only
    const randomIndex = Math.floor(Math.random() * humanPlayers.length);
    const selectedPosition = humanPlayers[randomIndex].position;
    setFinalPosition(selectedPosition);
    animationStartRef.current = Date.now();

    // All player positions sorted
    const positions = players.map(p => p.position).sort((a, b) => a - b);
    let currentIdx = 0;
    
    // Start with fast spins, slow down over 5 seconds
    const TOTAL_DURATION = 5000; // 5 seconds
    const MIN_INTERVAL = 80; // Fastest speed
    const MAX_INTERVAL = 500; // Slowest speed before stop
    
    const animate = () => {
      if (hasCompletedRef.current) return;
      
      const elapsed = Date.now() - animationStartRef.current;
      
      if (elapsed >= TOTAL_DURATION) {
        // Time's up - land on selected position
        setCurrentPosition(selectedPosition);
        setIsSpinning(false);
        hasCompletedRef.current = true;
        
        // Complete after showing final position
        setTimeout(() => {
          onComplete(selectedPosition);
        }, 1500);
        return;
      }
      
      // Calculate interval based on elapsed time (ease out - slows down)
      const progress = elapsed / TOTAL_DURATION;
      const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease out
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * easedProgress;
      
      // Move to next position
      currentIdx = (currentIdx + 1) % positions.length;
      setCurrentPosition(positions[currentIdx]);
      
      // Schedule next frame
      setTimeout(animate, interval);
    };
    
    // Start animation
    animate();
    
    return () => {
      hasCompletedRef.current = true;
    };
  }, [players, onComplete]);

  // Get current player name
  const currentPlayer = players.find(p => p.position === currentPosition);
  const currentPlayerName = currentPlayer?.profiles?.username || `Player ${currentPosition}`;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 sm:p-8 border-2 border-amber-600/60 shadow-2xl animate-scale-in max-w-[90vw]">
        <div className="text-center space-y-6">
          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-bold text-amber-400">
            {isSpinning ? "Selecting Dealer..." : "✨ Dealer Selected! ✨"}
          </h2>
          
          {/* Animated dealer button */}
          <div className="relative mx-auto w-fit">
            <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center border-4 border-amber-800 shadow-2xl ${isSpinning ? 'animate-pulse' : ''}`}>
              <span className="text-black font-black text-5xl sm:text-6xl">D</span>
            </div>
            {/* Spinning glow effect */}
            {isSpinning && (
              <div className="absolute inset-0 rounded-full border-4 border-amber-400/50 animate-ping" />
            )}
          </div>
          
          {/* Current player being pointed to */}
          <div className="bg-amber-900/40 backdrop-blur-sm rounded-lg p-4 border border-amber-600/40 min-w-[200px]">
            <p className="text-amber-100 text-lg sm:text-xl font-bold truncate">
              {currentPlayerName}
              {currentPlayer?.is_bot && ' 🤖'}
            </p>
          </div>
          
          {/* Final announcement */}
          {!isSpinning && finalPosition && (
            <div className="animate-fade-in">
              <p className="text-amber-300 font-semibold">
                {currentPlayerName} will deal first!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
