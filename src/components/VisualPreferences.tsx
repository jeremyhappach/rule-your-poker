import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Palette, Volume2, Vibrate } from 'lucide-react';
import { TABLE_LAYOUTS, CARD_BACKS, FOUR_COLOR_SUITS, DeckColorMode } from '@/hooks/useVisualPreferences';
import bullsLogo from '@/assets/bulls-logo.png';
import bearsLogo from '@/assets/bears-logo.png';
import cubsLogo from '@/assets/cubs-logo.png';
import hawksLogo from '@/assets/hawks-logo.png';
import peoriaBridgeMobile from '@/assets/peoria-bridge-mobile.jpg';

const TEAM_LOGOS: Record<string, string> = {
  bulls: bullsLogo,
  bears: bearsLogo,
  cubs: cubsLogo,
  hawks: hawksLogo,
};

interface VisualPreferencesProps {
  userId: string;
  onSave?: () => void;
  disabled?: boolean;
}

export function VisualPreferences({ userId, onSave, disabled = false }: VisualPreferencesProps) {
  const [tableLayout, setTableLayout] = useState('bridge');
  const [cardBackDesign, setCardBackDesign] = useState('red');
  const [deckColorMode, setDeckColorMode] = useState<DeckColorMode>('four_color');
  const [useHaptic, setUseHaptic] = useState(true);
  const [playSounds, setPlaySounds] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

  const fetchPreferences = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (data) {
      setTableLayout((data as any).table_layout || 'bridge');
      setCardBackDesign((data as any).card_back_design || 'red');
      setDeckColorMode((data as any).deck_color_mode || 'two_color');
      setUseHaptic((data as any).use_haptic ?? true);
      setPlaySounds((data as any).play_sounds ?? true);
    }
    setLoading(false);
  };

  const savePreferences = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        table_layout: tableLayout,
        card_back_design: cardBackDesign,
        deck_color_mode: deckColorMode,
        use_haptic: useHaptic,
        play_sounds: playSounds,
      } as any)
      .eq('id', userId);

    if (error) {
      toast.error('Failed to save preferences');
    } else {
      toast.success('Preferences saved');
      onSave?.();
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="py-4 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Palette className="h-4 w-4" />
        <h3 className="font-semibold">Visual Preferences</h3>
      </div>

      {/* Deck Color Mode */}
      <div className="space-y-3">
        <Label>Deck Color Mode</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDeckColorMode('two_color')}
            className={`p-3 rounded-lg border-2 transition-all text-left ${
              deckColorMode === 'two_color'
                ? 'border-primary ring-2 ring-primary ring-offset-2'
                : 'border-muted hover:border-muted-foreground/50'
            }`}
          >
            <div className="font-medium text-sm mb-1">2-Color Deck</div>
            <div className="text-xs text-muted-foreground mb-2">Traditional red & black suits</div>
            <div className="flex gap-1">
              <div className="w-6 h-8 bg-white rounded border flex items-center justify-center text-red-600 text-xs font-bold">♥</div>
              <div className="w-6 h-8 bg-white rounded border flex items-center justify-center text-red-600 text-xs font-bold">♦</div>
              <div className="w-6 h-8 bg-white rounded border flex items-center justify-center text-black text-xs font-bold">♠</div>
              <div className="w-6 h-8 bg-white rounded border flex items-center justify-center text-black text-xs font-bold">♣</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setDeckColorMode('four_color')}
            className={`p-3 rounded-lg border-2 transition-all text-left ${
              deckColorMode === 'four_color'
                ? 'border-primary ring-2 ring-primary ring-offset-2'
                : 'border-muted hover:border-muted-foreground/50'
            }`}
          >
            <div className="font-medium text-sm mb-1">4-Color Deck</div>
            <div className="text-xs text-muted-foreground mb-2">Unique color per suit, no symbols</div>
            <div className="flex gap-1">
              {Object.entries(FOUR_COLOR_SUITS).map(([suit, config]) => (
                <div 
                  key={suit}
                  className="w-6 h-8 rounded border flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: config.bg }}
                >
                  A
                </div>
              ))}
            </div>
          </button>
        </div>
      </div>

      {/* Table Layout */}
      <div className="space-y-3">
        <Label>Table Felt Color</Label>
        <div className="grid grid-cols-6 gap-2">
          {TABLE_LAYOUTS.map((layout) => (
            <div key={layout.id} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setTableLayout(layout.id)}
                className={`w-12 h-12 rounded-lg cursor-pointer border-2 transition-all overflow-hidden ${
                  tableLayout === layout.id 
                    ? 'border-primary ring-2 ring-primary ring-offset-2' 
                    : 'border-transparent hover:border-muted-foreground/50'
                }`}
                style={{ backgroundColor: layout.color }}
              >
                {(layout as any).showBridge && (
                  <img 
                    src={peoriaBridgeMobile} 
                    alt="Bridge" 
                    className="w-full h-full object-cover opacity-40"
                    style={{ objectPosition: 'center 35%' }}
                  />
                )}
              </button>
              <span className="text-xs text-center">{layout.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Card Back Design */}
      <div className="space-y-3">
        <Label>Card Back Design</Label>
        <p className="text-xs text-muted-foreground">Classic & Chicago Teams</p>
        <div className="grid grid-cols-5 gap-2">
          {CARD_BACKS.map((card) => (
            <div key={card.id} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setCardBackDesign(card.id)}
                className={`w-8 h-12 rounded cursor-pointer border-2 transition-all flex items-center justify-center ${
                  cardBackDesign === card.id 
                    ? 'border-primary ring-2 ring-primary ring-offset-2' 
                    : 'border-transparent hover:border-muted-foreground/50'
                }`}
                style={{ backgroundColor: card.color }}
              >
                {TEAM_LOGOS[card.id] ? (
                  <img 
                    src={TEAM_LOGOS[card.id]} 
                    alt={card.name} 
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <div className="w-6 h-10 border border-white/30 rounded-sm" 
                    style={{
                      background: `repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 2px,
                        rgba(255,255,255,0.1) 2px,
                        rgba(255,255,255,0.1) 4px
                      )`
                    }}
                  />
                )}
              </button>
              <span className="text-xs text-center">{card.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sound & Haptic Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Volume2 className="h-4 w-4" />
          <h3 className="font-semibold">Sound & Haptic</h3>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="play-sounds" className="cursor-pointer">Sound Effects</Label>
              <p className="text-xs text-muted-foreground">Play audio for game events</p>
            </div>
          </div>
          <Switch
            id="play-sounds"
            checked={playSounds}
            onCheckedChange={setPlaySounds}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vibrate className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label htmlFor="use-haptic" className="cursor-pointer">Haptic Feedback</Label>
              <p className="text-xs text-muted-foreground">Vibration on mobile devices</p>
            </div>
          </div>
          <Switch
            id="use-haptic"
            checked={useHaptic}
            onCheckedChange={setUseHaptic}
          />
        </div>
      </div>

      <Button onClick={savePreferences} disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  );
}
