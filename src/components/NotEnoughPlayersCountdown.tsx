import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { handlePlayerRejoin } from "@/lib/playerStateEvaluation";
import { useToast } from "@/hooks/use-toast";

interface NotEnoughPlayersCountdownProps {
  gameId: string;
  onComplete: () => void;
  onResume: () => void;
  currentPlayerId?: string;
  isCurrentPlayerSittingOut?: boolean;
  isCurrentPlayerWaiting?: boolean;
}

export const NotEnoughPlayersCountdown = ({ 
  gameId, 
  onComplete, 
  onResume,
  currentPlayerId,
  isCurrentPlayerSittingOut,
  isCurrentPlayerWaiting
}: NotEnoughPlayersCountdownProps) => {
  const [countdown, setCountdown] = useState(30);
  const [isRejoining, setIsRejoining] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const onCompleteRef = useRef(onComplete);
  const hasEndedRef = useRef(false);

  // Keep ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleRejoin = async () => {
    if (!currentPlayerId) return;
    
    setIsRejoining(true);
    const success = await handlePlayerRejoin(currentPlayerId);
    
    if (success) {
      toast({
        title: "Rejoining!",
        description: "You'll be dealt in when the game resumes",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to rejoin",
        variant: "destructive",
      });
    }
    setIsRejoining(false);
  };

  // Monitor for players rejoining (waiting = true)
  useEffect(() => {
    const checkForRejoiningPlayers = async () => {
      const { data: players } = await supabase
        .from('players')
        .select('id, sitting_out, waiting')
        .eq('game_id', gameId);

      if (!players) return;

      // Count active players: not sitting_out OR (sitting_out but waiting to rejoin)
      const activeOrWaitingCount = players.filter(p => 
        !p.sitting_out || (p.sitting_out && p.waiting)
      ).length;

      if (activeOrWaitingCount >= 2) {
        // Resume the session - enough players are active or waiting to rejoin
        onResume();
      }
    };

    // Check immediately
    checkForRejoiningPlayers();

    // Subscribe to player changes
    const channel = supabase
      .channel('countdown-player-monitor')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`
        },
        () => {
          checkForRejoiningPlayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, onResume]);

  // Countdown timer using interval for reliable ticking
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle session end when countdown reaches 0
  useEffect(() => {
    if (countdown <= 0 && !hasEndedRef.current) {
      hasEndedRef.current = true;
      
      const endSession = async () => {
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString()
          })
          .eq('id', gameId);
        
        onCompleteRef.current();
        navigate('/');
      };
      
      endSession();
    }
  }, [countdown, gameId, navigate]);

  // Show rejoin button if player is sitting out and not already waiting
  const showRejoinButton = currentPlayerId && isCurrentPlayerSittingOut && !isCurrentPlayerWaiting;

  return (
    <Card className="fixed inset-0 m-auto w-80 h-auto max-h-72 z-50 bg-destructive/90 border-destructive">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-white text-xl">Not Enough Active Players</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-3">
        <p className="text-white/90">Session will end in</p>
        <Badge variant="outline" className="text-4xl px-6 py-3 bg-white text-destructive font-bold">
          {countdown}
        </Badge>
        
        {showRejoinButton ? (
          <Button
            onClick={handleRejoin}
            disabled={isRejoining}
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 text-lg animate-pulse"
          >
            {isRejoining ? "Rejoining..." : "🎮 REJOIN GAME"}
          </Button>
        ) : isCurrentPlayerWaiting ? (
          <p className="text-green-300 font-semibold">✓ You're queued to rejoin!</p>
        ) : (
          <p className="text-white/70 text-sm">Players can rejoin to continue</p>
        )}
      </CardContent>
    </Card>
  );
};