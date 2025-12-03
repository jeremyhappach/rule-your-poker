import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const TABLE_LAYOUTS = [
  { id: 'classic', name: 'Classic Green', color: '#1a5c3a', darkColor: '#0f3d26', border: '#78350f' },
  { id: 'blue', name: 'Casino Blue', color: '#1a3c5c', darkColor: '#0f2640', border: '#78350f' },
  { id: 'red', name: 'Vegas Red', color: '#5c1a2a', darkColor: '#3d0f1a', border: '#78350f' },
  { id: 'purple', name: 'Royal Purple', color: '#3c1a5c', darkColor: '#260f40', border: '#78350f' },
  { id: 'black', name: 'Midnight Black', color: '#1a1a1a', darkColor: '#0a0a0a', border: '#78350f' },
];

export const CARD_BACKS = [
  { id: 'red', name: 'Classic Red', color: '#8B0000', darkColor: '#4a0000' },
  { id: 'blue', name: 'Ocean Blue', color: '#00308F', darkColor: '#001a4a' },
  { id: 'green', name: 'Forest Green', color: '#228B22', darkColor: '#0f4a0f' },
  { id: 'purple', name: 'Royal Purple', color: '#4B0082', darkColor: '#2a0050' },
  { id: 'gold', name: 'Gold', color: '#B8860B', darkColor: '#6a4a05' },
  { id: 'bulls', name: 'Bulls', color: '#CE1141', darkColor: '#000000' },
  { id: 'bears', name: 'Bears', color: '#0B162A', darkColor: '#C83803' },
  { id: 'cubs', name: 'Cubs', color: '#0E3386', darkColor: '#CC3433' },
  { id: 'hawks', name: 'Blackhawks', color: '#CF0A2C', darkColor: '#FFD100' },
];

interface VisualPreferencesContextType {
  tableLayout: string;
  cardBackDesign: string;
  getTableColors: () => { color: string; darkColor: string; border: string };
  getCardBackColors: () => { color: string; darkColor: string };
  getCardBackId: () => string;
  refreshPreferences: () => Promise<void>;
}

const VisualPreferencesContext = createContext<VisualPreferencesContextType | null>(null);

export function VisualPreferencesProvider({ 
  children, 
  userId 
}: { 
  children: ReactNode; 
  userId: string | undefined;
}) {
  const [tableLayout, setTableLayout] = useState('black');
  const [cardBackDesign, setCardBackDesign] = useState('hawks');

  const fetchPreferences = async () => {
    if (!userId) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (data) {
      setTableLayout((data as any).table_layout || 'classic');
      setCardBackDesign((data as any).card_back_design || 'red');
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, [userId]);

  const getTableColors = () => {
    const layout = TABLE_LAYOUTS.find(l => l.id === tableLayout) || TABLE_LAYOUTS[0];
    return { color: layout.color, darkColor: layout.darkColor, border: layout.border };
  };

  const getCardBackColors = () => {
    const design = CARD_BACKS.find(c => c.id === cardBackDesign) || CARD_BACKS[0];
    return { color: design.color, darkColor: design.darkColor };
  };

  const getCardBackId = () => cardBackDesign;

  return (
    <VisualPreferencesContext.Provider value={{
      tableLayout,
      cardBackDesign,
      getTableColors,
      getCardBackColors,
      getCardBackId,
      refreshPreferences: fetchPreferences,
    }}>
      {children}
    </VisualPreferencesContext.Provider>
  );
}

export function useVisualPreferences() {
  const context = useContext(VisualPreferencesContext);
  if (!context) {
    // Return defaults if not in provider
    return {
      tableLayout: 'black',
      cardBackDesign: 'hawks',
      getTableColors: () => ({ color: '#1a1a1a', darkColor: '#0a0a0a', border: '#78350f' }),
      getCardBackColors: () => ({ color: '#CF0A2C', darkColor: '#FFD100' }),
      getCardBackId: () => 'red',
      refreshPreferences: async () => {},
    };
  }
  return context;
}
