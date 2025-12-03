import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Palette } from 'lucide-react';
import { TABLE_LAYOUTS, CARD_BACKS } from '@/hooks/useVisualPreferences';

interface VisualPreferencesProps {
  userId: string;
  onSave?: () => void;
}

export function VisualPreferences({ userId, onSave }: VisualPreferencesProps) {
  const [tableLayout, setTableLayout] = useState('classic');
  const [cardBackDesign, setCardBackDesign] = useState('red');
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
      setTableLayout((data as any).table_layout || 'classic');
      setCardBackDesign((data as any).card_back_design || 'red');
    }
    setLoading(false);
  };

  const savePreferences = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        table_layout: tableLayout,
        card_back_design: cardBackDesign 
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

      {/* Table Layout */}
      <div className="space-y-3">
        <Label>Table Felt Color</Label>
        <div className="grid grid-cols-5 gap-2">
          {TABLE_LAYOUTS.map((layout) => (
            <div key={layout.id} className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setTableLayout(layout.id)}
                className={`w-12 h-12 rounded-lg cursor-pointer border-2 transition-all ${
                  tableLayout === layout.id 
                    ? 'border-primary ring-2 ring-primary ring-offset-2' 
                    : 'border-transparent hover:border-muted-foreground/50'
                }`}
                style={{ backgroundColor: layout.color }}
              />
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
                {['bulls', 'bears', 'cubs', 'hawks'].includes(card.id) ? (
                  <span className="text-2xl drop-shadow-md">
                    {card.id === 'bulls' && '🐂'}
                    {card.id === 'bears' && '🐻'}
                    {card.id === 'cubs' && '⚾'}
                    {card.id === 'hawks' && '🦅'}
                  </span>
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

      <Button onClick={savePreferences} disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  );
}
