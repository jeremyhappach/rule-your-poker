import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface NotEnoughPlayersCountdownProps {
  gameId: string;
  onComplete: () => void;
  onResume: () => void;
}

export const NotEnoughPlayersCountdown = ({ gameId, onComplete, onResume }: NotEnoughPlayersCountdownProps) => {
  const [countdown, setCountdown] = useState(30);
  const navigate = useNavigate();
  const onCompleteRef = useRef(onComplete);
  const hasEndedRef = useRef(false);

  // Keep ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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

  return (
    <Card className="fixed inset-0 m-auto w-80 h-56 z-50 bg-destructive/90 border-destructive">
      <CardHeader className="text-center">
        <CardTitle className="text-white text-xl">Not Enough Active Players</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-white/90">Session will end in</p>
        <Badge variant="outline" className="text-4xl px-6 py-3 bg-white text-destructive font-bold">
          {countdown}
        </Badge>
        <p className="text-white/70 text-sm">Players can rejoin to continue</p>
      </CardContent>
    </Card>
  );
};