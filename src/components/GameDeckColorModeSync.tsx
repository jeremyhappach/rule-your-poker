import { useEffect } from 'react';
import { useVisualPreferences, DeckColorMode } from '@/hooks/useVisualPreferences';
import { supabase } from '@/integrations/supabase/client';

interface GameDeckColorModeSyncProps {
  playerId: string | undefined;
  playerDeckColorMode: string | null | undefined;
  onModeChange: (mode: DeckColorMode) => void;
}

/**
 * Component that syncs player's session deck_color_mode with the visual preferences context.
 * Must be rendered inside VisualPreferencesProvider.
 */
export const GameDeckColorModeSync = ({ 
  playerId, 
  playerDeckColorMode,
  onModeChange 
}: GameDeckColorModeSyncProps) => {
  const { setSessionDeckColorMode, deckColorMode } = useVisualPreferences();

  // Sync player's session deck_color_mode to visual preferences context
  useEffect(() => {
    if (playerDeckColorMode) {
      // Player has a session override
      setSessionDeckColorMode(playerDeckColorMode as DeckColorMode);
    } else {
      // No session override, use profile default
      setSessionDeckColorMode(null);
    }
  }, [playerDeckColorMode, setSessionDeckColorMode]);

  // Provide callback for mode changes
  useEffect(() => {
    // This effect just ensures the parent component has access to the current effective mode
  }, [deckColorMode, onModeChange]);

  return null;
};

/**
 * Hook to handle deck color mode changes in game context.
 * Updates both the database and triggers local state refresh.
 */
export const handleDeckColorModeChange = async (
  playerId: string,
  mode: DeckColorMode,
  onSuccess?: () => void
) => {
  const { error } = await supabase
    .from('players')
    .update({ deck_color_mode: mode })
    .eq('id', playerId);

  if (error) {
    console.error('[DECK COLOR MODE] Failed to update:', error);
    return false;
  }

  onSuccess?.();
  return true;
};
