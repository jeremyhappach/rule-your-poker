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
import {
  recordRuntimeEvent,
  upsertDeliveryTrace,
  getClientInstanceId,
  getTabSessionId,
} from '@/lib/runtimeInstrumentation/runtimeTracer';
import {
  appendChatPeerMilestone,
  appendChatSenderMilestone,
  awaitPeerOperationVisibility,
  createChatOperationId,
  finalizeServerChatOperation,
  markChatOperationDeliveryConfirmed,
  openServerChatOperation,
  registerCurrentSessionChatOperation,
  writeChatOperationPeerHeartbeat,
  writeChatOperationSenderHeartbeat,
  type ChatOperationIdentity,
} from '@/lib/chatOperations/serverChatOperation';
import { recordChatBoundaryEvent } from '@/lib/chatOperations/chatOperationBoundary';
import {
  beginChatOperationSnapshotCapture,
  getChatOperationSnapshots,
  writeChatOperationTerminalSnapshot,
} from '@/lib/shellTabAttention/shellTabAttentionInstrumentation';
import { emitChatFlightEvent } from '@/lib/chatFlightRecorder';
import { generateUUID } from '@/lib/uuid';

interface ChatMessage {
  id: string;
  game_id: string;
  user_id: string;
  message: string;
  image_url?: string | null;
  chat_operation_id?: string | null;
  client_message_id?: string | null;
  created_at: string;
  username?: string;
}

interface ChatBubble extends ChatMessage {
  expiresAt: number;
}

// Helper: last 10 ids from a projection, for compact state snapshots.
const last10Ids = (arr: { id: string; client_message_id?: string | null }[]) =>
  arr.slice(-10).map(m => ({ id: m.id, cmid: m.client_message_id ?? null }));

