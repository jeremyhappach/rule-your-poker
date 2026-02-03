import { useEffect, useState, useRef } from 'react';

interface CribbageWinnerAnnouncementProps {
  winnerName: string;
  multiplier: number; // 1 = normal, 2 = skunk, 3 = double skunk
  totalWinnings: number;
  onComplete: () => void;
}

/**
 * Winner announcement overlay for Cribbage games.
 * Shows the winner's name and total winnings.
 */
export const CribbageWinnerAnnouncement = ({
  winnerName,
  multiplier,
  totalWinnings,
  onComplete,
}: CribbageWinnerAnnouncementProps) => {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const onCompleteRef = useRef(onComplete);
  
  // Keep ref in sync without triggering effect re-runs
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Enter animation
    const enterTimer = setTimeout(() => setPhase('show'), 100);
    
    // Show for 3.5 seconds
    const showTimer = setTimeout(() => setPhase('exit'), 3600);
    
    // Complete after exit animation
    const completeTimer = setTimeout(() => {
      onCompleteRef.current();
    }, 4100);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(showTimer);
      clearTimeout(completeTimer);
    };
  }, []); // Run once on mount only

  const getWinTypeLabel = () => {
    if (multiplier >= 3) return ' with Double Skunk!';
    if (multiplier >= 2) return ' with Skunk!';
    return '';
  };

  return (
    <div
      className={`
        absolute inset-0 z-[100] flex flex-col items-center justify-center
        bg-black/70 backdrop-blur-sm transition-opacity duration-500
        ${phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Winner name */}
      <h2
        className={`
          text-2xl font-black text-white text-center px-4
          transition-all duration-500
          ${phase === 'show' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
        `}
        style={{
          textShadow: '0 0 20px rgba(255, 255, 255, 0.5)',
        }}
      >
        {winnerName} Wins{getWinTypeLabel()}
      </h2>

      {/* Winnings amount */}
      <div
        className={`
          mt-4 px-6 py-2 rounded-full bg-poker-gold/90 border-2 border-amber-600
          transition-all duration-500 delay-150
          ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        <span className="text-xl font-bold text-slate-900">
          +${totalWinnings}
        </span>
      </div>
    </div>
  );
};

export default CribbageWinnerAnnouncement;
