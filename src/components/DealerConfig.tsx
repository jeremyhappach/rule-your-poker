import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DealerConfigProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  onConfigComplete: () => void;
}

export const DealerConfig = ({ gameId, dealerUsername, isBot, onConfigComplete }: DealerConfigProps) => {
  const { toast } = useToast();
  const [anteAmount, setAnteAmount] = useState(2);
  const [legValue, setLegValue] = useState(1);
  const [pussyTaxEnabled, setPussyTaxEnabled] = useState(true);
  const [pussyTaxValue, setPussyTaxValue] = useState(1);
  const [legsToWin, setLegsToWin] = useState(3);
  const [potMaxEnabled, setPotMaxEnabled] = useState(true);
  const [potMaxValue, setPotMaxValue] = useState(10);

  // Auto-submit for bots
  useEffect(() => {
    if (isBot) {
      handleSubmit();
    }
  }, [isBot]);

  const handleSubmit = async () => {
    // Validation
    if (anteAmount < 1 || legValue < 1 || legsToWin < 1) {
      toast({
        title: "Invalid values",
        description: "All amounts must be at least 1",
        variant: "destructive",
      });
      return;
    }

    if (pussyTaxEnabled && pussyTaxValue < 1) {
      toast({
        title: "Invalid pussy tax",
        description: "Pussy tax value must be at least 1",
        variant: "destructive",
      });
      return;
    }

    if (potMaxEnabled && potMaxValue < 1) {
      toast({
        title: "Invalid pot max",
        description: "Pot max value must be at least 1",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('games')
      .update({
        ante_amount: anteAmount,
        leg_value: legValue,
        pussy_tax_enabled: pussyTaxEnabled,
        pussy_tax_value: pussyTaxValue,
        pussy_tax: pussyTaxValue, // Update old column too for backward compatibility
        legs_to_win: legsToWin,
        pot_max_enabled: potMaxEnabled,
        pot_max_value: potMaxValue,
        config_complete: true,
        status: 'ante_decision',
        ante_decision_deadline: new Date(Date.now() + 10000).toISOString(), // 10 seconds
      })
      .eq('id', gameId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
      return;
    }

    if (!isBot) {
      toast({
        title: "Configuration saved",
        description: "Players must now decide to ante up or sit out",
      });
    }

    onConfigComplete();
  };

  if (isBot) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold">
              {dealerUsername} is the dealer
            </p>
            <p className="text-muted-foreground">
              Configuring game with default settings...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Dealer Configuration</CardTitle>
        <CardDescription>
          {dealerUsername} is the dealer. Configure the game parameters below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="ante">Ante Amount ($)</Label>
          <Input
            id="ante"
            type="number"
            min="1"
            value={anteAmount}
            onChange={(e) => setAnteAmount(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted-foreground">Amount each player pays per round</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="legValue">Leg Value ($)</Label>
          <Input
            id="legValue"
            type="number"
            min="1"
            value={legValue}
            onChange={(e) => setLegValue(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted-foreground">Value of each leg won</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="pussyTax">Pussy Tax</Label>
            <Switch
              id="pussyTax"
              checked={pussyTaxEnabled}
              onCheckedChange={setPussyTaxEnabled}
            />
          </div>
          {pussyTaxEnabled && (
            <div className="space-y-2 pl-4">
              <Label htmlFor="pussyTaxValue">Pussy Tax Amount ($)</Label>
              <Input
                id="pussyTaxValue"
                type="number"
                min="1"
                value={pussyTaxValue}
                onChange={(e) => setPussyTaxValue(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Penalty for folding early</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="legsToWin">Number of Legs to Win</Label>
          <Input
            id="legsToWin"
            type="number"
            min="1"
            value={legsToWin}
            onChange={(e) => setLegsToWin(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted-foreground">Legs needed to win the game</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="potMax">Pot Maximum</Label>
            <Switch
              id="potMax"
              checked={potMaxEnabled}
              onCheckedChange={setPotMaxEnabled}
            />
          </div>
          {potMaxEnabled && (
            <div className="space-y-2 pl-4">
              <Label htmlFor="potMaxValue">Maximum Pot Value ($)</Label>
              <Input
                id="potMaxValue"
                type="number"
                min="1"
                value={potMaxValue}
                onChange={(e) => setPotMaxValue(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Maximum amount loser pays in showdown</p>
            </div>
          )}
          {!potMaxEnabled && (
            <p className="text-xs text-muted-foreground pl-4">
              Loser of showdown pays entire pot value with no limit
            </p>
          )}
        </div>

        <Button onClick={handleSubmit} className="w-full" size="lg">
          Start Game
        </Button>
      </CardContent>
    </Card>
  );
};
