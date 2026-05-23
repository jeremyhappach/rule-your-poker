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
  useMemo,
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

interface InternalContextValue {
  state: ShellTabBarState | null;
  register: (state: ShellTabBarState | null) => void;
}

const ShellTabBarContext = createContext<InternalContextValue | null>(null);

/**
 * Provider mounted inside PersistentTableShell. Holds the single
 * registered tab state. Only one consumer game subtree may register at
 * a time; the most recent registration wins.
 */
export function ShellTabBarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShellTabBarState | null>(null);
  const register = useCallback((next: ShellTabBarState | null) => {
    setState(next);
  }, []);
  const value = useMemo(() => ({ state, register }), [state, register]);
  return (
    <ShellTabBarContext.Provider value={value}>
      {children}
    </ShellTabBarContext.Provider>
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
  const ctx = useContext(ShellTabBarContext);
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
    if (!ctx) return;
    if (!state) {
      ctx.register(null);
      return;
    }
    ctx.register({
      ...state,
      setActiveTab: (t) => setActiveRef.current?.(t),
      onOpenChat: state.onOpenChat ? () => onOpenChatRef.current?.() : undefined,
    });
    return () => {
      // Only clear if we're still the registered owner. Last-writer-wins
      // ordering means a subsequent registrant may have already replaced
      // us; clearing unconditionally would race.
      ctx.register(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, signature]);
}

/** Shell-rendered tab bar. Reads from the provider. */
export function ShellTabBar() {
  const ctx = useContext(ShellTabBarContext);
  const state = ctx?.state ?? null;
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
    cardsFlash === 'green' ? 'text-green-500 fill-green-500 animate-pulse' : '',
    cardsFlash === 'red' ? 'text-red-500 fill-red-500 animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chatIconClass = [
    'w-5 h-5',
    chatFlash === 'green' ? 'text-green-500 fill-green-500 animate-pulse' : '',
    chatDot === 'red' && !chatFlash ? 'text-red-500 fill-red-500' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const cardsRing =
    cardsFlash === 'green'
      ? 'animate-pulse ring-2 ring-green-500'
      : cardsFlash === 'red'
        ? 'animate-pulse ring-2 ring-red-500'
        : '';

  const handleChatClick = () => {
    if (onOpenChat) onOpenChat();
    else setActiveTab('chat');
  };

  return (
    <div
      data-canonical-shell-tabbar=""
      className="flex items-center justify-center gap-1 px-3 py-1 border-t border-border/50 bg-background"
      style={{ flex: '0 0 auto' }}
    >
      <button
        onClick={() => setActiveTab('cards')}
        style={{ flex: '0 0 35%' }}
        className={`${tabBase} ${activeTab === 'cards' ? tabActive : tabIdle} ${cardsRing}`}
        aria-label="Cards"
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
        className={`${tabBase} ${activeTab === 'chat' ? tabActive : tabIdle} ${chatFlash === 'green' ? 'animate-pulse' : ''}`}
        aria-label="Chat"
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
