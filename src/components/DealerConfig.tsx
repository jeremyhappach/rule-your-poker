import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

interface DealerConfigProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  gameType: string;
  currentAnteAmount: number;
  currentLegValue: number;
  currentPussyTaxEnabled: boolean;
  currentPussyTaxValue: number;
  currentLegsToWin: number;
  currentPotMaxEnabled: boolean;
  currentPotMaxValue: number;
  currentChuckyCards: number;
  onConfigComplete: () => void;
}

export const DealerConfig = ({ 
  gameId, 
  dealerUsername, 
  isBot, 
  dealerPlayerId,
  gameType,
  currentAnteAmount,
  currentLegValue,
  currentPussyTaxEnabled,
  currentPussyTaxValue,
  currentLegsToWin,
  currentPotMaxEnabled,
  currentPotMaxValue,
  currentChuckyCards,
  onConfigComplete 
}: DealerConfigProps) => {
  const [anteAmount, setAnteAmount] = useState(currentAnteAmount || 2);
  const [legValue, setLegValue] = useState(currentLegValue || 1);
  const [pussyTaxEnabled, setPussyTaxEnabled] = useState(currentPussyTaxEnabled ?? true);
  const [pussyTaxValue, setPussyTaxValue] = useState(currentPussyTaxValue || 1);
  const [legsToWin, setLegsToWin] = useState(currentLegsToWin || 3);
  const [potMaxEnabled, setPotMaxEnabled] = useState(currentPotMaxEnabled ?? true);
  const [potMaxValue, setPotMaxValue] = useState(currentPotMaxValue || 10);
  const [chuckyCards, setChuckyCards] = useState(currentChuckyCards || 4);
  const [rabbitHunt, setRabbitHunt] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  
  const isHolmGame = gameType === 'holm-game';

  // Fetch defaults from game_defaults table
  useEffect(() => {
    const fetchDefaults = async () => {
      // Map frontend game type to database game type
      const dbGameType = isHolmGame ? 'holm' : '3-5-7';
      
      const { data, error } = await supabase
        .from('game_defaults')
        .select('*')
        .eq('game_type', dbGameType)
        .single();

      if (!error && data) {
        console.log('[DEALER CONFIG] Loaded defaults:', data);
        setAnteAmount(data.ante_amount);
        setPotMaxEnabled(data.pot_max_enabled);
        setPotMaxValue(data.pot_max_value);
        setPussyTaxEnabled(data.pussy_tax_enabled);
        setPussyTaxValue(data.pussy_tax_value);
        
        if (isHolmGame) {
          setChuckyCards(data.chucky_cards);
          setRabbitHunt(data.rabbit_hunt ?? false);
        } else {
          setLegValue(data.leg_value);
          setLegsToWin(data.legs_to_win);
        }
      } else {
        console.log('[DEALER CONFIG] No defaults found, using fallbacks');
      }
      setLoadingDefaults(false);
    };

    fetchDefaults();
  }, [isHolmGame]);

  // Auto-submit for bots - wait for defaults to load first
  useEffect(() => {
    if (isBot && !loadingDefaults) {
      const autoSubmit = async () => {
        // Update game config using loaded default settings
        const updateData: any = {
          ante_amount: anteAmount,
          leg_value: legValue,
          pussy_tax_enabled: pussyTaxEnabled,
          pussy_tax_value: pussyTaxValue,
          pussy_tax: pussyTaxValue,
          legs_to_win: legsToWin,
          pot_max_enabled: potMaxEnabled,
          pot_max_value: potMaxValue,
          config_complete: true,
          status: 'ante_decision',
          ante_decision_deadline: new Date(Date.now() + 10000).toISOString(),
        };

        if (isHolmGame) {
          updateData.chucky_cards = chuckyCards;
          updateData.rabbit_hunt = rabbitHunt;
        }

        const { error } = await supabase
          .from('games')
          .update(updateData)
          .eq('id', gameId);

        if (!error) {
          // Reset ante_decision for all non-dealer players so they get the popup (including sitting_out players)
          await supabase
            .from('players')
            .update({ ante_decision: null })
            .eq('game_id', gameId)
            .neq('id', dealerPlayerId);

          // Automatically ante up the dealer (bot)
          await supabase
            .from('players')
            .update({ 
              ante_decision: 'ante_up',
              sitting_out: false
            })
            .eq('id', dealerPlayerId);
            
          onConfigComplete();
        }
      };
      
      autoSubmit();
    }
  }, [isBot, loadingDefaults, gameId, dealerPlayerId, anteAmount, legValue, pussyTaxEnabled, pussyTaxValue, legsToWin, potMaxEnabled, potMaxValue, chuckyCards, isHolmGame, onConfigComplete]);

  const handleSubmit = async () => {
    console.log('[DEALER CONFIG] handleSubmit called');
    
    // Validation
    if (anteAmount < 1 || legValue < 1 || legsToWin < 1) {
      console.error('Invalid values: All amounts must be at least 1');
      return;
    }

    if (pussyTaxEnabled && pussyTaxValue < 1) {
      console.error('Invalid pussy tax: must be at least 1');
      return;
    }

    if (potMaxEnabled && potMaxValue < 1) {
      console.error('Invalid pot max: must be at least 1');
      return;
    }

    // Update game config
    const anteDeadline = new Date(Date.now() + 10000).toISOString();
    const updateData: any = {
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
      ante_decision_deadline: anteDeadline,
    };

    if (isHolmGame) {
      updateData.chucky_cards = chuckyCards;
      updateData.rabbit_hunt = rabbitHunt;
      // CRITICAL FIX: Set current_round = 1 and is_first_hand = true upfront
      // This prevents stale cards from rendering during the gap between
      // ante_decision → in_progress transition. Round only increments when is_first_hand = false.
      updateData.current_round = 1;
      updateData.is_first_hand = true;
      // Buck position will be calculated by startHolmRound
    }

    console.log('[DEALER CONFIG] Updating game with:', updateData);

    const { error, data: gameUpdateResult } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameId)
      .select();

    console.log('[DEALER CONFIG] Game update result:', { error, gameUpdateResult });

    if (error) {
      console.error('[DEALER CONFIG] Game update error:', error);
      return;
    }

    // Reset ante_decision for all non-dealer players so they get the popup (including sitting_out players)
    console.log('[DEALER CONFIG] Resetting ante_decision for non-dealer players, dealerPlayerId:', dealerPlayerId);
    const { error: resetError, data: resetResult } = await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId)
      .neq('id', dealerPlayerId)
      .select();

    console.log('[DEALER CONFIG] Reset ante_decision result:', { resetError, resetResult });

    // Automatically ante up the dealer
    console.log('[DEALER CONFIG] Setting dealer ante_decision to ante_up');
    const { error: dealerError, data: dealerResult } = await supabase
      .from('players')
      .update({ 
        ante_decision: 'ante_up',
        sitting_out: false
      })
      .eq('id', dealerPlayerId)
      .select();

    console.log('[DEALER CONFIG] Dealer ante update result:', { dealerError, dealerResult });

    console.log('[DEALER CONFIG] ✅ Config complete, calling onConfigComplete');
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
              {loadingDefaults ? 'Loading defaults...' : 'Configuring game with default settings...'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadingDefaults) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Loading game defaults...</p>
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
          <p className="text-xs text-muted-foreground">Amount each player pays per {isHolmGame ? 'hand' : 'round'}</p>
        </div>

        {!isHolmGame && (
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
        )}

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
              <p className="text-xs text-muted-foreground">
                {isHolmGame 
                  ? "Penalty when all players fold" 
                  : "Penalty for folding early"}
              </p>
            </div>
          )}
          {!pussyTaxEnabled && (
            <p className="text-xs text-muted-foreground pl-4">
              No penalty for folding
            </p>
          )}
        </div>

        {!isHolmGame && (
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
        )}

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

        {isHolmGame && (
          <>
            <div className="space-y-2">
              <Label htmlFor="chuckyCards">Chucky Cards</Label>
              <Input
                id="chuckyCards"
                type="number"
                min="2"
                max="7"
                value={chuckyCards}
                onChange={(e) => setChuckyCards(parseInt(e.target.value) || 4)}
              />
              <p className="text-xs text-muted-foreground">Number of cards Chucky gets if only one player stays (2-7)</p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="rabbitHunt">Rabbit Hunt</Label>
                <p className="text-xs text-muted-foreground">Show hidden cards when everyone folds</p>
              </div>
              <Switch
                id="rabbitHunt"
                checked={rabbitHunt}
                onCheckedChange={setRabbitHunt}
              />
            </div>
          </>
        )}

        <div className="border-t border-muted pt-4">
          <p className="text-xs text-muted-foreground text-center mb-2">
            {isHolmGame 
              ? "Game ends when a player beats Chucky in a showdown" 
              : "First player to reach the target legs wins the game"}
          </p>
        </div>

        <Button onClick={handleSubmit} className="w-full" size="lg">
          Start Game
        </Button>
      </CardContent>
    </Card>
  );
};
