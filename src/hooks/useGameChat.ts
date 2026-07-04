import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  recordCanonicalProjection,
  recordChatDeliveryEvent,
  recordChatDeliveryViolation,
  recordConsumerSubscription,
} from '@/lib/chatDelivery/chatDeliveryLedger';
import {
  recordChatRealtimeCallbackBegin,
  recordChatRealtimeCallbackEnd,
  recordSessionLifecycleEvent,
} from '@/lib/sessionLifecycleLedger';

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

/**
 * Canonical reactive chat projection for a single gameId.
 *
 * There is exactly ONE `allMessages` array. It is the union of:
 *   - authoritative fetched messages (hydration)
 *   - optimistic local messages (send path)
 *   - realtime INSERT payloads (subscribe path)
 * Reconciled by message id, sorted by created_at.
 *
 * Every chat consumer (panel, unread indicator, last-seen cursor,
 * chat bubbles) MUST derive from this projection. No component may
 * keep its own message array or filter by dealer-game.
 */
export const useGameChat = (gameId: string | undefined, players: any[], currentUserId?: string) => {
  const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string } | null>(null);
  const [latestRealtimeMessage, setLatestRealtimeMessage] = useState<ChatMessage | null>(null);
  // Hydration baseline: the exact set of message ids returned by the
  // initial fetch for the current gameId. Realtime messages that arrive
  // *after* this snapshot is captured MUST NOT be treated as hydration
  // and MUST NOT be used to seed the read/seen cursors.
  //
  // `null` = hydration for the current gameId has not completed yet.
  const [hydrationBaseline, setHydrationBaseline] = useState<{ gameId: string; ids: string[] } | null>(null);

  useEffect(() => {
    recordConsumerSubscription({
      consumer: 'canonical-store',
      mounted: true,
      gameId: gameId ?? null,
      payload: { hook: 'useGameChat', currentUserId: currentUserId ?? null },
    });
    return () => recordConsumerSubscription({
      consumer: 'canonical-store',
      mounted: false,
      gameId: gameId ?? null,
      payload: { hook: 'useGameChat' },
    });
  }, [gameId, currentUserId]);

  useEffect(() => {
    recordCanonicalProjection({
      source: 'identity-change',
      messages: allMessages,
      gameId: gameId ?? null,
      currentUserId,
      payload: { reason: 'game-or-viewer-identity-change', currentUserId: currentUserId ?? null },
    });
    // Intentionally keyed only to identity inputs; this is not a projection-change recorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, currentUserId]);

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

  // ── Canonical merge helper ─────────────────────────────────────────
  // Never replace state wholesale; always union by id and sort by
  // created_at. This is what prevents a late hydration response from
  // wiping a realtime message that arrived first.
  const mergeMessages = useCallback((prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
    if (incoming.length === 0) return prev;
    const map = new Map<string, ChatMessage>();
    for (const m of prev) map.set(m.id, m);
    for (const m of incoming) {
      const existing = map.get(m.id);
      // Preserve resolved usernames from prior entries; server data wins for other fields.
      map.set(m.id, existing?.username ? { ...m, username: existing.username } : m);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
    return arr;
  }, []);

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

      recordChatDeliveryEvent({
        phase: 'send-intent',
        gameId,
        consumer: 'canonical-store',
        payload: { hasText: Boolean(message.trim()), hasImage: Boolean(imageFile), currentUserId: currentUserId ?? null },
      });

      setIsSending(true);
      try {
        // IMPORTANT: Avoid supabase.auth.getUser() here — it can clear a valid session.
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = currentUserId ?? sessionData.session?.user?.id;
        if (!userId) return;

        let imageUrl: string | null = null;
        if (imageFile) {
          imageUrl = await uploadImage(imageFile, userId);
        }

        // Optimistic insertion into the canonical projection.
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

        setAllMessages(prev => {
          const next = mergeMessages(prev, [optimisticMessage]);
          recordCanonicalProjection({
            source: 'optimistic-merged',
            messages: next,
            gameId,
            currentUserId: userId,
            incomingIds: [optimisticId],
            prevIds: prev.map((m) => m.id),
            payload: { optimisticId, refSource: 'sendMessage.optimistic' },
          });
          return next;
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
            phase: 'insert-error',
            message: optimisticMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { error: error.message, optimisticId },
          });
          recordChatDeliveryViolation({
            violation: 'CHAT_MESSAGE_WRITE_NOT_CONFIRMED',
            message: optimisticMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { error: error.message, optimisticId },
          });
          setAllMessages(prev => {
            const next = prev.filter(m => m.id !== optimisticId);
            recordCanonicalProjection({
              source: 'optimistic-reconciliation',
              messages: next,
              gameId,
              currentUserId: userId,
              incomingIds: [],
              prevIds: prev.map((m) => m.id),
              payload: { optimisticId, outcome: 'insert-error-removed' },
            });
            return next;
          });
        } else if (data) {
          recordChatDeliveryEvent({
            phase: 'insert-success',
            message: data as ChatMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { optimisticId, authoritativeId: data.id },
          });
          // Drop optimistic and merge authoritative row. Realtime may
          // also fire for the same id; mergeMessages dedupes.
          setAllMessages(prev => {
            const withoutOptimistic = prev.filter(m => m.id !== optimisticId);
            const next = mergeMessages(
              withoutOptimistic,
              [{ ...data, username }],
            );
            recordCanonicalProjection({
              source: 'optimistic-reconciliation',
              messages: next,
              gameId,
              currentUserId: userId,
              incomingIds: [data.id],
              prevIds: prev.map((m) => m.id),
              payload: { optimisticId, authoritativeId: data.id, outcome: 'insert-success-reconciled' },
            });
            return next;
          });
        }
      } catch (error) {
        console.error('Error sending chat message:', error);
      } finally {
        setIsSending(false);
      }
    },
    [gameId, isSending, currentUserId, getUsernameForUserId, mergeMessages]
  );

  // Add a new bubble and merge into canonical projection.
  const addBubble = useCallback(async (msg: ChatMessage) => {
    const currentPlayers = playersRef.current;

    const player = currentPlayers.find(p => p.user_id === msg.user_id);

    let username: string;
    if (player?.profiles?.username) {
      username = player.profiles.username;
    } else if (msg.user_id === currentUserId && currentUserProfileRef.current?.username) {
      username = `${currentUserProfileRef.current.username} (observer)`;
    } else {
      username = (await getOrFetchObserverUsername(msg.user_id)) ?? 'Unknown';
    }

    const msgWithUsername: ChatMessage = { ...msg, username };

    recordChatDeliveryEvent({
      phase: 'realtime-payload-admitted',
      message: msgWithUsername,
      gameId: msgWithUsername.game_id,
      consumer: 'canonical-store',
      payload: { username, currentUserId: currentUserId ?? null },
    });

    const bubble: ChatBubble = {
      ...msgWithUsername,
      expiresAt: Date.now() + (msg.image_url ? 8000 : 5000),
    };

    setChatBubbles(prev => {
      const updated = [...prev, bubble];
      return updated.slice(-10);
    });

    setAllMessages(prev => {
      const next = mergeMessages(prev, [msgWithUsername]);
      recordCanonicalProjection({
        source: 'realtime-merge',
        messages: next,
        gameId: msgWithUsername.game_id,
        currentUserId,
        incomingIds: [msgWithUsername.id],
        prevIds: prev.map((m) => m.id),
        payload: { refSource: 'addBubble.realtime', username },
      });
      return next;
    });
  }, [currentUserId, getOrFetchObserverUsername, mergeMessages]);

  // Clean up expired bubbles
  useEffect(() => {
    const interval = setInterval(() => {
      setChatBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Fetch all messages for this session on mount. Merges into the
  // canonical projection so any realtime message that arrived first is
  // preserved.
  useEffect(() => {
    if (!gameId) return;

    const fetchMessages = async () => {
      recordChatDeliveryEvent({
        phase: 'hydration-start',
        gameId,
        consumer: 'canonical-store',
        payload: { currentUserId: currentUserId ?? null },
      });

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        recordChatDeliveryEvent({
          phase: 'hydration-merge',
          gameId,
          consumer: 'canonical-store',
          payload: { error: error?.message ?? 'no-data', incomingIds: [] },
        });
        return;
      }

      const currentPlayers = playersRef.current;
      const currentProfile = currentUserProfileRef.current;

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

      setAllMessages(prev => {
        const next = mergeMessages(prev, messagesWithUsernames);
        recordCanonicalProjection({
          source: 'hydration-merge',
          messages: next,
          gameId,
          currentUserId,
          incomingIds: messagesWithUsernames.map((m) => m.id),
          prevIds: prev.map((m) => m.id),
          payload: { fetchedCount: data.length, refSource: 'fetchMessages' },
        });
        return next;
      });

      // Publish the hydration baseline: only ids returned by this
      // fetch. Any realtime message arriving after this point is by
      // definition post-hydration and is a candidate for unread.
      setHydrationBaseline({ gameId, ids: messagesWithUsernames.map((m) => m.id) });
    };

    // Reset baseline whenever the conversation identity changes so a
    // new gameId cannot inherit the previous conversation's baseline.
    setHydrationBaseline(null);
    fetchMessages();
  }, [gameId, currentUserId, mergeMessages]);

  // When players list updates, patch existing messages with now-known player usernames (no refetch)
  useEffect(() => {
    if (!players?.length) return;
    setAllMessages((prev) => {
      const next = prev.map((m) => {
        const player = players.find((p) => p.user_id === m.user_id);
        if (player?.profiles?.username) return { ...m, username: player.profiles.username };
        return m;
      });
      recordCanonicalProjection({
        source: 'players-patch',
        messages: next,
        gameId: gameId ?? null,
        currentUserId,
        incomingIds: [],
        prevIds: prev.map((m) => m.id),
        payload: { playerCount: players.length, refSource: 'players-username-patch' },
      });
      return next;
    });
  }, [players, gameId, currentUserId]);

  // Subscribe to realtime chat messages. Realtime writes flow through
  // the same mergeMessages path as hydration and optimistic sends, so
  // there is only one projection.
  useEffect(() => {
    if (!gameId) return;

    const channelTopic = `chat-${gameId}`;
    recordChatDeliveryEvent({
      phase: 'realtime-subscribe-start',
      gameId,
      consumer: 'canonical-store',
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
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const newMessage = payload.new as ChatMessage;
          recordChatRealtimeCallbackBegin({
            gameId,
            messageId: newMessage.id,
            payloadGameId: newMessage.game_id,
          });
          try {
            recordChatDeliveryEvent({
              phase: 'realtime-insert-received',
              message: newMessage,
              gameId,
              consumer: 'canonical-store',
              payload: { channelTopic, payloadGameId: newMessage.game_id, expectedGameId: gameId },
            });
            if (newMessage.game_id !== gameId) {
              recordChatDeliveryViolation({
                violation: 'CHAT_SESSION_OR_GAME_FILTER_MISMATCH',
                message: newMessage,
                gameId,
                consumer: 'canonical-store',
                payload: { channelTopic, payloadGameId: newMessage.game_id, expectedGameId: gameId },
              });
              return;
            }
            recordSessionLifecycleEvent('CHAT_STORE_UPDATE_BEGIN', {
              gameId,
              messageId: newMessage.id,
            });
            setLatestRealtimeMessage(newMessage);
            addBubble(newMessage);
            recordSessionLifecycleEvent('CHAT_STORE_UPDATE_END', {
              gameId,
              messageId: newMessage.id,
            });
          } finally {
            recordChatRealtimeCallbackEnd({
              gameId,
              messageId: newMessage.id,
            });
          }
        }
      )
      .subscribe((status, err) => {
        recordChatDeliveryEvent({
          phase: 'realtime-subscribe-status',
          gameId,
          consumer: 'canonical-store',
          payload: { channelTopic, status, error: err ? String(err) : null },
        });
        if (status === 'CHANNEL_ERROR') {
          console.error('[useGameChat] Channel error:', err);
          recordChatDeliveryViolation({
            violation: 'CHAT_REALTIME_SUBSCRIPTION_NOT_READY',
            gameId,
            consumer: 'canonical-store',
            payload: { channelTopic, status, error: err ? String(err) : null },
          });
        } else if (status === 'TIMED_OUT') {
          console.error('[useGameChat] Channel subscription timed out');
          recordChatDeliveryViolation({
            violation: 'CHAT_REALTIME_SUBSCRIPTION_NOT_READY',
            gameId,
            consumer: 'canonical-store',
            payload: { channelTopic, status },
          });
        }
      });

    return () => {
      recordChatDeliveryEvent({
        phase: 'realtime-unsubscribe',
        gameId,
        consumer: 'canonical-store',
        payload: { channelTopic },
      });
      supabase.removeChannel(channel);
    };
  }, [gameId, addBubble]);

  return {
    chatBubbles,
    allMessages,
    sendMessage,
    isSending,
    getPositionForUserId,
    latestRealtimeMessage,
    // Chat is considered hydrated once the initial fetch for the
    // current gameId has resolved (even if empty). Consumers use this
    // to gate cursor seeding.
    isChatHydrated: hydrationBaseline?.gameId === gameId,
    // Frozen set of ids returned by the initial hydration. Consumers
    // must NOT include any id outside this set when seeding cursors.
    hydrationBaselineIds: hydrationBaseline?.gameId === gameId ? hydrationBaseline.ids : null,
    // The canonical conversation key that all chat consumers must use.
    // Stable for the lifetime of this hook invocation (route gameId).
    chatConversationKey: gameId ?? null,
  };
};
