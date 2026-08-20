import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logDebugEvent } from "@/lib/debugEventLogger";
import { isNoTimersEnabledCached } from "@/lib/geometryLab/noTimersStore";
import { submitAnteDecision } from "@/lib/gameTimerAuthority";

interface AnteUpDialogProps {
  gameId: string;
  dealerGameId: string;
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
  anteDecisionDeadline: string;
  onDecisionMade: (decision?: 'ante_up' | 'sit_out') => void;
}

export const AnteUpDialog = ({
  gameId,
  dealerGameId,
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
  anteDecisionDeadline,
  onDecisionMade,
}: AnteUpDialogProps) => {
  const isHolmGame = gameType === 'holm-game' || gameType === 'holm';
  const isHorsesGame = gameType === 'horses';
  const isSCCGame = gameType === 'ship-captain-crew';
  const isCribbageGame = gameType === 'cribbage';
  const isGinRummyGame = gameType === 'gin-rummy' || gameType === 'ginrummy';
  const isYahtzeeGame = gameType === 'yahtzee';
  
  const getGameDisplayName = () => {
    if (isHolmGame) return 'Holm Game';
    if (isHorsesGame) return 'Horses';
    if (isSCCGame) return 'Ship Captain Crew';
    if (isCribbageGame) return 'Cribbage';
    if (isGinRummyGame) return 'Gin Rummy';
    if (isYahtzeeGame) return 'Yahtzee';
    return '3-5-7';
  };
  const gameDisplayName = getGameDisplayName();
  const secondsUntilDeadline = () => Math.max(
    0,
    Math.ceil((new Date(anteDecisionDeadline).getTime() - Date.now()) / 1000),
  );
  const [timeLeft, setTimeLeft] = useState(secondsUntilDeadline);
  const [hasDecided, setHasDecided] = useState(false);
  const [localAutoAnteRunback, setLocalAutoAnteRunback] = useState(autoAnteRunback);
  const [localAutoAnte, setLocalAutoAnte] = useState(autoAnte);

  // ── Trace: instanceId to detect remounts ──
  const instanceId = useRef(`ante_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
  const mountSeqRef = useRef(0);

  // ── Trace: mount / unmount ──
  useEffect(() => {
    mountSeqRef.current += 1;
    const seq = mountSeqRef.current;
    logDebugEvent({
      gameId,
      userId: playerId,
      eventType: 'ante_modal_rendered',
      payload: {
        instanceId: instanceId.current,
        seq,
        hasDecided,
        gameType,
        anteAmount,
        playerId,
      },
    });
    return () => {
      logDebugEvent({
        gameId,
        userId: playerId,
        eventType: 'ante_modal_hidden',
        payload: {
          instanceId: instanceId.current,
          seq,
          hasDecided,
          reason: 'unmount',
        },
      });
    };
  }, []); // empty deps = true mount/unmount

  useEffect(() => {
    if (isNoTimersEnabledCached()) return;
    const timer = setInterval(() => {
      setTimeLeft(secondsUntilDeadline());
    }, 1000);

    return () => clearInterval(timer);
  }, [anteDecisionDeadline]);

  const handleAnteUp = async () => {
    if (hasDecided) return;
    logDebugEvent({
      gameId,
      userId: playerId,
      eventType: 'ante_modal_confirm_click',
      payload: {
        instanceId: instanceId.current,
        action: 'ante_up',
        timeLeft,
      },
    });
    setHasDecided(true);

    try {
      const result = await submitAnteDecision({
        gameId,
        dealerGameId,
        playerId,
        decision: 'ante_up',
        autoAnte: localAutoAnte,
        autoAnteRunback: localAutoAnteRunback,
      });
      if (!['accepted', 'already_decided'].includes(result.outcome ?? '')) {
        setHasDecided(false);
        return;
      }
    } catch (error) {
      console.error('Failed to ante up:', error);
      setHasDecided(false);
      return;
    }

    onDecisionMade('ante_up');

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
    logDebugEvent({
      gameId,
      userId: playerId,
      eventType: 'ante_modal_confirm_click',
      payload: {
        instanceId: instanceId.current,
        action: 'sit_out',
        timeLeft,
        wasAutoTimeout: timeLeft <= 0,
      },
    });
    setHasDecided(true);

    try {
      const result = await submitAnteDecision({
        gameId,
        dealerGameId,
        playerId,
        decision: 'sit_out',
        autoAnte: localAutoAnte,
        autoAnteRunback: localAutoAnteRunback,
      });
      if (!['accepted', 'already_decided'].includes(result.outcome ?? '')) {
        setHasDecided(false);
        return;
      }
    } catch (error) {
      console.error('Failed to sit out:', error);
      setHasDecided(false);
      return;
    }

    console.log('Sitting out this game');
    onDecisionMade('sit_out');

  };

  return (
    <Dialog open={!hasDecided && timeLeft > 0} onOpenChange={() => {}}>
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
            
            {!isHolmGame && !isHorsesGame && !isSCCGame && !isCribbageGame && !isGinRummyGame && !isYahtzeeGame && (
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
            <p className="text-xs text-muted-foreground font-medium">For future ante decisions:</p>
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
