import { useEffect, useRef } from "react";
import { GameTable } from "./GameTable";
import { MobileGameTable } from "./MobileGameTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Share2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  current_decision: string | null;
  decision_locked: boolean | null;
  legs: number;
  is_bot: boolean;
  sitting_out: boolean;
  waiting?: boolean;
  profiles?: {
    username: string;
  };
}

interface WaitingForPlayersTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  onSelectSeat: (position: number) => void;
  onGameStart: () => void;
  isMobile: boolean;
}

export const WaitingForPlayersTable = ({
  gameId,
  players,
  currentUserId,
  onSelectSeat,
  onGameStart,
  isMobile
}: WaitingForPlayersTableProps) => {
  const { toast } = useToast();
  const gameStartTriggeredRef = useRef(false);
  const previousPlayerCountRef = useRef(0);
  
  // Check if current user is seated
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const isSeated = !!currentPlayer;
  
  // Count seated players (in waiting status)
  const seatedPlayerCount = players.filter(p => p.waiting === true || !p.sitting_out).length;
  const hasEnoughPlayers = seatedPlayerCount >= 2;

  // When 2+ players are seated, trigger game start (with "SHUFFLE UP AND DEAL" announcement)
  useEffect(() => {
    if (hasEnoughPlayers && !gameStartTriggeredRef.current) {
      gameStartTriggeredRef.current = true;
      
      // Show announcement toast
      toast({
        title: "🃏 SHUFFLE UP AND DEAL! 🃏",
        description: "The game is starting...",
        duration: 3000,
      });
      
      // Small delay to let players see the announcement
      setTimeout(() => {
        onGameStart();
      }, 1500);
    }
  }, [hasEnoughPlayers, onGameStart, toast]);

  // Show notification when new player joins
  useEffect(() => {
    if (players.length > previousPlayerCountRef.current && previousPlayerCountRef.current > 0) {
      const newPlayer = players.find(p => !previousPlayerCountRef.current);
      toast({
        title: "Player Joined!",
        description: `${players.length} player${players.length > 1 ? 's' : ''} at the table`,
      });
    }
    previousPlayerCountRef.current = players.length;
  }, [players.length, toast]);

  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl);
    toast({
      title: "Link Copied!",
      description: "Share this link to invite players",
    });
  };

  // Overlay message for the felt
  const renderFeltMessage = () => (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-4 border border-amber-600/50 max-w-xs text-center">
        <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        {!isSeated ? (
          <>
            <p className="text-amber-300 font-bold text-lg mb-1">Choose a Seat!</p>
            <p className="text-amber-300/70 text-sm">
              Game starts when 2+ players are seated
            </p>
          </>
        ) : (
          <>
            <p className="text-amber-300 font-bold text-lg mb-1">Waiting for Players</p>
            <p className="text-amber-300/70 text-sm">
              {seatedPlayerCount}/2+ players seated
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInvite}
              className="mt-3 pointer-events-auto border-amber-600 text-amber-300 hover:bg-amber-600/20"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Invite Players
            </Button>
          </>
        )}
      </div>
    </div>
  );

  // Empty props for the table (no cards, no game state)
  const emptyTableProps = {
    players,
    currentUserId,
    pot: 0,
    currentRound: 0,
    allDecisionsIn: false,
    playerCards: [] as { player_id: string; cards: any[] }[],
    timeLeft: null,
    lastRoundResult: null,
    dealerPosition: null,
    legValue: 1,
    legsToWin: 3,
    potMaxEnabled: true,
    potMaxValue: 10,
    pendingSessionEnd: false,
    awaitingNextRound: false,
    onStay: () => {},
    onFold: () => {},
    onSelectSeat,
  };

  return (
    <div className="relative">
      {isMobile ? (
        <MobileGameTable
          {...emptyTableProps}
        />
      ) : (
        <GameTable
          {...emptyTableProps}
        />
      )}
      {renderFeltMessage()}
      
      {/* Header showing player count */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
        <Badge 
          variant="outline" 
          className="bg-black/60 border-amber-600/50 text-amber-300 px-3 py-1"
        >
          <Users className="w-4 h-4 mr-2" />
          {seatedPlayerCount} Player{seatedPlayerCount !== 1 ? 's' : ''} Seated
        </Badge>
      </div>
    </div>
  );
};
