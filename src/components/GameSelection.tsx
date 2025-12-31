import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Spade, Dice5, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface GameSelectionProps {
  onSelectGame: (gameType: string) => void;
  lastGameType?: string | null;
  isFirstHand?: boolean;
}

type SelectionStep = 'category' | 'cards' | 'dice';

export const GameSelection = ({ 
  onSelectGame, 
  lastGameType = null,
  isFirstHand = true 
}: GameSelectionProps) => {
  const [step, setStep] = useState<SelectionStep>('category');

  const cardGames = [
    {
      id: "3-5-7",
      name: "3-5-7",
      description: "Classic Three, Five, Seven poker",
      enabled: true,
    },
    {
      id: "holm-game",
      name: "Holm Game",
      description: "4 cards + 4 community cards vs the table",
      enabled: true,
    },
  ];

  const diceGames = [
    {
      id: "horses",
      name: "Horses",
      description: "Dice game",
      enabled: true,
      comingSoon: true,
    },
    {
      id: "ship-captain-crew",
      name: "Ship Captain Crew",
      description: "Dice game",
      enabled: true,
      comingSoon: true,
    },
  ];

  const getGameDisplayName = (gameType: string) => {
    switch (gameType) {
      case '3-5-7': return '3-5-7';
      case 'holm-game': return 'Holm';
      case 'horses': return 'Horses';
      case 'ship-captain-crew': return 'Ship Captain Crew';
      default: return gameType;
    }
  };

  const handleCategorySelect = (category: 'cards' | 'dice') => {
    setStep(category);
  };

  const handleRunBack = () => {
    if (lastGameType) {
      onSelectGame(lastGameType);
    }
  };

  const handleGameSelect = (gameId: string, comingSoon?: boolean) => {
    if (comingSoon) {
      toast.info("Coming soon!");
      return;
    }
    onSelectGame(gameId);
  };

  const handleBack = () => {
    setStep('category');
  };

  // Category selection step
  if (step === 'category') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-2xl mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-poker-gold">Select Game Type</h2>
              <p className="text-amber-100">Dealer chooses the game</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cards option */}
              <button
                onClick={() => handleCategorySelect('cards')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="flex flex-col items-center space-y-3">
                  <Spade className="w-12 h-12 text-poker-gold" />
                  <h3 className="text-xl font-bold text-poker-gold">Cards</h3>
                  <p className="text-sm text-amber-200">Poker games</p>
                </div>
              </button>

              {/* Dice option */}
              <button
                onClick={() => handleCategorySelect('dice')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="flex flex-col items-center space-y-3">
                  <Dice5 className="w-12 h-12 text-poker-gold" />
                  <h3 className="text-xl font-bold text-poker-gold">Dice</h3>
                  <p className="text-sm text-amber-200">Dice games</p>
                </div>
              </button>
            </div>

            {/* Run Back option - only show on 2nd+ game of session */}
            {!isFirstHand && lastGameType && (
              <div className="pt-4 border-t border-poker-gold/30">
                <button
                  onClick={handleRunBack}
                  className="w-full p-4 rounded-lg border-2 transition-all border-amber-600 bg-amber-800/30 hover:bg-amber-800/50 hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-3"
                >
                  <RotateCcw className="w-6 h-6 text-amber-400" />
                  <span className="text-lg font-bold text-amber-400">
                    Run Back {getGameDisplayName(lastGameType)}
                  </span>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Card games selection
  if (step === 'cards') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-2xl mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-poker-gold">Select Card Game</h2>
              <p className="text-amber-100">Choose a poker variant</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cardGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleGameSelect(game.id)}
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

            <button
              onClick={handleBack}
              className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              ← Back to Game Types
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dice games selection
  if (step === 'dice') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-2xl mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-poker-gold">Select Dice Game</h2>
              <p className="text-amber-100">Choose a dice game</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diceGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleGameSelect(game.id, game.comingSoon)}
                  className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
                >
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-poker-gold">
                      {game.name}
                    </h3>
                    <p className="text-sm text-amber-200">
                      {game.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleBack}
              className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              ← Back to Game Types
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};
