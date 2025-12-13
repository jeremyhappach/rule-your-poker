import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Timer, Plus, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluatePlayerStatesEndOfGame, rotateDealerPosition } from "@/lib/playerStateEvaluation";

interface PreviousGameConfig {
  game_type: string | null;
  ante_amount: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
  rabbit_hunt: boolean;
}

interface SessionGameConfigs {
  'holm-game'?: PreviousGameConfig;
  '3-5-7'?: PreviousGameConfig;
}

interface DealerGameSetupProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  dealerPosition: number;
  previousGameType?: string; // The last game type played
  previousGameConfig?: PreviousGameConfig | null; // The previous game's actual config
  sessionGameConfigs?: SessionGameConfigs; // Session-specific configs per game type
  onConfigComplete: () => void;
  onSessionEnd: () => void;
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
  rabbit_hunt: boolean;
}

export const DealerGameSetup = ({
  gameId,
  dealerUsername,
  isBot,
  dealerPlayerId,
  dealerPosition,
  previousGameType,
  previousGameConfig,
  sessionGameConfigs,
  onConfigComplete,
  onSessionEnd,
}: DealerGameSetupProps) => {
  // Default to previous game type if provided, otherwise holm-game
  const [selectedGameType, setSelectedGameType] = useState<string>(previousGameType || "holm-game");
  const [timeLeft, setTimeLeft] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSubmittedRef = useRef(false);
  
  // Config state - use strings for free text input with validation on save
  const [anteAmount, setAnteAmount] = useState("2");
  const [legValue, setLegValue] = useState("1");
  const [pussyTaxEnabled, setPussyTaxEnabled] = useState(true);
  const [pussyTaxValue, setPussyTaxValue] = useState("1");
  const [legsToWin, setLegsToWin] = useState("3");
  const [potMaxEnabled, setPotMaxEnabled] = useState(true);
  const [potMaxValue, setPotMaxValue] = useState("10");
  const [chuckyCards, setChuckyCards] = useState("4");
  const [rabbitHunt, setRabbitHunt] = useState(false);
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
      
      // PRIORITY 1: Use previous game config if available (for config persistence between games)
      if (previousGameConfig) {
        console.log('[DEALER SETUP] Using previous game config:', previousGameConfig);
        setAnteAmount(String(previousGameConfig.ante_amount));
        setLegValue(String(previousGameConfig.leg_value));
        setLegsToWin(String(previousGameConfig.legs_to_win));
        setPussyTaxEnabled(previousGameConfig.pussy_tax_enabled);
        setPussyTaxValue(String(previousGameConfig.pussy_tax_value));
        setPotMaxEnabled(previousGameConfig.pot_max_enabled);
        setPotMaxValue(String(previousGameConfig.pot_max_value));
        setChuckyCards(String(previousGameConfig.chucky_cards));
        setRabbitHunt(previousGameConfig.rabbit_hunt ?? false);
        setLoadingDefaults(false);
        return;
      }
      
      // PRIORITY 2: Apply defaults based on previousGameType or default to holm
      const initialGameType = previousGameType || 'holm-game';
      if (initialGameType === '3-5-7-game' || initialGameType === '3-5-7') {
        if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
          applyDefaults(threeFiveSevenResult.data);
        }
      } else {
        if (!holmResult.error && holmResult.data) {
          applyDefaults(holmResult.data);
        }
      }
      
      setLoadingDefaults(false);
    };

    fetchAllDefaults();
  }, [previousGameType, previousGameConfig]);

  // Apply defaults when game type changes
  const applyDefaults = (defaults: GameDefaults) => {
    setAnteAmount(String(defaults.ante_amount));
    setLegValue(String(defaults.leg_value));
    setLegsToWin(String(defaults.legs_to_win));
    setPussyTaxEnabled(defaults.pussy_tax_enabled);
    setPussyTaxValue(String(defaults.pussy_tax_value));
    setPotMaxEnabled(defaults.pot_max_enabled);
    setPotMaxValue(String(defaults.pot_max_value));
    setChuckyCards(String(defaults.chucky_cards));
    setRabbitHunt(defaults.rabbit_hunt ?? false);
  };

  // Update config when tab changes - PRIORITY: session config > global defaults
  const handleGameTypeChange = (gameType: string) => {
    setSelectedGameType(gameType);
    
    // Normalize game type key for session configs lookup
    const sessionKey = gameType === 'holm-game' ? 'holm-game' : '3-5-7';
    const sessionConfig = sessionGameConfigs?.[sessionKey];
    
    // PRIORITY 1: Use session-specific config if available (remembers settings from earlier in session)
    if (sessionConfig) {
      console.log('[DEALER SETUP] Using session config for', gameType, ':', sessionConfig);
      setAnteAmount(String(sessionConfig.ante_amount));
      setLegValue(String(sessionConfig.leg_value));
      setLegsToWin(String(sessionConfig.legs_to_win));
      setPussyTaxEnabled(sessionConfig.pussy_tax_enabled);
      setPussyTaxValue(String(sessionConfig.pussy_tax_value));
      setPotMaxEnabled(sessionConfig.pot_max_enabled);
      setPotMaxValue(String(sessionConfig.pot_max_value));
      setChuckyCards(String(sessionConfig.chucky_cards));
      setRabbitHunt(sessionConfig.rabbit_hunt ?? false);
      return;
    }
    
    // PRIORITY 2: Fall back to global defaults
    const defaults = gameType === 'holm-game' ? holmDefaults : threeFiveSevenDefaults;
    if (defaults) {
      console.log('[DEALER SETUP] Using global defaults for', gameType);
      applyDefaults(defaults);
    }
  };

  // Handle dealer timeout - mark as sitting out and re-evaluate
  const handleDealerTimeout = async () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    
    console.log('[DEALER SETUP] Dealer timed out, marking as sitting out');
    
    // Mark dealer as sitting out
    await supabase
      .from('players')
      .update({ sitting_out: true, waiting: false })
      .eq('id', dealerPlayerId);
    
    // Evaluate all player states
    const { activePlayerCount, eligibleDealerCount } = await evaluatePlayerStatesEndOfGame(gameId);
    
    console.log('[DEALER SETUP] After timeout evaluation - active:', activePlayerCount, 'eligible dealers:', eligibleDealerCount);
    
    // Check if we can continue
    if (activePlayerCount < 2 || eligibleDealerCount < 1) {
      console.log('[DEALER SETUP] Not enough players, ending session');
      // End session
      await supabase
        .from('games')
        .update({
          status: 'game_over',
          pending_session_end: true,
          session_ended_at: new Date().toISOString()
        })
        .eq('id', gameId);
      
      onSessionEnd();
      return;
    }
    
    // Rotate dealer to next eligible player
    const newDealerPosition = await rotateDealerPosition(gameId, dealerPosition);
    
    console.log('[DEALER SETUP] Rotating dealer from', dealerPosition, 'to', newDealerPosition);
    
    // Update game with new dealer and reset config_complete to trigger new dealer setup
    await supabase
      .from('games')
      .update({
        dealer_position: newDealerPosition,
        config_complete: false
      })
      .eq('id', gameId);
    
    // The game state change will trigger re-render with new dealer
    onConfigComplete();
  };

  // Set config_deadline in database when component mounts (for server-side enforcement)
  useEffect(() => {
    if (isBot || loadingDefaults) return;
    
    const setConfigDeadline = async () => {
      const deadline = new Date(Date.now() + 30000).toISOString(); // 30 seconds from now
      await supabase
        .from('games')
        .update({ config_deadline: deadline })
        .eq('id', gameId);
      console.log('[DEALER SETUP] Set config_deadline to', deadline);
    };
    
    setConfigDeadline();
  }, [gameId, isBot, loadingDefaults]);

  // Countdown timer - now synced with server deadline
  useEffect(() => {
    if (isBot || loadingDefaults) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Dealer timed out - mark as sitting out and re-evaluate
          if (!hasSubmittedRef.current) {
            handleDealerTimeout();
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
    
    // Validate all numeric fields
    const parsedAnte = parseInt(anteAmount) || 0;
    const parsedLegValue = parseInt(legValue) || 0;
    const parsedLegsToWin = parseInt(legsToWin) || 0;
    const parsedPussyTax = parseInt(pussyTaxValue) || 0;
    const parsedPotMax = parseInt(potMaxValue) || 0;
    const parsedChucky = parseInt(chuckyCards) || 0;
    
    // Validation
    if (parsedAnte < 1) {
      console.error('Invalid Ante: must be at least $1');
      return;
    }
    if (parsedLegValue < 1) {
      console.error('Invalid Leg Value: must be at least $1');
      return;
    }
    if (parsedLegsToWin < 1) {
      console.error('Invalid Legs to Win: must be at least 1');
      return;
    }
    if (pussyTaxEnabled && parsedPussyTax < 1) {
      console.error('Invalid Pussy Tax: must be at least $1');
      return;
    }
    if (potMaxEnabled && parsedPotMax < 1) {
      console.error('Invalid Pot Max: must be at least $1');
      return;
    }
    if (selectedGameType === 'holm-game' && (parsedChucky < 2 || parsedChucky > 7)) {
      console.error('Invalid Chucky Cards: must be between 2-7');
      return;
    }
    
    setIsSubmitting(true);
    hasSubmittedRef.current = true;

    console.log('[DEALER SETUP] Submitting game config:', { selectedGameType, parsedAnte, parsedLegValue, parsedChucky });

    const isHolmGame = selectedGameType === 'holm-game';
    const anteDeadline = new Date(Date.now() + 10000).toISOString();
    
    const updateData: any = {
      game_type: selectedGameType,
      ante_amount: parsedAnte,
      leg_value: parsedLegValue,
      pussy_tax_enabled: pussyTaxEnabled,
      pussy_tax_value: parsedPussyTax,
      pussy_tax: parsedPussyTax,
      legs_to_win: parsedLegsToWin,
      pot_max_enabled: potMaxEnabled,
      pot_max_value: parsedPotMax,
      config_complete: true,
      status: 'ante_decision',
      ante_decision_deadline: anteDeadline,
    };

    if (isHolmGame) {
      updateData.chucky_cards = parsedChucky;
      updateData.rabbit_hunt = rabbitHunt;
    }

    const { error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameId);

    if (error) {
      console.error('[DEALER SETUP] Error:', error);
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
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chucky" className="text-amber-100 text-sm">Chucky Cards</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                      onClick={() => setChuckyCards(String(Math.max(2, (parseInt(chuckyCards) || 4) - 1)))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      id="chucky"
                      type="text"
                      inputMode="numeric"
                      value={chuckyCards}
                      onChange={(e) => setChuckyCards(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white text-center flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                      onClick={() => setChuckyCards(String(Math.min(7, (parseInt(chuckyCards) || 4) + 1)))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
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
                      type="text"
                      inputMode="numeric"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(e.target.value)}
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
                      type="text"
                      inputMode="numeric"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-poker-gold/20">
                <div className="space-y-0.5">
                  <Label className="text-amber-100 text-sm">Rabbit Hunt</Label>
                  <p className="text-xs text-amber-200/60">Show hidden cards when everyone folds</p>
                </div>
                <Switch checked={rabbitHunt} onCheckedChange={setRabbitHunt} />
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
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leg-value" className="text-amber-100 text-sm">Leg Value ($)</Label>
                  <Input
                    id="leg-value"
                    type="text"
                    inputMode="numeric"
                    value={legValue}
                    onChange={(e) => setLegValue(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="legs-to-win" className="text-amber-100 text-sm">Legs to Win</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                    onClick={() => setLegsToWin(String(Math.max(1, (parseInt(legsToWin) || 3) - 1)))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    id="legs-to-win"
                    type="text"
                    inputMode="numeric"
                    value={legsToWin}
                    onChange={(e) => setLegsToWin(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white text-center flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                    onClick={() => setLegsToWin(String((parseInt(legsToWin) || 3) + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
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
                      type="text"
                      inputMode="numeric"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(e.target.value)}
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
                      type="text"
                      inputMode="numeric"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(e.target.value)}
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
            If timer expires without action, you'll be marked as sitting out
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
