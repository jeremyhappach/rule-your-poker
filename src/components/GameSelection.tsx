import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface GameSelectionProps {
  onSelectGame: (gameType: string) => void;
}

export const GameSelection = ({ onSelectGame }: GameSelectionProps) => {
  const games = [
    {
      id: "3-5-7",
      name: "3-5-7",
      description: "Classic Three, Five, Seven poker",
      enabled: true,
    },
    {
      id: "holm-game",
      name: "Holm Game",
      description: "Coming soon",
      enabled: false,
    },
    {
      id: "straight-cincinnati",
      name: "Straight Cincinnati",
      description: "Coming soon",
      enabled: false,
    },
    {
      id: "low-cincinnati",
      name: "Low Cincinnati",
      description: "Coming soon",
      enabled: false,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="max-w-2xl mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
        <CardContent className="pt-8 pb-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-poker-gold">Select Game</h2>
            <p className="text-amber-100">Dealer chooses the game variant</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => game.enabled && onSelectGame(game.id)}
                disabled={!game.enabled}
                className={`
                  relative p-6 rounded-lg border-2 transition-all
                  ${game.enabled
                    ? 'border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer'
                    : 'border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50'
                  }
                `}
              >
                {!game.enabled && (
                  <div className="absolute top-2 right-2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className={`text-xl font-bold ${game.enabled ? 'text-poker-gold' : 'text-gray-400'}`}>
                    {game.name}
                  </h3>
                  <p className={`text-sm ${game.enabled ? 'text-amber-200' : 'text-gray-500'}`}>
                    {game.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
