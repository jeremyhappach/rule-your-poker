import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
import {
  initializeCribbageGame, 
  discardToCrib, 
  playPeggingCard, 
  callGo,
  applyHandCountScores,
} from '@/lib/cribbageGameLogic';
import { endCribbageGame, startNextCribbageHand } from '@/lib/cribbageRoundLogic';
import { hasPlayableCard } from '@/lib/cribbageScoring';
import { getHandScoringCombos, getTotalFromCombos } from '@/lib/cribbageScoringDetails';
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbageFeltContent } from './CribbageFeltContent';
import { CribbageMobileCardsTab } from './CribbageMobileCardsTab';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCountingPhase } from './CribbageCountingPhase';
import { CribbageTurnSpotlight } from './CribbageTurnSpotlight';
import { HighCardDealerSelection, type DealerSelectionCard, type DealerSelectionState } from './HighCardDealerSelection';
import { CribbageSkunkOverlay } from './CribbageSkunkOverlay';
// CribbageWinnerAnnouncement removed - win message now in dealer banner area
import { CribbageChipTransferAnimation } from './CribbageChipTransferAnimation';
import { MobileChatPanel } from './MobileChatPanel';
import { HandHistory } from './HandHistory';
import { RoundHandDebugOverlay } from './RoundHandDebugOverlay';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { useGameChat } from '@/hooks/useGameChat';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";
import { MessageSquare, User, Clock } from 'lucide-react';
import { 
  useCribbageEventContext, 
  logPeggingPlay, 
  logGoPointEvent,
  logHisHeelsEvent,
  logCountingScoringEvents,
  logCutCardEvent
} from '@/lib/useCribbageEventLogging';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  sitting_out?: boolean;
  profiles?: { username: string };
}

