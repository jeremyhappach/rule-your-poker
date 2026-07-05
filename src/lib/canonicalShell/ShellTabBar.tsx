/**
 * ShellTabBar — canonical shell chrome primitive for the bottom tab nav.
 *
 * Ownership contract (Wave 1 of shell-chrome canonicalization):
 *
 *   - Shell owns ALL rendering, layout, and geometry: tab widths
 *     (35/35/15/15), padding, borders, active/inactive classes,
 *     flash/indicator visuals, z-ordering. This is non-overridable.
 *   - Games provide SEMANTIC METADATA ONLY via `useShellTabBar`:
 *       - which icon goes in the cards tab (spade for card games,
 *         die for dice games),
 *       - the active tab id,
 *       - a tab-change handler,
 *       - optional flash/indicator state derived from gameplay,
 *       - an optional chat-open side-effect hook.
 *   - Games never render the tab nav themselves and never describe
 *     widths or layout.
 *
 * Mount: rendered once by PersistentTableShell inside its column,
 * immediately below the canonical announcement rail and above the
 * viewport edge. The shell hides the bar (renders nothing) when no
 * game has registered tab state, so non-game routes are unaffected.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Clock,
  MessageSquare,
  User,
  Spade as SpadeIcon,
  Dices as DiceIcon,
} from 'lucide-react';

export type ShellTabId = 'cards' | 'chat' | 'lobby' | 'history';
export type ShellCardsTabIcon = 'spade' | 'dice';
export type ShellTabIndicator = 'green' | 'red' | null;

export interface ShellTabBarState {
  /** Icon rendered in the leftmost (cards) tab. */
  cardsIcon: ShellCardsTabIcon;
  activeTab: ShellTabId;
  /** Authoritative tab-change handler. Shell calls this for non-chat tabs. */
  setActiveTab: (tab: ShellTabId) => void;
  /** Cards-tab flash treatment derived from gameplay (e.g. your turn). */
  cardsFlashing?: ShellTabIndicator;
  /** Chat-tab indicator dot color (e.g. unread). */
  chatIndicator?: ShellTabIndicator;
  /** Chat-tab pulse treatment (e.g. flash on new message). */
  chatFlashing?: ShellTabIndicator;
  /**
   * Optional override called when the user taps the chat tab. Lets games
   * run side effects (mark-read, scroll) before switching tabs. If
   * provided, the shell calls this INSTEAD of `setActiveTab('chat')`;
   * the override is responsible for switching the tab itself.
   */
  onOpenChat?: () => void;
  /** Hide flash treatments while the game is paused. */
  isPaused?: boolean;
}

const ShellTabBarStateContext = createContext<ShellTabBarState | null>(null);
type ShellTabBarRegister = (registrationId: number, state: ShellTabBarState | null) => void;
const ShellTabBarRegisterContext = createContext<ShellTabBarRegister | null>(null);
let nextShellTabBarRegistrationId = 1;

/**
 * Provider mounted inside PersistentTableShell. Holds the single
 * registered tab state. Only one consumer game subtree may register at
 * a time; the most recent registration wins.
 */
export function ShellTabBarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShellTabBarState | null>(null);
  const registrationsRef = useRef<Map<number, ShellTabBarState>>(new Map());
  const register = useCallback<ShellTabBarRegister>((registrationId, next) => {
    if (next) {
      registrationsRef.current.delete(registrationId);
      registrationsRef.current.set(registrationId, next);
    } else {
      registrationsRef.current.delete(registrationId);
    }
    const registrations = Array.from(registrationsRef.current.values());
    setState(registrations[registrations.length - 1] ?? null);
  }, []);
  return (
    <ShellTabBarRegisterContext.Provider value={register}>
      <ShellTabBarStateContext.Provider value={state}>
        {children}
      </ShellTabBarStateContext.Provider>
    </ShellTabBarRegisterContext.Provider>
  );
}

