import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Spade, Dice5, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface GameSelectionProps {
  onSelectGame: (gameType: string) => void;
  lastGameType?: string | null;
  isFirstHand?: boolean;
  activePlayerCount?: number;
}

export const GameSelection = ({ 
  onSelectGame, 
  lastGameType = null,
  isFirstHand = true,
  activePlayerCount = 0
}: GameSelectionProps) => {

  const cardGames = [
    {
      id: "3-5-7",
      name: "3-5-7",
      description: "Classic wild card poker",
      enabled: true,
    },
    {
      id: "holm-game",
      name: "Holm",
      description: "4 cards vs community + Chucky",
      enabled: true,
    },
    {
      id: "cribbage",
      name: "Cribbage",
      description: "Pegging to 121",
      enabled: true,
      maxPlayers: 4,
    },
    {
      id: "sports-trivia",
      name: "Trivia",
      description: "Answer trivia, win the pot",
      enabled: true,
    },
  ];

  const diceGames = [
    {
      id: "horses",
      name: "Horses",
      description: "5 dice, best hand wins",
      enabled: true,
    },
    {
      id: "ship-captain-crew",
      name: "Ship Captain Crew",
      description: "Get 6-5-4, max cargo",
      enabled: true,
    },
  ];

  const getGameDisplayName = (gameType: string) => {
    switch (gameType) {
      case '3-5-7': return '3-5-7';
      case 'holm-game': return 'Holm';
      case 'horses': return 'Horses';
      case 'ship-captain-crew': return 'Ship';
      case 'sports-trivia': return 'Trivia';
      case 'cribbage': return 'Cribbage';
      default: return gameType;
    }
  };

  const handleRunBack = () => {
    if (lastGameType) {
      onSelectGame(lastGameType);
    }
  };

  const handleGameSelect = (game: typeof cardGames[0]) => {
    if (!game.enabled) {
      return;
    }
    // Check player count restriction
    if (game.maxPlayers && activePlayerCount > game.maxPlayers) {
      toast.error(`${game.name} requires ${game.maxPlayers} or fewer players`);
      return;
    }
    onSelectGame(game.id);
  };

  const isGameDisabled = (game: typeof cardGames[0]) => {
    if (!game.enabled) return true;
    if (game.maxPlayers && activePlayerCount > game.maxPlayers) return true;
    return false;
  };

  const getPlayerRestrictionLabel = (game: typeof cardGames[0]) => {
    if (game.maxPlayers) {
      return `${game.maxPlayers} max`;
    }
    return null;
  };

  // Determine which tab to default to based on last game type
  const getDefaultTab = () => {
    if (lastGameType) {
      return lastGameType === 'horses' || lastGameType === 'ship-captain-crew' ? 'dice' : 'cards';
    }
    return 'cards';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-6 pb-6 space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-poker-gold">Select Game</h2>
            <p className="text-amber-100 text-sm">Dealer chooses the game</p>
          </div>

          {/* Tabbed Game Selection */}
          <Tabs defaultValue={getDefaultTab()} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-poker-felt-dark border border-poker-gold/30">
              <TabsTrigger 
                value="cards" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-poker-felt-dark flex items-center gap-2"
              >
                <Spade className="w-4 h-4" />
                Card Games
              </TabsTrigger>
              <TabsTrigger 
                value="dice" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-poker-felt-dark flex items-center gap-2"
              >
                <Dice5 className="w-4 h-4" />
                Dice Games
              </TabsTrigger>
            </TabsList>

            {/* Card Games Tab */}
            <TabsContent value="cards" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {cardGames.map((game) => {
                  const disabled = isGameDisabled(game);
                  const restriction = getPlayerRestrictionLabel(game);
                  
                  return (
                    <button
                      key={game.id}
                      onClick={() => handleGameSelect(game)}
                      disabled={disabled}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all text-left
                        ${disabled
                          ? 'border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50'
                          : 'border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer'
                        }
                      `}
                    >
                      {!game.enabled && (
                        <div className="absolute top-2 right-2">
                          <Lock className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <h4 className={`text-base font-bold ${disabled ? 'text-gray-400' : 'text-poker-gold'}`}>
                          {game.name}
                        </h4>
                        <p className={`text-xs ${disabled ? 'text-gray-500' : 'text-amber-200'}`}>
                          {game.description}
                        </p>
                        {restriction && (
                          <p className={`text-xs font-medium ${
                            activePlayerCount > (game.maxPlayers || 99) 
                              ? 'text-red-400' 
                              : 'text-amber-400'
                          }`}>
                            {restriction}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </TabsContent>

            {/* Dice Games Tab */}
            <TabsContent value="dice" className="mt-4">
              <div className="grid grid-cols-2 gap-3">
                {diceGames.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => handleGameSelect(game)}
                    className="relative p-4 rounded-lg border-2 transition-all text-left border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
                  >
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-poker-gold">
                        {game.name}
                      </h4>
                      <p className="text-xs text-amber-200">
                        {game.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Run Back option - only show on 2nd+ game of session */}
          {!isFirstHand && lastGameType && (
            <div className="pt-3 border-t border-poker-gold/30">
              <button
                onClick={handleRunBack}
                className="w-full p-3 rounded-lg border-2 transition-all border-amber-600 bg-amber-800/30 hover:bg-amber-800/50 hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <span className="text-base font-bold text-amber-400">
                  Run Back {getGameDisplayName(lastGameType)}
                </span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
