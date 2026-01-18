import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useMakeItTakeIt = () => {
  const [makeItTakeIt, setMakeItTakeIt] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSetting = async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'make_it_take_it')
        .maybeSingle();

      if (!error && data) {
        const value = data.value as { enabled?: boolean };
        setMakeItTakeIt(value?.enabled ?? false);
      }
      setLoading(false);
    };

    fetchSetting();

    // Subscribe to changes
    const channel = supabase
      .channel('make-it-take-it-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
          filter: 'key=eq.make_it_take_it'
        },
        (payload) => {
          console.log('[MAKE IT TAKE IT] Settings changed:', payload);
          if (payload.new && typeof payload.new === 'object' && 'value' in payload.new) {
            const value = (payload.new as any).value as { enabled?: boolean };
            setMakeItTakeIt(value?.enabled ?? false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleMakeItTakeIt = async (enabled: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('system_settings')
      .update({ 
        value: { enabled },
        updated_at: new Date().toISOString()
      })
      .eq('key', 'make_it_take_it');

    if (error) {
      console.error('[MAKE IT TAKE IT] Error updating setting:', error);
      return false;
    }

    setMakeItTakeIt(enabled);
    return true;
  };

  return { makeItTakeIt, loading, toggleMakeItTakeIt };
};

/**
 * Utility function to fetch the Make It Take It setting (for use in non-hook contexts)
 */
export async function getMakeItTakeItSetting(): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'make_it_take_it')
    .maybeSingle();

  if (error || !data) {
    console.log('[MAKE IT TAKE IT] Could not fetch setting, defaulting to false');
    return false;
  }

  const value = data.value as { enabled?: boolean };
  return value?.enabled ?? false;
}
