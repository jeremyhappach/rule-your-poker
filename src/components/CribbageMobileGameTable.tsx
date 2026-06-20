import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
import { DISCARD_COUNT } from '@/lib/cribbageTypes';
import {
  initializeCribbageGame, 
  discardToCrib, 
  playPeggingCard, 
  callGo,
  applyHandCountScores,
} from '@/lib/cribbageGameLogic';
import { endCribbageGame, startNextCribbageHand } from '@/lib/cribbageRoundLogic';
import { ensureHarnessCacheLoaded } from '@/lib/debugHarness/runtimeCache';
import { fetchSessionHostPlayerId } from '@/lib/debugHarness/resolveHarnessHost';
import { archiveCribbageHand } from '@/lib/cribbageHandArchive';
import { hasPlayableCard } from '@/lib/cribbageScoring';
import { getHandScoringCombos, getTotalFromCombos } from '@/lib/cribbageScoringDetails';
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbageFeltContent } from './CribbageFeltContent';
import { CribbageAnchoredCribCutMount } from './CribbageAnchoredCribCutMount';
import { CribbageAnchoredPeggingRowMount } from './CribbageAnchoredPeggingRowMount';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbageMobileCardsTab } from './CribbageMobileCardsTab';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCountingPhase } from './CribbageCountingPhase';
import { CribbageTurnSpotlight } from './CribbageTurnSpotlight';
import { type DealerSelectionCard, type DealerSelectionState, useHighCardDealerSelection } from '@/hooks/useHighCardDealerSelection';
import { useAnnouncements } from '@/lib/canonicalShell/announcements';
import { recordAnnouncementDebugEvent } from '@/lib/canonicalShell/announcements/announcementDebugLog';
import { useShellTabBar } from '@/lib/canonicalShell/ShellTabBar';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { GameplayOpponentSeatLayer } from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import { DealerIndicator } from './canonicalShell/DealerIndicator';
import { usePreSessionSeatOwned } from '@/lib/canonicalShell/PreSessionSeatLayer';
import { dealerDbgStore } from '@/lib/canonicalShell/extraDebugStore';
import { derivePlayerStatus } from '@/lib/canonicalShell/participantStatus';
import { recordPlayerVisualSnapshot, probeChipDom, probeChipDomAncestry } from '@/lib/wartimeDebug/surfaces';
import { useRequiredSeatAnchors } from '@/lib/canonicalShell/SeatAnchorLayer';
import {
  usePublishShellFelt,
} from '@/lib/canonicalShell/ShellOwnedFeltHost';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import {
  WaitingFlightMarker,
  recordWaitingLifecycleIfChanged,
} from '@/lib/canonicalShell/waitingTableFlight';
// Phase E: bespoke match-end UI retired in favor of canonical
// `match_win` announcement. CribbageSkunkOverlay +
// CribbageWinnerAnnouncement deleted.
// eslint-disable-next-line no-restricted-imports -- P0 migration: move to shell-owned presentation.chipTransfer (plan step 3e)
import { useChipTransport } from '@/lib/canonicalShell/ChipTransportProvider';
import { MobileChatPanel } from './MobileChatPanel';
import { HandHistory } from './HandHistory';
import { QuickEmoticonPicker } from './QuickEmoticonPicker';
import { RoundHandDebugOverlay } from './RoundHandDebugOverlay';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { useGameChat } from '@/hooks/useGameChat';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';

