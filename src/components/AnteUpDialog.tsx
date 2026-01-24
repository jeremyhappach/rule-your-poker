import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface AnteUpDialogProps {
  gameId: string;
  playerId: string;
  gameType: string | null;
  anteAmount: number;
  legValue: number;
  pussyTaxEnabled: boolean;
  pussyTaxValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  chuckyCards: number | null;
  isRunningItBack?: boolean;
  onDecisionMade: () => void;
}

export const AnteUpDialog = ({
  gameId,
  playerId,
  gameType,
  anteAmount,
  legValue,
  pussyTaxEnabled,
  pussyTaxValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  chuckyCards,
  isRunningItBack = false,
  onDecisionMade,
}: AnteUpDialogProps) => {
  const isHolmGame = gameType === 'holm-game' || gameType === 'holm';
  const isHorsesGame = gameType === 'horses';
  const isSCCGame = gameType === 'ship-captain-crew';
  
  const getGameDisplayName = () => {
    if (isHolmGame) return 'Holm Game';
    if (isHorsesGame) return 'Horses';
    if (isSCCGame) return 'Ship Captain Crew';
    return '3-5-7';
  };
  const gameDisplayName = getGameDisplayName();
  const [timeLeft, setTimeLeft] = useState(30);
  const [hasDecided, setHasDecided] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0 && !hasDecided) {
      handleSitOut();
    }
  }, [timeLeft, hasDecided]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleAnteUp = async () => {
    if (hasDecided) return;
    setHasDecided(true);

    const { error } = await supabase
      .from('players')
      .update({
        ante_decision: 'ante_up',
        sitting_out: false,
      })
      .eq('id', playerId);

    if (error) {
      console.error('Failed to ante up:', error);
      return;
    }

    onDecisionMade();
  };

  const handleAutoAnteRunback = async () => {
    if (hasDecided) return;
    setHasDecided(true);

    // Set auto_ante_runback to true AND ante up for this hand
    // Also set auto_ante to false (mutual exclusivity)
    const { error } = await supabase
      .from('players')
      .update({
        ante_decision: 'ante_up',
        sitting_out: false,
        auto_ante_runback: true,
        auto_ante: false,
      })
      .eq('id', playerId);

    if (error) {
      console.error('Failed to set auto-ante runback:', error);
      return;
    }

    console.log('[ANTE DIALOG] Set auto_ante_runback = true and anted up');
    onDecisionMade();
  };

  const handleAutoAnteAll = async () => {
    if (hasDecided) return;
    setHasDecided(true);

    // Set auto_ante to true AND ante up for this hand
    // Also set auto_ante_runback to false (mutual exclusivity)
    const { error } = await supabase
      .from('players')
      .update({
        ante_decision: 'ante_up',
        sitting_out: false,
        auto_ante: true,
        auto_ante_runback: false,
      })
      .eq('id', playerId);

    if (error) {
      console.error('Failed to set auto-ante all:', error);
      return;
    }

    console.log('[ANTE DIALOG] Set auto_ante = true and anted up');
    onDecisionMade();
  };

  const handleSitOut = async () => {
    if (hasDecided) return;
    setHasDecided(true);

    const { error } = await supabase
      .from('players')
      .update({
        ante_decision: 'sit_out',
        sitting_out: true,
      })
      .eq('id', playerId);

    if (error) {
      console.error('Failed to sit out:', error);
      return;
    }

    console.log('Sitting out this game');
    onDecisionMade();
  };

  return (
    <Dialog open={!hasDecided} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">
            {isRunningItBack ? "🔥 Running it Back!" : "Game Configuration Set!"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isRunningItBack 
              ? "Same game, same rules - let's go!" 
              : "The dealer has configured the game rules"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          <div className="text-center mb-4">
            <span className="text-xl font-bold text-primary">{gameDisplayName}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="font-semibold">Ante Amount:</div>
            <div className="text-right">${anteAmount}</div>
            
            {isHolmGame && (
              <>
                <div className="font-semibold">Chucky Cards:</div>
                <div className="text-right">{chuckyCards || 4}</div>
              </>
            )}
            
            {!isHolmGame && !isHorsesGame && !isSCCGame && (
              <>
                <div className="font-semibold">Leg Value:</div>
                <div className="text-right">${legValue}</div>
                
                <div className="font-semibold">Legs to Win:</div>
                <div className="text-right">{legsToWin}</div>
                
                <div className="font-semibold">Pussy Tax:</div>
                <div className="text-right">{pussyTaxEnabled ? `$${pussyTaxValue}` : 'Disabled'}</div>
                
                <div className="font-semibold">Pot Maximum:</div>
                <div className="text-right">{potMaxEnabled ? `$${potMaxValue}` : 'Unlimited'}</div>
              </>
            )}
          </div>
        </div>

        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Badge 
              variant={timeLeft <= 3 ? "destructive" : "default"} 
              className={`text-lg px-4 py-2 ${timeLeft <= 3 ? 'animate-pulse' : ''}`}
            >
              {timeLeft}s
            </Badge>
          </div>
          
          {/* Main action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleAnteUp}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              Ante Up! 💰
            </Button>
            <Button
              onClick={handleSitOut}
              size="lg"
              variant="destructive"
              className="font-bold"
            >
              Sit Out 🪑
            </Button>
          </div>
          
          {/* Auto-ante options */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <Button
              onClick={handleAutoAnteRunback}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Auto-Ante (Run it Back)
            </Button>
            <Button
              onClick={handleAutoAnteAll}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Auto-Ante (All)
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Choose within {timeLeft} seconds or you'll automatically sit out
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
