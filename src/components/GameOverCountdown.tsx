import { useEffect, useState } from "react";
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
}

export const GameOverCountdown = ({ winnerMessage, nextDealer, onComplete }: GameOverCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete]);

  const nextDealerName = nextDealer.profiles?.username || `Player ${nextDealer.position}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="max-w-2xl mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="bg-poker-gold/30 p-6 rounded-xl border-2 border-poker-gold">
              <p className="text-poker-gold font-black text-3xl mb-2">
                {winnerMessage}
              </p>
            </div>
            
            <div className="bg-amber-950/50 p-6 rounded-lg border border-amber-800">
              <p className="text-amber-100 text-xl mb-3">
                Next game starting in...
              </p>
              <p className="text-poker-gold font-black text-6xl mb-3">
                {timeLeft}
              </p>
              <p className="text-amber-300 text-lg">
                <span className="font-bold">{nextDealerName}</span> will be the dealer
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};