import { MessageSquare, User, Clock } from 'lucide-react';
import { useWakeLock } from '@/hooks/useWakeLock';
import { 
  useCribbageEventContext, 
  logPeggingPlay, 
  logGoPointEvent,
  logHisHeelsEvent,
  logCountingScoringEvents,
  logCutCardEvent
} from '@/lib/useCribbageEventLogging';
import { useGameStateSync } from '@/lib/gameStateSync';
import { useAuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentity';
import { isIdentityForward, type AuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentityPure';
import { getCribbageProgress } from '@/lib/gameStateSync/cribbageProgress';
import { logCribbageDebug, cribbageStateSummary, newTraceId, type CribbageDebugContext } from '@/lib/cribbageDebugLogger';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { traceGoRace, peggingSnapshot } from '@/lib/cribbageGoRaceTrace';
import { buildMetaPayload } from '@/lib/buildMeta';
import { emitCribbageHandoffTrace } from '@/lib/cribbageHandoffTrace';
import { useLifecycleMount } from '@/lib/canonicalShell/lifecycleDebug';
import { Wave4CribbageChromeHost } from '@/components/Wave4CribbageChromeHost';
import { Wave4PegboardSlot } from '@/components/Wave4PegboardSlot';
import { CribbageGameplayGeometryProvider } from '@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider';


import {
  checkStaleDealerGameRender,
  checkCribbagePhaseRenderMismatch,
  checkCribbageResultRenderMismatch,
  checkRegressiveIdentity,
  resetCribbageTracking,
  checkCribbageHandReversion,
  checkCribbageScoreReversion,
  
  resetCribbageReversionTracking,
  checkCribbageTapFailure,
  logCribbageScoringStart,
  logCribbageResultDisplay,
  logCribbageDealerGameStart,
  logCribbageHandStart,
} from '@/lib/cribbageSyncDiagnostics';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  sitting_out?: boolean;
  waiting?: boolean;
  status?: string;
  profiles?: { username: string };
}

interface CribbageGameConfig {
  pointsToWin: number;
  skunkEnabled: boolean;
  skunkThreshold: number;
  doubleSkunkEnabled: boolean;
  doubleSkunkThreshold: number;
}

/**
 * CribbageFeltAdapter — Bucket 3 Phase 3.1b cutover seam.
 *
 * Default (shell-owned felt OFF): renders the local canonical felt
 * exactly as before. Shell-owned felt ON: publishes the same parameters
 * to the shell-owned host via `usePublishShellFelt` and suppresses the
 * local render so only one canonical felt node exists in the DOM.
 *
 * Isolated as a child so hook ordering inside the parent table component
 * is unchanged when the flag flips.
 */
function CribbageFeltAdapter(props: {
  anteAmount: number | string;
  pointsToWin: number;
  cribbageSkunk: {
    skunkEnabled?: boolean;
    skunkThreshold?: number;
    doubleSkunkEnabled?: boolean;
    doubleSkunkThreshold?: number;
  };
  isWaitingPhase: boolean;
}) {
  usePublishShellFelt({
    gameKind: 'cribbage',
    anteAmount: props.anteAmount,
    pointsToWin: props.pointsToWin,
    cribbageSkunk: props.cribbageSkunk,
    isWaitingPhase: props.isWaitingPhase,
    feltPlateMode: 'GAME',
    publisherLabel: 'CribbageMobileGameTable',
  });
  return (
    <div
      data-shell-felt-geometry-anchor="cribbage"
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    />
  );
}


interface CribbageMobileGameTableProps {
  gameId: string;
  roundId: string;
  dealerGameId: string | null; // Required for event logging
  handNumber: number; // Required for event logging (from round data)
  players: Player[];
  currentUserId: string;
  dealerPosition: number;
  anteAmount: number;
  pot: number;
  isHost: boolean;
  onGameComplete: () => void;
  // Game configuration
  gameConfig?: CribbageGameConfig;
  // Dealer selection props (optional - used during cribbage_dealer_selection phase).
  // Phase F.2: announcement string retired — dealer-selection messaging is canonical-only.
  dealerSelectionCards?: DealerSelectionCard[];
  dealerSelectionWinnerPosition?: number | null;
  isDealerSelection?: boolean;
  // ── Phase 2.1: session-level dealer-selection controller now mounts
  // INSIDE the slot child (no sibling JSX above the table). Parent
  // passes the session-scoped synced state + callbacks; the table mounts
  // `CribbageDealerSelectionController` internally and threads them in.
  dealerSelectionSyncedState?: DealerSelectionState | null;
  onDealerSelectionCardsUpdate?: (cards: DealerSelectionCard[]) => void;
  onDealerSelectionWinnerPositionUpdate?: (pos: number | null) => void;
  onDealerSelectionComplete?: (pos: number) => void;

  // Dealer chat announcements (session-persistent, optional)
  dealerChatMessages?: Array<{
    id: string;
    message: string;
    created_at: string;
    isDealer: true;
  }>;
  onInjectDealerChatMessage?: (message: string) => void;
}

// Custom Spade icon for tab
const SpadeIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="0"
  >
    <path d="M12 2C12 2 4 9 4 13.5C4 16.5 6.5 18.5 9 18.5C10.2 18.5 11.2 18 12 17.2C12.8 18 13.8 18.5 15 18.5C17.5 18.5 20 16.5 20 13.5C20 9 12 2 12 2Z" />
    <path d="M12 17.5L12 22" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M9 22L15 22" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/**
 * Generate a unique hand key from cribbage state to detect hand transitions.
 * Uses dealerPlayerId + first player's hand signature to uniquely identify a hand.
 */
/**
 * Generate a stable hand identity key from cribbage state.
 * CRITICAL: This must be STABLE across pegging updates.
 * Uses the full original deal (hand + discarded + played cards for first player)
 * so the key doesn't change when cards move from hand → playedCards during pegging.
 */
/**
 * Felt-level placement for the Cribbage crib pip.
 *
 * Anchor model: the canonical seat slot identifies OWNERSHIP only; the
 * marker itself is placed from that slot's rail segment. Keep these
 * coordinates rail-adjacent rather than chip-stack-adjacent so active,
 * observer, face-to-face, and relative projections all read as table
 * state on the felt instead of profile/chip chrome.
 */
function cribPipPlacementForSlot(slot: number | null): string | null {
  // Per-slot tuning. Two distinct goals:
  //   - HOME (-1): hug the bottom rail tightly so the marker reads as
  //     belonging to the active player's rail section, not floating in
  //     gameplay space.
  //   - Opponent slots: sit at the bottom-right of the owning seat
  //     cluster (slightly inward from the rail edge, slightly below
  //     the chip) so the marker reads as associated with that seat's
  //     section of rail rather than horizontally detached.
  // Cluster anchor reference (see canonicalSlotPlacement.ts):
  //   -2 top-[4%] center | 2 top-[14%] left-[12%] | 3 top-[14%] right-[12%]
  //   1  top-[50%] left-[4%] | 4 top-[50%] right-[4%]
  //   0  top-[78%] left-[10%] | 5 top-[78%] right-[10%]
  switch (slot) {
    case -2: return 'top-[14%] left-[54%]';                                // FACE_TO_FACE: bottom-right of top-center cluster
    case -1: return 'bottom-[1%] left-1/2 -translate-x-1/2';               // HOME: tight to bottom rail
    case -3: return 'bottom-[1%] right-[14%]';                             // BOTTOM_RAIL: observer south rail, tight
    case 0:  return 'top-[90%] left-[20%]';                                // bottom-left: bottom-right of cluster
    case 1:  return 'top-[60%] left-[12%]';                                // mid-left: bottom-right of cluster
    case 2:  return 'top-[26%] left-[22%]';                                // top-left: bottom-right of cluster
    case 3:  return 'top-[26%] right-[22%]';                               // top-right: bottom-left of cluster (mirror)
    case 4:  return 'top-[60%] right-[12%]';                               // mid-right: bottom-left of cluster (mirror)
    case 5:  return 'top-[90%] right-[20%]';                               // bottom-right: bottom-left of cluster (mirror)
    default: return null;
  }
}

function getHandKey(state: CribbageState | null): string {
  if (!state) return '';
  const firstPlayerId = state.turnOrder[0];
  const firstPlayerHand = state.playerStates[firstPlayerId]?.hand || [];
  const discarded = state.playerStates[firstPlayerId]?.discardedToCrib || [];
  // Include cards this player has played during pegging to keep the key stable
  // as cards move from hand → playedCards
  const playedByFirstPlayer = (state.pegging?.playedCards || [])
    .filter(pc => pc.playerId === firstPlayerId)
    .map(pc => pc.card);
  const handSig = [...firstPlayerHand, ...discarded, ...playedByFirstPlayer]
    .map(c => `${c.rank}${c.suit}`)
    .sort()
    .join(',');
  return `${state.dealerPlayerId}-${handSig}`;
}

const HAND_BOUNDARY_GUARD_LIMIT = 24;

function pruneGuardSet(set: Set<string>, max = HAND_BOUNDARY_GUARD_LIMIT) {
  if (set.size <= max) return;
  const keys = Array.from(set);
  for (let i = 0; i < keys.length - max; i += 1) {
    set.delete(keys[i]);
  }
}

function pruneGuardMap(map: Map<string, number>, max = HAND_BOUNDARY_GUARD_LIMIT) {
  if (map.size <= max) return;
  const keys = Array.from(map.keys());
  for (let i = 0; i < keys.length - max; i += 1) {
    map.delete(keys[i]);
  }
}

function incrementGuardCount(map: Map<string, number>, key: string): number {
  const prior = map.get(key) ?? 0;
  map.set(key, prior + 1);
  pruneGuardMap(map);
  return prior;
}

function markGuardConsumed(set: Set<string>, key: string): boolean {
  if (set.has(key)) return false;
  set.add(key);
  pruneGuardSet(set);
  return true;
}

function buildBoundaryGuardKey(
  dealerGameId: string | null,
  roundId: string | null | undefined,
  handNumber: number,
  handKey?: string | null,
) {
  return `${dealerGameId ?? 'no-dealer'}:${roundId ?? 'no-round'}:${handNumber}:${handKey ?? 'no-hand-key'}`;
}

/**
 * Phase C.2: headless dealer-selection controller.
 *
 * Behavior-preserving extraction — identical to the previous
 * `<HighCardDealerSelection selectionVariant="cribbage" allowBotDealers />`
 * mount, but the underlying logic now lives in
 * `useHighCardDealerSelection`. This shim exists ONLY to preserve the
 * conditional mount/unmount semantics on
 * `isHighCardMode && !isDealerSelection` so legacy timing and same-game
 * replay reset behavior are bit-for-bit identical.
 */
function CribbageDealerSelectionController(props: {
  gameId: string;
  players: any[];
  isHost: boolean;
  syncedState: DealerSelectionState | null;
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  onWinnerPositionUpdate: (position: number | null) => void;
  onComplete: (pos: number) => void;
}) {
  useHighCardDealerSelection({
    gameId: props.gameId,
    players: props.players,
    isHost: props.isHost,
    allowBotDealers: true,
    selectionVariant: 'cribbage',
    syncedState: props.syncedState,
    onCardsUpdate: props.onCardsUpdate,
    onWinnerPositionUpdate: props.onWinnerPositionUpdate,
    onComplete: props.onComplete,
  });
  return null;
}

/**
 * Parallel to `DealerSelectionVisibilityTracker` in MobileGameTable —
 * fires `dealer_selection_cards_visible` on real DOM mount of the
 * Cribbage felt-content high-card overlay branch, and `cleared` on
 * unmount. Gives Cribbage repros the same conclusive checkpoint as
 * session-level dealer-selection.
 */
function CribbageDealerSelectionVisibilityTracker({
  gameId,
  cardCount,
  winnerPosition,
}: {
  gameId: string;
  cardCount: number;
  winnerPosition: number | null;
}) {
  const lastCountRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    import('@/lib/dealerSelectionDiag').then(({ recordDealerSelectionDiag }) => {
      if (cancelled) return;
      recordDealerSelectionDiag('dealer_selection_cards_visible', {
        sessionId: gameId,
        dealerSelectionId: `${gameId}:host`,
        cardCount,
        winnerPosition,
        presentationVisibilityState: 'visible',
        scope: 'cribbage',
        extra: {
          surface: 'CribbageMobileGameTable.dealerSelectionOverlay',
          phase: 'mount',
        },
      });
    });
    lastCountRef.current = cardCount;
    return () => {
      cancelled = true;
      const prior = lastCountRef.current;
      import('@/lib/dealerSelectionDiag').then(({ recordDealerSelectionDiag }) => {
        recordDealerSelectionDiag('dealer_selection_cards_visible', {
          sessionId: gameId,
          dealerSelectionId: `${gameId}:host`,
          cardCount: 0,
          winnerPosition,
          presentationVisibilityState: 'cleared',
          scope: 'cribbage',
          extra: {
            surface: 'CribbageMobileGameTable.dealerSelectionOverlay',
            phase: 'unmount',
            priorCount: prior,
          },
        });
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}


export const CribbageMobileGameTable = ({
  gameId,
  roundId,
  dealerGameId,
  handNumber,
  players,
  currentUserId,
  dealerPosition,
  anteAmount,
  pot,
  isHost,
  onGameComplete,
  // Game configuration with defaults
  gameConfig = {
    pointsToWin: 121,
    skunkEnabled: true,
    skunkThreshold: 91,
    doubleSkunkEnabled: true,
    doubleSkunkThreshold: 61,
  },
  // Dealer selection props (from parent during cribbage_dealer_selection phase)
  dealerSelectionCards: externalDealerSelectionCards,
  dealerSelectionWinnerPosition: externalDealerSelectionWinnerPosition,
  isDealerSelection = false,
  dealerSelectionSyncedState = null,
  onDealerSelectionCardsUpdate,
  onDealerSelectionWinnerPositionUpdate,
  onDealerSelectionComplete,

  dealerChatMessages: externalDealerChatMessages,
  onInjectDealerChatMessage,
}: CribbageMobileGameTableProps) => {
  // SHELL LC: mount marker for comparative branch-swap evidence.
  useLifecycleMount('CribbageMobileGameTable');
  const { getTableColors, getCardBackColors } = useVisualPreferences();
  // Wave 5D Phase 4A.1 — Cleanup blocker #2.
  // When anchored, the pegboard must NOT inherit the felt-content
  // `translateY(6%)` ancestor transform — assigned anchored rect must
  // equal rendered DOM rect. We render the slot OUTSIDE the translateY
  // wrapper (but still inside the canonical felt frame) when this is on.
  



  // ── Lifecycle instrumentation ─────────────────────────────────
  // Stable instance ID survives re-renders; changes only on true unmount/remount.
  const instanceIdRef = useRef<string>(`cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const renderCountRef = useRef(0);
  const prevRoundIdRef_lifecycle = useRef<string | null>(null);
  const prevHandKeyRef_lifecycle = useRef<string | null>(null);

  // Mount / unmount logging — includes session-level context
  useEffect(() => {
    logDebugEvent({
      gameId,
      eventType: 'crib:lifecycle:table_mounted',
      payload: {
        instanceId: instanceIdRef.current,
        roundId,
        handNumber,
        gameId,
        dealerGameId,
        isDealerSelection,
        hasViewState: false, // always false at mount
        hasCribbageState: false,
        ...buildMetaPayload(),
      },
    });
    return () => {
      logDebugEvent({
        gameId,
        eventType: 'crib:lifecycle:table_unmounted',
        payload: {
          instanceId: instanceIdRef.current,
          roundId,
          handNumber,
          dealerGameId,
          isDealerSelection,
          renderCount: renderCountRef.current,
        },
      });
    };
  }, []); // empty deps = true mount/unmount only
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  
  // Prevent screen from dimming during gameplay
  useWakeLock(true);
  
  // Chat hook - integrated like other mobile game tables
  const { allMessages, sendMessage, isSending: isChatSending, latestRealtimeMessage } = useGameChat(gameId, players, currentUserId);
  
  // Tab state - must be declared before chat indicator hooks that reference it
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');

  // Unread messages tracking for chat tab indicator
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatTabFlashing, setChatTabFlashing] = useState(false);
  // Chat indicator: hydration guard + replay guard
  const chatHydratedRef = useRef(false);
  const hasObservedInitialChatSnapshotRef = useRef(false);
  const lastProcessedRealtimeMessageIdRef = useRef<string | null>(null);
  const lastSeenChatMessageIdRef = useRef<string | null>(null);
  const lastReadChatMessageIdRef = useRef<string | null>(null);
  const greenClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showGreenChatIndicator = chatTabFlashing;
  const showRedChatIndicator = hasUnreadMessages && !chatTabFlashing;

  const getChatIndicatorEligibility = useCallback((message: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }) => {
    const isOptimistic = message.id.startsWith('optimistic-');
    const isDealerOrSystem = message.id.startsWith('dealer-') || !message.user_id;
    const isSelfAuthored = !!currentUserId && message.user_id === currentUserId;
    const authorPlayer = players.find((p) => p.user_id === message.user_id);
    const isBotAuthored = authorPlayer?.is_bot === true;

    const reason = isOptimistic
      ? 'optimistic'
      : isDealerOrSystem
        ? 'dealer-or-system'
        : isSelfAuthored
          ? 'self'
          : isBotAuthored
            ? 'bot'
            : 'eligible-other-human';

    return { eligible: reason === 'eligible-other-human', reason };
  }, [currentUserId, players]);

  const eligibleIndicatorMessages = useMemo(
    () => allMessages.filter((message) => getChatIndicatorEligibility(message).eligible),
    [allMessages, getChatIndicatorEligibility]
  );

  const getMessagesAfterWatermark = useCallback(
    (
      messages: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }[],
      watermarkId: string | null,
      includeWatermark = false
    ) => {
      if (!watermarkId) return [];

      const watermarkIdx = messages.findIndex((message) => message.id === watermarkId);
      if (watermarkIdx === -1) return [];

      return messages.slice(includeWatermark ? watermarkIdx : watermarkIdx + 1);
    },
    []
  );

  const logChatIndicator = useCallback(
    (
      event: string,
      message: { id: string; user_id: string; message: string; image_url?: string | null; username?: string } | null,
      overrides: Record<string, unknown> = {}
    ) => {
      console.log(`[chat-indicator] ${event}`, {
        surface: 'cribbage',
        messageId: message?.id ?? null,
        currentUserId,
        'message.user_id': message?.user_id ?? null,
        activeTab,
        hydrated: chatHydratedRef.current,
        flashing: chatTabFlashing,
        unread: hasUnreadMessages,
        lastSeen: lastSeenChatMessageIdRef.current,
        lastRead: lastReadChatMessageIdRef.current,
        ...overrides,
      });
    },
    [activeTab, chatTabFlashing, currentUserId, hasUnreadMessages]
  );

  const handleOpenChatTab = useCallback(() => {
    const latestEligibleMessage = eligibleIndicatorMessages[eligibleIndicatorMessages.length - 1] ?? null;
    const wasFlashing = chatTabFlashing;
    const wasUnread = hasUnreadMessages;

    if (greenClearTimeoutRef.current) {
      clearTimeout(greenClearTimeoutRef.current);
      greenClearTimeoutRef.current = null;
    }

    setChatTabFlashing(false);
    setHasUnreadMessages(false);
    setActiveTab('chat');

    if (latestEligibleMessage && lastReadChatMessageIdRef.current !== latestEligibleMessage.id) {
      lastReadChatMessageIdRef.current = latestEligibleMessage.id;
      logChatIndicator('watermark updated', latestEligibleMessage, {
        activeTab: 'chat',
        flashing: false,
        unread: false,
        lastRead: latestEligibleMessage.id,
        reason: 'chat-open',
      });
    }

    logChatIndicator('chat opened', latestEligibleMessage, {
      activeTab: 'chat',
      flashing: false,
      unread: false,
    });

    if (wasFlashing) {
      logChatIndicator('green cleared', latestEligibleMessage, {
        activeTab: 'chat',
        flashing: false,
        unread: false,
        reason: 'chat-open',
      });
    }

    if (wasUnread) {
      logChatIndicator('red cleared', latestEligibleMessage, {
        activeTab: 'chat',
        flashing: false,
        unread: false,
        reason: 'chat-open',
      });
    }
  }, [chatTabFlashing, eligibleIndicatorMessages, hasUnreadMessages, logChatIndicator]);

  // Publish tab metadata to the shell-owned tab bar. Shell owns layout
  // and geometry; this surface provides only the icon choice and the
  // gameplay-derived indicator state.
  useShellTabBar({
    cardsIcon: 'spade',
    activeTab,
    setActiveTab,
    chatFlashing: showGreenChatIndicator ? 'green' : null,
    chatIndicator: showRedChatIndicator ? 'red' : null,
    onOpenChat: handleOpenChatTab,
  });

  useEffect(() => {
    return () => {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
      }
    };
  }, []);
  
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  // Keep latest state in a ref so effects can avoid depending on object identity churn.
  const cribbageStateRef = useRef<CribbageState | null>(null);

  // ── Latched pegboard data: persists across bootstrap mode to prevent pegboard unmount flicker ──
  const latchedPegboardDataRef = useRef<{
    playerStates: Record<string, import('@/lib/cribbageTypes').CribbagePlayerState>;
    winningScore: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // ── Phase 2: framework-owned authoritative identity ─────────────
  // Subscribes to `rounds` filtered by `dealer_game_id`, so the client observes
  // INSERT/UPDATE for NEW rounds without re-keying any round-id-scoped channel.
  // This eliminates the stale-identity blind window: when a peer client advances
  // the hand, we learn about the new round id synchronously rather than waiting
  // for the parent prop to lag-catch up.
  const { identity: authIdentity } = useAuthoritativeIdentity({ dealerGameId });

  // Local tracking of current round for proper hand transitions.
  // Forward-only — never regress, even if a prop or identity feed momentarily lags.
  const [currentRoundId, setCurrentRoundId] = useState(roundId);
  const [currentHandNumber, setCurrentHandNumber] = useState(handNumber);
  const roundBoundaryGuardKey = useMemo(
    () => buildBoundaryGuardKey(dealerGameId, currentRoundId, currentHandNumber),
    [dealerGameId, currentRoundId, currentHandNumber],
  );

  // Forward-only merge of (a) parent props and (b) authoritative-identity feed.
  //
  // CONTRACT (post-P0 fix):
  //  • Authoritative identity is the source of truth. Parent props are
  //    advisory — they may LAG (parent watcher hasn't fetched the new round
  //    yet) but they may NEVER overwrite a forward authoritative identity.
  //  • currentRoundId is strictly forward-only. Equal-hand replacement is
  //    forbidden because it was the regression vector that wedged Client 2
  //    onto a stale round when `useAuthoritativeIdentity` flickered.
  //  • Since `useAuthoritativeIdentity` is now monotonic-forward-only at the
  //    framework level, trusting it fully cannot regress.
  useEffect(() => {
    const propHand = handNumber ?? -1;
    const authHand = authIdentity?.handNumber ?? -1;

    // Prefer auth when it is forward-of-or-equal to prop (the common case);
    // fall back to prop only when auth has not yet observed up to prop hand.
    const useAuth = authIdentity?.roundId != null && authHand >= propHand;
    const incomingRoundId = useAuth ? authIdentity!.roundId! : roundId;
    // CRITICAL: Use the RAW incoming hand number — NOT floored by
    // currentHandNumber. Flooring with currentHandNumber inflates a stale
    // incoming hand number to the local current, which then satisfies the
    // "equal hand, different round" branch of `isIdentityForward` and lets
    // a stale roundId regress the local identity. The regression wedges
    // `initialLoadComplete=false`, which causes the bootstrap branch to
    // early-return forever and freezes the discard transition.
    const incomingHandNumber = useAuth ? authHand : propHand;
    if (!incomingRoundId) return;
    if (incomingHandNumber < 0) return;

    setCurrentHandNumber((prev) => (incomingHandNumber > prev ? incomingHandNumber : prev));
    setCurrentRoundId((prev) => {
      if (!prev) return incomingRoundId;
      if (prev === incomingRoundId) return prev;
      const prevIdent: AuthoritativeIdentity = {
        dealerGameId: dealerGameId ?? null,
        handNumber: currentHandNumber,
        roundId: prev,
      };
      const nextIdent: AuthoritativeIdentity = {
        dealerGameId: dealerGameId ?? null,
        handNumber: incomingHandNumber,
        roundId: incomingRoundId,
      };
      // Strictly forward. Equal-hand-different-roundId is only safe when the
      // incoming identity comes from the AUTHORITATIVE feed — prop-derived
      // equal-hand swaps are the documented regression vector and must be
      // rejected here.
      if (isIdentityForward(prevIdent, nextIdent)) {
        if (prevIdent.handNumber === nextIdent.handNumber && !useAuth) {
          return prev;
        }
        return incomingRoundId;
      }
      return prev;
    });
  }, [roundId, handNumber, authIdentity?.roundId, authIdentity?.handNumber, currentHandNumber, dealerGameId]);


  // ── Identity-advancement reset ─────────────────────────────────
  // When the dealer-game-scoped identity feed detects a forward advance (peer
  // started next hand), clear the local cribbageState mirror so renderHandKey
  // collapses immediately and the felt drops to the "Preparing next hand…" shell
  // until the next snapshot for the new identity arrives.
  // Framework `useGameStateSync` separately auto-resets its own three layers
  // (optimistic, frozen, visual contract) via `config.identity`.
  const lastObservedIdentityRef = useRef<AuthoritativeIdentity | null>(null);
  useEffect(() => {
    if (!authIdentity) return;
    const prev = lastObservedIdentityRef.current;
    lastObservedIdentityRef.current = authIdentity;
    if (!prev) return; // first observation; nothing stale to clear
    if (!isIdentityForward(prev, authIdentity)) return;
    setCribbageState(null);
    cribbageStateRef.current = null;
    const payload = {
      prevHand: prev.handNumber,
      nextHand: authIdentity.handNumber,
      prevRoundId: prev.roundId?.slice(0, 8) ?? null,
      nextRoundId: authIdentity.roundId?.slice(0, 8) ?? null,
    };
    // Two events: a canonical "identity advanced" lifecycle hook plus the
    // specific "presentation reset on identity advance" effect we just performed.
    persistSyncDebugEvent({
      gameId, gameType: 'cribbage',
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'transition', severity: 'info',
      eventName: 'crib-identity-advanced',
      payload,
    });
    persistSyncDebugEvent({
      gameId, gameType: 'cribbage',
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'transition', severity: 'info',
      eventName: 'crib-presentation-reset-on-identity-advance',
      payload,
    });
  }, [authIdentity?.roundId, authIdentity?.handNumber, authIdentity?.dealerGameId, gameId]);

  useEffect(() => {
    cribbageStateRef.current = cribbageState;
  }, [cribbageState]);

  // ── Sync Framework ──────────────────────────────────────────
  // Provides three-layer state management: authoritative, optimistic, presentation.
  // Wiring `identity` lets the framework auto-reset on forward advancement and
  // expose `interactionsAllowed` / `isIdentityStale` for action gating.
  const syncHandle = useGameStateSync<CribbageState | null>(null, {
    getProgress: (state) => getCribbageProgress(state, currentHandNumber),
    debugLabel: 'Cribbage',
    gameType: 'cribbage',
    describeState: (state) => state ? cribbageStateSummary(state) : null,
    optimisticTimeoutMs: 3000,
    identity: authIdentity,
  });

  // The state the UI should render — presentation state from the sync framework
  const viewState = syncHandle.presentationState;
  // For action legality checks and rendering, use effective state (optimistic ?? authoritative)
  const effectiveState = syncHandle.effectiveState;

  // Debug logging context
  const debugCtx = useMemo<CribbageDebugContext>(() => ({
    gameId,
    roundId: currentRoundId,
    userId: currentUserId,
    handNumber: currentHandNumber,
  }), [gameId, currentRoundId, currentUserId, currentHandNumber]);

  // High card dealer selection state - only for first hand
  const [showHighCardSelection, setShowHighCardSelection] = useState(false);
  // Phase F.2: announcement string state retired — dealer-selection messaging is canonical-only.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const hasInitializedRef = useRef(false);

  // DB-synced high-card selection state (so all clients see the same deal)
  const [highCardSyncedState, setHighCardSyncedState] = useState<DealerSelectionState | null>(null);
  const [highCardCards, setHighCardCards] = useState<DealerSelectionCard[]>([]);
  const [highCardWinnerPosition, setHighCardWinnerPosition] = useState<number | null>(null);

  // When in external dealer selection mode (cribbage_dealer_selection status), use external props
  // Parent (Game.tsx) clears these at the handoff point so no stale session-level cards leak
  const effectiveShowHighCardSelection = isDealerSelection || showHighCardSelection;

  // Wartime: emit DealerSelection player-visual snapshots so the
  // cross-surface diff (WaitingTable → NeutralInterstitial → DealerSelection)
  // captures chip-renderer / anchor / rect deltas for the SAME playerId
  // as it traverses surfaces. Deferred to rAF so the chip DOM is settled.
  useEffect(() => {
    if (!effectiveShowHighCardSelection) return;
    if (typeof window === 'undefined') return;
    const raf = window.requestAnimationFrame(() => {
      for (const player of players) {
        // Read providerInstanceId from the rendered cluster root so the
        // cross-surface diff (Waiting → Interstitial → DealerSelection)
        // can prove provider continuity instead of always reporting null.
        const clusterEl = document.querySelector(
          `[data-canonical-seat-cluster][data-seat-position="${player.position}"]`,
        ) as HTMLElement | null;
        const providerInstanceId =
          clusterEl?.getAttribute('data-provider-instance') || null;
        recordPlayerVisualSnapshot({
          surface: 'DealerSelection',
          playerId: player.id,
          userId: player.user_id,
          position: player.position,
          logicalSeat: player.position,
          renderedSeatSlot: null,
          seatAnchorSource: 'CribbageMobileGameTable.SeatAnchorLayer (LOCAL)',
          anchorProviderInstanceId: providerInstanceId,
          chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
          chipRenderer: 'CanonicalSeatCluster',
          chipStyleSource: 'derivePlayerStatus → status palette',
          chipVariant: 'dealer-selection',
          chipValue: null,
          status: null,
          projectionMode: null,
          isViewerSelf: player.user_id === currentUserId,
          isSuppressed: false,
          suppressionReason: null,
          ...probeChipDom(player.position),
          domAncestry: probeChipDomAncestry(player.position),
        });
      }
    });
    return () => { try { window.cancelAnimationFrame(raf); } catch { /* noop */ } };
  }, [effectiveShowHighCardSelection, players, currentUserId]);

  // ── HANDOFF TRACE #9: dealer-game showHighCardSelection changes ──
  const prevShowHCRef = useRef(showHighCardSelection);
  const prevIsDSRef = useRef(isDealerSelection);
  if (prevShowHCRef.current !== showHighCardSelection || prevIsDSRef.current !== isDealerSelection) {
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'child_hc_visibility_change',
      userId: currentUserId,
      roundId: currentRoundId || null,
      context: {
        showHighCardSelection,
        prevShowHighCardSelection: prevShowHCRef.current,
        isDealerSelection,
        prevIsDealerSelection: prevIsDSRef.current,
        effectiveShowHighCardSelection,
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        externalCardCount: externalDealerSelectionCards?.length ?? 0,
        localCardCount: highCardCards.length,
        initialLoadComplete,
        renderHandKey: '(deferred)',
      },
    });
    prevShowHCRef.current = showHighCardSelection;
    prevIsDSRef.current = isDealerSelection;
  }

  const effectiveHighCardCards = isDealerSelection ? (externalDealerSelectionCards || []) : highCardCards;
  const effectiveHighCardWinnerPosition = isDealerSelection ? externalDealerSelectionWinnerPosition : highCardWinnerPosition;

  // ── Phase C: canonical dealer-selection announcements ────────────────────
  // Derive (cohort, tie) from the authoritative card stream:
  //   cohort = max(card.roundNumber) - 1 (0-indexed: 0 = first attempt)
  //   tie    = current cohort has multiple top-rank cards still un-dimmed
  //            and no winner has resolved.
  // Identity-stable id keeps the ambient announcement deduped per cohort.
  const dealerSelectionCohortDerived = useMemo(() => {
    if (effectiveHighCardCards.length === 0) return 0;
    let maxRound = 1;
    for (const c of effectiveHighCardCards) {
      if (c.roundNumber > maxRound) maxRound = c.roundNumber;
    }
    return Math.max(0, maxRound - 1);
  }, [effectiveHighCardCards]);

  // Tie is only true when an actual tie was determined in a prior cohort
  // (cohort > 0 means a redraw was triggered) AND no winner is resolved yet.
  // Deriving from `!isDimmed` during the deal window incorrectly flagged
  // every freshly-dealt first cohort as a tie until the 700ms determination
  // pass dimmed losers — producing a phantom "Tie — redrawing" flicker on
  // every match start (and very visibly on Cribbage→Cribbage replay).
  const dealerSelectionTieDerived = useMemo(() => {
    if (effectiveHighCardWinnerPosition !== null) return false;
    return dealerSelectionCohortDerived > 0;
  }, [effectiveHighCardWinnerPosition, dealerSelectionCohortDerived]);


  const announcements = useAnnouncements();
  const announcedDealerResolvedRef = useRef<string | null>(null);
  const lastHighCardAmbientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    // Ambient: only while in high-card mode AND dealer not yet resolved
    // AND we have NOT already announced resolution for this dealer-game.
    //
    // Sequencing fix: after `handleCribbageDealerSelectionComplete`
    // clears externalDealerSelectionCards / externalDealerSelectionWinnerPosition,
    // `game.status` may still be `cribbage_dealer_selection` for a frame.
    // Without the latch below, the effect re-detects
    // `effectiveShowHighCardSelection=true` + `winner=null` and re-emits
    // the in-progress ambient — producing the duplicate "Selecting next
    // dealer" plate. The `announcedDealerResolvedRef` latch (cleared on
    // dealerGameId boundary + when high-card mode exits) prevents this.
    if (
      effectiveShowHighCardSelection &&
      effectiveHighCardWinnerPosition === null &&
      announcedDealerResolvedRef.current === null
    ) {
      const id = `${gameId}:dealer-selection:${dealerSelectionCohortDerived}`;
      lastHighCardAmbientIdRef.current = id;
      announcements.emit({
        id,
        type: 'dealer_selection_in_progress',
        scope: { dealerGameId: gameId },
        payload: {
          cohort: dealerSelectionCohortDerived,
          tie: dealerSelectionTieDerived,
        },
      });
      return;
    }
    // Out of high-card mode → tear down ONLY the ambient we emitted.
    // Scoped dismiss prevents clobbering ambient owned by other effects
    // (bootstrap awaiting_ante, waiting_for_player, cta_prompt).
    if (!effectiveShowHighCardSelection) {
      if (lastHighCardAmbientIdRef.current) {
        announcements.dismiss(lastHighCardAmbientIdRef.current);
        lastHighCardAmbientIdRef.current = null;
      }
      announcedDealerResolvedRef.current = null;
      return;
    }
    // High-card mode AND winner resolved: emit transient `dealer_selected`
    // exactly once per (gameId, cohort, winnerPosition).
    if (effectiveHighCardWinnerPosition !== null) {
      const winnerPlayer = players.find((p) => p.position === effectiveHighCardWinnerPosition);
      if (!winnerPlayer) return;
      const winnerCard = effectiveHighCardCards
        .filter((c) => c.position === effectiveHighCardWinnerPosition && !c.isDimmed)
        .slice(-1)[0];
      const cardLabel = winnerCard
        ? `${winnerCard.card.rank}${winnerCard.card.suit}`
        : '';
      const id = `${gameId}:dealer-selected:${dealerSelectionCohortDerived}:${effectiveHighCardWinnerPosition}`;
      if (announcedDealerResolvedRef.current === id) return;
      announcedDealerResolvedRef.current = id;
      // Scoped dismiss of our own in-progress ambient so the transient
      // cleanly supersedes the "Selecting next dealer" plate without
      // wiping ambient owned by adjacent effects.
      if (lastHighCardAmbientIdRef.current) {
        announcements.dismiss(lastHighCardAmbientIdRef.current);
        lastHighCardAmbientIdRef.current = null;
      }
      announcements.emit({
        id,
        type: 'dealer_selected',
        scope: { dealerGameId: gameId },
        payload: {
          dealerName: getDisplayName(
            players,
            winnerPlayer,
            winnerPlayer.profiles?.username || `Seat ${effectiveHighCardWinnerPosition}`,
          ),
          cardLabel,
        },
      });
      // Tracer: dealer-selection lifecycle — Cribbage announcement published.
      import('@/lib/dealerSelectionDiag').then(({ recordDealerSelectionDiag }) => {
        recordDealerSelectionDiag('dealer_selection_announcement_published', {
          sessionId: gameId,
          dealerSelectionId: `${gameId}:host`,
          winnerPosition: effectiveHighCardWinnerPosition,
          cardCount: effectiveHighCardCards.length,
          scope: 'cribbage',
          extra: { announcementId: id, cardLabel, cohort: dealerSelectionCohortDerived },
        });
      });
    }
  }, [
    gameId,
    effectiveShowHighCardSelection,
    effectiveHighCardWinnerPosition,
    dealerSelectionCohortDerived,
    dealerSelectionTieDerived,
    effectiveHighCardCards,
    players,
    announcements,
  ]);

  // (Phase 2 bootstrap-lifecycle ambient effect is declared further
  // below, after isBootstrapMode / shouldShowAwaitingAnteAnnouncement /
  // shouldShowPreparingNextHand are derived.)


  // ────────────────────────────────────────────────────────────────────────
  // Phase D / Step 3 — passive ambient + actor-scoped CTA lifecycle
  //
  // Emits canonical rail events for Cribbage discarding and pegging:
  //
  //   • Seated actor pre-discard       → `cta_prompt` ("Discard to Crib")
  //   • Seated viewer post-discard     → `waiting_for_player`
  //   • Observer during discarding     → `waiting_for_player`
  //   • Seated viewer, not pegging turn→ `waiting_for_player`
  //   • Observer during pegging        → `waiting_for_player`
  //
  // Strict actor-visibility discipline:
  //   - `cta_prompt` is ONLY emitted from the actor's own client and
  //     carries payload.actorUserId for defense-in-depth rail gating.
  //   - Observers and opponents never emit cta_prompt; they see the
  //     companion `waiting_for_player` ambient instead.
  //
  // Semantic-state driven, NOT render-driven:
  //   • Derives from authoritative phase + turn ownership
  //   • Stable id per (dealerGameId, handNumber, kind, targetUserId)
  //     so re-emits are identity-stable refreshes (no flicker)
  //   • Self-scoped teardown via lastRailIdRef — does not clobber
  //     ambient owned by other effects (e.g. dealer-selection,
  //     bootstrap-lifecycle)
  //   • Skipped during high-card mode, counting, complete, and result
  //     UI — those have dedicated overlays / transient announcements
  // ────────────────────────────────────────────────────────────────────────
  const lastWaitingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId) return;
    // Defer to dealer-selection ambient effect.
    if (effectiveShowHighCardSelection) return;

    // Source: presentation state when available (matches what the user
    // actually sees); fall back to authoritative only for first-frame
    // bootstrap before sync presentation lands.
    const semanticState: CribbageState | null = (viewState as CribbageState | null) ?? cribbageState;
    if (!semanticState) {
      if (lastWaitingIdRef.current) {
        announcements.dismiss(lastWaitingIdRef.current);
        lastWaitingIdRef.current = null;
      }
      return;
    }

    const phase = semanticState.phase;
    // Phases that own their own UI: don't emit waiting ambient.
    if (
      phase === 'dealer-select' ||
      phase === 'dealing' ||
      phase === 'cutting' ||
      phase === 'counting' ||
      phase === 'complete'
    ) {
      if (lastWaitingIdRef.current) {
        announcements.dismiss(lastWaitingIdRef.current);
        lastWaitingIdRef.current = null;
      }
      return;
    }

    const me = players.find((p) => p.user_id === currentUserId);
    const myPlayerId = me?.id ?? null;
    const isObserverViewer = !myPlayerId;

    // Resolved rail intent. One of:
    //   { kind: 'awaiting_discards', pending, total } — shared phase state
    //   { kind: 'waiting', targetPlayerId, context }  — observer/opponent
    let intent:
      | { kind: 'awaiting_discards'; pending: number; total: number }
      | { kind: 'waiting'; targetPlayerId: string; context?: string }
      | null = null;

    if (phase === 'discarding') {
      const playerCount = players.filter((p) => !p.sitting_out).length || players.length;
      const required = DISCARD_COUNT[playerCount] ?? 2;
      const order = semanticState.turnOrder ?? Object.keys(semanticState.playerStates ?? {});

      // "Discarding" is a SHARED game phase, not a private actor CTA.
      // Both the actor and observers see the same lifecycle rail plate
      // ("Waiting on Discards"). The per-actor primary action button
      // ("Send to Crib") provides the actor's interaction affordance.
      const pendingCount = order.reduce((acc, pid) => {
        const ps = semanticState.playerStates?.[pid];
        const done = ps?.discardedToCrib?.length ?? 0;
        return acc + (done < required ? 1 : 0);
      }, 0);
      if (pendingCount > 0) {
        intent = { kind: 'awaiting_discards', pending: pendingCount, total: order.length };
      }
    } else if (phase === 'pegging') {
      const turnId = semanticState.pegging?.currentTurnPlayerId ?? null;
      if (!turnId) {
        intent = null;
      } else if (!isObserverViewer && turnId === myPlayerId) {
        // Seated player on their pegging turn: the cards-tab interactive
        // UI owns the moment. Pegging CTA migration is deferred (Step 3
        // explicitly excludes pegging notices).
        intent = null;
      } else {
        intent = { kind: 'waiting', targetPlayerId: turnId, context: 'playing a card' };
      }
    }

    if (!intent) {
      if (lastWaitingIdRef.current) {
        announcements.dismiss(lastWaitingIdRef.current);
        lastWaitingIdRef.current = null;
      }
      return;
    }

    if (intent.kind === 'awaiting_discards') {
      const id = `${gameId}:${dealerGameId ?? 'no-dg'}:${currentHandNumber}:awaiting_discards`;
      if (lastWaitingIdRef.current === id) return;
      lastWaitingIdRef.current = id;
      announcements.emit({
        id,
        type: 'awaiting_discards',
        scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
        payload: { pending: intent.pending, total: intent.total },
      });
      return;
    }


    // waiting
    const targetPlayer = players.find((p) => p.id === intent.targetPlayerId);
    if (!targetPlayer) {
      if (lastWaitingIdRef.current) {
        announcements.dismiss(lastWaitingIdRef.current);
        lastWaitingIdRef.current = null;
      }
      return;
    }
    const playerName = getDisplayName(
      players,
      targetPlayer,
      targetPlayer.profiles?.username || 'opponent',
    );
    const kindKey = phase === 'discarding' ? 'discard' : 'peg';
    const id = `${gameId}:${dealerGameId ?? 'no-dg'}:${currentHandNumber}:waiting:${kindKey}:${intent.targetPlayerId}`;
    if (lastWaitingIdRef.current === id) return;
    lastWaitingIdRef.current = id;
    announcements.emit({
      id,
      type: 'waiting_for_player',
      scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
      payload: { playerName, context: intent.context },
    });
  }, [
    gameId,
    dealerGameId,
    currentRoundId,
    currentHandNumber,
    effectiveShowHighCardSelection,
    viewState,
    cribbageState,
    players,
    currentUserId,
    announcements,
  ]);



  // ── BUG-A TRACE: correlation id for session→dealer-game transition ──
  const hcTransitionIdRef = useRef<string>(crypto.randomUUID().slice(0, 8));
  // Rotate correlation id when isDealerSelection flips (observation only)
  const prevIsDSForTraceRef = useRef(isDealerSelection);
  if (prevIsDSForTraceRef.current !== isDealerSelection) {
    hcTransitionIdRef.current = crypto.randomUUID().slice(0, 8);
    prevIsDSForTraceRef.current = isDealerSelection;
  }

  // Track hand key to detect hand transitions and prevent stale card flash
  const currentHandKey = useMemo(() => getHandKey(cribbageState), [cribbageState]);
  // Render-specific hand key: derived from sync presentation state (what UI actually shows)
  const renderHandKey = useMemo(() => getHandKey(viewState), [viewState]);
  // ── Action identity guard ──
  // A user-driven mutation (discard / play / Go) may only fire when the rendered
  // hand identity matches the authoritative actionable hand identity end-to-end:
  //   • renderHandKey === currentHandKey  → presentation matches local authoritative
  //   • currentRoundId === roundId        → local round matches latest prop round
  //   • currentHandNumber === handNumber  → local hand-number matches latest prop
  //   • renderHandKey !== ''              → there IS a hand to act on
  // If ANY of these fail we are looking at a STALE hand (either presentation lag
  // or a hand boundary in flight) and must suppress every action writer.
  const interactionsAllowed = !!(
    renderHandKey &&
    currentHandKey &&
    renderHandKey === currentHandKey &&
    currentRoundId &&
    roundId &&
    currentRoundId === roundId &&
    currentHandNumber === handNumber
  );
  const interactionsAllowedRef = useRef(interactionsAllowed);
  useEffect(() => {
    interactionsAllowedRef.current = interactionsAllowed;
  }, [interactionsAllowed]);
  // Framework-level gate (independent of local identity check) — kept as a
  // ref so writer callbacks can read it synchronously.
  const frameworkInteractionsAllowedRef = useRef(syncHandle.interactionsAllowed);
  useEffect(() => {
    frameworkInteractionsAllowedRef.current = syncHandle.interactionsAllowed;
  }, [syncHandle.interactionsAllowed]);

  // ── Phase 2 hardening: centralized identity refs for sync access ─────────
  // All writer / snapshot / divergence checks read these refs synchronously.
  const authIdentityRef = useRef<AuthoritativeIdentity | null>(authIdentity);
  useEffect(() => { authIdentityRef.current = authIdentity; }, [
    authIdentity?.roundId,
    authIdentity?.handNumber,
    authIdentity?.dealerGameId,
  ]);
  const presentationIdentityRef = useRef(syncHandle.presentationIdentity);
  useEffect(() => { presentationIdentityRef.current = syncHandle.presentationIdentity; }, [
    syncHandle.presentationIdentity?.roundId,
    syncHandle.presentationIdentity?.handNumber,
  ]);

  /**
   * Centralized writer-side identity invariant.
   *
   * PRECEDENCE (canonical source order):
   *   1. authIdentity   — authoritative; wins all ties
   *   2. snapshotIdentity (=currentRoundId for cribbage) — must match auth
   *   3. propIdentity (parent roundId/handNumber) — may lag but cannot unlock writes
   *   4. mirrorIdentity (local cribbageState) — may lag but cannot unlock writes
   *   5. presentationIdentity — may lag only as non-interactive placeholder
   *   6. writerIdentity (currentRoundId/currentHandNumber) — must equal auth at write time
   *
   * Returns ok=true ONLY if every layer is aligned. Otherwise returns a structured
   * divergence payload suitable for `crib-action-suppressed-stale-identity` events.
   */
  const evaluateWriterIdentity = useCallback((action: string) => {
    const auth = authIdentityRef.current;
    const pres = presentationIdentityRef.current;
    const divergence: Record<string, unknown> = {
      action,
      authIdentity: auth ? { roundId: auth.roundId?.slice(0, 8), hand: auth.handNumber } : null,
      snapshotIdentity: currentRoundId?.slice(0, 8) ?? null,
      propIdentity: { roundId: roundId?.slice(0, 8), hand: handNumber },
      mirrorIdentity: { handKey: currentHandKey?.slice(0, 30) ?? null },
      presentationIdentity: pres ? { roundId: pres.roundId?.slice(0, 8), hand: pres.handNumber } : null,
      writerIdentity: { roundId: currentRoundId?.slice(0, 8), hand: currentHandNumber },
      renderHandKey: renderHandKey?.slice(0, 30) ?? null,
      frameworkInteractionsAllowed: frameworkInteractionsAllowedRef.current,
      localInteractionsAllowed: interactionsAllowedRef.current,
    };

    if (!interactionsAllowedRef.current) {
      return { ok: false, reason: 'local-identity-misaligned', divergence };
    }
    if (!frameworkInteractionsAllowedRef.current) {
      return { ok: false, reason: 'framework-identity-stale-or-frozen', divergence };
    }
    if (auth && currentRoundId && auth.roundId && auth.roundId !== currentRoundId) {
      return { ok: false, reason: 'writer-vs-auth-roundid-mismatch', divergence };
    }
    if (auth && typeof auth.handNumber === 'number' && auth.handNumber !== currentHandNumber) {
      return { ok: false, reason: 'writer-vs-auth-hand-mismatch', divergence };
    }
    if (pres && auth && pres.roundId && auth.roundId && pres.roundId !== auth.roundId) {
      return { ok: false, reason: 'presentation-vs-auth-mismatch', divergence };
    }
    return { ok: true as const, reason: 'aligned', divergence };
  }, [
    currentRoundId, currentHandNumber, currentHandKey, renderHandKey, roundId, handNumber,
  ]);

  // ── Identity divergence observer ──
  // Fires `crib-identity-divergence` (throttled per-identity-signature) whenever
  // the six identity sources disagree in a way that is NOT a normal lag-window.
  const lastDivergenceSigRef = useRef<string>('');
  useEffect(() => {
    const auth = authIdentity;
    if (!auth) return; // not hydrated yet — expected silent state
    const pres = syncHandle.presentationIdentity;

    const propMatches = roundId === auth.roundId && handNumber === auth.handNumber;
    const writerMatches = currentRoundId === auth.roundId && currentHandNumber === auth.handNumber;
    const presMatches = !pres || (pres.roundId === auth.roundId && pres.handNumber === auth.handNumber);
    const mirror = cribbageStateRef.current;
    // Mirror is acceptable when null (cleared on identity advance) or when its
    // hand_key dealer matches auth (we can't directly compare roundId since the
    // mirror has no roundId field — the snapshot channel guards that for us).
    const mirrorOk = mirror === null || mirror.dealerPlayerId !== undefined;

    if (propMatches && writerMatches && presMatches && mirrorOk) return;

    const sig = [
      auth.roundId?.slice(0, 8), auth.handNumber,
      roundId?.slice(0, 8), handNumber,
      currentRoundId?.slice(0, 8), currentHandNumber,
      pres?.roundId?.slice(0, 8), pres?.handNumber,
      mirror === null ? 'null' : 'has-mirror',
    ].join('|');
    if (sig === lastDivergenceSigRef.current) return;
    lastDivergenceSigRef.current = sig;

    const reason =
      !writerMatches ? 'writer-lag-vs-auth' :
      !propMatches ? 'prop-lag-vs-auth' :
      !presMatches ? 'presentation-lag-vs-auth' :
      'mirror-divergence';

    try {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: auth.handNumber ?? null,
        roundId: auth.roundId ?? null,
        eventType: 'invariant',
        severity: reason === 'prop-lag-vs-auth' || reason === 'writer-lag-vs-auth' ? 'info' : 'warn',
        eventName: 'crib-identity-divergence',
        payload: {
          reason,
          phase: cribbageStateRef.current?.phase ?? null,
          authIdentity: { roundId: auth.roundId?.slice(0, 8) ?? null, hand: auth.handNumber },
          snapshotIdentity: currentRoundId?.slice(0, 8) ?? null,
          propIdentity: { roundId: roundId?.slice(0, 8), hand: handNumber },
          mirrorIdentity: mirror === null ? null : { dealerPlayerId: mirror.dealerPlayerId?.slice(0, 8) },
          presentationIdentity: pres ? { roundId: pres.roundId?.slice(0, 8) ?? null, hand: pres.handNumber } : null,
          writerIdentity: { roundId: currentRoundId?.slice(0, 8), hand: currentHandNumber },
        },
      });
    } catch { /* safe */ }
  }, [
    authIdentity?.roundId, authIdentity?.handNumber,
    roundId, handNumber,
    currentRoundId, currentHandNumber,
    syncHandle.presentationIdentity?.roundId,
    syncHandle.presentationIdentity?.handNumber,
    gameId,
  ]);
  const lastHandKeyRef = useRef<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);
   // Bug B fix: instead of blanking the table during hand transitions, freeze the last-good
   // presentation state and only swap when the first new-hand snapshot arrives.
   const transitionFrozenRef = useRef(false);
   // Track which roundId the freeze was initiated FOR, so we only unfreeze
   // when a snapshot matching the NEW round identity arrives — not a stale tail-end snapshot.
   const transitionFrozenForRoundRef = useRef<string | null>(null);

  // Counting phase announcement state (propagated from CribbageCountingPhase)
  const [countingAnnouncement, setCountingAnnouncement] = useState<string | null>(null);
  const [countingTargetLabel, setCountingTargetLabel] = useState<string | null>(null);
  
  // Counting phase animated scores - peg board reads these instead of final scores
  const [countingScoreOverrides, setCountingScoreOverrides] = useState<Record<string, number> | null>(null);

  // IMPORTANT: Keep a stable baseline for the counting animation.
  // If the counting overlay ever remounts/re-inits, it must start from the pegging baseline
  // (not from the already-animated overrides), otherwise scores can double.
  const countingBaselineScoresRef = useRef<Record<string, number> | null>(null);
  // Stable id for the currently-animated counting instance (latched when counting begins).
  // Used ONLY for dedupe (already-fired guards). NEVER for cross-client identity validation.
  const countingHandKeyRef = useRef<string | null>(null);
  // AUTHORITATIVE identity for the counting instance. All writes / win triggers / delayed
  // callbacks must validate against this. Reconstructed handKeys are NOT trusted because
  // they can collide across hands when cutCard happens to match.
  const countingIdentityRef = useRef<{ roundId: string; handNumber: number } | null>(null);

  // Cache the latest pegging-phase scores so counting can always start from the true pre-count baseline
  // even if the DB state already contains post-count totals or has incomplete playedCards data.
  const lastPeggingScoresRef = useRef<Record<string, number> | null>(null);
  
  // Delay before showing counting phase to allow final pegging announcement to display
  const [countingDelayActive, setCountingDelayActive] = useState(false);
  const countingDelayFiredRef = useRef<string | null>(null);
  
  // Ref to track if counting animation is active - used by realtime handler to avoid stale closure
  const countingAnimationActiveRef = useRef(false);
  
  // REPLAY GUARD: Tracks handKeys for which counting has COMPLETED (animation finished).
  // This ref is NEVER cleared on hand boundary resets — it accumulates across hands.
  // Prevents the counting init effect from replaying for a hand that already finished counting,
  // even if roundId change clears all other guards.
  const countingCompletedHandKeysRef = useRef<Set<string>>(new Set());
  const awaitingAnteAnnouncementConsumedRef = useRef<Set<string>>(new Set());
  const nextHandInitConsumedRef = useRef<Set<string>>(new Set());
  const preparingNextHandEnterConsumedRef = useRef<Set<string>>(new Set());
  const flyawayAnimationConsumedRef = useRef<Set<string>>(new Set());
  const cribCutReplayConsumedRef = useRef<Set<string>>(new Set());
  const wrongInitBranchLoggedRef = useRef<Set<string>>(new Set());
  const awaitingAnteAnnouncementCountRef = useRef<Map<string, number>>(new Map());
  const nextHandInitCountRef = useRef<Map<string, number>>(new Map());
  const preparingNextHandEnterCountRef = useRef<Map<string, number>>(new Map());
  const animationReplayCountRef = useRef<Map<string, number>>(new Map());
  const preparingNextHandActiveKeyRef = useRef<string | null>(null);
  
  // Store the cribbage state snapshot used for counting animation - this prevents the animation
  // from disappearing when DB phase transitions to 'complete' during counting
  const [countingStateSnapshot, setCountingStateSnapshot] = useState<CribbageState | null>(null);
  
  // Signal to counting phase to freeze when win is detected reactively via score subscription
  const [countingWinFrozen, setCountingWinFrozen] = useState(false);

  // Forward-only lifecycle latch: true after counting completes but before next hand arrives.
  // Prevents banner from reverting to "Scoring hands..." during the transition gap.
  const [postCountingTransitionActive, setPostCountingTransitionActive] = useState(false);

  // If another client advances the hand while we are still animating counting, immediately
  // cancel the local counting overlay so it can't complete and write stale state into the NEW round.
  const lastRoundPropsRef = useRef<{ roundId: string; handNumber: number } | null>(null);
  useEffect(() => {
    const prev = lastRoundPropsRef.current;
    lastRoundPropsRef.current = { roundId, handNumber };

    if (!prev) return;
    const changed = prev.roundId !== roundId || prev.handNumber !== handNumber;
    if (!changed) return;
    if (!countingStateSnapshot) return;

    console.log('[CRIBBAGE] Round props changed during counting; cancelling counting snapshot', {
      prev,
      next: { roundId, handNumber },
    });

    // IMPORTANT: Keep the counting "init" latch ON.
    // If we set this to false here, the counting init effect can re-run with a NEW
    // (roundId/handNumber)-driven key while still holding the OLD counting state in refs,
    // causing the entire scoring sequence to restart a second time.
    countingAnimationActiveRef.current = true;
    setCountingDelayActive(false);
    setCountingWinFrozen(false);
    setCountingStateSnapshot(null);
    setPostCountingTransitionActive(false);
    // CRITICAL: Unfreeze presentation so the new-hand snapshot flows through.
    // Without this, the frozen client stays stuck on the old hand indefinitely.
    syncHandle.unfreezePresentation();
  }, [roundId, handNumber, countingStateSnapshot]);

  // Reset counting latches ONLY after we've truly left the counting context.
  // This prevents a multi-client prop update during counting from allowing the init effect
  // to re-snapshot stale counting state and replay the scoring sequence.
  useEffect(() => {
    if (!cribbageState) return;

    const isCountingContext =
      cribbageState.phase === 'counting' ||
      (cribbageState.phase === 'complete' && Boolean(cribbageState.lastHandCount));

    if (isCountingContext) return;

    countingAnimationActiveRef.current = false;
    countingDelayFiredRef.current = null;
    countingBaselineScoresRef.current = null;
    countingHandKeyRef.current = null;
    countingIdentityRef.current = null;
    countingIdentityRef.current = null;
    setPostCountingTransitionActive(false);
  }, [cribbageState?.phase, cribbageState?.lastHandCount ? 'has-count' : 'no-count']);

  // ── Win sequence state (declared early so instrumentation can reference it) ─
  type WinSequencePhase = 'idle' | 'skunk' | 'announcement' | 'chips' | 'complete';
  const [winSequencePhase, setWinSequencePhase] = useState<WinSequencePhase>('idle');
  const [winSequenceData, setWinSequenceData] = useState<{
    winnerId: string;
    winnerName: string;
    handNumber: number;
    multiplier: number;
    amountPerLoser: number;
    totalWinnings: number;
    loserIds: string[];
    chatMessage?: string;
  } | null>(null);

  // ── Terminal-path discriminator ─
  // Explicitly tags which terminal trigger path produced the win, so the felt
  // can choose the correct card layout instead of inferring from `!lastHandCount`
  // (which is ambiguous: both a pegging win AND a reactive counting-frozen win
  // present as `phase='complete' && !lastHandCount`).
  type CribbageTerminalPath = 'pegging' | 'counting' | 'hand-counting' | 'crib-counting' | 'fallback';
  const [terminalPath, setTerminalPath] = useState<CribbageTerminalPath | null>(null);

  // ── Sync invariant checks (wired to the ACTUAL rendered mobile state) ─
  const cribMobileInvariantScoringFiredRef = useRef<string | null>(null);
  const cribMobileResultDisplayFiredRef = useRef<string | null>(null);
  const activeInstrumentationState = useMemo(() => {
    // Counting UI is rendered from the latched snapshot, not from the frozen presentation state.
    if (countingStateSnapshot && !countingDelayActive) return countingStateSnapshot;
    // End-of-game result UI is driven by the win sequence, which is triggered from authoritative state.
    if (winSequencePhase !== 'idle' && cribbageState) return cribbageState;
    // Default gameplay path renders from the sync framework presentation state.
    return viewState ?? cribbageState;
  }, [countingStateSnapshot, countingDelayActive, winSequencePhase, viewState, cribbageState]);

  useEffect(() => {
    const state = activeInstrumentationState;
    if (!state) return;

    const showingCountingOverlay = Boolean(countingStateSnapshot && !countingDelayActive);
    const showingResultUi = Boolean(
      winSequenceData ||
      winSequencePhase !== 'idle' ||
      (state.phase === 'complete' && state.winnerPlayerId)
    );

    // Compute isSnapshotPhase early — used by multiple invariants
    const isSnapshotPhase = Boolean(countingStateSnapshot && !countingDelayActive) || winSequencePhase !== 'idle';

    // INV-4: regressive-identity
    checkRegressiveIdentity(gameId, dealerGameId, currentHandNumber);

    // INV-5: hand-reversion — detect presentation hand returning to 6 cards after discard
    const instrPlayer = players.find(p => p.user_id === currentUserId);
    if (instrPlayer && !isSnapshotPhase) {
      const authState = cribbageState?.playerStates?.[instrPlayer.id];
      const presState = state.playerStates?.[instrPlayer.id];
      if (authState && presState) {
        const toCardId = (c: { rank: string; suit: string }) => `${c.rank}${c.suit}`;
        checkCribbageHandReversion({
          gameId,
          handNumber: currentHandNumber,
          authoritativeHandSize: authState.hand?.length ?? 0,
          presentationHandSize: presState.hand?.length ?? 0,
          authoritativeCardIds: (authState.hand ?? []).map(toCardId),
          presentationCardIds: (presState.hand ?? []).map(toCardId),
          progressVector: null,
          source: viewState ? 'sync-presentation' : 'authoritative-fallback',
          roundId: currentRoundId || undefined,
          dealerGameId: dealerGameId || undefined,
        });
      }
    }

    // INV-6: score-reversion — detect presentation score decreasing
    const presentationScores: Record<string, number> = {};
    const authoritativeScores: Record<string, number> = {};
    for (const [pid, ps] of Object.entries(state.playerStates ?? {})) {
      presentationScores[pid] = ps.pegScore ?? 0;
    }
    if (cribbageState) {
      for (const [pid, ps] of Object.entries(cribbageState.playerStates ?? {})) {
        authoritativeScores[pid] = ps.pegScore ?? 0;
      }
    }
    const scoreSource = countingScoreOverrides ? 'counting-overrides' : countingStateSnapshot ? 'counting-snapshot' : viewState ? 'sync-presentation' : 'authoritative-fallback';
    checkCribbageScoreReversion(
      gameId,
      currentHandNumber,
      presentationScores,
      authoritativeScores,
      scoreSource,
      currentRoundId || undefined,
      dealerGameId || undefined,
    );

    // Presentation source trace — track when hand/score sources change

    // INV-1: stale-dealer-game-render
    if (renderHandKey && currentHandKey && !isSnapshotPhase) {
      checkStaleDealerGameRender(gameId, renderHandKey, currentHandKey, currentHandNumber);
    }

    // INV-2: phase-render-mismatch
    if (showingResultUi) {
      checkCribbagePhaseRenderMismatch(gameId, currentHandNumber, 'complete', 'result');
    } else if (showingCountingOverlay || state.phase === 'counting') {
      checkCribbagePhaseRenderMismatch(gameId, currentHandNumber, 'counting', 'scoring');
    } else if (state.phase === 'discarding' || state.phase === 'cutting' || state.phase === 'pegging') {
      checkCribbagePhaseRenderMismatch(gameId, currentHandNumber, state.phase, 'input');
    }

    // INV-7: tap-failure — detect when cards should be tappable but interaction is blocked
    if (!isSnapshotPhase && instrPlayer) {
      const myState = state.playerStates?.[instrPlayer.id];
      const isMyPeggingTurn = state.pegging?.currentTurnPlayerId === instrPlayer.id;
      const hasPlayable = myState?.hand ? myState.hand.some(
        (c: CribbageCard) => {
          const val = c.rank === 'A' ? 1 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank);
          return val + (state.pegging?.currentCount ?? 0) <= 31;
        }
      ) : false;
      // Inline check for whether cards tab would be mounted (isGameplayMode is declared later)
      const wouldBeGameplayMode = !effectiveShowHighCardSelection && !isDealerSelection && initialLoadComplete && !!renderHandKey;
      const cardsTabMounted = activeTab === 'cards' && wouldBeGameplayMode && !isTransitioning
        && !countingStateSnapshot && !countingAnimationActiveRef.current
        && renderHandKey === currentHandKey && !!viewState;

      checkCribbageTapFailure({
        gameId,
        handNumber: currentHandNumber,
        roundId: currentRoundId || undefined,
        dealerGameId: dealerGameId || undefined,
        phase: state.phase,
        isMyTurn: isMyPeggingTurn,
        isProcessing,
        canPlayAnyCard: hasPlayable,
        haveDiscarded: (myState?.discardedToCrib?.length ?? 0) > 0,
        cardCount: myState?.hand?.length ?? 0,
        cardsTabMounted,
        extra: {
          renderHandKey: renderHandKey?.slice(0, 30),
          currentHandKey: currentHandKey?.slice(0, 30),
          isTransitioning,
          isFrozen: syncHandle.isFrozen,
          activeTab,
          wouldBeGameplayMode,
        },
      });
    }

    // Debug-gated transition: scoring-start (fire once when counting overlay is actually shown)
    if (showingCountingOverlay || state.phase === 'counting') {
      const scoringKey = `${currentRoundId}:${currentHandNumber}:counting`;
      if (cribMobileInvariantScoringFiredRef.current !== scoringKey) {
        cribMobileInvariantScoringFiredRef.current = scoringKey;
        logCribbageScoringStart(gameId, currentHandNumber, currentRoundId || undefined);
      }
    }

    const visibleWinnerId = winSequenceData?.winnerId ?? state.winnerPlayerId;
    const visibleWinnerScore = visibleWinnerId
      ? (state.playerStates?.[visibleWinnerId]?.pegScore ?? 0)
      : 0;

    // Debug-gated transition: result-display (fire once when the actual result UI is live)
    if (showingResultUi && visibleWinnerId) {
      const resultKey = `${dealerGameId ?? 'no-dealer'}:${currentHandNumber}:${visibleWinnerId}`;
      if (cribMobileResultDisplayFiredRef.current !== resultKey) {
        cribMobileResultDisplayFiredRef.current = resultKey;
        logCribbageResultDisplay(
          gameId,
          currentHandNumber,
          visibleWinnerId,
          visibleWinnerScore,
          currentRoundId || undefined,
        );
      }

      // INV-3: result-render-mismatch
      if (winSequenceData?.handNumber) {
        checkCribbageResultRenderMismatch(gameId, winSequenceData.handNumber, currentHandNumber);
      }
    }
  }, [
    activeInstrumentationState,
    activeTab,
    countingDelayActive,
    countingScoreOverrides,
    countingStateSnapshot,
    cribbageState,
    currentHandKey,
    currentHandNumber,
    currentUserId,
    effectiveShowHighCardSelection,
    isDealerSelection,
    initialLoadComplete,
    isProcessing,
    isTransitioning,
    players,
    currentRoundId,
    dealerGameId,
    gameId,
    renderHandKey,
    syncHandle.isFrozen,
    viewState,
    winSequenceData,
    winSequencePhase,
  ]);

  // Reset cribbage tracking when game changes
  useEffect(() => {
    return () => {
      resetCribbageTracking(gameId);
      resetCribbageReversionTracking(gameId);
    };
  }, [gameId]);

  // Debug-gated transitions: dealer-game-start and hand-start
  const cribMobileDealerGameStartFiredRef = useRef<string | null>(null);
  const cribMobileHandStartFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dealerGameId) return;
    if (cribMobileDealerGameStartFiredRef.current !== dealerGameId) {
      cribMobileDealerGameStartFiredRef.current = dealerGameId;
      logCribbageDealerGameStart(gameId, currentHandNumber, dealerGameId, currentRoundId || undefined);
    }
  }, [dealerGameId, gameId, currentHandNumber, currentRoundId]);

  useEffect(() => {
    if (!cribbageState?.dealerPlayerId) return;
    const handKey = `${currentRoundId}:${currentHandNumber}`;
    if (cribMobileHandStartFiredRef.current !== handKey) {
      cribMobileHandStartFiredRef.current = handKey;
      logCribbageHandStart(gameId, currentHandNumber, cribbageState.dealerPlayerId, currentRoundId || undefined);
    }
  }, [cribbageState?.dealerPlayerId, currentRoundId, currentHandNumber, gameId]);



  // Wave 3B: chipAnimationTriggerId retained only as a trace-id source;
  // no longer drives JSX. Could be deleted once trace consumers update.
  const [chipAnimationTriggerId, setChipAnimationTriggerId] = useState<string | null>(null);
  void chipAnimationTriggerId;
  // Wave 3B: chip transfer geometry / suppression / lifecycle owned by
  // the shell ChipTransport runtime. Game dispatches intents only.
  const { dispatchMany: dispatchChipTransport } = useChipTransport();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const winSequenceFiredRef = useRef<string | null>(null);
  // Prevent double scheduling of the win sequence before the 2s delay fires.
  const winSequenceScheduledRef = useRef<string | null>(null);
  // Source-level guard for skunk overlay to prevent double-firing per animation-trigger pattern.
  // Phase E: skunkOverlayFiredRef retained as a no-op latch sentinel
  // (kept to avoid wider diff; no longer guards bespoke overlay).
  const skunkOverlayFiredRef = useRef<string | null>(null);
  // Source-level guard for chip animation trigger to prevent double-firing
  const chipAnimationFiredRef = useRef<string | null>(null);

  // Source-level guard for starting next hand to prevent double-firing on same client
  const startNextHandFiredRef = useRef<string | null>(null);

  // Sync framework handles optimistic write protection — no manual timestamp needed.

  // Stable guard key + terminal event id.
  //
  // MUST NOT include dealerGameId / current_game_uuid — those flip from
  // <id> → null immediately after match completion (games.current_game_uuid
  // is cleared), which would generate a second distinct key/event id and
  // bypass both the local winSequence guard AND the provider's per-scope
  // dedupe Set (re-firing the celebration overlay).
  //
  // MUST include roundId — without it, every dealer game in the same
  // session that ends with the same winner produces an identical
  // match_win event id, and the provider's session-scoped dedupe bucket
  // (key = `${gameId}::null`, never cleared between dealer games) silently
  // rejects every match_win after the first. roundId is forward-only,
  // identifies the specific winning round, and remains stable across the
  // post-win current_game_uuid/dealerGameId cleanup window.
  const winKeyFor = (winnerId: string) =>
    `${gameId}:${currentRoundId ?? 'no-round'}:${winnerId}`;
  const terminalEventIdFor = useCallback(
    (winnerId?: string | null) =>
      `${gameId}:${currentRoundId ?? 'no-round'}:match_win:${winnerId ?? 'no-winner'}`,
    [gameId, currentRoundId],
  );
  const recordCribDoubleSkunkTrace = useCallback(
    (label: string, detail: Record<string, unknown> = {}) => {
      recordAnnouncementDebugEvent('lifecycle', `CRIBBAGE-DOUBLE-SKUNK-TRACE ${label}`, {
        dealerGameId: dealerGameId ?? null,
        roundId: currentRoundId ?? null,
        handNumber: currentHandNumber,
        winSequenceFiredRef: winSequenceFiredRef.current,
        winSequenceScheduledRef: winSequenceScheduledRef.current,
        ...detail,
      });
    },
    // dealerGameId intentionally omitted: see winKeyFor/terminalEventIdFor comment.
    // Including it would rebuild triggerWinSequence on completion cleanup and
    // re-fire the reactive complete-state effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRoundId, currentHandNumber],
  );

  // Event logging context - uses local tracking for proper hand transitions
  const eventCtx = useCribbageEventContext(currentRoundId, dealerGameId, currentHandNumber);
  
  // Track if we've logged the cut card for this hand
  const cutCardLoggedRef = useRef<string | null>(null);

  const viewStateParticipantIds = viewState
    ? new Set(Object.keys(viewState.playerStates ?? {}))
    : null;
  const isSeatedGamePlayer = useCallback((player: Player) => {
    if (player.status === 'observer' || player.status === 'left') return false;
    if (player.sitting_out || player.waiting) return false;
    return true;
  }, []);
  const activeSeatPlayers = viewStateParticipantIds
    ? players.filter(player => viewStateParticipantIds.has(player.id))
    : players.filter(isSeatedGamePlayer);
  const currentPlayer = activeSeatPlayers.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  // OBSERVER SUPPORT: viewers who are not seated in this dealer game have no
  // currentPlayerId. They must still see the gameplay surface (cards face-down,
  // pegboard, peg sequence). Mirror Gin Rummy's `isObserver = !currentPlayerId`
  // gate so the bootstrap shell does not perpetually swallow observer renders.
  const isObserver = !currentPlayerId;
  const shellAnchors = useRequiredSeatAnchors('cribbage');
  const playerSlotById = useMemo(() => {
    const slotByPosition = shellAnchors
      ? new Map<number, CanonicalSlot | null>(
          shellAnchors.anchors.map(a => [a.position, a.slot]),
        )
      : new Map<number, CanonicalSlot | null>();
    return new Map<string, CanonicalSlot | null>(
      activeSeatPlayers.map(player => [player.id, slotByPosition.get(player.position) ?? null]),
    );
  }, [activeSeatPlayers, shellAnchors]);
  
  // Derive sequenceStartIndex from state - this is authoritative and survives missed realtime updates
  const dbSequenceStartIndex = cribbageState?.pegging?.sequenceStartIndex ?? 0;
  
  // 31 delay: When a player hits 31, we want to hold the cards visible for 2 seconds
  // before they disappear. This is similar to how "last" works with counting delay.
  const [thirtyOneDelayActive, setThirtyOneDelayActive] = useState(false);
  const thirtyOneDelayRef = useRef<string | null>(null);
  // Track the sequence start index BEFORE a 31 reset happens
  const prevSequenceStartIndexRef = useRef<number>(0);
  
  // Pegging announcement auto-clear: hide scoring announcements after 3 seconds
  // (only for pegging phase, not discarding/cutting/counting announcements)
  const [peggingAnnouncementHidden, setPeggingAnnouncementHidden] = useState(false);
  const peggingAnnouncementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPeggingEventIdRef = useRef<string | null>(null);
  
  // Keep tracking the sequence start index - update ONLY when not in delay mode
  // This way we capture the "old" index before the 31 reset, and hold it during the delay
  useEffect(() => {
    if (!thirtyOneDelayActive && dbSequenceStartIndex !== prevSequenceStartIndexRef.current) {
      // Only update if delay is not active - this captures the index BEFORE a reset
      prevSequenceStartIndexRef.current = dbSequenceStartIndex;
    }
  }, [dbSequenceStartIndex, thirtyOneDelayActive]);
  
  // Detect 31 and trigger delay
  useEffect(() => {
    if (!cribbageState) return;
    const lastEvent = cribbageState.lastEvent;
    if (!lastEvent || lastEvent.type !== 'pegging_points') return;
    
    // Check if this is a 31 event by checking the count field
    const is31 = lastEvent.count === 31;
    if (!is31) return;
    
    // Create a unique key for this specific 31 event
    const eventKey = lastEvent.id;
    if (thirtyOneDelayRef.current === eventKey) return;
    thirtyOneDelayRef.current = eventKey;
    
    // The sequence that just completed (0 to dbSequenceStartIndex-1) is what we want to show.
    // The prevSequenceStartIndexRef should still hold the OLD value if we haven't updated it yet.
    // Force keep the old index during delay by not updating prevSequenceStartIndexRef
    
    setThirtyOneDelayActive(true);
    
    const timer = setTimeout(() => {
      setThirtyOneDelayActive(false);
      // After delay, update the ref to match current DB state
      prevSequenceStartIndexRef.current = dbSequenceStartIndex;
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [cribbageState?.lastEvent?.id, cribbageState?.lastEvent?.count]);

  // Clear 31 delay when phase moves away from pegging (e.g. hand ends or new hand starts)
  useEffect(() => {
    if (!cribbageState) return;
    if (cribbageState.phase !== 'pegging') {
      setThirtyOneDelayActive(false);
      thirtyOneDelayRef.current = null;
    }
  }, [cribbageState?.phase]);
  
  // Use the previous (pre-reset) index during 31 delay, otherwise use the DB index
  const sequenceStartIndex = thirtyOneDelayActive 
    ? prevSequenceStartIndexRef.current 
    : dbSequenceStartIndex;

  // Auto-clear pegging announcements after 3 seconds OR when a new announcement arrives
  // Only applies to pegging phase scoring events, not discarding/cutting/counting
  useEffect(() => {
    if (!cribbageState?.lastEvent) return;
    const event = cribbageState.lastEvent;
    
    // Only apply timeout to pegging scoring events (not hand_count, discard, cut, etc.)
    const isPeggingEvent = event.type === 'pegging_points' || event.type === 'go_point' || event.type === 'his_heels';
    if (!isPeggingEvent) {
      // Non-pegging events - clear any pending timer and show them
      if (peggingAnnouncementTimerRef.current) {
        clearTimeout(peggingAnnouncementTimerRef.current);
        peggingAnnouncementTimerRef.current = null;
      }
      setPeggingAnnouncementHidden(false);
      lastPeggingEventIdRef.current = null;
      return;
    }
    
    // New pegging event - clear previous timer, unhide, and start new 3-second timer
    const eventId = event.id;
    if (lastPeggingEventIdRef.current !== eventId) {
      lastPeggingEventIdRef.current = eventId;
      setPeggingAnnouncementHidden(false);
      
      if (peggingAnnouncementTimerRef.current) {
        clearTimeout(peggingAnnouncementTimerRef.current);
      }
      
      peggingAnnouncementTimerRef.current = setTimeout(() => {
        setPeggingAnnouncementHidden(true);
        peggingAnnouncementTimerRef.current = null;
      }, 3000);
    }
    
    return () => {
      if (peggingAnnouncementTimerRef.current) {
        clearTimeout(peggingAnnouncementTimerRef.current);
        peggingAnnouncementTimerRef.current = null;
      }
    };
  }, [cribbageState?.lastEvent?.id, cribbageState?.lastEvent?.type]);




  // Log cut card event when first revealed (atomic guard prevents duplicates)
  useEffect(() => {
    if (!cribbageState?.cutCard || !eventCtx) return;
    const cutCardKey = `${cribbageState.cutCard.rank}-${cribbageState.cutCard.suit}`;
    if (cutCardLoggedRef.current === cutCardKey) return;
    cutCardLoggedRef.current = cutCardKey;
    logCutCardEvent(eventCtx, cribbageState);
  }, [cribbageState?.cutCard, eventCtx]);

  // Continuously capture the latest pegging-phase scores.
  // This gives us a reliable baseline for the counting animation/pegboard, independent of any
  // server-side pre-calculations or state compaction.
  useEffect(() => {
    if (!cribbageState) return;
    if (cribbageState.phase !== 'pegging') return;

    const scores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      scores[playerId] = ps.pegScore ?? 0;
    }
    lastPeggingScoresRef.current = scores;

    // ── Trace: crib-last-pegging-score-awarded ──
    // Captures every pegging-phase score snapshot so we can identify the LAST one before counting.
    const allCardsPlayed = Object.values(cribbageState.playerStates).every(ps => ps.hand.length === 0);
    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-last-pegging-score-awarded',
      payload: {
        roundId: currentRoundId?.slice(0, 8),
        handNumber: currentHandNumber,
        phase: cribbageState.phase,
        playedCardsCount: cribbageState.pegging.playedCards.length,
        allCardsPlayed,
        lastEvent: cribbageState.lastEvent ? {
          type: cribbageState.lastEvent.type,
          playerId: cribbageState.lastEvent.playerId?.slice(0, 8),
          points: cribbageState.lastEvent.points,
          label: cribbageState.lastEvent.label,
        } : null,
        pegScores: Object.fromEntries(
          Object.entries(scores).map(([id, s]) => [id.slice(0, 8), s])
        ),
        timestamp: Date.now(),
      },
    });
  }, [cribbageState?.phase, cribbageState?.pegging?.playedCards?.length, cribbageState?.playerStates]);

  // Helper to get player username - defined early so it can be used in effects
  const getPlayerUsername = useCallback((playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'Unknown';
    return getDisplayName(players, player, player.profiles?.username || 'Unknown');
  }, [players]);

  // Local dealer messages to inject into chat (scoring events)
  type DealerChatMessage = {
    id: string;
    message: string;
    created_at: string;
    isDealer: true;
  };

  const [internalDealerMessages, setInternalDealerMessages] = useState<DealerChatMessage[]>([]);
  const dealerMessages: DealerChatMessage[] = externalDealerChatMessages ?? internalDealerMessages;

  const internalDealerMessageIdRef = useRef(0);

  // Inject a dealer announcement into chat
  const injectDealerMessage = useCallback((message: string) => {
    // If the parent provided a session-persistent injector, use that.
    if (onInjectDealerChatMessage) {
      onInjectDealerChatMessage(message);
      // dealerMessageCountRef removed — eligibility filter handles dealer exclusion
      return;
    }

    internalDealerMessageIdRef.current += 1;
    const newMsg: DealerChatMessage = {
      id: `dealer-${internalDealerMessageIdRef.current}-${Date.now()}`,
      message,
      created_at: new Date().toISOString(),
      isDealer: true as const,
    };
    setInternalDealerMessages((prev) => [...prev, newMsg]);
    // dealerMessageCountRef removed — eligibility filter handles dealer exclusion
  }, [onInjectDealerChatMessage]);

  // Inject "New game starting" exactly once per dealer_game_id, even during dealer selection
  const newGameAnnouncementKeyRef = useRef<string | null>(null);
  const announceNewGameStarting = useCallback(() => {
    if (!dealerGameId) return;
    if (newGameAnnouncementKeyRef.current === dealerGameId) return;
    newGameAnnouncementKeyRef.current = dealerGameId;
    injectDealerMessage('New game starting');
  }, [dealerGameId, injectDealerMessage]);

  // Observe session→dealer-game transition (trace only, no state mutations)
  const prevIsDealerSelectionRef = useRef(isDealerSelection);
  useEffect(() => {
    if (prevIsDealerSelectionRef.current && !isDealerSelection) {
      // TRACE-1: session-level high-card just completed (isDealerSelection flipped false)
      logDebugEvent({
        gameId,
        eventType: 'crib:bugA:session_hc_completed',
        payload: {
          txId: hcTransitionIdRef.current,
          externalCardCount: externalDealerSelectionCards?.length ?? 0,
          externalCardIds: (externalDealerSelectionCards ?? []).slice(0, 3).map(c => `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
          localHighCardCardCount: highCardCards.length,
          localCardIds: highCardCards.slice(0, 3).map(c => `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
          syncedStateHasData: !!highCardSyncedState,
          syncedStateCardCount: highCardSyncedState?.cards?.length ?? 0,
          dealerGameId: dealerGameId?.slice(0, 8) ?? null,
          showHighCardSelection,
        },
      });
    }
    prevIsDealerSelectionRef.current = isDealerSelection;
  }, [isDealerSelection]);

  useEffect(() => {
    if (!isDealerSelection) return;
    announceNewGameStarting();
  }, [isDealerSelection, announceNewGameStarting]);

  // Callback for counting phase announcements - also injects into chat
  // Track announcement sequence to detect duplicate combo announcements (e.g., multiple 15s)
  const lastAnnouncementRef = useRef<{ text: string; target: string; key: number } | null>(null);
  
  const handleCountingAnnouncementChange = useCallback((announcement: string | null, targetLabel: string | null, announcementKey?: number) => {
    setCountingAnnouncement(announcement);
    setCountingTargetLabel(targetLabel);
    
    // Inject scoring announcements into chat as dealer messages
    // Skip "0 points" announcements - those are just placeholders
    // Include individual combos AND totals
    if (announcement && targetLabel && announcement !== '0 points') {
      // Once a win sequence has started (scheduled or fired), suppress any further counting announcements.
      // This prevents duplicate/reordered "winning combo" lines during in_progress -> game_over transitions.
      if (winSequenceScheduledRef.current || winSequenceFiredRef.current) return;

      // Check if this is a new announcement (different text, target, or key)
      const isNew = !lastAnnouncementRef.current || 
        lastAnnouncementRef.current.text !== announcement ||
        lastAnnouncementRef.current.target !== targetLabel ||
        lastAnnouncementRef.current.key !== (announcementKey ?? 0);
      
      if (isNew) {
        lastAnnouncementRef.current = { text: announcement, target: targetLabel, key: announcementKey ?? 0 };
        injectDealerMessage(`${targetLabel}: ${announcement}`);

        // Phase 3: emit each scoring event into the canonical rail as a
        // `peg_notice` transient. The ambient "Scoring {target}..." helper
        // remains in the content pane; the rail shows the discrete scores.
        announcements.emit({
          id: `${gameId}:count:${currentRoundId ?? 'no-round'}:${targetLabel}:${announcementKey ?? 0}:${announcement}`,
          type: 'peg_notice',
          scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
          payload: { title: `${targetLabel}: ${announcement}` },
          ttlMs: 2500,
        });
      }
    }
  }, [injectDealerMessage, announcements, gameId, currentRoundId]);

  // ── Phase 3: emit pegging scoring events into the canonical rail as
  // `peg_notice` transients. Replaces the local gold-plate fallback for
  // pegging_points / go_point / his_heels. Dedup is per event.id.
  const emittedPegEventIdRef = useRef<string | null>(null);
  useEffect(() => {
    const event = cribbageState?.lastEvent;
    if (!event) return;
    const isPeggingEvent =
      event.type === 'pegging_points' ||
      event.type === 'go_point' ||
      event.type === 'his_heels';
    if (!isPeggingEvent) return;
    if (emittedPegEventIdRef.current === event.id) return;
    emittedPegEventIdRef.current = event.id;
    const name = getPlayerUsername(event.playerId);
    const title =
      event.type === 'his_heels'
        ? `${name}: His Heels (+2)`
        : `${name}: ${event.label} (+${event.points})`;
    announcements.emit({
      id: `${gameId}:peg:${event.id}`,
      type: 'peg_notice',
      scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
      payload: { title },
      ttlMs: 3000,
    });
  }, [cribbageState?.lastEvent?.id, cribbageState?.lastEvent?.type, gameId, currentRoundId, announcements, getPlayerUsername]);

  // ── Phase 3: emit a brief "Dealing Next Hand…" transient at the
  // post-counting handoff. Edge-triggered on postCountingTransitionActive.
  const emittedDealingNextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!postCountingTransitionActive) return;
    const id = `${gameId}:dealing-next:${currentRoundId ?? 'no-round'}:${currentHandNumber}`;
    if (emittedDealingNextRef.current === id) return;
    emittedDealingNextRef.current = id;
    announcements.emit({
      id,
      type: 'dealing_next_hand',
      scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
      payload: {},
      ttlMs: 1500,
    });
  }, [postCountingTransitionActive, gameId, currentRoundId, currentHandNumber, announcements]);


  // Backend acknowledgement guard: only transition to next game after backend marks game_over.
  const gameOverAckRef = useRef(false);
  const ensureBackendGameOverAck = useCallback(async (): Promise<boolean> => {
    if (gameOverAckRef.current) return true;
    if (!gameId) return false;
    try {
      const { data, error } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .single();
      if (error) return false;
      if (data?.status === 'game_over') {
        gameOverAckRef.current = true;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [gameId]);

  // Helper function to calculate baseline scores (score before counting phase).
  // This subtracts hand+crib totals from the final pegScore in the DB.
  const calculateCountingBaselineScores = useCallback((state: CribbageState): Record<string, number> => {
    // Best-effort safety: if we don't have enough data to reconstruct hands, fall back to the
    // current scores (avoids bogus baselines like jumping straight to pointsToWin).
    if (!state.cutCard || !state.pegging?.playedCards || state.pegging.playedCards.length === 0) {
      const scores: Record<string, number> = {};
      for (const [playerId, ps] of Object.entries(state.playerStates)) {
        scores[playerId] = ps.pegScore ?? 0;
      }
      return scores;
    }

    const scores: Record<string, number> = {};
    for (const [playerId] of Object.entries(state.playerStates)) {
      // Reconstruct player's hand from played pegging cards
      const playerHandCards = state.pegging.playedCards
        .filter(pc => pc.playerId === playerId)
        .map(pc => pc.card);
      const handCombos = getHandScoringCombos(playerHandCards, state.cutCard, false);
      const handTotal = getTotalFromCombos(handCombos);
      
      let cribTotal = 0;
      if (playerId === state.dealerPlayerId) {
        const cribCombos = getHandScoringCombos(state.crib, state.cutCard, true);
        cribTotal = getTotalFromCombos(cribCombos);
      }
      
      // Final pegScore minus counting scores = baseline after pegging
      scores[playerId] = state.playerStates[playerId].pegScore - handTotal - cribTotal;
    }
    return scores;
  }, []);

  // Stable counting start key to avoid cancelling the delay timer due to object identity churn
  // (e.g., cutCard object reference changing across realtime updates).
  const countingStartKey = useMemo(() => {
    if (!cribbageState) return null;

    // CRITICAL FIX: Distinguish between pegging wins and counting wins.
    // 
    // - Pegging win: phase goes 'pegging' -> 'complete' directly, lastHandCount is null
    //   (endGame called during pegging, advanceToCounting never called)
    // 
    // - Counting win: phase goes 'pegging' -> 'counting' -> 'complete', lastHandCount exists
    //   (advanceToCounting sets lastHandCount, then applyHandCountScores triggers win)
    //
    // If it's a pegging win, skip counting animation entirely and show win sequence.
    if (cribbageState.phase === 'complete') {
      if (!cribbageState.lastHandCount) {
        // Pegging win - no counting data means we never entered counting phase
        return null;
      }
      // lastHandCount exists - this was a counting-phase win that needs animation
    } else if (cribbageState.phase !== 'counting') {
      return null;
    }

    const cutKey = cribbageState.cutCard ? `${cribbageState.cutCard.rank}${cribbageState.cutCard.suit}` : 'nocut';
    // IMPORTANT: Do NOT key this off the roundId prop.
    // With multiple clients, the parent can switch to the next roundId while this client is
    // still animating counting, which would re-trigger the counting init and replay the sequence.
    return `${dealerGameId ?? 'unknown-dealer'}-${currentHandNumber}-${cribbageState.dealerPlayerId}-${cutKey}`;
  }, [
    dealerGameId,
    currentHandNumber,
    cribbageState?.phase,
    cribbageState?.dealerPlayerId,
    cribbageState?.cutCard?.rank,
    cribbageState?.cutCard?.suit,
    // Include lastHandCount to detect pegging vs counting wins
    cribbageState?.lastHandCount ? 'has-count' : 'no-count',
  ]);

  // Delay showing counting phase by 2 seconds to allow final pegging announcement to display.
  // IMPORTANT: depends ONLY on a stable key to avoid cleanup cancelling the timer mid-delay.
  // On reconnect (countingStartedAt elapsed > 0), skip the delay so animation starts immediately.
  useEffect(() => {
    const state = cribbageStateRef.current;
    if (!state) return;
    if (!countingStartKey) return;

    // If we've already started a counting animation, never re-initialize it.
    // This is critical when multiple clients are open and the parent props churn.
    if (countingAnimationActiveRef.current) return;

    // Only snapshot once per counting phase instance
    if (countingDelayFiredRef.current === countingStartKey) return;

    // REPLAY GUARD: If counting already completed for this handKey, do NOT replay.
    // This survives roundId boundary resets because countingCompletedHandKeysRef is never cleared.
    if (countingCompletedHandKeysRef.current.has(countingStartKey)) {
      console.warn('[CRIBBAGE] crib-replay-detected: counting already completed for', countingStartKey);
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'crib-replay-detected',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          event: 'counting-init',
          handKey: countingStartKey,
          timesCompleted: 1,
        },
      });
      return;
    }

    const priorFlyawayCount = incrementGuardCount(
      animationReplayCountRef.current,
      `${countingStartKey}:flyaway`,
    );
    if (!markGuardConsumed(flyawayAnimationConsumedRef.current, countingStartKey)) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'crib-animation-replay-detected',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          animationType: 'flyaway',
          priorCount: priorFlyawayCount,
        },
      });
      return;
    }

    // ── Reconnect / late-join eligibility check ──────────────────────
    // If countingStartedAt exists and significant time has elapsed, this is a reconnect.
    // Determine whether counting animation is still worth showing or should be skipped entirely.
    const countingStartedAt = state.countingStartedAt;
    const isReconnect = !!countingStartedAt && (Date.now() - new Date(countingStartedAt).getTime()) > 2500;

    // Mark counting animation as active
    countingAnimationActiveRef.current = true;
    countingDelayFiredRef.current = countingStartKey;
    countingHandKeyRef.current = countingStartKey;
    // Latch authoritative identity for ALL subsequent writes / win triggers / delayed callbacks.
    countingIdentityRef.current = currentRoundId
      ? { roundId: currentRoundId, handNumber: currentHandNumber }
      : null;
    // Write countingHandKey to state so reconnecting clients can validate
    const stateWithHandKey: CribbageState = { ...state, countingHandKey: countingStartKey };
    setCountingStateSnapshot(stateWithHandKey);
    // Persist countingHandKey to DB (fire-and-forget)
    if (currentRoundId) {
      supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify({ ...state, countingHandKey: countingStartKey })) })
        .eq('id', currentRoundId)
        .then(({ error }) => {
          if (error) console.warn('[CRIBBAGE] Failed to persist countingHandKey:', error.message);
        });
    }
    // Freeze sync framework presentation so authoritative updates don't clobber the counting UI
    syncHandle.freezePresentation();

    // Initialize counting score overrides with the pegging baseline IMMEDIATELY.
    // IMPORTANT: The final pegging +1 ("Last" / "Go") is often applied on the SAME
    // transition that flips phase to 'counting'. That means our "phase === pegging" cache
    // can be 1 point behind.
    //
    // On reconnect, the cached pegging scores won't exist (fresh mount), so we must
    // reverse-engineer the baseline from the DB state using calculateCountingBaselineScores.
    const stateScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(state.playerStates)) {
      stateScores[playerId] = ps.pegScore ?? 0;
    }

    const cachedScores = lastPeggingScoresRef.current;
    // FIX: ALWAYS use authoritative stateScores (from cribbageState.playerStates.pegScore) as
    // the counting baseline. The previous logic fell back to cachedScores when the delta exceeded 2,
    // but the cache is inherently stale: lastPeggingScoresRef only updates when phase === 'pegging',
    // and the final pegging award + phase transition to 'counting' happen atomically in the DB.
    // This means multi-point final pegging events (e.g., run of 3) produce a delta > 2 between
    // the cached and authoritative scores, causing the old code to lock in the stale baseline.
    // The authoritative pegScore is ALWAYS correct at this point (confirmed by instrumentation).
    //
    // On reconnect, reverse-engineer the baseline since pegScore may already include counting points.
    const baselineScores = isReconnect ? calculateCountingBaselineScores(state) : stateScores;

    // Stable baseline for the counting overlay (do NOT derive from animated overrides)
    // SAFETY: Clamp negative baselines to 0. Negative scores are always a computation artifact
    // (e.g., subtracting hand+crib from a stale pegScore during a replay edge case).
    const hasNegative = Object.values(baselineScores).some(s => s < 0);
    if (hasNegative) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'error',
        eventName: 'crib-negative-score-render',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          computedBaselines: baselineScores,
          stateScores,
          cachedScores: cachedScores ?? null,
          isReconnect,
          source: cachedScores ? 'cached' : isReconnect ? 'reverse-engineered' : 'state-direct',
        },
      });
      // Clamp all negatives to 0
      for (const pid of Object.keys(baselineScores)) {
        if (baselineScores[pid] < 0) baselineScores[pid] = 0;
      }
    }
    countingBaselineScoresRef.current = baselineScores;

    // ── Trace: crib-last-pegging-score-mismatch ──
    // Compare cached pegging scores vs state scores to detect if final pegging points were missed.
    if (cachedScores) {
      const mismatches: Array<{ pid: string; cached: number; state: number; delta: number }> = [];
      for (const [pid, stateScore] of Object.entries(stateScores)) {
        const cached = cachedScores[pid] ?? 0;
        if (cached !== stateScore) {
          mismatches.push({ pid: pid.slice(0, 8), cached, state: stateScore, delta: stateScore - cached });
        }
      }
      if (mismatches.length > 0) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: currentHandNumber,
          eventType: 'invariant',
          severity: mismatches.some(m => m.delta > 2) ? 'error' : 'info',
          eventName: 'crib-last-pegging-score-mismatch',
          payload: {
            roundId: currentRoundId?.slice(0, 8),
            handNumber: currentHandNumber,
            mismatches,
            cachedScores: Object.fromEntries(Object.entries(cachedScores).map(([id, s]) => [id.slice(0, 8), s])),
            stateScores: Object.fromEntries(Object.entries(stateScores).map(([id, s]) => [id.slice(0, 8), s])),
            baselineChoice: baselineScores === stateScores ? 'stateScores' : baselineScores === cachedScores ? 'cachedScores' : 'other',
            isReconnect,
            timestamp: Date.now(),
          },
        });
      }
    }

    // Keep cache aligned with what we're using as the baseline for this hand.
    lastPeggingScoresRef.current = baselineScores;
    setCountingScoreOverrides(baselineScores);
    
    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-postscore-animation-trigger',
      payload: {
        roundId: currentRoundId?.slice(0, 8),
        handNumber: currentHandNumber,
        countingStartKey,
        isReconnect,
        baselineScores,
        clampedNegatives: hasNegative,
      },
    });

    if (isReconnect) {
      // On reconnect, skip the 2-second pegging announcement delay entirely.
      // The pegging phase is long past — go straight to counting animation.
      console.log('[CRIBBAGE] Reconnect detected — skipping counting delay', {
        countingStartedAt,
        elapsedMs: Date.now() - new Date(countingStartedAt!).getTime(),
      });
      setCountingDelayActive(false);
    } else {
      // Normal flow: 2-second delay to let final pegging announcement display
      setCountingDelayActive(true);
      const timer = setTimeout(() => {
        setCountingDelayActive(false);
      }, 2000);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [countingStartKey, calculateCountingBaselineScores]);

  // Clear counting overrides when starting a fresh hand (discarding phase).
  // BUG B FIX: Use ONLY presentation state (viewState) — never cribbageState — for clearing logic.
  // Two conditions must BOTH be true before overrides are cleared:
  //   1. Presentation pegScores (viewState) >= override values (scores caught up)
  //   2. renderHandKey === currentHandKey (UI has transitioned to the new hand identity)
  // This prevents the one-render regression where authoritative state advances to new hand
  // but the UI is still rendering the old hand's visual tail-end.
  useEffect(() => {
    if (!viewState) return;
    // Only consider clearing in non-counting phases of the presentation state
    const viewPhase = viewState.phase;
    if (viewPhase === 'discarding' || viewPhase === 'cutting' || viewPhase === 'pegging') {
      if (countingScoreOverrides && !countingStateSnapshot) {
        // Condition 2: UI identity must match authoritative identity
        if (renderHandKey !== currentHandKey) {
          logCribbageDebug(debugCtx, 'peg:latching_overrides_handkey_mismatch', {
            viewPhase,
            renderHandKey: renderHandKey.slice(0, 12),
            currentHandKey: currentHandKey.slice(0, 12),
            overrideValues: countingScoreOverrides,
          });
          return;
        }

        // Condition 1: All presentation pegScores must have caught up to override values
        const allCaughtUp = Object.entries(countingScoreOverrides).every(([playerId, overrideScore]) => {
          const presentationPegScore = viewState.playerStates[playerId]?.pegScore ?? 0;
          return presentationPegScore >= overrideScore;
        });

        if (allCaughtUp) {
          // ── Trace: crib-next-hand-reveal-score-catchup ──
          // Detect if the override being cleared had a higher score than what presentation shows,
          // meaning the presentation "caught up" a previously-missing pegging point.
          const catchupDetails: Array<{ pid: string; override: number; presentation: number }> = [];
          for (const [pid, overrideScore] of Object.entries(countingScoreOverrides)) {
            const presScore = viewState.playerStates[pid]?.pegScore ?? 0;
            if (presScore > overrideScore) {
              catchupDetails.push({ pid: pid.slice(0, 8), override: overrideScore, presentation: presScore });
            }
          }
          persistSyncDebugEvent({
            gameId,
            gameType: 'cribbage',
            handNumber: currentHandNumber,
            eventType: catchupDetails.length > 0 ? 'invariant' : 'transition',
            severity: catchupDetails.length > 0 ? 'warn' : 'info',
            eventName: 'crib-next-hand-reveal-score-catchup',
            payload: {
              roundId: currentRoundId?.slice(0, 8),
              handNumber: currentHandNumber,
              viewPhase,
              overrideValues: Object.fromEntries(Object.entries(countingScoreOverrides).map(([id, s]) => [id.slice(0, 8), s])),
              presentationScores: Object.fromEntries(
                Object.entries(viewState.playerStates).map(([id, ps]) => [id.slice(0, 8), ps.pegScore ?? 0])
              ),
              catchupDetails,
              hadCatchup: catchupDetails.length > 0,
              timestamp: Date.now(),
            },
          });

          logCribbageDebug(debugCtx, 'peg:clearing_stale_overrides', {
            viewPhase,
            overrideValues: countingScoreOverrides,
            reason: 'presentation_pegScores_caught_up_and_handkey_matched',
          });
          setCountingScoreOverrides(null);
        } else {
          logCribbageDebug(debugCtx, 'peg:latching_overrides_until_catchup', {
            viewPhase,
            overrideValues: countingScoreOverrides,
            presentationPegScores: Object.fromEntries(
              Object.entries(countingScoreOverrides).map(([pid]) => [
                pid.slice(0, 8),
                viewState.playerStates[pid]?.pegScore ?? 0,
              ])
            ),
          });
        }
      }
    }
  }, [viewState?.phase, viewState?.playerStates, countingScoreOverrides, countingStateSnapshot, renderHandKey, currentHandKey]);

  // Mark hydration complete once allMessages are loaded
  useEffect(() => {
    if (!allMessages || allMessages.length === 0) return;
    const latestEligibleMessage = eligibleIndicatorMessages[eligibleIndicatorMessages.length - 1] ?? null;

    if (!chatHydratedRef.current) {
      if (!hasObservedInitialChatSnapshotRef.current) {
        hasObservedInitialChatSnapshotRef.current = true;
        if (allMessages.length === 0) {
          return;
        }
      }

      chatHydratedRef.current = true;

      if (!lastSeenChatMessageIdRef.current && !lastReadChatMessageIdRef.current && latestEligibleMessage && !lastProcessedRealtimeMessageIdRef.current) {
        lastSeenChatMessageIdRef.current = latestEligibleMessage.id;
        lastReadChatMessageIdRef.current = latestEligibleMessage.id;
        setHasUnreadMessages(false);
        logChatIndicator('watermark updated', latestEligibleMessage, {
          flashing: false,
          unread: false,
          lastSeen: latestEligibleMessage.id,
          lastRead: latestEligibleMessage.id,
          reason: 'hydration-seed',
        });
        return;
      }
    }

    if (!chatHydratedRef.current) {
      return;
    }

    if (activeTab === 'chat') {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
        greenClearTimeoutRef.current = null;
      }

      if (chatTabFlashing) {
        logChatIndicator('green cleared', latestEligibleMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          reason: 'chat-open-sync',
        });
      }

      setChatTabFlashing(false);

      if (latestEligibleMessage && lastReadChatMessageIdRef.current !== latestEligibleMessage.id) {
        lastReadChatMessageIdRef.current = latestEligibleMessage.id;
        logChatIndicator('watermark updated', latestEligibleMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          lastSeen: latestEligibleMessage.id,
          lastRead: latestEligibleMessage.id,
          reason: 'chat-open-sync',
        });
      }

      if (hasUnreadMessages) {
        logChatIndicator('red cleared', latestEligibleMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          reason: 'chat-open-sync',
        });
      }

      setHasUnreadMessages(false);
      return;
    }

    let unreadEligibleMessages: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }[] = [];

    if (lastReadChatMessageIdRef.current) {
      unreadEligibleMessages = getMessagesAfterWatermark(eligibleIndicatorMessages, lastReadChatMessageIdRef.current);
    } else if (lastSeenChatMessageIdRef.current) {
      unreadEligibleMessages = getMessagesAfterWatermark(eligibleIndicatorMessages, lastSeenChatMessageIdRef.current, true);
    }

    const shouldHaveUnreadMessages = unreadEligibleMessages.length > 0;

    if (hasUnreadMessages !== shouldHaveUnreadMessages) {
      logChatIndicator(shouldHaveUnreadMessages ? 'red set' : 'red cleared', latestEligibleMessage, {
        unread: shouldHaveUnreadMessages,
        unreadCount: unreadEligibleMessages.length,
        reason: shouldHaveUnreadMessages
          ? 'eligible-messages-newer-than-read-watermark'
          : 'no-unread-eligible-messages',
      });
    }

    setHasUnreadMessages(shouldHaveUnreadMessages);
  }, [
    activeTab,
    allMessages,
    chatTabFlashing,
    eligibleIndicatorMessages,
    getMessagesAfterWatermark,
    hasUnreadMessages,
    logChatIndicator,
  ]);

  // Realtime-only GREEN pulse + RED unread: only eligible other-human messages trigger indicators
  useEffect(() => {
    if (!latestRealtimeMessage) return;

    logChatIndicator('realtime received', latestRealtimeMessage);

    const eligibility = getChatIndicatorEligibility(latestRealtimeMessage);
    logChatIndicator('eligibility', latestRealtimeMessage, {
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    });

    if (!eligibility.eligible) return;

    // Replay / duplicate guard
    if (
      lastProcessedRealtimeMessageIdRef.current === latestRealtimeMessage.id ||
      lastSeenChatMessageIdRef.current === latestRealtimeMessage.id
    ) {
      return;
    }

    lastProcessedRealtimeMessageIdRef.current = latestRealtimeMessage.id;
    lastSeenChatMessageIdRef.current = latestRealtimeMessage.id;
    logChatIndicator('watermark updated', latestRealtimeMessage, {
      lastSeen: latestRealtimeMessage.id,
      lastRead: lastReadChatMessageIdRef.current,
      reason: 'eligible-realtime-seen',
    });

    if (!chatHydratedRef.current) {
      logChatIndicator('pre-hydration deferred', latestRealtimeMessage, {
        lastSeen: latestRealtimeMessage.id,
        lastRead: lastReadChatMessageIdRef.current,
      });
      return;
    }

    if (activeTab === 'chat') {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
        greenClearTimeoutRef.current = null;
      }

      if (chatTabFlashing) {
        logChatIndicator('green cleared', latestRealtimeMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          reason: 'chat-already-open',
        });
      }

      setChatTabFlashing(false);

      if (lastReadChatMessageIdRef.current !== latestRealtimeMessage.id) {
        lastReadChatMessageIdRef.current = latestRealtimeMessage.id;
        logChatIndicator('watermark updated', latestRealtimeMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          lastSeen: latestRealtimeMessage.id,
          lastRead: latestRealtimeMessage.id,
          reason: 'realtime-while-chat-open',
        });
      }

      if (hasUnreadMessages) {
        logChatIndicator('red cleared', latestRealtimeMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          reason: 'chat-already-open',
        });
      }

      setHasUnreadMessages(false);
      return;
    }

    if (greenClearTimeoutRef.current) {
      clearTimeout(greenClearTimeoutRef.current);
    }

    setChatTabFlashing(true);
    setHasUnreadMessages(true);
    logChatIndicator('green set', latestRealtimeMessage, {
      flashing: true,
      unread: true,
      lastSeen: latestRealtimeMessage.id,
    });

    if (!hasUnreadMessages) {
      logChatIndicator('red set', latestRealtimeMessage, {
        flashing: true,
        unread: true,
        lastSeen: latestRealtimeMessage.id,
        reason: 'eligible-realtime-while-chat-closed',
      });
    }

    greenClearTimeoutRef.current = setTimeout(() => {
      greenClearTimeoutRef.current = null;
      setChatTabFlashing(false);
      logChatIndicator('green cleared', latestRealtimeMessage, {
        flashing: false,
        unread: true,
        lastSeen: latestRealtimeMessage.id,
        reason: 'pulse-timeout',
      });
    }, 1500);
  }, [activeTab, chatTabFlashing, getChatIndicatorEligibility, hasUnreadMessages, latestRealtimeMessage, logChatIndicator]);

  // Inject pegging events (lastEvent) into chat as dealer messages
  const lastEventKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cribbageState?.lastEvent) return;
    const event = cribbageState.lastEvent;
    if (event.type === 'hand_count') return; // Hand count events are already handled by counting phase
    
    // Generate a unique key for this event to prevent duplicates
    const eventKey = `${event.playerId}-${event.label}-${event.points}-${Date.now()}`;
    
    // Use a simpler check: only log if label+points is different from last
    const simpleKey = `${event.label}-${event.points}`;
    if (lastEventKeyRef.current === simpleKey) return;
    lastEventKeyRef.current = simpleKey;
    
    const playerName = getPlayerUsername(event.playerId);
    injectDealerMessage(`${playerName}: ${event.label} (+${event.points})`);
  }, [cribbageState?.lastEvent, injectDealerMessage, getPlayerUsername]);

  // ============================================================================
  // REACTIVE WIN DETECTION via score subscription
  // Watch countingScoreOverrides (the animated scores used by the peg board).
  // When any player reaches pointsToWin, immediately trigger the win sequence.
  // This works for both counting phase wins AND pegging phase wins.
  // ============================================================================
  useEffect(() => {
    if (!countingScoreOverrides || !cribbageState) return;
    // Don't re-trigger if win sequence already fired/scheduled for this winner
    
    const pointsToWin = cribbageState.pointsToWin;

    // IDENTITY GUARD (authoritative): only trust countingScoreOverrides for the
    // exact (roundId, handNumber) we started counting on. Reconstructed handKeys
    // are NOT used for identity — they can collide across hands.
    const expectedIdentity = countingIdentityRef.current;
    if (expectedIdentity) {
      if (
        expectedIdentity.roundId !== currentRoundId ||
        expectedIdentity.handNumber !== currentHandNumber
      ) {
        console.warn('[CRIBBAGE] Reactive win detector: REJECTED stale countingScoreOverrides (identity mismatch)', {
          expected: expectedIdentity,
          live: { roundId: currentRoundId, handNumber: currentHandNumber },
        });
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: currentHandNumber,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'crib-reactive-win-stale-rejected',
          payload: {
            expectedRoundId: expectedIdentity.roundId?.slice(0, 8),
            expectedHandNumber: expectedIdentity.handNumber,
            liveRoundId: currentRoundId?.slice(0, 8),
            liveHandNumber: currentHandNumber,
          },
        });
        return;
      }
    }

    // Check if any player has reached the winning threshold
    for (const [playerId, score] of Object.entries(countingScoreOverrides)) {
      if (score >= pointsToWin) {
        console.log('[CRIBBAGE] Win detected via score subscription:', { playerId, score, pointsToWin });

        const winKey = winKeyFor(playerId);
        if (winSequenceFiredRef.current === winKey || winSequenceScheduledRef.current === winKey) {
          recordCribDoubleSkunkTrace('reactive combo-crossing schedule BLOCK', {
            terminalEventId: terminalEventIdFor(playerId),
            winKey,
            reason: winSequenceFiredRef.current === winKey ? 'fired-ref-match' : 'scheduled-ref-match',
          });
          return;
        }

        // Guard immediately so we can't schedule multiple timers before the first one fires.
        winSequenceScheduledRef.current = winKey;
        recordCribDoubleSkunkTrace('reactive combo-crossing schedule PASS', {
          terminalEventId: terminalEventIdFor(playerId),
          winKey,
          score,
          pointsToWin,
        });
        
        // Freeze the counting animation - it should stop advancing and keep cards highlighted
        setCountingWinFrozen(true);
        // [TERMINAL-PATH] reactive combo-crossing during counting = counting win.
        // Refine hand vs crib from the active counting target index (last target is crib).
        {
          const tIdx = countingStateSnapshot?.countingTargetIndex ?? null;
          const isCribTarget = typeof tIdx === 'number' && tIdx >= 0 &&
            tIdx === (cribbageState.turnOrder?.length ?? 0);
          setTerminalPath(isCribTarget ? 'crib-counting' : 'hand-counting');
        }
        
        const loserScores = Object.entries(countingScoreOverrides)
          .filter(([id]) => id !== playerId)
          .map(([, s]) => s);
        const minLoserScore = loserScores.length > 0 ? Math.min(...loserScores) : 0;

        const multiplier = (() => {
          if (cribbageState.doubleSkunkEnabled && minLoserScore < cribbageState.doubleSkunkThreshold) return 3;
          if (cribbageState.skunkEnabled && minLoserScore < cribbageState.skunkThreshold) return 2;
          return 1;
        })();

        // Persist *final* scores at the moment of win (so backend results match what players saw).
        const nextPlayerStates: CribbageState['playerStates'] = { ...cribbageState.playerStates };
        for (const [pid, ps] of Object.entries(cribbageState.playerStates)) {
          nextPlayerStates[pid] = {
            ...ps,
            pegScore: countingScoreOverrides[pid] ?? ps.pegScore,
          };
        }

        // Build state with winner for the win sequence
        const stateWithWinner: CribbageState = {
          ...cribbageState,
          phase: 'complete',
          playerStates: nextPlayerStates,
          winnerPlayerId: playerId,
          loserScore: minLoserScore,
          payoutMultiplier: multiplier,
        };

        // Capture identity at schedule time — re-validate at fire time so a hand
        // boundary during the 2s delay aborts the win trigger.
        const scheduledIdentity = expectedIdentity
          ? { ...expectedIdentity }
          : { roundId: currentRoundId, handNumber: currentHandNumber };

        setTimeout(() => {
          const liveIdentity = countingIdentityRef.current;
          if (
            !liveIdentity ||
            liveIdentity.roundId !== scheduledIdentity.roundId ||
            liveIdentity.handNumber !== scheduledIdentity.handNumber
          ) {
            console.warn('[CRIBBAGE] Reactive win delayed callback: ABORTED (identity drift during delay)', {
              scheduled: scheduledIdentity,
              live: liveIdentity,
            });
            persistSyncDebugEvent({
              gameId,
              gameType: 'cribbage',
              handNumber: scheduledIdentity.handNumber,
              eventType: 'invariant',
              severity: 'warn',
              eventName: 'crib-reactive-win-delayed-aborted',
              payload: {
                scheduledRoundId: scheduledIdentity.roundId?.slice(0, 8),
                scheduledHandNumber: scheduledIdentity.handNumber,
                liveRoundId: liveIdentity?.roundId?.slice(0, 8) ?? null,
                liveHandNumber: liveIdentity?.handNumber ?? null,
              },
            });
            // Release the schedule guard so a legitimate later win for the same
            // winner key isn't permanently suppressed.
            if (winSequenceScheduledRef.current === winKey && winSequenceFiredRef.current !== winKey) {
              recordCribDoubleSkunkTrace('reactive combo-crossing delayed abort clears scheduledRef', {
                terminalEventId: terminalEventIdFor(playerId),
                winKey,
                scheduledIdentity,
                liveIdentity,
              });
              winSequenceScheduledRef.current = null;
            }
            return;
          }
          triggerWinSequence(stateWithWinner);
        }, 2000);
        
        return; // Only one winner
      }
    }
    // triggerWinSequence intentionally omitted from deps (declared later; captured via closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingScoreOverrides, cribbageState, roundId, dealerGameId, currentHandNumber, currentRoundId, gameId]);

  // FIX B: Fetch token to prevent overlapping loads from racing
  const cribbageFetchTokenRef = useRef(0);

  // Phase F.3: dealerGameId boundary reset.
  // Cribbage→Cribbage replay (Run Back) creates a new dealerGameId while the
  // persistent table shell keeps this component MOUNTED. Without this
  // reset, `hasInitializedRef`/`initialLoadComplete` from the prior match
  // make `loadOrInitializeState` short-circuit, leaving the new dealer-
  // selection winner unable to bootstrap fresh cribbage_state → freeze.
  // Also clears stale high-card local state so cohort/tie derivation
  // starts clean for the new match.
  const prevDealerGameIdRef = useRef<string | null | undefined>(dealerGameId);
  useEffect(() => {
    if (prevDealerGameIdRef.current === dealerGameId) return;
    if (prevDealerGameIdRef.current != null && dealerGameId != null) {
      console.log('[CRIBBAGE] dealerGameId boundary — resetting init latches', {
        prev: prevDealerGameIdRef.current?.slice(0, 8),
        next: dealerGameId.slice(0, 8),
      });
      hasInitializedRef.current = false;
      setInitialLoadComplete(false);
      setHighCardCards([]);
      setHighCardWinnerPosition(null);
      setHighCardSyncedState(null);
      setShowHighCardSelection(false);
      announcedDealerResolvedRef.current = null;
      // Reset forward-only local round identity. Without this, the
      // previous match's terminal `currentRoundId`/`currentHandNumber`
      // persist into the new dealer-game scope and cause
      // `loadOrInitializeState` to run against a stale round during the
      // replay bootstrap window, wedging the table.
      setCurrentRoundId(roundId);
      setCurrentHandNumber(handNumber);
      lastObservedIdentityRef.current = null;
    }
    prevDealerGameIdRef.current = dealerGameId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerGameId]);


  
  // Initialize game state - check if we need high card selection first
  // This runs ONCE on mount to determine if we need high-card selection or can load existing state
  useEffect(() => {
    // Guard: need roundId to proceed
    if (!currentRoundId) {
      console.log('[CRIBBAGE] No roundId yet, waiting...');
      return;
    }
    
    const fetchToken = ++cribbageFetchTokenRef.current;
    const fetchRoundId = currentRoundId;
    const fetchHandNumber = currentHandNumber;
    const initGuardKey = buildBoundaryGuardKey(dealerGameId, fetchRoundId, fetchHandNumber);
    
    const loadOrInitializeState = async () => {
      if (hasInitializedRef.current || initialLoadComplete) {
        console.log('[CRIBBAGE] Already initialized, skipping');
        return;
      }
      
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-load-start',
        payload: {
          fetchToken,
          roundId: fetchRoundId.slice(0, 8),
          initialLoadComplete: false,
          hasInitializedRef: false,
          isTransitioning,
          transitionFrozen: transitionFrozenRef.current,
        },
      });
      
      console.log('[CRIBBAGE] Loading state for round:', fetchRoundId);

      // Clear any stale dealer_selection_state from a previous game in this session
      // to prevent old cards from flashing during draw-for-button.
      if (isHost) {
        await supabase
          .from('games')
          .update({ dealer_selection_state: null })
          .eq('id', gameId);
      }
      
      // FIX B: Check token after first await
      if (fetchToken !== cribbageFetchTokenRef.current) {
        console.log('[CRIBBAGE] Fetch token stale after dealer_selection clear, dropping');
        persistSyncDebugEvent({
          gameId, gameType: 'cribbage', handNumber: currentHandNumber,
          eventType: 'transition', severity: 'warn',
          eventName: 'crib-load-drop-token',
          payload: { fetchToken, currentToken: cribbageFetchTokenRef.current, roundId: fetchRoundId.slice(0, 8), dropPoint: 'after_dealer_selection_clear' },
        });
        return;
      }
      
      const { data: roundData, error } = await supabase
        .from('rounds')
        .select('cribbage_state, hand_number')
        .eq('id', fetchRoundId)
        .single();

      // FIX B: Check token after DB fetch
      if (fetchToken !== cribbageFetchTokenRef.current) {
        console.log('[CRIBBAGE] Fetch token stale after round load, dropping');
        persistSyncDebugEvent({
          gameId, gameType: 'cribbage', handNumber: currentHandNumber,
          eventType: 'transition', severity: 'warn',
          eventName: 'crib-load-drop-token',
          payload: { fetchToken, currentToken: cribbageFetchTokenRef.current, roundId: fetchRoundId.slice(0, 8), dropPoint: 'after_round_load' },
        });
        return;
      }

      if (error) {
        console.error('[CRIBBAGE] Error loading state:', error);
        setInitialLoadComplete(true);
        return;
      }

      console.log('[CRIBBAGE] Round data loaded:', { 
        hasState: !!roundData?.cribbage_state, 
        handNumber: roundData?.hand_number 
      });

      // If state already exists, use it (game already in progress or resumed)
      if (roundData?.cribbage_state) {
        console.log('[CRIBBAGE] Using existing state from DB');
        const loadedState = roundData.cribbage_state as unknown as CribbageState;
        const priorInitCount = incrementGuardCount(nextHandInitCountRef.current, initGuardKey);
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: fetchHandNumber,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-next-hand-init-trigger',
          payload: {
            roundId: fetchRoundId.slice(0, 8),
            handNumber: fetchHandNumber,
            triggerSource: 'existing_round_state',
            priorTriggerCount: priorInitCount,
          },
        });
        if (loadedState.cutCard || loadedState.crib.length > 0) {
          const priorAnimationCount = incrementGuardCount(
            animationReplayCountRef.current,
            `${initGuardKey}:crib_cut_reveal`,
          );
          if (!markGuardConsumed(cribCutReplayConsumedRef.current, initGuardKey)) {
            persistSyncDebugEvent({
              gameId,
              gameType: 'cribbage',
              handNumber: fetchHandNumber,
              eventType: 'invariant',
              severity: 'warn',
              eventName: 'crib-animation-replay-detected',
              payload: {
                roundId: fetchRoundId.slice(0, 8),
                handNumber: fetchHandNumber,
                animationType: 'crib_cut_reveal',
                priorCount: priorAnimationCount,
              },
            });
            persistSyncDebugEvent({
              gameId,
              gameType: 'cribbage',
              handNumber: fetchHandNumber,
              eventType: 'invariant',
              severity: 'warn',
              eventName: 'crib-replay-detected',
              payload: {
                roundId: fetchRoundId.slice(0, 8),
                handNumber: fetchHandNumber,
                event: 'loadOrInitializeState:existing_round_state',
                handKey: initGuardKey,
                timesCompleted: priorInitCount + 1,
              },
            });
            return;
          }
        }
        if (!markGuardConsumed(nextHandInitConsumedRef.current, initGuardKey)) {
          persistSyncDebugEvent({
            gameId,
            gameType: 'cribbage',
            handNumber: fetchHandNumber,
            eventType: 'invariant',
            severity: 'warn',
            eventName: 'crib-replay-detected',
            payload: {
              roundId: fetchRoundId.slice(0, 8),
              handNumber: fetchHandNumber,
              event: 'loadOrInitializeState:existing_round_state',
              handKey: initGuardKey,
              timesCompleted: priorInitCount + 1,
            },
          });
          return;
        }
        hasInitializedRef.current = true;
        setInitialLoadComplete(true);
        syncHandle.receiveAuthoritativeUpdate(loadedState);
        setCribbageState(loadedState);
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: fetchHandNumber,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-load-success',
          payload: {
            fetchToken,
            roundId: fetchRoundId.slice(0, 8),
            source: 'existing_round_state',
          },
        });
        // FIX: Unfreeze transition if this load is the first valid state for the new hand.
        // Without this, isTransitioning stays true forever because the realtime handler
        // rejects the duplicate state as "no progress" and never reaches the unfreeze path.
        if (transitionFrozenRef.current) {
          const frozenForRound = transitionFrozenForRoundRef.current;
          if (frozenForRound === fetchRoundId) {
            transitionFrozenRef.current = false;
            transitionFrozenForRoundRef.current = null;
            syncHandle.unfreezePresentation();
            setIsTransitioning(false);
            persistSyncDebugEvent({
              gameId,
              gameType: 'cribbage',
              handNumber: currentHandNumber,
              eventType: 'transition',
              severity: 'info',
              eventName: 'crib-load-unfreeze',
              payload: {
                fetchToken,
                roundId: fetchRoundId.slice(0, 8),
                frozenForRound: frozenForRound?.slice(0, 8),
                source: 'loadOrInitializeState',
                phase: loadedState.phase,
              },
            });
          }
        }
        return;
      }

      // First hand of a new cribbage game - show high card selection
      // Mark load complete but show selection (don't set hasInitializedRef yet)
      const isFirstHand = !roundData?.hand_number || roundData.hand_number <= 1;
      
      if (isFirstHand) {
        console.log('[CRIBBAGE] First hand - starting high card selection');
        const priorInitCount = incrementGuardCount(nextHandInitCountRef.current, initGuardKey);
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: fetchHandNumber,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-next-hand-init-trigger',
          payload: {
            roundId: fetchRoundId.slice(0, 8),
            handNumber: fetchHandNumber,
            triggerSource: 'first_hand_selection',
            priorTriggerCount: priorInitCount,
          },
        });
        if (!markGuardConsumed(nextHandInitConsumedRef.current, initGuardKey)) {
          persistSyncDebugEvent({
            gameId,
            gameType: 'cribbage',
            handNumber: fetchHandNumber,
            eventType: 'invariant',
            severity: 'warn',
            eventName: 'crib-replay-detected',
            payload: {
              roundId: fetchRoundId.slice(0, 8),
              handNumber: fetchHandNumber,
              event: 'loadOrInitializeState:first_hand_selection',
              handKey: initGuardKey,
              timesCompleted: priorInitCount + 1,
            },
          });
          return;
        }
        // Inject "new game starting" message into chat (idempotent per dealer_game_id)
        announceNewGameStarting();
        setShowHighCardSelection(true);
        setInitialLoadComplete(true);
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: fetchHandNumber,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-load-success',
          payload: {
            fetchToken,
            roundId: fetchRoundId.slice(0, 8),
            source: 'first_hand_selection',
          },
        });
        return;
      }

      // Not first hand but no state - initialize with session dealer
      console.log('[CRIBBAGE] Not first hand, initializing with session dealer');
      const priorInitCount = incrementGuardCount(nextHandInitCountRef.current, initGuardKey);
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: fetchHandNumber,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-next-hand-init-trigger',
        payload: {
          roundId: fetchRoundId.slice(0, 8),
          handNumber: fetchHandNumber,
          triggerSource: 'initialized_new_state',
          priorTriggerCount: priorInitCount,
        },
      });
      if (!markGuardConsumed(nextHandInitConsumedRef.current, initGuardKey)) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: fetchHandNumber,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'crib-replay-detected',
          payload: {
            roundId: fetchRoundId.slice(0, 8),
            handNumber: fetchHandNumber,
            event: 'loadOrInitializeState:initialized_new_state',
            handKey: initGuardKey,
            timesCompleted: priorInitCount + 1,
          },
        });
        return;
      }
      hasInitializedRef.current = true;
      setInitialLoadComplete(true);
      const dealerId = players.find(p => p.position === dealerPosition)?.id || players[0].id;
      const playerIds = players.map(p => p.id);
      // Debug-harness target is the canonical SESSION HOST (games.current_host
      // → earliest non-bot fallback). Identical on every client; never the
      // local viewer / init-race winner. See resolveHarnessHost.ts.
      await ensureHarnessCacheLoaded();
      const hostPlayerId = await fetchSessionHostPlayerId(gameId, players);
      const newState = initializeCribbageGame(playerIds, dealerId, anteAmount, gameConfig, undefined, hostPlayerId ?? undefined);

      
      
      await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', fetchRoundId);
      
      // FIX B: Check token after write
      if (fetchToken !== cribbageFetchTokenRef.current) {
        console.log('[CRIBBAGE] Fetch token stale after state init write, dropping');
        return;
      }
      
      syncHandle.receiveAuthoritativeUpdate(newState);
      setCribbageState(newState);
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: fetchHandNumber,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-load-success',
        payload: {
          fetchToken,
          roundId: fetchRoundId.slice(0, 8),
          source: 'initialized_new_state',
        },
      });
      // FIX: Same unfreeze as existing-state path above
      if (transitionFrozenRef.current) {
        const frozenForRound = transitionFrozenForRoundRef.current;
        if (frozenForRound === fetchRoundId) {
          transitionFrozenRef.current = false;
          transitionFrozenForRoundRef.current = null;
          syncHandle.unfreezePresentation();
          setIsTransitioning(false);
        }
      }
    };

    loadOrInitializeState();
  }, [currentRoundId, currentHandNumber, dealerGameId, initialLoadComplete, injectDealerMessage, announceNewGameStarting]); // Re-run if current round changes, include initialLoadComplete in deps

  // Keep showHighCardSelection from "sticking" after the real cribbage_state arrives (non-host clients)
  useEffect(() => {
    if (!showHighCardSelection) return;
    if (!cribbageState) return;
    setShowHighCardSelection(false);
  }, [showHighCardSelection, cribbageState]);

  // Subscribe to DB-synced dealer selection state so everyone sees the same animation
  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('dealer_selection_state')
        .eq('id', gameId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('[CRIBBAGE] Failed to load dealer_selection_state:', error);
        return;
      }

      const raw = (data?.dealer_selection_state as unknown as DealerSelectionState) ?? null;
      // TRACE-2: log DB load (observation only)
      logDebugEvent({
        gameId,
        eventType: 'crib:bugA:db_load_synced_state',
        payload: {
          txId: hcTransitionIdRef.current,
          isDealerSelection,
          dealerGameId: dealerGameId?.slice(0, 8) ?? null,
          hasData: !!raw,
          cardCount: raw?.cards?.length ?? 0,
          isComplete: raw?.isComplete ?? null,
        },
      });
      setHighCardSyncedState(raw);
    };

    load();

    const channel = supabase
      .channel(`cribbage-dealer-selection-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const next = (payload.new as any)?.dealer_selection_state ?? null;
          // TRACE-2b: log realtime update (observation only)
          logDebugEvent({
            gameId,
            eventType: 'crib:bugA:realtime_synced_state',
            payload: {
              txId: hcTransitionIdRef.current,
              isDealerSelection,
              dealerGameId: dealerGameId?.slice(0, 8) ?? null,
              hasData: !!next,
              cardCount: (next as any)?.cards?.length ?? 0,
              isComplete: (next as any)?.isComplete ?? null,
            },
          });
          setHighCardSyncedState(next as DealerSelectionState | null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Handle high card selection complete
  // NOTE: HighCardDealerSelection returns a winning *position* (seat), not a player id.
  const handleHighCardComplete = useCallback(async (winnerPosition: number) => {
    const winnerPlayer = players.find(p => p.position === winnerPosition);
    if (!winnerPlayer) {
      console.error('[CRIBBAGE] High card winner position not found:', winnerPosition);
      return;
    }

    console.log('[CRIBBAGE] High card winner:', { position: winnerPosition, playerId: winnerPlayer.id });

    // Non-host clients should NOT write state; they will receive cribbage_state via realtime.
    if (!isHost) return;

    setShowHighCardSelection(false);
    setInitialLoadComplete(true);

    // Initialize the game with the winner as dealer.
    // Phase C prereq: stamp dealerSelectionCohort + dealerResolved so the
    // sync framework progress vector advances cleanly across the
    // dealer-select → discarding boundary (incl. tie redraws).
    hasInitializedRef.current = true;
    // Ensure debug-harness cache is hydrated (see note at first init callsite).
    await ensureHarnessCacheLoaded();
    const playerIds = players.map(p => p.id);
    // Canonical session host (see resolveHarnessHost.ts) — deterministic across clients.
    const hostPlayerId = await fetchSessionHostPlayerId(gameId, players);
    const newState = initializeCribbageGame(
      playerIds,
      winnerPlayer.id,
      anteAmount,
      gameConfig,
      {
        dealerSelectionCohort: dealerSelectionCohortDerived,
        dealerResolved: true,
      },
      hostPlayerId ?? undefined,
    );


    await supabase
      .from('rounds')
      .update({
        cribbage_state: JSON.parse(JSON.stringify(newState)),
        pot: 0,
        cards_dealt: 6,
      })
      .eq('id', roundId);

    // Persist dealt hands for privacy + rejoin
    await Promise.all(
      playerIds.map(async (playerId) => {
        const ps = newState.playerStates[playerId];
        if (!ps) return;
        const { error } = await supabase
          .from('player_cards')
          .upsert(
            {
              player_id: playerId,
              round_id: roundId,
              cards: ps.hand as any,
            },
            { onConflict: 'player_id,round_id' }
          );
        if (error) {
          console.error('[CRIBBAGE] Failed to persist player_cards:', playerId, error);
        }
      })
    );

    // Clear dealer selection state now that we have a real dealer + dealt state
    await supabase
      .from('games')
      .update({ dealer_selection_state: null })
      .eq('id', gameId);

    syncHandle.receiveAuthoritativeUpdate(newState);
    setCribbageState(newState);
  }, [players, anteAmount, roundId, isHost, gameId]);

  const getHighCardDisplayNameByPosition = useCallback((position: number) => {
    const player = players.find(p => p.position === position);
    if (!player) return `Seat ${position}`;
    return getDisplayName(players, player, player.profiles?.username || `Seat ${position}`);
  }, [players]);

  const toCribbageCard = useCallback((card: { suit: string; rank: string }): CribbageCard => {
    // High-card selection uses the shared cardUtils deck which encodes suits as symbols.
    // Cribbage UI expects word suits. Convert symbols → words for rendering.
    const suit = (() => {
      switch (card.suit) {
        case '♠':
          return 'spades';
        case '♥':
          return 'hearts';
        case '♦':
          return 'diamonds';
        case '♣':
          return 'clubs';
        default:
          return card.suit;
      }
    })();

    const rank = card.rank;
    const value =
      rank === 'A'
        ? 14
        : rank === 'K'
          ? 13
          : rank === 'Q'
            ? 12
            : rank === 'J'
              ? 11
              : parseInt(rank, 10);

    return {
      suit: suit as CribbageCard['suit'],
      rank: card.rank as CribbageCard['rank'],
      value: Number.isFinite(value) ? value : 0,
    };
  }, []);

  // Trigger win sequence when game completes
  const triggerWinSequence = useCallback((state: CribbageState) => {
    if (!state.winnerPlayerId) {
      recordCribDoubleSkunkTrace('triggerWinSequence entry blocked:no-winner', {
        terminalEventId: terminalEventIdFor(null),
        phase: state.phase,
      });
      return;
    }
    const winKey = winKeyFor(state.winnerPlayerId);
    const guardBlocked = winSequenceFiredRef.current === winKey;
    const terminalEventId = terminalEventIdFor(state.winnerPlayerId);
    recordCribDoubleSkunkTrace('triggerWinSequence entry', {
      terminalEventId,
      winKey,
      winnerId: state.winnerPlayerId,
      payoutMultiplier: state.payoutMultiplier ?? 1,
      guardBlocked,
    });
    // [TERMINAL-CARD-CONTEXT AUDIT] Capture the exact card data + lifecycle
    // signals at the moment the win sequence fires so we can correlate with
    // CribbageFeltContent's render branch decision downstream.
    {
      const liveCs = cribbageStateRef.current;
      const countingActive = countingAnimationActiveRef.current;
      const hasCountingSnapshot = !!countingStateSnapshot;
      const inferredPath = countingActive || hasCountingSnapshot
        ? (state.lastHandCount ? 'counting-complete (handleCountingComplete)' : 'counting-frozen (reactive combo-crossing)')
        : (state.phase === 'pegging' || (state.phase === 'complete' && !state.lastHandCount && (liveCs?.phase === 'pegging')))
          ? 'pegging-win'
          : state.lastHandCount
            ? 'counting-complete (post-animation)'
            : 'fallback/unknown';
      logDebugEvent({
        gameId: 'terminal-card-context',
        eventType: 'crib:terminal:winseq_card_snapshot',
        payload: {
          winKey,
          terminalEventId,
          winnerId: state.winnerPlayerId?.slice(0, 8),
          payoutMultiplier: state.payoutMultiplier ?? 1,
          inferredTerminalPath: inferredPath,
          // Path discriminators
          countingAnimationActiveRef: countingActive,
          countingWinFrozen,
          hasCountingSnapshot,
          countingTargetIndex: countingStateSnapshot?.countingTargetIndex ?? null,
          countingBeatIndex: countingStateSnapshot?.countingBeatIndex ?? null,
          countingHandKey: countingStateSnapshot?.countingHandKey ?? null,
          // Card data on the win-state passed to the sequence
          statePhase: state.phase,
          hasLastHandCount: !!state.lastHandCount,
          peggingPlayedCardsCount: state.pegging?.playedCards?.length ?? 0,
          peggingPlayedCards: (state.pegging?.playedCards ?? []).map(pc => `${pc.card.rank}${pc.card.suit[0]}`),
          peggingSequenceStartIndex: state.pegging?.sequenceStartIndex ?? null,
          cribCards: state.crib?.length ?? 0,
          cutCard: state.cutCard ? `${state.cutCard.rank}${state.cutCard.suit[0]}` : null,
          handSizes: Object.fromEntries(
            Object.entries(state.playerStates).map(([pid, ps]) => [pid.slice(0, 8), ps.hand?.length ?? 0])
          ),
          // Comparable snapshot of live cribbageState (the one the felt actually renders from
          // via viewState — may differ from `state`)
          liveCsPhase: liveCs?.phase ?? null,
          liveCsHasLastHandCount: !!liveCs?.lastHandCount,
          liveCsPeggingCount: liveCs?.pegging?.playedCards?.length ?? 0,
        },
      });
    }
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 1
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:trigger_entry',
      payload: {
        winKey,
        winnerId: state.winnerPlayerId?.slice(0, 8),
        guardBlocked,
        firedRef: winSequenceFiredRef.current,
        scheduledRef: winSequenceScheduledRef.current,
        payoutMultiplier: state.payoutMultiplier ?? 1,
        roundId: roundId?.slice(0, 8),
        currentRoundId: currentRoundId?.slice(0, 8),
        dealerGameId: dealerGameId?.slice(0, 8),
        handNumber: currentHandNumber,
        eventId: terminalEventId,
      },
    });
    if (guardBlocked) {
      recordCribDoubleSkunkTrace('triggerWinSequence guard BLOCK', {
        terminalEventId,
        winKey,
        reason: 'winSequenceFiredRef already equals winKey',
      });
      return;
    }
    recordCribDoubleSkunkTrace('triggerWinSequence guard PASS', {
      terminalEventId,
      winKey,
    });
    winSequenceFiredRef.current = winKey;
    // Also set scheduled so other code paths can't race-trigger while this is running.
    winSequenceScheduledRef.current = winKey;

    const winnerId = state.winnerPlayerId;
    const winnerPlayer = players.find(p => p.id === winnerId);
    const winnerName = winnerPlayer 
      ? getDisplayName(players, winnerPlayer, winnerPlayer.profiles?.username || 'Player')
      : 'Player';

    const multiplier = state.payoutMultiplier || 1;
    const loserIds = players.filter(p => p.id !== winnerId).map(p => p.id);
    const amountPerLoser = anteAmount * multiplier;
    const totalWinnings = amountPerLoser * loserIds.length;

    // Chat winner message is intentionally deferred to handleAnnouncementComplete
    // so it lands with the chip transfer rather than during the overlay window.
    const winnerScore = state.playerStates[winnerId]?.pegScore ?? 0;
    const loserScores = loserIds.map(id => state.playerStates[id]?.pegScore ?? 0);
    const loserScoreStr = loserScores.join('-');
    const deferredWinnerChatMessage = `${winnerName} won the game ${winnerScore}-${loserScoreStr}!`;

    setWinSequenceData({
      winnerId,
      winnerName,
      handNumber: currentHandNumber,
      multiplier,
      amountPerLoser,
      totalWinnings,
      loserIds,
      // Stash chat message so the chip-transfer handoff can inject it.
      chatMessage: deferredWinnerChatMessage,
    });

    // Persist end-of-game to backend.
    // IMPORTANT: All clients should attempt this call because:
    // 1. In H2H the host can be the loser/offline
    // 2. endCribbageGame is idempotent (only one client will actually execute payouts via atomic DB guard)
    // 3. If we don't call it, the game gets stuck
    if (roundId && gameId) {
      console.log('[CRIBBAGE] Persisting endCribbageGame', {
        isHost,
        isWinnerClient: currentPlayerId === winnerId,
        roundId,
        gameId,
      });
      endCribbageGame(gameId, roundId, state).then((success) => {
        if (!success) {
          console.error('[CRIBBAGE] Failed to end game in database');
        } else {
          console.log('[CRIBBAGE] endCribbageGame completed successfully');
        }
      });
    } else {
      console.warn('[CRIBBAGE] Cannot persist endCribbageGame - missing roundId or gameId', {
        hasRoundId: !!roundId,
        hasGameId: !!gameId,
      });
    }

    // Confetti now runs as a continuous burst loop across the announcement +
    // chip-transfer window (see effect below keyed on winSequencePhase).
    // The one-shot confetti previously fired here faded before chip transfer.


    // Emit canonical terminal event. Skunk/double-skunk still owns the
    // centered celebration overlay, but match_win must remain alive long
    // enough for the lifecycle rail winner plate to be visible after the
    // overlay clears. Non-skunk wins have no overlay, so the rail gets a
    // short dedicated presentation window before chip transport starts.
    const skunkPayload: 'single' | 'double' | undefined =
      multiplier >= 3 ? 'double' : multiplier >= 2 ? 'single' : undefined;
    const winnerScoreVal = state.playerStates[winnerId]?.pegScore ?? 0;
    const loserLowest = state.loserScore ?? Math.min(...loserIds.map(id => state.playerStates[id]?.pegScore ?? 0));
    // Defensive: ensure no ambient (e.g. waiting_for_player /
    // dealer_selection_in_progress) is sitting under the transient
    // match_win. One announcement owner only.
    announcements.clearAmbient();
    announcements.emit({
      id: terminalEventId,
      type: 'match_win',
      scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
      payload: {
        winnerName,
        score: { winner: winnerScoreVal, loser: loserLowest },
        skunk: skunkPayload,
        amount: totalWinnings,
      },
      // Keep the winner plate alive through the FULL celebration sequence:
      // announcement window + chip transfer animation (~6s + stagger, 8s safety).
      // Scope boundary teardown (next hand / dealer game) will clear it earlier
      // if the match actually advances first.
      ttlMs: skunkPayload ? 14000 : 10000,
    });
    // Drop into terminal-overlay phase; the timer below gates chips until
    // the shell-owned overlay resolves (or near-immediately for non-skunk).
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 5
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:phase_change',
      payload: { from: 'idle', to: 'announcement', site: 'triggerWinSequence', winKey, skunk: skunkPayload, multiplier },
    });
    recordCribDoubleSkunkTrace('setWinSequencePhase idle→announcement', {
      terminalEventId,
      winKey,
      skunk: skunkPayload ?? null,
      multiplier,
    });
    setWinSequencePhase('announcement');

    // NOTE: dealerGameId intentionally OMITTED from deps. It flips to null when
    // games.current_game_uuid is cleared post-completion, which would otherwise
    // rebuild this callback, re-run the reactive complete-state effect below,
    // and (with a different winKey) bypass the local dedupe guard.
  }, [players, anteAmount, currentPlayerId, roundId, isHost, gameId, currentRoundId, injectDealerMessage, currentHandNumber, announcements, recordCribDoubleSkunkTrace, terminalEventIdFor]);

  // Ensure pegging-phase wins still trigger the win sequence (no counting animation involved).
  useEffect(() => {
    if (!cribbageState?.winnerPlayerId) return;
    if (cribbageState.phase !== 'complete') return;
    if (countingAnimationActiveRef.current) return;
    const winKey = winKeyFor(cribbageState.winnerPlayerId);
    if (winSequenceFiredRef.current === winKey || winSequenceScheduledRef.current === winKey) return;

    // Guard immediately to avoid multi-fire on rapid state churn.
    winSequenceScheduledRef.current = winKey;
    // [TERMINAL-PATH] this branch fires only when counting was never active.
    setTerminalPath('pegging');
    triggerWinSequence(cribbageState);
  }, [cribbageState?.phase, cribbageState?.winnerPlayerId, roundId, triggerWinSequence]);

  // CRITICAL: When currentRoundId changes, reset the sync framework baseline
  // so new-hand snapshots are accepted.
  // NOTE: Do NOT null out cribbageState here — that causes a full table unmount (#4).
  // Instead, keep the old state visible until the new hand's state arrives via realtime.
  const prevRoundIdRef = useRef<string>(currentRoundId);
  // Track the roundId that cribbageState belongs to, so we can detect stale-hand renders.
  const cribbageStateRoundIdRef = useRef<string>(currentRoundId);
  // Identity latch: tracks the CURRENT expected roundId for incoming snapshots.
  // Handlers from stale subscriptions/polls compare against this to reject cross-hand leaks.
  const roundIdLatchRef = useRef<string>(currentRoundId);
  useLayoutEffect(() => {
    if (currentRoundId === prevRoundIdRef.current) return;
    const oldId = prevRoundIdRef.current;
    prevRoundIdRef.current = currentRoundId;
    // Update identity latch FIRST — stale handlers check this before accepting
    roundIdLatchRef.current = currentRoundId;
    
    // Detect bootstrap boundary: roundId changing from '' (dealer selection) to a real value
    const isBootstrapTransition = !oldId || oldId === '';
    
    console.log('[CRIBBAGE] currentRoundId changed, resetting sync framework', { oldId, newId: currentRoundId, isBootstrapTransition });
    logCribbageDebug(debugCtx, 'hand_transition:roundId_change', {
      prevRoundId: oldId?.slice(0, 8),
      newRoundId: currentRoundId.slice(0, 8),
      hadCribbageState: cribbageState !== null,
      hadCountingOverrides: countingScoreOverrides !== null,
      isBootstrapTransition,
    });
    // ── Lifecycle: transition edge ──
    logDebugEvent({
      gameId,
      eventType: 'crib:lifecycle:transition_edge',
      payload: {
        instanceId: instanceIdRef.current,
        trigger: isBootstrapTransition ? 'bootstrap_roundId_init' : 'roundId_change',
        prevRoundId: oldId?.slice(0, 8),
        newRoundId: currentRoundId.slice(0, 8),
        viewStateNull: viewState === null,
        cribbageStateNull: cribbageState === null,
        currentHandKey,
        renderHandKey,
        handBoundaryKey: `${currentRoundId}-${currentHandNumber}`,
        isDealerSelection,
        ...buildMetaPayload(),
      },
    });
    // BUG B FIX: Do NOT clear countingScoreOverrides on roundId change.
    // The phase-based clearing effect (with pegScore catch-up check) will handle
    // clearing overrides safely once the authoritative state has caught up.
    // Clearing here causes the pegboard to briefly show stale pre-counting scores.
    // Reset sync framework to null — do NOT re-commit stale presentation.
    // Re-committing the old hand's state after reset causes a stale identity bounce
    // (OLD → null → OLD → NEW) that triggers cut-card re-animation and can flash
    // stale cards if the new authoritative snapshot is delayed.
    // The isTransitioning flag + cards-tab guard (renderHandKey === currentHandKey)
    // already suppress rendering when presentation is null, so no visual gap occurs.
    const hadPresentation = syncHandle.presentationState !== null;
    syncHandle.reset(null);
    // FIX A: HARD RESET cribbageState on hand boundary — stale cards are unacceptable.
    // Previous comment said "Do NOT null out cribbageState" to avoid unmount, but
    // the isTransitioning + renderHandKey guards already handle the visual gap.
    setCribbageState(null);
    cribbageStateRef.current = null;
    // NOTE: Do NOT clear countingScoreOverrides here.
    // The catch-up effect releases them once the new hand's pegScores are authoritative.
    // Clearing here causes a transient dip to the raw (lower) pegScore before rehydration.
    setCountingStateSnapshot(null);
    setCountingDelayActive(false);
    countingAnimationActiveRef.current = false;
    countingDelayFiredRef.current = null;
    countingBaselineScoresRef.current = null;
    countingHandKeyRef.current = null;
    countingIdentityRef.current = null;
    lastPeggingScoresRef.current = null;
    setPostCountingTransitionActive(false);
    // Reset win sequence state to prevent prior-hand win from leaking
    recordCribDoubleSkunkTrace('setWinSequencePhase →idle', {
      terminalEventId: terminalEventIdFor(cribbageStateRef.current?.winnerPlayerId ?? null),
      site: 'roundId_change',
      oldRoundId: oldId,
      newRoundId: currentRoundId,
    });
    setWinSequencePhase('idle');
    setWinSequenceData(null);
    setTerminalPath(null);
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 2 — guard reset enables re-fire
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:guards_reset',
      payload: {
        prevFiredRef: winSequenceFiredRef.current,
        prevScheduledRef: winSequenceScheduledRef.current,
        site: 'roundId_change',
        oldRoundId: oldId?.slice(0, 8),
        newRoundId: currentRoundId.slice(0, 8),
        handNumber: currentHandNumber,
      },
    });
    winSequenceFiredRef.current = null;
    winSequenceScheduledRef.current = null;
    // Reset initial load flag so loadOrInitializeState runs for the new round
    setInitialLoadComplete(false);
    hasInitializedRef.current = false;
    
    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-boundary-reset',
      payload: {
        oldRoundId: oldId?.slice(0, 8),
        newRoundId: currentRoundId.slice(0, 8),
        hadPresentation,
        clearedCribbageState: true,
        initialLoadComplete_before: true,
        initialLoadComplete_after: false,
        hasInitializedRef_before: true,
        hasInitializedRef_after: false,
        isBootstrapTransition,
      },
    });
    
    if (hadPresentation) {
      syncHandle.freezePresentation();
      transitionFrozenRef.current = true;
      transitionFrozenForRoundRef.current = currentRoundId;
    }
    
    // BOOTSTRAP FIX: During bootstrap transition (roundId '' → real), there is no
    // savedPresentation to freeze. If we set isTransitioning=true here, the unfreeze
    // path (which requires transitionFrozenRef.current=true) will never clear it,
    // permanently blocking the cards tab. Skip the transition flag for bootstrap.
    if (isBootstrapTransition) {
      logDebugEvent({
        gameId,
        eventType: 'crib:lifecycle:bootstrap_skip_transition',
        payload: {
          instanceId: instanceIdRef.current,
          reason: 'no_saved_presentation_during_bootstrap',
          hadPresentationBeforeReset: !hadPresentation,
          transitionFrozenRef: transitionFrozenRef.current,
        },
      });
      // Do NOT set isTransitioning — the loadOrInitializeState effect will
      // populate viewState shortly, and cards tab should render normally.
    } else {
      setIsTransitioning(true);
    }
    
    logCribbageDebug(debugCtx, 'hand_transition:sync_reset', {
      newRoundId: currentRoundId.slice(0, 8),
      frozenPresentation: hadPresentation,
      isBootstrapTransition,
      isTransitioningSet: !isBootstrapTransition,
      instanceId: instanceIdRef.current,
    });
  }, [currentRoundId]);

  // Realtime subscription with polling fallback
  // This ensures updates are received even if WebSocket connection degrades
  useEffect(() => {
    if (!currentRoundId) return;

    let pollInterval = 2000; // Start at 2 seconds
    let pollTimeoutId: ReturnType<typeof setTimeout>;
    let lastSyncTimestamp: string | null = null;
    let isActive = true;

    // Handler for state updates (from realtime or polling) — routes through sync framework.
    const handleStateUpdate = (newCribbageState: CribbageState, fromRealtime: boolean) => {
      if (!isActive) return;
      
      const source = fromRealtime ? 'realtime' : 'poll';
      const traceId = newTraceId();
      
      // ── Identity latch guard ──
      // If the roundId for this handler (captured at subscription creation) no longer
      // matches the live latch, this is a stale tail-end event. Drop it.
      if (roundIdLatchRef.current !== currentRoundId) {
        logCribbageDebug(debugCtx, 'snapshot_dropped:identity_latch', {
          source,
          handlerRoundId: currentRoundId?.slice(0, 8),
          latchRoundId: roundIdLatchRef.current?.slice(0, 8),
          phase: newCribbageState.phase,
        }, traceId);
        logDebugEvent({
          gameId,
          eventType: 'crib:identity_latch_drop',
          payload: {
            source,
            handlerRoundId: currentRoundId?.slice(0, 8),
            latchRoundId: roundIdLatchRef.current?.slice(0, 8),
            phase: newCribbageState.phase,
          },
        });
        return;
      }

      // ── Auth-vs-snapshot identity gate ──
      // Snapshot identity is the currentRoundId this listener is scoped to.
      // If auth has advanced past us, the snapshot is stale. If snapshot is for
      // a round auth has not yet reached, it is a "future" snapshot from a
      // newly-spawned per-round subscription that has not yet been re-keyed.
      const authNow = authIdentityRef.current;
      if (authNow && authNow.roundId && currentRoundId && authNow.roundId !== currentRoundId) {
        const authHand = authNow.handNumber ?? -1;
        const isStale = authHand > currentHandNumber;
        const eventName = isStale ? 'crib-snapshot-rejected-stale' : 'crib-snapshot-rejected-future';
        try {
          persistSyncDebugEvent({
            gameId,
            gameType: 'cribbage',
            handNumber: currentHandNumber,
            roundId: currentRoundId,
            eventType: 'invariant',
            severity: 'warn',
            eventName,
            payload: {
              source,
              snapshotRoundId: currentRoundId?.slice(0, 8),
              authRoundId: authNow.roundId?.slice(0, 8),
              authHand: authNow.handNumber,
              currentHand: currentHandNumber,
              phase: newCribbageState.phase,
            },
          });
        } catch {}
        logCribbageDebug(debugCtx, eventName, {
          snapshotRoundId: currentRoundId?.slice(0, 8),
          authRoundId: authNow.roundId?.slice(0, 8),
          phase: newCribbageState.phase,
        }, traceId);
        return;
      }

      // Log snapshot received
      logCribbageDebug(debugCtx, `snapshot_received:${source}`, cribbageStateSummary(newCribbageState), traceId);
      
      // Route through sync framework — it handles stale rejection, optimistic clearing, etc.
      const result = syncHandle.receiveAuthoritativeUpdate(newCribbageState);
      
      // Log accept/reject
      logCribbageDebug(debugCtx, result.accepted ? 'snapshot_accepted' : 'snapshot_rejected', {
        reason: result.reason,
        prevVector: result.previousProgress,
        incomingVector: result.incomingProgress,
        comparison: result.comparison,
        source,
      }, traceId);

      // Phase 2 production test hook — deterministic accept/reject events.
      try {
        persistSyncDebugEvent({
          gameId, gameType: 'cribbage',
          handNumber: currentHandNumber,
          roundId: currentRoundId,
          eventType: result.accepted ? 'transition' : 'invariant',
          severity: result.accepted ? 'info' : 'warn',
          eventName: result.accepted ? 'crib-snapshot-accepted' : 'crib-snapshot-rejected-progress',
          payload: {
            source,
            reason: result.reason,
            phase: newCribbageState.phase,
            snapshotRoundId: currentRoundId?.slice(0, 8),
            authRoundId: authIdentityRef.current?.roundId?.slice(0, 8) ?? null,
          },
        });
      } catch {}
      
      if (result.accepted) {
        // Update the legacy cribbageState/ref for components that still read it directly
        setCribbageState(newCribbageState);
        
        // If presentation was frozen during hand transition, unfreeze ONLY if this
        // snapshot belongs to the NEW round we froze for — not a stale tail-end snapshot.
        const wasTransitionFrozen = transitionFrozenRef.current;
        if (wasTransitionFrozen) {
          const frozenForRound = transitionFrozenForRoundRef.current;
          const snapshotMatchesNewRound = !frozenForRound || frozenForRound === currentRoundId;
          if (snapshotMatchesNewRound) {
            transitionFrozenRef.current = false;
            transitionFrozenForRoundRef.current = null;
            syncHandle.unfreezePresentation();
            setIsTransitioning(false);
            logCribbageDebug(debugCtx, 'hand_transition:unfrozen', {
              frozenForRound: frozenForRound?.slice(0, 8),
              currentRoundId: currentRoundId?.slice(0, 8),
              snapshotPhase: newCribbageState.phase,
            });
          } else {
            logCribbageDebug(debugCtx, 'hand_transition:unfreeze_skipped_wrong_round', {
              frozenForRound: frozenForRound?.slice(0, 8),
              currentRoundId: currentRoundId?.slice(0, 8),
              snapshotPhase: newCribbageState.phase,
            });
          }
        }
        
        // ── Lifecycle: accepted snapshot — bootstrap card hydration trace ──
        const playerHandSizes: Record<string, number> = {};
        for (const [pid, ps] of Object.entries(newCribbageState.playerStates)) {
          playerHandSizes[pid.slice(0, 8)] = ps.hand?.length ?? 0;
        }
        logDebugEvent({
          gameId,
          eventType: 'crib:lifecycle:snapshot_accepted',
          payload: {
            instanceId: instanceIdRef.current,
            source,
            transitionUnfrozen: wasTransitionFrozen,
            phase: newCribbageState.phase,
            handNumber: currentHandNumber,
            roundId: currentRoundId?.slice(0, 8),
            renderHandKey,
            viewStateWasNull: viewState === null,
            isTransitioning,
            transitionFrozenRef: transitionFrozenRef.current,
            isDealerSelection,
            playerHandSizes,
            dealerGameId: dealerGameId?.slice(0, 8) ?? null,
          },
        });
        
        // ── Bootstrap stale-state detection ──
        // If dealerGameId exists and we just accepted a snapshot, but isTransitioning
        // is still true without a matching freeze, that's the bootstrap bug.
        if (dealerGameId && isTransitioning && !transitionFrozenRef.current) {
          logDebugEvent({
            gameId,
            eventType: 'crib:lifecycle:BOOTSTRAP_STALE_DETECTED',
            payload: {
              instanceId: instanceIdRef.current,
              reason: 'isTransitioning=true with no freeze to unfreeze',
              dealerGameId: dealerGameId.slice(0, 8),
              phase: newCribbageState.phase,
              playerHandSizes,
              isTransitioning: true,
              transitionFrozenRef: false,
            },
          });
        }
      }

      // FREEZE LATCH SAFETY: Even if the snapshot was rejected (e.g., no-progress vs
      // current presentation), if the freeze is still held for the round identity that
      // the snapshot belongs to, release it. Identity has caught up — there is no
      // reason to keep last-good frozen presentation past the new round's first snapshot,
      // regardless of arrival path (realtime, poll, optimistic-confirm, reconnect).
      if (!result.accepted && transitionFrozenRef.current) {
        const frozenForRound = transitionFrozenForRoundRef.current;
        if (frozenForRound && frozenForRound === currentRoundId) {
          transitionFrozenRef.current = false;
          transitionFrozenForRoundRef.current = null;
          syncHandle.unfreezePresentation();
          setIsTransitioning(false);
          logCribbageDebug(debugCtx, 'hand_transition:unfrozen_on_rejected_snapshot', {
            frozenForRound: frozenForRound.slice(0, 8),
            currentRoundId: currentRoundId?.slice(0, 8),
            snapshotPhase: newCribbageState.phase,
            rejectReason: result.reason,
          });
        }
      }
      
      // Reset poll interval when realtime works
      if (fromRealtime) {
        pollInterval = 2000;
      }
    };

    // Use a simple state signature since rounds doesn't have updated_at
    // Include sequenceStartIndex to detect Go resets and crib length for discard detection
    const getStateSignature = (state: CribbageState): string => {
      return `${state.phase}-${state.pegging.playedCards.length}-${state.pegging.currentCount}-${state.pegging.currentTurnPlayerId}-${state.pegging.sequenceStartIndex ?? 0}-${state.crib.length}`;
    };

    // Primary: Realtime subscription
    const channel = supabase
      .channel(`cribbage-mobile-${currentRoundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${currentRoundId}`,
        },
        (payload) => {
          const newState = payload.new as { cribbage_state?: CribbageState };
          if (newState.cribbage_state) {
            lastSyncTimestamp = getStateSignature(newState.cribbage_state);
            handleStateUpdate(newState.cribbage_state, true);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[CRIBBAGE_REALTIME] Channel error, relying on polling fallback:', err);
          // Polling will continue as fallback
        }
      });

    // Fallback: Polling with exponential backoff

    const poll = async () => {
      if (!isActive) return;

      try {
        const { data, error } = await supabase
          .from('rounds')
          .select('cribbage_state')
          .eq('id', currentRoundId)
          .single();

        if (error || !data?.cribbage_state) {
          // Backoff on errors
          pollInterval = Math.min(pollInterval * 1.3, 8000);
        } else {
          // Check if data has changed using state signature
          const newState = data.cribbage_state as unknown as CribbageState;
          const newSignature = getStateSignature(newState);
          const hasNewData = !lastSyncTimestamp || newSignature !== lastSyncTimestamp;
          
          if (hasNewData) {
            lastSyncTimestamp = newSignature;
            handleStateUpdate(newState, false);
            pollInterval = 2000; // Reset on new data
          } else {
            // Backoff when no changes (max 5 seconds to stay responsive during pegging)
            pollInterval = Math.min(pollInterval * 1.2, 5000);
          }
        }
      } catch (err) {
        console.error('[CRIBBAGE_POLL] Poll error:', err);
        pollInterval = Math.min(pollInterval * 1.3, 8000);
      }

      if (isActive) {
        pollTimeoutId = setTimeout(poll, pollInterval);
      }
    };

    // Start polling after initial delay (let realtime work first)
    pollTimeoutId = setTimeout(poll, pollInterval);

    return () => {
      isActive = false;
      clearTimeout(pollTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [currentRoundId]); // CRITICAL: Only depend on currentRoundId to prevent channel teardown on unrelated state changes

  // REMOVED: Initial load win trigger - all win sequences now go through counting animation.
  // If a game is rejoined in 'complete' state, the counting animation snapshot logic will handle it.

  // Detect hand transitions — clear transitioning flag when new hand state arrives
  useEffect(() => {
    if (!currentHandKey) return;
    
    if (lastHandKeyRef.current && lastHandKeyRef.current !== currentHandKey) {
      setIsTransitioning(false);
      cribbageStateRoundIdRef.current = currentRoundId;
      logCribbageDebug(debugCtx, 'hand_transition:new_hand_arrived', {
        newHandKey: currentHandKey.slice(0, 30),
        roundId: currentRoundId.slice(0, 8),
        viewStateAvailable: viewState !== null,
      });
    }
    
    lastHandKeyRef.current = currentHandKey;
  }, [currentHandKey]);

  // sequenceStartIndex is now derived directly from cribbageState.pegging.sequenceStartIndex
  // No local tracking needed - the state is authoritative

  // Log counting phase events (fire-and-forget).
  // IMPORTANT: on some clients the state may transition counting -> complete very fast,
  // so we allow logging from either phase.
  const countingLoggedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cribbageState || !eventCtx) return;
    const phase = cribbageState.phase;
    if (phase !== 'counting' && phase !== 'complete') {
      countingLoggedKeyRef.current = null;
      return;
    }
    if (!cribbageState.cutCard) return;

    const key = `${roundId}:${cribbageState.dealerPlayerId}:${cribbageState.pegging.playedCards.length}:${cribbageState.cutCard.rank}${cribbageState.cutCard.suit}`;
    if (countingLoggedKeyRef.current === key) return;
    countingLoggedKeyRef.current = key;

    // Use the cached pegging-phase scores as the authoritative baseline.
    // The reverse-engineering approach (subtracting hand+crib totals from pegScore) is unreliable
    // because pegScore may already include counting points by the time this effect fires.
    const runningScores: Record<string, number> = {};
    const cachedPeggingScores = lastPeggingScoresRef.current;
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      runningScores[playerId] = cachedPeggingScores?.[playerId] ?? ps.pegScore ?? 0;
    }

    // Log all hand and crib scoring events (atomic DB guard prevents duplicates)
    logCountingScoringEvents(eventCtx, cribbageState, players, runningScores);
  }, [cribbageState?.phase, eventCtx, players]);

  // Ref to track latest handleGo callback for use in auto-go effect
  // This avoids stale closure issues where old handleGo had null eventCtx
  const handleGoRef = useRef<(() => void) | null>(null);

  // Bot logic
  const botActionInProgress = useRef(false);

  useEffect(() => {
    if (!cribbageState || isProcessing || botActionInProgress.current) return;
    if (cribbageState.phase === 'complete') return;

    const processBotActions = async () => {
      if (cribbageState.phase === 'discarding') {
        for (const player of players) {
          if (!player.is_bot) continue;
          
          const botState = cribbageState.playerStates[player.id];
          if (!botState || botState.discardedToCrib.length > 0) continue;
          
          botActionInProgress.current = true;
          
          const isDealer = player.id === cribbageState.dealerPlayerId;
          const discardIndices = getBotDiscardIndices(botState.hand, players.length, isDealer);
          
          await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
          
          try {
            // Use atomic RPC to prevent lost-update races with concurrent human discards
            const { data: mergedRaw, error: rpcError } = await supabase.rpc(
              'cribbage_apply_discard',
              {
                _round_id: roundId,
                _player_id: player.id,
                _card_indices: discardIndices,
              }
            );
            if (rpcError) throw rpcError;
            const merged = mergedRaw as unknown as CribbageState | null;
            // If both players have now discarded, advance to cutting (guarded conditional)
            if (merged && merged.phase === 'discarding') {
              const expected = Object.keys(merged.playerStates).length === 2 ? 2 : 1;
              const allDone = Object.values(merged.playerStates).every(
                ps => ps.discardedToCrib.length === expected
              );
              if (allDone) {
                const { advanceCribbageToCutting } = await import('@/lib/cribbageGameLogic');
                const advanced = advanceCribbageToCutting(merged);
                await supabase
                  .from('rounds')
                  .update({ cribbage_state: JSON.parse(JSON.stringify(advanced)) })
                  .eq('id', roundId)
                  .eq('cribbage_state->>phase', 'discarding');
              }
            }
          } catch (err) {
            console.error('[CRIBBAGE BOT] Discard error:', err);
          } finally {
            botActionInProgress.current = false;
          }
          return;
        }
      }

      if (cribbageState.phase === 'pegging') {
        const currentTurnId = cribbageState.pegging.currentTurnPlayerId;
        if (!currentTurnId) return;

        const currentTurnPlayer = players.find(p => p.id === currentTurnId);
        if (!currentTurnPlayer?.is_bot) return;

        const botState = cribbageState.playerStates[currentTurnId];
        if (!botState) return;

        const traceCtx = { gameId, roundId: roundId ?? null, handNumber: currentHandNumber, actorPlayerId: currentTurnId };
        traceGoRace(traceCtx, 'bot-effect:entered', {
          botActionInProgress: botActionInProgress.current,
          readSnapshot: peggingSnapshot(cribbageState),
          botHandSize: botState.hand.length,
        });

        botActionInProgress.current = true;

        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

        try {
          // P0 concurrency guard — snapshot identity captured at read time.
          // A stale bot write must not overwrite a newer human Go/play/reset
          // that landed between our read and write. We enforce optimistic
          // concurrency via JSONB predicates: if any of (phase,
          // currentTurnPlayerId, currentCount) has moved, the UPDATE
          // matches 0 rows and we bail. The bot effect will re-evaluate
          // on the next authoritative snapshot.
          const guardCurrentTurnId = cribbageState.pegging.currentTurnPlayerId;
          const guardCurrentCount = cribbageState.pegging.currentCount;
          const guardPlayedLen = cribbageState.pegging.playedCards.length;
          const guardGoLen = cribbageState.pegging.goCalledBy.length;

          if (shouldBotCallGo(botState, cribbageState.pegging.currentCount)) {
            traceGoRace(traceCtx, 'bot:callGo:before-write', {
              readSnapshot: peggingSnapshot(cribbageState),
            });
            const newState = callGo(cribbageState, currentTurnId);
            traceGoRace(traceCtx, 'bot:callGo:computed', {
              wroteSnapshot: peggingSnapshot(newState),
            });
            // Fire-and-forget event logging (atomic DB guard prevents duplicates)
            logGoPointEvent(eventCtx, cribbageState, newState);

            const { data: writeRows, error: writeErr } = await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId)
              .eq('cribbage_state->>phase', 'pegging')
              .eq('cribbage_state->pegging->>currentTurnPlayerId', guardCurrentTurnId as string)
              .eq('cribbage_state->pegging->>currentCount', String(guardCurrentCount))
              .select('id');
            const staleGo = !writeErr && (!writeRows || writeRows.length === 0);
            traceGoRace(traceCtx, 'bot:callGo:after-write', {
              ok: !writeErr && !staleGo,
              error: writeErr?.message ?? null,
              stale: staleGo,
              guard: { guardCurrentTurnId, guardCurrentCount, guardPlayedLen, guardGoLen },
            });
            if (staleGo) {
              console.warn('[CRIBBAGE BOT] callGo rejected by concurrency predicate — snapshot stale.');
            }
          } else {
            const cardIndex = getBotPeggingCardIndex(
              botState,
              cribbageState.pegging.currentCount,
              cribbageState.pegging.playedCards
            );

            if (cardIndex !== null) {
              const cardPlayed = botState.hand[cardIndex];
              traceGoRace(traceCtx, 'bot:playCard:before-write', {
                cardIndex, cardPlayed,
                readSnapshot: peggingSnapshot(cribbageState),
              });
              const newState = playPeggingCard(cribbageState, currentTurnId, cardIndex);
              traceGoRace(traceCtx, 'bot:playCard:computed', {
                wroteSnapshot: peggingSnapshot(newState),
              });
              // Fire-and-forget event logging (atomic DB guard prevents duplicates)
              logPeggingPlay(eventCtx, cribbageState, newState, currentTurnId, cardPlayed);
              // Check for his_heels on phase transition
              if (newState.lastEvent?.type === 'his_heels') {
                logHisHeelsEvent(eventCtx, newState);
              }

              const { data: writeRows, error: writeErr } = await supabase
                .from('rounds')
                .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
                .eq('id', roundId)
                .eq('cribbage_state->>phase', 'pegging')
                .eq('cribbage_state->pegging->>currentTurnPlayerId', guardCurrentTurnId as string)
                .eq('cribbage_state->pegging->>currentCount', String(guardCurrentCount))
                .select('id');
              const stalePlay = !writeErr && (!writeRows || writeRows.length === 0);
              traceGoRace(traceCtx, 'bot:playCard:after-write', {
                ok: !writeErr && !stalePlay,
                error: writeErr?.message ?? null,
                stale: stalePlay,
                guard: { guardCurrentTurnId, guardCurrentCount, guardPlayedLen, guardGoLen },
              });
              if (stalePlay) {
                console.warn('[CRIBBAGE BOT] playPeggingCard rejected by concurrency predicate — snapshot stale.');
              }
            } else {
              traceGoRace(traceCtx, 'bot:no-action', {
                reason: 'shouldCallGo=false and getBotPeggingCardIndex=null',
                readSnapshot: peggingSnapshot(cribbageState),
              });
            }
          }
        } catch (err) {
          console.error('[CRIBBAGE BOT] Pegging error:', err);
          traceGoRace(traceCtx, 'bot:error', { message: (err as Error).message });
        } finally {
          botActionInProgress.current = false;
        }
      }
    };

    const timeout = setTimeout(processBotActions, 100);
    return () => clearTimeout(timeout);
  }, [cribbageState, isProcessing, players, roundId]);

  const updateState = async (newState: CribbageState, traceId?: string) => {
    if (!currentRoundId) return;
    setIsProcessing(true);
    
    const tid = traceId ?? newTraceId();
    logCribbageDebug(debugCtx, 'optimistic_applied', cribbageStateSummary(newState), tid);
    
    // Apply optimistic state through sync framework
    syncHandle.applyOptimistic(newState);
    setCribbageState(newState);
    
    logCribbageDebug(debugCtx, 'db_write_start', cribbageStateSummary(newState), tid);
    
    try {
      const { error } = await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', currentRoundId);

      if (error) throw error;
      
      logCribbageDebug(debugCtx, 'db_write_success', {}, tid);
      
      // Immediate authoritative promotion — prevents stale snapshots from overwriting
      syncHandle.receiveAuthoritativeUpdate(newState);
    } catch (err) {
      console.error('[CRIBBAGE] Error updating state:', err);
      logCribbageDebug(debugCtx, 'db_write_failure', { error: (err as Error).message }, tid);
      toast.error('Failed to update game state');
      syncHandle.clearOptimistic();
      // On failure, force-refetch from DB to get authoritative state
      try {
        const { data } = await supabase
          .from('rounds')
          .select('cribbage_state')
          .eq('id', currentRoundId)
          .single();
        if (data?.cribbage_state) {
          const freshState = data.cribbage_state as unknown as CribbageState;
          setCribbageState(freshState);
          syncHandle.receiveAuthoritativeUpdate(freshState);
        }
      } catch { /* ignore refetch errors */ }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = useCallback(async (cardIndices: number[]) => {
    if (!cribbageState || !currentPlayerId || !currentRoundId) return;

    // ── Centralized stale-action containment (Phase 2) ──
    {
      const verdict = evaluateWriterIdentity('discard');
      if (!verdict.ok) {
        try {
          persistSyncDebugEvent({
            gameId, gameType: 'cribbage',
            handNumber: currentHandNumber, roundId: currentRoundId,
            eventType: 'invariant', severity: 'warn',
            eventName: 'crib-action-suppressed-stale-identity',
            payload: { ...verdict.divergence, suppressReason: verdict.reason, cardIndices },
          });
        } catch {}
        toast.error('Hand updating — try again');
        return;
      }
    }

    const tid = newTraceId();
    logCribbageDebug(debugCtx, 'input:discard', { cardIndices, phase: cribbageState.phase }, tid);

    setIsProcessing(true);
    try {
      // Atomic server-side merge: prevents lost-update races between two players
      // discarding simultaneously. Server locks the round row, validates phase
      // and ownership, and merges only this player's discard into the existing state.
      const { data: mergedRaw, error: rpcError } = await supabase.rpc(
        'cribbage_apply_discard',
        {
          _round_id: currentRoundId,
          _player_id: currentPlayerId,
          _card_indices: cardIndices,
        }
      );

      if (rpcError) {
        console.error('[CRIBBAGE] Discard RPC failed:', rpcError);
        toast.error(rpcError.message || 'Failed to discard');
        return;
      }

      const merged = mergedRaw as unknown as CribbageState;
      if (!merged) return;

      // Promote authoritative state immediately
      syncHandle.receiveAuthoritativeUpdate(merged);
      setCribbageState(merged);
      logCribbageDebug(debugCtx, 'db_write_success', cribbageStateSummary(merged), tid);

      // If both players have now discarded, advance to cutting phase.
      // Phase advancement is intentionally client-side because it requires RNG
      // (cut card selection). Guarded by a phase='discarding' conditional update
      // so only one client's advancement wins.
      if (merged.phase === 'discarding') {
        const expected = Object.keys(merged.playerStates).length === 2 ? 2 : 1;
        const allDone = Object.values(merged.playerStates).every(
          ps => ps.discardedToCrib.length === expected
        );
        if (allDone) {
          // discardToCrib with empty indices would no-op; instead synthesize the
          // cutting transition by re-running discardToCrib with the LAST discarder's
          // payload — but a cleaner path: call discardToCrib only if our discard
          // was the one that completed. We already merged; just construct the next
          // state by invoking the local logic on a state where this player is the
          // "last to discard". Since merged already has both discards applied,
          // we need a dedicated advance helper. Use a conditional update.
          // Lazy import to avoid circular ref.
          const { advanceCribbageToCutting } = await import('@/lib/cribbageGameLogic');
          const advanced = advanceCribbageToCutting(merged);
          await supabase
            .from('rounds')
            .update({ cribbage_state: JSON.parse(JSON.stringify(advanced)) })
            .eq('id', currentRoundId)
            .eq('cribbage_state->>phase', 'discarding');
        }
      }
    } catch (err) {
      console.error('[CRIBBAGE] handleDiscard error:', err);
      toast.error((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }, [cribbageState, currentPlayerId, currentRoundId, debugCtx, evaluateWriterIdentity]);

  const handlePlayCard = useCallback(async (cardIndex: number) => {
    if (!cribbageState || !currentPlayerId || !currentRoundId) return;

    {
      const verdict = evaluateWriterIdentity('play_card');
      if (!verdict.ok) {
        try {
          persistSyncDebugEvent({
            gameId, gameType: 'cribbage',
            handNumber: currentHandNumber, roundId: currentRoundId,
            eventType: 'invariant', severity: 'warn',
            eventName: 'crib-action-suppressed-stale-identity',
            payload: { ...verdict.divergence, suppressReason: verdict.reason, cardIndex },
          });
        } catch {}
        toast.error('Hand updating — try again');
        return;
      }
    }

    const tid = newTraceId();
    logCribbageDebug(debugCtx, 'input:play_card', { cardIndex, phase: cribbageState.phase, turn: cribbageState.pegging.currentTurnPlayerId?.slice(0, 8) }, tid);

    try {
      // CRITICAL: Fetch the latest state from DB to prevent stale state issues
      // This guards against race conditions where bot's move hasn't propagated yet
      const { data: freshRound, error: fetchError } = await supabase
        .from('rounds')
        .select('cribbage_state')
        .eq('id', currentRoundId)
        .single();
      
      if (fetchError || !freshRound?.cribbage_state) {
        console.error('[CRIBBAGE] Failed to fetch fresh state before play:', fetchError);
        toast.error('Failed to sync game state. Try again.');
        return;
      }
      
      const freshState = freshRound.cribbage_state as unknown as CribbageState;
      
      // Verify it's still our turn with fresh state
      if (freshState.pegging.currentTurnPlayerId !== currentPlayerId) {
        console.warn('[CRIBBAGE] Stale state detected - not our turn in fresh state');
        syncHandle.receiveAuthoritativeUpdate(freshState);
        setCribbageState(freshState);
        toast.error('Wait for your turn');
        return;
      }
      
      // Verify the card is still playable with fresh state
      const freshPlayerState = freshState.playerStates[currentPlayerId];
      if (!freshPlayerState || cardIndex >= freshPlayerState.hand.length) {
        console.warn('[CRIBBAGE] Card index invalid in fresh state');
        syncHandle.receiveAuthoritativeUpdate(freshState);
        setCribbageState(freshState);
        toast.error('Card no longer available');
        return;
      }
      
      const cardPlayed = freshPlayerState.hand[cardIndex];
      const humanTraceCtx = { gameId, roundId: currentRoundId, handNumber: currentHandNumber, actorPlayerId: currentPlayerId };
      traceGoRace(humanTraceCtx, 'human:playCard:before-write', {
        cardIndex, cardPlayed,
        subscriptionSnapshot: peggingSnapshot(cribbageState),
        freshSnapshot: peggingSnapshot(freshState),
      });
      const newState = playPeggingCard(freshState, currentPlayerId, cardIndex);
      traceGoRace(humanTraceCtx, 'human:playCard:computed', {
        wroteSnapshot: peggingSnapshot(newState),
      });
      // Fire-and-forget event logging (atomic DB guard prevents duplicates)
      if (cardPlayed) {
        logPeggingPlay(eventCtx, freshState, newState, currentPlayerId, cardPlayed);
      }
      // Check for his_heels on phase transition
      if (newState.lastEvent?.type === 'his_heels') {
        logHisHeelsEvent(eventCtx, newState);
      }
      
      await updateState(newState, tid);
      traceGoRace(humanTraceCtx, 'human:playCard:after-write', {
        wroteSnapshot: peggingSnapshot(newState),
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId, currentRoundId, eventCtx, debugCtx, evaluateWriterIdentity]);

  const handleGo = useCallback(async () => {
    if (!cribbageState || !currentPlayerId || !currentRoundId) return;

    {
      const verdict = evaluateWriterIdentity('go');
      if (!verdict.ok) {
        try {
          persistSyncDebugEvent({
            gameId, gameType: 'cribbage',
            handNumber: currentHandNumber, roundId: currentRoundId,
            eventType: 'invariant', severity: 'warn',
            eventName: 'crib-action-suppressed-stale-identity',
            payload: { ...verdict.divergence, suppressReason: verdict.reason },
          });
        } catch {}
        return;
      }
    }

    const tid = newTraceId();
    logCribbageDebug(debugCtx, 'input:go', { phase: cribbageState.phase, count: cribbageState.pegging.currentCount }, tid);

    const goTraceCtx = { gameId, roundId: currentRoundId, handNumber: currentHandNumber, actorPlayerId: currentPlayerId };
    traceGoRace(goTraceCtx, 'human:handleGo:entered', {
      subscriptionSnapshot: peggingSnapshot(cribbageState),
    });

    try {
      // CRITICAL: Fetch fresh state from DB to prevent stale subscription state issues.
      // Same pattern as handlePlayCard - prevents missed Go points when subscription
      // state is slightly behind the authoritative DB state.
      const { data: freshRound, error: fetchError } = await supabase
        .from('rounds')
        .select('cribbage_state')
        .eq('id', currentRoundId)
        .single();
      
      if (fetchError || !freshRound?.cribbage_state) {
        console.error('[CRIBBAGE] Failed to fetch fresh state before Go:', fetchError);
        traceGoRace(goTraceCtx, 'human:handleGo:fresh-fetch-failed', { error: fetchError?.message ?? null });
        // Fall back to subscription state
        const newState = callGo(cribbageState, currentPlayerId);
        logGoPointEvent(eventCtx, cribbageState, newState);
        await updateState(newState, tid);
        return;
      }
      
      const freshState = freshRound.cribbage_state as unknown as CribbageState;
      traceGoRace(goTraceCtx, 'human:handleGo:fresh-fetched', {
        freshSnapshot: peggingSnapshot(freshState),
      });
      
      // Verify it's still our turn with fresh state
      if (freshState.pegging.currentTurnPlayerId !== currentPlayerId) {
        console.warn('[CRIBBAGE] Stale state detected for Go - not our turn in fresh state');
        traceGoRace(goTraceCtx, 'human:handleGo:bail', {
          reason: 'not-our-turn-in-fresh',
          freshTurn: freshState.pegging.currentTurnPlayerId?.slice(0, 8) ?? null,
        });
        syncHandle.receiveAuthoritativeUpdate(freshState);
        setCribbageState(freshState);
        return;
      }
      
      // Verify we still can't play with fresh state
      const freshPlayerState = freshState.playerStates[currentPlayerId];
      if (!freshPlayerState) {
        console.warn('[CRIBBAGE] Player state not found in fresh state for Go');
        traceGoRace(goTraceCtx, 'human:handleGo:bail', { reason: 'no-player-state-in-fresh' });
        syncHandle.receiveAuthoritativeUpdate(freshState);
        setCribbageState(freshState);
        return;
      }
      
      // If fresh state shows we CAN play, don't call Go - update local state instead
      if (hasPlayableCard(freshPlayerState.hand, freshState.pegging.currentCount)) {
        console.warn('[CRIBBAGE] Fresh state shows playable card - skipping Go');
        traceGoRace(goTraceCtx, 'human:handleGo:bail', {
          reason: 'fresh-state-has-playable-card',
          freshCount: freshState.pegging.currentCount,
          freshHand: freshPlayerState.hand,
        });
        syncHandle.receiveAuthoritativeUpdate(freshState);
        setCribbageState(freshState);
        return;
      }
      
      traceGoRace(goTraceCtx, 'human:callGo:before-write', {
        freshSnapshot: peggingSnapshot(freshState),
      });
      const newState = callGo(freshState, currentPlayerId);
      traceGoRace(goTraceCtx, 'human:callGo:computed', {
        wroteSnapshot: peggingSnapshot(newState),
      });
      // Fire-and-forget event logging (atomic DB guard prevents duplicates)
      logGoPointEvent(eventCtx, freshState, newState);
      
      await updateState(newState, tid);
      traceGoRace(goTraceCtx, 'human:callGo:after-write', {
        wroteSnapshot: peggingSnapshot(newState),
      });
    } catch (err) {
      toast.error((err as Error).message);
      traceGoRace(goTraceCtx, 'human:handleGo:error', { message: (err as Error).message });
    }
  }, [cribbageState, currentPlayerId, currentRoundId, eventCtx, debugCtx, evaluateWriterIdentity]);

  // Keep handleGoRef updated to the latest callback
  useEffect(() => {
    handleGoRef.current = handleGo;
  }, [handleGo]);

  // Auto-go: Automatically call Go when player can't play any cards
  // Uses ref to avoid stale closure issues - ensures eventCtx is always current
  useEffect(() => {
    if (!cribbageState || !currentPlayerId) return;
    const autoCtx = { gameId, roundId: currentRoundId ?? null, handNumber: currentHandNumber, actorPlayerId: currentPlayerId };
    const peg = cribbageState.pegging;
    const myState = cribbageState.playerStates[currentPlayerId];
    const baseDeps = {
      phase: cribbageState.phase,
      isProcessing,
      currentTurnPlayerId: peg?.currentTurnPlayerId?.slice(0, 8) ?? null,
      currentCount: peg?.currentCount,
      goCalledBy: (peg?.goCalledBy ?? []).map(id => id.slice(0, 8)),
      myPlayerId: currentPlayerId.slice(0, 8),
      myHandSize: myState?.hand.length ?? null,
      handleGoRefSet: !!handleGoRef.current,
    };
    traceGoRace(autoCtx, 'auto-go:effect-entered', baseDeps);

    if (isProcessing) { traceGoRace(autoCtx, 'auto-go:bail', { reason: 'isProcessing', ...baseDeps }); return; }
    if (cribbageState.phase !== 'pegging') { traceGoRace(autoCtx, 'auto-go:bail', { reason: 'not-pegging', ...baseDeps }); return; }
    if (peg.currentTurnPlayerId !== currentPlayerId) { traceGoRace(autoCtx, 'auto-go:bail', { reason: 'not-our-turn', ...baseDeps }); return; }
    if (!myState) { traceGoRace(autoCtx, 'auto-go:bail', { reason: 'no-my-state', ...baseDeps }); return; }
    
    const canPlay = hasPlayableCard(myState.hand, peg.currentCount);
    if (!canPlay && myState.hand.length > 0) {
      traceGoRace(autoCtx, 'auto-go:armed', { ...baseDeps, hand: myState.hand });
      const timeout = setTimeout(() => {
        traceGoRace(autoCtx, 'auto-go:timeout-fired', {
          handleGoRefSet: !!handleGoRef.current,
        });
        handleGoRef.current?.();
      }, 500);
      return () => clearTimeout(timeout);
    } else {
      traceGoRace(autoCtx, 'auto-go:no-action', {
        reason: canPlay ? 'has-playable-card' : 'empty-hand',
        ...baseDeps, hand: myState.hand,
      });
    }
  }, [cribbageState?.pegging.currentTurnPlayerId, cribbageState?.pegging.currentCount, currentPlayerId, isProcessing]);

  // ── Persist counting progress to DB (fire-and-forget) ────────────
  // Called by CribbageCountingPhase whenever target/combo advances.
  const handleCountingProgressUpdate = useCallback((targetIndex: number, beatIndex: number) => {
    if (!currentRoundId) return;
    const handKey = countingHandKeyRef.current;
    
    // Lightweight DB write — only update the counting progress fields
    supabase
      .from('rounds')
      .select('cribbage_state')
      .eq('id', currentRoundId)
      .single()
      .then(({ data, error }) => {
        if (error || !data?.cribbage_state) return;
        const state = data.cribbage_state as unknown as CribbageState;
        // Only write if handKey matches (prevent cross-hand writes)
        if (state.countingHandKey && state.countingHandKey !== handKey) return;
        
        const updated = {
          ...state,
          countingTargetIndex: targetIndex,
          countingBeatIndex: beatIndex,
        };
        supabase
          .from('rounds')
          .update({ cribbage_state: JSON.parse(JSON.stringify(updated)) })
          .eq('id', currentRoundId)
          .then(({ error: writeErr }) => {
            if (writeErr) console.warn('[CRIBBAGE] Failed to persist counting progress:', writeErr.message);
          });
      });
    
    logCribbageDebug(debugCtx, 'counting_progress_write', {
      targetIndex,
      beatIndex,
      handKey,
      roundId: currentRoundId,
    });
  }, [currentRoundId, debugCtx]);

  // Handle counting phase completion - start new hand
  // NOTE: Win sequences are now triggered reactively via score subscription,
  // so this callback is only called when counting completes WITHOUT a win.
  // HOWEVER: As a safety catch, applyHandCountScores now returns a 'complete' state
  // if someone exceeds pointsToWin, which we must handle here.
  const handleCountingComplete = useCallback(async (_winDetected: boolean) => {
    if (!cribbageState || !dealerGameId) return;

    // Atomic guard: Prevent double-firing on the same client for the same counting instance
    // (IMPORTANT: use the key latched when counting started; currentHandNumber can drift if
    // props advance while our local counting animation is still finishing).
    const handKey = countingHandKeyRef.current ?? `${dealerGameId}:${currentHandNumber}`;

    // IDENTITY GUARD (authoritative): use latched (roundId, handNumber). Reconstructed
    // handKeys (cutCard-based) are NOT trusted — they can collide across hands.
    const expectedIdentity = countingIdentityRef.current;
    if (expectedIdentity) {
      if (
        expectedIdentity.roundId !== currentRoundId ||
        expectedIdentity.handNumber !== currentHandNumber
      ) {
        console.warn('[CRIBBAGE] handleCountingComplete: REJECTED stale counting completion (identity mismatch)', {
          expected: expectedIdentity,
          live: { roundId: currentRoundId, handNumber: currentHandNumber },
          phase: cribbageState.phase,
        });
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: currentHandNumber,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'crib-counting-complete-stale-rejected',
          payload: {
            expectedRoundId: expectedIdentity.roundId?.slice(0, 8),
            expectedHandNumber: expectedIdentity.handNumber,
            liveRoundId: currentRoundId?.slice(0, 8),
            liveHandNumber: currentHandNumber,
            phase: cribbageState.phase,
          },
        });
        // Still clear local counting UI so we don't get stuck visually,
        // but DO NOT write to DB or trigger win sequence.
        setCountingStateSnapshot(null);
        setCountingWinFrozen(false);
        syncHandle.unfreezePresentation();
        return;
      }
    }

    // FINALIZATION PHASE GUARD: refuse to finalize unless we are actually in the
    // counting phase AND pegging is structurally complete (all hands empty).
    // This prevents corrupted hand history (skipped pegging, missing phases).
    const peggingComplete = Object.values(cribbageState.playerStates).every(
      (ps) => Array.isArray(ps.hand) && ps.hand.length === 0
    );
    const phaseAllowsFinalize =
      cribbageState.phase === 'counting' || cribbageState.phase === 'complete';
    if (!phaseAllowsFinalize || !peggingComplete) {
      console.warn('[CRIBBAGE] handleCountingComplete: REJECTED — phase or pegging not complete', {
        phase: cribbageState.phase,
        peggingComplete,
        handLengths: Object.fromEntries(
          Object.entries(cribbageState.playerStates).map(([id, ps]) => [id.slice(0, 8), ps.hand?.length ?? -1])
        ),
      });
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'error',
        eventName: 'crib-finalize-phase-guard-rejected',
        payload: {
          phase: cribbageState.phase,
          peggingComplete,
        },
      });
      setCountingStateSnapshot(null);
      setCountingWinFrozen(false);
      syncHandle.unfreezePresentation();
      return;
    }

    if (startNextHandFiredRef.current === handKey) {
      console.log('[CRIBBAGE] handleCountingComplete already fired for this hand, skipping', { handKey });
      return;
    }
    startNextHandFiredRef.current = handKey;
    
    // REPLAY GUARD: Mark this handKey as completed so it can never replay
    // even if roundId boundary reset clears all other guards.
    countingCompletedHandKeysRef.current.add(handKey);
    // Prune old keys to prevent unbounded growth (keep last 10)
    if (countingCompletedHandKeysRef.current.size > 10) {
      const keys = Array.from(countingCompletedHandKeysRef.current);
      for (let i = 0; i < keys.length - 10; i++) {
        countingCompletedHandKeysRef.current.delete(keys[i]);
      }
    }

    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-transition-next-hand-start',
      payload: {
        oldRoundId: currentRoundId?.slice(0, 8),
        oldHandNumber: currentHandNumber,
        triggerSource: 'handleCountingComplete',
        handKey,
      },
    });
    
    // Mark counting animation as complete and clear snapshot.
    // IMPORTANT: Do NOT set countingAnimationActiveRef.current = false here.
    // With multiple clients, the parent can advance (roundId/handNumber props change) before
    // this client fully receives/render-syncs the new round state. If we drop the latch early,
    // the counting init effect can re-run and replay the scoring sequence.
    setCountingStateSnapshot(null);
    setCountingWinFrozen(false);
    // Activate forward-only lifecycle latch so banner shows "Dealing Next Hand"
    // instead of reverting to "Scoring hands..." during the transition gap.
    setPostCountingTransitionActive(true);
    // Unfreeze sync framework presentation so new-hand state flows through
    syncHandle.unfreezePresentation();
    
    // IMPORTANT: Do NOT clear countingScoreOverrides here.
    // The override should persist with the final counting scores until either:
    // 1. A new counting phase starts (which will set new baseline scores)
    // 2. The pegboard naturally shows new scores from DB once new hand begins
    // Clearing it here causes a race condition where pegboard briefly shows stale DB scores.
    // The next counting phase will overwrite this with fresh baseline anyway.
    
    // Start new hand (win case is handled by reactive score subscription)
    try {
      const playerIds = players.map(p => p.id);
      // Apply hand+crib totals AFTER the animation so the backend never "spoils" the result
      // by jumping pegScore at the start of counting.
      const countedState = applyHandCountScores(cribbageState);

      // OBSERVATIONAL TELEMETRY ONLY — append-only fairness archive.
      // Fire-and-forget; never blocks gameplay; idempotent on (dealer_game_id, hand_number).
      try {
        archiveCribbageHand({
          gameId,
          dealerGameId,
          roundId: expectedIdentity?.roundId ?? currentRoundId ?? null,
          handNumber: expectedIdentity?.handNumber ?? currentHandNumber,
          state: countedState,
        });
      } catch (archiveErr) {
        console.warn('[CRIBBAGE_ARCHIVE] non-blocking error:', archiveErr);
      }

      // CRITICAL FIX: Check if applyHandCountScores detected a winner.
      // This catches edge cases where the reactive win detection didn't fire
      // (e.g., due to animation timing or ref guards).
      if (countedState.phase === 'complete' && countedState.winnerPlayerId) {
        console.log('[CRIBBAGE] handleCountingComplete: Winner detected by applyHandCountScores', {
          winnerId: countedState.winnerPlayerId,
          phase: countedState.phase,
        });
        // Freeze the counting animation so the last-highlighted winning combo
        // remains visible for the duration of the win sequence. Without this,
        // CribbageCountingPhase has already advanced past every combo and
        // cleared highlightedCards, leaving an ambiguous hand+cut layout.
        setCountingWinFrozen(true);
        // [TERMINAL-PATH] applyHandCountScores resolved the winner post-animation.
        // countedState carries lastHandCount; treat as counting (hand vs crib refined
        // by which target's score actually crossed the threshold).
        {
          const winner = countedState.winnerPlayerId!;
          const cribOwner = countedState.cribOwnerPlayerId;
          const cribAdded = countedState.lastHandCount?.cribScore?.total ?? 0;
          const handAdded = winner === cribOwner
            ? (countedState.lastHandCount?.dealerHandScore?.total ?? 0)
            : (countedState.lastHandCount?.playerHandScores?.[winner]?.total ?? 0);
          // If winner is crib owner AND the crib alone pushed them over, it's a crib-counting win.
          const preCribScore = (countedState.playerStates[winner]?.pegScore ?? 0) - cribAdded - handAdded;
          const crossedOnCrib = winner === cribOwner &&
            (preCribScore + handAdded) < countedState.pointsToWin &&
            (preCribScore + handAdded + cribAdded) >= countedState.pointsToWin;
          setTerminalPath(crossedOnCrib ? 'crib-counting' : 'hand-counting');
        }
        // Persist the completed state and trigger win sequence
        await updateState(countedState);
        triggerWinSequence(countedState);
        return;
      }

      // CRITICAL FIX: Persist the final counted state to the CURRENT round BEFORE
      // creating the next hand's round. Without this, the old round's cribbage_state
      // never receives the applyHandCountScores result (lastHandCount, final pegScores),
      // causing ~40% of hands to lose their detailed scoring breakdown for audits.
      // WRITE-TIME IDENTITY GUARD: scope the write to the latched (roundId, hand_number).
      // If another client has already advanced this round (different hand_number), the
      // update affects 0 rows and we abort the new-hand creation below.
      const writeRoundId = expectedIdentity?.roundId ?? currentRoundId;
      const writeHandNumber = expectedIdentity?.handNumber ?? currentHandNumber;
      if (writeRoundId) {
        const { data: persistedRows, error: persistError } = await supabase
          .from('rounds')
          .update({ cribbage_state: JSON.parse(JSON.stringify(countedState)) })
          .eq('id', writeRoundId)
          .eq('hand_number', writeHandNumber)
          .select('id');
        if (persistError) {
          console.warn('[CRIBBAGE] Failed to persist final counted state to old round:', persistError.message);
        } else if (!persistedRows || persistedRows.length === 0) {
          console.warn('[CRIBBAGE] Counted-state write affected 0 rows — round/hand has advanced. Aborting new-hand creation.', {
            writeRoundId: writeRoundId.slice(0, 8),
            writeHandNumber,
          });
          persistSyncDebugEvent({
            gameId,
            gameType: 'cribbage',
            handNumber: writeHandNumber,
            eventType: 'invariant',
            severity: 'warn',
            eventName: 'crib-counted-state-write-zero-rows',
            payload: {
              writeRoundId: writeRoundId.slice(0, 8),
              writeHandNumber,
            },
          });
          return;
        }
      }
      
      // CRITICAL: Create a NEW round record for the next hand.
      // This ensures event logging is properly scoped to (dealer_game_id, hand_number).
      const result = await startNextCribbageHand(gameId, dealerGameId, countedState, playerIds);
      
      if (!result.success) {
        // Check if it's a winner detection case
        if (result.newState?.phase === 'complete' && result.newState?.winnerPlayerId) {
          console.log('[CRIBBAGE] handleCountingComplete: Winner detected by startNextCribbageHand', {
            winnerId: result.newState.winnerPlayerId,
            phase: result.newState.phase,
          });
          recordCribDoubleSkunkTrace('startNextCribbageHand winner path', {
            terminalEventId: terminalEventIdFor(result.newState.winnerPlayerId),
            winnerId: result.newState.winnerPlayerId,
            payoutMultiplier: result.newState.payoutMultiplier ?? null,
          });
          // Freeze the counting animation so the winning combo remains
          // highlighted while the win sequence plays.
          setCountingWinFrozen(true);
          // [TERMINAL-PATH] safety/fallback: startNextCribbageHand surfaced the winner.
          setTerminalPath('fallback');
          await updateState(result.newState);
          triggerWinSequence(result.newState);
          return;
        }
        throw new Error(result.error || 'Failed to start next hand');
      }

      // If another client already started this hand, skip the local state update
      // The realtime subscription will pick up the new round data
      if (result.alreadyStarted) {
        console.log('[CRIBBAGE] Another client started the next hand, waiting for realtime update');
        return;
      }
      
      // Update local tracking with new round info
      if (result.roundId && result.handNumber !== undefined) {
        console.log('[CRIBBAGE] Transitioning to new round', {
          oldRoundId: currentRoundId,
          newRoundId: result.roundId,
          oldHandNumber: currentHandNumber,
          newHandNumber: result.handNumber,
        });
        setCurrentRoundId(result.roundId);
        setCurrentHandNumber(result.handNumber);
        // Reset cut card logged ref for new hand
        cutCardLoggedRef.current = null;
        // Reset startNextHand guard for the new hand - the key will be different now
        // (This guard key includes the NEW handNumber, so future calls for this hand are blocked)
      }
      
      // Update local state with the new cribbage state
      if (result.newState) {
        syncHandle.receiveAuthoritativeUpdate(result.newState);
        setCribbageState(result.newState);
      }
    } catch (err) {
      console.error('[CRIBBAGE] Error starting new hand:', err);
      toast.error('Failed to start new hand');
    }
  }, [cribbageState, players, triggerWinSequence, gameId, dealerGameId, currentRoundId, currentHandNumber, recordCribDoubleSkunkTrace, terminalEventIdFor]);

  // Phase E: handleSkunkComplete retired — skunk now rides inside the
  // canonical match_win announcement, so the bespoke overlay phase is gone.


  const handleAnnouncementComplete = useCallback(() => {
    const terminalEventId = terminalEventIdFor(winSequenceData?.winnerId ?? null);
    recordCribDoubleSkunkTrace('handleAnnouncementComplete', {
      terminalEventId,
      hasWinSequenceData: !!winSequenceData,
      hasTableContainer: !!tableContainerRef.current,
      chipAnimationFiredRef: chipAnimationFiredRef.current,
    });
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 6
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:announcement_complete_invoked',
      payload: {
        hasWinSequenceData: !!winSequenceData,
        hasTableContainer: !!tableContainerRef.current,
        winnerId: winSequenceData?.winnerId?.slice(0, 8),
        multiplier: winSequenceData?.multiplier,
        chipAnimAlreadyFired: !!chipAnimationFiredRef.current,
        chipAnimFiredKey: chipAnimationFiredRef.current,
      },
    });
    // Compute chip animation positions
    if (!winSequenceData || !tableContainerRef.current) {
      // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 5/7
      logDebugEvent({
        gameId,
        eventType: 'crib:winseq:phase_change',
        payload: { from: 'announcement', to: 'complete', site: 'handleAnnouncementComplete:early-exit' },
      });
      recordCribDoubleSkunkTrace('setWinSequencePhase announcement→complete', {
        terminalEventId,
        site: 'handleAnnouncementComplete:early-exit',
      });
      setWinSequencePhase('complete');
      logDebugEvent({
        gameId,
        eventType: 'crib:winseq:on_game_complete',
        payload: { site: 'handleAnnouncementComplete:early-exit' },
      });
      recordCribDoubleSkunkTrace('onGameComplete callsite', {
        terminalEventId,
        site: 'handleAnnouncementComplete:early-exit',
      });
      onGameComplete();
      return;
    }
    
    // Source-level guard to prevent double-firing chip animation
    const chipAnimKey = `${gameId}:${winSequenceData.winnerId}`;
    if (chipAnimationFiredRef.current === chipAnimKey) {
      console.log('[CRIBBAGE] Chip animation already fired for this win, skipping');
      return;
    }
    chipAnimationFiredRef.current = chipAnimKey;

    // Wave 3B: dispatch chip transport intents — shell owns geometry,
    // suppression, motion, and settle lifecycle. The
    // 'cribbageBounce' variant ports the legacy keyframe + timing
    // exactly; per-loser 300ms stagger is applied by the runtime.
    const nextChipTriggerId = `crib-win-${roundId}-${Date.now()}`;
    setChipAnimationTriggerId(nextChipTriggerId);

    const winnerPlayer = players.find(p => p.id === winSequenceData.winnerId);
    const winnerPosition = winnerPlayer?.position;
    const intents = winSequenceData.loserIds
      .map((loserId) => {
        const loserPlayer = players.find(p => p.id === loserId);
        const loserPosition = loserPlayer?.position;
        if (loserPosition == null || winnerPosition == null) return null;
        return {
          id: `${nextChipTriggerId}:${loserId}`,
          amount: winSequenceData.amountPerLoser,
          from: { kind: 'seat' as const, position: loserPosition },
          to: { kind: 'seat' as const, position: winnerPosition },
          reason: 'transfer' as const,
          variant: 'cribbageBounce' as const,
        };
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);

    // Bridge to the existing lifecycle path: the last settled intent
    // triggers the same handler that used to fire from
    // CribbageChipTransferAnimation.onAnimationEnd.
    if (intents.length > 0) {
      dispatchChipTransport(intents, {
        onAllSettled: () => {
          handleChipAnimationEndRef.current?.();
        },
      });
    } else {
      // No resolvable losers — skip straight to the post-chips lifecycle.
      handleChipAnimationEndRef.current?.();
    }


    // Fire the deferred winner chat message NOW so it lands together with the
    // chip transfer (previously fired at overlay start, which left the chip
    // transfer feeling empty).
    const chatMessage = winSequenceData?.chatMessage;
    if (chatMessage) {
      injectDealerMessage(chatMessage);
    }
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 5
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:phase_change',
      payload: { from: 'announcement', to: 'chips', site: 'handleAnnouncementComplete' },
    });
    recordCribDoubleSkunkTrace('setWinSequencePhase announcement→chips', {
      terminalEventId,
      chipAnimKey,
      chipAnimationTriggerId: nextChipTriggerId,
    });
    setWinSequencePhase('chips');
  }, [winSequenceData, players, currentUserId, onGameComplete, roundId, gameId, injectDealerMessage, recordCribDoubleSkunkTrace, terminalEventIdFor]);


  const handleChipAnimationEnd = useCallback(() => {
    const terminalEventId = terminalEventIdFor(winSequenceData?.winnerId ?? null);
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 5
    logDebugEvent({
      gameId,
      eventType: 'crib:winseq:phase_change',
      payload: { from: 'chips', to: 'complete', site: 'handleChipAnimationEnd' },
    });
    recordCribDoubleSkunkTrace('setWinSequencePhase chips→complete', {
      terminalEventId,
      site: 'handleChipAnimationEnd',
    });
    setWinSequencePhase('complete');
    // Small delay before transitioning to next game
    setTimeout(() => {
      (async () => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const ok = await ensureBackendGameOverAck();
          if (ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 7
        logDebugEvent({
          gameId,
          eventType: 'crib:winseq:on_game_complete',
          payload: { site: 'handleChipAnimationEnd' },
        });
        recordCribDoubleSkunkTrace('onGameComplete callsite', {
          terminalEventId,
          site: 'handleChipAnimationEnd',
        });
        onGameComplete();
      })();
    }, 500);
  }, [ensureBackendGameOverAck, onGameComplete, gameId, recordCribDoubleSkunkTrace, terminalEventIdFor, winSequenceData?.winnerId]);

  // Wave 3B: stable ref so chip-transport onAllSettled callback always
  // sees the latest handler regardless of when the intent was dispatched.
  const handleChipAnimationEndRef = useRef(handleChipAnimationEnd);
  useEffect(() => {
    handleChipAnimationEndRef.current = handleChipAnimationEnd;
  }, [handleChipAnimationEnd]);


  // Gate chip animation on the shell-owned terminal announcement duration.
  // Skunk overlay occupies the first ~4100ms, then the same match_win event
  // remains in the lifecycle rail briefly so the winner plate is actually
  // visible before chips move. Non-skunk wins use the rail-only window.
  //
  // ROOT-CAUSE FIX (match-end freeze): the previous implementation listed
  // `handleAnnouncementComplete` in the dep array. That callback's identity
  // changes whenever `players` mutates — and during match-end, the chip
  // RPCs in endCribbageGame produce realtime updates that re-render the
  // parent and replace the `players` array reference. Each replacement
  // cancelled the in-flight 4500ms timer and re-armed a fresh one,
  // indefinitely. Result: chip animation never fired and the game froze.
  //
  // Fix: hold the latest callback in a ref so the timer arms EXACTLY ONCE
  // when winSequencePhase transitions into 'announcement'.
  const announcementCompleteRef = useRef(handleAnnouncementComplete);
  useEffect(() => {
    announcementCompleteRef.current = handleAnnouncementComplete;
  }, [handleAnnouncementComplete]);

  useEffect(() => {
    if (winSequencePhase !== 'announcement') return;
    if (!winSequenceData) return;

    const delayMs = winSequenceData.multiplier >= 2 ? 5600 : 1800;
    const timer = setTimeout(() => {
      announcementCompleteRef.current?.();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [winSequencePhase, winSequenceData]);

  // Continuous confetti for the winner across announcement + chip-transfer.
  // Replaces the previous one-shot burst that faded long before chips moved.
  // Runs only on the winner's client; observers/losers see overlay + chips
  // without confetti, matching prior behavior.
  useEffect(() => {
    if (winSequencePhase !== 'announcement' && winSequencePhase !== 'chips') return;
    if (!winSequenceData) return;
    if (currentPlayerId !== winSequenceData.winnerId) return;

    let cancelled = false;
    const palette = ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'];

    // Immediate opening burst.
    confetti({ particleCount: 160, spread: 75, origin: { y: 0.6 }, colors: palette });

    // Repeating smaller bursts so confetti remains visible through chip transfer.
    const interval = window.setInterval(() => {
      if (cancelled) return;
      confetti({ particleCount: 60, spread: 60, origin: { x: 0.2 + Math.random() * 0.6, y: 0.55 + Math.random() * 0.15 }, colors: palette });
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [winSequencePhase, winSequenceData, currentPlayerId]);




  // Safety timeout: If chip animation phase doesn't complete within 8 seconds, force transition
  // (animation is now ~4s + stagger, so 8s is safe)
  useEffect(() => {
    if (winSequencePhase !== 'chips') return;
    
    const safetyTimer = setTimeout(() => {
      console.warn('[CRIBBAGE] Chip animation safety timeout triggered');
      const terminalEventId = terminalEventIdFor(winSequenceData?.winnerId ?? null);
      // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 5/7
      logDebugEvent({
        gameId,
        eventType: 'crib:winseq:phase_change',
        payload: { from: 'chips', to: 'complete', site: 'safety_timeout' },
      });
      recordCribDoubleSkunkTrace('setWinSequencePhase chips→complete', {
        terminalEventId,
        site: 'safety_timeout',
      });
      setWinSequencePhase('complete');
      (async () => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const ok = await ensureBackendGameOverAck();
          if (ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        logDebugEvent({
          gameId,
          eventType: 'crib:winseq:on_game_complete',
          payload: { site: 'safety_timeout' },
        });
        recordCribDoubleSkunkTrace('onGameComplete callsite', {
          terminalEventId,
          site: 'safety_timeout',
        });
        onGameComplete();
      })();
    }, 8000);
    
    return () => clearTimeout(safetyTimer);
  }, [winSequencePhase, ensureBackendGameOverAck, onGameComplete, gameId]);

  // Canonical projected seat roster. Every active participant renders from
  // the shell-owned SeatAnchorLayer so chips, dealer pips, card backs, and
  // animation endpoints share one projected anchor map on active + observer clients.
  const projectedSeatPlayers = activeSeatPlayers;
  // Pre-session ownership gate: when the shell PreSessionSeatLayer is
  // active, it owns all pre-game chip rendering. Suppress this overlay's
  // pre-session branch to avoid a duplicate visible CHIP_RENDER_OWNER
  // for the same (playerId, position). Gameplay rendering is unchanged.
  const preSessionSeatOwnedByShell = usePreSessionSeatOwned();
  const isCribDealer = (playerId: string | undefined) => viewState?.dealerPlayerId === playerId;

  // DEALER DBG + SEAT OWNERSHIP pill emitters.
  // We render the snapshot AFTER paint (rAF) so the DOM has the latest
  // dealer pip + chip disc + animation chip mounted state. The values
  // below combine state (what JSX intends) with DOM scraping (what is
  // actually mounted/visible/clipped) so the pill can prove which
  // render branch the disconnect is in.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const dealerId = viewState?.dealerPlayerId ?? null;
      const opponentPlayerIds = projectedSeatPlayers
        .filter(p => p.id !== currentPlayerId)
        .map(p => p.id);
      const opponentDealerVisible: Record<string, boolean> = {};
      const dealerPipMounted: Record<string, boolean> = {};
      const dealerPipActiveAttr: Record<string, string> = {};
      const dealerPipVisible: Record<string, boolean> = {};
      const dealerPipRect: Record<string, string> = {};
      const dealerPipZ: Record<string, string> = {};
      const dealerPipClipped: Record<string, boolean> = {};
      for (const oppId of opponentPlayerIds) {
        const shortId = oppId.slice(0, 6);
        opponentDealerVisible[shortId] = !!dealerId && dealerId === oppId;
        const cluster = document.querySelector(
          `[data-canonical-seat-cluster][data-player-id="${oppId}"]`,
        ) as HTMLElement | null;
        const pip = cluster?.querySelector('[data-canonical-dealer-pip]') as HTMLElement | null;
        dealerPipMounted[shortId] = !!pip;
        dealerPipActiveAttr[shortId] = pip?.getAttribute('data-dealer-pip-active') ?? '—';
        if (pip) {
          const cs = window.getComputedStyle(pip);
          const r = pip.getBoundingClientRect();
          dealerPipVisible[shortId] =
            cs.visibility !== 'hidden' &&
            cs.display !== 'none' &&
            parseFloat(cs.opacity || '1') > 0 &&
            r.width > 0 && r.height > 0;
          dealerPipRect[shortId] = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
          // Walk ancestors collecting z-index until stacking context root.
          const zs: string[] = [];
          let n: HTMLElement | null = pip;
          while (n && zs.length < 6) {
            const z = window.getComputedStyle(n).zIndex;
            if (z && z !== 'auto') zs.push(z);
            n = n.parentElement;
          }
          dealerPipZ[shortId] = zs.join('>') || 'auto';
          // Clipped if outside cluster's clientRect or nearest overflow-hidden ancestor.
          let clipped = false;
          if (cluster) {
            const cr = cluster.getBoundingClientRect();
            // pip lives in seat-above which sits above cluster; clipping only matters
            // if an ancestor with overflow:hidden contains it. Walk up for that.
            let p: HTMLElement | null = pip.parentElement;
            while (p) {
              const ps = window.getComputedStyle(p);
              if (ps.overflow === 'hidden' || ps.overflowX === 'hidden' || ps.overflowY === 'hidden') {
                const pr = p.getBoundingClientRect();
                if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) {
                  clipped = true;
                }
                break;
              }
              p = p.parentElement;
            }
            void cr;
          }
          dealerPipClipped[shortId] = clipped;
        } else {
          dealerPipVisible[shortId] = false;
          dealerPipRect[shortId] = '0,0,0,0';
          dealerPipZ[shortId] = '—';
          dealerPipClipped[shortId] = false;
        }
      }
      dealerDbgStore.record({
        context: 'cribbage',
        dealerPlayerId: dealerId ? dealerId.slice(0, 8) : null,
        localPlayerId: currentPlayerId ? currentPlayerId.slice(0, 8) : null,
        opponentPlayerIds: opponentPlayerIds.map(id => id.slice(0, 8)),
        localDealerVisible: !!dealerId && dealerId === currentPlayerId,
        opponentDealerVisible,
        identitySource: 'viewState.dealerPlayerId',
        seatClusterSource: 'viewState.dealerPlayerId',
        dealerPipMounted,
        dealerPipActiveAttr,
        dealerPipVisible,
        dealerPipRect,
        dealerPipZ,
        dealerPipClipped,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [viewState?.dealerPlayerId, currentPlayerId, projectedSeatPlayers]);

  // Wave 3B: stale SEAT_OWNERSHIP instrumentation effect deleted. It
  // tracked the legacy CribbageChipTransferAnimation portal +
  // game-side hideChipBubble suppression, both of which are now
  // shell-owned. Shell emits chip-transport-dispatched/settled
  // diagnostics in their place.




  // Determine current render mode for felt content (not layout — layout is always the same shell)
  // BUG A FIX: Bootstrap depends on renderHandKey (presentation identity), NOT viewState existence.
  // viewState can be non-null while renderHandKey is still empty during state-layer mismatch.
  // renderHandKey is '' when viewState is null OR when viewState has no meaningful hand identity.
  //
  // STALE-FIRST-PAINT INVARIANT: viewState must belong to the CURRENT hand identity before
  // any gameplay surface renders from it. Without this check, a render triggered by a new
  // currentRoundId (which updates currentHandKey) can still see old viewState (old renderHandKey)
  // because the boundary-reset effect hasn't fired yet. useLayoutEffect mitigates the paint
  // timing, but this invariant is the true data-source correctness guard.
  const viewStateIsCurrentRound = !!(
    renderHandKey &&
    currentHandKey &&
    renderHandKey === currentHandKey
  );
  // ── STALE-COMPLETE LATCH ────────────────────────────────────
  // Detect a hand that has finished locally but whose boundary reset has not yet
  // fired (parent prop roundId still lagging behind the other client that advanced).
  // In that window viewState/cribbageState are both the OLD hand and the gameplay
  // surface would otherwise keep rendering interactable stale cards. Treat it as
  // bootstrap so the felt drops to the "Preparing next hand..." shell immediately,
  // independent of when the parent prop catches up.
  const isStaleCompleteAwaitingNext = !!(
    viewState &&
    viewState.phase === 'complete' &&
    winSequencePhase === 'idle' &&
    !countingStateSnapshot &&
    !countingDelayActive &&
    !postCountingTransitionActive &&
    !isTransitioning
  );
  const isHighCardMode = effectiveShowHighCardSelection;
  // OBSERVER FIX: observers have no currentPlayerId by definition. Gating
  // bootstrap on `!currentPlayerId` kept observers permanently in the
  // "Preparing next hand…" shell with no gameplay surface. Only require
  // currentPlayerId for seated participants; observers bypass this gate
  // and proceed to gameplay rendering (read-only view).
  const isBootstrapMode = !isDealerSelection && (
    !initialLoadComplete ||
    !renderHandKey ||
    (!currentPlayerId && !isObserver) ||
    isStaleCompleteAwaitingNext
  );
  const isGameplayMode = !isHighCardMode && !isBootstrapMode && viewStateIsCurrentRound;

  // ── PROACTIVE STALE-COMPLETE RESET (RETIRED in Phase 2) ─────
  // The bespoke proactive reset that fired off `isStaleCompleteAwaitingNext`
  // has been superseded by the framework's identity-advancement path:
  //   1. `useAuthoritativeIdentity({ dealerGameId })` observes the new round
  //      via a dealer-game-scoped channel — no blind window.
  //   2. `useGameStateSync({ identity })` auto-resets its three layers on
  //      forward identity advancement.
  //   3. The local `lastObservedIdentityRef` effect (above) clears the
  //      `cribbageState` mirror on the same signal.
  // `isStaleCompleteAwaitingNext` remains, but only as a render-mode signal
  // (forces bootstrap shell during the brief window between local hand
  // completion and the framework reset settling).

  // Latch pegboard data whenever we have valid gameplay state
  if (isGameplayMode && viewState) {
    latchedPegboardDataRef.current = {
      playerStates: viewState.playerStates,
      winningScore: viewState.pointsToWin,
    };
  }
  const shouldShowAwaitingAnteAnnouncement = currentHandNumber <= 1 && (
    isDealerSelection ||
    effectiveShowHighCardSelection ||
    (!initialLoadComplete && !renderHandKey && !postCountingTransitionActive)
  );
  const shouldShowPreparingNextHand = isBootstrapMode && !shouldShowAwaitingAnteAnnouncement;

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2 — passive bootstrap lifecycle ambient (Cribbage).
  //
  // Migrates the legacy bootstrap gold banner ("Awaiting ante decisions…"
  // / "Preparing next hand…") off per-game JSX onto canonical shell
  // ambient ownership. Dealer-selection ambient owns the rail while
  // drawing for high card and must not be clobbered.
  // ────────────────────────────────────────────────────────────────────────
  const lastBootstrapAmbientIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId) return;
    if (effectiveShowHighCardSelection) {
      if (lastBootstrapAmbientIdRef.current) {
        announcements.dismiss(lastBootstrapAmbientIdRef.current);
        lastBootstrapAmbientIdRef.current = null;
      }
      return;
    }

    let kind: 'awaiting_ante' | 'waiting_for_next_round' | null = null;
    if (isBootstrapMode && shouldShowAwaitingAnteAnnouncement) {
      kind = 'awaiting_ante';
    } else if (shouldShowPreparingNextHand) {
      kind = 'waiting_for_next_round';
    }

    if (!kind) {
      if (lastBootstrapAmbientIdRef.current) {
        announcements.dismiss(lastBootstrapAmbientIdRef.current);
        lastBootstrapAmbientIdRef.current = null;
      }
      return;
    }

    const id = `${gameId}:${dealerGameId ?? 'no-dg'}:${currentHandNumber}:bootstrap:${kind}`;
    if (lastBootstrapAmbientIdRef.current === id) return;
    lastBootstrapAmbientIdRef.current = id;
    announcements.emit({
      id,
      type: kind,
      scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
      payload: {},
    });
  }, [
    gameId,
    dealerGameId,
    currentRoundId,
    currentHandNumber,
    effectiveShowHighCardSelection,
    isBootstrapMode,
    shouldShowAwaitingAnteAnnouncement,
    shouldShowPreparingNextHand,
    announcements,
  ]);


  // ── STALE-ACTIVE-HAND INVARIANT TRACE ──
  // Log when viewState exists but is blocked from rendering due to round identity mismatch.
  // This proves the stale first-paint source and confirms the guard is working.
  if (viewState && renderHandKey && currentHandKey && renderHandKey !== currentHandKey) {
    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      roundId: currentRoundId ?? null,
      eventType: 'invariant',
      severity: 'warn',
      eventName: 'crib-stale-active-hand-blocked',
      payload: {
        renderHandKey: renderHandKey.slice(0, 30),
        currentHandKey: currentHandKey.slice(0, 30),
        currentRoundId: currentRoundId?.slice(0, 8) ?? null,
        isTransitioning,
        initialLoadComplete,
        viewStatePhase: viewState.phase,
        viewStatePlayerCount: Object.keys(viewState.playerStates).length,
        renderSource: 'viewState (sync-presentation)',
        blockedSurfaces: ['felt-content', 'opponent-overlay', 'cards-tab'],
      },
    });
  }

  useEffect(() => {
    if (!isBootstrapMode || !shouldShowAwaitingAnteAnnouncement) return;

    const priorTriggerCount = incrementGuardCount(
      awaitingAnteAnnouncementCountRef.current,
      roundBoundaryGuardKey,
    );

    if (!markGuardConsumed(awaitingAnteAnnouncementConsumedRef.current, roundBoundaryGuardKey)) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'crib-replay-detected',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          event: 'awaiting-ante-announcement',
          handKey: roundBoundaryGuardKey,
          timesCompleted: priorTriggerCount + 1,
        },
      });
      return;
    }

    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-awaiting-ante-announcement-trigger',
      payload: {
        dealer_game_id: dealerGameId,
        roundId: currentRoundId?.slice(0, 8),
        handNumber: currentHandNumber,
        triggerSource: isDealerSelection
          ? 'dealer_selection'
          : effectiveShowHighCardSelection
            ? 'high_card_selection'
            : 'bootstrap_first_hand',
        priorTriggerCount,
      },
    });
  }, [
    currentHandNumber,
    currentRoundId,
    dealerGameId,
    effectiveShowHighCardSelection,
    gameId,
    isBootstrapMode,
    isDealerSelection,
    roundBoundaryGuardKey,
    shouldShowAwaitingAnteAnnouncement,
  ]);

  useEffect(() => {
    if (!shouldShowPreparingNextHand) return;

    const priorEnterCount = incrementGuardCount(
      preparingNextHandEnterCountRef.current,
      roundBoundaryGuardKey,
    );

    if (!markGuardConsumed(preparingNextHandEnterConsumedRef.current, roundBoundaryGuardKey)) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'crib-replay-detected',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          event: 'preparing-next-hand-enter',
          handKey: roundBoundaryGuardKey,
          timesCompleted: priorEnterCount + 1,
        },
      });
      return;
    }

    preparingNextHandActiveKeyRef.current = roundBoundaryGuardKey;
    persistSyncDebugEvent({
      gameId,
      gameType: 'cribbage',
      handNumber: currentHandNumber,
      eventType: 'transition',
      severity: 'info',
      eventName: 'crib-preparing-next-hand-enter',
      payload: {
        roundId: currentRoundId?.slice(0, 8),
        handNumber: currentHandNumber,
        source: postCountingTransitionActive
          ? 'post_counting_transition'
          : isTransitioning
            ? 'boundary_reset'
            : 'bootstrap_wait',
        priorEnterCount,
      },
    });

    if (!initialLoadComplete && currentHandNumber > 1 && !markGuardConsumed(wrongInitBranchLoggedRef.current, roundBoundaryGuardKey)) {
      return;
    }

    if (!initialLoadComplete && currentHandNumber > 1) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'crib-wrong-init-branch',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          branchEntered: 'awaiting_ante_bootstrap',
          expectedBranch: 'preparing_next_hand',
          stateSummary: {
            initialLoadComplete,
            isDealerSelection,
            effectiveShowHighCardSelection,
            isTransitioning,
            postCountingTransitionActive,
            hasRenderHandKey: Boolean(renderHandKey),
            hasCurrentPlayerId: Boolean(currentPlayerId),
          },
        },
      });
    }
  }, [
    currentHandNumber,
    currentPlayerId,
    currentRoundId,
    effectiveShowHighCardSelection,
    gameId,
    initialLoadComplete,
    isDealerSelection,
    isTransitioning,
    postCountingTransitionActive,
    renderHandKey,
    roundBoundaryGuardKey,
    shouldShowPreparingNextHand,
  ]);

  const prevPreparingNextHandVisibleRef = useRef(false);
  useEffect(() => {
    const wasVisible = prevPreparingNextHandVisibleRef.current;
    if (wasVisible && !shouldShowPreparingNextHand && preparingNextHandActiveKeyRef.current) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-preparing-next-hand-exit',
        payload: {
          roundId: currentRoundId?.slice(0, 8),
          handNumber: currentHandNumber,
          reason: isGameplayMode
            ? 'gameplay_ready'
            : isHighCardMode
              ? 'high_card_selection'
              : 'state_reset',
        },
      });
      preparingNextHandActiveKeyRef.current = null;
    }
    prevPreparingNextHandVisibleRef.current = shouldShowPreparingNextHand;
  }, [currentHandNumber, currentRoundId, gameId, isGameplayMode, isHighCardMode, shouldShowPreparingNextHand]);

  // ── TRACE-3: high-card render decision (every render where isHighCardMode=true) ──
  if (isHighCardMode) {
    logDebugEvent({
      gameId,
      eventType: 'crib:bugA:render_decision',
      payload: {
        txId: hcTransitionIdRef.current,
        isDealerSelection,
        showHighCardSelection,
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        // Which source is driving visible cards?
        sourceLabel: isDealerSelection ? 'externalProps' : 'localHighCardCards',
        externalCardCount: externalDealerSelectionCards?.length ?? 0,
        localHighCardCardCount: highCardCards.length,
        effectiveCardCount: effectiveHighCardCards.length,
        // Card identities for each source (first 3)
        externalCardIds: (externalDealerSelectionCards ?? []).slice(0, 3).map(c => `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
        localCardIds: highCardCards.slice(0, 3).map(c => `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
        effectiveCardIds: effectiveHighCardCards.slice(0, 3).map(c => `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
        // Synced state info
        syncedStateHasData: !!highCardSyncedState,
        syncedStateCardCount: highCardSyncedState?.cards?.length ?? 0,
      },
    });
  }

  // ── Lifecycle: render-branch instrumentation ──
  renderCountRef.current += 1;
  const renderRoundId = currentRoundId;
  const renderViewNull = viewState === null;
  const renderCribNull = cribbageState === null;
  const roundIdChanged = prevRoundIdRef_lifecycle.current !== null && prevRoundIdRef_lifecycle.current !== renderRoundId;
  const handKeyChanged = prevHandKeyRef_lifecycle.current !== null && prevHandKeyRef_lifecycle.current !== currentHandKey;
  if (roundIdChanged || handKeyChanged) {
    logDebugEvent({
      gameId,
      eventType: 'crib:lifecycle:render_branch',
      payload: {
        instanceId: instanceIdRef.current,
        renderCount: renderCountRef.current,
        roundIdChanged,
        prevRoundId: prevRoundIdRef_lifecycle.current?.slice(0, 8),
        currentRoundId: renderRoundId.slice(0, 8),
        handKeyChanged,
        prevHandKey: prevHandKeyRef_lifecycle.current?.slice(0, 12),
        currentHandKey: currentHandKey.slice(0, 12),
        viewStateNull: renderViewNull,
        cribbageStateNull: renderCribNull,
        isTransitioning,
        initialLoadComplete,
        isDealerSelection,
        countingSnapshotActive: !!countingStateSnapshot,
        renderHandKey: renderHandKey.slice(0, 12),
        handBoundaryKey: `${currentRoundId}-${currentHandNumber}`,
        renderMode: isHighCardMode ? 'highCard' : isBootstrapMode ? 'bootstrap' : 'gameplay',
      },
    });
  }
  prevRoundIdRef_lifecycle.current = renderRoundId;
  prevHandKeyRef_lifecycle.current = currentHandKey;

  // Log early-return equivalent for bootstrap mode
  if (isBootstrapMode) {
    const earlyReturnReason = isTransitioning ? 'transitioning' : !initialLoadComplete ? 'not_loaded' : !viewState ? 'viewState_null' : 'no_currentPlayerId';
    logDebugEvent({
      gameId,
      eventType: 'crib:lifecycle:early_return',
      payload: {
        instanceId: instanceIdRef.current,
        reason: earlyReturnReason,
        isTransitioning,
        initialLoadComplete,
        viewStateNull: renderViewNull,
        hasCurrentPlayerId: !!currentPlayerId,
        renderCount: renderCountRef.current,
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        currentRoundId: currentRoundId?.slice(0, 8),
        transitionFrozenRef: transitionFrozenRef.current,
        hasCribbageState: cribbageState !== null,
        cribbagePhase: cribbageState?.phase ?? null,
      },
    });
  }

  // High-card selection: pre-compute card groupings for the felt content
  let highCardCardsByPosition: Map<number, DealerSelectionCard[]> | null = null;
  let highCardPositions: number[] = [];
  if (isHighCardMode) {
    highCardCardsByPosition = new Map<number, DealerSelectionCard[]>();
    for (const c of effectiveHighCardCards) {
      const arr = highCardCardsByPosition.get(c.position) ?? [];
      arr.push(c);
      highCardCardsByPosition.set(c.position, arr);
    }
    highCardPositions = Array.from(highCardCardsByPosition.keys()).sort((a, b) => a - b);
    highCardPositions.forEach((pos) => {
      const arr = highCardCardsByPosition!.get(pos);
      if (arr) arr.sort((a, b) => a.roundNumber - b.roundNumber);
    });
  }

  // ── ANNOUNCEMENT TRACER ──────────────────────────────────────
  // Derive current banner text (mirrors the inline IIFE in JSX) for change tracking
  const derivedBannerText = useMemo(() => {
    if (isHighCardMode) return '(canonical dealer-selection)';
    if (isBootstrapMode) return shouldShowAwaitingAnteAnnouncement ? 'Awaiting ante decisions...' : 'Preparing next hand...';
    if (!viewState) return '(no viewState)';
    if (winSequencePhase === 'skunk' || winSequencePhase === 'complete') return '(win overlay)';
    if ((winSequencePhase === 'chips' || winSequencePhase === 'announcement') && winSequenceData) {
      return '(canonical match_win)';
    }
    const isCountingAnimActive = !!countingStateSnapshot;
    const countingOutroActive = isCountingAnimActive && countingDelayActive;
    const effectivePhase = isCountingAnimActive
      ? (countingOutroActive ? 'pegging' : countingStateSnapshot!.phase)
      : viewState.phase;
    const isCountingComplete = postCountingTransitionActive || (effectivePhase === 'counting' && !countingAnnouncement && !countingTargetLabel && countingAnimationActiveRef.current && !countingStateSnapshot);
    if (isCountingComplete) return 'Dealing Next Hand...';
    if (effectivePhase === 'counting') return countingAnnouncement ? `${countingTargetLabel}: ${countingAnnouncement}` : countingTargetLabel ? `Scoring ${countingTargetLabel}...` : 'Scoring hands...';
    if (effectivePhase === 'discarding') return 'Discard to Crib';
    if (effectivePhase === 'cutting') return 'Cut Card';
    return '(pegging/none)';
  }, [isHighCardMode, isBootstrapMode, shouldShowAwaitingAnteAnnouncement, viewState, winSequencePhase, winSequenceData, countingStateSnapshot, countingDelayActive, postCountingTransitionActive, countingAnnouncement, countingTargetLabel]);

  const prevBannerTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevBannerTextRef.current !== null && prevBannerTextRef.current !== derivedBannerText) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: currentHandNumber,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-announcement-change',
        payload: {
          previousText: prevBannerTextRef.current,
          nextText: derivedBannerText,
          roundId: currentRoundId?.slice(0, 8),
          renderMode: isHighCardMode ? 'highCard' : isBootstrapMode ? 'bootstrap' : 'gameplay',
          phase: viewState?.phase ?? null,
          isTransitioning,
          postCountingTransitionActive,
          renderHandKey: renderHandKey?.slice(0, 20),
          currentHandKey: currentHandKey?.slice(0, 20),
          winSequencePhase,
          countingSnapshotActive: !!countingStateSnapshot,
        },
      });
    }
    prevBannerTextRef.current = derivedBannerText;
  }, [derivedBannerText, gameId, currentHandNumber, currentRoundId, isHighCardMode, isBootstrapMode, viewState?.phase, isTransitioning, postCountingTransitionActive, renderHandKey, currentHandKey, winSequencePhase, countingStateSnapshot]);

  // Phase 3: local gameplay-announcement fallback retired. All gameplay
  // announcements (pegging events, counting score events, "Dealing Next
  // Hand…") now flow through canonical `peg_notice` / `dealing_next_hand`
  // emits above. "Scoring {target}..." remains as ambient helper text in
  // the content pane (see counting placeholder below). Cut-card no longer
  // produces a rail announcement.


  // Felt-frame + outer top-section sizing.
  // Canonical shell-owned felt geometry — Frame B == Frame A by construction.
  // See `--shell-felt-w` / `--shell-felt-h` in index.css.
  const feltFrameStyle = {
    width: 'var(--shell-felt-w)',
    height: 'var(--shell-felt-h)',
  };

  const tableContainerHeight = 'var(--shell-felt-h)';


  // NOTE: We no longer early-return a bare div during transitions.
  // The full table shell renders below; bootstrap mode shows a transition placeholder
  // inside the felt circle to avoid unmount/remount flicker.
  return (
    <div className={cn('h-full flex flex-col overflow-hidden bg-transparent')}>
      {/* Phase E: canonical `match_win` announcement owns winner UI.
          The 'skunk' win-sequence phase is retired — skunk semantics
          ride inside the canonical announcement payload. */}

      {/* Wave 3B: chip transfer fly chip is now owned by the shell
          ChipTransport runtime (PersistentTableShell). The legacy
          CribbageChipTransferAnimation JSX is retired. */}



      {/* ═══════ UNIFIED FELT AREA — same shell for ALL modes ═══════ */}
      {/* Canonical felt geometry: fixed height + flex:0 0 — matches Gin/Yahtzee.
          The previous `minHeight: 260px` allowed the felt to overflow the
          viewport on small phones, pushing the HUD identity row below the
          fold. Identity-row containment is non-negotiable; the felt must
          obey shell tokens. */}
      <div 
        ref={tableContainerRef}
        className="relative flex items-start justify-center overflow-visible"
        style={{ 
          height: tableContainerHeight,
          flex: '0 0 var(--shell-felt-h)',
        }}
      >
        {/* Shell host owns the canonical felt + backdrop. No local floor slab. */}

        {/* Wave 4 — Phase 5A: Cribbage chrome host (shadow overlay).
            Runs descriptors → resolver → ArtifactHost against live geometry.
            Default: invisible (pointer-events:none). Flip on with `?wave4=1`
            or `localStorage.wave4=1`. Faults always emit to telemetry. */}
        <Wave4CribbageChromeHost
          phase="pegging"
          viewerSeatPosition={currentPlayer?.position ?? null}
          opponentSeatPositions={[0, 1, 2, 3].filter(
            (p) => p !== (currentPlayer?.position ?? -1),
          )}
          cutCardRevealed={true}
          cribVisible={true}
        />

        {/* Wave 5C — Phase 4B: gameplay geometry provider. Wraps the
            felt-content subtree so Wave4PegboardSlot, Wave4PeggingRowSlot,
            and (future) Crib/Cut/Counting slots share one solve and one
            placement hash. */}
        <CribbageGameplayGeometryProvider
          phase="pegging"
          viewerSeatPosition={currentPlayer?.position ?? null}
          opponentSeatPositions={[0, 1, 2, 3].filter(
            (p) => p !== (currentPlayer?.position ?? -1),
          )}
          cutCardRevealed={true}
          cribVisible={true}
        >





        {/* Felt-content frame — shared canonical ellipse envelope. */}
        <div
          className="relative z-10"
          style={feltFrameStyle}
        >
          <div
            className="relative w-full h-full"
            style={{ transform: 'translateY(6%)' }}
          >

            <CribbageFeltAdapter
              anteAmount={anteAmount}
              pointsToWin={gameConfig.pointsToWin}
              cribbageSkunk={{
                skunkEnabled: gameConfig.skunkEnabled,
                skunkThreshold: gameConfig.skunkThreshold,
                doubleSkunkEnabled: gameConfig.doubleSkunkEnabled,
                doubleSkunkThreshold: gameConfig.doubleSkunkThreshold,
              }}
              isWaitingPhase={false}
            />



            {/* ── MODE-SPECIFIC FELT CONTENT ── */}

            {/* HIGH-CARD MODE: DB-synced selection logic + centered card display */}
            {isHighCardMode && (
              <>
                {/* Phase C.2: dealer-selection controller is now a headless
                    hook (`useHighCardDealerSelection`) called via this tiny
                    inline component so mount/unmount semantics on
                    `isHighCardMode && !isDealerSelection` are preserved
                    exactly as before. No surface mount, no slot identity
                    churn — the card rendering lives in the canonical
                    Cribbage felt below. */}
                {!isDealerSelection && (
                  <CribbageDealerSelectionController
                    gameId={gameId}
                    players={players as any}
                    isHost={isHost}
                    syncedState={highCardSyncedState}
                    onCardsUpdate={setHighCardCards}
                    onWinnerPositionUpdate={setHighCardWinnerPosition}
                    onComplete={(pos) => {
                      // ── HANDOFF TRACE #1 (child): dealer-game onComplete ──
                      emitCribbageHandoffTrace({
                        gameId,
                        eventType: 'child_hc_onComplete',
                        userId: currentUserId,
                        roundId: currentRoundId || null,
                        context: {
                          winnerPosition: pos,
                          dealerGameId: dealerGameId?.slice(0, 8) ?? null,
                          isHost,
                        },
                      });
                      handleHighCardComplete(pos);
                    }}
                  />
                )}
                {/* ── Phase 2.1: session-level dealer-selection controller
                    now mounted INSIDE the slot child (previously a sibling
                    JSX above the table in Game.tsx). Same headless hook,
                    same callbacks — parent owns the state, the table owns
                    the surface. */}
                {isDealerSelection && onDealerSelectionCardsUpdate && onDealerSelectionComplete && (
                  <CribbageDealerSelectionController
                    gameId={gameId}
                    players={players as any}
                    isHost={isHost}
                    syncedState={dealerSelectionSyncedState}
                    onCardsUpdate={onDealerSelectionCardsUpdate}
                    onWinnerPositionUpdate={onDealerSelectionWinnerPositionUpdate ?? (() => {})}
                    onComplete={onDealerSelectionComplete}
                  />
                )}
                {isDealerSelection && effectiveHighCardCards.length > 0 && (
                  <CribbageDealerSelectionVisibilityTracker
                    gameId={gameId}
                    cardCount={effectiveHighCardCards.length}
                    winnerPosition={effectiveHighCardWinnerPosition ?? null}
                  />
                )}
                <div
                  className="absolute inset-0 flex items-center justify-center z-40"
                  data-wartime-high-card-container={gameId}
                  data-wartime-renderer-instance={`CribbageMobileGameTable:${gameId}:${isDealerSelection ? 'session-ds' : 'cribbage-ds'}`}
                  data-wartime-component="CribbageMobileGameTable"
                  data-wartime-render-branch={isDealerSelection ? 'session-dealer-selection-overlay' : 'cribbage-dealer-selection-overlay'}
                  data-wartime-surface="HighCardRender"
                >


                  {/* HIGH-CARD INSTRUMENTATION: render-time signature + per-card mount markers.
                      No layout impact. */}
                  {(() => {
                    const renderedIds = (effectiveHighCardCards ?? []).map(
                      (c) => `p${c.position}:${c.card?.rank ?? '?'}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}:w${c.isWinner ? 1 : 0}:d${c.isDimmed ? 1 : 0}`,
                    );
                    recordWaitingLifecycleIfChanged(
                      `highcard:render:${gameId}`,
                      'high-card render signature',
                      {
                        surface: 'CribbageMobileGameTable',
                        gameId,
                        isDealerSelection,
                        cardCount: effectiveHighCardCards.length,
                        positions: highCardPositions,
                        winnerPosition: effectiveHighCardWinnerPosition ?? null,
                        renderedIds,
                        renderPath: isDealerSelection ? 'external-prop' : 'local-state',
                      },
                    );
                    return null;
                  })()}
                  <div className="flex gap-4 items-start">
                    {highCardPositions.map((position) => {
                      const stack = highCardCardsByPosition?.get(position) ?? [];
                      const last = stack[stack.length - 1];
                      if (!last) return null;
                      const isFinalWinner = effectiveHighCardWinnerPosition !== null && position === effectiveHighCardWinnerPosition;
                      const dim = last.isDimmed;
                      return (
                        <div
                          key={position}
                          className={cn(
                            'flex flex-col items-center transition-all duration-300',
                            isFinalWinner ? 'transform -translate-y-2 scale-110' : '',
                            dim ? 'opacity-50' : ''
                          )}
                        >
                          <div className="relative">
                            {stack.map((c, idx) => (
                              <div
                                key={`${c.playerId}-${c.roundNumber}`}
                                data-wartime-high-card="card"
                                data-card-key={`${c.playerId}-${c.roundNumber}`}
                                data-card-id={`p${c.position}:${c.card?.rank ?? '?'}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`}
                                data-player-position={c.position}
                                className={cn(
                                  idx > 0 ? 'absolute' : '',
                                  isFinalWinner && idx === stack.length - 1
                                    ? 'ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50'
                                    : ''
                                )}
                                style={idx > 0 ? {
                                  top: `${idx * 50}%`,
                                  left: 0,
                                  zIndex: idx,
                                } : undefined}
                              >

                                <WaitingFlightMarker
                                  event={`high-card card-node key=${c.playerId}-${c.roundNumber}`}
                                  payload={{
                                    gameId,
                                    position: c.position,
                                    rank: c.card?.rank,
                                    suit: c.card?.suit,
                                    roundNumber: c.roundNumber,
                                    isWinner: c.isWinner,
                                    isDimmed: c.isDimmed,
                                    surface: 'CribbageMobileGameTable',
                                  }}
                                />
                                <CribbagePlayingCard card={toCribbageCard(c.card as any)} size="md" />
                              </div>
                            ))}
                          </div>
                          <span
                            className={cn('text-xs mt-1', isFinalWinner ? 'text-poker-gold font-bold' : 'text-white/70')}
                            style={{ marginTop: stack.length > 1 ? `${(stack.length - 1) * 50 + 4}%` : undefined }}
                          >
                            {getHighCardDisplayNameByPosition(position)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* STABLE PEGBOARD — Wave 5D Pegboard Graduation.
                Position/size/visibility owned by Wave4PegboardSlot via the
                anchored layout resolver. The pegboard now mounts OUTSIDE
                this translateY(6%) wrapper (see below the closing div of
                the felt-content stack) so the rendered DOM rect equals the
                assigned anchored rect. Nothing renders here. */}




            {/* BOOTSTRAP MODE: stable transition shell — no stale cards, no unmount.
                Canonical felt title provides game identity; lifecycle messaging
                ("Preparing next hand...", "Awaiting ante decisions...") is owned
                entirely by the canonical announcement rail (derivedBannerText).
                No felt-level placeholder text — would split ownership. */}

            {/* GAMEPLAY MODE: full game content */}
            {isGameplayMode && viewState && (
              <>
                {/* Spotlight is shell-aware: in shell-owned felt mode it
                    portals itself into the canonical felt frame so the
                    ellipse clip aligns with the true canonical geometry
                    (no legacy giant-circle backing artifact). */}
                <CribbageTurnSpotlight
                  currentTurnPlayerId={viewState.pegging.currentTurnPlayerId}
                  currentPlayerId={currentPlayerId || ''}
                  isVisible={viewState.phase === 'pegging' || (countingDelayActive && !!countingStateSnapshot)}
                  totalPlayers={activeSeatPlayers.length}
                  opponentIds={projectedSeatPlayers.map(o => o.id)}
                  currentTurnPosition={
                    viewState.pegging.currentTurnPlayerId
                      ? activeSeatPlayers.find(p => p.id === viewState.pegging.currentTurnPlayerId)?.position ?? null
                      : null
                  }
                  currentPlayerPosition={currentPlayer?.position ?? null}
                  currentTurnSlot={
                    viewState.pegging.currentTurnPlayerId
                      ? playerSlotById.get(viewState.pegging.currentTurnPlayerId) ?? null
                      : null
                  }
                  shellOwned={true}
                />



                {/* Game Title — now rendered by canonical felt plate (Phase 2.2). */}

                {/* Felt Content */}
                <CribbageFeltContent
                  cribbageState={viewState}
                  players={players}
                  currentPlayerId={currentPlayerId}
                  sequenceStartIndex={sequenceStartIndex}
                  getPlayerUsername={getPlayerUsername}
                  cardBackColors={cardBackColors}
                  countingScoreOverrides={countingScoreOverrides ?? undefined}
                  countingOutroActive={countingDelayActive && !!countingStateSnapshot}
                  thirtyOneDelayActive={thirtyOneDelayActive}
                  handBoundaryKey={renderHandKey || `${currentRoundId}-${currentHandNumber}`}
                  terminalPath={terminalPath}
                  /* Wave 5B — descriptor inputs for Wave4PeggingRowSlot.
                     Mirror the values passed to Wave4PegboardSlot above
                     so the resolver sees a consistent descriptor set. */
                  viewerSeatPosition={currentPlayer?.position ?? null}
                  opponentSeatPositions={[0, 1, 2, 3].filter(
                    (p) => p !== (currentPlayer?.position ?? -1),
                  )}
                  cutCardRevealed={true}
                  cribVisible={true}
                />

                {/* Counting Phase Overlay */}
                {countingStateSnapshot && !countingDelayActive && (
                  <CribbageCountingPhase
                    cribbageState={countingStateSnapshot}
                    players={players}
                    onCountingComplete={handleCountingComplete}
                    cardBackColors={cardBackColors}
                    onAnnouncementChange={handleCountingAnnouncementChange}
                    onScoreUpdate={setCountingScoreOverrides}
                    initialScores={countingBaselineScoresRef.current ?? undefined}
                    winFrozen={countingWinFrozen}
                    countingStartedAt={countingStateSnapshot.countingStartedAt}
                    persistedTargetIndex={countingStateSnapshot.countingTargetIndex}
                    persistedBeatIndex={countingStateSnapshot.countingBeatIndex}
                    persistedHandKey={countingStateSnapshot.countingHandKey}
                    onProgressUpdate={handleCountingProgressUpdate}
                    debugContext={debugCtx}
                  />
                )}

              </>
            )}
          </div>

          {/* Wave 5D Phase 4A.1 — Anchored pegboard mounts here, OUTSIDE the
              translateY(6%) felt-content wrapper but INSIDE the canonical
              felt-frame relative box. This guarantees the rendered DOM rect
              equals the assigned anchored rect (no inherited transforms). */}
          {!isHighCardMode && latchedPegboardDataRef.current && (
            <Wave4PegboardSlot
              phase="pegging"
              viewerSeatPosition={currentPlayer?.position ?? null}
              opponentSeatPositions={[0, 1, 2, 3].filter(
                (p) => p !== (currentPlayer?.position ?? -1),
              )}
              cutCardRevealed={true}
              cribVisible={true}
            >
              <CribbagePegBoard
                players={players}
                playerStates={
                  isGameplayMode && viewState
                    ? viewState.playerStates
                    : latchedPegboardDataRef.current.playerStates
                }
                winningScore={
                  isGameplayMode && viewState
                    ? viewState.pointsToWin
                    : latchedPegboardDataRef.current.winningScore
                }
                overrideScores={countingScoreOverrides ?? undefined}
              />
            </Wave4PegboardSlot>
          )}

          {/* Wave 5D — CribCutGroup Graduation. Mounts OUTSIDE the
              translateY(6%) felt-content wrapper so the rendered DOM rect
              equals the assigned anchored rect. See WAVE 5 INVARIANT in
              Wave4CribCutGroupSlot. */}
          {!isHighCardMode && viewState && (
            <CribbageAnchoredCribCutMount
              cribbageState={viewState}
              cardBackColors={cardBackColors}
              handBoundaryKey={renderHandKey || `${currentRoundId}-${currentHandNumber}`}
              terminalPath={terminalPath}
              countingOutroActive={countingDelayActive && !!countingStateSnapshot}
            />
          )}

          {/* Wave 5D — PeggingRow Graduation. Mounts OUTSIDE the
              translateY(6%) felt-content wrapper so the rendered DOM rect
              equals the assigned anchored rect. See WAVE 5 INVARIANT in
              Wave4CribCutGroupSlot. */}
          {!isHighCardMode && viewState && (
            <CribbageAnchoredPeggingRowMount
              cribbageState={viewState}
              sequenceStartIndex={sequenceStartIndex}
              countingOutroActive={countingDelayActive && !!countingStateSnapshot}
              thirtyOneDelayActive={thirtyOneDelayActive}
              terminalPath={terminalPath}
              viewerSeatPosition={currentPlayer?.position ?? null}
              opponentSeatPositions={[0, 1, 2, 3].filter(
                (p) => p !== (currentPlayer?.position ?? -1),
              )}
              cutCardRevealed={true}
              cribVisible={true}
            />
          )}


          {/* ═══════ PROJECTED SEAT OVERLAY — shell-owned via GameplayOpponentSeatLayer ═══════
              Games emit presentation state (typed accessors); the
              shell mounts CanonicalSeatCluster per opponent. */}
          <GameplayOpponentSeatLayer
            family="cribbage"
            participants={projectedSeatPlayers
              .filter(seatPlayer => isObserver || seatPlayer.id !== currentPlayerId)
              .map(seatPlayer => ({
                id: seatPlayer.id,
                position: seatPlayer.position,
                name: getDisplayName(players, seatPlayer, seatPlayer.profiles?.username || 'Player'),
                chips: seatPlayer.chips,
              }))}
            presentation={{
              dealerPip: (p) => isGameplayMode && !!viewState?.dealerPlayerId && viewState.dealerPlayerId === p.id,
              statusRing: (p) => {
                if (!isGameplayMode) {
                  const seatPlayer = projectedSeatPlayers.find(sp => sp.id === p.id);
                  return seatPlayer
                    ? derivePlayerStatus(seatPlayer, null, { hasStayDecision: false })
                    : undefined;
                }
                return undefined;
              },
              // Wave 3B: hideChipBubble / chipValue='' retired. Shell
              // ChipTransport runtime owns from-seat suppression while a
              // fly is in flight (see useChipTransportSuppressedSeats).

              cardBacks: (p) => {
                if (!isGameplayMode || !viewState) return null;
                const seatState = viewState.playerStates[p.id];
                if (!seatState || seatState.hand.length === 0) return null;
                const showSeatCardBacks = isObserver || p.id !== currentPlayerId;
                return {
                  count: seatState.hand.length,
                  visible: showSeatCardBacks,
                  variant: 'cribbage',
                };
              },
            }}
          />


          {/* Floating felt-level C-pip retired. Crib ownership is now
              indicated by:
                - opponent owns crib → small "C" badge on the opponent's
                  canonical chip bubble (chipOverlay above).
                - local player owns crib → "Your Crib" pill in the
                  active-player identity row (CribbageMobileCardsTab).
              This removes a floating gameplay artifact while keeping
              crib ownership immediately legible. */}
        </div>

        </CribbageGameplayGeometryProvider>
      </div>

      {/* ═══════ UNIFIED BOTTOM SECTION — shell-owned 5-row HUD grid (Phase 2b.1) ═══════
          The HUD region is partitioned by ShellHudGrid into 5 proportional rows:
            row 1 announcement (shell), row 2 timer (empty for Cribbage — no
            turn-clock chips; `derivedBannerText` rail covers all phase
            messaging), row 3 tabs (shell), row 4 pane (tab content),
            row 5 identity (shell-owned active-player strip, mirrors Yahtzee).
          Pane content MUST fit inside row 4. No flex growth, no row 5 spillover. */}
      <ShellHudGrid
        identity={
          currentPlayer ? (
            <div className="w-full h-full flex items-center justify-center gap-2 px-3 overflow-hidden">
              <QuickEmoticonPicker
                onSelect={async (emoticon) => {
                  try {
                    const expiresAt = new Date(Date.now() + 4000).toISOString();
                    await supabase.from('chip_stack_emoticons').insert({
                      game_id: gameId,
                      player_id: currentPlayer.id,
                      emoticon,
                      expires_at: expiresAt,
                    });
                  } catch (err) {
                    console.error('Failed to send emoticon:', err);
                  }
                }}
                disabled={false}
              />
              <p className="text-sm font-semibold text-foreground truncate">
                {currentPlayer.profiles?.username || 'You'}
              </p>
              <span className={cn(
                "font-bold text-lg tabular-nums",
                currentPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'
              )}>
                ${formatChipValue(currentPlayer.chips)}
              </span>
              {isCribDealer(currentPlayerId) && <DealerIndicator />}
            </div>
          ) : null
        }
        pane={
          <div className="h-full overflow-hidden" data-cribbage-active-pane-content="">
            {/* Cards tab during high-card or bootstrap modes intentionally
                renders nothing. All passive lifecycle messaging
                ("Drawing for dealer...", "Awaiting ante decisions...",
                "Preparing next hand...") is owned by the canonical
                announcement rail. Local placeholders here would split
                ownership and produce competing surfaces (Phase 2 / Step 4). */}
            {activeTab === 'cards' && (isHighCardMode || isBootstrapMode) && (
              <div className="h-full" aria-hidden="true" />
            )}

            {/* Cards tab: gameplay mode with guards */}
            {(() => {
              const cardsTabBlocked = isTransitioning || !!countingStateSnapshot || countingAnimationActiveRef.current;
              if (activeTab === 'cards' && isGameplayMode && currentPlayer && cardsTabBlocked) {
                logDebugEvent({
                  gameId,
                  eventType: 'crib:lifecycle:cards_tab_suppressed',
                  payload: {
                    instanceId: instanceIdRef.current,
                    isTransitioning,
                    countingSnapshotActive: !!countingStateSnapshot,
                    countingAnimationActive: countingAnimationActiveRef.current,
                    viewStatePhase: viewState?.phase ?? null,
                    viewStateHandSizes: viewState ? Object.fromEntries(
                      Object.entries(viewState.playerStates).map(([pid, ps]) => [pid.slice(0, 8), ps.hand?.length ?? 0])
                    ) : null,
                    dealerGameId: dealerGameId?.slice(0, 8) ?? null,
                  },
                });
              }
              return null;
            })()}
            {activeTab === 'cards' && isGameplayMode && currentPlayer && viewState && !isTransitioning && !countingStateSnapshot && !countingAnimationActiveRef.current && interactionsAllowed && (
              <CribbageMobileCardsTab
                key={renderHandKey}
                cribbageState={viewState}
                currentPlayerId={currentPlayerId}
                playerCount={players.length}
                isProcessing={isProcessing}
                onDiscard={handleDiscard}
                onPlayCard={handlePlayCard}
                currentPlayer={currentPlayer}
                gameId={gameId}
                isDealer={isCribDealer(currentPlayerId)}
                roundId={roundId}
                renderTrace={{
                  renderHandKey,
                  currentHandKey,
                  dealerGameId: dealerGameId ?? null,
                  isFrozen: syncHandle.isFrozen,
                  authoritativeHand: cribbageState?.playerStates[currentPlayerId]?.hand ?? null,
                  renderSource: 'sync-presentation',
                  expectedRoundId: roundId ?? null,
                  sourceRoundId: currentRoundId ?? null,
                  handNumber,
                  isGameplayMode,
                  viewStateIsCurrentRound,
                  interactionsAllowed,
                }}
              />
            )}

            {/* Counting animation placeholder */}
            {activeTab === 'cards' && isGameplayMode && countingStateSnapshot && (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground text-sm">
                  {countingTargetLabel ? `Scoring ${countingTargetLabel}...` : 'Scoring hands...'}
                </p>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="h-full p-2">
                <MobileChatPanel
                  messages={allMessages}
                  onSend={sendMessage}
                  isSending={isChatSending}
                  dealerMessages={dealerMessages}
                  currentUserId={currentUserId}
                />
              </div>
            )}

            {activeTab === 'lobby' && (
              <div className="h-full overflow-auto p-4 space-y-2">
                {players.map(player => (
                  <div key={player.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                    <span className="text-sm">{getDisplayName(players, player, player.profiles?.username || 'Player')}</span>
                    <span className="text-sm text-poker-gold">${player.chips}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'history' && (
              <HandHistory
                gameId={gameId}
                currentUserId={currentUserId}
                currentPlayerId={currentPlayerId}
                gameType="cribbage"
              />
            )}
          </div>
        }
      />
    </div>
  );
};