// Non-cryptographic content hash so diagnostics never carry message text.
function hashMessage(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
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
export const useGameChat = (
  gameId: string | undefined,
  players: any[],
  currentUserId?: string,
  chatIdentity?: Partial<ChatOperationIdentity>,
) => {
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

  // Chat identity fields consumed inside the realtime callback for
  // telemetry only. Held in refs so they do NOT force resubscribe of
  // the chat channel when they change during a live session. Every
  // resubscribe opens a window where inbound INSERTs are dropped;
  // on mobile Safari that window is user-visible.
  const chatIdentityRouteRef = useRef<string | null>(chatIdentity?.route ?? null);
  const chatIdentitySessionIdRef = useRef<string | null>(chatIdentity?.sessionId ?? null);
  useEffect(() => {
    chatIdentityRouteRef.current = chatIdentity?.route ?? null;
    chatIdentitySessionIdRef.current = chatIdentity?.sessionId ?? null;
  }, [chatIdentity?.route, chatIdentity?.sessionId]);

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

      // Durable correlation id: one uuid per attempted send, generated
      // BEFORE optimistic insertion, included in optimistic message,
      // sent verbatim in the DB insert, and echoed via realtime.
      // NEVER regenerated during retry/reconcile.
      const clientMessageId = generateUUID();
      const correlationId = createChatOperationId();
      emitChatFlightEvent({
        clientMessageId, gameId, role: 'sender',
        eventName: 'SEND_HANDLER_ENTER',
        sourceFile: 'src/hooks/useGameChat.ts',
        sourceFunction: 'sendMessage',
        stateSnapshot: {
          msgLen: message.trim().length,
          msgHash: hashMessage(message.trim()),
          hasImage: Boolean(imageFile),
        },
      });
      const sendIntentAt = new Date().toISOString();
      recordChatDeliveryEvent({
        phase: 'send-intent',
        gameId,
        consumer: 'canonical-store',
        payload: { hasText: Boolean(message.trim()), hasImage: Boolean(imageFile), currentUserId: currentUserId ?? null, correlationId },
      });
      recordRuntimeEvent({
        event_family: 'chat',
        event_name: 'SEND_INTENT',
        severity: 'info',
        correlation_id: correlationId,
        game_id: gameId,
        payload: { hasText: Boolean(message.trim()), hasImage: Boolean(imageFile) },
      });
      const { openChatSendOperation, finalizeChatSendOperation, getChatOperationSnapshots } = await import(
        '@/lib/shellTabAttention/shellTabAttentionInstrumentation'
      );

      setIsSending(true);
      // Hoisted so the outer `catch` can still gate SEND_EXCEPTION
      // telemetry behind the durable-open promise.
      let telemetryReady: Promise<boolean> = Promise.resolve(false);
      try {
        // IMPORTANT: Avoid supabase.auth.getUser() here — it can clear a valid session.
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = currentUserId ?? sessionData.session?.user?.id;
        if (!userId) return;

        const route =
          chatIdentity?.route ??
          (typeof window !== 'undefined' ? window.location.pathname : `/game/${gameId}`);
        const sessionId = chatIdentity?.sessionId ?? (gameId ? `session:${gameId}` : getTabSessionId());
        emitChatFlightEvent({
          clientMessageId, gameId, sessionId, role: 'sender',
          eventName: 'IDENTITY_RESOLVED',
          sourceFile: 'src/hooks/useGameChat.ts',
          sourceFunction: 'sendMessage',
          stateSnapshot: {
            userId, route, activeTab: chatIdentity?.activeTab ?? null,
            dealerGameId: chatIdentity?.dealerGameId ?? null,
          },
        });
        // TELEMETRY ORDERING CONTRACT:
        //   1. `telemetryReady` opens the durable chat_send_operations
        //      row and (only on success) registers the operation into
        //      the client-side current-session registry.
        //   2. The business send path (optimistic mutation +
        //      chat_messages.insert) below runs immediately and NEVER
        //      awaits telemetryReady.
        //   3. Every operation-scoped write (armed heartbeat, boundary
        //      events, sender milestones, delivery-confirmed marker,
        //      observation-window heartbeats/finalize, terminal
        //      snapshots) is gated behind
        //      `void telemetryReady.then((ok) => { if (!ok) return; ... })`
        //      so no operation-scoped RPC can precede the durable open.
        //   4. If the durable open fails, telemetry is marked
        //      unavailable locally (`ok===false`); the chat send still
        //      completes normally and no operation-scoped RPCs are
        //      attempted against a missing row.
        telemetryReady = openServerChatOperation({
          operationId: correlationId,
          senderUserId: userId,
          gameId,
          sessionId,
          dealerGameId: chatIdentity?.dealerGameId ?? null,
          route,
          activeTab: chatIdentity?.activeTab ?? null,
          shellPhase: chatIdentity?.shellPhase ?? null,
          originSurface: chatIdentity?.originSurface ?? 'normal_chat_composer',
          messagePreview: message.trim(),
          // Extended waiting-table identity/context
          routeGameId: chatIdentity?.routeGameId ?? null,
          canonicalShellGameId: chatIdentity?.canonicalShellGameId ?? null,
          operationGameId: chatIdentity?.operationGameId ?? gameId,
          rawGameType: chatIdentity?.rawGameType ?? null,
          resolvedGameType: chatIdentity?.resolvedGameType ?? null,
          gameTypeSource: chatIdentity?.gameTypeSource ?? null,
          gameControllerPresent: chatIdentity?.gameControllerPresent ?? null,
          currentTurnPlayerId: chatIdentity?.currentTurnPlayerId ?? null,
          localTurnEligible: chatIdentity?.localTurnEligible ?? null,
          waitingTableComponent: chatIdentity?.waitingTableComponent ?? null,
          activeGameComponent: chatIdentity?.activeGameComponent ?? null,
          tabBarRenderKey: chatIdentity?.tabBarRenderKey ?? null,
        })
          .then((ok) => {
            if (ok) {
              try {
                registerCurrentSessionChatOperation({
                  operationId: correlationId,
                  gameId,
                  sessionId,
                  route,
                  role: 'sender',
                });
              } catch { /* registry best-effort */ }
            }
            return ok;
          })
          .catch(() => false);

        // Operation-scoped arming — strictly behind telemetryReady.
        void telemetryReady.then((ready) => {
          if (!ready) return;
          void writeChatOperationSenderHeartbeat(correlationId, {
            phase: 'operation-armed',
          });
          try {
            recordChatBoundaryEvent('SENDER_OPERATION_ARMED', {
              operationId: correlationId,
              route,
            });
          } catch { /* instrumentation only */ }
        });

        // Shell-attention capture is a client-side snapshot store with
        // no dependency on the durable operation row; safe to open now.
        try {
          openChatSendOperation(correlationId, {
            gameId,
            sessionId,
            route,
            hasText: Boolean(message.trim()),
            hasImage: Boolean(imageFile),
          });
        } catch { /* instrumentation only */ }

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
          chat_operation_id: correlationId,
          client_message_id: clientMessageId,
          created_at: sentAt,
          username,
        };

        void telemetryReady.then((ready) => {
          if (!ready) return;
          void appendChatSenderMilestone(correlationId, 'OPTIMISTIC_MUTATION', {
            optimisticId,
            createdAt: sentAt,
            hasImage: Boolean(imageUrl),
          }, { optimisticMessageId: optimisticId });
        });

        emitChatFlightEvent({
          clientMessageId, gameId, sessionId, role: 'sender',
          eventName: 'OPTIMISTIC_ADD_BEGIN',
          sourceFile: 'src/hooks/useGameChat.ts',
          sourceFunction: 'sendMessage/setAllMessages(optimistic-merged)',
          stateSnapshot: { optimisticId },
        });
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
          emitChatFlightEvent({
            clientMessageId, gameId, sessionId, role: 'sender',
            eventName: 'OPTIMISTIC_ADD_COMMITTED',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'sendMessage/setAllMessages(optimistic-merged)',
            reason: 'union-merge-by-id',
            stateSnapshot: {
              optimisticId,
              messageCount: next.length,
              containsClientMessageId: next.some(m => m.client_message_id === clientMessageId),
              last10: last10Ids(next),
            },
          });
          return next;
        });

        const dbStartAt = new Date().toISOString();
        recordRuntimeEvent({
          event_family: 'chat',
          event_name: 'CHAT_DB_INSERT_START',
          correlation_id: correlationId,
          game_id: gameId,
        });
        void telemetryReady.then((ready) => {
          if (!ready) return;
          void appendChatSenderMilestone(correlationId, 'DB_INSERT_START', {
            optimisticId,
            dbStartAt,
          }, { optimisticMessageId: optimisticId });
        });
        emitChatFlightEvent({
          clientMessageId, gameId, sessionId, role: 'sender',
          eventName: 'DB_INSERT_BEGIN',
          sourceFile: 'src/hooks/useGameChat.ts',
          sourceFunction: 'sendMessage/supabase.from(chat_messages).insert',
          stateSnapshot: { optimisticId, dbStartAt },
        });
        let insertData: any = null;
        let insertError: any = null;
        try {
          const resp = await supabase.from('chat_messages').insert({
            game_id: gameId,
            user_id: userId,
            message: message.trim(),
            image_url: imageUrl,
            client_message_id: clientMessageId,
          }).select().single();
          insertData = resp.data;
          insertError = resp.error;
        } catch (thrown) {
          emitChatFlightEvent({
            clientMessageId, gameId, sessionId, role: 'sender',
            eventName: 'DB_INSERT_THROWN',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'sendMessage/supabase.from(chat_messages).insert',
            reason: (thrown as Error)?.message ?? String(thrown),
            stateSnapshot: { optimisticId },
          });
          throw thrown;
        }
        const data = insertData;
        const error = insertError;
        emitChatFlightEvent({
          clientMessageId, gameId, sessionId, role: 'sender',
          eventName: 'DB_INSERT_RETURNED',
          sourceFile: 'src/hooks/useGameChat.ts',
          sourceFunction: 'sendMessage/supabase.from(chat_messages).insert',
          reason: error ? (error.code ?? error.message ?? 'error') : 'success',
          stateSnapshot: {
            optimisticId,
            resultCategory: error ? 'error' : 'success',
            returnedDbId: data?.id ?? null,
            returnedClientMessageId: (data as any)?.client_message_id ?? null,
            errorCode: (error as any)?.code ?? null,
            errorMessage: error?.message ?? null,
          },
        });

        if (error) {
          console.error('Error sending chat message:', error);
          finalizeChatSendOperation(correlationId, 'error', {
            message: error.message,
            phase: 'db-insert-failed',
            optimisticId,
          });
          const failureAt = new Date().toISOString();
          recordChatDeliveryEvent({
            phase: 'insert-error',
            message: optimisticMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { error: error.message, optimisticId, correlationId },
          });
          recordChatDeliveryViolation({
            violation: 'CHAT_MESSAGE_WRITE_NOT_CONFIRMED',
            message: optimisticMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { error: error.message, optimisticId, correlationId },
          });
          recordRuntimeEvent({
            event_family: 'chat',
            event_name: 'CHAT_DB_INSERT_FAILURE',
            severity: 'error',
            correlation_id: correlationId,
            game_id: gameId,
            error,
            payload: { optimisticId },
          });
          void telemetryReady.then((ready) => {
            if (!ready) return;
            void appendChatSenderMilestone(correlationId, 'DB_INSERT_FAILURE', {
              error: error.message,
              optimisticId,
            }, { optimisticMessageId: optimisticId });
            writeChatOperationTerminalSnapshot(correlationId, error.message, 'db-insert-failed');
            void finalizeServerChatOperation(
              correlationId,
              'db-insert-failed',
              error.message,
              getChatOperationSnapshots(correlationId),
            );
          });
          void upsertDeliveryTrace({
            message_id: optimisticId,
            recipient_client_instance_id: getClientInstanceId(),
            correlation_id: correlationId,
            sender_user_id: userId,
            sender_client_instance_id: getClientInstanceId(),
            game_id: gameId,
            source_type: 'text',
            send_intent_at: sendIntentAt,
            optimistic_created_at: sentAt,
            db_insert_start_at: dbStartAt,
            db_insert_failure_at: failureAt,
            delivery_status: 'insert-error',
            failure_reason: error.message,
          });
          emitChatFlightEvent({
            clientMessageId, gameId, sessionId, role: 'sender',
            eventName: 'OPTIMISTIC_MESSAGE_REMOVAL_BEGIN',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'sendMessage/setAllMessages(insert-error-removed)',
            reason: 'db-insert-error',
          });
          setAllMessages(prev => {
            const beforeIds = last10Ids(prev);
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
            emitChatFlightEvent({
              clientMessageId, gameId, sessionId, role: 'sender',
              eventName: 'OPTIMISTIC_MESSAGE_REMOVAL_COMMITTED',
              sourceFile: 'src/hooks/useGameChat.ts',
              sourceFunction: 'sendMessage/setAllMessages(insert-error-removed)',
              reason: 'predicate: m.id !== optimisticId; db-insert-error',
              stateSnapshot: {
                optimisticId,
                before: beforeIds,
                after: last10Ids(next),
                stillContainsClientMessageId: next.some(m => m.client_message_id === clientMessageId),
              },
            });
            return next;
          });
        } else if (data) {
          const successAt = new Date().toISOString();
          recordChatDeliveryEvent({
            phase: 'insert-success',
            message: data as ChatMessage,
            gameId,
            consumer: 'canonical-store',
            payload: { optimisticId, authoritativeId: data.id, correlationId },
          });
          recordRuntimeEvent({
            event_family: 'chat',
            event_name: 'CHAT_DB_INSERT_SUCCESS',
            correlation_id: correlationId,
            game_id: gameId,
            message_id: data.id,
            payload: { optimisticId },
          });
          void telemetryReady.then((ready) => {
            if (!ready) return;
            void appendChatSenderMilestone(correlationId, 'DB_INSERT_SUCCESS', {
              optimisticId,
              authoritativeId: data.id,
              successAt,
            }, { messageId: data.id, optimisticMessageId: optimisticId });
          });
          void upsertDeliveryTrace({
            message_id: data.id,
            recipient_client_instance_id: getClientInstanceId(),
            correlation_id: correlationId,
            sender_user_id: userId,
            sender_client_instance_id: getClientInstanceId(),
            game_id: gameId,
            source_type: 'text',
            send_intent_at: sendIntentAt,
            optimistic_created_at: sentAt,
            db_insert_start_at: dbStartAt,
            db_insert_success_at: successAt,
            authoritative_row_at: (data as { created_at?: string }).created_at ?? successAt,
            delivery_status: 'insert-success',
          });
          // Drop optimistic and merge authoritative row. Realtime may
          // also fire for the same id; mergeMessages dedupes.
          emitChatFlightEvent({
            clientMessageId, gameId, sessionId, role: 'sender',
            eventName: 'CANONICAL_MERGE_BEGIN',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'sendMessage/setAllMessages(insert-success-reconciled)',
            stateSnapshot: { optimisticId, authoritativeId: data.id },
          });
          setAllMessages(prev => {
            const beforeIds = last10Ids(prev);
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
            emitChatFlightEvent({
              clientMessageId, gameId, sessionId, role: 'sender',
              eventName: 'OPTIMISTIC_MESSAGE_REMOVAL_COMMITTED',
              sourceFile: 'src/hooks/useGameChat.ts',
              sourceFunction: 'sendMessage/setAllMessages(insert-success-reconciled)',
              reason: 'predicate: m.id !== optimisticId; replaced-by-authoritative-row',
              stateSnapshot: {
                optimisticId,
                authoritativeId: data.id,
                before: beforeIds,
                after: last10Ids(next),
                stillContainsClientMessageId: next.some(m => m.client_message_id === clientMessageId),
              },
            });
            emitChatFlightEvent({
              clientMessageId, gameId, sessionId, role: 'sender',
              eventName: 'CANONICAL_MERGE_COMMITTED',
              sourceFile: 'src/hooks/useGameChat.ts',
              sourceFunction: 'sendMessage/setAllMessages(insert-success-reconciled)',
              stateSnapshot: {
                authoritativeId: data.id,
                containsClientMessageId: next.some(m => m.client_message_id === clientMessageId),
                last10: last10Ids(next),
              },
            });
            return next;
          });
          // Observation window: do NOT finalize on DB success. Mark
          // delivery confirmed, keep sender heartbeats + boundary
          // listeners armed for 30s, then finalize with
          // completed-observation-window unless a real terminator
          // (sender-lost, error boundary, auth sign-out, navigation
          // ejection, etc.) fires first.
          void telemetryReady.then((ready) => {
            if (!ready) return;
            void markChatOperationDeliveryConfirmed(correlationId, 'sender-db-success', {
              authoritativeId: data.id,
              confirmedAt: successAt,
            });
            void writeChatOperationSenderHeartbeat(correlationId, {
              phase: 'post-db-success',
            });
            if (typeof window !== 'undefined') {
              window.setTimeout(() => {
                writeChatOperationTerminalSnapshot(
                  correlationId,
                  'observation-window-expired',
                  'completed-observation-window',
                );
                void finalizeServerChatOperation(
                  correlationId,
                  'completed-observation-window',
                  '30s-observation-window-expired-no-terminator',
                  getChatOperationSnapshots(correlationId),
                );
                finalizeChatSendOperation(correlationId, 'success');
              }, 30_000);
            }
          });
        }
      } catch (error) {
        console.error('Error sending chat message:', error);
        finalizeChatSendOperation(correlationId, 'error', {
          message: (error as Error)?.message ?? String(error),
        });
        void telemetryReady.then((ready) => {
          if (!ready) return;
          void appendChatSenderMilestone(correlationId, 'SEND_EXCEPTION', {
            message: (error as Error)?.message ?? String(error),
          });
          writeChatOperationTerminalSnapshot(
            correlationId,
            (error as Error)?.message ?? String(error),
            'send-exception',
          );
          void finalizeServerChatOperation(
            correlationId,
            'send-exception',
            (error as Error)?.message ?? String(error),
            getChatOperationSnapshots(correlationId),
          );
        });
      } finally {
        // NOTE: no unconditional finalize here — the observation window
        // owns success finalization. Only setIsSending is cleared.
        setIsSending(false);
      }
    },
    [gameId, isSending, currentUserId, getUsernameForUserId, mergeMessages, chatIdentity]
  );

  // Track whether we've seen the first remote message on this session/game.
  const seenFirstRemoteForGameRef = useRef<string | null>(null);

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
    const isRemote = !!currentUserId && msg.user_id !== currentUserId;

    if (isRemote) {
      recordRuntimeEvent({
        event_family: 'chat',
        event_name: 'CHAT_REALTIME_TO_PEER_RECEIVED',
        game_id: msg.game_id,
        message_id: msg.id,
        payload: { senderUserId: msg.user_id, receiverUserId: currentUserId },
      });
      if (seenFirstRemoteForGameRef.current !== msg.game_id) {
        seenFirstRemoteForGameRef.current = msg.game_id;
        void import('@/lib/shellTabAttention/shellTabAttentionInstrumentation').then(
          ({ recordWaitingChatTransition }) => {
            recordWaitingChatTransition('WAITING_REMOTE_FIRST_MESSAGE_RECEIVED', {
              gameId: msg.game_id,
              messageId: msg.id,
              senderUserId: msg.user_id,
            });
          },
        );
      }
    }

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
      emitChatFlightEvent({
        clientMessageId: msgWithUsername.client_message_id ?? null,
        gameId: msgWithUsername.game_id,
        role: 'receiver',
        eventName: 'RECEIVER_MERGE_COMMITTED',
        sourceFile: 'src/hooks/useGameChat.ts',
        sourceFunction: 'addBubble/setAllMessages(realtime-merge)',
        stateSnapshot: {
          messageDbId: msgWithUsername.id,
          senderUserId: msgWithUsername.user_id,
          containsClientMessageId: !!msgWithUsername.client_message_id &&
            next.some(m => m.client_message_id === msgWithUsername.client_message_id),
          last10: last10Ids(next),
        },
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
        // Emit one HYDRATION_RESULT per fetched client_message_id so
        // sender and receiver reports can prove whether the durable
        // row was visible to hydration.
        const hydratedCmids = new Set<string>(
          messagesWithUsernames
            .map(m => (m as { client_message_id?: string | null }).client_message_id)
            .filter((x): x is string => !!x)
        );
        hydratedCmids.forEach((cmid) => {
          emitChatFlightEvent({
            clientMessageId: cmid,
            gameId,
            role: 'receiver',
            eventName: 'HYDRATION_RESULT',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'fetchMessages/setAllMessages(hydration-merge)',
            reason: 'included-in-hydration',
            stateSnapshot: {
              fetchedCount: data.length,
              containsClientMessageId: true,
            },
          });
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
          emitChatFlightEvent({
            clientMessageId: newMessage.client_message_id ?? null,
            gameId,
            role: 'receiver',
            eventName: 'REALTIME_INSERT_RECEIVED',
            sourceFile: 'src/hooks/useGameChat.ts',
            sourceFunction: 'chat-<gameId> postgres_changes INSERT',
            stateSnapshot: {
              messageDbId: newMessage.id,
              payloadGameId: newMessage.game_id,
              expectedGameId: gameId,
              senderUserId: newMessage.user_id,
              receiverUserId: currentUserId ?? null,
              hasClientMessageId: Boolean(newMessage.client_message_id),
            },
          });
          try {
            const receiptAt = new Date().toISOString();
            recordChatDeliveryEvent({
              phase: 'realtime-insert-received',
              message: newMessage,
              gameId,
              consumer: 'canonical-store',
              payload: { channelTopic, payloadGameId: newMessage.game_id, expectedGameId: gameId },
            });
            recordRuntimeEvent({
              event_family: 'chat',
              event_name: 'REALTIME_RECEIPT',
              game_id: gameId,
              message_id: newMessage.id,
              payload: { sender_user_id: newMessage.user_id },
            });
            if (newMessage.chat_operation_id && newMessage.user_id !== currentUserId) {
              const route = typeof window !== 'undefined'
                ? window.location.pathname
                : (chatIdentityRouteRef.current ?? `/game/${gameId}`);
              const sessionId = chatIdentitySessionIdRef.current ?? `session:${gameId}`;
              const opId = newMessage.chat_operation_id;
              const msgId = newMessage.id;
              const senderUserId = newMessage.user_id;
              // Peer telemetry gate: retain the observation in-memory
              // and only flush operation-scoped writes after the durable
              // sender operation row becomes visible (bounded 5 s).
              // Message rendering / unread state / chat behavior above
              // is untouched. Peer does NOT create a new chat operation
              // — we only register once visibility is confirmed.
              void awaitPeerOperationVisibility(opId, 5_000).then((visible) => {
                if (!visible) return;
                try {
                  registerCurrentSessionChatOperation({
                    operationId: opId,
                    gameId,
                    sessionId,
                    route,
                    role: 'peer',
                  });
                } catch { /* registry best-effort */ }
                beginChatOperationSnapshotCapture(opId);
                void appendChatPeerMilestone(
                  opId,
                  'REALTIME_RECEIPT',
                  {
                    receiverUserId: currentUserId ?? null,
                    senderUserId,
                    receiptAt,
                    route,
                  },
                  msgId,
                  getChatOperationSnapshots(opId),
                );
                void writeChatOperationPeerHeartbeat(opId, {
                  phase: 'peer-realtime-receipt',
                });
                void markChatOperationDeliveryConfirmed(opId, 'peer-realtime-receipt', {
                  messageId: msgId,
                  senderUserId,
                  receiptAt,
                });
                try {
                  recordChatBoundaryEvent('PEER_OPERATION_OBSERVED', {
                    operationId: opId,
                    messageId: msgId,
                    senderUserId,
                    route,
                  });
                } catch { /* instrumentation only */ }
                if (typeof window !== 'undefined') {
                  window.setTimeout(() => {
                    writeChatOperationTerminalSnapshot(
                      opId,
                      'peer-observation-window-expired',
                      'completed-observation-window',
                    );
                    void finalizeServerChatOperation(
                      opId,
                      'completed-observation-window',
                      'peer-30s-observation-window-expired',
                      getChatOperationSnapshots(opId),
                    );
                  }, 30_000);
                }
              });
            }

            void upsertDeliveryTrace({
              message_id: newMessage.id,
              recipient_client_instance_id: getClientInstanceId(),
              recipient_user_id: currentUserId ?? null,
              sender_user_id: newMessage.user_id,
              game_id: gameId,
              source_type: 'text',
              recipient_realtime_receipt_at: receiptAt,
              authoritative_row_at: newMessage.created_at ?? receiptAt,
              delivery_status: 'realtime-received',
            });
            if (newMessage.game_id !== gameId) {
              recordChatDeliveryViolation({
                violation: 'CHAT_SESSION_OR_GAME_FILTER_MISMATCH',
                message: newMessage,
                gameId,
                consumer: 'canonical-store',
                payload: { channelTopic, payloadGameId: newMessage.game_id, expectedGameId: gameId },
              });
              emitChatFlightEvent({
                clientMessageId: newMessage.client_message_id ?? null,
                gameId,
                role: 'receiver',
                eventName: 'REALTIME_PAYLOAD_REJECTED',
                sourceFile: 'src/hooks/useGameChat.ts',
                sourceFunction: 'chat-<gameId> postgres_changes INSERT',
                reason: 'predicate: newMessage.game_id !== expectedGameId',
                stateSnapshot: {
                  payloadGameId: newMessage.game_id,
                  expectedGameId: gameId,
                  messageDbId: newMessage.id,
                },
              });
              return;
            }
            emitChatFlightEvent({
              clientMessageId: newMessage.client_message_id ?? null,
              gameId,
              role: 'receiver',
              eventName: 'REALTIME_PAYLOAD_ACCEPTED',
              sourceFile: 'src/hooks/useGameChat.ts',
              sourceFunction: 'chat-<gameId> postgres_changes INSERT',
              stateSnapshot: { messageDbId: newMessage.id },
            });
            recordSessionLifecycleEvent('CHAT_STORE_UPDATE_BEGIN', {
              gameId,
              messageId: newMessage.id,
            });
            setLatestRealtimeMessage(newMessage);
            addBubble(newMessage);
            void upsertDeliveryTrace({
              message_id: newMessage.id,
              recipient_client_instance_id: getClientInstanceId(),
              recipient_store_admission_at: new Date().toISOString(),
            });
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
        recordChatBoundaryEvent('CHAT_REALTIME_CHANNEL_STATUS', {
          channelTopic,
          status,
          error: err ? String(err) : null,
          gameId,
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
          recordChatBoundaryEvent('CHAT_REALTIME_CHANNEL_TIMED_OUT', { channelTopic, gameId });
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
      recordChatBoundaryEvent('CHAT_REALTIME_CHANNEL_REMOVE_INITIATED', { channelTopic, gameId });
      supabase.removeChannel(channel);
      recordChatBoundaryEvent('CHAT_REALTIME_CHANNEL_REMOVED', { channelTopic, gameId });
      recordChatBoundaryEvent('CHAT_HOOK_UNMOUNT', { gameId });
    };
  }, [gameId, addBubble, currentUserId]);

  // Mobile catch-up: browsers (mobile Safari in particular) suspend
  // WebSockets when the tab is hidden/backgrounded, so realtime INSERT
  // events emitted during that window are never delivered. When the
  // tab becomes visible again we re-fetch chat_messages for the
  // current gameId and merge; mergeMessages dedupes by id so this is
  // idempotent. Persistence + initial fetch are known-good, so this
  // is a receiver-side realtime miss repair only.
  useEffect(() => {
    if (!gameId) return;
    if (typeof document === 'undefined') return;

    const catchUp = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });
      if (error || !data || data.length === 0) return;
      const currentPlayers = playersRef.current;
      const currentProfile = currentUserProfileRef.current;
      const withUsernames = data.map((msg: any) => {
        const player = currentPlayers.find((p) => p.user_id === msg.user_id);
        if (player?.profiles?.username) return { ...msg, username: player.profiles.username };
        if (msg.user_id === currentUserId && currentProfile?.username) {
          return { ...msg, username: `${currentProfile.username} (observer)` };
        }
        const cached = observerUsernameCacheRef.current.get(msg.user_id);
        return { ...msg, username: cached ?? 'Unknown' };
      });
      setAllMessages((prev) => mergeMessages(prev, withUsernames));
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void catchUp();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Also cover the mobile Safari case where the socket resumes on
    // focus without a visibilitychange event.
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onVisibility);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onVisibility);
      }
    };
  }, [gameId, currentUserId, mergeMessages]);

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
