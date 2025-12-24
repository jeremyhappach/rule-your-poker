import { useEffect, useRef } from "react";

interface Player {
  id: string;
  position: number;
  profiles?: {
    username: string;
  };
  is_bot: boolean;
}

interface DealerAnnouncementProps {
  newDealerPlayer: Player;
  onComplete: () => void;
}

export const DealerAnnouncement = ({ newDealerPlayer, onComplete }: DealerAnnouncementProps) => {
  const onCompleteRef = useRef(onComplete);
  
  // Keep onComplete ref updated without triggering re-renders
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Auto-advance after 3 seconds
    const timer = setTimeout(() => {
      onCompleteRef.current();
    }, 3000);

    return () => clearTimeout(timer);
  }, []); // Empty deps - only run once on mount

  const dealerName = newDealerPlayer.profiles?.username || `Player ${newDealerPlayer.position}`;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded p-1.5 border border-poker-gold shadow-xl animate-scale-in">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-poker-gold flex items-center justify-center border border-amber-900 shadow animate-pulse">
            <span className="text-black font-black text-sm">D</span>
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight">
              {dealerName}{newDealerPlayer.is_bot && ' 🤖'}
            </p>
            <p className="text-[9px] text-amber-300 leading-tight">is now the dealer</p>
          </div>
        </div>
      </div>
    </div>
  );
};