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
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  MessageSquare,
  User,
  Spade as SpadeIcon,
  Dices as DiceIcon,
} from 'lucide-react';
import { recordGinPhaseTrace } from '@/lib/ginPhaseTrace';

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

export const ShellTabBarStateContext = createContext<ShellTabBarState | null>(null);
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

  useEffect(() => {
    recordGinPhaseTrace({
      kind: 'tab-disabled-calculation',
      summary: 'Shell tab bar disabled-state calculation',
      sourceFile: 'src/lib/canonicalShell/ShellTabBar.tsx',
      sourceFunction: 'ShellTabBar',
      detail: {
        activeTab,
        disabledByTab: { cards: false, chat: false, lobby: false, history: false },
        predicates: {
          shellTabBarStatePresent: true,
          isPaused: !!isPaused,
          cardsFlashing: cardsFlash ?? null,
          chatFlashing: chatFlash ?? null,
          chatIndicator: chatDot ?? null,
        },
      },
    });
  }, [activeTab, isPaused, cardsFlash, chatFlash, chatDot]);

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

  // Post-commit render evidence — BOUNDED.
  //
  // This effect must NOT emit instrumentation on every idle React commit.
  // It emits render-commit evidence ONLY when BOTH conditions hold:
  //   1. an active chat_send_operation exists, AND
  //   2. the resolved visual/context signature has changed since the
  //      last emission for that operation (or this is the first commit
  //      observed while that operation is active — the "operation baseline
  //      render-commit" boundary).
  //
  // Forced boundaries (operation baseline / remote projection / pulse
  // start-end / solid-red apply-clear / outline apply-remove / active-tab
  // change / tab-bar mount-remount-unmount / terminal) are captured by
  // writeForcedShellTabAttentionSnapshot / mount/unmount effects /
  // dedicated attention snapshot producers, so this effect only needs
  // to notice signature transitions during an active operation.
  const prevRenderCommitSigRef = useRef<{ opId: string | null; sig: string } | null>(null);
  useEffect(() => {
    const signature = JSON.stringify({
      chatFlashRed,
      chatDot: chatDot === 'red' && !chatFlashRed ? 'red' : chatDot,
      chatIconResolvedFill,
      chatIconResolvedStroke,
      chatAttentionRenderState,
      cardsFlash: cardsFlash ?? null,
      cardsIcon,
      cardsAttentionRenderState,
      activeTab,
    });
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(
      ({ getActiveChatOperationsForViolations }) => {
        const activeOps = getActiveChatOperationsForViolations();
        const activeOp = activeOps[0] ?? null;
        if (!activeOp) {
          // No active operation → idle render. Do NOT emit.
          prevRenderCommitSigRef.current = null;
          return;
        }
        const prev = prevRenderCommitSigRef.current;
        const isBaselineCommit = !prev || prev.opId !== activeOp;
        const signatureChanged = !!prev && prev.opId === activeOp && prev.sig !== signature;
        if (!isBaselineCommit && !signatureChanged) return; // idle re-render for same op+sig — suppress.
        prevRenderCommitSigRef.current = { opId: activeOp, sig: signature };
        void import('@/lib/shellTabAttention/shellTabAttentionInstrumentation').then(
          ({ nextInstrumentationSequence, getShellTabAttentionContext }) => {
            void import('@/lib/runtimeInstrumentation/runtimeTracer').then(({ recordRuntimeEvent }) => {
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
                reason: isBaselineCommit ? 'operation-baseline-commit' : 'signature-changed-commit',
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
              recordRuntimeEvent({
                event_family: 'shell_tab_attention',
                event_name: 'SHELL_TABBAR_RENDER_COMMITTED',
                severity: 'info',
                correlation_id: activeOp,
                route: routePath,
                active_tab: activeTab,
                payload: commonPayload,
              });
              void import('@/lib/chatOperations/serverChatOperation').then(
                ({ appendChatSenderMilestone }) => {
                  void appendChatSenderMilestone(
                    activeOp,
                    'SHELL_TABBAR_RENDER_COMMITTED',
                    commonPayload,
                  );
                },
              );
            });
          },
        );
      },
    );
  }, [
    chatFlashRed, chatDot, chatIconResolvedFill, chatIconResolvedStroke,
    chatAttentionRenderState, cardsFlash, cardsIcon, cardsAttentionRenderState,
    activeTab, routePath,
  ]);



  const requestTab = (tab: 'cards' | 'chat' | 'lobby' | 'history', owner: string, action: () => void) => {
    recordGinPhaseTrace({
      kind: 'tab-request',
      summary: `Tab requested: ${tab}`,
      sourceFile: 'src/lib/canonicalShell/ShellTabBar.tsx',
      sourceFunction: owner,
      detail: {
        requestedTab: tab,
        activeTabBefore: activeTab,
        accepted: true,
        rejected: false,
        rejectionOwner: null,
        rejectionReason: null,
      },
    });
    action();
  };

  const handleChatClick = () => {
    recordGinPhaseTrace({
      kind: 'tab-request',
      summary: 'Tab requested: chat',
      sourceFile: 'src/lib/canonicalShell/ShellTabBar.tsx',
      sourceFunction: 'ShellTabBar.handleChatClick',
      detail: {
        requestedTab: 'chat',
        activeTabBefore: activeTab,
        accepted: true,
        rejected: false,
        rejectionOwner: null,
        rejectionReason: null,
        handler: onOpenChat ? 'onOpenChat' : 'setActiveTab',
      },
    });
    if (onOpenChat) onOpenChat();
    else setActiveTab('chat');
  };

  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const cardsBtnRef = useRef<HTMLButtonElement | null>(null);
  const chatBtnRef = useRef<HTMLButtonElement | null>(null);
  const lobbyBtnRef = useRef<HTMLButtonElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);

  const lastDomInteractivitySigRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const snap = (btn: HTMLButtonElement | null, name: string) => {
      if (!btn) return { name, mounted: false };
      const cs = window.getComputedStyle(btn);
      // Walk ancestors for inert / pointer-events blockers.
      let inertAncestor: string | null = null;
      let peNoneAncestor: string | null = null;
      let el: HTMLElement | null = btn.parentElement;
      let depth = 0;
      while (el && depth < 20) {
        if ((el as any).inert === true || el.hasAttribute('inert')) {
          if (!inertAncestor) inertAncestor = el.tagName + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : '');
        }
        const acs = window.getComputedStyle(el);
        if (acs.pointerEvents === 'none' && !peNoneAncestor) {
          peNoneAncestor = el.tagName + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : '');
        }
        el = el.parentElement; depth++;
      }
      const rect = btn.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
      const covered = !!topEl && topEl !== btn && !btn.contains(topEl);
      const covererTag = covered && topEl
        ? topEl.tagName + (topEl.className ? '.' + String(topEl.className).split(' ').slice(0, 2).join('.') : '')
        : null;
      const coverer = covered && topEl
        ? topEl.closest('[data-canonical-shell-tabbar],[data-shell-owner],[data-canonical-neutral-interstitial],[data-canonical-shell-waiting],[data-canonical-shell-modal]') as HTMLElement | null
        : null;
      return {
        name,
        mounted: true,
        disabled: btn.disabled,
        ariaDisabled: btn.getAttribute('aria-disabled'),
        tabIndex: btn.tabIndex,
        computedPointerEvents: cs.pointerEvents,
        computedCursor: cs.cursor,
        computedOpacity: cs.opacity,
        computedVisibility: cs.visibility,
        selfInert: (btn as any).inert === true || btn.hasAttribute('inert'),
        inertAncestor,
        pointerEventsNoneAncestor: peNoneAncestor,
        rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
        coveredAtCenter: covered,
        covererTag,
        covererOwnerAttr: coverer ? (coverer.getAttribute('data-canonical-shell-tabbar') !== null ? 'canonical-shell-tabbar' : coverer.getAttribute('data-shell-owner') ?? coverer.getAttribute('data-canonical-neutral-interstitial') ?? coverer.getAttribute('data-canonical-shell-waiting') ?? coverer.getAttribute('data-canonical-shell-modal') ?? 'unknown-shell-layer') : null,
      };
    };
    const barMounted = !!tabBarRef.current;
    const snaps = {
      cards: snap(cardsBtnRef.current, 'cards'),
      chat: snap(chatBtnRef.current, 'chat'),
      lobby: snap(lobbyBtnRef.current, 'lobby'),
      history: snap(historyBtnRef.current, 'history'),
    };
    const sig = JSON.stringify({ barMounted, activeTab, snaps });
    if (lastDomInteractivitySigRef.current === sig) return;
    lastDomInteractivitySigRef.current = sig;
    recordGinPhaseTrace({
      kind: 'tab-dom-interactivity',
      summary: `Shell tab-bar DOM interactivity snapshot (activeTab=${activeTab})`,
      sourceFile: 'src/lib/canonicalShell/ShellTabBar.tsx',
      sourceFunction: 'ShellTabBar.domInteractivityEffect',
      detail: {
        barMounted,
        activeTab,
        predicates: {
          isPaused: !!isPaused,
          hasOnOpenChat: !!onOpenChat,
        },
        buttons: snaps,
        source: 'ShellTabBar (canonical); disabled/aria/tabIndex from React props; overlay via document.elementFromPoint at button center',
      },
    });
  });

  // ── Placeholder + portal layering repair ────────────────────────────
  //
  // Trace evidence (gin-phase-trace-2026-07-08): when a Radix Dialog
  // opens (e.g. AnteUpDialog during ante_decision), the framework sets
  //   body { pointer-events: none }
  // and mounts DialogOverlay (`fixed inset-0` z-9998) plus DialogContent
  // (`fixed left-[50%] top-[50%]` z-9999). Both effects rendered every
  // tab as computedPointerEvents:"none" and coveredAtCenter:true, so
  // Chat/Cards/Lobby/History became physically non-interactive while
  // the shell still computed them as enabled.
  //
  // Fix: keep an in-place placeholder that reserves the shell's tab-row
  // height (so `ShellHudGrid` row 3 layout is untouched), and portal the
  // actual interactive tab bar into `document.body` at fixed coords
  // matching the placeholder rect. The portal container carries
  // `pointer-events:auto` (escaping the body-level Radix lock) and
  // `z-index:10000` (above the DialogOverlay/Content z-9998/9999).
  //
  // This is deliberately still below any modal that renders at
  // z-index >= 10001; those are treated as "true blocking modals" and
  // keep the tab bar covered. No AnteUpDialog / DealerConfig / other
  // passive interstitial reaches that band today.
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [portalRect, setPortalRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const el = placeholderRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPortalRect(prev => {
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        if (
          prev &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev;
        }
        return next;
      });
    };
    const scheduleUpdate = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;
    ro.observe(el);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, []);

  const tabBarContent = (
    <div
      ref={tabBarRef}
      data-canonical-shell-tabbar=""
      data-canonical-shell-tabbar-portaled="1"
      className="flex items-center justify-center gap-1 px-3 py-1 border-t border-border/50 bg-background"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // Escape body { pointer-events: none } set by Radix modal dialogs.
        pointerEvents: 'auto',
      }}
    >
      <button
        ref={cardsBtnRef}
        onClick={() => requestTab('cards', 'ShellTabBar.cardsButton', () => setActiveTab('cards'))}
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
        ref={chatBtnRef}
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
        ref={lobbyBtnRef}
        onClick={() => requestTab('lobby', 'ShellTabBar.lobbyButton', () => setActiveTab('lobby'))}
        style={{ flex: '0 0 15%' }}
        className={`${tabBase} ${activeTab === 'lobby' ? tabActive : tabIdle}`}
        aria-label="Lobby"
      >
        <User className="w-5 h-5" />
      </button>
      <button
        ref={historyBtnRef}
        onClick={() => requestTab('history', 'ShellTabBar.historyButton', () => setActiveTab('history'))}
        style={{ flex: '0 0 15%' }}
        className={`${tabBase} ${activeTab === 'history' ? tabActive : tabIdle}`}
        aria-label="History"
      >
        <Clock className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <>
      {/* In-place placeholder — reserves the shell's tab-row height so
          ShellHudGrid layout is byte-identical to prior geometry. The
          interactive bar itself is portaled into document.body below. */}
      <div
        ref={placeholderRef}
        data-canonical-shell-tabbar-placeholder=""
        aria-hidden="true"
        style={{
          height: 'var(--hud-h-tabs)',
          minHeight: 'var(--hud-h-tabs)',
          width: '100%',
        }}
      />
      {typeof document !== 'undefined' && portalRect
        ? createPortal(
            <div
              data-canonical-shell-tabbar-portal-root=""
              style={{
                position: 'fixed',
                top: portalRect.top,
                left: portalRect.left,
                width: portalRect.width,
                height: portalRect.height,
                zIndex: 10000,
                // Explicitly opt back into pointer events — Radix modal
                // dialogs set `pointer-events: none` on <body>, which
                // would otherwise cascade into this portal container.
                pointerEvents: 'auto',
              }}
            >
              {tabBarContent}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

