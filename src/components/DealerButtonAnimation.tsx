import { useState, useEffect, useRef, useMemo } from "react";

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

  // Calculate the position coordinates for each seat (matching GameTable layout)
  const getSeatPosition = (seatPosition: number) => {
    const totalSeats = 7;
    const radius = 42; // Match GameTable radius
    // Position 1 at top, increasing positions go CLOCKWISE (negative angle direction)
    const angle = -((seatPosition - 1) / totalSeats) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x, y };
  };

  // Get sorted player positions for animation sequence
  const sortedPositions = useMemo(() => {
    return players.map(p => p.position).sort((a, b) => a - b);
  }, [players]);

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

    let currentIdx = 0;
    
    // Start with fast spins, slow down over 4 seconds
    const TOTAL_DURATION = 4000; // 4 seconds
    const MIN_INTERVAL = 80; // Fastest speed
    const MAX_INTERVAL = 400; // Slowest speed before stop
    
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
      currentIdx = (currentIdx + 1) % sortedPositions.length;
      setCurrentPosition(sortedPositions[currentIdx]);
      
      // Schedule next frame
      setTimeout(animate, interval);
    };
    
    // Start animation
    animate();
    
    return () => {
      hasCompletedRef.current = true;
    };
  }, [players, onComplete, sortedPositions]);

  // Get current button position
  const buttonPos = getSeatPosition(currentPosition);
  const currentPlayer = players.find(p => p.position === currentPosition);
  const currentPlayerName = currentPlayer?.profiles?.username || `Seat ${currentPosition}`;

  return (
    <>
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/40 rounded-[50%] z-30 pointer-events-none" />
      
      {/* Animated dealer button on the table */}
      <div 
        className="absolute z-40 transition-all duration-75 ease-linear"
        style={{
          left: `${buttonPos.x}%`,
          top: `${buttonPos.y}%`,
          transform: 'translate(-50%, -50%)'
        }}
      >
        <div className={`relative ${isSpinning ? '' : 'animate-bounce'}`}>
          {/* Dealer button */}
          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-600 flex items-center justify-center border-4 border-white shadow-2xl ${isSpinning ? 'animate-pulse' : ''}`}>
            <span className="text-white font-black text-2xl sm:text-4xl">D</span>
          </div>
          
          {/* Glow effect when spinning */}
          {isSpinning && (
            <div className="absolute inset-0 rounded-full border-4 border-amber-400/50 animate-ping" />
          )}
          
          {/* Trail effect when spinning */}
          {isSpinning && (
            <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-lg scale-150" />
          )}
        </div>
      </div>
      
      {/* Announcement banner at top of table */}
      <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40">
        <div className="bg-slate-900/90 backdrop-blur-sm rounded-lg px-4 py-2 sm:px-6 sm:py-3 border-2 border-amber-600/60 shadow-2xl">
          <h2 className="text-lg sm:text-xl font-bold text-amber-400 text-center whitespace-nowrap">
            {isSpinning ? "Selecting Dealer..." : "✨ Dealer Selected! ✨"}
          </h2>
          <p className="text-amber-100 text-sm sm:text-base font-semibold text-center mt-1">
            {currentPlayerName}
            {currentPlayer?.is_bot && ' 🤖'}
          </p>
        </div>
      </div>
    </>
  );
};