interface CribbageGameConfig {
  pointsToWin: number;
  skunkEnabled: boolean;
  skunkThreshold: number;
  doubleSkunkEnabled: boolean;
  doubleSkunkThreshold: number;
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
  // Dealer selection props (optional - used during cribbage_dealer_selection phase)
  dealerSelectionCards?: DealerSelectionCard[];
  dealerSelectionAnnouncement?: string | null;
  dealerSelectionWinnerPosition?: number | null;
  isDealerSelection?: boolean;

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
function getHandKey(state: CribbageState | null): string {
  if (!state) return '';
  const firstPlayerId = state.turnOrder[0];
  const firstPlayerHand = state.playerStates[firstPlayerId]?.hand || [];
  // Include discardedToCrib to differentiate pre/post discard
  const discarded = state.playerStates[firstPlayerId]?.discardedToCrib || [];
  const handSig = [...firstPlayerHand, ...discarded]
    .map(c => `${c.rank}${c.suit}`)
    .sort()
    .join(',');
  return `${state.dealerPlayerId}-${handSig}`;
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
  dealerSelectionAnnouncement: externalDealerSelectionAnnouncement,
  dealerSelectionWinnerPosition: externalDealerSelectionWinnerPosition,
  isDealerSelection = false,

  dealerChatMessages: externalDealerChatMessages,
  onInjectDealerChatMessage,
}: CribbageMobileGameTableProps) => {
  const { getTableColors, getCardBackColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  
  // Chat hook - integrated like other mobile game tables
  const { allMessages, sendMessage, isSending: isChatSending } = useGameChat(gameId, players, currentUserId);
  
  // Unread messages tracking for chat tab indicator
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatTabFlashing, setChatTabFlashing] = useState(false);
  const prevMessageCountRef = useRef(0);
  // Track dealer messages to exclude them from unread count
  const dealerMessageCountRef = useRef(0);
  
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  // Keep latest state in a ref so effects can avoid depending on object identity churn.
  const cribbageStateRef = useRef<CribbageState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
  
  // Local tracking of current round for proper hand transitions
  // These start from props but can be updated when starting a new hand
  const [currentRoundId, setCurrentRoundId] = useState(roundId);
  const [currentHandNumber, setCurrentHandNumber] = useState(handNumber);

  // Sync local round tracking when props change (e.g., when parent reloads game state)
  // CRITICAL: With multiple clients, props can temporarily lag behind a locally-started next hand.
  // Never allow a stale prop update (older handNumber) to overwrite our forward-only local tracking,
  // otherwise the realtime subscription can snap back to the previous round and replay counting.
  useEffect(() => {
    if (!roundId) return;

    // Forward-only sync for hand number
    setCurrentHandNumber((prev) => {
      if (handNumber > prev) return handNumber;
      return prev;
    });

    // Only accept prop roundId when it is not stale relative to our local hand.
    setCurrentRoundId((prev) => {
      if (!prev) return roundId;
      if (handNumber > currentHandNumber) return roundId;
      if (handNumber === currentHandNumber) return roundId;
      // props are behind; keep our locally-advanced roundId
      return prev;
    });
  }, [roundId, handNumber, currentHandNumber]);

  useEffect(() => {
    cribbageStateRef.current = cribbageState;
  }, [cribbageState]);

  // High card dealer selection state - only for first hand
  const [showHighCardSelection, setShowHighCardSelection] = useState(false);
  const [highCardAnnouncement, setHighCardAnnouncement] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const hasInitializedRef = useRef(false);

  // DB-synced high-card selection state (so all clients see the same deal)
  const [highCardSyncedState, setHighCardSyncedState] = useState<DealerSelectionState | null>(null);
  const [highCardCards, setHighCardCards] = useState<DealerSelectionCard[]>([]);
  const [highCardWinnerPosition, setHighCardWinnerPosition] = useState<number | null>(null);

  // When in external dealer selection mode (cribbage_dealer_selection status), use external props
  const effectiveShowHighCardSelection = isDealerSelection || showHighCardSelection;
  const effectiveHighCardCards = isDealerSelection ? (externalDealerSelectionCards || []) : highCardCards;
  const effectiveHighCardAnnouncement = isDealerSelection ? externalDealerSelectionAnnouncement : highCardAnnouncement;
  const effectiveHighCardWinnerPosition = isDealerSelection ? externalDealerSelectionWinnerPosition : highCardWinnerPosition;

  // Track hand key to detect hand transitions and prevent stale card flash
  const currentHandKey = useMemo(() => getHandKey(cribbageState), [cribbageState]);
  const lastHandKeyRef = useRef<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Counting phase announcement state (propagated from CribbageCountingPhase)
  const [countingAnnouncement, setCountingAnnouncement] = useState<string | null>(null);
  const [countingTargetLabel, setCountingTargetLabel] = useState<string | null>(null);
  
  // Counting phase animated scores - peg board reads these instead of final scores
  const [countingScoreOverrides, setCountingScoreOverrides] = useState<Record<string, number> | null>(null);

  // IMPORTANT: Keep a stable baseline for the counting animation.
  // If the counting overlay ever remounts/re-inits, it must start from the pegging baseline
  // (not from the already-animated overrides), otherwise scores can double.
  const countingBaselineScoresRef = useRef<Record<string, number> | null>(null);
  // Stable id for the currently-animated counting instance (latched when counting begins)
  const countingHandKeyRef = useRef<string | null>(null);

  // Cache the latest pegging-phase scores so counting can always start from the true pre-count baseline
  // even if the DB state already contains post-count totals or has incomplete playedCards data.
  const lastPeggingScoresRef = useRef<Record<string, number> | null>(null);
  
  // Delay before showing counting phase to allow final pegging announcement to display
  const [countingDelayActive, setCountingDelayActive] = useState(false);
  const countingDelayFiredRef = useRef<string | null>(null);
  
  // Ref to track if counting animation is active - used by realtime handler to avoid stale closure
  const countingAnimationActiveRef = useRef(false);
  
  // Store the cribbage state snapshot used for counting animation - this prevents the animation
  // from disappearing when DB phase transitions to 'complete' during counting
  const [countingStateSnapshot, setCountingStateSnapshot] = useState<CribbageState | null>(null);
  
  // Signal to counting phase to freeze when win is detected reactively via score subscription
  const [countingWinFrozen, setCountingWinFrozen] = useState(false);

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
  }, [cribbageState?.phase, cribbageState?.lastHandCount ? 'has-count' : 'no-count']);

  // Win sequence state
  type WinSequencePhase = 'idle' | 'skunk' | 'announcement' | 'chips' | 'complete';
  const [winSequencePhase, setWinSequencePhase] = useState<WinSequencePhase>('idle');
  const [winSequenceData, setWinSequenceData] = useState<{
    winnerId: string;
    winnerName: string;
    multiplier: number;
    amountPerLoser: number;
    totalWinnings: number;
    loserIds: string[];
  } | null>(null);
  const [chipAnimationTriggerId, setChipAnimationTriggerId] = useState<string | null>(null);
  // Stored positions for chip animation - computed when transitioning to 'chips' phase
  const [storedChipPositions, setStoredChipPositions] = useState<{
    winner: { x: number; y: number };
    losers: { playerId: string; x: number; y: number }[];
  } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const winSequenceFiredRef = useRef<string | null>(null);
  // Prevent double scheduling of the win sequence before the 2s delay fires.
  const winSequenceScheduledRef = useRef<string | null>(null);
  // Source-level guard for skunk overlay to prevent double-firing per animation-trigger pattern.
  const skunkOverlayFiredRef = useRef<string | null>(null);
  // Source-level guard for chip animation trigger to prevent double-firing
  const chipAnimationFiredRef = useRef<string | null>(null);

  // Source-level guard for starting next hand to prevent double-firing on same client
  const startNextHandFiredRef = useRef<string | null>(null);

  // Stable guard key so transient roundId churn can't cause duplicate win sequences.
  // IMPORTANT: include dealerGameId so a player can win multiple dealer games in the same session.
  const winKeyFor = (winnerId: string) => `${gameId}:${dealerGameId ?? 'unknown-dealer'}:${winnerId}`;

  // Event logging context - uses local tracking for proper hand transitions
  const eventCtx = useCribbageEventContext(currentRoundId, dealerGameId, currentHandNumber);
  
  // Track if we've logged the cut card for this hand
  const cutCardLoggedRef = useRef<string | null>(null);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  
  // Derive sequenceStartIndex from state - this is authoritative and survives missed realtime updates
  const sequenceStartIndex = cribbageState?.pegging?.sequenceStartIndex ?? 0;

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
      dealerMessageCountRef.current += 1;
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
    dealerMessageCountRef.current += 1;
  }, [onInjectDealerChatMessage]);

  // Inject "New game starting" exactly once per dealer_game_id, even during dealer selection
  const newGameAnnouncementKeyRef = useRef<string | null>(null);
  const announceNewGameStarting = useCallback(() => {
    if (!dealerGameId) return;
    if (newGameAnnouncementKeyRef.current === dealerGameId) return;
    newGameAnnouncementKeyRef.current = dealerGameId;
    injectDealerMessage('New game starting');
  }, [dealerGameId, injectDealerMessage]);

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
      }
    }
  }, [injectDealerMessage]);

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
  useEffect(() => {
    const state = cribbageStateRef.current;
    if (!state) return;
    if (!countingStartKey) return;

    // If we've already started a counting animation, never re-initialize it.
    // This is critical when multiple clients are open and the parent props churn.
    if (countingAnimationActiveRef.current) return;

    // Only snapshot once per counting phase instance
    if (countingDelayFiredRef.current === countingStartKey) return;

    // Mark counting animation as active
    countingAnimationActiveRef.current = true;
    countingDelayFiredRef.current = countingStartKey;
    countingHandKeyRef.current = countingStartKey;
    setCountingStateSnapshot(state);

    // Initialize counting score overrides with the pegging baseline IMMEDIATELY.
    // IMPORTANT: The final pegging +1 ("Last" / "Go") is often applied on the SAME
    // transition that flips phase to 'counting'. That means our "phase === pegging" cache
    // can be 1 point behind.
    //
    // Heuristic:
    // - Prefer the live state scores if they only differ by a small non-negative delta (<=2)
    //   from the cached pegging scores.
    // - Otherwise, fall back to cached pegging scores (protects against any unexpected
    //   pre-applied counting totals in the backend).
    const stateScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(state.playerStates)) {
      stateScores[playerId] = ps.pegScore ?? 0;
    }

    const cachedScores = lastPeggingScoresRef.current;
    const baselineScores = (() => {
      if (!cachedScores) return stateScores;

      const deltas = Object.keys(stateScores).map((pid) => (stateScores[pid] ?? 0) - (cachedScores[pid] ?? 0));
      const maxDelta = deltas.length ? Math.max(...deltas) : 0;
      const minDelta = deltas.length ? Math.min(...deltas) : 0;

      // Accept small forward-only drift (e.g., the missing "Last" point) and use the live state.
      if (minDelta >= 0 && maxDelta <= 2) return stateScores;

      // Otherwise, trust the cached pegging scores.
      return cachedScores;
    })();

    // Stable baseline for the counting overlay (do NOT derive from animated overrides)
    countingBaselineScoresRef.current = baselineScores;

    // Keep cache aligned with what we're using as the baseline for this hand.
    lastPeggingScoresRef.current = baselineScores;
    setCountingScoreOverrides(baselineScores);

    // Start delay - counting phase will be hidden until delay completes
    setCountingDelayActive(true);
    const timer = setTimeout(() => {
      setCountingDelayActive(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [countingStartKey]);

  // Clear counting overrides when starting a fresh hand (discarding phase).
  // This prevents stale override values from affecting the pegboard in non-counting phases.
  // We intentionally do NOT clear during counting→complete because the peg needs to show final scores.
  useEffect(() => {
    if (!cribbageState) return;
    // Clear overrides when we're in discarding or cutting (new hand started)
    if (cribbageState.phase === 'discarding' || cribbageState.phase === 'cutting') {
      // Only clear if we actually have stale overrides AND the snapshot is cleared
      // (meaning counting animation is truly complete)
      if (countingScoreOverrides && !countingStateSnapshot) {
        setCountingScoreOverrides(null);
      }
    }
  }, [cribbageState?.phase, countingScoreOverrides, countingStateSnapshot]);

  useEffect(() => {
    const playerMessageCount = allMessages.length;
    const totalWithDealer = playerMessageCount + dealerMessages.length;
    
    // Only flash for player messages, not dealer messages
    if (playerMessageCount > prevMessageCountRef.current && activeTab !== 'chat') {
      setChatTabFlashing(true);
      setHasUnreadMessages(true);
      const timeout = setTimeout(() => setChatTabFlashing(false), 1500);
      prevMessageCountRef.current = playerMessageCount;
      return () => clearTimeout(timeout);
    }
    
    prevMessageCountRef.current = playerMessageCount;
  }, [allMessages.length, dealerMessages.length, activeTab]);

  // Clear unread messages when switching to chat tab
  useEffect(() => {
    if (activeTab === 'chat') {
      setHasUnreadMessages(false);
    }
  }, [activeTab]);

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
    
    // Check if any player has reached the winning threshold
    for (const [playerId, score] of Object.entries(countingScoreOverrides)) {
      if (score >= pointsToWin) {
        console.log('[CRIBBAGE] Win detected via score subscription:', { playerId, score, pointsToWin });

        const winKey = winKeyFor(playerId);
        if (winSequenceFiredRef.current === winKey || winSequenceScheduledRef.current === winKey) return;

        // Guard immediately so we can't schedule multiple timers before the first one fires.
        winSequenceScheduledRef.current = winKey;
        
        // Freeze the counting animation - it should stop advancing and keep cards highlighted
        setCountingWinFrozen(true);
        
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
        
        // Short delay to let the winning combo highlight and peg advance visually settle
        setTimeout(() => {
          triggerWinSequence(stateWithWinner);
        }, 2000);
        
        return; // Only one winner
      }
    }
  }, [countingScoreOverrides, cribbageState, roundId]);

  // Initialize game state - check if we need high card selection first
  // This runs ONCE on mount to determine if we need high-card selection or can load existing state
  useEffect(() => {
    // Guard: need roundId to proceed
    if (!roundId) {
      console.log('[CRIBBAGE] No roundId yet, waiting...');
      return;
    }
    
    const loadOrInitializeState = async () => {
      if (hasInitializedRef.current || initialLoadComplete) {
        console.log('[CRIBBAGE] Already initialized, skipping');
        return;
      }
      
      console.log('[CRIBBAGE] Loading state for round:', roundId);
      
      const { data: roundData, error } = await supabase
        .from('rounds')
        .select('cribbage_state, hand_number')
        .eq('id', roundId)
        .single();

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
        hasInitializedRef.current = true;
        setInitialLoadComplete(true);
        setCribbageState(roundData.cribbage_state as unknown as CribbageState);
        return;
      }

      // First hand of a new cribbage game - show high card selection
      // Mark load complete but show selection (don't set hasInitializedRef yet)
      const isFirstHand = !roundData?.hand_number || roundData.hand_number <= 1;
      
      if (isFirstHand) {
        console.log('[CRIBBAGE] First hand - starting high card selection');
        // Inject "new game starting" message into chat (idempotent per dealer_game_id)
        announceNewGameStarting();
        setShowHighCardSelection(true);
        setInitialLoadComplete(true);
        return;
      }

      // Not first hand but no state - initialize with session dealer
      console.log('[CRIBBAGE] Not first hand, initializing with session dealer');
      hasInitializedRef.current = true;
      setInitialLoadComplete(true);
      const dealerId = players.find(p => p.position === dealerPosition)?.id || players[0].id;
      const playerIds = players.map(p => p.id);
      const newState = initializeCribbageGame(playerIds, dealerId, anteAmount, gameConfig);
      
      await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);
      
      setCribbageState(newState);
    };

    loadOrInitializeState();
  }, [roundId, initialLoadComplete, injectDealerMessage, announceNewGameStarting]); // Re-run if roundId changes, include initialLoadComplete in deps

  // Keep showHighCardSelection from "sticking" after the real cribbage_state arrives (non-host clients)
  useEffect(() => {
    if (!showHighCardSelection) return;
    if (!cribbageState) return;
    setShowHighCardSelection(false);
    setHighCardAnnouncement(null);
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

      setHighCardSyncedState((data?.dealer_selection_state as unknown as DealerSelectionState) ?? null);
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
    setHighCardAnnouncement(null);
    setInitialLoadComplete(true);

    // Initialize the game with the winner as dealer
    hasInitializedRef.current = true;
    const playerIds = players.map(p => p.id);
    const newState = initializeCribbageGame(playerIds, winnerPlayer.id, anteAmount, gameConfig);

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
    if (!state.winnerPlayerId) return;
    const winKey = winKeyFor(state.winnerPlayerId);
    if (winSequenceFiredRef.current === winKey) return;
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

    // Inject win announcement into chat with final scores
    const winnerScore = state.playerStates[winnerId]?.pegScore ?? 0;
    const loserScores = loserIds.map(id => state.playerStates[id]?.pegScore ?? 0);
    const loserScoreStr = loserScores.join('-');
    injectDealerMessage(`${winnerName} won the game ${winnerScore}-${loserScoreStr}!`);

    setWinSequenceData({
      winnerId,
      winnerName,
      multiplier,
      amountPerLoser,
      totalWinnings,
      loserIds,
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

    // Fire confetti only for the winner
    if (currentPlayerId === winnerId) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'],
      });
    }

    // Start sequence - skunk overlay if applicable, otherwise straight to announcement
    // Use source-level guard to prevent double-firing of skunk overlay
    const skunkKey = `${winKey}-skunk-${multiplier}`;
    if (multiplier >= 2 && skunkOverlayFiredRef.current !== skunkKey) {
      skunkOverlayFiredRef.current = skunkKey;
      setWinSequencePhase('skunk');
    } else if (multiplier >= 2) {
      // Already showed skunk, skip to announcement
      setWinSequencePhase('announcement');
    } else {
      setWinSequencePhase('announcement');
    }
  }, [players, anteAmount, currentPlayerId, roundId, isHost, gameId, injectDealerMessage]);

  // Ensure pegging-phase wins still trigger the win sequence (no counting animation involved).
  useEffect(() => {
    if (!cribbageState?.winnerPlayerId) return;
    if (cribbageState.phase !== 'complete') return;
    if (countingAnimationActiveRef.current) return;
    const winKey = winKeyFor(cribbageState.winnerPlayerId);
    if (winSequenceFiredRef.current === winKey || winSequenceScheduledRef.current === winKey) return;

    // Guard immediately to avoid multi-fire on rapid state churn.
    winSequenceScheduledRef.current = winKey;
    triggerWinSequence(cribbageState);
  }, [cribbageState?.phase, cribbageState?.winnerPlayerId, roundId, triggerWinSequence]);

  // Realtime subscription with polling fallback
  // This ensures updates are received even if WebSocket connection degrades
  useEffect(() => {
    if (!currentRoundId) return;

    let pollInterval = 2000; // Start at 2 seconds
    let pollTimeoutId: ReturnType<typeof setTimeout>;
    let lastSyncTimestamp: string | null = null;
    let isActive = true;

    // Handler for state updates (from realtime or polling)
    const handleStateUpdate = (newCribbageState: CribbageState, fromRealtime: boolean) => {
      if (!isActive) return;
      
      setCribbageState(newCribbageState);
      
      // Reset poll interval when realtime works
      if (fromRealtime) {
        pollInterval = 2000;
      }
      
      // IMPORTANT: Win sequence is now ONLY triggered via handleCountingComplete callback.
      // The counting animation must always play out fully, with the winning combo highlighted
      // and scores incrementing on the peg board, BEFORE the win celebration begins.
      // This preserves the suspense and allows players to see the exact combo that won.
      // 
      // The realtime handler should NOT trigger win sequence - that's the counting animation's job.
    };

    // Use a simple state signature since rounds doesn't have updated_at
    const getStateSignature = (state: CribbageState): string => {
      return `${state.phase}-${state.pegging.playedCards.length}-${state.pegging.currentCount}-${state.pegging.currentTurnPlayerId}`;
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
          pollInterval = Math.min(pollInterval * 1.5, 15000);
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
            // Backoff when no changes (max 10 seconds to stay responsive)
            pollInterval = Math.min(pollInterval * 1.3, 10000);
          }
        }
      } catch (err) {
        console.error('[CRIBBAGE_POLL] Poll error:', err);
        pollInterval = Math.min(pollInterval * 1.5, 15000);
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
  }, [currentRoundId, triggerWinSequence]);

  // REMOVED: Initial load win trigger - all win sequences now go through counting animation.
  // If a game is rejoined in 'complete' state, the counting animation snapshot logic will handle it.

  // Detect hand transitions to prevent stale card flash
  useEffect(() => {
    if (!currentHandKey) return;
    
    // If hand key changed, we're transitioning to a new hand
    if (lastHandKeyRef.current && lastHandKeyRef.current !== currentHandKey) {
      setIsTransitioning(true);
      // Brief delay to allow the new state to fully settle
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 100);
      return () => clearTimeout(timer);
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

    // Build a safe baseline score (pre-counting) for event logging.
    // IMPORTANT: At the start of counting, pegScore is usually still the pegging-only score.
    // But if a client only observes the state after counting has applied (or during a fast
    // counting -> complete transition), pegScore may already include hand+crib points.
    //
    // So per-player we subtract totals ONLY when pegScore is high enough to plausibly include them;
    // otherwise we treat pegScore as the baseline. This prevents negative scores_after.
    const currentScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      currentScores[playerId] = ps.pegScore ?? 0;
    }

    const dealerId = cribbageState.dealerPlayerId;
    const perPlayerHandTotals: Record<string, number> = {};
    for (const playerId of Object.keys(cribbageState.playerStates)) {
      const hand = cribbageState.pegging.playedCards
        .filter((pc) => pc.playerId === playerId)
        .map((pc) => pc.card);
      const combos = getHandScoringCombos(hand, cribbageState.cutCard, false);
      perPlayerHandTotals[playerId] = combos.reduce((sum, c) => sum + c.points, 0);
    }

    const cribCombos = getHandScoringCombos(cribbageState.crib, cribbageState.cutCard, true);
    const cribTotal = cribCombos.reduce((sum, c) => sum + c.points, 0);

    const runningScores: Record<string, number> = {};
    for (const playerId of Object.keys(cribbageState.playerStates)) {
      const handTotal = perPlayerHandTotals[playerId] ?? 0;
      const cribPts = playerId === dealerId ? cribTotal : 0;
      const subtractTotal = handTotal + cribPts;

      const current = currentScores[playerId] ?? 0;
      const baseline = current >= subtractTotal ? current - subtractTotal : current;
      runningScores[playerId] = Math.max(0, baseline);
    }

    // Log all hand and crib scoring events (atomic DB guard prevents duplicates)
    logCountingScoringEvents(eventCtx, cribbageState, players, runningScores);
  }, [cribbageState?.phase, eventCtx, players]);

  // Auto-go
  useEffect(() => {
    if (!cribbageState || !currentPlayerId || isProcessing) return;
    if (cribbageState.phase !== 'pegging') return;
    if (cribbageState.pegging.currentTurnPlayerId !== currentPlayerId) return;
    
    const myState = cribbageState.playerStates[currentPlayerId];
    if (!myState) return;
    
    const canPlay = hasPlayableCard(myState.hand, cribbageState.pegging.currentCount);
    if (!canPlay && myState.hand.length > 0) {
      const timeout = setTimeout(() => {
        handleGo();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [cribbageState?.pegging.currentTurnPlayerId, cribbageState?.pegging.currentCount, currentPlayerId, isProcessing]);

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
            const newState = discardToCrib(cribbageState, player.id, discardIndices);
            await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId);
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

        botActionInProgress.current = true;

        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

        try {
          if (shouldBotCallGo(botState, cribbageState.pegging.currentCount)) {
            const newState = callGo(cribbageState, currentTurnId);
            // Fire-and-forget event logging (atomic DB guard prevents duplicates)
            logGoPointEvent(eventCtx, cribbageState, newState);
            
            await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId);
          } else {
            const cardIndex = getBotPeggingCardIndex(
              botState,
              cribbageState.pegging.currentCount,
              cribbageState.pegging.playedCards
            );

            if (cardIndex !== null) {
              const cardPlayed = botState.hand[cardIndex];
              const newState = playPeggingCard(cribbageState, currentTurnId, cardIndex);
              // Fire-and-forget event logging (atomic DB guard prevents duplicates)
              logPeggingPlay(eventCtx, cribbageState, newState, currentTurnId, cardPlayed);
              // Check for his_heels on phase transition
              if (newState.lastEvent?.type === 'his_heels') {
                logHisHeelsEvent(eventCtx, newState);
              }
              
              await supabase
                .from('rounds')
                .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
                .eq('id', roundId);
            }
          }
        } catch (err) {
          console.error('[CRIBBAGE BOT] Pegging error:', err);
        } finally {
          botActionInProgress.current = false;
        }
      }
    };

    const timeout = setTimeout(processBotActions, 100);
    return () => clearTimeout(timeout);
  }, [cribbageState, isProcessing, players, roundId]);

  const updateState = async (newState: CribbageState) => {
    if (!currentRoundId) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', currentRoundId);

      if (error) throw error;
      setCribbageState(newState);
    } catch (err) {
      console.error('[CRIBBAGE] Error updating state:', err);
      toast.error('Failed to update game state');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = useCallback(async (cardIndices: number[]) => {
    if (!cribbageState || !currentPlayerId) return;
    
    try {
      const newState = discardToCrib(cribbageState, currentPlayerId, cardIndices);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId]);

  const handlePlayCard = useCallback(async (cardIndex: number) => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const playerState = cribbageState.playerStates[currentPlayerId];
      const cardPlayed = playerState?.hand[cardIndex];
      const newState = playPeggingCard(cribbageState, currentPlayerId, cardIndex);
      // Fire-and-forget event logging (atomic DB guard prevents duplicates)
      if (cardPlayed) {
        logPeggingPlay(eventCtx, cribbageState, newState, currentPlayerId, cardPlayed);
      }
      // Check for his_heels on phase transition
      if (newState.lastEvent?.type === 'his_heels') {
        logHisHeelsEvent(eventCtx, newState);
      }
      
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId, eventCtx]);

  const handleGo = useCallback(async () => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const newState = callGo(cribbageState, currentPlayerId);
      // Fire-and-forget event logging (atomic DB guard prevents duplicates)
      logGoPointEvent(eventCtx, cribbageState, newState);
      
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId, eventCtx]);

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
    if (startNextHandFiredRef.current === handKey) {
      console.log('[CRIBBAGE] handleCountingComplete already fired for this hand, skipping', { handKey });
      return;
    }
    startNextHandFiredRef.current = handKey;
    
    // Mark counting animation as complete and clear snapshot.
    // IMPORTANT: Do NOT set countingAnimationActiveRef.current = false here.
    // With multiple clients, the parent can advance (roundId/handNumber props change) before
    // this client fully receives/render-syncs the new round state. If we drop the latch early,
    // the counting init effect can re-run and replay the scoring sequence.
    setCountingStateSnapshot(null);
    setCountingWinFrozen(false);
    
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
      
      // CRITICAL FIX: Check if applyHandCountScores detected a winner.
      // This catches edge cases where the reactive win detection didn't fire
      // (e.g., due to animation timing or ref guards).
      if (countedState.phase === 'complete' && countedState.winnerPlayerId) {
        console.log('[CRIBBAGE] handleCountingComplete: Winner detected by applyHandCountScores', {
          winnerId: countedState.winnerPlayerId,
          phase: countedState.phase,
        });
        // Persist the completed state and trigger win sequence
        await updateState(countedState);
        triggerWinSequence(countedState);
        return;
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
        setCribbageState(result.newState);
      }
    } catch (err) {
      console.error('[CRIBBAGE] Error starting new hand:', err);
      toast.error('Failed to start new hand');
    }
  }, [cribbageState, players, triggerWinSequence, gameId, dealerGameId, currentRoundId, currentHandNumber]);

  // Win sequence phase handlers
  const handleSkunkComplete = useCallback(() => {
    setWinSequencePhase('announcement');
  }, []);

  const handleAnnouncementComplete = useCallback(() => {
    // Compute chip animation positions
    if (!winSequenceData || !tableContainerRef.current) {
      setWinSequencePhase('complete');
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

    const container = tableContainerRef.current;
    const rect = container.getBoundingClientRect();

    // Winner position - find the winner player's chip stack position
    const winnerPlayer = players.find(p => p.id === winSequenceData.winnerId);
    const isWinnerCurrentPlayer = winnerPlayer?.user_id === currentUserId;

    // Calculate positions based on player layout
    // Winner at bottom center if current player, otherwise in opponent area
    const winnerPos = isWinnerCurrentPlayer
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
      : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };

    // Loser positions
    const loserPositions = winSequenceData.loserIds.map((loserId, index) => {
      const loserPlayer = players.find(p => p.id === loserId);
      const isLoserCurrentPlayer = loserPlayer?.user_id === currentUserId;
      
      if (isLoserCurrentPlayer) {
        return {
          playerId: loserId,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height * 0.85,
        };
      }
      
      // Opponent positions - stack vertically on left side
      return {
        playerId: loserId,
        x: rect.left + rect.width * 0.15,
        y: rect.top + rect.height * (0.2 + index * 0.15),
      };
    });

    // Store positions in state so chip animation has them on first render
    setStoredChipPositions({ winner: winnerPos, losers: loserPositions });
    setChipAnimationTriggerId(`crib-win-${roundId}-${Date.now()}`);
    setWinSequencePhase('chips');
  }, [winSequenceData, players, currentUserId, onGameComplete, roundId, gameId]);

  const handleChipAnimationEnd = useCallback(() => {
    setWinSequencePhase('complete');
    // Small delay before transitioning to next game
    setTimeout(() => {
      // Wait briefly for backend to mark game_over (endCribbageGame is async + cross-client).
      // If we transition too early, Game.tsx will refuse to advance because status !== game_over.
      (async () => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const ok = await ensureBackendGameOverAck();
          if (ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        onGameComplete();
      })();
    }, 500);
  }, [ensureBackendGameOverAck, onGameComplete]);

  // Auto-transition from 'announcement' to 'chips' (banner-only winner message; don't stall the flow)
  useEffect(() => {
    if (winSequencePhase !== 'announcement') return;

    // If we somehow don't have data yet, wait for it rather than calling handleAnnouncementComplete
    // which would force-complete and potentially leave the UI in a confusing state.
    if (!winSequenceData) return;

    const timer = setTimeout(() => {
      handleAnnouncementComplete();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [winSequencePhase, winSequenceData, handleAnnouncementComplete]);

  // Safety timeout: If chip animation phase doesn't complete within 8 seconds, force transition
  // (animation is now ~4s + stagger, so 8s is safe)
  useEffect(() => {
    if (winSequencePhase !== 'chips') return;
    
    const safetyTimer = setTimeout(() => {
      console.warn('[CRIBBAGE] Chip animation safety timeout triggered');
      setWinSequencePhase('complete');
      (async () => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const ok = await ensureBackendGameOverAck();
          if (ok) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        onGameComplete();
      })();
    }, 8000);
    
    return () => clearTimeout(safetyTimer);
  }, [winSequencePhase, ensureBackendGameOverAck, onGameComplete]);

  // Show high card selection if needed (internal or external dealer selection mode)
  if (effectiveShowHighCardSelection) {
    const latestRoundNum = effectiveHighCardCards.length > 0
      ? Math.max(...effectiveHighCardCards.map(c => c.roundNumber))
      : 1;
    const visibleCards = effectiveHighCardCards
      .filter(c => c.roundNumber === latestRoundNum)
      .sort((a, b) => a.position - b.position);

    return (
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* Felt Area for high card selection */}
        <div 
          className="relative flex items-center justify-center"
          style={{ 
            height: '55vh',
            minHeight: '300px'
          }}
        >
          <div className="absolute inset-0 bg-slate-200 z-0" />
          <div
            className="relative z-10"
            style={{
              width: 'min(90vw, calc(55vh - 32px))',
              height: 'min(90vw, calc(55vh - 32px))',
            }}
          >
            <div className="relative rounded-full overflow-hidden border-2 border-white/80 w-full h-full">
              {tableColors.showBridge ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${peoriaBridgeMobile})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.5)',
                  }}
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(ellipse at center, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
                    filter: 'brightness(0.7)',
                  }}
                />
              )}

              {/* DB-synced high-card selection logic (renders nothing) - only run if NOT external mode */}
              {!isDealerSelection && (
                <HighCardDealerSelection
                  gameId={gameId}
                  players={players as any}
                  onComplete={handleHighCardComplete}
                  isHost={isHost}
                  allowBotDealers={true}
                  syncedState={highCardSyncedState}
                  onCardsUpdate={setHighCardCards}
                  onAnnouncementUpdate={(message, _isComplete) => setHighCardAnnouncement(message)}
                  onWinnerPositionUpdate={setHighCardWinnerPosition}
                />
              )}

              {/* Centered render of the current selection round */}
              <div className="absolute inset-0 flex items-center justify-center z-40">
                <div className="flex gap-4 items-end">
                  {visibleCards.map((dc) => {
                    const isWinner = dc.isWinner || (effectiveHighCardWinnerPosition !== null && dc.position === effectiveHighCardWinnerPosition);
                    const dim = dc.isDimmed;
                    return (
                      <div
                        key={`${dc.playerId}-${dc.roundNumber}`}
                        className={cn(
                          'flex flex-col items-center transition-all duration-300',
                          isWinner ? 'transform -translate-y-2 scale-110' : '',
                          dim ? 'opacity-50' : ''
                        )}
                      >
                        <div className={cn(isWinner ? 'ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' : '')}>
                          <CribbagePlayingCard card={toCribbageCard(dc.card as any)} size="md" />
                        </div>
                        <span className={cn('text-xs mt-1', isWinner ? 'text-poker-gold font-bold' : 'text-white/70')}>
                          {getHighCardDisplayNameByPosition(dc.position)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Announcement banner */}
        {effectiveHighCardAnnouncement && (
          <div className="bg-poker-gold/95 px-4 py-3 text-center">
            <p className="text-sm font-bold text-slate-900">{effectiveHighCardAnnouncement}</p>
          </div>
        )}

        {/* Tab section placeholder */}
        <div className="flex-1 bg-background" />
      </div>
    );
  }

  // Show loading only AFTER initial load attempt completes and still no state (not in external dealer selection mode)
  if (!isDealerSelection && (!initialLoadComplete || !cribbageState || !currentPlayerId)) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-poker-gold">Loading Cribbage...</div>
      </div>
    );
  }

  // Get opponents for display around the table
  const opponents = players.filter(p => p.user_id !== currentUserId);
  // Use cribbage_state.dealerPlayerId for crib dealer (rotates each hand), not games.dealer_position
  const isCribDealer = (playerId: string) => cribbageState.dealerPlayerId === playerId;
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Win Sequence Overlays - Portaled above everything */}
      {winSequencePhase === 'skunk' && winSequenceData && (
        <CribbageSkunkOverlay
          multiplier={winSequenceData.multiplier}
          onComplete={handleSkunkComplete}
        />
      )}

      {/* Winner announcement is now in the dealer banner area - no overlay */}
      {/* Auto-transition from announcement to chips phase after 2s */}

      {winSequencePhase === 'chips' && winSequenceData && storedChipPositions && (
        <CribbageChipTransferAnimation
          triggerId={chipAnimationTriggerId}
          amount={winSequenceData.amountPerLoser}
          winnerPosition={storedChipPositions.winner}
          loserPositions={storedChipPositions.losers}
          onAnimationEnd={handleChipAnimationEnd}
        />
      )}

      {/* Felt Area - Upper Section with circular table */}
      <div 
        ref={tableContainerRef}
        className="relative flex items-start justify-center pt-1"
        style={{ 
          // Hug the actual circle size so there is no dead space between felt and banner.
          // Circle size is: min(90vw, (55vh - 32px)). Add a tiny buffer for borders/overlays.
          height: 'calc(min(90vw, calc(55vh - 32px)) + 10px)',
          minHeight: '300px',
        }}
      >
        {/* Light background behind the circle - lower z-index */}
        <div className="absolute inset-0 bg-slate-200 z-0" />

        {/* Circular table - wrapped so overlays can extend past the clipped circle */}
        <div
          className="relative z-10"
          style={{
            width: 'min(90vw, calc(55vh - 32px))',
            height: 'min(90vw, calc(55vh - 32px))',
          }}
        >
          {/* Inner circle is clipped; outer wrapper is not */}
          <div className="relative rounded-full overflow-hidden border-2 border-white/80 w-full h-full">
            {/* Felt background inside circle */}
            {tableColors.showBridge ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${peoriaBridgeMobile})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'brightness(0.5)',
                }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at center, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
                  filter: 'brightness(0.7)',
                }}
              />
            )}

            {/* Turn Spotlight - z-5 to stay behind pegboard and count */}
            <CribbageTurnSpotlight
              currentTurnPlayerId={cribbageState.pegging.currentTurnPlayerId}
              currentPlayerId={currentPlayerId}
              isVisible={cribbageState.phase === 'pegging' || (countingDelayActive && !!countingStateSnapshot)}
            />

            {/* Game Title - Top center of felt */}
            <div className="absolute top-3 left-0 right-0 z-20 flex flex-col items-center">
              <h2 className="text-sm font-bold text-white drop-shadow-lg">
                ${anteAmount} CRIBBAGE
              </h2>
              <p className="text-[9px] text-white/70">
                {cribbageState.pointsToWin} to win
                {cribbageState.skunkEnabled && ` • Skunk <${cribbageState.skunkThreshold} (2x)`}
                {cribbageState.doubleSkunkEnabled && ` • Double <${cribbageState.doubleSkunkThreshold} (3x)`}
              </p>
            </div>

            {/* Standard Felt Content (hidden during counting) */}
            <CribbageFeltContent
              cribbageState={cribbageState}
              players={players}
              currentPlayerId={currentPlayerId}
              sequenceStartIndex={sequenceStartIndex}
              getPlayerUsername={getPlayerUsername}
              cardBackColors={cardBackColors}
              countingScoreOverrides={countingScoreOverrides ?? undefined}
              countingOutroActive={countingDelayActive && !!countingStateSnapshot}
            />

            {/* Counting Phase Overlay - uses snapshot to persist through DB phase changes */}
            {/* Show counting when either: 
                1. DB phase is 'counting' and delay is over
                2. We have a snapshot (animation in progress) even if DB phase changed to 'complete'
            */}
            {countingStateSnapshot && !countingDelayActive && (
              <CribbageCountingPhase
                cribbageState={countingStateSnapshot}
                players={players}
                onCountingComplete={handleCountingComplete}
                cardBackColors={cardBackColors}
                onAnnouncementChange={handleCountingAnnouncementChange}
                onScoreUpdate={setCountingScoreOverrides}
                // IMPORTANT: Always start from the pegging baseline, never from the animated overrides.
                initialScores={countingBaselineScoresRef.current ?? undefined}
                winFrozen={countingWinFrozen}
              />
            )}

            {/* Dealer button at bottom - only if current player is dealer */}
            {currentPlayer && isCribDealer(currentPlayerId) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-[10px]">D</span>
                </div>
              </div>
            )}
          </div>

          {/* Opponent overlay (not clipped by the circle) */}
          <div className="absolute inset-0 z-50 pointer-events-none">
            <div className="absolute top-14 left-6 flex flex-col gap-2">
              {opponents.map(opponent => {
                const oppState = cribbageState.playerStates[opponent.id];
                const isDealerPlayer = isCribDealer(opponent.id);

                return (
                  <div key={opponent.id} className="flex flex-col items-start">
                    {/* Chip circle row */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        {/* White chip during active play - gold (bg-poker-gold) indicates waiting status */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40 bg-white">
                          <span className="text-[10px] font-bold text-slate-900">
                            ${formatChipValue(opponent.chips)}
                          </span>
                        </div>
                      </div>

                      {/* Name */}
                      <span className="text-[10px] text-white/90 truncate max-w-[70px] font-medium">
                        {getDisplayName(players, opponent, opponent.profiles?.username || 'Player')}
                      </span>

                      {/* Dealer button inline */}
                      {isDealerPlayer && (
                        <div className="w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center">
                          <span className="text-white font-bold text-[7px]">D</span>
                        </div>
                      )}
                    </div>

                    {/* Opponent's cards (face down) - shows actual card count */}
                    {oppState && oppState.hand.length > 0 && (
                      <div className="flex -space-x-1.5 mt-1 ml-1">
                        {oppState.hand.map((_, i) => (
                          <div 
                            key={i} 
                            className="w-4 h-6 rounded-sm border border-white/20"
                            style={{
                              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
          {/* Dealer Announcements Area - shows during gameplay AND win sequence (for winner message) */}
          {/* IMPORTANT: When counting animation is active (snapshot exists), use the snapshot phase, not the live state phase */}
          {(() => {
            const isCountingAnimActive = !!countingStateSnapshot;
            const countingOutroActive = isCountingAnimActive && countingDelayActive;
            const effectivePhase = isCountingAnimActive
              ? (countingOutroActive ? 'pegging' : countingStateSnapshot.phase)
              : cribbageState.phase;
            const effectiveLastEvent = isCountingAnimActive ? countingStateSnapshot.lastEvent : cribbageState.lastEvent;
          
          // Hide banner during skunk overlay phase or complete phase
          if (winSequencePhase === 'skunk' || winSequencePhase === 'complete') return null;
          
          // PRIORITY 1: During chips/announcement win phases, ALWAYS show winner message (never fall through)
          if ((winSequencePhase === 'chips' || winSequencePhase === 'announcement') && winSequenceData) {
            return (
              <div className="h-[36px] shrink-0 flex items-center justify-center px-3">
                <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                  <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                    {winSequenceData.winnerName} Wins{winSequenceData.multiplier === 2 ? ' (Skunk!)' : winSequenceData.multiplier === 3 ? ' (Double Skunk!)' : ''}! +${winSequenceData.totalWinnings}
                  </p>
                </div>
              </div>
            );
          }
          
          // If we're in win sequence but data not ready yet, hide banner to prevent flicker
          if (winSequencePhase === 'chips' || winSequencePhase === 'announcement') {
            return null;
          }
          
          // PRIORITY 2: Normal gameplay banners
          const shouldShowBanner = (
            effectivePhase === 'counting' || effectiveLastEvent ||
            effectivePhase === 'discarding' ||
            effectivePhase === 'cutting'
          );
          
          if (!shouldShowBanner) return null;
          
          return (
            <div className="h-[36px] shrink-0 flex items-center justify-center px-3">
              <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                  {effectivePhase === 'counting'
                    ? countingAnnouncement 
                      ? `${countingTargetLabel}: ${countingAnnouncement}`
                      : `Scoring ${countingTargetLabel || 'hands'}...`
                    : effectiveLastEvent && effectiveLastEvent.type !== 'hand_count'
                      ? `${getPlayerUsername(effectiveLastEvent.playerId)}: ${effectiveLastEvent.label} (+${effectiveLastEvent.points})`
                      : effectivePhase === 'discarding'
                        ? 'Discard to Crib'
                        : 'Cut Card'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Tab navigation bar */}
        <div className="flex items-center justify-center gap-1 px-3 py-1 border-b border-border/50">
          {/* Cards tab */}
          <button 
            onClick={() => setActiveTab('cards')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'cards' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <SpadeIcon className="w-5 h-5" />
          </button>
          {/* Chat tab */}
          <button 
            onClick={() => setActiveTab('chat')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'chat' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            } ${chatTabFlashing ? 'animate-pulse' : ''}`}
          >
            <MessageSquare className={`w-5 h-5 ${chatTabFlashing ? 'text-green-500 fill-green-500 animate-pulse' : ''} ${hasUnreadMessages && !chatTabFlashing ? 'text-red-500 fill-red-500' : ''}`} />
          </button>
          {/* Lobby tab */}
          <button 
            onClick={() => setActiveTab('lobby')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'lobby' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <User className="w-5 h-5" />
          </button>
          {/* History tab */}
          <button 
            onClick={() => setActiveTab('history')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'history' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {/* Hide cards tab while counting animation is active to prevent new hand cards from showing */}
          {activeTab === 'cards' && currentPlayer && !isTransitioning && !countingStateSnapshot && (
            <CribbageMobileCardsTab
              key={currentHandKey} // Force remount on hand change to prevent stale card flash
              cribbageState={cribbageState}
              currentPlayerId={currentPlayerId}
              playerCount={players.length}
              isProcessing={isProcessing}
              onDiscard={handleDiscard}
              onPlayCard={handlePlayCard}
              currentPlayer={currentPlayer}
              gameId={gameId}
              isDealer={isCribDealer(currentPlayerId)}
            />
          )}
          
          {/* Show placeholder during counting animation */}
          {activeTab === 'cards' && countingStateSnapshot && (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">Scoring hands...</p>
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
            <div className="p-4 space-y-2">
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
      </div>

      {/* Hand/Round Debug Overlay */}
      <RoundHandDebugOverlay gameId={gameId} inline />
    </div>
  );
};
