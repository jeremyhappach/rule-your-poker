import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  id: string;
  game_id: string;
  user_id: string;
  message: string;
  image_url?: string | null;
  created_at: string;
  username?: string;
}

interface ChatBubble extends ChatMessage {
  expiresAt: number;
}

export const useGameChat = (gameId: string | undefined, players: any[], currentUserId?: string) => {
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string } | null>(null);

  // Fetch current user's profile for observers
  useEffect(() => {
    const fetchProfile = async () => {
      if (!currentUserId) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', currentUserId)
        .single();
      
      if (data) {
        setCurrentUserProfile(data);
      }
    };
    
    fetchProfile();
  }, [currentUserId]);

  // Check if a user is an observer (not in players list)
  const isObserver = useCallback((userId: string): boolean => {
    return !players.some(p => p.user_id === userId);
  }, [players]);

  // Get username for a user_id from players list or current user profile
  const getUsernameForUserId = useCallback((userId: string): string => {
    const player = players.find(p => p.user_id === userId);
    if (player?.profiles?.username) {
      return player.profiles.username;
    }
    
    // Check if it's the current user (observer)
    if (userId === currentUserId && currentUserProfile?.username) {
      return `${currentUserProfile.username} (observer)`;
    }
    
    return 'Unknown';
  }, [players, currentUserId, currentUserProfile]);

  // Get position for a user_id from players list
  const getPositionForUserId = useCallback((userId: string): number | undefined => {
    const player = players.find(p => p.user_id === userId);
    return player?.position;
  }, [players]);

  // Upload image to storage
  const uploadImage = async (file: File, userId: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(fileName, file);
    
    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('chat-images')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  // Send a chat message
  const sendMessage = useCallback(
    async (message: string, imageFile?: File) => {
      if (!gameId || (!message.trim() && !imageFile) || isSending) return;

      setIsSending(true);
      try {
        // IMPORTANT: Avoid supabase.auth.getUser() here.
        // getUser() hits the auth API and can clear an otherwise-valid local session,
        // which then triggers onAuthStateChange and redirects to /auth.
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = currentUserId ?? sessionData.session?.user?.id;
        if (!userId) return;

        let imageUrl: string | null = null;

        // Upload image if provided
        if (imageFile) {
          imageUrl = await uploadImage(imageFile, userId);
        }

        const { error } = await supabase.from('chat_messages').insert({
          game_id: gameId,
          user_id: userId,
          message: message.trim(),
          image_url: imageUrl,
        });

        if (error) {
          console.error('Error sending chat message:', error);
        }
      } catch (error) {
        console.error('Error sending chat message:', error);
      } finally {
        setIsSending(false);
      }
    },
    [gameId, isSending, currentUserId]
  );

  // Add a new bubble with expiration
  const addBubble = useCallback(async (msg: ChatMessage) => {
    // Check if user is a player or observer
    const player = players.find(p => p.user_id === msg.user_id);
    let username: string;
    
    if (player?.profiles?.username) {
      username = player.profiles.username;
    } else {
      // User is an observer - fetch their profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', msg.user_id)
        .single();
      
      username = profile?.username 
        ? `${profile.username} (observer)` 
        : 'Unknown';
    }
    
    const bubble: ChatBubble = {
      ...msg,
      username,
      expiresAt: Date.now() + (msg.image_url ? 8000 : 5000) // 8 seconds for images, 5 for text
    };

    setChatBubbles(prev => {
      // Keep max 10 bubbles, remove oldest if needed
      const updated = [...prev, bubble];
      return updated.slice(-10);
    });

    // Also add to allMessages
    setAllMessages(prev => {
      const msgWithUsername = { ...msg, username };
      // Avoid duplicates
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, msgWithUsername];
    });
  }, [players]);

  // Clean up expired bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      setChatBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Fetch all messages for this session on mount
  useEffect(() => {
    if (!gameId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        // For each message, check if user is a player or observer
        const messagesWithUsernames = await Promise.all(data.map(async (msg) => {
          const player = players.find(p => p.user_id === msg.user_id);
          
          if (player?.profiles?.username) {
            return { ...msg, username: player.profiles.username };
          }
          
          // User is an observer - fetch their profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', msg.user_id)
            .single();
          
          const username = profile?.username 
            ? `${profile.username} (observer)` 
            : 'Unknown';
          
          return { ...msg, username };
        }));
        
        setAllMessages(messagesWithUsernames);
      }
    };

    fetchMessages();
  }, [gameId, players]);

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
    allMessages,
    sendMessage,
    isSending,
    getPositionForUserId
  };
};
