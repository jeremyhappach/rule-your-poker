import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { CommunityCards } from "./CommunityCards";

import { ChuckyHand } from "./ChuckyHand";
import { ChoppedAnimation } from "./ChoppedAnimation";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { MobileChatPanel } from "./MobileChatPanel";
import { PlayerOptionsMenu } from "./PlayerOptionsMenu";
import { RejoinNextHandButton } from "./RejoinNextHandButton";
import { AnteUpAnimation } from "./AnteUpAnimation";
import { ChipTransferAnimation } from "./ChipTransferAnimation";
import { PotToPlayerAnimation } from "./PotToPlayerAnimation";
import { HolmWinPotAnimation } from "./HolmWinPotAnimation";
import { ValueChangeFlash } from "./ValueChangeFlash";

import { BucksOnYouAnimation } from "./BucksOnYouAnimation";
import { LegEarnedAnimation } from "./LegEarnedAnimation";
import { LegsToPlayerAnimation } from "./LegsToPlayerAnimation";
import { SweepsPotAnimation } from "./SweepsPotAnimation";
import { MobilePlayerTimer } from "./MobilePlayerTimer";
import { LegIndicator } from "./LegIndicator";
import { BuckIndicator } from "./BuckIndicator";
import { Card as CardType, evaluateHand, formatHandRank, getWinningCardIndices } from "@/lib/cardUtils";
import { getAggressionAbbreviation } from "@/lib/botAggression";
import { getBotAlias } from "@/lib/botAlias";
import { cn, formatChipValue } from "@/lib/utils";
import cubsLogo from "@/assets/cubs-logo.png";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { ChevronUp, ChevronDown } from "lucide-react";

// Custom hook for swipe detection
const useSwipeGesture = (onSwipeUp: () => void, onSwipeDown: () => void) => {
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const minSwipeDistance = 50;
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndY.current = null;
    touchStartY.current = e.targetTouches[0].clientY;
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndY.current = e.targetTouches[0].clientY;
  }, []);
  const onTouchEnd = useCallback(() => {
    if (!touchStartY.current || !touchEndY.current) return;
    const distance = touchStartY.current - touchEndY.current;
    const isSwipeUp = distance > minSwipeDistance;
    const isSwipeDown = distance < -minSwipeDistance;
    if (isSwipeUp) {
      onSwipeUp();
    } else if (isSwipeDown) {
      onSwipeDown();
    }
    touchStartY.current = null;
    touchEndY.current = null;
  }, [onSwipeUp, onSwipeDown]);
  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};
interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  current_decision: string | null;
  decision_locked: boolean | null;
  legs: number;
  is_bot: boolean;
  sitting_out: boolean;
  sitting_out_hands?: number;
  waiting?: boolean;
  created_at?: string;
  profiles?: {
    username: string;
    aggression_level?: string;
  };
}
interface PlayerCards {
  player_id: string;
  cards: CardType[];
}
interface ChatBubbleData {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
}

