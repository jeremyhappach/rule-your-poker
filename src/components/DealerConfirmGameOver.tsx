import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Player {
  id: string;
  position: number;
  user_id: string;
  profiles?: {
    username: string;
  };
}

interface DealerConfirmGameOverProps {
  winnerMessage: string;
  isDealer: boolean;
  onConfirm: () => void;
}

export const DealerConfirmGameOver = ({ 
  winnerMessage, 
  isDealer, 
  onConfirm 
}: DealerConfirmGameOverProps) => {
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
              {isDealer ? (
                <div className="space-y-4">
                  <p className="text-amber-100 text-xl">
                    Click to proceed to next game
                  </p>
                  <Button
                    onClick={onConfirm}
                    className="bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-xl px-8 py-6"
                  >
                    Start Next Game
                  </Button>
                </div>
              ) : (
                <p className="text-amber-300 text-xl">
                  Waiting for dealer to proceed...
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
