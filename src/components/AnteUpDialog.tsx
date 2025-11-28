import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AnteUpDialogProps {
  gameId: string;
  playerId: string;
  anteAmount: number;
  legValue: number;
  pussyTaxEnabled: boolean;
  pussyTaxValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  onDecisionMade: () => void;
}

export const AnteUpDialog = ({
  gameId,
  playerId,
  anteAmount,
  legValue,
  pussyTaxEnabled,
  pussyTaxValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  onDecisionMade,
}: AnteUpDialogProps) => {
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState(10);
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
      toast({
        title: "Error",
        description: "Failed to ante up",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Ante Up!",
      description: `You paid $${anteAmount} to join the game`,
    });

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
      toast({
        title: "Error",
        description: "Failed to sit out",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Sitting Out",
      description: "You'll observe this game",
    });

    onDecisionMade();
  };

  return (
    <Dialog open={!hasDecided} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">Game Configuration Set!</DialogTitle>
          <DialogDescription className="text-center">
            The dealer has configured the game rules
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="font-semibold">Ante Amount:</div>
            <div className="text-right">${anteAmount}</div>
            
            <div className="font-semibold">Leg Value:</div>
            <div className="text-right">${legValue}</div>
            
            <div className="font-semibold">Pussy Tax:</div>
            <div className="text-right">{pussyTaxEnabled ? `$${pussyTaxValue}` : 'Disabled'}</div>
            
            <div className="font-semibold">Legs to Win:</div>
            <div className="text-right">{legsToWin}</div>
            
            <div className="font-semibold">Pot Maximum:</div>
            <div className="text-right">{potMaxEnabled ? `$${potMaxValue}` : 'Unlimited'}</div>
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
          
          <p className="text-xs text-muted-foreground">
            Choose within {timeLeft} seconds or you'll automatically sit out
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
