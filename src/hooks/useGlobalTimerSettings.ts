import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GlobalTimerSettings {
  gameSetupTimerSeconds: number;
  anteDecisionTimerSeconds: number;
  isLoading: boolean;
}

const DEFAULT_GAME_SETUP_TIMER = 30;
const DEFAULT_ANTE_DECISION_TIMER = 30;

// Cache the settings to avoid repeated fetches
let cachedSettings: { gameSetup: number; anteDecision: number } | null = null;
let cachePromise: Promise<{ gameSetup: number; anteDecision: number }> | null = null;

async function fetchTimerSettings(): Promise<{ gameSetup: number; anteDecision: number }> {
  if (cachedSettings) {
    return cachedSettings;
  }

  if (cachePromise) {
    return cachePromise;
  }

  cachePromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['game_setup_timer_seconds', 'ante_decision_timer_seconds']);

      if (error) {
        console.warn('[useGlobalTimerSettings] Error fetching settings:', error);
        return { gameSetup: DEFAULT_GAME_SETUP_TIMER, anteDecision: DEFAULT_ANTE_DECISION_TIMER };
      }

      let gameSetup = DEFAULT_GAME_SETUP_TIMER;
      let anteDecision = DEFAULT_ANTE_DECISION_TIMER;

      for (const row of data || []) {
        const val = typeof row.value === 'number' ? row.value : parseInt(String(row.value), 10);
        if (row.key === 'game_setup_timer_seconds' && !isNaN(val)) {
          gameSetup = val;
        } else if (row.key === 'ante_decision_timer_seconds' && !isNaN(val)) {
          anteDecision = val;
        }
      }

      cachedSettings = { gameSetup, anteDecision };
      return cachedSettings;
    } catch (e) {
      console.warn('[useGlobalTimerSettings] Exception fetching settings:', e);
      return { gameSetup: DEFAULT_GAME_SETUP_TIMER, anteDecision: DEFAULT_ANTE_DECISION_TIMER };
    }
  })();

  return cachePromise;
}

// Invalidate cache when settings change (call this after admin updates)
export function invalidateTimerSettingsCache() {
  cachedSettings = null;
  cachePromise = null;
}

/**
 * Hook to get global timer settings for game setup and ante decisions.
 * Settings are cached to avoid repeated fetches.
 */
export function useGlobalTimerSettings(): GlobalTimerSettings {
  const [gameSetupTimerSeconds, setGameSetupTimerSeconds] = useState(DEFAULT_GAME_SETUP_TIMER);
  const [anteDecisionTimerSeconds, setAnteDecisionTimerSeconds] = useState(DEFAULT_ANTE_DECISION_TIMER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchTimerSettings().then((settings) => {
      if (mounted) {
        setGameSetupTimerSeconds(settings.gameSetup);
        setAnteDecisionTimerSeconds(settings.anteDecision);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return { gameSetupTimerSeconds, anteDecisionTimerSeconds, isLoading };
}

/**
 * Get timer settings synchronously (uses cached values or defaults).
 * Useful for non-React contexts or when you need immediate values.
 */
export function getTimerSettingsSync(): { gameSetup: number; anteDecision: number } {
  return cachedSettings || { gameSetup: DEFAULT_GAME_SETUP_TIMER, anteDecision: DEFAULT_ANTE_DECISION_TIMER };
}

/**
 * Fetch timer settings asynchronously (ensures cache is populated).
 * Useful for edge functions or before component mount.
 */
export async function getTimerSettingsAsync(): Promise<{ gameSetup: number; anteDecision: number }> {
  return fetchTimerSettings();
}
