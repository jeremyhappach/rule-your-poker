import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Player {
  id: string;
  position: number;
  profiles?: {
    username: string;
  };
}

interface GameOverCountdownProps {
  winnerMessage: string;
  nextDealer: Player;
  onComplete: () => void;
  gameOverAt: string; // ISO timestamp when game ended
  isSessionEnded?: boolean; // Whether the session has ended
  pendingSessionEnd?: boolean; // Whether session will end after this game
}

export const GameOverCountdown = ({ winnerMessage, nextDealer, onComplete, gameOverAt, isSessionEnded = false, pendingSessionEnd = false }: GameOverCountdownProps) => {
  const COUNTDOWN_DURATION = 5; // seconds (was 8, shortened per user request)
  const MIN_DISPLAY_TIME = 2; // minimum seconds to show countdown even if server time elapsed
  const hasCompletedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const gameOverAtRef = useRef(gameOverAt); // Capture initial gameOverAt to prevent restarts
  const isMountedRef = useRef(true);
  const mountTimeRef = useRef(Date.now()); // Track when component mounted
  
  // Keep onComplete ref updated without triggering re-renders
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  const [timeLeft, setTimeLeft] = useState(() => {
    // Calculate initial time left based on timestamp
    const endTime = new Date(gameOverAtRef.current).getTime() + (COUNTDOWN_DURATION * 1000);
    const now = Date.now();
    const serverRemaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    // Ensure at least MIN_DISPLAY_TIME seconds are shown even if server time elapsed
    const remaining = Math.max(serverRemaining, MIN_DISPLAY_TIME);
    console.log('[GAME OVER COUNTDOWN] Initial calculation:', { gameOverAt: gameOverAtRef.current, serverRemaining, displayRemaining: remaining });
    return remaining;
  });

  // Single effect to handle the countdown - runs only once on mount
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[GAME OVER COUNTDOWN] Setting up countdown timer');
    
    // Update every 100ms based on actual elapsed time
    const timer = setInterval(() => {
      if (!isMountedRef.current) {
        console.log('[GAME OVER COUNTDOWN] Component unmounted, skipping tick');
        return;
      }
      
      // Calculate server-based remaining time
      const endTime = new Date(gameOverAtRef.current).getTime() + (COUNTDOWN_DURATION * 1000);
      const now = Date.now();
      const serverRemaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      
      // Also calculate minimum display time based on mount time
      const elapsedSinceMount = (now - mountTimeRef.current) / 1000;
      const minDisplayRemaining = Math.max(0, Math.ceil(MIN_DISPLAY_TIME - elapsedSinceMount));
      
      // Use whichever gives more time (ensures minimum visibility)
      const remaining = Math.max(serverRemaining, minDisplayRemaining);
      
      console.log('[GAME OVER COUNTDOWN] Tick:', remaining);
      setTimeLeft(remaining);
      
      // Check if countdown is complete
      if (remaining <= 0 && !hasCompletedRef.current && isMountedRef.current) {
        console.log('[GAME OVER COUNTDOWN] Countdown complete, calling onComplete');
        hasCompletedRef.current = true;
        onCompleteRef.current();
      }
    }, 100);

    return () => {
      console.log('[GAME OVER COUNTDOWN] Cleanup interval');
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, []); // Empty deps - only run once on mount

  const nextDealerName = nextDealer.profiles?.username || `Seat ${nextDealer.position}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
        <CardContent className="pt-4 sm:pt-8 pb-4 sm:pb-8 space-y-4 sm:space-y-6">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="bg-poker-gold/30 p-3 sm:p-6 rounded-xl border-2 border-poker-gold">
              <p className="text-poker-gold font-black text-lg sm:text-3xl">
                {winnerMessage.split('|||')[0]}
              </p>
            </div>
            
            <div className="bg-amber-950/50 p-4 sm:p-6 rounded-lg border border-amber-800">
              {isSessionEnded || pendingSessionEnd ? (
                <p className="text-poker-gold font-black text-2xl sm:text-4xl">
                  {isSessionEnded ? 'SESSION ENDED' : 'SESSION ENDING...'}
                </p>
              ) : (
                <>
                  <p className="text-amber-100 text-base sm:text-xl mb-2 sm:mb-3">
                    Next game starting in...
                  </p>
                  <p className="text-poker-gold font-black text-4xl sm:text-6xl mb-2 sm:mb-3">
                    {timeLeft}
                  </p>
                  <p className="text-amber-300 text-sm sm:text-lg">
                    <span className="font-bold">{nextDealerName}</span> will be the dealer
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
