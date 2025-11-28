import { useEffect } from "react";

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
  useEffect(() => {
    // Auto-advance after 3 seconds
    const timer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const dealerName = newDealerPlayer.profiles?.username || `Player ${newDealerPlayer.position}`;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-xl p-12 border-4 border-poker-gold shadow-2xl animate-scale-in max-w-2xl">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-40 h-40 rounded-full bg-poker-gold flex items-center justify-center border-8 border-amber-900 shadow-2xl animate-pulse mx-auto">
              <span className="text-black font-black text-7xl">D</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-poker-gold">New Game Starting!</h2>
            <div className="bg-poker-gold/20 backdrop-blur-sm rounded-lg p-6 border-2 border-poker-gold/40">
              <p className="text-3xl font-bold text-white mb-2">
                {dealerName}
                {newDealerPlayer.is_bot && ' 🤖'}
              </p>
              <p className="text-xl text-amber-300">is now the dealer</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};