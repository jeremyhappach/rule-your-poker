import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  recordChatDeliveryEvent,
  recordChatDeliveryViolation,
  getClientInstanceId,
  type ChatMessageIdentity,
} from '@/lib/chatDelivery/chatDeliveryLedger';

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
  const [latestRealtimeMessage, setLatestRealtimeMessage] = useState<ChatMessage | null>(null);

  // Keep latest players/profile in refs so we don't refetch chat history every time players updates.
  const playersRef = useRef<any[]>(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const currentUserProfileRef = useRef<{ username: string } | null>(null);
  useEffect(() => {
    currentUserProfileRef.current = currentUserProfile;
  }, [currentUserProfile]);

  // Cache usernames for observers (not seated players) so we don't re-query per message.
  const observerUsernameCacheRef = useRef<Map<string, string>>(new Map());

  // Ledger identity helpers.
  const buildIdentity = useCallback(
    (
      messageId: string,
      transportSource: ChatMessageIdentity['transportSource'],
      overrides: Partial<ChatMessageIdentity> = {},
    ): ChatMessageIdentity => ({
      messageId,
      clientInstanceId: getClientInstanceId(),
      localViewerId: currentUserId ?? null,
      senderPlayerId: overrides.senderPlayerId ?? null,
      dealerGameId: overrides.dealerGameId ?? null,
      sessionId: gameId ?? null,
      sentAt: overrides.sentAt ?? null,
      transportSource,
      ...overrides,
    }),
    [currentUserId, gameId],
  );

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

    const cached = observerUsernameCacheRef.current.get(userId);
    if (cached) return cached;

    return 'Unknown';
  }, [players, currentUserId, currentUserProfile]);

  const getOrFetchObserverUsername = useCallback(async (userId: string): Promise<string | null> => {
    const cached = observerUsernameCacheRef.current.get(userId);
    if (cached) return cached;

    const { data } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .maybeSingle();

    if (!data?.username) return null;

    const name = `${data.username} (observer)`;
    observerUsernameCacheRef.current.set(userId, name);
    return name;
  }, []);

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

  // Send a chat message with optimistic update
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

        // Optimistic update: immediately show the message in the UI
        const optimisticId = `optimistic-${Date.now()}`;
        const username = getUsernameForUserId(userId);
        const sentAt = new Date().toISOString();
        const optimisticMessage: ChatMessage = {
          id: optimisticId,
          game_id: gameId,
          user_id: userId,
          message: message.trim(),
          image_url: imageUrl,
          created_at: sentAt,
          username,
        };

        const _optimisticIdentity = buildIdentity(optimisticId, 'send', {
          senderPlayerId: userId,
          sentAt,
        });
        recordChatDeliveryEvent({
          identity: _optimisticIdentity,
          name: 'send-intent',
          source: 'useGameChat#sendMessage',
          payload: { hasImage: !!imageUrl, textLength: message.trim().length },
        });
        recordChatDeliveryEvent({
          identity: _optimisticIdentity,
          name: 'send-optimistic-created',
          source: 'useGameChat#sendMessage',
        });

        setAllMessages(prev => [...prev, optimisticMessage]);
        recordChatDeliveryEvent({
          identity: _optimisticIdentity,
          name: 'store-message-added',
          source: 'useGameChat#sendMessage.optimistic',
          payload: { storeSize: allMessages.length + 1 },
        });

        recordChatDeliveryEvent({
          identity: _optimisticIdentity,
          name: 'send-insert-start',
          source: 'useGameChat#sendMessage.insert',
        });
        const { data, error } = await supabase.from('chat_messages').insert({
          game_id: gameId,
          user_id: userId,
          message: message.trim(),
          image_url: imageUrl,
        }).select().single();

        if (error) {
          console.error('Error sending chat message:', error);
          recordChatDeliveryEvent({
            identity: _optimisticIdentity,
            name: 'send-insert-error',
            source: 'useGameChat#sendMessage.insert',
            severity: 'error',
            payload: { code: error.code, message: error.message },
          });
          // Remove optimistic message on error
          setAllMessages(prev => prev.filter(m => m.id !== optimisticId));
          recordChatDeliveryEvent({
            identity: _optimisticIdentity,
            name: 'send-optimistic-dropped',
            source: 'useGameChat#sendMessage.insertError',
          });
        } else if (data) {
          recordChatDeliveryEvent({
            identity: _optimisticIdentity,
            name: 'send-insert-success',
            source: 'useGameChat#sendMessage.insert',
            payload: { serverId: data.id, serverCreatedAt: data.created_at },
          });
          const _authoritativeIdentity = buildIdentity(data.id, 'send', {
            senderPlayerId: userId,
            sentAt: data.created_at,
          });
          recordChatDeliveryEvent({
            identity: _authoritativeIdentity,
            name: 'send-authoritative-received',
            source: 'useGameChat#sendMessage.insert',
            payload: { optimisticId },
          });
          // Replace optimistic message with real one (realtime will also fire, dedupe handles it)
          setAllMessages(prev => {
            const withoutOptimistic = prev.filter(m => m.id !== optimisticId);
            // Check if real message already exists (from realtime)
            if (withoutOptimistic.some(m => m.id === data.id)) {
              recordChatDeliveryEvent({
                identity: _authoritativeIdentity,
                name: 'store-message-skipped-duplicate',
                source: 'useGameChat#sendMessage.reconcile',
                payload: { reason: 'realtime-already-inserted' },
              });
              return withoutOptimistic;
            }
            recordChatDeliveryEvent({
              identity: _authoritativeIdentity,
              name: 'send-optimistic-reconciled',
              source: 'useGameChat#sendMessage.reconcile',
            });
            return [...withoutOptimistic, { ...data, username }];
          });
        }
      } catch (error) {
        console.error('Error sending chat message:', error);
        recordChatDeliveryEvent({
          identity: null,
          name: 'send-insert-error',
          source: 'useGameChat#sendMessage.catch',
          severity: 'error',
          payload: { error: String((error as Error)?.message ?? error) },
        });
      } finally {
        setIsSending(false);
      }
    },
    [gameId, isSending, currentUserId, getUsernameForUserId, buildIdentity, allMessages.length]
  );

  // Add a new bubble with expiration
  const addBubble = useCallback(async (msg: ChatMessage) => {
    const currentPlayers = playersRef.current;

    // Check if user is a player or observer
    const player = currentPlayers.find(p => p.user_id === msg.user_id);

    let username: string;
    if (player?.profiles?.username) {
      username = player.profiles.username;
    } else if (msg.user_id === currentUserId && currentUserProfileRef.current?.username) {
      username = `${currentUserProfileRef.current.username} (observer)`;
    } else {
      // User is an observer - fetch their profile ONCE (cached)
      username = (await getOrFetchObserverUsername(msg.user_id)) ?? 'Unknown';
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
      if (prev.some(m => m.id === msg.id)) {
        recordChatDeliveryEvent({
          identity: {
            messageId: msg.id,
            clientInstanceId: getClientInstanceId(),
            localViewerId: currentUserId ?? null,
            senderPlayerId: msg.user_id,
            sessionId: msg.game_id ?? null,
            sentAt: msg.created_at,
            transportSource: 'realtime',
          },
          name: 'store-message-skipped-duplicate',
          source: 'useGameChat#addBubble',
          payload: { storeSize: prev.length },
        });
        return prev;
      }
      recordChatDeliveryEvent({
        identity: {
          messageId: msg.id,
          clientInstanceId: getClientInstanceId(),
          localViewerId: currentUserId ?? null,
          senderPlayerId: msg.user_id,
          sessionId: msg.game_id ?? null,
          sentAt: msg.created_at,
          transportSource: 'realtime',
        },
        name: 'store-message-merged',
        source: 'useGameChat#addBubble',
        payload: { storeSize: prev.length + 1, username },
      });
      return [...prev, msgWithUsername];
    });
  }, [currentUserId, getOrFetchObserverUsername]);

  // Clean up expired bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      setChatBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Fetch all messages for this session on mount (do NOT refetch on every players update)
  useEffect(() => {
    if (!gameId) return;

    const fetchMessages = async () => {
      recordChatDeliveryEvent({
        identity: null,
        name: 'fetch-start',
        source: 'useGameChat#fetchMessages',
        payload: { gameId },
      });
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        recordChatDeliveryEvent({
          identity: null,
          name: 'fetch-end',
          source: 'useGameChat#fetchMessages',
          severity: error ? 'error' : 'info',
          payload: {
            gameId,
            error: error?.message ?? null,
            count: 0,
          },
        });
        return;
      }

      recordChatDeliveryEvent({
        identity: null,
        name: 'fetch-end',
        source: 'useGameChat#fetchMessages',
        payload: {
          gameId,
          count: data.length,
          firstId: data[0]?.id ?? null,
          lastId: data[data.length - 1]?.id ?? null,
        },
      });

      for (const msg of data) {
        recordChatDeliveryEvent({
          identity: {
            messageId: msg.id,
            clientInstanceId: getClientInstanceId(),
            localViewerId: currentUserId ?? null,
            senderPlayerId: msg.user_id,
            sessionId: msg.game_id ?? null,
            sentAt: msg.created_at,
            transportSource: 'fetch',
          },
          name: 'fetch-message-admitted',
          source: 'useGameChat#fetchMessages',
        });
      }

      const currentPlayers = playersRef.current;
      const currentProfile = currentUserProfileRef.current;

      // Batch-fetch usernames for any observer IDs we haven't cached yet.
      const seatedUserIds = new Set<string>(currentPlayers.map(p => p.user_id));
      const unknownObserverIds = Array.from(new Set(data.map(m => m.user_id)))
        .filter(uid => uid && !seatedUserIds.has(uid) && !observerUsernameCacheRef.current.has(uid) && uid !== currentUserId);

      if (unknownObserverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', unknownObserverIds);

        (profiles ?? []).forEach((p) => {
          if (p?.id && p?.username) {
            observerUsernameCacheRef.current.set(p.id, `${p.username} (observer)`);
          }
        });
      }

      const messagesWithUsernames = data.map((msg) => {
        const player = currentPlayers.find(p => p.user_id === msg.user_id);
        if (player?.profiles?.username) return { ...msg, username: player.profiles.username };

        if (msg.user_id === currentUserId && currentProfile?.username) {
          return { ...msg, username: `${currentProfile.username} (observer)` };
        }

        const cached = observerUsernameCacheRef.current.get(msg.user_id);
        return { ...msg, username: cached ?? 'Unknown' };
      });

      setAllMessages(messagesWithUsernames);
      recordChatDeliveryEvent({
        identity: null,
        name: 'hydration-complete',
        source: 'useGameChat#fetchMessages',
        payload: {
          gameId,
          count: messagesWithUsernames.length,
          latestId: messagesWithUsernames[messagesWithUsernames.length - 1]?.id ?? null,
        },
      });
      console.log('[holm-chat-indicator] hydration complete', {
        gameId,
        count: messagesWithUsernames.length,
        latestId: messagesWithUsernames[messagesWithUsernames.length - 1]?.id ?? null,
      });
    };

    fetchMessages();
  }, [gameId, currentUserId]);

  // When players list updates, patch existing messages with now-known player usernames (no refetch)
  useEffect(() => {
    if (!players?.length) return;
    setAllMessages((prev) =>
      prev.map((m) => {
        const player = players.find((p) => p.user_id === m.user_id);
        if (player?.profiles?.username) return { ...m, username: player.profiles.username };
        return m;
      })
    );
  }, [players]);

  // Subscribe to realtime chat messages
  useEffect(() => {
    if (!gameId) return;

    const channelTopic = `chat-${gameId}`;
    recordChatDeliveryEvent({
      identity: null,
      name: 'realtime-subscription-created',
      source: 'useGameChat#subscribe',
      payload: { channelTopic, filter: `game_id=eq.${gameId}` },
    });

    const channel = supabase
      .channel(channelTopic)
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
          const _rtIdentity: ChatMessageIdentity = {
            messageId: newMessage.id,
            clientInstanceId: getClientInstanceId(),
            localViewerId: currentUserId ?? null,
            senderPlayerId: newMessage.user_id,
            sessionId: newMessage.game_id ?? null,
            sentAt: newMessage.created_at,
            transportSource: 'realtime',
          };
          recordChatDeliveryEvent({
            identity: _rtIdentity,
            name: 'realtime-insert-received',
            source: 'useGameChat#subscribe.onInsert',
            payload: { channelTopic },
          });
          // Filter check: payload should match current gameId.
          if (newMessage.game_id !== gameId) {
            recordChatDeliveryViolation(_rtIdentity, 'CHAT_SESSION_OR_GAME_FILTER_MISMATCH',
              'useGameChat#subscribe.onInsert', {
                payloadGameId: newMessage.game_id,
                subscribedGameId: gameId,
              });
            recordChatDeliveryEvent({
              identity: _rtIdentity,
              name: 'realtime-payload-rejected',
              source: 'useGameChat#subscribe.onInsert',
              severity: 'warn',
              payload: { reason: 'game-id-mismatch' },
            });
            return;
          }
          recordChatDeliveryEvent({
            identity: _rtIdentity,
            name: 'realtime-payload-admitted',
            source: 'useGameChat#subscribe.onInsert',
          });
          console.log('[holm-chat-indicator] realtime message received', {
            gameId,
            messageId: newMessage.id,
            userId: newMessage.user_id,
          });
          setLatestRealtimeMessage(newMessage);
          addBubble(newMessage);
        }
      )
      .subscribe((status, err) => {
        recordChatDeliveryEvent({
          identity: null,
          name: 'realtime-subscription-status',
          source: 'useGameChat#subscribe.status',
          severity: status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'info',
          payload: { status, channelTopic, error: err ? String(err) : null },
        });
        if (status === 'CHANNEL_ERROR') {
          console.error('[useGameChat] Channel error:', err);
          recordChatDeliveryEvent({
            identity: null,
            name: 'realtime-subscription-error',
            source: 'useGameChat#subscribe.status',
            severity: 'error',
            payload: { channelTopic, error: err ? String(err) : null },
          });
        } else if (status === 'TIMED_OUT') {
          console.error('[useGameChat] Channel subscription timed out');
          recordChatDeliveryEvent({
            identity: null,
            name: 'realtime-subscription-error',
            source: 'useGameChat#subscribe.status',
            severity: 'error',
            payload: { channelTopic, reason: 'timed-out' },
          });
        }
      });

    return () => {
      recordChatDeliveryEvent({
        identity: null,
        name: 'realtime-subscription-teardown',
        source: 'useGameChat#subscribe.cleanup',
        payload: { channelTopic },
      });
      supabase.removeChannel(channel);
    };
  }, [gameId, addBubble, currentUserId]);

  return {
    chatBubbles,
    allMessages,
    sendMessage,
    isSending,
    getPositionForUserId,
    latestRealtimeMessage,
  };
};
