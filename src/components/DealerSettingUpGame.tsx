import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface DealerSettingUpGameProps {
  dealerUsername: string;
}

export const DealerSettingUpGame = ({ dealerUsername }: DealerSettingUpGameProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="max-w-md mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
        <CardContent className="pt-8 pb-8 space-y-4 text-center">
          <div className="flex justify-center mb-2">
            <Loader2 className="w-8 h-8 text-poker-gold animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-poker-gold">Dealer Setting Up Game</h2>
          <p className="text-amber-100">
            {dealerUsername} is choosing the game type and configuring parameters...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
