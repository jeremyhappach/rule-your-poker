import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DealerGameSetupProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  onConfigComplete: () => void;
}

interface GameDefaults {
  ante_amount: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
}

export const DealerGameSetup = ({
  gameId,
  dealerUsername,
  isBot,
  dealerPlayerId,
  onConfigComplete,
}: DealerGameSetupProps) => {
  const { toast } = useToast();
  const [selectedGameType, setSelectedGameType] = useState<string>("holm-game");
  const [timeLeft, setTimeLeft] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSubmittedRef = useRef(false);
  
  // Config state
  const [anteAmount, setAnteAmount] = useState(2);
  const [legValue, setLegValue] = useState(1);
  const [pussyTaxEnabled, setPussyTaxEnabled] = useState(true);
  const [pussyTaxValue, setPussyTaxValue] = useState(1);
  const [legsToWin, setLegsToWin] = useState(3);
  const [potMaxEnabled, setPotMaxEnabled] = useState(true);
  const [potMaxValue, setPotMaxValue] = useState(10);
  const [chuckyCards, setChuckyCards] = useState(4);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  
  // Cache defaults for both game types
  const [holmDefaults, setHolmDefaults] = useState<GameDefaults | null>(null);
  const [threeFiveSevenDefaults, setThreeFiveSevenDefaults] = useState<GameDefaults | null>(null);

  // Fetch defaults for both game types on mount
  useEffect(() => {
    const fetchAllDefaults = async () => {
      const [holmResult, threeFiveSevenResult] = await Promise.all([
        supabase.from('game_defaults').select('*').eq('game_type', 'holm').single(),
        supabase.from('game_defaults').select('*').eq('game_type', '3-5-7').single(),
      ]);

      if (!holmResult.error && holmResult.data) {
        setHolmDefaults(holmResult.data);
      }
      if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
        setThreeFiveSevenDefaults(threeFiveSevenResult.data);
      }
      
      // Apply holm defaults initially (since holm-game is default selected)
      if (!holmResult.error && holmResult.data) {
        applyDefaults(holmResult.data);
      }
      
      setLoadingDefaults(false);
    };

    fetchAllDefaults();
  }, []);

  // Apply defaults when game type changes
  const applyDefaults = (defaults: GameDefaults) => {
    setAnteAmount(defaults.ante_amount);
    setLegValue(defaults.leg_value);
    setLegsToWin(defaults.legs_to_win);
    setPussyTaxEnabled(defaults.pussy_tax_enabled);
    setPussyTaxValue(defaults.pussy_tax_value);
    setPotMaxEnabled(defaults.pot_max_enabled);
    setPotMaxValue(defaults.pot_max_value);
    setChuckyCards(defaults.chucky_cards);
  };

  // Update config when tab changes
  const handleGameTypeChange = (gameType: string) => {
    setSelectedGameType(gameType);
    const defaults = gameType === 'holm-game' ? holmDefaults : threeFiveSevenDefaults;
    if (defaults) {
      applyDefaults(defaults);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (isBot || loadingDefaults) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit with current settings when timer expires
          if (!hasSubmittedRef.current) {
            handleSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBot, loadingDefaults]);

  // Auto-submit for bots
  useEffect(() => {
    if (isBot && !loadingDefaults && !hasSubmittedRef.current) {
      hasSubmittedRef.current = true;
      handleSubmit();
    }
  }, [isBot, loadingDefaults]);

  const handleSubmit = async () => {
    if (isSubmitting || hasSubmittedRef.current) return;
    setIsSubmitting(true);
    hasSubmittedRef.current = true;

    console.log('[DEALER SETUP] Submitting game config:', { selectedGameType, anteAmount, legValue, chuckyCards });

    const isHolmGame = selectedGameType === 'holm-game';
    const anteDeadline = new Date(Date.now() + 10000).toISOString();
    
    const updateData: any = {
      game_type: selectedGameType,
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
      ante_decision_deadline: anteDeadline,
    };

    if (isHolmGame) {
      updateData.chucky_cards = chuckyCards;
    }

    const { error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameId);

    if (error) {
      console.error('[DEALER SETUP] Error:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      return;
    }

    // Reset ante_decision for all non-dealer players
    await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId)
      .neq('id', dealerPlayerId);

    // Auto ante up the dealer
    await supabase
      .from('players')
      .update({ 
        ante_decision: 'ante_up',
        sitting_out: false
      })
      .eq('id', dealerPlayerId);

    console.log('[DEALER SETUP] ✅ Config complete');
    onConfigComplete();
  };

  if (isBot) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-md mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 space-y-4 text-center">
            <h2 className="text-2xl font-bold text-poker-gold">{dealerUsername} is Dealer</h2>
            <p className="text-amber-100">
              {loadingDefaults ? 'Loading defaults...' : 'Configuring game with default settings...'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingDefaults) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-md mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-amber-100">Loading game defaults...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isHolmGame = selectedGameType === 'holm-game';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-6 pb-6 space-y-4">
          {/* Header with Timer */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-poker-gold">Dealer Setup</h2>
              <p className="text-amber-100 text-sm">{dealerUsername}, choose your game</p>
            </div>
            <Badge 
              variant={timeLeft <= 10 ? "destructive" : "default"} 
              className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
            >
              <Timer className="w-4 h-4" />
              {timeLeft}s
            </Badge>
          </div>

          {/* Game Type Tabs */}
          <Tabs value={selectedGameType} onValueChange={handleGameTypeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-amber-900/50">
              <TabsTrigger 
                value="holm-game" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-black"
              >
                Holm Game
              </TabsTrigger>
              <TabsTrigger 
                value="3-5-7" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-black"
              >
                3-5-7
              </TabsTrigger>
            </TabsList>

            {/* Holm Game Config */}
            <TabsContent value="holm-game" className="space-y-4 mt-4">
              <p className="text-amber-200 text-sm text-center">4 cards + 4 community cards vs Chucky</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ante-holm" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-holm"
                    type="number"
                    min="1"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(parseInt(e.target.value) || 1)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chucky" className="text-amber-100 text-sm">Chucky Cards</Label>
                  <Input
                    id="chucky"
                    type="number"
                    min="2"
                    max="7"
                    value={chuckyCards}
                    onChange={(e) => setChuckyCards(parseInt(e.target.value) || 4)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pussy Tax</Label>
                    <Switch checked={pussyTaxEnabled} onCheckedChange={setPussyTaxEnabled} />
                  </div>
                  {pussyTaxEnabled && (
                    <Input
                      type="number"
                      min="1"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(parseInt(e.target.value) || 1)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pot Max</Label>
                    <Switch checked={potMaxEnabled} onCheckedChange={setPotMaxEnabled} />
                  </div>
                  {potMaxEnabled && (
                    <Input
                      type="number"
                      min="1"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(parseInt(e.target.value) || 1)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
              </div>
            </TabsContent>

            {/* 3-5-7 Config */}
            <TabsContent value="3-5-7" className="space-y-4 mt-4">
              <p className="text-amber-200 text-sm text-center">Classic Three, Five, Seven poker with wild cards</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ante-357" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-357"
                    type="number"
                    min="1"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(parseInt(e.target.value) || 1)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leg-value" className="text-amber-100 text-sm">Leg Value ($)</Label>
                  <Input
                    id="leg-value"
                    type="number"
                    min="1"
                    value={legValue}
                    onChange={(e) => setLegValue(parseInt(e.target.value) || 1)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="legs-to-win" className="text-amber-100 text-sm">Legs to Win</Label>
                <Input
                  id="legs-to-win"
                  type="number"
                  min="1"
                  value={legsToWin}
                  onChange={(e) => setLegsToWin(parseInt(e.target.value) || 1)}
                  className="bg-amber-900/30 border-poker-gold/50 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pussy Tax</Label>
                    <Switch checked={pussyTaxEnabled} onCheckedChange={setPussyTaxEnabled} />
                  </div>
                  {pussyTaxEnabled && (
                    <Input
                      type="number"
                      min="1"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(parseInt(e.target.value) || 1)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pot Max</Label>
                    <Switch checked={potMaxEnabled} onCheckedChange={setPotMaxEnabled} />
                  </div>
                  {potMaxEnabled && (
                    <Input
                      type="number"
                      min="1"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(parseInt(e.target.value) || 1)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Start Button */}
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-lg py-6"
          >
            {isSubmitting ? 'Starting...' : `Start ${isHolmGame ? 'Holm Game' : '3-5-7'}`}
          </Button>

          <p className="text-xs text-amber-200/60 text-center">
            Game will auto-start with current settings when timer expires
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
