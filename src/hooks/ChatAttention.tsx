/**
 * ChatAttention — canonical chat tab attention state.
 *
 * Contract (single source of truth for the chat-tab icon):
 *   NONE                → normal inactive chat icon.
 *   NEW_MESSAGE_PULSE   → outline+fill red, pulsing. 4-second window
 *                         from newest unread remote message. Any newer
 *                         remote message while unread RESTARTS the timer.
 *   UNREAD_PERSISTENT   → outline red, no fill. Holds until actual read.
 *
 * Rules:
 *   - Only remote human messages (non-self, non-dealer/system) enter
 *     attention state.
 *   - Messages arriving while activeTab === 'chat' never enter
 *     attention (they are read through the normal ack path).
 *   - Attention state clears ONLY through markChatRead(). Tab toggles
 *     alone do not clear it; the consumer must call markChatRead() when
 *     the existing actual-read acknowledgement path fires.
 *
 * There is exactly ONE provider per game shell. All icon rendering
 * derives from this canonical enum via the chatFlashing / chatIndicator
 * props on the shell tab bar. No consumer may compute its own
 * green/red state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useGameChatContext } from './GameChatContext';
import {
  recordChatDeliveryEvent,
  recordChatDeliveryViolation,
} from '@/lib/chatDelivery/chatDeliveryLedger';

export type ChatAttentionState = 'NONE' | 'NEW_MESSAGE_PULSE' | 'UNREAD_PERSISTENT';

export const CHAT_ATTENTION_PULSE_MS = 4000;

interface ChatAttentionContextValue {
  attentionState: ChatAttentionState;
  pulseMessageId: string | null;
  pulseDeadlineTs: number | null;
  notifyActiveTab: (tab: string) => void;
  markChatRead: (reason: string) => void;
  currentActiveTab: string;
}

const ChatAttentionContext = createContext<ChatAttentionContextValue | null>(null);

function isDealerOrSystem(id: string | undefined | null, userId: string | null | undefined) {
  if (!id) return true;
  if (id.startsWith('dealer-')) return true;
  return !userId;
}

export function ChatAttentionProvider({
  currentUserId,
  children,
}: {
  currentUserId: string | null | undefined;
  children: ReactNode;
}) {
  const chatCtx = useGameChatContext();
  const latestRealtime = chatCtx.latestRealtimeMessage;

  const [attentionState, setAttentionState] = useState<ChatAttentionState>('NONE');
  const [pulseMessageId, setPulseMessageId] = useState<string | null>(null);
  const [pulseDeadlineTs, setPulseDeadlineTs] = useState<number | null>(null);

  const activeTabRef = useRef<string>('cards');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedRealtimeIdsRef = useRef<Set<string>>(new Set());
  const stateRef = useRef<ChatAttentionState>('NONE');
  stateRef.current = attentionState;

  const emitTransition = useCallback(
    (from: ChatAttentionState, to: ChatAttentionState, reason: string, messageId: string | null, extra?: Record<string, unknown>) => {
      recordChatDeliveryEvent({
        phase: 'chat-attention-transition',
        consumer: 'ChatAttentionProvider',
        messageId,
        payload: { from, to, reason, activeTab: activeTabRef.current, ...(extra ?? {}) },
      });
    },
    []
  );

  const cancelPulseTimer = useCallback((reason: string, messageId: string | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      recordChatDeliveryEvent({
        phase: 'chat-attention-pulse-cancelled',
        consumer: 'ChatAttentionProvider',
        messageId,
        payload: { reason, activeTab: activeTabRef.current },
      });
    }
  }, []);

  const armPulse = useCallback(
    (messageId: string, opts: { restart: boolean }) => {
      const from = stateRef.current;
      const isRestart = opts.restart || from === 'NEW_MESSAGE_PULSE' || from === 'UNREAD_PERSISTENT';
      cancelPulseTimer(isRestart ? 'restart' : 'arm-fresh', messageId);
      const deadline = Date.now() + CHAT_ATTENTION_PULSE_MS;
      setAttentionState('NEW_MESSAGE_PULSE');
      setPulseMessageId(messageId);
      setPulseDeadlineTs(deadline);
      recordChatDeliveryEvent({
        phase: isRestart ? 'chat-attention-pulse-restarted' : 'chat-attention-pulse-armed',
        consumer: 'ChatAttentionProvider',
        messageId,
        payload: {
          from,
          to: 'NEW_MESSAGE_PULSE',
          deadlineTs: deadline,
          durationMs: CHAT_ATTENTION_PULSE_MS,
          activeTab: activeTabRef.current,
        },
      });
      emitTransition(from, 'NEW_MESSAGE_PULSE', isRestart ? 'repeat-remote-message' : 'first-remote-message', messageId);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (stateRef.current !== 'NEW_MESSAGE_PULSE') return;
        setAttentionState('UNREAD_PERSISTENT');
        setPulseDeadlineTs(null);
        recordChatDeliveryEvent({
          phase: 'chat-attention-pulse-completed',
          consumer: 'ChatAttentionProvider',
          messageId,
          payload: { activeTab: activeTabRef.current },
        });
        emitTransition('NEW_MESSAGE_PULSE', 'UNREAD_PERSISTENT', 'pulse-timer-expired', messageId);
        // Verify the resolved icon state actually reflects the transition
        // by scheduling a resolve check on next frame.
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            if (stateRef.current !== 'UNREAD_PERSISTENT') {
              recordChatDeliveryViolation({
                violation: 'CHAT_PULSE_DID_NOT_RESOLVE_TO_UNREAD_OUTLINE',
                messageId,
                consumer: 'ChatAttentionProvider',
                payload: { observedState: stateRef.current, activeTab: activeTabRef.current },
              });
            }
          }, 50);
        }
      }, CHAT_ATTENTION_PULSE_MS);
    },
    [cancelPulseTimer, emitTransition]
  );

  // React to new realtime messages.
  useEffect(() => {
    if (!latestRealtime) return;
    const messageId = latestRealtime.id;
    if (!messageId || processedRealtimeIdsRef.current.has(messageId)) return;
    processedRealtimeIdsRef.current.add(messageId);
    const userId = latestRealtime.user_id ?? null;
    const isSelf = !!currentUserId && userId === currentUserId;
    const dealerOrSystem = isDealerOrSystem(messageId, userId);

    if (isSelf || dealerOrSystem) {
      recordChatDeliveryEvent({
        phase: 'chat-attention-transition',
        consumer: 'ChatAttentionProvider',
        messageId,
        payload: {
          from: stateRef.current,
          to: stateRef.current,
          reason: isSelf ? 'self-message-ignored' : 'dealer-or-system-ignored',
          activeTab: activeTabRef.current,
        },
      });
      return;
    }

    if (activeTabRef.current === 'chat') {
      // On chat tab; no attention. Actual read path handles this.
      recordChatDeliveryEvent({
        phase: 'chat-attention-transition',
        consumer: 'ChatAttentionProvider',
        messageId,
        payload: {
          from: stateRef.current,
          to: stateRef.current,
          reason: 'active-tab-is-chat',
          activeTab: 'chat',
        },
      });
      return;
    }

    const wasUnread = stateRef.current !== 'NONE';
    armPulse(messageId, { restart: wasUnread });

    // Verify pulse was actually entered.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (stateRef.current !== 'NEW_MESSAGE_PULSE' && stateRef.current !== 'UNREAD_PERSISTENT') {
          recordChatDeliveryViolation({
            violation: 'CHAT_NEW_MESSAGE_PULSE_NOT_ENTERED',
            messageId,
            consumer: 'ChatAttentionProvider',
            payload: { observedState: stateRef.current, activeTab: activeTabRef.current },
          });
        }
        if (wasUnread && stateRef.current !== 'NEW_MESSAGE_PULSE') {
          recordChatDeliveryViolation({
            violation: 'CHAT_REPEAT_MESSAGE_DID_NOT_RESTART_PULSE',
            messageId,
            consumer: 'ChatAttentionProvider',
            payload: { observedState: stateRef.current, activeTab: activeTabRef.current },
          });
        }
      }, 30);
    }
  }, [latestRealtime, currentUserId, armPulse]);

  const notifyActiveTab = useCallback((tab: string) => {
    activeTabRef.current = tab;
  }, []);

  const markChatRead = useCallback((reason: string) => {
    const from = stateRef.current;
    if (from === 'NONE') return;
    cancelPulseTimer('mark-read', pulseMessageId);
    setAttentionState('NONE');
    setPulseMessageId(null);
    setPulseDeadlineTs(null);
    recordChatDeliveryEvent({
      phase: 'chat-attention-transition',
      consumer: 'ChatAttentionProvider',
      messageId: pulseMessageId,
      payload: { from, to: 'NONE', reason, activeTab: activeTabRef.current },
    });
    emitTransition(from, 'NONE', reason, pulseMessageId);
    if (reason !== 'actual-read' && reason !== 'chat-tab-opened-actual-read') {
      recordChatDeliveryViolation({
        violation: 'CHAT_ATTENTION_CLEARED_WITHOUT_READ',
        messageId: pulseMessageId,
        consumer: 'ChatAttentionProvider',
        payload: { from, reason, activeTab: activeTabRef.current },
      });
    }
  }, [cancelPulseTimer, emitTransition, pulseMessageId]);

  useEffect(() => () => cancelPulseTimer('unmount', null), [cancelPulseTimer]);

  const value = useMemo<ChatAttentionContextValue>(
    () => ({
      attentionState,
      pulseMessageId,
      pulseDeadlineTs,
      notifyActiveTab,
      markChatRead,
      currentActiveTab: activeTabRef.current,
    }),
    [attentionState, pulseMessageId, pulseDeadlineTs, notifyActiveTab, markChatRead]
  );

  return <ChatAttentionContext.Provider value={value}>{children}</ChatAttentionContext.Provider>;
}

export function useChatAttention(): ChatAttentionContextValue {
  const ctx = useContext(ChatAttentionContext);
  if (!ctx) {
    // Return an inert value so components outside game shells don't crash.
    return {
      attentionState: 'NONE',
      pulseMessageId: null,
      pulseDeadlineTs: null,
      notifyActiveTab: () => {},
      markChatRead: () => {},
      currentActiveTab: 'cards',
    };
  }
  return ctx;
}

/** Resolve the canonical shell tab-bar props from attention state. */
export function chatAttentionToShellTabProps(state: ChatAttentionState): {
  chatFlashing: 'red' | null;
  chatIndicator: 'red' | null;
} {
  return {
    chatFlashing: state === 'NEW_MESSAGE_PULSE' ? 'red' : null,
    chatIndicator: state === 'UNREAD_PERSISTENT' ? 'red' : null,
  };
}

