/**
 * YahtzeeGameTable – mirrors MobileGameTable's visual layout for dice games.
 *
 * Uses the same oval felt with Peoria bridge background, chip stacks around the table,
 * tab bar, timer, and bottom section structure as MobileGameTable does for Horses/SCC.
 */

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
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
import { ChipTransferAnimation } from "./ChipTransferAnimation";
import { CanonicalChipDisc } from "./canonicalShell/CanonicalChipDisc";
import { CanonicalChipstack } from "./canonicalShell/CanonicalChipstack";
import confetti from "canvas-confetti";
import { MusicToggleButton } from "./MusicToggleButton";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { ValueChangeFlash } from "./ValueChangeFlash";
import { YahtzeeRollOverlay, UpperBonusOverlay, YahtzeeBonusOverlay } from "./YahtzeeOverlays";
import {
  YahtzeeState, YahtzeeCategory, CATEGORY_LABELS,
  UPPER_CATEGORIES, LOWER_CATEGORIES, YahtzeeDie, YahtzeePlayerState,
  UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE,
} from "@/lib/yahtzeeTypes";
import { CATEGORY_FULL_NAMES } from "@/lib/yahtzeeTypes";
import { calculateCategoryScore } from "@/lib/yahtzeeScoring";
import {
  rollYahtzeeDice, toggleYahtzeeHold,
  scoreYahtzeeCategory, advanceYahtzeeTurn,
} from "@/lib/yahtzeeGameLogic";
import { getPotentialScores, getTotalScore, isYahtzee, getUpperSubtotal, hasUpperBonus, getJokerValidCategories, getJokerScore } from "@/lib/yahtzeeScoring";
import {
  getBotHoldDecision, getBotCategoryChoice, shouldBotStopRolling,
} from "@/lib/yahtzeeBotLogic";
import {
  getDebugStraightHoldDecision, getDebugStraightCategoryChoice, shouldDebugStraightStopRolling,
} from "@/lib/yahtzeeBotDebugStraight";
import { isYahtzeeStraightDebugEnabled } from "@/lib/debugFlags";
import { supabase } from "@/integrations/supabase/client";
import { getBotAlias } from "@/lib/botAlias";
import { cn, formatChipValue } from "@/lib/utils";
import { RotateCcw, MessageSquare, User, Clock, Check } from "lucide-react";
import { recordGameResult, snapshotPlayerChips } from "@/lib/gameLogic";
import { endYahtzeeRound } from "@/lib/yahtzeeRoundLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { HandHistory } from "./HandHistory";
import { MobileChatPanel } from "./MobileChatPanel";
import { useGameChat } from "@/hooks/useGameChat";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";
// Shell owns canonical felt — no local canonical felt import.
import { useShellFeltContext, usePublishShellFelt } from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { useShellTabBar } from "@/lib/canonicalShell/ShellTabBar";
import { ShellHudGrid } from "@/lib/canonicalShell/ShellHudGrid";
import { useAnnouncements } from "@/lib/canonicalShell/announcements";
import { recordAnnouncementDebugEvent } from "@/lib/canonicalShell/announcements/announcementDebugLog";
import { useRequiredSeatAnchors } from "@/lib/canonicalShell/SeatAnchorLayer";
import {
  ActionStripSlot,
  ActionStripButtonRow,
  ActionStripBadge,
  ActionStripStatusPill,
} from "@/components/canonicalShell/actionStrip";
import { CanonicalSeatCluster } from "@/lib/canonicalShell/CanonicalSeatCluster";
import type { CanonicalSlot } from "@/lib/canonicalShell/seatAnchors";
import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";
import { YahtzeeGameplayGeometryProvider } from "@/lib/wave5GameplayGeometry/YahtzeeGameplayGeometryProvider";
import { YahtzeeAnchoredSlot } from "@/components/YahtzeeAnchoredSlot";

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
  yahtzeeState: YahtzeeState | null;
  onRefetch: () => void;
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function updateYahtzeeState(roundId: string, state: YahtzeeState): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ yahtzee_state: state } as any)
    .eq("id", roundId);
  return error;
}

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function YahtzeeGameTable({
  gameId, players, currentUserId, pot, anteAmount, dealerPosition,
  currentRoundId, dealerGameId, yahtzeeState, onRefetch, isHost = false, onPlayerClick,
}: YahtzeeGameTableProps) {
  // SHELL LC: mount marker for comparative branch-swap evidence.
  useLifecycleMount('YahtzeeGameTable');


  // Publish canonical felt context to the shell-owned host. The shell
  // is the sole canonical felt mount; there is no local felt branch.
  usePublishShellFelt({
    gameKind: 'yahtzee',
    anteAmount,
    isWaitingPhase: false,
    publisherLabel: 'YahtzeeGameTable',
  });

  // Canonical shared chat — same shell experience as Cribbage/Gin.
  const { allMessages, sendMessage, isSending: isChatSending } = useGameChat(gameId, players, currentUserId);



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
          import('@/lib/yahtzeeHeldDieTrace').then(({ traceYahtzeeHeldDie, buildDieTuples, isYahtzeeHeldTraceEnabled }) => {
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
  // Alias: all RENDER paths use viewState; all MUTATION/BOT paths use yahtzeeState
  const viewState = stableYahtzeeState;

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

    import('@/lib/yahtzeeHeldDieTrace').then(({ traceYahtzeeHeldDie, buildDieTuples, isYahtzeeHeldTraceEnabled }) => {
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

  const [isRolling, setIsRolling] = useState(false);
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
  const localRollKeyRef = useRef<string | undefined>(undefined);
  /** Monotonic counter for generating unique rollKeys across all rolls in this session */
  const rollSerialRef = useRef(0);
  // Track opponent scorecard to detect when a new category is scored remotely
  const prevOpponentScorecardRef = useRef<Record<string, Record<string, number | undefined>>>({});
  // Cache last opponent's dice so they stay visible on felt during scoring highlight transition
  const [cachedOpponentDice, setCachedOpponentDice] = useState<{ dice: HorsesDieType[]; rollKey?: string | number; playerId: string } | null>(null);
  // Always track last non-zero dice for current turn player (used to cache for scoring transition)
  const lastNonZeroDiceRef = useRef<{ dice: HorsesDieType[]; rollKey?: string | number; playerId: string } | null>(null);
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
    prevOpponentScorecardRef.current = {};
    lastNonZeroDiceRef.current = null;
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
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');

  // Local dice state — OWNED by the active player during their turn.
  // Seeded from DB once on turn start; after that, only local actions mutate it.
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
  // Ref for pending debounced hold DB write (batches rapid toggles into one write)
  const pendingHoldUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which turn we've already seeded localDice for, so we seed exactly once per turn.
  const turnSeededKeyRef = useRef<string | null>(null);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  const shellAnchors = useRequiredSeatAnchors('yahtzee');
  // Render-facing derived values use viewState (presentationState) for visual stability
  const gamePhase = viewState?.gamePhase || 'waiting';
  const currentTurnPlayerId = viewState?.currentTurnPlayerId;

  // Direct turn usage — no ready-gate. Scoring + turn advance are atomic writes,
  // so there is no intermediate state to cause flicker.
  const stableTurnPlayerId = currentTurnPlayerId || null;
  const currentPlayer = players.find(p => p.id === stableTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId && gamePhase === 'playing';

  // Publish tab metadata to the shell-owned tab bar.
  useShellTabBar({
    cardsIcon: 'dice',
    activeTab,
    setActiveTab,
    cardsFlashing: (isMyTurn && activeTab !== 'cards' && gamePhase === 'playing') ? 'red' : null,
  });
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const currentTurnState = stableTurnPlayerId ? viewState?.playerStates?.[stableTurnPlayerId] : null;

  const getPlayerUsername = (player: Player) =>
    player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || 'Player');

  // ── Phase 5: Canonical match_win emit ────────────────────────────────
  // Emit moved into the completion presentation effect below (co-fired
  // with chip-transfer trigger + winner confetti, matching Gin/Cribbage).
  // Keeping the announcements handle here for the chip-transfer effect.
  const announcements = useAnnouncements();
  const lastEmittedYahtzeeMatchRef = useRef<string | null>(null);


  // Scores — derived from viewState for render stability
  const allTotals = useMemo(() =>
    Object.entries(viewState?.playerStates || {}).map(([pid, ps]) => ({
      pid, total: getTotalScore(ps.scorecard),
    })), [viewState?.playerStates]);
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  const rolling = uiRolling || isRolling;
  const rollNumber = Math.min(3, Math.max(1, 4 - localRollsRemaining));
  const showMyDice = isMyTurn && gamePhase === "playing" && localRollsRemaining < 3;

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
    availableWidth: Math.max(0, paneWidthPx - 16), // px-2 × 2 sides
    count: 5,
    minDieSize: 28,
    maxDieSize: 96,
    gapPx: 4,
  });
  const resolvedDieSize = dieRowLayout ? snapToDieSize(dieRowLayout.dieSize) : "lg";

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
  useEffect(() => {
    if (isMyTurn) {
      if (scorecardUnmountTimerRef.current) {
        clearTimeout(scorecardUnmountTimerRef.current);
        scorecardUnmountTimerRef.current = null;
      }
      setStickyScorecardMounted(true);
      return;
    }
    if (stickyScorecardMounted && !scorecardUnmountTimerRef.current) {
      scorecardUnmountTimerRef.current = setTimeout(() => {
        setStickyScorecardMounted(false);
        scorecardUnmountTimerRef.current = null;
      }, 350);
    }
  }, [isMyTurn, stickyScorecardMounted]);
  useEffect(() => () => {
    if (scorecardUnmountTimerRef.current) clearTimeout(scorecardUnmountTimerRef.current);
  }, []);
  const showInteractiveScorecard = isMyTurn || stickyScorecardMounted;

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
  // After seeding, localDice is the sole source of truth for the active player's dice.
  // No mid-turn DB→localDice sync — rolls, holds, and scores all mutate localDice directly.
  // DB writes are fire-and-forget persistence; the UI never reads back from DB mid-turn.
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
  }, [viewState?.playerStates, optimisticScore]);

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

  /* ---- Track opponent's last non-zero dice for caching during scoring ---- */
  useEffect(() => {
    if (!viewState || !currentTurnPlayerId || currentTurnPlayerId === myPlayer?.id) return;
    const ps = viewState.playerStates[currentTurnPlayerId];
    if (!ps) return;
    const hasNonZero = ps.dice.some(d => d.value !== 0);
    if (hasNonZero) {
      lastNonZeroDiceRef.current = {
        dice: ps.dice.map(d => ({ value: d.value, isHeld: d.isHeld })),
        rollKey: ps.rollKey,
        playerId: currentTurnPlayerId,
      };
    }
  }, [viewState?.playerStates, currentTurnPlayerId, myPlayer?.id]);

  /* ---- Detect remote opponent scoring (new category appears in their scorecard) ---- */
  useEffect(() => {
    if (!viewState || !currentTurnPlayerId || currentTurnPlayerId === myPlayer?.id) return;
    const ps = viewState.playerStates[currentTurnPlayerId];
    if (!ps) return;

    const prevScores = prevOpponentScorecardRef.current[currentTurnPlayerId] || {};
    const currentScores = ps.scorecard.scores;

    // Find newly scored category
    const allCats = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES] as YahtzeeCategory[];
    let newCat: YahtzeeCategory | null = null;
    for (const cat of allCats) {
      if (currentScores[cat] !== undefined && prevScores[cat] === undefined) {
        newCat = cat;
        break;
      }
    }

    // Always update tracked scorecard
    prevOpponentScorecardRef.current[currentTurnPlayerId] = { ...currentScores };

    if (newCat) {
      // Opponent just scored this category — show highlight
      setLastScoredCategory(newCat);
      setLastScoredValue(currentScores[newCat]!);
      setScoringInProgress(true);

      if (lastNonZeroDiceRef.current && lastNonZeroDiceRef.current.playerId === currentTurnPlayerId) {
        setCachedOpponentDice(lastNonZeroDiceRef.current);
      }

      // Auto-clear after 2.5s (in case turn advance hasn't arrived yet)
      const timer = setTimeout(() => {
        setLastScoredCategory(null);
        setLastScoredValue(null);
        setScoringInProgress(false);
        setCachedOpponentDice(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [viewState?.playerStates, currentTurnPlayerId, myPlayer?.id]);

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

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || !currentRoundId || !myPlayer || rolling) {
      console.warn('[YAHTZEE] handleRoll blocked:', { isMyTurn, hasRoundId: !!currentRoundId, hasPlayer: !!myPlayer, rolling });
      return;
    }
    const rawState = authoritativeYahtzeeState;
    const myPs = rawState?.playerStates?.[myPlayer.id];
    const currentLocalRollsRemaining = localRollsRemainingRef.current;
    if (!myPs || currentLocalRollsRemaining <= 0) {
      console.warn('[YAHTZEE] handleRoll blocked: no player state or no rolls', {
        hasRawState: !!rawState,
        hasPs: !!myPs,
        rolls: currentLocalRollsRemaining,
        snapshot: describeYahtzeeSnapshot(rawState),
      });
      return;
    }

    const turnKey = `${currentTurnPlayerId}-${currentRoundId}`;
    turnSeededKeyRef.current = turnKey;

    const isFirstRoll = currentLocalRollsRemaining === 3;
    const duration = isFirstRoll ? FIRST_ROLL_MS : ROLL_AGAIN_MS;

    // Use ref to get the LATEST localDice — avoids stale closure when user
    // holds a die and immediately taps Roll before React re-renders.
    const currentLocalDice = localDiceRef.current;
    heldSnapshotRef.current = currentLocalDice.map(d => d.isHeld);
    rollSerialRef.current += 1;
    const t = `yahtzee:${currentRoundId}:${myPlayer.id}:${rollSerialRef.current}`;
    localRollKeyRef.current = t;
    console.log('[ROLL GENERATED]', { rollKey: t, playerId: myPlayer.id, rollSerial: rollSerialRef.current, roundId: currentRoundId });

    // CRITICAL: Apply local hold state to the player state before rolling.
    // The DB state may be stale if the user toggled holds that haven't synced yet.
    const psWithLocalHolds = {
      ...myPs,
      rollsRemaining: currentLocalRollsRemaining,
      dice: myPs.dice.map((d, i) => ({
        ...(currentLocalDice[i] ?? d),
        isHeld: currentLocalDice[i]?.isHeld ?? d.isHeld,
      })),
    };

    const newPs = rollYahtzeeDice(psWithLocalHolds);
    localDiceRef.current = newPs.dice;
    localRollsRemainingRef.current = newPs.rollsRemaining;
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    // Check for Yahtzee roll — delay overlay until dice animation finishes
    const diceValues = newPs.dice.map(d => d.value);
    if (isYahtzee(diceValues) && diceValues[0] !== 0) {
      setTimeout(() => setShowYahtzeeOverlay(getPlayerUsername(myPlayer)), duration + 200);
    }

    // NOTE: We do NOT freeze the whole presentationState during roll animations.
    // The acting client renders from localDice (not viewState), so it's already stable.
    // The observer renders opponent dice from viewState via getCurrentTurnDice + DiceTableLayout's
    // own fly-in animation, so it handles the visual transition naturally.
    // Freezing the entire viewState would block turn banner, rolls badge, and status text
     // from updating on the observer — causing the "stuck on Rolls: 3" bug.
     // No sync cooldown needed: localDice is owned by local actions during my turn
     // (turn-seed-only model — no mid-turn DB→localDice sync to guard against).

    setUiRolling(true);
    if (uiRollingTimerRef.current != null) window.clearTimeout(uiRollingTimerRef.current);
    uiRollingTimerRef.current = window.setTimeout(() => {
      setUiRolling(false);
      heldSnapshotRef.current = null;
      uiRollingTimerRef.current = null;
    }, duration);

    const newState = {
      ...rawState,
      playerStates: {
        ...rawState.playerStates,
        [myPlayer.id]: { ...newPs, rollKey: t, heldMaskBeforeComplete: heldSnapshotRef.current ?? undefined },
      },
    };
    // Apply optimistic override — sync framework will reject stale DB updates until caught up
    console.log('[YAHTZEE_SYNC] Local optimistic roll snapshot', describeYahtzeeSnapshot(newState));
    yahtzeeSync.applyOptimistic(newState);
    await updateYahtzeeState(currentRoundId, newState);
  }, [isMyTurn, currentRoundId, currentTurnPlayerId, authoritativeYahtzeeState, myPlayer, rolling]);

  /* ---- Hold toggle ---- */
  const handleToggleHold = useCallback(async (dieIndex: number) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || rolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.rollsRemaining === 0) return;

    // Apply optimistic guard — the sync framework will reject stale DB hold states
    // Use functional updater so rapid taps always read latest local state
    setLocalDice(prev => {
      const updatedDice = prev.map((die, idx) => ({
        ...die,
        isHeld: idx === dieIndex ? !die.isHeld : die.isHeld,
      }));

      // Debounce the DB write so rapid holds batch into one update
      if (pendingHoldUpdateRef.current) clearTimeout(pendingHoldUpdateRef.current);
      pendingHoldUpdateRef.current = setTimeout(() => {
        pendingHoldUpdateRef.current = null;
        // Read latest local dice at persist time via a hidden ref
        setLocalDice(latest => {
          const newPs = { ...myPs, dice: latest };
          const newState = {
            ...yahtzeeState,
            playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
          };
          updateYahtzeeState(currentRoundId, newState);
          return latest; // no change
        });
      }, 300);

      return updatedDice;
    });
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, rolling]);

  /* ---- Score category ---- */
  const handleScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isMyTurn || !currentRoundId || !myPlayer || scoringInProgress) return;
    const rawState = authoritativeYahtzeeState;
    const myPs = rawState?.playerStates?.[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.scorecard.scores[category] !== undefined) return;

    const diceValues = myPs.dice.map(d => d.value);

    // Enforce Joker rules: restrict category choices when applicable
    const jokerValid = getJokerValidCategories(myPs.scorecard, diceValues);
    if (jokerValid && !jokerValid.includes(category)) return;

    // Check if this would score zero — ask for confirmation (use Joker score if applicable)
    const potentialScore = jokerValid ? getJokerScore(category, diceValues) : calculateCategoryScore(category, diceValues);
    if (potentialScore === 0) {
      setPendingZeroCategory(category);
      return;
    }

    await commitScoreCategory(category);
  }, [isMyTurn, currentRoundId, authoritativeYahtzeeState, myPlayer, scoringInProgress]);

  const commitScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!currentRoundId || !myPlayer) return;
    const rawState = authoritativeYahtzeeState;
    const myPs = rawState?.playerStates?.[myPlayer.id];
    if (!myPs) return;

    // Highlight the chosen category and pause for clarity
    setScoringInProgress(true);
    setLastScoredCategory(category);
    const pendingScore = calculateCategoryScore(category, myPs.dice.map(d => d.value));
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

    const newPs = scoreYahtzeeCategory(myPs, category);
    localDiceRef.current = newPs.dice;
    localRollsRemainingRef.current = newPs.rollsRemaining;
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    // Cache dice for opponent to see during scoring highlight (like bot logic)
    const diceForCache: HorsesDieType[] = myPs.dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
    setCachedOpponentDice({ dice: diceForCache, rollKey: myPs.rollKey, playerId: myPlayer.id });

    // FIRST WRITE: scored state only (no turn advance) — opponent sees category choice
    let scoredState = {
      ...rawState,
      playerStates: { ...rawState.playerStates, [myPlayer.id]: newPs },
    };
    console.log('[YAHTZEE_SYNC] Writing scored snapshot', describeYahtzeeSnapshot(scoredState));
    yahtzeeSync.applyOptimistic(scoredState);
    await updateYahtzeeState(currentRoundId, scoredState);

    // Wait 2 seconds so both players can see the selection highlighted
    await new Promise(r => setTimeout(r, 2000));

    // Keep optimistic score visible until DB subscription catches up
    setOptimisticScore({ playerId: myPlayer.id, category, value: pendingScore });

    // SECOND WRITE: advance turn (opponent sees turn change after highlight)
    const advancedState = advanceYahtzeeTurn(scoredState);
    console.log('[YAHTZEE_SYNC] Writing turn-advance snapshot', describeYahtzeeSnapshot(advancedState));
    // CRITICAL: Apply turn-advance optimistic BEFORE clearing scoring flags.
    // Otherwise there's a 1-2 frame gap where scoringInProgress=false but
    // currentTurnPlayerId still points to the scorer, causing a brief "my roll" flash.
    yahtzeeSync.applyOptimistic(advancedState);

    // Now safe to clear scoring flags — turn owner has already advanced
    setLastScoredCategory(null);
    setLastScoredValue(null);
    setScoringInProgress(false);
    setCachedOpponentDice(null);

    await updateYahtzeeState(currentRoundId, advancedState);
    // P9.3b: NO direct handleGameComplete call here — completion is now driven
    // by the authoritative effect below (fires once per currentRoundId on every
    // client; only the elected botControllerUserId performs DB writes).
  }, [currentRoundId, authoritativeYahtzeeState, myPlayer]);

  /* ---- P9.3b: authoritative end-of-game effect ----
   * Fires on EVERY client (active scorer, non-scoring active, observer) when
   * viewState.gamePhase === 'complete'. Latched per currentRoundId.
   *
   *  - Presentation (overlay + chip-transfer trigger): all clients.
   *  - Authoritative writes (RPCs, recordGameResult, snapshot, endYahtzeeRound):
   *    only the single elected writer = authoritativeYahtzeeState.botControllerUserId.
   *    Same single-writer gate the bot-turn path uses verbatim — no new
   *    election mechanism. If controllerUserId is null (bot-only game),
   *    every client attempts (matches bot-turn path semantics for that edge).
   */
  useEffect(() => {
    if (!viewState || viewState.gamePhase !== 'complete') return;
    if (!currentRoundId) return;
    if (completionLatchRoundIdRef.current === currentRoundId) return;
    completionLatchRoundIdRef.current = currentRoundId;

    console.log('[YAHTZEE] 🏆 completion effect firing', { currentRoundId, currentUserId });

    const results = Object.entries(viewState.playerStates)
      .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
      .sort((a, b) => b.total - a.total);
    if (results.length === 0) return;
    const maxScore = results[0].total;
    const winners = results.filter(r => r.total === maxScore);
    const scoreSummary = results.map(r => r.total).join('-');
    const scoreDetails = results.map(r => {
      const p = players.find(pl => pl.id === r.pid);
      return { name: p ? getPlayerUsername(p) : '?', total: r.total };
    });

    // ── Presentation (all clients) ──
    if (winners.length === 1) {
      const winnerId = winners[0].pid;
      const winnerPlayer = players.find(p => p.id === winnerId);
      if (winnerPlayer) {
        const winnerName = getPlayerUsername(winnerPlayer);
        const isWinnerMe = winnerPlayer.user_id === currentUserId;
        const losers = activePlayers.filter(p => p.id !== winnerId);
        void scoreDetails;

        // ── Canonical match_win emit (all clients) ──
        // Co-fired with chip-transfer trigger so rail plate, confetti, and
        // chip animation all paint in the same window. Matches Gin pattern.
        const scoreLine = results.map(r => {
          const p = players.find(pl => pl.id === r.pid);
          return `${p ? getPlayerUsername(p) : '?'}: ${r.total}`;
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
      }
    }


    // ── Authoritative writes (single writer) ──
    const controllerUserId = authoritativeYahtzeeState?.botControllerUserId;
    const isAuthoritativeWriter =
      !controllerUserId || controllerUserId === currentUserId;
    if (!isAuthoritativeWriter) {
      console.log('[YAHTZEE] completion effect — not authoritative writer, presentation only', {
        controllerUserId,
        currentUserId,
      });
      return;
    }

    (async () => {
      try {
        if (winners.length > 1) {
          console.log('[YAHTZEE] Tie detected, ending round as tie');
          await endYahtzeeRound(gameId, null, `Tie ${scoreSummary}`, true);
          return;
        }
        const winnerId = winners[0].pid;
        const winnerPlayer = players.find(p => p.id === winnerId);
        if (!winnerPlayer) return;
        const winnerName = getPlayerUsername(winnerPlayer);
        const losers = activePlayers.filter(p => p.id !== winnerId);
        const winAmount = losers.length * anteAmount;

        console.log('[YAHTZEE] Awarding chips (writer):', { winnerId, winAmount, loserCount: losers.length });
        await supabase.rpc('increment_player_chips', { p_player_id: winnerId, p_amount: winAmount });
        if (losers.length > 0) {
          await supabase.rpc('decrement_player_chips', {
            player_ids: losers.map(p => p.id),
            amount: anteAmount,
          });
        }
        const chipChanges: Record<string, number> = { [winnerId]: winAmount };
        losers.forEach(l => { chipChanges[l.id] = -anteAmount; });
        recordGameResult(gameId, viewState.currentRound || 1, winnerId,
          `${winnerName} wins`, `Score: ${scoreSummary}`, winAmount, chipChanges, false, 'yahtzee', dealerGameId);
        snapshotPlayerChips(gameId, viewState.currentRound || 1).catch(err =>
          console.error('[YAHTZEE] Failed to snapshot chips:', err));

        // Hold long enough for winner overlay + chip animation to complete before
        // Game.tsx's game_over handler can swap surfaces.
        await new Promise(r => setTimeout(r, 2500));
        await endYahtzeeRound(gameId, winnerId, `${winnerName} wins ${scoreSummary}!`);
        console.log('[YAHTZEE] endYahtzeeRound completed');
      } catch (e) {
        console.error('[YAHTZEE] completion-effect writer error:', e);
      }
    })();
  }, [viewState?.gamePhase, currentRoundId]);

  /* ---- Bot logic ---- */
  // Drive bot control ENTIRELY from authoritative state — never presentation/viewState.
  // Using viewState caused transient wrong-owner flickers to cancel/restart bot sequences.
  const authTurnPlayerId = authoritativeYahtzeeState?.currentTurnPlayerId;
  const authGamePhase = authoritativeYahtzeeState?.gamePhase;
  const authTurnPlayer = players.find(p => p.id === authTurnPlayerId);

  // Safety: reset botProcessingRef when authoritative turn changes away from a bot
  useEffect(() => {
    if (!authTurnPlayer?.is_bot) {
      console.log('[BOT SAFETY RESET]', {
        roundId: currentRoundId,
        authTurnPlayerId,
        authGamePhase,
        currentUserId,
        botProcessingRef: botProcessingRef.current,
      });
      botProcessingRef.current = false;
    }
  }, [authTurnPlayerId]);

  useEffect(() => {
    console.warn('[BOT EFFECT MOUNT] BUILD=2026-04-06T17:40Z INSTRUMENTED', {
      roundId: currentRoundId,
      authTurnPlayerId,
      isBotTurn: authTurnPlayer?.is_bot,
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
    if (!authTurnPlayerId || !authTurnPlayer?.is_bot) {
      console.log('[BOT TURN EXIT]', { reason: 'not-bot-turn', authTurnPlayerId, isBot: authTurnPlayer?.is_bot });
      return;
    }
    if (botProcessingRef.current) {
      console.log('[BOT TURN EXIT]', { reason: 'botProcessingRef-stuck', authTurnPlayerId });
      return;
    }
    const controllerUserId = authoritativeYahtzeeState.botControllerUserId;
    if (controllerUserId && controllerUserId !== currentUserId) {
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

          console.log('[BOT BEFORE rollYahtzeeDice]', {
            roundId: currentRoundId,
            botPlayerId,
            roll,
            rollsRemaining: ps.rollsRemaining,
            dice: describeBotDiceState(ps.dice),
            holds: lastHolds,
            prevRollKey: lastPrevRollKey,
            turnIdentity,
          });

          const preRollDice = describeBotDiceState(ps.dice);
          const preRollsRemaining = ps.rollsRemaining;
          rollSerialRef.current += 1;
          const botRollKey = `yahtzee:${currentRoundId}:${botPlayerId}:${rollSerialRef.current}`;
          const rolledPs = rollYahtzeeDice(ps);
          const rollsRemainingChanged = rolledPs.rollsRemaining === preRollsRemaining - 1;
          const rolledDiceShapeValid = Array.isArray(rolledPs.dice)
            && rolledPs.dice.length === 5
            && rolledPs.dice.every((die) => typeof die?.value === 'number' && typeof die?.isHeld === 'boolean');
          const rollStateChanged = rollsRemainingChanged || rolledPs.dice.some((die, index) => (
            die.value !== ps.dice[index]?.value || die.isHeld !== ps.dice[index]?.isHeld
          ));
          console.log('[BOT AFTER ROLL]', {
            roundId: currentRoundId,
            botPlayerId,
            rollKey: botRollKey,
            roll,
            rollsRemaining: rolledPs.rollsRemaining,
            diceValues: rolledPs.dice.map(d => d.value),
            heldFlags: rolledPs.dice.map(d => d.isHeld),
            rollsRemainingChanged,
            rolledDiceShapeValid,
            rollStateChanged,
            turnIdentity,
          });
          console.assert(rollsRemainingChanged, '[BOT ASSERT] rollYahtzeeDice did not decrement rollsRemaining as expected', {
            roll,
            before: preRollsRemaining,
            after: rolledPs.rollsRemaining,
            turnIdentity,
          });
          console.assert(rolledDiceShapeValid, '[BOT ASSERT] rolled dice array invalid', {
            roll,
            dice: rolledPs.dice,
            turnIdentity,
          });
          console.assert(rollStateChanged, '[BOT ASSERT] rollYahtzeeDice did not change expected roll state', {
            roll,
            preRollsRemaining,
            rolledPs,
            preRollDice,
            turnIdentity,
          });
          ps = rolledPs;
          console.log('[ROLL GENERATED]', { rollKey: botRollKey, playerId: botPlayerId, rollSerial: rollSerialRef.current, roll, roundId: currentRoundId });
          state = { ...state, playerStates: { ...state.playerStates, [botPlayerId]: { ...ps, rollKey: botRollKey } } };
          yahtzeeSync.applyOptimistic(state);
          console.log('[BOT BEFORE UPDATE_YAHTZEE_STATE]', {
            roundId: currentRoundId,
            botPlayerId,
            roll,
            rollKey: botRollKey,
            rollsRemaining: ps.rollsRemaining,
            dice: describeBotDiceState(ps.dice),
            turnIdentity,
          });
          const updateError = await updateYahtzeeState(currentRoundId, state);
          console.log('[BOT AFTER UPDATE_YAHTZEE_STATE]', {
            roundId: currentRoundId,
            botPlayerId,
            roll,
            rollKey: botRollKey,
            rollsRemaining: ps.rollsRemaining,
            dice: describeBotDiceState(ps.dice),
            error: updateError ? { message: updateError.message, name: updateError.name } : null,
            turnIdentity,
          });
          if (updateError) {
            console.error('[BOT UPDATE ERROR]', {
              roundId: currentRoundId,
              botPlayerId,
              roll,
              rollKey: botRollKey,
              error: updateError,
              ps,
              statePlayerState: state.playerStates[botPlayerId],
              holds: lastHolds,
              prevRollKey: lastPrevRollKey,
              turnIdentity,
            });
          }

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

        ps = scoreYahtzeeCategory(ps, category);
        state = { ...state, playerStates: { ...state.playerStates, [botPlayerId]: ps } };
        yahtzeeSync.applyOptimistic(state);
        await updateYahtzeeState(currentRoundId, state);

        await new Promise(r => setTimeout(r, 2000));
        if (isCancelled('after-score-wait')) {
          setLastScoredCategory(null);
          setLastScoredValue(null);
          setScoringInProgress(false);
          setCachedOpponentDice(null);
          console.log('[BOT TURN EXIT]', {
            reason: 'cancelled-after-score-wait',
            location: 'after-score-wait',
            turnIdentity,
          });
          return;
        }

        setLastScoredCategory(null);
        setLastScoredValue(null);
        setScoringInProgress(false);
        setCachedOpponentDice(null);

        const prevTurnOwner = state.currentTurnPlayerId;
        state = advanceYahtzeeTurn(state);
        console.log('[TURN TRANSITION]', {
          roundId: currentRoundId,
          fromPlayerId: prevTurnOwner,
          toPlayerId: state.currentTurnPlayerId,
          gamePhase: state.gamePhase,
          turnIdentity,
        });
        yahtzeeSync.applyOptimistic(state);
        await updateYahtzeeState(currentRoundId, state);
        // P9.3b: completion is driven by the authoritative effect — no direct
        // handleGameComplete call here. Effect fires on every client when
        // viewState.gamePhase transitions to 'complete'.
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
  }, [currentRoundId, authTurnPlayerId, authTurnPlayer?.is_bot, authGamePhase, currentUserId]);

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

    const upperSum = UPPER_CATEGORIES.reduce((s, c) => s + (getEffectiveScore(c) ?? 0), 0);
    const gotBonus = upperSum >= UPPER_BONUS_THRESHOLD;
    const allUpperFilled = UPPER_CATEGORIES.every(c => getEffectiveScore(c) !== undefined);
    const bonusFailed = allUpperFilled && !gotBonus;

    const renderRow = (categories: YahtzeeCategory[], extra?: React.ReactNode) => (
      <div className="flex gap-1">
        {categories.map(cat => {
          const scored = ps.scorecard.scores[cat];
          const effectiveScored = getEffectiveScore(cat);
          const potential = potentials[cat];
          const jokerBlocked = jokerValid && !jokerValid.includes(cat);
          const isAvailable = effectiveScored === undefined && isInteractive && isMyTurn && rollsUsed < 3 && !jokerBlocked;
          const justScored = lastScoredCategory === cat;
          // Show optimistic value when DB hasn't caught up
          const isOptimistic = optimisticScore?.playerId === playerId && optimisticScore?.category === cat && scored === undefined;

          return (
            <button
              key={cat}
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
      <div className="w-full space-y-1">
        {renderRow(UPPER_CATEGORIES, (
          <div className={cn(
            "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-md border min-w-0 min-h-[44px]",
            gotBonus
              ? "bg-green-800/60 border-green-400"
              : bonusFailed
                ? "bg-amber-900/50 border-red-500/70 border-2"
                : "bg-muted/20 border-muted-foreground/40"
          )}>
            {gotBonus ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="font-bold text-green-400 tabular-nums text-sm leading-tight">+35</span>
              </>
            ) : bonusFailed ? (
              <span className="font-bold text-red-400 tabular-nums text-sm leading-tight">0</span>
            ) : (
              <span className="font-bold text-amber-200 tabular-nums text-sm leading-tight">
                {upperSum}/63
              </span>
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

  /* ---- Render chip stack for a player ---- */
  const renderPlayerChip = (player: Player, compact = false) => {
    const isTheirTurn = player.id === currentTurnPlayerId && gamePhase === 'playing';
    const isMe = player.user_id === currentUserId;
    const ps = viewState?.playerStates?.[player.id];
    const total = ps ? getTotalScore(ps.scorecard) : 0;
    const isWinning = total > 0 && total === maxTotal && gamePhase === 'complete';

    // Compact mode: small name badge, no chip circle
    if (compact) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className={cn(
            "text-[10px] font-bold truncate max-w-[60px] text-amber-200 drop-shadow-md px-1.5 py-0.5 rounded bg-black/40",
            isTheirTurn && "animate-pulse ring-1 ring-yellow-400"
          )}>
            {getPlayerUsername(player)}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-0.5" data-seat-chip-position={player.position}>
        <span className={cn(
          "text-[11px] font-semibold truncate max-w-[70px] text-white drop-shadow-md"
        )}>
          {getPlayerUsername(player)}
        </span>
        {/* Wave 3 / 3A: shell-owned chip disc. Yahtzee uses the mobile-only
            compact preset (no tablet doubling).
            Wave 3B: stack-root identity owned by CanonicalChipstack
            (thin wrapper — visuals unchanged). */}
        <CanonicalChipstack position={player.position}>
          <CanonicalChipDisc
            amount={player.chips}
            size="gameplay-compact"
            showTurnRing={isTheirTurn}
            pulseDisc={isTheirTurn}
            positionAnchor={player.position}
          />
        </CanonicalChipstack>
      </div>
    );
  };

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
              <YahtzeeAnchoredSlot
                artifactId="yahtzee.scorecardStage"
                innerStyle={{ alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{ width: '100%', maxWidth: 340 }}>
                  {renderScorecard(myPlayer.id, true)}
                </div>
              </YahtzeeAnchoredSlot>
            );
          }

          const diceState = getCurrentTurnDice();
          const hasRolled = diceState?.dice.some(d => d.value !== 0);

          // During scoring transition, dice reset to zeros in DB — use cached values
          const useCached = !hasRolled && cachedOpponentDice && scoringInProgress;

          if (!hasRolled && !useCached) {
            return null;
          }

          const feltDice = useCached ? cachedOpponentDice!.dice : diceState!.dice;
          // When using cached dice, pass undefined rollKey so no fly-in animation plays
          const feltRollKey = useCached ? undefined : diceState!.rollKey;
          // Stable cache key prevents remount when switching live→cached
          const stableCacheKey = useCached ? cachedOpponentDice!.playerId : (currentTurnPlayerId ?? "no-turn");

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
                  traceContext={{
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
          triggerId={chipTransferTriggerId}
          amount={anteAmount}
          winnerPosition={chipTransferWinnerPos}
          loserPositions={chipTransferLoserPositions}
          loserPlayerIds={chipTransferLoserIds}
          currentPlayerPosition={myPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          containerRef={tableContainerRef}
          onAnimationEnd={() => setChipTransferTriggerId(null)}
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
          const slotByPosition = new Map<number, CanonicalSlot | null>();
          shellAnchors?.anchors.forEach(a => slotByPosition.set(a.position, a.slot));
          // Resolve whether the viewer is themselves a seated active
          // player. Observers (no matching seat) should see ALL clusters
          // and must not be gated on `viewerPosition` (which never
          // resolves for them).
          const viewerIsSeated = !!currentUserId && activePlayers.some(p => p.user_id === currentUserId);
          // For seated viewers only: if shell anchors haven't yet
          // resolved a viewerPosition, defer rendering. The cluster's
          // internal self-suppression keys off anchors.viewerPosition;
          // when it is transiently null at mount, the local viewer's
          // own bubble can flash on the felt before suppression kicks in.
          if (viewerIsSeated && shellAnchors?.viewerPosition == null) return null;
          return activePlayers.map(player => {
            // Active player should not see their own table chipstack
            // (identity/bankroll is already in the HUD). Observers see all.
            // Compare by user_id (stable from props) rather than myPlayer.id —
            // during initial mount `myPlayer` may briefly be undefined,
            // letting the viewer's own bubble flash on the felt.
            if (currentUserId && player.user_id === currentUserId) return null;
            const slot = slotByPosition.get(player.position) ?? null;
            const ps = viewState?.playerStates?.[player.id];
            const total = ps ? getTotalScore(ps.scorecard) : 0;
            return (
              <CanonicalSeatCluster
                key={player.id}
                slot={slot}
                position={player.position}
                name={getPlayerUsername(player)}
                isDealer={dealerPosition === player.position}
                chipValue={`$${formatChipValue(Math.round(player.chips))}`}
                scoreLine={`Score: ${total}`}
                ownerLabel="Gameplay:YahtzeeGameTable.opponentOverlay"
                playerId={player.id}
              />
            );
          });
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
      <ShellHudGrid
        timer={
          <div
            data-shell-operational-hud=""
            className="w-full h-full flex items-center justify-center gap-x-3 px-3 overflow-hidden whitespace-nowrap"
          >
            {gamePhase === 'playing' && currentPlayer && !currentPlayer.is_bot ? (
              <div className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-background/60 backdrop-blur-sm border border-border/50">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {isMyTurn ? 'Your turn' : `${getPlayerUsername(currentPlayer)}'s turn`}
                </span>
                <Badge variant="secondary" className="text-xs">
                  Rolls: {isMyTurn ? localRollsRemaining : (currentTurnState?.rollsRemaining ?? 0)}
                </Badge>
              </div>
            ) : null}
            {gamePhase === 'playing' && (
              <div className="flex items-center gap-3 text-xs tabular-nums">
                {activePlayers.map(p => {
                  const ps = viewState?.playerStates?.[p.id];
                  const total = ps ? getTotalScore(ps.scorecard) : 0;
                  const isTurn = p.id === currentTurnPlayerId;
                  return (
                    <span
                      key={p.id}
                      className={cn(
                        'font-semibold',
                        isTurn ? 'text-poker-gold' : 'text-muted-foreground'
                      )}
                    >
                      {getPlayerUsername(p)}: {total}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        }
        pane={
          <div className="h-full overflow-hidden">
            {/* CARDS/DICE TAB */}
            {activeTab === 'cards' && (
              <div ref={paneContentRef} data-yahtzee-active-pane-content="" className="px-2 h-full overflow-y-auto flex flex-col justify-start pt-2">


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
                          canToggle={!rolling && localRollsRemaining > 0 && localRollsRemaining < 3}
                          onToggle={() => handleToggleHold(idx)}
                          size={resolvedDieSize}
                          showWildHighlight={false}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Action strip (Wave 2F.2) — single canonical slot owns
                    the reservation across Roll → Waiting → Pick-a-category
                    so the dice tray above and any sibling below never
                    reflow when the variant swaps. Only rendered on my turn;
                    opponent-turn UI uses the opponent scorecard block below. */}
                {gamePhase === 'playing' && isMyTurn && (
                  <ActionStripSlot className="mt-1 mb-1" density="compact">
                    {scoringInProgress ? (
                      <ActionStripStatusPill emphasis="muted">
                        Scoring…
                      </ActionStripStatusPill>
                    ) : localRollsRemaining > 0 ? (
                      <ActionStripButtonRow>
                        <Button
                          size="sm"
                          onClick={handleRoll}
                          disabled={rolling}
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

                {/* Opponent scorecard when it's not my turn */}
                {!isMyTurn && currentTurnPlayerId && currentTurnPlayerId !== myPlayer?.id && gamePhase === 'playing' && (
                  <div className="px-1 relative">

                    {(() => {
                      const oppPlayer = players.find(p => p.id === currentTurnPlayerId);
                      if (!oppPlayer) return null;
                      const diceState = getCurrentTurnDice();
                      const hasRolled = diceState?.dice.some(d => d.value !== 0);
                      const oppPs = viewState?.playerStates?.[currentTurnPlayerId];
                      const rollsLeft = oppPs?.rollsRemaining ?? 3;
                      const statusText = !hasRolled || rollsLeft === 3
                        ? `${getPlayerUsername(oppPlayer)} is rolling...`
                        : rollsLeft > 0
                          ? `${getPlayerUsername(oppPlayer)} — Roll ${4 - rollsLeft}`
                          : `${getPlayerUsername(oppPlayer)} choosing...`;
                      return (
                        <p className="text-amber-400 font-semibold text-xs text-center animate-pulse mb-0.5">
                          {statusText}
                        </p>
                      );
                    })()}
                    <div className="yahtzee-opponent-scorecard">
                      {renderScorecard(currentTurnPlayerId, false)}
                    </div>
                  </div>
                )}

                {/* My scorecard (read-only summary) when it IS my turn - interactive one is on felt */}
                {isMyTurn && myPlayer && (
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
                          {formatChipValue(player.chips)}
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
              {dealerPosition === myPlayer.position && (
                <span
                  aria-label="Dealer"
                  title="Dealer"
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 border border-white text-white font-bold text-[10px] shadow"
                >
                  D
                </span>
              )}
              <p className="text-sm font-semibold text-foreground truncate">
                {myPlayer.profiles?.username || 'You'}
                <span className="ml-1 text-green-500">(active)</span>
              </p>
              <span className={cn(
                "font-bold text-lg tabular-nums",
                myPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'
              )}>
                {formatChipValue(myPlayer.chips)}
              </span>
            </div>
          ) : null
        }
      />
    </div>
  );
}
