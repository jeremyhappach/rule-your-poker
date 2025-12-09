import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, Bot, DollarSign, Timer } from 'lucide-react';

interface GameDefaults {
  id: string;
  game_type: string;
  decision_timer_seconds: number;
  chucky_second_to_last_delay_seconds: number;
  chucky_last_card_delay_seconds: number;
  bot_fold_probability: number;
  bot_decision_delay_seconds: number;
  bot_use_hand_strength: boolean;
  ante_amount: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
}

interface GameDefaultsConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GameDefaultsConfig({ open, onOpenChange }: GameDefaultsConfigProps) {
  const [defaults, setDefaults] = useState<GameDefaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchDefaults();
    }
  }, [open]);

  const fetchDefaults = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('game_defaults')
      .select('*')
      .order('game_type');

    if (error) {
      console.error('Error fetching defaults:', error);
      toast.error('Failed to load defaults');
    } else {
      setDefaults(data || []);
    }
    setLoading(false);
  };

  const updateDefault = (gameType: string, field: keyof GameDefaults, value: number | boolean | string) => {
    setDefaults(prev => 
      prev.map(d => 
        d.game_type === gameType ? { ...d, [field]: value } : d
      )
    );
  };

  const validateAndSave = async () => {
    // Validate all numeric fields before saving
    const validationErrors: string[] = [];
    
    for (const defaultConfig of defaults) {
      const gameType = defaultConfig.game_type;
      
      // Decision timer: 5-60 seconds
      const timer = Number(defaultConfig.decision_timer_seconds);
      if (isNaN(timer) || timer < 5 || timer > 60) {
        validationErrors.push(`${gameType}: Decision timer must be 5-60 seconds`);
      }
      
      // Ante: 1-100
      const ante = Number(defaultConfig.ante_amount);
      if (isNaN(ante) || ante < 1 || ante > 100) {
        validationErrors.push(`${gameType}: Ante must be $1-$100`);
      }
      
      // Pot max: 1-1000
      if (defaultConfig.pot_max_enabled) {
        const potMax = Number(defaultConfig.pot_max_value);
        if (isNaN(potMax) || potMax < 1 || potMax > 1000) {
          validationErrors.push(`${gameType}: Pot max must be $1-$1000`);
        }
      }
      
      // Pussy tax: 1-100
      if (defaultConfig.pussy_tax_enabled) {
        const pussyTax = Number(defaultConfig.pussy_tax_value);
        if (isNaN(pussyTax) || pussyTax < 1 || pussyTax > 100) {
          validationErrors.push(`${gameType}: Pussy tax must be $1-$100`);
        }
      }
      
      // Bot delay: 0.5-10
      const botDelay = Number(defaultConfig.bot_decision_delay_seconds);
      if (isNaN(botDelay) || botDelay < 0.5 || botDelay > 10) {
        validationErrors.push(`${gameType}: Bot delay must be 0.5-10 seconds`);
      }
      
      // Game-specific validations
      if (gameType === 'holm') {
        const chucky2nd = Number(defaultConfig.chucky_second_to_last_delay_seconds);
        if (isNaN(chucky2nd) || chucky2nd < 0.5 || chucky2nd > 10) {
          validationErrors.push(`Holm: Chucky 2nd-to-last delay must be 0.5-10 seconds`);
        }
        
        const chuckyLast = Number(defaultConfig.chucky_last_card_delay_seconds);
        if (isNaN(chuckyLast) || chuckyLast < 0.5 || chuckyLast > 10) {
          validationErrors.push(`Holm: Chucky last card delay must be 0.5-10 seconds`);
        }
        
        const chuckyCards = Number(defaultConfig.chucky_cards);
        if (isNaN(chuckyCards) || chuckyCards < 1 || chuckyCards > 7) {
          validationErrors.push(`Holm: Chucky cards must be 1-7`);
        }
      }
      
      if (gameType === '3-5-7') {
        const legValue = Number(defaultConfig.leg_value);
        if (isNaN(legValue) || legValue < 1 || legValue > 100) {
          validationErrors.push(`3-5-7: Leg value must be $1-$100`);
        }
        
        const legsToWin = Number(defaultConfig.legs_to_win);
        if (isNaN(legsToWin) || legsToWin < 1 || legsToWin > 10) {
          validationErrors.push(`3-5-7: Legs to win must be 1-10`);
        }
      }
    }
    
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    
    // Convert string values to numbers before saving
    const normalizedDefaults = defaults.map(d => ({
      ...d,
      decision_timer_seconds: Number(d.decision_timer_seconds),
      ante_amount: Number(d.ante_amount),
      pot_max_value: Number(d.pot_max_value),
      pussy_tax_value: Number(d.pussy_tax_value),
      bot_decision_delay_seconds: Number(d.bot_decision_delay_seconds),
      chucky_second_to_last_delay_seconds: Number(d.chucky_second_to_last_delay_seconds),
      chucky_last_card_delay_seconds: Number(d.chucky_last_card_delay_seconds),
      chucky_cards: Number(d.chucky_cards),
      leg_value: Number(d.leg_value),
      legs_to_win: Number(d.legs_to_win),
    }));
    
    setSaving(true);
    try {
      for (const defaultConfig of normalizedDefaults) {
        const { error } = await supabase
          .from('game_defaults')
          .update({
            decision_timer_seconds: defaultConfig.decision_timer_seconds,
            chucky_second_to_last_delay_seconds: defaultConfig.chucky_second_to_last_delay_seconds,
            chucky_last_card_delay_seconds: defaultConfig.chucky_last_card_delay_seconds,
            bot_fold_probability: defaultConfig.bot_fold_probability,
            bot_decision_delay_seconds: defaultConfig.bot_decision_delay_seconds,
            bot_use_hand_strength: defaultConfig.bot_use_hand_strength,
            ante_amount: defaultConfig.ante_amount,
            pot_max_enabled: defaultConfig.pot_max_enabled,
            pot_max_value: defaultConfig.pot_max_value,
            chucky_cards: defaultConfig.chucky_cards,
            leg_value: defaultConfig.leg_value,
            legs_to_win: defaultConfig.legs_to_win,
            pussy_tax_enabled: defaultConfig.pussy_tax_enabled,
            pussy_tax_value: defaultConfig.pussy_tax_value,
          })
          .eq('game_type', defaultConfig.game_type);

        if (error) throw error;
      }
      toast.success('Defaults saved successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving defaults:', error);
      toast.error('Failed to save defaults');
    }
    setSaving(false);
  };

  // Old saveDefaults removed - using validateAndSave instead

  const getDefaultByType = (gameType: string) => 
    defaults.find(d => d.game_type === gameType);

  const renderGameSettings = (gameType: string) => {
    const gameDefaults = getDefaultByType(gameType);
    if (!gameDefaults) return null;

    return (
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Game Settings
        </div>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${gameType}-ante`}>Ante Amount ($)</Label>
            <Input
              id={`${gameType}-ante`}
              type="text"
              inputMode="numeric"
              value={gameDefaults.ante_amount}
              onChange={(e) => updateDefault(gameType, 'ante_amount', e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pot Max Enabled</Label>
              <p className="text-xs text-muted-foreground">Limit pot matching</p>
            </div>
            <Switch
              checked={gameDefaults.pot_max_enabled}
              onCheckedChange={(checked) => updateDefault(gameType, 'pot_max_enabled', checked)}
            />
          </div>

          {gameDefaults.pot_max_enabled && (
            <div className="space-y-2">
              <Label htmlFor={`${gameType}-pot-max`}>Pot Max Value ($)</Label>
              <Input
                id={`${gameType}-pot-max`}
                type="text"
                inputMode="numeric"
                value={gameDefaults.pot_max_value}
                onChange={(e) => updateDefault(gameType, 'pot_max_value', e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Pussy Tax Enabled</Label>
              <p className="text-xs text-muted-foreground">Fee for folding</p>
            </div>
            <Switch
              checked={gameDefaults.pussy_tax_enabled}
              onCheckedChange={(checked) => updateDefault(gameType, 'pussy_tax_enabled', checked)}
            />
          </div>

          {gameDefaults.pussy_tax_enabled && (
            <div className="space-y-2">
              <Label htmlFor={`${gameType}-pussy-tax`}>Pussy Tax Value ($)</Label>
              <Input
                id={`${gameType}-pussy-tax`}
                type="text"
                inputMode="numeric"
                value={gameDefaults.pussy_tax_value}
                onChange={(e) => updateDefault(gameType, 'pussy_tax_value', e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBotSettings = (gameType: string) => {
    const gameDefaults = getDefaultByType(gameType);
    if (!gameDefaults) return null;

    return (
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4" />
          Bot Behavior
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Use Hand Strength Logic</Label>
              <p className="text-xs text-muted-foreground">Bots decide based on hand quality</p>
            </div>
            <Switch
              checked={gameDefaults.bot_use_hand_strength}
              onCheckedChange={(checked) => updateDefault(gameType, 'bot_use_hand_strength', checked)}
            />
          </div>

          {!gameDefaults.bot_use_hand_strength && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label htmlFor={`${gameType}-fold-prob`}>Fold Probability</Label>
                <span className="text-sm font-mono">{gameDefaults.bot_fold_probability}%</span>
              </div>
              <Slider
                id={`${gameType}-fold-prob`}
                min={0}
                max={100}
                step={5}
                value={[gameDefaults.bot_fold_probability]}
                onValueChange={([value]) => updateDefault(gameType, 'bot_fold_probability', value)}
              />
              <p className="text-xs text-muted-foreground">Universal fold chance (0% = always stay, 100% = always fold)</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${gameType}-bot-delay`}>Bot Decision Delay (seconds)</Label>
            <Input
              id={`${gameType}-bot-delay`}
              type="text"
              inputMode="decimal"
              value={gameDefaults.bot_decision_delay_seconds}
              onChange={(e) => updateDefault(gameType, 'bot_decision_delay_seconds', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">How long bots wait before making their decision</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Game Defaults Configuration
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Tabs defaultValue="holm" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="holm">Holm</TabsTrigger>
              <TabsTrigger value="3-5-7">3-5-7</TabsTrigger>
            </TabsList>

            <TabsContent value="holm" className="space-y-4 mt-4">
              {(() => {
                const holmDefaults = getDefaultByType('holm');
                if (!holmDefaults) return null;
                return (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Timer className="h-4 w-4" />
                      Timing Settings
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holm-timer">Decision Timer (seconds)</Label>
                      <Input
                        id="holm-timer"
                        type="text"
                        inputMode="numeric"
                        value={holmDefaults.decision_timer_seconds}
                        onChange={(e) => updateDefault('holm', 'decision_timer_seconds', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Time each player has to make a stay/fold decision</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holm-second-last">Chucky 2nd-to-Last Card Delay (seconds)</Label>
                      <Input
                        id="holm-second-last"
                        type="text"
                        inputMode="decimal"
                        value={holmDefaults.chucky_second_to_last_delay_seconds}
                        onChange={(e) => updateDefault('holm', 'chucky_second_to_last_delay_seconds', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Delay before revealing Chucky's 2nd-to-last card</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holm-last">Chucky Last Card Delay (seconds)</Label>
                      <Input
                        id="holm-last"
                        type="text"
                        inputMode="decimal"
                        value={holmDefaults.chucky_last_card_delay_seconds}
                        onChange={(e) => updateDefault('holm', 'chucky_last_card_delay_seconds', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Delay before revealing Chucky's final card</p>
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        Chucky Settings
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="holm-chucky-cards">Chucky Cards</Label>
                        <Input
                          id="holm-chucky-cards"
                          type="text"
                          inputMode="numeric"
                          value={holmDefaults.chucky_cards}
                          onChange={(e) => updateDefault('holm', 'chucky_cards', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Number of cards Chucky receives</p>
                      </div>
                    </div>

                    {renderGameSettings('holm')}
                    {renderBotSettings('holm')}
                  </>
                );
              })()}
            </TabsContent>

            <TabsContent value="3-5-7" className="space-y-4 mt-4">
              {(() => {
                const defaults357 = getDefaultByType('3-5-7');
                if (!defaults357) return null;
                return (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Timer className="h-4 w-4" />
                      Timing Settings
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="357-timer">Decision Timer (seconds)</Label>
                      <Input
                        id="357-timer"
                        type="text"
                        inputMode="numeric"
                        value={defaults357.decision_timer_seconds}
                        onChange={(e) => updateDefault('3-5-7', 'decision_timer_seconds', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Time players have to make stay/drop decisions</p>
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        Legs Settings
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="357-leg-value">Leg Value ($)</Label>
                        <Input
                          id="357-leg-value"
                          type="text"
                          inputMode="numeric"
                          value={defaults357.leg_value}
                          onChange={(e) => updateDefault('3-5-7', 'leg_value', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Dollar value per leg</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="357-legs-to-win">Legs to Win</Label>
                        <Input
                          id="357-legs-to-win"
                          type="text"
                          inputMode="numeric"
                          value={defaults357.legs_to_win}
                          onChange={(e) => updateDefault('3-5-7', 'legs_to_win', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Number of legs required to win</p>
                      </div>
                    </div>

                    {renderGameSettings('3-5-7')}
                    {renderBotSettings('3-5-7')}
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={validateAndSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save Defaults'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
