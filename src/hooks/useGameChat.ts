import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  id: string;
  game_id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string;
}

interface ChatBubble extends ChatMessage {
  expiresAt: number;
}

export const useGameChat = (gameId: string | undefined, players: any[]) => {
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Get username for a user_id from players list
  const getUsernameForUserId = useCallback((userId: string): string => {
    const player = players.find(p => p.user_id === userId);
    return player?.profiles?.username || 'Unknown';
  }, [players]);

  // Get position for a user_id from players list
  const getPositionForUserId = useCallback((userId: string): number | undefined => {
    const player = players.find(p => p.user_id === userId);
    return player?.position;
  }, [players]);

  // Send a chat message
  const sendMessage = useCallback(async (message: string) => {
    if (!gameId || !message.trim() || isSending) return;

    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('chat_messages')
        .insert({
          game_id: gameId,
          user_id: user.id,
          message: message.trim()
        });

      if (error) {
        console.error('Error sending chat message:', error);
      }
    } catch (error) {
      console.error('Error sending chat message:', error);
    } finally {
      setIsSending(false);
    }
  }, [gameId, isSending]);

  // Add a new bubble with expiration
  const addBubble = useCallback((msg: ChatMessage) => {
    const bubble: ChatBubble = {
      ...msg,
      username: getUsernameForUserId(msg.user_id),
      expiresAt: Date.now() + 5000 // 5 seconds
    };

    setChatBubbles(prev => {
      // Keep max 10 bubbles, remove oldest if needed
      const updated = [...prev, bubble];
      return updated.slice(-10);
    });
  }, [getUsernameForUserId]);

  // Clean up expired bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      setChatBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to realtime chat messages
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`chat-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          addBubble(newMessage);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, addBubble]);

  return {
    chatBubbles,
    sendMessage,
    isSending,
    getPositionForUserId
  };
};