/**
 * Verifies the DOM icon style matches the canonical attention state.
 * Emits CHAT_ICON_STYLE_DOES_NOT_MATCH_ATTENTION_STATE on mismatch.
 */
export function useChatIconStyleGuard(state: ChatAttentionState) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const raf = window.requestAnimationFrame(() => {
      const btn = document.querySelector('[data-canonical-shell-tabbar] [aria-label="Chat"]');
      const rendered = btn?.getAttribute('data-chat-attention-state') ?? null;
      const stroke = btn?.getAttribute('data-chat-icon-stroke') ?? null;
      const fill = btn?.getAttribute('data-chat-icon-fill') ?? null;
      const icon = btn?.querySelector('svg') as SVGElement | null;
      const computed = icon ? window.getComputedStyle(icon) : null;
      recordChatDeliveryEvent({
        phase: 'chat-attention-icon-resolved',
        consumer: 'ShellTabBar',
        payload: {
          canonicalState: state,
          domState: rendered,
          domStroke: stroke,
          domFill: fill,
          computedColor: computed?.color ?? null,
          computedFill: computed?.fill ?? null,
          iconMounted: !!icon,
        },
      });
      if (btn && rendered !== state) {
        recordChatDeliveryViolation({
          violation: 'CHAT_ICON_STYLE_DOES_NOT_MATCH_ATTENTION_STATE',
          consumer: 'ShellTabBar',
          payload: { canonicalState: state, domState: rendered, stroke, fill },
        });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [state]);
}
