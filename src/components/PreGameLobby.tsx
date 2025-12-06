import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Users, Spade, Crown } from "lucide-react";

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
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Spade className="w-8 h-8 text-amber-400" />
          <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
            Game Lobby
          </h2>
          <Spade className="w-8 h-8 text-amber-400" />
        </div>
        <p className="text-amber-300/60 text-sm">Waiting for players to join...</p>
      </div>

      {/* Player List Box */}
      <Card className="max-w-lg mx-auto bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 border-2 border-amber-600/50 shadow-xl shadow-amber-900/20 backdrop-blur-sm">
        <CardHeader className="border-b border-amber-700/30 pb-4">
          <CardTitle className="flex items-center gap-2 text-amber-400">
            <Users className="w-5 h-5" />
            Players ({players.length}/7)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-950/40 to-amber-900/20 rounded-lg border border-amber-700/40 hover:border-amber-500/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                    <span className="text-black font-bold text-sm">
                      {player.position}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-amber-100 font-semibold">
                      {player.profiles?.username || `Player ${player.position}`}
                    </p>
                    {player.position === 1 && (
                      <Crown className="w-4 h-4 text-amber-400" />
                    )}
                    {player.user_id === currentUserId && (
                      <Badge variant="secondary" className="text-xs bg-amber-500 text-black border-0 font-bold">
                        You
                      </Badge>
                    )}
                  </div>
                </div>
                {player.is_bot && (
                  <Badge className="bg-purple-600/80 text-white border-0 shadow-md">
                    <Bot className="w-3 h-3 mr-1" />
                    Bot
                  </Badge>
                )}
              </div>
            ))}
            {players.length < 7 && (
              <div className="text-center py-6 text-amber-400/40 text-sm border-2 border-dashed border-amber-700/30 rounded-lg">
                <Users className="w-6 h-6 mx-auto mb-2 opacity-50" />
                Waiting for more players...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {isCreator && (
        <div className="flex gap-4 justify-center pt-4">
          <Button
            onClick={onAddBot}
            variant="outline"
            size="lg"
            disabled={players.length >= 7}
            className="border-purple-500/70 text-purple-400 hover:bg-purple-500/10 hover:border-purple-400 transition-all shadow-lg"
          >
            <Bot className="w-4 h-4 mr-2" />
            Add Bot Player
          </Button>
          <Button
            onClick={onStartGame}
            size="lg"
            disabled={!canStart}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30 transition-all"
          >
            Start Game
          </Button>
        </div>
      )}
      
      {!isCreator && (
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-900/20 rounded-full border border-amber-700/30">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            <p className="text-amber-300/70 text-sm">
              Waiting for game creator to start the game...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
