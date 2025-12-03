import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Palette } from 'lucide-react';

const TABLE_LAYOUTS = [
  { id: 'classic', name: 'Classic Green', color: '#1a5c3a', border: '#0f3d26' },
  { id: 'blue', name: 'Casino Blue', color: '#1a3c5c', border: '#0f2640' },
  { id: 'red', name: 'Vegas Red', color: '#5c1a2a', border: '#3d0f1a' },
  { id: 'purple', name: 'Royal Purple', color: '#3c1a5c', border: '#260f40' },
  { id: 'black', name: 'Midnight Black', color: '#1a1a1a', border: '#0a0a0a' },
];

const CARD_BACKS = [
  { id: 'red', name: 'Classic Red', color: '#8B0000', pattern: 'diamonds' },
  { id: 'blue', name: 'Ocean Blue', color: '#00308F', pattern: 'diamonds' },
  { id: 'green', name: 'Forest Green', color: '#228B22', pattern: 'diamonds' },
  { id: 'purple', name: 'Royal Purple', color: '#4B0082', pattern: 'diamonds' },
  { id: 'gold', name: 'Gold', color: '#B8860B', pattern: 'diamonds' },
];

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
        <RadioGroup value={tableLayout} onValueChange={setTableLayout} className="grid grid-cols-5 gap-2">
          {TABLE_LAYOUTS.map((layout) => (
            <div key={layout.id} className="flex flex-col items-center gap-1">
              <RadioGroupItem
                value={layout.id}
                id={`table-${layout.id}`}
                className="sr-only"
              />
              <label
                htmlFor={`table-${layout.id}`}
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
        </RadioGroup>
      </div>

      {/* Card Back Design */}
      <div className="space-y-3">
        <Label>Card Back Design</Label>
        <RadioGroup value={cardBackDesign} onValueChange={setCardBackDesign} className="grid grid-cols-5 gap-2">
          {CARD_BACKS.map((card) => (
            <div key={card.id} className="flex flex-col items-center gap-1">
              <RadioGroupItem
                value={card.id}
                id={`card-${card.id}`}
                className="sr-only"
              />
              <label
                htmlFor={`card-${card.id}`}
                className={`w-8 h-12 rounded cursor-pointer border-2 transition-all flex items-center justify-center ${
                  cardBackDesign === card.id 
                    ? 'border-primary ring-2 ring-primary ring-offset-2' 
                    : 'border-transparent hover:border-muted-foreground/50'
                }`}
                style={{ backgroundColor: card.color }}
              >
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
              </label>
              <span className="text-xs text-center">{card.name.split(' ')[0]}</span>
            </div>
          ))}
        </RadioGroup>
      </div>

      <Button onClick={savePreferences} disabled={saving} className="w-full">
        {saving ? 'Saving...' : 'Save Preferences'}
      </Button>
    </div>
  );
}

// Export the constants for use in game components
export { TABLE_LAYOUTS, CARD_BACKS };