interface MobileGameTableProps {
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  currentRound: number;
  allDecisionsIn: boolean;
  playerCards: PlayerCards[];
  timeLeft: number | null;
  maxTime?: number;
  lastRoundResult: string | null;
  dealerPosition: number | null;
  legValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  pendingSessionEnd: boolean;
  awaitingNextRound: boolean;
  gameType?: string | null;
  communityCards?: CardType[];
  communityCardsRevealed?: number;
  buckPosition?: number | null;
  currentTurnPosition?: number | null;
  chuckyCards?: CardType[];
  chuckyActive?: boolean;
  chuckyCardsRevealed?: number;
  roundStatus?: string;
  pendingDecision?: 'stay' | 'fold' | null;
  isPaused?: boolean;
  anteAmount?: number;
  pussyTaxValue?: number;
  gameStatus?: string; // For ante animation trigger
  handContextId?: string | null; // Authoritative round id to hard-reset UI caches (prevents stale community/Chucky cards)
  anteAnimationTriggerId?: string | null; // Direct trigger for ante animation from Game.tsx
  anteAnimationExpectedPot?: number | null; // Expected pot after antes (for re-ante scenarios where pot isn't updated yet)
  preAnteChips?: Record<string, number> | null; // Captured chip values BEFORE ante deduction to prevent race conditions
  expectedPostAnteChips?: Record<string, number> | null; // Expected chip values AFTER ante deduction - use this directly for display
  onAnteAnimationStarted?: () => void; // Callback to clear trigger after animation starts
  // Chip transfer animation props (3-5-7 showdowns)
  chipTransferTriggerId?: string | null;
  chipTransferAmount?: number;
  chipTransferWinnerId?: string | null;
  chipTransferLoserIds?: string[];
  onChipTransferStarted?: () => void;
  onChipTransferEnded?: () => void;
  // Holm Chucky loss animation props (player pays into pot)
  chuckyLossTriggerId?: string | null;
  chuckyLossAmount?: number;
  chuckyLossPlayerIds?: string[];
  onChuckyLossStarted?: () => void;
  onChuckyLossEnded?: () => void;
  // Holm multi-player showdown animation props (pot-to-winner, then losers-to-pot)
  holmShowdownTriggerId?: string | null;
  holmShowdownPotAmount?: number;
  holmShowdownMatchAmount?: number;
  holmShowdownWinnerId?: string | null;
  holmShowdownLoserIds?: string[];
  holmShowdownPhase?: 'idle' | 'pot-to-winner' | 'losers-to-pot';
  onHolmShowdownPotToWinnerStarted?: () => void;
  onHolmShowdownPotToWinnerEnded?: () => void;
  onHolmShowdownLosersStarted?: () => void;
  onHolmShowdownLosersEnded?: () => void;
  // Holm win pot animation props (player beats Chucky)
  holmWinPotTriggerId?: string | null;
  holmWinPotAmount?: number;
  holmWinWinnerPosition?: number;
  onHolmWinPotAnimationComplete?: () => void;
  // 3-5-7 win animation props (player wins final leg)
  threeFiveSevenWinTriggerId?: string | null;
  threeFiveSevenWinPotAmount?: number;
  threeFiveSevenWinnerId?: string | null;
  threeFiveSevenWinnerCards?: CardType[];
  threeFiveSevenCachedLegPositions?: { playerId: string; position: number; legCount: number }[];
  onThreeFiveSevenWinAnimationStarted?: () => void; // Called when animation starts to clear trigger
  onThreeFiveSevenWinAnimationComplete?: () => void;
  // Game over props
  isGameOver?: boolean;
  isDealer?: boolean;
  onNextGame?: () => void;
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
  // Host player control
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
  // Chat props
  chatBubbles?: ChatBubbleData[];
  allMessages?: { id: string; user_id: string; message: string; username?: string }[];
  onSendChat?: (message: string) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  // Observer leave game prop
  onLeaveGameNow?: () => void;
  // Waiting phase - hide pot display
  isWaitingPhase?: boolean;
  // Real money indicator
  realMoney?: boolean;
  // 3-5-7 reveal at showdown (secret reveal to players who stayed in rounds 1-2)
  revealAtShowdown?: boolean;
  // External showdown card cache (lifted to Game.tsx to persist across remounts)
  externalShowdownCardsCache?: React.MutableRefObject<Map<string, CardType[]>>;
  externalShowdownRoundNumber?: React.MutableRefObject<number | null>;
  // External community cards cache (lifted to Game.tsx to persist across remounts during win animation)
  externalCommunityCardsCache?: React.MutableRefObject<{ cards: CardType[] | null; round: number | null; show: boolean }>;
  // Epoch that increments whenever the parent clears externalCommunityCardsCache (prevents repopulation)
  externalCommunityCacheEpoch?: number;
  // 3-5-7 winner show cards - lifted to parent for realtime sync
  winner357ShowCards?: boolean;
  onWinner357ShowCards?: () => void;
  // Holm pre-fold/pre-stay props
  holmPreFold?: boolean;
  holmPreStay?: boolean;
  onHolmPreFoldChange?: (checked: boolean) => void;
  onHolmPreStayChange?: (checked: boolean) => void;
}
export const MobileGameTable = ({
  players,
  currentUserId,
  pot,
  currentRound,
  allDecisionsIn,
  playerCards,
  timeLeft,
  maxTime = 10,
  lastRoundResult,
  dealerPosition,
  legValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  pendingSessionEnd,
  awaitingNextRound,
  gameType,
  communityCards,
  communityCardsRevealed,
  buckPosition,
  currentTurnPosition,
  chuckyCards,
  chuckyActive,
  chuckyCardsRevealed,
  roundStatus,
  pendingDecision,
  isPaused,
  anteAmount = 1,
  pussyTaxValue = 1,
  gameStatus,
  handContextId,
  anteAnimationTriggerId,
  anteAnimationExpectedPot,
  preAnteChips,
  expectedPostAnteChips,
  onAnteAnimationStarted,
  chipTransferTriggerId,
  chipTransferAmount = 0,
  chipTransferWinnerId,
  chipTransferLoserIds = [],
  onChipTransferStarted,
  onChipTransferEnded,
  chuckyLossTriggerId,
  chuckyLossAmount = 0,
  chuckyLossPlayerIds = [],
  onChuckyLossStarted,
  onChuckyLossEnded,
  holmShowdownTriggerId,
  holmShowdownPotAmount = 0,
  holmShowdownMatchAmount = 0,
  holmShowdownWinnerId,
  holmShowdownLoserIds = [],
  holmShowdownPhase = 'idle',
  onHolmShowdownPotToWinnerStarted,
  onHolmShowdownPotToWinnerEnded,
  onHolmShowdownLosersStarted,
  onHolmShowdownLosersEnded,
  holmWinPotTriggerId,
  holmWinPotAmount = 0,
  holmWinWinnerPosition = 1,
  onHolmWinPotAnimationComplete,
  threeFiveSevenWinTriggerId,
  threeFiveSevenWinPotAmount = 0,
  threeFiveSevenWinnerId,
  threeFiveSevenWinnerCards = [],
  threeFiveSevenCachedLegPositions = [],
  onThreeFiveSevenWinAnimationStarted,
  onThreeFiveSevenWinAnimationComplete,
  isGameOver,
  isDealer,
  onNextGame,
  onStay,
  onFold,
  onSelectSeat,
  isHost,
  onPlayerClick,
  chatBubbles = [],
  allMessages = [],
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onLeaveGameNow,
  isWaitingPhase = false,
  realMoney = false,
  revealAtShowdown = false,
  externalShowdownCardsCache,
  externalShowdownRoundNumber,
  externalCommunityCardsCache,
  externalCommunityCacheEpoch,
  winner357ShowCards = false,
  onWinner357ShowCards,
  holmPreFold = false,
  holmPreStay = false,
  onHolmPreFoldChange,
  onHolmPreStayChange,
}: MobileGameTableProps) => {
  const {
    getTableColors,
    getFourColorSuit,
    getCardBackColors,
    getEffectiveDeckColorMode
  } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  const deckColorMode = getEffectiveDeckColorMode();

  // Collapsible card section state
  const [isCardSectionExpanded, setIsCardSectionExpanded] = useState(true);
  
  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture(() => setIsCardSectionExpanded(true),
  // Swipe up = expand
  () => setIsCardSectionExpanded(false) // Swipe down = collapse
  );

  // Chopped animation state
  const [showChopped, setShowChopped] = useState(false);
  const lastChoppedResultRef = useRef<string | null>(null);

  // Buck's on you animation state
  const [showBucksOnYou, setShowBucksOnYou] = useState(false);
  const lastBuckPositionRef = useRef<number | null>(null);
  const bucksOnYouShownForRoundRef = useRef<number | null>(null); // Track which round we showed animation for
  
  // Holm showdown phase 2 trigger ref
  const [phase2TriggerId, setPhase2TriggerId] = useState<string | null>(null);
  const lastPhaseRef = useRef<string>('idle');
  
  // Generate phase 2 trigger when phase changes to losers-to-pot
  useEffect(() => {
    if (holmShowdownPhase === 'losers-to-pot' && lastPhaseRef.current !== 'losers-to-pot') {
      setPhase2TriggerId(`holm-losers-${Date.now()}`);
    }
    lastPhaseRef.current = holmShowdownPhase;
  }, [holmShowdownPhase]);

  // Leg earned animation state
  const [showLegEarned, setShowLegEarned] = useState(false);
  const [legEarnedPlayerName, setLegEarnedPlayerName] = useState('');
  const [legEarnedPlayerPosition, setLegEarnedPlayerPosition] = useState<number | null>(null);
  const [isWinningLegAnimation, setIsWinningLegAnimation] = useState(false);
  const [winningLegPlayerId, setWinningLegPlayerId] = useState<string | null>(null); // Track player who won final leg for card exposure
  const playerLegsRef = useRef<Record<string, number>>({});
  
  // 357 Sweeps pot animation state
  const [showSweepsPot, setShowSweepsPot] = useState(false);
  const [sweepsPlayerName, setSweepsPlayerName] = useState('');
  const lastSweepsResultRef = useRef<string | null>(null);
  
  // 3-5-7 win animation state (phases: leg -> legs-to-player -> pot-to-player)
  const [threeFiveSevenWinPhase, setThreeFiveSevenWinPhase] = useState<'idle' | 'waiting' | 'legs-to-player' | 'pot-to-player' | 'delay'>('idle');
  const [legsToPlayerTriggerId, setLegsToPlayerTriggerId] = useState<string | null>(null);
  const [potToPlayerTriggerId357, setPotToPlayerTriggerId357] = useState<string | null>(null);
  const lastThreeFiveSevenTriggerRef = useRef<string | null>(null);
  const currentAnimationIdRef = useRef<string | null>(null); // Track current animation to ignore stale callbacks
  const threeFiveSevenWinPhaseRef = useRef<'idle' | 'waiting' | 'legs-to-player' | 'pot-to-player' | 'delay'>('idle'); // Ref for callback access
  
  // FIX: Keep pot hidden after Holm win animation until game resets
  // NEW APPROACH: Use a "pot hidden until next game" flag that's set when Holm win starts
  const [holmWinPotHiddenUntilReset, setHolmWinPotHiddenUntilReset] = useState(false);
  
  // FIX: Same for 357 - keep pot hidden after pot-to-player animation until game resets
  const [threeFiveSevenPotHiddenUntilReset, setThreeFiveSevenPotHiddenUntilReset] = useState(false);
  
  // Flash triggers for winner's chipstack when receiving legs/pot
  const [winnerLegsFlashTrigger, setWinnerLegsFlashTrigger] = useState<{ id: string; amount: number; playerId: string } | null>(null);
  const [winnerPotFlashTrigger, setWinnerPotFlashTrigger] = useState<{ id: string; amount: number; playerId: string } | null>(null);
  
  // FIX: Cache current player's legs EAGERLY - capture before any state transitions
  // This must be updated BEFORE game_over status, not during render
  const [cachedCurrentPlayerLegs, setCachedCurrentPlayerLegs] = useState<number>(0);
  
  // Table container ref for ante animation
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Delayed pot display - only update when chips arrive at pot box
  const [displayedPot, setDisplayedPot] = useState(pot);
  const isAnteAnimatingRef = useRef(false);
  
  // CRITICAL: Use a REF for locked chip values during animation
  // State updates can be batched/delayed by React, but refs update synchronously
  const lockedChipsRef = useRef<Record<string, number> | null>(null);
  
  // Delayed chip display - decrement immediately on animation start, sync after
  const [displayedChips, setDisplayedChips] = useState<Record<string, number>>({});
  
  
  // Sync displayedPot to actual pot when NOT animating (handles DB updates)
  // Also don't sync during 3-5-7 win animation - use cached pot value instead
  const hasPending357WinForPot = threeFiveSevenWinTriggerId && threeFiveSevenWinPotAmount > 0;
  useEffect(() => {
    if (!isAnteAnimatingRef.current && !hasPending357WinForPot && threeFiveSevenWinPhase === 'idle') {
      setDisplayedPot(pot);
    }
  }, [pot, hasPending357WinForPot, threeFiveSevenWinPhase]);
  
  // CRITICAL: Clear locked chips ONLY when backend values match expected values
  // This ensures we never flash wrong values during the sync period
  useEffect(() => {
    if (lockedChipsRef.current) {
      // Check if ALL locked values now match actual player chips
      const allMatch = Object.entries(lockedChipsRef.current).every(([playerId, expectedChips]) => {
        const player = players.find(p => p.id === playerId);
        return player && player.chips === expectedChips;
      });
      
      if (allMatch) {
        // Backend has synced - safe to clear the lock
        lockedChipsRef.current = null;
        setDisplayedChips({});
      }
    }
  }, [players]);
  
  // Cleanup stale displayedChips when not animating and no lock
  useEffect(() => {
    if (!isAnteAnimatingRef.current && !lockedChipsRef.current && Object.keys(displayedChips).length > 0) {
      setDisplayedChips({});
    }
  }, [players, displayedChips]);
  
  // FIX: Reset animation completion states when game transitions from game_over
  const prevGameStatusRef = useRef(gameStatus);
  useEffect(() => {
    if (prevGameStatusRef.current === 'game_over' && gameStatus !== 'game_over') {
      // Game is starting fresh - reset all animation completion flags
      setHolmWinPotHiddenUntilReset(false);
      setThreeFiveSevenPotHiddenUntilReset(false);
      setCachedCurrentPlayerLegs(0);
      // Note: winner357ShowCards is reset in parent (Game.tsx) via prop
      console.log('[RESET] Cleared pot hidden flags and cachedCurrentPlayerLegs');
    }
    prevGameStatusRef.current = gameStatus;
  }, [gameStatus]);
  
  
  
  // EAGER CACHING: Capture current player's legs BEFORE game_over clears them
  // This must run whenever legs change, capturing the value before backend resets it
  useEffect(() => {
    const currentPlayerData = players.find(p => p.user_id === currentUserId);
    if (currentPlayerData && currentPlayerData.legs > 0) {
      console.log('[LEGS CACHE] Capturing legs:', currentPlayerData.legs, 'for player at position', currentPlayerData.position);
      setCachedCurrentPlayerLegs(currentPlayerData.legs);
    }
  }, [players, currentUserId]);
  
  // Manual trigger for value flash when ante arrives at pot
  const [anteFlashTrigger, setAnteFlashTrigger] = useState<{ id: string; amount: number } | null>(null);
  
  // Delay community cards rendering by 1 second after player cards appear (Holm only)
  // Use external cache for community cards if provided (to persist across remounts during win animation)
  const internalCommunityCardsCache = useRef<{ cards: CardType[] | null; round: number | null; show: boolean }>({ cards: null, round: null, show: gameType !== 'holm-game' });
  const communityCardsCache = externalCommunityCardsCache || internalCommunityCardsCache;

  // CRITICAL: During dealer config phases, NEVER read from external cache - it may contain stale cards
  const isDealerConfigPhase = gameStatus === 'ante_decision' || gameStatus === 'configuring' || gameStatus === 'game_selection' || gameStatus === 'dealer_selection';

  // CRITICAL: If parent clears the external cache, it increments an epoch.
  // If we keep local state from the previous hand, we'd immediately write it back into the external cache.
  const effectiveExternalCacheEpoch = externalCommunityCacheEpoch ?? 0;
  const lastExternalCacheEpochRef = useRef<number>(effectiveExternalCacheEpoch);

  useEffect(() => {
    if (!externalCommunityCardsCache) {
      lastExternalCacheEpochRef.current = effectiveExternalCacheEpoch;
      return;
    }

    if (lastExternalCacheEpochRef.current === effectiveExternalCacheEpoch) return;

    console.error('[MOBILE_COMMUNITY] 🔒 Parent cache epoch changed -> clearing local community cache to prevent repopulation', {
      prevEpoch: lastExternalCacheEpochRef.current,
      nextEpoch: effectiveExternalCacheEpoch,
      gameStatus,
    });

    // Clear local community UI cache immediately
    setShowCommunityCards(false);
    setApprovedCommunityCards(null);
    setApprovedRoundForDisplay(null);
    setIsDelayingCommunityCards(false);
    setStaggeredCardCount(0);
    lastDetectedRoundRef.current = null;
    if (communityCardsDelayRef.current) {
      clearTimeout(communityCardsDelayRef.current);
      communityCardsDelayRef.current = null;
    }

    // Also ensure the external cache stays empty for this epoch
    externalCommunityCardsCache.current = { cards: null, round: null, show: false };

    lastExternalCacheEpochRef.current = effectiveExternalCacheEpoch;
  }, [effectiveExternalCacheEpoch, externalCommunityCardsCache, gameStatus]);

  // AGGRESSIVE: If we enter dealer config, wipe the *external* cache immediately.
  // MobileGameTable can unmount fast (switching screens) before state-based sync effects run.
  useEffect(() => {
    if (!externalCommunityCardsCache) return;
    if (!isDealerConfigPhase) return;

    externalCommunityCardsCache.current = { cards: null, round: null, show: false };
    console.log('[MOBILE_COMMUNITY] 🧹 wiped external community cache immediately (dealer config phase)', { gameStatus });
  }, [externalCommunityCardsCache, isDealerConfigPhase, gameStatus]);

  // Initialize local state from external cache if available (but NOT during dealer config)
  const [showCommunityCards, setShowCommunityCards] = useState(() => {
    if (isDealerConfigPhase) return false;
    if (externalCommunityCardsCache?.current?.show) return true;
    return gameType !== 'holm-game';
  });
  const [staggeredCardCount, setStaggeredCardCount] = useState(0); // How many cards to show in staggered animation
  const [isDelayingCommunityCards, setIsDelayingCommunityCards] = useState(false); // Only true during active delay
  const [approvedRoundForDisplay, setApprovedRoundForDisplay] = useState<number | null>(() => {
    if (isDealerConfigPhase) return null;
    return externalCommunityCardsCache?.current?.round || null;
  });
  const [approvedCommunityCards, setApprovedCommunityCards] = useState<CardType[] | null>(() => {
    if (isDealerConfigPhase) return null;
    return externalCommunityCardsCache?.current?.cards || null;
  });
  const communityCardsDelayRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectedRoundRef = useRef<number | null>(
    isDealerConfigPhase ? null : (externalCommunityCardsCache?.current?.round || null)
  ); // Track which round we've detected (to prevent re-triggering)

  // Never let effect cleanups cancel the 1s community-cards approval timer mid-flight.
  // Only clear timers on explicit state transitions (buck passed) or on unmount.
  useEffect(() => {
    return () => {
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
        communityCardsDelayRef.current = null;
      }
    };
  }, []);

  // Sync local state changes back to external cache
  // CRITICAL: Do NOT sync during dealer config phases - this would write stale cards back!
  useEffect(() => {
    if (!externalCommunityCardsCache) return;

    // If parent just cleared caches, do NOT write local state back for the "new" epoch.
    if (externalCommunityCacheEpoch !== undefined && lastExternalCacheEpochRef.current !== effectiveExternalCacheEpoch) {
      console.log('[MOBILE_COMMUNITY] ⛔ NOT syncing to external cache (epoch mismatch)', {
        gameStatus,
        localEpoch: lastExternalCacheEpochRef.current,
        parentEpoch: effectiveExternalCacheEpoch,
      });
      return;
    }

    // Never write to external cache during new game setup phases
    const isDealerConfig = gameStatus === 'ante_decision' || gameStatus === 'configuring' || gameStatus === 'game_selection' || gameStatus === 'dealer_selection';
    if (isDealerConfig) {
      console.log('[MOBILE_COMMUNITY] ⛔ NOT syncing to external cache (dealer config phase)', { gameStatus });
      return;
    }

    const approvedLen = approvedCommunityCards?.length ?? 0;
    console.log('[MOBILE_COMMUNITY] ↔️ sync->external cache', {
      gameStatus,
      currentRound,
      approvedRoundForDisplay,
      approvedLen,
      showCommunityCards,
    });

    externalCommunityCardsCache.current = {
      cards: approvedCommunityCards,
      round: approvedRoundForDisplay,
      show: showCommunityCards,
    };
  }, [approvedCommunityCards, approvedRoundForDisplay, showCommunityCards, externalCommunityCardsCache, gameStatus, currentRound, externalCommunityCacheEpoch, effectiveExternalCacheEpoch]);
  
  // Track showdown state and CACHE CARDS during showdown to prevent flickering
  // Use EXTERNAL refs when provided (from Game.tsx) to persist across component remounts
  const internalShowdownRoundRef = useRef<number | null>(null);
  const internalShowdownCardsCache = useRef<Map<string, CardType[]>>(new Map());
  
  // Use external cache if provided, otherwise use internal
  const showdownRoundRef = externalShowdownRoundNumber || internalShowdownRoundRef;
  const showdownCardsCache = externalShowdownCardsCache || internalShowdownCardsCache;
  
  // Cache Chucky cards to persist through announcement phase
  const [cachedChuckyCards, setCachedChuckyCards] = useState<CardType[] | null>(null);
  const [cachedChuckyActive, setCachedChuckyActive] = useState<boolean>(false);
  const [cachedChuckyCardsRevealed, setCachedChuckyCardsRevealed] = useState<number>(0);

  // AGGRESSIVE: When your player-hand round changes, hard-reset community + Chucky UI caches.
  // Symptom: player hand updates, but community/Chucky stay stuck on previous hand.
  const prevHandContextIdRef = useRef<string | null>(handContextId ?? null);
  useEffect(() => {
    const prev = prevHandContextIdRef.current;
    const next = handContextId ?? null;

    if (prev !== next) {
      console.error('[HAND_RESET][MOBILE] Hand context changed -> clearing ALL local card UI caches', {
        prev,
        next,
        currentRound,
        gameStatus,
      });

      // Community UI cache
      setShowCommunityCards(false);
      setApprovedCommunityCards(null);
      setApprovedRoundForDisplay(null);
      setIsDelayingCommunityCards(false);
      setStaggeredCardCount(0);
      lastDetectedRoundRef.current = null;
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
        communityCardsDelayRef.current = null;
      }

      // Showdown exposure cache
      showdownRoundRef.current = null;
      showdownCardsCache.current = new Map();

      // Chucky UI cache
      setCachedChuckyCards(null);
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0);

      // External lifted community cache (parent)
      if (externalCommunityCardsCache) {
        externalCommunityCardsCache.current = { cards: null, round: null, show: false };
      }
    }

    prevHandContextIdRef.current = next;
  }, [handContextId, currentRound, gameStatus, externalCommunityCardsCache, showdownRoundRef, showdownCardsCache]);
  
  // Compute showdown state synchronously during render
  // This should trigger when we need to show exposed cards
  const isInEarlyPhase = roundStatus === 'betting' || roundStatus === 'pending' || roundStatus === 'ante';
  // Count players who stayed for multi-player showdown detection
  const stayedPlayersCount = players.filter(p => p.current_decision === 'stay').length;
  const is357Round3MultiPlayerShowdown = gameType !== 'holm-game' && currentRound === 3 && allDecisionsIn && stayedPlayersCount >= 2;
  
  // HOLM: Detect solo player vs Chucky showdown (1 player stayed, Chucky is active or showdown phase)
  // Include awaitingNextRound when lastRoundResult is showing to keep tabled cards visible through announcement
  const isSoloVsChucky = gameType === 'holm-game' && 
    stayedPlayersCount === 1 && 
    (chuckyActive || roundStatus === 'showdown' || roundStatus === 'completed' || allDecisionsIn || (awaitingNextRound && lastRoundResult));
  
  // HOLM: Detect multi-player showdown (2+ players stayed) - needs tighter card overlap
  const isHolmMultiPlayerShowdown = gameType === 'holm-game' && 
    stayedPlayersCount >= 2 && 
    (roundStatus === 'showdown' || roundStatus === 'completed' || allDecisionsIn);
  
  // 3-5-7 "secret reveal" for rounds 1 and 2: only players who stayed can see each other's cards
  const currentPlayerForSecretReveal = players.find(p => p.user_id === currentUserId);
  const currentPlayerStayed = currentPlayerForSecretReveal?.current_decision === 'stay';
  const is357SecretRevealActive = gameType !== 'holm-game' && 
    (currentRound === 1 || currentRound === 2) && 
    allDecisionsIn && 
    stayedPlayersCount >= 2 && 
    revealAtShowdown && 
    currentPlayerStayed;
  
  const isShowdownActive = (gameType === 'holm-game' && 
    (roundStatus === 'showdown' || roundStatus === 'completed' || communityCardsRevealed === 4 || allDecisionsIn)) ||
    is357Round3MultiPlayerShowdown ||
    is357SecretRevealActive;
  
  // Clear showdown cache when:
  // 1. A new round number is detected (but NOT during game_over - keep cards visible for animations)
  // 2. We're back in an early betting phase (new hand started)
  const isInGameOverStatus = gameStatus === 'game_over' || isGameOver;
  
  if (currentRound && showdownRoundRef.current !== null && showdownRoundRef.current !== currentRound && !isInGameOverStatus) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  // Also clear if we're in early phase, no announcement, AND allDecisionsIn is false (truly new hand)
  // But NEVER clear during game_over - cards must remain visible for pot animation
  if (showdownRoundRef.current !== null && isInEarlyPhase && !lastRoundResult && !allDecisionsIn && !isInGameOverStatus) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  // If showdown is active, cache cards for players who stayed
  if (isShowdownActive && currentRound) {
    if (showdownRoundRef.current === null) {
      showdownRoundRef.current = currentRound;
    }
    // Cache cards for stayed players during this showdown
    if (showdownRoundRef.current === currentRound) {
      players
        .filter(p => p.current_decision === 'stay')
        .forEach(p => {
          // Only cache if we have cards and haven't cached yet
          if (!showdownCardsCache.current.has(p.id)) {
            const playerCardData = playerCards.find(pc => pc.player_id === p.id);
            if (playerCardData && playerCardData.cards.length > 0) {
              showdownCardsCache.current.set(p.id, [...playerCardData.cards]);
            }
          }
        });
    }
  }
  
  // Function to get cards for a player (use cache during showdown)
  const getPlayerCards = (playerId: string): CardType[] => {
    const liveCards = playerCards.find(pc => pc.player_id === playerId)?.cards || [];
    
    // CRITICAL: During game_over, ALWAYS use cached cards for pot animation visibility
    if (isInGameOverStatus) {
      const cachedCards = showdownCardsCache.current.get(playerId);
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
    }
    
    // CRITICAL: Once cards are cached for this round, ALWAYS use cache
    // This prevents flickering when isShowdownActive temporarily becomes false
    if (showdownRoundRef.current === currentRound) {
      const cachedCards = showdownCardsCache.current.get(playerId);
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
    }
    return liveCards;
  };
  
  // Function to check if a player's cards should be shown
  const isPlayerCardsExposed = (playerId: string): boolean => {
    // During game_over, always show cached cards (for pot animation)
    if (isInGameOverStatus && showdownCardsCache.current.has(playerId)) {
      return true;
    }
    if (!currentRound) return false;
    // Cards are exposed if: we're in showdown round AND player has cached cards
    return showdownRoundRef.current === currentRound && showdownCardsCache.current.has(playerId);
  };

  // Find current player and their cards
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerCards = currentPlayer ? playerCards.find(pc => pc.player_id === currentPlayer.id)?.cards || [] : [];

  // Calculate lose amount
  const loseAmount = potMaxEnabled ? Math.min(pot, potMaxValue) : pot;

  // Check if current player can decide
  const hasDecided = currentPlayer?.decision_locked || !!pendingDecision;
  const buckIsAssigned = buckPosition !== null && buckPosition !== undefined;
  const roundIsReady = currentTurnPosition !== null && currentTurnPosition !== undefined;
  const roundIsActive = roundStatus === 'betting' || roundStatus === 'active';
  const isPlayerTurn = gameType === 'holm-game' ? buckIsAssigned && roundIsReady && roundIsActive && currentTurnPosition === currentPlayer?.position && !awaitingNextRound : true;
  
  // For Holm: If it's player's turn, they should see buttons even if allDecisionsIn is stuck
  // This handles edge case where allDecisionsIn=true but round is still betting
  const holmPlayerCanDecide = gameType === 'holm-game' && 
    isPlayerTurn && 
    roundStatus === 'betting' && 
    !hasDecided;
  
  const canDecide = currentPlayer && !hasDecided && currentPlayer.status === 'active' && (!allDecisionsIn || holmPlayerCanDecide) && isPlayerTurn && !isPaused && currentPlayerCards.length > 0;

  // Check if we should be in showdown display mode (hide chipstacks, buck, show larger cards)
  // This is true when: 
  // 1. Any player has exposed cards during active showdown, OR
  // 2. We have a result announcement showing (lastRoundResult is set)
  const hasExposedPlayers = players.some(p => isPlayerCardsExposed(p.id));
  // Check if we're showing an announcement (either normal round result or game-over)
  const isShowingAnnouncement = gameType === 'holm-game' && !!lastRoundResult && (awaitingNextRound || isGameOver);
  const isAnyPlayerInShowdown = gameType === 'holm-game' && (hasExposedPlayers || isShowingAnnouncement);

  // Determine winner from lastRoundResult for dimming logic
  // ALSO derive winner when holmWinPotTriggerId is set (for tabling winner cards during animation)
  const winnerPlayerId = useMemo(() => {
    // Need announcement OR active holm win animation to determine winner
    const shouldDeriveWinner = isShowingAnnouncement || holmWinPotTriggerId;
    if (!shouldDeriveWinner || !lastRoundResult) return null;
    // Parse winner from announcement - format usually includes player username
    // Look for patterns like "PlayerName beat", "PlayerName won", "PlayerName wins", "PlayerName earns"
    const result = lastRoundResult.toLowerCase();
    for (const player of players) {
      const username = player.profiles?.username?.toLowerCase() || '';
      if (username && (
        result.includes(`${username} beat`) || 
        result.includes(`${username} won`) || 
        result.includes(`${username} wins`) || 
        result.includes(`${username} earns`)
      )) {
        return player.id;
      }
    }
    return null;
  }, [isShowingAnnouncement, holmWinPotTriggerId, lastRoundResult, players]);

  // Check if current player is the winner (for dimming logic)
  const isCurrentPlayerWinner = winnerPlayerId === currentPlayer?.id;

  // Get winner's cards for highlighting (winner may be current player or another player)
  // ALSO provide cards when holmWinPotTriggerId is set (for tabling winner cards during animation)
  const winnerCards = useMemo(() => {
    const shouldDeriveCards = isShowingAnnouncement || holmWinPotTriggerId;
    if (!winnerPlayerId || !shouldDeriveCards) return [];
    if (winnerPlayerId === currentPlayer?.id) {
      return currentPlayerCards;
    }
    // Find winner's cards from playerCards
    const winnerCardData = playerCards.find(pc => pc.player_id === winnerPlayerId);
    return winnerCardData?.cards || [];
  }, [winnerPlayerId, isShowingAnnouncement, holmWinPotTriggerId, currentPlayer?.id, currentPlayerCards, playerCards]);

  // Calculate winning card highlights based on WINNER's hand (not current player)
  // Calculate winning card highlights for announcement phase
  // NOTE: Do NOT check isDelayingCommunityCards here - that's for new round startup delay,
  // we still want highlights to persist during the post-win delay before next hand
  const winningCardHighlights = useMemo(() => {
    // Only highlight during announcement phase with winner determined
    if (!isShowingAnnouncement || !winnerCards.length || !communityCards?.length || !winnerPlayerId) {
      return { playerIndices: [], communityIndices: [], kickerPlayerIndices: [], kickerCommunityIndices: [], hasHighlights: false };
    }
    const result = getWinningCardIndices(winnerCards, communityCards, false);
    return { ...result, hasHighlights: true };
  }, [isShowingAnnouncement, winnerCards, communityCards, winnerPlayerId]);

  // Detect Chucky chopped animation
  useEffect(() => {
    if (gameType === 'holm-game' && lastRoundResult && lastRoundResult !== lastChoppedResultRef.current && currentUserId) {
      const currentUsername = currentPlayer?.profiles?.username || '';
      if (!currentUsername) return;
      const is1v1Loss = lastRoundResult.includes(`Chucky beat ${currentUsername} `);
      const isTieBreakerLoss = lastRoundResult.includes('lose to Chucky') && (lastRoundResult.includes(`${currentUsername} and `) || lastRoundResult.includes(` and ${currentUsername} lose`) || lastRoundResult.includes(`! ${currentUsername} lose`));
      if (is1v1Loss || isTieBreakerLoss) {
        lastChoppedResultRef.current = lastRoundResult;
        setShowChopped(true);
      }
    }
  }, [lastRoundResult, gameType, currentPlayer, currentUserId]);

  // Detect 357 sweep animation (3-5-7 games only)
  useEffect(() => {
    if (
      gameType !== 'holm-game' && 
      lastRoundResult && 
      lastRoundResult.startsWith('357_SWEEP:') &&
      lastRoundResult !== lastSweepsResultRef.current
    ) {
      const playerName = lastRoundResult.replace('357_SWEEP:', '');
      lastSweepsResultRef.current = lastRoundResult;
      setSweepsPlayerName(playerName);
      setShowSweepsPot(true);
    }
  }, [lastRoundResult, gameType]);

  // Detect buck passed to current player (Holm games only)
  // Also clear showdown state when buck moves - new hand is starting
  useEffect(() => {
    if (
      gameType === 'holm-game' && 
      buckPosition !== null && 
      buckPosition !== undefined && 
      currentPlayer && 
      buckPosition === currentPlayer.position && 
      lastBuckPositionRef.current !== buckPosition && 
      lastBuckPositionRef.current !== null && // Don't show on initial load
      bucksOnYouShownForRoundRef.current !== currentRound // Only show once per round
    ) {
      // Clear showdown state - new hand starting
      showdownRoundRef.current = null;
      showdownCardsCache.current = new Map();
      
      // Mark this round as shown and trigger animation
      bucksOnYouShownForRoundRef.current = currentRound;
      setShowBucksOnYou(true);
    }

    lastBuckPositionRef.current = buckPosition ?? null;
  }, [buckPosition, currentPlayer, gameType, currentRound]);

  // Delay community cards by 1 second after player cards appear (Holm games only)
  // currentRound is already a number (round_number), use it directly
  
  useEffect(() => {
    console.log('🔥🔥🔥 [MOBILE_COMMUNITY] useEffect triggered:', { 
      gameType, 
      currentRound, 
      awaitingNextRound, 
      showCommunityCards,
      approvedRoundForDisplay,
      lastDetectedRound: lastDetectedRoundRef.current,
      communityCards: communityCards?.length,
      communityCardsRevealed,
      lastRoundResult,
      gameStatus
    });
    
    // CRITICAL: Clear community cards state when a new game starts
    // This prevents old cards from the previous game showing up
    if (isDealerConfigPhase) {
      if (approvedCommunityCards && approvedCommunityCards.length > 0) {
        console.log('🔥 [MOBILE_COMMUNITY] Dealer config phase - clearing community cards');
        setShowCommunityCards(false);
        setApprovedCommunityCards(null);
        setApprovedRoundForDisplay(null);
        setIsDelayingCommunityCards(false);
        lastDetectedRoundRef.current = null;
        if (communityCardsDelayRef.current) {
          clearTimeout(communityCardsDelayRef.current);
          communityCardsDelayRef.current = null;
        }
      }
      return;
    }
    
    if (gameType !== 'holm-game') {
      console.log('🔥 [MOBILE_COMMUNITY] Not holm game, showing cards immediately');
      setShowCommunityCards(true);
      return;
    }
    
    // If awaiting next round AND result is cleared (buck has passed), hide community cards
    // Cards should persist through announcement, only disappear when buck passes
    if (awaitingNextRound && !lastRoundResult) {
      console.log('🔥 [MOBILE_COMMUNITY] Buck passed (result cleared) - hiding community cards');
      setShowCommunityCards(false);
      setApprovedCommunityCards(null);
      setApprovedRoundForDisplay(null);
      setIsDelayingCommunityCards(false);
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
        communityCardsDelayRef.current = null;
      }
      return;
    }
    
    // If awaiting next round but result still showing (announcement phase), keep cards visible
    if (awaitingNextRound) {
      console.log('🔥 [MOBILE_COMMUNITY] Awaiting next round with result showing - keeping cards visible');
      setIsDelayingCommunityCards(false);
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
        communityCardsDelayRef.current = null;
      }
      return;
    }
    
    // New round detected - start staggered card dealing
    // Use REF for detection (to prevent re-triggering) but STATE for render gating
    const isNewRound = currentRound && currentRound !== lastDetectedRoundRef.current;
    
    console.log('🔥🔥🔥 [MOBILE_COMMUNITY] Checking new round:', { 
      isNewRound, 
      currentRound, 
      lastDetectedRound: lastDetectedRoundRef.current,
      approvedRoundForDisplay,
      hasCommunityCards: !!communityCards,
      communityCardsLength: communityCards?.length
    });
    
    if (isNewRound) {
      console.log('🔥🔥🔥🔥 [MOBILE_COMMUNITY] 🎴 NEW ROUND DETECTED - starting reveal delay (cards hidden until approved)');
      lastDetectedRoundRef.current = currentRound; // Mark as detected to prevent re-trigger
      
      // Hide cards and reset state
      setShowCommunityCards(false);
      setStaggeredCardCount(0);
      setIsDelayingCommunityCards(true);
      // DON'T update approvedRoundForDisplay yet - that happens after delay
      
      // Clear any existing timeout
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
      }
      
      // Initial delay of 1 second, then reveal cards one at a time
      const cardCount = communityCardsRevealed || 2;
      console.log('🔥🔥 [MOBILE_COMMUNITY] Setting 1000ms timeout to approve round', currentRound, 'with', cardCount, 'cards');
      communityCardsDelayRef.current = setTimeout(() => {
        console.log('🔥🔥🔥🔥🔥 [MOBILE_COMMUNITY] Delay complete - approving round for display:', currentRound);
        setApprovedRoundForDisplay(currentRound); // NOW we approve this round for display
        setApprovedCommunityCards(communityCards ? [...communityCards] : null); // Cache the cards at approval time
        setShowCommunityCards(true);
        // Stagger each card with 150ms delay
        for (let i = 1; i <= cardCount; i++) {
          setTimeout(() => {
            console.log('🔥 [MOBILE_COMMUNITY] Revealing card', i, 'of', cardCount);
            setStaggeredCardCount(i);
            if (i === cardCount) {
              setIsDelayingCommunityCards(false);
            }
          }, (i - 1) * 150);
        }
      }, 1000);
    }
    
    // IMPORTANT: do NOT return a cleanup that clears communityCardsDelayRef here.
    // This effect can rerun frequently; clearing would cancel the 1s approval timer and leave cards hidden.
  }, [gameType, currentRound, awaitingNextRound, communityCardsRevealed, communityCards, lastRoundResult, gameStatus]);

  // Backfill approvedCommunityCards if they arrive AFTER the 1s approval delay.
  // Bug: round gets "approved" while communityCards prop is still undefined -> approvedCommunityCards becomes null and never re-approved.
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    if (!currentRound) return;
    if (isDelayingCommunityCards) return; // don't bypass the intended delay
    if (!showCommunityCards) return; // only backfill when UI intends to show them

    const liveLen = communityCards?.length ?? 0;
    const approvedLen = approvedCommunityCards?.length ?? 0;

    const shouldBackfill = liveLen > 0 && approvedLen === 0 && (approvedRoundForDisplay === currentRound || approvedRoundForDisplay === null);

    if (!shouldBackfill) return;

    console.log('🔥 [MOBILE_COMMUNITY] BACKFILL approvedCommunityCards (late arrival):', {
      currentRound,
      approvedRoundForDisplay,
      liveLen,
      showCommunityCards,
    });

    setApprovedRoundForDisplay(currentRound);
    setApprovedCommunityCards([...(communityCards ?? [])]);
  }, [gameType, currentRound, communityCards, approvedCommunityCards, approvedRoundForDisplay, isDelayingCommunityCards, showCommunityCards]);

  // Cache Chucky cards when available, clear only when buck passes or new game starts
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    
    // CRITICAL: Clear cached Chucky cards when entering dealer config phases
    // This prevents old cards from the previous game showing up
    if (isDealerConfigPhase) {
      if (cachedChuckyCards && cachedChuckyCards.length > 0) {
        console.log('[MOBILE_CHUCKY] Dealer config phase - clearing cached Chucky cards');
        setCachedChuckyCards(null);
        setCachedChuckyActive(false);
        setCachedChuckyCardsRevealed(0);
      }
      return;
    }
    
    // When buck passes (awaitingNextRound AND no result), clear cached Chucky data
    if (awaitingNextRound && !lastRoundResult) {
      console.log('[MOBILE_CHUCKY] Buck passed - clearing cached Chucky cards');
      setCachedChuckyCards(null);
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0);
      return;
    }
    
    // Cache Chucky data when it's available
    if (chuckyActive && chuckyCards && chuckyCards.length > 0) {
      console.log('[MOBILE_CHUCKY] Caching Chucky cards:', chuckyCards.length);
      setCachedChuckyCards([...chuckyCards]);
      setCachedChuckyActive(true);
      setCachedChuckyCardsRevealed(chuckyCardsRevealed || 0);
    }
  }, [gameType, gameStatus, chuckyActive, chuckyCards, chuckyCardsRevealed, awaitingNextRound, lastRoundResult, cachedChuckyCards]);

  // Detect when a player earns a leg (3-5-7 games only)
  // IMPORTANT: MobileGameTable can remount between hands/round transitions; we must NOT treat existing legs as "new" on mount.
  const legsTrackerInitializedRef = useRef(false);
  const firedLegAnimationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (gameType === 'holm-game') return;

    // One-time baseline snapshot so we only animate *changes* in legs, not whatever legs already exist.
    if (!legsTrackerInitializedRef.current) {
      const snapshot: Record<string, number> = {};
      players.forEach((p) => {
        snapshot[p.id] = p.legs;
      });
      playerLegsRef.current = snapshot;
      firedLegAnimationKeysRef.current = new Set();
      legsTrackerInitializedRef.current = true;
      console.log('[LEG ANIMATION] Initialized baseline legs snapshot:', snapshot);
      return;
    }

    players.forEach((player) => {
      const prevLegs = playerLegsRef.current[player.id] ?? player.legs;
      const currentLegs = player.legs;

      // Player gained a leg
      if (currentLegs > prevLegs) {
        const animationKey = `${player.id}-${currentLegs}`;
        if (firedLegAnimationKeysRef.current.has(animationKey)) {
          console.log('[LEG ANIMATION] Skipping duplicate animation for:', animationKey);
        } else {
          firedLegAnimationKeysRef.current.add(animationKey);

          // Use bot alias for bots
          const playerName = player.is_bot
            ? getBotAlias(players, player.user_id)
            : (player.profiles?.username || `Player ${player.position}`);

          setLegEarnedPlayerName(playerName);
          setLegEarnedPlayerPosition(player.position);

          const isWinningLeg = currentLegs >= legsToWin;
          setIsWinningLegAnimation(isWinningLeg);
          setShowLegEarned(true);

          // Track the winning leg player for card exposure
          if (isWinningLeg) {
            console.log('[MOBILE] 🏆 FINAL LEG WON - exposing cards for:', player.id);
            setWinningLegPlayerId(player.id);
          }
        }
      }

      playerLegsRef.current[player.id] = currentLegs;
    });
  }, [players, gameType, legsToWin]);
  // Clear winning leg player when game status changes (next game starting)
  useEffect(() => {
    if (roundStatus === undefined || roundStatus === 'pending' || !allDecisionsIn) {
      // Game is resetting - clear the winning leg exposure
      if (winningLegPlayerId) {
        console.log('[MOBILE] Game resetting - clearing winning leg player exposure');
        setWinningLegPlayerId(null);
      }
    }
  }, [roundStatus, allDecisionsIn, winningLegPlayerId]);

  // Keep phase ref in sync
  useEffect(() => {
    threeFiveSevenWinPhaseRef.current = threeFiveSevenWinPhase;
  }, [threeFiveSevenWinPhase]);
  
  // 3-5-7 win animation sequence: triggered by parent when player wins final leg
  // CRITICAL: Only start animation when gameStatus === 'game_over' to ensure component doesn't unmount mid-animation
  // CRITICAL: Capture leg positions at start in a ref to avoid dependency array issues that cause stale animation detection
  const threeFiveSevenCachedLegPositionsRef = useRef(threeFiveSevenCachedLegPositions);
  threeFiveSevenCachedLegPositionsRef.current = threeFiveSevenCachedLegPositions;
  
  useEffect(() => {
    if (!threeFiveSevenWinTriggerId || threeFiveSevenWinTriggerId === lastThreeFiveSevenTriggerRef.current) {
      return;
    }
    
    // Don't start animation until we're in game_over status (component won't unmount)
    if (gameStatus !== 'game_over') {
      console.log('[357 WIN] Trigger received but waiting for game_over status, current:', gameStatus);
      return;
    }
    
    lastThreeFiveSevenTriggerRef.current = threeFiveSevenWinTriggerId;
    
    // Generate unique animation ID to track this specific sequence
    const animationId = `anim-${Date.now()}`;
    currentAnimationIdRef.current = animationId;
    
    // Capture leg positions at animation start (don't depend on prop changes during animation)
    const capturedLegPositions = threeFiveSevenCachedLegPositionsRef.current;
    
    console.log('[357 WIN] Starting win animation sequence, animationId:', animationId);
    console.log('[357 WIN] Using leg positions from prop:', capturedLegPositions);
    
    // Clear trigger in parent after starting
    onThreeFiveSevenWinAnimationStarted?.();
    
    // IMMEDIATELY set phase to 'waiting' so display logic uses cached values
    // This prevents the 2.6s gap where trigger is null and phase is idle
    setThreeFiveSevenWinPhase('waiting');
    threeFiveSevenWinPhaseRef.current = 'waiting';
    setLegsToPlayerTriggerId(null);
    setPotToPlayerTriggerId357(null);
    
    // Wait for leg earned animation to complete (it runs for 2.5s for winning leg)
    // Then start legs-to-player animation
    setTimeout(() => {
      // Only proceed if this is still the current animation
      if (currentAnimationIdRef.current !== animationId) {
        console.log('[357 WIN] Stale animation, skipping Phase 1');
        return;
      }
      console.log('[357 WIN] Phase 1: legs-to-player, using positions:', capturedLegPositions);
      setThreeFiveSevenWinPhase('legs-to-player');
      threeFiveSevenWinPhaseRef.current = 'legs-to-player';
      setLegsToPlayerTriggerId(`legs-to-player-${Date.now()}`);
    }, 2600); // Slightly after leg earned animation completes
    // NOTE: threeFiveSevenCachedLegPositions intentionally NOT in deps - we capture it via ref at animation start
    // to prevent dependency changes during animation from invalidating the animation sequence
  }, [threeFiveSevenWinTriggerId, onThreeFiveSevenWinAnimationStarted, gameStatus]);

  const handleLegsToPlayerComplete = useCallback(() => {
    // Use ref to get current phase (avoids stale closure)
    if (threeFiveSevenWinPhaseRef.current !== 'legs-to-player') {
      console.log('[357 WIN] handleLegsToPlayerComplete called but not in legs-to-player phase, ignoring. Current phase:', threeFiveSevenWinPhaseRef.current);
      return;
    }
    
    // Trigger "+XL" flash on winner's chipstack
    const totalLegs = threeFiveSevenCachedLegPositions.reduce((sum, p) => sum + p.legCount, 0);
    if (threeFiveSevenWinnerId && totalLegs > 0) {
      setWinnerLegsFlashTrigger({
        id: `legs-flash-${Date.now()}`,
        amount: totalLegs,
        playerId: threeFiveSevenWinnerId
      });
    }
    
    console.log('[357 WIN] Phase 2: pot-to-player');
    setThreeFiveSevenWinPhase('pot-to-player');
    threeFiveSevenWinPhaseRef.current = 'pot-to-player';
    // FIX: Set pot hidden flag NOW so pot stays hidden after animation completes
    setThreeFiveSevenPotHiddenUntilReset(true);
    setPotToPlayerTriggerId357(`pot-to-player-357-${Date.now()}`);
  }, [threeFiveSevenCachedLegPositions, threeFiveSevenWinnerId]);

  // Handle pot-to-player animation complete -> 3 second delay -> next game
  const handlePotToPlayerComplete357 = useCallback(() => {
    console.log('[357 WIN] handlePotToPlayerComplete357 called, phase:', threeFiveSevenWinPhaseRef.current);
    
    // Use ref to get current phase (avoids stale closure)
    if (threeFiveSevenWinPhaseRef.current !== 'pot-to-player') {
      console.log('[357 WIN] handlePotToPlayerComplete357 called but not in pot-to-player phase, ignoring. Current phase:', threeFiveSevenWinPhaseRef.current);
      return;
    }
    
    // Trigger "+$X" flash on winner's chipstack
    if (threeFiveSevenWinnerId && threeFiveSevenWinPotAmount > 0) {
      setWinnerPotFlashTrigger({
        id: `pot-flash-${Date.now()}`,
        amount: threeFiveSevenWinPotAmount,
        playerId: threeFiveSevenWinnerId
      });
    }
    
    console.log('[357 WIN] Phase 3: delay before next game');
    setThreeFiveSevenWinPhase('delay');
    threeFiveSevenWinPhaseRef.current = 'delay';
    
    // Capture current animation ID
    const animationId = currentAnimationIdRef.current;
    console.log('[357 WIN] Captured animationId for completion check:', animationId);
    
    // 3 second delay before proceeding to next game
    setTimeout(() => {
      console.log('[357 WIN] 3s delay complete, checking animationId. Current:', currentAnimationIdRef.current, 'Expected:', animationId);
      // Only complete if this is still the current animation
      if (currentAnimationIdRef.current !== animationId) {
        console.log('[357 WIN] Stale animation, skipping completion');
        return;
      }
      console.log('[357 WIN] Animation sequence complete, calling onThreeFiveSevenWinAnimationComplete. Callback exists:', !!onThreeFiveSevenWinAnimationComplete);
      setThreeFiveSevenWinPhase('idle');
      threeFiveSevenWinPhaseRef.current = 'idle';
      setLegsToPlayerTriggerId(null);
      setPotToPlayerTriggerId357(null);
      if (onThreeFiveSevenWinAnimationComplete) {
        console.log('[357 WIN] Invoking parent callback now');
        onThreeFiveSevenWinAnimationComplete();
      } else {
        console.error('[357 WIN] ERROR: onThreeFiveSevenWinAnimationComplete is undefined!');
      }
    }, 3000);
  }, [onThreeFiveSevenWinAnimationComplete, threeFiveSevenWinnerId, threeFiveSevenWinPotAmount]);

  // Map other players to visual slots based on clockwise position from current player
  // Visual slots layout (clockwise from current player at bottom center):
  // Slot 0: 1 seat clockwise (bottom-left in visual layout)
  // Slot 1: 2 seats clockwise (middle-left)  
  // Slot 2: 3 seats clockwise (top-left)
  // Slot 3: 4 seats clockwise (top-right)
  // Slot 4: 5 seats clockwise (middle-right)
  // Slot 5: 6 seats clockwise (bottom-right)
  const currentPos = currentPlayer?.position ?? 1;
  const otherPlayersRaw = players.filter(p => p.user_id !== currentUserId);
  
  // Calculate clockwise distance from current player (1-6 seats away)
  const getClockwiseDistance = (playerPos: number): number => {
    let distance = playerPos - currentPos;
    if (distance <= 0) distance += 7; // Wrap around for positions before current
    return distance;
  };
  
  // Map clockwise distance to visual slot (distance 1 = slot 0, distance 2 = slot 1, etc.)
  // This ensures players appear at their actual relative position, not sequentially
  const getPlayerAtSlot = (slotIndex: number): Player | undefined => {
    const targetDistance = slotIndex + 1; // slot 0 = 1 seat away, slot 1 = 2 seats away, etc.
    return otherPlayersRaw.find(p => getClockwiseDistance(p.position) === targetDistance);
  };

  // Get occupied positions for open seats
  const occupiedPositions = new Set(players.map(p => p.position));
  const maxSeats = 7;
  const allPositions = Array.from({
    length: maxSeats
  }, (_, i) => i + 1);
  const openSeats = allPositions.filter(pos => !occupiedPositions.has(pos));
  // CRITICAL: Only OBSERVERS (users not in the players list at all) can select seats
  // Seated players (including sitting_out) cannot change seats
  const canSelectSeat = onSelectSeat && !currentPlayer;

  // Calculate expected card count for 3-5-7 games
  const getExpectedCardCount = (round: number): number => {
    if (gameType === 'holm-game') return 4;
    if (round === 1) return 3;
    if (round === 2) return 5;
    if (round === 3) return 7;
    return 3;
  };
  const expectedCardCount = getExpectedCardCount(currentRound);

  // Get player status chip background color based on status
  const getPlayerChipBgColor = (player: Player) => {
    // Yellow for waiting (regardless of sitting_out)
    if (player.waiting) {
      return 'bg-yellow-300';
    }
    // White for sitting out (and not waiting)
    if (player.sitting_out) {
      return 'bg-white';
    }
    // Green for active
    return 'bg-green-400';
  };

  // Render player chip - chipstack in center, name below (or above for bottom positions)
  const renderPlayerChip = (player: Player, slotIndex?: number) => {
    const isTheirTurn = gameType === 'holm-game' && currentTurnPosition === player.position && !awaitingNextRound;
    const isCurrentUser = player.user_id === currentUserId;
    // CRITICAL: Only show other players' decisions after allDecisionsIn (for 3-5-7)
    // Holm game shows decisions immediately (turn-based), 3-5-7 hides until all in
    // Current user always sees their own decision immediately
    const playerDecision = (isCurrentUser || allDecisionsIn || gameType === 'holm-game') 
      ? player.current_decision 
      : null;
    const playerCardsData = playerCards.find(pc => pc.player_id === player.id);
    // Use getPlayerCards for showdown caching
    const cards = getPlayerCards(player.id);

    // Show card backs for active players even if we don't have their cards data
    // CRITICAL: For 3-5-7, when hiding decisions from other players, also hide their folded status
    // Use "apparent" status that only shows fold after allDecisionsIn
    const rawIsActivePlayer = player.status === 'active' && !player.sitting_out;
    // In 3-5-7, if we're hiding this player's decision (not current user, not allDecisionsIn),
    // treat them as still active even if they've folded in the database
    const apparentIsActivePlayer = (isCurrentUser || allDecisionsIn || gameType === 'holm-game')
      ? rawIsActivePlayer
      : (player.status === 'active' || player.status === 'folded') && !player.sitting_out;
    
    // For Holm games, hide card backs when player folds
    const hasFolded = gameType === 'holm-game' && playerDecision === 'fold';
    const showCardBacks = apparentIsActivePlayer && expectedCardCount > 0 && currentRound > 0 && !hasFolded;
    const cardCountToShow = cards.length > 0 ? cards.length : expectedCardCount;

    // Status chip background color
    const chipBgColor = getPlayerChipBgColor(player);

    // Check if this player's chip stack is clickable by host (any player except self)
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;
    
    // Bottom positions (slot 0 = bottom-left, slot 5 = bottom-right) need name above chip
    const isBottomPosition = slotIndex === 0 || slotIndex === 5;
    
    // Determine if we should show this player's actual cards
    // Either: player has exposed cards in cache, OR we're showing announcement for a stayed player
    // OR: in 3-5-7, this player won the final leg (keep their cards visible during animation)
    // OR: 3-5-7 "secret reveal" in rounds 1-2 for players who stayed (only visible to other stayed players)
    const hasExposedCards = isPlayerCardsExposed(player.id) && cards.length > 0;
    const isInAnnouncementShowdown = isShowingAnnouncement && playerDecision === 'stay' && cards.length > 0;
    const is357WinningLegPlayer = gameType !== 'holm-game' && winningLegPlayerId === player.id && cards.length > 0;
    const is357Round3Showdown = is357Round3MultiPlayerShowdown && hasExposedCards;
    // Secret reveal: show cards of OTHER players who stayed (rounds 1-2, revealAtShowdown enabled)
    const is357SecretRevealShowdown = is357SecretRevealActive && playerDecision === 'stay' && hasExposedCards;
    const isShowdown = (gameType === 'holm-game' && (hasExposedCards || isInAnnouncementShowdown)) || is357WinningLegPlayer || is357Round3Showdown || is357SecretRevealShowdown;
    
    // During showdown/announcement, hide chip stack to make room for bigger cards
    // EXCEPTION: During Holm win animation, keep winner's chipstack visible (cards are "tabled" below Chucky)
    // EXCEPTION: During solo vs Chucky, keep solo player's chipstack visible (only their cards are tabled)
    const isHolmWinWinner = holmWinPotTriggerId && winnerPlayerId === player.id;
    const isSoloVsChuckyPlayerForChip = isSoloVsChucky && player.current_decision === 'stay' && player.id !== currentPlayer?.id;
    const hideChipForShowdown = isShowdown && !isHolmWinWinner && !isSoloVsChuckyPlayerForChip;
    
    const isDealer = dealerPosition === player.position;
    const playerLegs = gameType !== 'holm-game' ? player.legs : 0;
    
    // Determine if legs should be on the left (inside for right-side slots 3,4,5)
    const isRightSideSlot = slotIndex !== undefined && slotIndex >= 3;
    
    // Leg indicator element - overlapping circles positioned inside toward table center, barely overlapping chipstack edge
    // During leg animation, show (legs - 1) so only the NEW leg is hidden
    // During legs-to-player phase AND pot-to-player phase, hide ALL leg indicators since they've already animated to winner
    // During 3-5-7 win animation (before legs-to-player), use CACHED leg count since backend may have reset them
    const isLegAnimatingForThisPlayer = showLegEarned && legEarnedPlayerPosition === player.position;
    const hideLegsForWinAnimation = gameType !== 'holm-game' && (threeFiveSevenWinPhase === 'legs-to-player' || threeFiveSevenWinPhase === 'pot-to-player' || threeFiveSevenWinPhase === 'delay');
    
    // During win animation sequence, use cached leg count to display legs
    // Use cached values when: any animation phase is active (waiting, legs-to-player, pot-to-player, delay)
    const isIn357WinAnimation = gameType !== 'holm-game' && threeFiveSevenWinPhase !== 'idle';
    const cachedLegsForThisPlayer = threeFiveSevenCachedLegPositions.find(p => p.playerId === player.id)?.legCount || 0;
    const effectivePlayerLegs = isIn357WinAnimation ? cachedLegsForThisPlayer : playerLegs;
    
    
    const displayLegs = hideLegsForWinAnimation ? 0 : (isLegAnimatingForThisPlayer ? effectivePlayerLegs - 1 : effectivePlayerLegs);
    const legIndicator = displayLegs > 0 && (
      <div className="absolute z-30" style={{
        // Position to barely overlap the chipstack edge (6px inward from edge of 48px circle = 24px radius - 6px = 18px from center)
        ...(isRightSideSlot 
          ? { left: '6px', top: '50%', transform: 'translateY(-50%) translateX(-100%)' }
          : { right: '6px', top: '50%', transform: 'translateY(-50%) translateX(100%)' }
        )
      }}>
        <div className="flex" style={{ flexDirection: isRightSideSlot ? 'row-reverse' : 'row' }}>
          {Array.from({ length: Math.min(displayLegs, legsToWin) }).map((_, i) => (
            <div 
              key={i} 
              className="w-5 h-5 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg"
              style={{
                marginLeft: !isRightSideSlot && i > 0 ? '-8px' : '0',
                marginRight: isRightSideSlot && i > 0 ? '-8px' : '0',
                zIndex: Math.min(displayLegs, legsToWin) - i
              }}
            >
              <span className="text-slate-800 font-bold text-[10px]">L</span>
            </div>
          ))}
        </div>
      </div>
    );
    
    const chipElement = <div className="relative flex items-center gap-1">
        {/* Leg indicators - positioned inside toward table center */}
        {legIndicator}
        
        {/* Chat bubbles above player */}
        {getPositionForUserId && chatBubbles.length > 0 && (
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1">
            {chatBubbles
              .filter(b => getPositionForUserId(b.user_id) === player.position)
              .map((bubble) => (
                <ChatBubble
                  key={bubble.id}
                  username={bubble.username || 'Unknown'}
                  message={bubble.message}
                  expiresAt={bubble.expiresAt}
                />
              ))}
          </div>
        )}
        
        {/* Dealer button - positioned OUTSIDE (away from table center), barely overlapping chip stack */}
        {isDealer && (
          <div className="absolute z-30" style={{
            ...(isRightSideSlot 
              ? { right: '-2px', top: '50%', transform: 'translateY(-50%) translateX(75%)' }
              : { left: '-2px', top: '50%', transform: 'translateY(-50%) translateX(-75%)' }
            )
          }}>
            <div className="w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-[10px]">D</span>
            </div>
          </div>
        )}
        
        {/* Main chip stack - clickable for host to control players */}
        <div 
          className={`relative ${isClickable ? 'cursor-pointer' : ''}`}
          onClick={isClickable ? () => onPlayerClick(player) : undefined}
        >
          {/* Pulsing green ring for stayed players - separate element so inner circle doesn't pulse */}
          {playerDecision === 'stay' && (
            <div className="absolute inset-0 rounded-full ring-4 ring-green-500 shadow-[0_0_12px_rgba(34,197,94,0.7)] animate-pulse" />
          )}
          {/* Yellow ring for current turn (no pulse on ring, pulse on circle) */}
          {isTheirTurn && playerDecision !== 'stay' && (
            <div className="absolute inset-0 rounded-full ring-3 ring-yellow-400" />
          )}
          <div className={`
            relative w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 border-slate-600/50
            ${chipBgColor}
            ${playerDecision === 'fold' ? 'opacity-50' : ''}
            ${isTheirTurn && playerDecision !== 'stay' ? 'animate-turn-pulse' : ''}
            ${isClickable ? 'active:scale-95' : ''}
          `}>
            <span className={`text-sm font-bold leading-none ${(displayedChips[player.id] ?? player.chips) < 0 ? 'text-red-600' : 'text-slate-800'}`}>
              ${formatChipValue(Math.round(displayedChips[player.id] ?? player.chips))}
            </span>
            {/* Flash for legs received */}
            <ValueChangeFlash 
              value={0}
              prefix="+L"
              position="top-right"
              manualTrigger={winnerLegsFlashTrigger?.playerId === player.id ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount } : null}
            />
            {/* Flash for pot received */}
            <ValueChangeFlash 
              value={0}
              prefix="+$"
              position="top-left"
              manualTrigger={winnerPotFlashTrigger?.playerId === player.id ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount } : null}
            />
          </div>
        </div>
      </div>;
    
    const nameElement = (
      <span className="text-[11px] truncate max-w-[70px] leading-none font-semibold text-white drop-shadow-md">
        {player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || `P${player.position}`)}
        {player.is_bot && player.profiles?.aggression_level && (
          <span className="text-purple-300 ml-0.5">
            ({getAggressionAbbreviation(player.profiles.aggression_level)})
          </span>
        )}
      </span>
    );
    
    // Show actual cards during showdown (BIGGER when chip is hidden), otherwise show mini card backs
    // Dim cards for losing players during announcement, highlight winner's cards
    const isLosingPlayer = isShowingAnnouncement && winnerPlayerId && player.id !== winnerPlayerId && playerDecision === 'stay';
    const isWinningPlayer = isShowingAnnouncement && winnerPlayerId === player.id;
    // Hide cards from original position when winner's cards are "tabled" above pot
    // Applies to both Holm winners and 3-5-7 winners during win animation
    // For 3-5-7: only table AFTER leg award animation completes (not during 'waiting' phase)
    // For solo vs Chucky: hide solo player's cards from slot (they're tabled above pot)
    const is357WinWinner = threeFiveSevenWinnerId === player.id && 
      threeFiveSevenWinPhase !== 'idle' && threeFiveSevenWinPhase !== 'waiting';
    const isSoloVsChuckyPlayer = isSoloVsChucky && player.current_decision === 'stay' && player.id !== currentPlayer?.id;
    const shouldHideForTabling = isHolmWinWinner || is357WinWinner || isSoloVsChuckyPlayer;
    const cardsElement = isShowdown && !shouldHideForTabling ? (
      <div className={`flex ${hideChipForShowdown ? 'scale-100' : 'scale-75'} origin-top ${isLosingPlayer ? 'opacity-40 grayscale-[30%]' : ''}`}>
        <PlayerHand 
          cards={cards} 
          isHidden={false}
          highlightedIndices={isWinningPlayer ? winningCardHighlights.playerIndices : []}
          kickerIndices={isWinningPlayer ? winningCardHighlights.kickerPlayerIndices : []}
          hasHighlights={isWinningPlayer && winningCardHighlights.hasHighlights}
          gameType={gameType}
          currentRound={currentRound}
          showSeparated={gameType !== 'holm-game' && currentRound === 3 && cards.length === 7}
          tightOverlap={isHolmMultiPlayerShowdown}
        />
      </div>
    ) : (
      // Also hide card backs when cards are tabled (solo vs Chucky)
      !shouldHideForTabling && apparentIsActivePlayer && expectedCardCount > 0 && currentRound > 0 && cardCountToShow > 0 && (
        <div className={`flex ${hasFolded ? 'animate-[foldCards_1.5s_ease-out_forwards]' : ''}`}>
          {Array.from({
            length: Math.min(cardCountToShow, 7)
          }, (_, i) => <div key={i} className="w-2 h-3 rounded-[1px] border border-amber-600/50" style={{
            background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
            marginLeft: i > 0 ? '-3px' : '0', // Overlap card backs
            zIndex: cardCountToShow - i,
            animationDelay: hasFolded ? `${i * 0.05}s` : '0s'
          }} />)}
        </div>
      )
    );
    
    return <div key={player.id} className="flex flex-col items-center gap-0.5 relative">
        {/* Name above for bottom positions */}
        {isBottomPosition && nameElement}
        {/* Hide chip stack during showdown to make room for bigger cards */}
        {!hideChipForShowdown && (
          <MobilePlayerTimer timeLeft={timeLeft} maxTime={maxTime} isActive={isTheirTurn && roundStatus === 'betting'} size={52}>
            {chipElement}
          </MobilePlayerTimer>
        )}
        {/* Name below for other positions */}
        {!isBottomPosition && nameElement}
        {/* Cards - show actual cards during showdown (bigger when chip hidden), or mini card backs otherwise */}
        {cardsElement}
      </div>;
  };
  return <div className="flex flex-col h-[calc(100dvh-60px)] overflow-hidden bg-background relative">
      {/* Status badges moved to bottom section */}
      
      {/* Main table area - USE MORE VERTICAL SPACE */}
      <div ref={tableContainerRef} className="flex-1 relative overflow-hidden min-h-0" style={{
      maxHeight: '55vh'
    }}>
        {/* Table felt background - wide horizontal ellipse */}
        <div className="absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner" style={{
        background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)'
      }} />

        
        {/* Game name on felt */}
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center">
          <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
            {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
          </span>
          <span className="text-white/40 text-xs font-medium">
            {potMaxEnabled ? `$${potMaxValue} max` : 'No Limit'}
          </span>
          {gameType !== 'holm-game' && <span className="text-white/40 text-xs font-medium">
              {legsToWin} legs to win
            </span>}
        </div>
        
        
        {/* Chopped Animation */}
        <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
        
        {/* 357 Sweeps Pot Animation */}
        <SweepsPotAnimation 
          show={showSweepsPot} 
          playerName={sweepsPlayerName} 
          onComplete={() => setShowSweepsPot(false)} 
        />
        
        {/* Ante Up Animation */}
        <AnteUpAnimation
          pot={pot}
          anteAmount={anteAmount}
          chipAmount={anteAnimationTriggerId?.startsWith('pussy-tax-') ? pussyTaxValue : anteAmount}
          activePlayers={players.filter(p => !p.sitting_out)}
          currentPlayerPosition={currentPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          isWaitingPhase={isWaitingPhase}
          containerRef={tableContainerRef}
          gameType={gameType}
          currentRound={currentRound}
          gameStatus={gameStatus}
          triggerId={anteAnimationTriggerId}
          onAnimationStart={() => {
            // CRITICAL: Set animating flag FIRST to prevent sync useEffect from resetting
            isAnteAnimatingRef.current = true;
            
            // CRITICAL: Use expectedPostAnteChips directly if available - this is computed in Game.tsx
            // BEFORE any backend updates, so it's guaranteed to be correct
            if (expectedPostAnteChips) {
              lockedChipsRef.current = { ...expectedPostAnteChips };
              setDisplayedChips({ ...expectedPostAnteChips });
            } else {
              // Fallback: compute from preAnteChips or current chips
              const isPussyTaxTrigger = anteAnimationTriggerId?.startsWith('pussy-tax-');
              const perPlayerAmount = isPussyTaxTrigger ? pussyTaxValue : anteAmount;
              const newLockedChips: Record<string, number> = {};
              players.filter(p => !p.sitting_out).forEach(p => {
                const chipsBefore = preAnteChips?.[p.id] ?? p.chips;
                newLockedChips[p.id] = chipsBefore - perPlayerAmount;
              });
              lockedChipsRef.current = newLockedChips;
              setDisplayedChips(newLockedChips);
            }
            
            // Clear the trigger so it doesn't fire again on status change
            onAnteAnimationStarted?.();
            
            // Freeze displayed pot at PRE-ANTE value when animation starts
            const isPussyTaxTrigger = anteAnimationTriggerId?.startsWith('pussy-tax-');
            const perPlayerAmount = isPussyTaxTrigger ? pussyTaxValue : anteAmount;
            const totalAmount = perPlayerAmount * players.filter(p => !p.sitting_out).length;
            const preAntePot = anteAnimationExpectedPot !== null && anteAnimationExpectedPot !== undefined
              ? anteAnimationExpectedPot - totalAmount
              : pot - totalAmount;
            setDisplayedPot(Math.max(0, preAntePot));
          }}
          onChipsArrived={() => {
            // Determine amount based on trigger type (pussy tax vs ante)
            const isPussyTaxTrigger = anteAnimationTriggerId?.startsWith('pussy-tax-');
            const perPlayerAmount = isPussyTaxTrigger ? pussyTaxValue : anteAmount;
            const totalAmount = perPlayerAmount * players.filter(p => !p.sitting_out).length;
            
            if (anteAnimationExpectedPot !== null && anteAnimationExpectedPot !== undefined) {
              setDisplayedPot(anteAnimationExpectedPot);
            } else {
              setDisplayedPot(prev => prev + totalAmount);
            }
            
            // Keep locked values active - the useEffect watching players will clear
            // them automatically when backend values match expected values
            isAnteAnimatingRef.current = false;
            setAnteFlashTrigger({ id: `ante-${Date.now()}`, amount: totalAmount });
            // NOTE: lockedChipsRef is NOT cleared here - it's cleared by useEffect when backend syncs
          }}
        />
        
        {/* Chip Transfer Animation (3-5-7 showdowns - loser to winner) */}
        <ChipTransferAnimation
          triggerId={chipTransferTriggerId || null}
          amount={chipTransferAmount}
          winnerPosition={players.find(p => p.id === chipTransferWinnerId)?.position || 1}
          loserPositions={chipTransferLoserIds.map(id => players.find(p => p.id === id)?.position || 1)}
          loserPlayerIds={chipTransferLoserIds}
          currentPlayerPosition={currentPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          containerRef={tableContainerRef}
          onAnimationStart={(loserIds) => {
            // Backend ALREADY updated all chips. We want visual effect:
            // - Losers decrement NOW (show actual post-loss values)
            // - Winner shows pre-win value until animation ends
            const totalWinnings = chipTransferAmount * loserIds.length;
            const newDisplayedChips: Record<string, number> = {};
            
            // Winner: freeze at pre-win value (actual - totalWinnings)
            const winner = players.find(p => p.id === chipTransferWinnerId);
            if (winner) {
              newDisplayedChips[chipTransferWinnerId!] = winner.chips - totalWinnings;
            }
            
            // Losers: no override needed - actual (post-loss) values show the decrement
            
            setDisplayedChips(newDisplayedChips);
            onChipTransferStarted?.();
          }}
          onAnimationEnd={() => {
            // Clear winner's freeze - actual DB value (with winnings) now shows
            setDisplayedChips({});
            onChipTransferEnded?.();
          }}
        />
        
        {/* Holm Chucky Loss Animation (loser pays into pot) */}
        <AnteUpAnimation
          pot={pot}
          anteAmount={chuckyLossAmount}
          chipAmount={chuckyLossAmount}
          activePlayers={players.filter(p => !p.sitting_out).map(p => ({ position: p.position, id: p.id }))}
          currentPlayerPosition={currentPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          containerRef={tableContainerRef}
          gameType={gameType}
          triggerId={chuckyLossTriggerId}
          specificPlayerIds={chuckyLossPlayerIds}
          onAnimationStart={() => {
            // Backend ALREADY deducted chips. Show pre-loss values, then let actual values appear.
            const newDisplayedChips: Record<string, number> = {};
            chuckyLossPlayerIds.forEach(loserId => {
              const loser = players.find(p => p.id === loserId);
              if (loser) {
                // Show pre-loss value (add back what they lost)
                newDisplayedChips[loserId] = loser.chips + chuckyLossAmount;
              }
            });
            setDisplayedChips(newDisplayedChips);
            onChuckyLossStarted?.();
          }}
          onChipsArrived={() => {
            // Chips arrived at pot - clear override so actual (post-loss) values show
            setDisplayedChips({});
            // Trigger pot flash
            const totalLoss = chuckyLossAmount * chuckyLossPlayerIds.length;
            setAnteFlashTrigger({ id: `chucky-loss-${Date.now()}`, amount: totalLoss });
            onChuckyLossEnded?.();
          }}
        />
        
        {/* Holm Multi-Player Showdown Phase 1: Pot to Winner */}
        {holmShowdownPhase === 'pot-to-winner' && holmShowdownWinnerId && (
          <PotToPlayerAnimation
            triggerId={holmShowdownTriggerId}
            amount={holmShowdownPotAmount}
            winnerPosition={players.find(p => p.id === holmShowdownWinnerId)?.position ?? 1}
            currentPlayerPosition={currentPlayer?.position ?? null}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            gameType={gameType}
            onAnimationStart={() => {
              // Pot goes to 0 visually, show -$X flash
              setAnteFlashTrigger({ id: `showdown-pot-out-${Date.now()}`, amount: -holmShowdownPotAmount });
              onHolmShowdownPotToWinnerStarted?.();
            }}
            onAnimationEnd={() => {
              // Winner's chips have been updated by backend, just move to phase 2
              onHolmShowdownPotToWinnerEnded?.();
            }}
          />
        )}
        
        {/* Holm Win Pot Animation (player beats Chucky - dramatic 5 second animation) */}
        {holmWinPotTriggerId && (
          <HolmWinPotAnimation
            triggerId={holmWinPotTriggerId}
            amount={holmWinPotAmount}
            winnerPosition={holmWinWinnerPosition}
            currentPlayerPosition={currentPlayer?.position ?? null}
            isCurrentPlayerWinner={currentPlayer?.position === holmWinWinnerPosition}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            onAnimationComplete={() => {
              // FIX: Mark animation as completed to keep pot hidden
              console.log('[HOLM WIN] Animation complete - setting holmWinPotHiddenUntilReset=true');
              setHolmWinPotHiddenUntilReset(true);
              onHolmWinPotAnimationComplete?.();
            }}
          />
        )}
        
        {/* Holm Multi-Player Showdown Phase 2: Losers to Pot */}
        {holmShowdownPhase === 'losers-to-pot' && holmShowdownLoserIds.length > 0 && (
          <AnteUpAnimation
            pot={pot}
            anteAmount={holmShowdownMatchAmount}
            chipAmount={holmShowdownMatchAmount}
            activePlayers={players.filter(p => !p.sitting_out).map(p => ({ position: p.position, id: p.id }))}
            currentPlayerPosition={currentPlayer?.position ?? null}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            gameType={gameType}
            triggerId={phase2TriggerId}
            specificPlayerIds={holmShowdownLoserIds}
            onAnimationStart={() => {
              // Backend ALREADY deducted chips. Show pre-loss values.
              const newDisplayedChips: Record<string, number> = {};
              holmShowdownLoserIds.forEach(loserId => {
                const loser = players.find(p => p.id === loserId);
                if (loser) {
                  newDisplayedChips[loserId] = loser.chips + holmShowdownMatchAmount;
                }
              });
              setDisplayedChips(newDisplayedChips);
              onHolmShowdownLosersStarted?.();
            }}
            onChipsArrived={() => {
              setDisplayedChips({});
              // Trigger pot flash with NET change (losers paid - winner took)
              // Since winner already took pot, new pot = losers' match total
              const totalLoserPay = holmShowdownMatchAmount * holmShowdownLoserIds.length;
              setAnteFlashTrigger({ id: `showdown-losers-in-${Date.now()}`, amount: totalLoserPay });
              onHolmShowdownLosersEnded?.();
            }}
          />
        )}
        
        <BucksOnYouAnimation show={showBucksOnYou} onComplete={() => setShowBucksOnYou(false)} />
        
        {/* Leg Earned Animation (3-5-7 only) */}
        <LegEarnedAnimation 
          show={showLegEarned} 
          playerName={legEarnedPlayerName} 
          targetPosition={(() => {
            // Calculate target based on leg-earning player's position
            // Target should be where the NEXT leg indicator will appear (inside toward table center)
            if (!legEarnedPlayerPosition) return undefined;
            
            // If current player earned the leg, animate to bottom center-right (where their leg indicator actually renders)
            if (currentPlayer?.position === legEarnedPlayerPosition) {
              // Legs appear at left: 55%, bottom: 8px on the felt (see line ~879)
              return { top: '92%', left: '55%' };
            }
            
            // Otherwise, calculate slot position for other player
            const currentPos = currentPlayer?.position ?? 1;
            let distance = legEarnedPlayerPosition - currentPos;
            if (distance <= 0) distance += 7;
            const slotIndex = distance - 1;
            
            // Determine if right side slot (legs appear on left of chip)
            const isRightSideSlot = slotIndex >= 3;
            
            // Map slot to approximate screen coordinates (matching slotPositions layout)
            // With offset toward table center where legs actually render
            const slotCoords: Record<number, { top: string; left: string }> = {
              0: { top: '85%', left: '22%' },  // Bottom-left - legs on right side (toward center)
              1: { top: '50%', left: '12%' },  // Left - legs on right side (toward center)
              2: { top: '15%', left: '22%' },  // Top-left - legs on right side (toward center)
              3: { top: '15%', left: '78%' },  // Top-right - legs on left side (toward center)
              4: { top: '50%', left: '88%' },  // Right - legs on left side (toward center)
              5: { top: '85%', left: '78%' },  // Bottom-right - legs on left side (toward center)
            };
            return slotCoords[slotIndex] || { top: '85%', left: '40%' };
          })()}
          isWinningLeg={isWinningLegAnimation}
          suppressWinnerOverlay={gameType !== 'holm-game'} // Suppress for 3-5-7 - has its own win animation
          onComplete={() => setShowLegEarned(false)} 
        />
        
        {/* 3-5-7 Legs To Player Animation (all legs fly to winner's chip stack) */}
        {gameType !== 'holm-game' && threeFiveSevenWinPhase === 'legs-to-player' && threeFiveSevenWinnerId && (
          <LegsToPlayerAnimation
            triggerId={legsToPlayerTriggerId}
            legPositions={threeFiveSevenCachedLegPositions} // Use cached positions from parent
            winnerPosition={players.find(p => p.id === threeFiveSevenWinnerId)?.position ?? 1}
            currentPlayerPosition={currentPlayer?.position ?? null}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            legsToWin={legsToWin}
            onAnimationComplete={handleLegsToPlayerComplete}
          />
        )}
        
        {/* 3-5-7 Pot To Player Animation */}
        {gameType !== 'holm-game' && threeFiveSevenWinPhase === 'pot-to-player' && threeFiveSevenWinnerId && (
          <PotToPlayerAnimation
            triggerId={potToPlayerTriggerId357}
            amount={threeFiveSevenWinPotAmount}
            winnerPosition={players.find(p => p.id === threeFiveSevenWinnerId)?.position ?? 1}
            currentPlayerPosition={currentPlayer?.position ?? null}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            gameType={gameType}
            onAnimationStart={() => {
              // Pot goes to 0 visually
              setAnteFlashTrigger({ id: `357-win-pot-out-${Date.now()}`, amount: -threeFiveSevenWinPotAmount });
            }}
            onAnimationEnd={handlePotToPlayerComplete357}
          />
        )}
        
        {/* 3-5-7 Winner's Tabled Cards - shown above pot during win animation for ALL players */}
        {/* Rounds 1-2: Only table cards if winner clicked "Show Cards" (always face-up, with spin animation) */}
        {/* Round 3: Always table cards (face-down unless "Show Cards" clicked) */}
        {/* Only show AFTER leg award animation completes (not during 'waiting' phase) */}
        {gameType !== 'holm-game' && threeFiveSevenWinnerId && 
         threeFiveSevenWinPhase !== 'idle' && threeFiveSevenWinPhase !== 'waiting' &&
         threeFiveSevenWinnerCards.length > 0 && 
         (currentRound === 3 || winner357ShowCards) && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1">
            <div
              className="flex flex-col items-center"
              style={{
                animation:
                  currentRound !== 3 && winner357ShowCards
                    ? 'winner357TableSpinIn 1.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards'
                    : undefined,
                willChange: 'transform, opacity',
              }}
            >
              <div className="flex gap-1">
                <PlayerHand 
                  cards={threeFiveSevenWinnerCards} 
                  isHidden={currentRound === 3 ? !winner357ShowCards : false}
                  gameType={gameType}
                  currentRound={currentRound}
                  showSeparated={currentRound === 3}
                />
              </div>
            </div>
            <style>{`
              @keyframes winner357TableSpinIn {
                0% {
                  opacity: 0;
                  transform: translateY(240px) scale(0.3) rotate(0deg);
                }
                40% {
                  opacity: 1;
                  transform: translateY(100px) scale(0.7) rotate(270deg);
                }
                70% {
                  transform: translateY(30px) scale(0.9) rotate(540deg);
                }
                100% {
                  opacity: 1;
                  transform: translateY(0) scale(1) rotate(720deg);
                }
              }
            `}</style>
          </div>
        )}
        
        {/* Pot display - centered and larger for 3-5-7, above community cards for Holm */}
        {/* FIX: Use visibility:hidden instead of conditional rendering to prevent ValueChangeFlash remount */}
        {(() => {
          const shouldHidePot = !!(isWaitingPhase || holmWinPotTriggerId || holmWinPotHiddenUntilReset ||
            threeFiveSevenWinPhase === 'pot-to-player' || threeFiveSevenWinPhase === 'delay' || threeFiveSevenPotHiddenUntilReset);
          
          return (
            <div 
              className={`absolute left-1/2 transform -translate-x-1/2 z-20 ${
                gameType === 'holm-game' 
                  ? 'top-[35%] -translate-y-full' 
                  : 'top-1/2 -translate-y-1/2'
              }`}
              style={{ 
                visibility: shouldHidePot ? 'hidden' : 'visible',
                opacity: shouldHidePot ? 0 : 1,
                pointerEvents: shouldHidePot ? 'none' : 'auto'
              }}
            >
              <div className={`relative bg-black/70 backdrop-blur-sm rounded-full border border-poker-gold/60 ${
                gameType === 'holm-game' ? 'px-5 py-1.5' : 'px-8 py-3'
              }`}>
                <span className={`text-poker-gold font-bold ${
                  gameType === 'holm-game' ? 'text-xl' : 'text-3xl'
                }`}>${formatChipValue(Math.round(
                  // Use cached pot during 3-5-7 win animation sequence (any non-idle phase)
                  gameType !== 'holm-game' && threeFiveSevenWinPhase !== 'idle' && threeFiveSevenWinPotAmount > 0
                    ? threeFiveSevenWinPotAmount 
                    : displayedPot
                ))}</span>
                <ValueChangeFlash 
                  value={pot}
                  position="top-right" 
                  disabled={shouldHidePot}
                  manualTrigger={anteFlashTrigger}
                />
              </div>
            </div>
          );
        })()}
        
        {/* Solo Opponent's Tabled Cards - shown above pot when ANOTHER player goes solo vs Chucky */}
        {/* Only table OTHER player's cards - the current player sees their own cards in the bottom section */}
        {gameType === 'holm-game' && isSoloVsChucky && (() => {
          // Find the solo player who stayed
          const soloPlayer = players.find(p => p.current_decision === 'stay');
          // Only show tabled cards if the solo player is NOT the current player
          if (!soloPlayer || soloPlayer.id === currentPlayer?.id) return null;
          
          // Get solo player's cards
          const soloPlayerCards = getPlayerCards(soloPlayer.id);
          if (soloPlayerCards.length === 0) return null;
          
          // Sort cards by rank (ascending) like PlayerHand does
          const RANK_ORDER: Record<string, number> = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
            '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
          };
          const sortedCards = [...soloPlayerCards].map((card, index) => ({ card, originalIndex: index }))
            .sort((a, b) => RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank]);
          
          // Determine if solo player is the winner (for highlighting)
          const isSoloPlayerWinner = winnerPlayerId === soloPlayer.id;
          
          return (
            <div className="absolute top-[8%] left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center gap-1">
              <div 
                className="flex"
                style={{
                  animation: 'holmSoloTableSlide 0.6s ease-out forwards',
                  willChange: 'transform, opacity',
                }}
              >
                {sortedCards.map(({ card, originalIndex }, displayIndex) => {
                  const isFourColor = deckColorMode === 'four_color';
                  const fourColorConfig = getFourColorSuit(card.suit);
                  const cardBg = isFourColor && fourColorConfig ? fourColorConfig.bg : 'white';
                  const twoColorTextStyle = !isFourColor 
                    ? { color: (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#000000' } 
                    : {};
                  const isHighlighted = isSoloPlayerWinner && winningCardHighlights.playerIndices.includes(originalIndex);
                  const isKicker = isSoloPlayerWinner && winningCardHighlights.kickerPlayerIndices.includes(originalIndex);
                  
                  // Apply lift effect for highlighted cards
                  const liftTransform = (isHighlighted || isKicker) ? 'translateY(-25%)' : '';
                  
                  return (
                    <div 
                      key={displayIndex} 
                      className={`w-10 h-14 sm:w-11 sm:h-15 rounded-md border-2 flex flex-col items-center justify-center shadow-lg transition-transform duration-200 ${
                        isHighlighted ? 'border-yellow-400 ring-2 ring-yellow-400/50' : 
                        isKicker ? 'border-blue-400 ring-1 ring-blue-400/30' : 
                        'border-gray-300'
                      }`}
                      style={{ 
                        backgroundColor: cardBg, 
                        ...twoColorTextStyle,
                        transform: liftTransform || undefined,
                        marginLeft: displayIndex > 0 ? '-12px' : '0'
                      }}
                    >
                      <span className={`text-xl font-black leading-none ${isFourColor ? 'text-white' : ''}`}>
                        {card.rank}
                      </span>
                      {!isFourColor && (
                        <span className="text-2xl leading-none -mt-0.5">
                          {card.suit}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <style>{`
                @keyframes holmSoloTableSlide {
                  0% {
                    opacity: 0;
                    transform: translateY(120px) scale(0.8);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
              `}</style>
            </div>
          );
        })()}
        
        {(() => {
          const shouldShow = gameType === 'holm-game' && approvedCommunityCards && approvedCommunityCards.length > 0 && showCommunityCards && 
           (isInGameOverStatus || currentRound === approvedRoundForDisplay);
          
          console.log('🔥🔥🔥 [MOBILE_COMMUNITY] RENDER DECISION:', {
            shouldShow,
            gameType,
            hasApprovedCards: !!approvedCommunityCards,
            approvedCardsLength: approvedCommunityCards?.length,
            showCommunityCards,
            isInGameOverStatus,
            currentRound,
            approvedRoundForDisplay,
            roundMatch: currentRound === approvedRoundForDisplay
          });
          
          if (!shouldShow) return null;
          
          return (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-[1.8]">
              <CommunityCards 
                cards={approvedCommunityCards!} 
                revealed={isDelayingCommunityCards ? staggeredCardCount : (communityCardsRevealed || 2)} 
                highlightedIndices={winningCardHighlights.communityIndices}
                kickerIndices={winningCardHighlights.kickerCommunityIndices}
                hasHighlights={winningCardHighlights.hasHighlights}
                tightOverlap={isHolmMultiPlayerShowdown}
              />
            </div>
          );
        })()}
        
        {/* Chucky's Hand - use cached values to persist through announcement */}
        {gameType === 'holm-game' && cachedChuckyActive && cachedChuckyCards && cachedChuckyCards.length > 0 && (
          <div className="absolute top-[62%] left-1/2 transform -translate-x-1/2 z-10 flex items-center -space-x-[2px]">
            <span className="text-red-400 text-sm mr-1">👿</span>
            {cachedChuckyCards.map((card, index) => {
          const isRevealed = index < cachedChuckyCardsRevealed;
          const isFourColor = deckColorMode === 'four_color';
          const fourColorConfig = getFourColorSuit(card.suit);

          // Card face styling based on deck mode
          const cardBg = isRevealed ? isFourColor && fourColorConfig ? fourColorConfig.bg : 'white' : undefined;
          // Use inline color style for 2-color mode to override dark mode text colors
          const twoColorTextStyle = !isFourColor && isRevealed 
            ? { color: (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#000000' } 
            : {};
          
          return <div key={index} className="w-10 h-14 sm:w-11 sm:h-15">
                  {isRevealed ? <div className="w-full h-full rounded-md border-2 border-red-500 flex flex-col items-center justify-center shadow-lg" style={{
              backgroundColor: cardBg,
              ...twoColorTextStyle
            }}>
                      <span className={`text-xl font-black leading-none ${isFourColor ? 'text-white' : ''}`}>
                        {card.rank}
                      </span>
                      {!isFourColor && <span className="text-2xl leading-none -mt-0.5">
                          {card.suit}
                        </span>}
                    </div> : <div className="w-full h-full rounded-md border-2 border-red-600 flex items-center justify-center shadow-lg" style={{
              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`
            }}>
                      <span className="text-amber-400/50 text-xl">?</span>
                    </div>}
                </div>;
        })}
          </div>
        )}
        
        {/* Winner's Tabled Cards - shown above pot (overlaying game name/pot max) when player beats Chucky */}
        {/* This displays during the pot-to-winner animation so cards are visible */}
        {/* Don't show tabled cards to the winner themselves - they can see their own cards in their player card area */}
        {/* SKIP if cards are already tabled via solo vs Chucky - they're already in position */}
        {gameType === 'holm-game' && holmWinPotTriggerId && winnerPlayerId && winnerCards.length > 0 && winnerPlayerId !== currentPlayer?.id && !isSoloVsChucky && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center gap-1">
            <div 
              className="flex"
              style={{
                animation: 'holmTableSpinIn 1.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards',
                willChange: 'transform, opacity',
              }}
            >
              {winnerCards.map((card, index) => {
                const isFourColor = deckColorMode === 'four_color';
                const fourColorConfig = getFourColorSuit(card.suit);
                const cardBg = isFourColor && fourColorConfig ? fourColorConfig.bg : 'white';
                const twoColorTextStyle = !isFourColor 
                  ? { color: (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#000000' } 
                  : {};
                const isHighlighted = winningCardHighlights.playerIndices.includes(index);
                const isKicker = winningCardHighlights.kickerPlayerIndices.includes(index);
                
                // Apply lift effect for highlighted cards (same as PlayingCard component)
                const liftTransform = (isHighlighted || isKicker) ? 'translateY(-25%)' : '';
                
                return (
                  <div 
                    key={index} 
                    className={`w-10 h-14 sm:w-11 sm:h-15 rounded-md border-2 flex flex-col items-center justify-center shadow-lg transition-transform duration-200 ${
                      isHighlighted ? 'border-yellow-400 ring-2 ring-yellow-400/50' : 
                      isKicker ? 'border-blue-400 ring-1 ring-blue-400/30' : 
                      'border-green-500'
                    }`}
                    style={{ 
                      backgroundColor: cardBg, 
                      ...twoColorTextStyle,
                      transform: liftTransform || undefined,
                      marginLeft: index > 0 ? '-12px' : '0'
                    }}
                  >
                    <span className={`text-xl font-black leading-none ${isFourColor ? 'text-white' : ''}`}>
                      {card.rank}
                    </span>
                    {!isFourColor && (
                      <span className="text-2xl leading-none -mt-0.5">
                        {card.suit}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <style>{`
              @keyframes holmTableSpinIn {
                0% {
                  opacity: 0;
                  transform: translateY(240px) scale(0.3) rotate(0deg);
                }
                40% {
                  opacity: 1;
                  transform: translateY(100px) scale(0.7) rotate(270deg);
                }
                70% {
                  transform: translateY(30px) scale(0.9) rotate(540deg);
                }
                100% {
                  opacity: 1;
                  transform: translateY(0) scale(1) rotate(720deg);
                }
              }
            `}</style>
          </div>
        )}
        
        {/* Players arranged around table */}
        {/* CRITICAL: For observers (!currentPlayer), use ABSOLUTE position mapping */}
        {/* For seated players, use relative slots based on clockwise distance */}
        {!currentPlayer ? (
          // OBSERVER MODE: Render players at ABSOLUTE positions
          <>
            {/* Position 1: Top-left */}
            {players.find(p => p.position === 1) && (
              <div className="absolute top-2 left-10 z-10">
                {renderPlayerChip(players.find(p => p.position === 1)!, 2)}
              </div>
            )}
            {/* Position 2: Left - DON'T raise during solo vs Chucky */}
            <div className={`absolute left-0 z-10 transition-all duration-300 ${
              gameType === 'holm-game' && players.find(p => p.position === 2) && isPlayerCardsExposed(players.find(p => p.position === 2)!.id) && !holmWinPotTriggerId && !isSoloVsChucky
                ? 'top-[32%] -translate-y-1/2' 
                : 'top-1/2 -translate-y-1/2'
            }`}>
              {players.find(p => p.position === 2) && renderPlayerChip(players.find(p => p.position === 2)!, 1)}
            </div>
            {/* Position 3: Bottom-left */}
            {players.find(p => p.position === 3) && (
              <div className="absolute bottom-2 left-10 z-10">
                {renderPlayerChip(players.find(p => p.position === 3)!, 0)}
              </div>
            )}
            {/* Position 4: Bottom center */}
            {players.find(p => p.position === 4) && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
                {renderPlayerChip(players.find(p => p.position === 4)!, -1)}
              </div>
            )}
            {/* Position 5: Bottom-right */}
            {players.find(p => p.position === 5) && (
              <div className="absolute bottom-2 right-10 z-10">
                {renderPlayerChip(players.find(p => p.position === 5)!, 5)}
              </div>
            )}
            {/* Position 6: Right - DON'T raise during solo vs Chucky */}
            <div className={`absolute right-0 z-10 transition-all duration-300 ${
              gameType === 'holm-game' && players.find(p => p.position === 6) && isPlayerCardsExposed(players.find(p => p.position === 6)!.id) && !holmWinPotTriggerId && !isSoloVsChucky
                ? 'top-[32%] -translate-y-1/2' 
                : 'top-1/2 -translate-y-1/2'
            }`}>
              {players.find(p => p.position === 6) && renderPlayerChip(players.find(p => p.position === 6)!, 4)}
            </div>
            {/* Position 7: Top-right */}
            {players.find(p => p.position === 7) && (
              <div className="absolute top-2 right-10 z-10">
                {renderPlayerChip(players.find(p => p.position === 7)!, 3)}
              </div>
            )}
          </>
        ) : (
          // SEATED PLAYER MODE: Render players at relative slots (clockwise from current player)
          <>
            {/* Slot 0 (1 seat clockwise): Bottom-left */}
            <div className="absolute bottom-2 left-10 z-10">
              {getPlayerAtSlot(0) && renderPlayerChip(getPlayerAtSlot(0)!, 0)}
            </div>
            {/* Slot 1 (2 seats clockwise): Middle-left - moves up during showdown to avoid community cards (Holm only) */}
            {/* CRITICAL: Return to original position when win animation is active or solo vs Chucky */}
            <div className={`absolute left-0 z-10 transition-all duration-300 ${
              gameType === 'holm-game' && getPlayerAtSlot(1) && isPlayerCardsExposed(getPlayerAtSlot(1)!.id) && !holmWinPotTriggerId && !isSoloVsChucky
                ? 'top-[32%] -translate-y-1/2' 
                : 'top-1/2 -translate-y-1/2'
            }`}>
              {getPlayerAtSlot(1) && renderPlayerChip(getPlayerAtSlot(1)!, 1)}
            </div>
            {/* Slot 2 (3 seats clockwise): Top-left */}
            <div className="absolute top-2 left-10 z-10">
              {getPlayerAtSlot(2) && renderPlayerChip(getPlayerAtSlot(2)!, 2)}
            </div>
            {/* Slot 3 (4 seats clockwise): Top-right */}
            <div className="absolute top-2 right-10 z-10">
              {getPlayerAtSlot(3) && renderPlayerChip(getPlayerAtSlot(3)!, 3)}
            </div>
            {/* Slot 4 (5 seats clockwise): Middle-right - moves up during showdown to avoid community cards (Holm only) */}
            {/* CRITICAL: Return to original position when win animation is active or solo vs Chucky */}
            <div className={`absolute right-0 z-10 transition-all duration-300 ${
              gameType === 'holm-game' && getPlayerAtSlot(4) && isPlayerCardsExposed(getPlayerAtSlot(4)!.id) && !holmWinPotTriggerId && !isSoloVsChucky
                ? 'top-[32%] -translate-y-1/2' 
                : 'top-1/2 -translate-y-1/2'
            }`}>
              {getPlayerAtSlot(4) && renderPlayerChip(getPlayerAtSlot(4)!, 4)}
            </div>
            {/* Slot 5 (6 seats clockwise): Bottom-right */}
            <div className="absolute bottom-2 right-10 z-10">
              {getPlayerAtSlot(5) && renderPlayerChip(getPlayerAtSlot(5)!, 5)}
            </div>
          </>
        )}
        
        {/* Dealer button is now shown on player chip stacks (OUTSIDE position), no separate felt button needed */}
        
        {/* Buck indicator on felt - Holm games only, hide during showdown */}
        {gameType === 'holm-game' && buckPosition !== null && buckPosition !== undefined && !isAnyPlayerInShowdown && (() => {
        // Calculate buck's slot from clockwise distance
        const isCurrentPlayerBuck = currentPlayer?.position === buckPosition;
        const buckSlot = isCurrentPlayerBuck ? -1 : getClockwiseDistance(buckPosition) - 1;

        // Calculate pixel positions - offset from dealer button
        let positionStyle: React.CSSProperties = {
          bottom: '8px',
          left: '55%',
          transform: 'translateX(-50%)',
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        };
        if (!isCurrentPlayerBuck && buckSlot >= 0) {
          // Slot positions match clockwise layout:
          // 0: Bottom-left, 1: Middle-left, 2: Top-left
          // 3: Top-right, 4: Middle-right, 5: Bottom-right
          if (buckSlot === 0) {
            positionStyle = {
              bottom: '52px',
              left: '80px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 1) {
            positionStyle = {
              top: '38%',
              left: '52px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 2) {
            positionStyle = {
              top: '44px',
              left: '80px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 3) {
            positionStyle = {
              top: '44px',
              right: '80px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 4) {
            positionStyle = {
              top: '38%',
              right: '52px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 5) {
            positionStyle = {
              bottom: '52px',
              right: '80px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          }
        }
        return <div className="absolute z-20" style={positionStyle}>
              <div className="relative">
                <div className="absolute inset-0 bg-blue-600 rounded-full blur-sm animate-pulse opacity-75" />
                <div className="relative bg-white rounded-full p-0.5 shadow-lg border-2 border-blue-800 animate-bounce flex items-center justify-center w-7 h-7">
                  <img alt="Buck" className="w-full h-full rounded-full object-cover" src="/lovable-uploads/7ca746e0-8bcb-4dcd-9d87-407f9457deb8.png" />
                </div>
              </div>
            </div>;
      })()}
        
        {/* Current player's legs indicator on felt - 3-5-7 games only */}
        {/* FIX: Use threeFiveSevenCachedLegPositions prop during game_over - it's pre-cached before backend resets */}
        {/* FIX: Also hide legs during legs-to-player phase (same as other players) */}
        {gameType !== 'holm-game' && currentPlayer && (() => {
          // During legs-to-player phase AND pot-to-player/delay phases, hide ALL leg indicators since they've animated to winner
          const hideLegsForWinAnimation = threeFiveSevenWinPhase === 'legs-to-player' || threeFiveSevenWinPhase === 'pot-to-player' || threeFiveSevenWinPhase === 'delay';
          if (hideLegsForWinAnimation) {
            return false;
          }
          
          // Get cached legs from the prop if available and in game_over
          const cachedLegData = threeFiveSevenCachedLegPositions?.find(
            p => p.playerId === currentPlayer.id
          );
          
          // Use cached value during game_over, otherwise use live value
          const effectiveLegs = isInGameOverStatus && cachedLegData && cachedLegData.legCount > 0 
            ? cachedLegData.legCount 
            : (cachedCurrentPlayerLegs > 0 && isInGameOverStatus ? cachedCurrentPlayerLegs : currentPlayer.legs);
          
          const isAnimatingCurrentPlayer = showLegEarned && legEarnedPlayerPosition === currentPlayer.position;
          const displayLegs = isAnimatingCurrentPlayer ? effectiveLegs - 1 : effectiveLegs;
          return displayLegs > 0;
        })() && (
          <div 
            className="absolute z-20"
            style={{
              bottom: '8px',
              left: '55%',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="flex">
              {Array.from({ length: (() => {
                // Same caching logic for the array length
                const cachedLegData = threeFiveSevenCachedLegPositions?.find(
                  p => p.playerId === currentPlayer.id
                );
                const effectiveLegs = isInGameOverStatus && cachedLegData && cachedLegData.legCount > 0 
                  ? cachedLegData.legCount 
                  : (cachedCurrentPlayerLegs > 0 && isInGameOverStatus ? cachedCurrentPlayerLegs : currentPlayer.legs);
                const displayCount = (showLegEarned && legEarnedPlayerPosition === currentPlayer.position) 
                  ? effectiveLegs - 1 
                  : effectiveLegs;
                return Math.min(displayCount, legsToWin);
              })() }).map((_, i) => {
                const cachedLegData = threeFiveSevenCachedLegPositions?.find(
                  p => p.playerId === currentPlayer.id
                );
                const effectiveLegs = isInGameOverStatus && cachedLegData && cachedLegData.legCount > 0 
                  ? cachedLegData.legCount 
                  : (cachedCurrentPlayerLegs > 0 && isInGameOverStatus ? cachedCurrentPlayerLegs : currentPlayer.legs);
                const displayCount = (showLegEarned && legEarnedPlayerPosition === currentPlayer.position) 
                  ? effectiveLegs - 1 
                  : effectiveLegs;
                return (
                <div 
                  key={i}
                  className="w-7 h-7 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg"
                  style={{
                    marginLeft: i > 0 ? '-10px' : '0',
                    zIndex: Math.min(displayCount, legsToWin) - i
                  }}
                >
                  <span className="text-slate-800 font-bold text-xs">L</span>
                </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Dealer button on felt for current player */}
        {currentPlayer && dealerPosition === currentPlayer.position && (
          <div 
            className="absolute z-20"
            style={{
              bottom: '8px',
              left: '45%',
              transform: 'translateX(-50%)',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="w-7 h-7 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xs">D</span>
            </div>
          </div>
        )}
        
        {/* Open seats for seat selection - show in ABSOLUTE positions around the table */}
        {/* CRITICAL: For observers (canSelectSeat), use ABSOLUTE position mapping, not relative */}
        {/* Observers don't have a position, so seats must be at fixed visual locations */}
        {canSelectSeat && openSeats.length > 0 && (() => {
          // ABSOLUTE position → CSS class mapping for observers
          // Position 4 is conceptually at bottom center, positions arranged clockwise
          const absolutePositionClasses: Record<number, string> = {
            1: 'top-2 left-10',           // Top-left
            2: 'top-1/2 -translate-y-1/2 left-0', // Left
            3: 'bottom-2 left-10',        // Bottom-left
            4: 'bottom-2 left-1/2 -translate-x-1/2', // Bottom center
            5: 'bottom-2 right-10',       // Bottom-right
            6: 'top-1/2 -translate-y-1/2 right-0', // Right
            7: 'top-2 right-10',          // Top-right
          };

          return openSeats.map(pos => {
            const positionClass = absolutePositionClasses[pos] || absolutePositionClasses[1];
            
            return (
              <div key={pos} className={`absolute z-20 ${positionClass}`}>
                <button 
                  onClick={() => onSelectSeat && onSelectSeat(pos)} 
                  className="w-12 h-12 rounded-full bg-amber-900/40 border-2 border-dashed border-amber-600/70 flex items-center justify-center hover:bg-amber-800/60 hover:border-amber-500 transition-all active:scale-95"
                >
                  <span className="text-amber-300 text-xl">+</span>
                </button>
              </div>
            );
          });
        })()}
        
      </div>
      
      {/* Bottom section - Current player's cards and actions (swipeable) */}
      <div className="flex-1 min-h-0 bg-gradient-to-t from-background via-background to-background/95 border-t border-border touch-pan-x overflow-hidden" {...swipeHandlers}>
        {/* Status badges */}
        {(pendingSessionEnd || isPaused) && <div className="px-4 py-1.5">
            <div className="flex items-center justify-center gap-2">
              {pendingSessionEnd && <Badge variant="destructive" className="text-xs px-2 py-0.5">LAST HAND</Badge>}
              {isPaused && <Badge variant="outline" className="text-xs px-2 py-0.5 border-yellow-500 text-yellow-500">⏸ PAUSED</Badge>}
            </div>
          </div>}
        
        {/* Game Over state - result message (includes beat Chucky results now) */}
        {/* Hide all announcements during 3-5-7 win animation - the animation itself is the announcement */}
        {isGameOver && lastRoundResult && !(
          gameType !== 'holm-game' && (
            threeFiveSevenWinTriggerId || 
            threeFiveSevenWinPhase !== 'idle' ||
            lastRoundResult.includes('won the game')
          )
        ) && (
          <div className="px-4 py-3">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-3 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-base text-center">
                {lastRoundResult.split('|||')[0]}
              </p>
            </div>
          </div>
        )}
        
        {/* Result message - in bottom section (non-game-over, hide for 357 sweep, hide "won a leg" for 3-5-7 final leg win) */}
        {!isGameOver && lastRoundResult && !lastRoundResult.startsWith('357_SWEEP:') && 
         !(gameType !== 'holm-game' && threeFiveSevenWinTriggerId && lastRoundResult.includes('won a leg')) &&
         (awaitingNextRound || roundStatus === 'completed' || roundStatus === 'showdown' || allDecisionsIn || chuckyActive) && (
          <div className="px-4 py-2">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-sm text-center">
                {lastRoundResult.split('|||')[0]}
              </p>
            </div>
          </div>
        )}
        
        
        {/* Collapse toggle */}
        <button onClick={() => setIsCardSectionExpanded(!isCardSectionExpanded)} className="w-full flex items-center justify-center py-0.5 text-muted-foreground hover:text-foreground transition-colors">
          {isCardSectionExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
        
        {/* Collapsed view - Game Lobby with all players */}
        {!isCardSectionExpanded && <div className="px-3 pb-2 flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-bold text-foreground">Game Lobby</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Pot: <span className="text-poker-gold font-bold">${Math.round(displayedPot)}</span>
                </span>
              </div>
            </div>
            
            {/* Scrollable player list - sorted by chips descending */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
              {[...players].sort((a, b) => b.chips - a.chips).map(player => {
                const isCurrentUser = player.user_id === currentUserId;
                const isDealing = player.position === dealerPosition;
                const hasBuck = player.position === buckPosition;
                return (
                  <div key={player.id} className={`
                    flex items-center justify-between py-1.5 px-2 rounded-md
                    ${isCurrentUser ? 'bg-primary/10' : 'bg-transparent'}
                    ${player.sitting_out ? 'opacity-50' : ''}
                  `}>
                    {/* Left: Name with badges inline */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={`text-sm font-medium truncate ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
                        {player.profiles?.username || (player.is_bot ? `Bot ${player.position}` : `P${player.position}`)}
                      </span>
                      {isDealing && <span className="text-[9px] px-1 py-0 bg-poker-gold text-black rounded font-bold">D</span>}
                      {hasBuck && gameType === 'holm-game' && <span className="text-[9px] px-1 py-0 bg-amber-600 text-white rounded font-bold">B</span>}
                      {player.is_bot && <span className="text-[9px] text-muted-foreground">(Bot)</span>}
                      {player.sitting_out && <span className="text-[9px] text-muted-foreground italic">out</span>}
                    </div>
                    
                    {/* Right: Chips and Legs */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Leg indicator for 3-5-7 */}
                      {gameType !== 'holm-game' && player.legs > 0 && (
                        <div className="flex">
                          {Array.from({ length: Math.min(player.legs, legsToWin) }).map((_, i) => (
                            <div 
                              key={i} 
                              className="w-4 h-4 rounded-full bg-white border border-slate-400 flex items-center justify-center shadow-sm" 
                              style={{ marginLeft: i > 0 ? '-4px' : '0', zIndex: Math.min(player.legs, legsToWin) - i }}
                            >
                              <span className="text-slate-800 font-bold text-[8px]">L</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Chip stack - prioritize locked ref > displayedChips state > actual chips */}
                      <div className={`text-right min-w-[45px] font-bold text-sm ${(lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips) < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                        ${formatChipValue(Math.round(lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Chat panel - fixed at bottom */}
            {onSendChat && (
              <div className="flex-shrink-0 mt-2 pt-2 border-t border-border">
                <MobileChatPanel
                  messages={allMessages}
                  onSend={onSendChat}
                  isSending={isChatSending}
                />
              </div>
            )}
          </div>}
        
        {/* Expanded view - show cards large */}
        {isCardSectionExpanded && currentPlayer && <div className="px-2 flex flex-col">
            {/* Progress bar timer - shows when it's player's turn */}
            {isPlayerTurn && roundStatus === 'betting' && !hasDecided && timeLeft !== null && timeLeft > 0 && maxTime && (
              <div key={`timer-${currentRound}-${currentTurnPosition}`} className="mb-2 px-2">
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden border border-border">
                  <div 
                    className={`h-full transition-[width] duration-1000 ease-linear ${
                      timeLeft <= 3 ? 'bg-red-500' : 
                      timeLeft <= 5 ? 'bg-yellow-500' : 
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.max(0, (timeLeft / maxTime) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            
            {/* Action buttons - ABOVE cards */}
            {canDecide && <div className="flex gap-2 justify-center mb-1">
                <Button variant="destructive" size="default" onClick={onFold} className="flex-1 max-w-[120px] text-sm font-bold h-9">
                  {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                </Button>
                <Button size="default" onClick={onStay} className="flex-1 max-w-[120px] bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-sm font-bold h-9">
                  Stay
                </Button>
              </div>}
            
            {/* Rejoin Next Hand button for sitting out players */}
            {currentPlayer.sitting_out && !currentPlayer.waiting && (
              <div className="flex justify-center mb-2 px-4">
                <RejoinNextHandButton playerId={currentPlayer.id} />
              </div>
            )}
            
            {/* Decision feedback - above cards */}
            {hasDecided && (
              <div className="flex justify-center mb-1">
                <Badge
                  className={cn(
                    "text-sm px-3 py-0.5 border-transparent",
                    (pendingDecision || currentPlayer.current_decision) === "stay"
                      ? "bg-poker-chip-green text-poker-chip-white"
                      : "bg-poker-chip-red text-poker-chip-white",
                  )}
                >
                  ✓ {(pendingDecision || currentPlayer.current_decision) === "stay" ? "STAYED" : "FOLDED"}
                </Badge>
              </div>
            )}
            
            {/* Cards display - moved up, less padding */}
            {/* Dim current player's cards if they lost (winner exists and it's not them) */}
            {/* For 357 winner during animation: */}
            {/*   - Round 3: Cards are tabled above pot, show "Show Cards" button here */}
            {/*   - Rounds 1-2: Keep cards visible here with "Show Cards" button above them */}
            {(() => {
              const isWinner357InAnimation = gameType !== 'holm-game' && 
                threeFiveSevenWinnerId === currentPlayer?.id && 
                threeFiveSevenWinPhase !== 'idle';
              
              if (isWinner357InAnimation) {
                // Round 3: Cards are tabled above pot - show only the button here
                if (currentRound === 3) {
                  return (
                    <div className="flex flex-col items-center justify-center gap-3">
                      {!winner357ShowCards ? (
                        <Button 
                          variant="outline"
                          size="lg"
                          onClick={() => onWinner357ShowCards?.()}
                          className="bg-green-600 hover:bg-green-700 text-white border-green-500 font-bold px-6 py-3 text-base"
                        >
                          Show Cards
                        </Button>
                      ) : (
                        <div className="text-sm text-green-400 font-medium">Cards Shown</div>
                      )}
                    </div>
                  );
                }
                
                // Rounds 1-2: Keep cards visible here with "Show Cards" button above
                return (
                  <div className="flex flex-col items-center justify-center gap-2">
                    {/* Show Cards button above the cards - if clicked, cards table face-up */}
                    {!winner357ShowCards ? (
                      <Button 
                        variant="outline"
                        size="default"
                        onClick={() => onWinner357ShowCards?.()}
                        className="bg-green-600 hover:bg-green-700 text-white border-green-500 font-bold px-4 py-2 text-sm"
                      >
                        Show Cards
                      </Button>
                    ) : (
                      <div className="text-sm text-green-400 font-medium">Cards Tabled</div>
                    )}
                    
                    {/* Winner's cards - stay visible until they choose to show */}
                    {!winner357ShowCards && currentPlayerCards.length > 0 && (
                      <div className="transform scale-[2.2] origin-top">
                        <PlayerHand 
                          cards={currentPlayerCards} 
                          isHidden={false} 
                          gameType={gameType}
                          currentRound={currentRound}
                          showSeparated={currentRound === 3}
                        />
                      </div>
                    )}
                  </div>
                );
              }
              
              // Normal card display
              // Show pre-decision checkboxes for Holm games when stay/fold buttons aren't visible but player hasn't decided
              const showPreDecisionCheckboxes = gameType === 'holm-game' && 
                !canDecide &&  // stay/fold buttons NOT visible
                !hasDecided &&  // hasn't made a decision yet
                roundStatus === 'betting' && 
                currentPlayerCards.length > 0;
              
              console.log('[PRE-DECISION UI] Checkbox visibility:', {
                gameType,
                isPlayerTurn,
                hasDecided,
                roundStatus,
                isPaused,
                hasCards: currentPlayerCards.length > 0,
                showPreDecisionCheckboxes
              });
              
              return (
                <div className="flex flex-col items-center justify-center gap-3 w-full">
                  {/* Pre-decision checkboxes - ABOVE cards (cards are scaled up and can push left content off-screen) */}
                  {showPreDecisionCheckboxes && (
                    <div className="flex items-center justify-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={holmPreFold}
                          onChange={(e) => {
                            onHolmPreFoldChange?.(e.target.checked);
                            if (e.target.checked) onHolmPreStayChange?.(false);
                          }}
                          className="w-5 h-5 rounded border-2 border-red-500 accent-red-500"
                        />
                        <span className="text-sm font-medium text-red-500">Fold</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={holmPreStay}
                          onChange={(e) => {
                            onHolmPreStayChange?.(e.target.checked);
                            if (e.target.checked) onHolmPreFoldChange?.(false);
                          }}
                          className="w-5 h-5 rounded border-2 border-green-500 accent-green-500"
                        />
                        <span className="text-sm font-medium text-green-500">Stay</span>
                      </label>
                    </div>
                  )}

                  {/* Cards - current player always sees their own cards in the bottom section */}
                  {currentPlayerCards.length > 0 ? (
                    <div
                      className={`transform scale-[2.2] origin-top ${isPlayerTurn && roundStatus === 'betting' && !hasDecided && !isPaused && timeLeft !== null && timeLeft <= 3 ? 'animate-rapid-flash' : ''} ${isShowingAnnouncement && winnerPlayerId && !isCurrentPlayerWinner && currentPlayer?.current_decision === 'stay' ? 'opacity-40 grayscale-[30%]' : ''}`}
                    >
                      <PlayerHand 
                        cards={currentPlayerCards} 
                        isHidden={false} 
                        highlightedIndices={isCurrentPlayerWinner ? winningCardHighlights.playerIndices : []}
                        kickerIndices={isCurrentPlayerWinner ? winningCardHighlights.kickerPlayerIndices : []}
                        hasHighlights={isCurrentPlayerWinner && winningCardHighlights.hasHighlights}
                        gameType={gameType}
                        currentRound={currentRound}
                        showSeparated={gameType !== 'holm-game' && currentRound === 3 && currentPlayerCards.length === 7}
                        tightOverlap={isHolmMultiPlayerShowdown}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Waiting for cards...</div>
                  )}
                </div>
              );
            })()}
            
            {/* Player info and chat - below cards */}
            <div className="flex flex-col gap-2 mt-16">
              {/* Name, chips, dealer badge, and hand eval in a row */}
              <div className="flex items-center justify-center gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {currentPlayer.profiles?.username || 'You'}
                  {currentPlayer.sitting_out && !currentPlayer.waiting ? <span className="ml-1 text-destructive font-bold">(sitting out)</span> : currentPlayer.waiting ? <span className="ml-1 text-yellow-500">(waiting)</span> : <span className="ml-1 text-green-500">(active)</span>}
                </p>
                {/* Chip stack - prioritize locked ref > displayedChips state > actual chips */}
                <div className="relative">
                  <span className={`text-lg font-bold ${(lockedChipsRef.current?.[currentPlayer.id] ?? displayedChips[currentPlayer.id] ?? currentPlayer.chips) < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                    ${formatChipValue(Math.round(lockedChipsRef.current?.[currentPlayer.id] ?? displayedChips[currentPlayer.id] ?? currentPlayer.chips))}
                  </span>
                  {/* Flash for legs received */}
                  <ValueChangeFlash 
                    value={0}
                    prefix="+L"
                    position="top-right"
                    manualTrigger={winnerLegsFlashTrigger?.playerId === currentPlayer.id ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount } : null}
                  />
                  {/* Flash for pot received */}
                  <ValueChangeFlash 
                    value={0}
                    prefix="+$"
                    position="top-left"
                    manualTrigger={winnerPotFlashTrigger?.playerId === currentPlayer.id ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount } : null}
                  />
                </div>
                {/* Hand evaluation for Holm only when Chucky is active */}
                {currentPlayerCards.length > 0 && gameType === 'holm-game' && chuckyActive && <Badge className="bg-poker-gold/20 text-poker-gold border-poker-gold/40 text-xs px-2 py-0.5">
                    {formatHandRank(evaluateHand(currentPlayerCards, false).rank)}
                  </Badge>}
              </div>
              
              {/* Chat panel - always visible */}
              {onSendChat && (
                <div className="w-full">
                  <MobileChatPanel
                    messages={allMessages}
                    onSend={onSendChat}
                    isSending={isChatSending}
                  />
                </div>
              )}
            </div>
          </div>}
        
        {/* No player state - only for observers */}
        {isCardSectionExpanded && !currentPlayer && <div className="px-4 pb-4">
            {/* Header with gear for observers */}
            <div className="flex items-center justify-between mb-3">
              {onLeaveGameNow && (
                <PlayerOptionsMenu
                  isSittingOut={false}
                  isObserver={true}
                  waiting={false}
                  autoAnte={false}
                  sitOutNextHand={false}
                  standUpNextHand={false}
                  onAutoAnteChange={() => {}}
                  onSitOutNextHandChange={() => {}}
                  onStandUpNextHandChange={() => {}}
                  onStandUpNow={() => {}}
                  onLeaveGameNow={onLeaveGameNow}
                  variant="mobile"
                />
              )}
            </div>
            
            <p className="text-muted-foreground text-sm text-center mb-3">
              You are observing this game
            </p>
            
            {/* Chat panel for observers - always visible */}
            {onSendChat && (
              <MobileChatPanel
                messages={allMessages}
                onSend={onSendChat}
                isSending={isChatSending}
              />
            )}
          </div>}
      </div>
    </div>;
};