/**
 * YahtzeeGameTable – mirrors MobileGameTable's visual layout for dice games.
 *
 * Uses the same oval felt with Peoria bridge background, chip stacks around the table,
 * tab bar, timer, and bottom section structure as MobileGameTable does for Horses/SCC.
 */

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { toast } from 'sonner';
import { readPersistedMatchChatTab, writePersistedMatchChatTab } from "@/lib/matchChatTabPersistence";
import { useGameStateSync, getYahtzeeProgress } from "@/lib/gameStateSync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { HorsesDie } from "./HorsesDie";
import { useDieRowLayout } from "@/lib/canonicalShell/useDieRowLayout";
import { DiceTableLayout } from "./DiceTableLayout";
import { AssignedRectFitter } from "@/lib/wave5GameplayGeometry/AssignedRectPx";
import { DiceTraceControl } from "./DiceTraceControl";
// eslint-disable-next-line no-restricted-imports -- P0 migration: move to shell-owned presentation.chipTransfer (plan step 3d)
import { ChipTransferAnimation } from "./ChipTransferAnimation";
import { useChipTransferPresentationAdmission } from "@/lib/canonicalShell/ChipTransportProvider";
import type { ChipPresentationBatch } from "@/lib/canonicalShell/ChipPresentationLedger";
import confetti from "canvas-confetti";
import { MusicToggleButton } from "./MusicToggleButton";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { YahtzeeRollOverlay, UpperBonusOverlay, YahtzeeBonusOverlay } from "./YahtzeeOverlays";
import {
  YahtzeeState, YahtzeeCategory, CATEGORY_LABELS,
  UPPER_CATEGORIES, LOWER_CATEGORIES, YahtzeeDie, YahtzeePlayerState,
  UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE,
} from "@/lib/yahtzeeTypes";
import { CATEGORY_FULL_NAMES } from "@/lib/yahtzeeTypes";
import { calculateCategoryScore } from "@/lib/yahtzeeScoring";
import { getPotentialScores, getTotalScore, isYahtzee, getUpperBonusProgress, hasUpperBonus, getJokerValidCategories, getJokerScore } from "@/lib/yahtzeeScoring";
import { applyYahtzeeAction, applyYahtzeeAutoRollAction, setYahtzeeHolds } from "@/lib/yahtzeeAuthority";
import { isYahtzeeManualTurnOpen } from "@/lib/yahtzeeManualTurnAdmission";
import {
  buildDieTuples,
  isYahtzeeHeldTraceEnabled,
  runYahtzeeHeldDiagnostic,
  traceYahtzeeHeldDie,
} from "@/lib/yahtzeeHeldDieTrace";
import {
  createYahtzeeScoreAnnouncement,
  createYahtzeeTurnAnnouncement,
  isYahtzeeScorePresentationSuperseded,
  resolveYahtzeeRemoteScorePresentation,
  YAHTZEE_SCORE_PRESENTATION_MS,
  yahtzeeScoreAnnouncementId,
} from "@/lib/yahtzeePresentation";
import {
  getBotHoldDecision, getBotCategoryChoice, shouldBotStopRolling,
} from "@/lib/yahtzeeBotLogic";
import {
  getDebugStraightHoldDecision, getDebugStraightCategoryChoice, shouldDebugStraightStopRolling,
} from "@/lib/yahtzeeBotDebugStraight";
import { isYahtzeeStraightDebugEnabled } from "@/lib/debugFlags";
import { supabase } from "@/integrations/supabase/client";
import { recordGameFreezeTrace } from "@/lib/gameFreezeTrace";
import { getBotAlias } from "@/lib/botAlias";
import { cn } from "@/lib/utils";
import { formatChipBalance } from "@/lib/canonicalShell/chipBalanceFormat";
import { RotateCcw, MessageSquare, User, Check, Ban } from "lucide-react";
import { settleYahtzeeGame } from "@/lib/yahtzeeSettleGame";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { HandHistory } from "./HandHistory";
import { MobileChatPanel } from "./MobileChatPanel";
import { useGameChatContext } from "@/hooks/GameChatContext";
import { useChatAttention, useChatIconStyleGuard, chatAttentionToShellTabProps } from "@/hooks/ChatAttention";
import { recordChatDeliveryEvent } from "@/lib/chatDelivery/chatDeliveryLedger";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";
// Shell owns canonical felt — no local canonical felt import.
import { useShellFeltContext, usePublishShellFelt } from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { useShellTabBar } from "@/lib/canonicalShell/ShellTabBar";
import { useAuthoritativeActionSurfaceGuard } from "@/lib/actionSurfaceRecovery";
import { ShellHudGrid } from "@/lib/canonicalShell/ShellHudGrid";
import { ShellTimerRail, useShellTimer } from "@/lib/canonicalShell/ShellTimerRail";
import { useAnnouncementContext, useAnnouncements } from "@/lib/canonicalShell/announcements";
import { recordAnnouncementDebugEvent } from "@/lib/canonicalShell/announcements/announcementDebugLog";
import { useRequiredSeatAnchors } from "@/lib/canonicalShell/SeatAnchorLayer";
import {
  ActionStripSlot,
  ActionStripButtonRow,
  ActionStripBadge,
  ActionStripStatusPill,
} from "@/components/canonicalShell/actionStrip";
import { GameplayOpponentSeatLayer } from "@/lib/canonicalShell/GameplayOpponentSeatLayer";
import { PresentationChipBalance } from "@/lib/canonicalShell/PresentationChipBalance";
import { usePreSessionSeatOwned } from "@/lib/canonicalShell/PreSessionSeatLayer";

import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";
import { YahtzeeGameplayGeometryProvider } from "@/lib/wave5GameplayGeometry/YahtzeeGameplayGeometryProvider";
import { YahtzeeAnchoredSlot } from "@/components/YahtzeeAnchoredSlot";
import { YahtzeeAnchoredInteractionSlot } from "@/components/YahtzeeAnchoredInteractionSlot";
import { dealerAffordanceStore } from "@/lib/canonicalShell/extraDebugStore";

// Wave 2E: discrete die size ladder (must match HorsesDie sizeClasses).
// The resolver returns a fluid die edge in px; we snap to the nearest bucket
// so the rendered die uses the existing token-based Tailwind classes.
const DIE_SIZE_LADDER = [
  { px: 28, size: "xs" as const },
  { px: 36, size: "sm" as const },
  { px: 48, size: "md" as const },
  { px: 72, size: "lg" as const },
  { px: 96, size: "xl" as const },
];
function snapToDieSize(px: number): "xs" | "sm" | "md" | "lg" | "xl" {
  let best = DIE_SIZE_LADDER[0];
  let bestDist = Math.abs(px - best.px);
  for (let i = 1; i < DIE_SIZE_LADDER.length; i++) {
    const d = Math.abs(px - DIE_SIZE_LADDER[i].px);
    if (d < bestDist) {
      best = DIE_SIZE_LADDER[i];
      bestDist = d;
    }
  }
  return best.size;
}

// Shell-owned felt is the sole canonical mount — no local visual flag.


/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot: boolean;
  auto_fold?: boolean;
  sitting_out: boolean;
  profiles?: { username: string };
}

interface YahtzeeGameTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  dealerGameId: string | null;
  handNumber: number | null;
  yahtzeeState: YahtzeeState | null;
  isRealMoney: boolean;
  isPaused: boolean;
  decisionTimerSeconds: number;
  onRefetch: () => void;
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
  onAutoFoldChange?: (playerId: string, autoFold: boolean) => void;
  onTerminalPresentationActiveChange?: (active: boolean) => void;
  onTerminalPresentationComplete?: (terminalIdentity: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toHorsesDice(dice: YahtzeeDie[]): HorsesDieType[] {
  return dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
}

function describeBotDiceState(dice: YahtzeeDie[] | null | undefined) {
  return (dice ?? []).map((die, index) => ({
    index,
    value: die?.value,
    isHeld: die?.isHeld,
  }));
}

function isValidBotHoldArray(holds: unknown): holds is boolean[] {
  return Array.isArray(holds)
    && holds.length === 5
    && holds.every((hold) => typeof hold === 'boolean');
}

function describeYahtzeeSnapshot(state: YahtzeeState | null | undefined) {
  if (!state) return null;

  let totalCategoriesFilled = 0;
  for (const ps of Object.values(state.playerStates || {})) {
    totalCategoriesFilled += Object.keys(ps.scorecard.scores).length;
  }

  const currentTurnIdx = state.currentTurnPlayerId
    ? state.turnOrder.indexOf(state.currentTurnPlayerId)
    : -1;
  const incompletePlayers = (state.turnOrder || [])
    .map((playerId) => state.playerStates?.[playerId])
    .filter((ps): ps is NonNullable<typeof ps> => Boolean(ps) && !ps.isComplete);
  const minFilledAmongIncomplete = incompletePlayers.length > 0
    ? Math.min(...incompletePlayers.map((ps) => Object.keys(ps.scorecard.scores).length))
    : null;
  const currentPs = state.currentTurnPlayerId ? state.playerStates[state.currentTurnPlayerId] : null;
  const currentTurnFilled = currentPs ? Object.keys(currentPs.scorecard.scores).length : null;
  const handoffPhase = (
    minFilledAmongIncomplete !== null
    && currentTurnFilled !== null
    && currentTurnFilled === minFilledAmongIncomplete
  ) ? 1 : 0;

  return {
    phase: state.gamePhase,
    currentTurnPlayerId: state.currentTurnPlayerId,
    totalCategoriesFilled,
    currentTurnIdx,
    minFilledAmongIncomplete,
    currentTurnFilled,
    handoffPhase,
    rollsUsed: currentPs ? (3 - currentPs.rollsRemaining) : 0,
    rollsRemaining: currentPs?.rollsRemaining ?? null,
  };
}

// Custom dice icon matching MobileGameTable
const DiceIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor" strokeWidth="0">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="12" cy="12" r="1.5" fill="white" />
    <circle cx="7.5" cy="16.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="16.5" r="1.5" fill="white" />
  </svg>
);

