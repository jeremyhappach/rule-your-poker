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
      <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-lg p-2.5 border-2 border-poker-gold shadow-2xl animate-scale-in max-w-xl">
        <div className="text-center space-y-1">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-poker-gold flex items-center justify-center border-2 border-amber-900 shadow-lg animate-pulse mx-auto">
              <span className="text-black font-black text-base">D</span>
            </div>
          </div>
          
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-poker-gold">New Game Starting!</h2>
            <div className="bg-poker-gold/20 backdrop-blur-sm rounded px-2 py-1 border border-poker-gold/40">
              <p className="text-sm font-bold text-white">
                {dealerName}
                {newDealerPlayer.is_bot && ' 🤖'}
              </p>
              <p className="text-[10px] text-amber-300">is now the dealer</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};