/**
 * Game-facing hook. Publishes tab state to the shell so the shell can
 * render the canonical tab bar. Returns nothing — games never render
 * the bar themselves.
 *
 * Usage: call from the game's mobile table component. Pass the same
 * `activeTab` / `setActiveTab` the game uses internally for its tab
 * content panels.
 */
export function useShellTabBar(state: ShellTabBarState | null): void {
  const register = useContext(ShellTabBarRegisterContext);
  const registrationIdRef = useRef<number | null>(null);
  if (registrationIdRef.current === null) {
    registrationIdRef.current = nextShellTabBarRegistrationId++;
  }
  // Stable signature so we don't thrash on identity-only changes.
  const signature = state
    ? JSON.stringify({
        c: state.cardsIcon,
        a: state.activeTab,
        cf: state.cardsFlashing ?? null,
        ci: state.chatIndicator ?? null,
        chf: state.chatFlashing ?? null,
        p: !!state.isPaused,
        oc: !!state.onOpenChat,
      })
    : 'null';
  // Latest-callback ref so handlers stay current without re-registering.
  const setActiveRef = useRef<((t: ShellTabId) => void) | null>(null);
  const onOpenChatRef = useRef<(() => void) | null>(null);
  setActiveRef.current = state?.setActiveTab ?? null;
  onOpenChatRef.current = state?.onOpenChat ?? null;

  useEffect(() => {
    if (!register) return;
    if (!state) {
      register(registrationIdRef.current!, null);
      return;
    }
    register(registrationIdRef.current!, {
      ...state,
      setActiveTab: (t) => setActiveRef.current?.(t),
      onOpenChat: state.onOpenChat ? () => onOpenChatRef.current?.() : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature]);

  useEffect(() => {
    return () => {
      register?.(registrationIdRef.current!, null);
    };
  }, [register]);
}

/** Shell-rendered tab bar. Reads from the provider. */
export function ShellTabBar() {
  const state = useContext(ShellTabBarStateContext);
  if (!state) return null;

  const {
    cardsIcon,
    activeTab,
    setActiveTab,
    cardsFlashing,
    chatIndicator,
    chatFlashing,
    onOpenChat,
    isPaused,
  } = state;

  const cardsFlash = !isPaused ? cardsFlashing : null;
  const chatFlash = !isPaused ? chatFlashing : null;
  const chatDot = chatIndicator;

  const tabBase =
    'flex items-center justify-center py-1.5 px-2 rounded-md transition-all';
  const tabActive = 'bg-primary/20 text-foreground';
  const tabIdle = 'text-muted-foreground/50 hover:text-muted-foreground';

  const cardsIconClass = [
    'w-5 h-5',
    activeTab === 'cards' ? 'fill-current' : '',
    cardsFlash === 'green' ? 'text-poker-chip-green fill-poker-chip-green animate-pulse' : '',
    cardsFlash === 'red' ? 'text-poker-chip-red fill-poker-chip-red animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Canonical chat-attention rendering contract:
  //   chatFlash === 'red'  → NEW_MESSAGE_PULSE : outline+fill red, pulsing
  //   chatDot   === 'red'  → UNREAD_PERSISTENT : outline red, NO fill
  //   Green chat state is retired — no waiting-table green fill anywhere.
  const chatFlashRed = chatFlash === 'red';
  const chatIconClass = [
    'w-5 h-5',
    chatFlashRed ? 'text-poker-chip-red fill-poker-chip-red animate-pulse' : '',
    chatDot === 'red' && !chatFlashRed ? 'text-poker-chip-red' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const chatIconResolvedStroke =
    chatFlashRed || (chatDot === 'red' && !chatFlashRed)
      ? 'poker-chip-red'
      : 'inherit';
  const chatIconResolvedFill = chatFlashRed ? 'poker-chip-red' : 'none';
  const chatAttentionRenderState =
    chatFlashRed ? 'NEW_MESSAGE_PULSE' : chatDot === 'red' ? 'UNREAD_PERSISTENT' : 'NONE';

  const cardsAttentionRenderState =
    cardsFlash === 'red' ? 'LOCAL_TURN' : cardsFlash === 'green' ? 'NEW_DEAL' : 'NONE';

  // SHELL_TAB_ATTENTION_SNAPSHOT — narrow, contract-driven persistence of
  // the resolved tab-bar visual state for the waiting-table / no-real-game
  // Cards+Chat attention path.
  const routePath = typeof window !== 'undefined' ? window.location.pathname : '';
  const gameIdFromRoute = routePath.match(/\/game\/([0-9a-f-]{8,})/i)?.[1] ?? null;
  const prevChatFlashRedRef = useRef<boolean>(false);
  const prevChatDotRedRef = useRef<boolean>(false);
  useEffect(() => {
    void import('@/lib/shellTabAttention/shellTabAttentionInstrumentation').then(
      ({ getShellTabAttentionContext, recordShellTabAttentionSnapshot, recordWaitingChatTransition }) => {
        const ctx = getShellTabAttentionContext();
        const resolvedGameId = ctx.gameId ?? gameIdFromRoute;
        const resolvedSessionId = ctx.sessionId ?? (resolvedGameId ? `session:${resolvedGameId}` : null);
        const resolvedRoute = ctx.route ?? routePath;
        const resolvedShellPhase = ctx.shellPhase ?? null;
        recordShellTabAttentionSnapshot(
          {
            gameId: resolvedGameId,
            sessionId: resolvedSessionId,
            dealerGameId: ctx.dealerGameId ?? null,
            gameType: ctx.gameType ?? null,
            route: resolvedRoute,
            shellPhase: resolvedShellPhase,
            activeGameComponent: ctx.activeGameComponent ?? null,
            waitingTableComponent: ctx.waitingTableComponent ?? null,
            activeTab,
            canonicalMessageRevision: null,
            localUnreadCount: null,
            remoteUnreadCount: null,
            isChatOpen: activeTab === 'chat',
            chatAttentionState: chatAttentionRenderState,
            chatPulseActive: chatFlashRed,
            chatPulseDeadline: null,
            lastRemoteMessageId: null,
            cardsTabKind: cardsIcon === 'dice' ? 'dice' : 'cards',
            cardsIconKind: cardsIcon,
            cardsTabAttentionState: cardsAttentionRenderState,
            localTurnEligible: cardsFlash === 'red',
            turnAttentionSource: cardsFlash ? 'game-controller' : null,
            gameControllerPresent: !!resolvedGameId,
            currentTurnPlayerId: null,
            gameTypeResolved: ctx.gameType ?? null,
            chatTabFill: chatFlashRed ? 'poker-chip-red' : 'none',
            chatTabOutline: 'none',
            chatGlyphFill: chatIconResolvedFill,
            chatGlyphOutline: chatIconResolvedStroke,
            chatGlyphPulse: chatFlashRed,
            cardsTabFill: 'none',
            cardsTabOutline: 'none',
            cardsGlyphFill: cardsFlash === 'red' ? 'poker-chip-red' : cardsFlash === 'green' ? 'poker-chip-green' : 'currentColor',
            cardsGlyphOutline: 'inherit',
            cardsGlyphPulse: cardsFlash === 'red' || cardsFlash === 'green',
            tabBarMounted: true,
            tabBarRenderKey: 'shell-tabbar-singleton',
            shellTabBarOwner: 'PersistentTableShell',
            pointerEventsBlockerPresent: false,
            blockerSource: null,
          },
          'shell-tabbar-render',
        );

        const wasRed = prevChatFlashRedRef.current;
        if (chatFlashRed && !wasRed) {
          recordWaitingChatTransition('WAITING_CHAT_SOLID_RED_APPLIED');
        } else if (!chatFlashRed && wasRed) {
          recordWaitingChatTransition('WAITING_CHAT_SOLID_RED_CLEARED');
        }
        prevChatFlashRedRef.current = chatFlashRed;

        const dotRedNow = chatDot === 'red' && !chatFlashRed;
        if (dotRedNow && !prevChatDotRedRef.current) {
          recordWaitingChatTransition('WAITING_CHAT_OUTLINE_APPLIED');
        }
        prevChatDotRedRef.current = dotRedNow;

        const chatAttentionActive = chatFlashRed || dotRedNow;
        if (chatAttentionActive && (cardsFlash === 'red' || cardsFlash === 'green')) {
          recordWaitingChatTransition('WAITING_TAB_ATTENTION_COLLISION', {
            chatFlashRed, cardsFlash,
          });
        }
        if (chatAttentionActive && activeTab === 'cards') {
          recordWaitingChatTransition('WAITING_CARDS_TAB_RENDER_DURING_CHAT_ATTENTION');
        }
      },
    );
  }, [
    activeTab, cardsIcon, cardsFlash, chatFlashRed, chatDot,
    chatAttentionRenderState, cardsAttentionRenderState,
    chatIconResolvedFill, chatIconResolvedStroke,
    gameIdFromRoute, routePath,
  ]);

  useEffect(() => {
    void import('@/lib/shellTabAttention/shellTabAttentionInstrumentation').then(
      ({ recordWaitingChatTransition }) => {
        recordWaitingChatTransition('WAITING_TABBAR_REMOUNT_DURING_CHAT_ATTENTION', {
          note: 'shell-tabbar mounted',
        });
      },
    );
    return () => {
      void import('@/lib/runtimeInstrumentation/runtimeTracer').then(({ recordRuntimeEvent }) => {
        recordRuntimeEvent({
          event_family: 'shell_tab_attention',
          event_name: 'SHELL_TABBAR_UNMOUNTED',
          severity: 'info',
          payload: { note: 'shell-tabbar unmounted' },
        });
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-commit render evidence. Distinguishes an actual React commit
  // from an inferred state change: this effect runs AFTER the tab-bar
  // DOM is committed to the screen, on every commit, and emits three
  // render-committed events (bar / chat tab / cards tab). Each carries
  // renderCommitSequence + full resolved visual matrix + active
  // operation ids, so the exported TXT can prove that the visual
  // render actually happened at each capture point (mount, remount,
  // per intra-operation change, terminal).
  useEffect(() => {
    void import('@/lib/shellTabAttention/shellTabAttentionInstrumentation').then(
      ({ nextInstrumentationSequence, getShellTabAttentionContext }) => {
        void import('@/lib/waitingTable/waitingTableInstrumentation').then(
          ({ getActiveChatOperationsForViolations }) => {
            void import('@/lib/runtimeInstrumentation/runtimeTracer').then(({ recordRuntimeEvent }) => {
              const activeOps = getActiveChatOperationsForViolations();
              const activeOp = activeOps[0] ?? null;
              const renderCommitSequence = nextInstrumentationSequence();
              const ctx = getShellTabAttentionContext();
              const visualMatrix = {
                chatFlashRed,
                chatDotRed: chatDot === 'red' && !chatFlashRed,
                chatGlyphFill: chatIconResolvedFill,
                chatGlyphOutline: chatIconResolvedStroke,
                chatAttentionState: chatAttentionRenderState,
                cardsFlash: cardsFlash ?? null,
                cardsIcon,
                cardsAttentionState: cardsAttentionRenderState,
                activeTab,
                tabBarRenderKey: 'shell-tabbar-singleton',
              };
              const commonPayload = {
                renderCommitSequence,
                activeOperationId: activeOp,
                activeOperationIds: activeOps,
                tabBarRenderKey: 'shell-tabbar-singleton',
                activeTab,
                visualMatrix,
                waitingTableContext: {
                  gameId: ctx.gameId ?? null,
                  sessionId: ctx.sessionId ?? null,
                  dealerGameId: ctx.dealerGameId ?? null,
                  gameType: ctx.gameType ?? null,
                  route: ctx.route ?? routePath,
                  shellPhase: ctx.shellPhase ?? null,
                  waitingTableComponent: ctx.waitingTableComponent ?? null,
                  activeGameComponent: ctx.activeGameComponent ?? null,
                },
              };
              const emit = (name: string, extra: Record<string, unknown> = {}) => {
                recordRuntimeEvent({
                  event_family: 'shell_tab_attention',
                  event_name: name,
                  severity: 'info',
                  correlation_id: activeOp ?? undefined,
                  route: routePath,
                  active_tab: activeTab,
                  payload: { ...commonPayload, ...extra },
                });
              };
              emit('SHELL_TABBAR_RENDER_COMMITTED');
              emit('CHAT_TAB_RENDER_COMMITTED', { tab: 'chat' });
              emit('CARDS_TAB_RENDER_COMMITTED', { tab: 'cards' });

              // If there is an active chat op, also persist an
              // intermediate sender/peer milestone so the TXT ordered
              // timeline records render-commit alongside snapshots.
              if (activeOp) {
                void import('@/lib/chatOperations/serverChatOperation').then(
                  ({ appendChatSenderMilestone }) => {
                    void appendChatSenderMilestone(
                      activeOp,
                      'SHELL_TABBAR_RENDER_COMMITTED',
                      commonPayload,
                    );
                  },
                );
              }
            });
          },
        );
      },
    );
  });



  const handleChatClick = () => {
    if (onOpenChat) onOpenChat();
    else setActiveTab('chat');
  };

  return (
    <div
      data-canonical-shell-tabbar=""
      className="flex items-center justify-center gap-1 px-3 py-1 border-t border-border/50 bg-background"
      style={{
        // Phase 2: token-driven proportional height (--hud-h-tabs).
        height: 'var(--hud-h-tabs)',
        minHeight: 'var(--hud-h-tabs)',
        overflow: 'hidden',
      }}
    >

      <button
        onClick={() => setActiveTab('cards')}
        style={{ flex: '0 0 35%' }}
        className={`${tabBase} ${activeTab === 'cards' ? tabActive : tabIdle}`}
        aria-label="Cards"
        data-cards-attention-state={cardsFlash === 'red' ? 'LOCAL_TURN' : cardsFlash === 'green' ? 'NEW_DEAL' : 'NONE'}
      >
        {cardsIcon === 'dice' ? (
          <DiceIcon className={cardsIconClass} />
        ) : (
          <SpadeIcon className={cardsIconClass} />
        )}
      </button>
      <button
        onClick={handleChatClick}
        style={{ flex: '0 0 35%' }}
        className={`${tabBase} ${activeTab === 'chat' ? tabActive : tabIdle}`}
        aria-label="Chat"
        data-chat-attention-state={chatAttentionRenderState}
        data-chat-icon-stroke={chatIconResolvedStroke}
        data-chat-icon-fill={chatIconResolvedFill}
      >
        <MessageSquare className={chatIconClass} />
      </button>

      <button
        onClick={() => setActiveTab('lobby')}
        style={{ flex: '0 0 15%' }}
        className={`${tabBase} ${activeTab === 'lobby' ? tabActive : tabIdle}`}
        aria-label="Lobby"
      >
        <User className="w-5 h-5" />
      </button>
      <button
        onClick={() => setActiveTab('history')}
        style={{ flex: '0 0 15%' }}
        className={`${tabBase} ${activeTab === 'history' ? tabActive : tabIdle}`}
        aria-label="History"
      >
        <Clock className="w-5 h-5" />
      </button>
    </div>
  );
}