function holdMasksEqual(left: readonly boolean[], right: readonly boolean[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function YahtzeeGameTable({
  gameId, players, currentUserId, pot, anteAmount, dealerPosition,
  currentRoundId, dealerGameId, handNumber, yahtzeeState, isRealMoney, isPaused,
  decisionTimerSeconds, onRefetch,
  isHost = false, onPlayerClick, onAutoFoldChange, onTerminalPresentationActiveChange,
  onTerminalPresentationComplete,
}: YahtzeeGameTableProps) {
  // SHELL LC: mount marker for comparative branch-swap evidence.
  useLifecycleMount('YahtzeeGameTable');


  // Publish canonical felt context to the shell-owned host. The shell
  // is the sole canonical felt mount; there is no local felt branch.
  usePublishShellFelt({
    gameKind: 'yahtzee',
    anteAmount,
    isWaitingPhase: false,
    feltPlateMode: 'GAME',
    publisherLabel: 'YahtzeeGameTable',
  });

  // DEALER AFFORDANCE DBG — Yahtzee has no dealer concept.
  useEffect(() => {
    dealerAffordanceStore.record({
      game: 'yahtzee',
      identityDealerVisible: false,
      seatDealerVisible: false,
      legacyDealerVisible: false,
      callerId: currentUserId ? currentUserId.slice(0, 8) : null,
      dealerId: dealerPosition != null ? `pos:${dealerPosition}` : null,
    });
  }, [currentUserId, dealerPosition]);


  // Canonical shared chat — same shell experience as Cribbage/Gin.
  const { allMessages, sendMessage, isSending: isChatSending } = useGameChatContext();



  // ── Identity wiring (framework cutover) ────────────────────────
  // Yahtzee plays one round per match, so `currentRoundId` is the natural
  // identity discriminator across matches. A monotonic round-ord counter
  // is used to stamp incoming snapshots so the progress comparator can
  // strictly dominate stale prior-match terminal snapshots on the leftmost
  // dim — same defect-class mitigation as the Horses handNumber stamp.
  const roundOrdMapRef = useRef<Map<string, number>>(new Map());
  const roundOrdCounterRef = useRef(0);
  const getRoundOrd = useCallback((roundId: string | null | undefined): number => {
    if (!roundId) return 0;
    const existing = roundOrdMapRef.current.get(roundId);
    if (existing !== undefined) return existing;
    roundOrdCounterRef.current += 1;
    roundOrdMapRef.current.set(roundId, roundOrdCounterRef.current);
    return roundOrdCounterRef.current;
  }, []);

  // ── Shared anti-regression sync framework ──────────────────────
  const yahtzeeSync = useGameStateSync<YahtzeeState>(
    yahtzeeState ?? ({
      currentTurnPlayerId: null,
      playerStates: {},
      gamePhase: 'waiting',
      turnOrder: [],
      currentRound: 0,
    } as YahtzeeState),
    {
      getProgress: getYahtzeeProgress,
      optimisticTimeoutMs: 3000,
      debugLabel: 'yahtzee',
      describeState: describeYahtzeeSnapshot,
      // Identity advances on dealerGame/round transitions; the framework
      // will hard-reset authRef back to initialState so a fresh next-match
      // snapshot does not collide with stale prior-match progress.
      identity: {
        dealerGameId: dealerGameId ?? null,
        handNumber: getRoundOrd(currentRoundId),
        roundId: currentRoundId ?? null,
      },
    },
  );

  // Feed incoming prop updates through the anti-regression gate.
  // Stamp __syncRound from the monotonic round ord so cross-match transitions
  // cannot be canceled by closure-captured "latest" values.
  useEffect(() => {
    if (yahtzeeState) {
      const stamped = {
        ...yahtzeeState,
        __syncRound: getRoundOrd(currentRoundId),
      } as YahtzeeState & { __syncRound: number };

      console.log('[YAHTZEE_SYNC] Incoming authoritative snapshot', describeYahtzeeSnapshot(yahtzeeState));
      const result = yahtzeeSync.receiveAuthoritativeUpdate(stamped);

      // Framework diagnostic — mirrors horses-auth-turn-handoff-received
      import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
        persistSyncDebugEvent({
          gameId,
          gameType: 'yahtzee',
          handNumber: yahtzeeState.currentRound ?? 0,
          roundId: currentRoundId ?? null,
          eventType: 'sync-gate',
          severity: result.accepted ? 'info' : 'warn',
          eventName: 'yahtzee-auth-turn-handoff-received',
          payload: {
            accepted: result.accepted,
            reason: result.reason,
            comparison: result.comparison,
            stampedRound: stamped.__syncRound,
            beforeTurn: (result.presentationBefore as YahtzeeState | null)?.currentTurnPlayerId ?? null,
            afterTurn: yahtzeeState.currentTurnPlayerId ?? null,
            beforeProgress: result.previousProgress,
            incomingProgress: result.incomingProgress,
          },
        });
      }).catch(() => { /* safe */ });

      // ── HELD-DIE TRACE: Authoritative update accepted ──
      if (yahtzeeState.currentTurnPlayerId) {
        const turnPs = yahtzeeState.playerStates[yahtzeeState.currentTurnPlayerId];
        if (turnPs?.dice?.length) {
          void runYahtzeeHeldDiagnostic(() => {
            if (!isYahtzeeHeldTraceEnabled()) return;
            const dice = turnPs.dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
            traceYahtzeeHeldDie({
              gameId,
              dealerGameId: dealerGameId ?? null,
              roundId: currentRoundId ?? null,
              handNumber: yahtzeeState.currentRound ?? 0,
              turnPlayerId: yahtzeeState.currentTurnPlayerId,
              rollNumber: 3 - turnPs.rollsRemaining,
              rollGeneration: turnPs.rollKey != null ? String(turnPs.rollKey) : null,
              sourceLayer: 'authoritative',
              renderReason: 'authoritative-update',
              dice: buildDieTuples(dice, 'authoritative', 'authoritative-update', gameId, turnPs.rollKey != null ? String(turnPs.rollKey) : null),
              timestamp: Date.now(),
            });
          });
        }
      }
    }
  }, [yahtzeeState, currentRoundId, dealerGameId, gameId, getRoundOrd, yahtzeeSync]);


  // The state the UI should render — frozen during animations, anti-regressed
  const stableYahtzeeState = yahtzeeSync.presentationState;
  const authoritativeYahtzeeState = yahtzeeSync.authoritativeState;
  const latestActionStateRef = useRef<YahtzeeState | null>(authoritativeYahtzeeState);
  const latestActionRoundIdRef = useRef<string | null>(currentRoundId ?? null);
  const activeRoundIdRef = useRef<string | null>(currentRoundId ?? null);
  activeRoundIdRef.current = currentRoundId ?? null;
  if (latestActionRoundIdRef.current !== (currentRoundId ?? null)) {
    latestActionRoundIdRef.current = currentRoundId ?? null;
    latestActionStateRef.current = authoritativeYahtzeeState;
  } else if (
    authoritativeYahtzeeState &&
    (!latestActionStateRef.current ||
      (authoritativeYahtzeeState.actionSequence ?? 0) >=
        (latestActionStateRef.current.actionSequence ?? 0))
  ) {
    latestActionStateRef.current = authoritativeYahtzeeState;
  }
  // Alias: all RENDER paths use viewState; all MUTATION/BOT paths use yahtzeeState
  const viewState = stableYahtzeeState;
  const acceptCommittedState = useCallback((state: YahtzeeState) => {
    if (activeRoundIdRef.current !== (currentRoundId ?? null) ||
        (state.actionSequence ?? 0) < (latestActionStateRef.current?.actionSequence ?? 0)) return false;
    latestActionStateRef.current = state;
    latestActionRoundIdRef.current = currentRoundId ?? null;
    const stamped = {
      ...state,
      __syncRound: getRoundOrd(currentRoundId),
    } as YahtzeeState & { __syncRound: number };
    return yahtzeeSync.receiveAuthoritativeUpdate(stamped);
  }, [currentRoundId, getRoundOrd, yahtzeeSync]);

  // Terminal settlement is authoritative, replayable database work. Every
  // mounted client that observes the persisted terminal state may submit the
  // same immutable identity; the RPC admits only session participants/admin,
  // serializes callers, and applies the winner/tie disposition exactly once.
  const settlementInFlightKeyRef = useRef<string | null>(null);
  const settlementCompletedKeyRef = useRef<string | null>(null);
  const settlementRetryKeyRef = useRef<string | null>(null);
  const settlementRequestRef = useRef<(
    source: string,
    terminalWriteAcknowledged?: boolean,
  ) => void>(() => {});
  const requestYahtzeeSettlement = useCallback((
    source: string,
    terminalWriteAcknowledged = false,
  ): void => {
    if (!terminalWriteAcknowledged && authoritativeYahtzeeState?.gamePhase !== 'complete') return;
    if (!gameId || !dealerGameId || !currentRoundId || !Number.isInteger(handNumber)) return;

    const key = `${gameId}:${dealerGameId}:${currentRoundId}:${handNumber}`;
    if (settlementCompletedKeyRef.current === key) return;
    if (settlementInFlightKeyRef.current === key) {
      settlementRetryKeyRef.current = key;
      return;
    }

    settlementInFlightKeyRef.current = key;
    void settleYahtzeeGame({
      gameId,
      roundId: currentRoundId,
      dealerGameId,
      handNumber: handNumber as number,
    }).then((result) => {
      settlementCompletedKeyRef.current = key;
      console.log('[YAHTZEE SETTLE] Authoritative settlement acknowledged', {
        source,
        status: result.status,
        terminalDisposition: result.terminalDisposition,
        roundId: currentRoundId,
        handNumber,
      });
    }).catch((error) => {
      // Do not invent a client fallback. A later persisted snapshot,
      // reconnect/focus, or online event can replay the same identity.
      console.error('[YAHTZEE SETTLE] Authoritative settlement attempt failed', {
        source,
        roundId: currentRoundId,
        handNumber,
        error,
      });
    }).finally(() => {
      if (settlementInFlightKeyRef.current === key) {
        settlementInFlightKeyRef.current = null;
      }
      const shouldReplay =
        settlementRetryKeyRef.current === key &&
        settlementCompletedKeyRef.current !== key;
      if (settlementRetryKeyRef.current === key) {
        settlementRetryKeyRef.current = null;
      }
      if (shouldReplay) {
        settlementRequestRef.current('coalesced-terminal-write-retry');
      }
    });
  }, [
    authoritativeYahtzeeState?.gamePhase,
    gameId,
    dealerGameId,
    currentRoundId,
    handNumber,
  ]);
  settlementRequestRef.current = requestYahtzeeSettlement;

  useEffect(() => {
    if (authoritativeYahtzeeState?.gamePhase !== 'complete') return;
    requestYahtzeeSettlement('persisted-terminal-state');
  }, [authoritativeYahtzeeState?.gamePhase, requestYahtzeeSettlement]);

  useEffect(() => {
    const retryVisibleTerminalSettlement = () => {
      if (document.visibilityState === 'visible') {
        settlementRequestRef.current('visibility-or-focus');
      }
    };
    const retryOnlineTerminalSettlement = () => {
      settlementRequestRef.current('online');
    };

    window.addEventListener('focus', retryVisibleTerminalSettlement);
    window.addEventListener('online', retryOnlineTerminalSettlement);
    document.addEventListener('visibilitychange', retryVisibleTerminalSettlement);
    return () => {
      window.removeEventListener('focus', retryVisibleTerminalSettlement);
      window.removeEventListener('online', retryOnlineTerminalSettlement);
      document.removeEventListener('visibilitychange', retryVisibleTerminalSettlement);
    };
  }, []);

  // ── HELD-DIE TRACE: Presentation state cutover ──
  const prevPresentationTurnRef = useRef<string | null>(null);
  const prevPresentationRollKeyRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (!viewState?.currentTurnPlayerId) return;
    const turnPs = viewState.playerStates[viewState.currentTurnPlayerId];
    if (!turnPs?.dice?.length) return;

    const turnChanged = prevPresentationTurnRef.current !== viewState.currentTurnPlayerId;
    const rollChanged = prevPresentationRollKeyRef.current !== (turnPs.rollKey ?? null);
    prevPresentationTurnRef.current = viewState.currentTurnPlayerId;
    prevPresentationRollKeyRef.current = turnPs.rollKey ?? null;

    if (!turnChanged && !rollChanged) return;

    void runYahtzeeHeldDiagnostic(() => {
      if (!isYahtzeeHeldTraceEnabled()) return;
      const dice = turnPs.dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
      const reason = turnChanged ? 'turn-change' : 'roll-end';
      traceYahtzeeHeldDie({
        gameId,
        dealerGameId: dealerGameId ?? null,
        roundId: currentRoundId ?? null,
        handNumber: viewState.currentRound ?? 0,
        turnPlayerId: viewState.currentTurnPlayerId,
        rollNumber: 3 - turnPs.rollsRemaining,
        rollGeneration: turnPs.rollKey != null ? String(turnPs.rollKey) : null,
        sourceLayer: 'presentation',
        renderReason: reason,
        dice: buildDieTuples(dice, 'presentation', reason, gameId, turnPs.rollKey != null ? String(turnPs.rollKey) : null),
        timestamp: Date.now(),
      });
    });
  }, [viewState?.currentTurnPlayerId, viewState?.playerStates, gameId, dealerGameId, currentRoundId]);

  const [uiRolling, setUiRolling] = useState(false);
  const [lastScoredCategory, setLastScoredCategory] = useState<YahtzeeCategory | null>(null);
  const [lastScoredValue, setLastScoredValue] = useState<number | null>(null);
  // Optimistic scorecard overlay: keeps the scored value visible until DB catches up
  const [optimisticScore, setOptimisticScore] = useState<{ playerId: string; category: YahtzeeCategory; value: number } | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [pendingZeroCategory, setPendingZeroCategory] = useState<YahtzeeCategory | null>(null);
  const uiRollingTimerRef = useRef<number | null>(null);
  const heldSnapshotRef = useRef<boolean[] | null>(null);
  const botProcessingRef = useRef(false);
  /** Ref-based identity for the currently running bot turn. Used instead of closure-based
   *  `cancelled` so that transient dep flickers don't abort a legitimately running bot. */
  const activeBotTurnIdentityRef = useRef<string | null>(null);
  const lastPresentedScoreSequenceRef = useRef<number | null>(null);
  const remotePresentationHydrationRoundRef = useRef<string | null>(null);
  const [remotePresentationHydratedRoundId, setRemotePresentationHydratedRoundId] = useState<string | null>(null);
  const lastAnnouncedScoreSequenceRef = useRef<number | null>(null);
  const activeScorePresentationRef = useRef<{ roundId: string; sequence: number } | null>(null);
  const actionInFlightRef = useRef(false);
  const [actionPending, setActionPending] = useState(false);
  const [holdSyncPending, setHoldSyncPending] = useState(false);
  const holdIntentRef = useRef<{
    roundId: string;
    playerId: string;
    mask: boolean[];
  } | null>(null);
  const holdSyncPromiseRef = useRef<Promise<void> | null>(null);
  // Cache last opponent's dice so they stay visible on felt during scoring highlight transition
  const [cachedOpponentDice, setCachedOpponentDice] = useState<{ dice: HorsesDieType[]; rollKey?: string | number; playerId: string } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Overlay states
  const [showYahtzeeOverlay, setShowYahtzeeOverlay] = useState<string | null>(null); // playerName
  const [showBonusOverlay, setShowBonusOverlay] = useState<string | null>(null); // playerName
  const [showYahtzeeBonusOverlay, setShowYahtzeeBonusOverlay] = useState<{ playerName: string; count: number } | null>(null);
  // Bespoke WinnerOverlay retired — match_win renders via canonical
  // shell announcement rail (see Phase 5 emit below).
  // Previous turn ref — used only to detect turn changes for cache clearing
  const prevTurnRef = useRef<string | null>(null);

  // Chip transfer animation
  const [chipTransferTriggerId, setChipTransferTriggerId] = useState<string | null>(null);
  const [chipTransferWinnerPos, setChipTransferWinnerPos] = useState<number>(0);
  const [chipTransferLoserPositions, setChipTransferLoserPositions] = useState<number[]>([]);
  const [chipTransferLoserIds, setChipTransferLoserIds] = useState<string[]>([]);
  const canAdmitYahtzeeTerminalTransfer = useCallback((batch: ChipPresentationBatch) => {
    const movesPlayerToPlayer = batch.reason === 'transfer' && batch.transfers.some(
      (transfer) => transfer.from.kind === 'player' && transfer.to.kind === 'player',
    );
    // Yahtzee admits financial motion in the same frame as its match-win
    // plate and winner confetti, never on early settlement delivery.
    return !movesPlayerToPlayer || chipTransferTriggerId !== null;
  }, [chipTransferTriggerId]);
  useChipTransferPresentationAdmission(canAdmitYahtzeeTerminalTransfer);

  // Terminal presentation is client-local. The route holds a live
  // session-ending table while this identity is active, and admits Session
  // Ended only after the chip animation publishes the exact completion token.
  const terminalPresentationActiveKeyRef = useRef<string | null>(null);
  const terminalPresentationCompletedKeyRef = useRef<string | null>(null);
  const beginTerminalPresentation = useCallback((identity: string) => {
    if (terminalPresentationActiveKeyRef.current === identity) return;
    terminalPresentationActiveKeyRef.current = identity;
    onTerminalPresentationActiveChange?.(true);
  }, [onTerminalPresentationActiveChange]);
  const handleTerminalChipAnimationEnd = useCallback(() => {
    setChipTransferTriggerId(null);
    const identity = terminalPresentationActiveKeyRef.current;
    if (!identity) return;

    if (terminalPresentationCompletedKeyRef.current !== identity) {
      terminalPresentationCompletedKeyRef.current = identity;
      onTerminalPresentationComplete?.(identity);
    }
    terminalPresentationActiveKeyRef.current = null;
    onTerminalPresentationActiveChange?.(false);
  }, [onTerminalPresentationActiveChange, onTerminalPresentationComplete]);

  useEffect(() => {
    return () => {
      if (!terminalPresentationActiveKeyRef.current) return;
      terminalPresentationActiveKeyRef.current = null;
      onTerminalPresentationActiveChange?.(false);
    };
  }, [onTerminalPresentationActiveChange]);

  // Guard: prevent double-execution of end-of-game completion effect.
  // Keyed on currentRoundId — single-fire per round, on every client.
  const completionLatchRoundIdRef = useRef<string | null>(null);
  // Reset latches when a new round starts.
  // Identity-boundary invariant: gameplay artifacts (including cached opponent
  // dice and the scoring-in-progress flag) MUST NOT survive round transitions.
  // Flush them here so a new round never inherits the prior round's final-turn
  // dice on the felt.
  useEffect(() => {
    completionLatchRoundIdRef.current = null;
    prevTurnRef.current = null;
    actionInFlightRef.current = false;
    holdIntentRef.current = null;
    holdSyncPromiseRef.current = null;
    setActionPending(false);
    setHoldSyncPending(false);
    activeScorePresentationRef.current = null;
    setCachedOpponentDice(null);
    setScoringInProgress(false);
    setLastScoredCategory(null);
    setLastScoredValue(null);
  }, [currentRoundId]);

  // Debounce ref for stale-turn-render: only fire after 2+ consecutive mismatches
  // to allow for expected one-frame lag during sync gate acceptance
  const staleTurnMismatchCountRef = useRef(0);

  // ── Sync diagnostics: invariant checks ────────────────────────
  useEffect(() => {
    if (!viewState || !gameId) return;
    import('@/lib/yahtzeeSyncDiagnostics').then(({
      checkYahtzeeStaleTurn,
      checkYahtzeePhaseRenderMismatch,
      checkYahtzeeStuckNullTurn,
      checkYahtzeeRegressiveCategories,
      logYahtzeeResultDisplay,
    }) => {
      const handNum = viewState.currentRound ?? 0;

      // INV-3: stuck-null-turn
      checkYahtzeeStuckNullTurn(gameId, handNum, viewState.gamePhase, viewState.currentTurnPlayerId);

      // INV-2: phase-render-mismatch
      if (viewState.gamePhase === 'playing') {
        checkYahtzeePhaseRenderMismatch(gameId, handNum, viewState.gamePhase, 'input');
      } else if (viewState.gamePhase === 'complete') {
        checkYahtzeePhaseRenderMismatch(gameId, handNum, viewState.gamePhase, 'result');
      }

      // INV-1: stale-turn-render (debounced)
      // The sync gate creates expected one-frame lag: authoritative advances before
      // viewState catches up. Only fire if mismatch persists for 2+ consecutive checks.
      if (authoritativeYahtzeeState && !yahtzeeSync.isFrozen) {
        const isMismatch = viewState.currentTurnPlayerId !== authoritativeYahtzeeState.currentTurnPlayerId;
        if (isMismatch) {
          staleTurnMismatchCountRef.current += 1;
          if (staleTurnMismatchCountRef.current >= 3) {
            checkYahtzeeStaleTurn(gameId, viewState.currentTurnPlayerId, authoritativeYahtzeeState.currentTurnPlayerId, handNum);
          }
        } else {
          staleTurnMismatchCountRef.current = 0;
        }
      }

      // INV-4: regressive-categories
      let totalFilled = 0;
      for (const ps of Object.values(viewState.playerStates || {})) {
        totalFilled += Object.keys(ps.scorecard?.scores || {}).length;
      }
      checkYahtzeeRegressiveCategories(gameId, handNum, totalFilled);

      // Transition: result-display (fire once when complete)
      if (viewState.gamePhase === 'complete') {
        logYahtzeeResultDisplay(gameId, handNum, null, null);
      }
    }).catch(() => { /* safe */ });
  }, [viewState, gameId, yahtzeeState]);

  useEffect(() => {
    return () => {
      import('@/lib/yahtzeeSyncDiagnostics').then(({ resetYahtzeeTracking }) => {
        resetYahtzeeTracking(gameId);
      }).catch(() => {});
    };
  }, [gameId]);

  // NOTE: Fallback polling for opponent dice was REMOVED as part of the
  // Yahtzee no-blind-spot framework cutover. It violated the core project
  // rule against polling-based safety nets and could mask realtime delivery
  // bugs. Realtime subscription in Game.tsx (postgres_changes on rounds)
  // is the single source of authoritative updates; if a snapshot is missed
  // there, the framework's progress-vector gate and identity reset are the
  // recovery surface — not a hidden poll loop.

  // Track upper bonus per player to detect when earned
  const prevUpperBonusRef = useRef<Record<string, boolean>>({});
  // Track Yahtzee bonus counts per player to detect new bonuses
  const prevYahtzeeBonusRef = useRef<Record<string, number>>({});
  // Tab state
  const [activeTab, setActiveTabRaw] = useState<'cards' | 'chat' | 'lobby' | 'history'>(
    () => readPersistedMatchChatTab(gameId, 'cards') as 'cards' | 'chat' | 'lobby' | 'history'
  );
  const setActiveTab = useCallback((next: 'cards' | 'chat' | 'lobby' | 'history') => {
    writePersistedMatchChatTab(gameId, next);
    setActiveTabRaw(next);
  }, [gameId]);

  // Local dice are presentation state for the active player. Every durable
  // roll/hold/score is returned by the authoritative action RPC and consumed
  // directly; Realtime only synchronizes peers and reconnects.
  const [localDice, setLocalDice] = useState<YahtzeeDie[]>([]);
  // Ref mirror of localDice — always up-to-date for synchronous reads in handlers
  // (React closures capture stale state; this ref avoids the hold→roll race condition)
  const localDiceRef = useRef<YahtzeeDie[]>([]);
  useEffect(() => { localDiceRef.current = localDice; }, [localDice]);
  const [localRollsRemaining, setLocalRollsRemaining] = useState(3);
  // Ref mirror of localRollsRemaining. During the acting player's turn, roll count
  // is local-owned just like dice; handlers must not depend on a stale DB snapshot.
  const localRollsRemainingRef = useRef(3);
  useEffect(() => { localRollsRemainingRef.current = localRollsRemaining; }, [localRollsRemaining]);
  // Track which turn we've already seeded localDice for, so we seed exactly once per turn.
  const turnSeededKeyRef = useRef<string | null>(null);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  // Keep the immutable match roster available through terminal presentation.
  // Game.tsx removes `status = left` rows from its live `players` prop, but a
  // participant may leave after the terminal score is persisted and before
  // the connected client's chip animation resolves its endpoints. Never let
  // that mutable presence filter erase the winner/loser presentation roster.
  const terminalPresentationRosterRef = useRef<{
    roundId: string | null;
    playersById: Map<string, Player>;
  }>({ roundId: null, playersById: new Map() });
  useEffect(() => {
    if (terminalPresentationRosterRef.current.roundId !== currentRoundId) {
      terminalPresentationRosterRef.current = {
        roundId: currentRoundId,
        playersById: new Map(),
      };
    }
    for (const player of players) {
      terminalPresentationRosterRef.current.playersById.set(player.id, player);
    }
  }, [currentRoundId, players]);
  const shellAnchors = useRequiredSeatAnchors('yahtzee');
  // Render-facing derived values use viewState (presentationState) for visual stability
  const gamePhase = viewState?.gamePhase || 'waiting';
  const currentTurnPlayerId = viewState?.currentTurnPlayerId;

  // Direct turn usage — no ready-gate. Scoring + turn advance are atomic writes,
  // so there is no intermediate state to cause flicker.
  const stableTurnPlayerId = currentTurnPlayerId || null;
  const currentPlayer = players.find(p => p.id === stableTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId && gamePhase === 'playing';
  const isMyAutoRollTurn = isMyTurn && !isRealMoney && currentPlayer?.auto_fold === true;
  const getPlayerUsername = (player: Player) =>
    player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || 'Player');
  const yahtzeeDeadline = viewState?.turnDeadline ?? null;
  const [timerNow, setTimerNow] = useState(() => Date.now());
  // The deadline is authoritative and shared by every viewer. Only the
  // acting human owns the bottom-rail timer; the active opponent gets the
  // same presentation-only countdown ring at their canonical seat.
  const yahtzeeHumanTimedTurn = gamePhase === 'playing'
    && !!stableTurnPlayerId
    && !!yahtzeeDeadline
    && !currentPlayer?.is_bot
    && currentPlayer?.auto_fold !== true
    && !isPaused;
  useEffect(() => {
    if (!yahtzeeHumanTimedTurn || !yahtzeeDeadline) return;
    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [yahtzeeDeadline, yahtzeeHumanTimedTurn]);
  const yahtzeeSecondsRemaining = yahtzeeDeadline
    ? Math.max(0, Math.ceil((new Date(yahtzeeDeadline).getTime() - timerNow) / 1_000))
    : 0;
  const isManualTurnOpenNow = useCallback(() => isYahtzeeManualTurnOpen({
    gamePhase,
    isMyTurn,
    isPaused,
    isAutomated: isMyAutoRollTurn,
    deadline: yahtzeeDeadline,
    nowMs: Date.now(),
  }), [gamePhase, isMyTurn, isPaused, isMyAutoRollTurn, yahtzeeDeadline]);
  const yahtzeeManualTurnOpen = isYahtzeeManualTurnOpen({
    gamePhase,
    isMyTurn,
    isPaused,
    isAutomated: isMyAutoRollTurn,
    deadline: yahtzeeDeadline,
    nowMs: timerNow,
  });
  const yahtzeeDeadlineExpired = !!yahtzeeDeadline && yahtzeeSecondsRemaining <= 0;
  const yahtzeeShellTimerState = yahtzeeManualTurnOpen
    ? {
        secondsRemaining: yahtzeeSecondsRemaining,
        totalSeconds: decisionTimerSeconds,
        actorLabel: getPlayerUsername(currentPlayer),
        activePlayerId: stableTurnPlayerId,
        identityKey: `yahtzee-${currentRoundId ?? 'round'}-${stableTurnPlayerId}-${yahtzeeDeadline}`,
      }
    : null;
  // The server-owned deadline is the only timer source. This hook publishes
  // semantic state; the shell owns the rail's rendering and geometry.
  useShellTimer(yahtzeeShellTimerState);
  useEffect(() => {
    if (!yahtzeeManualTurnOpen) setPendingZeroCategory(null);
  }, [yahtzeeManualTurnOpen]);

  const chatAttention = useChatAttention();
  useEffect(() => { chatAttention.notifyActiveTab(activeTab); }, [activeTab, chatAttention]);
  useEffect(() => { if (activeTab === 'chat') chatAttention.markChatRead('chat-tab-opened-actual-read'); }, [activeTab, chatAttention]);
  useChatIconStyleGuard(chatAttention.attentionState);
  const chatAttentionTabProps = chatAttentionToShellTabProps(chatAttention.attentionState);
  const yahtzeeCardsFlash: 'red' | null = (isMyTurn && activeTab !== 'cards' && gamePhase === 'playing') ? 'red' : null;
  recordChatDeliveryEvent({
    phase: 'turn-attention-evaluated',
    consumer: 'turn-attention-audit',
    payload: {
      game: 'yahtzee',
      activeTab,
      localTurnEligible: isMyTurn && gamePhase === 'playing',
      iconKind: 'dice',
      shouldBeRed: yahtzeeCardsFlash === 'red',
      renderedRed: yahtzeeCardsFlash === 'red',
      suppressReason: !isMyTurn ? 'not-your-turn' : (gamePhase !== 'playing' ? `phase:${gamePhase}` : (activeTab === 'cards' ? 'on-cards-tab' : null)),
    },
  });

  // Publish tab metadata to the shell-owned tab bar.
  useShellTabBar({
    cardsIcon: 'dice',
    activeTab,
    setActiveTab,
    cardsFlashing: yahtzeeCardsFlash,
    chatFlashing: chatAttentionTabProps.chatFlashing,
    chatIndicator: chatAttentionTabProps.chatIndicator,
    isPaused,
  });
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const currentTurnState = stableTurnPlayerId ? viewState?.playerStates?.[stableTurnPlayerId] : null;
  // A durable `lastAction` is history on a reconnect, not a fresh visual
  // event. Establish the first hydrated action/roll as already presented
  // before the browser paints; later sequences may own a live handoff.
  useLayoutEffect(() => {
    if (!viewState || !currentRoundId) return;
    if (remotePresentationHydrationRoundRef.current === currentRoundId) return;

    lastPresentedScoreSequenceRef.current = viewState.lastAction?.sequence ?? null;
    lastAnnouncedScoreSequenceRef.current = viewState.lastAction?.sequence ?? null;
    remotePresentationHydrationRoundRef.current = currentRoundId;
    setRemotePresentationHydratedRoundId(currentRoundId);
  }, [viewState, currentRoundId]);

  const remoteScorePresentation = resolveYahtzeeRemoteScorePresentation(
    viewState,
    myPlayer?.id,
    scoringInProgress,
    lastPresentedScoreSequenceRef.current,
    remotePresentationHydratedRoundId === currentRoundId,
  );
  const presentedOpponentPlayerId = remoteScorePresentation.action?.playerId
    ?? (!isMyTurn ? currentTurnPlayerId ?? null : null);

  // Reorder harness no longer gates on eligibility — manual-run only.

  // ── Phase 5: Canonical match_win emit ────────────────────────────────
  // Emit moved into the completion presentation effect below (co-fired
  // with chip-transfer trigger + winner confetti, matching Gin/Cribbage).
  // Keeping the announcements handle here for the chip-transfer effect.
  const announcements = useAnnouncements();
  const announcementsRef = useRef(announcements);
  announcementsRef.current = announcements;
  const { ambient: announcementAmbient } = useAnnouncementContext();
  const preSessionSeatOwnedByShell = usePreSessionSeatOwned();
  const lastEmittedYahtzeeMatchRef = useRef<string | null>(null);

  const clearActiveScorePresentation = useCallback((expected?: { roundId: string; sequence: number }) => {
    const active = activeScorePresentationRef.current;
    if (!active || (expected && (active.roundId !== expected.roundId || active.sequence !== expected.sequence))) {
      return false;
    }
    activeScorePresentationRef.current = null;
    setLastScoredCategory(null);
    setLastScoredValue(null);
    setScoringInProgress(false);
    setCachedOpponentDice(null);
    announcementsRef.current.dismiss(yahtzeeScoreAnnouncementId(active.roundId, active.sequence));
    return true;
  }, []);

  // A newly observed durable action owns the felt immediately. This is a
  // layout effect so a slow score snapshot cannot paint over its successor.
  useLayoutEffect(() => {
    const active = activeScorePresentationRef.current;
    if (!active || active.roundId !== currentRoundId) return;
    if (isYahtzeeScorePresentationSuperseded(active.sequence, viewState?.actionSequence)) {
      clearActiveScorePresentation(active);
    }
  }, [viewState?.actionSequence, currentRoundId, clearActiveScorePresentation]);


  // Scores — derived from viewState for render stability
  const allTotals = useMemo(() =>
    Object.entries(viewState?.playerStates || {}).map(([pid, ps]) => ({
      pid, total: getTotalScore(ps.scorecard),
    })), [viewState?.playerStates]);
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  const rolling = uiRolling;
  const rollNumber = Math.min(3, Math.max(1, 4 - localRollsRemaining));
  const showMyDice = isMyTurn
    && !isMyAutoRollTurn
    && !remoteScorePresentation.active
    && gamePhase === "playing"
    && localRollsRemaining < 3;
  useAuthoritativeActionSurfaceGuard({
    expected: yahtzeeManualTurnOpen
      && activeTab === 'cards'
      && !remoteScorePresentation.active,
    gameId,
    gameType: 'yahtzee',
    identityKey: `${dealerGameId ?? 'no-dealer-game'}:${currentRoundId ?? 'no-round'}:${stableTurnPlayerId ?? 'no-player'}:${viewState?.actionSequence ?? 0}`,
    surface: 'yahtzee-turn',
    selector: '[data-authoritative-action-surface="yahtzee-turn"]',
  });

  // Wave 2E — fluid dice-row sizing.
  const paneContentRef = useRef<HTMLDivElement | null>(null);
  const [paneWidthPx, setPaneWidthPx] = useState(0);
  useLayoutEffect(() => {
    const el = paneContentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setPaneWidthPx((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dieRowLayout = useDieRowLayout({
    // Pane content uses px-1 for the dice row wrapper so the available
    // width for dice is (paneWidth - 8px). Previously px-2 (16px) shaved
    // the row and the fluid dieSize snapped down to the "lg" 72px bucket.
    availableWidth: Math.max(0, paneWidthPx - 8), // px-1 × 2 sides
    count: 5,
    minDieSize: 36,
    maxDieSize: 120,
    gapPx: 4,
  });
  // Wave 2E raw fluid sizing: bypass the discrete size-bucket ladder and
  // pass the resolver's actual pixel edge to the die. The ladder-based
  // snap was the limiting expression that kept dice at 72px even when
  // the container could fit ~74-84px; using the raw fluid value lets the
  // dice consume the full pane width. `resolvedDieSize` is still passed
  // for pip sizing (nearest bucket → readable pips).
  const resolvedDieSize = dieRowLayout ? snapToDieSize(dieRowLayout.dieSize) : "lg";
  const fluidDiePx = dieRowLayout ? Math.round(dieRowLayout.dieSize) : null;

  // ── Cause B: Yahtzee scorecard sticky-mount latch ─────────────────────
  // The interactive scorecard mounts on `isMyTurn`. During turn transitions
  // (`currentTurnPlayerId` flipping briefly to null/other, or scoring atomic-
  // write windows), `isMyTurn` can flicker false→true and unmount/remount
  // the scorecard. Latch identity is `myPlayer.id`; once shown, keep it
  // briefly mounted even if isMyTurn drops. If isMyTurn returns within the
  // window, the unmount timer is cancelled and no remount happens. Reset
  // happens only on a true identity change (turn player advanced past me).
  const [stickyScorecardMounted, setStickyScorecardMounted] = useState(false);
  const scorecardUnmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnAdvancedToAnotherPlayer =
    gamePhase === 'playing' &&
    currentPlayer != null &&
    currentPlayer.user_id !== currentUserId;
  useEffect(() => {
    if (isMyTurn) {
      if (scorecardUnmountTimerRef.current) {
        clearTimeout(scorecardUnmountTimerRef.current);
        scorecardUnmountTimerRef.current = null;
      }
      setStickyScorecardMounted(true);
      return;
    }
    if (turnAdvancedToAnotherPlayer) {
      if (scorecardUnmountTimerRef.current) {
        clearTimeout(scorecardUnmountTimerRef.current);
        scorecardUnmountTimerRef.current = null;
      }
      if (stickyScorecardMounted) setStickyScorecardMounted(false);
      return;
    }
    if (stickyScorecardMounted && !scorecardUnmountTimerRef.current) {
      scorecardUnmountTimerRef.current = setTimeout(() => {
        setStickyScorecardMounted(false);
        scorecardUnmountTimerRef.current = null;
      }, 350);
    }
  }, [isMyTurn, stickyScorecardMounted, turnAdvancedToAnotherPlayer]);
  useEffect(() => () => {
    if (scorecardUnmountTimerRef.current) clearTimeout(scorecardUnmountTimerRef.current);
  }, []);
  const showInteractiveScorecard = !remoteScorePresentation.active
    && !isMyAutoRollTurn
    && (isMyTurn || stickyScorecardMounted);



  // Clockwise distance for seat positioning
  const getClockwiseDistance = useCallback((targetPosition: number) => {
    if (!myPlayer) return 0;
    const myPos = myPlayer.position;
    if (targetPosition === myPos) return 0;
    const diff = targetPosition - myPos;
    return diff > 0 ? diff : diff + 7;
  }, [myPlayer?.position]);

  // Get player at slot (clockwise from current player)
  const getPlayerAtSlot = useCallback((slotIndex: number) => {
    if (!myPlayer) return null;
    const myPos = myPlayer.position;
    const targetPos = ((myPos + slotIndex) % 7) + 1;
    return activePlayers.find(p => p.position === targetPos && p.id !== myPlayer.id) || null;
  }, [myPlayer, activePlayers]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (uiRollingTimerRef.current != null) window.clearTimeout(uiRollingTimerRef.current);
    };
  }, []);

  /* ---- Dice animation timing constants ---- */
  const FIRST_ROLL_MS = 1300;
  const ROLL_AGAIN_MS = 1800;

  /* ---- Seed local dice ONCE when my turn starts (or on reconnect) ---- */
  // After seeding, committed RPC results update localDice directly so the
  // initiator never waits for its own Realtime echo.
  useEffect(() => {
    if (!isMyTurn || !myPlayer || !stableYahtzeeState) {
      // Not my turn — clear the seed key so we re-seed when it becomes my turn again
      turnSeededKeyRef.current = null;
      return;
    }

    const turnKey = `${currentTurnPlayerId}-${currentRoundId}`;
    if (turnSeededKeyRef.current === turnKey) return; // Already seeded for this turn

    const ps = stableYahtzeeState.playerStates[myPlayer.id];
    if (!ps) return;

    // Seed localDice from the DB state
    turnSeededKeyRef.current = turnKey;
    localDiceRef.current = ps.dice;
    localRollsRemainingRef.current = ps.rollsRemaining;
    setLocalDice(ps.dice);
    setLocalRollsRemaining(ps.rollsRemaining);
    console.log('[YAHTZEE] Turn seeded from DB', { turnKey, rollsRemaining: ps.rollsRemaining });
  }, [isMyTurn, myPlayer?.id, stableYahtzeeState?.playerStates, currentTurnPlayerId, currentRoundId]);

  // Clear optimistic score once presentation has caught up.
  // Framework cutover: drive from viewState so the override clears in lockstep
  // with what the user actually sees, not raw authoritative.
  useEffect(() => {
    if (!optimisticScore || !viewState) return;
    const ps = viewState.playerStates[optimisticScore.playerId];
    if (ps?.scorecard.scores[optimisticScore.category] !== undefined) {
      setOptimisticScore(null);
    }
  }, [viewState?.playerStates, optimisticScore, myPlayer?.id]);

  /* ---- Detect Yahtzee rolls & upper bonus from presentation state changes ---- */
  // Framework cutover: side-effects that drive UI overlays MUST follow the
  // presentation layer — driving them from raw authoritative would fire
  // bonus/yahtzee overlays before the presentation has visibly advanced.
  useEffect(() => {
    if (!viewState) return;
    for (const [pid, ps] of Object.entries(viewState.playerStates)) {
      const player = players.find(p => p.id === pid);
      if (!player) continue;
      const name = getPlayerUsername(player);

      // Check upper bonus (only fire once per player)
      const hadBonus = prevUpperBonusRef.current[pid] ?? false;
      const nowHasBonus = hasUpperBonus(ps.scorecard);
      if (nowHasBonus && !hadBonus) {
        setShowBonusOverlay(name);
      }
      prevUpperBonusRef.current[pid] = nowHasBonus;

      // Check Yahtzee bonus (detect new +100 bonuses)
      const prevBonusCount = prevYahtzeeBonusRef.current[pid] ?? 0;
      const nowBonusCount = ps.scorecard.yahtzeeBonuses;
      if (nowBonusCount > prevBonusCount) {
        setShowYahtzeeBonusOverlay({ playerName: name, count: nowBonusCount });
      }
      prevYahtzeeBonusRef.current[pid] = nowBonusCount;
    }
  }, [viewState?.playerStates]);

  /* ---- Present the exact committed score after the atomic turn handoff ---- */
  useEffect(() => {
    if (remotePresentationHydratedRoundId !== currentRoundId) return;
    const action = viewState?.lastAction;
    if (!action || action.type !== 'score' || action.playerId === myPlayer?.id) return;
    if (lastPresentedScoreSequenceRef.current === action.sequence) return;
    lastPresentedScoreSequenceRef.current = action.sequence;
    const presentation = { roundId: currentRoundId, sequence: action.sequence };
    activeScorePresentationRef.current = presentation;

    setLastScoredCategory(action.category);
    setLastScoredValue(action.score);
    setScoringInProgress(true);
    setCachedOpponentDice({
      dice: action.dice.map(die => ({ value: die.value, isHeld: die.isHeld })),
      rollKey: action.sequence,
      playerId: action.playerId,
    });

    const timer = setTimeout(() => {
      clearActiveScorePresentation(presentation);
    }, YAHTZEE_SCORE_PRESENTATION_MS);
    return () => clearTimeout(timer);
  }, [viewState?.lastAction?.sequence, myPlayer?.id, remotePresentationHydratedRoundId, currentRoundId, clearActiveScorePresentation]);

  /* ---- Canonical rail narration — never occupies the scorecard pane ---- */
  useEffect(() => {
    if (remotePresentationHydratedRoundId !== currentRoundId) return;
    const action = viewState?.lastAction;
    if (!action || action.type !== 'score' || viewState?.actionSequence !== action.sequence) return;
    if (lastAnnouncedScoreSequenceRef.current === action.sequence) return;
    const scorer = players.find(player => player.id === action.playerId);
    if (!scorer) return;

    lastAnnouncedScoreSequenceRef.current = action.sequence;
    announcements.emit(createYahtzeeScoreAnnouncement({
      dealerGameId: gameId,
      roundId: currentRoundId,
      playerName: getPlayerUsername(scorer),
      action,
    }));
  }, [
    remotePresentationHydratedRoundId,
    currentRoundId,
    viewState?.lastAction,
    viewState?.actionSequence,
    players,
    announcements,
    gameId,
  ]);

  useEffect(() => {
    if (remotePresentationHydratedRoundId !== currentRoundId) return;
    if (gamePhase !== 'playing' || !currentTurnPlayerId) return;
    if (isPaused) return;
    // Session lifecycle owns non-gameplay ambients (notably pause). Do not
    // overwrite one; this effect will reconcile again when that state clears.
    if (announcementAmbient && announcementAmbient.type !== 'gameplay_notice') return;
    const roller = players.find(player => player.id === currentTurnPlayerId);
    if (!roller) return;

    announcements.emit(createYahtzeeTurnAnnouncement({
      dealerGameId: gameId,
      roundId: currentRoundId,
      playerId: currentTurnPlayerId,
      playerName: getPlayerUsername(roller),
    }));
  }, [
    remotePresentationHydratedRoundId,
    currentRoundId,
    currentTurnPlayerId,
    gamePhase,
    isPaused,
    players,
    announcements,
    announcementAmbient?.id,
    announcementAmbient?.type,
    gameId,
  ]);

  /* ---- Clear opponent scoring highlight when turn changes ---- */
  useEffect(() => {
    if (prevTurnRef.current && prevTurnRef.current !== currentTurnPlayerId) {
      // Turn changed — clear any lingering opponent highlight
      if (scoringInProgress && lastScoredCategory) {
        setLastScoredCategory(null);
        setLastScoredValue(null);
        setScoringInProgress(false);
        setCachedOpponentDice(null);
      }
    }
    prevTurnRef.current = currentTurnPlayerId || null;
  }, [currentTurnPlayerId]);

  /**
   * Drain the latest desired five-die mask through one authoritative request
   * at a time. Taps update presentation immediately; taps received while a
   * request is in flight replace the queued mask instead of being discarded.
   */
  const ensureHoldMaskSynced = useCallback((): Promise<void> => {
    const existing = holdSyncPromiseRef.current;
    if (existing) return existing;
    if (!holdIntentRef.current) return Promise.resolve();

    let run: Promise<void>;
    const syncRoundId = activeRoundIdRef.current;
    run = (async () => {
      setHoldSyncPending(true);
      try {
        while (holdIntentRef.current) {
          const intent = holdIntentRef.current;
          if (activeRoundIdRef.current !== intent.roundId) {
            holdIntentRef.current = null;
            return;
          }

          const currentState = latestActionStateRef.current;
          const currentPlayerState = currentState?.playerStates?.[intent.playerId];
          if (
            !currentState ||
            !currentPlayerState ||
            currentState.currentTurnPlayerId !== intent.playerId
          ) {
            throw new Error('Yahtzee hold sync lost the exact active-turn identity.');
          }

          const committedMask = currentPlayerState.dice.map((die) => die.isHeld);
          if (holdMasksEqual(committedMask, intent.mask)) {
            if (holdIntentRef.current === intent) holdIntentRef.current = null;
            continue;
          }

          const requestedMask = [...intent.mask];
          const holdStartedAt = Date.now();
          recordGameFreezeTrace('yahtzee.hold.request.started', {
            roundId: intent.roundId,
            expectedActionSequence: currentState.actionSequence ?? 0,
          });
          const result = await setYahtzeeHolds({
            roundId: intent.roundId,
            playerId: intent.playerId,
            holdMask: requestedMask,
            expectedActionSequence: currentState.actionSequence ?? 0,
          });
          recordGameFreezeTrace('yahtzee.hold.request.finished', {
            roundId: intent.roundId,
            durationMs: Date.now() - holdStartedAt,
            outcome: result.outcome,
            actionSequence: result.state.actionSequence ?? null,
          });

          // An old round's response has no authority over the newly mounted
          // identity, even if it arrives after the network request completes.
          if (activeRoundIdRef.current !== intent.roundId) return;

          if (acceptCommittedState(result.state) === false) return;
          if (result.outcome === 'rejected') {
            throw new Error(`Yahtzee hold rejected: ${result.reason ?? 'unknown reason'}`);
          }

          const committedPlayerState = result.state.playerStates[intent.playerId];
          if (!committedPlayerState) {
            throw new Error('Yahtzee hold result omitted the acting player state.');
          }

          const latestIntent = holdIntentRef.current;
          if (result.outcome === 'stale_action') {
            const desiredMask = latestIntent?.roundId === intent.roundId && latestIntent.playerId === intent.playerId
              ? latestIntent.mask
              : intent.mask;
            const optimisticDice = committedPlayerState.dice.map((die, index) => ({
              ...die,
              isHeld: desiredMask[index],
            }));
            localDiceRef.current = optimisticDice;
            setLocalDice(optimisticDice);
            continue;
          }

          const hasNewerDesiredMask = Boolean(
            latestIntent &&
            latestIntent.roundId === intent.roundId &&
            latestIntent.playerId === intent.playerId &&
            !holdMasksEqual(latestIntent.mask, requestedMask)
          );

          if (hasNewerDesiredMask && latestIntent) {
            const optimisticDice = committedPlayerState.dice.map((die, index) => ({
              ...die,
              isHeld: latestIntent.mask[index],
            }));
            localDiceRef.current = optimisticDice;
            setLocalDice(optimisticDice);
          } else {
            if (holdIntentRef.current === intent) holdIntentRef.current = null;
            localDiceRef.current = committedPlayerState.dice;
            setLocalDice(committedPlayerState.dice);
          }
        }
      } catch (error) {
        if (activeRoundIdRef.current !== syncRoundId) return;
        recordGameFreezeTrace('yahtzee.hold.request.failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        const currentState = latestActionStateRef.current;
        const intent = holdIntentRef.current;
        const committedPlayerState = intent
          ? currentState?.playerStates?.[intent.playerId]
          : null;
        holdIntentRef.current = null;
        if (committedPlayerState && activeRoundIdRef.current === intent?.roundId) {
          localDiceRef.current = committedPlayerState.dice;
          setLocalDice(committedPlayerState.dice);
        }
        console.error('[YAHTZEE] Authoritative hold-mask sync failed', error);
        onRefetch();
        throw error;
      } finally {
        if (holdSyncPromiseRef.current === run) {
          holdSyncPromiseRef.current = null;
          setHoldSyncPending(false);
        }
      }
    })();

    holdSyncPromiseRef.current = run;
    return run;
  }, [acceptCommittedState, onRefetch]);

  const handleRoll = useCallback(async () => {
    const manualTurnOpen = isManualTurnOpenNow();
    if (!manualTurnOpen || !currentRoundId || !myPlayer || rolling || actionInFlightRef.current) {
      console.warn('[YAHTZEE] handleRoll blocked:', { manualTurnOpen, hasRoundId: !!currentRoundId, hasPlayer: !!myPlayer, rolling });
      return;
    }
    actionInFlightRef.current = true;
    setActionPending(true);
    try {
      await ensureHoldMaskSynced();
      if (activeRoundIdRef.current !== currentRoundId) return;
      const rawState = latestActionStateRef.current;
      const myPs = rawState?.playerStates?.[myPlayer.id];
      if (!myPs || rawState?.currentTurnPlayerId !== myPlayer.id || myPs.rollsRemaining <= 0) {
        console.warn('[YAHTZEE] handleRoll blocked: no exact player state or no rolls', {
          hasRawState: !!rawState,
          hasPs: !!myPs,
          rolls: myPs?.rollsRemaining,
          snapshot: describeYahtzeeSnapshot(rawState),
        });
        return;
      }

      const turnKey = `${currentTurnPlayerId}-${currentRoundId}`;
      turnSeededKeyRef.current = turnKey;
      const isFirstRoll = myPs.rollsRemaining === 3;
      const duration = isFirstRoll ? FIRST_ROLL_MS : ROLL_AGAIN_MS;
      const rollStartedAt = Date.now();
      recordGameFreezeTrace('yahtzee.roll.request.started', {
        roundId: currentRoundId,
        expectedActionSequence: rawState.actionSequence ?? 0,
        rollsRemaining: myPs.rollsRemaining,
      });
      const result = await applyYahtzeeAction({
        roundId: currentRoundId,
        playerId: myPlayer.id,
        action: 'roll',
        expectedActionSequence: rawState.actionSequence ?? 0,
      });
      recordGameFreezeTrace('yahtzee.roll.request.finished', {
        roundId: currentRoundId,
        durationMs: Date.now() - rollStartedAt,
        outcome: result.outcome,
        actionSequence: result.state.actionSequence ?? null,
      });
      if (activeRoundIdRef.current !== currentRoundId) return;
      if (acceptCommittedState(result.state) === false) return;
      const committedPs = result.state.playerStates[myPlayer.id];
      if (!committedPs) throw new Error('Yahtzee roll result omitted the acting player state.');
      if (result.outcome === 'rejected') {
        throw new Error(`Yahtzee roll rejected: ${result.reason ?? 'unknown reason'}`);
      }
      localDiceRef.current = committedPs.dice;
      localRollsRemainingRef.current = committedPs.rollsRemaining;
      setLocalDice(committedPs.dice);
      setLocalRollsRemaining(committedPs.rollsRemaining);
      if (result.outcome === 'stale_action') return;

      heldSnapshotRef.current = committedPs.heldMaskBeforeComplete ?? null;
      const diceValues = committedPs.dice.map(d => d.value);
      if (isYahtzee(diceValues) && diceValues[0] !== 0) {
        setTimeout(() => setShowYahtzeeOverlay(getPlayerUsername(myPlayer)), duration + 200);
      }
      setUiRolling(true);
      if (uiRollingTimerRef.current != null) window.clearTimeout(uiRollingTimerRef.current);
      uiRollingTimerRef.current = window.setTimeout(() => {
        setUiRolling(false);
        heldSnapshotRef.current = null;
        uiRollingTimerRef.current = null;
      }, duration);
    } catch (error) {
      recordGameFreezeTrace('yahtzee.roll.request.failed', {
        roundId: currentRoundId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error('[YAHTZEE] Authoritative roll failed', error);
      if (activeRoundIdRef.current !== currentRoundId) return;
      toast.error('The roll could not be confirmed. Please try again.');
      onRefetch();
    } finally {
      if (activeRoundIdRef.current === currentRoundId) {
        actionInFlightRef.current = false;
        setActionPending(false);
      }
    }
  }, [isManualTurnOpenNow, currentRoundId, currentTurnPlayerId, myPlayer, rolling, acceptCommittedState, ensureHoldMaskSynced, onRefetch]);

  /* ---- Hold toggle ---- */
  const handleToggleHold = useCallback((dieIndex: number) => {
    if (!isManualTurnOpenNow() || !currentRoundId || !myPlayer || rolling || actionInFlightRef.current) {
      return;
    }
    const rawState = latestActionStateRef.current;
    const myPs = rawState?.playerStates[myPlayer.id];
    if (
      !myPs ||
      rawState?.currentTurnPlayerId !== myPlayer.id ||
      myPs.rollsRemaining === 3 ||
      myPs.rollsRemaining === 0 ||
      dieIndex < 0 ||
      dieIndex >= myPs.dice.length
    ) {
      return;
    }

    const queued = holdIntentRef.current;
    const baseMask = queued?.roundId === currentRoundId && queued.playerId === myPlayer.id
      ? queued.mask
      : localDiceRef.current.map((die) => die.isHeld);
    const nextMask = [...baseMask];
    nextMask[dieIndex] = !nextMask[dieIndex];
    holdIntentRef.current = {
      roundId: currentRoundId,
      playerId: myPlayer.id,
      mask: nextMask,
    };

    const optimisticDice = localDiceRef.current.map((die, index) => ({
      ...die,
      isHeld: nextMask[index],
    }));
    localDiceRef.current = optimisticDice;
    setLocalDice(optimisticDice);

    // Attach a rejection handler for tap-only usage. Roll/score callers await
    // the same shared promise and therefore still observe a failed flush.
    void ensureHoldMaskSynced().catch(() => {});
  }, [isManualTurnOpenNow, currentRoundId, myPlayer, rolling, ensureHoldMaskSynced]);

  /* ---- Score category ---- */
  const handleScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isManualTurnOpenNow() || !currentRoundId || !myPlayer || scoringInProgress) {
      return;
    }
    const rawState = latestActionStateRef.current;
    const myPs = rawState?.playerStates?.[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.scorecard.scores[category] !== undefined) {
      return;
    }


    const diceValues = myPs.dice.map(d => d.value);

    // Enforce Joker rules: restrict category choices when applicable
    const jokerValid = getJokerValidCategories(myPs.scorecard, diceValues);
    if (jokerValid && !jokerValid.includes(category)) {
      return;
    }

    // Check if this would score zero — ask for confirmation (use Joker score if applicable)
    const potentialScore = jokerValid ? getJokerScore(category, diceValues) : calculateCategoryScore(category, diceValues);
    if (potentialScore === 0) {
      setPendingZeroCategory(category);
      return;
    }

    await commitScoreCategory(category);

  }, [isManualTurnOpenNow, currentRoundId, myPlayer, scoringInProgress]);

  const commitScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isManualTurnOpenNow() || !currentRoundId || !myPlayer || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setActionPending(true);
    let presentationFrozen = false;
    let scorePresentation: { roundId: string; sequence: number } | null = null;
    try {
      await ensureHoldMaskSynced();
      if (activeRoundIdRef.current !== currentRoundId) return;
      const rawState = latestActionStateRef.current;
      const myPs = rawState?.playerStates?.[myPlayer.id];
      if (!myPs || rawState?.currentTurnPlayerId !== myPlayer.id) {
        throw new Error('Yahtzee score lost the exact active-turn identity.');
      }
      const diceValues = myPs.dice.map(d => d.value);
      const jokerValid = getJokerValidCategories(myPs.scorecard, diceValues);
      const pendingScore = jokerValid
        ? getJokerScore(category, diceValues)
        : calculateCategoryScore(category, diceValues);

      setScoringInProgress(true);
      setLastScoredCategory(category);
      setLastScoredValue(pendingScore);

      // If this upper category pushes us to the bonus threshold, fire the overlay now
      if (UPPER_CATEGORIES.includes(category) && myPs.scorecard.scores[category] === undefined) {
        const currentUpperSum = UPPER_CATEGORIES.reduce((s, c) => s + (myPs.scorecard.scores[c] ?? 0), 0);
        const hadBonus = currentUpperSum >= UPPER_BONUS_THRESHOLD;
        const newUpperSum = currentUpperSum + pendingScore;
        if (!hadBonus && newUpperSum >= UPPER_BONUS_THRESHOLD) {
          setShowBonusOverlay(getPlayerUsername(myPlayer));
        }
      }

      const diceForCache: HorsesDieType[] = myPs.dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
      setCachedOpponentDice({ dice: diceForCache, rollKey: myPs.rollKey, playerId: myPlayer.id });
      yahtzeeSync.freezePresentation();
      presentationFrozen = true;
      const scoreStartedAt = Date.now();
      recordGameFreezeTrace('yahtzee.score.request.started', {
        roundId: currentRoundId,
        category,
        expectedActionSequence: rawState.actionSequence ?? 0,
      });
      const result = await applyYahtzeeAction({
        roundId: currentRoundId,
        playerId: myPlayer.id,
        action: 'score',
        category,
        expectedActionSequence: rawState.actionSequence ?? 0,
      });
      recordGameFreezeTrace('yahtzee.score.request.finished', {
        roundId: currentRoundId,
        durationMs: Date.now() - scoreStartedAt,
        outcome: result.outcome,
        actionSequence: result.state.actionSequence ?? null,
      });
      if (activeRoundIdRef.current !== currentRoundId) return;
      if (acceptCommittedState(result.state) === false) return;
      if (result.outcome === 'rejected') {
        throw new Error(`Yahtzee score rejected: ${result.reason ?? 'unknown reason'}`);
      }
      if (result.outcome === 'stale_action') {
        onRefetch();
        return;
      }
      const committedPs = result.state.playerStates[myPlayer.id];
      if (!committedPs) throw new Error('Yahtzee score result omitted the acting player state.');
      if (result.state.lastAction?.type === 'score') {
        scorePresentation = { roundId: currentRoundId, sequence: result.state.lastAction.sequence };
        activeScorePresentationRef.current = scorePresentation;
      }
      setLastScoredValue(result.score ?? pendingScore);
      if (result.terminal) {
        settlementRequestRef.current('terminal-score-rpc-acknowledged', true);
      }
      await new Promise(r => setTimeout(r, YAHTZEE_SCORE_PRESENTATION_MS));
      if (activeRoundIdRef.current !== currentRoundId) return;
      setOptimisticScore({ playerId: myPlayer.id, category, value: result.score ?? pendingScore });
      localDiceRef.current = committedPs.dice;
      localRollsRemainingRef.current = committedPs.rollsRemaining;
      setLocalDice(committedPs.dice);
      setLocalRollsRemaining(committedPs.rollsRemaining);
    } catch (error) {
      recordGameFreezeTrace('yahtzee.score.request.failed', {
        roundId: currentRoundId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.error('[YAHTZEE] Authoritative score failed', error);
      if (activeRoundIdRef.current !== currentRoundId) return;
      onRefetch();
    } finally {
      if (activeRoundIdRef.current !== currentRoundId) return;
      if (scorePresentation) {
        clearActiveScorePresentation(scorePresentation);
      } else {
        setLastScoredCategory(null);
        setLastScoredValue(null);
        setScoringInProgress(false);
        setCachedOpponentDice(null);
      }
      if (presentationFrozen) yahtzeeSync.unfreezePresentation();
      actionInFlightRef.current = false;
      setActionPending(false);
    }
  }, [isManualTurnOpenNow, currentRoundId, myPlayer, acceptCommittedState, ensureHoldMaskSynced, onRefetch, yahtzeeSync, clearActiveScorePresentation]);

  /* ---- P9.3b: end-of-game presentation effect ----
   * Fires on EVERY client (active scorer, non-scoring active, observer) when
   * viewState.gamePhase === 'complete'. Latched per currentRoundId.
   *
   * This effect owns presentation only. The separate persisted-state effect
   * above calls the identity-only settlement RPC from every mounted client.
   */
  useEffect(() => {
    if (!viewState || viewState.gamePhase !== 'complete') return;
    if (!currentRoundId) return;
    if (!dealerGameId || !Number.isInteger(handNumber)) return;
    if (completionLatchRoundIdRef.current === currentRoundId) return;

    console.log('[YAHTZEE] 🏆 completion effect firing', { currentRoundId, currentUserId });

    const results = Object.entries(viewState.playerStates)
      .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
      .sort((a, b) => b.total - a.total);
    if (results.length === 0) return;
    const maxScore = results[0].total;
    const winners = results.filter(r => r.total === maxScore);

    // ── Presentation (all clients) ──
    if (winners.length === 1) {
      const winnerId = winners[0].pid;
      const terminalIdentity = [
        'yahtzee',
        'winseq',
        gameId,
        dealerGameId,
        String(handNumber),
        winnerId,
      ].join('|');
      const presentationRoster = Array.from(
        terminalPresentationRosterRef.current.playersById.values(),
      );
      const winnerPlayer = terminalPresentationRosterRef.current.playersById.get(winnerId);
      if (winnerPlayer) {
        const winnerName = winnerPlayer.is_bot
          ? getBotAlias(presentationRoster, winnerPlayer.user_id)
          : (winnerPlayer.profiles?.username || 'Player');
        const isWinnerMe = winnerPlayer.user_id === currentUserId;
        // Presentation follows the immutable terminal-state roster. A player
        // may have disconnected or become sitting-out after taking a turn;
        // mutable UI activity flags must not remove their chip destination.
        const losers = results
          .filter(result => result.pid !== winnerId)
          .map(result => terminalPresentationRosterRef.current.playersById.get(result.pid))
          .filter((player): player is Player => Boolean(player));
        if (losers.length !== results.length - 1) {
          // The live path should always have the round-scoped roster captured
          // above. If hydration was incomplete, release the exact terminal
          // hold instead of leaving the table permanently wedged waiting for
          // an animation whose endpoints cannot be resolved.
          completionLatchRoundIdRef.current = currentRoundId;
          console.error('[YAHTZEE] Terminal presentation roster incomplete', {
            currentRoundId,
            expectedPlayerIds: results.map(result => result.pid),
            retainedPlayerIds: presentationRoster.map(player => player.id),
          });
          beginTerminalPresentation(terminalIdentity);
          handleTerminalChipAnimationEnd();
          return;
        }

        completionLatchRoundIdRef.current = currentRoundId;

        // Publish liveness before the requestAnimationFrame that begins the
        // visual sequence. Atomic LAST HAND settlement may commit
        // `session_ended` immediately after this persisted terminal state.
        beginTerminalPresentation(terminalIdentity);

        // ── Canonical match_win emit (all clients) ──
        // Co-fired with chip-transfer trigger so rail plate, confetti, and
        // chip animation all paint in the same window. Matches Gin pattern.
        const scoreLine = results.map(r => {
          const p = terminalPresentationRosterRef.current.playersById.get(r.pid);
          const displayName = p
            ? (p.is_bot ? getBotAlias(presentationRoster, p.user_id) : (p.profiles?.username || 'Player'))
            : '?';
          return `${displayName}: ${r.total}`;
        }).join(' • ');
        const matchKey = `yahtzee-match:${dealerGameId ?? 'no-dg'}:${currentRoundId ?? 'no-r'}:${winnerId}:${maxScore}`;
        if (lastEmittedYahtzeeMatchRef.current !== matchKey) {
          lastEmittedYahtzeeMatchRef.current = matchKey;
          recordAnnouncementDebugEvent('lifecycle', 'YAHTZEE-MATCH-WIN-TRACE emit', {
            // PersistentTableShell mounts CanonicalAnnouncementProvider
            // with dealerGameId = games.id (legacy row id), matching
            // the emit convention used by Gin & Cribbage. Yahtzee's
            // prop named `dealerGameId` is actually current_game_uuid
            // (finer dealer-game lifecycle id) — emitting that as the
            // scope caused the provider to reject match_win with
            // scope-mismatch and silently dropped the rail winner
            // plate. Align with shell contract: scope on `gameId`.
            eventScopeDealerGameId: gameId,
            eventScopeRoundId: currentRoundId ?? null,
            propsDealerGameId: dealerGameId ?? null,
            propsRoundId: currentRoundId ?? null,
            propsGameId: gameId,
            winnerId,
            winnerName,
            matchKey,
          });
          announcements.clearAmbient();
          announcements.emit({
            id: `match_win:${matchKey}`,
            type: 'match_win',
            scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
            payload: {
              winnerName,
              text: `${winnerName} Wins! ${scoreLine}`,
              score: { winner: maxScore, loser: results[1]?.total ?? 0 },
            },
            ttlMs: 10000,
          });

          // Paint frame, then winner-only confetti — same sequencing as Gin.
          const fireConfettiAndChips = () => {
            if (isWinnerMe) {
              confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'],
              });
              // Repeating bursts so confetti persists through chip transfer.
              const palette = ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'];
              let bursts = 0;
              const interval = window.setInterval(() => {
                bursts += 1;
                confetti({
                  particleCount: 60,
                  spread: 60,
                  origin: { x: 0.2 + Math.random() * 0.6, y: 0.55 + Math.random() * 0.15 },
                  colors: palette,
                });
                if (bursts >= 4) window.clearInterval(interval);
              }, 700);
            }
            setChipTransferWinnerPos(winnerPlayer.position);
            setChipTransferLoserPositions(losers.map(p => p.position));
            setChipTransferLoserIds(losers.map(p => p.id));
            setChipTransferTriggerId(`yahtzee-win-${currentRoundId}`);
          };
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(fireConfettiAndChips);
          } else {
            fireConfettiAndChips();
          }
        } else {
          setChipTransferWinnerPos(winnerPlayer.position);
          setChipTransferLoserPositions(losers.map(p => p.position));
          setChipTransferLoserIds(losers.map(p => p.id));
          setChipTransferTriggerId(`yahtzee-win-${currentRoundId}`);
        }
      } else {
        // Missing terminal metadata must not strand an already-settled LAST
        // HAND forever. A live client normally retained this player above;
        // release the exact hold if hydration was incomplete.
        completionLatchRoundIdRef.current = currentRoundId;
        console.error('[YAHTZEE] Terminal winner missing from retained roster', {
          currentRoundId,
          winnerId,
          retainedPlayerIds: presentationRoster.map(player => player.id),
        });
        beginTerminalPresentation(terminalIdentity);
        handleTerminalChipAnimationEnd();
      }
    } else {
      completionLatchRoundIdRef.current = currentRoundId;
      console.log('[YAHTZEE] Tie detected; authoritative RPC owns rollover');
    }
  }, [
    viewState?.gamePhase,
    viewState?.playerStates,
    currentRoundId,
    dealerGameId,
    handNumber,
    players,
    gameId,
    currentUserId,
    announcements,
    beginTerminalPresentation,
    handleTerminalChipAnimationEnd,
  ]);

  /* ---- Bot logic ---- */
  // Drive bot control ENTIRELY from authoritative state — never presentation/viewState.
  // Using viewState caused transient wrong-owner flickers to cancel/restart bot sequences.
  const authTurnPlayerId = authoritativeYahtzeeState?.currentTurnPlayerId;
  const authGamePhase = authoritativeYahtzeeState?.gamePhase;
  const authTurnPlayer = players.find(p => p.id === authTurnPlayerId);
  const isOwnedAutoRollTurn = !isRealMoney
    && !authTurnPlayer?.is_bot
    && authTurnPlayer?.auto_fold === true
    && authTurnPlayer?.user_id === currentUserId;
  const isAutomatedTurn = authTurnPlayer?.is_bot === true || isOwnedAutoRollTurn;

  // Safety: reset botProcessingRef when authoritative turn changes away from a bot
  useEffect(() => {
    if (!isAutomatedTurn) {
      console.log('[BOT SAFETY RESET]', {
        roundId: currentRoundId,
        authTurnPlayerId,
        authGamePhase,
        currentUserId,
        botProcessingRef: botProcessingRef.current,
      });
      botProcessingRef.current = false;
    }
  }, [authTurnPlayerId, isAutomatedTurn]);

  useEffect(() => {
    console.warn('[BOT EFFECT MOUNT] BUILD=2026-04-06T17:40Z INSTRUMENTED', {
      roundId: currentRoundId,
      authTurnPlayerId,
      isBotTurn: authTurnPlayer?.is_bot,
      isOwnedAutoRollTurn,
      authGamePhase,
      currentUserId,
      botProcessingRef: botProcessingRef.current,
      activeIdentity: activeBotTurnIdentityRef.current,
      hasAuthState: !!authoritativeYahtzeeState,
    });

    console.log('[BOT TURN ENTRY CHECK]', {
      roundId: currentRoundId,
      authTurnPlayerId,
      isBotTurn: authTurnPlayer?.is_bot,
      isOwnedAutoRollTurn,
      authGamePhase,
      botProcessingRef: botProcessingRef.current,
      hasAuthState: !!authoritativeYahtzeeState,
      controllerUserId: authoritativeYahtzeeState?.botControllerUserId,
      currentUserId,
    });

    if (!currentRoundId || !authoritativeYahtzeeState || authGamePhase !== 'playing') {
      console.log('[BOT TURN EXIT]', { reason: 'precondition-fail', roundId: currentRoundId, authGamePhase, hasAuthState: !!authoritativeYahtzeeState });
      return;
    }
    if (!authTurnPlayerId || !isAutomatedTurn) {
      console.log('[BOT TURN EXIT]', { reason: 'not-automated-turn', authTurnPlayerId, isBot: authTurnPlayer?.is_bot, isOwnedAutoRollTurn });
      return;
    }
    if (botProcessingRef.current) {
      console.log('[BOT TURN EXIT]', { reason: 'botProcessingRef-stuck', authTurnPlayerId });
      return;
    }
    const controllerUserId = authoritativeYahtzeeState.botControllerUserId;
    if (!isOwnedAutoRollTurn && controllerUserId && controllerUserId !== currentUserId) {
      console.log('[BOT TURN EXIT]', { reason: 'not-controller', controllerUserId, currentUserId });
      return;
    }

    // Stable identity for this bot turn — used to detect genuine cancellation vs transient dep churn.
    const turnIdentity = `${currentRoundId}:${authTurnPlayerId}`;

    // If the same bot turn is already running (effect re-fired with same identity due to
    // transient dep churn), don't start another one.
    if (activeBotTurnIdentityRef.current === turnIdentity && botProcessingRef.current) {
      console.log('[BOT TURN EXIT]', { reason: 'same-turn-already-running', turnIdentity });
      return;
    }

    // Snapshot the authoritative state at effect-fire time so the bot runs
    // to completion without being cancelled by its own DB writes updating
    // authoritativeYahtzeeState (which would trigger effect cleanup → deadlock).
    const snapshotState = authoritativeYahtzeeState;

    // Set the identity ref BEFORE the timer — this is what the running bot checks.
    activeBotTurnIdentityRef.current = turnIdentity;

    const isCancelled = (location: string) => {
      const still = activeBotTurnIdentityRef.current === turnIdentity;
      console.log('[BOT CANCEL CHECK]', {
        location,
        cancelled: !still,
        expectedIdentity: turnIdentity,
        activeIdentity: activeBotTurnIdentityRef.current,
        roundId: currentRoundId,
        authTurnPlayerId,
        authGamePhase,
        currentUserId,
        botProcessingRef: botProcessingRef.current,
      });
      if (!still) {
        console.log('[BOT CANCELLED]', {
          reason: 'identity-changed',
          location,
          expected: turnIdentity,
          current: activeBotTurnIdentityRef.current,
        });
      }
      return !still;
    };

    const runBot = async () => {
      let botPlayerId: string | null = null;
      let state: YahtzeeState = { ...snapshotState };
      let ps: YahtzeePlayerState | null = null;
      let activeRoll = -1;
      let lastHolds: boolean[] | null = null;
      let lastPrevRollKey: string | number | undefined;

      // Double-check guard in case of race between timer fire and identity change
      if (isCancelled('runBot:start')) {
        console.log('[BOT TURN EXIT]', {
          reason: 'cancelled-at-timer-fire',
          location: 'runBot:start',
          authTurnPlayerId,
          turnIdentity,
        });
        return;
      }
      if (botProcessingRef.current) {
        console.log('[BOT TURN EXIT]', {
          reason: 'guard-at-timer-fire',
          location: 'runBot:start',
          authTurnPlayerId,
          turnIdentity,
        });
        return;
      }
      botProcessingRef.current = true;
      console.log('[BOT GUARD SET]', { guard: 'botProcessingRef', value: true, roundId: currentRoundId, authTurnPlayerId, turnIdentity });

      try {
        botPlayerId = snapshotState.currentTurnPlayerId!;
        ps = { ...state.playerStates[botPlayerId] };
        const botPlayer = players.find(p => p.id === botPlayerId);
        const botName = botPlayer ? getPlayerUsername(botPlayer) : 'Bot';

        console.log('[BOT TURN START]', {
          roundId: currentRoundId,
          botPlayerId,
          rollsRemaining: ps.rollsRemaining,
          categoriesFilled: Object.keys(ps.scorecard.scores).length,
          turnIdentity,
        });

        for (let roll = 0; roll < 3; roll++) {
          activeRoll = roll;
          const cancelledAtLoopStart = isCancelled(`loop-start:roll-${roll}`);
          if (cancelledAtLoopStart || ps.rollsRemaining <= 0) {
            console.log('[BOT LOOP BREAK]', {
              reason: cancelledAtLoopStart ? 'cancelled' : 'no-rolls',
              location: 'loop-start',
              roll,
              rollsRemaining: ps.rollsRemaining,
              turnIdentity,
            });
            break;
          }

          // Decide holds BEFORE rolling (except first roll)
          if (roll > 0) {
            console.log('[BOT ROLL>0 ENTER]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              rollsRemaining: ps.rollsRemaining,
              dice: describeBotDiceState(ps.dice),
              turnIdentity,
            });
            console.log('[BOT BEFORE HOLD DECISION]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              rollsRemaining: ps.rollsRemaining,
              dice: describeBotDiceState(ps.dice),
              turnIdentity,
            });
            const holds = isYahtzeeStraightDebugEnabled() ? getDebugStraightHoldDecision(ps) : getBotHoldDecision(ps);
            lastHolds = holds;
            console.log('[BOT AFTER HOLD DECISION]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              holds,
              turnIdentity,
            });
            console.assert(isValidBotHoldArray(holds), '[BOT ASSERT] holds array invalid after getBotHoldDecision', {
              roll,
              holds,
              turnIdentity,
            });
            lastPrevRollKey = state.playerStates[botPlayerId]?.rollKey;
            ps = { ...ps, dice: ps.dice.map((d, i) => ({ ...d, isHeld: Boolean(holds[i]) })) };
            console.log('[BOT AFTER HOLD APPLY]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              prevRollKey: lastPrevRollKey,
              rollsRemaining: ps.rollsRemaining,
              dice: describeBotDiceState(ps.dice),
              turnIdentity,
            });
            state = { ...state, playerStates: { ...state.playerStates, [botPlayerId]: { ...ps, rollKey: lastPrevRollKey } } };
            yahtzeeSync.applyOptimistic(state);
            console.log('[BOT AFTER OPTIMISTIC HOLD PROMOTION]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              prevRollKey: lastPrevRollKey,
              promotedDice: describeBotDiceState(state.playerStates[botPlayerId]?.dice),
              turnIdentity,
            });
            console.log('[BOT BEFORE HOLD WAIT]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              waitMs: 900,
              turnIdentity,
            });
            await new Promise(r => setTimeout(r, 900));


            const cancelledAfterHoldWait = isCancelled(`after-hold-wait:roll-${roll}`);
            console.log('[BOT AFTER HOLD WAIT]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              waitMs: 900,
              cancelled: cancelledAfterHoldWait,
              turnIdentity,
            });
            if (cancelledAfterHoldWait) {
              console.log('[BOT LOOP BREAK]', {
                reason: 'cancelled-after-hold-wait',
                location: 'roll>0/post-hold-wait',
                roll,
                turnIdentity,
              });
              break;
            }
          }

          const diceShapeValid = Array.isArray(ps.dice)
            && ps.dice.length === 5
            && ps.dice.every((die) => typeof die?.value === 'number' && typeof die?.isHeld === 'boolean');
          const holdsShapeValid = roll === 0 ? true : isValidBotHoldArray(lastHolds);
          const allDiceHeld = diceShapeValid && ps.dice.every((die) => die.isHeld);
          const illegalAllHeldLock = roll > 0 && allDiceHeld && ps.rollsRemaining > 0 && !(isYahtzeeStraightDebugEnabled() ? shouldDebugStraightStopRolling(ps) : shouldBotStopRolling(ps));

          console.log('[BOT PRE-ROLL INVARIANT]', {
            roundId: currentRoundId,
            botPlayerId,
            roll,
            rollsRemaining: ps.rollsRemaining,
            diceShapeValid,
            holdsShapeValid,
            allDiceHeld,
            illegalAllHeldLock,
            dice: describeBotDiceState(ps.dice),
            holds: lastHolds,
            prevRollKey: lastPrevRollKey,
            turnIdentity,
          });
          console.assert(ps.rollsRemaining > 0, '[BOT ASSERT] ps.rollsRemaining must be > 0 before roll write', {
            roll,
            ps,
            turnIdentity,
          });
          console.assert(diceShapeValid, '[BOT ASSERT] dice array invalid before roll write', {
            roll,
            dice: ps.dice,
            turnIdentity,
          });
          console.assert(holdsShapeValid, '[BOT ASSERT] holds array invalid before roll write', {
            roll,
            holds: lastHolds,
            turnIdentity,
          });
          console.assert(!illegalAllHeldLock, '[BOT ASSERT] all dice effectively locked before reroll write', {
            roll,
            ps,
            holds: lastHolds,
            turnIdentity,
          });

          const rollResult = await (isOwnedAutoRollTurn ? applyYahtzeeAutoRollAction : applyYahtzeeAction)({
            roundId: currentRoundId,
            playerId: botPlayerId,
            action: 'bot_roll',
            holdMask: roll === 0 ? null : lastHolds,
            expectedActionSequence: state.actionSequence ?? 0,
          });
          acceptCommittedState(rollResult.state);
          state = rollResult.state;
          if (rollResult.outcome === 'rejected') {
            throw new Error(`Yahtzee bot roll rejected: ${rollResult.reason ?? 'unknown reason'}`);
          }
          if (rollResult.outcome === 'stale_action') return;
          ps = state.playerStates[botPlayerId];
          if (!ps) throw new Error('Yahtzee bot roll omitted the acting player state.');

          console.log('[BOT POST-ROLL WAIT START]', { roll, turnIdentity });
          await new Promise(r => setTimeout(r, 1800));



          const cancelledAfterRollWait = isCancelled(`after-roll-wait:roll-${roll}`);
          console.log('[BOT POST-ROLL WAIT END]', { roll, turnIdentity, cancelled: cancelledAfterRollWait });

          const diceValues = ps.dice.map(d => d.value);
          if (isYahtzee(diceValues) && diceValues[0] !== 0) {
            setShowYahtzeeOverlay(botName);
          }

          if (cancelledAfterRollWait) {
            console.log('[BOT LOOP BREAK]', {
              reason: 'cancelled-after-roll-wait',
              location: 'post-roll-wait',
              roll,
              turnIdentity,
            });
            break;
          }
          if (ps.rollsRemaining <= 0 || (isYahtzeeStraightDebugEnabled() ? shouldDebugStraightStopRolling(ps) : shouldBotStopRolling(ps))) {
            console.log('[BOT LOOP BREAK]', {
              reason: ps.rollsRemaining <= 0 ? 'all-rolls-used' : 'stop-early',
              location: 'post-roll-evaluation',
              roll,
              rollsRemaining: ps.rollsRemaining,
              shouldStop: isYahtzeeStraightDebugEnabled() ? shouldDebugStraightStopRolling(ps) : shouldBotStopRolling(ps),
              turnIdentity,
            });
            break;
          }
        }

        if (isCancelled('post-loop')) {
          console.log('[BOT TURN EXIT]', {
            reason: 'cancelled-after-loop',
            location: 'post-loop',
            turnIdentity,
          });
          return;
        }
        const category = isYahtzeeStraightDebugEnabled() ? getDebugStraightCategoryChoice(ps) : getBotCategoryChoice(ps);
        console.log('[BOT BEFORE CATEGORY COMMIT]', { roundId: currentRoundId, botPlayerId, chosenCategory: category, score: calculateCategoryScore(category, ps.dice.map(d => d.value)), turnIdentity });


        const botDiceForCache: HorsesDieType[] = ps.dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
        setCachedOpponentDice({ dice: botDiceForCache, rollKey: ps.rollKey, playerId: botPlayerId });

        setLastScoredCategory(category);
        setScoringInProgress(true);

        const scoreResult = await (isOwnedAutoRollTurn ? applyYahtzeeAutoRollAction : applyYahtzeeAction)({
          roundId: currentRoundId,
          playerId: botPlayerId,
          action: 'bot_score',
          category,
          expectedActionSequence: state.actionSequence ?? 0,
        });
        acceptCommittedState(scoreResult.state);
        state = scoreResult.state;
        if (scoreResult.outcome === 'rejected') {
          throw new Error(`Yahtzee bot score rejected: ${scoreResult.reason ?? 'unknown reason'}`);
        }
        if (scoreResult.outcome === 'stale_action') return;
        ps = state.playerStates[botPlayerId];
        if (!ps) throw new Error('Yahtzee bot score omitted the acting player state.');
        const scorePresentation = state.lastAction?.type === 'score'
          ? { roundId: currentRoundId, sequence: state.lastAction.sequence }
          : null;
        if (scorePresentation) activeScorePresentationRef.current = scorePresentation;
        setLastScoredValue(scoreResult.score ?? null);
        if (scoreResult.terminal) {
          settlementRequestRef.current('terminal-bot-score-rpc-acknowledged', true);
        }

        await new Promise(r => setTimeout(r, YAHTZEE_SCORE_PRESENTATION_MS));
        if (!scoreResult.terminal && isCancelled('after-score-wait')) {
          if (scorePresentation) {
            clearActiveScorePresentation(scorePresentation);
          } else {
            setLastScoredCategory(null);
            setLastScoredValue(null);
            setScoringInProgress(false);
            setCachedOpponentDice(null);
          }
          console.log('[BOT TURN EXIT]', {
            reason: 'cancelled-after-score-wait',
            location: 'after-score-wait',
            turnIdentity,
          });
          return;
        }

        if (scorePresentation) {
          clearActiveScorePresentation(scorePresentation);
        } else {
          setLastScoredCategory(null);
          setLastScoredValue(null);
          setScoringInProgress(false);
          setCachedOpponentDice(null);
        }

        console.log('[TURN TRANSITION]', {
          roundId: currentRoundId,
          fromPlayerId: botPlayerId,
          toPlayerId: state.currentTurnPlayerId,
          gamePhase: state.gamePhase,
          turnIdentity,
        });
      } catch (e) {
        console.error('[YAHTZEE] Bot error:', {
          error: e,
          roll: activeRoll,
          ps,
          statePlayerState: botPlayerId ? state.playerStates[botPlayerId] : null,
          holds: lastHolds,
          prevRollKey: lastPrevRollKey,
          turnIdentity,
        });
        onRefetch();
      } finally {
        botProcessingRef.current = false;
        // Only clear identity if it still matches (prevents clearing a newer turn's identity)
        if (activeBotTurnIdentityRef.current === turnIdentity) {
          activeBotTurnIdentityRef.current = null;
        }
        console.log('[BOT GUARD CLEAR]', { guard: 'botProcessingRef', value: false, roundId: currentRoundId, turnIdentity });
      }
    };

    const timer = setTimeout(runBot, 1500);
    return () => {
      clearTimeout(timer);
      // NOTE: We do NOT clear activeBotTurnIdentityRef here.
      // If the bot is already running (timer fired), clearing the identity would cancel it.
      // Instead, the NEXT effect invocation sets the identity to the new turn,
      // and the running bot detects the change via isCancelled().
      // If the timer hasn't fired yet, clearTimeout above prevents it from starting.
      console.log('[BOT EFFECT CLEANUP]', {
        roundId: currentRoundId,
        authTurnPlayerId,
        authGamePhase,
        currentUserId,
        botProcessingRef: botProcessingRef.current,
        turnIdentity,
        activeIdentity: activeBotTurnIdentityRef.current,
      });
    };
    // IMPORTANT: authoritativeYahtzeeState is intentionally excluded from deps.
    // The bot snapshots state at fire-time and runs to completion. Including it
    // would cause the effect to re-fire on every DB write, cancelling the bot mid-turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoundId, authTurnPlayerId, authTurnPlayer?.is_bot, authTurnPlayer?.auto_fold, authTurnPlayer?.user_id, authGamePhase, currentUserId, isAutomatedTurn, isOwnedAutoRollTurn, isRealMoney]);

  /* ---- Felt dice for observer view — reads from viewState (presentation layer) ---- */
  const getCurrentTurnDice = useCallback(() => {
    if (!currentTurnPlayerId || !viewState) return null;
    const ps = viewState.playerStates[currentTurnPlayerId];
    if (!ps) return null;
    // Preserve each die's actual isHeld state so dice stay where the player left them
    // (held dice in held row, rolled dice in scatter) while they choose a category.
    const dice = ps.dice.map(d => ({
      value: d.value,
      isHeld: d.isHeld,
    }));
    return { dice: dice as HorsesDieType[], rollKey: ps.rollKey, heldMaskBeforeComplete: ps.heldMaskBeforeComplete };
  }, [currentTurnPlayerId, viewState]);

  /* ---- Animation origin ---- */
  const getDiceAnimationOrigin = useCallback((): { x: number; y: number } | undefined => {
    if (!currentPlayer) return undefined;
    const playerIdx = activePlayers.findIndex(p => p.id === currentPlayer.id);
    if (playerIdx === -1) return undefined;
    const totalPlayers = activePlayers.length;
    const angle = (playerIdx / totalPlayers) * 2 * Math.PI - Math.PI / 2;
    return { x: 80 * Math.cos(angle), y: 56 * Math.sin(angle) - 40 };
  }, [currentPlayer, activePlayers]);

  /* ---- Scorecard renderer ---- */
  /* ---- Scorecard renderer — reads from viewState for visual stability ---- */
  const renderScorecard = (playerId: string, isInteractive: boolean) => {
    const ps = viewState?.playerStates?.[playerId];
    if (!ps) return null;

    const diceValues = isInteractive && isMyTurn ? localDice.map(d => d.value) : ps.dice.map(d => d.value);
    const rollsUsed = isInteractive && isMyTurn ? localRollsRemaining : ps.rollsRemaining;
    const potentials: Partial<Record<YahtzeeCategory, number>> = {};
    // Joker rule: restrict valid categories when applicable
    const jokerValid = getJokerValidCategories(ps.scorecard, diceValues);

    // Helper: get effective score for a category, considering optimistic + highlight states
    const getEffectiveScore = (cat: YahtzeeCategory): number | undefined => {
      if (isInteractive && lastScoredCategory === cat && lastScoredValue !== null && ps.scorecard.scores[cat] === undefined) {
        return lastScoredValue;
      }
      if (ps.scorecard.scores[cat] !== undefined) return ps.scorecard.scores[cat];
      // Optimistic: DB hasn't caught up yet but we already scored this
      if (optimisticScore && optimisticScore.playerId === playerId && optimisticScore.category === cat) {
        return optimisticScore.value;
      }
      return undefined;
    };

    const effectiveUpperScores = UPPER_CATEGORIES.reduce<Partial<Record<YahtzeeCategory, number>>>((scores, category) => {
      scores[category] = getEffectiveScore(category);
      return scores;
    }, {});
    const upperBonusProgress = getUpperBonusProgress(effectiveUpperScores);
    const upperSum = upperBonusProgress.subtotal;
    const gotBonus = upperSum >= UPPER_BONUS_THRESHOLD;
    const bonusUnachievable = !gotBonus && !upperBonusProgress.isAchievable;

    const renderRow = (categories: YahtzeeCategory[], extra?: React.ReactNode) => (
      <div className="flex gap-1">
        {categories.map(cat => {
          const scored = ps.scorecard.scores[cat];
          const effectiveScored = getEffectiveScore(cat);
          const potential = potentials[cat];
          const jokerBlocked = jokerValid && !jokerValid.includes(cat);
          const isAvailable = effectiveScored === undefined && isInteractive && yahtzeeManualTurnOpen && rollsUsed < 3 && !jokerBlocked;
          const justScored = lastScoredCategory === cat;
          // Show optimistic value when DB hasn't caught up
          const isOptimistic = optimisticScore?.playerId === playerId && optimisticScore?.category === cat && scored === undefined;

          return (
            <button
              key={cat}
              data-yahtzee-category={cat}
              data-yahtzee-category-available={isAvailable && !scoringInProgress ? '1' : '0'}
              onClick={() => isAvailable && !scoringInProgress ? handleScoreCategory(cat) : undefined}
              disabled={!isAvailable || scoringInProgress}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center py-2.5 px-0.5 rounded-md border transition-all min-w-0 min-h-[44px]",
                justScored
                  ? "bg-green-700/70 border-green-400 ring-2 ring-green-400 scale-105"
                  : (scored !== undefined || isOptimistic)
                    ? (effectiveScored === 0)
                      ? "bg-amber-900/50 border-red-500/70 border-2"
                      : "bg-amber-900/50 border-green-500/70 border-2"
                    : isAvailable && !scoringInProgress && localRollsRemaining === 0
                      ? "bg-amber-800/40 border-poker-gold hover:bg-amber-700/50 cursor-pointer opacity-50"
                      : "bg-muted/20 border-muted-foreground/30 opacity-50"
              )}
            >
              <span className={cn(
                "font-bold text-[10px] leading-tight",
                isAvailable && !scoringInProgress && localRollsRemaining === 0
                  ? "text-white"
                  : "text-amber-200"
              )}>{CATEGORY_LABELS[cat]}</span>
              <span className={cn(
                "font-bold tabular-nums leading-tight",
                justScored
                  ? "text-white text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                  : (scored !== undefined || isOptimistic) ? "text-white text-sm" : "text-transparent text-sm"
              )}>
                {justScored && lastScoredValue !== null ? lastScoredValue : effectiveScored !== undefined ? effectiveScored : '\u00A0'}
              </span>
              {/* Yahtzee bonus checkmarks – overlaid so they don't add height */}
              {cat === 'yahtzee' && ps.scorecard.yahtzeeBonuses > 0 && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {Array.from({ length: ps.scorecard.yahtzeeBonuses }, (_, i) => (
                    <Check key={i} className="w-2.5 h-2.5 text-poker-gold" />
                  ))}
                </div>
              )}
            </button>
          );
        })}
        {extra}
      </div>
    );

    return (
      <div
        className="w-full space-y-1"
        data-yahtzee-scorecard=""
        data-yahtzee-scorecard-branch={isInteractive ? 'self-turn:interactive' : 'opponent-turn:readonly'}
        data-yahtzee-scorecard-player-id={playerId}
        data-yahtzee-scorecard-active-player-id={currentTurnPlayerId ?? ''}
        data-yahtzee-scorecard-round-id={currentRoundId ?? ''}
        data-yahtzee-scorecard-hand-number={String(viewState?.currentRound ?? '')}
        data-yahtzee-scorecard-submission-state={scoringInProgress ? 'in-progress' : 'idle'}
        data-yahtzee-scorecard-react-key={`sc:${playerId}`}
      >
        {renderRow(UPPER_CATEGORIES, (
          <div className={cn(
            "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-md border min-w-0 min-h-[44px]",
            gotBonus
              ? "bg-green-800/60 border-green-400"
              : bonusUnachievable
                ? "bg-amber-900/50 border-red-500/70 border-2"
                : "bg-muted/20 border-muted-foreground/40"
          )}>
            {gotBonus ? (
              <>
                <span className="font-bold text-amber-200 tabular-nums text-sm leading-tight">
                  {upperSum}/{UPPER_BONUS_THRESHOLD}
                </span>
                <span className="flex items-center gap-0.5 font-bold text-green-400 tabular-nums text-sm leading-tight">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  +35
                </span>
              </>
            ) : bonusUnachievable ? (
              <>
                <span className="font-bold text-amber-200 tabular-nums text-sm leading-tight">
                  {upperSum}/{UPPER_BONUS_THRESHOLD}
                </span>
                <Ban className="w-4 h-4 text-red-400" aria-label="Upper bonus no longer achievable" />
              </>
            ) : (
              <>
                <span className="font-bold text-amber-200 tabular-nums text-sm leading-tight">
                  {upperSum}/{UPPER_BONUS_THRESHOLD}
                </span>
                <span className={cn(
                  "font-bold tabular-nums text-sm leading-tight",
                  upperBonusProgress.pace > 0
                    ? "text-green-400"
                    : upperBonusProgress.pace < 0
                      ? "text-red-400"
                      : "text-muted-foreground"
                )}>
                  {upperBonusProgress.pace > 0 ? `+${upperBonusProgress.pace}` : upperBonusProgress.pace}
                </span>
              </>
            )}
          </div>
        ))}
        {renderRow(LOWER_CATEGORIES)}
        {isInteractive && (
          <div className="flex justify-center">
            <div className="flex flex-col items-center py-1.5 px-3 rounded-md border bg-poker-gold/20 border-poker-gold/60">
              <span className="font-bold text-poker-gold text-[10px] leading-tight">TOTAL</span>
              <span className="font-bold text-poker-gold tabular-nums text-sm leading-tight">
                {(() => {
                  let total = getTotalScore(ps.scorecard);
                  if (optimisticScore?.playerId === playerId && ps.scorecard.scores[optimisticScore.category] === undefined) {
                    total += optimisticScore.value;
                    // If this optimistic score triggers upper bonus
                    if (gotBonus && !hasUpperBonus(ps.scorecard)) total += UPPER_BONUS_VALUE;
                  }
                  return total;
                })()}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* Wave 3 / 3C Yahtzee chip primitive cleanup:
     renderPlayerChip removed — shell-owned CanonicalSeatCluster now
     renders the opponent chip disc/stack from presentation state
     (chipValue / statusRing / scoreLine). Games emit state; shell
     renders artifacts. No JSX escape hatch remains here. */


  /* ---- Startup: canonical shell chrome stays mounted continuously ----
     Aligned with the Gin Rummy fix (see GinRummyGameTable.tsx ~L2187).
     Do NOT early-return a placeholder that would unmount ShellHudGrid,
     the opponent CanonicalSeatCluster, chip bubbles, identity row, or
     the announcement rail. The outer layout stays mounted from slot
     mount onward. Only gameplay-specific sub-trees that REQUIRE a
     hydrated viewState are gated behind `isPlayable`. */
  const isPlayable = !!viewState && !!currentRoundId;

  /* ================================================================ */
  /*  RENDER – mirrors MobileGameTable layout exactly                  */
  /* ================================================================ */
  // Build stamp moved to DiceTraceControl component

  return (
    // Shell-owned felt is the sole canonical mount. The outer surface
    // MUST be transparent so the shell ellipse remains continuously
    // visible. Per-region opaque panels (bottom action panel, dialogs)
    // keep their own backgrounds.
    <div className="flex flex-col h-full min-h-0 overflow-hidden relative bg-transparent">


      {/* DEBUG: visible build verification badge + dice trace controls */}
      <DiceTraceControl />

      {/* Overlays */}
      <YahtzeeRollOverlay
        playerName={showYahtzeeOverlay || ''}
        visible={!!showYahtzeeOverlay}
        onDone={() => setShowYahtzeeOverlay(null)}
      />
      <UpperBonusOverlay
        playerName={showBonusOverlay || ''}
        visible={!!showBonusOverlay}
        onDone={() => setShowBonusOverlay(null)}
      />
      <YahtzeeBonusOverlay
        playerName={showYahtzeeBonusOverlay?.playerName || ''}
        bonusCount={showYahtzeeBonusOverlay?.count || 0}
        visible={!!showYahtzeeBonusOverlay}
        onDone={() => setShowYahtzeeBonusOverlay(null)}
      />
      {/* Bespoke WinnerOverlay retired — canonical shell announcement
          rail renders the match_win plate for all viewers. */}
      {/* Zero-score confirmation dialog */}
      <AlertDialog open={!!pendingZeroCategory} onOpenChange={(open) => { if (!open) setPendingZeroCategory(null); }}>
        <AlertDialogContent className="bg-gradient-to-br from-amber-950 to-amber-900 border-2 border-amber-500">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-100 text-lg">
              Take a zero?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-amber-200 text-base">
              Are you sure you want to take 0 for {pendingZeroCategory ? CATEGORY_FULL_NAMES[pendingZeroCategory] : ''}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              onClick={() => setPendingZeroCategory(null)}
              className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const cat = pendingZeroCategory;
                setPendingZeroCategory(null);
                if (cat) commitScoreCategory(cat);
              }}
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Yes, take 0
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== TABLE AREA (felt with bridge background) =====
          Height is OWNED BY THE SHELL via --shell-play-h. Must match
          the canonical pattern used by MobileGameTable / GinRummy /
          NeutralInterstitial — never a bespoke vw/vh formula, which
          drifts from the shell ellipse and pushes HUD off-screen. */}
      {/* Phase 1 parity: canonical top safe-area spacer — matches
          MobileGameTable/NeutralInterstitial. */}
      <div
        aria-hidden
        data-canonical-shell-play-top-spacer=""
        style={{ flex: '0 0 var(--play-top-safe-area, 0px)', pointerEvents: 'none' }}
      />
      <div ref={tableContainerRef} className="relative overflow-visible" style={{ height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)' }}>

        {/* Wave 5D — Yahtzee anchored gameplay stages.
            Provider resolves descriptors once; consumer slots render
            with ONE descriptor → ONE placement → ONE renderer → ONE
            DOM root. No magic top-[N%] / translate() positioning. */}
        <YahtzeeGameplayGeometryProvider
          opponentDiceVisible={gamePhase === 'playing' && !!currentPlayer && !(showInteractiveScorecard && !!myPlayer)}
          scorecardVisible={gamePhase === 'playing' && !!currentPlayer && showInteractiveScorecard && !!myPlayer}
        >

        {/* Shell owns canonical felt + game-name plate. No local mount. */}


        {/* Per-player totals are shown inside the scorecard (TOTAL cell)
            and in each seat cluster — no separate floating overlay on
            felt to avoid colliding with the opponent chip stack. */}

        {/* Dice on felt (observer view) OR scorecard (my turn) */}
        {gamePhase === 'playing' && currentPlayer && (() => {
          if (showInteractiveScorecard && myPlayer) {
            // My turn (or sticky-latched within the turn-transition window):
            // show interactive scorecard ON the felt (anchored stage).
            return (
              <YahtzeeAnchoredInteractionSlot
                artifactId="yahtzee.scorecardStage"
                innerStyle={{ alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{ width: '100%', maxWidth: 340 }}>
                  {renderScorecard(myPlayer.id, true)}
                </div>
              </YahtzeeAnchoredInteractionSlot>
            );
          }

          const diceState = getCurrentTurnDice();
          const hasRolled = diceState?.dice.some(d => d.value !== 0);
          const committedScoreDice = remoteScorePresentation.action ? {
            dice: remoteScorePresentation.action.dice.map(die => ({
              value: die.value,
              isHeld: die.isHeld,
            })),
            playerId: remoteScorePresentation.action.playerId,
          } : null;
          const scoreDice = cachedOpponentDice?.playerId === presentedOpponentPlayerId
            ? cachedOpponentDice
            : committedScoreDice;

          // The atomic score commit has already reset/advanced authoritative
          // turn dice. Keep the scorer's committed dice on the felt until the
          // presentation-only selection highlight releases the new turn.
          const useCached = remoteScorePresentation.active && !!scoreDice;

          if (!hasRolled && !useCached) {
            return null;
          }

          const feltDice = useCached ? scoreDice!.dice : diceState!.dice;
          // When using cached dice, pass undefined rollKey so no fly-in animation plays
          const feltRollKey = useCached ? undefined : diceState!.rollKey;
          // Stable cache key prevents remount when switching live→cached
          const stableCacheKey = useCached ? scoreDice!.playerId : (currentTurnPlayerId ?? "no-turn");

          return (
            <YahtzeeAnchoredSlot artifactId="yahtzee.opponentDiceStage">
              <AssignedRectFitter>
                <DiceTableLayout
                  key={stableCacheKey}
                  dice={feltDice}
                  isRolling={false}
                  canToggle={false}
                  size="md"
                  gameType="yahtzee"
                  showWildHighlight={false}
                  isObserver={true}
                  hideUnrolledDice={true}
                  animationOrigin={useCached ? undefined : getDiceAnimationOrigin()}
                  rollKey={feltRollKey}
                  heldMaskBeforeComplete={useCached ? undefined : diceState?.heldMaskBeforeComplete}
                  cacheKey={stableCacheKey}
                  traceContext={useCached ? undefined : {
                    gameId,
                    dealerGameId: dealerGameId ?? null,
                    roundId: currentRoundId ?? null,
                    handNumber: viewState?.currentRound ?? 0,
                    turnPlayerId: currentTurnPlayerId ?? null,
                    rollNumber: (() => {
                      const ps = viewState?.playerStates?.[currentTurnPlayerId ?? ''];
                      return ps ? 3 - ps.rollsRemaining : 0;
                    })(),
                    authoritativeDice: (() => {
                      const ps = authoritativeYahtzeeState?.playerStates?.[currentTurnPlayerId ?? ''];
                      return ps?.dice?.map(d => ({ value: d.value, isHeld: d.isHeld }));
                    })(),
                  }}
                />
              </AssignedRectFitter>
            </YahtzeeAnchoredSlot>
          );
        })()}

        </YahtzeeGameplayGeometryProvider>


        {/* Game complete — no static overlay here, WinnerOverlay handles it */}

        {/* Chip transfer animation */}
        <ChipTransferAnimation
          presentationOwned
          triggerId={chipTransferTriggerId}
          amount={anteAmount}
          winnerPosition={chipTransferWinnerPos}
          loserPositions={chipTransferLoserPositions}
          loserPlayerIds={chipTransferLoserIds}
          currentPlayerPosition={myPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          containerRef={tableContainerRef}
          onAnimationEnd={handleTerminalChipAnimationEnd}
        />

        {/* Canonical seat clusters — shell anchors drive all chip positioning.
            For 2P inherently-two-player games (Yahtzee), seatAnchors
            canonicalizes the opponent to the ergonomic top slot regardless
            of absolute seat number, matching Cribbage/Gin. */}
        {(() => {
          // If auth identity is not threaded yet, treat seat projection as
          // not ready. Rendering as an observer for one frame can show the
          // seated viewer's own chip before self-suppression can resolve.
          if (!currentUserId) return null;
          const viewerIsSeated = activePlayers.some(p => p.user_id === currentUserId);
          // For seated viewers only: defer rendering until anchors resolve
          // viewerPosition (avoids one-frame self-bubble flash).
          if (viewerIsSeated && shellAnchors?.viewerPosition == null) return null;
          const opponents = activePlayers.filter(
            p => !currentUserId || p.user_id !== currentUserId,
          );
          return (
            <GameplayOpponentSeatLayer
              family="yahtzee"
              participants={opponents.map(p => ({
                id: p.id,
                position: p.position,
                name: getPlayerUsername(p),
                chips: p.chips,
              }))}
              presentation={{
                // Dice families have no dealer concept.
                dealerPip: () => false,
                chipValue: (p) => formatChipBalance(p.chips),
                autoRoll: (p) => {
                  const player = players.find(candidate => candidate.id === p.id);
                  return !isRealMoney && player?.auto_fold === true && !player.is_bot;
                },
                activeTimer: (p) => (
                  p.id === stableTurnPlayerId && yahtzeeHumanTimedTurn
                    ? {
                        timeLeft: yahtzeeSecondsRemaining,
                        maxTime: decisionTimerSeconds,
                        activePlayerId: stableTurnPlayerId,
                      }
                    : null
                ),
                scoreLine: (p) => {
                  const ps = viewState?.playerStates?.[p.id];
                  const total = ps ? getTotalScore(ps.scorecard) : 0;
                  return `Score: ${total}`;
                },
              }}
            />
          );
        })()}


        {/* Dealer affordance for the local player is inlined into the
            active-player identity row below — no global vertical
            reservation on the shell for a control that only applies
            to the active dealer. */}
      </div>

      {/* ═══════ UNIFIED BOTTOM SECTION — shell-owned 5-row HUD grid (Phase 2b.2.5) ═══════
          Identity-extraction pilot: the active-player identity strip is
          lifted out of the cards tab into the canonical row 5 (identity)
          slot. Row 5 is now authoritatively shell-owned across phases
          (cards / chat / lobby / history). Row 4 (pane) is reserved for
          tab content only and MUST NOT spill into row 5. */}
      {/* Phase 1 parity: canonical bottom safe-area spacer. */}
      <div
        aria-hidden
        data-canonical-shell-play-bottom-spacer=""
        style={{ flex: '0 0 var(--play-bottom-safe-area, 0px)', pointerEvents: 'none' }}
      />
      <ShellHudGrid
        timer={
          yahtzeeShellTimerState ? <ShellTimerRail /> : <div
            data-shell-operational-hud=""
            className="w-full h-full flex min-w-0 items-center justify-center px-3 overflow-hidden whitespace-nowrap"
          >
            {gamePhase === 'playing' && (
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs tabular-nums">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2">
                  {activePlayers.map(p => {
                    const ps = viewState?.playerStates?.[p.id];
                    const total = ps ? getTotalScore(ps.scorecard) : 0;
                    const isTurn = p.id === currentTurnPlayerId;
                    const name = getPlayerUsername(p);
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          'flex min-w-0 items-center justify-center gap-1 font-semibold',
                          isTurn ? 'text-poker-gold' : 'text-muted-foreground',
                        )}
                        aria-label={`${name}: ${total}`}
                      >
                        <span className="min-w-0 truncate" title={name}>{name}</span>
                        <span className="shrink-0">: {total}</span>
                      </div>
                    );
                  })}
                </div>
                {currentPlayer ? (
                  <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px] tabular-nums">
                    R: {isMyTurn ? localRollsRemaining : (currentTurnState?.rollsRemaining ?? 0)}
                  </Badge>
                ) : null}
              </div>
            )}
          </div>
        }
        pane={
          <div className="h-full overflow-hidden">
            {/* CARDS/DICE TAB */}
            {activeTab === 'cards' && (
              <div ref={paneContentRef} data-yahtzee-active-pane-content="" className="px-1 h-full overflow-y-auto flex flex-col justify-start pt-2">


                {/* Dice area — only reserve space when actually rendering
                    dice for the viewer. When observing an opponent, dice
                    are shown on the felt above and reserving min-height
                    here would leave a ~60px empty gap before the
                    opponent scorecard. */}
                {showMyDice && (
                  <div
                    className="flex items-center justify-center mb-1"
                    style={{ gap: `${dieRowLayout?.gapPx ?? 4}px` }}
                  >
                    {localDice.map((die, idx) => {
                      const heldAtRollStart = heldSnapshotRef.current?.[idx] ?? die.isHeld;
                      const shouldAnimate = rolling && !heldAtRollStart;
                      const showHeldStyling = localRollsRemaining > 0 && die.isHeld && !shouldAnimate;

                      return (
                        <HorsesDie
                          key={idx}
                          value={die.value}
                          isHeld={showHeldStyling}
                          isRolling={shouldAnimate}
                          canToggle={yahtzeeManualTurnOpen && !rolling && !actionPending && localRollsRemaining > 0 && localRollsRemaining < 3}
                          onToggle={() => handleToggleHold(idx)}
                          size={resolvedDieSize}
                          sizePx={fluidDiePx ?? undefined}
                          showWildHighlight={false}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Action strip (Wave 2F.2) — single canonical slot owns
                    the reservation across Roll → Waiting → Pick-a-category
                    so the dice tray above and any sibling below never
                    reflow when the variant swaps. The strip belongs to the
                    incoming player only after a remote scorer's presentation
                    releases; opponent-turn UI uses the scorecard block below. */}
                {gamePhase === 'playing' && isMyTurn && !isPaused && !remoteScorePresentation.active && (
                  <ActionStripSlot
                    data-authoritative-action-surface={yahtzeeManualTurnOpen ? 'yahtzee-turn' : undefined}
                    className="mt-1 mb-1"
                    density="compact"
                  >
                    {isMyAutoRollTurn ? (
                      <ActionStripStatusPill emphasis="muted">
                        Auto-rolling…
                      </ActionStripStatusPill>
                    ) : !yahtzeeManualTurnOpen ? (
                      <ActionStripStatusPill emphasis="muted">
                        {yahtzeeDeadlineExpired ? 'Waiting for timeout recovery…' : 'Waiting for turn timer…'}
                      </ActionStripStatusPill>
                    ) : scoringInProgress ? (
                      <ActionStripStatusPill emphasis="muted">
                        Scoring…
                      </ActionStripStatusPill>
                    ) : localRollsRemaining > 0 ? (
                      <ActionStripButtonRow>
                        <Button
                          size="sm"
                          onClick={handleRoll}
                          disabled={rolling || actionPending}
                          aria-busy={actionPending || holdSyncPending}
                          className="font-bold text-sm px-6"
                        >
                          <RotateCcw className="w-4 h-4 mr-2 animate-slow-pulse-red" />
                          Roll {rollNumber}
                        </Button>
                      </ActionStripButtonRow>
                    ) : (
                      <ActionStripBadge tone="info">Pick a category</ActionStripBadge>
                    )}
                  </ActionStripSlot>
                )}

                {gamePhase === 'playing' && myPlayer?.auto_fold && !myPlayer.sitting_out && (
                  <label
                    data-yahtzee-auto-roll=""
                    className="mt-2 flex items-center justify-center gap-2 text-xs text-amber-500 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={(event) => {
                        if (!event.target.checked) onAutoFoldChange?.(myPlayer.id, false);
                      }}
                      className="h-4 w-4 rounded border-2 border-border accent-primary"
                    />
                    <span>Auto-roll enabled (uncheck to rejoin)</span>
                  </label>
                )}

                {/* Opponent scorecard when it's not my turn */}
                {presentedOpponentPlayerId && presentedOpponentPlayerId !== myPlayer?.id && gamePhase === 'playing' && (
                  <div className="px-1 relative">
                    <div className="yahtzee-opponent-scorecard">
                      {renderScorecard(presentedOpponentPlayerId, false)}
                    </div>
                  </div>
                )}

                {/* My scorecard (read-only summary) when it IS my turn - interactive one is on felt */}
                {isMyTurn && !remoteScorePresentation.active && myPlayer && (
                  <div className="mt-1 px-1 opacity-60">
                    <span className="text-xs text-muted-foreground">Your scorecard is on the table above</span>
                  </div>
                )}

                {/* Identity strip lifted to shell row 5 (2b.2.5). */}
              </div>
            )}

            {/* CHAT TAB — canonical shared shell chat */}
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

            {/* LOBBY TAB */}
            {activeTab === 'lobby' && (
              <div className="h-full overflow-y-auto p-3 space-y-2">
                {activePlayers.map(player => {
                  const ps = viewState?.playerStates?.[player.id];
                  const total = ps ? getTotalScore(ps.scorecard) : 0;
                  return (
                    <div key={player.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-foreground">{getPlayerUsername(player)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">Score: {total}</span>
                        <span className={cn(
                          "text-sm font-bold",
                          player.chips < 0 ? 'text-destructive' : 'text-poker-gold'
                        )}>
                          <PresentationChipBalance playerId={player.id} rawBalance={player.chips} prefix="" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && gameId && (
              <div className="h-full overflow-y-auto">
                <HandHistory gameId={gameId} />
              </div>
            )}
          </div>
        }
        identity={
          myPlayer ? (
            <div className="w-full h-full flex items-center justify-center gap-2 px-3 overflow-hidden">
              <QuickEmoticonPicker onSelect={() => {}} disabled={true} />
              {/* Dice families (Yahtzee/Horses/SCC) have no dealer concept;
                  the identity row never renders a dealer indicator. */}
              <p className="text-sm font-semibold text-foreground truncate">
                {myPlayer.profiles?.username || 'You'}
                <span className="ml-1 text-green-500">(active)</span>
              </p>
              <span data-chip-delta-anchor={`player:${myPlayer.id}`} className={cn(
                "font-bold text-lg tabular-nums",
                myPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'
              )}>
                <PresentationChipBalance playerId={myPlayer.id} rawBalance={myPlayer.chips} prefix="" />
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
