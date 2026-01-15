import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that updates the user's last_seen_at timestamp:
 * - On initial load when authenticated
 * - When the browser tab becomes visible again
 */
export const useLastSeenTracker = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return;

    const updateLastSeen = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId);
      } catch (error) {
        console.error('Failed to update last_seen_at:', error);
      }
    };

    // Update on initial load
    updateLastSeen();

    // Update when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);
};
