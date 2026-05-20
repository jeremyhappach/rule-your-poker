// Gin Rummy Game Table - Mobile layout following CribbageMobileGameTable pattern
// Circular felt, opponent chip, tabs (cards, chat, lobby, history)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useGameStateSync, getGinRummyProgress } from '@/lib/gameStateSync';
import { useAuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentity';
import { isIdentityForward, type AuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentityPure';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import {
  checkStaleHandRender,
  checkPhaseRenderMismatch,
  checkResultRenderMismatch,
  checkRegressiveHandIdentity,
  resetGinRummyTracking,
  logGinResultDisplay,
} from '@/lib/ginRummySyncDiagnostics';
import { supabase } from '@/integrations/supabase/client';
import { logDebugEvent, ginStateSummary, newTraceId } from '@/lib/debugEventLogger';
import { toast } from 'sonner';
import { useWakeLock } from '@/hooks/useWakeLock';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import {
  drawFromStock,
  drawFromDiscard,
  discardCard,
  declareKnock,
  takeFirstDrawCard,
  passFirstDraw,
  layOffCard,
  finishLayingOff,
  scoreHand,
  getDiscardTop,
} from '@/lib/ginRummyGameLogic';
import {
  shouldBotTakeFirstDraw,
  botChooseDrawSource,
  botChooseDiscard,
  botShouldKnock,
  botGetLayOffs,
} from '@/lib/ginRummyBotLogic';
import {
  startNextGinRummyHand,
  recordGinRummyHandResult,
  endGinRummyGame,
} from '@/lib/ginRummyRoundLogic';
import { GinRummyFeltContent } from './GinRummyFeltContent';
import { GinRummyMobileCardsTab } from './GinRummyMobileCardsTab';
import { GinRummyKnockDisplay } from './GinRummyKnockDisplay';
import { GinRummyOpponentDrawAnimation } from './GinRummyOpponentDrawAnimation';
import { GinRummyMatchWinner } from './GinRummyMatchWinner';
import { GinRummyKnockOverlay } from './GinRummyKnockOverlay';
import { GinRummyGinOverlay } from './GinRummyGinOverlay';
import { CribbageChipTransferAnimation } from './CribbageChipTransferAnimation';
import { MobileChatPanel } from './MobileChatPanel';
import { HandHistory } from './HandHistory';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { useKnockSound } from '@/hooks/useKnockSound';
import { useGameChat } from '@/hooks/useGameChat';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';
import { CanonicalFeltSurface } from '@/lib/canonicalShell/CanonicalFeltSurface';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { useSeatAnchorsOptional } from '@/lib/canonicalShell/SeatAnchorLayer';
import { getCanonicalSlotGeometry } from '@/lib/canonicalShell/slotGeometry';

import { MessageSquare, User, Clock } from 'lucide-react';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  status?: string;
  sitting_out?: boolean;
  waiting?: boolean;
  profiles?: { username: string };
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

interface GinRummyGameTableProps {
  gameId: string;
  roundId: string;
  dealerGameId: string | null;
  handNumber: number;
  players: Player[];
  currentUserId: string;
  dealerPosition: number;
  anteAmount: number;
  pot: number;
  isHost: boolean;
  onGameComplete: () => void;
  bootstrapState?: GinRummyState | null;
}

export const GinRummyGameTable = ({
  gameId,
  roundId: propRoundId,
  dealerGameId,
  handNumber: propHandNumber,
  players,
  currentUserId,
  dealerPosition,
  anteAmount,
  pot,
  isHost,
  onGameComplete,
  bootstrapState = null,
}: GinRummyGameTableProps) => {
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const { playKnock } = useKnockSound();
  
  // Prevent screen from dimming during gameplay
  useWakeLock(true);

  const { allMessages, sendMessage, isSending: isChatSending, latestRealtimeMessage } = useGameChat(gameId, players, currentUserId);

  const [ginState, setGinState] = useState<GinRummyState | null>(null);

  // ── Phase 2: framework-owned authoritative identity ─────────────
  // Dealer-game-scoped feed observes new rounds across boundaries so the
  // client cannot become structurally blind to a forward-advanced hand
  // started by a peer client.
  const { identity: authIdentity } = useAuthoritativeIdentity({ dealerGameId });

  // Monotonic forward-only round/hand identity. Parent props are advisory;
  // authoritative identity wins whenever it is forward-of-or-equal.
  const [currentRoundId, setCurrentRoundId] = useState<string>(propRoundId);
  const [currentHandNumber, setCurrentHandNumber] = useState<number>(propHandNumber);
  useEffect(() => {
    const propHand = propHandNumber ?? -1;
    const authHand = authIdentity?.handNumber ?? -1;
    const useAuth = authIdentity?.roundId != null && authHand >= propHand;
    const incomingRoundId = useAuth ? authIdentity!.roundId! : propRoundId;
    const incomingHandNumber = Math.max(authHand, propHand, currentHandNumber);
    if (!incomingRoundId) return;
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
      if (isIdentityForward(prevIdent, nextIdent)) return incomingRoundId;
      return prev;
    });
  }, [propRoundId, propHandNumber, authIdentity?.roundId, authIdentity?.handNumber, currentHandNumber, dealerGameId]);

  // Aliases — keep existing internal references pointing at the live monotonic identity.
  const roundId = currentRoundId;
  const handNumber = currentHandNumber;

  // ── Identity-advancement reset (mirror of Cribbage Phase 2) ─────
  // When the dealer-scoped feed detects a forward advance, drop the local
  // ginState mirror so the felt collapses to the "Preparing next hand" shell
  // until the new round's snapshot arrives. The sync framework separately
  // auto-resets presentation/optimistic/freeze via `identity` config below.
  const lastObservedIdentityRef = useRef<AuthoritativeIdentity | null>(null);
  useEffect(() => {
    if (!authIdentity) return;
    const prev = lastObservedIdentityRef.current;
    lastObservedIdentityRef.current = authIdentity;
    if (!prev) return;
    if (!isIdentityForward(prev, authIdentity)) return;
    setGinState(null);
    const payload = {
      prevHand: prev.handNumber,
      nextHand: authIdentity.handNumber,
      prevRoundId: prev.roundId?.slice(0, 8) ?? null,
      nextRoundId: authIdentity.roundId?.slice(0, 8) ?? null,
    };
    persistSyncDebugEvent({
      gameId, gameType: 'gin-rummy',
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'transition', severity: 'info',
      eventName: 'gin-identity-advanced',
      payload,
    });
    persistSyncDebugEvent({
      gameId, gameType: 'gin-rummy',
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'transition', severity: 'info',
      eventName: 'gin-presentation-reset-on-identity-advance',
      payload,
    });
  }, [authIdentity?.roundId, authIdentity?.handNumber, authIdentity?.dealerGameId, gameId]);

  // ── Shared anti-regression sync framework ──────────────────────
  const ginSync = useGameStateSync<GinRummyState | null>(bootstrapState ?? null, {
    getProgress: (s) => s ? getGinRummyProgress(s) : [0, 0, 0],
    optimisticTimeoutMs: 3000,
    gameType: 'gin-rummy',
    isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    identity: authIdentity,
  });

  // Sync framework is now fed directly by applyState (realtime/poll handler).
  // Local mutations feed it via ginSync.applyOptimistic() / updateState().

  // Alias: all RENDER paths use viewState (presentationState); mutations use ginState
  const viewState = ginSync.presentationState;

  useEffect(() => {
    if (!bootstrapState || !roundId) return;
    const result = ginSync.receiveAuthoritativeUpdate(bootstrapState);
    if (result.accepted) setGinState(bootstrapState);
  }, [bootstrapState, roundId]);

  // ── Writer-audit gate ──
  // Single framework-owned predicate covering frozen / contract / identity-stale.
  // Action handlers and the bot loop short-circuit when interactionsAllowed=false
  // so stale local paths cannot write through to the new round.
  const interactionsAllowed = ginSync.interactionsAllowed;
  const interactionsAllowedRef = useRef(interactionsAllowed);
  useEffect(() => { interactionsAllowedRef.current = interactionsAllowed; }, [interactionsAllowed]);
  const isIdentityStaleRef = useRef(ginSync.isIdentityStale);
  useEffect(() => { isIdentityStaleRef.current = ginSync.isIdentityStale; }, [ginSync.isIdentityStale]);

  // Lifted lay-off card selection so the felt can show meld targets
  const [layOffSelectedCardIndex, setLayOffSelectedCardIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
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
        surface: 'gin',
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

  useEffect(() => {
    return () => {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
      }
    };
  }, []);

  // Chip transfer animation at match end (player-to-player like cribbage)
  const [chipAnimTriggerId, setChipAnimTriggerId] = useState<string | null>(null);
  const [storedChipPositions, setStoredChipPositions] = useState<{
    winner: { x: number; y: number };
    losers: { playerId: string; x: number; y: number }[];
  } | null>(null);
  const [chipAnimAmount, setChipAnimAmount] = useState(0);
  const matchEndAnimatedRef = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevPhaseRef = useRef<string | null>(null);
  const [showKnockOverlay, setShowKnockOverlay] = useState(false);
  const [showGinOverlay, setShowGinOverlay] = useState(false);

  // Opponent draw animation state
  const [opponentDrawTriggerId, setOpponentDrawTriggerId] = useState<string | null>(null);
  const [opponentDrawSource, setOpponentDrawSource] = useState<'stock' | 'discard'>('stock');
  const [opponentDrawCard, setOpponentDrawCard] = useState<GinRummyCard | null>(null);
  const [opponentDrawTargetSlot, setOpponentDrawTargetSlot] = useState<CanonicalSlot | null>(null);
  const [opponentDrawKey, setOpponentDrawKey] = useState(0);
  const prevLastActionRef = useRef<string | null>(null);

  const isSeatedGamePlayer = useCallback((player: Player) => {
    if (player.status === 'observer' || player.status === 'left') return false;
    if (player.sitting_out) return false;
    if (player.waiting) return false;
    return true;
  }, []);
  const eligibleSeatPlayers = players.filter(isSeatedGamePlayer);
  const viewStateParticipantIds = viewState
    ? new Set([viewState.dealerPlayerId, viewState.nonDealerPlayerId])
    : null;
  const activeSeatPlayers = viewStateParticipantIds
    ? players.filter(player => viewStateParticipantIds.has(player.id))
    : eligibleSeatPlayers;
  const currentPlayer = activeSeatPlayers.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  const isObserver = !currentPlayerId;
  // P9.4 (re-scoped, Option A): consume shell-owned SeatAnchorLayer.
  // Gin no longer recomputes seat projection locally. The shell mounts
  // SeatAnchorLayer at the PersistentTableShell boundary using the same
  // resolver, fed by Game.tsx — one source of truth for every
  // canonical-shell game. If the layer is somehow absent (test harness,
  // flag-off), the map degrades to all-nulls rather than reintroducing
  // a per-game projection clone.
  const shellAnchors = useSeatAnchorsOptional();
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

  // Derive opponent
  // Derive opponent from viewState (render-stable)
  const opponentId = viewState
    ? (currentPlayerId
      ? (currentPlayerId === viewState.dealerPlayerId
        ? viewState.nonDealerPlayerId
        : viewState.dealerPlayerId)
      : viewState.dealerPlayerId)
    : '';
  const opponent = players.find(p => p.id === opponentId);
  const observerSeatIds = viewState ? [viewState.dealerPlayerId, viewState.nonDealerPlayerId] : [];
  const currentTurnSlot = viewState?.currentTurnPlayerId
    ? playerSlotById.get(viewState.currentTurnPlayerId) ?? null
    : null;
  const getCanonicalSlotGeometry = (slot: CanonicalSlot | null | undefined) => {
    switch (slot) {
      case -2:
        return { className: 'top-14 left-1/2 -translate-x-1/2 items-center', point: { x: '50%', y: '18%' }, alignEnd: false };
      case -1:
        return { className: 'bottom-14 left-1/2 -translate-x-1/2 items-center', point: { x: '50%', y: '82%' }, alignEnd: false };
      case 0:
        return { className: 'bottom-14 left-6 items-start', point: { x: '14%', y: '82%' }, alignEnd: false };
      case 1:
        return { className: 'top-1/2 left-6 -translate-y-1/2 items-start', point: { x: '10%', y: '50%' }, alignEnd: false };
      case 2:
        return { className: 'top-14 left-6 items-start', point: { x: '14%', y: '18%' }, alignEnd: false };
      case 3:
        return { className: 'top-14 right-6 items-end', point: { x: '86%', y: '18%' }, alignEnd: true };
      case 4:
        return { className: 'top-1/2 right-6 -translate-y-1/2 items-end', point: { x: '90%', y: '50%' }, alignEnd: true };
      case 5:
        return { className: 'bottom-14 right-6 items-end', point: { x: '86%', y: '82%' }, alignEnd: true };
      default:
        return { className: 'top-14 left-6 items-start', point: { x: '14%', y: '18%' }, alignEnd: false };
    }
  };
  const getCanonicalSlotPlacement = (slot: CanonicalSlot | null | undefined) => getCanonicalSlotGeometry(slot);
  const currentTurnPoint = currentTurnSlot !== null && currentTurnSlot !== undefined
    ? getCanonicalSlotGeometry(currentTurnSlot).point
    : null;

  // Identity latch: tracks the CURRENT expected roundId for incoming snapshots.
  const roundIdLatchRef = useRef<string>(roundId);

  // Reset ALL state when roundId changes (new hand boundary)
  useEffect(() => {
    // Update identity latch FIRST — stale handlers check this before accepting
    roundIdLatchRef.current = roundId;
    // Reset sync framework — clears stale presentation/authoritative/freeze
    ginSync.reset(null);
    // Reset local state
    setGinState(null);
    setIsProcessing(false);
    setLayOffSelectedCardIndex(null);
    // Reset overlay flags
    setShowKnockOverlay(false);
    setShowGinOverlay(false);
    prevPhaseRef.current = null;
    ginOverlayFiredRef.current = false;
    knockOverlayFiredRef.current = false;
    // Reset opponent draw animation
    setOpponentDrawTriggerId(null);
    prevLastActionRef.current = null;
    // Reset invariant tracking so stale-hand-render / result-render-mismatch
    // don't compare previous hand's values against the new hand
    ginInvariantHandRef.current = 0;
  }, [roundId]);

  // ── Sync invariant checks (fire on every viewState change) ─────
  const ginInvariantHandRef = useRef<number>(0);
  useEffect(() => {
    if (!viewState) return;
    const vsHand = viewState.handNumber ?? 0;
    // Skip invariant checks when viewState just got reset (hand 0 = bootstrap)
    if (vsHand === 0) return;

    // INV-4: regressive-hand-identity
    checkRegressiveHandIdentity(gameId, vsHand);

    // INV-1: stale-hand-render (compare presentation hand to prop handNumber)
    // Only fire when presentation has a real hand identity AND the prop has advanced
    if (vsHand > 0 && handNumber > 0) {
      checkStaleHandRender(gameId, vsHand, handNumber);
    }

    // INV-2: phase-render-mismatch
    const phase = viewState.phase;
    if (phase === 'scoring' || phase === 'complete') {
      checkPhaseRenderMismatch(gameId, vsHand, phase, 'result');
    } else if (phase === 'first_draw' || phase === 'playing' || phase === 'knocking' || phase === 'laying_off') {
      checkPhaseRenderMismatch(gameId, vsHand, phase, 'input');
    }

    // INV-3: result-render-mismatch (result display hand vs presentation hand)
    // Only compare when we have a previous result hand from the SAME round
    if (viewState.knockResult && ginInvariantHandRef.current > 0 && ginInvariantHandRef.current !== vsHand) {
      checkResultRenderMismatch(gameId, ginInvariantHandRef.current, vsHand);
    }
    if (viewState.knockResult) {
      ginInvariantHandRef.current = vsHand;
    }

    // Log result-display transition when entering scoring/complete with a knockResult
    if (viewState.knockResult && (phase === 'scoring' || phase === 'complete')) {
      logGinResultDisplay(
        gameId,
        vsHand,
        viewState.winnerPlayerId,
        viewState.knockResult.isGin,
        viewState.knockResult.isUndercut,
      );
    }
  }, [viewState, gameId, handNumber]);

  // Reset tracking when game changes
  useEffect(() => {
    resetGinRummyTracking(gameId);
    return () => resetGinRummyTracking(gameId);
  }, [gameId]);

  // Guards: only allow one overlay per round (prevents re-fire from polls/re-renders)
  const ginOverlayFiredRef = useRef(false);
  const knockOverlayFiredRef = useRef(false);

  // Play knock sound + show overlay when phase transitions to 'knocking'
  // Show gin overlay when knockResult indicates gin
  useEffect(() => {
    if (!ginState) return;
    const currentPhase = ginState.phase;
    if (currentPhase === 'knocking' && prevPhaseRef.current !== 'knocking' && !showKnockOverlay && !knockOverlayFiredRef.current) {
      console.log('[GIN] Phase → knocking, showing knock overlay');
      knockOverlayFiredRef.current = true;
      setTimeout(() => playKnock(), 100);
      setShowKnockOverlay(true);
    }
    // Detect gin: phase goes to scoring/complete with hasGin flag on a player
    const anyPlayerHasGin = ginState.playerStates && Object.values(ginState.playerStates).some(ps => ps.hasGin);
    if (
      (currentPhase === 'scoring' || currentPhase === 'complete') &&
      prevPhaseRef.current !== 'scoring' &&
      prevPhaseRef.current !== 'complete' &&
      !showGinOverlay &&
      !ginOverlayFiredRef.current &&
      (ginState.knockResult?.isGin || anyPlayerHasGin)
    ) {
      console.log('[GIN] GIN detected, showing gin overlay');
      ginOverlayFiredRef.current = true;
      setShowGinOverlay(true);
    }
    prevPhaseRef.current = currentPhase;
  }, [ginState?.phase, playKnock]);

  // Detect visible draw actions and trigger an overlay animation.
  // Do not freeze presentation here: observers must continue receiving turn/pile updates underneath.
  useEffect(() => {
    if (!viewState) return;
    const action = viewState.lastAction;
    if (!action) return;
    const actionKey = `${action.type}-${action.playerId}-${action.timestamp}`;
    if (actionKey === prevLastActionRef.current) return;
    prevLastActionRef.current = actionKey;

    // Seated players see opponent draws; observers see both players' draws.
    if (currentPlayerId && action.playerId === currentPlayerId) return;
    setOpponentDrawTargetSlot(playerSlotById.get(action.playerId) ?? null);
    if (action.type === 'draw_stock') {
      setOpponentDrawSource('stock');
      setOpponentDrawCard(null);
      setOpponentDrawTriggerId(`draw-${actionKey}`);
      setOpponentDrawKey(k => k + 1);
    } else if (action.type === 'draw_discard') {
      setOpponentDrawSource('discard');
      setOpponentDrawCard(action.card ?? null);
      setOpponentDrawTriggerId(`draw-${actionKey}`);
      setOpponentDrawKey(k => k + 1);
    }
  }, [viewState?.lastAction, currentPlayerId, playerSlotById]);

  // Load state from DB
  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      const startedAt = performance.now();
      console.log('[GIN_RUNTIME_TIMELINE] viewState hydration load:start', {
        gameId,
        roundId: roundId?.slice(0, 8),
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        handNumber,
      });
      const { data, error } = await supabase
        .from('rounds')
        .select('gin_rummy_state')
        .eq('id', roundId)
        .single();

      if (!error && data?.gin_rummy_state) {
        const state = data.gin_rummy_state as unknown as GinRummyState;
        const result = ginSync.receiveAuthoritativeUpdate(state);
        setGinState(state);
        console.log('[GIN_RUNTIME_TIMELINE] viewState hydration load:applied', {
          gameId,
          roundId: roundId?.slice(0, 8),
          elapsedMs: Math.round(performance.now() - startedAt),
          accepted: result.accepted,
          reason: result.reason,
          phase: state.phase,
          handNumber: state.handNumber ?? null,
        });
      } else {
        console.warn('[GIN_RUNTIME_TIMELINE] viewState hydration load:empty', {
          gameId,
          roundId: roundId?.slice(0, 8),
          elapsedMs: Math.round(performance.now() - startedAt),
          error: error?.message ?? null,
        });
      }
    };
    load();
  }, [roundId]);

  // Realtime subscription + aggressive polling fallback
  // Realtime silently drops large JSONB payloads — polling is the safety net for human vs human.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref for onGameComplete to avoid rebuilding the subscription on every parent re-render
  const onGameCompleteRef = useRef(onGameComplete);
  useEffect(() => { onGameCompleteRef.current = onGameComplete; }, [onGameComplete]);

  useEffect(() => {
    if (!roundId) return;
    let isActive = true;

    const applyState = (state: GinRummyState, source: string) => {
      if (!isActive) return;
      // ── Identity latch guard ──
      // If the roundId for this handler no longer matches the live latch,
      // this is a stale tail-end event from a previous subscription/poll cycle.
      if (roundIdLatchRef.current !== roundId) {
        logDebugEvent({
          gameId, roundId, userId: currentUserId, clientRole: 'actor',
          eventType: 'gin:identity_latch_drop',
          payload: ginStateSummary(state, {
            source,
            handlerRoundId: roundId?.slice(0, 8),
            latchRoundId: roundIdLatchRef.current?.slice(0, 8),
          }),
        });
        return;
      }
      logDebugEvent({
        gameId, roundId, userId: currentUserId, clientRole: 'actor',
        eventType: `gin:snapshot_received:${source}`,
        payload: ginStateSummary(state),
      });
      // Route ALL external updates through the sync framework's progress-vector gate.
      const result = ginSync.receiveAuthoritativeUpdate(state);
      logDebugEvent({
        gameId, roundId, userId: currentUserId, clientRole: 'actor',
        eventType: result.accepted ? 'gin:snapshot_accepted' : 'gin:snapshot_rejected',
        payload: ginStateSummary(state, {
          source,
          reason: result.reason,
          prevVector: result.previousProgress,
          incomingVector: result.incomingProgress,
          comparison: result.comparison,
        }),
      });
      if (result.accepted) {
        setGinState(state);
        if (state.phase === 'complete' && state.winnerPlayerId) {
          onGameCompleteRef.current();
        }
      }
    };

    // Primary: realtime subscription
    const channel = supabase
      .channel(`gin-rummy-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload) => {
          const newData = payload.new as { gin_rummy_state?: GinRummyState };
          if (newData.gin_rummy_state) {
            applyState(newData.gin_rummy_state, 'realtime');
          }
        }
      )
      .subscribe((status) => {
        console.log('[GIN-RUMMY] Realtime subscription status:', status);
      });

    // Fallback polling — unconditional, always applies fresh DB state.
    // Realtime silently drops large JSONB payloads; polling is the guaranteed fallback.
    const poll = async () => {
      if (!isActive) return;

      try {
        const { data } = await supabase
          .from('rounds')
          .select('gin_rummy_state')
          .eq('id', roundId)
          .maybeSingle();

        if (data?.gin_rummy_state && isActive) {
          applyState(data.gin_rummy_state as unknown as GinRummyState, 'poll');
        }
      } catch {
        // Silent fail
      }

      if (isActive) {
        pollTimerRef.current = setTimeout(poll, 1500);
      }
    };

    // First poll after a short delay, then every 1.5s
    pollTimerRef.current = setTimeout(poll, 800);

    return () => {
      isActive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [roundId]); // ← onGameComplete intentionally excluded; using ref instead

  // Hydration + RED unread reconciliation path.
  useEffect(() => {
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

  // ─── Bot Action Loop ────────────────────────────────────────────
  const botActionInProgress = useRef(false);

  useEffect(() => {
    if (!ginState || !currentPlayerId || isProcessing || botActionInProgress.current) return;
    // Writer-audit gate: do not let the bot loop write into a stale identity.
    if (isIdentityStaleRef.current || !interactionsAllowedRef.current) return;

    const currentTurnId = ginState.currentTurnPlayerId;
    if (!currentTurnId) return;

    const turnPlayer = players.find(p => p.id === currentTurnId);
    if (!turnPlayer?.is_bot) return;

    // Bot needs to act
    const runBotAction = async () => {
      if (botActionInProgress.current) return;
      botActionInProgress.current = true;

      try {
        // Add a human-like delay
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 600));

        // Re-fetch latest state to prevent stale-closure issues
        const { data } = await supabase
          .from('rounds')
          .select('gin_rummy_state')
          .eq('id', roundId)
          .single();

        if (!data?.gin_rummy_state) return;
        let state = data.gin_rummy_state as unknown as GinRummyState;

        // Phase guard: don't act during terminal or scoring phases
        if (['complete', 'scoring'].includes(state.phase)) {
          console.log(`[GIN-RUMMY BOT] Skipping — phase is ${state.phase}`);
          return;
        }

        // Verify it's still the bot's turn
        if (state.currentTurnPlayerId !== currentTurnId) return;

        const botId = currentTurnId;
        const botState = state.playerStates[botId];
        if (!botState) return;

        // Phase: first_draw
        if (state.phase === 'first_draw' && state.firstDrawOfferedTo === botId) {
          const upCard = state.discardPile[state.discardPile.length - 1];
          if (upCard && shouldBotTakeFirstDraw(botState.hand, upCard)) {
            state = takeFirstDrawCard(state, botId);
            // Write intermediate "draw" state so the opponent-draw animation fires
            const drawSnapshot = JSON.parse(JSON.stringify(state));
            await supabase
              .from('rounds')
              .update({ gin_rummy_state: drawSnapshot })
              .eq('id', roundId);
            setGinState(drawSnapshot);
            // Wait so the player can see the card-fly animation
            await new Promise(resolve => setTimeout(resolve, 1200));
            // Fall through to discard logic below (phase=playing, turnPhase=discard)
          } else {
            state = passFirstDraw(state, botId);
            // After pass, if turn moved to human, write and stop
            if (state.currentTurnPlayerId !== botId) {
              ginSync.applyOptimistic(state);
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
                .eq('id', roundId);
              setGinState(state);
              return;
            }
          }
        }
        // Phase: playing - draw (then fall through to discard after 1s delay)
        if (state.phase === 'playing' && state.turnPhase === 'draw') {
          const topDiscard = getDiscardTop(state);
          const source = botChooseDrawSource(botState.hand, topDiscard);
          if (source === 'discard' && topDiscard) {
            state = drawFromDiscard(state, botId);
          } else {
            state = drawFromStock(state, botId);
          }

          // Write draw state to DB so opponent sees the draw animation
          const drawSnapshot = JSON.parse(JSON.stringify(state));
          await supabase
            .from('rounds')
            .update({ gin_rummy_state: drawSnapshot })
            .eq('id', roundId);
          setGinState(drawSnapshot);

          // 1-second delay so opponent can see what the bot drew
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Re-read bot state after draw (hand changed)
          const updatedBotState = state.playerStates[botId];

          // Fall through to discard
          const drawnFromDiscard = state.drawSource === 'discard' && state.lastAction?.card
            ? state.lastAction.card
            : null;

          const knockDecision = botShouldKnock(updatedBotState.hand, drawnFromDiscard);

          if (knockDecision.shouldKnock) {
            const discardCardVal = updatedBotState.hand[knockDecision.discardIndex];
            state = declareKnock(state, botId, discardCardVal);
            if (state.phase === 'scoring') {
              // Gin! Write state first so gin overlay plays, then wait before scoring
              const ginSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: ginSnapshot })
                .eq('id', roundId);
              setGinState(ginSnapshot);
              await new Promise(resolve => setTimeout(resolve, 3500));
              state = scoreHand(state);
              // Write scored state and RETURN — do not fall through to generic write
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
                .eq('id', roundId);
              setGinState(state);
              return;
            } else if (state.phase === 'knocking') {
              // Knock! Write state so overlay plays, wait for it before tabling cards
              const knockSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: knockSnapshot })
                .eq('id', roundId);
              setGinState(knockSnapshot);
              await new Promise(resolve => setTimeout(resolve, 2800));
              // Don't return — fall through to generic write which tables the cards
            }
          } else {
            const discardIdx = knockDecision.discardIndex;
            const card = updatedBotState.hand[discardIdx];
            state = discardCard(state, botId, card);
          }
        }
        // Phase: playing - discard only (edge case: state loaded mid-discard)
        else if (state.phase === 'playing' && state.turnPhase === 'discard') {
          const drawnFromDiscard = state.drawSource === 'discard' && state.lastAction?.card
            ? state.lastAction.card
            : null;

          const knockDecision = botShouldKnock(botState.hand, drawnFromDiscard);

          if (knockDecision.shouldKnock) {
            const discardCardVal = botState.hand[knockDecision.discardIndex];
            state = declareKnock(state, botId, discardCardVal);
            if (state.phase === 'scoring') {
              // Gin! Write state first so gin overlay plays, then wait before scoring
              const ginSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: ginSnapshot })
                .eq('id', roundId);
              setGinState(ginSnapshot);
              await new Promise(resolve => setTimeout(resolve, 3500));
              state = scoreHand(state);
              // Write scored state and RETURN — do not fall through to generic write
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
                .eq('id', roundId);
              setGinState(state);
              return;
            } else if (state.phase === 'knocking') {
              // Knock! Write state so overlay plays, wait for it before tabling cards
              const knockSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: knockSnapshot })
                .eq('id', roundId);
              setGinState(knockSnapshot);
              await new Promise(resolve => setTimeout(resolve, 2800));
            }
          } else {
            const discardIdx = knockDecision.discardIndex;
            const card = botState.hand[discardIdx];
            state = discardCard(state, botId, card);
          }
        }
        // Phase: knocking/laying_off - bot is the non-knocker
        else if ((state.phase === 'knocking' || state.phase === 'laying_off')) {
          const knockerId = Object.entries(state.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
          if (knockerId && botId !== knockerId) {
            // Show bot's cards on felt first, then wait 3s before laying off
            await supabase
              .from('rounds')
              .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
              .eq('id', roundId);
            setGinState(state);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Lay off cards one at a time with 1.5s delay each so player can follow along
            const layOffs = botGetLayOffs(botState.hand, state.playerStates[knockerId].melds);
            for (const lo of layOffs) {
              try {
                state = layOffCard(state, botId, lo.card, lo.onMeldIndex);
                // Write intermediate state so viewer can see each lay-off
                await supabase
                  .from('rounds')
                  .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
                  .eq('id', roundId);
                setGinState(state);
                await new Promise(resolve => setTimeout(resolve, 1500));
              } catch {
                break; // Card may no longer be valid
              }
            }
            state = finishLayingOff(state, botId);
            if (state.phase === 'scoring') {
              state = scoreHand(state);
            }
          }
        }

        // Write updated state
        await supabase
          .from('rounds')
          .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
          .eq('id', roundId);

        setGinState(state);
      } catch (err) {
        console.error('[GIN-RUMMY BOT] Error:', err);
      } finally {
        botActionInProgress.current = false;
      }
    };

    const timeout = setTimeout(runBotAction, 300);
    return () => clearTimeout(timeout);
  }, [ginState, currentPlayerId, isProcessing, players, roundId]);
  // ─── Scoring Safety Net ────────────────────────────────────────
  // scoreHand is deterministic — both clients can independently compute the same result.
  // If the acting client's inline scoreHand (inside handleKnock) fails or its DB write
  // is lost, this effect ensures ANY client that sees 'scoring' phase auto-advances to 'complete'.
  const scoringAutoProgressRef = useRef(false);
  useEffect(() => {
    if (!ginState || ginState.phase !== 'scoring' || scoringAutoProgressRef.current) return;
    if (!roundId) return;

    // Short delay: give the acting client's inline scoreHand time to write 'complete' first.
    // If 'complete' arrives via realtime/poll within this window, this effect becomes a no-op.
    const timer = setTimeout(async () => {
      // Re-check: ginState may have advanced during the delay
      if (scoringAutoProgressRef.current) return;
      // Writer-audit gate: do not let the safety net write into a stale identity.
      if (isIdentityStaleRef.current) return;
      scoringAutoProgressRef.current = true;

      try {
        // Fetch fresh state from DB to avoid stale closures
        const { data } = await supabase
          .from('rounds')
          .select('gin_rummy_state')
          .eq('id', roundId)
          .single();

        const freshState = data?.gin_rummy_state as unknown as GinRummyState | null;
        if (!freshState || freshState.phase !== 'scoring') {
          // Already advanced past scoring — nothing to do
          scoringAutoProgressRef.current = false;
          return;
        }

        console.log('[GIN-RUMMY] Scoring safety-net: auto-advancing from scoring → complete');
        const completedState = scoreHand(freshState);
        const { error } = await supabase
          .from('rounds')
          .update({ gin_rummy_state: JSON.parse(JSON.stringify(completedState)) })
          .eq('id', roundId);

        if (!error) {
          setGinState(completedState);
        }
      } catch (err) {
        console.error('[GIN-RUMMY] Scoring safety-net error:', err);
      } finally {
        scoringAutoProgressRef.current = false;
      }
    }, 2000); // 2s grace period for the acting client's inline path

    return () => clearTimeout(timer);
  }, [ginState?.phase, roundId]);

  // Reset scoring guard when round changes (new hand)
  useEffect(() => {
    scoringAutoProgressRef.current = false;
  }, [roundId]);

  // ─── Hand Completion & Next Hand ──────────────────────────────
  const handCompletionInProgress = useRef(false);

  useEffect(() => {
    if (!ginState || ginState.phase !== 'complete' || handCompletionInProgress.current) return;
    if (!dealerGameId) return;

    handCompletionInProgress.current = true;

    const processCompletion = async () => {
      try {
        // Record hand result (history only, no chip transfer per-hand)
        if (ginState.knockResult) {
          await recordGinRummyHandResult(gameId, dealerGameId, handNumber, ginState);
        }

        // Check if match is won
        if (ginState.winnerPlayerId) {
          // Trigger chip transfer animation before ending the game
          if (!matchEndAnimatedRef.current) {
            matchEndAnimatedRef.current = true;
            // Compute player-to-player positions like cribbage
            const container = tableContainerRef.current;
            if (container) {
              const rect = container.getBoundingClientRect();
              const winnerId = ginState.winnerPlayerId;
              const loserId = winnerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
              const winnerPlayer = players.find(p => p.id === winnerId);
              const isWinnerCurrentPlayer = winnerPlayer?.user_id === currentUserId;

              const winnerPos = isWinnerCurrentPlayer
                ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
                : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };
              const loserPos = isWinnerCurrentPlayer
                ? { playerId: loserId, x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 }
                : { playerId: loserId, x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 };

              setChipAnimAmount(anteAmount);
              setStoredChipPositions({ winner: winnerPos, losers: [loserPos] });
              setChipAnimTriggerId(`gin-win-${roundId}-${Date.now()}`);
            }
            // Wait for animation to play
            await new Promise(resolve => setTimeout(resolve, 4500));
          }
          await endGinRummyGame(gameId, roundId, ginState);
          onGameComplete();
          return;
        }

        // Start next hand after a delay (longer for gin so players can read cards)
        const isGin = ginState.knockResult?.isGin;
        const delay = !ginState.knockResult ? 1500 : isGin ? 5000 : 3000;
        await new Promise(resolve => setTimeout(resolve, delay));
        const result = await startNextGinRummyHand(gameId, dealerGameId, ginState);
        if (result.success) {
          console.log('[GIN-RUMMY] Next hand started:', result.handNumber);
        }
      } catch (err) {
        console.error('[GIN-RUMMY] Hand completion error:', err);
      } finally {
        handCompletionInProgress.current = false;
      }
    };

    processCompletion();
  }, [ginState?.phase, ginState?.winnerPlayerId]);

  const updateState = async (newState: GinRummyState, traceId?: string) => {
    // Writer-audit gate: refuse to write if the framework says we cannot interact
    // (frozen / visual contract active / identity stale). Prevents stale local
    // action paths from clobbering the new round after a peer advanced the hand.
    if (isIdentityStaleRef.current || !interactionsAllowedRef.current) {
      persistSyncDebugEvent({
        gameId, gameType: 'gin-rummy',
        handNumber: currentHandNumber ?? null,
        roundId: currentRoundId ?? null,
        eventType: 'transition', severity: 'warn',
        eventName: 'gin-writer-suppressed-stale-identity',
        payload: {
          traceId,
          isIdentityStale: isIdentityStaleRef.current,
          interactionsAllowed: interactionsAllowedRef.current,
        },
      });
      return;
    }
    setIsProcessing(true);
    logDebugEvent({
      gameId, roundId, userId: currentUserId, clientRole: 'actor',
      eventType: 'gin:optimistic_applied', traceId,
      payload: ginStateSummary(newState),
    });
    // Apply optimistic override — sync framework will reject stale realtime/poll updates
    ginSync.applyOptimistic(newState);
    // Set local state immediately to prevent stale card flash
    setGinState(newState);
    try {
      logDebugEvent({
        gameId, roundId, userId: currentUserId, clientRole: 'actor',
        eventType: 'gin:db_write_start', traceId,
        payload: ginStateSummary(newState),
      });
      const { error } = await supabase
        .from('rounds')
        .update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);
      if (error) throw error;
      logDebugEvent({
        gameId, roundId, userId: currentUserId, clientRole: 'actor',
        eventType: 'gin:db_write_success', traceId,
        payload: ginStateSummary(newState),
      });
      // DB write succeeded — promote to authoritative
      ginSync.receiveAuthoritativeUpdate(newState);
    } catch (err) {
      logDebugEvent({
        gameId, roundId, userId: currentUserId, clientRole: 'actor',
        eventType: 'gin:db_write_failure', traceId,
        payload: ginStateSummary(newState, { error: String(err) }),
      });
      console.error('[GIN-RUMMY] Error updating state:', err);
      toast.error('Failed to update game state');
      // On error, clear optimistic so polls can recover to real state
      ginSync.clearOptimistic();
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch fresh state from DB to avoid stale closures in multiplayer
  const fetchFreshState = async (): Promise<GinRummyState | null> => {
    const { data } = await supabase
      .from('rounds')
      .select('gin_rummy_state')
      .eq('id', roundId)
      .single();
    return data?.gin_rummy_state as unknown as GinRummyState | null;
  };

  // Action handlers
  const handleDrawStock = async () => {
    const tid = newTraceId();
    logDebugEvent({
      gameId, roundId, userId: currentUserId, clientRole: 'actor',
      eventType: 'gin:input:draw_stock', traceId: tid,
      payload: ginStateSummary(ginState, { isProcessing, hasPlayer: !!currentPlayerId }),
    });
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = drawFromStock(ginState, currentPlayerId);
      await updateState(newState, tid);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDrawDiscard = async () => {
    const tid = newTraceId();
    logDebugEvent({
      gameId, roundId, userId: currentUserId, clientRole: 'actor',
      eventType: 'gin:input:draw_discard', traceId: tid,
      payload: ginStateSummary(ginState, { isProcessing, hasPlayer: !!currentPlayerId }),
    });
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = drawFromDiscard(ginState, currentPlayerId);
      await updateState(newState, tid);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDiscard = async (index: number) => {
    const tid = newTraceId();
    logDebugEvent({
      gameId, roundId, userId: currentUserId, clientRole: 'actor',
      eventType: 'gin:input:discard', traceId: tid,
      payload: ginStateSummary(ginState, { isProcessing, cardIndex: index }),
    });
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[index];
    if (!card) return;
    try {
      const newState = discardCard(ginState, currentPlayerId, card);
      await updateState(newState, tid);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleKnock = async (index: number) => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[index];
    if (!card) return;
    try {
      let newState = declareKnock(ginState, currentPlayerId, card);
      if (newState.phase === 'scoring') {
        // Gin! Show overlay FIRST locally, write to DB for opponent, then delay before tabling
        ginOverlayFiredRef.current = true;
        setShowGinOverlay(true);
        // Write scoring state to DB so opponent sees gin phase and gets overlay too
        await supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        ginSync.applyOptimistic(newState);
        setGinState(newState);
        await new Promise(resolve => setTimeout(resolve, 3500));
        // Transition scoring → complete in one shot (no redundant scoring write)
        newState = scoreHand(newState);
      } else if (newState.phase === 'knocking') {
        // Knock! Show overlay FIRST locally, write to DB for opponent, then delay before tabling
        setTimeout(() => playKnock(), 100);
        knockOverlayFiredRef.current = true;
        setShowKnockOverlay(true);
        // Write knocking state to DB so opponent sees overlay too
        await supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        ginSync.applyOptimistic(newState);
        setGinState(newState);
        await new Promise(resolve => setTimeout(resolve, 2800));
      }
      // Single authoritative DB write of the final state (complete or post-knock tabling)
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleTakeFirstDraw = async () => {
    if (!currentPlayerId || isProcessing) return;
    try {
      // Fetch fresh state from DB to prevent stale closure issues in multiplayer
      const fresh = await fetchFreshState();
      if (!fresh || fresh.phase !== 'first_draw' || fresh.firstDrawOfferedTo !== currentPlayerId) return;
      const newState = takeFirstDrawCard(fresh, currentPlayerId);
      // Longer optimistic guard — we're transitioning to discard phase, no bot race
      // Optimistic guard handled by updateState → ginSync.applyOptimistic
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePassFirstDraw = async () => {
    if (!currentPlayerId || isProcessing) return;
    try {
      // Fetch fresh state from DB to prevent stale closure issues in multiplayer
      const fresh = await fetchFreshState();
      if (!fresh || fresh.phase !== 'first_draw' || fresh.firstDrawOfferedTo !== currentPlayerId) return;
      const newState = passFirstDraw(fresh, currentPlayerId);
      // Longer optimistic guard — bot needs 1-2s to decide after our pass
      // Optimistic guard handled by updateState → ginSync.applyOptimistic
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleLayOff = async (cardIndex: number, meldIndex: number) => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[cardIndex];
    if (!card) return;
    try {
      const newState = layOffCard(ginState, currentPlayerId, card, meldIndex);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleFinishLayingOff = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      let newState = finishLayingOff(ginState, currentPlayerId);
      if (newState.phase === 'scoring') {
        newState = scoreHand(newState);
      }
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return '';
    return getDisplayName(players, player, player.profiles?.username || 'Player');
  };

  const isCribDealer = (playerId: string | undefined) => {
    if (!viewState || !playerId) return false;
    return viewState.dealerPlayerId === playerId;
  };

  // P9.6: pre-viewState rendering — Gin owns the single authoritative
  // table geometry. Render the same layout shell (felt only, no
  // gameplay content) so there is exactly one canonical felt surface
  // mounted continuously from slot mount through first viewState. Do
  // NOT reintroduce lifecycle messaging or a separate pre-hand UI
  // surface; gameplay children are simply gated off until viewState
  // arrives.
  if (!viewState) {
    return (
      <div className="h-full flex flex-col">
        <div
          ref={tableContainerRef}
          className="flex-1 relative overflow-hidden min-h-0"
          style={{ maxHeight: '55vh' }}
        >
          <CanonicalFeltSurface
            gameKind="gin-rummy"
            anteAmount={anteAmount}
            isWaitingPhase={false}
          />
        </div>
      </div>
    );
  }


  const opponentState = viewState.playerStates[opponentId];

  return (
    <div className="h-full flex flex-col">
      {/* Felt Area - Upper Section with canonical oval table */}
      <div
        ref={tableContainerRef}
        className="flex-1 relative overflow-hidden min-h-0"
        style={{
          maxHeight: '55vh',
        }}
      >
            {/* P9.6: single authoritative canonical felt surface. */}
            <CanonicalFeltSurface
              gameKind="gin-rummy"
              anteAmount={anteAmount}
              pointsToWin={viewState.pointsToWin}
              isWaitingPhase={false}
            />


            {/* Felt Content */}
            <GinRummyFeltContent
              ginState={viewState}
              currentPlayerId={currentPlayerId}
              opponentId={opponentId}
              currentTurnSlot={currentTurnSlot}
              currentTurnPoint={currentTurnPoint}
              getPlayerUsername={getPlayerUsername}
              cardBackColors={cardBackColors}
              onDrawStock={handleDrawStock}
              onDrawDiscard={viewState.phase === 'first_draw' ? handleTakeFirstDraw : handleDrawDiscard}
              isProcessing={isProcessing}
            />

            {/* Opponent Draw Animation */}
            <GinRummyOpponentDrawAnimation
              key={opponentDrawKey}
              triggerId={opponentDrawTriggerId}
              drawSource={opponentDrawSource}
              card={opponentDrawCard}
              cardBackColors={cardBackColors}
              targetSlot={opponentDrawTargetSlot}
              targetPoint={opponentDrawTargetSlot !== null ? getCanonicalSlotGeometry(opponentDrawTargetSlot).point : null}
            />

            {/* Knock/Gin Felt Display — shows only the OPPONENT's cards on the felt */}
            {(viewState.phase === 'knocking' || viewState.phase === 'laying_off' || viewState.phase === 'scoring' || (viewState.phase === 'complete' && !!viewState.knockResult)) && (
              <GinRummyKnockDisplay
                ginState={viewState}
                getPlayerUsername={getPlayerUsername}
                currentPlayerId={currentPlayerId}
                layOffSelectedCardIndex={layOffSelectedCardIndex}
                onLayOffToMeld={(meldIndex) => {
                  if (layOffSelectedCardIndex !== null) {
                    handleLayOff(layOffSelectedCardIndex, meldIndex);
                    setLayOffSelectedCardIndex(null);
                  }
                }}
                isProcessing={isProcessing}
              />
            )}

            {/* Knock Overlay — shown to all clients */}
            {showKnockOverlay && (() => {
              const knockerEntry = Object.entries(viewState.playerStates).find(([, ps]) => ps.hasKnocked);
              if (!knockerEntry) return null;
              const [knockerId, knockerState] = knockerEntry;
              return (
                <GinRummyKnockOverlay
                  knockerName={getPlayerUsername(knockerId)}
                  deadwood={knockerState.deadwoodValue}
                  onComplete={() => setShowKnockOverlay(false)}
                />
              );
            })()}

            {/* Gin Overlay — cool blue with record scratch */}
            {showGinOverlay && (() => {
              const ginnerEntry = Object.entries(viewState.playerStates).find(([, ps]) => ps.hasGin);
              const winnerId = ginnerEntry?.[0]
                || viewState.knockResult?.winnerId
                || (viewState.lastAction?.type === 'gin' ? viewState.lastAction.playerId : '')
                || viewState.currentTurnPlayerId
                || '';
              return (
                <GinRummyGinOverlay
                  winnerName={getPlayerUsername(winnerId)}
                  onComplete={() => setShowGinOverlay(false)}
                />
              );
            })()}

            {/* Match Winner Celebration */}
            {viewState.phase === 'complete' && viewState.winnerPlayerId && (
              <GinRummyMatchWinner
                ginState={viewState}
                getPlayerUsername={getPlayerUsername}
              />
            )}

            {/* Player-to-player chip transfer animation at match end */}
            {storedChipPositions && (
              <CribbageChipTransferAnimation
                triggerId={chipAnimTriggerId}
                amount={chipAnimAmount}
                winnerPosition={storedChipPositions.winner}
                loserPositions={storedChipPositions.losers}
              />
            )}

            {/* Dealer button at bottom - only if current player is dealer */}
            {isCribDealer(currentPlayerId) && viewState.phase === 'playing' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-[10px]">D</span>
                </div>
              </div>
            )}

            {/* Opponent overlay */}
          <div className="absolute inset-0 z-50 pointer-events-none">
            {viewState && (isObserver ? observerSeatIds : [opponentId]).map((seatId) => {
              const seatPlayer = players.find(p => p.id === seatId);
              const seatState = viewState.playerStates[seatId];
              if (!seatPlayer || !seatState) return null;
              const placement = getCanonicalSlotPlacement(playerSlotById.get(seatId));
              return (
              <div key={seatId} className={cn(
                "absolute flex flex-col items-start",
                placement.className
              )}>
                {/* Opponent name above chip stack */}
                <span className="text-[10px] text-white/95 truncate max-w-[90px] font-medium bg-black/50 rounded px-1 mb-0.5">
                  {getDisplayName(players, seatPlayer, seatPlayer.profiles?.username || 'Player')}
                </span>

                {/* Chip circle */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40 bg-white">
                  <span className="text-[10px] font-bold text-slate-900">
                    ${formatChipValue(seatPlayer.chips)}
                  </span>
                </div>

                {/* Dealer button below chip stack */}
                {isCribDealer(seatId) && (
                  <div className="w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center mt-0.5">
                    <span className="text-white font-bold text-[7px]">D</span>
                  </div>
                )}
              </div>
              );
            })}

                {/* Opponent's cards (face down) - hide during knock/scoring/complete when melds are shown */}
                {opponent && opponentState && opponentState.hand.length > 0 && viewState.phase !== 'knocking' && viewState.phase !== 'laying_off' && viewState.phase !== 'scoring' && !(viewState.phase === 'complete' && viewState.knockResult) && (() => {
                  const placement = getCanonicalSlotPlacement(playerSlotById.get(opponentId));
                  return (
                  <div className={cn("absolute mt-[58px] flex -space-x-3", placement.className)}>
                    {opponentState.hand.map((_, i) => (
                      <div
                        key={i}
                        className="w-3.5 h-5 rounded-sm border border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                        }}
                      />
                    ))}
                  </div>
                  );
                })()}
          </div>
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Dealer Announcements Area */}
        <div className="h-[36px] shrink-0 flex items-center justify-center px-3">
          {(() => {
            if (viewState.phase === 'complete' && viewState.knockResult) {
              const r = viewState.knockResult;
              const dwDiff = Math.abs(r.opponentDeadwood - r.knockerDeadwood);
              const bonus = r.isGin ? ` (${dwDiff} dw + 25 gin bonus)` :
                            r.isUndercut ? ` (${dwDiff} dw + 25 undercut bonus)` :
                            '';
              return (
                <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                  <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                    {getPlayerUsername(r.winnerId)} +{r.pointsAwarded}{bonus}
                  </p>
                </div>
              );
            }

            if (viewState.phase === 'complete' && !viewState.knockResult) {
              return (
                <div className="w-full bg-muted/80 backdrop-blur-sm rounded-md px-3 py-1.5">
                  <p className="text-muted-foreground font-bold text-[11px] text-center">
                    Void Hand — Stock Exhausted
                  </p>
                </div>
              );
            }

            if (viewState.phase === 'knocking' || viewState.phase === 'laying_off') {
              const knockerId = Object.entries(viewState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
              if (knockerId) {
                const knockerState = viewState.playerStates[knockerId];
                const dwText = knockerState?.hasGin ? '' : ` (${knockerState?.deadwoodValue ?? 0} dw)`;
                return (
                  <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                    <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                      {getPlayerUsername(knockerId)} {knockerState?.hasGin ? 'has GIN! 🎉' : `knocked!${dwText}`}
                    </p>
                  </div>
                );
              }
            }

            return null;
          })()}
        </div>

        {/* Tab navigation bar */}
        <div className="flex items-center justify-center gap-1 px-3 py-1 border-b border-border/50">
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
          <button
            onClick={handleOpenChatTab}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'chat'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            } ${showGreenChatIndicator ? 'animate-pulse' : ''}`}
          >
            <MessageSquare className={`w-5 h-5 ${showGreenChatIndicator ? 'text-green-500 fill-green-500 animate-pulse' : ''} ${showRedChatIndicator ? 'text-red-500 fill-red-500' : ''}`} />
          </button>
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
          {activeTab === 'cards' && currentPlayer && (
            <GinRummyMobileCardsTab
              ginState={viewState}
              currentPlayerId={currentPlayerId}
              isProcessing={isProcessing}
              onDrawStock={handleDrawStock}
              onDrawDiscard={handleDrawDiscard}
              onDiscard={handleDiscard}
              onKnock={handleKnock}
              onTakeFirstDraw={handleTakeFirstDraw}
              onPassFirstDraw={handlePassFirstDraw}
              onLayOff={handleLayOff}
              onFinishLayingOff={() => {
                setLayOffSelectedCardIndex(null);
                handleFinishLayingOff();
              }}
              onLayOffCardSelected={setLayOffSelectedCardIndex}
              currentPlayer={currentPlayer}
              gameId={gameId}
            />
          )}

          {/* Observer fallback for cards tab — canonical observer HUD message */}
          {activeTab === 'cards' && !currentPlayer && (
            <div className="px-4 py-6 flex-1">
              <p className="text-muted-foreground text-sm text-center">
                You are observing this game
              </p>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="h-full p-2">
              <MobileChatPanel
                messages={allMessages}
                onSend={sendMessage}
                isSending={isChatSending}
                currentUserId={currentUserId}
              />
            </div>
          )}

          {activeTab === 'lobby' && (
            <div className="p-4 space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span className="text-sm">{getDisplayName(players, player, player.profiles?.username || 'Player')}</span>
                  <span className="text-sm text-poker-gold">${formatChipValue(player.chips)}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <HandHistory
              gameId={gameId}
              currentUserId={currentUserId}
              currentPlayerId={currentPlayerId}
              gameType="gin-rummy"
            />
          )}
        </div>
      </div>
    </div>
  );
};
