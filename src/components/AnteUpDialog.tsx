import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  autoAnte?: boolean;
  autoAnteRunback?: boolean;
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
  autoAnte = false,
  autoAnteRunback = false,
  onDecisionMade,
}: AnteUpDialogProps) => {
  const isHolmGame = gameType === 'holm-game' || gameType === 'holm';
  const isHorsesGame = gameType === 'horses';
  const isSCCGame = gameType === 'ship-captain-crew';
  const isTriviaGame = gameType === 'sports-trivia';
  
  const getGameDisplayName = () => {
    if (isHolmGame) return 'Holm Game';
    if (isHorsesGame) return 'Horses';
    if (isSCCGame) return 'Ship Captain Crew';
    if (isTriviaGame) return 'Sports Trivia';
    return '3-5-7';
  };
  const gameDisplayName = getGameDisplayName();
  const [timeLeft, setTimeLeft] = useState(30);
  const [hasDecided, setHasDecided] = useState(false);
  const [localAutoAnteRunback, setLocalAutoAnteRunback] = useState(autoAnteRunback);
  const [localAutoAnte, setLocalAutoAnte] = useState(autoAnte);

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
        auto_ante: localAutoAnte,
        auto_ante_runback: localAutoAnteRunback,
      })
      .eq('id', playerId);

    if (error) {
      console.error('Failed to ante up:', error);
      return;
    }

    onDecisionMade();
  };

  const toggleAutoAnteRunback = async (checked: boolean) => {
    // Mutual exclusivity: if enabling runback, disable all
    const newRunback = checked;
    const newAll = checked ? false : localAutoAnte;
    
    setLocalAutoAnteRunback(newRunback);
    setLocalAutoAnte(newAll);

    // Persist to database immediately
    await supabase
      .from('players')
      .update({
        auto_ante_runback: newRunback,
        auto_ante: newAll,
      })
      .eq('id', playerId);
  };

  const toggleAutoAnteAll = async (checked: boolean) => {
    // Mutual exclusivity: if enabling all, disable runback
    const newAll = checked;
    const newRunback = checked ? false : localAutoAnteRunback;
    
    setLocalAutoAnte(newAll);
    setLocalAutoAnteRunback(newRunback);

    // Persist to database immediately
    await supabase
      .from('players')
      .update({
        auto_ante: newAll,
        auto_ante_runback: newRunback,
      })
      .eq('id', playerId);
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
            
            {!isHolmGame && !isHorsesGame && !isSCCGame && !isTriviaGame && (
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
            
            {isTriviaGame && (
              <>
                <div className="font-semibold">Format:</div>
                <div className="text-right">Winner takes pot</div>
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
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
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
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-ante-runback"
                checked={localAutoAnteRunback}
                onCheckedChange={(checked) => toggleAutoAnteRunback(checked === true)}
              />
              <Label htmlFor="auto-ante-runback" className="text-sm cursor-pointer">
                Auto-Ante (Run it Back)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-ante-all"
                checked={localAutoAnte}
                onCheckedChange={(checked) => toggleAutoAnteAll(checked === true)}
              />
              <Label htmlFor="auto-ante-all" className="text-sm cursor-pointer">
                Auto-Ante (All Games)
              </Label>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Choose within {timeLeft} seconds or you'll automatically sit out
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
