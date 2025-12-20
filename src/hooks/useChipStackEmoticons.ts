import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface EmoticonOverlay {
  emoticon: string;
  expiresAt: number;
}

interface ChipStackEmoticonRow {
  id: string;
  game_id: string;
  player_id: string;
  emoticon: string;
  expires_at: string;
  created_at: string;
}

export const useChipStackEmoticons = (
  gameId: string | undefined,
  currentPlayerId: string | undefined
) => {
  // Keyed by player_id -> overlay data
  const [emoticonOverlays, setEmoticonOverlays] = useState<Record<string, EmoticonOverlay>>({});
  const [isSending, setIsSending] = useState(false);
  
  // Track processed IDs to avoid duplicates
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Send an emoticon - inserts into DB with 4 second expiry
  const sendEmoticon = useCallback(async (emoticon: string) => {
    if (!gameId || !currentPlayerId || isSending) return;
    
    setIsSending(true);
    
    try {
      const expiresAt = new Date(Date.now() + 4000).toISOString();
      
      // Optimistic update for current player
      setEmoticonOverlays(prev => ({
        ...prev,
        [currentPlayerId]: {
          emoticon,
          expiresAt: Date.now() + 4000
        }
      }));
      
      const { error } = await supabase
        .from('chip_stack_emoticons')
        .insert({
          game_id: gameId,
          player_id: currentPlayerId,
          emoticon,
          expires_at: expiresAt
        });
      
      if (error) {
        console.error('[CHIP_EMOTICON] Failed to insert:', error);
        // Remove optimistic update on error
        setEmoticonOverlays(prev => {
          const updated = { ...prev };
          delete updated[currentPlayerId];
          return updated;
        });
      }
    } finally {
      setIsSending(false);
    }
  }, [gameId, currentPlayerId, isSending]);

  // Process incoming emoticon record
  const processEmoticon = useCallback((record: ChipStackEmoticonRow) => {
    // Skip if already processed
    if (processedIdsRef.current.has(record.id)) return;
    processedIdsRef.current.add(record.id);
    
    const expiresAt = new Date(record.expires_at).getTime();
    const now = Date.now();
    
    // Skip if already expired
    if (expiresAt <= now) return;
    
    // Add to overlays
    setEmoticonOverlays(prev => ({
      ...prev,
      [record.player_id]: {
        emoticon: record.emoticon,
        expiresAt
      }
    }));
  }, []);

  // Fetch existing non-expired emoticons on mount
  useEffect(() => {
    if (!gameId) return;
    
    const fetchExisting = async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('chip_stack_emoticons')
        .select('*')
        .eq('game_id', gameId)
        .gt('expires_at', now);
      
      if (error) {
        console.error('[CHIP_EMOTICON] Failed to fetch:', error);
        return;
      }
      
      data?.forEach(record => processEmoticon(record as ChipStackEmoticonRow));
    };
    
    fetchExisting();
  }, [gameId, processEmoticon]);

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!gameId) return;
    
    const channel = supabase
      .channel(`chip-emoticons-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chip_stack_emoticons',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          processEmoticon(payload.new as ChipStackEmoticonRow);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, processEmoticon]);

  // Cleanup expired overlays using interval for reliability
  useEffect(() => {
    // Check every 500ms for expired overlays
    const interval = setInterval(() => {
      setEmoticonOverlays(prev => {
        const now = Date.now();
        const entries = Object.entries(prev);
        const activeEntries = entries.filter(([, overlay]) => overlay.expiresAt > now);
        
        // Only update if something was removed
        if (activeEntries.length !== entries.length) {
          return Object.fromEntries(activeEntries);
        }
        return prev;
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, []);

  return {
    emoticonOverlays,
    sendEmoticon,
    isSending
  };
};
