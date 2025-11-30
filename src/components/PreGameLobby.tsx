import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  is_bot: boolean;
  profiles?: {
    username: string;
  };
}

interface PreGameLobbyProps {
  players: Player[];
  currentUserId: string | undefined;
  onStartGame: () => void;
  onAddBot: () => void;
  canStart: boolean;
}

export const PreGameLobby = ({ 
  players, 
  currentUserId, 
  onStartGame, 
  onAddBot,
  canStart 
}: PreGameLobbyProps) => {
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const isCreator = currentPlayer?.position === 1;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Player List Box */}
        <Card className="bg-gradient-to-br from-poker-felt to-poker-felt-dark border-amber-900">
          <CardHeader>
            <CardTitle className="text-poker-gold">Players ({players.length}/7)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-amber-950/50 rounded border border-amber-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-poker-gold flex items-center justify-center">
                      <span className="text-black font-bold text-sm">
                        {player.position}
                      </span>
                    </div>
                    <div>
                      <p className="text-amber-100 font-semibold">
                        {player.profiles?.username || `Player ${player.position}`}
                      </p>
                      {player.user_id === currentUserId && (
                        <Badge variant="secondary" className="text-xs bg-poker-gold text-black border-0 mt-1">
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                  {player.is_bot && (
                    <Badge className="bg-purple-500 text-white border-0">
                      <Bot className="w-3 h-3 mr-1" />
                      Bot
                    </Badge>
                  )}
                </div>
              ))}
              {players.length < 7 && (
                <div className="text-center py-4 text-amber-300/50 text-sm">
                  Waiting for more players to join...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Default Values Box */}
        <Card className="bg-gradient-to-br from-poker-felt to-poker-felt-dark border-amber-900">
          <CardHeader>
            <CardTitle className="text-poker-gold">Game Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center py-6 px-4">
                <p className="text-amber-100 text-sm leading-relaxed">
                  Once the game starts, the dealer will select the game type and configure all game rules including ante, betting limits, and win conditions.
                </p>
              </div>
              <div className="pt-2 border-t border-amber-800">
                <p className="text-xs text-amber-300/70 text-center font-semibold">
                  Dealer call-it home game poker
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      {isCreator && (
        <div className="flex gap-4 justify-center">
          <Button
            onClick={onAddBot}
            variant="outline"
            size="lg"
            disabled={players.length >= 7}
            className="border-purple-500 text-purple-400 hover:bg-purple-500/10"
          >
            <Bot className="w-4 h-4 mr-2" />
            Add Bot Player
          </Button>
          <Button
            onClick={onStartGame}
            size="lg"
            disabled={!canStart}
            className="bg-poker-gold hover:bg-poker-gold/80 text-black font-bold"
          >
            Start Game
          </Button>
        </div>
      )}
      
      {!isCreator && (
        <div className="text-center">
          <p className="text-amber-300/70">
            Waiting for game creator to start the game...
          </p>
        </div>
      )}
    </div>
  );
};