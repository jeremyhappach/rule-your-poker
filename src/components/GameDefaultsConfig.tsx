import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, Bot, DollarSign, Timer, Spade, Dice5, Anchor, Crown } from 'lucide-react';

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
  rabbit_hunt: boolean;
  reveal_at_showdown: boolean;
  // Cribbage-specific
  points_to_win?: number;
  skunk_enabled?: boolean;
  skunk_threshold?: number;
  double_skunk_enabled?: boolean;
  double_skunk_threshold?: number;
}

interface GameDefaultsConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Game type display info
const GAME_TYPES = [
  { value: 'holm', label: 'Holm', icon: Spade, category: 'card' },
  { value: '3-5-7', label: '3-5-7', icon: Spade, category: 'card' },
  { value: 'cribbage', label: 'Cribbage', icon: Crown, category: 'card' },
  { value: 'gin-rummy', label: 'Gin Rummy', icon: Spade, category: 'card' },
  { value: 'horses', label: 'Horses', icon: Dice5, category: 'dice' },
  { value: 'ship-captain-crew', label: 'Ship Captain Crew', icon: Anchor, category: 'dice' },
];

export function GameDefaultsConfig({ open, onOpenChange }: GameDefaultsConfigProps) {
  const [defaults, setDefaults] = useState<GameDefaults[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState<string>('holm');

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
      
      // Ante: minimum 1, no max
      const ante = Number(defaultConfig.ante_amount);
      if (isNaN(ante) || ante < 1) {
        validationErrors.push(`${gameType}: Ante must be at least $1`);
      }
      
      // Pot max: minimum 1, no max
      if (defaultConfig.pot_max_enabled) {
        const potMax = Number(defaultConfig.pot_max_value);
        if (isNaN(potMax) || potMax < 1) {
          validationErrors.push(`${gameType}: Pot max must be at least $1`);
        }
      }
      
      // Pussy tax: minimum 1, no max
      if (defaultConfig.pussy_tax_enabled) {
        const pussyTax = Number(defaultConfig.pussy_tax_value);
        if (isNaN(pussyTax) || pussyTax < 1) {
          validationErrors.push(`${gameType}: Pussy tax must be at least $1`);
        }
      }
      
      // Bot delay: 0.1-10
      const botDelay = Number(defaultConfig.bot_decision_delay_seconds);
      if (isNaN(botDelay) || botDelay < 0.1 || botDelay > 10) {
        validationErrors.push(`${gameType}: Bot delay must be 0.1-10 seconds`);
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
        if (isNaN(legValue) || legValue < 1) {
          validationErrors.push(`3-5-7: Leg value must be at least $1`);
        }
        
        const legsToWin = Number(defaultConfig.legs_to_win);
        if (isNaN(legsToWin) || legsToWin < 1 || legsToWin > 10) {
          validationErrors.push(`3-5-7: Legs to win must be 1-10`);
        }
      }
      
      // Cribbage validations
      if (gameType === 'cribbage') {
        const pointsToWin = Number(defaultConfig.points_to_win);
        if (isNaN(pointsToWin) || pointsToWin < 31 || pointsToWin > 200) {
          validationErrors.push(`Cribbage: Points to win must be 31-200`);
        }
        
        if (defaultConfig.skunk_enabled) {
          const skunkThreshold = Number(defaultConfig.skunk_threshold);
          if (isNaN(skunkThreshold) || skunkThreshold < 1 || skunkThreshold >= pointsToWin) {
            validationErrors.push(`Cribbage: Skunk threshold must be between 1 and points to win`);
          }
        }
        
        if (defaultConfig.double_skunk_enabled) {
          const doubleSkunkThreshold = Number(defaultConfig.double_skunk_threshold);
          const skunkThreshold = Number(defaultConfig.skunk_threshold);
          if (isNaN(doubleSkunkThreshold) || doubleSkunkThreshold < 1 || doubleSkunkThreshold >= skunkThreshold) {
            validationErrors.push(`Cribbage: Double skunk threshold must be between 1 and skunk threshold`);
          }
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
      points_to_win: Number(d.points_to_win ?? 121),
      skunk_threshold: Number(d.skunk_threshold ?? 91),
      double_skunk_threshold: Number(d.double_skunk_threshold ?? 61),
      per_point_value: Number((d as any).per_point_value ?? 0),
      gin_bonus: Number((d as any).gin_bonus ?? 0),
      undercut_bonus: Number((d as any).undercut_bonus ?? 0),
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
            rabbit_hunt: defaultConfig.rabbit_hunt,
            reveal_at_showdown: defaultConfig.reveal_at_showdown,
            points_to_win: defaultConfig.points_to_win,
            skunk_enabled: defaultConfig.skunk_enabled,
            skunk_threshold: defaultConfig.skunk_threshold,
            double_skunk_enabled: defaultConfig.double_skunk_enabled,
            double_skunk_threshold: defaultConfig.double_skunk_threshold,
            per_point_value: defaultConfig.per_point_value,
            gin_bonus: defaultConfig.gin_bonus,
            undercut_bonus: defaultConfig.undercut_bonus,
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

  const getDefaultByType = (gameType: string) => 
    defaults.find(d => d.game_type === gameType);

  const renderGameSettings = (gameType: string) => {
    const gameDefaults = getDefaultByType(gameType);
    if (!gameDefaults) return null;

    // Cribbage doesn't use pot/pussy tax
    if (gameType === 'cribbage') return null;

    return (
      <div className="space-y-4 pt-4 border-t border-border">
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
      <div className="space-y-4 pt-4 border-t border-border">
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

  const renderHolmSettings = () => {
    const holmDefaults = getDefaultByType('holm');
    if (!holmDefaults) return <div className="text-muted-foreground text-center py-4">No defaults found for Holm</div>;
    
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

        <div className="space-y-4 pt-4 border-t border-border">
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
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Rabbit Hunt</Label>
              <p className="text-xs text-muted-foreground">Show hidden cards when everyone folds</p>
            </div>
            <Switch
              checked={holmDefaults.rabbit_hunt ?? false}
              onCheckedChange={(checked) => updateDefault('holm', 'rabbit_hunt', checked)}
            />
          </div>
        </div>

        {renderGameSettings('holm')}
        {renderBotSettings('holm')}
      </>
    );
  };

  const render357Settings = () => {
    const defaults357 = getDefaultByType('3-5-7');
    if (!defaults357) return <div className="text-muted-foreground text-center py-4">No defaults found for 3-5-7</div>;
    
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

        <div className="space-y-4 pt-4 border-t border-border">
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
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Secret Reveal at Showdown</Label>
              <p className="text-xs text-muted-foreground">In rounds 1-2, players who stay can see each other's cards</p>
            </div>
            <Switch
              checked={defaults357.reveal_at_showdown ?? false}
              onCheckedChange={(checked) => updateDefault('3-5-7', 'reveal_at_showdown', checked)}
            />
          </div>
        </div>

        {renderGameSettings('3-5-7')}
        {renderBotSettings('3-5-7')}
      </>
    );
  };

  const renderCribbageSettings = () => {
    const cribbageDefaults = getDefaultByType('cribbage');
    if (!cribbageDefaults) return <div className="text-muted-foreground text-center py-4">No defaults found for Cribbage</div>;
    
    return (
      <>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Crown className="h-4 w-4" />
          Game Rules
        </div>

        <div className="space-y-2">
          <Label htmlFor="cribbage-points">Points to Win</Label>
          <Input
            id="cribbage-points"
            type="text"
            inputMode="numeric"
            value={cribbageDefaults.points_to_win ?? 121}
            onChange={(e) => updateDefault('cribbage', 'points_to_win', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Standard game is 121, short game is 61</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            Skunk Rules
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Skunk Enabled</Label>
              <p className="text-xs text-muted-foreground">2x payout if loser below threshold</p>
            </div>
            <Switch
              checked={cribbageDefaults.skunk_enabled ?? true}
              onCheckedChange={(checked) => updateDefault('cribbage', 'skunk_enabled', checked)}
            />
          </div>

          {cribbageDefaults.skunk_enabled && (
            <div className="space-y-2">
              <Label htmlFor="cribbage-skunk-threshold">Skunk Threshold</Label>
              <Input
                id="cribbage-skunk-threshold"
                type="text"
                inputMode="numeric"
                value={cribbageDefaults.skunk_threshold ?? 91}
                onChange={(e) => updateDefault('cribbage', 'skunk_threshold', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Loser must be below this score for skunk</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Double Skunk Enabled</Label>
              <p className="text-xs text-muted-foreground">3x payout if loser below threshold</p>
            </div>
            <Switch
              checked={cribbageDefaults.double_skunk_enabled ?? true}
              onCheckedChange={(checked) => updateDefault('cribbage', 'double_skunk_enabled', checked)}
            />
          </div>

          {cribbageDefaults.double_skunk_enabled && (
            <div className="space-y-2">
              <Label htmlFor="cribbage-double-skunk-threshold">Double Skunk Threshold</Label>
              <Input
                id="cribbage-double-skunk-threshold"
                type="text"
                inputMode="numeric"
                value={cribbageDefaults.double_skunk_threshold ?? 61}
                onChange={(e) => updateDefault('cribbage', 'double_skunk_threshold', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Loser must be below this score for double skunk</p>
            </div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4" />
            Betting
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cribbage-ante">Base Ante Amount ($)</Label>
            <Input
              id="cribbage-ante"
              type="text"
              inputMode="numeric"
              value={cribbageDefaults.ante_amount}
              onChange={(e) => updateDefault('cribbage', 'ante_amount', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Base amount for chip transfers (multiplied by skunk)</p>
          </div>
        </div>

        {renderBotSettings('cribbage')}
      </>
    );
  };

  const renderGinRummySettings = () => {
    const ginDefaults = getDefaultByType('gin-rummy');
    if (!ginDefaults) return <div className="text-muted-foreground text-center py-4">No defaults found for Gin Rummy</div>;
    
    return (
      <>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Spade className="h-4 w-4" />
          Match Settings
        </div>

        <div className="space-y-2">
          <Label htmlFor="gin-points">Points to Win</Label>
          <Input
            id="gin-points"
            type="text"
            inputMode="numeric"
            value={ginDefaults.points_to_win ?? 100}
            onChange={(e) => updateDefault('gin-rummy', 'points_to_win', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Standard is 100, short is 50</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <DollarSign className="h-4 w-4" />
            Payout Settings
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="gin-ante">Ante Amount ($)</Label>
            <Input
              id="gin-ante"
              type="text"
              inputMode="numeric"
              value={ginDefaults.ante_amount}
              onChange={(e) => updateDefault('gin-rummy', 'ante_amount', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Base per-hand payout (winner takes from loser)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gin-per-point">Per-Point Value ($)</Label>
            <Input
              id="gin-per-point"
              type="text"
              inputMode="numeric"
              value={(ginDefaults as any).per_point_value ?? 0}
              onChange={(e) => updateDefault('gin-rummy', 'per_point_value' as any, e.target.value)}
            />
            <p className="text-xs text-muted-foreground">0 = disabled. Extra chips per point of score difference at match end</p>
          </div>

           <div className="space-y-2">
             <Label htmlFor="gin-gin-bonus">Gin Bonus (pts)</Label>
             <Input
               id="gin-gin-bonus"
               type="text"
               inputMode="numeric"
               value={(ginDefaults as any).gin_bonus ?? 25}
               onChange={(e) => updateDefault('gin-rummy', 'gin_bonus' as any, e.target.value)}
             />
             <p className="text-xs text-muted-foreground">Extra points awarded for going gin (0 = disabled)</p>
           </div>

           <div className="space-y-2">
             <Label htmlFor="gin-undercut-bonus">Undercut Bonus (pts)</Label>
             <Input
               id="gin-undercut-bonus"
               type="text"
               inputMode="numeric"
               value={(ginDefaults as any).undercut_bonus ?? 25}
               onChange={(e) => updateDefault('gin-rummy', 'undercut_bonus' as any, e.target.value)}
             />
             <p className="text-xs text-muted-foreground">Extra points awarded for undercutting (0 = disabled)</p>
           </div>
        </div>

        {renderBotSettings('gin-rummy')}
      </>
    );
  };

  const renderHorsesSettings = () => {
    const horsesDefaults = getDefaultByType('horses');
    if (!horsesDefaults) return <div className="text-muted-foreground text-center py-4">No defaults found for Horses</div>;
    
    return (
      <>
        <div className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Game Settings
        </div>

        <div className="space-y-2">
          <Label htmlFor="horses-ante">Ante Amount ($)</Label>
          <Input
            id="horses-ante"
            type="text"
            inputMode="numeric"
            value={horsesDefaults.ante_amount}
            onChange={(e) => updateDefault('horses', 'ante_amount', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Amount each player antes</p>
        </div>
      </>
    );
  };

  const renderSCCSettings = () => {
    const sccDefaults = getDefaultByType('ship-captain-crew');
    if (!sccDefaults) return <div className="text-muted-foreground text-center py-4">No defaults found for Ship Captain Crew</div>;
    
    return (
      <>
        <div className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Game Settings
        </div>

        <div className="space-y-2">
          <Label htmlFor="scc-ante">Ante Amount ($)</Label>
          <Input
            id="scc-ante"
            type="text"
            inputMode="numeric"
            value={sccDefaults.ante_amount}
            onChange={(e) => updateDefault('ship-captain-crew', 'ante_amount', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Amount each player antes</p>
        </div>
      </>
    );
  };

  const renderSettingsForGameType = () => {
    switch (selectedGameType) {
      case 'holm':
        return renderHolmSettings();
      case '3-5-7':
        return render357Settings();
      case 'cribbage':
        return renderCribbageSettings();
      case 'gin-rummy':
        return renderGinRummySettings();
      case 'horses':
        return renderHorsesSettings();
      case 'ship-captain-crew':
        return renderSCCSettings();
      default:
        return null;
    }
  };

  const selectedGameInfo = GAME_TYPES.find(g => g.value === selectedGameType);

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
          <div className="space-y-4">
            {/* Game Type Dropdown */}
            <div className="space-y-2">
              <Label>Game Type</Label>
              <Select value={selectedGameType} onValueChange={setSelectedGameType}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedGameInfo && (
                      <span className="flex items-center gap-2">
                        <selectedGameInfo.icon className="h-4 w-4" />
                        {selectedGameInfo.label}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Card Games</div>
                  {GAME_TYPES.filter(g => g.category === 'card').map(game => (
                    <SelectItem key={game.value} value={game.value}>
                      <span className="flex items-center gap-2">
                        <game.icon className="h-4 w-4" />
                        {game.label}
                      </span>
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">Dice Games</div>
                  {GAME_TYPES.filter(g => g.category === 'dice').map(game => (
                    <SelectItem key={game.value} value={game.value}>
                      <span className="flex items-center gap-2">
                        <game.icon className="h-4 w-4" />
                        {game.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Settings for selected game */}
            <div className="space-y-4 pt-2">
              {renderSettingsForGameType()}
            </div>
          </div>
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
