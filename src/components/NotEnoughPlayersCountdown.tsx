import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface NotEnoughPlayersCountdownProps {
  gameId: string;
  onComplete: () => void;
}

export const NotEnoughPlayersCountdown = ({ gameId, onComplete }: NotEnoughPlayersCountdownProps) => {
  const [countdown, setCountdown] = useState(5);
  const navigate = useNavigate();

  useEffect(() => {
    if (countdown <= 0) {
      // End session
      const endSession = async () => {
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString()
          })
          .eq('id', gameId);
        
        onComplete();
        navigate('/');
      };
      
      endSession();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, gameId, navigate, onComplete]);

  return (
    <Card className="fixed inset-0 m-auto w-80 h-48 z-50 bg-destructive/90 border-destructive">
      <CardHeader className="text-center">
        <CardTitle className="text-white text-xl">Not Enough Active Players</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-white/90">Session will end in</p>
        <Badge variant="outline" className="text-4xl px-6 py-3 bg-white text-destructive font-bold">
          {countdown}
        </Badge>
      </CardContent>
    </Card>
  );
};
