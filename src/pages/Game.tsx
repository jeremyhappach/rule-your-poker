import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from "react";
import { emit357RuntimeDiag } from "@/lib/threeFiveSeven/runtimeDiag";
import {
  emitWartime as __emitWartime,
  useWartimeComponentInstance as __useWartimeComponentInstance,
  useWartimeStateWrite as __useWartimeStateWrite,
  emitRefWrite as __emitWartimeRefWrite,
  wrapRealtimeCausality as __wrapWartimeRealtimeCausality,
  trackAsyncOwner as __trackWartimeAsyncOwner,
  emitAsyncOwnerFired as __emitWartimeAsyncOwnerFired,
  emitProgressionAdvancementAt as __emitWartimeProgressionAt,
  registerActualEmitterInvocation as __wartimeRegisterEmitterGame,
  registerWartimeProductionHook as __wartimeRegisterHookGame,
  SRC as __WARTIME_SRC,
  isTargetedWartimePreflightReadyForHarness,
} from "@/lib/threeFiveSeven/wartime";
import { readDebugHarness } from "@/lib/debugHarness/useDebugHarness";


// 3-5-7 Wartime — canonical production owner for realtime.causality.
// Game.tsx owns the games/rounds/players/player_cards/game_results
// realtime subscriptions; wrapRealtimeCausality wraps each handler.
__wartimeRegisterHookGame({
  requirementId: 'realtime.causality',
  sourceSiteId: __WARTIME_SRC.REALTIME_CAUSALITY.id,
  sourceFile: 'src/pages/Game.tsx',
  sourceFunction: 'Game.realtimeSubscriptions',
});
__wartimeRegisterEmitterGame('realtime.causality', __WARTIME_SRC.REALTIME_CAUSALITY.id);
__wartimeRegisterHookGame({ requirementId: 'realtime.causality', sourceSiteId: __WARTIME_SRC.REALTIME_SHOW_CARDS.id, sourceFile: 'src/pages/Game.tsx', sourceFunction: 'show-cards broadcast callback' });
__wartimeRegisterEmitterGame('realtime.causality', __WARTIME_SRC.REALTIME_SHOW_CARDS.id);
__wartimeRegisterHookGame({ requirementId: 'state.write.show_cards', sourceSiteId: __WARTIME_SRC.STATE_SHOW_CARDS_GAME.id, sourceFile: 'src/pages/Game.tsx', sourceFunction: 'show-cards broadcast setWinner357ShowCards' });
__wartimeRegisterEmitterGame('state.write.show_cards', __WARTIME_SRC.STATE_SHOW_CARDS_GAME.id);
for (const __src of [
  __WARTIME_SRC.ASYNC_GAME_RT_DEBOUNCE,
  __WARTIME_SRC.ASYNC_GAME_RT_DELAYED_FETCH,
  __WARTIME_SRC.ASYNC_GAME_RT_FALLBACK_POLL,
  __WARTIME_SRC.ASYNC_GAME_SHOW_CARDS_CALLBACK,
  __WARTIME_SRC.ASYNC_GAME_AWAITING_STATUS_POLL,
  __WARTIME_SRC.ASYNC_GAME_CRITICAL_POLL,
  __WARTIME_SRC.ASYNC_GAME_357_SYNC_POLL,
  __WARTIME_SRC.ASYNC_GAME_AWAITING_POLL,
  __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER,
  __WARTIME_SRC.ASYNC_GAME_REANTE_CLEAR,
  __WARTIME_SRC.ASYNC_GAME_357_SAFETY_FALLBACK,
  __WARTIME_SRC.ASYNC_GAME_357_SAFETY_EXTENSION,
  __WARTIME_SRC.ASYNC_GAME_357_PROGRESS_POLL,
  __WARTIME_SRC.ASYNC_GAME_357_POLL_STOP,
]) {
  __wartimeRegisterHookGame({ requirementId: 'async.owner', sourceSiteId: __src.id, sourceFile: 'src/pages/Game.tsx', sourceFunction: __src.fn });
  __wartimeRegisterEmitterGame('async.owner', __src.id);
}
// Progression entry/return production owners for the two Game.tsx callbacks
// exercised by the targeted_357_root_cause profile.
for (const __psrc of [__WARTIME_SRC.PROG_HANDLE_GAMEOVER_ENTRY, __WARTIME_SRC.PROG_HANDLE357_WINCOMPLETE]) {
  __wartimeRegisterHookGame({ requirementId: 'progression.advancement', sourceSiteId: __psrc.id, sourceFile: 'src/pages/Game.tsx', sourceFunction: __psrc.fn });
}
import { useGameStateSync, getHolmProgress, getThreeFiveSevenProgress } from "@/lib/gameStateSync";
import type { HolmAuthoritativeSnapshot } from "@/lib/gameStateSync";
import type { ThreeFiveSevenAuthoritativeSnapshot } from "@/lib/gameStateSync";
import {
  classifyHolmRouteEntryMode,
  getHolmPresentationHandKey,
  getHolmPresentationIdentityKey,
  isHolmPreHandRouteStatus,
  isSameHolmPresentationHand,
  latchHolmPresentationBarrier,
  reconcileHolmPresentationBarrierFromEvidence,
  shouldHoldHolmAuthoritativeSuccessor,
  type HolmContinuationPresentationCompletion,
  type HolmPresentationBarrier,
  type HolmPresentationIdentity,
} from "@/lib/holmPresentationBarrier";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { refreshVoicePresenceHeartbeat } from "@/lib/runtimeInstrumentation/voicePresenceHeartbeat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { User } from "@supabase/supabase-js";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import {
  acquireRecoveryLease,
  releaseRecoveryLease,
  recordTerminalRecovery,
  recordRecoveryTransition,
} from "@/lib/sessionRecoveryLease";
import { MobileGameTable } from "@/components/MobileGameTable";
import { markVisibilityResume, setRealtimeStatus } from "@/lib/resumeSignals";
import { emit357InstantWinTerminal, emit357GameOverCompleteDiag } from "@/lib/threeFiveSeven/instantWinLifecycle";
import { declineThreeFiveSevenSetup } from "@/lib/threeFiveSeven/declineSetup";
import type { DealerGameSetupCommitResult } from "@/lib/dealerGameSetupAuthority";
import {
  parseThreeFiveSevenRolloverAdvanceResult,
  selectThreeFiveSevenRolloverPresentation,
  type ThreeFiveSevenRolloverPresentation,
} from "@/lib/threeFiveSeven/rolloverPresentation";
import {
  deriveThreeFiveSevenAllFoldPresentation,
  getThreeFiveSevenAllFoldPresentationKey,
  parseThreeFiveSevenAllFoldDecisionResult,
  selectThreeFiveSevenAllFoldPresentation,
  type ThreeFiveSevenAllFoldPresentation,
} from "@/lib/threeFiveSeven/allFoldPresentation";
import {
  isThreeFiveSevenDealPresentationReady,
  type ThreeFiveSevenDealReadinessToken,
} from "@/lib/threeFiveSeven/presentationReadiness";
import { SessionEndedFeltPanel, SessionEndedPaneAction, SessionEndedAnnouncementMount } from "@/components/canonicalShell/SessionEndedTablePhase";
import { PersistentTableShell } from "@/lib/canonicalShell/PersistentTableShell";
import { SessionLifecycleAnnouncer } from "@/lib/canonicalShell/announcements/SessionLifecycleAnnouncer";
// AnnouncementRailSlot is mounted by the active gameplay surface
// (e.g. CribbageMobileGameTable), not at the Game.tsx shell level.
import { PlayfieldSlotController } from "@/lib/canonicalShell/PlayfieldSlotController";
import { ffRecord } from "@/lib/canonicalShell/cardTransport/holmFullForensics";
import {
  SurfaceReadinessProvider,
} from "@/lib/canonicalShell/SurfaceReadinessContract";
import { GinRummyReadinessProbe } from "@/lib/canonicalShell/GinRummyReadinessProbe";
import { useSlotIdentityTracker } from "@/lib/canonicalShell/useSlotIdentityTracker";
import { isPokerVariantFamily, isCanonicalShellFamily, isCanonicalSeatConsumer } from "@/lib/canonicalShell/shellRouting";
import { setLifecycleFact, useLifecycleMount, setLifecycleContext } from "@/lib/canonicalShell/lifecycleDebug";
import { logIfChanged as _shellLogIfChanged, setShellLifecycleActiveGameType } from "@/lib/canonicalShell/shellLifecycleLog";
import {
  isHolmTraceArmed,
  recordHolmTrace,
  setHolmTraceActive,
} from "@/lib/holm/holmTrace";
import { nextClockwise } from "@/lib/canonicalShell/seatRing";
import {
  advanceLiveTerminalPresentationScope,
  shouldHoldLiveTerminalPresentation,
  terminalPresentationIdentityMatchesLiveScope,
  type LiveTerminalPresentationScope,
} from "@/lib/canonicalShell/liveTerminalPresentationHold";
import {
  deriveHolmChuckyLossContext,
  isHolmChuckyLossResult,
} from "@/lib/canonicalShell/holmTransferPresentationStage";

import { setHolmLedgerActive } from "@/lib/holm/holmPresentationLedger";
// 3-5-7 presentation ledger removed (temporary tracking).
import { recordHolmLifecycle } from "@/lib/holm/holmLifecycleTrace";

import type { HorsesStateFromDB } from "@/hooks/useHorsesMobileController";

import { CribbageMobileGameTable } from "@/components/CribbageMobileGameTable";
import { GinRummyGameTable } from "@/components/GinRummyGameTable";
import { YahtzeeGameTable } from "@/components/YahtzeeGameTable";
import { DealerConfig } from "@/components/DealerConfig";
import { DealerGameSetup } from "@/components/DealerGameSetup";
import { AnteUpDialog } from "@/components/AnteUpDialog";
import { CanonicalShellWaitingSurface } from "@/components/canonicalShell/CanonicalShellWaitingSurface";
// LifecycleAnnouncement no longer rendered from Game.tsx — observer
// lifecycle messaging is emitted into the canonical shell announcement
// rail by `SessionLifecycleAnnouncer` (see `dealer_configuring`).


import { useHighCardDealerSelection, type DealerSelectionCard, type DealerSelectionState } from "@/hooks/useHighCardDealerSelection";
import { recordCribDealerDraw, useCribDealerDrawSurfaceTrace } from "@/lib/cribbageDealerDrawTrace";
import CribDealerDrawTraceOverlay from "@/components/debug/CribDealerDrawTraceOverlay";
import { recordDealerSelectionDiag, setDealerSelectionDiagContext } from "@/lib/dealerSelectionDiag";
import { recordWaitingLifecycle, recordWaitingLifecycleIfChanged, WaitingFlightMarker } from "@/lib/canonicalShell/waitingTableFlight";
import { recordHighCardCardsClear, recordHighCardFirstDisappearance, recordHighCardWriter } from "@/lib/wartimeDebug/surfaces";
import {
  recordChatDeliveryViolation,
  recordConsumerSubscription,
  recordReactRenderObserved,
  recordSelectorProof,
} from "@/lib/chatDelivery/chatDeliveryLedger";


/**
 * HighCardDealerSelection — Phase C.2 retirement shim.
 *
 * The standalone `HighCardDealerSelection.tsx` component was deleted in Phase
 * C.2 (Cribbage canonical migration). All logic lives in
 * `useHighCardDealerSelection`. This local wrapper exists ONLY so the three
 * remaining session-level callsites below (pre-Cribbage neutral shell, plus
 * Gin Rummy dealer-selection overlay) can keep their JSX shape unchanged
 * while the hook does the work. Behavior-preserving: identical props,
 * identical effects, identical mount/unmount semantics. No render output.
 *
 * Instrumentation: emits `dealer_selection_surface_mounted` /
 * `dealer_selection_surface_unmounted`-shape events to `debug_events` via
 * `recordDealerSelectionDiag` so the dealer-selection lifecycle tracer can
 * tell whether the surface ever mounted for a given dealerSelectionId.
 */
type HighCardDealerSelectionShimProps = {
  gameId: string;
  players: Array<{ id: string; user_id: string; position: number; created_at?: string; profiles?: { username: string }; is_bot: boolean; sitting_out?: boolean }>;
  onComplete: (dealerPosition: number) => void;
  isHost: boolean;
  allowBotDealers?: boolean;
  selectionVariant?: 'default' | 'cribbage';
  syncedState: DealerSelectionState | null;
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  onWinnerPositionUpdate?: (position: number | null) => void;
  /** Crib-dealer-draw-trace: gating-input snapshot from the mount site. */
  cribTraceGating?: Record<string, unknown>;
};
const HighCardDealerSelection = (props: HighCardDealerSelectionShimProps) => {
  const _cribTraceInstanceId = useCribDealerDrawSurfaceTrace({
    gameId: props.gameId,
    surface: 'Game.HighCardDealerSelection',
    gating: {
      ...(props.cribTraceGating ?? {}),
      isHost: props.isHost,
      selectionVariant: props.selectionVariant ?? 'default',
      syncedStateNullness: props.syncedState == null ? 'null' : 'non-null',
      syncedCardCount: props.syncedState?.cards?.length ?? 0,
      syncedWinnerPosition: props.syncedState?.winnerPosition ?? null,
      syncedIsComplete: !!props.syncedState?.isComplete,
    },
  });
  useHighCardDealerSelection({
    gameId: props.gameId,
    players: props.players,
    onComplete: (pos: number) => {
      recordCribDealerDraw({
        gameId: props.gameId,
        surface: 'Game.HighCardDealerSelection',
        controllerInstanceId: _cribTraceInstanceId,
        event: 'completion',
        payload: {
          winnerPosition: pos,
          callbackTarget: 'Game.HighCardDealerSelection.props.onComplete',
          handlerName: 'selectDealer',
          gameStatusGate: 'dealer_selection',
        },
      });
      props.onComplete(pos);
    },
    isHost: props.isHost,
    allowBotDealers: props.allowBotDealers,
    selectionVariant: props.selectionVariant,
    syncedState: props.syncedState,
    onCardsUpdate: props.onCardsUpdate,
    onWinnerPositionUpdate: props.onWinnerPositionUpdate,
  });

  // P-WAIT.C5: per-render trace — fires every render of the shim so
  // we can correlate cards-array transitions with parent re-renders
  // and prove whether the surface ever observed an empty cards frame
  // while still mounted (renders-but-shows-nothing) vs. unmounted.
  const cardsLen = props.syncedState?.cards?.length ?? 0;
  recordWaitingLifecycleIfChanged(
    `highCardRender:${props.gameId}`,
    'HighCardDealerSelection render',
    {
      gameId: props.gameId,
      isHost: props.isHost,
      selectionVariant: props.selectionVariant ?? 'default',
      hasSyncedState: !!props.syncedState,
      cardsLen,
      winnerPosition: props.syncedState?.winnerPosition ?? null,
      isComplete: !!props.syncedState?.isComplete,
      hasAnnouncement: !!props.syncedState?.announcement,
    },
  );

  useEffect(() => {
    recordDealerSelectionDiag('dealer_selection_surface_mounted', {
      sessionId: props.gameId,
      dealerSelectionId: `${props.gameId}:host`,
      cardCount: props.syncedState?.cards?.length ?? 0,
      winnerPosition: props.syncedState?.winnerPosition ?? null,
      scope: props.selectionVariant === 'cribbage' ? 'cribbage' : 'session',
      presentationVisibilityState: 'mounted-empty',
      extra: { isHost: props.isHost, surface: 'HighCardDealerSelection-shim', phase: 'mount' },
    });
    recordWaitingLifecycle('HighCardDealerSelection mount', {
      gameId: props.gameId,
      isHost: props.isHost,
      selectionVariant: props.selectionVariant ?? 'default',
      playerCount: props.players.length,
      eligibleCount: props.players.filter(p => !p.sitting_out && (!p.is_bot || props.allowBotDealers)).length,
      syncedCardCount: props.syncedState?.cards?.length ?? 0,
      hasSyncedState: !!props.syncedState,
      winnerPosition: props.syncedState?.winnerPosition ?? null,
      isComplete: !!props.syncedState?.isComplete,
    });
    return () => {
      recordDealerSelectionDiag('dealer_selection_surface_mounted', {
        sessionId: props.gameId,
        dealerSelectionId: `${props.gameId}:host`,
        scope: props.selectionVariant === 'cribbage' ? 'cribbage' : 'session',
        presentationVisibilityState: 'unmounted',
        extra: { surface: 'HighCardDealerSelection-shim', phase: 'unmount' },
      });
      recordWaitingLifecycle('HighCardDealerSelection unmount', {
        gameId: props.gameId,
        // Snapshot of last-observed sync state at teardown for cause-of-disappearance attribution.
        lastCardsLen: props.syncedState?.cards?.length ?? 0,
        lastWinnerPosition: props.syncedState?.winnerPosition ?? null,
        lastIsComplete: !!props.syncedState?.isComplete,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

function supportsDealerSelectionOverlay(gameType: string | null | undefined): boolean {
  if (gameType === 'cribbage' || gameType === 'gin-rummy') return true;
  if (gameType === 'horses' || gameType === 'ship-captain-crew' || gameType === 'yahtzee') return false;
  return isPokerVariantFamily(gameType);
}

import { VisualPreferencesProvider, useVisualPreferences, DeckColorMode } from "@/hooks/useVisualPreferences";
import { useGameChat } from "@/hooks/useGameChat";
import { GameChatContextProvider } from "@/hooks/GameChatContext";
import { VoiceOperationIdentityProvider } from "@/hooks/VoiceOperationIdentityContext";
import { getTabSessionId, setRuntimeAmbient } from "@/lib/runtimeInstrumentation/runtimeTracer";
import { setShellTabAttentionContext } from "@/lib/shellTabAttention/shellTabAttentionInstrumentation";
import { ChatAttentionProvider } from "@/hooks/ChatAttention";
import { useDeadlineEnforcer } from "@/hooks/useDeadlineEnforcer";
// useBotDecisionEnforcer was removed - it was a band-aid that caused race conditions
import { useWakeLock } from "@/hooks/useWakeLock";

import { startRound, makeDecision, autoFoldUndecided, proceedToNextRound, getLastKnownChips, snapshotDepartingPlayer, endRound } from "@/lib/gameLogic";
import {
  acknowledgePreparedHolmHandDealt,
  startHolmInitialHand,
  endHolmRound,
} from "@/lib/holmGameLogic";
import {
  selectHolmClientPresentationRound,
  type HolmClientPresentationRoundSelection,
} from "@/lib/holmPreparedPresentation";
import {
  getHolmResolutionRecoveryKey,
} from "@/lib/holmResolutionRecovery";
import { getHolmPhysicalBuckPosition } from "@/lib/holmBuckOwnership";
import { startHorsesRound } from "@/lib/horsesRoundLogic";
import { startSCCRound } from "@/lib/sccRoundLogic";
import { startCribbageRound } from "@/lib/cribbageRoundLogic";
import { beginCribbageDealerSelection } from "@/lib/cribbageAuthority";
import { startGinRummyRound } from "@/lib/ginRummyRoundLogic";
import { markGinSubmit, ginTrace } from "@/lib/ginStartupTrace";
import {
  StartupFlightRecorderOverlay,
  recordStartupFlight,
  recordStartupValue,
  useStartupRenderTrace,
} from "@/lib/startupFlightRecorder";
import { startYahtzeeRound } from "@/lib/yahtzeeRoundLogic";
import { advanceYahtzeePostgame } from "@/lib/yahtzeeAuthority";
import { addBotPlayer, addBotPlayerSittingOut, makeBotDecisions, makeBotAnteDecisions } from "@/lib/botPlayer";
import { isHolmHandReady, subscribeHolmHandReady } from "@/lib/canonicalShell/cardTransport/holmDealBarrier";
import { evaluatePlayerStatesEndOfGame, rotateDealerPosition, getMakeItTakeItDealer, sanitizePlayerAutomationStateForSession, clearDealerGameTransientSessionState } from "@/lib/playerStateEvaluation";
import { normalizeTwoPlayerSeatsIfNeeded } from "@/lib/normalizeTwoPlayerSeats";
import { recordNormalizationDbg, type NormalizationResultCode } from "@/lib/normalizationDbg";
import { createStartGameTrace, emitStartGameStage, capturePostgrestResult, captureException } from "@/lib/startGameTrace";
import { resolveSessionHostPlayerId } from "@/lib/debugHarness/resolveHarnessHost";
import { Card as CardType, has357Hand } from "@/lib/cardUtils";
import {
  buildTerminal357GenerationId,
  type Terminal357Descriptor,
  type Terminal357PlayerLegsSnapshot,
} from "@/lib/threeFiveSeven/terminalDescriptor";
import { formatChipValue } from "@/lib/utils";
import { getBotAlias } from "@/lib/botAlias";
import { Share2, Bot } from "lucide-react";
import { logSessionEvent, logStatusChanged, logConfigDeadlineSet, logSessionDeleted } from "@/lib/sessionEventLog";
import { traceMilestone, linkTraceToGame, startSpan } from "@/lib/traceHelpers";
import { logDebugEvent } from "@/lib/debugEventLogger";
import { shouldLogTurnTransition, isFreshMountForRound, logTurnTransitionSeed, logTurnTimerFirstRender, checkTimerRefill } from "@/lib/turnTransitionInstrumentation";
import { record357DiagnosticViolation } from "@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics";
import { buildMetaPayload } from "@/lib/buildMeta";
import { isSafetyPollingDisabled } from "@/lib/debugFlags";
import { isNoTimersEnabledCached } from "@/lib/geometryLab/noTimersStore";
import { applyWithDebugTiming } from "@/lib/debugRaceHarness";
import { simulateRealtime, configureNetworkSim } from "@/lib/networkSim";
import { runHolmInvariants, resetRegressiveRevealTracking } from "@/lib/holmSyncDiagnostics";
import { persistSyncDebugEvent, persistTransition } from "@/lib/persistSyncDebugEvent";
import { BUILD_IDENTITY } from "@/lib/buildIdentity";


import { checkThreeFiveSevenStaleRound, checkThreeFiveSevenStaleHand, checkThreeFiveSevenStuckOldRound, classify357TransitionType, persist357Investigation } from "@/lib/threeFiveSevenSyncDiagnostics";
import { beginCribbageHandoffTrace, emitCribbageHandoffTrace } from "@/lib/cribbageHandoffTrace";
import { DebugLogToggle } from "@/components/DebugLogToggle";
import { useDebugHarness } from "@/lib/debugHarness/useDebugHarness";


import { PlayerOptionsMenu } from "@/components/PlayerOptionsMenu";
import { VisualBugReportButton } from "@/components/VisualBugReportButton";
import { NotEnoughPlayersCountdown } from "@/components/NotEnoughPlayersCountdown";
import { RejoinNextHandButton } from "@/components/RejoinNextHandButton";
import { PlayerClickDialog } from "@/components/PlayerClickDialog";
import { GameDeckColorModeSync, handleDeckColorModeChange } from "@/components/GameDeckColorModeSync";
import { DeadlineDebugPanel } from "@/components/DeadlineDebugPanel";
import { recordFeltDebug as feltDebugRecord } from "@/lib/canonicalShell/feltDebugStore";
import {
  armGinPhaseTrace,
  markGinPhaseTraceAnteResolved,
  recordGinPhaseTrace,
} from "@/lib/ginPhaseTrace";
// Win-presentation instrumentation was removed.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  sitting_out_hands: number;
  ante_decision: string | null;
  auto_ante: boolean;
  auto_ante_runback: boolean;
  sit_out_next_hand: boolean;
  stand_up_next_hand: boolean;
  waiting: boolean;
  deck_color_mode?: string | null;
  created_at?: string;
  auto_fold: boolean;
  profiles?: {
    username: string;
  };
}

/**
 * F5.1/F4.2: Read the `all_decisions_in` flag identity-scoped to a specific
 * round id. The raw `games.all_decisions_in` boolean can persist across hand/
 * round transitions (the systemic stale progression-flag bug class). Every
 * render-driving and side-effect-driving read MUST go through this helper so
 * a flag set against a prior round can never satisfy a check made for a fresh
 * round.
 *
 * - Returns false when the game has no flag set.
 * - Returns false when the flag has a scoping round id that differs from
 *   `roundId`.
 * - Returns true when the flag is set and either (a) no scoping round id is
 *   recorded (legacy unscoped writers — backwards compatibility) or (b) the
 *   scoping round id matches `roundId`.
 */
function isAllDecisionsInFor(
  game:
    | { all_decisions_in?: boolean | null; all_decisions_in_round_id?: string | null }
    | null
    | undefined,
  roundId: string | null | undefined,
): boolean {
  if (!game || game.all_decisions_in !== true) return false;
  const scopeId = game.all_decisions_in_round_id;
  if (!scopeId) return true; // legacy / unmigrated writer
  return !!roundId && scopeId === roundId;
}

interface GameData {
  id: string;
  name?: string;
  status: string;
  buy_in: number;
  pot: number | null;
  current_round: number | null;
  all_decisions_in: boolean | null;
  all_decisions_in_round_id?: string | null;
  dealer_position: number | null;
  awaiting_next_round?: boolean | null;
  next_round_number?: number | null;
  ante_decision_deadline?: string | null;
  ante_amount?: number;
  leg_value?: number;
  pussy_tax_enabled?: boolean;
  pussy_tax_value?: number;
  legs_to_win?: number;
  pot_max_enabled?: boolean;
  pot_max_value?: number;
  last_round_result?: string | null;
  pending_session_end?: boolean;
  game_over_at?: string | null;
  session_ended_at?: string | null;
  created_at?: string;
  total_hands?: number | null;
  game_type?: string | null;
  buck_position?: number | null;
  chucky_cards?: number;
  is_paused?: boolean;
  paused_time_remaining?: number | null;
  real_money?: boolean;
  rabbit_hunt?: boolean;
  reveal_at_showdown?: boolean;
  is_first_hand?: boolean;
  config_complete?: boolean;
  config_deadline?: string | null;
  current_game_uuid?: string | null;
  chip_transfer_cursor?: number | null;
  game_setup_timer_seconds?: number;
  ante_decision_timer_seconds?: number;
  // Cribbage-specific settings
  points_to_win?: number | null;
  skunk_enabled?: boolean | null;
  skunk_threshold?: number | null;
  double_skunk_enabled?: boolean | null;
  double_skunk_threshold?: number | null;
  rounds?: Round[];
}

interface Round {
  id: string;
  game_id: string;
  round_number: number;
  // 3-5-7: round_number cycles each hand, so we must also key by hand_number (and usually dealer_game_id).
  hand_number?: number | null;
  dealer_game_id?: string | null;
  cards_dealt: number;
  pot: number;
  status: string;
  decision_deadline: string | null;
  community_cards?: any;
  community_cards_revealed?: number;
  chucky_active?: boolean;
  chucky_cards?: any;
  chucky_cards_revealed?: number;
  current_turn_position?: number | null;
  pending_turn_position?: number | null;
  holm_predecessor_round_id?: string | null;
  presentation_fallback_at?: string | null;
  holm_turn_sequence?: number;
  created_at?: string;
  horses_state?: any; // Horses dice game state
  gin_rummy_state?: any; // Gin Rummy JSONB state
}

type HolmTraceDecisionSeat = {
  id: string | null;
  position: number | null;
  isBot: boolean;
  status: string | null;
  sittingOut: boolean;
  currentDecision: string | null;
  decisionLocked: boolean;
  eligible: boolean;
  shouldSkip: boolean;
};

function getHolmDealIdentityFromRound(round: Pick<Round, 'id' | 'hand_number'> | null | undefined): string | null {
  if (!round?.id) return null;
  return `${round.id}:h${round.hand_number ?? 'unknown'}`;
}

function summarizeHolmDecisionSeats(players: readonly Player[] | null | undefined): HolmTraceDecisionSeat[] {
  return (players ?? [])
    .map((p) => {
      const position = typeof p.position === 'number' ? p.position : null;
      const sittingOut = p.sitting_out === true;
      const status = p.status ?? null;
      const decisionLocked = p.decision_locked === true;
      const currentDecision = p.current_decision ?? null;
      const eligible = position !== null && status === 'active' && !sittingOut;
      return {
        id: p.id ?? null,
        position,
        isBot: p.is_bot === true,
        status,
        sittingOut,
        currentDecision,
        decisionLocked,
        eligible,
        shouldSkip: !eligible || decisionLocked || currentDecision !== null,
      };
    })
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
}

function resolveExpectedHolmNextSeat(
  previousCurrentTurnPosition: number | null,
  seats: readonly HolmTraceDecisionSeat[],
): number | null {
  if (previousCurrentTurnPosition == null) return null;

  const activePositions = seats
    .filter((s) => s.eligible && typeof s.position === 'number')
    .map((s) => s.position as number);
  const undecidedPositions = seats
    .filter((s) => s.eligible && !s.decisionLocked && s.currentDecision == null && typeof s.position === 'number')
    .map((s) => s.position as number);

  if (undecidedPositions.length === 0) return null;

  try {
    if (undecidedPositions.includes(previousCurrentTurnPosition)) {
      return nextClockwise(previousCurrentTurnPosition, undecidedPositions);
    }

    if (!activePositions.includes(previousCurrentTurnPosition)) return null;
    let probe = nextClockwise(previousCurrentTurnPosition, activePositions);
    let guard = 0;
    while (!undecidedPositions.includes(probe) && guard < activePositions.length + 1) {
      probe = nextClockwise(probe, activePositions);
      guard += 1;
    }
    return undecidedPositions.includes(probe) ? probe : null;
  } catch {
    return null;
  }
}

function buildHolmTurnAuthorityTraceDetail(params: {
  source: 'realtime INSERT' | 'realtime UPDATE' | 'fetchGameData';
  round: Partial<Round> | null | undefined;
  players: readonly Player[] | null | undefined;
  previousCurrentTurnPosition: number | null;
}): Record<string, unknown> {
  const { source, round, players, previousCurrentTurnPosition } = params;
  const nextCurrentTurnPosition = typeof round?.current_turn_position === 'number'
    ? round.current_turn_position
    : null;
  const seats = summarizeHolmDecisionSeats(players);
  const expectedClockwiseNextEligibleSeat = resolveExpectedHolmNextSeat(previousCurrentTurnPosition, seats);
  const comparisonApplicable =
    previousCurrentTurnPosition != null &&
    nextCurrentTurnPosition != null &&
    previousCurrentTurnPosition !== nextCurrentTurnPosition &&
    round?.status === 'betting';
  const incomingMatchesExpected = comparisonApplicable
    ? nextCurrentTurnPosition === expectedClockwiseNextEligibleSeat
    : null;
  const decisionSummaryForIncomingSeat = seats.find((s) => s.position === nextCurrentTurnPosition) ?? null;
  const incomingTargetsSkippedSeat = round?.status === 'betting' && nextCurrentTurnPosition != null
    ? (decisionSummaryForIncomingSeat ? decisionSummaryForIncomingSeat.shouldSkip : true)
    : false;

  return {
    timestamp: new Date().toISOString(),
    roundId: round?.id ?? null,
    stableHolmDealIdentityKey: getHolmDealIdentityFromRound(round as Round | null | undefined),
    handNumber: round?.hand_number ?? null,
    previousCurrentTurnPosition,
    nextCurrentTurnPosition,
    source,
    rawAuthoritativeRoundStatus: round?.status ?? null,
    decisionMap: seats,
    expectedClockwiseNextEligibleSeat,
    incomingMatchesExpected,
    incomingTargetsSkippedSeat,
    decisionSummaryForIncomingSeat,
  };
}

function toDealerSelectionCardIds(cards: DealerSelectionCard[] | null | undefined): string[] {
  if (!cards || cards.length === 0) return [];
  return cards.slice(0, 8).map((c) => {
    const rank = (c as any)?.card?.rank ?? '?';
    const suit = ((c as any)?.card?.suit ?? '?').toString().slice(0, 1);
    const pos = (c as any)?.position ?? '?';
    return `${rank}${suit}@${pos}`;
  });
}

function pickActive357Round(
  rounds: Round[] | undefined,
  params: {
    currentRoundNumber: number | null | undefined;
    currentHandNumber: number | null | undefined;
    dealerGameId: string | null | undefined;
  }
): Round | null {
  if (!rounds || rounds.length === 0) return null;

  const { currentRoundNumber, currentHandNumber, dealerGameId } = params;

  // CRITICAL: Always require dealer_game_id to prevent cross-game contamination
  if (!dealerGameId) {
    console.warn('[pickActive357Round] ⚠️ Missing dealer_game_id - cannot safely select round');
    return null;
  }

  if (typeof currentRoundNumber === 'number' && typeof currentHandNumber === 'number') {
    const exact = rounds.find((r) =>
      r.round_number === currentRoundNumber &&
      r.hand_number === currentHandNumber &&
      r.dealer_game_id === dealerGameId
    );
    if (exact) return exact;
  }

  // Fallback: most recent betting round within this dealer game.
  // IMPORTANT: Never use created_at ordering for round selection.
  const candidates = rounds.filter((r) => r.dealer_game_id === dealerGameId);
  const sorted = [...candidates].sort((a, b) => {
    const aHand = typeof a.hand_number === 'number' ? a.hand_number : 0;
    const bHand = typeof b.hand_number === 'number' ? b.hand_number : 0;
    if (bHand !== aHand) return bHand - aHand;
    return (b.round_number ?? 0) - (a.round_number ?? 0);
  });

  return sorted.find((r) => r.status === 'betting') ?? sorted[0] ?? null;
}

function pickLatestRoundByKey(rounds: Round[] | undefined, dealerGameId?: string | null): Round | null {
  if (!rounds || rounds.length === 0) return null;
  
  // CRITICAL: Always require dealer_game_id to prevent cross-game contamination
  if (!dealerGameId) {
    console.warn('[pickLatestRoundByKey] ⚠️ Missing dealer_game_id - cannot safely select round');
    return null;
  }
  
  const candidates = rounds.filter((r) => r.dealer_game_id === dealerGameId);
  if (candidates.length === 0) return null;

  return (
    [...candidates].sort((a, b) => {
      const aHand = typeof a.hand_number === 'number' ? a.hand_number : 0;
      const bHand = typeof b.hand_number === 'number' ? b.hand_number : 0;
      if (bHand !== aHand) return bHand - aHand;
      return (b.round_number ?? 0) - (a.round_number ?? 0);
    })[0] ?? null
  );
}

function pickActiveSingleRoundGameRound(
  rounds: Round[] | undefined,
  params: {
    dealerGameId: string | null | undefined;
    currentRoundNumber: number | null | undefined;
    currentHandNumber?: number | null | undefined;
  }
): Round | null {
  if (!rounds || rounds.length === 0) return null;

  const { dealerGameId, currentRoundNumber, currentHandNumber } = params;

  // CRITICAL (isolation): single-round games MUST be scoped to dealer_game_id.
  // Falling back to unscoped selection is the primary source of cross-game contamination.
  if (!dealerGameId) return null;

  const dealerRounds = rounds.filter((r) => r.dealer_game_id === dealerGameId);
  if (dealerRounds.length === 0) return null;

  // Prefer an exact (hand_number, round_number) match when available.
  if (typeof currentHandNumber === 'number' && typeof currentRoundNumber === 'number') {
    const exact = dealerRounds.find(
      (r) => r.hand_number === currentHandNumber && r.round_number === currentRoundNumber
    );
    if (exact) return exact;
  }

  // Next best: when multiple rounds share the same round_number (e.g., Holm uses round_number=1 each hand),
  // choose the latest by hand_number.
  if (typeof currentRoundNumber === 'number') {
    const sameRoundNumber = dealerRounds.filter((r) => r.round_number === currentRoundNumber);
    if (sameRoundNumber.length > 0) {
      return (
        [...sameRoundNumber].sort((a, b) => {
          const aHand = typeof a.hand_number === 'number' ? a.hand_number : -1;
          const bHand = typeof b.hand_number === 'number' ? b.hand_number : -1;
          if (bHand !== aHand) return bHand - aHand;
          return (b.round_number ?? -1) - (a.round_number ?? -1);
        })[0] ?? null
      );
    }
  }

  // Fallback: latest round within this dealer game.
  return pickLatestRoundByKey(dealerRounds);
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

// Authoritative card count from the round record - bypasses state sync issues
interface CardStateContext {
  roundId: string;
  roundNumber: number;
  cardsDealt: number; // Authoritative expected card count
}

// ── Holm Shadow Sync: snapshot builder (Phase 2 — read-only) ──
function buildHolmSnapshot(
  gameData: GameData,
  playersData: Player[],
  currentRound: Round | null
): HolmAuthoritativeSnapshot | null {
  if (!currentRound) return null;
  if (gameData.game_type !== 'holm-game') return null;
  if (
    gameData.status !== 'in_progress' &&
    gameData.status !== 'game_over' &&
    gameData.status !== 'session_ended'
  ) return null;

  const roundStatus = (currentRound.status as 'dealing' | 'betting' | 'processing' | 'showdown' | 'completed') ?? 'betting';
  const rawRevealed = currentRound.community_cards_revealed ?? 0;

  // CLAMP FIX: The DB round row may carry community_cards_revealed=4 from the previous
  // completed hand (the row is reused or fetched stale during hand transitions).
  // During betting phase, max 2 cards should ever be visible.
  // During processing phase, the game logic explicitly writes community_cards_revealed=4
  // AFTER all decisions are in (all_decisions_in=true), so we must allow that through.
  // Clamping processing unconditionally blocks cards 3-4 from appearing before Chucky.
  // F5.1: only honor all_decisions_in when scoped to the current round id.
  const allDecisionsIn = isAllDecisionsInFor(gameData, currentRound.id);
  const clampedRevealed = (roundStatus === 'betting' || (roundStatus === 'processing' && !allDecisionsIn))
    ? Math.min(rawRevealed, 2)
    : rawRevealed;

  return {
    roundId: currentRound.id,
    handNumber: currentRound.hand_number ?? 1,
    // Defensive stamp: mirrors the Horses P0 #2 framework cutover so the
    // most-significant progress dim cannot be canceled by any future
    // closure-captured handNumber drift.
    __syncHandNumber: currentRound.hand_number ?? 1,
    dealerGameId: gameData.current_game_uuid ?? '',
    roundStatus,
    players: playersData.map(p => ({
      playerId: p.id,
      userId: p.user_id,
      position: p.position,
      decision: p.current_decision,
      // Successor-hand creation now clears every player decision before the
      // round/card/game publication commits. Preserve the real lock here: a
      // folded hand must never render as unlocked while retaining its fold.
      decisionLocked: p.decision_locked ?? false,
      autoFold: p.auto_fold,
      sittingOut: p.sitting_out,
    })),
    turnSequence: currentRound.holm_turn_sequence ?? 0,
    currentTurnPosition: currentRound.current_turn_position ?? null,
    decisionDeadline: currentRound.decision_deadline,
    communityCards: (currentRound.community_cards ?? []) as unknown[],
    communityCardsRevealed: clampedRevealed,
    chuckyCards: (currentRound.chucky_cards ?? []) as unknown[],
    chuckyActive: currentRound.chucky_active ?? false,
    chuckyCardsRevealed: currentRound.chucky_cards_revealed ?? 0,
    pot: gameData.pot ?? 0,
    chipTransferCursor: gameData.chip_transfer_cursor ?? 0,
    lastRoundResult: gameData.last_round_result ?? null,
    buckPosition: gameData.buck_position ?? 0,
    dealerPosition: gameData.dealer_position ?? 0,
  };
}

// ── 3-5-7 Shadow Sync: snapshot builder (Phase 2 — read-only) ──
function buildThreeFiveSevenSnapshot(
  gameData: GameData,
  playersData: Player[],
  currentRound: Round | null
): ThreeFiveSevenAuthoritativeSnapshot | null {
  if (!currentRound) return null;
  if (gameData.game_type !== '3-5-7' && gameData.game_type !== '357' && gameData.game_type !== '3-5-7-game') return null;
  if (gameData.status !== 'in_progress' && gameData.status !== 'game_over') return null;

  const roundStatus = (currentRound.status === 'completed' ? 'completed' : 'betting') as 'betting' | 'completed';

  return {
    roundId: currentRound.id,
    handNumber: currentRound.hand_number ?? 1,
    roundNumber: currentRound.round_number,
    dealerGameId: gameData.current_game_uuid ?? '',
    roundStatus,
    players: playersData.map(p => ({
      playerId: p.id,
      userId: p.user_id,
      position: p.position,
      decision: p.current_decision,
      decisionLocked: p.decision_locked ?? false,
      autoFold: p.auto_fold,
      sittingOut: p.sitting_out,
    })),
    currentTurnPosition: currentRound.current_turn_position ?? null,
    decisionDeadline: currentRound.decision_deadline,
    pot: gameData.pot ?? 0,
    lastRoundResult: gameData.last_round_result ?? null,
    awaitingNextRound: gameData.awaiting_next_round ?? false,
    buckPosition: gameData.buck_position ?? 0,
    dealerPosition: gameData.dealer_position ?? 0,
    cardsDealt: currentRound.cards_dealt,
    // Defensive monotonicity stamp — see threeFiveSevenProgress.ts.
    // Pinned at snapshot-build time so a stale closure-captured snapshot
    // cannot regress the hand dim of the progress vector at a hand boundary.
    __syncHandNumber: currentRound.hand_number ?? 1,
  };
}

// Module-level dedup cache for BOOTSTRAP_FLASH_DIAG (see in-render
// usage below). Lives outside the component so it survives the early
// `if (!game) return null` guard without needing a React hook.
const __bootstrapFlashDiagCache = new Map<string, string>();

// Module-level stable-identity cache for the shell SeatAnchorLayer
// roster. Lives outside the component so we can dedupe array identity
// across renders without introducing a React hook after the
// `if (!game) return null` early-return guard.
const __shellSeatRosterCache = new Map<
  string,
  { key: string; seats: Array<{ position: number; occupied: boolean; hidden: boolean }> }
>();

// Wartime FIX #1 — stable participants array for the shell-owned
// pre-session seat layer. Keyed by gameId; the key is recomputed only
// when meaningful roster fields change so PreSessionSeatLayer receives
// the SAME array identity across phase transitions and React does not
// see prop churn.
const __shellPreSessionRosterCache = new Map<
  string,
  {
    key: string;
    participants: Array<{
      id: string;
      position: number;
      chips?: number | null;
      status?: string;
      user_id?: string | null;
      is_bot?: boolean | null;
      waiting?: boolean | null;
      sitting_out?: boolean | null;
      profiles?: { username?: string };
    }>;
  }
>();

// Stable per-tab mount-instance id so the persisted diag can tell
// the two clients apart on the next repro without relying on memory.
// Generated once per page load; survives the early-return guard.
const __bootstrapFlashClientInstanceId =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;



const Game = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { user, isReady: authReady } = useAuthGuard({ pageLabel: "Game" });
  const { isAdmin } = useIsAdmin(user?.id);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [_game, setGame] = useState<GameData | null>(null);
  // Post-hydration continuity: once the session has loaded a real game,
  // we never re-enter the empty bootstrap branch even if `_game` flips
  // null transiently (stale fetch, realtime resubscribe, etc.). The
  // bootstrap shell is reserved for true first route entry only.
  const lastGameRef = useRef<GameData | null>(null);
  if (_game) lastGameRef.current = _game;
  const hasHydratedRef = useRef(false);
  if (_game) hasHydratedRef.current = true;
  const game: GameData | null = _game ?? (hasHydratedRef.current ? lastGameRef.current : null);

  // A Waiting-table entry gets one immediate, ordinary presence pulse instead
  // of waiting for the four-second cadence. The database owns whether that
  // observation matters: only a result-bearing post-game watch can use it.
  // Fresh waiting rooms, live dealer games, setup, and ante remain inert.
  const waitingPresencePulseKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const isWaitingTable =
      game?.status === 'waiting' || game?.status === 'waiting_for_players';
    const currentDealerGameId = (game as any)?.current_game_uuid ?? null;
    if (!gameId || !isWaitingTable || currentDealerGameId !== null) {
      waitingPresencePulseKeyRef.current = null;
      return;
    }

    const pulseKey = `${gameId}:${game?.status}`;
    if (waitingPresencePulseKeyRef.current === pulseKey) return;

    waitingPresencePulseKeyRef.current = pulseKey;
    refreshVoicePresenceHeartbeat();
  }, [game?.status, (game as any)?.current_game_uuid, gameId]);

  // ── Cribbage entry-mode provenance (persistent owner: Game.tsx route mount) ──
  // Captures the canonical (dealerGameId, handNumber) pair present at the first
  // render where the route has hydrated a game record. Any later identity that
  // differs from this baseline was introduced *after* this route instance
  // mounted → LIVE. An identity matching the baseline is a refresh/rejoin into
  // a pre-existing hand → HISTORICAL. This replaces the CribbageMobileGameTable
  // mount-time heuristic, which could not distinguish "already-present client
  // witnessing a new dealer-game/hand" from "client rejoining after that hand
  // already existed" (both looked like "first hand seen by this mount").
  const initialCribbageIdentityRef = useRef<{
    captured: boolean;
    dealerGameId: string | null;
    handNumber: number | null;
  }>({ captured: false, dealerGameId: null, handNumber: null });

  // 3-5-7 entry-mode provenance (persistent owner: Game.tsx route mount).
  // Mirrors the Cribbage contract above. Captures the authoritative
  // (current_game_uuid, currentRound.hand_number) baseline at the first
  // render where the 3-5-7 game record has hydrated. A later identity that
  // differs from this baseline was introduced AFTER route mount → LIVE
  // (run the opening wave animation). A matching identity is a
  // refresh/rejoin into a pre-existing hand → HISTORICAL (skip replay).
  const initial357IdentityRef = useRef<{
    captured: boolean;
    dealerGameId: string | null;
    handNumber: number | null;
  }>({ captured: false, dealerGameId: null, handNumber: null });
  const initialHolmIdentityRef = useRef<{
    captured: boolean;
    dealerGameId: string | null;
    roundId: string | null;
    handNumber: number | null;
  }>({ captured: false, dealerGameId: null, roundId: null, handNumber: null });
  // DG1H1 is created atomically in `betting`, so its first snapshot cannot by
  // itself distinguish a mounted client that just witnessed setup/ante from a
  // cold mount into an already-active hand. Preserve that route provenance
  // separately; it never advances game state and resets naturally on route
  // remount.
  const holmPreHandLifecycleObservedRef = useRef(false);

  // Push game context into network simulation runtime for log enrichment
  useEffect(() => {
    configureNetworkSim({
      gameId: gameId ?? null,
      handNumber: game?.total_hands ?? null,
    });
  }, [gameId, game?.total_hands]);

  // Auto-arm Chat Flight Recorder for this game_id (idempotent, 15-min window).
  useEffect(() => {
    if (!gameId) return;
    import("@/lib/chatFlightRecorder").then(({ ensureChatFlightRecorderArmed }) => {
      ensureChatFlightRecorderArmed(gameId);
    }).catch(() => {});
  }, [gameId]);

  // Wartime AUTH_EJECTION_LEDGER: record waiting-table mount / unmount /
  // lookup outcomes so a redirect back to /auth can be traced against
  // the pre-teardown table membership.
  useEffect(() => {
    let alive = true;
    import("@/lib/authEjectionLedger").then(({ recordWaitingTableLifecycle }) => {
      if (!alive) return;
      recordWaitingTableLifecycle({
        phase: "mount",
        dealerGameId: gameId ?? null,
        userId: user?.id ?? null,
      });
    }).catch(() => {});
    return () => {
      alive = false;
      import("@/lib/authEjectionLedger").then(({ recordWaitingTableLifecycle }) => {
        recordWaitingTableLifecycle({
          phase: "unmount",
          dealerGameId: gameId ?? null,
          userId: user?.id ?? null,
        });
      }).catch(() => {});
    };
  }, [gameId, user?.id]);

  useEffect(() => {
    if (!gameId) return;
    if (!game) return;
    import("@/lib/authEjectionLedger").then(({ recordWaitingTableLifecycle }) => {
      recordWaitingTableLifecycle({
        phase: "lookup-ok",
        dealerGameId: gameId,
        userId: user?.id ?? null,
        detail: {
          status: game.status,
          gameType: game.game_type,
          currentGameUuid: (game as any)?.current_game_uuid ?? null,
        },
      });
    }).catch(() => {});
  }, [gameId, game?.status, game?.game_type, (game as any)?.current_game_uuid, user?.id]);


  // POT STABILITY:
  // Backend updates can briefly emit pot=null during hand/round transitions (frontend was coercing null -> 0).
  // Keep last non-null pot so the UI never flashes back to $0 while chip stacks are already updated.
  const lastNonNullPotRef = useRef<number>(0);
  useEffect(() => {
    if (game?.pot !== null && game?.pot !== undefined) {
      lastNonNullPotRef.current = game.pot;
    } else if (game && lastNonNullPotRef.current > 0) {
      console.error('[POT_NULL] backend pot is null; using last known pot', {
        gameId,
        status: game.status,
        lastPot: lastNonNullPotRef.current,
      });
    }
  }, [game?.pot, game?.status, gameId]);

  const potForDisplay = game?.pot ?? lastNonNullPotRef.current ?? 0;

  // DEBUG: disable polling-based safety nets to isolate race conditions (reload to apply)
  const safetyPollsDisabled = useMemo(() => isSafetyPollingDisabled(), []);

  const [players, setPlayers] = useState<Player[]>([]);
  const [playerCards, setPlayerCards] = useState<PlayerCards[]>([]);
  /**
   * Identity captured at the moment `playerCards` was written from an
   * authoritative fetch. `playerCardsForPresentation` is gated on this
   * identity so that a rotated `cardStateContext` cannot re-label the
   * previous round's card array as the new round's data during the
   * brief window before the new fetch resolves.
   */
  const [playerCardsIdentity, setPlayerCardsIdentity] = useState<{
    dealerGameId: string | null;
    handNumber: number | null;
    roundId: string;
    handContextId: string;
  } | null>(null);
  const [cardStateContext, setCardStateContext] = useState<CardStateContext | null>(null); // Authoritative card count
  const cardFetchTokenRef = useRef(0); // FIX 3: fetch token to prevent overlap races

  // When playerCards is cleared (any writer), drop the bound identity so a
  // stale identity can never gate an empty array as if it were authoritative.
  useEffect(() => {
    if (playerCards.length === 0 && playerCardsIdentity !== null) {
      setPlayerCardsIdentity(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCards]);

  // 357 fetch/clear diagnostic helpers removed — call sites retained as no-ops.
  const emit357ClearEvent = (_id: string, _reason: string, _line: number) => { /* noop */ };

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useStartupRenderTrace('Game', {
    routeGameId: gameId ?? null,
    loading,
    authReady,
    hasGame: !!game,
    gameStatus: game?.status ?? null,
    gameType: game?.game_type ?? null,
    currentGameUuid: (game as any)?.current_game_uuid ?? null,
    currentRoundNumber: game?.current_round ?? null,
    totalHands: game?.total_hands ?? null,
    playersCount: players.length,
  });

  // ── P-WAIT.A2/A3: Game route render + first-hydration markers ──
  // Change-only emit (deduped by signature) on every render.
  recordWaitingLifecycleIfChanged(
    `gameRouteRender:${gameId ?? 'none'}`,
    'Game route render',
    {
      routeGameId: gameId ?? null,
      hasGame: !!game,
      loading,
      authReady,
      status: game?.status ?? null,
      gameType: game?.game_type ?? null,
      currentGameUuid: (game as any)?.current_game_uuid ?? null,
      playersCount: players.length,
    },
  );
  const _waitMountTRef = useRef<number>(0);
  if (_waitMountTRef.current === 0 && typeof performance !== 'undefined') {
    _waitMountTRef.current = performance.now();
  }
  const _waitFetchSeqRef = useRef<number>(0);
  const _waitFirstHydratedRef = useRef<boolean>(false);
  useEffect(() => {
    if (_game) _waitFetchSeqRef.current += 1;
    if (!_waitFirstHydratedRef.current && _game) {
      _waitFirstHydratedRef.current = true;
      recordWaitingLifecycle('game row first hydrated', {
        gameId: _game.id ?? gameId ?? null,
        status: _game.status ?? null,
        gameType: _game.game_type ?? null,
        currentGameUuid: (_game as any)?.current_game_uuid ?? null,
        playersCount: players.length,
        elapsedMs: typeof performance !== 'undefined'
          ? Math.round(performance.now() - _waitMountTRef.current)
          : null,
        fetchSeq: _waitFetchSeqRef.current,
      });
    }
  }, [_game, gameId, players.length]);

  // P-WAIT.A1: Route entry one-shot — emitted on Game component first mount.
  // Anchors the "blank shell window" measurement: every subsequent
  // [WAIT] event timestamp can be subtracted from this to attribute
  // the 2-3s gap between route entry and WaitingTable mount.
  useEffect(() => {
    recordWaitingLifecycle('Game route enter', {
      routeGameId: gameId ?? null,
      authReadyAtEnter: authReady,
      hasUserAtEnter: !!user,
      tMount: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P-WAIT.A1b: Auth ready transition. Fires once when authReady flips
  // to true (or immediately if already true on first mount).
  const _waitAuthReadyEmittedRef = useRef(false);
  useEffect(() => {
    if (_waitAuthReadyEmittedRef.current) return;
    if (!authReady) return;
    _waitAuthReadyEmittedRef.current = true;
    recordWaitingLifecycle('auth ready', {
      routeGameId: gameId ?? null,
      hasUser: !!user,
      userId: user?.id?.slice(0, 8) ?? null,
      elapsedMs: typeof performance !== 'undefined'
        ? Math.round(performance.now() - _waitMountTRef.current)
        : null,
    });
  }, [authReady, user?.id, gameId]);

  // P-WAIT.A4 tracker is installed after dealerSelectionCards is declared (see below).

  // (P9.x revert) Gin-only optimistic bootstrap removed — all gin first-frame
  // state flows through useGameStateSync via currentRound.gin_rummy_state.

  const [anteTimeLeft, setAnteTimeLeft] = useState<number | null>(null);
  const [showAnteDialog, setShowAnteDialog] = useState(false);
  
  // ── Ante latch: prevents modal re-show after confirm within same dealerGame ──
  const anteConfirmedLatchRef = useRef<string | null>(null); // stores "gameId|dealerGameId|playerId"
  
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [isBlastingGame, setIsBlastingGame] = useState(false);
  const [hasShownEndingToast, setHasShownEndingToast] = useState(false);
  const [lastTurnPosition, setLastTurnPosition] = useState<number | null>(null);
  const [timerTurnPosition, setTimerTurnPosition] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'stay' | 'fold' | null>(null);
  const [decisionTimerSeconds, setDecisionTimerSeconds] = useState<number>(30);
  const decisionTimerRef = useRef<number>(30); // Use ref for immediate access
  const anteProcessingRef = useRef(false);
  const playersRef = useRef<Player[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);
  // Guard against duplicate bot ante execution for the same (gameId, dealerGameId).
  // Keyed by `${gameId}:${dealerGameId ?? ''}`. Cleared when the effect's identity changes.
  const botAnteInFlightKeyRef = useRef<string | null>(null);
  const isPausedRef = useRef<boolean | undefined>(false); // Track pause state for timer interval
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // Track timer interval for cleanup
  const [decisionDeadline, setDecisionDeadline] = useState<string | null>(null); // Server deadline for timer sync
  const [dealReadiness357, setDealReadiness357] =
    useState<ThreeFiveSevenDealReadinessToken | null>(null);
  const expectedDealHandContext357 =
    game?.current_game_uuid && typeof game.total_hands === 'number' && game.total_hands > 0
      ? `${game.current_game_uuid}#h${game.total_hands}`
      : null;
  const expectedDealRoundNumber357 =
    typeof game?.current_round === 'number' && game.current_round > 0
      ? game.current_round
      : null;
  const expectedDealWaveContext357 =
    expectedDealHandContext357 && expectedDealRoundNumber357
      ? `${expectedDealHandContext357}#r${expectedDealRoundNumber357}`
      : null;
  const dealTimerAllowed357 = isThreeFiveSevenDealPresentationReady(
    {
      handContextId: expectedDealHandContext357,
      waveContextId: expectedDealWaveContext357,
      roundId: dealReadiness357?.roundNumber === expectedDealRoundNumber357
        ? dealReadiness357.roundId
        : null,
      roundNumber: expectedDealRoundNumber357,
    },
    dealReadiness357,
  );
  // Legacy denominator remains the presentation source for non-Holm games.
  const [decisionMaxTime, setDecisionMaxTime] = useState<number | null>(null);
  const decisionMaxTimeDeadlineRef = useRef<string | null>(null);
  // Atomic presentation snapshot for one normalized deadline identity. Keeping the
  // remaining value, denominator, and epoch together prevents a new Holm turn from
  // publishing the prior turn's percentage while the new denominator is committing.
  // Gameplay expiry continues to use `timeLeft` and the authoritative deadline.
  const [decisionTimerPresentation, setDecisionTimerPresentation] = useState<{
    deadline: string;
    dealerGameId: string;
    roundId: string;
    handNumber: number;
    remainingSeconds: number;
    totalSeconds: number;
  } | null>(null);
  const currentDecisionTimerPresentation =
    decisionDeadline && decisionTimerPresentation?.deadline === decisionDeadline
      ? decisionTimerPresentation
      : null;
  const [cachedRoundData, setCachedRoundData] = useState<Round | null>(null); // Cache round data during game_over to preserve community cards
  const cachedRoundRef = useRef<Round | null>(null); // Ref for immediate cache access (survives re-renders)
  const gameTypeSwitchingRef = useRef<boolean>(false); // Guard against realtime overwrites during game type switches
  const gameOverTransitionRef = useRef<boolean>(false); // Guard against multiple clients racing to transition game_over
  const yahtzeeGameOverProcessedRef = useRef<string | null>(null);
  // True while a game's terminal win presentation is running on THIS client.
  // Used to hold the session_ended lobby redirect (settlement may close the
  // session before the local celebration finishes).
  const [terminalPresentationActive, setTerminalPresentationActive] = useState(false);

  // ── SHARED SESSION ENDED TABLE PHASE ADMISSION ─────────────────────
  // Client-local, never persisted (no DB, no localStorage, no
  // sessionStorage). Admission requires ALL THREE of:
  //   1. this mount observed the live terminal presentation running
  //   2. authoritative status is session_ended (or pending_session_end)
  //   3. the canonical terminal presentation for that SAME result published
  //      its true completion token (stable terminal identity)
  // `onTerminalPresentationActiveChange(false)` is NOT an admission edge —
  // it also fires on cleanup / unmount / publisher replacement / phase and
  // descriptor resets, which is what admitted the phase mid-celebration.
  const [sessionEndedTableAdmitted, setSessionEndedTableAdmitted] = useState(false);
  // A route that was already participating in this session may retain the
  // canonical Session Ended table after a later server-owned lifecycle close.
  // A fresh mount has no matching live route identity and still goes straight
  // to the lobby.
  const liveSessionFlowGameIdRef = useRef<string | null>(null);
  // Proof that THIS mount observed the live terminal presentation running.
  const liveTerminalPresentationObservedRef = useRef(false);
  // Terminal identities whose canonical presentation completed on this mount.
  const terminalPresentationCompletedRef = useRef<Set<string>>(new Set());
  // Route-owned identity latch for a terminal presentation this mount first
  // observed during live play. Unlike child-published animation liveness, the
  // latch exists before an atomic settlement can publish `session_ended`.
  const liveTerminalPresentationScopeRef = useRef<LiveTerminalPresentationScope | null>(null);
  // Latest authoritative terminal facts, readable from completion callbacks
  // (which are not re-created on every snapshot).
  const terminalStatusFactsRef = useRef<{
    status: string | null;
    pendingSessionEnd: boolean;
    lastRoundResult: string | null;
  }>({
    status: null,
    pendingSessionEnd: false,
    lastRoundResult: null,
  });

  /**
   * Canonical terminal-completion endpoint. Games call this from the exact
   * callback that fires only after their ENTIRE terminal sequence finished
   * (scoring event → announcement → pot/chip transfer → destination
   * reaction → celebration/confetti), passing a stable terminal identity
   * derived from authoritative fields.
   *
   * FUTURE-GAME CONTRACT: publish liveness through
   * `onTerminalPresentationActiveChange` (for the redirect hold) and call
   * this once at true completion with a durable identity. Nothing else is
   * required to get the shared Session Ended table phase.
   */
  const markTerminalPresentationComplete = useCallback((terminalIdentity: string) => {
    if (!terminalIdentity) return;
    terminalPresentationCompletedRef.current.add(terminalIdentity);
    if (!liveTerminalPresentationObservedRef.current) return;
    const facts = terminalStatusFactsRef.current;
    if (facts.status !== 'session_ended' && !facts.pendingSessionEnd) return;
    setSessionEndedTableAdmitted(true);
  }, []);

  const handleTerminalPresentationActiveChange = useCallback((active: boolean) => {
    if (active) liveTerminalPresentationObservedRef.current = true;
    setTerminalPresentationActive(active);
  }, []);

  if (game?.id && game.status !== 'session_ended') {
    liveSessionFlowGameIdRef.current = game.id;
  }

  
  // Track previous game config for "Running it Back" detection
  interface PreviousGameConfig {
    game_type: string | null;
    ante_amount: number;
    rollover_amount: number;
    leg_value: number;
    legs_to_win: number;
    pussy_tax_enabled: boolean;
    pussy_tax_value: number;
    pot_max_enabled: boolean;
    pot_max_value: number;
    chucky_cards: number;
    rabbit_hunt: boolean;
    reveal_at_showdown: boolean;
    // Cribbage-specific fields
    points_to_win?: number;
    skunk_enabled?: boolean;
    skunk_threshold?: number;
    double_skunk_enabled?: boolean;
    double_skunk_threshold?: number;
    cribbage_game_mode?: string; // 'full' | 'half' | 'super_quick' | 'sprint' | 'custom'
    custom_points_to_win?: number; // For custom mode
    per_point_value?: number;
    gin_bonus?: number;
    undercut_bonus?: number;
  }
  const [previousGameConfig, setPreviousGameConfig] = useState<PreviousGameConfig | null>(null);
  // Track which gameId the previousGameConfig was captured from
  const [previousGameConfigGameId, setPreviousGameConfigGameId] = useState<string | null>(null);
  
  // Track session-specific configs per game type (for remembering settings when switching back)
  type SessionGameConfigs = Partial<Record<string, PreviousGameConfig>>;
  const [sessionGameConfigs, setSessionGameConfigs] = useState<SessionGameConfigs>({});
  
  // High card dealer selection state.
  // Phase F.2: announcement string + complete flag retired — dealer-selection
  // messaging is now exclusively owned by the canonical announcement layer.
  const [dealerSelectionCards, setDealerSelectionCards] = useState<DealerSelectionCard[]>([]);
  const [dealerSelectionWinnerPosition, setDealerSelectionWinnerPosition] = useState<number | null>(null);
  // Live refs so the realtime subscription effect (which closes over
  // [gameId] only) can read the latest values when evaluating the
  // high-card clear guard. Without these, the closure reads the initial
  // empty array and the guard never fires for in-flight draws.
  const dealerSelectionCardsRef = useRef<DealerSelectionCard[]>([]);
  const dealerSelectionWinnerPositionRef = useRef<number | null>(null);
  const dealerSelectionSyncedCardsRef = useRef<any[]>([]);
  useEffect(() => { dealerSelectionCardsRef.current = dealerSelectionCards; }, [dealerSelectionCards]);
  useEffect(() => { dealerSelectionWinnerPositionRef.current = dealerSelectionWinnerPosition; }, [dealerSelectionWinnerPosition]);
  useEffect(() => {
    const syncedCards = (game as any)?.dealer_selection_state?.cards;
    dealerSelectionSyncedCardsRef.current = Array.isArray(syncedCards) ? syncedCards : [];
  }, [game]);

  // P-WAIT.A4: dealerSelectionCards length tracker — emits one [WAIT]
  // event each time the local cards array length changes (mount, deal,
  // reveal, hide, clear). Lets the recorder attribute high-card
  // disappearance to a Game-level state mutation vs. a child reset.
  const _waitDealerCardsLenRef = useRef<number>(-1);
  const _waitDealerCardsPrevRef = useRef<DealerSelectionCard[]>([]);
  useEffect(() => {
    const next = dealerSelectionCards.length;
    if (_waitDealerCardsLenRef.current === next) {
      _waitDealerCardsPrevRef.current = dealerSelectionCards;
      return;
    }
    const prev = _waitDealerCardsLenRef.current;
    const prevCards = _waitDealerCardsPrevRef.current;
    _waitDealerCardsLenRef.current = next;
    _waitDealerCardsPrevRef.current = dealerSelectionCards;
    recordWaitingLifecycle('dealerSelectionCards length changed', {
      gameId: gameId ?? null,
      previousLength: prev === -1 ? null : prev,
      nextLength: next,
      gameStatus: (game as any)?.status ?? null,
      gameType: game?.game_type ?? null,
      hasSyncedState: !!(game as any)?.dealer_selection_state,
      syncedCardsLen: ((game as any)?.dealer_selection_state?.cards?.length) ?? null,
      winnerPosition: dealerSelectionWinnerPosition,
    });

    // FIRST 2 → 0 DISAPPEARANCE RECORDER — fires exactly once per gameId
    // for the first time previousLength > 0 transitions to nextLength === 0.
    // Captures previous/next cards, source heuristic, render path, surface
    // instance id, game status, dealerGameId, roundId. Centralized so the
    // disappearance is attributed regardless of which callsite cleared it.
    if (gameId && prev > 0 && next === 0) {
      const syncedCards = (game as any)?.dealer_selection_state?.cards ?? null;
      const hasSynced = !!(game as any)?.dealer_selection_state;
      const syncedLen = Array.isArray(syncedCards) ? syncedCards.length : null;
      // Heuristic source attribution:
      //   - synced state present AND syncedLen === 0 → realtime-sync-overwrite
      //   - synced state absent → local-state (local clear / status flip)
      //   - synced state still has cards but local is 0 → render-path-switch
      let source: string = 'unknown';
      if (hasSynced && syncedLen === 0) source = 'realtime-sync-overwrite';
      else if (!hasSynced) source = 'local-state';
      else if (hasSynced && (syncedLen ?? 0) > 0 && next === 0) source = 'render-path-switch';
      recordHighCardFirstDisappearance({
        gameId,
        previousCards: prevCards.map(c => ({
          position: (c as any)?.position ?? null,
          rank: (c as any)?.rank ?? null,
          suit: (c as any)?.suit ?? null,
        })),
        nextCards: [],
        previousLength: prev,
        nextLength: next,
        source,
        callsite: 'src/pages/Game.tsx:dealerSelectionCards-length-watcher',
        renderPath: (game as any)?.game_type ?? null,
        surfaceInstanceId: `Game:${gameId}`,
        gameStatus: (game as any)?.status ?? null,
        dealerGameId: (game as any)?.current_game_uuid ?? null,
        roundId: currentRound?.id ?? null,
        syncedStateCardsLen: syncedLen,
        hasSyncedState: hasSynced,
      });
    }
  }, [dealerSelectionCards, dealerSelectionWinnerPosition, game, gameId]);

  // ── dealer_selection_diag context push ─────────────────────────────
  // Keep the diag tracer enriched with viewer identity + current status
  // so every persisted checkpoint carries enough context to reconstruct
  // who saw (or didn't see) the dealer-selection presentation.
  useEffect(() => {
    const me = players.find((p) => p.user_id === user?.id);
    setDealerSelectionDiagContext({
      gameId: gameId ?? null,
      dealerGameId: (game as any)?.current_dealer_game_id ?? null,
      userId: user?.id ?? null,
      viewerPosition: me?.position ?? null,
      currentStatus: (game as any)?.status ?? null,
      viewerRole: me
        ? (me.position === 1 ? 'host' : 'player')
        : (user?.id ? 'observer' : 'unknown'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, user?.id, players, (game as any)?.status, (game as any)?.current_dealer_game_id]);


  // Capture the *last confirmed* config so Dealer Setup can offer "Run Back" even after we reset
  // the game back to game_selection (where config_complete becomes false).
  const lastCapturedConfigKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    if (!game.config_complete) return;
    const gameType = game.game_type ?? null;
    if (!gameType) return;

    const cfg: PreviousGameConfig = {
      game_type: gameType,
      ante_amount: game.ante_amount ?? 2,
      rollover_amount: game.rollover_amount ?? 1,
      leg_value: game.leg_value ?? 1,
      legs_to_win: game.legs_to_win ?? 3,
      pussy_tax_enabled: game.pussy_tax_enabled ?? true,
      pussy_tax_value: game.pussy_tax_value ?? 1,
      pot_max_enabled: game.pot_max_enabled ?? true,
      pot_max_value: game.pot_max_value ?? 10,
      chucky_cards: game.chucky_cards ?? 4,
      rabbit_hunt: game.rabbit_hunt ?? false,
      reveal_at_showdown: game.reveal_at_showdown ?? false,
      // Cribbage-specific fields
      points_to_win: game.points_to_win ?? undefined,
      skunk_enabled: game.skunk_enabled ?? undefined,
      skunk_threshold: game.skunk_threshold ?? undefined,
      double_skunk_enabled: game.double_skunk_enabled ?? undefined,
      double_skunk_threshold: game.double_skunk_threshold ?? undefined,
    };

    // For cribbage, derive game_mode from points_to_win
    if (gameType === 'cribbage' && game.points_to_win) {
      if (game.points_to_win === 121) cfg.cribbage_game_mode = 'full';
      else if (game.points_to_win === 61) cfg.cribbage_game_mode = 'half';
      else if (game.points_to_win === 45) cfg.cribbage_game_mode = 'super_quick';
      else if (game.points_to_win === 31) cfg.cribbage_game_mode = 'sprint';
      else {
        // Non-standard points = custom mode
        cfg.cribbage_game_mode = 'custom';
        cfg.custom_points_to_win = game.points_to_win;
      }
    }

    const key = `${game.id}:${gameType}:${JSON.stringify(cfg)}`;
    if (lastCapturedConfigKeyRef.current === key) return;
    lastCapturedConfigKeyRef.current = key;

    setPreviousGameConfig(cfg);
    setPreviousGameConfigGameId(game.id);
    setSessionGameConfigs((prev) => ({ ...prev, [gameType]: cfg }));
  }, [
    game?.id,
    game?.config_complete,
    game?.game_type,
    game?.ante_amount,
    game?.rollover_amount,
    game?.leg_value,
    game?.legs_to_win,
    game?.pussy_tax_enabled,
    game?.pussy_tax_value,
    game?.pot_max_enabled,
    game?.pot_max_value,
    game?.chucky_cards,
    game?.rabbit_hunt,
    game?.reveal_at_showdown,
    game?.points_to_win,
    game?.skunk_enabled,
    game?.skunk_threshold,
    game?.double_skunk_enabled,
    game?.double_skunk_threshold,
  ]);

  // "Run it back" should appear starting with the 2nd game in the same session.
  // Hands are game-specific and are reset between games, so we detect session history via snapshots.
  const [hasSessionHistory, setHasSessionHistory] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;
    setHasSessionHistory(false);

    const checkSessionHistory = async () => {
      const { count, error } = await supabase
        .from('session_player_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', gameId);

      if (cancelled) return;

      if (error) {
        console.error('[SESSION HISTORY] Failed to check snapshots:', error);
        return;
      }

      setHasSessionHistory((count ?? 0) > 0);
    };

    checkSessionHistory();

    const channel = supabase
      .channel(`session-history-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_player_snapshots',
          filter: `game_id=eq.${gameId}`,
        },
        () => setHasSessionHistory(true)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);
  
  const [isRunningItBack, setIsRunningItBack] = useState<boolean | null>(null);
  const [showNotEnoughPlayers, setShowNotEnoughPlayers] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showPlayerOptions, setShowPlayerOptions] = useState(false);
  const [allowBotDealers, setAllowBotDealers] = useState(false); // Fetched from game_defaults
const [anteAnimationTriggerId, setAnteAnimationTriggerId] = useState<string | null>(null); // Immediate trigger for ante animation
  const [anteAnimationExpectedPot, setAnteAnimationExpectedPot] = useState<number | null>(null); // Expected pot after antes for re-ante scenarios
  const [preAnteChips, setPreAnteChips] = useState<Record<string, number> | null>(null); // Capture chips BEFORE ante deduction to prevent race conditions
  const [expectedPostAnteChips, setExpectedPostAnteChips] = useState<Record<string, number> | null>(null); // Expected chip values AFTER ante deduction
  const anteAnimationFiredRef = useRef<string | null>(null); // Guard against duplicate ante animation triggers within same round
  // Track the most recently consumed (already-fired) ante animation triggerId so a
  // freshly-mounted AnteUpAnimation child cannot replay a stale trigger after a
  // game-type transition. This is the OBSERVER replay defect:
  // - Gin's ante triggerId was set in parent state, but Gin renders GinRummyGameTable
  //   (no AnteUpAnimation child), so onAnimationStart never fired and the trigger
  //   never cleared.
  // - When the next dealer game (Holm) mounts MobileGameTable, AnteUpAnimation's
  //   internal lastTriggerIdRef starts null and consumes the stale Gin-era trigger.
  // - Holm's own handleAllAnteDecisionsIn then sets a fresh trigger → second fire.
  // The leader (active player) avoids this only because handleGameOverComplete /
  // handleGameTypeSelect happen to clear refs in a path the observer doesn't run.
  // Fix: clear trigger state any time the game leaves the ante_decision phase, so
  // no AnteUpAnimation mount can ever consume a stale trigger from a prior game.
  
  // Chip transfer animation state (for 3-5-7 showdowns)
  const [chipTransferTriggerId, setChipTransferTriggerId] = useState<string | null>(null);
  const [chipTransferAmount, setChipTransferAmount] = useState<number>(0);
  const [chipTransferWinnerId, setChipTransferWinnerId] = useState<string | null>(null);
  const [chipTransferLoserIds, setChipTransferLoserIds] = useState<string[]>([]);
  
  // Holm Chucky loss animation state (player pays into pot)
  const [chuckyLossTriggerId, setChuckyLossTriggerId] = useState<string | null>(null);
  const [chuckyLossAmount, setChuckyLossAmount] = useState<number>(0);
  const [chuckyLossPlayerIds, setChuckyLossPlayerIds] = useState<string[]>([]);
  // A presentation PLAN spans every immutable transfer batch in one hand.
  // Keep its latch on dealer-game + rounds-row + hand identity; exact transfer
  // cursor identity belongs only to admitted-batch completion evidence below.
  const holmChuckyLossPresentationPlanKeyRef = useRef<string | null>(null);
  const holmPussyTaxPresentationPlanKeyRef = useRef<string | null>(null);
  const holmLiveRoundIdsObservedRef = useRef(new Set<string>());
  const holmReleasedPresentationHandsRef = useRef(new Set<string>());
  const holmPresentationDealerGameRef = useRef<string | null>(null);
  // Presentation-only predecessor hold. PostgreSQL may publish H2 while this
  // browser is still rendering H1; authoritative state is accepted by the
  // fetch pipeline, but Holm presentation/caches stay on H1 until this exact
  // client settles its final result stage. Fresh mounts never create a hold.
  const holmPresentationBarrierRef = useRef<HolmPresentationBarrier | null>(null);
  // A completion can arrive before or after the predecessor barrier latches.
  // Retain exact immutable evidence until both halves exist, then reconcile
  // idempotently. This is presentation-only and never advances PostgreSQL.
  const holmPresentationCompletionEvidenceRef = useRef(
    new Map<string, HolmContinuationPresentationCompletion>(),
  );
  // Exact H2 that this browser is presenting before games.total_hands moves.
  // It never grants authority; it only binds the deal-ready acknowledgement
  // to the predecessor/successor identity prepared by PostgreSQL.
  const holmLocallyPreparedSuccessorRef = useRef<{
    dealerGameId: string;
    predecessorRoundId: string;
    successorRoundId: string;
    handNumber: number;
    handContextId: string;
  } | null>(null);
  const holmPreparedAckInFlightRef = useRef<string | null>(null);
  const holmPreparedAckCompletedRef = useRef(new Set<string>());

  // OBSERVER REPLAY FIX: Clear any pending ante animation trigger whenever the
  // game leaves the ante_decision phase. Without this, a triggerId set during a
  // prior game-type's ante (e.g. Gin Rummy, which renders GinRummyGameTable —
  // no AnteUpAnimation child to consume + clear the trigger) survives in parent
  // state until the next game-type mounts MobileGameTable, at which point the
  // freshly-constructed AnteUpAnimation consumes the stale trigger as if it had
  // just fired. The next game (Holm) then sets its own real trigger → user sees
  // two ante animations on the observer client. The active player only avoids
  // this because their leader-only reset paths (handleGameOverComplete /
  // handleGameTypeSelect) happen to clear `anteAnimationFiredRef` and re-render
  // before the stale trigger can be consumed; observers run none of those.
  // Clearing on phase transition guarantees no stale trigger can be replayed by
  // a remount, regardless of which client we are.
  // ROLLOVER ANIMATION FIX: the original observer-replay leak was triggered by
  // a cross-game-type unmount/remount of MobileGameTable carrying a stale
  // trigger across `game_over`. Clearing on `game_over` is sufficient to
  // close that path. The previous broader list (dealer_selection /
  // game_selection / configuring) was racy for Horses→Horses (and SCC)
  // dealer-game rollovers: the ante trigger is set in the
  // ante-decision-complete handler AT THE SAME TICK that the new round
  // starts and the realtime status update for the prior 'configuring'
  // phase can land in the same render batch, clobbering a legitimate
  // freshly-set trigger and silently dropping the chip animation while
  // chips/pot still updated authoritatively. The cross-game leak class
  // is already prevented by `game_over` clearing + per-dealer-game
  // identity-scoped `anteAnimationFiredRef` keys (see line ~7625), so
  // the additional clears are unnecessary.
  useEffect(() => {
    const status = game?.status;
    if (status === 'game_over') {
      setAnteAnimationTriggerId(null);
      setAnteAnimationExpectedPot(null);
      setPreAnteChips(null);
      setExpectedPostAnteChips(null);
    }
  }, [game?.status]);

  // ── Primary tie-rollover re-ante animation bridge ───────────────
  // useHorsesMobileController's primary tie-rollover path calls
  // startHorsesRound/startSCCRound directly and bypasses the
  // awaiting_next_round fallback effect that normally publishes
  // anteAnimationTriggerId. Listen for the controller's window event
  // and publish the trigger here so the chip animation actually
  // renders. (Without this bridge the state transition occurs but
  // no trigger reaches AnteUpAnimation, producing the reported
  // "balances update, no animation" symptom.)
  useEffect(() => {
    if (!gameId) return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      if (!detail || detail.gameId !== gameId) return;
      const {
        preChipsSnapshot,
        expectedChipsSnapshot,
        expectedPot,
        perPlayerAmount,
        activeCount,
      } = detail;
      if (!perPlayerAmount || !activeCount) return;
      setPreAnteChips(preChipsSnapshot ?? null);
      setExpectedPostAnteChips(expectedChipsSnapshot ?? null);
      setAnteAnimationExpectedPot(expectedPot ?? null);
      const triggerKey = `dice-reante-primary-${expectedPot}-${Date.now()}`;
      if (anteAnimationFiredRef.current !== triggerKey) {
        anteAnimationFiredRef.current = triggerKey;
        setAnteAnimationTriggerId(`ante-${Date.now()}`);
        console.log('[DICE RE-ANTE PRIMARY] Triggered ante animation from controller event', {
          perPlayerAmount,
          activeCount,
          expectedPot,
        });
      }
    };
    window.addEventListener('horses:primary-re-ante', handler as EventListener);
    return () => window.removeEventListener('horses:primary-re-ante', handler as EventListener);
  }, [gameId]);



  
  // Holm multi-player showdown animation state (pot-to-winner, then losers-to-pot)
  const [holmShowdownTriggerId, setHolmShowdownTriggerId] = useState<string | null>(null);
  const [holmShowdownPotAmount, setHolmShowdownPotAmount] = useState<number>(0); // Amount winner takes from pot
  const [holmShowdownMatchAmount, setHolmShowdownMatchAmount] = useState<number>(0); // Amount each loser pays
  const [holmShowdownWinnerIds, setHolmShowdownWinnerIds] = useState<string[]>([]);
  const [holmShowdownLoserIds, setHolmShowdownLoserIds] = useState<string[]>([]);
  const [holmShowdownPhase, setHolmShowdownPhase] = useState<'idle' | 'pot-to-winner' | 'losers-to-pot'>('idle');
  // ONE HAND = ONE PLAN. The awaiting_next_round effect can re-enter
  // (its 4s timer clears awaitingTimerRef while awaiting_next_round is still
  // true, so any subsequent games/players realtime update re-runs the block).
  // Without an identity latch, re-entry re-dispatched phase 1 (a SECOND
  // pot-to-winner) and clobbered phase 2 back to 'pot-to-winner', so the
  // losers-to-pot transfer never rendered. The two adjacent settlement
  // cursors must therefore share one stable hand-level presentation plan.
  const holmShowdownPresentationPlanKeyRef = useRef<string | null>(null);
  
  // Holm win pot animation state (when player beats Chucky - dramatic pot to winner)
  const [holmWinPotTriggerId, setHolmWinPotTriggerId] = useState<string | null>(null);
  const [holmWinPotAmount, setHolmWinPotAmount] = useState<number>(0);
  const [holmWinWinnerPosition, setHolmWinWinnerPosition] = useState<number>(1);
  const [holmWinWinnerPositions, setHolmWinWinnerPositions] = useState<number[]>([]); // For multi-player wins
  const holmWinProcessedRef = useRef<string | null>(null); // Track processed win messages to prevent duplicates
  // ── CONSUMED TERMINAL PRESENTATION IDENTITIES (presentation only) ────
  // `holmWinProcessedRef` is a single-slot latch that only survives while the
  // in-memory value matches; it does NOT survive a remount of the animation
  // owner and it is wiped whenever status leaves the terminal window. The
  // ordinary rollover therefore replayed the SAME authoritative result once
  // more during the `game_over` → next-dealer-game gap.
  //
  // This set records terminal RESULT identities whose presentation has already
  // run to completion on this client, keyed by stable authoritative truth
  // (dealerGameId + hand number + result kind + result text) — never by
  // Date.now() / trigger id. Admission consults it; completion writes to it.
  // Purely presentational: no settlement, payout, or status semantics.
  const holmPresentedResultKeysRef = useRef<Set<string>>(new Set());

  // LAST-HAND terminal presentation ownership. On a final-hand Holm win the
  // authoritative settlement commits `session_ended` directly (never through
  // `game_over`), so the win-pot trigger must also admit that status. This ref
  // records that THIS mount observed the live (pre-terminal) session, so a
  // later remount / refresh on an already-ended session never replays the
  // celebration or holds navigation.
  const holmSawLiveSessionRef = useRef(false);

  // ── PARENT-OWNED HOLM TERMINAL PRESENTATION HOLD ────────────────────
  // The previous hold was published UP from <MobileGameTable> via
  // onTerminalPresentationActiveChange. That is circular: the hold is what
  // keeps MobileGameTable admitted, but MobileGameTable must be mounted to
  // publish it. On a LAST HAND win the authoritative `session_ended`
  // snapshot removes the subtree in the SAME commit, its unmount cleanup
  // publishes `false`, and the celebration never gets an owner.
  //
  // Ownership therefore lives HERE, in the route component that survives
  // every authoritative status transition, and is derived from durable
  // terminal truth (`games.last_round_result`, already committed by the
  // settlement RPC) instead of a child's effect. No timer, no status write.
  const [holmTerminalPresentationDone, setHolmTerminalPresentationDone] = useState<string | null>(null);
  const holmChuckyWinResult =
    game?.game_type === 'holm-game' &&
    typeof game?.last_round_result === 'string' &&
    game.last_round_result.includes('beat Chucky') &&
    !game.last_round_result.includes('Chucky beat')
      ? game.last_round_result
      : null;
  // Stable presentation identity for the Chucky win-pot terminal result.
  // Deliberately excludes `current_round` (it blips to null across the
  // dealer-game rollover, which would mint a "new" identity and re-admit the
  // same result) and any timestamp. A genuinely later hand carries a
  // different dealerGameId and/or hand number, so it still presents normally.
  const holmWinPotPresentationKey = holmChuckyWinResult
    ? `holm|winpot|${game?.current_game_uuid ?? 'nodg'}|${game?.total_hands ?? 'nh'}|${holmChuckyWinResult}`
    : null;

  // True from the very first render that carries `session_ended` (same
  // snapshot as the durable result) until the celebration completes or the
  // trigger owner proves it cannot resolve a winner.
  const holmLastHandPresentationPending =
    game?.game_type === 'holm-game' &&
    (game?.status as string) === 'session_ended' &&
    holmSawLiveSessionRef.current &&
    (
      (!!holmChuckyWinResult && holmTerminalPresentationDone !== holmChuckyWinResult) ||
      !!holmShowdownTriggerId ||
      holmShowdownPhase !== 'idle'
    );

  // Atomic LAST HAND settlement can publish `session_ended` before a child
  // finishes its terminal presentation. Remember the exact live authoritative
  // scope here, above every game subtree, so that first terminal render cannot
  // unmount the presentation owner. A fresh terminal mount never observed
  // `in_progress`, so it has no scope and still redirects to the lobby.
  const liveTerminalGameType =
    game?.game_type === 'cribbage' ||
    game?.game_type === 'gin-rummy' ||
    game?.game_type === 'yahtzee' ||
    game?.game_type === '3-5-7' ||
    game?.game_type === '3-5-7-game' ||
    game?.game_type === '357'
      ? game.game_type
      : null;
  const terminalRoundForHold = liveTerminalGameType
    ? pickActiveSingleRoundGameRound(game.rounds, {
        dealerGameId: game.current_game_uuid,
        currentRoundNumber: game.current_round,
        currentHandNumber: game.total_hands,
      })
    : null;
  const liveTerminalHoldObservation = {
    gameId: gameId ?? null,
    gameType: liveTerminalGameType,
    status: (game?.status as string) ?? null,
    dealerGameId: liveTerminalGameType ? game.current_game_uuid ?? null : null,
    roundId: terminalRoundForHold?.id ?? null,
    handNumber: terminalRoundForHold?.hand_number ?? game?.total_hands ?? null,
    terminalResultPresent: Boolean(game?.last_round_result),
  };
  liveTerminalPresentationScopeRef.current = advanceLiveTerminalPresentationScope(
    liveTerminalPresentationScopeRef.current,
    liveTerminalHoldObservation,
  );
  const liveTerminalPresentationPending =
    !sessionEndedTableAdmitted &&
    shouldHoldLiveTerminalPresentation(
      liveTerminalPresentationScopeRef.current,
      liveTerminalHoldObservation,
    );

  // Mirror authoritative terminal facts into a ref so completion callbacks
  // can consult them without re-creating on every snapshot. Read-only.
  terminalStatusFactsRef.current = {
    status: (game?.status as string) ?? null,
    pendingSessionEnd: (game as any)?.pending_session_end === true,
    lastRoundResult: game?.last_round_result ?? null,
  };

  // Completion and settlement are independent races. Cribbage normally waits
  // for backend acknowledgement before publishing completion; Yahtzee's chip
  // animation can legitimately finish first on a slow request. Admit Session
  // Ended once both facts exist in either order, but only for the exact live
  // dealer-game/hand scope retained by this mount.
  useEffect(() => {
    const facts = terminalStatusFactsRef.current;
    if (facts.status !== 'session_ended' && !facts.pendingSessionEnd) return;
    if (!liveTerminalPresentationObservedRef.current) return;
    const scope = liveTerminalPresentationScopeRef.current;
    const completedExactScope = Array.from(
      terminalPresentationCompletedRef.current,
    ).some(identity => terminalPresentationIdentityMatchesLiveScope(identity, scope));
    if (completedExactScope) setSessionEndedTableAdmitted(true);
  }, [game?.status, (game as any)?.pending_session_end, liveTerminalPresentationPending]);

  // Normal post-game lifecycle closure can arrive after the dealer-game
  // presentation has already retired into setup/waiting. Keep a continuously
  // mounted participant on the canonical Session Ended table, but never admit
  // a fresh/reconnected terminal mount.
  useEffect(() => {
    if (game?.status !== 'session_ended') return;
    if (liveSessionFlowGameIdRef.current !== game.id) return;
    if (
      terminalPresentationActive ||
      holmLastHandPresentationPending ||
      liveTerminalPresentationPending
    ) return;
    setSessionEndedTableAdmitted(true);
  }, [
    game?.id,
    game?.status,
    terminalPresentationActive,
    holmLastHandPresentationPending,
    liveTerminalPresentationPending,
  ]);

  

  
  // Horses win pot animation state (when player wins the round)
  const [horsesWinPotTriggerId, setHorsesWinPotTriggerId] = useState<string | null>(null);
  const [horsesWinPotAmount, setHorsesWinPotAmount] = useState<number>(0);
  const [horsesWinWinnerPosition, setHorsesWinWinnerPosition] = useState<number>(1);
  const horsesWinProcessedRef = useRef<string | null>(null); // Track processed win messages to prevent duplicates
  
  // 3-5-7 win animation state (when player wins final leg)
  // ⚠ TODO WAVE 5 — see src/lib/357/UNDER_CONSTRUCTION.md.
  // The route-level ThreeFiveSevenWinController is parked behind Wave 5
  // (CanonicalPhaseEngine). Local trigger state still strands the
  // animation sequence on MGT/Game remount; fix lives in Wave 5.
  const [threeFiveSevenWinTriggerId, setThreeFiveSevenWinTriggerId] = useState<string | null>(null);
  const [threeFiveSevenWinPotAmount, setThreeFiveSevenWinPotAmount] = useState<number>(0);
  const [threeFiveSevenWinnerId, setThreeFiveSevenWinnerId] = useState<string | null>(null);
  const [threeFiveSevenWinnerCards, setThreeFiveSevenWinnerCards] = useState<CardType[]>([]);
  /**
   * Immutable identity-bound expectation for the terminal winner hand.
   * Captured at authoritative 3-5-7 terminal detection. `threeFiveSevenWinnerCards`
   * may only be populated when `playerCardsIdentity` and the winner's
   * player_cards row strictly match ALL five identity dimensions AND the
   * exact `expectedCardCount` for the terminal round. Cross-game / prior
   * round / partial data is hard-rejected — the expectation persists so
   * that a late-arriving identity-matched fetch can still fulfill it
   * without losing the winner's explicit Show Cards consent.
   */
  const [terminal357WinnerHandExpectation, setTerminal357WinnerHandExpectation] = useState<{
    dealerGameId: string | null;
    handNumber: number | null;
    roundId: string | null;
    playerId: string;
    terminalResultIdentity: string;
    expectedCardCount: number;
  } | null>(null);
  const threeFiveSevenWinProcessedRef = useRef<string | null>(null);
  // Slice 1 (inert): immutable normalized terminal descriptor. Built at
  // authoritative 3-5-7 terminal detection (final-leg win OR instant
  // sweep). Consumed by the new ThreeFiveSevenTerminalController mounted
  // inside MobileGameTable. Bespoke instant-win owners keep running until
  // the atomic Slice 3 cutover; this state is populated ALONGSIDE them.
  const [terminal357Descriptor, setTerminal357Descriptor] = useState<Terminal357Descriptor | null>(null);
  // Track if 357 win animation is actively playing (blocks GameOverCountdown)
  const [is357WinAnimationActive, setIs357WinAnimationActive] = useState(false);
  const is357WinAnimationActiveRef = useRef(false); // Ref for closure access in timeouts

  // F. Win-animation active-flag transition diagnostic.
  const prevIs357WinAnimationActiveRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevIs357WinAnimationActiveRef.current;
    if (prev === is357WinAnimationActive) return;
    prevIs357WinAnimationActiveRef.current = is357WinAnimationActive;
    emit357RuntimeDiag('win_animation_active_changed', {
      gameId: game?.id ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
      roundId: game?.current_round != null ? String(game.current_round) : null,
    }, {
      prevActive: prev,
      nextActive: is357WinAnimationActive,
      refValueAtEmit: is357WinAnimationActiveRef.current,
      gameStatus: game?.status ?? null,
      lastRoundResult: game?.last_round_result ?? null,
    });
  }, [is357WinAnimationActive, game?.id, game?.current_game_uuid, game?.current_round, game?.status, game?.last_round_result]);

  // ── Wartime Phase 2 instrumentation ─────────────────────────
  const __wartimeGameIdentity = {
    gameId: game?.id ?? null,
    dealerGameId: game?.current_game_uuid ?? null,
    roundId: null,
    handNumber: (game as { total_hands?: number | null } | null)?.total_hands ?? null,
  };
  const __wartimeGameOwner = __useWartimeComponentInstance({
    componentType: 'Game',
    sourceSiteId: __WARTIME_SRC.GAME_MOUNT.id,
    identity: __wartimeGameIdentity,
    branch: {
      status: game?.status ?? null,
      gameType: (game as { game_type?: string | null } | null)?.game_type ?? null,
    },
  });
  __useWartimeStateWrite({
    fieldName: 'is357WinAnimationActive',
    sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id,
    value: is357WinAnimationActive,
    owner: __wartimeGameOwner,
    identity: __wartimeGameIdentity,
  });

  const __wartimeGameMountedRef = useRef(true);
  const __wartimeAsyncOwnersRef = useRef(new Map<number, { asyncOwnerId: string; sourceSiteId: string; identity: any; extra?: Record<string, unknown> }>());
  useEffect(() => {
    __wartimeGameMountedRef.current = true;
    return () => { __wartimeGameMountedRef.current = false; };
  }, []);

  const __wartimeLiveGameIdentity = useCallback(() => {
    const liveGame = lastGameRef.current ?? game;
    const liveCurrentPlayer = playersRef.current.find((p) => p.user_id === user?.id) ?? null;
    return {
      gameId: liveGame?.id ?? gameId ?? null,
      dealerGameId: liveGame?.current_game_uuid ?? null,
      roundId: cardStateContext?.roundId ?? (liveGame?.current_round != null ? String(liveGame.current_round) : null),
      handNumber: liveGame?.total_hands ?? null,
      handContextId: cardStateContext?.roundId ?? null,
      terminalResultIdentity: liveGame?.last_round_result ?? null,
      currentPlayerId: liveCurrentPlayer?.id ?? null,
      currentPlayerPosition: liveCurrentPlayer?.position ?? null,
    };
  }, [cardStateContext?.roundId, game, gameId, user?.id]);

  const __wartimeIdentityMatches = useCallback((captured: ReturnType<typeof __wartimeLiveGameIdentity>, live: ReturnType<typeof __wartimeLiveGameIdentity>) => (
    captured.gameId === live.gameId &&
    captured.dealerGameId === live.dealerGameId &&
    captured.handContextId === live.handContextId &&
    captured.terminalResultIdentity === live.terminalResultIdentity
  ), []);

  const __scheduleWartimeTimeout = useCallback((opts: {
    sourceSiteId: string;
    ownerLabel: string;
    delayMs: number;
    extra?: Record<string, unknown>;
    fn: (asyncOwnerId: string, capturedIdentity: ReturnType<typeof __wartimeLiveGameIdentity>) => void | Promise<void>;
  }) => {
    const capturedIdentity = __wartimeLiveGameIdentity();
    const asyncOwnerId = __trackWartimeAsyncOwner({
      ownerLabel: opts.ownerLabel,
      kind: 'timeout',
      sourceSiteId: opts.sourceSiteId,
      identity: capturedIdentity,
      owner: __wartimeGameOwner,
      delayMs: opts.delayMs,
      extra: {
        capturedDealerGameId: capturedIdentity.dealerGameId,
        capturedHandContextId: capturedIdentity.handContextId,
        ownerMounted: __wartimeGameMountedRef.current,
        ...(opts.extra ?? {}),
      },
    });
    const timerId = window.setTimeout(() => {
      __wartimeAsyncOwnersRef.current.delete(timerId);
      const liveIdentity = __wartimeLiveGameIdentity();
      __emitWartimeAsyncOwnerFired({
        asyncOwnerId,
        outcome: 'fired',
        sourceSiteId: opts.sourceSiteId,
        identity: capturedIdentity,
        liveIdentity,
        identityMatch: __wartimeIdentityMatches(capturedIdentity, liveIdentity),
        extra: {
          ownerMounted: __wartimeGameMountedRef.current,
          liveDealerGameId: liveIdentity.dealerGameId,
          liveHandContextId: liveIdentity.handContextId,
          ...(opts.extra ?? {}),
        },
      });
      void opts.fn(asyncOwnerId, capturedIdentity);
    }, opts.delayMs);
    __wartimeAsyncOwnersRef.current.set(timerId, { asyncOwnerId, sourceSiteId: opts.sourceSiteId, identity: capturedIdentity, extra: opts.extra });
    return timerId;
  }, [__wartimeGameOwner, __wartimeIdentityMatches, __wartimeLiveGameIdentity]);

  const __scheduleWartimeInterval = useCallback((opts: {
    sourceSiteId: string;
    ownerLabel: string;
    intervalMs: number;
    extra?: Record<string, unknown>;
    fn: (asyncOwnerId: string, tickNumber: number, capturedIdentity: ReturnType<typeof __wartimeLiveGameIdentity>) => void | Promise<void>;
  }) => {
    const capturedIdentity = __wartimeLiveGameIdentity();
    let tickNumber = 0;
    const asyncOwnerId = __trackWartimeAsyncOwner({
      ownerLabel: opts.ownerLabel,
      kind: 'interval',
      sourceSiteId: opts.sourceSiteId,
      identity: capturedIdentity,
      owner: __wartimeGameOwner,
      delayMs: opts.intervalMs,
      extra: {
        intervalCadenceMs: opts.intervalMs,
        capturedDealerGameId: capturedIdentity.dealerGameId,
        capturedHandContextId: capturedIdentity.handContextId,
        ownerMounted: __wartimeGameMountedRef.current,
        ...(opts.extra ?? {}),
      },
    });
    const intervalId = window.setInterval(() => {
      tickNumber += 1;
      const liveIdentity = __wartimeLiveGameIdentity();
      __emitWartimeAsyncOwnerFired({
        asyncOwnerId,
        outcome: 'fired',
        sourceSiteId: opts.sourceSiteId,
        identity: capturedIdentity,
        liveIdentity,
        identityMatch: __wartimeIdentityMatches(capturedIdentity, liveIdentity),
        extra: {
          tickNumber,
          intervalCadenceMs: opts.intervalMs,
          ownerMounted: __wartimeGameMountedRef.current,
          liveDealerGameId: liveIdentity.dealerGameId,
          liveHandContextId: liveIdentity.handContextId,
          ...(opts.extra ?? {}),
        },
      });
      void opts.fn(asyncOwnerId, tickNumber, capturedIdentity);
    }, opts.intervalMs);
    __wartimeAsyncOwnersRef.current.set(intervalId, { asyncOwnerId, sourceSiteId: opts.sourceSiteId, identity: capturedIdentity, extra: opts.extra });
    return intervalId;
  }, [__wartimeGameOwner, __wartimeIdentityMatches, __wartimeLiveGameIdentity]);

  const __cancelWartimeAsyncOwner = useCallback((timerOrIntervalId: number | null | undefined, reason: string) => {
    if (timerOrIntervalId == null) return;
    const record = __wartimeAsyncOwnersRef.current.get(timerOrIntervalId);
    if (!record) return;
    __wartimeAsyncOwnersRef.current.delete(timerOrIntervalId);
    const liveIdentity = __wartimeLiveGameIdentity();
    __emitWartimeAsyncOwnerFired({
      asyncOwnerId: record.asyncOwnerId,
      outcome: 'cancelled',
      sourceSiteId: record.sourceSiteId,
      identity: record.identity,
      liveIdentity,
      identityMatch: __wartimeIdentityMatches(record.identity, liveIdentity),
      suppressionReason: reason,
      extra: {
        ownerMounted: __wartimeGameMountedRef.current,
        ...(record.extra ?? {}),
      },
    });
  }, [__wartimeIdentityMatches, __wartimeLiveGameIdentity]);

  // SAFETY FALLBACK (357): don't keep rescheduling on every re-render/update; schedule once per "game over instance".
  const safety357FallbackKeyRef = useRef<string | null>(null);
  const safety357FallbackTimerRef = useRef<number | null>(null);
  const safety357FallbackExtendTimerRef = useRef<number | null>(null);

  // POLLING (357): after win animation completes, keep polling DB until we see the game leave game_over.
  // This prevents the UI getting stuck if the animation completion callback is dropped.
  const poll357KeyRef = useRef<string | null>(null);
  const poll357IntervalRef = useRef<number | null>(null);
  const poll357StopTimerRef = useRef<number | null>(null);

  // ── Holm Sync (Phase 3 Step 1 — turn spotlight + round status from presentationState) ──
  const holmSyncLastRoundIdRef = useRef<string | null>(null);
  const holmSync = useGameStateSync<HolmAuthoritativeSnapshot | null>(null, {
    getProgress: (s) => s ? getHolmProgress(s) : [0, 0, 0, 0],
    debugLabel: 'Holm',
    describeState: (s) => s ? {
      hand: s.handNumber,
      phase: s.roundStatus,
      decided: s.players.filter(p => p.decisionLocked).length,
      revealed: s.communityCardsRevealed,
    } : null,
  });
  // Convenience alias: null when not a Holm game or no round active yet
  const holmView = holmSync.presentationState;
  if (
    !initialHolmIdentityRef.current.captured
    && !holmView
    && isHolmPreHandRouteStatus(game?.status)
  ) {
    holmPreHandLifecycleObservedRef.current = true;
  }
  const holmPresentationIdentity = useMemo<HolmPresentationIdentity | null>(() => {
    if (
      game?.game_type !== 'holm-game'
      || !holmView?.dealerGameId
      || !holmView.roundId
      || !Number.isInteger(holmView.handNumber)
      || !Number.isInteger(holmView.chipTransferCursor)
    ) return null;
    return {
      dealerGameId: holmView.dealerGameId,
      roundId: holmView.roundId,
      handNumber: holmView.handNumber,
      transferCursor: holmView.chipTransferCursor,
    };
  }, [
    game?.game_type,
    holmView?.chipTransferCursor,
    holmView?.dealerGameId,
    holmView?.handNumber,
    holmView?.roundId,
  ]);
  // A server-resolved LAST HAND arrives as one completed snapshot. Keep the
  // settlement authoritative, but replay its reveal path in presentation state
  // before the win-pot sequence is admitted.
  const holmTerminalRevealTimersRef = useRef<number[]>([]);
  const holmTerminalRevealKeyRef = useRef<string | null>(null);
  const [holmTerminalRevealPresentationKey, setHolmTerminalRevealPresentationKey] = useState<string | null>(null);
  const [holmTerminalRevealCompleteKey, setHolmTerminalRevealCompleteKey] = useState<string | null>(null);

  const clearHolmTerminalRevealTimers = useCallback(() => {
    holmTerminalRevealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    holmTerminalRevealTimersRef.current = [];
  }, []);

  const startHolmTerminalRevealPresentation = useCallback((snapshot: HolmAuthoritativeSnapshot): string | null => {
    if (!gameId || !snapshot.lastRoundResult?.includes('beat Chucky') || snapshot.lastRoundResult.includes('Chucky beat')) {
      return null;
    }

    const previous = holmSync.presentationRefValue;
    if (!previous || previous.roundId !== snapshot.roundId) {
      return null;
    }

    const key = `holm|winpot|${snapshot.dealerGameId}|${snapshot.handNumber}|${snapshot.lastRoundResult}`;
    if (holmTerminalRevealKeyRef.current === key) {
      return key;
    }

    clearHolmTerminalRevealTimers();
    holmTerminalRevealKeyRef.current = key;
    setHolmTerminalRevealPresentationKey(key);
    setHolmTerminalRevealCompleteKey(null);

    const contract = holmSync.beginVisualContract({
      type: 'holm-terminal-reveal',
      identity: {
        gameId,
        roundId: snapshot.roundId,
        handNumber: snapshot.handNumber,
        phase: 'session_ended',
      },
      expectedSteps: 3 + Math.max(0, snapshot.chuckyCardsRevealed),
      timeoutMs: 6_000,
    });

    const commit = (delayMs: number, state: HolmAuthoritativeSnapshot, complete = false) => {
      const timer = window.setTimeout(() => {
        if (holmTerminalRevealKeyRef.current !== key) return;
        holmSync.commitToPresentation(state);
        if (complete) {
          holmSync.completeVisualContract(contract);
          setHolmTerminalRevealCompleteKey(key);
        }
      }, delayMs);
      holmTerminalRevealTimersRef.current.push(timer);
    };

    // These are visual frames only. The completed server snapshot remains the
    // financial and gameplay source of truth throughout the sequence.
    const tabledStart: HolmAuthoritativeSnapshot = {
      ...snapshot,
      roundStatus: 'showdown',
      communityCardsRevealed: Math.min(2, snapshot.communityCardsRevealed),
      chuckyActive: false,
      chuckyCardsRevealed: 0,
    };
    holmSync.commitToPresentation(tabledStart);

    let delayMs = 550;
    if (snapshot.communityCardsRevealed >= 3) {
      commit(delayMs, { ...tabledStart, communityCardsRevealed: 3 });
      delayMs += 550;
    }
    if (snapshot.communityCardsRevealed >= 4) {
      commit(delayMs, { ...tabledStart, communityCardsRevealed: 4 });
      delayMs += 550;
    }
    if (snapshot.chuckyActive) {
      commit(delayMs, { ...tabledStart, communityCardsRevealed: snapshot.communityCardsRevealed, chuckyActive: true });
      delayMs += 350;
    }
    for (let revealed = 1; revealed <= snapshot.chuckyCardsRevealed; revealed += 1) {
      commit(delayMs, {
        ...tabledStart,
        communityCardsRevealed: snapshot.communityCardsRevealed,
        chuckyActive: true,
        chuckyCardsRevealed: revealed,
      });
      delayMs += 350;
    }
    commit(delayMs, snapshot, true);

    return key;
  }, [clearHolmTerminalRevealTimers, gameId, holmSync]);

  useEffect(() => () => clearHolmTerminalRevealTimers(), [clearHolmTerminalRevealTimers]);

  useEffect(() => {
    if (game?.status !== 'session_ended') {
      clearHolmTerminalRevealTimers();
      holmTerminalRevealKeyRef.current = null;
      setHolmTerminalRevealPresentationKey(null);
      setHolmTerminalRevealCompleteKey(null);
    }
  }, [clearHolmTerminalRevealTimers, game?.status]);

  // ── 3-5-7 Sync (Phase 3 — presentation cutover) ──
  const threeFiveSevenSyncLastRoundIdRef = useRef<string | null>(null);
  const [directThreeFiveSevenRolloverPresentation, setDirectThreeFiveSevenRolloverPresentation] =
    useState<ThreeFiveSevenRolloverPresentation | null>(null);
  const [directThreeFiveSevenAllFoldPresentation, setDirectThreeFiveSevenAllFoldPresentation] =
    useState<ThreeFiveSevenAllFoldPresentation | null>(null);
  const advancingThreeFiveSevenAllFoldRef = useRef(new Set<string>());
  const threeFiveSevenAcceptedIdentityRef = useRef<{
    dealerGameId: string;
    handNumber: number;
    roundNumber: number;
    roundId: string;
  } | null>(null);
  const threeFiveSevenRetiredDealerGamesRef = useRef<Set<string>>(new Set());
  const threeFiveSevenSync = useGameStateSync<ThreeFiveSevenAuthoritativeSnapshot | null>(null, {
    getProgress: (s) => s ? getThreeFiveSevenProgress(s) : [0, 0, 0, 0, 0, 0],
    debugLabel: '357',
    describeState: (s) => s ? {
      hand: s.handNumber,
      round: s.roundNumber,
      phase: s.roundStatus,
      decided: s.players.filter(p => p.decisionLocked).length,
    } : null,
  });
  // Convenience alias: null when not a 3-5-7 game or no round active yet
  const threeFiveSevenView = threeFiveSevenSync.presentationState;
  const threeFiveSevenRefView = threeFiveSevenSync.presentationRefValue as ThreeFiveSevenAuthoritativeSnapshot | null;

  // 3-5-7 presentation players — overlay decisions from presentation state
  // Action handlers continue to use raw `players` for mutation correctness.
  const is357GameType = game?.game_type === '3-5-7' || game?.game_type === '357' || game?.game_type === '3-5-7-game';

  // ── 357: RENDER-TIME wiring diagnostic (fires every render, not in useEffect) ──
  // This proves whether React state vs ref vs effective are in sync AT RENDER TIME.
  const prev357RenderDiagRef = useRef<string>('');
  if (is357GameType && gameId) {
    const reactState = threeFiveSevenView;
    const refValue = threeFiveSevenRefView;
    const authState = threeFiveSevenSync.authoritativeState;
    const effectiveState = threeFiveSevenSync.effectiveState;
    const fingerprint = `${reactState?.roundId ?? 'null'}|${refValue?.roundId ?? 'null'}|${authState?.roundId ?? 'null'}`;
    if (fingerprint !== prev357RenderDiagRef.current) {
      prev357RenderDiagRef.current = fingerprint;
      const reactIsNull = !reactState;
      const refIsNull = !refValue;
      const authIsNull = !authState;
      const mismatch = (!reactIsNull !== !refIsNull) || (!reactIsNull !== !authIsNull);
      persist357Investigation(gameId, authState?.handNumber ?? 0, '357-render-wiring-check', {
        reactStateRoundId: reactState?.roundId?.slice(0, 8) ?? null,
        reactStateHandNumber: reactState?.handNumber ?? null,
        reactStateRoundNumber: reactState?.roundNumber ?? null,
        refValueRoundId: refValue?.roundId?.slice(0, 8) ?? null,
        refValueHandNumber: refValue?.handNumber ?? null,
        refValueRoundNumber: refValue?.roundNumber ?? null,
        authoritativeRoundId: authState?.roundId?.slice(0, 8) ?? null,
        authoritativeHandNumber: authState?.handNumber ?? null,
        effectiveRoundId: (effectiveState as ThreeFiveSevenAuthoritativeSnapshot | null)?.roundId?.slice(0, 8) ?? null,
        isFrozen: threeFiveSevenSync.isFrozen,
        isOptimistic: threeFiveSevenSync.isOptimistic,
        reactIsNull,
        refIsNull,
        authIsNull,
        mismatch,
      });
    }
  }

  // 3-5-7 fetch-trace mount heartbeat removed.



  const threeFiveSevenPlayers = useMemo(() => {
    if (!threeFiveSevenView || !is357GameType) return players;
    return players.map(p => {
      const snap = threeFiveSevenView.players.find(sp => sp.position === p.position);
      if (!snap) return p;
      return {
        ...p,
        current_decision: snap.decision,
        decision_locked: snap.decisionLocked,
        auto_fold: snap.autoFold,
        sitting_out: snap.sittingOut,
      };
    });
  }, [players, threeFiveSevenView, is357GameType]);

  // (357 refresh soft-lock probe is installed further below, after
  // `currentRound` is declared — see softLockProbeKeyRef effect.)





  // ── 3-5-7 stuck-old-round detection (render-phase invariant) ──
  // ── 357: Post-render presentation hydration check (fires AFTER React commit) ──
  useEffect(() => {
    if (!is357GameType) return;
    const auth357 = threeFiveSevenSync.authoritativeState;
    const pres357 = threeFiveSevenSync.presentationState;

    // CRITICAL DIAGNOSTIC: If authoritative exists but presentation is still null,
    // this proves presentation never hydrated even after React rendered.
    if (auth357 && !pres357) {
      persist357Investigation(gameId!, auth357.handNumber, '357-presentation-null-after-render', {
        authoritativeRoundId: auth357.roundId.slice(0, 8),
        authoritativeHandNumber: auth357.handNumber,
        authoritativeRoundNumber: auth357.roundNumber,
        authoritativePhase: auth357.roundStatus,
        isFrozen: threeFiveSevenSync.isFrozen,
        isOptimistic: threeFiveSevenSync.isOptimistic,
        presentationIsNull: true,
      }, auth357.roundId);
    }

    if (!auth357 || !pres357) return;
    checkThreeFiveSevenStuckOldRound(
      gameId!,
      pres357.roundId,
      auth357.roundId,
      pres357.roundNumber,
      auth357.roundNumber,
      auth357.handNumber,
    );
    persistSyncDebugEvent({
      gameId: gameId!,
      gameType: '3-5-7',
      handNumber: auth357.handNumber,
      roundId: auth357.roundId,
      eventType: 'sync-gate',
      severity: 'info',
      eventName: '357-presentation-source',
      payload: {
        presentationRoundId: pres357.roundId.slice(0, 8),
        presentationRoundNumber: pres357.roundNumber,
        presentationPhase: pres357.roundStatus,
        authoritativeRoundId: auth357.roundId.slice(0, 8),
        authoritativeRoundNumber: auth357.roundNumber,
        authoritativePhase: auth357.roundStatus,
        isFrozen: threeFiveSevenSync.isFrozen,
        isOptimistic: threeFiveSevenSync.isOptimistic,
        match: pres357.roundId === auth357.roundId,
      },
    });
  }, [is357GameType, threeFiveSevenSync.authoritativeState, threeFiveSevenSync.presentationState, gameId]);


  // This ensures decision badges (stay/fold, locked) read from presentationState exclusively.
  // Action handlers continue to use raw `players` for mutation correctness.
  const holmPlayers = useMemo(() => {
    if (!holmView || game?.game_type !== 'holm-game') return players;
    return players.map(p => {
      const snap = holmView.players.find(sp => sp.position === p.position);
      if (!snap) return p;
      return {
        ...p,
        current_decision: snap.decision,
        decision_locked: snap.decisionLocked,
      };
    });
  }, [players, holmView, game?.game_type]);

  // 3-5-7 winner "Show Cards" state - broadcast via realtime to all players
  const [winner357ShowCards, setWinner357ShowCards] = useState(false);
  
  // Holm pre-fold/pre-stay state (for when it's not your turn yet)
  const [holmPreFold, setHolmPreFold] = useState(false);
  const [holmPreStay, setHolmPreStay] = useState(false);

  // ─────────────────────────────────────────────────────────────────────
  // P0 Holm pre-decision authority contract
  //
  // Authoritative epoch source: monotonic local counter incremented
  // SYNCHRONOUSLY in the realtime-ingest boundary (rounds UPDATE/INSERT
  // payload handler in this file, ~L2871) before any React state set.
  // `rounds` has no native `updated_at`, so this counter is the
  // canonical local mirror of authoritative turn arrivals.
  //
  // Arming captures {roundId, handContextId, fromTurnPosition, epoch}
  // from this ref — never from a render closure. Execution requires
  // a STRICTLY newer epoch + same round/hand + turn-now-mine + deal
  // ready. See holmPreDecisionExecuteEffect below.
  // ─────────────────────────────────────────────────────────────────────
  const latestAuthoritativeTurnRef = useRef<{
    roundId: string | null;
    handNumber: number | null;
    currentTurnPosition: number | null;
    epoch: number;
  } | null>(null);
  const authoritativeTurnEpochRef = useRef(0);
  const holmPreDecisionArmedRef = useRef<{
    armedRoundId: string | null;
    armedHandContextId: string | null;
    armedFromTurnPosition: number | null;
    armedAuthorityEpoch: number;
    decision: 'stay' | 'fold';
  } | null>(null);
  // Atomic consume latch — set true the instant we begin dispatching an
  // armed pre-decision, prevents any second execute. Reset by:
  //   - new hand boundary
  //   - explicit arm cancellation
  //   - handler settles (success/error)
  //   - transient handler rejection (so the same authoritative-arrival
  //     can retry on next effect tick)
  const holmPreDecisionConsumingRef = useRef(false);

  // Re-render when the Holm deal barrier flips so render gates and
  // execute-effect both observe the readiness change. (Tick state
  // declared below near the bot-trigger effect at ~L4794.)
  
  // LIFTED mobile tab state - persists across MobileGameTable remounts
  const [mobileActiveTab, setMobileActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
  // Late refs — populated by effects declared below where their
  // authoritative sources become in-scope. Read here so the tab-mutation
  // observer can classify without forward-referencing block-scoped vars.
  const composeDraftLateRef = useRef<string>('');
  const currentRoundLateRef = useRef<any>(null);
  const gameStatusLateRef = useRef<string | null>(null);
  // Marker: when the user explicitly requested a tab change via the
  // canonical setter, we stamp the target + wall time. The observing
  // effect uses this to classify whether an observed mutation is a
  // user-request or a forced/reset/projection mutation coming from
  // elsewhere (remount default, imperative reset, shell reinit).
  const userRequestedTabMarkerRef = useRef<{ next: 'cards' | 'chat' | 'lobby' | 'history'; tMs: number } | null>(null);
  const setMobileActiveTabWithTrace = useCallback((next: 'cards' | 'chat' | 'lobby' | 'history') => {
    userRequestedTabMarkerRef.current = { next, tMs: typeof performance !== 'undefined' ? performance.now() : Date.now() };
    recordGinPhaseTrace({
      kind: 'tab-active-change',
      summary: `Shell mobile active tab mutation requested: ${next}`,
      sourceFile: 'src/pages/Game.tsx',
      sourceFunction: 'setMobileActiveTabWithTrace',
      identity: { gameId: gameId ?? null, dealerGameId: (game as any)?.current_game_uuid ?? null, roundId: null, handNumber: null },
      detail: { before: mobileActiveTab, after: next, cause: 'user-request' },
    });
    setMobileActiveTab(next);
  }, [gameId, game, mobileActiveTab]);
  const lastMobileActiveTabRef = useRef(mobileActiveTab);
  useEffect(() => {
    const before = lastMobileActiveTabRef.current;
    if (before === mobileActiveTab) return;
    const marker = userRequestedTabMarkerRef.current;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const matchedUserRequest =
      !!marker && marker.next === mobileActiveTab && now - marker.tMs < 200;
    // Classify the mutation. When we observe a change that did NOT
    // come through the canonical user-request setter, it must be one
    // of: forced-projection (ancestor recomputed activeTab from
    // phase/status), remount-default (state initializer re-ran),
    // imperative state-reset from outside the canonical path, or
    // shell reinit.
    const cause: string = matchedUserRequest ? 'user-request' : 'forced-projection';
    let mutationClass: string;
    if (matchedUserRequest) {
      mutationClass = 'explicit-user-request';
    } else if (mobileActiveTab === 'cards' && before !== 'cards') {
      mutationClass = 'remount-default-or-forced-cards';
    } else {
      mutationClass = 'imperative-state-change-non-user';
    }
    const composeDraftPresent = (composeDraftLateRef.current ?? '').trim().length > 0;
    const dealStartContext = {
      gameStatus: gameStatusLateRef.current,
      gamePhase: ((currentRoundLateRef.current as any)?.gin_rummy_state as any)?.phase ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      roundId: currentRoundLateRef.current?.id ?? null,
      handNumber: (currentRoundLateRef.current as any)?.hand_number ?? null,
    };
    recordGinPhaseTrace({
      kind: matchedUserRequest ? 'tab-active-change' : 'forced-tab-projection',
      summary: matchedUserRequest
        ? `Shell mobile active tab changed: ${before} → ${mobileActiveTab}`
        : `FORCED tab mutation ${before} → ${mobileActiveTab} (no matching user-request within 200ms)`,
      sourceFile: 'src/pages/Game.tsx',
      sourceFunction: 'Game.mobileActiveTabEffect',
      identity: { gameId: gameId ?? null, dealerGameId: (game as any)?.current_game_uuid ?? null, roundId: null, handNumber: null },
      detail: {
        before,
        after: mobileActiveTab,
        cause,
        mutationClass,
        matchedUserRequest,
        userRequestMarker: marker ? { next: marker.next, ageMs: Math.round(now - marker.tMs) } : null,
        composeDraftPresent,
        composeDraftLength: (composeDraftLateRef.current ?? '').length,
        dealStartContext,
        source: 'Game.tsx#mobileActiveTab useState projection',
      },
    });
    lastMobileActiveTabRef.current = mobileActiveTab;
    if (matchedUserRequest) userRequestedTabMarkerRef.current = null;
  }, [mobileActiveTab, gameId, game]);
  // LIFTED unread chat messages state - persists across MobileGameTable remounts
  const [mobileHasUnreadMessages, setMobileHasUnreadMessages] = useState(false);
  // LIFTED chat watermark - last seen eligible other-human message ID, survives MobileGameTable remounts
  const [lastSeenChatMessageId, setLastSeenChatMessageId] = useState<string | null>(null);
  // LIFTED read watermark - last read eligible other-human message ID, survives MobileGameTable remounts
  const [lastReadChatMessageId, setLastReadChatMessageId] = useState<string | null>(null);
  // LIFTED chat input state - persists across MobileGameTable remounts
  const [mobileChatInput, setMobileChatInput] = useState('');
  const normalShellSessionId = useMemo(() => (gameId ? `session:${gameId}` : null), [gameId]);
  const chatOperationIdentity = useMemo(() => {
    const rawGameType = (game as any)?.game_type ?? null;
    const gameTypeSource: string = rawGameType == null ? 'null' : 'games.game_type';
    const resolvedGameType: string | null = rawGameType;
    const gameControllerPresent = Boolean(game?.status === 'in_progress' && rawGameType);
    const currentTurnPlayerId =
      ((game as any)?.current_turn_player_id as string | undefined) ??
      ((game as any)?.current_turn as string | undefined) ??
      null;
    const localTurnEligible = Boolean(
      currentTurnPlayerId && user?.id && (players ?? []).some((p: any) => p.id === currentTurnPlayerId && p.user_id === user.id)
    );
    const shellPhase = game?.status ?? null;
    const isWaiting = shellPhase !== 'in_progress';
    const waitingTableComponent = isWaiting ? 'MobileGameTable/WaitingTable' : null;
    const activeGameComponent = !isWaiting ? `MobileGameTable/${resolvedGameType ?? 'unknown'}` : null;
    const route = typeof window !== 'undefined' ? window.location.pathname : `/game/${gameId ?? ''}`;
    const routeGameId = gameId ?? null;

    // Fire producers (best-effort; each producer dedupes internally against active ops).
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
      recordWaitingTableViolation('WAITING_TABLE_GAME_TYPE_READ', {
        sourceFile: 'src/pages/Game.tsx',
        sourceFunction: 'chatOperationIdentity',
        inputValues: { rawGameType, shellPhase },
        resolvedValues: { resolvedGameType, gameTypeSource },
        renderContinuation: 'render',
      });
      if (rawGameType == null) {
        recordWaitingTableViolation('WAITING_TABLE_GAME_TYPE_NULL', {
          sourceFile: 'src/pages/Game.tsx',
          sourceFunction: 'chatOperationIdentity',
          inputValues: { shellPhase, gameId: routeGameId },
          resolvedValues: { resolvedGameType: null },
          fallbackApplied: 'none',
          renderContinuation: 'render',
        });
      }
      recordWaitingTableViolation('WAITING_TABLE_GAME_CONTROLLER_LOOKUP', {
        sourceFile: 'src/pages/Game.tsx',
        sourceFunction: 'chatOperationIdentity',
        inputValues: { shellPhase, rawGameType },
        resolvedValues: { gameControllerPresent },
        renderContinuation: 'render',
      });
      recordWaitingTableViolation('WAITING_TABLE_CURRENT_TURN_LOOKUP', {
        sourceFile: 'src/pages/Game.tsx',
        sourceFunction: 'chatOperationIdentity',
        inputValues: { rawGameType },
        resolvedValues: { currentTurnPlayerId, localTurnEligible },
        renderContinuation: 'render',
      });
    });

    return {
      gameId: gameId ?? undefined,
      sessionId: normalShellSessionId ?? undefined,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      route,
      activeTab: mobileActiveTab,
      shellPhase,
      originSurface: !isWaiting ? 'active_game_table' : 'waiting_table',
      // Extended context
      routeGameId,
      canonicalShellGameId: gameId ?? null,
      operationGameId: gameId ?? null,
      rawGameType,
      resolvedGameType,
      gameTypeSource,
      gameControllerPresent,
      currentTurnPlayerId,
      localTurnEligible,
      waitingTableComponent,
      activeGameComponent,
      tabBarRenderKey: `${gameId ?? 'no-game'}:${shellPhase ?? 'no-phase'}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, normalShellSessionId, (game as any)?.current_game_uuid, mobileActiveTab, game?.status, (game as any)?.game_type, (game as any)?.current_turn_player_id, (game as any)?.current_turn, user?.id, players]);
  // LIFTED showdown card cache - persists across MobileGameTable remounts (in_progress -> game_over transition)
  const showdownCardsCacheRef = useRef<Map<string, CardType[]>>(new Map());
  const showdownRoundNumberRef = useRef<number | null>(null);

  // LIFTED community cards cache - persists across MobileGameTable remounts to prevent flicker during win animation
  const communityCardsCacheRef = useRef<{ cards: CardType[] | null; round: number | null; show: boolean }>({ cards: null, round: null, show: false });
  // Epoch increments whenever the parent explicitly clears lifted card caches.
  // Children use this to avoid writing stale local state back into the external cache.
  const [communityCacheEpoch, setCommunityCacheEpoch] = useState(0);

  // LIFTED cribbage dealer-chat announcements - persist across multiple dealer games in the same session
  type DealerChatMessage = {
    id: string;
    message: string;
    created_at: string;
    isDealer: true;
  };
  const [cribbageDealerChatMessages, setCribbageDealerChatMessages] = useState<DealerChatMessage[]>([]);
  const cribbageDealerChatIdRef = useRef(0);
  const injectCribbageDealerChatMessage = useCallback((message: string) => {
    cribbageDealerChatIdRef.current += 1;
    const newMsg: DealerChatMessage = {
      id: `dealer-${cribbageDealerChatIdRef.current}-${Date.now()}`,
      message,
      created_at: new Date().toISOString(),
      isDealer: true as const,
    };
    setCribbageDealerChatMessages((prev) => [...prev, newMsg]);
  }, []);

  // Prevent dealer-chat leakage across different sessions/routes.
  useEffect(() => {
    setCribbageDealerChatMessages([]);
    cribbageDealerChatIdRef.current = 0;
  }, [gameId]);

  const {
    chatBubbles,
    allMessages,
    sendMessage: sendChatMessage,
    isSending: isChatSending,
    getPositionForUserId,
    latestRealtimeMessage,
    isChatHydrated,
    hydrationBaselineIds,
    chatConversationKey,
  } = useGameChat(gameId, players, user?.id, chatOperationIdentity);

  useEffect(() => {
    const route = typeof window !== 'undefined' ? window.location.pathname : null;
    setRuntimeAmbient({
      user_id: user?.id ?? null,
      route,
      active_tab: mobileActiveTab,
      game_id: gameId ?? null,
      table_id: gameId ?? null,
      dealer_game_id: (game as any)?.current_game_uuid ?? null,
      session_id: normalShellSessionId,
      game_status: game?.status ?? null,
      game_type: game?.game_type ?? null,
      is_committed_active_session: !!gameId,
      shell_phase: game?.status ?? null,
      active_game_component: game?.status === 'in_progress' ? 'Game' : null,
      waiting_table_component: game?.status !== 'in_progress' ? 'Game.waiting-shell' : null,
    });
    setShellTabAttentionContext({
      gameId: gameId ?? null,
      sessionId: normalShellSessionId,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      gameType: game?.game_type ?? null,
      route,
      shellPhase: game?.status ?? null,
      activeGameComponent: game?.status === 'in_progress' ? 'Game' : null,
      waitingTableComponent: game?.status !== 'in_progress' ? 'Game.waiting-shell' : null,
    });
  }, [gameId, normalShellSessionId, user?.id, mobileActiveTab, game?.status, game?.game_type, (game as any)?.current_game_uuid]);

  useEffect(() => {
    recordConsumerSubscription({
      consumer: 'Game.tsx',
      mounted: true,
      gameId: gameId ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      payload: { currentUserId: user?.id ?? null, route: 'game' },
    });
    return () => recordConsumerSubscription({
      consumer: 'Game.tsx',
      mounted: false,
      gameId: gameId ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      payload: { route: 'game' },
    });
  }, [gameId, (game as any)?.current_game_uuid, user?.id]);

  useEffect(() => {
    recordReactRenderObserved({
      consumer: 'Game.tsx',
      sourceCollection: allMessages,
      gameId: gameId ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      payload: {
        currentUserId: user?.id ?? null,
        latestRealtimeMessageId: latestRealtimeMessage?.id ?? null,
        activeTab: mobileActiveTab,
        hasUnreadMessages: mobileHasUnreadMessages,
        lastSeenChatMessageId,
        lastReadChatMessageId,
      },
    });
    recordSelectorProof({
      consumer: 'Game.tsx',
      selectorName: 'Game.useGameChat-allMessages-prop-pass',
      sourceCollection: allMessages,
      returnedCollection: allMessages,
      gameId: gameId ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      currentUserId: user?.id ?? null,
      memoInputs: {
        allMessagesIds: allMessages.map((message) => message.id),
        latestRealtimeMessageId: latestRealtimeMessage?.id ?? null,
        currentUserId: user?.id ?? null,
      },
      dependencyInputs: {
        allMessagesLength: allMessages.length,
        gameId: gameId ?? null,
        dealerGameId: (game as any)?.current_game_uuid ?? null,
      },
    });
  }, [allMessages, gameId, (game as any)?.current_game_uuid, latestRealtimeMessage, lastReadChatMessageId, lastSeenChatMessageId, mobileActiveTab, mobileHasUnreadMessages, user?.id]);

  const prevChatDealerGameIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentDealerGameId = game?.current_game_uuid ?? null;
    const prevDealerGameId = prevChatDealerGameIdRef.current;

    if (prevDealerGameId !== undefined && prevDealerGameId !== currentDealerGameId) {
      console.log('[holm-chat-indicator] dealer-game identity reset', {
        prevDealerGameId,
        currentDealerGameId,
        lastSeenChatMessageId,
        lastReadChatMessageId,
      });
    }

    prevChatDealerGameIdRef.current = currentDealerGameId;
  }, [game?.current_game_uuid]);

  // Conversation-key stability guard. The canonical chat conversation
  // key is the route `gameId` — it MUST remain stable across dealer
  // games, rounds, phase transitions, and mobile-table remounts within
  // the same table/session. Any change here is a genuine table/session
  // change and is recorded so that chat history preservation across
  // dealer-game boundaries can be verified from the ledger.
  const prevChatConversationKeyRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevChatConversationKeyRef.current;
    if (prev !== undefined && prev !== chatConversationKey) {
      recordChatDeliveryViolation({
        violation: 'CHAT_CONVERSATION_KEY_CHANGED_MID_SESSION',
        gameId: chatConversationKey ?? null,
        consumer: 'Game.tsx',
        payload: {
          prevConversationKey: prev,
          nextConversationKey: chatConversationKey,
          currentDealerGameId: (game as any)?.current_game_uuid ?? null,
        },
      });
    }
    prevChatConversationKeyRef.current = chatConversationKey;
  }, [chatConversationKey, (game as any)?.current_game_uuid]);
  
  // Server-side deadline enforcement - any active client triggers this for ALL players
  useDeadlineEnforcer(gameId, game?.status);
  
  // Keep screen awake during active gameplay (prevents device from sleeping)
  const isActiveGame = game?.status && !['session_ended', 'deleted'].includes(game.status);
  useWakeLock(!!isActiveGame);
  

  // If an empty session was deleted (no longer exists in DB), leave the game route.
  const missingGameHandledRef = useRef(false);
  // P0 GUARD (NAV-02): require multiple consecutive "missing" confirmations before navigating.
  const missingGameStrikesRef = useRef(0);
  const MISSING_GAME_STRIKES_REQUIRED = 3;

  // Prevent out-of-order fetches from reverting UI state (e.g., game_selection ↔ ante_decision flicker).
  const fetchSeqRef = useRef(0);

  // ── Optimistic Gin in-progress seed guard ─────────────────────────────
  // When the dealer client optimistically advances a gin dealerGameId to
  // status='in_progress' / current_round=1 / rounds[seed.roundId] (see
  // handleAllAnteDecisionsIn after startGinRummyRound), a stale fetch that
  // was already in flight (or one triggered immediately by the bot ante
  // realtime payload) can land milliseconds later carrying the OLD snapshot
  // (status='ante_decision', no round yet). That stale write regresses
  // currentRound → null and propRoundId → "", causing the user-visible
  // "Awaiting ante decisions" → disappear → reappear → start flicker.
  //
  // This ref captures the optimistic seed identity. While it is active,
  // fetchGameData merges seeded fields into any incoming snapshot for the
  // SAME dealerGameId that does not yet reflect the seed (status not
  // in_progress, or rounds list missing the seeded roundId). Reconciled
  // snapshots (status in_progress AND rounds include seed.roundId) clear
  // the ref. A boundary to a different dealerGameId also clears it.
  const ginOptimisticSeedRef = useRef<{
    dealerGameId: string;
    roundId: string;
    handNumber: number;
    seededAt: number;
  } | null>(null);

  // ── Cribbage resume identity preservation ─────────────────────────────
  // Captures the most recent VALID (gameId, dealerGameId, roundId, handNumber)
  // observed while status='in_progress'. On client resume (visibility /
  // realtime reconnect) `game.rounds` can be transiently empty for one render
  // between the `games` row landing and the rounds refetch completing. In that
  // narrow window we render preserved identity iff:
  //   • same gameId
  //   • preserved.dealerGameId === game.current_game_uuid (authoritative scope)
  //   • current game status is still `in_progress`
  // Any of the following invalidate preservation (never survive a genuine
  // lifecycle boundary): dealer-game rotation (different current_game_uuid),
  // game_over, session reset, intentional return to waiting, or a newly
  // fetched games row with a different current_game_uuid.
  const lastValidCribbageIdentityRef = useRef<{
    gameId: string;
    dealerGameId: string;
    roundId: string;
    handNumber: number | null;
  } | null>(null);

  // P0 SHELL RECOVERY LEASE (INV-A, INV-B): while this Game route is
  // mounted with an authoritative (gameId, userId) identity, hold a
  // durable recovery lease. Transient disconnects, resubscribe failures,
  // delayed snapshots, and Chaos recovery events MUST NOT route to lobby.
  // Only explicit terminal reasons (recorded via recordTerminalRecovery
  // at the actual navigate('/') call sites) may release the lease.
  useEffect(() => {
    if (!gameId || !user?.id) return;
    acquireRecoveryLease(gameId, user.id);
    return () => {
      releaseRecoveryLease('unmount', { gameId, userId: user.id });
    };
  }, [gameId, user?.id]);

  useEffect(() => {
    if (!gameId || !user) return;


    let cancelled = false;

    const checkGameExists = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('id, status')
        .eq('id', gameId)
        .maybeSingle();

      if (cancelled) return;

      // CRITICAL: Distinguish "game doesn't exist" from "query failed" (e.g. network/auth error on reconnect).
      if (error) {
        const code = (error as any)?.code;
        if (code !== 'PGRST116') {
          // Network/auth/other error — never count as a strike, never navigate.
          console.warn('[CHECK GAME] Query error (transient, not counting):', error.message);
          return;
        }
      }

      const isMissing = !data;

      if (!isMissing) {
        // Reset strike counter on any successful confirmation.
        if (missingGameStrikesRef.current > 0) {
          console.log('[CHECK GAME] missing-strike-reset (game still present)');
        }
        missingGameStrikesRef.current = 0;
        return;
      }

      missingGameStrikesRef.current += 1;
      if (missingGameStrikesRef.current < MISSING_GAME_STRIKES_REQUIRED) {
        console.log('[CHECK GAME] missing-game-strike (transient, not navigating yet)', {
          strikes: missingGameStrikesRef.current,
          required: MISSING_GAME_STRIKES_REQUIRED,
        });
        return;
      }

      // Final fresh confirmation before navigation — guards against stale poll caching.
      const { data: confirmData, error: confirmError } = await supabase
        .from('games')
        .select('id')
        .eq('id', gameId)
        .maybeSingle();
      if (cancelled) return;
      if (confirmError && (confirmError as any)?.code !== 'PGRST116') {
        console.warn('[CHECK GAME] missing-game-confirm-error, suppressing navigation', confirmError.message);
        missingGameStrikesRef.current = 0;
        return;
      }
      if (confirmData) {
        console.log('[CHECK GAME] missing-game-confirm-recovered (game reappeared)');
        missingGameStrikesRef.current = 0;
        return;
      }

      if (missingGameHandledRef.current) return;
      missingGameHandledRef.current = true;
      console.log('[CHECK GAME] Game confirmed missing from DB after repeated checks - navigating to home');
      setGame(null);
      setPlayers([]);
      toast({
        title: 'Session deleted',
        description: 'Not enough players, deleting this empty session.',
        duration: 3000,
      });
      setTimeout(() => {
        recordTerminalRecovery('game-missing-confirmed', { gameId, strikes: missingGameStrikesRef.current });
        releaseRecoveryLease('confirmed-unavailable', { gameId });
        navigate('/');
      }, 2000);

    };

    checkGameExists();
    // Poll every 3 seconds to check if game still exists
    const interval = window.setInterval(checkGameExists, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [gameId, user?.id, navigate, toast]);

  
  // Player options state
  const [playerOptions, setPlayerOptions] = useState({
    autoAnte: false,
    autoAnteRunback: false,
    sitOutNextHand: false,
    standUpNextHand: false,
  });
  
  // Player options - synced with database
  const handlePlayerOptionChange = async (option: 'auto_ante' | 'auto_ante_runback' | 'sit_out_next_hand' | 'stand_up_next_hand', value: boolean) => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) {
      console.error('[PLAYER OPTIONS] No current player found');
      return;
    }
    
    console.log('[PLAYER OPTIONS] Setting', option, 'to', value, 'for player', currentPlayer.id);
    
    // Log sit_out_next_hand changes for debugging (only when setting to true)
    if (option === 'sit_out_next_hand' && value === true) {
      const { logSitOutNextHandSet } = await import('@/lib/sittingOutDebugLog');
      await logSitOutNextHandSet(
        currentPlayer.id,
        currentPlayer.user_id,
        gameId!,
        currentPlayer.profiles?.username,
        currentPlayer.is_bot,
        currentPlayer.sit_out_next_hand,
        'User manually toggled sit_out_next_hand via PlayerOptionsMenu',
        'Game.tsx:handlePlayerOptionChange',
        { game_status: game?.status, current_round: game?.current_round }
      );
    }
    
    // Mutual exclusivity: auto_ante and auto_ante_runback cannot both be true
    const updates: Record<string, boolean> = { [option]: value };
    if (option === 'auto_ante' && value === true) {
      updates.auto_ante_runback = false;
    } else if (option === 'auto_ante_runback' && value === true) {
      updates.auto_ante = false;
    }
    
    // Optimistic update
    const optionToStateKey = (opt: string) => {
      if (opt === 'auto_ante') return 'autoAnte';
      if (opt === 'auto_ante_runback') return 'autoAnteRunback';
      if (opt === 'sit_out_next_hand') return 'sitOutNextHand';
      return 'standUpNextHand';
    };
    
    setPlayerOptions(prev => {
      const newState = { ...prev };
      for (const [key, val] of Object.entries(updates)) {
        newState[optionToStateKey(key) as keyof typeof prev] = val;
      }
      return newState;
    });
    
    // Persist to database
    const { error, data } = await supabase
      .from('players')
      .update(updates)
      .eq('id', currentPlayer.id)
      .select();
    
    if (error) {
      console.error('[PLAYER OPTIONS] Failed to save:', error);
      // Revert on error
      setPlayerOptions(prev => {
        const newState = { ...prev };
        for (const [key, val] of Object.entries(updates)) {
          newState[optionToStateKey(key) as keyof typeof prev] = !val;
        }
        return newState;
      });
    } else {
      console.log('[PLAYER OPTIONS] ✅ Successfully saved:', updates, 'Result:', data);
    }
  };
  
  // After a player leaves, check if the session has enough humans to continue.
  // If not, revert to 'waiting' or end the session entirely.
  const checkAndCleanupAfterPlayerLeave = async (gId: string) => {
    const { data: remainingPlayers } = await supabase
      .from('players')
      .select('id, is_bot, sitting_out, status')
      .eq('game_id', gId)
      .neq('status', 'left');

    const activeHumans = remainingPlayers?.filter(p => !p.is_bot && !p.sitting_out) || [];
    const totalPlayers = remainingPlayers?.length || 0;

    console.log('[CLEANUP] After player leave:', { activeHumans: activeHumans.length, totalPlayers });

    if (totalPlayers === 0) {
      // No players left at all — delete or archive
      const { data: gData } = await supabase.from('games').select('real_money, status').eq('id', gId).single();
      if (gData?.real_money) {
        await supabase.from('games').update({ status: 'session_ended', session_ended_at: new Date().toISOString(), game_over_at: new Date().toISOString() }).eq('id', gId);
      } else {
        // Check if game has history (game_results OR dealer_games)
        const { count } = await supabase.from('game_results').select('id', { count: 'exact', head: true }).eq('game_id', gId);
        const { count: dealerGameCount } = await supabase.from('dealer_games').select('id', { count: 'exact', head: true }).eq('session_id', gId);
        if ((count ?? 0) > 0 || (dealerGameCount ?? 0) > 0) {
          await supabase.from('games').update({ status: 'session_ended', session_ended_at: new Date().toISOString(), game_over_at: new Date().toISOString() }).eq('id', gId);
        } else {
          await supabase.from('players').delete().eq('game_id', gId);
          await supabase.from('games').delete().eq('id', gId);
        }
      }
      return;
    }

    // If < 2 active players or 0 humans, session can't continue in a game state
    if (activeHumans.length === 0 || totalPlayers < 2) {
      const { data: gData } = await supabase.from('games').select('status, real_money').eq('id', gId).single();
      if (!gData) return;
      
      const transitionalStates = ['dealer_selection', 'game_selection', 'configuring', 'dealer_announcement',
        'cribbage_dealer_selection', 'ante_decision', 'in_progress', 'game_over'];
      
      if (transitionalStates.includes(gData.status) || gData.status === 'waiting' || gData.status === 'waiting_for_players') {
        console.log('[CLEANUP] Not enough players in state:', gData.status, '- reverting to waiting');
        
        // If real money or has history, just revert to waiting so remaining player sees the lobby
        await supabase.from('games').update({ status: 'waiting' }).eq('id', gId);
      }
    }
  };

  // The database owns post-dealer-game participation resolution for real-money
  // sessions. It either closes a settled zero-human session exactly once or
  // returns the session to post-game waiting, where absence is reconciled.
  const resolvePostgameParticipation = async (gId: string): Promise<string> => {
    const { data, error } = await supabase.rpc(
      'resolve_postgame_participation' as any,
      { p_game_id: gId } as any,
    );
    if (error) throw error;
    return (data as { outcome?: string } | null)?.outcome ?? 'unknown';
  };

  // Stand Up is one atomic server action at a settled post-game boundary:
  // record the caller's exit, then either end, wait, or preserve continuation
  // from the resulting authoritative participant counts.
  const standUpAndResolvePostgame = async (gId: string): Promise<{
    outcome: string;
    lifecycleResolved: boolean;
  }> => {
    const { data, error } = await supabase.rpc(
      'stand_up_and_resolve_postgame' as any,
      { p_game_id: gId } as any,
    );
    if (error) throw error;

    const result = data as {
      outcome?: string;
      lifecycle_resolved?: boolean;
    } | null;

    return {
      outcome: result?.outcome ?? 'unknown',
      lifecycleResolved: result?.lifecycle_resolved === true,
    };
  };

  const handleStandUpNow = async () => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    
    // Snapshot this player's chips before they leave (for real money games)
    if (game?.real_money) {
      const username = currentPlayer.profiles?.username || 'Unknown';
      await snapshotDepartingPlayer(
        gameId!, 
        currentPlayer.id, 
        currentPlayer.user_id, 
        currentPlayer.chips, 
        username,
        currentPlayer.is_bot
      );
    }
    
    try {
      const result = await standUpAndResolvePostgame(gameId!);
      console.log('[PLAYER OPTIONS] Stand-up disposition:', result);

      if (result.outcome === 'not-authorized' || result.outcome === 'missing-game') {
        throw new Error(`Stand up rejected: ${result.outcome}`);
      }

      // Never-started rooms and non-postgame states retain the established
      // cleanup owner. Settled post-game lifecycle was already decided in the
      // same transaction as the player exit and must not be second-guessed by
      // the legacy client-side count.
      if (!result.lifecycleResolved) {
        await checkAndCleanupAfterPlayerLeave(gameId!);
      } else {
        await fetchGameData();
      }

      // If cleanup deleted the game (e.g. last human stood up with no bots),
      // navigate back to lobby so we don't leave the viewer on a stale page
      // whose Join button would FK-violate against a now-missing games.id.
      const { data: stillThere } = await supabase
        .from('games')
        .select('id')
        .eq('id', gameId!)
        .maybeSingle();
      if (!stillThere) {
        recordTerminalRecovery('completed-teardown', { gameId, source: 'stand-up-cleanup' });
        releaseRecoveryLease('completed-teardown', { gameId });
        navigate('/');
      }
    } catch (error) {
      console.error('[PLAYER OPTIONS] Failed to stand up:', error);
      toast({ title: "Error", description: "Failed to stand up", variant: "destructive" });
    }
  };
  
  const handleLeaveGameNow = async () => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    
    // If user is an observer (not a player), just navigate back to lobby
    if (!currentPlayer) {
      recordTerminalRecovery('explicit-leave', { gameId, source: 'observer-leave' });
      releaseRecoveryLease('explicit-leave', { gameId });
      navigate('/');
      return;
    }

    
    // Check if host is leaving during waiting phase - delete the entire game
    // CRITICAL: NEVER delete real_money games - archive them instead
    if ((game?.status === 'waiting' || game?.status === 'waiting_for_players') && isCreator) {
      if (game?.real_money) {
        // Real money games: NEVER delete - archive to session_ended
        console.log('[PLAYER OPTIONS] Real money game - archiving instead of deleting');
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString(),
            game_over_at: new Date().toISOString(),
          })
          .eq('id', gameId);
      } else {
        // Delete all players first (including bots)
        await supabase.from('players').delete().eq('game_id', gameId);
        // Delete the game
        const { error } = await supabase.from('games').delete().eq('id', gameId);
        if (error) {
          console.error('[PLAYER OPTIONS] Failed to delete game:', error);
          toast({ title: "Error", description: "Failed to delete game", variant: "destructive" });
        }
      }
      recordTerminalRecovery('explicit-leave', { gameId, source: 'host-leave-waiting' });
      releaseRecoveryLease('explicit-leave', { gameId });
      navigate('/');
      return;
    }

    
    // Snapshot this player's chips before they leave (for real money games)
    if (game?.real_money) {
      const username = currentPlayer.profiles?.username || 'Unknown';
      await snapshotDepartingPlayer(
        gameId!, 
        currentPlayer.id, 
        currentPlayer.user_id, 
        currentPlayer.chips, 
        username,
        currentPlayer.is_bot
      );
    }
    
    // Soft-delete the player record (preserve for hand history FK integrity).
    // Clear participation-eligibility flags to match handleStandUpNow.
    const { error } = await supabase
      .from('players')
      .update({
        status: 'left',
        sitting_out: true,
        stand_up_next_hand: false,
        sit_out_next_hand: false,
        ante_decision: null,
        auto_ante: false,
        auto_ante_runback: false,
        auto_fold: false,
        waiting: false,
      })
      .eq('id', currentPlayer.id);
    
    if (error) {
      console.error('[PLAYER OPTIONS] Failed to leave game:', error);
      toast({ title: "Error", description: "Failed to leave game", variant: "destructive" });
    } else {
      // Fire-and-forget: check if session needs cleanup after we leave
      checkAndCleanupAfterPlayerLeave(gameId!);
      recordTerminalRecovery('explicit-leave', { gameId, source: 'leave-game-now' });
      releaseRecoveryLease('explicit-leave', { gameId });
      navigate('/');
    }
  };

  
  // Handle pause/resume toggle for host
  const handleTogglePause = useCallback(async () => {
    if (!game || !gameId) return;
    
    const newPausedState = !game.is_paused;
    
    // Get current round for deadline updates.
    // CRITICAL: Must be scoped to dealer_game_id, otherwise 3-5-7 Round 1 can be mistaken for Holm Round 1.
    const currentRoundData = (game.game_type === 'holm-game' || game.game_type === 'horses' || game.game_type === 'ship-captain-crew' || game.game_type === 'yahtzee')
      ? pickActiveSingleRoundGameRound(game.rounds, {
          dealerGameId: game.current_game_uuid,
          currentRoundNumber: game.current_round,
          currentHandNumber: game.total_hands,
        })
      : pickActive357Round(game.rounds, {
          currentRoundNumber: game.current_round,
          currentHandNumber: game.total_hands,
          dealerGameId: game.current_game_uuid,
        }) ?? null;
    
    if (newPausedState) {
      // PAUSING: Save current remaining time
      const deadlineRemaining = decisionDeadline
        ? Math.max(0, Math.floor((new Date(decisionDeadline).getTime() - Date.now()) / 1000))
        : null;
      const remainingTime = timeLeft ?? deadlineRemaining ?? decisionTimerRef.current;
      console.log('[PAUSE] Pausing game, saving remaining time:', remainingTime);
      
      // Optimistic UI update
      setGame(prev => prev ? { ...prev, is_paused: true, paused_time_remaining: remainingTime } : prev);
      
      const { error } = await supabase
        .from('games')
        .update({ 
          is_paused: true, 
          paused_time_remaining: remainingTime 
        })
        .eq('id', gameId);
      
      if (error) {
        console.error('[PAUSE] Error pausing:', error);
        setGame(prev => prev ? { ...prev, is_paused: false, paused_time_remaining: null } : prev);
        toast({ title: "Error", description: "Failed to pause game", variant: "destructive" });
      }
    } else {
      // RESUMING: Continue the frozen decision window instead of granting a
      // fresh maximum. This also keeps the visual-bug pause/resume flow from
      // rewriting the active timer as a refill.
      const remainingTime = Math.max(
        0,
        Math.floor(game.paused_time_remaining ?? timeLeft ?? decisionTimerRef.current),
      );
      const newDeadline = new Date(Date.now() + remainingTime * 1000).toISOString();
      console.log('[PAUSE] Resuming game from saved remaining time:', newDeadline, 'with', remainingTime, 'seconds');
      
      // Update the deadline while every client is still paused. Publishing the
      // unpaused game first briefly exposed the expired pre-pause deadline.
      if (currentRoundData?.id) {
        const { error: roundError } = await supabase
          .from('rounds')
          .update({ decision_deadline: newDeadline })
          .eq('id', currentRoundData.id);
        
        if (roundError) {
          console.error('[PAUSE] Error updating round deadline:', roundError);
          toast({ title: "Error", description: "Failed to resume game", variant: "destructive" });
          return;
        }
      }

      const { error: gameError } = await supabase
        .from('games')
        .update({
          is_paused: false,
          paused_time_remaining: null,
        })
        .eq('id', gameId);
      
      if (gameError) {
        console.error('[PAUSE] Error resuming:', gameError);
        toast({ title: "Error", description: "Failed to resume game", variant: "destructive" });
        return;
      }

      setGame(prev => prev ? { ...prev, is_paused: false, paused_time_remaining: null } : prev);
      // Normalize ISO to canonical form to prevent identity drift across realtime payloads.
      setDecisionDeadline(new Date(newDeadline).toISOString());
    }
  }, [decisionDeadline, game, gameId, timeLeft, toast]);

  // DEBUG: Pause auto-progression for Holm games to debug stale card issues
  // Set to true to enable debug mode (shows "Proceed to Next Round" button)
  const [debugHolmPaused, setDebugHolmPaused] = useState(false); // TEMPORARILY DISABLED - set to true to re-enable

  // ── 3-5-7 Showdown Pause Harness (Game Default) ──────────────────
  // Reads the selected harness profile for 3-5-7. When set to
  // 'pause_r{1,2,3}_showdown', the AUTO_PROCEED scheduling seam below
  // refuses to schedule the 4s timer on the first real opponent-exposed
  // showdown of the matching round in the current dealer game. No new
  // timer, no override, no release path — awaiting_next_round stays
  // true and the natural live tableau remains on screen.
  const harness357 = useDebugHarness('3-5-7');
  const harness357PausedGameRef = useRef<string | null>(null);
  useEffect(() => {
    // Clear one-shot tracking on any of: dealer-game change, game change,
    // harness selection change, game-type change away from 3-5-7. Unmount
    // garbage-collects the ref naturally.
    harness357PausedGameRef.current = null;
  }, [game?.current_game_uuid, game?.game_type, harness357, gameId]);

  // Holm Showdown Freeze harness — same pattern as 3-5-7. One-shot per
  // hand identity = (current_game_uuid | current_round). Pauses
  // AUTO_PROCEED scheduling on the first real Holm multiplayer showdown
  // (parseable WINNER+LOSERS marker in last_round_result) so the
  // live-rendered table stays mounted for Geometry Lab inspection.
  const harnessHolm = useDebugHarness('holm');
  const harnessHolmPausedHandRef = useRef<string | null>(null);
  useEffect(() => {
    harnessHolmPausedHandRef.current = null;
  }, [game?.current_game_uuid, game?.game_type, harnessHolm, gameId]);

  
  // CRITICAL: Track game state for detecting transitions without relying on realtime payload.old
  const lastKnownGameTypeRef = useRef<string | null>(null);
  const lastKnownRoundRef = useRef<number | null>(null);
  
  // Track max community cards revealed - never decrease during showdowns
  // Must be defined here (not inline) so it's accessible in realtime handlers
  const maxRevealedRef = useRef<number>(0);
  // Track card identity to detect new hands (when cards change completely)
  const cardIdentityRef = useRef<string>('');

  // ---------- Card cache debugging helpers ----------
  const snapshotCommunityCache = useCallback(() => {
    const c = communityCardsCacheRef.current;
    const preview = (c.cards ?? []).slice(0, 4).map((card: any) => {
      if (!card) return String(card);
      if (typeof card === 'string') return card;
      const rank = (card as any).rank ?? '?';
      const suit = (card as any).suit ?? '?';
      return `${rank}${suit}`;
    });
    return {
      show: c.show,
      round: c.round,
      len: c.cards?.length ?? 0,
      preview,
    };
  }, []);

  const clearLiftedCardCaches = useCallback(
    (reason: string, extra?: Record<string, any>) => {
      console.log(`[CACHE_CLEAR] ${reason}`, extra);

      // Lifted caches used by MobileGameTable to prevent flicker during animations
      communityCardsCacheRef.current = { cards: null, round: null, show: false };
      showdownCardsCacheRef.current = new Map();
      showdownRoundNumberRef.current = null;
      setCommunityCacheEpoch((e) => e + 1);
    },
    [],
  );

  // DICE SYNC: For dice games, observers wait on fetchGameData to receive horses_state updates.
  // Instead, patch the realtime round payload directly into `game.rounds` so UI/animations start
  // as soon as the realtime message arrives (no debounce/fetch latency).
  const applyRoundRealtimePatch = useCallback((newRound: any) => {
    try {
      const roundId = newRound?.id as string | undefined;
      if (!roundId) return;

      // Validate horses_state has expected structure before applying patch
      if (newRound.horses_state) {
        const hs = newRound.horses_state;
        // If horses_state is malformed (missing turnOrder or playerStates), skip patch
        if (hs.gamePhase && hs.gamePhase !== 'waiting' && (!hs.turnOrder || !hs.playerStates)) {
          console.warn('[REALTIME] Skipping malformed horses_state patch', hs);
          return;
        }
      }

      setGame((prev) => {
        if (!prev) return prev;
        const rounds = prev.rounds ?? [];
        const idx = rounds.findIndex((r) => r.id === roundId);
        recordGinPhaseTrace({
          kind: 'state-replacement',
          summary: 'Game rounds state patched from realtime',
          sourceFile: 'src/pages/Game.tsx',
          sourceFunction: 'applyRoundRealtimePatch',
          identity: { gameId: gameId ?? null, dealerGameId: newRound?.dealer_game_id ?? (prev as any)?.current_game_uuid ?? null, roundId, handNumber: newRound?.hand_number ?? null },
          detail: {
            source: 'realtime',
            statusBefore: prev.status ?? null,
            statusAfter: prev.status ?? null,
            activeTabBefore: mobileActiveTab,
            activeTabAfter: mobileActiveTab,
            roundPatchMode: idx === -1 ? 'insert' : 'update',
            hasGinRummyState: !!newRound?.gin_rummy_state,
          },
        });
        if (idx === -1) {
          // INSERT path: append authoritative row so currentRound can be derived
          // immediately, without waiting for the fetchGameData round-trip.
          return { ...prev, rounds: [...rounds, newRound as any] };
        }
        const nextRounds = [...rounds];
        nextRounds[idx] = { ...nextRounds[idx], ...(newRound as any) };
        return { ...prev, rounds: nextRounds };
      });
    } catch (err) {
      console.error('[REALTIME] Error in applyRoundRealtimePatch:', err);
    }
  }, [gameId, mobileActiveTab]);

  // CRITICAL: React Router does not remount this page when only :gameId changes.
  // If we keep lifted caches, a new game's first hand can render the last hand's cards.
  const prevGameIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevGameIdRef.current;
    if (prev && prev !== gameId) {
      clearLiftedCardCaches('GAME ID CHANGED', { prev, next: gameId });

      // Related state that can keep old cards visible briefly
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      emit357ClearEvent('game_id_route_change', 'route :gameId changed — reset lifted card caches', 3095);
      setPlayerCards([]);
      setCardStateContext(null);

      // Hand identity tracking
      lastKnownGameTypeRef.current = null;
      lastKnownRoundRef.current = null;
      maxRevealedRef.current = 0;
      cardIdentityRef.current = '';
    }
    prevGameIdRef.current = gameId;
  }, [gameId, clearLiftedCardCaches]);

  // CRITICAL: When the dealer config flow starts (same gameId, new game setup),
  // clear all lifted card caches immediately so the new game can't render old cards.
  // ALSO clear when entering ante_decision - this is start of a new hand, any cached cards from previous game should go.
  const prevStatusForCacheRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevStatusForCacheRef.current;
    const next = game?.status ?? null;

    const isDealerConfigScreen = next === 'game_selection' || next === 'configuring' || next === 'dealer_selection';
    const isAntePhase = next === 'ante_decision';
    const shouldClear = next !== prev && (isDealerConfigScreen || isAntePhase);

    if (shouldClear) {
      console.log('[CACHE_GUARD] Clearing caches on status transition', { prev, next });
      clearLiftedCardCaches('ENTERED NEW HAND FLOW', { prev, next });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      emit357ClearEvent('dealer_config_or_ante_status_reset', 'status transitioned into dealer config screen or ante_decision', 3124);
      setPlayerCards([]);
      setCardStateContext(null);
      maxRevealedRef.current = 0;
      cardIdentityRef.current = '';
    }

    prevStatusForCacheRef.current = next;
  }, [game?.status, clearLiftedCardCaches]);

  // CRITICAL: Holm first-hand start can briefly flip game.status to in_progress BEFORE the new round exists.
  // If we show anything during that gap, React will render the previous hand's cards/decisions.
  const inProgressNoRoundGuardRef = useRef(false);
  useEffect(() => {
    const status = game?.status ?? null;
    const roundsCount = game?.rounds?.length ?? 0;

    // Guard for ANY game type transitioning to in_progress without rounds
    const shouldGuard = status === 'in_progress' && roundsCount === 0;

    if (!shouldGuard) {
      inProgressNoRoundGuardRef.current = false;
      return;
    }

    if (inProgressNoRoundGuardRef.current) return;
    inProgressNoRoundGuardRef.current = true;

    console.warn('[CACHE_GUARD] in_progress without any rounds yet - clearing UI state to prevent stale render');
    clearLiftedCardCaches('IN_PROGRESS WITHOUT ROUND', { status, roundsCount, gameType: game?.game_type });
    setCachedRoundData(null);
    cachedRoundRef.current = null;
    emit357ClearEvent('in_progress_no_rounds_guard', 'game status=in_progress but zero rounds — anti-stale guard', 3155);
    setPlayerCards([]);
    setCardStateContext(null);
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';
  }, [game?.game_type, game?.status, game?.rounds?.length, clearLiftedCardCaches]);

  // CRITICAL: Clear caches when game type changes (switching between Holm and 3-5-7)
  // Use layout effect so the clear happens before paint (prevents a 1-frame flash of old cards)
  const prevGameTypeRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const prevType = prevGameTypeRef.current;
    const currentType = game?.game_type ?? null;

    // NOTE: currentType can temporarily be null during new-game setup; treat that as a type change.
    if (prevType !== null && prevType !== currentType) {
      console.log('[CACHE_GUARD] Game type changed, clearing caches (layout)', { prevType, currentType });
      clearLiftedCardCaches('GAME TYPE CHANGED', { prevType, currentType });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      emit357ClearEvent('game_type_change_layout', 'game_type changed (useLayoutEffect prev != current)', 3174);
      setPlayerCards([]);
      setCardStateContext(null);
      maxRevealedRef.current = 0;
      cardIdentityRef.current = '';
    }

    prevGameTypeRef.current = currentType;
  }, [game?.game_type, clearLiftedCardCaches]);

  // Auto-enable SHELL LC panel for game types we are actively debugging
  // (Holm). Clears on unmount / when leaving the game.
  useEffect(() => {
    setShellLifecycleActiveGameType(game?.game_type ?? null);
    return () => setShellLifecycleActiveGameType(null);
  }, [game?.game_type]);

  // Holm trace pill — activate only while a Holm table is mounted.
  // Buffer resets on activation; deactivation clears the on-screen pill.
  useEffect(() => {
    const isHolm = game?.game_type === 'holm-game';
    setHolmTraceActive(isHolm);
    setHolmLedgerActive(isHolm);
    return () => {
      setHolmTraceActive(false);
      setHolmLedgerActive(false);
    };
  }, [game?.game_type, game?.id]);

  const ginPhaseTracePrevAuthRef = useRef<{
    status: string | null;
    phase: string | null;
    gameType: string | null;
    dealerGameId: string | null;
    roundId: string | null;
    handNumber: number | null;
    activeTab: typeof mobileActiveTab;
  } | null>(null);
  // AGGRESSIVE: Guard against any code path repopulating caches while in dealer config flow
  const dealerConfigGuardFiredRef = useRef(false);
  useEffect(() => {
    const status = game?.status ?? null;
    const isDealerConfig = status === 'game_selection' || status === 'configuring' || status === 'dealer_selection';

    if (!isDealerConfig) {
      dealerConfigGuardFiredRef.current = false;
      return;
    }

    const communityCache = snapshotCommunityCache();
    const hasCachedRound = !!cachedRoundData || !!cachedRoundRef.current;

    if (
      !dealerConfigGuardFiredRef.current &&
      (hasCachedRound || communityCache.len > 0 || communityCache.show || communityCache.round !== null)
    ) {
      dealerConfigGuardFiredRef.current = true;
      console.error('[CACHE_GUARD] Dealer config phase has cached cards - forcing clear', {
        status,
        communityCache,
        hasCachedRoundData: !!cachedRoundData,
        hasCachedRoundRef: !!cachedRoundRef.current,
      });

      clearLiftedCardCaches('FORCED CLEAR (dealer config guard)', { status });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      emit357ClearEvent('dealer_config_forced_clear', 'dealer config phase had cached card artifacts — forced clear', 3240);
      setPlayerCards([]);
      setCardStateContext(null);
      maxRevealedRef.current = 0;
      cardIdentityRef.current = '';
    }
  }, [game?.status, cachedRoundData, clearLiftedCardCaches, snapshotCommunityCache]);

  // CRITICAL: Clear card caches when a new hand starts (round number changes in Holm games)
  // This prevents stale cards from the previous hand showing up
  const prevRoundForCacheRef = useRef<number | null>(null);

  useEffect(() => {
    if (game?.game_type !== 'holm-game') return;

    const prevRound = prevRoundForCacheRef.current;
    const currentRoundNum = game?.current_round || 0;

    // When round number changes (new hand), clear all card caches
    if (prevRound !== null && currentRoundNum !== prevRound && currentRoundNum > 0) {
      clearLiftedCardCaches('NEW HAND DETECTED (round changed)', {
        prevRound,
        currentRound: currentRoundNum,
      });
    }

    prevRoundForCacheRef.current = currentRoundNum;
  }, [game?.current_round, game?.game_type, clearLiftedCardCaches]);

  // CRITICAL: Clear ALL card caches when current_game_uuid (dealer game ID) changes.
  // This is the PRIMARY guard against cross-dealer-game contamination when switching
  // from 3-5-7 to Holm or vice versa. The new dealer game has its own hand/round numbering.
  const prevDealerGameIdRef = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const prevDealerGameId = prevDealerGameIdRef.current;
    const currentDealerGameId = game?.current_game_uuid ?? null;

    // On first render, just record the current value
    if (prevDealerGameId === undefined) {
      prevDealerGameIdRef.current = currentDealerGameId;
      return;
    }

    // Hydration-only observation: null → first non-null dealerGameId is NOT a
    // rotation. Cold refresh first learns the current dealer-game id AFTER
    // player_cards have already been hydrated by the fetch path; clearing
    // here would wipe freshly-accepted cards. Only a genuine non-null → different
    // non-null rotation is a true dealer-game boundary.
    const isHydrationObservation = prevDealerGameId === null;
    const isGenuineRotation =
      prevDealerGameId !== null &&
      currentDealerGameId !== null &&
      prevDealerGameId !== currentDealerGameId;

    if (isGenuineRotation) {
      console.log('[CACHE_GUARD] 🔄 dealer_game_id changed - CLEARING ALL CACHES to prevent cross-game contamination', {
        prevDealerGameId,
        currentDealerGameId,
        gameType: game?.game_type,
        status: game?.status,
      });

      clearLiftedCardCaches('DEALER_GAME_ID_CHANGED', { prevDealerGameId, currentDealerGameId });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      emit357ClearEvent('dealer_game_id_change', 'games.current_dealer_game_id rotated — cross-dealer-game contamination guard', 3294);
      setPlayerCards([]);
      setCardStateContext(null);
      maxRevealedRef.current = 0;
      cardIdentityRef.current = '';

      // Also reset turn tracking to prevent spotlight flicker
      setLastTurnPosition(null);
      setTimerTurnPosition(null);
    } else if (isHydrationObservation && currentDealerGameId !== null) {
      // Cold-hydration first observation of dealer-game id — record only.
      console.log('[CACHE_GUARD] hydration observation (null → first non-null) — no clear', {
        currentDealerGameId,
      });
    }

    prevDealerGameIdRef.current = currentDealerGameId;
  }, [game?.current_game_uuid, game?.game_type, game?.status, clearLiftedCardCaches]);

  // NOTE: Buck passed cache clear was removed - redundant with NEW HAND DETECTED
  // The round number change is more reliable and fires shortly after buck passes

  // Auth is handled by useAuthGuard hook above.
  // Fetch superuser status when user becomes available.
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('is_superuser').eq('id', user.id).single().then(({ data }) => {
      setIsSuperuser(data?.is_superuser ?? false);
    });
  }, [user?.id]);

  // Fetch game defaults for decision timer - CACHED to reduce DB queries
  const gameDefaultsCacheRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const fetchGameDefaults = async () => {
      if (!game?.game_type) return;
      
      // Map game_type to defaults table format (holm-game -> holm, 3-5-7-game -> 3-5-7)
      const defaultsGameType = game.game_type === 'holm-game' ? 'holm' : '3-5-7';
      
      // Check memory cache first
      if (gameDefaultsCacheRef.current[defaultsGameType]) {
        const cachedValue = gameDefaultsCacheRef.current[defaultsGameType];
        console.log('[GAME DEFAULTS] Using cached decision_timer_seconds:', cachedValue, 'for', defaultsGameType);
        setDecisionTimerSeconds(cachedValue);
        decisionTimerRef.current = cachedValue;
        return;
      }
      
      // Check localStorage cache (persists across page refreshes)
      const cacheKey = `game_defaults_timer_${defaultsGameType}`;
      const cachedStr = localStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = parseInt(cachedStr, 10);
        if (!isNaN(cached)) {
          console.log('[GAME DEFAULTS] Using localStorage cached decision_timer_seconds:', cached, 'for', defaultsGameType);
          setDecisionTimerSeconds(cached);
          decisionTimerRef.current = cached;
          gameDefaultsCacheRef.current[defaultsGameType] = cached;
          return;
        }
      }
      
      const { data, error } = await supabase
        .from('game_defaults')
        .select('decision_timer_seconds')
        .eq('game_type', defaultsGameType)
        .single();
      
      if (data && !error) {
        console.log('[GAME DEFAULTS] Loaded decision_timer_seconds:', data.decision_timer_seconds, 'for', defaultsGameType);
        setDecisionTimerSeconds(data.decision_timer_seconds);
        decisionTimerRef.current = data.decision_timer_seconds;
        // Cache in memory and localStorage
        gameDefaultsCacheRef.current[defaultsGameType] = data.decision_timer_seconds;
        localStorage.setItem(cacheKey, String(data.decision_timer_seconds));
      } else {
        console.log('[GAME DEFAULTS] No defaults found for', defaultsGameType, ', using fallback of 30 seconds', error);
      }
    };
    
    fetchGameDefaults();
  }, [game?.game_type]);

  useEffect(() => {
    // P0 STARTUP FIX: Initial game hydration must NOT wait on auth readiness.
    // `games` and `players` are publicly readable (RLS allows anon read), so
    // we fetch the public snapshot the moment routeGameId is known. Auth
    // still gates user-specific actions further down; this only unblocks
    // the initial visual shell so WaitingTable mounts without the ~2s
    // auth wait observed in Wartime.
    if (!gameId) {
      recordStartupFlight('EFFECT TIMELINE', 'realtime subscription effect skipped', {
        file: 'src/pages/Game.tsx',
        skipReason: 'no gameId',
        gameId: gameId ?? null,
      });
      return;
    }

    console.log('[SUBSCRIPTION] Setting up real-time subscriptions for game:', gameId);
    recordStartupFlight('REALTIME TIMELINE', 'subscription establishing', {
      file: 'src/pages/Game.tsx',
      function: 'realtime subscription effect',
      channel: `game-${gameId}`,
      gameId,
    });
    fetchGameData('cold_mount');

    // Debounce fetch to batch rapid updates during transitions
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) {
        __cancelWartimeAsyncOwner(debounceTimer as unknown as number, 'debounce_rescheduled');
        clearTimeout(debounceTimer);
      }
      debounceTimer = __scheduleWartimeTimeout({
        sourceSiteId: __WARTIME_SRC.ASYNC_GAME_RT_DEBOUNCE.id,
        ownerLabel: 'game.realtime.debouncedFetch',
        delayMs: 300,
        extra: { purpose: 'batch realtime fetchGameData', gameStatus: game?.status ?? null },
        fn: () => {
        fetchGameData('realtime_update');
        },
      }); // 300ms balances responsiveness and batching
    };


    // Fallback polling if realtime subscription drops.
    // This prevents "frozen" games when the realtime channel enters CHANNEL_ERROR.
    let fallbackPollInterval: ReturnType<typeof setInterval> | null = null;
    const startFallbackPolling = () => {
      if (safetyPollsDisabled) return;
      if (fallbackPollInterval) return;
      // Poll every 5 seconds when fallback is needed (not 1.5s which hammers DB)
      fallbackPollInterval = __scheduleWartimeInterval({
        sourceSiteId: __WARTIME_SRC.ASYNC_GAME_RT_FALLBACK_POLL.id,
        ownerLabel: 'game.realtime.fallbackPolling',
        intervalMs: 5000,
        extra: { purpose: 'realtime fallback polling' },
        fn: () => {
        fetchGameData();
        },
      });
    };
    const stopFallbackPolling = () => {
      if (!fallbackPollInterval) return;
      __cancelWartimeAsyncOwner(fallbackPollInterval as unknown as number, 'fallback_poll_stopped');
      clearInterval(fallbackPollInterval);
      fallbackPollInterval = null;
    };

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        simulateRealtime('games', __wrapWartimeRealtimeCausality({
          channelLabel: `game-${gameId}:games`,
          table: 'games',
          identity: () => ({ gameId, dealerGameId: (game as any)?.current_game_uuid ?? null, roundId: currentRound?.id ?? null }),
          handler: (payload: any) => {
          const newData = payload.new as any;
          const oldData = payload.old as any;
          recordStartupFlight('REALTIME TIMELINE', 'games callback fired / payload received', {
            file: 'src/pages/Game.tsx',
            function: 'games realtime callback',
            table: 'games',
            row: newData?.id ?? gameId,
            eventType: payload.eventType,
            oldValue: {
              status: game?.status ?? oldData?.status ?? null,
              game_type: game?.game_type ?? oldData?.game_type ?? null,
              current_game_uuid: (game as any)?.current_game_uuid ?? oldData?.current_game_uuid ?? null,
              current_round: game?.current_round ?? oldData?.current_round ?? null,
            },
            newValue: {
              status: newData?.status ?? null,
              game_type: newData?.game_type ?? null,
              current_game_uuid: newData?.current_game_uuid ?? null,
              current_round: newData?.current_round ?? null,
              total_hands: newData?.total_hands ?? null,
            },
            statusBefore: game?.status ?? null,
            statusAfter: newData?.status ?? null,
          });
          ginTrace('realtime.games payload received', {
            status: newData?.status ?? null,
            current_game_uuid: newData?.current_game_uuid?.slice(0, 8) ?? null,
            current_round: newData?.current_round ?? null,
            total_hands: newData?.total_hands ?? null,
          });
          
          console.log('[REALTIME] 🔔 Games table UPDATE:', {
            eventType: payload.eventType,
            newGameType: newData?.game_type,
            oldGameType: oldData?.game_type,
            localGameType: lastKnownGameTypeRef.current,
            newRound: newData?.current_round,
            oldRound: oldData?.current_round,
            localRound: lastKnownRoundRef.current,
            status: newData?.status,
            awaiting_next_round: newData?.awaiting_next_round,
            is_paused: newData?.is_paused
          });
          
          // CRITICAL: Detect game_type changes using LOCAL STATE (refs) as source of truth
          // Realtime payload.old may be empty/incomplete depending on REPLICA IDENTITY settings
          const incomingGameType = newData?.game_type;
          const localGameType = lastKnownGameTypeRef.current;
          
          // CRITICAL FIX: Also clear cards on ANY game_type change, even from null
          // This ensures players who join mid-session get fresh state
          if (incomingGameType && incomingGameType !== localGameType) {
            console.log('[REALTIME] 🎯🎯🎯 GAME TYPE CHANGED (detected via local state):', localGameType, '->', incomingGameType, '- CLEARING ALL CARD STATE!');
            // Update ref immediately
            lastKnownGameTypeRef.current = incomingGameType;
            lastKnownRoundRef.current = null;
            
            // CRITICAL FIX: Immediately update game state to prevent stale rendering
            // This ensures GameTable sees the new game_type BEFORE fetchGameData completes
            const optimisticRound =
              (typeof newData?.current_round === 'number')
                ? newData.current_round
                : (incomingGameType === 'holm-game' ? 1 : null);

            setGame(prevGame => prevGame ? {
              ...prevGame,
              game_type: incomingGameType,
              // Holm: setup pre-seeds round 1; realtime payload may omit current_round, so default to 1.
              // 3-5-7: clear to avoid stale card count calculation.
              current_round: optimisticRound,
              awaiting_next_round: false,
              status: newData?.status || prevGame.status
            } : null);
            
            // Clear all card state for this client
            emit357ClearEvent('realtime_game_type_change', 'realtime games UPDATE payload changed game_type', 3530);
            setPlayerCards([]);
            setCardStateContext(null);
            setCachedRoundData(null);
            cachedRoundRef.current = null;
            maxRevealedRef.current = 0;
            if (debounceTimer) {
              __cancelWartimeAsyncOwner(debounceTimer as unknown as number, 'game_type_switch_immediate_fetch');
              clearTimeout(debounceTimer);
            }
            // Fetch fresh data after a short delay to allow DB to settle
            __scheduleWartimeTimeout({
              sourceSiteId: __WARTIME_SRC.ASYNC_GAME_RT_DELAYED_FETCH.id,
              ownerLabel: 'game.realtime.gameTypeDelayedFetch',
              delayMs: 200,
              extra: { purpose: 'fetch after game-type switch realtime payload' },
              fn: () => fetchGameData(),
            });
            return;
          }
          
          // GUARD: Skip realtime fetches during game type switches to prevent overwriting optimistic UI (dealer only)
          if (gameTypeSwitchingRef.current) {
            console.log('[REALTIME] ⏸️ Skipping fetch - game type switch in progress');
            return;
          }

          // CRITICAL: Detect round changes using LOCAL STATE for 3-5-7 sync
          const incomingRound = newData?.current_round;
          const localRound = lastKnownRoundRef.current;
          
          // CRITICAL FIX: Sync when:
          // 1. Incoming round is valid AND different from local
          // 2. OR local is null but incoming is valid (initial state sync)
          // 3. OR local has a value but incoming is different
          const needsRoundSync = incomingRound !== undefined && incomingRound !== null && 
            (localRound === null || incomingRound !== localRound);
          
          if (needsRoundSync) {
            console.log('[REALTIME] 🔄🔄🔄 ROUND CHANGED/SYNC:', localRound, '->', incomingRound, '- FORCING SYNC!');
            lastKnownRoundRef.current = incomingRound;
            
            // FIX 2: Hard clear on hand boundary — stale cards are unacceptable
            emit357ClearEvent('realtime_round_change', 'realtime games UPDATE current_round differs from local — hand boundary hard clear', 3572);
            setPlayerCards([]);
            setCardStateContext(null);
            persistSyncDebugEvent({
              gameId: gameId!,
              gameType: 'holm-game',
              handNumber: game?.total_hands ?? 0,
              roundId: null,
              eventType: 'transition',
              severity: 'info',
              eventName: 'hand-boundary-reset',
              payload: { source: 'realtime-round-change', oldRound: localRound, newRound: incomingRound },
            });
            
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            return;
          }
          
          // CRITICAL: Track if we've already handled this update to avoid double-fetching
          let handled = false;
          
          // CRITICAL FIX: Check status changes FIRST - this is most important for game flow
          // When game starts, status changes from 'waiting' to 'ante_decision'/'configuring'
          if (newData && 'status' in newData) {
            const newStatus = newData.status;
            // CRITICAL: Immediately fetch for any status change that affects UI flow
            if (newStatus === 'ante_decision' || newStatus === 'configuring' || newStatus === 'in_progress' || newStatus === 'game_selection' || newStatus === 'waiting' || newStatus === 'game_over' || newStatus === 'session_ended' || newStatus === 'cribbage_dealer_selection' || newStatus === 'dealer_selection') {
              console.log('[REALTIME] 🎮 STATUS CHANGED TO:', newStatus, '- IMMEDIATE FETCH!');
              if (newStatus === 'in_progress' || newStatus === 'ante_decision') {
                console.log('[GIN_RUNTIME_TIMELINE] realtime:games.status observed', { t: Date.now(), newStatus, oldStatus: game?.status ?? null });
              }

              // ── HANDOFF TRACE #4: game status transition ──
              emitCribbageHandoffTrace({
                gameId: gameId!,
                eventType: 'status_transition',
                userId: user?.id ?? null,
                context: {
                  oldStatus: game?.status ?? null,
                  newStatus,
                  dealerGameId: game?.current_game_uuid ?? null,
                  currentRoundId: currentRound?.id?.slice(0, 8) ?? null,
                  dealerSelectionCardsLen: dealerSelectionCards.length,
                  dealerSelectionCardIds: toDealerSelectionCardIds(dealerSelectionCards),
                  isCribbageDealerSelection: game?.status === 'cribbage_dealer_selection',
                  showAnteDialog,
                },
              });
              
              // CRITICAL FIX: Clear ALL card state when a new game is being set up.
              //
              // High-card flicker guard (Wartime FIX #2 Part A): when
              // transitioning INTO `dealer_selection`, an in-flight high-card
              // draw may already have populated `dealerSelectionCards` locally
              // (e.g. the host dealt and the non-host received the cards via
              // its own subscription before the games-row status change was
              // observed here). Wiping in that case produces the visible 2→0
              // disappearance attributed in the Wartime export. Preserve the
              // draw while: (a) entering dealer_selection, (b) cards already
              // present, (c) winner not yet determined. Other setup statuses
              // (ante_decision / configuring / game_selection) always clear,
              // because those are unambiguous fresh-game entries.
              const isFreshSetupStatus =
                newStatus === 'ante_decision' ||
                newStatus === 'configuring' ||
                newStatus === 'game_selection';
              const isDealerSelectionEntry = newStatus === 'dealer_selection';
              const liveCards = dealerSelectionCardsRef.current;
              const liveWinner = dealerSelectionWinnerPositionRef.current;
              const liveSyncedCards = dealerSelectionSyncedCardsRef.current;
              const hasInFlightHighCardDraw =
                isDealerSelectionEntry &&
                (liveCards.length > 0 || liveSyncedCards.length > 0);
              const shouldClearCardState =
                (isFreshSetupStatus || isDealerSelectionEntry) && !hasInFlightHighCardDraw;

              if (shouldClearCardState) {
                console.log('[REALTIME] 🧹 NEW GAME SETUP DETECTED - CLEARING ALL CARD STATE!');
                emit357ClearEvent('realtime_new_game_setup', 'realtime detected fresh setup status (game_selection/configuring/ante_decision/dealer_selection)', 3650);
                setPlayerCards([]);
                setCardStateContext(null);
                setCachedRoundData(null);
                cachedRoundRef.current = null;
                maxRevealedRef.current = 0;
                cardIdentityRef.current = '';
                showdownCardsCacheRef.current = new Map();
                showdownRoundNumberRef.current = null;
                communityCardsCacheRef.current = { cards: null, round: null, show: false };
                setCommunityCacheEpoch((e) => e + 1);
                recordWaitingLifecycle('dealerSelectionCards cleared', {
                  source: 'realtime-status-change',
                  callsite: 'src/pages/Game.tsx:~2365',
                  newStatus,
                  prevLength: liveCards.length,
                  syncedCardsLen: liveSyncedCards.length,
                  gameId: gameId ?? null,
                });
                recordHighCardCardsClear({
                  source: 'realtime-status-change',
                  callsite: 'src/pages/Game.tsx (setDealerSelectionCards([]))',
                  reason: `status transition to ${newStatus}`,
                  cardsLengthBeforeClear: liveCards.length,
                  cardsLengthAfterClear: 0,
                  gameStatus: newStatus,
                  winnerPosition: liveWinner ?? null,
                  dealerSelectionComplete: null,
                  currentRoundId: currentRound?.id ?? null,
                  dealerGameId: (game as any)?.current_game_uuid ?? null,
                  gameId: gameId ?? null,
                });
                recordHighCardWriter({
                  gameId: gameId ?? '',
                  source: 'reset-path',
                  callsite: 'src/pages/Game.tsx realtime-status-change setDealerSelectionCards([])',
                  reason: `realtime status transition to ${newStatus} cleared dealerSelectionCards`,
                  previousLength: liveCards.length,
                  nextLength: 0,
                  previousCardIds: liveCards.map(c => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
                  nextCardIds: [],
                  renderPath: null,
                  surfaceInstanceId: `Game.tsx:setDealerSelectionCards:${gameId ?? ''}`,
                  winnerPosition: liveWinner ?? null,
                  isComplete: null,
                  extra: { newStatus, trigger: 'realtime-status-change', syncedCardsLen: liveSyncedCards.length },
                });
                setDealerSelectionCards([]);
                setDealerSelectionWinnerPosition(null);

                emitCribbageHandoffTrace({
                  gameId: gameId!,
                  eventType: 'parent_ds_cleared',
                  userId: user?.id ?? null,
                  context: { trigger: 'realtime_status_change', newStatus },
                });
              } else if (hasInFlightHighCardDraw) {
                // Guard fired: announce the suppression so Wartime exports
                // show why no clear was emitted at this boundary (and there
                // is no unattributed mutation to chase).
                recordHighCardWriter({
                  gameId: gameId ?? '',
                  source: 'reset-path',
                  callsite: 'src/pages/Game.tsx high-card-clear-guard SKIPPED',
                  reason: 'in-flight high-card draw preserved across dealer_selection transition',
                  previousLength: liveCards.length,
                  nextLength: liveCards.length,
                  previousCardIds: liveCards.map(c => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
                  nextCardIds: liveCards.map(c => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
                  renderPath: null,
                  surfaceInstanceId: `Game.tsx:setDealerSelectionCards:${gameId ?? ''}`,
                  winnerPosition: liveWinner ?? null,
                  isComplete: null,
                  extra: { newStatus, trigger: 'realtime-status-change', guard: 'skip-clear', syncedCardsLen: liveSyncedCards.length },
                });
              }
              
               // (Bug A fix moved to handleCribbageDealerSelectionComplete callback)
              
              if (debounceTimer) clearTimeout(debounceTimer);
              fetchGameData();
              // NOTE: Removed redundant 300ms setTimeout refetch - it was causing excessive queries
              handled = true;
            }
          }
          
          // Handle awaiting_next_round changes (for round transitions within a game)
          if (!handled && newData && 'awaiting_next_round' in newData) {
            if (newData.awaiting_next_round === true) {
              console.log('[REALTIME] ⚡⚡⚡ AWAITING DETECTED - IMMEDIATE FETCH! ⚡⚡⚡');
              // ── H1R3 → H2R1 targeted trace: completion boundary.
              try {
                const isThreeFiveSeven = (game as any)?.game_type === '3-5-7';
                const prevHand = (game as any)?.total_hands ?? null;
                const prevRound = (game as any)?.current_round ?? null;
                const nextHand = (newData as any)?.total_hands ?? prevHand;
                const nextRoundNum = (newData as any)?.next_round_number ?? null;
                if (isThreeFiveSeven && prevHand === 1 && prevRound === 3) {
                  void (async () => {
                    const mod = await import('@/lib/threeFiveSeven/wartime/h1r3ToH2r1');
                    const sites = await import('@/lib/threeFiveSeven/wartime/sourceSites');
                    mod.noteH1r3CompletionObserved((game as any)?.current_game_uuid ?? null);
                    mod.emitH1r3ToH2r1({
                      eventName: 'h1r3.completion_observed',
                      sourceSiteId: sites.SRC.H1R3_COMPLETION_OBSERVED.id,
                      identity: {
                        gameId: (game as any)?.id ?? null,
                        dealerGameId: (game as any)?.current_game_uuid ?? null,
                        handNumber: prevHand, roundNumber: prevRound,
                        currentGameUuid: (game as any)?.current_game_uuid ?? null,
                        currentRoundStatus: 'awaiting_next_round',
                      },
                      payload: {
                        expectedNextHand: nextHand, expectedNextRoundNumber: nextRoundNum,
                        canonicalProgressionCaller: 'Game.rounds_realtime.awaiting_next_round=true',
                        playerHandCounts: (players ?? []).map((p: any) => ({
                          playerId: p.id, position: p.position,
                          cardCount: (playerCards ?? []).find((pc: any) => pc.player_id === p.id)?.cards?.length ?? 0,
                        })),
                      },
                      forceEmit: true,
                    });
                  })();
                }
              } catch { /* fire-and-forget */ }
            } else {
              console.log('[REALTIME] ⚡⚡⚡ AWAITING CLEARED (new hand starting) - FETCH ONLY, DON\'T CLEAR CACHE YET! ⚡⚡⚡');
              // CRITICAL FIX: Do NOT clear cache here - clearing before fetch completes causes card disappearance
              // The cache will be cleared naturally when new round data arrives and is validated as different
              // setCardStateContext, setCachedRoundData, maxRevealedRef are updated elsewhere when new cards arrive
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Handle pause state changes
          if (!handled && newData && 'is_paused' in newData) {
            // Immediately update local game state for pause - don't wait for fetch
            console.log('[REALTIME] ⏸️ PAUSE STATE CHANGED - IMMEDIATE LOCAL UPDATE!', newData.is_paused, 'remaining:', newData.paused_time_remaining);
            
            // CRITICAL: Update ref and clear interval SYNCHRONOUSLY before React render cycle
            isPausedRef.current = newData.is_paused;
            if (newData.is_paused && timerIntervalRef.current) {
              console.log('[REALTIME] ⏸️ Clearing timer interval synchronously on pause');
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            
            setGame(prev => prev ? {
              ...prev,
              is_paused: newData.is_paused,
              paused_time_remaining: newData.paused_time_remaining
            } : prev);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Handle pot changes
          if (!handled && newData && 'pot' in newData) {
            // CRITICAL: Pot changes need immediate sync for all players
            console.log('[REALTIME] 💰 POT CHANGED - IMMEDIATE FETCH!', newData.pot);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Handle dealer selection state changes - immediate sync for all players
          if (!handled && newData && 'dealer_selection_state' in newData) {
            console.log('[REALTIME] 🎯 DEALER SELECTION STATE CHANGED - IMMEDIATE UPDATE!');
            // ── WRITER ATTRIBUTION: realtime patch into game.dealer_selection_state ──
            // This is the indirect writer that feeds useHighCardDealerSelection's
            // syncedState. When newData.dealer_selection_state is null OR carries
            // cards:[], the downstream non-host effect mirrors that into the
            // visible cards array. Captured here at the actual mutation point.
            try {
              const prevDss: any = (game as any)?.dealer_selection_state ?? null;
              const nextDss: any = (newData as any).dealer_selection_state ?? null;
              const prevCards: any[] = Array.isArray(prevDss?.cards) ? prevDss.cards : [];
              const nextCards: any[] = Array.isArray(nextDss?.cards) ? nextDss.cards : [];
              recordHighCardWriter({
                gameId: gameId ?? '',
                source: 'setGame-dealer-selection-state-realtime',
                callsite: 'src/pages/Game.tsx:2534 realtime setGame(dealer_selection_state)',
                reason: nextDss === null
                  ? 'realtime delivered dealer_selection_state=null (clears synced cards)'
                  : `realtime delivered dealer_selection_state with ${nextCards.length} cards`,
                previousLength: prevCards.length,
                nextLength: nextCards.length,
                previousCardIds: prevCards.map((c: any) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
                nextCardIds: nextCards.map((c: any) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
                renderPath: 'indirect-setGame',
                surfaceInstanceId: `Game.tsx:setGame.dealer_selection_state:${gameId ?? ''}`,
                winnerPosition: nextDss?.winnerPosition ?? null,
                isComplete: nextDss?.isComplete ?? null,
                extra: {
                  prevDssNull: prevDss === null,
                  nextDssNull: nextDss === null,
                  prevAnnouncement: prevDss?.announcement ?? null,
                  nextAnnouncement: nextDss?.announcement ?? null,
                },
              });
            } catch (_) { /* trace must never throw */ }
            // Direct optimistic update without full fetch for responsiveness
            setGame(prev => prev ? {
              ...prev,
              dealer_selection_state: newData.dealer_selection_state
            } : prev);
            handled = true;
          }
          
          // Fallback to debounced fetch if nothing else handled
          if (!handled) {
            console.log('[REALTIME] No specific trigger, using debounced fetch');
            debouncedFetch();
          }
          },
        }))
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'games',
        },
        simulateRealtime('games', __wrapWartimeRealtimeCausality({
          channelLabel: `game-${gameId}:games-delete`,
          table: 'games',
          identity: () => ({ gameId, dealerGameId: null, roundId: null }),
          handler: (payload: any) => {
            // DELETE events are intentionally unfiltered: Realtime only has
            // the old row at this boundary. The games table uses REPLICA
            // IDENTITY FULL, and this exact identity check keeps every other
            // mounted game route inert.
            if ((payload.old as { id?: string } | null)?.id !== gameId) return;
            if (missingGameHandledRef.current) return;

            missingGameHandledRef.current = true;
            recordTerminalRecovery('kick-or-removal', {
              gameId,
              source: 'games-delete-realtime',
            });
            releaseRecoveryLease('kick-or-removal', {
              gameId,
              source: 'games-delete-realtime',
            });
            toast({
              title: 'Session removed',
              description: 'This session was removed by an administrator.',
              duration: 3000,
            });
            navigate('/', { replace: true });
          },
        }))
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`
        },
        simulateRealtime('players', __wrapWartimeRealtimeCausality({
          channelLabel: `game-${gameId}:players`,
          table: 'players',
          identity: () => ({ gameId, dealerGameId: (game as any)?.current_game_uuid ?? null, roundId: currentRound?.id ?? null }),
          handler: (payload: any) => {
          recordStartupFlight('REALTIME TIMELINE', 'players callback fired / payload received', {
            file: 'src/pages/Game.tsx',
            function: 'players realtime callback',
            table: 'players',
            row: (payload.new as any)?.id ?? (payload.old as any)?.id ?? null,
            eventType: payload.eventType,
            oldValue: {
              ante_decision: (payload.old as any)?.ante_decision ?? null,
              sitting_out: (payload.old as any)?.sitting_out ?? null,
              status: (payload.old as any)?.status ?? null,
            },
            newValue: {
              ante_decision: (payload.new as any)?.ante_decision ?? null,
              sitting_out: (payload.new as any)?.sitting_out ?? null,
              status: (payload.new as any)?.status ?? null,
              is_bot: (payload.new as any)?.is_bot ?? null,
              position: (payload.new as any)?.position ?? null,
            },
            statusBefore: game?.status ?? null,
            statusAfter: game?.status ?? null,
          });
          console.log('[REALTIME] Players table changed:', payload.eventType, payload);
          
          // CRITICAL: Immediate fetch for INSERT (new player joined) - essential for PreGameLobby
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            console.log('[REALTIME] 👤 PLAYER JOINED/LEFT - IMMEDIATE FETCH!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            return;
          }
          
          // Immediate fetch when ante_decision changes (critical for ante dialog)
          if (payload.new && 'ante_decision' in payload.new) {
            logDebugEvent({
              gameId: gameId!,
              userId: user?.id ?? null,
              eventType: 'ante_realtime_update',
              payload: {
                changedPlayerId: (payload.new as any).id ?? null,
                newAnteDecision: (payload.new as any).ante_decision ?? null,
                oldAnteDecision: (payload.old as any)?.ante_decision ?? null,
                showAnteDialog,
                gameStatus: game?.status ?? null,
              },
            });
            console.log('[REALTIME] 🎲 ANTE DECISION CHANGED - IMMEDIATE FETCH!', payload.new.ante_decision);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else if (payload.new && 'sitting_out' in payload.new && payload.new.sitting_out === false) {
            // CRITICAL: Player just became active (anted up) - immediate fetch for cards
            console.log('[REALTIME] 🎮 PLAYER BECAME ACTIVE - IMMEDIATE FETCH FOR CARDS!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            // NOTE: Removed redundant 1s setTimeout refetch - it was causing excessive queries
          } else {
            debouncedFetch();
          }
          },
        }))
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        simulateRealtime('rounds', __wrapWartimeRealtimeCausality({
          channelLabel: `game-${gameId}:rounds`,
          table: 'rounds',
          identity: () => ({ gameId, dealerGameId: (game as any)?.current_game_uuid ?? null, roundId: currentRound?.id ?? null }),
          handler: (payload: any) => {
          recordStartupFlight('REALTIME TIMELINE', 'rounds callback fired / payload received', {
            file: 'src/pages/Game.tsx',
            function: 'rounds realtime callback',
            table: 'rounds',
            row: (payload.new as any)?.id ?? (payload.old as any)?.id ?? null,
            eventType: payload.eventType,
            oldValue: {
              roundId: (payload.old as any)?.id ?? null,
              dealer_game_id: (payload.old as any)?.dealer_game_id ?? null,
              hand_number: (payload.old as any)?.hand_number ?? null,
              hasGinRummyState: !!(payload.old as any)?.gin_rummy_state,
            },
            newValue: {
              roundId: (payload.new as any)?.id ?? null,
              dealer_game_id: (payload.new as any)?.dealer_game_id ?? null,
              hand_number: (payload.new as any)?.hand_number ?? null,
              round_number: (payload.new as any)?.round_number ?? null,
              status: (payload.new as any)?.status ?? null,
              hasGinRummyState: !!(payload.new as any)?.gin_rummy_state,
            },
            statusBefore: game?.status ?? null,
            statusAfter: game?.status ?? null,
          });
          console.log('[REALTIME] *** ROUNDS TABLE CHANGED ***', payload);
          ginTrace('realtime.rounds payload received', {
            eventType: payload.eventType,
            roundId: (payload.new as any)?.id?.slice(0, 8) ?? null,
            dealer_game_id: (payload.new as any)?.dealer_game_id?.slice(0, 8) ?? null,
            hand_number: (payload.new as any)?.hand_number ?? null,
            hasGinState: !!(payload.new as any)?.gin_rummy_state,
          });

          // If horses_state, yahtzee_state, or gin_rummy_state changed, patch it into
          // local state immediately so animations / UI start as soon as the realtime
          // event arrives (no waiting on fetchGameData).
          if (payload.eventType === 'UPDATE' && payload.new &&
              ('horses_state' in (payload.new as any) ||
               'yahtzee_state' in (payload.new as any) ||
               'gin_rummy_state' in (payload.new as any))) {
            applyRoundRealtimePatch(payload.new);
            // Still refetch (debounced) to keep the rest of the game state consistent.
            debouncedFetch();
            return;
          }

          // INSERT: for Gin Rummy, the realtime payload is fully authoritative
          // (gin_rummy_state + dealer_game_id + hand_number). Patch it into rounds
          // immediately so currentRound becomes non-null without a fetchGameData
          // round-trip blocking startup. Other game types still need the fetch.
          if (payload.eventType === 'INSERT') {
            const isGinInsert = !!(payload.new as any)?.gin_rummy_state;
            if (isGinInsert) {
              ginTrace('rounds.insert applied via realtime patch (no fetch)');
              applyRoundRealtimePatch(payload.new);
              // Off-critical: reconcile the rest of game state in the background.
              debouncedFetch();
              return;
            }
            console.log('[REALTIME] 🎴 NEW ROUND INSERTED - Immediate fetch for all clients!');
            // P0 pre-decision contract: synchronously stamp the
            // authoritative turn ref BEFORE React state scheduling.
            {
              const n: any = payload.new;
              const previousCurrentTurnPosition = null;
              if (game?.game_type === 'holm-game') {
                recordHolmTrace('TURN_AUTHORITY_ARRIVAL', `realtime INSERT turn=${n?.current_turn_position ?? 'null'}`,
                  buildHolmTurnAuthorityTraceDetail({
                    source: 'realtime INSERT',
                    round: n as Partial<Round>,
                    players: playersRef.current,
                    previousCurrentTurnPosition,
                  }),
                );
              }
              authoritativeTurnEpochRef.current += 1;
              latestAuthoritativeTurnRef.current = {
                roundId: n?.id ?? null,
                handNumber: (n && 'hand_number' in n) ? (n.hand_number ?? null) : null,
                currentTurnPosition: (n && 'current_turn_position' in n) ? (n.current_turn_position ?? null) : null,
                epoch: authoritativeTurnEpochRef.current,
              };
              setHolmAuthorityTick(t => t + 1);
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else if (payload.eventType === 'UPDATE' && payload.new && 'current_turn_position' in payload.new) {
            console.log('[REALTIME] Turn change detected! Immediately fetching without debounce');
            // P0 pre-decision contract: synchronously stamp authoritative
            // turn ref BEFORE React state scheduling (closes the
            // click-at-boundary race window).
            {
              const n: any = payload.new;
              const o: any = payload.old;
              const previousCurrentTurnPosition = ('current_turn_position' in (o ?? {}))
                ? (o?.current_turn_position ?? null)
                : (latestAuthoritativeTurnRef.current?.roundId === n?.id
                  ? latestAuthoritativeTurnRef.current?.currentTurnPosition ?? null
                  : null);
              if (game?.game_type === 'holm-game') {
                recordHolmTrace('TURN_AUTHORITY_ARRIVAL', `realtime UPDATE turn=${previousCurrentTurnPosition ?? 'null'}→${n?.current_turn_position ?? 'null'}`,
                  buildHolmTurnAuthorityTraceDetail({
                    source: 'realtime UPDATE',
                    round: n as Partial<Round>,
                    players: playersRef.current,
                    previousCurrentTurnPosition,
                  }),
                );
              }
              authoritativeTurnEpochRef.current += 1;
              latestAuthoritativeTurnRef.current = {
                roundId: n?.id ?? null,
                handNumber: (n && 'hand_number' in n) ? (n.hand_number ?? null) : (latestAuthoritativeTurnRef.current?.roundId === n?.id ? latestAuthoritativeTurnRef.current?.handNumber ?? null : null),
                currentTurnPosition: n?.current_turn_position ?? null,
                epoch: authoritativeTurnEpochRef.current,
              };
              setHolmAuthorityTick(t => t + 1);
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else {
            console.log('[REALTIME] Other round change, using debounced fetch');
            debouncedFetch();
          }
          },
        }))
      )
      .subscribe((status) => {
        console.log('[SUBSCRIPTION] Status:', status);
        recordStartupFlight('REALTIME TIMELINE', 'subscription status', {
          file: 'src/pages/Game.tsx',
          function: 'realtime subscription status callback',
          channel: `game-${gameId}`,
          oldValue: null,
          newValue: status,
        });

        // Expose latest realtime transport status for diagnostic emitters
        // (read by the Cribbage interaction-gate blocked event, etc.).
        setRealtimeStatus(status);

        // When realtime drops, keep the UI in sync via polling instead of "freezing".
        if (status === 'SUBSCRIBED') {
          stopFallbackPolling();
          // The first SUBSCRIBED edge closes the cold-mount blind window. A
          // Close the fetch-before-subscribe blind window with one full
          // authoritative snapshot. This must be owned here rather than by the
          // auth-gated resume effect: a player INSERT can land after the cold
          // fetch but before this channel becomes SUBSCRIBED, and that effect
          // may not be mounted yet. Keep the event for non-fetch reconnect
          // drains (for example the Holm bot scheduler).
          void fetchGameData('realtime_reconnect').catch((error) => {
            console.warn('[SUBSCRIPTION] Authoritative catch-up failed:', error);
          });
          try {
            window.dispatchEvent(new CustomEvent('app:realtime-reconnect'));
          } catch { /* noop */ }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[SUBSCRIPTION] Realtime issue; enabling fallback polling:', status);
          startFallbackPolling();
        }
      });

    return () => {
      console.log('[SUBSCRIPTION] Cleaning up subscriptions');
      if (debounceTimer) clearTimeout(debounceTimer);
      stopFallbackPolling();
      supabase.removeChannel(channel);
    };
    // Depend on gameId only so the subscription is established immediately
    // on route entry. User identity is not needed for the public game/player
    // snapshot; tearing down the channel when `user` changes would re-cost
    // ~2s of subscription handshake on every auth-state flip.
  }, [gameId]);

  // AUTO-RESYNC ON RESUME: When the user returns to the tab (iOS BFCache, tab switch, app resume),
  // immediately refetch game data and clear stale caches if the backend shows a different state.
  // This prevents the "stuck in-progress UI" when the user was away and the game transitioned.
  //
  // Client resume hydration contract (Cribbage identity lock repro):
  //   • On visibility → visible while status is `in_progress`, always trigger an
  //     authoritative fetchGameData() so `game.rounds` / `current_game_uuid` /
  //     `currentRound` cannot render as null over an already-valid in-progress
  //     identity.
  //   • Same-scope preservation for the render branch is done via
  //     `lastValidCribbageIdentityRef` (see Cribbage render branch below).
  //   • A single in-flight guard prevents concurrent refreshes fired by
  //     overlapping visibility / focus / pageshow signals. Realtime SUBSCRIBED
  //     catch-up is owned directly by the subscription effect above.
  const resyncInFlightRef = useRef<boolean>(false);
  useEffect(() => {
    if (!gameId || !user) return;

    let lastResyncTime = 0;
    const RESYNC_DEBOUNCE_MS = 1000; // Don't resync more than once per second

    const handleResync = async (source: 'visibility' | 'focus' | 'pageshow') => {
      const now = Date.now();
      if (now - lastResyncTime < RESYNC_DEBOUNCE_MS) return;
      if (resyncInFlightRef.current) return;
      lastResyncTime = now;
      resyncInFlightRef.current = true;

      try {
        console.log('[AUTO-RESYNC] Tab visible/focused - checking for stale state', { source });

        // Fetch fresh game status from DB
        const { data: freshGame, error } = await supabase
          .from('games')
          .select('status, current_round, game_type, awaiting_next_round, current_game_uuid')
          .eq('id', gameId)
          .single();

        if (error || !freshGame) {
          console.warn('[AUTO-RESYNC] Failed to fetch fresh game state:', error);
          return;
        }

        const localStatus = game?.status;
        const localRound = game?.current_round;
        const localGameType = game?.game_type;
        const localDealerGameId = (game as any)?.current_game_uuid ?? null;

        // Detect if backend state diverged significantly from local state
        const statusChanged = localStatus !== freshGame.status;
        const roundChanged = localRound !== freshGame.current_round;
        const gameTypeChanged = localGameType !== freshGame.game_type;
        const dealerGameChanged = localDealerGameId !== (freshGame as any).current_game_uuid;
        const isWaitingOrConfig = ['waiting', 'game_selection', 'configuring', 'dealer_selection', 'session_ended'].includes(freshGame.status);
        // Always rehydrate authoritative identity for an in-progress game on
        // resume. This is the fix for the Cribbage client-resume hydration
        // defect where parent identity (dealerGameId / currentRoundId) could
        // resume as null over an already-valid in-progress identity.
        const forceRehydrateInProgress = freshGame.status === 'in_progress';

        console.log('[AUTO-RESYNC] State comparison:', {
          local: { status: localStatus, round: localRound, gameType: localGameType, dealerGameId: localDealerGameId },
          fresh: freshGame,
          statusChanged,
          roundChanged,
          gameTypeChanged,
          dealerGameChanged,
          isWaitingOrConfig,
          forceRehydrateInProgress,
          source,
        });

        if (statusChanged || roundChanged || gameTypeChanged || dealerGameChanged || forceRehydrateInProgress) {
          console.log('[AUTO-RESYNC] 🔄 Refetching and clearing caches if needed');

          // If backend is in waiting/config phase but UI shows in-progress, clear all stale game state
          if (isWaitingOrConfig) {
            console.log('[AUTO-RESYNC] 🧹 Backend in setup phase - clearing all card/round caches');
            clearLiftedCardCaches('AUTO-RESYNC (backend in setup)', { freshGame });
            setCachedRoundData(null);
            cachedRoundRef.current = null;
            emit357ClearEvent('auto_resync_backend_setup', 'AUTO-RESYNC found backend in waiting/config while UI showed in_progress', 4141);
            setPlayerCards([]);
            setCardStateContext(null);
            maxRevealedRef.current = 0;
            cardIdentityRef.current = '';
            lastKnownGameTypeRef.current = freshGame.game_type ?? null;
            lastKnownRoundRef.current = null;
          }

          // Force full refetch (rehydrates games row + rounds → currentRound).
          await fetchGameData(source);
        }
      } finally {
        resyncInFlightRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markVisibilityResume();
        void handleResync('visibility');
      }
    };

    const handleWindowFocus = () => {
      void handleResync('focus');
    };

    // iOS Safari pageshow event (for BFCache restores)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log('[AUTO-RESYNC] BFCache restore detected - forcing resync');
        markVisibilityResume();
        void handleResync('pageshow');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow as EventListener);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow as EventListener);
    };
  }, [gameId, user?.id, game?.status, game?.current_round, game?.game_type, clearLiftedCardCaches]);

  // NOTE: Duplicate rounds subscription was REMOVED to reduce query volume.
  // The main `game-${gameId}` channel already listens to rounds table changes (lines 1155-1188).
  // Having two channels caused every round event to trigger fetchGameData twice.

  // Broadcast channel for ephemeral UI events (like "Show Cards" in 3-5-7)
  const showCardsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Track current hand number for show-cards validation
  const currentHandNumberRef = useRef<number | null>(null);
  useEffect(() => {
    currentHandNumberRef.current = game?.total_hands ?? null;
  }, [game?.total_hands]);
  
  useEffect(() => {
    if (!gameId) return;
    
    console.log('[BROADCAST] Setting up show-cards channel');
    const channel = supabase
      .channel(`show-cards-${gameId}`)
      .on('broadcast', { event: 'show-cards' }, __wrapWartimeRealtimeCausality({
        channelLabel: `show-cards-${gameId}`,
        table: null,
        sourceSiteId: __WARTIME_SRC.REALTIME_SHOW_CARDS.id,
        identity: () => __wartimeLiveGameIdentity(),
        handler: (payload: any) => {
        const callbackOwnerId = __trackWartimeAsyncOwner({
          ownerLabel: 'game.showCardsBroadcast.callback',
          kind: 'realtime_callback',
          sourceSiteId: __WARTIME_SRC.ASYNC_GAME_SHOW_CARDS_CALLBACK.id,
          identity: __wartimeLiveGameIdentity(),
          owner: __wartimeGameOwner,
          extra: {
            topic: `show-cards-${gameId}`,
            currentDealerGameId: game?.current_game_uuid ?? null,
            currentRoundId: currentRoundLateRef.current?.id ?? null,
            currentRoundNumber: game?.current_round ?? null,
            handContextId: cardStateContext?.roundId ?? null,
            terminalOrCrossDealer: game?.status === 'game_over' || game?.status === 'session_ended',
          },
        });
        // Only accept show-cards for the CURRENT game (using current_game_uuid) to prevent carryover
        const payloadGameUuid = (payload.payload as any)?.currentGameUuid;
        const currentGameUuid = game?.current_game_uuid;
        const payloadMatchedActiveIdentity = !(payloadGameUuid && currentGameUuid && payloadGameUuid !== currentGameUuid);

        __emitWartimeAsyncOwnerFired({
          asyncOwnerId: callbackOwnerId,
          outcome: payloadMatchedActiveIdentity ? 'fired' : 'suppressed',
          sourceSiteId: __WARTIME_SRC.ASYNC_GAME_SHOW_CARDS_CALLBACK.id,
          identity: __wartimeLiveGameIdentity(),
          liveIdentity: __wartimeLiveGameIdentity(),
          identityMatch: payloadMatchedActiveIdentity,
          suppressionReason: payloadMatchedActiveIdentity ? null : 'stale_show_cards_payload',
          extra: {
            topic: `show-cards-${gameId}`,
            payloadDealerGameId: payloadGameUuid ?? null,
            currentDealerGameId: currentGameUuid ?? null,
            roundId: currentRoundLateRef.current?.id ?? null,
            handContextId: cardStateContext?.roundId ?? null,
            firedAfterTerminalSettlement: game?.status === 'game_over' || game?.status === 'session_ended',
            firedDuringAnotherDealerGame: !payloadMatchedActiveIdentity,
            resultingShowCardsState: payloadMatchedActiveIdentity ? true : winner357ShowCards,
          },
        });
        
        if (payloadGameUuid && currentGameUuid && payloadGameUuid !== currentGameUuid) {
          console.log('[BROADCAST] Ignoring stale show-cards event from different game');
          return;
        }
        
        console.log('[BROADCAST] Received show-cards event for game', payloadGameUuid);
        __emitWartime({
          eventName: 'state_write',
          sourceSiteId: __WARTIME_SRC.STATE_SHOW_CARDS_GAME.id,
          identity: __wartimeLiveGameIdentity(),
          owner: __wartimeGameOwner,
          payload: {
            fieldName: 'winner357ShowCards',
            previous: winner357ShowCards,
            next: true,
            writer: 'show-cards broadcast callback',
            channelTopic: `show-cards-${gameId}`,
            payloadMatchedActiveIdentity,
          },
        });
        setWinner357ShowCards(true);
        },
      }))
      .subscribe();
    
    showCardsChannelRef.current = channel;
    
    return () => {
      console.log('[BROADCAST] Cleaning up show-cards channel');
      supabase.removeChannel(channel);
      showCardsChannelRef.current = null;
    };
  }, [gameId]);
  
  // Handler for winner to broadcast "show cards" and persist to database
  const handleWinner357ShowCards = useCallback(async () => {
    const currentGameUuid = game?.current_game_uuid;
    console.log('[BROADCAST] Sending show-cards event for game', currentGameUuid);
    try {
      emit357RuntimeDiag('show_cards_click_received', {
        gameId,
        dealerGameId: currentGameUuid ?? null,
        roundId: null,
        viewerPlayerId: user?.id ?? null,
      }, {
        previousConsent: winner357ShowCards,
        gameStatus: game?.status ?? null,
        awaitingNextRound: game?.awaiting_next_round ?? null,
        currentRound: game?.current_round ?? null,
        hasWinnerCards: (threeFiveSevenWinnerCards?.length ?? 0) > 0,
        winnerCardCount: threeFiveSevenWinnerCards?.length ?? 0,
      });
    } catch { /* noop */ }
    const currentPlayer = players.find(p => p.user_id === user?.id);
    const handNumber = game?.total_hands ?? null;
    if (!currentPlayer || !currentGameUuid || handNumber == null) {
      console.error('[SHOW_CARDS] Missing exact terminal identity');
      return;
    }
    const { data: terminalRound, error: terminalRoundError } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId)
      .eq('dealer_game_id', currentGameUuid)
      .eq('hand_number', handNumber)
      .eq('status', 'completed')
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (terminalRoundError || !terminalRound) {
      console.error('[SHOW_CARDS] Exact terminal round unavailable:', terminalRoundError);
      return;
    }
    const { error: revealError } = await supabase.rpc(
      'three_five_seven_reveal_terminal_cards' as any,
      {
        p_game_id: gameId,
        p_round_id: terminalRound.id,
        p_dealer_game_id: currentGameUuid,
        p_hand_number: handNumber,
        p_player_id: currentPlayer.id,
      } as any,
    );
    if (revealError) {
      console.error('[SHOW_CARDS] Authoritative reveal failed:', revealError);
      return;
    }
    setWinner357ShowCards(true);
    await showCardsChannelRef.current?.send({
      type: 'broadcast',
      event: 'show-cards',
      payload: {
        timestamp: Date.now(),
        currentGameUuid,
        roundId: terminalRound.id,
        handNumber,
      },
    });
  }, [game?.current_game_uuid, game?.total_hands, gameId, players, user?.id, winner357ShowCards, game?.status, game?.awaiting_next_round, game?.current_round, threeFiveSevenWinnerCards]);
  
  // Reset winner357ShowCards when game transitions away from game_over OR when a new hand starts
  useEffect(() => {
    if (game?.status !== 'game_over' && game?.status !== 'in_progress') {
      if (winner357ShowCards) {
        console.log('[RESET] Clearing winner357ShowCards on game status change');
        try {
          emit357RuntimeDiag('show_cards_consent_reset', {
            gameId,
            dealerGameId: game?.current_game_uuid ?? null,
            viewerPlayerId: user?.id ?? null,
          }, { reason: 'game_status_change', gameStatus: game?.status ?? null });
        } catch { /* noop */ }
        setWinner357ShowCards(false);
      }
    }
  }, [game?.status, winner357ShowCards, gameId, game?.current_game_uuid, user?.id]);
  
  // Reset winner357ShowCards when a new hand starts (awaiting_next_round transitions to false = hand is starting)
  const prevAwaitingNextRoundRef = useRef<boolean | null>(null);
  useEffect(() => {
    const wasAwaiting = prevAwaitingNextRoundRef.current;
    const isAwaiting = game?.awaiting_next_round ?? false;
    prevAwaitingNextRoundRef.current = isAwaiting;
    
    // When transitioning from awaiting_next_round=true to false, a new hand is starting
    if (wasAwaiting === true && isAwaiting === false) {
      if (winner357ShowCards) {
        console.log('[RESET] Clearing winner357ShowCards on new hand start');
        try {
          emit357RuntimeDiag('show_cards_consent_reset', {
            gameId,
            dealerGameId: game?.current_game_uuid ?? null,
            viewerPlayerId: user?.id ?? null,
          }, { reason: 'awaiting_next_round_transition' });
        } catch { /* noop */ }
        setWinner357ShowCards(false);
      }
    }
  }, [game?.awaiting_next_round, winner357ShowCards, gameId, game?.current_game_uuid, user?.id]);

  // SAFETY-NET POLL: Check for game_over status when stuck in awaiting_next_round
  // This catches cases where realtime subscription misses the status update
  useEffect(() => {
    if (!gameId || !game) return;

    if (safetyPollsDisabled) return;
    
    // Only poll when we think we're in_progress with awaiting_next_round
    // but might actually be game_over
    if (game.status !== 'in_progress' || !game.awaiting_next_round) {
      return;
    }
    
    console.log('[SAFETY POLL] Game in awaiting_next_round state, setting up safety poll');
    
    const safetyPoll = __scheduleWartimeInterval({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_STATUS_POLL.id,
      ownerLabel: 'game.awaitingNextRound.statusPoll',
      intervalMs: 2000,
      extra: {
        purpose: 'detect missed game_over while awaiting_next_round',
        guard_gameStatus: game.status,
        guard_awaitingNextRound: game.awaiting_next_round,
      },
      fn: async (asyncOwnerId, tickNumber) => {
      console.log('[SAFETY POLL] Checking if game status changed to game_over...');
      const { data: freshGame, error } = await supabase
        .from('games')
        .select('status')
        .eq('id', gameId)
        .single();
      
      if (!error && freshGame) {
        if (freshGame.status === 'game_over' || freshGame.status === 'session_ended') {
          console.log('[SAFETY POLL] 🚨 DETECTED STATUS CHANGE TO:', freshGame.status, '- FETCHING!');
          fetchGameData();
          // Clear interval since we caught it
          __emitWartimeAsyncOwnerFired({
            asyncOwnerId,
            outcome: 'cancelled',
            sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_STATUS_POLL.id,
            identity: __wartimeLiveGameIdentity(),
            liveIdentity: __wartimeLiveGameIdentity(),
            suppressionReason: 'game_over_detected',
            extra: { tickNumber, freshStatus: freshGame.status },
          });
          __cancelWartimeAsyncOwner(safetyPoll as unknown as number, 'game_over_detected');
          clearInterval(safetyPoll);
        }
      }
      },
    }); // Check every 2 seconds
    
    return () => {
      __cancelWartimeAsyncOwner(safetyPoll as unknown as number, 'effect_cleanup');
      clearInterval(safetyPoll);
    };
  }, [gameId, game?.status, game?.awaiting_next_round, __cancelWartimeAsyncOwner, __scheduleWartimeInterval, __wartimeLiveGameIdentity]);

  // Update pause ref and clear timer when paused
  
  // Update pause ref and clear timer when paused
  useEffect(() => {
    isPausedRef.current = game?.is_paused;
    // If just paused, immediately clear the timer interval
    if (game?.is_paused && timerIntervalRef.current) {
      console.log('[TIMER COUNTDOWN] Pause detected - clearing interval immediately');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [game?.is_paused]);

  // Fallback polling for pause state - ensures observers get pause updates even if realtime fails
  useEffect(() => {
    if (!gameId) return;

    if (safetyPollsDisabled) return;
    
    const pollPauseState = async () => {
      const { data } = await supabase
        .from('games')
        .select('is_paused, paused_time_remaining')
        .eq('id', gameId)
        .single();
      
      if (data && data.is_paused !== isPausedRef.current) {
        console.log('[PAUSE POLL] Pause state mismatch detected! DB:', data.is_paused, 'Local:', isPausedRef.current);
        isPausedRef.current = data.is_paused;
        if (data.is_paused && timerIntervalRef.current) {
          console.log('[PAUSE POLL] Clearing timer interval');
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        // Update game state
        setGame(prev => prev ? { ...prev, is_paused: data.is_paused, paused_time_remaining: data.paused_time_remaining } : prev);
      }
    };
    
    // Poll every 2 seconds as fallback
    const pollInterval = setInterval(pollPauseState, 2000);
    return () => clearInterval(pollInterval);
  }, [gameId]);

  // Simple state tracking refs - no aggressive polling
  const lastSyncedRoundRef = useRef<string | null>(null);

  // Handle paused time display separately from interval management
  useEffect(() => {
    if (game?.is_paused && game.paused_time_remaining !== null && game.paused_time_remaining !== undefined) {
      setTimeLeft(game.paused_time_remaining);
    }
  }, [game?.is_paused, game?.paused_time_remaining]);

  // Server-driven timer countdown - uses ref for pause state to avoid dependency issues
  // CARD GAMES ONLY: Players with auto_fold=true should NOT see a timer - they fold instantly
  useEffect(() => {
    // No-Timers harness: suppress decision countdown surface + ticking.
    if (isNoTimersEnabledCached()) {
      decisionMaxTimeDeadlineRef.current = null;
      setDecisionMaxTime(null);
      setDecisionTimerPresentation(null);
      setTimeLeft(null);
      return;
    }
    const is357TimerBlocked =
      game?.game_type === '3-5-7' ||
      game?.game_type === '3-5-7-game' ||
      game?.game_type === '357'
        ? !dealTimerAllowed357
        : false;
    if (is357TimerBlocked) {
      record357DiagnosticViolation('357_TIMER_TICK_DURING_DEAL_BLOCKED', {
        component: 'Game timer countdown',
        decisionDeadline,
        dealTimerAllowed357,
      }, {
        handContextId: null,
        phase: null,
        component: 'PLAYER_HAND',
      });
      decisionMaxTimeDeadlineRef.current = null;
      setDecisionMaxTime(null);
      setDecisionTimerPresentation(null);
      setTimeLeft(null);
      return;
    }
    // Don't start timer if no deadline or game conditions prevent it
    if (!decisionDeadline || game?.awaiting_next_round || game?.last_round_result || isAllDecisionsInFor(game, currentRound?.id)) {
      console.log('[TIMER COUNTDOWN] Not starting - conditions not met', { 
        decisionDeadline, 
        awaiting: game?.awaiting_next_round, 
        result: game?.last_round_result, 
        allDecisionsIn: isAllDecisionsInFor(game, currentRound?.id),
        rawAllDecisionsIn: game?.all_decisions_in,
        allDecisionsInRoundId: game?.all_decisions_in_round_id ?? null,
      });
      decisionMaxTimeDeadlineRef.current = null;
      setDecisionMaxTime(null);
      setDecisionTimerPresentation(null);
      return;
    }

    // For card games (Holm, 3-5-7): Players with auto_fold=true should NOT see a countdown.
    // They fold instantly via the instant auto-fold effect, so no timer needed.
    // This prevents the "timer running while auto-folding" issue.
    const isCardGame = game?.game_type === 'holm-game' || game?.game_type === '3-5-7' || 
                       game?.game_type === '3-5-7-game' || game?.game_type === '357';
    if (isCardGame) {
      const currentPlayer = players.find(p => p.user_id === user?.id);
      if (currentPlayer?.auto_fold && !currentPlayer.is_bot && !currentPlayer.sitting_out) {
        console.log('[TIMER COUNTDOWN] Suppressing timer - player has auto_fold enabled (card game)');
        setDecisionTimerPresentation(null);
        setTimeLeft(null);
        return;
      }
    }

    // Calculate time from server deadline
    const calculateRemaining = () => {
      const deadline = new Date(decisionDeadline).getTime();
      const now = Date.now();
      return Math.max(0, Math.floor((deadline - now) / 1000));
    };
    const holmTimerIdentity = game?.game_type === 'holm-game'
      && currentRound?.dealer_game_id
      && currentRound.id
      && typeof currentRound.hand_number === 'number'
      && Number.isInteger(currentRound.hand_number)
        ? {
            dealerGameId: currentRound.dealer_game_id,
            roundId: currentRound.id,
            handNumber: currentRound.hand_number,
          }
        : null;

    // Set real backend-derived time immediately — no fake seeding.
    // The TimerBar and MobilePlayerTimer suppress CSS transitions on the
    // first frame of a new deadline identity, so no fill-up glitch occurs.
    // FIX: Floor seed at 1 so the render gate (timeLeft > 0) doesn't reject
    // the timer when client clock is slightly past the deadline on first frame.
    // The next 1s tick syncs to the true value (which may then become 0 → cleared).
    if (!isPausedRef.current) {
      const rawRemaining = calculateRemaining();
      const seed = rawRemaining > 0 ? rawRemaining : 1;
      setTimeLeft(seed);
      if (decisionMaxTimeDeadlineRef.current !== decisionDeadline) {
        decisionMaxTimeDeadlineRef.current = decisionDeadline;
        setDecisionMaxTime(rawRemaining > 0 ? rawRemaining : (decisionTimerRef.current || 30));
      }
      // Capture maxTime from the actual deadline window on first frame of a new
      // deadline identity. Guarantees the visual bar/ring starts full (timeLeft/maxTime = 1)
      // and scales to the configured timeout — not to a stale cached default (e.g. 30s).
      if (holmTimerIdentity) {
        setDecisionTimerPresentation(current => {
          if (
            current?.deadline === decisionDeadline
            && isSameHolmPresentationHand(current, holmTimerIdentity)
          ) {
            return current.remainingSeconds === seed
              ? current
              : { ...current, remainingSeconds: seed };
          }
          return {
            deadline: decisionDeadline,
            ...holmTimerIdentity,
            remainingSeconds: seed,
            // Use raw remaining (not seed) so tiny clock skew cannot lock total to 1.
            totalSeconds: rawRemaining > 0 ? rawRemaining : (decisionTimerRef.current || 30),
          };
        });
      } else {
        setDecisionTimerPresentation(null);
      }

      // ── Targeted turn-transition timer instrumentation (issue #2) ──
      // One row per new decision_deadline identity. Captures server vs client
      // skew, raw vs seeded remaining, fresh-mount flag, and current sim mode.
      try {
        const roundIdForLog = currentRound?.id ?? null;
        const turnPos = currentRound?.current_turn_position ?? null;
        const turnOwner = turnPos != null
          ? (players.find(p => p.position === turnPos)?.id ?? null)
          : null;
        const handNumberForLog = currentRound?.hand_number ?? game?.total_hands ?? null;

        if (gameId && shouldLogTurnTransition(gameId, roundIdForLog, decisionDeadline)) {
          const fresh = isFreshMountForRound(gameId, roundIdForLog);
          logTurnTransitionSeed({
            gameId,
            roundId: roundIdForLog,
            handNumber: handNumberForLog,
            userId: user?.id ?? null,
            turnOwnerId: turnOwner,
            serverDeadlineIso: decisionDeadline,
            clientReceiveTs: Date.now(),
            rawRemainingSec: rawRemaining,
            seedValue: seed,
            isFreshMount: fresh,
            configuredTimerSec: decisionTimerRef.current ?? null,
          });
        }

        // First-render snapshot (idempotent per deadline identity).
        if (gameId) {
          logTurnTimerFirstRender({
            gameId,
            roundId: roundIdForLog,
            handNumber: handNumberForLog,
            userId: user?.id ?? null,
            turnOwnerId: turnOwner,
            configuredTimerSec: decisionTimerRef.current ?? null,
            serverDeadlineIso: decisionDeadline,
            clientReceiveTs: Date.now(),
            rawRemainingSec: rawRemaining,
            seedValueSec: seed,
            initialRenderTimeLeft: seed,
            firstFrameAnimationSuppressed: true,
          });
        }
      } catch { /* never break gameplay on instrumentation errors */ }
    }

    // Update every second - check pause state via ref FIRST before any calculation
    const intervalId = setInterval(() => {
      // CRITICAL: Check pause ref immediately - exit before any work if paused
      if (isPausedRef.current) {
        console.log('[TIMER COUNTDOWN] Tick skipped - game is paused');
        return; // Just skip this tick, don't clear interval (let the useEffect handle cleanup)
      }
      const remaining = calculateRemaining();
      console.log('[TIMER COUNTDOWN] Tick (from deadline):', remaining);
      setTimeLeft(remaining);
      setDecisionTimerPresentation(current =>
        current?.deadline === decisionDeadline
          && holmTimerIdentity
          && isSameHolmPresentationHand(current, holmTimerIdentity)
          ? { ...current, remainingSeconds: remaining }
          : current
      );

      // Refill / upward-jump detection (only logs if delta > 1s within same identity).
      try {
        if (gameId) {
          checkTimerRefill({
            gameId,
            roundId: currentRound?.id ?? null,
            userId: user?.id ?? null,
            serverDeadlineIso: decisionDeadline,
            newTimeLeft: remaining,
          });
        }
      } catch { /* never break gameplay */ }
    }, 1000);

    // Store in ref for external access (realtime handler)
    timerIntervalRef.current = intervalId;

    return () => {
      console.log('[TIMER COUNTDOWN] Cleanup - clearing interval');
      clearInterval(intervalId);
      if (timerIntervalRef.current === intervalId) {
        timerIntervalRef.current = null;
      }
    };
  }, [decisionDeadline, game?.awaiting_next_round, game?.last_round_result, game?.all_decisions_in, game?.all_decisions_in_round_id, game?.game_type, game?.current_game_uuid, game?.current_round, game?.total_hands, game?.rounds, players, user?.id, dealTimerAllowed357]);

  // Ante timer countdown effect - SKIP when game is paused
  useEffect(() => {
    // No-Timers harness: freeze ante countdown.
    if (isNoTimersEnabledCached()) return;
    if (anteTimeLeft === null || anteTimeLeft <= 0) return;
    // Don't count down if game is paused
    if (game?.is_paused) return;

    const timer = setInterval(() => {
      setAnteTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [anteTimeLeft, game?.is_paused]);

  // Trigger bot ante decisions - INSTANT for bots
  // SKIP if game is paused
  useEffect(() => {
    recordStartupFlight('EFFECT TIMELINE', 'bot ante effect entered', {
      file: 'src/pages/Game.tsx',
      function: 'bot ante useEffect',
      gameId,
      status: game?.status ?? null,
      isPaused: game?.is_paused ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
    });
    if (game?.is_paused) {
      recordStartupFlight('EFFECT TIMELINE', 'bot ante effect skipped', {
        file: 'src/pages/Game.tsx',
        function: 'bot ante useEffect',
        skipReason: 'game is paused',
        gameId,
      });
      console.log('[ANTE PHASE] Skipping bot ante decisions - game is paused');
      return;
    }
    if (game?.status !== 'ante_decision') {
      recordStartupFlight('EFFECT TIMELINE', 'bot ante effect skipped', {
        file: 'src/pages/Game.tsx',
        function: 'bot ante useEffect',
        skipReason: 'status is not ante_decision',
        gameId,
        status: game?.status ?? null,
      });
    }
    if (game?.status === 'ante_decision') {
      const dealerGameIdForKey = game?.current_game_uuid ?? '';
      const inFlightKey = `${gameId}:${dealerGameIdForKey}`;
      if (botAnteInFlightKeyRef.current === inFlightKey) {
        recordStartupFlight('EFFECT TIMELINE', 'bot ante effect skipped', {
          file: 'src/pages/Game.tsx',
          function: 'bot ante useEffect',
          skipReason: 'duplicate invocation for same (gameId,dealerGameId) — bot ante already in flight',
          gameId,
          dealerGameId: dealerGameIdForKey,
          inFlightKey,
        });
        console.log('[GIN_RUNTIME_TIMELINE] bot ante effect skipped: duplicate in-flight', { t: Date.now(), inFlightKey });
        return;
      }
      // Fast-path: derive bots needing ante from local players state. If none
      // need a decision, skip the entire bot ante path (no SELECTs, no UPDATE).
      const knownBotsNeedingAnte = playersRef.current
        .filter(p => (p as any).is_bot && p.ante_decision == null && (p as any).status !== 'observer' && (p as any).status !== 'left')
        .map(p => ({ id: p.id, sitting_out: !!p.sitting_out }));
      if (knownBotsNeedingAnte.length === 0) {
        recordStartupFlight('EFFECT TIMELINE', 'bot ante effect skipped', {
          file: 'src/pages/Game.tsx',
          function: 'bot ante useEffect',
          skipReason: 'no bots need ante decision (derived from local players state)',
          gameId,
          dealerGameId: dealerGameIdForKey,
        });
        return;
      }
      botAnteInFlightKeyRef.current = inFlightKey;
      recordStartupFlight('PHASE TIMELINE', 'status=ante_decision observed by bot effect', {
        file: 'src/pages/Game.tsx',
        function: 'bot ante useEffect',
        gameId,
        dealerGameId: game?.current_game_uuid ?? null,
        knownBotsNeedingAnte: knownBotsNeedingAnte.length,
      });
      console.log('[GIN_RUNTIME_TIMELINE] ante phase observed:bot-bootstrap-start', {
        t: Date.now(),
        gameId,
        dealerGameId: game?.current_game_uuid ?? null,
        status: game?.status,
      });
      const tMakeBotStart = Date.now();
      recordStartupFlight('EFFECT TIMELINE', 'makeBotAnteDecisions call issued', {
        file: 'src/pages/Game.tsx',
        function: 'bot ante useEffect',
        caller: 'React effect status=ante_decision',
        gameId,
        inFlightKey,
      });
      console.log('[GIN_RUNTIME_TIMELINE] effect:calling-makeBotAnteDecisions', { t: tMakeBotStart });
      // Pass known-paused state (we already gated on game?.is_paused above so
      // it's false here) and the preselected bot list to skip the two serial
      // SELECTs inside makeBotAnteDecisions on the happy path.
      makeBotAnteDecisions(gameId!, {
        skipPauseCheck: true,
        preselectedBots: knownBotsNeedingAnte,
      }).then(async (botResults) => {
        const tBotReturned = Date.now();
        recordStartupFlight('EFFECT TIMELINE', 'makeBotAnteDecisions returned', {
          file: 'src/pages/Game.tsx',
          function: 'bot ante useEffect',
          gameId,
          elapsedMs: tBotReturned - tMakeBotStart,
          botResultCount: botResults.length,
        });
        console.log('[GIN_RUNTIME_TIMELINE] effect:makeBotAnteDecisions-returned', { t: tBotReturned, deltaMs: tBotReturned - tMakeBotStart, botResultCount: botResults.length });

        const botDecisionMap = new Map(botResults.map(r => [r.id, r.ante_decision] as const));
        const latestPlayers = playersRef.current;
        const mergedPlayers = latestPlayers.map(p => ({
          id: p.id,
          ante_decision: botDecisionMap.get(p.id) ?? p.ante_decision ?? null,
          sitting_out: !!p.sitting_out,
          status: (p as any).status,
        }));
        const activePlayers = mergedPlayers.filter(
          p => !p.sitting_out && p.status !== 'observer' && p.status !== 'left'
        );
        const allDecided = activePlayers.length >= 2 && activePlayers.every(p => !!p.ante_decision);
        recordStartupFlight('PHASE TIMELINE', 'allDecided evaluated after bot write (no-refetch)', {
          file: 'src/pages/Game.tsx',
          function: 'bot ante useEffect',
          gameId,
          dealerGameId: game?.current_game_uuid ?? null,
          oldValue: null,
          newValue: allDecided,
          activePlayers: activePlayers.length,
          decisions: activePlayers.map(p => ({ id: p.id, ante_decision: p.ante_decision })),
        });
        if (allDecided && !anteProcessingRef.current) {
          recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn call issued', {
            file: 'src/pages/Game.tsx',
            function: 'bot ante useEffect',
            caller: 'allDecided true after bot write (no-refetch)',
            gameId,
          });
          console.log('[GIN_RUNTIME_TIMELINE] effect:allDecided=true → calling handleAllAnteDecisionsIn (no-refetch)', { t: Date.now() });
          anteProcessingRef.current = true;
          handleAllAnteDecisionsIn();
        } else {
          recordStartupFlight('EFFECT TIMELINE', 'bot ante effect exited via fallback fetch', {
            file: 'src/pages/Game.tsx',
            function: 'bot ante useEffect',
            skipReason: allDecided ? 'anteProcessingRef already true' : 'allDecided false (awaiting human writes via realtime)',
            gameId,
            allDecided,
            anteProcessingRef: anteProcessingRef.current,
          });
        }
      }).catch((err) => {
        // On failure clear the in-flight key so a retry can run.
        if (botAnteInFlightKeyRef.current === inFlightKey) {
          botAnteInFlightKeyRef.current = null;
        }
        console.error('[BOT ANTE] makeBotAnteDecisions failed', err);
      });

    } else {
      // Status is no longer ante_decision — clear the in-flight key so the
      // next ante_decision phase (e.g. next hand) can run.
      if (botAnteInFlightKeyRef.current !== null) {
        botAnteInFlightKeyRef.current = null;
      }
    }
  }, [game?.status, game?.is_paused, gameId, game?.current_game_uuid]);

  // CRITICAL: Aggressive polling fallback for realtime reliability issues
  // This handles: newly active players needing cards, ante dialog not showing, game_over stuck
  useEffect(() => {
    if (!gameId || !user) return;

    if (safetyPollsDisabled) return;
    
    const currentPlayer = players.find(p => p.user_id === user?.id);
    const isSittingOut = currentPlayer?.sitting_out === true;
    const needsAnteDecision = currentPlayer?.ante_decision === null && game?.status === 'ante_decision';
    const isDealer = currentPlayer?.position === game?.dealer_position;
    const isCreator = currentPlayer?.position === 1;
    
    // Check if player just anted up but has no cards yet (critical race condition)
    const justAntedUpNoCards = 
      currentPlayer && 
      currentPlayer.ante_decision === 'ante_up' && 
      !currentPlayer.sitting_out &&
      game?.status === 'in_progress' &&
      playerCards.length === 0;
    
    // Check if we're waiting for ante_decision status after config complete
    // Non-dealers should poll aggressively when game is in ante_decision but they haven't seen the dialog yet
    const waitingForAnteDialog = 
      game?.status === 'ante_decision' && 
      currentPlayer && 
      currentPlayer.ante_decision === null && 
      !isDealer &&
      !showAnteDialog;
    
    const waitingForAnteStatus = 
      game?.status === 'configuring' || 
      waitingForAnteDialog;
    
    // CRITICAL: Poll when stuck on game_over - dealer may have moved on to game_selection/configuring/ante_decision
    // Non-dealers should poll to detect when the game has transitioned past game_over
    const stuckOnGameOver = 
      game?.status === 'game_over' && 
      currentPlayer && 
      !isDealer;
    
    // Also poll during game_selection if not the dealer - wait for configuring transition
    const waitingForConfig = 
      game?.status === 'game_selection' && 
      currentPlayer && 
      !isDealer;
    
    // CRITICAL: Poll during waiting/dealer_selection for non-creators to detect game start
    const waitingForGameStart = 
      (game?.status === 'waiting' || game?.status === 'waiting_for_players' || game?.status === 'dealer_selection') && 
      currentPlayer && 
      !isCreator;
    
    // CRITICAL: Host in waiting status should also poll to see new players joining
    // Realtime INSERT events are unreliable
    const hostWaitingForPlayers = 
      (game?.status === 'waiting' || game?.status === 'waiting_for_players') && 
      isCreator;
    
    // CRITICAL: Observers in waiting status should poll to see other players joining (including bots)
    // Observers aren't players yet so they don't trigger the other polling conditions
    const observerWaitingForPlayers = 
      (game?.status === 'waiting' || game?.status === 'waiting_for_players') && 
      !currentPlayer;
    
    // CRITICAL: Detect stuck Holm game state where all_decisions_in=true but round is still betting
    // and no one can make a decision. This can happen due to race conditions.
    const latestRound = game?.game_type === 'holm-game'
      ? pickActiveSingleRoundGameRound(game?.rounds, {
          dealerGameId: game?.current_game_uuid ?? null,
          currentRoundNumber: game?.current_round ?? null,
          currentHandNumber: game?.total_hands ?? null,
        })
      : pickActive357Round(game?.rounds, {
          currentRoundNumber: game?.current_round,
          currentHandNumber: game?.total_hands,
          dealerGameId: game?.current_game_uuid,
        }) ?? null;
    // CRITICAL: Detect stuck Holm showdown where the round is already in 'showdown' but the
    // last 2 community cards never flipped (community_cards_revealed stays at 2).
    // This can happen if the client that acquired the round lock disconnects mid-showdown.
    const holmShowdownStuck =
      game?.game_type === 'holm-game' &&
      game?.status === 'in_progress' &&
      latestRound?.status === 'showdown' &&
      (latestRound?.community_cards_revealed ?? 0) < 4 &&
      currentPlayer;

    // Also detect when Holm game started but no round was created
    // CRITICAL: Check rounds array, NOT game.current_round (which we no longer update for Holm)
    const holmNoRound = 
      game?.game_type === 'holm-game' &&
      game?.status === 'in_progress' &&
      (!game?.rounds || game?.rounds?.length === 0) &&
      currentPlayer;
    
    const shouldPoll = isSittingOut || needsAnteDecision || justAntedUpNoCards || waitingForAnteStatus || stuckOnGameOver || waitingForConfig || waitingForGameStart || hostWaitingForPlayers || observerWaitingForPlayers || holmShowdownStuck || holmNoRound;
    
    if (!shouldPoll) return;
    
    console.log('[CRITICAL POLL] Starting aggressive polling:', {
      isSittingOut,
      needsAnteDecision,
      justAntedUpNoCards,
      waitingForAnteDialog,
      waitingForAnteStatus,
      stuckOnGameOver,
      waitingForConfig,
      waitingForGameStart,
      hostWaitingForPlayers,
      observerWaitingForPlayers,
      holmShowdownStuck,
      holmNoRound,
      showAnteDialog,
      gameStatus: game?.status,
      playerCardsCount: playerCards.length
    });
    
    // Poll at reasonable intervals - NOT 250ms which hammers the DB
    // Critical states poll every 2 seconds, normal states every 3 seconds
    const pollInterval = (hostWaitingForPlayers || observerWaitingForPlayers) ? 3000 : 
      (waitingForAnteDialog || stuckOnGameOver || waitingForConfig || waitingForGameStart || holmNoRound) ? 2000 : 3000;
    
    const intervalId = __scheduleWartimeInterval({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_CRITICAL_POLL.id,
      ownerLabel: 'game.criticalLifecyclePoll',
      intervalMs: pollInterval,
      extra: {
        purpose: 'critical lifecycle polling',
        guard_waitingForAnteDialog: waitingForAnteDialog,
        guard_stuckOnGameOver: stuckOnGameOver,
        guard_waitingForConfig: waitingForConfig,
        guard_waitingForGameStart: waitingForGameStart,
        guard_holmNoRound: holmNoRound,
        guard_holmShowdownStuck: holmShowdownStuck,
      },
      fn: async (_asyncOwnerId, tickNumber) => {
      console.log('[CRITICAL POLL] Polling game data... interval:', pollInterval);

      // If Holm showdown is stuck (community cards never fully revealed), attempt to resume
      // the showdown safely (holmGameLogic has an atomic recovery claim).
      if (holmShowdownStuck) {
        console.log('[CRITICAL POLL] Detected stuck Holm showdown - attempting to resume endHolmRound');
        try {
          await endHolmRound(gameId!);
        } catch (e) {
          console.error('[CRITICAL POLL] Failed to resume stuck Holm showdown:', e);
        }
      }

      // Polling is presentation recovery only. The first-hand RPC owns round
      // creation; a poller never repairs or creates authoritative state.
      if (holmNoRound) {
        console.log('[CRITICAL POLL] Holm game with no round detected - waiting for proper round creation');
      }
      
      fetchGameData();
    },
    });
    
    return () => {
      console.log('[CRITICAL POLL] Stopping polling');
      __cancelWartimeAsyncOwner(intervalId as unknown as number, 'effect_cleanup');
      clearInterval(intervalId);
    };
   }, [game?.status, game?.dealer_position, game?.all_decisions_in, game?.all_decisions_in_round_id, game?.awaiting_next_round, game?.game_type, game?.rounds, game?.current_round, players, user?.id, gameId, playerCards.length, showAnteDialog, __cancelWartimeAsyncOwner, __scheduleWartimeInterval]);
  
  // CRITICAL: 3-5-7 specific round sync polling (fallback for realtime issues)
  // More aggressive polling to prevent round desync between clients
  useEffect(() => {
    if (!gameId || !game) return;

    if (safetyPollsDisabled) return;
    
    const is357Game = game?.game_type === '3-5-7-game';
    const isActiveGame = game?.status === 'in_progress';
    
    if (!is357Game || !isActiveGame) return;
    
    const syncPoll = async () => {
      const { data: freshGame, error } = await supabase
        .from('games')
        .select('current_round, awaiting_next_round, status')
        .eq('id', gameId)
        .single();
      
      if (error || !freshGame) return;
      
      const localRound = game?.current_round;
      const dbRound = freshGame.current_round;
      
      // Detect desync: DB round is different from local round (including when local is null)
      const needsSync = dbRound !== null && (localRound === null || dbRound !== localRound);
      
      if (needsSync) {
        console.log('[357 SYNC POLL] ⚠️⚠️⚠️ DESYNC DETECTED! DB:', dbRound, 'Local:', localRound, '- FORCING SYNC!');
        lastKnownRoundRef.current = dbRound;
        // FIX 2: Hard clear on hand boundary — stale cards are unacceptable
        emit357ClearEvent('sync_poll_desync', '3-second 357 sync poll detected DB round != local round', 5091);
        setPlayerCards([]);
        setCardStateContext(null);
        fetchGameData();
      }
    };
    
    // Poll every 3 seconds as fallback for round sync (not 750ms which hammers DB)
    const pollInterval = __scheduleWartimeInterval({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_357_SYNC_POLL.id,
      ownerLabel: 'game.357RoundSyncPoll',
      intervalMs: 3000,
      extra: {
        purpose: '3-5-7 round sync fallback',
        guard_gameType: game?.game_type ?? null,
        guard_status: game?.status ?? null,
        guard_localRound: game?.current_round ?? null,
      },
      fn: () => syncPoll(),
    });
    
    // Also sync immediately on mount
    syncPoll();
    
    return () => {
      __cancelWartimeAsyncOwner(pollInterval as unknown as number, 'effect_cleanup');
      clearInterval(pollInterval);
    };
  }, [gameId, game?.game_type, game?.status, game?.current_round, __cancelWartimeAsyncOwner, __scheduleWartimeInterval]);
  
  useEffect(() => {
    console.log('[ANTE DIALOG DEBUG] Effect triggered:', {
      gameStatus: game?.status,
      hasUser: !!user,
      userId: user?.id,
      playersCount: players.length,
      allPlayers: players.map(p => ({ 
        id: p.id, 
        user_id: p.user_id, 
        position: p.position, 
        ante_decision: p.ante_decision,
        is_bot: p.is_bot,
        sitting_out: p.sitting_out
      })),
      dealerPosition: game?.dealer_position,
      anteDeadline: game?.ante_decision_deadline,
      configComplete: game ? (game as any).config_complete : undefined
    });
    
    console.log('[ANTE DIALOG] ===== useEffect TRIGGERED =====', {
      userId: user?.id,
      userEmail: user?.email,
      gameStatus: game?.status,
      playersCount: players.length,
      allPlayersAnteDecisions: players.map(p => ({ 
        position: p.position, 
        ante_decision: p.ante_decision, 
        user_id: p.user_id,
        sitting_out: p.sitting_out,
        is_me: p.user_id === user?.id
      }))
    });
    
    if (
      game?.status === 'ante_decision'
      && game.config_complete === true
      && !!game.current_game_uuid
      && user
    ) {
      const currentPlayer = players.find(p => p.user_id === user.id);
      const isDealer = currentPlayer?.position === game.dealer_position;
      
      // Check for "Running it Back" using dealer_games table for deterministic detection
      // A "runback" means the current dealer_game has the same game_type and config as the previous one
      // We use the current_game_uuid field to identify the current dealer_game
      const checkRunBackAndAutoAnte = async () => {
        // CRITICAL FIX: Fetch fresh player data from database instead of using potentially stale React state
        // This prevents race conditions where the dialog check runs before realtime updates propagate
        const { data: freshPlayers, error: freshPlayersError } = await supabase
          .from('players')
          .select('id, user_id, position, ante_decision, auto_ante, auto_ante_runback, sitting_out, is_bot, status')
          .eq('game_id', gameId);
        
        if (freshPlayersError || !freshPlayers) {
          console.error('[ANTE DIALOG] Error fetching fresh players:', freshPlayersError);
          return;
        }
        
        const freshCurrentPlayer = freshPlayers.find(p => p.user_id === user.id);
        const isDealer = freshCurrentPlayer?.position === game.dealer_position;
        
        console.log('[ANTE DIALOG] Fresh player data:', {
          freshCurrentPlayer: freshCurrentPlayer ? {
            id: freshCurrentPlayer.id,
            ante_decision: freshCurrentPlayer.ante_decision,
            auto_ante: freshCurrentPlayer.auto_ante,
            auto_ante_runback: freshCurrentPlayer.auto_ante_runback,
            sitting_out: freshCurrentPlayer.sitting_out,
            position: freshCurrentPlayer.position
          } : null,
          isDealer
        });
        
        // Determine if this is a runback FIRST before evaluating auto-ante
        let isRunBack = false;
        
        if (!game.current_game_uuid) {
          console.log('[ANTE DIALOG] No current_game_uuid, not a runback');
          isRunBack = false;
        } else {
          // Query the previous dealer_game in this session (same session_id, started_at before current)
          const { data: previousDealerGame, error } = await supabase
            .from('dealer_games')
            .select('id, game_type, config')
            .eq('session_id', game.id)
            .neq('id', game.current_game_uuid)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error('[ANTE DIALOG] Error fetching previous dealer_game:', error);
            isRunBack = false;
          } else if (!previousDealerGame) {
            console.log('[ANTE DIALOG] No previous dealer_game found - first game of session');
            isRunBack = false;
          } else {
            // Get current dealer_game for comparison
            const { data: currentDealerGame, error: currentError } = await supabase
              .from('dealer_games')
              .select('id, game_type, config')
              .eq('id', game.current_game_uuid)
              .single();

            if (currentError || !currentDealerGame) {
              console.error('[ANTE DIALOG] Error fetching current dealer_game:', currentError);
              isRunBack = false;
            } else {
              // Compare game_type and config JSON
              const sameGameType = previousDealerGame.game_type === currentDealerGame.game_type;
              const sameConfig = JSON.stringify(previousDealerGame.config) === JSON.stringify(currentDealerGame.config);
              isRunBack = sameGameType && sameConfig;

              console.log('[ANTE DIALOG] Running it back check (dealer_games):', { 
                isRunBack, 
                sameGameType,
                sameConfig,
                previousGameType: previousDealerGame.game_type,
                currentGameType: currentDealerGame.game_type,
                previousConfig: previousDealerGame.config,
                currentConfig: currentDealerGame.config
              });
            }
          }
        }
        
        // Update state for UI display
        setIsRunningItBack(isRunBack);
        
        console.log('[ANTE DIALOG] Checking ante dialog with FRESH data:', {
          gameStatus: game?.status,
          hasUser: !!user,
          hasCurrentPlayer: !!freshCurrentPlayer,
          currentPlayerId: freshCurrentPlayer?.id,
          currentPlayerUserId: freshCurrentPlayer?.user_id,
          anteDecision: freshCurrentPlayer?.ante_decision,
          isDealer,
          dealerPosition: game.dealer_position,
          playerPosition: freshCurrentPlayer?.position,
          autoAnte: freshCurrentPlayer?.auto_ante,
          autoAnteRunback: freshCurrentPlayer?.auto_ante_runback,
          isRunBack
        });
        
        // AUTO-ANTE: If player has auto_ante enabled, automatically accept ante (no dialog)
        // OR if player has auto_ante_runback enabled AND this is a run-it-back scenario
        // CRITICAL: We now check isRunBack (local variable) which is guaranteed to be resolved
        const shouldAutoAnte = freshCurrentPlayer?.auto_ante || (freshCurrentPlayer?.auto_ante_runback && isRunBack);
        
        // ── Ante latch check for auto-ante path too ──
        const autoLatchKey = `${gameId}|${game?.current_game_uuid ?? ''}|${freshCurrentPlayer?.id ?? ''}`;
        const isAutoLatched = anteConfirmedLatchRef.current === autoLatchKey;
        
        if (freshCurrentPlayer && freshCurrentPlayer.ante_decision === null && !isDealer && !freshCurrentPlayer.sitting_out && (freshCurrentPlayer as any).status !== 'observer' && (freshCurrentPlayer as any).status !== 'left' && shouldAutoAnte && !showAnteDialog && !isAutoLatched) {
          console.log('[ANTE DIALOG] ✅ AUTO-ANTE enabled - automatically accepting ante for player:', freshCurrentPlayer.id, {
            auto_ante: freshCurrentPlayer.auto_ante,
            auto_ante_runback: freshCurrentPlayer.auto_ante_runback,
            isRunBack
          });
          
          // Set latch before DB write
          anteConfirmedLatchRef.current = autoLatchKey;
          
          // Auto-accept the ante
          await supabase
            .from('players')
            .update({
              ante_decision: 'ante_up',
              sitting_out: false,
            })
            .eq('id', freshCurrentPlayer.id);
          
          console.log('[ANTE DIALOG] Auto-ante complete');
          setShowAnteDialog(false);
          return;
        }
        
        // Don't show ante dialog for dealer (they auto ante up)
        // Don't show ante dialog for players who are sitting_out (they stay sitting out)
        // Show dialog if player exists and hasn't made ante decision and isn't dealer and isn't sitting out
        // ── Ante latch check: skip if already confirmed for this dealerGame ──
        const latchKey = `${gameId}|${game?.current_game_uuid ?? ''}|${freshCurrentPlayer?.id ?? ''}`;
        const isLatched = anteConfirmedLatchRef.current === latchKey;
        
        if (freshCurrentPlayer && freshCurrentPlayer.ante_decision === null && !isDealer && !freshCurrentPlayer.sitting_out && (freshCurrentPlayer as any).status !== 'observer' && (freshCurrentPlayer as any).status !== 'left' && !isLatched) {
          logDebugEvent({
            gameId: gameId!,
            userId: user.id,
            eventType: 'ante_modal_should_show',
            payload: {
              playerId: freshCurrentPlayer.id,
              anteDecision: freshCurrentPlayer.ante_decision,
              isDealer,
              sittingOut: freshCurrentPlayer.sitting_out,
              autoAnte: freshCurrentPlayer.auto_ante,
              autoAnteRunback: freshCurrentPlayer.auto_ante_runback,
              isRunBack,
              showAnteDialogBefore: showAnteDialog,
              dealerGameId: game?.current_game_uuid ?? null,
              gameStatus: game?.status,
              isLatched,
            },
          });
          console.log('[ANTE DIALOG] ✅ Showing ante dialog for player:', freshCurrentPlayer.id, {
            auto_ante: freshCurrentPlayer.auto_ante,
            auto_ante_runback: freshCurrentPlayer.auto_ante_runback,
            isRunBack
          });
          setShowAnteDialog(true);
          // ── HANDOFF TRACE #5a: ante modal SHOWN ──
          emitCribbageHandoffTrace({
            gameId: gameId!,
            eventType: 'ante_modal_shown',
            userId: user?.id ?? null,
            context: {
              gameStatus: game?.status,
              dealerGameId: game?.current_game_uuid ?? null,
              dealerSelectionCardsLen: dealerSelectionCards.length,
            },
          });
          
          // Calculate ante time left
          if (game.ante_decision_deadline) {
            const deadline = new Date(game.ante_decision_deadline).getTime();
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
            console.log('[ANTE DIALOG] Time left calculation:', { deadline, now, remaining });
            setAnteTimeLeft(remaining);
          }
        } else {
          console.log('[ANTE DIALOG] ❌ NOT showing ante dialog - reasons:', {
            noCurrentPlayer: !freshCurrentPlayer,
            anteDecisionNotNull: freshCurrentPlayer?.ante_decision !== null,
            anteDecisionValue: freshCurrentPlayer?.ante_decision,
            isDealer,
            sittingOut: freshCurrentPlayer?.sitting_out
          });
          setShowAnteDialog(false);
          // ── HANDOFF TRACE #5b: ante modal HIDDEN (not eligible) ──
          emitCribbageHandoffTrace({
            gameId: gameId!,
            eventType: 'ante_modal_hidden',
            userId: user?.id ?? null,
            context: {
              reason: 'not_eligible',
              gameStatus: game?.status,
              dealerGameId: game?.current_game_uuid ?? null,
            },
          });
        }
      };

      checkRunBackAndAutoAnte();
    } else {
      console.log('[ANTE DIALOG] ❌ Conditions not met for ante dialog:', {
        statusNotAnteDecision: game?.status !== 'ante_decision',
        noUser: !user,
        actualStatus: game?.status
      });
      setShowAnteDialog(false);
      
      // ── Reset ante latch when status leaves ante_decision ──
      if (game?.status !== 'ante_decision' && anteConfirmedLatchRef.current !== null) {
        console.log('[ANTE LATCH] Reset (status left ante_decision):', anteConfirmedLatchRef.current);
        anteConfirmedLatchRef.current = null;
      }
      
      // ── HANDOFF TRACE #5b: ante modal HIDDEN (status not ante_decision) ──
      emitCribbageHandoffTrace({
        gameId: gameId!,
        eventType: 'ante_modal_hidden',
        userId: user?.id ?? null,
        context: {
          reason: 'status_not_ante_decision',
          gameStatus: game?.status,
        },
      });
      // Reset isRunningItBack so it re-computes on next ante_decision phase
      setIsRunningItBack(null);
    }
  }, [game?.id, game?.status, game?.config_complete, game?.current_game_uuid, game?.ante_decision_deadline, game?.dealer_position, game?.game_type, game?.ante_amount, game?.pussy_tax_enabled, game?.pussy_tax_value, game?.pot_max_enabled, game?.pot_max_value, game?.chucky_cards, game?.leg_value, game?.legs_to_win, players, user?.id, previousGameConfig, previousGameConfigGameId, hasSessionHistory]);

  // Auto-sit-out when ante timer reaches 0 - SKIP when game is paused
  // P0 GUARD (MUT-04): re-fetch authoritative DB state immediately before mutating.
  useEffect(() => {
    // No-Timers harness: ante timer-expiry auto-sit-out is forbidden.
    if (isNoTimersEnabledCached()) return;
    if (game?.is_paused) return;
    if (anteTimeLeft !== 0 || game?.status !== 'ante_decision' || !user) return;

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer || currentPlayer.ante_decision) return;

    let cancelled = false;
    (async () => {
      // Confirm DB still says: game in ante_decision, not paused, deadline expired, player undecided.
      const [{ data: freshGame }, { data: freshPlayer }] = await Promise.all([
        supabase
          .from('games')
          .select('status, is_paused, ante_decision_deadline')
          .eq('id', gameId)
          .maybeSingle(),
        supabase
          .from('players')
          .select('id, ante_decision, sitting_out')
          .eq('id', currentPlayer.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const deadlineMs = freshGame?.ante_decision_deadline ? new Date(freshGame.ante_decision_deadline).getTime() : 0;
      const stillValid =
        freshGame &&
        freshGame.status === 'ante_decision' &&
        !freshGame.is_paused &&
        deadlineMs > 0 &&
        deadlineMs <= Date.now() &&
        freshPlayer &&
        !freshPlayer.ante_decision;

      if (!stillValid) {
        console.log('[ANTE AUTO-SIT-OUT] auto-sit-out-suppressed (state changed)', {
          status: freshGame?.status,
          is_paused: freshGame?.is_paused,
          deadlineMs,
          ante_decision: freshPlayer?.ante_decision,
        });
        return;
      }

      await supabase
        .from('players')
        .update({ ante_decision: 'sit_out', sitting_out: true, waiting: false })
        .eq('id', currentPlayer.id);
    })();

    return () => { cancelled = true; };
  }, [anteTimeLeft, game?.status, game?.is_paused, gameId, players, user?.id]);

  // Session ending tracking (removed toast)

  // Redirect to lobby when session ends.
  // P0 GUARD (NAV-01): re-fetch authoritative state and confirm terminal status before navigating.
  useEffect(() => {
    if (game?.status !== 'session_ended') return;
    // Atomic last-hand settlement can close the session before this client
    // finishes its terminal win presentation. Hold the redirect while the
    // exact live terminal scope is still presenting locally.
    // Holm LAST HAND: the hold is owned by this route (see
    // holmLastHandPresentationPending) precisely because the gameplay subtree
    // that used to publish it is removed by the same `session_ended` snapshot.
    if (
      terminalPresentationActive ||
      holmLastHandPresentationPending ||
      liveTerminalPresentationPending
    ) return;
    // Transient Session Ended table: this client stayed through the live
    // terminal presentation, so navigation is now user-owned (Back to Lobby).
    // Non-admitted clients (fresh mount / reconnect) keep direct-to-lobby.
    if (sessionEndedTableAdmitted) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      const { data: freshGame, error } = await supabase
        .from('games')
        .select('status, session_ended_at')
        .eq('id', gameId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[NAV-01] session_ended re-fetch failed, suppressing navigation', error.message);
        return;
      }
      if (!freshGame || freshGame.status !== 'session_ended') {
        console.log('[NAV-01] session-ended-nav-suppressed (DB no longer terminal)', { status: freshGame?.status });
        recordRecoveryTransition('membership-validating', { gameId, reason: 'session-ended-suppressed', freshStatus: freshGame?.status ?? null });
        return;
      }
      recordTerminalRecovery('session-ended-confirmed', { gameId });
      releaseRecoveryLease('session-ended-confirmed', { gameId });
      navigate('/');

    }, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [game?.status, gameId, navigate, terminalPresentationActive, holmLastHandPresentationPending, liveTerminalPresentationPending, sessionEndedTableAdmitted]);

  // Check if all ante decisions are in - with polling fallback
  // CRITICAL: Also enforce deadline for disconnected players
  useEffect(() => {
    console.log('[ANTE CHECK] Effect triggered - status:', game?.status, 'gameId:', gameId, 'paused:', game?.is_paused);
    
    if (game?.status !== 'ante_decision') {
      // Reset the ref when we exit ante_decision status
      anteProcessingRef.current = false;
      console.log('[ANTE CHECK] Not in ante_decision status, resetting ref');
      return;
    }
    
    // CRITICAL: Skip ante processing if game is paused
    if (game?.is_paused) {
      console.log('[ANTE CHECK] Game is paused, skipping ante check');
      return;
    }

    const checkAnteDecisions = async () => {
      console.log('[ANTE CHECK] checkAnteDecisions called, anteProcessingRef:', anteProcessingRef.current);
      // Skip if already processing
      if (anteProcessingRef.current) {
        console.log('[ANTE CHECK] Already processing, skipping');
        return;
      }
      
      // Check pause state from database (in case local state is stale)
      const { data: freshGamePause } = await supabase
        .from('games')
        .select('is_paused')
        .eq('id', gameId)
        .single();
      
      if (freshGamePause?.is_paused) {
        console.log('[ANTE CHECK] Game is paused (from DB), skipping');
        return;
      }
      
      // CRITICAL: Fetch fresh player AND game data directly from database
      const [playersResult, gameResult] = await Promise.all([
        supabase.from('players').select('*').eq('game_id', gameId).neq('status', 'left'),
        supabase.from('games').select('ante_decision_deadline').eq('id', gameId).single()
      ]);
      
      if (playersResult.error || !playersResult.data) {
        console.log('[ANTE CHECK] Error fetching players:', playersResult.error);
        return;
      }
      
      const freshPlayers = playersResult.data;
      const deadline = gameResult.data?.ante_decision_deadline;
      
      // Check if deadline has passed - if so, auto-sit-out undecided players
      if (deadline) {
        const deadlineTime = new Date(deadline).getTime();
        const now = Date.now();
        if (now > deadlineTime) {
          const undecidedPlayers = freshPlayers.filter(p => !p.ante_decision);
          if (undecidedPlayers.length > 0) {
            console.log('[ANTE CHECK] Deadline expired! Auto-sitting-out disconnected players:', undecidedPlayers.map(p => p.position));
            
            // Batch update all undecided players to sit_out
            const undecidedIds = undecidedPlayers.map(p => p.id);
            await supabase
              .from('players')
              .update({
                ante_decision: 'sit_out',
                sitting_out: true,
                waiting: false,
              })
              .in('id', undecidedIds);
            
            // Re-fetch to get updated state
            const { data: updatedPlayers } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);
            
            if (updatedPlayers) {
              const allNowDecided = updatedPlayers.every(p => p.ante_decision);
              if (allNowDecided && updatedPlayers.length > 0) {
                console.log('[ANTE CHECK] All players now decided after deadline enforcement, proceeding');
                anteProcessingRef.current = true;
                handleAllAnteDecisionsIn();
              }
            }
            return;
          }
        }
      }
      
      // CRITICAL FIX: Only check decisions from players who are NOT sitting_out
      // Players who are already sitting_out should not block the ante phase
      const activePlayers = freshPlayers.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
      const decidedCount = activePlayers.filter(p => p.ante_decision).length;
      const allDecided = activePlayers.every(p => p.ante_decision);
      console.log('[ANTE CHECK] Fresh players:', freshPlayers.length, 'Active (not sitting out):', activePlayers.length, 'Decided:', decidedCount, 'All decided:', allDecided, 'Player ante statuses:', activePlayers.map(p => ({ pos: p.position, ante: p.ante_decision, bot: p.is_bot })));
      
      if (allDecided && freshPlayers.length > 0) {
        console.log('[ANTE CHECK] All players decided, proceeding to start round');
        anteProcessingRef.current = true;
        handleAllAnteDecisionsIn();
      }
    };

    // Check immediately
    checkAnteDecisions();

    if (safetyPollsDisabled) return;

    // Poll every 3 seconds as fallback for ante detection (not 1 second which hammers DB)
    const pollInterval = setInterval(() => {
      checkAnteDecisions();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [game?.status, game?.is_paused, gameId]);

  // FAST-PATH: Reactive ante-completion detector.
  // The polling effect above only re-runs on status/paused/gameId changes,
  // so realtime player updates (the second human submitting their ante) had
  // to wait up to 3s for the next poll tick. Watch local `players` state
  // directly — when every active, non-observer participant has an
  // ante_decision, immediately invoke handleAllAnteDecisionsIn.
  const anteSignature = useMemo(() => {
    if (game?.status !== 'ante_decision') return '';
    return players
      .filter(
        (p) =>
          !p.sitting_out &&
          (p as any).status !== 'observer' &&
          (p as any).status !== 'left',
      )
      .map((p) => `${p.id}:${p.ante_decision ?? ''}`)
      .sort()
      .join('|');
  }, [game?.status, players]);

  useEffect(() => {
    if (game?.status !== 'ante_decision') return;
    if (game?.is_paused) return;
    if (anteProcessingRef.current) return;
    if (!anteSignature) return;
    const activePlayers = players.filter(
      (p) =>
        !p.sitting_out &&
        (p as any).status !== 'observer' &&
        (p as any).status !== 'left',
    );
    if (activePlayers.length === 0) return;
    const allDecided = activePlayers.every((p) => !!p.ante_decision);
    if (!allDecided) return;
    console.log('[ANTE FAST-PATH] All active players decided (reactive) — advancing immediately');
    anteProcessingRef.current = true;
    handleAllAnteDecisionsIn();
  }, [anteSignature, game?.status, game?.is_paused]);



  // Extract current round info.
  // IMPORTANT: For dice games (Horses + Ship Captain Crew), DO NOT fall back to the previous round while a new round row
  // is still being created. That gap is what causes the "instant winner" + stale badge problem.
  // So we prefer the round that matches game.current_round, and if it doesn't exist yet we treat it as "no round".
  const liveRound = (() => {
    if (!game?.rounds?.length) return null as Round | null;

    if (game.game_type === "holm-game" || game.game_type === "cribbage") {
      // Single-round games: select the exact game.total_hands identity. A prepared
      // Cribbage successor must stay invisible until its server activation advances it.
      return pickActiveSingleRoundGameRound(game.rounds, {
        dealerGameId: game.current_game_uuid,
        currentRoundNumber: game.current_round,
        currentHandNumber: game.total_hands,
      });
    }

    if (game.game_type === "horses" || game.game_type === "ship-captain-crew" || game.game_type === "yahtzee") {
      // Dice games: current_round is authoritative; never show the previous round during the creation gap.
      if (typeof game.current_round === "number") {
        // CRITICAL: ALWAYS filter by dealer_game_id when available - NO fallback to unscoped rounds
        if (!game.current_game_uuid) {
          console.warn('[LIVE_ROUND] ⚠️ Missing dealer_game_id for dice game - cannot safely select round');
          return null;
        }
        const dealerRounds = game.rounds.filter((r) => r.dealer_game_id === game.current_game_uuid);
        // CRITICAL: Must use hand_number scoping to prevent cross-hand contamination
        const matchingRounds = dealerRounds.filter((r) => r.round_number === game.current_round);
        if (matchingRounds.length === 1) return matchingRounds[0];
        // Multiple rounds with same round_number -> pick latest hand_number
        return matchingRounds.reduce<typeof dealerRounds[0] | null>(
          (best, r) => (!best || (r.hand_number ?? 0) > (best.hand_number ?? 0) ? r : best),
          null
        );
      }
      return pickLatestRoundByKey(game.rounds, game.current_game_uuid);
    }

    if (game.game_type === '3-5-7') {
      // CRITICAL: ALWAYS require dealer_game_id for 3-5-7 - NO fallback to unscoped rounds
      if (!game.current_game_uuid) {
        console.warn('[LIVE_ROUND] ⚠️ Missing dealer_game_id for 3-5-7 - cannot safely select round');
        return null;
      }
      // Derive max hand_number from rounds for this dealer_game - don't trust game.total_hands which can be stale
      const dealerRounds = game.rounds.filter((r) => r.dealer_game_id === game.current_game_uuid);
      const maxHandNumber = dealerRounds.reduce(
        (max, r) => (typeof r.hand_number === 'number' && r.hand_number > max ? r.hand_number : max),
        0
      );
      return (
        pickActive357Round(game.rounds, {
          currentRoundNumber: game.current_round,
          currentHandNumber: maxHandNumber || game.total_hands,
          dealerGameId: game.current_game_uuid,
        }) ?? null
      );
    }

    // Default behavior for other games (Holm, Cribbage, etc.)
    if (typeof game.current_round === "number") {
      // CRITICAL: ALWAYS require dealer_game_id - NO fallback to unscoped rounds
      if (!game.current_game_uuid) {
        console.warn('[LIVE_ROUND] ⚠️ Missing dealer_game_id for game type', game.game_type, '- cannot safely select round');
        return null;
      }
      const dealerRounds = game.rounds.filter((r) => r.dealer_game_id === game.current_game_uuid);
      // CRITICAL: Must scope by hand_number to prevent cross-hand contamination
      const matchingRounds = dealerRounds.filter((r) => r.round_number === game.current_round);
      if (matchingRounds.length === 1) return matchingRounds[0];
      return matchingRounds.reduce<typeof dealerRounds[0] | null>(
        (best, r) => (!best || (r.hand_number ?? 0) > (best.hand_number ?? 0) ? r : best),
        null
      );
    }

    return pickLatestRoundByKey(game.rounds, game.current_game_uuid);
  })();
  
  // DEBUG: Always log liveRound details during in_progress Holm games
  if (game?.game_type === 'holm-game' && game?.status === 'in_progress') {
    console.log('[LIVE ROUND] Holm game state:', {
      roundsCount: game?.rounds?.length,
      roundNumbers: game?.rounds?.map(r => r.round_number),
      liveRoundNumber: liveRound?.round_number,
      liveRoundId: liveRound?.id,
      hasCommunityCards: !!liveRound?.community_cards,
      communityCardsLength: liveRound?.community_cards?.length,
      communityCardsRevealed: liveRound?.community_cards_revealed
    });
  }
  
  // DEBUG: Log when rounds are unexpectedly empty during active game
  // Also trigger a refetch as safeguard
  const roundsRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cribbageRoundBootstrapRef = useRef<string | null>(null);
  
  // REMOVED: The aggressive recovery refetch was causing race conditions
  // The rounds data comes from realtime subscriptions - trust them instead of triggering refetches
  
  // Immediately cache round data in ref when we have valid data with community cards
  // This ensures we capture it before game_over clears current_round
  // Only update cache if revealed count is >= current cached count (never decrease)
  if (liveRound && liveRound.community_cards) {
    const currentCachedRevealed = cachedRoundRef.current?.community_cards_revealed ?? 0;
    const liveRevealed = liveRound.community_cards_revealed ?? 0;
    if (liveRevealed >= currentCachedRevealed) {
      cachedRoundRef.current = liveRound;
    }
  }
  
  // Track previous round state to detect new hands in Holm games
  const prevRoundStateRef = useRef<{ communityCardsHash: string; status: string | undefined }>({ communityCardsHash: '', status: undefined });
  
  // Cache round data when transitioning to game_over, during showdown, or when Chucky is active
  // This ensures community cards and Chucky cards remain visible after game ends
  useEffect(() => {
    // CRITICAL: Only clear cache when starting a new game type selection
    // NEVER clear cache during round transitions - liveRound will naturally replace it
    // The previous "new Holm hand detection" was clearing cache BEFORE new data arrived, causing cards to disappear
    
    if (
      game?.status === 'game_selection' ||
      game?.status === 'configuring' ||
      game?.status === 'dealer_selection'
    ) {
      console.log('[CACHE] Clearing cache for dealer config phase:', game?.status);
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      prevRoundStateRef.current = { communityCardsHash: '', status: undefined };
      emit357ClearEvent('cache_effect_dealer_config', 'cache derivation effect saw game.status in dealer-config family', 5774);
      setPlayerCards([]);
      showdownCardsCacheRef.current = new Map();
      showdownRoundNumberRef.current = null;
      // CRITICAL: Also clear community cards cache
      communityCardsCacheRef.current = { cards: null, round: null, show: false };
      setCommunityCacheEpoch((e) => e + 1);
      return;
    }
    
    // Update tracking ref for debugging
    const currentCommunityHash = JSON.stringify(liveRound?.community_cards || []);
    const prevHash = prevRoundStateRef.current.communityCardsHash;
    
    // Detect new hand for resetting maxRevealed (but DON'T clear cache)
    const isNewHolmHand = 
      game?.game_type === 'holm-game' &&
      liveRound?.status === 'betting' &&
      prevHash !== '' && 
      currentCommunityHash !== prevHash &&
      liveRound?.community_cards?.length > 0; // CRITICAL: Only count as new if we have cards
    
    if (isNewHolmHand) {
      console.log('[CACHE] 🔄 NEW HOLM HAND DETECTED - resetting maxRevealed and pre-decisions (cache preserved until liveRound takes over)', {
        prevHash: prevHash.slice(0, 50),
        newHash: currentCommunityHash.slice(0, 50),
        liveRoundId: liveRound?.id,
        hasLiveCards: !!liveRound?.community_cards?.length
      });
      // Reset max revealed for the new hand, but DON'T clear cache
      // The cache will be naturally superseded by liveRound in the currentRound calculation
      maxRevealedRef.current = liveRound?.community_cards_revealed ?? 0;
      
      // Reset pre-fold/pre-stay for the new hand
      holmPreDecisionArmedRef.current = null;
      holmPreDecisionConsumingRef.current = false;
      setHolmPreFold(false);
      setHolmPreStay(false);
    }
    
    // Update tracking ref
    prevRoundStateRef.current = { 
      communityCardsHash: currentCommunityHash, 
      status: liveRound?.status 
    };
    
    // Cache round data during game_over/showdown/completed to preserve visibility
    // CRITICAL: Only cache rounds that belong to the CURRENT dealer_game_id to prevent
    // cross-game contamination (e.g., Holm 4-card community cards leaking into 3-5-7)
    if (liveRound && (
      game?.status === 'game_over' || 
      isAllDecisionsInFor(game, liveRound?.id) || 
      liveRound.chucky_active ||
      liveRound.status === 'completed' ||
      liveRound.status === 'showdown'
    )) {
      // Verify round belongs to current dealer game
      const roundDealerGameId = liveRound.dealer_game_id;
      const currentDealerGameId = game?.current_game_uuid;
      const isSameDealerGame = !currentDealerGameId || !roundDealerGameId || 
                               roundDealerGameId === currentDealerGameId;
      
      if (isSameDealerGame) {
        // Only update cache if revealed count is >= current cached count (never decrease)
        const currentCachedRevealed = cachedRoundData?.community_cards_revealed ?? 0;
        const liveRevealed = liveRound.community_cards_revealed ?? 0;
        if (liveRevealed >= currentCachedRevealed) {
          setCachedRoundData(liveRound);
          cachedRoundRef.current = liveRound;
        }
      } else {
        console.warn('[CACHE] Ignoring round from different dealer_game:', {
          roundDealerGameId,
          currentDealerGameId,
          roundId: liveRound.id
        });
      }
    }
  }, [liveRound, game?.status, game?.all_decisions_in, game?.all_decisions_in_round_id, cachedRoundData?.community_cards_revealed, game?.game_type, game?.current_game_uuid]);
  
  // Use cached round ONLY when we intentionally need to preserve visuals across transitions
  // (e.g., showdown/game_over animations). For fresh play/setup, never fall back to old cached rounds.
  // IMPORTANT: Do NOT fall back during `in_progress` gaps (e.g. Holm briefly has no round yet) —
  // that is the primary cause of stale cards/decisions rendering.
  const allowRoundCacheFallback = Boolean(
    (game?.status === 'game_over' || game?.status === 'session_ended') &&
      (cachedRoundData || cachedRoundRef.current)
  );

  // Priority: liveRound > (optional) state cache > (optional) ref cache
  const currentRound =
    liveRound || (allowRoundCacheFallback ? (cachedRoundData || cachedRoundRef.current) : null);

  const threeFiveSevenRolloverPresentation = selectThreeFiveSevenRolloverPresentation(
    directThreeFiveSevenRolloverPresentation,
    {
      gameId,
      gameType: game?.game_type,
      dealerGameId: game?.current_game_uuid,
      roundId: currentRound?.id,
      handNumber: currentRound?.hand_number,
      roundNumber: currentRound?.round_number,
      transferCursor: game?.chip_transfer_cursor,
    },
  );
  const threeFiveSevenAllFoldPresentation = selectThreeFiveSevenAllFoldPresentation(
    directThreeFiveSevenAllFoldPresentation,
    deriveThreeFiveSevenAllFoldPresentation({
      gameId,
      gameType: game?.game_type,
      dealerGameId: game?.current_game_uuid,
      roundId: currentRound?.id,
      handNumber: currentRound?.hand_number,
      roundNumber: currentRound?.round_number,
      roundStatus: currentRound?.status,
      awaitingNextRound: game?.awaiting_next_round,
      lastRoundResult: game?.last_round_result,
      pussyTaxEnabled: game?.pussy_tax_enabled,
      pussyTaxValue: game?.pussy_tax_value,
      transferCursor: game?.chip_transfer_cursor,
    }),
  );




  // Populate the late refs read by the mobile-active-tab observer above
  // (declared at the top of Game for stable-hook order).
  useEffect(() => {
    currentRoundLateRef.current = currentRound ?? null;
    gameStatusLateRef.current = game?.status ?? null;
    composeDraftLateRef.current = mobileChatInput ?? '';
  });


  useEffect(() => {
    const routeShellGameType = game?.game_type ?? lastKnownGameTypeRef.current ?? previousGameConfig?.game_type ?? null;
    const humanPlayers = players.filter((p) => !p.is_bot && p.status !== 'left');
    const isTwoHuman = humanPlayers.length === 2;
    const isTwoHumanGin = isTwoHuman && routeShellGameType === 'gin-rummy';
    // Generic pre-play arm: two human players in any non-terminal status
    // arm the recorder regardless of whether the game type has been
    // chosen yet. Bot-only and single-player sessions never arm. Once a
    // game type becomes known and is not Gin, we stop re-arming but do
    // NOT flush existing events; Gin-specific events downstream simply
    // won't be produced.
    const isGenericPrePlay =
      isTwoHuman &&
      !!game?.status &&
      game.status !== 'game_over' &&
      game.status !== 'session_ended' &&
      (routeShellGameType === null || routeShellGameType === 'gin-rummy');
    const current = {
      status: game?.status ?? null,
      phase: ((currentRound as any)?.gin_rummy_state as any)?.phase ?? null,
      gameType: game?.game_type ?? routeShellGameType ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      roundId: currentRound?.id ?? null,
      handNumber: (currentRound as any)?.hand_number ?? null,
      activeTab: mobileActiveTab,
    };
    if (isGenericPrePlay || isTwoHumanGin) {
      armGinPhaseTrace({
        sessionKey: `${gameId ?? 'no-game'}:${current.dealerGameId ?? 'no-dealer-game'}`,
        identity: { gameId: gameId ?? null, dealerGameId: current.dealerGameId, roundId: current.roundId, handNumber: current.handNumber },
        detail: {
          owner: 'Game shell',
          status: current.status,
          phase: current.phase,
          routeShellGameType,
          humanPlayerCount: humanPlayers.length,
          activeTab: mobileActiveTab,
          armCause: isTwoHumanGin ? 'two-human-gin' : 'two-human-generic-pre-play',
        },
      });
    }
    if (!isTwoHumanGin && routeShellGameType !== 'gin-rummy') return;
    const prev = ginPhaseTracePrevAuthRef.current;
    const anteDecisions = players.map((p) => ({ id: p.id, isBot: p.is_bot, anteDecision: p.ante_decision ?? null, status: p.status, sittingOut: p.sitting_out }));
    const activeHumans = humanPlayers.filter((p) => !p.sitting_out);
    const allHumanAntesResolved = activeHumans.length > 0 && activeHumans.every((p) => !!p.ante_decision || p.sitting_out);
    recordGinPhaseTrace({
      kind: 'authoritative-state-update',
      summary: `Game authoritative state ${prev?.status ?? '(init)'} → ${current.status}`,
      sourceFile: 'src/pages/Game.tsx',
      sourceFunction: 'Game.ginPhaseTraceAuthoritativeEffect',
      identity: { gameId: gameId ?? null, dealerGameId: current.dealerGameId, roundId: current.roundId, handNumber: current.handNumber },
      detail: {
        source: 'hydration/realtime/fetch React state projection',
        before: prev,
        after: current,
        activeTabBefore: prev?.activeTab ?? null,
        activeTabAfter: current.activeTab,
        anteDecisions,
        allHumanAntesResolved,
        activeHumanCount: activeHumans.length,
      },
    });
    if (prev?.status === 'ante_decision' && current.status === 'in_progress') {
      markGinPhaseTraceAnteResolved({
        identity: { gameId: gameId ?? null, dealerGameId: current.dealerGameId, roundId: current.roundId, handNumber: current.handNumber },
        detail: { before: prev, after: current, anteDecisions, allHumanAntesResolved },
      });
    }
    ginPhaseTracePrevAuthRef.current = current;
  }, [game, players, currentRound, mobileActiveTab, gameId, previousGameConfig]);

  // ── 357: Refresh soft-lock diagnostic ─────────────────────────────
  // Captures the exact runtime values feeding `allDecisionsIn` when the
  // local player is UNDECIDED but the derivation still evaluates true —
  // the precise condition that suppresses the Stay/Fold action row on
  // a mid-round refresh. Fires once per unique presentation snapshot.
  const softLockProbeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!is357GameType) return;
    if (!threeFiveSevenView || !currentRound || !gameId) return;
    const localPlayer = players.find(p => p.user_id === user?.id);
    if (!localPlayer) return;
    const localUndecided =
      localPlayer.status === 'active' &&
      !localPlayer.decision_locked &&
      !localPlayer.sitting_out;
    if (!localUndecided) return;
    const allDecidedComputed = threeFiveSevenView.players.every(p =>
      p.decisionLocked || p.sittingOut || p.autoFold,
    );
    if (!allDecidedComputed) return;
    const key = `${currentRound.id}|${threeFiveSevenView.roundId}|${threeFiveSevenView.players.map(p => `${p.playerId}:${p.decisionLocked ? 1 : 0}`).join(',')}`;
    if (softLockProbeKeyRef.current === key) return;
    softLockProbeKeyRef.current = key;
    persistSyncDebugEvent({
      gameId,
      gameType: '3-5-7',
      handNumber: currentRound.hand_number ?? 0,
      roundId: currentRound.id,
      eventType: 'invariant',
      severity: 'warn',
      eventName: '357.refresh.softlock_probe',
      payload: {
        authoritative: {
          roundId: currentRound.id,
          roundNumber: currentRound.round_number,
          handNumber: currentRound.hand_number,
          dealerGameId: (currentRound as any).dealer_game_id ?? null,
          status: currentRound.status,
        },
        presentation: {
          roundId: threeFiveSevenView.roundId,
          roundNumber: threeFiveSevenView.roundNumber,
          handNumber: threeFiveSevenView.handNumber,
          roundStatus: threeFiveSevenView.roundStatus,
        },
        roundIdMatch: currentRound.id === threeFiveSevenView.roundId,
        roundNumberMatch: currentRound.round_number === threeFiveSevenView.roundNumber,
        presentationPlayers: threeFiveSevenView.players.map(p => ({
          playerId: p.playerId,
          position: p.position,
          decisionLocked: p.decisionLocked,
          decision: p.decision,
          sittingOut: p.sittingOut,
          autoFold: p.autoFold,
          status: (p as any).status ?? null,
        })),
        rawPlayers: players.map(p => ({
          playerId: p.id,
          position: p.position,
          decisionLocked: p.decision_locked,
          decision: p.current_decision,
          sittingOut: p.sitting_out,
          autoFold: p.auto_fold,
          status: p.status,
          isLocal: p.user_id === user?.id,
        })),
        localPlayerId: localPlayer.id,
        allDecidedComputed,
        syncFrozen: threeFiveSevenSync.isFrozen,
        syncOptimistic: threeFiveSevenSync.isOptimistic,
      },
    });
  }, [
    is357GameType,
    threeFiveSevenView,
    currentRound,
    players,
    user?.id,
    gameId,
    threeFiveSevenSync.isFrozen,
    threeFiveSevenSync.isOptimistic,
  ]);



  useEffect(() => {
    recordStartupValue('STATUS TIMELINE', 'Game.status', game?.status ?? null, {
      file: 'src/pages/Game.tsx',
      gameId,
      gameType: game?.game_type ?? null,
    });
    recordStartupValue('IDENTITY TIMELINE', 'game.game_type', game?.game_type ?? null, { file: 'src/pages/Game.tsx', gameId });
    recordStartupValue('IDENTITY TIMELINE', 'game.current_game_uuid', (game as any)?.current_game_uuid ?? null, { file: 'src/pages/Game.tsx', gameId });
    recordStartupValue('ROUND TIMELINE', 'currentRound populated', currentRound ? {
      id: currentRound.id ?? null,
      dealer_game_id: (currentRound as any)?.dealer_game_id ?? null,
      hand_number: currentRound.hand_number ?? null,
      round_number: currentRound.round_number ?? null,
      hasGinRummyState: !!((currentRound as any)?.gin_rummy_state),
    } : null, { file: 'src/pages/Game.tsx', gameId });
    recordStartupValue('ROUND TIMELINE', 'currentRound.id available', currentRound?.id ?? null, { file: 'src/pages/Game.tsx', gameId });
    recordStartupValue('ROUND TIMELINE', 'currentRound.dealer_game_id available', (currentRound as any)?.dealer_game_id ?? null, { file: 'src/pages/Game.tsx', gameId });
  }, [game?.status, game?.game_type, (game as any)?.current_game_uuid, currentRound?.id, (currentRound as any)?.dealer_game_id, currentRound?.hand_number, currentRound?.round_number, gameId]);

  // F5.1/F4.2: identity-scoped all_decisions_in. Raw `game.all_decisions_in` can
  // persist across hand/round transitions and is the systemic source of the
  // stale-progression-flag bug class. Always consume this scoped value for
  // render and effect logic.
  const allDecisionsInScoped: boolean = isAllDecisionsInFor(game, currentRound?.id);


  // useBotDecisionEnforcer was removed entirely - it was a band-aid that caused race conditions

  // DEBUG: show a "Round: X" toast whenever round number/id changes

  // CRITICAL: Clear optimistic decision UI whenever we move to a new hand/round.
  // Otherwise the UI can keep showing "STAYED/FOLDED" from the previous hand via pendingDecision.
  useEffect(() => {
    setPendingDecision(null);
  }, [cardStateContext?.roundId, currentRound?.id, currentRound?.round_number, game?.status]);

  // NOTE: Boundary reset effect removed — caused 2–3 competing clears with the
  // realtime/fetch paths (Game.tsx ~1750, ~4793), producing a multi-flash on deal.
  // Realtime round-change handler + fetch-no-cards handler already cover the boundary.

  // Compute current card identity to detect new hands
  const communityCards = currentRound?.community_cards as CardType[] | undefined;
  const currentCardIdentity = communityCards?.map(c => `${c.rank}${c.suit}`).join(',') || '';

  // Hand context key: Holm reuses the same round_number (and sometimes the same round id) across hands.
  // So we include the card identity + chucky state to force child UI caches to reset on true hand changes.
  // CRITICAL (Holm regression fix): For Holm, derive identity from holmView (presentationState) so
  // identity and the data flowing into capture logic come from the SAME layer. Otherwise, when the
  // visual contract freezes presentation at hand N while raw round advances to hand N+1, capture
  // logic ran with identity=N+1 + data=N (buffered), re-locking the prior solo player.
  const holmHandIdentityCards = (game?.game_type === 'holm-game' && holmView)
    ? (holmView.communityCards as CardType[] | undefined)?.map(c => `${c.rank}${c.suit}`).join(',') ?? ''
    : currentCardIdentity;
  // Hand identity is stable across the WHOLE hand. It must NOT include intra-hand
  // reveal progression (communityCardsRevealed, chuckyActive, chuckyCardsRevealed),
  // otherwise downstream caches/animations reset mid-reveal and replay/batch cards.
  // Positive lifecycle contract for 3-5-7 (and any other consumer of this
  // readiness gate): the presentation is authoritative ONLY when a dealer
  // game exists, a current round exists, AND that round belongs to the
  // current dealer game. Any other state — either side null, or a real
  // mismatch — is "not ready". This expresses the mount contract directly
  // instead of accumulating null/mismatch exceptions.
  const currentDealerGameIdForArtifacts = game?.current_game_uuid ?? null;
  const currentRoundDealerGameIdForArtifacts = (currentRound as any)?.dealer_game_id ?? null;
  const isCurrentRoundAuthoritativeForDealerGame = !!(
    currentDealerGameIdForArtifacts &&
    currentRoundDealerGameIdForArtifacts &&
    currentRoundDealerGameIdForArtifacts === currentDealerGameIdForArtifacts
  );
  const currentRoundNotReadyForPresentation = !isCurrentRoundAuthoritativeForDealerGame;
  // Back-compat alias for existing consumers below (round-id gating, cache
  // key nulling). Behavioral semantics unchanged for the mismatch case and
  // strictly tightened for the transient-null case (now also treated as
  // not-ready, matching the mount gate).
  const hasCurrentRoundDealerGameMismatch = currentRoundNotReadyForPresentation;

  // Holm uses a STABLE per-hand lifecycle key: (roundId, handNumber). It MUST
  // NOT include community-card identity — those reveal progressively during
  // the hand and any churn here would remount DealRuntime mid-hand, clear
  // isHolmHandReady, and brick pre-decisions / bots / live decisions.
  // See: holmDealIdentityKey contract.
  const holmDealIdentityKey = (game?.game_type === 'holm-game' && holmView)
    ? `${holmView.roundId}:h${holmView.handNumber}`
    : null;
  // Holm must never fall back to currentCardIdentity here. During a delayed
  // presentation hydration, that fallback changes as cards arrive and would
  // remount DealRuntime with fresh transport IDs for the same hand. Match
  // Gin's admission rule instead: no committed Holm identity means no deal
  // runtime or orchestrator yet.
  const handContextKey = hasCurrentRoundDealerGameMismatch
    ? null
    : game?.game_type === 'holm-game'
      ? holmDealIdentityKey
      : (cardStateContext?.roundId ??
        (currentRound?.id
          ? `${currentRound.id}:${currentCardIdentity}`
          : null));
  // holmHandIdentityCards retained above ONLY for non-readiness consumers
  // (capture-logic identity guards). Not used as a lifecycle key.
  void holmHandIdentityCards;

  const authoritativeHolmHandIdentity = game?.game_type === 'holm-game'
    && currentRound?.dealer_game_id
    && currentRound.id
    && typeof currentRound.hand_number === 'number'
      ? {
          dealerGameId: currentRound.dealer_game_id,
          roundId: currentRound.id,
          handNumber: currentRound.hand_number,
        }
      : null;
  const holmPresentedHandIsAuthoritative = isSameHolmPresentationHand(
    holmPresentationIdentity,
    authoritativeHolmHandIdentity,
  );
  const holmDecisionPresentationReady = game?.game_type !== 'holm-game'
    || (holmPresentedHandIsAuthoritative && isHolmHandReady(handContextKey));
  const holmPresentedDecisionTimer = game?.game_type === 'holm-game'
    && holmDecisionPresentationReady
    && currentDecisionTimerPresentation
    && isSameHolmPresentationHand(currentDecisionTimerPresentation, holmPresentationIdentity)
      ? currentDecisionTimerPresentation
      : null;

  const recordHolmDecisionSubmission = useCallback((params: {
    source: 'live stay' | 'live fold' | 'pre-stay execute' | 'pre-fold execute' | 'bot action' | 'bot deadline' | 'server-timeout observed' | 'unknown';
    actor?: Pick<Player, 'id' | 'position' | 'user_id' | 'is_bot'> | null;
    decision?: 'stay' | 'fold' | null;
    makeDecisionInvoked: boolean;
    requestStatus: 'accepted' | 'rejected' | 'error';
    errorMessage?: string | null;
    extra?: Record<string, unknown>;
  }) => {
    if (game?.game_type !== 'holm-game') return;
    if (!isHolmTraceArmed()) return;

    const authoritativeCurrentTurnPosition =
      latestAuthoritativeTurnRef.current?.currentTurnPosition ??
      currentRound?.current_turn_position ??
      null;
    const actorPosition = typeof params.actor?.position === 'number' ? params.actor.position : null;
    // Defensive: callers reaching us through onClick handlers can pass a synthetic event as the
    // traceSource. Coerce to a deterministic string so the export never shows [object Object].
    const sourceLabel = typeof params.source === 'string'
      ? params.source
      : `unknown(${Object.prototype.toString.call(params.source)})`;
    recordHolmTrace('DECISION_SUBMISSION', `${sourceLabel} actor=${actorPosition ?? 'null'} status=${params.requestStatus}`, {
      timestamp: new Date().toISOString(),
      actorPosition,
      actorId: params.actor?.id ?? null,
      actorUserId: params.actor?.user_id ?? null,
      actorIsBot: params.actor?.is_bot ?? null,
      decision: params.decision ?? null,
      source: sourceLabel,
      rawSourceArg: typeof params.source === 'string' ? undefined : Object.prototype.toString.call(params.source),
      stableHandIdentity: holmDealIdentityKey ?? handContextKey,
      roundId: currentRound?.id ?? null,
      handNumber: currentRound?.hand_number ?? holmView?.handNumber ?? null,
      authoritativeCurrentTurnPosition,
      authorityMatchesActor: actorPosition != null ? authoritativeCurrentTurnPosition === actorPosition : null,
      pendingDecision,
      preDecisionArmState: holmPreDecisionArmedRef.current,
      makeDecisionInvoked: params.makeDecisionInvoked,
      requestStatus: params.requestStatus,
      errorMessage: params.errorMessage ?? null,
      latestAuthoritativeTurn: latestAuthoritativeTurnRef.current,
      ...params.extra,
    });
  }, [game?.game_type, currentRound?.id, currentRound?.current_turn_position, currentRound?.hand_number, holmDealIdentityKey, handContextKey, holmView?.handNumber, pendingDecision]);

  // Reset when starting new game OR when cards change (new hand)
  if (game?.status === 'game_selection' || game?.status === 'configuring' || game?.status === 'dealer_selection') {
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';
  } else if (currentCardIdentity && currentCardIdentity !== cardIdentityRef.current) {
    // Cards changed - this is a new hand, reset the max
    // CRITICAL: For Holm, use sync framework's revealed count to avoid raw DB racing ahead
    cardIdentityRef.current = currentCardIdentity;
    const resetRevealed = (game?.game_type === 'holm-game' && holmView)
      ? holmView.communityCardsRevealed
      : (currentRound?.community_cards_revealed ?? 0);
    maxRevealedRef.current = resetRevealed;
    
  } else if (currentRound?.community_cards_revealed !== undefined) {
    // Same hand, only increase max (never decrease)
    // For Holm: use presentation state as input (already monotonic via sync framework)
    const revealedInput = (game?.game_type === 'holm-game' && holmView)
      ? holmView.communityCardsRevealed
      : currentRound.community_cards_revealed;
    maxRevealedRef.current = Math.max(maxRevealedRef.current, revealedInput);
  }
  
  // Effective revealed count - use max during showdowns/game_over/completed rounds/awaiting next to prevent re-hiding
  // CRITICAL: For Holm, use sync-framework phase (holmView) instead of raw DB scalars
  // that arrive on a separate realtime channel and can race ahead of the round state.
  const isHolmWithSync = game?.game_type === 'holm-game' && !!holmView;
  const shouldUseMax = isHolmWithSync
    ? (
        game?.status === 'game_over' ||
        game?.status === 'session_ended' ||
        holmView!.roundStatus === 'showdown' ||
        holmView!.roundStatus === 'completed' ||
        game?.awaiting_next_round
      )
    : (
        game?.status === 'game_over' ||
        game?.status === 'session_ended' ||
        isAllDecisionsInFor(game, currentRound?.id) ||
        currentRound?.status === 'completed' ||
        game?.awaiting_next_round
      );
  
  // For Holm: base revealed count comes from presentation state when available
  const baseRevealedCount = isHolmWithSync
    ? holmView!.communityCardsRevealed
    : (currentRound?.community_cards_revealed ?? 0);
  
  const effectiveCommunityCardsRevealed = shouldUseMax
    ? maxRevealedRef.current
    : baseRevealedCount;

  const presentationRoundIdForCards = hasCurrentRoundDealerGameMismatch
    ? null
    : game?.game_type === 'holm-game' && holmView
    ? holmView.roundId
    : (currentRound?.id ?? null);
  const playerCardsForPresentation = hasCurrentRoundDealerGameMismatch
    ? []
    : !presentationRoundIdForCards
    ? []
    : !playerCardsIdentity || playerCardsIdentity.roundId !== presentationRoundIdForCards
    ? []
    : playerCards;
  const allDecisionsInForPresentation = game?.game_type === 'holm-game' && holmView
    ? holmView.players.filter(p => !p.sittingOut).every(p => p.decisionLocked)
    : (isAllDecisionsInFor(game, currentRound?.id) || false);
  const chuckyCardsForPresentation = game?.game_type === 'holm-game' && holmView
    ? (holmView.chuckyCards as CardType[] | undefined)
    : (currentRound?.chucky_cards as CardType[] | undefined);
  const chuckyActiveForPresentation = game?.game_type === 'holm-game' && holmView
    ? holmView.chuckyActive
    : currentRound?.chucky_active;
  const chuckyCardsRevealedForPresentation = game?.game_type === 'holm-game' && holmView
    ? holmView.chuckyCardsRevealed
    : currentRound?.chucky_cards_revealed;
  
  // [holm-sync] Invariant checks + diagnostic log at render boundary
  if (isHolmWithSync && game?.status === 'in_progress') {
    const handKey = `${holmView!.roundId}:${holmView!.handNumber}`;
    runHolmInvariants({
      gameId: game?.id,
      roundStatus: holmView!.roundStatus,
      effectiveRevealed: effectiveCommunityCardsRevealed,
      handNumber: holmView!.handNumber,
      handKey,
      allDecisionsIn: isAllDecisionsInFor(game, holmView!.roundId),
      chuckyActive: holmView!.chuckyActive ?? false,
    });

  }
    
  // Only log when community cards might have an issue (no cards during in_progress)
  if (game?.game_type === 'holm-game' && game?.status === 'in_progress' && (!communityCards || communityCards.length === 0)) {
    console.warn('[GAME.TSX COMMUNITY_CARDS] ⚠️ No community cards during in_progress:', {
      currentRoundId: currentRound?.id,
      liveRoundId: liveRound?.id,
      cachedRoundId: cachedRoundData?.id,
      hasCachedRef: !!cachedRoundRef.current
    });
  }

  // CRITICAL: Healing poll for missing round/community cards/player cards in Holm games
  // When we're in_progress with a Holm game but have no community cards OR player cards, poll until we get them
  const roundHealingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    const isHolmGame = game?.game_type === 'holm-game';
    const isInProgress = game?.status === 'in_progress';
    const hasCommunityCards = communityCards && communityCards.length > 0;
    const hasRoundData = currentRound && currentRound.community_cards;
    
    // Also check for player cards - critical for game type switches
    const hasPlayerCards = playerCards && playerCards.length > 0;
    // For Holm, validate we have 4 cards per player
    const hasValidPlayerCards = hasPlayerCards && playerCards.some(pc => {
      const cards = pc.cards as unknown as any[];
      return cards && cards.length === 4;
    });
    
    const needsCommunityHealing = isHolmGame && isInProgress && !hasCommunityCards && !hasRoundData && !game?.awaiting_next_round;
    const needsPlayerCardHealing = isHolmGame && isInProgress && !hasValidPlayerCards && !game?.awaiting_next_round;
    const needsHealing = needsCommunityHealing || needsPlayerCardHealing;
    
    if (needsHealing) {
      if (safetyPollsDisabled) return;
      console.log('[ROUND HEAL] 🚑 Holm game needs healing:', {
        needsCommunityHealing,
        needsPlayerCardHealing,
        playerCardsCount: playerCards?.length,
        hasValidPlayerCards
      });
      
      const healingPoll = async () => {
        console.log('[ROUND HEAL] 🔄 Polling for round/player card data...');
        await fetchGameData();
      };
      
      // Start polling every 2 seconds (not 300ms which hammers DB)
      healingPoll(); // Immediate first attempt
      roundHealingRef.current = setInterval(healingPoll, 2000);
      
      return () => {
        if (roundHealingRef.current) {
          clearInterval(roundHealingRef.current);
          roundHealingRef.current = null;
        }
      };
    } else if (roundHealingRef.current && hasCommunityCards && hasValidPlayerCards) {
      // Stop polling if we got both community and player cards
      console.log('[ROUND HEAL] ✅ Got community and player cards, stopping poll');
      clearInterval(roundHealingRef.current);
      roundHealingRef.current = null;
    }
  }, [game?.game_type, game?.status, communityCards, currentRound, game?.awaiting_next_round, playerCards]);

  // Auto-trigger bot decisions when appropriate
  // Use a ref to track if we're already processing a bot decision to avoid duplicates
  // SKIP if game is paused
  const botProcessingRef = useRef(false);
  // LOST-WAKEUP LATCH (P0 bot-controller ownership fix).
  // `botProcessingRef` is a synchronous in-flight guard. Authority can advance
  // WHILE a dispatch is in flight (the in-flight dispatch's own
  // fetchGameData stamps latestAuthoritativeTurnRef and bumps
  // holmAuthorityTick *before* the `finally` clears the guard). The effect run
  // caused by that tick was silently dropped, and because the new authority
  // (the next bot's turn) produces no further state change, the turn parked
  // forever. Latch the dropped wake and replay it exactly once when the
  // in-flight dispatch settles. Idempotent + disconnect/reconnect-safe:
  // exactly-once execution is still enforced in the DB
  // (current_decision IS NULL + atomic current_turn_position CAS).
  const botWakePendingRef = useRef(false);
  const [botWakeTick, setBotWakeTick] = useState(0);
  // SCHEDULER DRAIN (P0 lost-wake fix, second edge).
  // The latch above only recovers wakes that were *dropped by the in-flight
  // guard*. It cannot recover a bot turn that became authoritative while no
  // client was evaluating (reconnect, tab resume, remount onto an
  // already-parked turn) because no authority *transition* is observed on that
  // client. These are explicit, event-driven drains — no polling, no timers.
  const [botDrainTick, setBotDrainTick] = useState(0);
  // Re-render-trigger for Holm deal-ready barrier flips so the bot
  // trigger effect re-evaluates the moment the deal completes.
  const [holmReadyTick, setHolmReadyTick] = useState(0);
  // Increments on every authoritative turn-ref stamp (realtime INSERT/UPDATE
  // + fetchGameData). Bot scheduler depends on THIS, not currentRound — that
  // is the only way to keep actor selection and the final-boundary guard
  // reading from the same authority source.
  const [holmAuthorityTick, setHolmAuthorityTick] = useState(0);
  useEffect(() => subscribeHolmHandReady(() => setHolmReadyTick(t => t + 1)), []);
  useEffect(() => {
    const drain = () => setBotDrainTick(t => t + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') drain(); };
    window.addEventListener('app:realtime-reconnect', drain);
    window.addEventListener('focus', drain);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('app:realtime-reconnect', drain);
      window.removeEventListener('focus', drain);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useEffect(() => {
    if (safetyPollsDisabled) {
      if (awaitingPollRef.current) {
        clearInterval(awaitingPollRef.current);
        awaitingPollRef.current = null;
      }
      return;
    }

    const isHolmGame = game?.game_type === 'holm-game';

    // POSITIVE WHITELIST: only games that use the shared generic decision
    // loop (Holm, 3-5-7) should trigger makeBotDecisions. All other game
    // types own their bot logic and must not enter this path.
    const gType = game?.game_type;
    const usesGenericDecisionLoop =
      gType === 'holm-game' || gType === 'holm' ||
      gType === '3-5-7' || gType === '3-5-7-game' || gType === '357';
    if (!usesGenericDecisionLoop) {
      return;
    }

    // CRITICAL: Skip bot decisions if game is paused
    if (game?.is_paused) {
      console.log('[BOT TRIGGER] Game is paused, skipping bot decisions');
      return;
    }
    
    
    console.log('[BOT TRIGGER EFFECT] Running', {
      status: game?.status,
      all_decisions_in: isAllDecisionsInFor(game, currentRound?.id),
      // (raw_all_decisions_in removed — flag is identity-scoped via all_decisions_in_round_id)
      all_decisions_in_round_id: game?.all_decisions_in_round_id ?? null,
      game_type: game?.game_type,
      current_turn: currentRound?.current_turn_position,
      round_id: currentRound?.id,
      isProcessing: botProcessingRef.current,
      is_paused: game?.is_paused
    });
    
    // Skip if already processing — but LATCH the wake so it is replayed once
    // the in-flight dispatch settles (see LOST-WAKEUP LATCH above).
    if (botProcessingRef.current) {
      botWakePendingRef.current = true;
      console.log('[BOT TRIGGER] Already processing a bot decision — wake latched for replay');
      return;
    }
    
    if (game?.status === 'in_progress' && !isAllDecisionsInFor(game, currentRound?.id)) {
      // ─────────────────────────────────────────────────────────────
      // P0 single-snapshot rule: scheduler actor identity comes from
      // latestAuthoritativeTurnRef for Holm — the same source the
      // final-boundary guard validates against. Reading from
      // currentRound here is what caused bot-N+1 to be scheduled while
      // authority remained bot-N (the React snapshot is updated by the
      // post-decision fetchGameData before realtime stamps the ref).
      // For non-Holm games, retain the prior currentRound behavior.
      // ─────────────────────────────────────────────────────────────
      let capturedTurnPosition: number | null | undefined;
      let capturedRoundId: string | null = null;
      let capturedAuthorityEpoch: number = authoritativeTurnEpochRef.current;
      if (isHolmGame) {
        const auth = latestAuthoritativeTurnRef.current;
        capturedTurnPosition = auth?.currentTurnPosition ?? null;
        capturedRoundId = auth?.roundId ?? null;
        capturedAuthorityEpoch = auth?.epoch ?? authoritativeTurnEpochRef.current;
        if (!capturedTurnPosition) {
          console.log('[BOT TRIGGER] Holm: no authoritative turn position yet, skipping');
          return;
        }
        if (!isHolmHandReady(handContextKey)) {
          console.log('[BOT TRIGGER] Holm deal not complete — barrier blocks bot decision', { handContextKey });
          return;
        }
      } else {
        capturedTurnPosition = currentRound?.current_turn_position;
        capturedRoundId = currentRound?.id ?? null;
      }

      // Full authority identity captured for this dispatch. The `finally`
      // drain compares against this exact key so no advance can vanish.
      const capturedAuthorityKey = isHolmGame
        ? `${capturedRoundId}:${capturedTurnPosition ?? null}:${capturedAuthorityEpoch}`
        : null;

      console.log('[BOT TRIGGER] Triggering bot decisions', {
        game_type: game?.game_type,
        captured_turn: capturedTurnPosition,
        captured_round: capturedRoundId,
        captured_epoch: capturedAuthorityEpoch,
        source: isHolmGame ? 'authoritative-ref' : 'currentRound',
      });

      // Set processing flag
      botProcessingRef.current = true;
      
      // Call immediately - no delay needed, makeBotDecisions has its own delay
      const triggerBot = async () => {
        try {
          // FINAL-BOUNDARY BOT GUARD (P0 invariant).
          // A "bot action" path may only invoke makeBotDecisions when ALL of:
          //   - actor at the captured position is a bot (live playersRef)
          //   - actor's position === latest authoritative current_turn_position
          //   - actor has not already submitted/locked a decision
          //   - canonical Holm deal readiness is true (already guarded above for Holm)
          // Without this guard, the effect would fire makeBotDecisions for a
          // HUMAN seat whenever current_turn_position transitioned through it,
          // mislabeling the attempt as "bot action" in the trace.
          // FINAL-BOUNDARY GUARD SCOPING:
          // This guard was designed for Holm's single-actor, ordered
          // decision model where current_turn_position is always the
          // authoritative next-to-act bot. In 3-5-7 all undecided bots
          // decide simultaneously and `current_turn_position` is null
          // (there is no per-seat turn). Applying the guard to 3-5-7
          // rejects every dispatch with `no-actor-at-position`, so bots
          // never live-decide and cron catches the round up later.
          // Restrict the guard to Holm — makeBotDecisions itself scopes
          // to bots with current_decision IS NULL for 3-5-7.
          const botActor = playersRef.current.find(p => p.position === capturedTurnPosition) ?? null;
          const authSnap = latestAuthoritativeTurnRef.current;
          const authoritativePos = authSnap?.currentTurnPosition ?? (isHolmGame ? null : currentRound?.current_turn_position ?? null);
          const authorityEpochNow = authSnap?.epoch ?? authoritativeTurnEpochRef.current;
          const authorityRoundIdNow = authSnap?.roundId ?? null;
          const actorIsBot = botActor?.is_bot === true;
          const authorityMatchesActor = botActor != null && authoritativePos === botActor.position;
          const decisionAlreadyLocked = !!(botActor && (botActor as any).decision_locked);
          // P0: reject if authority has already advanced past the captured
          // snapshot. Wait for the next holmAuthorityTick instead of spinning.
          const epochDrifted = isHolmGame && (authorityEpochNow !== capturedAuthorityEpoch || authorityRoundIdNow !== capturedRoundId);

          if (isHolmGame && (!botActor || !actorIsBot || !authorityMatchesActor || decisionAlreadyLocked || epochDrifted)) {
            console.log('[BOT TRIGGER] final-boundary guard rejected', {
              capturedTurnPosition,
              capturedAuthorityEpoch,
              authoritativePos,
              authorityEpochNow,
              actorPosition: botActor?.position ?? null,
              actorIsBot,
              authorityMatchesActor,
              decisionAlreadyLocked,
              epochDrifted,
            });
            recordHolmDecisionSubmission({
              source: 'bot action',
              actor: botActor,
              decision: null,
              makeDecisionInvoked: false,
              requestStatus: 'rejected',
              extra: {
                capturedTurnPosition,
                capturedAuthorityEpoch,
                authoritativePos,
                authorityEpochNow,
                guardReason: epochDrifted
                  ? 'authority-epoch-drifted'
                  : !botActor
                    ? 'no-actor-at-position'
                    : !actorIsBot
                      ? 'actor-not-bot'
                      : !authorityMatchesActor
                        ? 'authority-mismatch'
                        : 'decision-already-locked',
              },
            });
            return;
          }

          console.log('[BOT TRIGGER] *** CALLING makeBotDecisions with turn position:', capturedTurnPosition, '***');
          const botMadeDecision = await makeBotDecisions(gameId!, capturedTurnPosition);
          recordHolmDecisionSubmission({
            source: 'bot action',
            actor: botActor,
            decision: null,
            makeDecisionInvoked: true,
            requestStatus: botMadeDecision ? 'accepted' : 'rejected',
            extra: { capturedTurnPosition, authoritativePos },
          });

          // If bot made a decision, explicitly fetch to get updated turn position
          if (botMadeDecision) {
            console.log('[BOT TRIGGER] *** Bot decided, forcing fetch to get updated turn position ***');
            await fetchGameData();
          }
        } catch (error: any) {
          const botActor = playersRef.current.find(p => p.position === capturedTurnPosition) ?? null;
          recordHolmDecisionSubmission({
            source: 'bot action',
            actor: botActor,
            decision: null,
            makeDecisionInvoked: true,
            requestStatus: 'error',
            errorMessage: error?.message ?? String(error),
            extra: { capturedTurnPosition },
          });
          throw error;
        } finally {
          botProcessingRef.current = false;
          // Replay a dropped wake, or self-wake when authority advanced
          // during this dispatch (the drifted snapshot is exactly the case
          // that previously parked the turn with no further state change).
          // Authority identity is compared as a full key (round + turn +
          // epoch): comparing epoch/round alone let a turn advance that
          // re-used the epoch counter path disappear, and a guard rejection
          // consumed the wake permanently.
          const authAfter = latestAuthoritativeTurnRef.current;
          const authorityKeyAfter = isHolmGame
            ? `${authAfter?.roundId ?? null}:${authAfter?.currentTurnPosition ?? null}:${authAfter?.epoch ?? authoritativeTurnEpochRef.current}`
            : null;
          const authorityMoved = isHolmGame && authorityKeyAfter !== capturedAuthorityKey;
          if (botWakePendingRef.current || authorityMoved) {
            botWakePendingRef.current = false;
            setBotWakeTick(t => t + 1);
          }
        }
      };

      
      triggerBot().catch(() => { /* handled via recordHolmDecisionSubmission */ });
    } else {
      console.log('[BOT TRIGGER] Conditions not met for bot trigger');
    }
  }, [
    game?.status,
    game?.all_decisions_in,
    game?.all_decisions_in_round_id,
    game?.is_paused,
    // Holm: re-evaluate on authority changes (one snapshot source).
    // Non-Holm: retain currentRound deps so existing 3-5-7 path is unchanged.
    holmAuthorityTick,
    currentRound?.current_turn_position,
    currentRound?.id,
    game?.game_type,
    gameId,
    handContextKey,
    holmReadyTick,
    botWakeTick,
    botDrainTick,
  ]);
  // Holm final-decision recovery is event-driven. Timeout enforcement can be
  // the writer that records the final fold, so no decision-making client is
  // guaranteed to remain in the call stack that normally invokes
  // endHolmRound. Every connected participant evaluates the same scoped
  // authoritative edge; endHolmRound's betting -> processing CAS selects the
  // single settlement owner.
  const holmResolutionRecoveryInFlightRef = useRef<string | null>(null);
  const holmParticipantPresent = players.some(
    player => player.user_id === user?.id && player.status !== 'observer' && player.status !== 'left',
  );
  const holmResolutionRecoveryKey = getHolmResolutionRecoveryKey({
    gameId,
    gameType: game?.game_type,
    gameStatus: game?.status,
    dealerGameId: game?.current_game_uuid,
    roundId: currentRound?.id,
    roundStatus: currentRound?.status,
    allDecisionsInForRound: isAllDecisionsInFor(game, currentRound?.id),
    participantPresent: holmParticipantPresent,
  });

  useEffect(() => {
    if (!gameId || !holmResolutionRecoveryKey) return;
    if (holmResolutionRecoveryInFlightRef.current === holmResolutionRecoveryKey) return;

    holmResolutionRecoveryInFlightRef.current = holmResolutionRecoveryKey;
    console.warn('[HOLM RECOVERY] Final decision is authoritative while round is still betting; resolving now', {
      gameId,
      dealerGameId: game?.current_game_uuid ?? null,
      roundId: currentRound?.id ?? null,
    });

    void endHolmRound(gameId)
      .catch((error) => {
        console.error('[HOLM RECOVERY] endHolmRound failed', error);
      })
      .finally(() => {
        if (holmResolutionRecoveryInFlightRef.current === holmResolutionRecoveryKey) {
          holmResolutionRecoveryInFlightRef.current = null;
        }
      });
  }, [
    gameId,
    holmResolutionRecoveryKey,
    holmAuthorityTick,
    botDrainTick,
    game?.current_game_uuid,
    currentRound?.id,
  ]);

  // Auto-execute pre-fold/pre-stay OR auto-fold when it becomes player's turn in Holm games
  // For 3-5-7, auto-fold immediately when round starts if player has auto_fold=true
  const instantAutoFoldKeyRef = useRef<string | null>(null);
  const instant357AutoFoldKeyRef = useRef<string | null>(null);
  const instant357OtherPlayersAutoFoldRef = useRef<Set<string>>(new Set());
  const recover357EndRoundKeyRef = useRef<string | null>(null);

  // 3-5-7 RECOVERY: Resume either side of the authoritative round boundary:
  // - betting + identity-matched all_decisions_in means resolution never claimed the round;
  // - completed + exactly one terminal winner means the final leg committed but settlement
  //   was interrupted before the replay-safe terminal RPC returned.
  //
  // P0 follow-up: identity-scoping via isAllDecisionsInFor() guarantees the flag was set against
  // THIS round, so the prior "stale flag from a previous hand → reset it" branch is no longer
  // reachable and has been removed.
  useEffect(() => {
    const is357Game =
      game?.game_type === "3-5-7" || game?.game_type === "3-5-7-game" || game?.game_type === "357";
    if (!is357Game) return;
    if (game?.status !== "in_progress") return;
    if (game?.is_paused) return;
    if (game?.awaiting_next_round) return;
    if (!currentRound) return;
    if (!gameId) return;

    const terminalWinnerCount = players.filter(
      (player) => (player.legs || 0) >= (game?.legs_to_win || 3),
    ).length;
    const shouldRecoverUnclaimedRound =
      currentRound.status === "betting" && isAllDecisionsInFor(game, currentRound.id);
    const shouldRecoverTerminalSettlement =
      currentRound.status === "completed" && terminalWinnerCount === 1;
    if (!shouldRecoverUnclaimedRound && !shouldRecoverTerminalSettlement) return;

    const recoveryKind = shouldRecoverTerminalSettlement ? "terminalSettlement" : "endRound";
    const key = `${currentRound.id}:recover:${recoveryKind}`;
    if (recover357EndRoundKeyRef.current === key) return;
    recover357EndRoundKeyRef.current = key;

    console.warn("[357 RECOVERY] Replaying authoritative round owner", {
      gameId,
      roundId: currentRound.id,
      handNumber: game?.total_hands,
      roundNumber: game?.current_round,
      recoveryKind,
      terminalWinnerCount,
    });

    void endRound(gameId).catch((err) => {
      console.error("[357 RECOVERY] endRound failed:", err);
    });
  }, [
    game?.game_type,
    game?.status,
    game?.is_paused,
    game?.awaiting_next_round,
    game?.all_decisions_in,
    game?.all_decisions_in_round_id,
    currentRound?.id,
    currentRound?.status,
    game?.total_hands,
    game?.current_round,
    game?.legs_to_win,
    gameId,
    players,
  ]);
  
  // 3-5-7 instant auto-fold: fold immediately when round starts if auto_fold=true
  // CRITICAL: This is ONLY for 3-5-7 games. In dice games (horses, SCC), auto_fold means "auto-roll",
  // NOT "fold the round". Triggering makeDecision(fold) for dice games corrupts game state.
  useEffect(() => {
    // Guard: Only run for 3-5-7 games
    const is357Game = game?.game_type === '3-5-7' || game?.game_type === '3-5-7-game' || game?.game_type === '357';
    if (!is357Game) return;
    if (game?.status !== 'in_progress') return;
    if (!currentRound || currentRound.status !== 'betting') return;
    if (game?.is_paused) return;
    if (isAllDecisionsInFor(game, currentRound?.id)) return; // Already done
    
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    if (currentPlayer.current_decision || currentPlayer.decision_locked) return; // Already decided
    if (!currentPlayer.auto_fold) return; // Only if auto_fold is enabled
    if (currentPlayer.is_bot || currentPlayer.sitting_out) return;
    
    const key = `${currentRound.id}:${currentPlayer.id}`;
    if (instant357AutoFoldKeyRef.current === key) return;
    
    console.log('[AUTO_FOLD 3-5-7] Auto-fold enabled - folding immediately', {
      playerId: currentPlayer.id,
      position: currentPlayer.position,
      roundId: currentRound.id,
    });
    
    instant357AutoFoldKeyRef.current = key;
    
    // Stop showing timer immediately
    setTimeLeft(null);
    setDecisionDeadline(null);
    
    handleFold();
  }, [
    game?.game_type,
    game?.status,
    game?.is_paused,
    game?.all_decisions_in,
    game?.all_decisions_in_round_id,
    currentRound?.id,
    currentRound?.status,
    players,
    user?.id,
  ]);
  
  // Remote 3-5-7 auto-folds are applied only by the exact-round deadline RPC.
  // A browser can submit only the authenticated local player's own decision.

  // Holm pre-decision arming helper.
  //
  // Captures the latest AUTHORITATIVE turn ref (updated synchronously
  // at the realtime ingest boundary), not a React render snapshot.
  // Rejects arming when:
  //   - authority for this round already shows my turn (the live
  //     Stay/Fold path is the only valid action then), or
  //   - the Holm initial deal is not yet ready.
  const armHolmPreDecision = useCallback((decision: 'stay' | 'fold' | null) => {
    if (decision === null) {
      holmPreDecisionArmedRef.current = null;
      holmPreDecisionConsumingRef.current = false;
      setHolmPreFold(false);
      setHolmPreStay(false);
      return;
    }
    if (game?.game_type !== 'holm-game') return;
    const cp = players.find(p => p.user_id === user?.id);
    if (!cp) return;
    const myPos = cp.position;

    // Reject if Holm deal not ready yet.
    if (!isHolmHandReady(handContextKey)) {
      console.warn('[PRE-DECISION] reject arm — Holm deal not ready');
      holmPreDecisionArmedRef.current = null;
      setHolmPreFold(false);
      setHolmPreStay(false);
      return;
    }

    // Reject if authority for this round already shows my turn.
    const latest = latestAuthoritativeTurnRef.current;
    const sameRound = latest?.roundId && currentRound?.id && latest.roundId === currentRound.id;
    const authoritySaysMyTurn = sameRound && latest?.currentTurnPosition === myPos;
    if (authoritySaysMyTurn) {
      console.warn('[PRE-DECISION] reject arm — authority already at my turn', {
        roundId: currentRound?.id,
        myPos,
        latest,
      });
      holmPreDecisionArmedRef.current = null;
      setHolmPreFold(false);
      setHolmPreStay(false);
      return;
    }

    holmPreDecisionArmedRef.current = {
      armedRoundId: currentRound?.id ?? null,
      armedHandContextId: handContextKey,
      armedFromTurnPosition: latest?.currentTurnPosition ?? currentRound?.current_turn_position ?? null,
      armedAuthorityEpoch: latest?.epoch ?? authoritativeTurnEpochRef.current,
      decision,
    };
    if (decision === 'stay') { setHolmPreStay(true); setHolmPreFold(false); }
    else { setHolmPreFold(true); setHolmPreStay(false); }
  }, [game?.game_type, players, user?.id, currentRound?.id, currentRound?.current_turn_position, handContextKey, holmReadyTick]);

  // Holm instant auto-fold + authoritative-arrival pre-decision dispatch.
  useEffect(() => {
    if (game?.game_type !== 'holm-game') return;
    if (game?.status !== 'in_progress') return;
    if (!currentRound || currentRound.status !== 'betting') return;
    if (game?.is_paused) return;

    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    // Terminal: already-authoritative decision wipes any stale arm.
    if (currentPlayer.current_decision || currentPlayer.decision_locked) {
      if (holmPreDecisionArmedRef.current) {
        holmPreDecisionArmedRef.current = null;
        holmPreDecisionConsumingRef.current = false;
        setHolmPreFold(false);
        setHolmPreStay(false);
      }
      return;
    }

    const isMyTurn = currentRound.current_turn_position === currentPlayer.position;
    if (!isMyTurn) return;

    // P0 fix B: gate everything on canonical Holm deal readiness.
    if (!isHolmHandReady(handContextKey)) {
      return;
    }

    // Auto-fold: fold immediately when it's your turn.
    if (currentPlayer.auto_fold && !currentPlayer.is_bot && !currentPlayer.sitting_out) {
      const key = `${currentRound.id}:${currentRound.current_turn_position}`;
      if (instantAutoFoldKeyRef.current === key) return;

      console.log('[AUTO_FOLD] Auto-fold enabled - folding immediately on your turn', {
        playerId: currentPlayer.id,
        position: currentPlayer.position,
        roundId: currentRound.id,
      });

      instantAutoFoldKeyRef.current = key;
      holmPreDecisionArmedRef.current = null;
      holmPreDecisionConsumingRef.current = false;
      setHolmPreFold(false);
      setHolmPreStay(false);
      setTimeLeft(null);
      setDecisionDeadline(null);
      handleFold();
      return;
    }

    // Already mid-dispatch from a previous tick of this same arrival.
    if (holmPreDecisionConsumingRef.current) return;

    // P0 fix A: pre-decision contract — must have been armed BEFORE
    // authority moved to me, on this same round + handContext, and a
    // strictly newer authoritative epoch must have arrived.
    const armed = holmPreDecisionArmedRef.current;
    if (!armed) return;

    const latest = latestAuthoritativeTurnRef.current;
    const myPos = currentPlayer.position;
    const sameRound = armed.armedRoundId === currentRound.id;
    const sameHand = armed.armedHandContextId === handContextKey;
    const armedFromOpponentTurn = armed.armedFromTurnPosition !== myPos;
    const authorityNowMine = !!latest && latest.roundId === currentRound.id && latest.currentTurnPosition === myPos;
    const newerEpoch = !!latest && latest.epoch > armed.armedAuthorityEpoch;
    const dealReady = isHolmHandReady(handContextKey);
    const consuming = holmPreDecisionConsumingRef.current;

    // Terminal invalidation: stable identity drift — arm belongs to a
    // hand/round that no longer exists. Drop it.
    const terminalInvalidation = !sameRound || !sameHand || !armedFromOpponentTurn;

    // Explicit per-predicate trace on every execute attempt.
    const predicates = {
      sameRound,
      sameHand,
      authorityNowMine,
      newerEpoch,
      dealReady,
      consuming,
      terminalInvalidation,
    };

    if (terminalInvalidation) {
      recordHolmDecisionSubmission({
        source: armed.decision === 'fold' ? 'pre-fold execute' : 'pre-stay execute',
        actor: currentPlayer,
        decision: armed.decision,
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'pre-decision-terminal-invalidation', predicates, armed, latest, myPos },
      });
      holmPreDecisionArmedRef.current = null;
      holmPreDecisionConsumingRef.current = false;
      setHolmPreFold(false);
      setHolmPreStay(false);
      return;
    }

    if (!(authorityNowMine && newerEpoch && dealReady)) {
      // TRANSIENT: latest authoritative ref not yet converged with React
      // state. Keep arm intact — a later effect tick (epoch bump, ready
      // flip, players refetch) will retry.
      recordHolmDecisionSubmission({
        source: armed.decision === 'fold' ? 'pre-fold execute' : 'pre-stay execute',
        actor: currentPlayer,
        decision: armed.decision,
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'pre-decision-transient', predicates, armed, latest, myPos },
      });
      return;
    }

    const decision = armed.decision;
    console.log('[PRE-DECISION] Executing armed pre-' + decision.toUpperCase(), {
      armed,
      latest,
      predicates,
    });
    // Atomic consume: latch first, then clear visuals, then dispatch.
    holmPreDecisionConsumingRef.current = true;
    holmPreDecisionArmedRef.current = null;
    setHolmPreFold(false);
    setHolmPreStay(false);
    const dispatch = decision === 'fold'
      ? handleFold('pre-fold execute')
      : handleStay('pre-stay execute');
    Promise.resolve(dispatch).finally(() => {
      holmPreDecisionConsumingRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    game?.game_type,
    game?.status,
    game?.is_paused,
    currentRound?.status,
    currentRound?.current_turn_position,
    currentRound?.id,
    holmPreFold,
    holmPreStay,
    holmReadyTick,
    handContextKey,
    players,
    user?.id,
  ]);

  // Auto-fold when timer reaches 0
  // IMPORTANT (3-5-7): only trigger when we have actually observed a running countdown for this round.
  // This prevents false "instant timeout" when timeLeft briefly initializes to 0 or the round deadline is stale.
  const autoFoldingRef = useRef(false);
  const countdownArmedRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    // No-Timers global harness: timer-expiry auto-fold is forbidden.
    // Deadlines still write; flipping the harness OFF restores normal
    // behavior on the next deadline.
    if (isNoTimersEnabledCached()) return;
    const isHolmGame = game?.game_type === 'holm-game';

    // Arm the timeout only after we have seen a positive countdown for the current round.
    // If timeLeft is 0 immediately on mount/round-change, we do NOT treat that as a real expiry.
    if (currentRound?.id && timeLeft !== null && timeLeft > 0) {
      countdownArmedRoundIdRef.current = currentRound.id;
    }
    
    console.log('[TIMER CHECK]', { 
      timeLeft, 
      status: game?.status, 
      all_decisions_in: isAllDecisionsInFor(game, currentRound?.id),
      // (raw_all_decisions_in removed — flag is identity-scoped via all_decisions_in_round_id)
      all_decisions_in_round_id: game?.all_decisions_in_round_id ?? null,
      is_paused: game?.is_paused,
      timerTurnPosition,
      currentTurnPosition: currentRound?.current_turn_position,
      isHolmGame,
      shouldAutoFold: timeLeft === 0 && game?.status === 'in_progress' && !isAllDecisionsInFor(game, currentRound?.id) && !game?.is_paused
    });
    
    // Don't auto-fold if timer is null or negative (means fresh round)
    // Only auto-fold when timer explicitly reaches 0 and we have positive time tracked
    // For Holm games: Only auto-fold if the turn hasn't changed (timerTurnPosition matches current turn)
    // For 3-5-7 games: Auto-fold when timer reaches 0 (no turn position to check)
    const shouldAutoFold = timeLeft === 0 && 
        game?.status === 'in_progress' && 
        !isAllDecisionsInFor(game, currentRound?.id) && 
        !game?.is_paused &&
        !autoFoldingRef.current &&
        (isHolmGame 
          ? (timerTurnPosition !== null && currentRound?.current_turn_position === timerTurnPosition)
          : (currentRound?.id ? countdownArmedRoundIdRef.current === currentRound.id : false));
    
    if (shouldAutoFold) {
      autoFoldingRef.current = true;
      if (isHolmGame) {
        console.log('[TIMER EXPIRED HOLM] *** AUTO-FOLDING player at position', timerTurnPosition, '***');
        console.log('[TIMER EXPIRED HOLM] Verification:', {
          timerTurnPosition,
          currentTurnPosition: currentRound?.current_turn_position,
          match: timerTurnPosition === currentRound?.current_turn_position
        });
      } else {
        console.log('[TIMER EXPIRED 3-5-7] *** AUTO-FOLDING undecided players ***');
      }
      // Immediately clear the timer to stop flashing
      setTimeLeft(null);
      setDecisionDeadline(null);
      
      if (isHolmGame) {
        // In Holm, do NOT make a local DB decision here (it races with other clients + backend enforcement).
        // Instead, ask the backend enforcer to process the overdue deadline.
        (async () => {
          if (!gameId) {
            autoFoldingRef.current = false;
            return;
          }

          try {
            console.log('[TIMER EXPIRED HOLM] Invoking enforce-deadlines');
            const timeoutActor = playersRef.current.find(p => p.position === timerTurnPosition) ?? null;
            const { error } = await supabase.functions.invoke('enforce-deadlines', {
              body: {
                gameId,
                source: 'client-timer-expired',
                requestId: crypto.randomUUID(),
              },
            });
            recordHolmDecisionSubmission({
              source: 'server-timeout observed',
              actor: timeoutActor,
              decision: null,
              makeDecisionInvoked: false,
              requestStatus: error ? 'error' : 'accepted',
              errorMessage: error?.message ?? null,
              extra: { timerTurnPosition },
            });
          } catch (err) {
            console.warn('[TIMER EXPIRED HOLM] enforce-deadlines failed:', err);
            const timeoutActor = playersRef.current.find(p => p.position === timerTurnPosition) ?? null;
            recordHolmDecisionSubmission({
              source: 'server-timeout observed',
              actor: timeoutActor,
              decision: null,
              makeDecisionInvoked: false,
              requestStatus: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
              extra: { timerTurnPosition },
            });
          } finally {
            autoFoldingRef.current = false;
            // Force a quick refresh so the UI picks up the new decision_deadline/turn
            fetchGameData();
          }
        })();
      } else {
        // Config/rules-based routing: re-fetch authoritative state and
        // validate that timeout auto-fold is a legal action for this ruleset.
        // A stale callback on a non-timeout-fold game (e.g. cribbage) must
        // never mutate participation state.
        (async () => {
          try {
            const { resolveTimeoutPolicy, validateTimeoutAutoFold } = await import('@/lib/timeoutRules');
            const { data: freshGame } = await supabase
              .from('games')
              .select('id, game_type, status, is_paused, total_hands, current_round, current_game_uuid, timeout_enforcement_enabled, timeout_action')
              .eq('id', gameId!)
              .single();

            let freshRound: any = null;
            if (freshGame) {
              const { data: rows } = await supabase
                .from('rounds')
                .select('id, status, decision_deadline, hand_number, round_number, dealer_game_id')
                .eq('game_id', gameId!)
                .eq('hand_number', freshGame.total_hands ?? 1)
                .eq('round_number', freshGame.current_round ?? 0)
                .order('created_at', { ascending: false })
                .limit(1);
              freshRound = (rows || [])[0] || null;
              if (
                freshRound &&
                freshGame.current_game_uuid &&
                freshRound.dealer_game_id &&
                freshRound.dealer_game_id !== freshGame.current_game_uuid
              ) {
                freshRound = null;
              }
            }

            const { data: gameDefault } = await supabase
              .from('game_defaults')
              .select('timeout_enforcement_enabled, timeout_action')
              .eq('game_type', freshGame?.game_type || '')
              .maybeSingle();
            const policy = resolveTimeoutPolicy(freshGame as any, gameDefault as any);

            const suppress = validateTimeoutAutoFold({
              policy,
              game: freshGame,
              round: freshRound,
              expectedRoundId: currentRound?.id ?? null,
              expectedHandNumber: currentRound?.hand_number ?? null,
              expectedRoundNumber: currentRound?.round_number ?? null,
              roundHandNumber: freshRound?.hand_number ?? null,
              roundRoundNumber: freshRound?.round_number ?? null,
            });

            if (suppress) {
              console.warn('[TIMER EXPIRED] suppressed timeout auto-fold:', suppress, {
                gameId,
                gameType: freshGame?.game_type,
              });
              try {
                await supabase.from('debug_events').insert({
                  event_type: `timeout-auto-fold-suppressed-${suppress}`,
                  game_id: gameId!,
                  round_id: freshRound?.id ?? currentRound?.id ?? null,
                  client_role: 'client-timer',
                  payload: {
                    game_type: freshGame?.game_type,
                    status: freshGame?.status,
                    is_paused: freshGame?.is_paused,
                    round_status: freshRound?.status,
                    decision_deadline: freshRound?.decision_deadline,
                  },
                });
              } catch {}
              autoFoldingRef.current = false;
              fetchGameData();
              return;
            }

            await autoFoldUndecided(gameId!, {
              expectedRoundId: freshRound?.id ?? null,
              expectedHandNumber: freshRound?.hand_number ?? null,
              expectedRoundNumber: freshRound?.round_number ?? null,
            });
            fetchGameData();
          } catch (err) {
            console.error('[TIMER EXPIRED] Error auto-folding:', err);
          } finally {
            autoFoldingRef.current = false;
          }
        })();
      }
    }
  }, [timeLeft, game?.status, game?.all_decisions_in, game?.all_decisions_in_round_id, currentRound?.id, gameId, game?.is_paused, game?.game_type, timerTurnPosition, currentRound?.current_turn_position]);

  // Auto-proceed to next round when awaiting (with 4-second delay to show results)
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameStateAtTimerStart = useRef<{ awaiting: boolean; round: number } | null>(null);
  const awaitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Poll for awaiting_next_round when round is completed and all decisions are in
  useEffect(() => {
    const isHolmGame = game?.game_type === 'holm-game';
    const roundCompleted = currentRound?.status === 'completed';
    const allDecisionsIn = isAllDecisionsInFor(game, currentRound?.id);
    const alreadyAwaiting = game?.awaiting_next_round === true;
    const gameInProgress = game?.status === 'in_progress';
    
    // For 3-5-7 games: poll when round is completed and all decisions are in
    const shouldPoll = !isHolmGame && gameInProgress && roundCompleted && allDecisionsIn && !alreadyAwaiting;
    const pollTraceEnabled = !!gameId && (!game || game?.game_type === '3-5-7');

    // ── [ADMISSION-TRACE] poll_enter (per useEffect run) ──────────
    if (pollTraceEnabled) {
      const pollBlockedReasons: string[] = [];
      if (isHolmGame) pollBlockedReasons.push('holm_game');
      if (!gameInProgress) pollBlockedReasons.push('game_not_in_progress');
      if (!roundCompleted) pollBlockedReasons.push('round_not_completed');
      if (!allDecisionsIn) pollBlockedReasons.push('all_decisions_not_in');
      if (alreadyAwaiting) pollBlockedReasons.push('already_awaiting');
      if (awaitingPollRef.current) pollBlockedReasons.push('poll_already_active');
      // (poll-enter/blocked below)
      persist357Investigation(gameId!, game?.total_hands || 1,
        shouldPoll && !awaitingPollRef.current
          ? '357.awaiting_next_round.poll_enter'
          : '357.awaiting_next_round.poll_blocked',
        {
          shouldPoll,
          pollBlockedReasons,
          predicates: {
            isHolmGame, roundCompleted, allDecisionsIn, alreadyAwaiting, gameInProgress,
            pollAlreadyActive: !!awaitingPollRef.current,
            currentRoundId: currentRound?.id ?? null,
            currentRoundStatus: currentRound?.status ?? null,
            gameId,
            gameType: game?.game_type ?? null,
            gameStatus: game?.status ?? null,
            all_decisions_in: game?.all_decisions_in ?? null,
            all_decisions_in_round_id: game?.all_decisions_in_round_id ?? null,
            awaiting_next_round: game?.awaiting_next_round ?? null,
          },
        });
    }
    
    console.log('[AWAITING_POLL] Check', {
      shouldPoll,
      isHolmGame,
      roundCompleted,
      allDecisionsIn,
      alreadyAwaiting,
      gameInProgress
    });
    
    if (shouldPoll && !awaitingPollRef.current) {
      console.log('[AWAITING_POLL] 🔄 Starting poll for awaiting_next_round');
      
      awaitingPollRef.current = __scheduleWartimeInterval({
        sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_POLL.id,
        ownerLabel: 'game.awaitingNextRound.dbPoll',
        intervalMs: 500,
        extra: {
          purpose: 'detect awaiting_next_round after round completion',
          guard_roundCompleted: roundCompleted,
          guard_allDecisionsIn: allDecisionsIn,
          guard_alreadyAwaiting: alreadyAwaiting,
          guard_gameInProgress: gameInProgress,
        },
        fn: async (asyncOwnerId, tickNumber) => {
        console.log('[AWAITING_POLL] 🔍 Checking for awaiting_next_round...');
        
        const { data: freshGame } = await supabase
          .from('games')
          .select('awaiting_next_round, last_round_result, next_round_number')
          .eq('id', gameId)
          .single();
        
        console.log('[AWAITING_POLL] Fresh data:', freshGame);
        
        if (freshGame?.awaiting_next_round) {
          if (pollTraceEnabled) {
            persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.poll_proceed_called', {
              tickNumber,
              freshGame,
              asyncOwnerId: String(asyncOwnerId),
            });
          }
          console.log('[AWAITING_POLL] ✅ DETECTED awaiting_next_round! Triggering refetch');
          if (awaitingPollRef.current) {
            __emitWartimeAsyncOwnerFired({
              asyncOwnerId,
              outcome: 'cancelled',
              sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_POLL.id,
              identity: __wartimeLiveGameIdentity(),
              liveIdentity: __wartimeLiveGameIdentity(),
              suppressionReason: 'awaiting_next_round_detected',
              extra: { tickNumber, freshLastRoundResult: freshGame.last_round_result ?? null, freshNextRoundNumber: freshGame.next_round_number ?? null },
            });
            __cancelWartimeAsyncOwner(awaitingPollRef.current as unknown as number, 'awaiting_next_round_detected');
            clearInterval(awaitingPollRef.current);
            awaitingPollRef.current = null;
          }
          await fetchGameData();
        }
        },
      }); // Poll every 500ms
    } else if (!shouldPoll && awaitingPollRef.current) {
      console.log('[AWAITING_POLL] 🛑 Stopping poll');
      __cancelWartimeAsyncOwner(awaitingPollRef.current as unknown as number, 'guard_closed');
      clearInterval(awaitingPollRef.current);
      awaitingPollRef.current = null;
    }
    
    return () => {
      if (awaitingPollRef.current) {
        __cancelWartimeAsyncOwner(awaitingPollRef.current as unknown as number, 'effect_cleanup');
        clearInterval(awaitingPollRef.current);
        awaitingPollRef.current = null;
      }
    };
  }, [gameId, game?.game_type, currentRound?.id, currentRound?.status, game?.all_decisions_in, game?.all_decisions_in_round_id, game?.awaiting_next_round, game?.status, __cancelWartimeAsyncOwner, __scheduleWartimeInterval, __wartimeLiveGameIdentity]);
  
  useEffect(() => {
    const currentAwaiting = game?.awaiting_next_round || false;
    const currentRoundNumber = game?.current_round || 0;

    // ── [ADMISSION-TRACE] effect_enter ─────────────────────────────
    // Bounded persistent trace of AUTO_PROCEED_EFFECT admission. Emits
    // at the *actual* top of the effect, before ANY early return.
    const effectRunId = `apr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const admissionShouldTrace = !!gameId && (!game || game?.game_type === '3-5-7');
    if (admissionShouldTrace) {
      persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.effect_enter', {
        effectRunId,
        gameId,
        gameUpdatedAt: (game as any)?.updated_at ?? null,
        awaiting_next_round: game?.awaiting_next_round ?? null,
        status: game?.status ?? null,
        current_round: game?.current_round ?? null,
        next_round_number: (game as any)?.next_round_number ?? null,
        current_game_uuid: game?.current_game_uuid ?? null,
        last_round_result: game?.last_round_result ?? null,
        is_paused: game?.is_paused ?? null,
        awaitingTimerPresent: awaitingTimerRef.current !== null,
        awaitingTimerOwner: awaitingTimerRef.current ? String(awaitingTimerRef.current) : null,
        gameStateAtTimerStart: gameStateAtTimerStart.current,
        harness357,
        harnessHolm,
        debugHolmPaused,
        currentRoundId: null,
        currentRoundStatus: null,
        handContextId: (game as any)?.hand_context_id ?? null,
        dealerGameId: game?.current_game_uuid ?? null,
        deps: {
          awaiting: game?.awaiting_next_round ?? null,
          gameId,
          status: game?.status ?? null,
          is_paused: game?.is_paused ?? null,
          game_type: game?.game_type ?? null,
          last_round_result: game?.last_round_result ?? null,
        },
      });
    }

    // ── [ADMISSION-TRACE] guard evaluation ─────────────────────────
    const blockedReasons: string[] = [];
    if (!game) blockedReasons.push('game_missing');
    if (!gameId) blockedReasons.push('missing_game_id');
    if (game?.is_paused) blockedReasons.push('paused');
    if (!(game?.awaiting_next_round)) blockedReasons.push('awaiting_next_round_false');
    if (game?.status === 'game_over') blockedReasons.push('status_game_over');
    if (awaitingTimerRef.current) blockedReasons.push('timer_already_present');
    if (admissionShouldTrace) {
      persist357Investigation(gameId!, game?.total_hands || 1,
        blockedReasons.length === 0
          ? '357.awaiting_next_round.guard_passed'
          : '357.awaiting_next_round.guard_blocked',
        {
          effectRunId,
          blockedReasons,
          predicates: {
            game_present: !!game,
            gameId_present: !!gameId,
            awaiting_next_round: game?.awaiting_next_round ?? null,
            status: game?.status ?? null,
            is_paused: game?.is_paused ?? null,
            awaitingTimer_present: awaitingTimerRef.current !== null,
          },
        },
      );
    }

    console.log('[AUTO_PROCEED_EFFECT] Running', {
      effectRunId,
      awaiting: currentAwaiting,
      status: game?.status,
      is_paused: game?.is_paused,
      hasTimer: awaitingTimerRef.current !== null,
      gameId: gameId,
      gameType: game?.game_type,
      savedState: gameStateAtTimerStart.current
    });
    
    // CRITICAL: Don't auto-proceed if game is paused
    if (game?.is_paused) {
      console.log('[AUTO_PROCEED_EFFECT] Game is paused, skipping auto-proceed');
      return;
    }
    
    // If awaiting state changed to true and we don't have a timer yet
    if (currentAwaiting && 
        gameId && 
        game?.status !== 'game_over' && 
        !awaitingTimerRef.current) {
      
      // Clear timer immediately when awaiting next round
      setTimeLeft(null);
      setDecisionDeadline(null);
      
      // Save the game state when we start the timer
      gameStateAtTimerStart.current = { awaiting: true, round: currentRoundNumber };
      
      // DEBUG MODE: For Holm games, don't auto-proceed if debugHolmPaused is true
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame && debugHolmPaused) {
        console.log('[AWAITING_NEXT_ROUND] 🔧 DEBUG MODE: Auto-proceed paused. Click "Proceed to Next Round" button manually.');
        return;
      }

      // ── 3-5-7 Showdown Pause Harness gate ─────────────────────────
      // Pauses AUTO_PROCEED scheduling for ONE qualifying real opponent-
      // exposed showdown per dealer game. All conditions must hold:
      //   - game_type === '3-5-7'
      //   - selected harness maps current_round → {1,2,3}
      //   - awaiting_next_round === true (outer if already enforces)
      //   - classify357TransitionType === 'showdown' (the existing
      //     real opponent-exposed showdown admission predicate —
      //     excludes folds, pussy-tax, sweep, leg-win, tie, and any
      //     stale prior-result state where last_round_result lacks
      //     the |||WINNER:…  payload)
      //   - this current_game_uuid has not already been paused
      if (game?.game_type === '3-5-7') {
        const harnessTargetRound: number | null =
          harness357 === 'pause_r1_showdown' ? 1
          : harness357 === 'pause_r2_showdown' ? 2
          : harness357 === 'pause_r3_showdown' ? 3
          : null;
        const dealerGameKey = game?.current_game_uuid ?? null;
        const transitionType357 = classify357TransitionType(game?.last_round_result);
        const alreadyPausedThisGame =
          !!dealerGameKey && harness357PausedGameRef.current === dealerGameKey;
        if (
          harnessTargetRound !== null
          && currentRoundNumber === harnessTargetRound
          && transitionType357 === 'showdown'
          && !!dealerGameKey
          && !alreadyPausedThisGame
        ) {
          harness357PausedGameRef.current = dealerGameKey;
          console.log('[357_SHOWDOWN_PAUSE_HARNESS] 🛑 Pausing AUTO_PROCEED', {
            harness: harness357,
            round: currentRoundNumber,
            dealerGameKey,
            transitionType: transitionType357,
          });
          return;
        }
      }

      // ── Holm Showdown Freeze Harness gate ─────────────────────────
      // Pauses AUTO_PROCEED for ONE qualifying real multiplayer
      // showdown per hand identity. Conditions:
      //   - game_type === 'holm-game'
      //   - harnessHolm === 'pause_showdown_freeze'
      //   - last_round_result carries WINNER+LOSERS+POT+MATCH marker
      //     (this excludes solo/Chucky outcomes, non-showdown phases,
      //     and any stale prior-result state — the marker is only
      //     written when ≥1 stayed opponent reaches showdown)
      //   - awaiting_next_round === true (outer if already enforces)
      //   - this (dealer_game | current_round) hand has not been paused
      // Returning early keeps the live tableau mounted; card-flip
      // animations finish to settle naturally in the DOM and remain
      // on screen indefinitely. No snapshot, no remount, no release.
      if (game?.game_type === 'holm-game' && harnessHolm === 'pause_showdown_freeze') {
        const holmLastResult = game?.last_round_result || '';
        const holmShowdownMarker = /\|\|\|WINNER:[^|]+\|\|\|LOSERS:[^|]+\|\|\|POT:\d+\|\|\|MATCH:\d+/.test(holmLastResult);
        const dealerGameKey = game?.current_game_uuid ?? null;
        const holmHandKey = dealerGameKey ? `${dealerGameKey}|${currentRoundNumber}` : null;
        const alreadyPausedThisHand =
          !!holmHandKey && harnessHolmPausedHandRef.current === holmHandKey;
        if (
          holmShowdownMarker
          && !!holmHandKey
          && !alreadyPausedThisHand
        ) {
          harnessHolmPausedHandRef.current = holmHandKey;
          console.log('[HOLM_SHOWDOWN_FREEZE_HARNESS] 🛑 Pausing AUTO_PROCEED', {
            harness: harnessHolm,
            handKey: holmHandKey,
            currentRound: currentRoundNumber,
          });
          return;
        }
      }




      
      console.log('[AWAITING_NEXT_ROUND] Starting 4-second timer', {
        game_type: game?.game_type,
        current_round: currentRoundNumber,
        pot: game?.pot,
        last_result: game?.last_round_result
      });
      
      // ── 357-awaiting-next-round-trigger ──
      const tType357 = game?.game_type === '3-5-7' ? classify357TransitionType(game?.last_round_result) : null;
      if (game?.game_type === '3-5-7') {
        const syncView = threeFiveSevenSync.presentationState;
        persist357Investigation(gameId, game?.total_hands || 1, '357-awaiting-next-round-trigger', {
          roundNumber: game?.current_round,
          awaitingNextRound: true,
          rawLastRoundResultPresent: !!game?.last_round_result,
          rawLastRoundResultLength: (game?.last_round_result || '').length,
          syncLastRoundResultPresent: !!syncView?.lastRoundResult,
          syncRoundNumber: syncView?.roundNumber ?? null,
          isFrozen: threeFiveSevenSync.isFrozen,
          transitionType: tType357,
        });
      }
      
      // Check if this is a pussy tax scenario and trigger animation
      // CRITICAL: Skip if 357 win animation is active - we're showing legs/pot going to winner
      // Use ref for closure access (state would be stale in setTimeout)
      // Holm presentation must remain on one ownership layer. While PostgreSQL
      // advances H2 behind a local H1 barrier, raw game/currentRound fields are
      // already H2 and must not author H2 result triggers on the H1 felt.
      const lastResult = game?.game_type === 'holm-game'
        ? (holmView?.lastRoundResult || '')
        : (game?.last_round_result || '');
      const isPussyTax = lastResult.toLowerCase().includes('pussy tax');
      if (isPussyTax && !is357WinAnimationActiveRef.current) {
        // Trigger ante animation for pussy tax using pussy_tax_value
        const activePlayers = holmPlayers.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
        const pussyTaxTotal = (game?.pussy_tax_value || 1) * activePlayers.length;
        const perPlayerAmount = game?.pussy_tax_value || 1;
        console.log('[PUSSY_TAX_ANIMATION] Triggering animation', { pussyTaxTotal, perPlayerAmount, activePlayers: activePlayers.length });
        
        // CRITICAL FIX: Backend has ALREADY deducted pussy tax by the time we receive awaiting_next_round=true
        // So p.chips is already the POST-deduction value. We need to show the BEFORE value as pre-ante
        // and the CURRENT value as expected (since backend already applied it)
        const chipSnapshot: Record<string, number> = {};
        const expectedChips: Record<string, number> = {};
        activePlayers.forEach(p => { 
          // p.chips is ALREADY post-deduction - add back to get pre-ante value for animation start
          chipSnapshot[p.id] = p.chips + perPlayerAmount;
          // Expected is what DB already has (current chips)
          expectedChips[p.id] = p.chips;
        });
        setPreAnteChips(chipSnapshot);
        setExpectedPostAnteChips(expectedChips);
        setAnteAnimationExpectedPot((game?.pot || 0)); // Pot already includes the tax
        // Guard against duplicate triggers
        const pussyTaxPresentationPlanKey = holmPresentationIdentity
          ? getHolmPresentationHandKey(holmPresentationIdentity)
          : null;
        if (
          pussyTaxPresentationPlanKey
          && holmPussyTaxPresentationPlanKeyRef.current !== pussyTaxPresentationPlanKey
        ) {
          holmPussyTaxPresentationPlanKeyRef.current = pussyTaxPresentationPlanKey;
          const pussyTaxTriggerKey = `pussy-tax-${pussyTaxPresentationPlanKey}`;
          anteAnimationFiredRef.current = pussyTaxTriggerKey;
          setAnteAnimationTriggerId(pussyTaxTriggerKey);
        }
      }
      
      // Check if this is a 3-5-7 showdown and trigger chip transfer animation
      // Format: "${winnerUsername} won with ${handName}|||WINNER:${id}|||LOSERS:${ids}|||AMOUNT:${amount}"
      if (game?.game_type === '3-5-7' && lastResult.includes('|||WINNER:')) {
        const winnerMatch = lastResult.match(/\|\|\|WINNER:([^|]+)/);
        const losersMatch = lastResult.match(/\|\|\|LOSERS:([^|]+)/);
        const amountMatch = lastResult.match(/\|\|\|AMOUNT:(\d+)/);
        
        if (winnerMatch && losersMatch && amountMatch) {
          const winnerId = winnerMatch[1];
          const loserIds = losersMatch[1].split(',').filter(id => id.length > 0);
          const amount = parseInt(amountMatch[1], 10);
          
          if (loserIds.length > 0 && amount > 0) {
            console.log('[CHIP_TRANSFER_ANIMATION] Triggering showdown animation', {
              winnerId,
              loserIds,
              amount
            });
            // ── 357-chip-animation-triggered ──
            persist357Investigation(gameId, game?.total_hands || 1, '357-chip-animation-triggered', {
              roundNumber: game?.current_round,
              winnerPlayerId: winnerId.slice(0, 8),
              loserPlayerIds: loserIds.map(id => id.slice(0, 8)),
              amount,
              sourceLastRoundResultPresent: !!game?.last_round_result,
              transitionType: tType357,
            });
            setChipTransferAmount(amount);
            setChipTransferWinnerId(winnerId);
            setChipTransferLoserIds(loserIds);
            setChipTransferTriggerId(`showdown-${Date.now()}`);
          } else {
            // ── 357-chip-animation-skipped ──
            persist357Investigation(gameId, game?.total_hands || 1, '357-chip-animation-skipped', {
              roundNumber: game?.current_round,
              reason: loserIds.length === 0 ? 'no-losers' : 'zero-amount',
              rawLastRoundResultPresent: !!game?.last_round_result,
              parsedWinnerPresent: !!winnerMatch,
              parsedAmountPresent: !!amountMatch,
              transitionType: tType357,
            });
          }
        } else {
          // ── 357-chip-animation-skipped ──
          persist357Investigation(gameId, game?.total_hands || 1, '357-chip-animation-skipped', {
            roundNumber: game?.current_round,
            reason: 'parse-failed',
            rawLastRoundResultPresent: !!game?.last_round_result,
            parsedWinnerPresent: !!winnerMatch,
            parsedLosersPresent: !!losersMatch,
            parsedAmountPresent: !!amountMatch,
            transitionType: tType357,
          });
        }
      } else if (game?.game_type === '3-5-7' && !lastResult.includes('|||WINNER:') && lastResult.length > 0) {
        // ── 357-chip-animation-skipped (no WINNER field — tie or non-showdown) ──
        persist357Investigation(gameId, game?.total_hands || 1, '357-chip-animation-skipped', {
          roundNumber: game?.current_round,
          reason: 'no-winner-field',
          rawLastRoundResultPresent: true,
          rawLastRoundResultValue: lastResult.slice(0, 60),
          transitionType: tType357,
        });
      }
      
      // Check if this is a Holm Chucky loss and trigger animation (player pays into pot)
      // Single player format: "Chucky beat {username} with {hand}. -${amount}"
      // Multi player format: "Tie broken by Chucky! {names} lose to Chucky's {hand}. ${total} added to pot."
      if (game?.game_type === 'holm-game') {
        const chuckyLoss = deriveHolmChuckyLossContext(lastResult, holmPlayers);
        const hasExactLossIdentity = (
          !!holmPresentationIdentity
          && holmPresentationIdentity.handNumber > 0
          && holmPresentationIdentity.transferCursor > 0
        );
        if (chuckyLoss && hasExactLossIdentity) {
          const presentationPlanKey = getHolmPresentationHandKey(holmPresentationIdentity!);
          if (holmChuckyLossPresentationPlanKeyRef.current === presentationPlanKey) {
            console.log('[CHUCKY_LOSS_ANIMATION] Duplicate dispatch suppressed', { presentationPlanKey });
          } else {
            holmChuckyLossPresentationPlanKeyRef.current = presentationPlanKey;
            console.log('[CHUCKY_LOSS_ANIMATION] Exact loss presentation admitted', {
              presentationPlanKey,
              playerIds: chuckyLoss.playerIds,
              amount: chuckyLoss.amount,
            });
            setChuckyLossAmount(chuckyLoss.amount);
            setChuckyLossPlayerIds(chuckyLoss.playerIds);
            setChuckyLossTriggerId(`chucky-loss-${presentationPlanKey}`);
          }
        }
        
        // Check for Holm multi-player showdown (winner(s) take the pot, losers
        // match it). `WINNERS` is the partial-tie form and shares the same
        // canonical batch-stage gate.
        const holmShowdownMatch = lastResult.match(/\|\|\|(WINNER|WINNERS):([^|]+)\|\|\|LOSERS:([^|]+)\|\|\|POT:(\d+)\|\|\|MATCH:(\d+)/);
        if (holmShowdownMatch && holmPresentationIdentity) {
          const winnerIds = holmShowdownMatch[2].split(',').filter(Boolean);
          const loserIds = holmShowdownMatch[3].split(',').filter(Boolean);
          const potAmount = parseInt(holmShowdownMatch[4], 10);
          const matchAmount = parseInt(holmShowdownMatch[5], 10);

          // `games.current_round` is 1 for every Holm hand. The plan latch
          // follows the authoritative rounds row / hand, while each ledger
          // batch retains its own exact cursor identity through completion.
          const presentationPlanKey = getHolmPresentationHandKey(holmPresentationIdentity);

          if (holmShowdownPresentationPlanKeyRef.current === presentationPlanKey) {
            console.log('[HOLM_SHOWDOWN_ANIMATION] Duplicate dispatch suppressed', { presentationPlanKey });
          } else {
            holmShowdownPresentationPlanKeyRef.current = presentationPlanKey;

            console.log('[HOLM_SHOWDOWN_ANIMATION] Detected multi-player showdown', {
              presentationPlanKey,
              winnerIds,
              loserIds,
              potAmount,
              matchAmount
            });

            // Trigger phase 1: pot-to-winner (phase 2 losers-to-pot is
            // advanced by onHolmShowdownPotToWinnerEnded and must never be
            // reset by a re-entry of this effect).
            setHolmShowdownPotAmount(potAmount);
            setHolmShowdownMatchAmount(matchAmount);
            setHolmShowdownWinnerIds(winnerIds);
            setHolmShowdownLoserIds(loserIds);
            setHolmShowdownPhase('pot-to-winner');
            setHolmShowdownTriggerId(`holm-showdown-${presentationPlanKey}`);
          }
        }
      }
      
      // Holm never advances through this generic timer. PostgreSQL has already
      // prepared the exact successor in the settlement transaction; the
      // canonical result/ledger presentation acknowledges activation, and the
      // service-only lease recovers a missing acknowledgement.
      if (game?.game_type === 'holm-game') {
        console.log('[AWAITING_NEXT_ROUND] Waiting for exact Holm presentation acknowledgement');
        return;
      }

      // All-fold has no generic result dwell. The committed announcement is
      // visible while the exact pussy-tax ledger batch travels; that batch's
      // settled/reconciled boundary is the sole connected-client advance cue.
      // The service recovery lease remains the disconnected-client fallback.
      if (is357GameType && lastResult === 'All players folded') {
        console.log('[AWAITING_NEXT_ROUND] Waiting for exact 3-5-7 pussy-tax presentation acknowledgement');
        return;
      }

      // Wait 4 seconds to show every non-Holm result, then start next round.
      awaitingTimerRef.current = __scheduleWartimeTimeout({
        sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER.id,
        ownerLabel: 'game.awaitingNextRound.autoProceedTimer',
        delayMs: 4000,
        extra: {
          purpose: 'awaiting_next_round auto proceed delay',
          guard_currentAwaiting: currentAwaiting,
          guard_currentRound: currentRoundNumber,
          guard_gameType: game?.game_type ?? null,
          guard_isPaused: game?.is_paused ?? null,
          guard_transitionType357: tType357,
        },
        fn: async (asyncOwnerId, capturedIdentity) => {
        // ── [ADMISSION-TRACE] timer_fired ────────────────────────
        if (admissionShouldTrace) {
          persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.timer_fired', {
            effectRunId,
            timerOwnerId: String(asyncOwnerId),
            gameId,
            dealerGameId: game?.current_game_uuid ?? null,
            roundId: null,
            handContextId: (game as any)?.hand_context_id ?? null,
            capturedIdentity: capturedIdentity ?? null,
          });
        }
        console.log('[AWAITING_NEXT_ROUND] Timer fired after 4 seconds');
        const timerId = awaitingTimerRef.current;
        awaitingTimerRef.current = null;
        gameStateAtTimerStart.current = null;
        
        try {
          // CRITICAL: Re-check pause status when timer fires (game may have been paused during delay)
          const { data: pauseCheck } = await supabase
            .from('games')
            .select('is_paused')
            .eq('id', gameId)
            .single();
          
          if (pauseCheck?.is_paused) {
            if (admissionShouldTrace) {
              persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.callback_blocked', {
                effectRunId, timerOwnerId: String(asyncOwnerId),
                blockedReasons: ['paused_on_fire'],
                freshGame: { is_paused: true },
              });
            }
            console.log('[AWAITING_NEXT_ROUND] Game was paused during delay, skipping proceed');
            __emitWartimeAsyncOwnerFired({
              asyncOwnerId,
              outcome: 'suppressed',
              sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER.id,
              identity: capturedIdentity,
              liveIdentity: __wartimeLiveGameIdentity(),
              suppressionReason: 'paused_on_fire',
              extra: { guard_pauseCheck: true },
            });
            return;
          }
          
          const isHolmGame = game?.game_type === 'holm-game';
          console.log('[AWAITING_NEXT_ROUND] Calling proceed function', { isHolmGame, gameId });
          
          if (isHolmGame) {
            // Defensive only: Holm returns before scheduling this timer. A
            // browser must never publish the prepared successor.
            console.warn('[AWAITING_NEXT_ROUND] Suppressed client Holm continuation; server release owns it');
            return;
          } else {
            // CRITICAL: Fetch FRESH game state to check for 357 sweep or final leg win
            // The closure's `game` variable is stale from when useEffect was created
            const { data: freshGame } = await supabase
              .from('games')
              .select('game_type, last_round_result, next_round_number, pot, ante_amount, status, legs_to_win, is_paused, awaiting_next_round, current_game_uuid, ante_decision_deadline')
              .eq('id', gameId)
              .single();
            
            // Skip if game is already over (357 sweep sets game_over after 5s)
            if (freshGame?.status === 'game_over') {
              if (admissionShouldTrace) {
                persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.callback_blocked', {
                  effectRunId, timerOwnerId: String(asyncOwnerId),
                  blockedReasons: ['fresh_status_game_over'],
                  freshGame,
                });
              }
              console.log('[AWAITING_NEXT_ROUND] Game already over, skipping proceed');
              __emitWartimeAsyncOwnerFired({
                asyncOwnerId,
                outcome: 'suppressed',
                sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER.id,
                identity: capturedIdentity,
                liveIdentity: __wartimeLiveGameIdentity(),
                suppressionReason: 'fresh_status_game_over',
                extra: { freshStatus: freshGame.status },
              });
              return;
            }
            
            // CRITICAL: Skip if game was paused after timer started
            if (freshGame?.is_paused) {
              if (admissionShouldTrace) {
                persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.callback_blocked', {
                  effectRunId, timerOwnerId: String(asyncOwnerId),
                  blockedReasons: ['fresh_is_paused'],
                  freshGame,
                });
              }
              console.log('[AWAITING_NEXT_ROUND] Game is paused, skipping proceed');
              __emitWartimeAsyncOwnerFired({
                asyncOwnerId,
                outcome: 'suppressed',
                sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER.id,
                identity: capturedIdentity,
                liveIdentity: __wartimeLiveGameIdentity(),
                suppressionReason: 'fresh_is_paused',
                extra: { freshStatus: freshGame.status ?? null },
              });
              return;
            }

            if (freshGame?.awaiting_next_round !== true) {
              if (admissionShouldTrace) {
                persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.callback_blocked', {
                  effectRunId, timerOwnerId: String(asyncOwnerId),
                  blockedReasons: ['awaiting_flag_cleared'],
                  freshGame,
                });
              }
              console.log('[AWAITING_NEXT_ROUND] Awaiting flag already cleared by primary progression path, skipping fallback');
              __emitWartimeAsyncOwnerFired({
                asyncOwnerId,
                outcome: 'suppressed',
                sourceSiteId: __WARTIME_SRC.ASYNC_GAME_AWAITING_TIMER.id,
                identity: capturedIdentity,
                liveIdentity: __wartimeLiveGameIdentity(),
                suppressionReason: 'awaiting_flag_cleared',
                extra: { freshStatus: freshGame?.status ?? null, freshAwaitingNextRound: freshGame?.awaiting_next_round ?? null },
              });
              return;
            }

            if (admissionShouldTrace) {
              persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.callback_passed', {
                effectRunId, timerOwnerId: String(asyncOwnerId),
                freshGame,
              });
            }

            // Horses: proceed by starting a new Horses round (not startRound)
            // NOTE: Do NOT pre-claim awaiting_next_round here — startHorsesRound / startSCCRound
            // have their own atomic rollover claim guards. Pre-consuming the flag here causes
            // startHorsesRound to see awaiting_next_round=false and hit BLOCKED_NOT_READY.
            if (freshGame?.game_type === 'horses' || freshGame?.game_type === 'ship-captain-crew' || freshGame?.game_type === 'yahtzee') {
              console.log('[AWAITING_NEXT_ROUND] Dice game detected — starting next hand (re-ante)', freshGame?.game_type);

              // Capture pre-ante chips BEFORE startRound deducts them
              const { data: playersBeforeAnte } = await supabase
                .from('players')
                .select('id, chips, sitting_out, status')
                .eq('game_id', gameId);

              const activePlayersForAnte = (playersBeforeAnte || []).filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
              const perPlayerAmount = freshGame?.ante_amount || 0;
              const activeCount = activePlayersForAnte.length;

              const preChipsSnapshot: Record<string, number> = {};
              const expectedChipsSnapshot: Record<string, number> = {};
              activePlayersForAnte.forEach(p => {
                preChipsSnapshot[p.id] = p.chips;
                expectedChipsSnapshot[p.id] = p.chips - perPlayerAmount;
              });

              // Calculate expected pot: existing pot (from tie) + new antes
              const currentPot = freshGame?.pot || 0;
              const expectedPot = currentPot + (perPlayerAmount * activeCount);

              // Start the appropriate round type — these functions handle their own
              // atomic guards for awaiting_next_round and multi-client deduplication
              if (freshGame?.game_type === 'ship-captain-crew') {
                await startSCCRound(gameId, false, {
                  caller: 'Game.tsx:awaiting_next_round-effect',
                  reason: 'tie-rollover-re-ante',
                  trigger: 'awaiting_next_round=true observed (realtime/refresh)',
                  prevDealerGameId: freshGame?.current_game_uuid ?? null,
                  prevAwaitingNextRound: freshGame?.awaiting_next_round ?? null,
                  prevAnteDecisionDeadline: freshGame?.ante_decision_deadline ?? null,
                  extra: { freshGameStatus: freshGame?.status, freshPot: freshGame?.pot },
                });
              } else if (freshGame?.game_type === 'yahtzee') {
                await startYahtzeeRound(gameId, false, currentRound?.id ?? null);
                await fetchGameData();
              } else {
                await startHorsesRound(gameId, false, {
                  caller: 'Game.tsx:awaiting_next_round-effect',
                  reason: 'tie-rollover-re-ante',
                  trigger: 'awaiting_next_round=true observed (realtime/refresh)',
                  prevDealerGameId: freshGame?.current_game_uuid ?? null,
                  prevAwaitingNextRound: freshGame?.awaiting_next_round ?? null,
                  prevAnteDecisionDeadline: freshGame?.ante_decision_deadline ?? null,
                  extra: { freshGameStatus: freshGame?.status, freshPot: freshGame?.pot },
                });
              }

              // Trigger ante animation for dice game re-ante
              if (perPlayerAmount > 0 && activeCount > 0) {
                setPreAnteChips(preChipsSnapshot);
                setExpectedPostAnteChips(expectedChipsSnapshot);
                setAnteAnimationExpectedPot(expectedPot);

                const triggerKey = `dice-reante-${expectedPot}-${Date.now()}`;
                if (anteAnimationFiredRef.current !== triggerKey) {
                  anteAnimationFiredRef.current = triggerKey;
                  setAnteAnimationTriggerId(`ante-${Date.now()}`);
                  console.log('[DICE RE-ANTE] Triggered ante animation:', { perPlayerAmount, activeCount, expectedPot });
                }
              }
              return;
            }
            
            // CRITICAL FIX: Check if this is a final leg win scenario
            // If the result says "won a leg" we need to check if any player reached legs_to_win
            // The backend's handleGameOver runs after a 4-second delay (same as this timer)
            // so we might race with it. If it's a final leg, DON'T proceed - wait for game_over
            const lastResult = freshGame?.last_round_result || '';
            const isLegWin = lastResult.includes('won a leg');
            if (isLegWin) {
              // Fetch current player leg counts to check if anyone reached the goal
              const { data: currentPlayers } = await supabase
                .from('players')
                .select('id, legs, user_id, profiles(username)')
                .eq('game_id', gameId);
              
              const legsToWin = freshGame?.legs_to_win || 3;
              const winningPlayer = currentPlayers?.find(p => p.legs >= legsToWin);
              
              if (winningPlayer) {
                console.log('[AWAITING_NEXT_ROUND] ⚠️ Final leg win detected! Player reached', legsToWin, 'legs. Waiting for game_over instead of proceeding.');
                console.log('[AWAITING_NEXT_ROUND] Winner:', winningPlayer.profiles?.username || winningPlayer.user_id);
                // Don't proceed - the backend's handleGameOver will transition to game_over shortly
                // The safety fallback or next fetch will catch the game_over state
                return;
              }
            }
            
            // ── 357-auto-proceed-fired ──
            if (freshGame?.game_type === '3-5-7') {
              persist357Investigation(gameId, game?.total_hands || 1, '357-auto-proceed-fired', {
                roundNumber: game?.current_round,
                rawLastRoundResultPresentBeforeClear: !!freshGame?.last_round_result,
                awaitingNextRoundBeforeClear: !!freshGame?.awaiting_next_round,
                nextRoundNumber: freshGame?.next_round_number,
                transitionType: classify357TransitionType(freshGame?.last_round_result),
              });
            }
            
            // P0 CONTAINMENT (CRIB-CORRUPT-01): proceedToNextRound is the 3-5-7
            // round-advancement path. Cribbage and Gin Rummy create their own
            // rounds via their own next-hand logic and must NEVER reach here.
            // Calling proceedToNextRound on those game types inserts spurious
            // rounds mid-hand and resets visible state (clears cards, score=0).
            const _gtForProceed = freshGame?.game_type;
            const _is357ForProceed = _gtForProceed === '3-5-7' || _gtForProceed === '3-5-7-game' || _gtForProceed === '357';
            if (!_is357ForProceed) {
              console.warn('[AWAITING_NEXT_ROUND] proceedToNextRound-suppressed-non-357 game_type=', _gtForProceed,
                '— refusing to run 3-5-7 round-advance path against', _gtForProceed, 'game.');
              // Clear awaiting flag so we don't loop on the timer.
              try {
                await supabase
                  .from('games')
                  .update({ awaiting_next_round: false, next_round_number: null })
                  .eq('id', gameId)
                  .eq('awaiting_next_round', true);
              } catch (e) {
                console.warn('[AWAITING_NEXT_ROUND] Failed to clear stale awaiting flag', e);
              }
              return;
            }

            // First, clear the result and proceed to next round
            if (admissionShouldTrace) {
              persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.proceed_called', {
                effectRunId, timerOwnerId: String(asyncOwnerId),
                freshGame,
              });
            }
            const advanceResult = await proceedToNextRound(gameId);
            const committedRolloverPresentation =
              freshGame?.next_round_number === 1 && advanceResult
                ? parseThreeFiveSevenRolloverAdvanceResult(gameId, advanceResult)
                : null;
            if (freshGame?.next_round_number === 1 && advanceResult && !committedRolloverPresentation) {
              throw new Error('3-5-7 rollover advance returned no exact committed transfer identity');
            }
            if (committedRolloverPresentation) {
              // The initiating client consumes the RPC result directly. The
              // following refetch supplies its committed round + private cards;
              // Realtime remains peer synchronization, never the bootstrap cue.
              setDirectThreeFiveSevenRolloverPresentation(committedRolloverPresentation);
            }
            await fetchGameData('manual');
            
            // THEN trigger the rollover animation when proceeding to the next hand's Round 1.
            // This happens AFTER the result has been cleared
            // BUT skip if this is a 357 sweep (game is over, no rollover)
            // ALSO skip if 357 win animation is currently active (use ref for closure access)
            const is357Sweep = freshGame?.last_round_result?.startsWith('357_SWEEP');
            if (freshGame?.next_round_number === 1 && !is357Sweep && !is357WinAnimationActiveRef.current) {
              // CRITICAL: Fetch fresh game AND players AFTER proceedToNextRound completes
              // because startRound already updated the pot in the database
              const { data: freshGameAfterProceed } = await supabase
                .from('games')
                .select('pot, rollover_amount')
                .eq('id', gameId)
                .single();
              
              const { data: freshPlayersAfterAnte } = await supabase
                .from('players')
                .select('id, chips, sitting_out, status')
                .eq('game_id', gameId);

              const activePlayers = (freshPlayersAfterAnte || []).filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
              const activeCount = activePlayers.length;
              const perPlayerAmount = typeof freshGameAfterProceed?.rollover_amount === 'number'
                ? freshGameAfterProceed.rollover_amount
                : 1;

              if (perPlayerAmount > 0 && activeCount > 0) {
                // PRE snapshot = post chips + rollover (because backend already deducted)
                const chipSnapshot: Record<string, number> = {};
                const expectedChips: Record<string, number> = {};
                activePlayers.forEach(p => {
                  chipSnapshot[p.id] = p.chips + perPlayerAmount;
                  expectedChips[p.id] = p.chips;
                });

                // CRITICAL: Use the FRESH pot from AFTER proceedToNextRound (backend already added rollovers).
                // This is the authoritative post-rollover pot value.
                const expectedPot = freshGameAfterProceed?.pot || 0;

                setPreAnteChips(chipSnapshot);
                setExpectedPostAnteChips(expectedChips);
                setAnteAnimationExpectedPot(expectedPot);

                const anteTriggerKey = `ante-round1-${expectedPot}`;
                if (anteAnimationFiredRef.current !== anteTriggerKey) {
                  anteAnimationFiredRef.current = anteTriggerKey;
                  setAnteAnimationTriggerId(`ante-${Date.now()}`);
                }
              }
            }
          }
          
          // Refetch immediately - realtime should handle updates, but refetch as backup
          await fetchGameData();
          
          console.log('[AWAITING_NEXT_ROUND] Game data refetched');
        } catch (error) {
          console.error('[AWAITING_NEXT_ROUND] ERROR during proceed:', error);
        }
        },
      });
      
      // ── 357-auto-proceed-started ──
      if (game?.game_type === '3-5-7') {
        persist357Investigation(gameId, game?.total_hands || 1, '357-auto-proceed-started', {
          roundNumber: game?.current_round,
          delayMs: 4000,
          rawLastRoundResultPresent: !!game?.last_round_result,
          transitionType: tType357,
        });
      }
      if (admissionShouldTrace) {
        persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.timer_scheduled', {
          effectRunId,
          timerOwnerId: awaitingTimerRef.current ? String(awaitingTimerRef.current) : null,
          gameId,
          dealerGameId: game?.current_game_uuid ?? null,
          roundId: null,
          handContextId: (game as any)?.hand_context_id ?? null,
          delayMs: 4000,
          scheduledUnder: {
            awaiting_next_round: game?.awaiting_next_round ?? null,
            status: game?.status ?? null,
            current_round: game?.current_round ?? null,
            last_round_result: game?.last_round_result ?? null,
            transitionType357: tType357,
          },
        });
      }
      console.log('[AWAITING_NEXT_ROUND] Timer started, will fire in 4 seconds');
    }
    // If awaiting changed to false, clear any existing timer
    else if (!currentAwaiting && awaitingTimerRef.current) {
      if (admissionShouldTrace) {
        persist357Investigation(gameId!, game?.total_hands || 1, '357.awaiting_next_round.effect_cleanup', {
          effectRunId,
          timerExisted: true,
          cleanupClearedTimer: true,
          timerOwnerId: String(awaitingTimerRef.current),
          scheduledSnapshot: gameStateAtTimerStart.current,
          reason: 'awaiting_flag_false',
        });
      }
      console.log('[AWAITING_NEXT_ROUND] No longer awaiting, clearing timer');
      __cancelWartimeAsyncOwner(awaitingTimerRef.current as unknown as number, 'awaiting_flag_false');
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
      gameStateAtTimerStart.current = null;
    }
    
    return () => {
      // Don't clear timer on cleanup during normal re-renders
      // Timer will persist across re-renders
    };
  }, [game?.awaiting_next_round, gameId, game?.status, game?.is_paused, game?.game_type, game?.last_round_result, game?.chip_transfer_cursor, currentRound?.id, currentRound?.hand_number, players, holmPlayers, holmPresentationIdentity, holmView?.lastRoundResult, __cancelWartimeAsyncOwner, __scheduleWartimeTimeout, __wartimeLiveGameIdentity]);

  const reconcileHolmPresentationBarrier = useCallback((): boolean => {
    const barrier = holmPresentationBarrierRef.current;
    const reconciliation = reconcileHolmPresentationBarrierFromEvidence(
      barrier,
      holmPresentationCompletionEvidenceRef.current,
    );
    if (!reconciliation.released || !barrier || !reconciliation.completion) return false;

    holmPresentationBarrierRef.current = reconciliation.barrier;
    holmPresentationCompletionEvidenceRef.current.delete(
      getHolmPresentationIdentityKey(barrier),
    );
    holmReleasedPresentationHandsRef.current.add(getHolmPresentationHandKey(barrier));
    console.log('[HOLM PRESENTATION] Released exact local predecessor', {
      ...barrier,
      stage: reconciliation.completion.stage,
    });
    void fetchGameData('manual').catch((error) => {
      console.error('[HOLM PRESENTATION] Authoritative successor refetch failed', {
        ...barrier,
        stage: reconciliation.completion!.stage,
        error,
      });
    });
    return true;
  }, [gameId]);

  // Remember and latch only the hand this client actually PRESENTED in live
  // betting. Raw currentRound may already be an unseen successor while the
  // sync view deliberately holds the predecessor, so it is never admissible
  // as an observation or barrier identity. Reconcile after latching so a
  // completion that arrived first cannot be lost.
  useEffect(() => {
    if (game?.game_type !== 'holm-game' || !holmPresentationIdentity || !holmView) return;

    const handKey = getHolmPresentationHandKey(holmPresentationIdentity);
    if (game.status === 'in_progress' && holmView.roundStatus === 'betting') {
      holmLiveRoundIdsObservedRef.current.add(handKey);
    }

    const currentBarrier = holmPresentationBarrierRef.current;
    const nextBarrier = latchHolmPresentationBarrier({
      current: currentBarrier,
      presented: holmPresentationIdentity,
      observedLive: holmLiveRoundIdsObservedRef.current.has(handKey),
      alreadyReleased: holmReleasedPresentationHandsRef.current.has(handKey),
      roundCompleted: holmView.roundStatus === 'completed',
      hasResult: !!holmView.lastRoundResult,
    });
    if (nextBarrier === currentBarrier || !nextBarrier) return;

    holmPresentationBarrierRef.current = nextBarrier;
    console.log('[HOLM PRESENTATION] Latched exact presented predecessor', nextBarrier);
    reconcileHolmPresentationBarrier();
  }, [
    game?.game_type,
    game?.status,
    holmPresentationIdentity,
    holmView,
    reconcileHolmPresentationBarrier,
  ]);

  const handleHolmChuckyLossPresentationComplete = useCallback(() => {
    setChuckyLossTriggerId(null);
    setChuckyLossPlayerIds([]);
    setChuckyLossAmount(0);
  }, []);

  const handleHolmContinuationPresentationComplete = useCallback((
    completion: HolmContinuationPresentationCompletion,
  ) => {
    const handKey = getHolmPresentationHandKey(completion);
    if (holmReleasedPresentationHandsRef.current.has(handKey)) return;
    const evidenceKey = getHolmPresentationIdentityKey(completion);
    if (!holmPresentationCompletionEvidenceRef.current.has(evidenceKey)) {
      holmPresentationCompletionEvidenceRef.current.set(evidenceKey, completion);
      console.log('[HOLM PRESENTATION] Recorded exact local completion evidence', completion);
    }
    reconcileHolmPresentationBarrier();
  }, [reconcileHolmPresentationBarrier]);

  const handleHolmDealPresentationComplete = useCallback((handContextId: string) => {
    const prepared = holmLocallyPreparedSuccessorRef.current;
    if (!gameId || !prepared || prepared.handContextId !== handContextId) return;

    const acknowledgementKey = [
      gameId,
      prepared.dealerGameId,
      prepared.predecessorRoundId,
      prepared.successorRoundId,
      prepared.handNumber,
    ].join('|');
    if (
      holmPreparedAckCompletedRef.current.has(acknowledgementKey)
      || holmPreparedAckInFlightRef.current === acknowledgementKey
    ) return;

    holmPreparedAckInFlightRef.current = acknowledgementKey;
    void (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          if (attempt > 0) {
            // Transport retry only. This delay never releases presentation or
            // starts gameplay; the database recovery lease remains the sole
            // missing-acknowledgement fallback.
            await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
          }
          const result = await acknowledgePreparedHolmHandDealt(
            gameId,
            prepared.dealerGameId,
            prepared.predecessorRoundId,
            prepared.successorRoundId,
            prepared.handNumber,
          );
          holmPreparedAckCompletedRef.current.add(acknowledgementKey);
          console.log('[HOLM PRESENTATION] Exact prepared deal acknowledged', {
            ...prepared,
            outcome: result.outcome,
            pendingAcknowledgements: result.pending_acknowledgements ?? null,
          });
          if (result.outcome === 'activated' || result.outcome === 'already-active') {
            await fetchGameData('manual');
          }
          return;
        } catch (error) {
          lastError = error;
        }
      }
      console.error('[HOLM PRESENTATION] Prepared deal acknowledgement delivery failed; server fallback remains armed', {
        ...prepared,
        error: lastError,
      });
    })().finally(() => {
      if (holmPreparedAckInFlightRef.current === acknowledgementKey) {
        holmPreparedAckInFlightRef.current = null;
      }
    });
  }, [gameId]);

  // Level-triggered prepared-successor acknowledgement. The PhaseHost calls
  // the same idempotent handler at the visual boundary, while this drain
  // guarantees that a remount or callback/ref ordering cannot lose it after
  // the exact hand has entered the durable ready barrier.
  useEffect(() => {
    const prepared = holmLocallyPreparedSuccessorRef.current;
    if (!prepared || !isHolmHandReady(prepared.handContextId)) return;
    handleHolmDealPresentationComplete(prepared.handContextId);
  }, [game?.current_game_uuid, handContextKey, handleHolmDealPresentationComplete, holmReadyTick]);

  // Clear timer when results are shown
  useEffect(() => {
    if (game?.last_round_result) {
      console.log('[RESULT] Clearing timer for result display');
      setTimeLeft(null);
      setDecisionDeadline(null);
    }
  }, [game?.last_round_result]);

  // Removed failsafe - countdown component now handles completion reliably

  const fetchGameData = async (
    fetchTrigger: 'cold_mount' | 'visibility' | 'focus' | 'pageshow' | 'realtime_reconnect' | 'realtime_update' | 'manual' | 'unknown' = 'unknown'
  ) => {
    const fetchSeq = ++fetchSeqRef.current;
    const fetchStartedAt = Date.now();
    const isStale = () => fetchSeq !== fetchSeqRef.current;
    const fetchSpan = startSpan('fetchGameData');


    // 3-5-7 fetch-trace bookkeeping removed. No-op stubs preserve legacy call sites.
    const patchFetchTraceState = (_patch?: unknown) => { /* noop */ };
    const setFetchTraceTerminal = (_outcome?: unknown, _exitStage?: unknown, _patch?: unknown) => { /* noop */ };
    const finishFetchTrace = (_outcome?: unknown, _exitStage?: unknown, _patch?: unknown) => { /* noop */ };
    const fetchTraceFinished = false;
    const fetchTraceTerminalOutcome: string | null = null;
    const fetchTraceTerminalExitStage: string | null = null;


    try {

    // ── Per-query waterfall instrumentation ──────────────────────────
    // Captures startedAtOffsetMs / completedAtOffsetMs / elapsedMs / rowCount
    // per individual Supabase call so the next Wartime trace can identify
    // exactly which sub-step accounts for the fetchGameData total.
    type QueryTiming = {
      name: string;
      table: string;
      elapsedMs: number;
      rowCount: number;
      startedAtOffsetMs: number;
      completedAtOffsetMs: number;
      error: string | null;
      preAuth: boolean;
      authReadyAtStart: boolean;
      userIdPresent: boolean;
    };
    const queryTimings: QueryTiming[] = [];
    const authReadyAtFetchStart = authReady;
    const userIdAtFetchStart = user?.id ?? null;

    const timedQuery = async <T,>(
      name: string,
      table: string,
      runner: () => PromiseLike<{ data: T; error: any }>,
    ): Promise<{ data: T; error: any }> => {
      const startedAtOffsetMs = Date.now() - fetchStartedAt;
      const authReadyAtStart = authReady;
      const userIdPresent = !!user?.id;
      recordStartupFlight('FETCH TIMELINE', 'fetchGameData.query.start', {
        fetchSeq,
        name,
        table,
        startedAtOffsetMs,
        authReadyAtStart,
        userIdPresent,
      });
      const t0 = Date.now();
      const result = await runner();
      const completedAtOffsetMs = Date.now() - fetchStartedAt;
      const elapsedMs = Date.now() - t0;
      const rowCount = Array.isArray(result?.data)
        ? (result.data as any[]).length
        : result?.data
          ? 1
          : 0;
      const errMsg = result?.error ? String((result.error as any).message ?? result.error) : null;
      queryTimings.push({
        name,
        table,
        elapsedMs,
        rowCount,
        startedAtOffsetMs,
        completedAtOffsetMs,
        error: errMsg,
        preAuth: !authReadyAtStart,
        authReadyAtStart,
        userIdPresent,
      });
      recordStartupFlight('FETCH TIMELINE', 'fetchGameData.query.complete', {
        fetchSeq,
        name,
        table,
        elapsedMs,
        rowCount,
        startedAtOffsetMs,
        completedAtOffsetMs,
        error: errMsg,
        preAuth: !authReadyAtStart,
      });
      return result;
    };

    console.log('[FETCH] ========== STARTING FETCH ==========', { fetchSeq });
    if (!gameId) {
      recordStartupFlight('FETCH TIMELINE', 'fetchGameData skipped', {
        file: 'src/pages/Game.tsx',
        function: 'fetchGameData',
        fetchSeq,
        skipReason: 'no gameId',
      });
      fetchSpan.end({ skipped: 'no gameId' });
      finishFetchTrace('returned_no_game_id', 'guard:no_game_id');
      return;
    }

    recordStartupFlight('FETCH TIMELINE', 'fetchGameData start', {
      file: 'src/pages/Game.tsx',
      function: 'fetchGameData',
      fetchSeq,
      gameId,
      statusBefore: game?.status ?? null,
      gameTypeBefore: game?.game_type ?? null,
      currentRoundBefore: currentRound?.id ?? null,
      authReadyAtStart: authReadyAtFetchStart,
      userIdPresent: !!userIdAtFetchStart,
    });
    console.log('[FETCH] Fetching game data...', { fetchSeq });

    // PARALLEL FETCH: Get game, players, and defaults all at once for speed
    const [gameResult, playersResult, defaultsResult] = await Promise.all([
      timedQuery('games.select+rounds', 'games', () =>
        supabase.from('games').select('*, rounds(*)').eq('id', gameId).maybeSingle()),
      timedQuery('players.select+profiles', 'players', () =>
        supabase.from('players').select('*, profiles(username, aggression_level)').eq('game_id', gameId).neq('status', 'left').order('position')),
      timedQuery('game_defaults.allow_bot_dealers', 'game_defaults', () =>
        supabase.from('game_defaults').select('allow_bot_dealers').eq('game_type', 'holm').single()),
    ]);

    const { data: gameData, error: gameError } = gameResult;
    const { data: playersData, error: playersError } = playersResult;
    const { data: gameDefaults } = defaultsResult;
    patchFetchTraceState({
      gameDataStatus: (gameData as any)?.status ?? null,
      gameDataGameType: (gameData as any)?.game_type ?? null,
      gameDataCurrentRound: (gameData as any)?.current_round ?? null,
      gameDataCurrentGameUuid: (gameData as any)?.current_game_uuid ?? null,
      gameDataTotalHands: (gameData as any)?.total_hands ?? null,
      gameDataAwaitingNextRound: (gameData as any)?.awaiting_next_round ?? null,
      gameErrorCode: (gameError as any)?.code ?? null,
      gameErrorMessage: gameError?.message ?? null,
      gameDataPresent: !!gameData,
      playersErrorCode: (playersError as any)?.code ?? null,
      playersErrorMessage: playersError?.message ?? null,
      playersDataPresent: !!playersData,
    });
    recordStartupFlight('FETCH TIMELINE', 'fetchGameData parallel queries complete', {
      file: 'src/pages/Game.tsx',
      function: 'fetchGameData',
      fetchSeq,
      elapsedMs: Date.now() - fetchStartedAt,
      oldValue: {
        status: game?.status ?? null,
        game_type: game?.game_type ?? null,
        current_game_uuid: (game as any)?.current_game_uuid ?? null,
        current_round: game?.current_round ?? null,
        roundId: currentRound?.id ?? null,
      },
      newValue: {
        status: (gameData as any)?.status ?? null,
        game_type: (gameData as any)?.game_type ?? null,
        current_game_uuid: (gameData as any)?.current_game_uuid ?? null,
        current_round: (gameData as any)?.current_round ?? null,
        total_hands: (gameData as any)?.total_hands ?? null,
        rounds: (gameData as any)?.rounds?.map((r: any) => ({ id: r.id, dealer_game_id: r.dealer_game_id, hand_number: r.hand_number, round_number: r.round_number, hasGinRummyState: !!r.gin_rummy_state })) ?? null,
        players: playersData?.map((p: any) => ({ id: p.id, position: p.position, is_bot: p.is_bot, ante_decision: p.ante_decision, sitting_out: p.sitting_out, status: p.status })) ?? null,
      },
      errors: { game: gameError?.message ?? null, players: playersError?.message ?? null },
    });


    // If a newer fetch started while this one was in-flight, ignore this response.
    if (isStale()) {
      console.log('[FETCH] Ignoring stale fetch response (post parallel query)', { fetchSeq, latest: fetchSeqRef.current });
      finishFetchTrace('superseded_after_parallel_fetch', 'stale_after_parallel_fetch');
      return;
    }

    if (gameError) {
      const code = (gameError as any)?.code;
      if (code === 'PGRST116' || String(gameError.message ?? '').toLowerCase().includes('0 rows')) {
        // P0 GUARD (NAV-02): a single fetch returning "0 rows" can be a transient
        // post-write replica race. Defer to the polling checkGameExists effect, which
        // requires repeated strikes + a fresh confirm before navigating.
        console.log('[FETCH] missing-game-fetch-deferred (will be handled by poll if persistent)');
        finishFetchTrace('returned_game_error', 'game_query_missing_deferred');
        return;
      }

      console.error('Failed to fetch game:', gameError);
      finishFetchTrace('returned_game_error', 'game_query_error');
      return;
    }

    if (!gameData) {
      // P0 GUARD (NAV-02): same as above — do not navigate from a single null fetch.
      console.log('[FETCH] missing-game-data-deferred (will be handled by poll if persistent)');
      finishFetchTrace('returned_no_game_data', 'game_query_no_data');
      return;
    }

    // ── HARD DEALER-GAME ADMISSION BOUNDARY ─────────────────────────────
    // Reject any hydrated round whose dealer_game_id does not match the
    // active dealer game. A new dealer game in ante_decision with no first
    // round must hydrate as rounds:[], NOT as the prior dealer game's row.
    // No historical fallback. Applied before any state write / current-round
    // derivation / shadow-sync feed.
    {
      const activeDealerGameId = (gameData as any).current_game_uuid ?? null;
      const incomingRounds: any[] = Array.isArray((gameData as any).rounds)
        ? (gameData as any).rounds
        : [];
      (gameData as any).rounds = activeDealerGameId
        ? incomingRounds.filter((r: any) => r?.dealer_game_id === activeDealerGameId)
        : [];
    }

    // Resolve the exact round this browser may present. This is independent
    // from games.total_hands only while PostgreSQL has prepared a non-actionable
    // H2. A live H1 barrier always wins; a released or historical H1 admits its
    // exact prepared successor immediately.
    let holmPublishedRound: Round | null = null;
    let holmClientRoundSelection: HolmClientPresentationRoundSelection<Round> | null = null;
    if (gameData.game_type === 'holm-game' && gameData.current_game_uuid) {
      holmPublishedRound = pickActiveSingleRoundGameRound(gameData.rounds as Round[], {
        dealerGameId: gameData.current_game_uuid,
        currentRoundNumber: gameData.current_round,
        currentHandNumber: gameData.total_hands,
      });
      if (holmPublishedRound) {
        const predecessorHandKey = getHolmPresentationHandKey({
          dealerGameId: gameData.current_game_uuid,
          roundId: holmPublishedRound.id,
          handNumber: holmPublishedRound.hand_number ?? 1,
        });
        holmClientRoundSelection = selectHolmClientPresentationRound({
          rounds: gameData.rounds as Round[],
          dealerGameId: gameData.current_game_uuid,
          publishedRound: holmPublishedRound,
          barrierRoundId: holmPresentationBarrierRef.current?.roundId ?? null,
          predecessorObservedLive: holmLiveRoundIdsObservedRef.current.has(predecessorHandKey),
          predecessorReleased: holmReleasedPresentationHandsRef.current.has(predecessorHandKey),
          awaitingNextRound: gameData.awaiting_next_round === true,
        });
      }

      const localPrepared = holmLocallyPreparedSuccessorRef.current;
      if (localPrepared && localPrepared.dealerGameId !== gameData.current_game_uuid) {
        holmLocallyPreparedSuccessorRef.current = null;
        holmPreparedAckInFlightRef.current = null;
        holmPreparedAckCompletedRef.current.clear();
      } else if (
        localPrepared
        && holmPublishedRound?.id === localPrepared.successorRoundId
        && holmPublishedRound.status === 'betting'
        && gameData.awaiting_next_round !== true
      ) {
        // Authority has caught up to the locally-dealt identity. Keeping H2
        // mounted is now handled by the normal authoritative projection.
        holmLocallyPreparedSuccessorRef.current = null;
      }
    }

    if (!isStale()) {
      setAllowBotDealers((gameDefaults as any)?.allow_bot_dealers ?? false);
    }
    
    // CRITICAL: Update refs for detecting changes via local state comparison
    const prevGameType = lastKnownGameTypeRef.current;
    const prevRound = lastKnownRoundRef.current;
    lastKnownGameTypeRef.current = gameData?.game_type || null;
    lastKnownRoundRef.current = gameData?.current_round ?? null;
    
    console.log('[FETCH] Game data received:', {
      current_round: gameData?.current_round,
      prev_round: prevRound,
      status: gameData?.status,
      game_type: gameData?.game_type,
      prev_game_type: prevGameType,
      awaiting_next_round: gameData?.awaiting_next_round,
      rounds_count: gameData?.rounds?.length,
      round_numbers: gameData?.rounds?.map((r: any) => r.round_number),
      // CRITICAL DEBUG: Check if community_cards are actually in the rounds data
      rounds_with_community_cards: gameData?.rounds?.map((r: any) => ({
        round_number: r.round_number,
        has_community_cards: !!r.community_cards,
        community_cards_length: r.community_cards?.length
      }))
    });
    
    // CRITICAL: If game type changed since last fetch (including from null), clear all card state
    // This catches the initial load case where prevGameType is null
    if (gameData?.game_type && prevGameType !== gameData?.game_type) {
      console.log('[FETCH] 🎯🎯🎯 GAME TYPE CHANGE DETECTED IN FETCH:', prevGameType, '->', gameData.game_type, '- CLEARING CARDS!');
      setPlayerCards([]);
      patchFetchTraceState({ setPlayerCardsCalled: true, playerCardsLengthAfter: 0 });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      maxRevealedRef.current = 0;
    }

    if (playersError) {
      console.error('Failed to fetch players:', playersError);
      finishFetchTrace('returned_players_error', 'players_query_error');
      return;
    }

    console.log('[FETCH] Players fetched:', playersData?.length, 'Status:', gameData?.status, 'Ante decisions:', playersData?.map(p => ({ 
      id: p.id, 
      user_id: p.user_id, 
      pos: p.position, 
      ante: p.ante_decision, 
      is_bot: p.is_bot 
    })));

    // Users join as observers - they must select a seat to become a player

    // (357.fetch.entry diagnostic removed)
    const is357Trace = false;


    // Fetch player cards if game is in progress or game_over (keep cards visible during announcements).
    // A connected Holm client can receive atomic `session_ended` before its
    // terminal reveal finishes. Retain/fetch only that exact live terminal
    // round; a fresh mount never sets holmSawLiveSessionRef and therefore
    // cannot hydrate or present historical cards.
    const isHolmGame = gameData.game_type === 'holm-game';
    const shouldFetchHolmLiveTerminalCards =
      isHolmGame &&
      gameData.status === 'session_ended' &&
      holmSawLiveSessionRef.current &&
      Boolean(gameData.current_game_uuid) &&
      Boolean(gameData.last_round_result);
    // CRITICAL: Also fetch if current_round is null but status is in_progress (race condition fix)
    const shouldFetchCards =
      gameData.status === 'in_progress' ||
      gameData.status === 'game_over' ||
      shouldFetchHolmLiveTerminalCards;
    const shouldFetchCardsReason357 = `status=${gameData.status ?? 'null'}`;

    // For Holm games, don't fetch cards during round transitions (awaiting_next_round) UNLESS game_over
    const keepCards = shouldFetchCards
      ? (
          gameData.status === 'game_over' ||
          shouldFetchHolmLiveTerminalCards ||
          !isHolmGame ||
          !gameData.awaiting_next_round
        )
      : false;

    // Keep cards visible during results announcement (last_round_result exists)
    const keepCardsForResults = shouldFetchCards
      ? Boolean(isHolmGame && gameData.awaiting_next_round && gameData.last_round_result)
      : false;

    const keepCardsDecision357 = shouldFetchCards ? (keepCards || keepCardsForResults) : false;
    patchFetchTraceState({
      shouldFetchCards,
      keepCards,
      keepCardsForResults,
    });
    const keepCardsReason357 = shouldFetchCards
      ? `status=${gameData.status ?? 'null'};isHolmGame=${isHolmGame};awaitingNextRound=${!!gameData.awaiting_next_round};hasLastRoundResult=${!!gameData.last_round_result}`
      : 'shouldFetchCards=false';

    const branchTaken357: 'skipped_should_fetch_cards' | 'skipped_keep_cards' | 'proceed_to_round_resolution' =
      !shouldFetchCards
        ? 'skipped_should_fetch_cards'
        : !keepCardsDecision357
          ? 'skipped_keep_cards'
          : 'proceed_to_round_resolution';
    if (branchTaken357 === 'skipped_should_fetch_cards') {
      setFetchTraceTerminal('skipped_card_fetch', 'card_gate:shouldFetchCards_false');
    } else if (branchTaken357 === 'skipped_keep_cards') {
      setFetchTraceTerminal('skipped_keep_cards', 'card_gate:keepCards_false');
    }

    // (357.fetch.card_gate + skipped-round_resolution diagnostics removed)


    if (shouldFetchCards) {
      // (isHolmGame/keepCards/keepCardsForResults lifted above for card_gate)
      
      if (keepCards || keepCardsForResults) {
        // Holm card presentation follows the exact hand published by games.
        // A prepared successor is deliberately present in rounds/player_cards
        // before activation, so "latest" is never a valid presentation owner.
        let roundData: { id: string; round_number: number; hand_number?: number; cards_dealt: number } | null = null;

        // 3-5-7 wartime unconditional trace: which round-selection branch ran
        let roundSelectionBranch357:
          | '357_authoritative_lookup'
          | 'fallback_current_round'
          | 'ultimate_fallback'
          | 'holm_branch'
          | 'holm_branch_skipped_no_dealer_game'
          | 'holm_branch_skipped_no_published_hand'
          | 'unknown' = 'unknown';
        let roundQueryError357: { code: string | null; message: string | null } = { code: null, message: null };
        let roundQueryRowsReturned357 = 0;
        
        if (isHolmGame) {
          const selectedHolmRound = holmClientRoundSelection?.round ?? null;
          // HOLM HARD GATE: round selection is scoped to the active
          // dealer_game_id. If no active dealer game, do NOT run any
          // cross-session "latest historical round" fallback — that
          // is exactly the dealer-game boundary leak.
          if (!gameData.current_game_uuid) {
            roundSelectionBranch357 = 'holm_branch_skipped_no_dealer_game';
            // Invalidate any in-flight card request and clear stale cards
            // so an old response cannot repopulate raw card state when the
            // active dealer game has cleared.
            cardFetchTokenRef.current = (cardFetchTokenRef.current ?? 0) + 1;
            if (!isStale()) {
              setPlayerCards([]);
            }
            roundData = null;
            ffRecord({
              writerId: 'Game.tsx:fetchHolmPresentedRound',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_ROUND_SELECTED',
              identity: { gameId, roundId: null, segmentId: null },
              payload: {
                trigger: 'fetchPlayers',
                dealerGameIdFilter: null,
                skipReason: 'no-active-dealer-game',
                gameStatus: gameData.status,
                gameCurrentRound: gameData.current_round,
                gameTotalHands: gameData.total_hands,
                awaitingNextRound: gameData.awaiting_next_round,
                hasLastRoundResult: !!gameData.last_round_result,
                clearedPlayerCards: true,
                bumpedFetchToken: cardFetchTokenRef.current,
              },
            });
          } else if (!selectedHolmRound) {
            roundSelectionBranch357 = 'holm_branch_skipped_no_published_hand';
            cardFetchTokenRef.current = (cardFetchTokenRef.current ?? 0) + 1;
            if (!isStale()) {
              setPlayerCards([]);
            }
            roundData = null;
            ffRecord({
              writerId: 'Game.tsx:fetchHolmPresentedRound',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_ROUND_SELECTED',
              identity: {
                gameId,
                roundId: null,
                segmentId: gameData.current_game_uuid,
              },
              payload: {
                trigger: 'fetchPlayers',
                dealerGameIdFilter: gameData.current_game_uuid,
                publishedHandNumber: holmPublishedRound?.hand_number ?? gameData.total_hands,
                publishedRoundNumber: holmPublishedRound?.round_number ?? gameData.current_round,
                skipReason: 'missing-client-presentation-identity',
                clearedPlayerCards: true,
                bumpedFetchToken: cardFetchTokenRef.current,
              },
            });
          } else {
            roundSelectionBranch357 = 'holm_branch';
            const { data, error } = await timedQuery('rounds.holm-presented', 'rounds', () =>
              supabase
                .from('rounds')
                .select('id, round_number, hand_number, cards_dealt')
                .eq('id', selectedHolmRound.id)
                .eq('game_id', gameId)
                .eq('dealer_game_id', gameData.current_game_uuid)
                .eq('hand_number', selectedHolmRound.hand_number ?? 0)
                .eq('round_number', selectedHolmRound.round_number)
                .maybeSingle());

            roundData = data;
            roundQueryError357 = { code: (error as any)?.code ?? null, message: (error as any)?.message ?? null };
            roundQueryRowsReturned357 = data ? 1 : 0;
            ffRecord({
              writerId: 'Game.tsx:fetchHolmPresentedRound',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_ROUND_SELECTED',
              identity: {
                gameId,
                roundId: roundData?.id ?? null,
                segmentId: gameData.current_game_uuid,
              },
              payload: {
                trigger: 'fetchPlayers',
                dealerGameIdFilter: gameData.current_game_uuid,
                presentationMode: holmClientRoundSelection?.mode ?? 'published',
                publishedRoundId: holmPublishedRound?.id ?? null,
                selectedRoundId: roundData?.id ?? null,
                selectedHandNumber: roundData?.hand_number ?? null,
                selectedRoundNumber: roundData?.round_number ?? null,
                selectedCardsDealt: roundData?.cards_dealt ?? null,
                gameStatus: gameData.status,
                gameCurrentRound: gameData.current_round,
                gameTotalHands: gameData.total_hands,
                awaitingNextRound: gameData.awaiting_next_round,
                hasLastRoundResult: !!gameData.last_round_result,
              },
            });
          }
        } else if (gameData.current_round && gameData.current_game_uuid && typeof gameData.total_hands === 'number') {
          // 3-5-7: round_number cycles 1/2/3 each hand, so we MUST key by hand_number too.
          // This prevents Hand 2 Round 1 from accidentally matching Hand 1 Round 1 within the same dealer game.
          roundSelectionBranch357 = '357_authoritative_lookup';
          const { data, error } = await timedQuery('rounds.357-current', 'rounds', () =>
            supabase
              .from('rounds')
              .select('id, round_number, cards_dealt')
              .eq('game_id', gameId)
              .eq('dealer_game_id', gameData.current_game_uuid)
              .eq('hand_number', gameData.total_hands)
              .eq('round_number', gameData.current_round)
              .maybeSingle());

          roundData = data;
          roundQueryError357 = { code: (error as any)?.code ?? null, message: (error as any)?.message ?? null };
          roundQueryRowsReturned357 = data ? 1 : 0;
        } else if (gameData.current_round) {
          // Fallback with current_round but missing some data - STILL scope by dealer_game_id when available
          // CRITICAL: Always scope by dealer_game_id to prevent cross-game contamination
          roundSelectionBranch357 = 'fallback_current_round';
          let fallbackQuery = supabase
            .from('rounds')
            .select('id, round_number, cards_dealt, dealer_game_id')
            .eq('game_id', gameId)
            .eq('round_number', gameData.current_round);
          
          // Add dealer_game_id filter when available (should almost always be present)
          if (gameData.current_game_uuid) {
            fallbackQuery = fallbackQuery.eq('dealer_game_id', gameData.current_game_uuid);
          } else {
            console.warn('[FETCH] ⚠️ Missing dealer_game_id - this may cause cross-game contamination');
          }
          
          const { data, error } = await timedQuery('rounds.fallback-by-round', 'rounds', () =>
            fallbackQuery
              .order('hand_number', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle());

          roundData = data;
          roundQueryError357 = { code: (error as any)?.code ?? null, message: (error as any)?.message ?? null };
          roundQueryRowsReturned357 = data ? 1 : 0;
        } else {
          // Ultimate fallback: get the most recent round - STILL scope by dealer_game_id when available
          // CRITICAL: Always scope by dealer_game_id to prevent cross-game contamination
          roundSelectionBranch357 = 'ultimate_fallback';
          let ultimateFallbackQuery = supabase
            .from('rounds')
            .select('id, round_number, cards_dealt, dealer_game_id')
            .eq('game_id', gameId);
          
          // Add dealer_game_id filter when available
          if (gameData.current_game_uuid) {
            ultimateFallbackQuery = ultimateFallbackQuery.eq('dealer_game_id', gameData.current_game_uuid);
          } else {
            console.warn('[FETCH] ⚠️ Missing dealer_game_id in ultimate fallback - this may cause cross-game contamination');
          }
          
          const { data, error } = await timedQuery('rounds.ultimate-fallback', 'rounds', () =>
            ultimateFallbackQuery
              .order('hand_number', { ascending: false })
              .order('round_number', { ascending: false })
              .limit(1)
              .maybeSingle());

          roundData = data;
          roundQueryError357 = { code: (error as any)?.code ?? null, message: (error as any)?.message ?? null };
          roundQueryRowsReturned357 = data ? 1 : 0;
          console.log('[FETCH] current_round is null, using most recent round:', roundData?.id);
        }

        // (357.fetch.round_resolution diagnostic removed)



        if (roundData) {
          const prevPlayerCardsRoundId = cardStateContext?.roundId ?? null;
          const targetRoundId = roundData.id;
          patchFetchTraceState({ resolvedRoundId: targetRoundId });

          // FIX 3: Mint a fetch token BEFORE the async fetch
          const fetchToken = ++cardFetchTokenRef.current;
          const fetchRoundId = targetRoundId;

          // Store authoritative card context from the round record
          const newCardContext: CardStateContext = {
            roundId: roundData.id,
            roundNumber: roundData.round_number,
            cardsDealt: roundData.cards_dealt
          };
          console.log('[FETCH] Setting card state context:', newCardContext);
          setCardStateContext(newCardContext);

          ffRecord({
            writerId: 'Game.tsx:fetchPlayers.cardContextSet:L6164',
            source: 'HOLM_SELF_HAND_LINEAGE',
            marker: 'HOLM_SELF_HAND_CARD_CONTEXT_SET',
            identity: {
              gameId,
              roundId: targetRoundId,
              segmentId: gameData.current_game_uuid ?? null,
            },
            payload: {
              fetchToken,
              prevPlayerCardsRoundId,
              targetRoundId,
              roundNumber: roundData.round_number,
              cardsDealt: roundData.cards_dealt,
              cardFetchTokenRefBefore: fetchToken - 1,
              cardFetchTokenRefAfter: fetchToken,
            },
          });

          // Log card-fetch-start
          persistSyncDebugEvent({
            gameId: gameId!,
            gameType: gameData.game_type ?? 'unknown',
            handNumber: gameData.total_hands ?? 0,
            roundId: fetchRoundId,
            eventType: 'transition',
            severity: 'info',
            eventName: 'card-fetch-start',
            payload: { fetchToken, fetchRoundId },
          });

          // ── 3-5-7 fetch hydration trace: REQUEST ─────────────────────
          const is357FetchTrace =
            gameData.game_type === '3-5-7' ||
            gameData.game_type === '357' ||
            gameData.game_type === '3-5-7-game';
          const localPlayerIdForTrace: string | null =
            (playersData ?? []).find((p: any) => p.user_id === user?.id)?.id ?? null;
          const playerCardsLengthBefore357 = playerCards.length;
          patchFetchTraceState({
            playerCardsLengthBefore: playerCardsLengthBefore357,
            resolvedRoundId: targetRoundId,
          });
          // (357.fetch.players_request diagnostic removed)


          const { data: cardsData, error: cardsError } = await timedQuery('player_cards.by-round', 'player_cards', () =>
            supabase
              .from('player_cards')
              .select('player_id, cards')
              .eq('round_id', targetRoundId));
          const localPlayerIdForOutcome: string | null =
            (playersData ?? []).find((p: any) => p.user_id === user?.id)?.id ?? null;
          const localSeatRowForOutcome = localPlayerIdForOutcome
            ? (cardsData ?? []).find((r: any) => r.player_id === localPlayerIdForOutcome) ?? null
            : null;
          patchFetchTraceState({
            playerCardsQueryExecuted: true,
            playerCardsRowsReturned: cardsData?.length ?? 0,
            localSeatRowPresent: !!localSeatRowForOutcome,
          });



          console.log('[FETCH] 🃏 Cards fetch result:', {
            roundId: targetRoundId,
            cardsCount: cardsData?.length || 0,
            cardsError: cardsError?.message,
            playerIds: cardsData?.map(c => c.player_id)
          });

          // Provenance: per-row identity & card-count/hash of returned rows.
          const rowSummaries = (cardsData ?? []).map((r) => {
            const arr = (r.cards ?? []) as Array<{ rank?: string; suit?: string }>;
            const fp = arr.map((c) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`).join('|');
            return { playerId: r.player_id, cardCount: arr.length, fingerprint: fp };
          });
          ffRecord({
            writerId: 'Game.tsx:fetchPlayers.playerCardsResponse:L6182',
            source: 'HOLM_SELF_HAND_LINEAGE',
            marker: 'HOLM_SELF_HAND_PLAYER_CARDS_RESPONSE',
            identity: {
              gameId,
              roundId: targetRoundId,
              segmentId: gameData.current_game_uuid ?? null,
            },
            payload: {
              fetchToken,
              requestedRoundId: targetRoundId,
              filters: { round_id: targetRoundId },
              rowCount: cardsData?.length ?? 0,
              hasError: !!cardsError,
              errorMessage: cardsError?.message ?? null,
              rowSummaries,
              currentTokenAtResponse: cardFetchTokenRef.current,
              tokenSuperseded: fetchToken !== cardFetchTokenRef.current,
            },
          });

          // FIX 1: REMOVED broken roundIdStillCurrent guard.
          // FIX 3: Use ONLY fetchToken + isStale() for staleness.
          let acceptance357: 'accepted' | 'superseded_by_generation' | 'rejected_stale_round' | 'rejected_no_rows' | 'rejected_error' | 'not_written_other' = 'not_written_other';
          let setPlayerCardsCalled357 = false;
          let playerCardsLengthAfter357 = playerCardsLengthBefore357;
          if (isStale()) {
            console.log('[FETCH] Ignoring stale card fetch (fetchSeq advanced)', { targetRoundId });
            ffRecord({
              writerId: 'Game.tsx:fetchPlayers.dropStale:L6195',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_DROPPED',
              identity: { gameId, roundId: targetRoundId },
              payload: { fetchToken, reason: 'isStale-fetchSeq-advanced', rowCount: cardsData?.length ?? 0 },
            });
            acceptance357 = 'superseded_by_generation';
            setFetchTraceTerminal('player_cards_superseded', 'player_cards_response:isStale');
          } else if (fetchToken !== cardFetchTokenRef.current) {
            // A newer fetch was dispatched while we were awaiting — drop this one
            console.warn('[FETCH] ⚠️ Dropping card fetch — fetchToken superseded', {
              ourToken: fetchToken,
              currentToken: cardFetchTokenRef.current,
              fetchRoundId,
            });
            persistSyncDebugEvent({
              gameId: gameId!,
              gameType: gameData.game_type ?? 'unknown',
              handNumber: gameData.total_hands ?? 0,
              roundId: fetchRoundId,
              eventType: 'sync-gate',
              severity: 'warn',
              eventName: 'card-fetch-drop-stale',
              payload: { fetchToken, currentToken: cardFetchTokenRef.current, fetchRoundId },
            });
            ffRecord({
              writerId: 'Game.tsx:fetchPlayers.dropTokenSuperseded:L6201',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_DROPPED',
              identity: { gameId, roundId: targetRoundId },
              payload: {
                fetchToken,
                currentToken: cardFetchTokenRef.current,
                reason: 'token-superseded',
                rowCount: cardsData?.length ?? 0,
                rowSummaries,
              },
            });
            acceptance357 = 'superseded_by_generation';
            setFetchTraceTerminal('player_cards_superseded', 'player_cards_response:fetchToken_superseded');
          } else if (cardsData && cardsData.length > 0) {
            console.log('[FETCH] Setting player cards for round:', cardsData.length, 'players');
            persistSyncDebugEvent({
              gameId: gameId!,
              gameType: gameData.game_type ?? 'unknown',
              handNumber: gameData.total_hands ?? 0,
              roundId: fetchRoundId,
              eventType: 'transition',
              severity: 'info',
              eventName: 'card-fetch-apply',
              payload: { fetchToken, fetchRoundId, cardCount: cardsData.length },
            });
            setPlayerCards(
              cardsData.map((cd) => ({
                player_id: cd.player_id,
                cards: cd.cards as unknown as CardType[],
              }))
            );
            // Bind the accepted cards to the exact identity that produced them.
            setPlayerCardsIdentity({
              dealerGameId: gameData.current_game_uuid ?? null,
              handNumber: typeof roundData.hand_number === 'number'
                ? roundData.hand_number
                : (typeof gameData.total_hands === 'number' ? gameData.total_hands : null),
              roundId: targetRoundId,
              handContextId: targetRoundId,
            });
            ffRecord({
              writerId: 'Game.tsx:fetchPlayers.setPlayerCardsApply:L6230',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_WRITE_ACCEPTED',
              identity: { gameId, roundId: targetRoundId },
              payload: {
                fetchToken,
                rowCount: cardsData.length,
                rowSummaries,
                prevPlayerCardsRoundId,
                action: 'setPlayerCards(rows)',
              },
            });
            acceptance357 = 'accepted';
            setPlayerCardsCalled357 = true;
            playerCardsLengthAfter357 = cardsData.length;
            setFetchTraceTerminal('player_cards_accepted', 'player_cards_response:rows_accepted', {
              setPlayerCardsCalled: true,
              playerCardsLengthAfter: cardsData.length,
            });
          } else if (cardsError) {
            console.error('[FETCH] ❌ Cards fetch error (RLS?):', cardsError);
            ffRecord({
              writerId: 'Game.tsx:fetchPlayers.fetchError:L6232',
              source: 'HOLM_SELF_HAND_LINEAGE',
              marker: 'HOLM_SELF_HAND_FETCH_ERROR',
              identity: { gameId, roundId: targetRoundId },
              payload: { fetchToken, errorMessage: cardsError.message },
            });
            acceptance357 = 'rejected_error';
            setFetchTraceTerminal('player_cards_error', 'player_cards_response:error');
          } else {
            // If the round id changed but the new round has no cards yet,
            // clear local cards to avoid rendering previous hand.
            if (prevPlayerCardsRoundId && prevPlayerCardsRoundId !== targetRoundId) {
              console.warn('[FETCH] No cards yet for NEW round - clearing stale playerCards', {
                prevPlayerCardsRoundId,
                nextRoundId: targetRoundId,
              });
              setPlayerCards([]);
              ffRecord({
                writerId: 'Game.tsx:fetchPlayers.clearStaleRound:L6241',
                source: 'HOLM_SELF_HAND_LINEAGE',
                marker: 'HOLM_SELF_HAND_CLEAR_STALE_ROUND',
                identity: { gameId, roundId: targetRoundId },
                payload: {
                  fetchToken,
                  prevPlayerCardsRoundId,
                  nextRoundId: targetRoundId,
                  reason: 'new-round-no-cards-yet',
                  action: 'setPlayerCards([])',
                },
              });
              acceptance357 = 'accepted';
              setPlayerCardsCalled357 = true;
              playerCardsLengthAfter357 = 0;
              setFetchTraceTerminal('player_cards_empty_accepted', 'player_cards_response:empty_new_round_cleared', {
                setPlayerCardsCalled: true,
                playerCardsLengthAfter: 0,
              });
            } else {
              console.log('[FETCH] No cards found for round, keeping existing cards (same round - likely timing)');
              ffRecord({
                writerId: 'Game.tsx:fetchPlayers.emptySameRound:L6243',
                source: 'HOLM_SELF_HAND_LINEAGE',
                marker: 'HOLM_SELF_HAND_RESPONSE_EMPTY_SAME_ROUND',
                identity: { gameId, roundId: targetRoundId },
                payload: {
                  fetchToken,
                  prevPlayerCardsRoundId,
                  targetRoundId,
                  reason: 'same-round-no-cards-keeping-existing',
                },
              });
              acceptance357 = 'not_written_other';
              setFetchTraceTerminal('player_cards_empty_not_written', 'player_cards_response:empty_same_round_not_written', {
                setPlayerCardsCalled: false,
                playerCardsLengthAfter: playerCardsLengthBefore357,
              });
            }
          }

          patchFetchTraceState({
            setPlayerCardsCalled: setPlayerCardsCalled357,
            playerCardsLengthAfter: playerCardsLengthAfter357,
          });

          // (357.fetch.players_result diagnostic removed)

        } else if (shouldFetchCards && (keepCards || keepCardsForResults)) {
          setFetchTraceTerminal('round_not_resolved', 'round_resolution:no_roundData', {
            resolvedRoundId: null,
            playerCardsQueryExecuted: false,
            playerCardsRowsReturned: null,
          });
        }

      } else if (isHolmGame && gameData.awaiting_next_round && !gameData.last_round_result) {
        // Clear cards only for Holm games when awaiting next round AND results have been cleared
        console.log('[FETCH] Clearing player cards (Holm game transitioning to next round)');
        setPlayerCards([]);
        patchFetchTraceState({ setPlayerCardsCalled: true, playerCardsLengthAfter: 0 });
      }
    } else if (gameData.status !== 'in_progress' && gameData.status !== 'game_over') {
      // Only clear cards when explicitly NOT in active play states
      console.log('[FETCH] Clearing player cards (status:', gameData.status, ')');
      if (!isStale()) {
        setPlayerCards([]);
        patchFetchTraceState({ setPlayerCardsCalled: true, playerCardsLengthAfter: 0 });
      }
    }

    // ALWAYS update players, even if fetch is stale - players list should reflect latest data
    // This is critical for the waiting phase where bots are added and need to appear immediately
    const publishedPlayers = (playersData || []).sort((a, b) => a.position - b.position);
    // Keep the imperative mirror in lockstep with publication so callers that
    // await a fetch can read the projection synchronously (no timers/polling).
    playersRef.current = publishedPlayers as any;
    setPlayers(publishedPlayers);

    // Apply game state only if this fetch is still the most recent.
    // This prevents game state flickering (e.g., modal remounts) from out-of-order responses.
    if (isStale()) {
      console.log('[FETCH] Ignoring stale fetch results for game state', { fetchSeq, latest: fetchSeqRef.current });
      finishFetchTrace('superseded_after_parallel_fetch', 'stale_before_game_state_apply');
      return;
    }

    // ── Optimistic Gin seed regression guard ──────────────────────────
    // If we have an active optimistic seed for this dealerGameId and the
    // incoming snapshot does not yet reflect it (DB hasn't caught up, or
    // an earlier-in-flight fetch is landing now), merge seeded identity
    // forward instead of overwriting. Clear the seed once reconciled, or
    // if the dealerGameId boundary actually changed.
    let gameDataToApply: any = gameData;
    const seed = ginOptimisticSeedRef.current;
    if (seed) {
      const incomingDealerGameUuid = (gameData as any)?.current_game_uuid ?? null;
      if (incomingDealerGameUuid && incomingDealerGameUuid !== seed.dealerGameId) {
        // True boundary to a different dealer-game — release the seed.
        ginOptimisticSeedRef.current = null;
      } else {
        const incomingRounds: any[] = Array.isArray((gameData as any)?.rounds)
          ? (gameData as any).rounds
          : [];
        const hasSeededRound = incomingRounds.some((r) => r?.id === seed.roundId);
        const incomingStatus = (gameData as any)?.status ?? null;
        const reconciled = incomingStatus === 'in_progress' && hasSeededRound;
        if (reconciled) {
          ginOptimisticSeedRef.current = null;
        } else {
          // Regression detected — preserve seeded fields.
          const seededRoundRow = (game?.rounds ?? []).find((r: any) => r?.id === seed.roundId) ?? null;
          const mergedRounds = hasSeededRound || !seededRoundRow
            ? incomingRounds
            : [...incomingRounds, seededRoundRow];
          gameDataToApply = {
            ...(gameData as any),
            status: 'in_progress',
            current_round: 1,
            total_hands: Math.max(((gameData as any)?.total_hands ?? 0), seed.handNumber),
            is_first_hand: seed.handNumber === 1,
            rounds: mergedRounds,
          };
          recordStartupFlight('SYNC TIMELINE', 'fetchGameData regression suppressed by gin seed', {
            file: 'src/pages/Game.tsx',
            function: 'fetchGameData',
            seedDealerGameId: seed.dealerGameId,
            seedRoundId: seed.roundId,
            seedHandNumber: seed.handNumber,
            incomingStatus,
            incomingHasSeededRound: hasSeededRound,
            incomingRoundCount: incomingRounds.length,
            ageMs: Date.now() - seed.seededAt,
          });
        }
      }
    }

    // ── fetchGameData waterfall summary ─────────────────────────────
    const postprocessStartOffsetMs = Date.now() - fetchStartedAt;
    recordStartupFlight('FETCH TIMELINE', 'fetchGameData.postprocess.start', {
      fetchSeq,
      offsetMs: postprocessStartOffsetMs,
    });
    let _slowest: QueryTiming | null = null;
    for (const q of queryTimings) {
      if (!_slowest || q.elapsedMs > _slowest.elapsedMs) _slowest = q;
    }
    recordStartupFlight('FETCH TIMELINE', 'fetchGameData.waterfall', {
      fetchSeq,
      totalElapsedMs: Date.now() - fetchStartedAt,
      queries: queryTimings,
      queryCount: queryTimings.length,
      slowestStep: _slowest?.name ?? null,
      slowestStepElapsedMs: _slowest?.elapsedMs ?? 0,
      slowestStepTable: _slowest?.table ?? null,
      preAuth: !authReadyAtFetchStart,
      authReady: authReadyAtFetchStart,
      userIdPresent: !!userIdAtFetchStart,
      setGameOffsetMs: postprocessStartOffsetMs,
    });

    setGame(gameDataToApply);
    recordStartupFlight('FETCH TIMELINE', 'fetchGameData.postprocess.complete', {
      fetchSeq,
      offsetMs: Date.now() - fetchStartedAt,
      postprocessElapsedMs: Date.now() - fetchStartedAt - postprocessStartOffsetMs,
    });

    recordStartupFlight('FETCH TIMELINE', 'fetchGameData setGame applied', {
      file: 'src/pages/Game.tsx',
      function: 'fetchGameData',
      fetchSeq,
      elapsedMs: Date.now() - fetchStartedAt,
      oldValue: {
        status: game?.status ?? null,
        game_type: game?.game_type ?? null,
        current_game_uuid: (game as any)?.current_game_uuid ?? null,
        roundId: currentRound?.id ?? null,
      },
      newValue: {
        status: (gameData as any)?.status ?? null,
        game_type: (gameData as any)?.game_type ?? null,
        current_game_uuid: (gameData as any)?.current_game_uuid ?? null,
        current_round: (gameData as any)?.current_round ?? null,
        total_hands: (gameData as any)?.total_hands ?? null,
      },
    });
    ginTrace('reducer.setGame applied (fetchGameData)', {
      current_game_uuid: gameData?.current_game_uuid?.slice(0, 8) ?? null,
      status: gameData?.status ?? null,
      roundsCount: Array.isArray((gameData as any)?.rounds) ? (gameData as any).rounds.length : null,
    });

    // ── Holm shadow sync feed (Phase 2: read-only) ──
    if (gameData.game_type === 'holm-game') {
      const isLocallyPreparedPresentation =
        holmClientRoundSelection?.mode === 'prepared-successor';
      const holmRound = isLocallyPreparedPresentation
        ? holmClientRoundSelection!.round
        : holmPublishedRound;
      const snapshotGameData: GameData = isLocallyPreparedPresentation && holmRound
        ? {
            ...gameData,
            total_hands: holmRound.hand_number ?? gameData.total_hands,
            all_decisions_in: false,
            all_decisions_in_round_id: null,
            last_round_result: null,
            buck_position: holmRound.pending_turn_position ?? gameData.buck_position,
          }
        : gameData;
      const snapshotPlayers = isLocallyPreparedPresentation
        ? (playersData || []).map((player) => ({
            ...player,
            current_decision: null,
            decision_locked: false,
          })) as Player[]
        : (playersData || []) as Player[];

      if (isLocallyPreparedPresentation && holmRound && gameData.current_game_uuid) {
        holmLocallyPreparedSuccessorRef.current = {
          dealerGameId: gameData.current_game_uuid,
          predecessorRoundId: holmClientRoundSelection!.predecessorRound.id,
          successorRoundId: holmRound.id,
          handNumber: holmRound.hand_number ?? 1,
          handContextId: `${holmRound.id}:h${holmRound.hand_number ?? 1}`,
        };
      }

      if (holmRound && !isLocallyPreparedPresentation && isHolmTraceArmed()) {
        const prior = latestAuthoritativeTurnRef.current;
        const previousCurrentTurnPosition = prior?.roundId === holmRound.id
          ? prior.currentTurnPosition
          : null;
        recordHolmTrace('TURN_AUTHORITY_ARRIVAL', `fetchGameData turn=${previousCurrentTurnPosition ?? 'null'}→${holmRound.current_turn_position ?? 'null'}`,
          buildHolmTurnAuthorityTraceDetail({
            source: 'fetchGameData',
            round: holmRound,
            players: (playersData || []) as Player[],
            previousCurrentTurnPosition,
          }),
        );
      }
      const snapshot = buildHolmSnapshot(snapshotGameData, snapshotPlayers, holmRound);
      if (snapshot) {
        const prevRoundId = holmSyncLastRoundIdRef.current;
        const isBoundary = !!prevRoundId && prevRoundId !== snapshot.roundId;
        if (holmPresentationDealerGameRef.current !== snapshot.dealerGameId) {
          holmPresentationDealerGameRef.current = snapshot.dealerGameId;
          holmPresentationBarrierRef.current = null;
          holmPresentationCompletionEvidenceRef.current.clear();
          holmLiveRoundIdsObservedRef.current.clear();
          holmReleasedPresentationHandsRef.current.clear();
        }
        const activeBarrier = holmPresentationBarrierRef.current;
        if (activeBarrier && activeBarrier.dealerGameId !== snapshot.dealerGameId) {
          // A dealer-game boundary is a hard lifecycle reset. Never carry a
          // predecessor presentation hold into the next dealer game.
          holmPresentationBarrierRef.current = null;
          holmPresentationCompletionEvidenceRef.current.clear();
        }
        const presentationBarrier = holmPresentationBarrierRef.current;
        const shouldHoldAuthoritativeSuccessor = shouldHoldHolmAuthoritativeSuccessor({
          barrier: presentationBarrier,
          presentedRoundId: prevRoundId,
          incoming: {
            dealerGameId: snapshot.dealerGameId,
            roundId: snapshot.roundId,
            handNumber: snapshot.handNumber,
            transferCursor: snapshot.chipTransferCursor,
          },
        });

        if (shouldHoldAuthoritativeSuccessor) {
          console.log('[HOLM PRESENTATION] Buffered authoritative successor behind local predecessor', {
            dealerGameId: snapshot.dealerGameId,
            predecessorRoundId: presentationBarrier!.roundId,
            successorRoundId: snapshot.roundId,
            successorHandNumber: snapshot.handNumber,
          });
        } else {

        if (isBoundary) {
          console.log('[GameStateSync:Holm] 🔄 Hard reset — roundId changed', {
            prev: prevRoundId,
            next: snapshot.roundId,
          });
          resetRegressiveRevealTracking(`${snapshot.roundId}:${snapshot.handNumber}`);

          // ── P0 (Holm cutover): reset to CLEAN baseline, not the new snapshot. ──
          // Mirrors the Horses P0 #2 framework fix: seeding the framework with the
          // incoming snapshot makes its progress vector the new authoritative floor,
          // which can dominate subsequent legitimate forward updates as "regressive"
          // if any dim of the new snapshot temporarily reads lower than a stale
          // prior-hand terminal snapshot still buffered upstream. Seeding with null
          // forces the framework into pendingPostResetHydration, and the very next
          // receiveAuthoritativeUpdate (immediately below) hydrates presentation
          // from a clean floor.
          holmSync.reset(null);

          // Forensic event mirroring the Horses/Yahtzee cutover diagnostics.
          import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
            persistSyncDebugEvent({
              gameId: snapshot.dealerGameId || null,
              gameType: 'holm-game',
              handNumber: snapshot.handNumber,
              roundId: snapshot.roundId,
              eventType: 'transition',
              severity: 'info',
              eventName: 'holm-framework-identity-reset-fired',
              payload: {
                prevRoundId,
                nextRoundId: snapshot.roundId,
                nextHandNumber: snapshot.handNumber,
                nextPhase: snapshot.roundStatus,
                seededWith: 'null-baseline',
              },
            });
          });

          // ── P0-1 + P0-3 FIX: Clear lifted caches on hand boundary (roundId change) ──
          // These refs live outside the sync framework and previously only cleared on
          // current_game_uuid change, causing stale community cards to leak across hands
          // within the same dealer game.
          communityCardsCacheRef.current = { cards: null, round: null, show: false };
          showdownCardsCacheRef.current = new Map();
          showdownRoundNumberRef.current = null;
          maxRevealedRef.current = snapshot.communityCardsRevealed;
          cardIdentityRef.current = '';
          setCommunityCacheEpoch((e) => e + 1);
        }

        const isHolmChuckyWin =
          !!snapshot.lastRoundResult &&
          snapshot.lastRoundResult.includes('beat Chucky') &&
          !snapshot.lastRoundResult.includes('Chucky beat');
        const shouldStageHolmTerminalReveal =
          gameData.status === 'session_ended' &&
          holmSawLiveSessionRef.current &&
          snapshot.roundStatus === 'completed' &&
          snapshot.communityCardsRevealed >= 4 &&
          snapshot.chuckyActive &&
          snapshot.chuckyCardsRevealed > 0 &&
          isHolmChuckyWin;
        const terminalRevealKey = shouldStageHolmTerminalReveal
          ? startHolmTerminalRevealPresentation(snapshot)
          : null;
        const result = holmSync.receiveAuthoritativeUpdate(snapshot);
        if (shouldStageHolmTerminalReveal && !terminalRevealKey) {
          // A live client that did not retain a pre-terminal round has no safe
          // visual baseline to animate from. Admit the already-authoritative
          // completed frame rather than inventing gameplay state.
          setHolmTerminalRevealPresentationKey(null);
          setHolmTerminalRevealCompleteKey(
            `holm|winpot|${snapshot.dealerGameId}|${snapshot.handNumber}|${snapshot.lastRoundResult ?? ''}`,
          );
        }

        // Forensic event: every accepted/rejected authoritative arrival.
        import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
          persistSyncDebugEvent({
            gameId: snapshot.dealerGameId || null,
            gameType: 'holm-game',
            handNumber: snapshot.handNumber,
            roundId: snapshot.roundId,
            eventType: 'transition',
            severity: result.accepted ? 'info' : 'warn',
            eventName: 'holm-auth-turn-handoff-received',
            payload: {
              accepted: result.accepted,
              reason: result.reason,
              comparison: result.comparison,
              stampedHand: snapshot.__syncHandNumber ?? snapshot.handNumber,
              phase: snapshot.roundStatus,
              decided: snapshot.players.filter(p => p.decisionLocked).length,
              revealed: snapshot.communityCardsRevealed,
              isBoundary,
            },
          });
        });

        holmSyncLastRoundIdRef.current = snapshot.roundId;
        }
      }
    }

    // ── 3-5-7 sync feed (Phase 3 — presentation cutover) ──
    if (gameData.game_type === '3-5-7' || gameData.game_type === '357' || gameData.game_type === '3-5-7-game') {
      const threeFiveSevenRound = pickActive357Round(gameData.rounds as Round[], {
        currentRoundNumber: gameData.current_round,
        currentHandNumber: gameData.total_hands,
        dealerGameId: gameData.current_game_uuid,
      });
      const snapshot = buildThreeFiveSevenSnapshot(gameData, (playersData || []) as Player[], threeFiveSevenRound);
      const acceptedIdentity357 = threeFiveSevenAcceptedIdentityRef.current;
      const suppressRegressive357Identity = !!snapshot && (
        threeFiveSevenRetiredDealerGamesRef.current.has(snapshot.dealerGameId)
        || (
          acceptedIdentity357?.dealerGameId === snapshot.dealerGameId
          && (
            snapshot.handNumber < acceptedIdentity357.handNumber
            || (
              snapshot.handNumber === acceptedIdentity357.handNumber
              && snapshot.roundNumber < acceptedIdentity357.roundNumber
            )
          )
        )
      );

      // ── DIAGNOSTIC: Log every authoritative arrival (always-on for investigation) ──
      const prevRoundId357 = threeFiveSevenSyncLastRoundIdRef.current;
      const currentPresentation357 = threeFiveSevenSync.presentationState;
      persist357Investigation(gameData.id, gameData.total_hands ?? 0, '357-authoritative-update-received', {
        snapshotExists: !!snapshot,
        incomingRoundId: snapshot?.roundId?.slice(0, 8) ?? null,
        incomingHandNumber: snapshot?.handNumber ?? null,
        incomingRoundNumber: snapshot?.roundNumber ?? null,
        incomingPhase: snapshot?.roundStatus ?? null,
        incomingDecidedCount: snapshot?.players.filter(p => p.decisionLocked).length ?? 0,
        prevRoundId: prevRoundId357?.slice(0, 8) ?? null,
        presentationRoundId: currentPresentation357?.roundId?.slice(0, 8) ?? null,
        presentationHandNumber: currentPresentation357?.handNumber ?? null,
        presentationRoundNumber: currentPresentation357?.roundNumber ?? null,
        presentationPhase: currentPresentation357?.roundStatus ?? null,
        isFrozen: threeFiveSevenSync.isFrozen,
        isOptimistic: threeFiveSevenSync.isOptimistic,
        lastRoundResult: gameData.last_round_result ?? null,
        awaitingNextRound: gameData.awaiting_next_round ?? false,
        gameCurrentRound: gameData.current_round,
        gameTotalHands: gameData.total_hands,
      }, snapshot?.roundId);

      if (snapshot && !suppressRegressive357Identity) {
        if (prevRoundId357 && prevRoundId357 !== snapshot.roundId) {
          // ── Identity boundary reset (always-on) ──
          persist357Investigation(gameData.id, snapshot.handNumber, '357-round-boundary-reset', {
            oldRoundId: prevRoundId357.slice(0, 8),
            newRoundId: snapshot.roundId.slice(0, 8),
            oldRoundNumber: currentPresentation357?.roundNumber ?? null,
            newRoundNumber: snapshot.roundNumber,
            oldHandNumber: currentPresentation357?.handNumber ?? null,
            newHandNumber: snapshot.handNumber,
            wasFrozen: threeFiveSevenSync.isFrozen,
          }, snapshot.roundId);
          // Clean-baseline reset: clear stale terminal authoritative snapshot
          // from the prior round so the new round's fresh state is never
          // rejected as "regressive" by the progress-vector gate.
          // (Mirrors Horses P0 #2 and Holm framework cutover.)
          threeFiveSevenSync.reset(null);
          const boundaryResult = threeFiveSevenSync.receiveAuthoritativeUpdate(snapshot);

          // ── 357-presentation-cleared-by-reset: trace what reset did ──
          persist357Investigation(gameData.id, snapshot.handNumber, '357-presentation-cleared-by-reset', {
            resetTriggeredBy: 'identity-boundary',
            presentationRoundIdBefore: currentPresentation357?.roundId?.slice(0, 8) ?? null,
            presentationHandNumberBefore: currentPresentation357?.handNumber ?? null,
            presentationRoundNumberBefore: currentPresentation357?.roundNumber ?? null,
            resetCalledWithRoundId: snapshot.roundId.slice(0, 8),
            resetCalledWithHandNumber: snapshot.handNumber,
            resetCalledWithRoundNumber: snapshot.roundNumber,
            postResetAccepted: boundaryResult.accepted,
            postResetReason: boundaryResult.reason,
            postResetPresentationRoundId: threeFiveSevenSync.presentationState?.roundId?.slice(0, 8) ?? null,
            isFrozenAfterReset: threeFiveSevenSync.isFrozen,
          }, snapshot.roundId);
        } else {
          const result = threeFiveSevenSync.receiveAuthoritativeUpdate(snapshot);

          if (result.accepted) {
            // ── 357-presentation-write diagnostic (always-on) ──
            const presBeforeSnapshot = result.presentationBefore as ThreeFiveSevenAuthoritativeSnapshot | null;
            if (result.presentationAction === 'written') {
              persist357Investigation(gameData.id, snapshot.handNumber, '357-presentation-write-committed', {
                reason: result.reason,
                presentationRoundIdBefore: presBeforeSnapshot?.roundId?.slice(0, 8) ?? null,
                presentationHandNumberBefore: presBeforeSnapshot?.handNumber ?? null,
                presentationRoundNumberBefore: presBeforeSnapshot?.roundNumber ?? null,
                writtenRoundId: snapshot.roundId.slice(0, 8),
                writtenHandNumber: snapshot.handNumber,
                writtenRoundNumber: snapshot.roundNumber,
                wasFrozenAtWrite: result.wasFrozenAtWrite,
                incomingProgress: result.incomingProgress,
              }, snapshot.roundId);
            } else if (result.presentationAction === 'skipped-frozen') {
              persist357Investigation(gameData.id, snapshot.handNumber, '357-presentation-write-skipped-frozen', {
                reason: result.reason,
                presentationRoundIdBefore: presBeforeSnapshot?.roundId?.slice(0, 8) ?? null,
                presentationHandNumberBefore: presBeforeSnapshot?.handNumber ?? null,
                wasFrozenAtWrite: result.wasFrozenAtWrite,
                incomingProgress: result.incomingProgress,
              }, snapshot.roundId);
            }

            // ── 357-authoritative-update-accepted (always-on) ──
            persist357Investigation(gameData.id, snapshot.handNumber, '357-authoritative-update-accepted', {
              reason: result.reason,
              comparison: result.comparison,
              incomingProgress: result.incomingProgress,
              previousProgress: result.previousProgress,
              incomingRoundNumber: snapshot.roundNumber,
              incomingPhase: snapshot.roundStatus,
              presentationAction: result.presentationAction,
              wasFrozenAtWrite: result.wasFrozenAtWrite,
            }, snapshot.roundId);

            // Presentation cutover invariant checks
            const presentedState = threeFiveSevenSync.presentationState;
            const renderedRound = presentedState?.roundNumber ?? 0;
            const renderedHand = presentedState?.handNumber ?? 0;
            checkThreeFiveSevenStaleRound(gameData.id, renderedRound, snapshot.roundNumber, snapshot.handNumber);
            checkThreeFiveSevenStaleHand(gameData.id, renderedHand, snapshot.handNumber);

            // ── 357-presentation-still-zero: detect broken init ──
            if (renderedHand === 0 || renderedRound === 0) {
              persist357Investigation(gameData.id, snapshot.handNumber, '357-presentation-still-zero', {
                renderedHand,
                renderedRound,
                authoritativeHand: snapshot.handNumber,
                authoritativeRound: snapshot.roundNumber,
                authoritativeRoundId: snapshot.roundId.slice(0, 8),
                presentationRoundId: presentedState?.roundId?.slice(0, 8) ?? null,
                isFrozen: threeFiveSevenSync.isFrozen,
                isOptimistic: threeFiveSevenSync.isOptimistic,
                isFirstUpdate: !prevRoundId357,
                progressVector: result.incomingProgress,
                presentationAction: result.presentationAction,
                wasFrozenAtWrite: result.wasFrozenAtWrite,
                presentationBeforeRoundId: presBeforeSnapshot?.roundId?.slice(0, 8) ?? null,
              }, snapshot.roundId);
            }
          } else {
            // ── 357-authoritative-update-rejected (always-on) ──
            persist357Investigation(gameData.id, snapshot.handNumber, '357-authoritative-update-rejected', {
              reason: result.reason,
              comparison: result.comparison,
              incomingProgress: result.incomingProgress,
              previousProgress: result.previousProgress,
              incomingRoundNumber: snapshot.roundNumber,
              incomingPhase: snapshot.roundStatus,
              incomingDecidedCount: snapshot.players.filter(p => p.decisionLocked).length,
            }, snapshot.roundId);
          }
        }
        if (acceptedIdentity357 && acceptedIdentity357.dealerGameId !== snapshot.dealerGameId) {
          threeFiveSevenRetiredDealerGamesRef.current.add(acceptedIdentity357.dealerGameId);
        }
        threeFiveSevenAcceptedIdentityRef.current = {
          dealerGameId: snapshot.dealerGameId,
          handNumber: snapshot.handNumber,
          roundNumber: snapshot.roundNumber,
          roundId: snapshot.roundId,
        };
        threeFiveSevenSyncLastRoundIdRef.current = snapshot.roundId;
      } else if (snapshot && suppressRegressive357Identity) {
        persist357Investigation(gameData.id, snapshot.handNumber, '357-regressive-identity-rejected', {
          incoming: {
            dealerGameId: snapshot.dealerGameId,
            handNumber: snapshot.handNumber,
            roundNumber: snapshot.roundNumber,
            roundId: snapshot.roundId,
          },
          accepted: acceptedIdentity357,
        }, snapshot.roundId);
      } else {
        // ── DIAGNOSTIC: No snapshot built (always-on) ──
        persist357Investigation(gameData.id, gameData.total_hands ?? 0, '357-no-snapshot-built', {
          roundFound: !!threeFiveSevenRound,
          roundId: threeFiveSevenRound?.id?.slice(0, 8) ?? null,
          gameStatus: gameData.status,
          currentRound: gameData.current_round,
          totalHands: gameData.total_hands,
          dealerGameId: gameData.current_game_uuid?.slice(0, 8) ?? null,
          roundCount: (gameData.rounds as Round[])?.length ?? 0,
        });
      }
    }

    // CRITICAL: Update refs with current game state for realtime change detection
    lastKnownGameTypeRef.current = gameData.game_type;
    lastKnownRoundRef.current = gameData.current_round;

    // CRITICAL: Update pause ref immediately when fetching game data
    // This ensures timer stops even if realtime updates aren't working for observers
    isPausedRef.current = gameData.is_paused;
    if (gameData.is_paused && timerIntervalRef.current) {
      console.log('[FETCH] ⏸️ Game is paused - clearing timer interval');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Calculate time left ONLY if game is actively in progress AND not in transition
    // CRITICAL: Never set timeLeft during game_over to prevent unmounting GameOverCountdown
    if (gameData.status === 'in_progress' && 
        gameData.rounds && 
        gameData.rounds.length > 0 &&
        !gameData.awaiting_next_round &&
        !gameData.last_round_result &&
        !gameData.game_over_at) {  // Don't set timeLeft if game_over_at is set
      // CRITICAL: Pick the correct round for timer calculations.
      // For dice games, never fall back to the previous round while the new round row is still being created.
      const isHolm = gameData.game_type === 'holm-game';
      const isDice = gameData.game_type === 'horses' || gameData.game_type === 'ship-captain-crew' || gameData.game_type === 'yahtzee';
      const isCribbage = gameData.game_type === 'cribbage';
      const isGinRummy = gameData.game_type === 'gin-rummy';

      let currentRound: Round | null = null;
      if (isHolm || isCribbage || isGinRummy) {
        // Holm, Cribbage, and Gin Rummy use single-round-per-hand pattern
        currentRound = pickActiveSingleRoundGameRound(gameData.rounds as Round[], {
          dealerGameId: gameData.current_game_uuid,
          currentRoundNumber: gameData.current_round,
          currentHandNumber: gameData.total_hands,
        });
      } else if (gameData.game_type === '3-5-7') {
        currentRound =
          pickActive357Round(gameData.rounds as Round[], {
            currentRoundNumber: gameData.current_round,
            currentHandNumber: gameData.total_hands,
            dealerGameId: gameData.current_game_uuid,
          }) ?? null;
      } else if (typeof gameData.current_round === 'number') {
        // CRITICAL: Scope by dealer_game_id AND hand_number to prevent cross-contamination
        const dealerRounds = gameData.current_game_uuid
          ? (gameData.rounds as Round[]).filter((r) => r.dealer_game_id === gameData.current_game_uuid)
          : (gameData.rounds as Round[]);
        const matching = dealerRounds.filter((r) => r.round_number === gameData.current_round);
        currentRound = matching.reduce<Round | null>(
          (best, r) => (!best || (r.hand_number ?? 0) > (best.hand_number ?? 0) ? r : best),
          null
        );
      } else if (isDice) {
        currentRound = null;
      } else {
        currentRound = pickLatestRoundByKey(gameData.rounds as Round[], gameData.current_game_uuid);
      }
      
      console.log('[FETCH] Round data:', {
        gameType: gameData.game_type,
        currentRound: currentRound?.id,
        current_turn_position: currentRound?.current_turn_position,
        roundStatus: currentRound?.status,
        decision_deadline: currentRound?.decision_deadline,
        lastTurnPosition,
        timerTurnPosition,
        awaiting_next_round: gameData.awaiting_next_round,
        all_decisions_in: gameData.all_decisions_in,
        all_decisions_in_round_id: gameData.all_decisions_in_round_id ?? null,
        all_decisions_in_scoped: isAllDecisionsInFor(gameData, currentRound?.id)
      });
      
      // ── SCHEDULER AUTHORITY STAMP (must NOT depend on a deadline) ──
      // P0 lost-wake fix: this stamp used to live inside the
      // `if (effectiveDeadline)` branch below, so any fetch that observed an
      // authoritative Holm turn before/without a hydrated deadline (fresh
      // mount, refresh/reconnect onto an already-parked bot turn, presentation
      // window with no deadline yet) never bumped holmAuthorityTick and the
      // bot scheduler never evaluated. Stamp unconditionally here.
      if (gameData.game_type === 'holm-game' && currentRound?.current_turn_position) {
        const prior = latestAuthoritativeTurnRef.current;
        const sameRound = prior?.roundId === currentRound.id;
        const sameTurn = prior?.currentTurnPosition === currentRound.current_turn_position;
        const sameHand = prior?.handNumber === ((currentRound as any).hand_number ?? null);
        if (!prior || !sameRound || !sameTurn || !sameHand) {
          authoritativeTurnEpochRef.current += 1;
          latestAuthoritativeTurnRef.current = {
            roundId: currentRound.id,
            handNumber: (currentRound as any).hand_number ?? null,
            currentTurnPosition: currentRound.current_turn_position ?? null,
            epoch: authoritativeTurnEpochRef.current,
          };
          setHolmAuthorityTick(t => t + 1);
        }
      }

      // A deadline is inseparable from its exact rounds row. Reusing a
      // presentation snapshot's deadline here allowed a previous hand's timer
      // to be combined with a newer hand/turn under reordered delivery.
      const isHolmDeadline = gameData.game_type === 'holm-game';
      const effectiveDeadline = isHolmDeadline
        ? (currentRound?.decision_deadline ?? null)
        : (currentRound?.decision_deadline ?? null);
      
      if (effectiveDeadline) {
        // Store the deadline for server-driven timer.
        // Normalize ISO to canonical form so identical instants from different sources
        // (Postgres realtime ".919+00:00" vs ISO ".919Z") don't trigger false re-seeds.
        const normalizedDeadline = (() => {
          try { return new Date(effectiveDeadline).toISOString(); }
          catch { return effectiveDeadline; }
        })();
        setDecisionDeadline(normalizedDeadline);
        
        // Holm game: turn-based, needs current_turn_position
        if (gameData.game_type === 'holm-game' && currentRound.current_turn_position) {
          // Check if turn changed
          const turnChanged = lastTurnPosition !== null && lastTurnPosition !== currentRound.current_turn_position;

          // P0 pre-decision contract: stamp authoritative turn ref
          // from fetch as well (covers initial load + non-realtime
          // arrivals). Only bump epoch when the value actually
          // advances vs the prior stamp.
          {
            const prior = latestAuthoritativeTurnRef.current;
            const sameRound = prior?.roundId === currentRound.id;
            const sameTurn = prior?.currentTurnPosition === currentRound.current_turn_position;
            const sameHand = prior?.handNumber === ((currentRound as any).hand_number ?? null);
            if (!prior || !sameRound || !sameTurn || !sameHand) {
              authoritativeTurnEpochRef.current += 1;
              latestAuthoritativeTurnRef.current = {
                roundId: currentRound.id,
                handNumber: (currentRound as any).hand_number ?? null,
                currentTurnPosition: currentRound.current_turn_position ?? null,
                epoch: authoritativeTurnEpochRef.current,
              };
              setHolmAuthorityTick(t => t + 1);
            }
          }

          if (turnChanged) {
            console.log('[FETCH] *** HOLM: TURN CHANGED from', lastTurnPosition, 'to', currentRound.current_turn_position, '***');
            setLastTurnPosition(currentRound.current_turn_position);
            setTimerTurnPosition(currentRound.current_turn_position);
          } else if (lastTurnPosition === null) {
            // First time seeing this round
            console.log('[FETCH] HOLM: First load of round, turn position:', currentRound.current_turn_position);
            setLastTurnPosition(currentRound.current_turn_position);
            setTimerTurnPosition(currentRound.current_turn_position);
          }
        }
        // 3-5-7 game: simultaneous decisions, no turn position needed
        else if (gameData.game_type !== 'holm-game' && gameData.game_type !== 'horses') {
          console.log('[FETCH] 3-5-7: Using server deadline for timer');
        }
      } else {
        setDecisionDeadline(null);
        console.log('[FETCH] *** NO TIMER SET - Missing deadline or turn position ***', {
          has_deadline: !!currentRound?.decision_deadline,
          has_turn_position: !!currentRound?.current_turn_position,
          turn_position: currentRound?.current_turn_position,
          round_status: currentRound?.status
        });
      }
    } else {
      // Clear timer for non-playing states or transitions (but not for game_over to avoid disrupting countdown)
      if (!gameData.game_over_at) {
        if (gameData.awaiting_next_round || gameData.last_round_result) {
          console.log('[FETCH] Clearing timer during transition');
          setLastTurnPosition(null); // Reset turn tracking on transition
        } else {
          console.log('[FETCH] Clearing timer, status:', gameData.status);
        }
        setTimeLeft(null);
        setDecisionDeadline(null);
      } else {
        console.log('[FETCH] Skipping timer update during game_over to preserve countdown');
      }
    }
    
    if (!isStale()) {
      setLoading(false);
    }
    fetchSpan.end({ status: gameData?.status, round: gameData?.current_round });
    finishFetchTrace(
      fetchTraceTerminalOutcome ?? 'completed_other',
      fetchTraceTerminalExitStage ?? 'normal_completion',
    );
    } catch (error) {
      finishFetchTrace('threw_exception', 'catch:fetchGameData_exception', {
        gameErrorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (!fetchTraceFinished) {
        finishFetchTrace('completed_other', 'finally:missing_terminal_outcome');
      }
    }
  };

  const recordStartGameNormalizationDbg = async (
    checkpoint: 'before-normalize' | 'after-normalize' | 'after-status-flip',
    normalizeResult?: Awaited<ReturnType<typeof normalizeTwoPlayerSeatsIfNeeded>> | null,
  ) => {
    if (!gameId) return;
    try {
      const [playersAuditRes, gameAuditRes] = await Promise.all([
        supabase
          .from('players')
          .select('id, user_id, position, sitting_out, is_bot, status, created_at')
          .eq('game_id', gameId),
        supabase
          .from('games')
          .select('current_host, status, game_type')
          .eq('id', gameId)
          .maybeSingle(),
      ]);

      if (playersAuditRes.error) {
        recordNormalizationDbg({
          kind: 'start-game', caller: 'startGameFromWaiting', checkpoint, gameId,
          result: 'failed_unknown', errorMessage: playersAuditRes.error.message,
        });
        return;
      }

      const auditGame = gameAuditRes.data as { current_host?: string | null; status?: string | null; game_type?: string | null } | null;
      const rows = (playersAuditRes.data ?? []) as Array<{
        id: string; user_id: string | null; position: number | null;
        sitting_out: boolean | null; is_bot: boolean | null; status: string | null;
        created_at: string | null;
      }>;
      const activeSeated = rows.filter((p) =>
        p.position != null &&
        p.status !== 'observer' &&
        p.status !== 'left' &&
        p.sitting_out === false
      );
      const activeHumans = activeSeated.filter((p) => !p.is_bot);
      const hostId = resolveSessionHostPlayerId(
        { current_host: auditGame?.current_host ?? null },
        activeSeated.map((p) => ({ id: p.id, user_id: p.user_id, is_bot: p.is_bot, created_at: p.created_at })),
      );
      const host = activeSeated.find((p) => p.id === hostId) ?? activeSeated[0] ?? null;
      const other = host ? activeSeated.find((p) => p.id !== host.id) ?? null : null;
      const decisionHostSeat = normalizeResult?.hostPosition ?? host?.position ?? null;
      const decisionOtherSeat = normalizeResult?.otherOldPosition ?? other?.position ?? null;
      const rawDist = decisionHostSeat != null && decisionOtherSeat != null
        ? Math.abs(decisionHostSeat - decisionOtherSeat)
        : null;
      const circDist = rawDist != null ? Math.min(rawDist, 7 - rawDist) : null;
      const targetSeat = normalizeResult?.otherNewPosition ?? (decisionHostSeat != null ? ((decisionHostSeat - 1 + 3) % 7) + 1 : null);
      const result: NormalizationResultCode = checkpoint === 'before-normalize'
        ? 'preflight'
        : normalizeResult?.result ?? (checkpoint === 'after-status-flip' ? 'status_flip_complete' : 'failed_unknown');
      const dbWriteAttempted = result === 'normalized' || String(result).startsWith('failed_');
      const shouldNormalize = normalizeResult?.ran === true
        ? true
        : activeSeated.length === 2 && circDist != null
          ? circDist !== 3
          : false;

      recordNormalizationDbg({
        kind: 'start-game',
        caller: 'startGameFromWaiting',
        checkpoint,
        gameId,
        statusBefore: auditGame?.status ?? game?.status ?? null,
        gameType: auditGame?.game_type ?? game?.game_type ?? null,
        activeSeatedPlayers: activeSeated.length,
        activeHumanPlayers: activeHumans.length,
        activeHumanCount: activeHumans.length,
        players: rows.map((p) => ({
          playerId: p.id,
          isBot: p.is_bot === true,
          status: p.status ?? null,
          sittingOut: p.sitting_out === true,
          position: p.position ?? null,
        })),
        hostPlayerId: host?.id ?? null,
        hostSeat: decisionHostSeat,
        otherPlayerId: other?.id ?? null,
        otherSeat: decisionOtherSeat,
        rawDistance: rawDist,
        circularDistance: circDist,
        shouldNormalize,
        targetSeat,
        dbWriteAttempted,
        dbRowsUpdated: checkpoint === 'before-normalize' ? 0 : normalizeResult?.dbRowsUpdated ?? null,
        result,
      });
    } catch (e: any) {
      recordNormalizationDbg({
        kind: 'start-game', caller: 'startGameFromWaiting', checkpoint, gameId,
        result: 'failed_unknown', errorMessage: e?.message ?? String(e),
      });
    }
  };

  // This function is called when 2+ players are seated in waiting status
  const startGameFromWaiting = async () => {
    if (!gameId) return;

    console.log('[GAME START] SHUFFLE UP AND DEAL! Moving to dealer_selection');
    traceMilestone('game_start_from_waiting');

    // ── Start Game persistent trace ────────────────────────────
    // One correlation ID groups every stage of a single invocation into
    // debug_events. Instrumentation only — mutations, ordering, and
    // predicates are unchanged. See src/lib/startGameTrace.ts.
    const sgTrace = createStartGameTrace(gameId, user?.id ?? null, game?.status ?? null);
    emitStartGameStage(sgTrace, 'start_game_entered', true, {
      priorClientGameStatus: game?.status ?? null,
    });
    // Mirror into session_events (proven-persistent channel for this user)
    // so we can prove startGameFromWaiting entry even if debug_events drops.
    void logSessionEvent({
      gameId,
      eventType: 'start_game_from_waiting_entered' as any,
      eventData: { correlationId: sgTrace.correlationId, priorClientGameStatus: game?.status ?? null },
      userId: user?.id,
    });

    const stepEventPayload = (
      stepName: string,
      extra: Record<string, unknown> = {},
    ) => ({
      correlationId: sgTrace.correlationId,
      gameId,
      userId: user?.id ?? null,
      stepName,
      elapsedMs: Math.round(performance.now() - sgTrace.startedAt),
      currentClientKnownGameStatus: game?.status ?? null,
      ...extra,
    });

    const emitDurableStartGameStep = async (
      eventType: 'start_game_step_enter' | 'start_game_step_exit' | 'start_game_step_error' | 'normalize_enter' | 'normalize_exit' | 'normalize_error',
      stepName: string,
      extra: Record<string, unknown> = {},
    ) => {
      await logSessionEvent({
        gameId,
        eventType: eventType as any,
        eventData: stepEventPayload(stepName, extra),
        userId: user?.id,
      });
    };

    const captureExactError = (e: unknown) => {
      if (e instanceof Error) {
        return {
          errorName: e.name,
          errorMessage: e.message,
          errorStack: e.stack ?? null,
        };
      }
      return {
        errorName: 'unknown',
        errorMessage: String(e),
        errorStack: null,
      };
    };

    const reportStartGameAbort = async (
      stepName: string,
      extra: Record<string, unknown> = {},
    ) => {
      await emitDurableStartGameStep('start_game_step_error', stepName, extra);
      toast({
        title: 'Start Game failed',
        description: `Failed step: ${stepName}`,
        variant: 'destructive',
      });
    };

    // Log session event
    const logStatusStep = 'logStatusChanged';
    try {
      await emitDurableStartGameStep('start_game_step_enter', logStatusStep, {
        fromStatus: game?.status ?? 'waiting',
        toStatus: 'dealer_selection',
      });
      await logStatusChanged(gameId, user?.id, game?.status ?? 'waiting', 'dealer_selection', 'Host started game');
      await emitDurableStartGameStep('start_game_step_exit', logStatusStep, {
        fromStatus: game?.status ?? 'waiting',
        toStatus: 'dealer_selection',
      });
    } catch (e) {
      const exactError = captureExactError(e);
      await reportStartGameAbort(logStatusStep, exactError);
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'logStatusChanged',
        ...captureException(e),
      });
      return;
    }

    // Recovery-waiting hygiene (see original comment block below the stage emits).
    const playersPayload = { status: 'active', sitting_out: false, waiting: false };
    const playersFilters = { game_id: gameId, 'neq:status': ['observer', 'left'] };
    emitStartGameStage(sgTrace, 'players_update_started', true, {
      payload: playersPayload,
      filters: playersFilters,
    });

    let playersResult: Awaited<ReturnType<typeof supabase.from>> extends never ? never : any;
    const playersUpdateStep = 'players.update';
    try {
      await emitDurableStartGameStep('start_game_step_enter', playersUpdateStep, {
        payload: playersPayload,
        filters: playersFilters,
      });
      playersResult = await supabase
        .from('players')
        .update(playersPayload)
        .eq('game_id', gameId)
        .neq('status', 'observer')
        .neq('status', 'left');
      await emitDurableStartGameStep('start_game_step_exit', playersUpdateStep, {
        payload: playersPayload,
        filters: playersFilters,
        supabase: capturePostgrestResult(playersResult),
        returnedRow: playersResult.data ?? null,
      });
    } catch (e) {
      const exactError = captureExactError(e);
      await reportStartGameAbort(playersUpdateStep, exactError);
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'players_update_threw',
        ...captureException(e),
      });
      return;
    }

    emitStartGameStage(sgTrace, 'players_update_completed', !playersResult.error, {
      supabase: capturePostgrestResult(playersResult),
    });

    if (playersResult.error) {
      console.error('[GAME START] Failed to normalize waiting-table players:', playersResult.error);
      await reportStartGameAbort(playersUpdateStep, {
        payload: playersPayload,
        filters: playersFilters,
        supabase: capturePostgrestResult(playersResult),
        returnedRow: playersResult.data ?? null,
      });
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'players_update_error',
        supabase: capturePostgrestResult(playersResult),
      });
      return;
    }

    // Two-Player Seat Normalization.
    emitStartGameStage(sgTrace, 'seat_normalization_started', true, {});
    let startGameNormalizeResult: Awaited<ReturnType<typeof normalizeTwoPlayerSeatsIfNeeded>> | null = null;
    let normalizeThrew: unknown = null;
    const normalizeStep = 'normalizeTwoPlayerSeatsIfNeeded';
    try {
      await emitDurableStartGameStep('start_game_step_enter', normalizeStep, {});
      await emitDurableStartGameStep('normalize_enter', normalizeStep, {});
      recordNormalizationDbg({ kind: 'call-site', caller: 'StartGameFromWaiting', didInvokeNormalizer: true, statusTransition: 'waiting→dealer_selection' });
      await recordStartGameNormalizationDbg('before-normalize');
      startGameNormalizeResult = await normalizeTwoPlayerSeatsIfNeeded(gameId, 'StartGameFromWaiting');
      await recordStartGameNormalizationDbg('after-normalize', startGameNormalizeResult);
      await emitDurableStartGameStep('normalize_exit', normalizeStep, {
        returnedRow: startGameNormalizeResult,
        result: startGameNormalizeResult,
      });
      await emitDurableStartGameStep('start_game_step_exit', normalizeStep, {
        returnedRow: startGameNormalizeResult,
        result: startGameNormalizeResult,
      });
    } catch (e) {
      normalizeThrew = e;
      console.error('[GAME START] normalizeTwoPlayerSeatsIfNeeded threw:', e);
      try { await recordStartGameNormalizationDbg('after-normalize', startGameNormalizeResult); } catch { /* */ }
      const exactError = captureExactError(e);
      await emitDurableStartGameStep('normalize_error', normalizeStep, exactError);
    }
    emitStartGameStage(sgTrace, 'seat_normalization_completed', !normalizeThrew, {
      result: startGameNormalizeResult,
      ...(normalizeThrew ? captureException(normalizeThrew) : {}),
    });
    if (normalizeThrew) {
      const exactError = captureExactError(normalizeThrew);
      await reportStartGameAbort(normalizeStep, exactError);
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'normalizeTwoPlayerSeatsIfNeeded',
        ...captureException(normalizeThrew),
      });
      return;
    }

    // Move to dealer_selection AND clear recovery-waiting scaffolding.
    const gamesPayload = {
      status: 'dealer_selection',
      dealer_selection_state: null,
      current_game_uuid: null,
      config_deadline: null,
      config_complete: false,
      awaiting_next_round: false,
      last_round_result: null,
    };
    const gamesFilters = { id: gameId };
    emitStartGameStage(sgTrace, 'games_update_started', true, {
      payload: gamesPayload,
      filters: gamesFilters,
    });

    let gamesResult: any;
    const gamesUpdateStep = "games.update(status:'dealer_selection')";
    try {
      await emitDurableStartGameStep('start_game_step_enter', gamesUpdateStep, {
        payload: gamesPayload,
        filters: gamesFilters,
      });
      // .select(...).maybeSingle() is diagnostic-only: it returns the row after
      // the update but does not narrow the update predicate. If RLS filters the
      // update to zero rows, data will be null with no error; if PostgREST rejects
      // the request, error will be populated.
      gamesResult = await supabase
        .from('games')
        .update(gamesPayload)
        .eq('id', gameId)
        .select('id,status,updated_at')
        .maybeSingle();
      await emitDurableStartGameStep('start_game_step_exit', gamesUpdateStep, {
        payload: gamesPayload,
        filters: gamesFilters,
        supabase: capturePostgrestResult(gamesResult),
        returnedRow: gamesResult.data ?? null,
      });
    } catch (e) {
      const exactError = captureExactError(e);
      await reportStartGameAbort(gamesUpdateStep, exactError);
      emitStartGameStage(sgTrace, 'games_update_completed', false, {
        ...captureException(e),
      });
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'games_update_threw',
        ...captureException(e),
      });
      return;
    }

    const gamesCaptured = capturePostgrestResult(gamesResult);
    const rlsFilteredZeroRow = !gamesResult.error && gamesResult.data == null;
    emitStartGameStage(sgTrace, 'games_update_completed', !gamesResult.error && !rlsFilteredZeroRow, {
      supabase: gamesCaptured,
      rlsFilteredZeroRow,
      returnedRow: gamesResult.data ?? null,
    });

    // Mirror games.update result into session_events for durable diagnosis.
    void logSessionEvent({
      gameId,
      eventType: 'games_status_update_result' as any,
      eventData: {
        correlationId: sgTrace.correlationId,
        hasError: !!gamesResult.error,
        errorCode: gamesResult.error?.code ?? null,
        errorMessage: gamesResult.error?.message ?? null,
        rlsFilteredZeroRow,
        returnedStatus: (gamesResult.data as any)?.status ?? null,
        returnedUpdatedAt: (gamesResult.data as any)?.updated_at ?? null,
      },
      userId: user?.id,
    });

    if (gamesResult.error) {
      console.error('Start game error:', gamesResult.error);
      await reportStartGameAbort(gamesUpdateStep, {
        payload: gamesPayload,
        filters: gamesFilters,
        supabase: gamesCaptured,
        returnedRow: gamesResult.data ?? null,
      });
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'games_update_error',
        supabase: gamesCaptured,
      });
      return;
    }
    if (rlsFilteredZeroRow) {
      await reportStartGameAbort(gamesUpdateStep, {
        payload: gamesPayload,
        filters: gamesFilters,
        supabase: gamesCaptured,
        rlsFilteredZeroRow,
        returnedRow: gamesResult.data ?? null,
      });
      emitStartGameStage(sgTrace, 'start_game_aborted', false, {
        failingStage: 'games_update_zero_rows',
        supabase: gamesCaptured,
      });
      return;
    }

    try {
      await recordStartGameNormalizationDbg('after-status-flip', startGameNormalizeResult);
    } catch { /* */ }

    // Manual refetch to ensure UI updates immediately
    emitStartGameStage(sgTrace, 'fetch_game_data_scheduled', true, { delayMs: 100 });
    setTimeout(async () => {
      try {
        await fetchGameData();
        emitStartGameStage(sgTrace, 'fetch_game_data_completed', true, {});
      } catch (e) {
        emitStartGameStage(sgTrace, 'fetch_game_data_completed', false, captureException(e));
      }
    }, 100);

    emitStartGameStage(sgTrace, 'start_game_completed', true, {
      returnedRow: gamesResult.data ?? null,
    });
  };

  const selectDealer = async (dealerPosition: number) => {
    if (!gameId) return;

    console.log('[DEALER SELECT] Selected dealer at position:', dealerPosition);

    // Set config_deadline ATOMICALLY with status change, using the session-cached timer.
    const setupSeconds = Math.max(1, game?.game_setup_timer_seconds ?? 30);
    const configDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();
    
    // Log session events
    await logStatusChanged(gameId, user?.id, 'dealer_selection', 'game_selection', `Dealer selected at position ${dealerPosition}`);
    await logConfigDeadlineSet(gameId, user?.id, configDeadline, 'selectDealer');
    
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'game_selection',
        dealer_position: dealerPosition,
        config_deadline: configDeadline,
        dealer_selection_state: null // Clear selection state after dealer is chosen
      })
      .eq('id', gameId);

    if (error) {
      console.error('Failed to select dealer:', error);
      return;
    }

    console.log('[DEALER SELECT] Successfully updated game status to game_selection');

    // Immediate refetch to ensure UI updates immediately
    await fetchGameData();
    
    // Secondary refetch after short delay for any race conditions
    setTimeout(() => fetchGameData(), 300);
  };

  const handleConfigComplete = async (result: DealerGameSetupCommitResult) => {
    if (!gameId) return;

    // The initiating client consumes the RPC's committed snapshot directly.
    // Realtime remains peer synchronization; it is not the trigger that makes
    // this browser enter ante decision.
    setGame((previous) => previous
      ? { ...previous, ...(result.game as unknown as Partial<GameData>), rounds: previous.rounds }
      : result.game as unknown as GameData);
    setPlayers((previous) => result.players.map((committed) => ({
      ...(previous.find((player) => player.id === committed.id) ?? {}),
      ...committed,
    })) as Player[]);
    await fetchGameData('manual');
  };

  const handleGameSelection = async (gameType: string) => {
    if (!gameId) return;

    console.log('[GAME SELECTION] Selected game:', gameType, 'Previous:', lastKnownGameTypeRef.current);

    // GUARD: Prevent realtime updates from overwriting optimistic UI during switch
    gameTypeSwitchingRef.current = true;

    // IMMEDIATELY update the ref so realtime can detect changes for other clients
    lastKnownGameTypeRef.current = gameType;
    lastKnownRoundRef.current = null;
    
    // IMMEDIATELY clear all card-related state for the dealer
    // This prevents stale card rendering while waiting for database update
    emit357ClearEvent('dealer_gametype_switch', 'dealer optimistically switched game_type via handleGameTypeSelected', 10241);
    setPlayerCards([]);
    setCachedRoundData(null);
    cachedRoundRef.current = null;
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';

    // OPTIMISTIC UI UPDATE: Immediately update local game state with new game_type
    // This ensures the dealer sees the correct rendering immediately
    setGame(prevGame => prevGame ? {
      ...prevGame,
      game_type: gameType,
      status: 'configuring',
      config_complete: false,
      current_round: null,
      awaiting_next_round: false
    } : null);

    // Reset ante_decision for all seated eligible players (exclude observers and stood-up/left players)
    const { error: resetError } = await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId)
      .neq('status', 'observer')
      .neq('status', 'left');

    if (resetError) {
      console.error('[GAME SELECTION] Failed to reset ante decisions:', resetError);
    }

    // Save the game type and transition to configuring phase
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'configuring',
        config_complete: false,
        game_type: gameType
      })
      .eq('id', gameId);

    if (error) {
      console.error('Failed to start configuration:', error);
      return;
    }

    // Manual refetch to update UI after DB is updated
    // Clear the guard AFTER the fetch so realtime doesn't overwrite during transition
    setTimeout(() => {
      fetchGameData();
      // Clear guard after a longer delay to ensure optimistic update isn't overwritten
      setTimeout(() => {
        gameTypeSwitchingRef.current = false;
        anteAnimationFiredRef.current = null; // Reset ante guard for new game
        console.log('[GAME SELECTION] Cleared game type switching guard and ante animation guard');
      }, 500);
    }, 100);
  };

  const handleGameOverComplete = useCallback(async () => {
    const _gocId = () => ({
      gameId: gameId ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
      roundId: game?.current_round != null ? String(game.current_round) : null,
      handNumber: game?.total_hands ?? null,
      viewerPlayerId: user?.id ?? null,
      clientKnownStatus: game?.status ?? null,
      currentGameUuid: game?.current_game_uuid ?? null,
      currentRound: game?.current_round ?? null,
      lastRoundResult: game?.last_round_result ?? null,
    });
    emit357GameOverCompleteDiag('owner_entered', _gocId());
    __emitWartimeProgressionAt(__WARTIME_SRC.PROG_HANDLE_GAMEOVER_ENTRY.id, {
      callback: 'handleGameOverComplete',
      entry: 'entry',
      reason: 'owner_entered',
      identity: { gameId: gameId ?? null, dealerGameId: game?.current_game_uuid ?? null },
      gameStatus: game?.status ?? null,
    });

    if (!gameId) {
      console.log('[GAME OVER COMPLETE] No gameId, aborting');
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:no-game-id',
        returnReason: 'no-game-id',
      });
      __emitWartimeProgressionAt(__WARTIME_SRC.PROG_HANDLE_GAMEOVER_ENTRY.id, {
        callback: 'handleGameOverComplete',
        entry: 'return',
        reason: 'no-game-id',
        identity: { gameId: null, dealerGameId: game?.current_game_uuid ?? null },
        gameStatus: game?.status ?? null,
      });
      return;
    }

    // CRITICAL (3-5-7): while the 357 win animation sequence is playing, do not allow ANY other
    // timers/callbacks to transition the game. The animation completion callback will flip this
    // flag off and then call this function.
    if (is357WinAnimationActiveRef.current) {
      console.log('[GAME OVER COMPLETE] Blocked: 357 win animation is active');
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:357-anim-active',
        returnReason: 'is357WinAnimationActiveRef.current-true',
      });
      return;
    }

    // GUARD: Prevent multiple clients from racing to transition the game state
    if (gameOverTransitionRef.current) {
      console.log('[GAME OVER COMPLETE] Already processing transition, skipping duplicate call');
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:already-processing',
        returnReason: 'gameOverTransitionRef.current-true',
      });
      return;
    }

    // Yahtzee's exact settlement identity is handed directly to PostgreSQL.
    // Every client may submit it; the durable claim dedupes simultaneous and
    // late callers. Do not enter shared browser-authored cleanup/rotation.
    if (game?.game_type === 'yahtzee') {
      gameOverTransitionRef.current = true;
      try {
        const outgoingDealerGameId = game.current_game_uuid ?? null;
        const outgoingHandNumber = game.total_hands ?? null;
        let terminalRoundId = (
          currentRound?.dealer_game_id === outgoingDealerGameId
          && currentRound?.hand_number === outgoingHandNumber
        ) ? currentRound.id : null;
        if (!terminalRoundId && outgoingDealerGameId && outgoingHandNumber != null) {
          const { data: terminalRound, error: terminalRoundError } = await supabase
            .from('rounds')
            .select('id')
            .eq('game_id', gameId)
            .eq('dealer_game_id', outgoingDealerGameId)
            .eq('hand_number', outgoingHandNumber)
            .maybeSingle();
          if (terminalRoundError) throw terminalRoundError;
          terminalRoundId = terminalRound?.id ?? null;
        }
        if (!outgoingDealerGameId || !terminalRoundId || outgoingHandNumber == null) {
          throw new Error('Yahtzee postgame identity is incomplete; no transition was attempted.');
        }
        const postgame = await advanceYahtzeePostgame({
          gameId,
          roundId: terminalRoundId,
          dealerGameId: outgoingDealerGameId,
          handNumber: outgoingHandNumber,
        });
        if (postgame.outcome !== 'advanced'
            && postgame.outcome !== 'already_advanced'
            && postgame.outcome !== 'stale_identity') {
          throw new Error(`Unexpected Yahtzee postgame outcome: ${postgame.outcome}`);
        }
        anteAnimationFiredRef.current = null;
        await fetchGameData();
      } catch (error: any) {
        yahtzeeGameOverProcessedRef.current = null;
        console.error('[YAHTZEE POSTGAME] Authoritative handoff failed:', error);
        toast({
          title: 'Error',
          description: error?.message || 'Failed to advance Yahtzee. Please try again.',
          variant: 'destructive',
        });
        try {
          await fetchGameData();
        } catch (refetchError) {
          console.error('[YAHTZEE POSTGAME] Recovery refetch failed:', refetchError);
        }
      } finally {
        gameOverTransitionRef.current = false;
      }
      return;
    }

    // P0 GUARD (MUT-02): Single-executor leader election.
    // Only ONE client may run destructive game-over lifecycle. Leader is:
    //   1. The seated human at dealer_position (if active and not sitting out), else
    //   2. The lowest-position active (non-sitting-out) human player.
    // Non-leader clients no-op. The DB-level atomic claim below is a second line of defense.
    try {
      if (!user?.id) {
        console.log('[GAME OVER COMPLETE] mut02-leader-skip (no user)');
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:mut02-no-user',
          returnReason: 'no-user-id',
        });
        return;
      }
      const { data: leaderGame, error: leaderGameErr } = await supabase
        .from('games')
        .select('status, dealer_position, current_game_uuid')
        .eq('id', gameId)
        .maybeSingle();
      const { data: leaderPlayers, error: leaderPlayersErr } = await supabase
        .from('players')
        .select('id, user_id, position, is_bot, sitting_out, status')
        .eq('game_id', gameId);
      const humans = (leaderPlayers || []).filter((p: any) =>
        !p.is_bot && !p.sitting_out && p.status === 'active'
      );
      let leaderUserId: string | null = null;
      const dealerSeat = humans.find((p: any) => p.position === leaderGame?.dealer_position);
      if (dealerSeat) {
        leaderUserId = dealerSeat.user_id;
      } else if (humans.length > 0) {
        const sorted = [...humans].sort((a: any, b: any) => a.position - b.position);
        leaderUserId = sorted[0].user_id;
      }
      const localPlayer = (leaderPlayers || []).find((p: any) => p.user_id === user.id);
      const isLeader = !leaderUserId || leaderUserId === user.id;
      const leaderBranch = !leaderGame || leaderGame.status !== 'game_over'
        ? 'return_status_not_game_over'
        : !leaderUserId
          ? 'continue_no_active_humans'
          : leaderUserId !== user.id
            ? 'return_not_leader'
            : 'continue_is_leader';
      emit357GameOverCompleteDiag('leader_refetch_result', {
        ..._gocId(),
        returnedStatus: leaderGame?.status ?? null,
        returnedDealerPosition: leaderGame?.dealer_position ?? null,
        returnedCurrentGameUuid: leaderGame?.current_game_uuid ?? null,
        currentHost: null,
        localPlayerId: localPlayer?.id ?? null,
        localPlayerPosition: localPlayer?.position ?? null,
        computedLeaderUserId: leaderUserId,
        localIsLeader: isLeader,
        leaderGameFetchError: (leaderGameErr as any)?.message ?? null,
        leaderPlayersFetchError: (leaderPlayersErr as any)?.message ?? null,
        branchDecision: leaderBranch,
        branchReason: leaderBranch,
      });
      if (!leaderGame || leaderGame.status !== 'game_over') {
        console.log('[GAME OVER COMPLETE] mut02-leader-skip (status not game_over)', { status: leaderGame?.status });
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:mut02-status-not-game_over',
          returnReason: `status-${leaderGame?.status ?? 'null'}`,
          returnedStatus: leaderGame?.status ?? null,
        });
        return;
      }
      if (leaderUserId && leaderUserId !== user.id) {
        console.log('[GAME OVER COMPLETE] mut02-leader-skip (not leader)', {
          leaderUserId: leaderUserId.slice(0, 8),
          self: user.id.slice(0, 8),
        });
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:mut02-not-leader',
          returnReason: 'local-not-leader',
          computedLeaderUserId: leaderUserId,
        });
        return;
      }
      if (!leaderUserId) {
        console.log('[GAME OVER COMPLETE] mut02-leader-no-humans (allowing run for cleanup)');
      }
    } catch (leaderErr) {
      console.warn('[GAME OVER COMPLETE] mut02-leader-check-failed (continuing)', leaderErr);
      emit357GameOverCompleteDiag('leader_refetch_result', {
        ..._gocId(),
        branchDecision: 'continue_after_leader_check_threw',
        branchReason: 'leader-check-exception',
        error: leaderErr,
      });
    }


    gameOverTransitionRef.current = true;

    console.log('[GAME OVER COMPLETE] Starting transition to next game, gameId:', gameId);

    try {
      // IMPORTANT: Do NOT clear card state here!
      // Cards should persist during the transition until the game status actually changes.
      // Card state will be cleared in the status change effect when transitioning to game_selection/configuring.
      // Clearing here causes the tabled cards and highlights to disappear during the brief transition window.

    // Check if session should end AND verify game is still in game_over status (not already transitioned by another client)
    const { data: gameData, error: fetchError } = await supabase
      .from('games')
      .select('pending_session_end, current_round, status, dealer_position, current_game_uuid, total_hands')
      .eq('id', gameId)
      .single();

    console.log('[GAME OVER COMPLETE] Game data:', gameData, 'error:', fetchError);

    // If we can't fetch fresh state (transient/network/auth), don't silently skip.
    // We continue best-effort and let the subsequent updates succeed/fail explicitly.
    if (fetchError || !gameData) {
      console.warn('[GAME OVER COMPLETE] Could not fetch fresh game state; continuing best-effort', {
        fetchError,
      });
    } else if (gameData.status !== 'game_over') {
      // GUARD: If game is no longer in game_over, another client already handled the transition
      console.log('[GAME OVER COMPLETE] Game already transitioned to', gameData?.status, '- skipping');
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:fresh-status-not-game_over',
        returnReason: `fresh-status-${gameData.status}`,
        returnedStatus: gameData.status,
      });
      gameOverTransitionRef.current = false;
      return;
    }

    if (gameData?.pending_session_end && game?.game_type !== 'gin-rummy') {
      console.log('[GAME OVER] Session should end, transitioning to session_ended');
      await supabase
        .from('games')
        .update({
          status: 'session_ended',
          session_ended_at: new Date().toISOString(),
          // NOTE: do NOT overwrite total_hands here; it tracks completed games and is updated elsewhere.
          pending_session_end: false,
        })
        .eq('id', gameId);

      gameOverTransitionRef.current = false;
      recordTerminalRecovery('session-ended-confirmed', { gameId, source: 'pending-session-end' });
      releaseRecoveryLease('session-ended-confirmed', { gameId });
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:pending_session_end',
        returnReason: 'session-ended',
      });
      setTimeout(() => navigate('/'), 2000);
      return;
    }


    // STEP 1: Evaluate player states BEFORE dealer rotation
    console.log('[GAME OVER] Evaluating player states end-of-game');
    const { activePlayerCount, activeHumanCount, eligibleDealerCount, playersStoodUp } = await evaluatePlayerStatesEndOfGame(gameId);

    console.log('[GAME OVER] After evaluation - active players:', activePlayerCount, 'active humans:', activeHumanCount, 'eligible dealers:', eligibleDealerCount, 'stood up:', playersStoodUp.length);

    // STEP 1b (SESSION HYGIENE): sanitize per-decision / timeout automation for ALL
    // players in the session, then clear dealer-game-scoped transient session state
    // from the games row. Both must happen AFTER participation reconciliation and
    // BEFORE branching to waiting / next dealer game, so no prior-dealer-game state
    // can leak forward (e.g. stale current_round triggering ROUND_ALREADY_IN_PROGRESS).
    if (!is357GameType) {
      emit357GameOverCompleteDiag('sanitize_begin', { ..._gocId(), op: 'sanitizePlayerAutomationStateForSession' });
      try {
        await sanitizePlayerAutomationStateForSession(gameId);
        emit357GameOverCompleteDiag('sanitize_complete', { ..._gocId(), op: 'sanitizePlayerAutomationStateForSession' });
      } catch (e) {
        emit357GameOverCompleteDiag('sanitize_error', { ..._gocId(), op: 'sanitizePlayerAutomationStateForSession', error: e });
        throw e;
      }
    }
    // Dealer-game authority RPCs clear this state atomically with the exact
    // settled-round claim. A preliminary browser reset would either be rejected
    // by the authority guard or split the handoff across two owners.
    if (
      game?.game_type !== 'cribbage'
      && game?.game_type !== 'gin-rummy'
      && game?.game_type !== 'yahtzee'
      && !is357GameType
    ) {
      emit357GameOverCompleteDiag('sanitize_begin', { ..._gocId(), op: 'clearDealerGameTransientSessionState' });
      try {
        await clearDealerGameTransientSessionState(gameId);
        emit357GameOverCompleteDiag('sanitize_complete', { ..._gocId(), op: 'clearDealerGameTransientSessionState' });
      } catch (e) {
        emit357GameOverCompleteDiag('sanitize_error', { ..._gocId(), op: 'clearDealerGameTransientSessionState', error: e });
        throw e;
      }
    }

    if (game?.game_type === 'gin-rummy') {
      const outgoingDealerGameId = gameData?.current_game_uuid ?? game.current_game_uuid ?? null;
      const outgoingHandNumber = gameData?.total_hands ?? game.total_hands ?? null;
      let terminalRoundId = (
        currentRound?.dealer_game_id === outgoingDealerGameId
        && currentRound?.hand_number === outgoingHandNumber
      ) ? currentRound.id : null;

      if (!terminalRoundId && outgoingDealerGameId && outgoingHandNumber != null) {
        const { data: terminalRound, error: terminalRoundError } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId)
          .eq('dealer_game_id', outgoingDealerGameId)
          .eq('hand_number', outgoingHandNumber)
          .maybeSingle();
        if (terminalRoundError) {
          throw terminalRoundError;
        }
        terminalRoundId = terminalRound?.id ?? null;
      }

      if (!outgoingDealerGameId || !terminalRoundId || outgoingHandNumber == null) {
        throw new Error('Gin Rummy postgame identity is incomplete; no transition was attempted.');
      }

      emit357GameOverCompleteDiag('advance_begin', {
        ..._gocId(),
        outgoingDealerGameId,
        terminalRoundId,
        outgoingHandNumber,
        branch: 'gin-rummy-authoritative-postgame',
      });
      const { data: postgameResult, error: postgameError } = await supabase.rpc(
        'gin_rummy_advance_postgame' as any,
        {
          _game_id: gameId,
          _round_id: terminalRoundId,
          _dealer_game_id: outgoingDealerGameId,
          _hand_number: outgoingHandNumber,
        } as any,
      );
      if (postgameError) {
        emit357GameOverCompleteDiag('advance_error', {
          ..._gocId(),
          outgoingDealerGameId,
          terminalRoundId,
          outgoingHandNumber,
          error: postgameError,
        });
        throw postgameError;
      }

      const postgame = postgameResult as {
        outcome?: string;
        status?: string;
        dealer_position?: number | null;
      } | null;
      if (postgame?.outcome === 'stale_identity') {
        emit357GameOverCompleteDiag('advance_complete', {
          ..._gocId(),
          outgoingDealerGameId,
          terminalRoundId,
          outgoingHandNumber,
          resultingStatus: postgame.status ?? null,
          claimLost: true,
        });
        gameOverTransitionRef.current = false;
        await fetchGameData();
        return;
      }
      if (postgame?.outcome !== 'advanced' && postgame?.outcome !== 'already_advanced') {
        throw new Error(`Unexpected Gin Rummy postgame outcome: ${postgame?.outcome ?? 'missing'}`);
      }

      emit357GameOverCompleteDiag('advance_complete', {
        ..._gocId(),
        outgoingDealerGameId,
        terminalRoundId,
        outgoingHandNumber,
        resultingStatus: postgame.status ?? null,
        selectedNextDealerPosition: postgame.dealer_position ?? null,
        claimLost: postgame.outcome === 'already_advanced',
      });
      gameOverTransitionRef.current = false;
      anteAnimationFiredRef.current = null;
      await fetchGameData();
      emit357GameOverCompleteDiag('complete', {
        ..._gocId(),
        finalStatus: postgame.status ?? null,
      });
      return;
    }

    if (is357GameType) {
      const outgoingDealerGameId = gameData?.current_game_uuid ?? game.current_game_uuid ?? null;
      const outgoingHandNumber = gameData?.total_hands ?? game.total_hands ?? null;
      let terminalRoundId = (
        currentRound?.dealer_game_id === outgoingDealerGameId
        && currentRound?.hand_number === outgoingHandNumber
      ) ? currentRound.id : null;

      if (!terminalRoundId && outgoingDealerGameId && outgoingHandNumber != null) {
        const { data: terminalRound, error: terminalRoundError } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId)
          .eq('dealer_game_id', outgoingDealerGameId)
          .eq('hand_number', outgoingHandNumber)
          .eq('status', 'completed')
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (terminalRoundError) throw terminalRoundError;
        terminalRoundId = terminalRound?.id ?? null;
      }
      if (!outgoingDealerGameId || !terminalRoundId || outgoingHandNumber == null) {
        throw new Error('3-5-7 postgame identity is incomplete; no transition was attempted.');
      }

      const { data: postgameResult, error: postgameError } = await supabase.rpc(
        'three_five_seven_advance_postgame' as any,
        {
          p_game_id: gameId,
          p_round_id: terminalRoundId,
          p_dealer_game_id: outgoingDealerGameId,
          p_hand_number: outgoingHandNumber,
        } as any,
      );
      if (postgameError) throw postgameError;
      const postgame = postgameResult as { outcome?: string; status?: string } | null;
      if (!['advanced', 'already_advanced', 'stale_identity'].includes(postgame?.outcome ?? '')) {
        throw new Error(`Unexpected 3-5-7 postgame outcome: ${postgame?.outcome ?? 'missing'}`);
      }
      gameOverTransitionRef.current = false;
      anteAnimationFiredRef.current = null;
      await fetchGameData();
      return;
    }


    // STEP 2: Check if we have enough players to continue
    // Priority 1: If no active human players, END SESSION or DELETE if empty
    if (activeHumanCount < 1) {
      console.log('[GAME OVER] No active human players!');
      gameOverTransitionRef.current = false;

      if (game?.real_money) {
        const outcome = await resolvePostgameParticipation(gameId);
        console.log('[GAME OVER] Postgame participation outcome:', outcome);
        await fetchGameData();
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:postgame-participation',
          returnReason: outcome,
        });
        return;
      }

      // P0-CONTAINMENT (NAV-04 / false-session-end):
      // Re-fetch authoritative state. Only auto-end the session if pending_session_end
      // is explicitly true, OR if there are truly no humans at the table at all
      // (i.e. the sitting_out=true counts were not the cause of activeHumanCount=0).
      // A stale auto_fold flag from an earlier game must NEVER alone trigger session_ended.
      const { data: freshAuth } = await supabase
        .from('games')
        .select('pending_session_end, status, total_hands')
        .eq('id', gameId)
        .single();

      const { data: humanPresence } = await supabase
        .from('players')
        .select('id, sitting_out, auto_fold, status')
        .eq('game_id', gameId)
        .eq('is_bot', false)
        .neq('status', 'observer');

      const humansAtTable = (humanPresence || []).length;
      const trulyAbsentHumans = humansAtTable === 0;
      const sessionEndExplicit = freshAuth?.pending_session_end === true;

      if (!sessionEndExplicit && !trulyAbsentHumans) {
        // Stale flag (auto_fold / sitting_out from prior hand) — DO NOT session-end.
        // Revert game to waiting and clear stale flags so play can resume.
        console.error('[GAME OVER] session-end-suppressed-stale-active-humans', {
          humansAtTable,
          pending_session_end: freshAuth?.pending_session_end,
        });
        await logSessionEvent({
          gameId,
          eventType: 'session_ended',
          eventData: { reason: 'session-end-suppressed-stale-active-humans', suppressed: true, humansAtTable },
          userId: user?.id,
        });
        // Clear ONLY stale per-decision automation artifacts.
        // Participation intent (sitting_out / waiting / sit_out_next_hand /
        // stand_up_next_hand) is owned by evaluatePlayerStatesEndOfGame and
        // the seat/opt-in/rejoin flows — never mutate it here.
        await supabase
          .from('players')
          .update({
            auto_fold: false,
            current_decision: null,
            decision_locked: false,
            pre_fold: false,
            pre_stay: false,
            ante_decision: null,
          })
          .eq('game_id', gameId)
          .eq('is_bot', false);
        await supabase
          .from('games')
          .update({ status: 'waiting', awaiting_next_round: false, all_decisions_in: false, all_decisions_in_round_id: null })
          .eq('id', gameId);
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:session-end-suppressed-stale-active-humans',
          returnReason: 'reverted-to-waiting',
        });
        return;
      }

      // Check if any hands were played in this session
      const totalHands = freshAuth?.total_hands || 0;
      
      // Also check game_results as backup
      const { count: resultsCount } = await supabase
        .from('game_results')
        .select('id', { count: 'exact', head: true })
        .eq('game_id', gameId);
      
      const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
      
      if (!hasHistory) {
        // No hands played - DELETE the empty session instead of marking completed
        console.log('[GAME OVER] No hands played, deleting empty session');
        
        // Log session deletion BEFORE deleting
        await logSessionDeleted(gameId, user?.id, 'No active humans and no game history', false);
        
        // Get round IDs first for proper FK deletion
        const { data: roundRows } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId);
        
        const roundIds = (roundRows ?? []).map(r => r.id);
        
        if (roundIds.length > 0) {
          await supabase.from('player_cards').delete().in('round_id', roundIds);
          await supabase.from('player_actions').delete().in('round_id', roundIds);
        }
        
        await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
        await supabase.from('chat_messages').delete().eq('game_id', gameId);
        await supabase.from('rounds').delete().eq('game_id', gameId);
        await supabase.from('players').delete().eq('game_id', gameId);
        await supabase.from('games').delete().eq('id', gameId);
        recordTerminalRecovery('completed-teardown', { gameId, source: 'empty-session-delete' });
        releaseRecoveryLease('completed-teardown', { gameId });
        navigate('/');
      } else {
        // Has game history - end session normally with game_over_at set
        // CRITICAL: Must set game_over_at so GameOverCountdown can complete and transition to session_ended
        console.log('[GAME OVER] Has game history, ending session');
        
        // Log session end
        await logSessionEvent({ gameId, eventType: 'session_ended', eventData: { reason: 'No active humans', pending_session_end: sessionEndExplicit }, userId: user?.id });
        
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: new Date().toISOString(),
            pending_session_end: false,
            game_over_at: new Date().toISOString()
          })
          .eq('id', gameId);
        
        // Navigate after brief delay
        recordTerminalRecovery('session-ended-confirmed', { gameId, source: 'no-active-humans-with-history' });
        releaseRecoveryLease('session-ended-confirmed', { gameId });
        setTimeout(() => navigate('/'), 2000);
      }
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:no-active-humans',
        returnReason: 'activeHumanCount<1',
      });
      return;
    }
    
    // Priority 2: Need 1+ eligible dealer AND 2+ active players to continue, otherwise revert to waiting
    if (eligibleDealerCount < 1 || activePlayerCount < 2) {
      console.log('[GAME OVER] Not enough players to continue! Eligible dealers:', eligibleDealerCount, 'Active players:', activePlayerCount, '- reverting to waiting');
      gameOverTransitionRef.current = false;

      // CONTRACT: every sit-out path remains seated and visible (red).
      // Only explicit Stand Up or Leave may release a seat; sit-outs can
      // opt back in for the next game from their current position.

      // Revert to waiting status — clear stale per-dealer-game
      // scaffolding so the next Start Game has a clean bootstrap.
      await supabase
        .from('games')
        .update({
          status: 'waiting',
          awaiting_next_round: false,
          last_round_result: null,
          current_game_uuid: null,
          config_deadline: null,
          config_complete: false,
        })
        .eq('id', gameId);
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:not-enough-players',
        returnReason: `eligibleDealers=${eligibleDealerCount} activePlayers=${activePlayerCount}`,
      });
      return;
    }

    if (game?.game_type === 'cribbage') {
      const outgoingDealerGameId = gameData?.current_game_uuid ?? game.current_game_uuid ?? null;
      const outgoingHandNumber = gameData?.total_hands ?? game.total_hands ?? null;
      let terminalRoundId = (
        currentRound?.dealer_game_id === outgoingDealerGameId
        && currentRound?.hand_number === outgoingHandNumber
      ) ? currentRound.id : null;

      if (!terminalRoundId && outgoingDealerGameId && outgoingHandNumber != null) {
        const { data: terminalRound, error: terminalRoundError } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId)
          .eq('dealer_game_id', outgoingDealerGameId)
          .eq('hand_number', outgoingHandNumber)
          .maybeSingle();
        if (terminalRoundError) {
          throw terminalRoundError;
        }
        terminalRoundId = terminalRound?.id ?? null;
      }

      if (!outgoingDealerGameId || !terminalRoundId || outgoingHandNumber == null) {
        throw new Error('Cribbage postgame identity is incomplete; no transition was attempted.');
      }

      emit357GameOverCompleteDiag('advance_begin', {
        ..._gocId(),
        outgoingDealerGameId,
        terminalRoundId,
        outgoingHandNumber,
        branch: 'cribbage-authoritative-postgame',
      });
      const { data: postgameResult, error: postgameError } = await supabase.rpc(
        'cribbage_advance_postgame' as any,
        {
          _game_id: gameId,
          _round_id: terminalRoundId,
          _dealer_game_id: outgoingDealerGameId,
          _hand_number: outgoingHandNumber,
        } as any,
      );
      if (postgameError) {
        emit357GameOverCompleteDiag('advance_error', {
          ..._gocId(),
          outgoingDealerGameId,
          terminalRoundId,
          outgoingHandNumber,
          error: postgameError,
        });
        throw postgameError;
      }

      const postgame = postgameResult as {
        outcome?: string;
        status?: string;
        dealer_position?: number | null;
      } | null;
      if (postgame?.outcome === 'stale_identity') {
        emit357GameOverCompleteDiag('advance_complete', {
          ..._gocId(),
          outgoingDealerGameId,
          terminalRoundId,
          outgoingHandNumber,
          resultingStatus: postgame.status ?? null,
          claimLost: true,
        });
        gameOverTransitionRef.current = false;
        await fetchGameData();
        return;
      }
      if (postgame?.outcome !== 'advanced' && postgame?.outcome !== 'already_advanced') {
        throw new Error(`Unexpected Cribbage postgame outcome: ${postgame?.outcome ?? 'missing'}`);
      }

      emit357GameOverCompleteDiag('advance_complete', {
        ..._gocId(),
        outgoingDealerGameId,
        terminalRoundId,
        outgoingHandNumber,
        resultingStatus: postgame.status ?? null,
        selectedNextDealerPosition: postgame.dealer_position ?? null,
        claimLost: postgame.outcome === 'already_advanced',
      });
      gameOverTransitionRef.current = false;
      anteAnimationFiredRef.current = null;
      await fetchGameData();
      emit357GameOverCompleteDiag('complete', {
        ..._gocId(),
        finalStatus: postgame.status ?? null,
      });
      return;
    }


    // STEP 3: Determine next dealer - check "make it take it" first, then
    // fallback to rotation. Only the outgoing dealer game's winner can own
    // this choice. Result history also contains later non-winner bookkeeping
    // rows (ante, leg purchase), which must never erase a terminal winner.
    const outgoingDealerGameId = gameData?.current_game_uuid ?? game?.current_game_uuid ?? null;
    let lastWinnerPlayerId: string | null = null;
    if (outgoingDealerGameId) {
      const { data: terminalWinnerResult, error: terminalWinnerError } = await supabase
        .from('game_results')
        .select('winner_player_id')
        .eq('game_id', gameId)
        .eq('dealer_game_id', outgoingDealerGameId)
        .not('winner_player_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (terminalWinnerError) {
        console.warn('[GAME OVER] Could not resolve outgoing dealer-game winner; using normal rotation', {
          gameId,
          outgoingDealerGameId,
          error: terminalWinnerError,
        });
      } else {
        lastWinnerPlayerId = terminalWinnerResult?.winner_player_id ?? null;
      }
    } else {
      console.warn('[GAME OVER] Missing outgoing dealer-game identity; using normal rotation', { gameId });
    }
    console.log('[GAME OVER] Outgoing dealer-game winner player_id:', lastWinnerPlayerId, {
      outgoingDealerGameId,
    });
    
    // Check if "make it take it" is enabled and winner is eligible
    const makeItTakeItResult = await getMakeItTakeItDealer(gameId, lastWinnerPlayerId);
    
    // CRITICAL (MUT-01): Mark rounds as 'completed' SCOPED to current dealer_game_id only.
    // Never bulk-update across dealer games — that can stomp rounds belonging to a freshly-started game.
    const dealerGameIdForCompletion = game?.current_game_uuid ?? null;
    console.log('[GAME OVER] Marking rounds completed (scoped)', { dealerGameIdForCompletion });
    if (dealerGameIdForCompletion) {
      await supabase
        .from('rounds')
        .update({ status: 'completed' })
        .eq('game_id', gameId)
        .eq('dealer_game_id', dealerGameIdForCompletion)
        .neq('status', 'completed');
    } else {
      console.warn('[GAME OVER] Skipping rounds-completed bulk write: no current_game_uuid');
    }

    // Reset per-game ephemeral state for eligible players only.
    // CRITICAL: Do NOT promote observers to status='active' here, and do not
    // touch sitting_out (owned by evaluatePlayerStatesEndOfGame). We do clear
    // the now-consumed sit_out_next_hand / stand_up_next_hand flags, but only
    // for non-observers (observers should not carry those flags anyway).
    console.log('[GAME OVER] Resetting per-game state for eligible (non-observer) players');
    await supabase
      .from('players')
      .update({
        current_decision: null,
        decision_locked: false,
        ante_decision: null,
        sit_out_next_hand: false,
        stand_up_next_hand: false
      })
      .eq('game_id', gameId)
      .neq('status', 'observer')
      .neq('status', 'left');

    // Handle make it take it result - can be a position, 'selection', or null
    if (makeItTakeItResult === 'selection') {
      // Bot won and multiple eligible human dealers - trigger dealer selection animation
      console.log('[GAME OVER] Make it take it: bot won, triggering dealer selection animation');
      
      await logStatusChanged(gameId, user?.id, 'game_over', 'dealer_selection', 'Bot won with make it take it, running dealer selection');
      
      // Topology normalization at the next-dealer-game bootstrap boundary.
      recordNormalizationDbg({ kind: 'call-site', caller: 'MIT→dealer_selection', didInvokeNormalizer: true, statusTransition: 'game_over→dealer_selection' });
      try { await normalizeTwoPlayerSeatsIfNeeded(gameId, 'MIT→dealer_selection'); }
      catch (e) { console.error('[GAME OVER → dealer_selection] normalize threw:', e); }

      emit357GameOverCompleteDiag('advance_begin', {
        ..._gocId(),
        outgoingDealerGameId: game?.current_game_uuid ?? null,
        targetStatus: 'dealer_selection',
        branch: 'make-it-take-it-selection',
      });
      // H. Dealer game boundary reset — dealer_selection branch.
      emit357RuntimeDiag('dealer_game_boundary_reset', {
        gameId: gameId ?? null,
        viewerPlayerId: currentPlayer?.id ?? null,
        terminalResultIdentity: game?.last_round_result ?? null,
      }, {
        origin: 'handleGameOverComplete',
        branch: 'dealer_selection',
        outgoingDealerGameId: game?.current_game_uuid ?? null,
        payloadFieldsCleared: ['last_round_result','current_round','awaiting_next_round','next_round_number','pot','all_decisions_in','all_decisions_in_round_id','game_over_at','buck_position','total_hands','dealer_selection_state'],
      });
      // P0 GUARD (MUT-02): atomic DB claim
      const { data: dsClaim, error } = await supabase
        .from('games')
        .update({ 
          status: 'dealer_selection',
          config_complete: false,
          last_round_result: null,
          current_round: null,
          awaiting_next_round: false,
          next_round_number: null,
          pot: 0,
          all_decisions_in: false,
          all_decisions_in_round_id: null,
          game_over_at: null,
          buck_position: null,
          total_hands: 0,
          // Clear any stale dealer_selection_state from a prior selection.
          dealer_selection_state: null,
          // Don't set dealer_position - DealerSelection will handle it
        })
        .eq('id', gameId)
        .eq('status', 'game_over')
        .select('id');

      if (error) {
        console.error('[GAME OVER] Failed to start dealer selection:', error);
        emit357GameOverCompleteDiag('advance_error', {
          ..._gocId(),
          targetStatus: 'dealer_selection',
          error,
        });
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:dealer_selection-claim-error',
          returnReason: 'atomic-claim-error',
          error,
        });
        gameOverTransitionRef.current = false;
        return;
      }
      if (!dsClaim || dsClaim.length === 0) {
        console.log('[GAME OVER] mut02-claim-lost (dealer_selection branch)');
        emit357GameOverCompleteDiag('advance_complete', {
          ..._gocId(),
          targetStatus: 'dealer_selection',
          resultingStatus: null,
          claimLost: true,
        });
        emit357GameOverCompleteDiag('returned', {
          ..._gocId(),
          returnSite: 'handleGameOverComplete:dealer_selection-claim-lost',
          returnReason: 'mut02-claim-lost',
        });
        gameOverTransitionRef.current = false;
        await fetchGameData();
        return;
      }

      console.log('[GAME OVER] Successfully transitioned to dealer_selection');
      emit357GameOverCompleteDiag('advance_complete', {
        ..._gocId(),
        targetStatus: 'dealer_selection',
        resultingStatus: 'dealer_selection',
        claimLost: false,
      });
      gameOverTransitionRef.current = false;
      anteAnimationFiredRef.current = null;
      await fetchGameData();
      emit357GameOverCompleteDiag('complete', {
        ..._gocId(),
        finalStatus: 'dealer_selection',
      });
      return;
    }
    
    let newDealerPosition: number;
    if (typeof makeItTakeItResult === 'number') {
      console.log('[GAME OVER] Using "make it take it" dealer:', makeItTakeItResult);
      newDealerPosition = makeItTakeItResult;
    } else {
      // Normal rotation
      const currentDealerPosition = gameData?.dealer_position || 1;
      newDealerPosition = await rotateDealerPosition(gameId, currentDealerPosition);
      console.log('[GAME OVER] Dealer rotation after player state evaluation:', currentDealerPosition, '->', newDealerPosition);
    }

    console.log('[GAME OVER] Transitioning to game_selection phase for new game');

    // Set config_deadline ATOMICALLY with status change, using the session-cached timer.
    const setupSeconds = Math.max(1, game?.game_setup_timer_seconds ?? 30);
    const configDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();
    
    // Log session events for next game setup
    await logStatusChanged(gameId, user?.id, 'game_over', 'game_selection', `Starting next game, dealer at position ${newDealerPosition}`);
    await logConfigDeadlineSet(gameId, user?.id, configDeadline, 'handleGameOverComplete');
    
    emit357GameOverCompleteDiag('advance_begin', {
      ..._gocId(),
      outgoingDealerGameId: game?.current_game_uuid ?? null,
      targetStatus: 'game_selection',
      selectedNextDealerPosition: newDealerPosition,
      branch: 'normal-rotation-or-mit-position',
    });
    // Skip dealer_announcement, go directly to game_selection
    // H. Dealer game boundary reset — game_selection branch.
    emit357RuntimeDiag('dealer_game_boundary_reset', {
      gameId: gameId ?? null,
      viewerPlayerId: currentPlayer?.id ?? null,
      terminalResultIdentity: game?.last_round_result ?? null,
    }, {
      origin: 'handleGameOverComplete',
      branch: 'game_selection',
      outgoingDealerGameId: game?.current_game_uuid ?? null,
      selectedNextDealerPosition: newDealerPosition,
      configDeadline,
      payloadFieldsCleared: ['last_round_result','current_round','awaiting_next_round','next_round_number','pot','all_decisions_in','all_decisions_in_round_id','game_over_at','buck_position','total_hands'],
    });
    // P0 GUARD (MUT-02): atomic DB claim — only the first writer flipping
    // status away from 'game_over' wins. Late/duplicate writers see 0 rows.
    const { data: claimRows, error } = await supabase
      .from('games')
      .update({ 
        status: 'game_selection',
        config_complete: false,
        config_deadline: configDeadline, // Set deadline atomically!
        last_round_result: null,
        current_round: null,
        awaiting_next_round: false,
        next_round_number: null,
        pot: 0,
        all_decisions_in: false,
        all_decisions_in_round_id: null,
        game_over_at: null,
        buck_position: null,
        total_hands: 0,
        dealer_position: newDealerPosition // Set new dealer position
      })
      .eq('id', gameId)
      .eq('status', 'game_over')
      .select('id');

    if (error) {
      console.error('[GAME OVER] Failed to start game selection:', error);
      emit357GameOverCompleteDiag('advance_error', {
        ..._gocId(),
        targetStatus: 'game_selection',
        error,
      });
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:game_selection-claim-error',
        returnReason: 'atomic-claim-error',
        error,
      });
      gameOverTransitionRef.current = false;
      return;
    }
    if (!claimRows || claimRows.length === 0) {
      console.log('[GAME OVER] mut02-claim-lost (status no longer game_over) — another client advanced');
      emit357GameOverCompleteDiag('advance_complete', {
        ..._gocId(),
        targetStatus: 'game_selection',
        resultingStatus: null,
        claimLost: true,
      });
      emit357GameOverCompleteDiag('returned', {
        ..._gocId(),
        returnSite: 'handleGameOverComplete:game_selection-claim-lost',
        returnReason: 'mut02-claim-lost',
      });
      gameOverTransitionRef.current = false;
      await fetchGameData();
      return;
    }

    console.log('[GAME OVER] Successfully transitioned to game_selection, new dealer:', newDealerPosition);
    emit357GameOverCompleteDiag('advance_complete', {
      ..._gocId(),
      targetStatus: 'game_selection',
      resultingStatus: 'game_selection',
      selectedNextDealerPosition: newDealerPosition,
      claimLost: false,
    });

    // Reset transition guard and ante animation guard for next game
    gameOverTransitionRef.current = false;
    anteAnimationFiredRef.current = null;

    // Manual refetch to update UI
    // Bot dealers will be handled automatically by DealerGameSetup component
    console.log('[GAME OVER] Calling fetchGameData to sync UI');
    await fetchGameData();
    console.log('[GAME OVER] fetchGameData completed');
    emit357GameOverCompleteDiag('complete', {
      ..._gocId(),
      finalStatus: 'game_selection',
      selectedNextDealerPosition: newDealerPosition,
    });

  } catch (error: any) {
    // If anything throws above, the previous code would leave gameOverTransitionRef stuck true,
    // permanently blocking progression. This catch + finally makes the flow resilient.
    console.error('[GAME OVER COMPLETE] Unhandled error during transition:', error);
    emit357GameOverCompleteDiag('unhandled_exception', {
      ..._gocId(),
      error,
    });
    toast({
      title: 'Error',
      description: error?.message || 'Failed to start next game. Please try again.',
      variant: 'destructive',
    });

    // Best-effort resync.
    try {
      await fetchGameData();
    } catch (e) {
      console.error('[GAME OVER COMPLETE] fetchGameData failed during recovery:', e);
    }
  } finally {
    gameOverTransitionRef.current = false;
  }
  }, [gameId, navigate, players, game, currentRound, fetchGameData, toast]);

  // Dealer confirms to skip countdown and go directly to game selection
  const handleDealerConfirmGameOver = useCallback(async () => {
    if (!gameId) return;
    
    console.log('[DEALER CONFIRM] Skipping countdown, going directly to game selection');
    
    // Go directly to game_selection (no countdown)
    await handleGameOverComplete();
  }, [gameId, handleGameOverComplete]);

  // Auto-confirm game over for bot dealers (Holm games)
  // Also auto-proceed if Chucky beat a player (game should continue, not end)
  useEffect(() => {
    if (game?.status === 'game_over' && !game?.game_over_at && game?.last_round_result) {
      // IMPORTANT: Never auto-confirm for 3-5-7. Those games rely on the win animation sequence
      // (legs-to-player -> pot-to-player) to finish before transitioning.
      if (game?.game_type !== 'holm-game') return;

      // If Chucky beat a player, the game should NOT have ended - auto-proceed to next hand
      if (game.last_round_result.includes('Chucky beat')) {
        console.log('[CHUCKY WIN FIX] Chucky beat player but game_over was set incorrectly - auto-proceeding');
        const timer = setTimeout(async () => {
          // Reset status to in_progress and set awaiting_next_round
          await supabase
            .from('games')
            .update({
              status: 'in_progress',
              awaiting_next_round: true
            })
            .eq('id', gameId);
        }, 2000);
        return () => clearTimeout(timer);
      }

      // If player beat Chucky, let the HolmWinPotAnimation drive the transition (don’t skip it).
      const isPlayerBeatChucky = game.last_round_result.includes('beat Chucky') && !game.last_round_result.includes('Chucky beat');
      if (isPlayerBeatChucky) return;

      const dealerPlayer = players.find(p => p.position === game.dealer_position);
      if (dealerPlayer?.is_bot) {
        console.log('[BOT DEALER] Auto-confirming game over');
        const timer = setTimeout(() => {
          handleDealerConfirmGameOver();
        }, 2000); // 2 second delay for dramatic effect
        return () => clearTimeout(timer);
      }
    }
  }, [game?.status, game?.game_over_at, game?.last_round_result, game?.game_type, game?.dealer_position, players, handleDealerConfirmGameOver, gameId]);

  // SAFETY AUTO-ADVANCE (Horses / SCC only):
  // Horses and SCC dealer games end after a single hand. If the win animation
  // (horsesWinPotTriggerId) never fires — e.g. because pot caching missed or the
  // animation handler bailed silently — the game can sit in 'game_over' with
  // game_over_at already set and no UI affordance to advance.
  //
  // We deliberately scope this fallback to Horses/SCC ONLY:
  //   - Holm has its own auto-confirm path
  //   - 3-5-7, Cribbage, Gin Rummy, Yahtzee have their own dealer-driven completion
  //     flows; a broad fallback there would mask real bugs and could preempt
  //     legitimate animations.
  //
  // Triggers only after game_over_at + 15s, only if no win animation is active,
  // and only after re-verifying status from the DB.
  useEffect(() => {
    if (game?.status !== 'game_over') return;
    if (!game?.game_over_at) return;
    const gt = game?.game_type;
    if (gt !== 'horses' && gt !== 'ship-captain-crew') return;
    if (horsesWinPotTriggerId) return; // win animation in progress

    const ageMs = Date.now() - new Date(game.game_over_at).getTime();
    const delayMs = Math.max(0, 15_000 - ageMs);

    console.log('[HORSES/SCC GAME-OVER FALLBACK] Scheduled', { gt, delayMs, ageMs });

    const timer = window.setTimeout(async () => {
      const { data: fresh } = await supabase
        .from('games')
        .select('status, game_over_at')
        .eq('id', gameId)
        .single();
      if (fresh?.status !== 'game_over') return;
      console.warn('[HORSES/SCC GAME-OVER FALLBACK] Forcing handleGameOverComplete');
      await handleGameOverComplete();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [game?.status, game?.game_over_at, game?.game_type, gameId, horsesWinPotTriggerId, handleGameOverComplete]);

  // Unmount cleanup for 357 timers (don't rely on effect cleanups that run on every re-render)
  useEffect(() => {
    return () => {
      if (safety357FallbackTimerRef.current) {
        __cancelWartimeAsyncOwner(safety357FallbackTimerRef.current, 'unmount_cleanup');
        window.clearTimeout(safety357FallbackTimerRef.current);
        safety357FallbackTimerRef.current = null;
      }
      if (safety357FallbackExtendTimerRef.current) {
        __cancelWartimeAsyncOwner(safety357FallbackExtendTimerRef.current, 'unmount_cleanup');
        window.clearTimeout(safety357FallbackExtendTimerRef.current);
        safety357FallbackExtendTimerRef.current = null;
      }
      if (poll357IntervalRef.current) {
        __cancelWartimeAsyncOwner(poll357IntervalRef.current, 'unmount_cleanup');
        window.clearInterval(poll357IntervalRef.current);
        poll357IntervalRef.current = null;
      }
      if (poll357StopTimerRef.current) {
        __cancelWartimeAsyncOwner(poll357StopTimerRef.current, 'unmount_cleanup');
        window.clearTimeout(poll357StopTimerRef.current);
        poll357StopTimerRef.current = null;
      }
    };
  }, []);

  // SAFETY FALLBACK (357): Auto-proceed if stuck in game_over without game_over_at.
  // IMPORTANT: We do NOT return a cleanup here, because React would run it on every re-render
  // and repeatedly cancel the timer before it can fire.
  useEffect(() => {
    const lrr357 = game?.last_round_result ?? '';
    const is357StuckGameOver =
      game?.status === 'game_over' &&
      game?.game_type !== 'holm-game' &&
      !game?.game_over_at &&
      // Controller-owned instant-357 (357_SWEEP:) drives its own
      // callback-driven progression via enterCanonical357TerminalPresentation
      // → PotToPlayerAnimation.onAnimationEnd → handlePotToPlayerComplete357.
      // The bespoke ~10s safety timer must not run on that path.
      lrr357.includes('won the game');


    const clearFallbackTimers = () => {
      if (safety357FallbackTimerRef.current) {
        __cancelWartimeAsyncOwner(safety357FallbackTimerRef.current, 'safety_fallback_rescheduled_or_cleared');
        window.clearTimeout(safety357FallbackTimerRef.current);
        safety357FallbackTimerRef.current = null;
      }
      if (safety357FallbackExtendTimerRef.current) {
        __cancelWartimeAsyncOwner(safety357FallbackExtendTimerRef.current, 'safety_extension_rescheduled_or_cleared');
        window.clearTimeout(safety357FallbackExtendTimerRef.current);
        safety357FallbackExtendTimerRef.current = null;
      }
    };

    if (!is357StuckGameOver) {
      safety357FallbackKeyRef.current = null;
      clearFallbackTimers();
      return;
    }

    const key = `${gameId}|${game?.last_round_result}`;

    // If we've already scheduled for this exact win instance, keep the existing timer alive.
    if (safety357FallbackKeyRef.current === key && safety357FallbackTimerRef.current) {
      return;
    }

    // New win instance (or lost timer) -> clear and reschedule.
    clearFallbackTimers();
    safety357FallbackKeyRef.current = key;

    const legsToWin = game?.legs_to_win || 3;
    const legsToAnimate = (cachedLegPositionsRef.current || []).reduce((sum, p) => {
      const c = typeof p.legCount === 'number' ? p.legCount : 0;
      return sum + Math.min(c, legsToWin);
    }, 0);

    // Match LegsToPlayerAnimation.tsx math: totalDuration = 3500 + (legCount * 100)
    const legsToPlayerMs = 3500 + (legsToAnimate * 100);

    // Approximate full sequence timing - should match actual animation callbacks:
    // - Initial wait for leg animation: 1.8s
    // - Legs-to-player: computed above (~3.5s base + 0.1s/leg)
    // - Pot-to-player: 3.3s (onAnimationEnd fires at 3300ms)
    // - Post-pot delay: 0.3s
    // - Buffer: 1.0s
    const computedMs = 1800 + legsToPlayerMs + 3300 + 300 + 1000;
    // Fallback should be slightly longer than expected - min 6s, max 12s
    const fallbackMs = Math.min(12_000, Math.max(6_000, computedMs));

    console.log('[357 SAFETY FALLBACK] Scheduling auto-proceed (stable timer)', {
      fallbackMs,
      legsToWin,
      legsToAnimate,
      legsToPlayerMs,
      key,
    });

    safety357FallbackTimerRef.current = __scheduleWartimeTimeout({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_357_SAFETY_FALLBACK.id,
      ownerLabel: '3-5-7 safety fallback timeout',
      delayMs: fallbackMs,
      extra: {
        key,
        fallbackMs,
        legsToWin,
        legsToAnimate,
        legsToPlayerMs,
        winAnimationActiveGuard: is357WinAnimationActiveRef.current,
      },
      fn: async () => {
      // If the win animation is still active, do NOT cut it off.
      if (is357WinAnimationActiveRef.current) {
        console.log('[357 SAFETY FALLBACK] Win animation still active at fallback time, extending by 5s');
        safety357FallbackExtendTimerRef.current = __scheduleWartimeTimeout({
          sourceSiteId: __WARTIME_SRC.ASYNC_GAME_357_SAFETY_EXTENSION.id,
          ownerLabel: '3-5-7 safety fallback extension timeout',
          delayMs: 5000,
          extra: {
            key,
            reason: 'win_animation_still_active_at_fallback',
          },
          fn: async () => {
          const { data: freshGame, error: freshGameError } = await supabase
            .from('games')
            .select('status, game_over_at')
            .eq('id', gameId)
            .single();

          if (freshGameError || !freshGame) {
            console.warn('[357 SAFETY FALLBACK] Failed to verify game state during extension; forcing transition best-effort', {
              freshGameError,
            });
            setIs357WinAnimationActive(false);
            __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
            is357WinAnimationActiveRef.current = false;
            await handleGameOverComplete();
            return;
          }

          if (freshGame.status === 'game_over' && !freshGame.game_over_at) {
            console.log('[357 SAFETY FALLBACK] Still stuck after extension (verified via DB), forcing transition');
            setIs357WinAnimationActive(false);
            __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
            is357WinAnimationActiveRef.current = false;
            await handleGameOverComplete();
          } else {
            console.log('[357 SAFETY FALLBACK] Game state changed during extension, no action needed:', freshGame);
          }
          },
        });
        return;
      }

      const { data: freshGame, error: freshGameError } = await supabase
        .from('games')
        .select('status, game_over_at')
        .eq('id', gameId)
        .single();

      if (freshGameError || !freshGame) {
        console.warn('[357 SAFETY FALLBACK] Failed to verify game state; forcing transition best-effort', {
          freshGameError,
        });
        setIs357WinAnimationActive(false);
        __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
        is357WinAnimationActiveRef.current = false;
        await handleGameOverComplete();
        return;
      }

      if (freshGame.status === 'game_over' && !freshGame.game_over_at) {
        console.log('[357 SAFETY FALLBACK] Still stuck (verified via DB), forcing transition');
        setIs357WinAnimationActive(false);
        __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
        is357WinAnimationActiveRef.current = false;
        await handleGameOverComplete();
      } else {
        console.log('[357 SAFETY FALLBACK] Game state changed, no action needed:', freshGame);
      }
      },
    });
  }, [game?.status, game?.game_over_at, game?.last_round_result, game?.game_type, game?.legs_to_win, gameId, handleGameOverComplete]);

  // POLLING (357): Once the win animation is finished, poll until the game transitions.
  // IMPORTANT: We do NOT return a cleanup here either (same reason: avoid cancel-on-rerender).
  useEffect(() => {
    const lrrPoll357 = game?.last_round_result ?? '';
    const is357GameOverNeedingProgress =
      game?.status === 'game_over' &&
      game?.game_type !== 'holm-game' &&
      !game?.game_over_at &&
      (lrrPoll357.includes('won the game') || lrrPoll357.startsWith('357_SWEEP:'));


    const clearPollTimers = () => {
      if (poll357IntervalRef.current) {
        __cancelWartimeAsyncOwner(poll357IntervalRef.current, 'progress_poll_cleared');
        window.clearInterval(poll357IntervalRef.current);
        poll357IntervalRef.current = null;
      }
      if (poll357StopTimerRef.current) {
        __cancelWartimeAsyncOwner(poll357StopTimerRef.current, 'progress_poll_stop_cleared');
        window.clearTimeout(poll357StopTimerRef.current);
        poll357StopTimerRef.current = null;
      }
    };

    if (safetyPollsDisabled) {
      poll357KeyRef.current = null;
      clearPollTimers();
      return;
    }

    // Only start polling AFTER the win animation is done.
    if (!is357GameOverNeedingProgress || is357WinAnimationActiveRef.current) {
      poll357KeyRef.current = null;
      clearPollTimers();
      return;
    }

    const key = `${gameId}|${game?.last_round_result}`;

    if (poll357KeyRef.current === key && poll357IntervalRef.current) {
      return;
    }

    // New key (or lost interval) -> clear and start.
    clearPollTimers();
    poll357KeyRef.current = key;

    console.log('[357 POLL] Starting post-animation polling (stable interval)', {
      key,
      status: game?.status,
      gameOverAt: game?.game_over_at,
    });

    // Start polling immediately (first check) then every 800ms
    const checkAndProceed = async () => {
      // If animation becomes active again, pause polling.
      if (is357WinAnimationActiveRef.current) return;

      const { data: freshGame, error: pollFetchError } = await supabase
        .from('games')
        .select('status, game_over_at')
        .eq('id', gameId)
        .single();

      if (pollFetchError) {
        console.warn('[357 POLL] Failed to fetch game status; will retry', pollFetchError);
        return;
      }

      if (!freshGame) return;

      // Stop polling once we leave game_over OR game_over_at becomes set (countdown path).
      if (freshGame.status !== 'game_over' || !!freshGame.game_over_at) {
        console.log('[357 POLL] Game progressed, stopping polling', freshGame);
        clearPollTimers();
        return;
      }

      console.log('[357 POLL] Still stuck in game_over (no game_over_at) -> forcing handleGameOverComplete');
      await handleGameOverComplete();
    };

    // Execute immediately
    checkAndProceed();

    // Then poll every 2 seconds (not 800ms which hammers DB)
    poll357IntervalRef.current = __scheduleWartimeInterval({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_357_PROGRESS_POLL.id,
      ownerLabel: '3-5-7 post-animation progress poll',
      intervalMs: 2000,
      extra: { key, initialStatus: game?.status ?? null, initialGameOverAt: game?.game_over_at ?? null },
      fn: async () => { await checkAndProceed(); },
    });

    // Hard stop after 15 seconds (reduced from 25s)
    poll357StopTimerRef.current = __scheduleWartimeTimeout({
      sourceSiteId: __WARTIME_SRC.ASYNC_GAME_357_POLL_STOP.id,
      ownerLabel: '3-5-7 post-animation poll hard-stop',
      delayMs: 15_000,
      extra: { key, hardStopMs: 15_000 },
      fn: async () => {
        console.log('[357 POLL] Hard stop reached, stopping polling');
        clearPollTimers();
        poll357KeyRef.current = null;
      },
    });
  }, [game?.status, game?.game_type, game?.game_over_at, game?.last_round_result, gameId, handleGameOverComplete]);



  useEffect(() => {
    // Track live-session ownership for the LAST HAND terminal path below.
    if (game?.game_type === 'holm-game' && game?.status != null && game.status !== 'session_ended') {
      holmSawLiveSessionRef.current = true;
    }
    // Terminal statuses that can carry a Holm win result:
    //   `game_over`      — ordinary win (unchanged).
    //   `session_ended`  — LAST HAND win: the authoritative settlement RPC
    //                      commits the terminal disposition in the same
    //                      transaction, so this client never observes
    //                      `game_over`. Admitted ONLY when this mount owned
    //                      the live session (no replay on refresh).
    const _holmTerminalStatus =
      game?.status === 'game_over' ||
      (game?.status === 'session_ended' && holmSawLiveSessionRef.current);
    if (_holmTerminalStatus && game?.game_type === 'holm-game' && game?.last_round_result) {
      const resultMessage = game.last_round_result;

      if (
        game.status === 'session_ended' &&
        holmTerminalRevealPresentationKey === holmWinPotPresentationKey &&
        holmTerminalRevealCompleteKey !== holmWinPotPresentationKey
      ) {
        return;
      }

      // Check if this is a player beating Chucky (not Chucky beating a player)
      if (resultMessage.includes('beat Chucky') && !resultMessage.includes('Chucky beat')) {
        // Prevent duplicate processing
        if (holmWinProcessedRef.current === resultMessage) {
          return;
        }
        // Consumed-presentation guard (stable identity). Once this exact
        // authoritative terminal result has been presented to completion on
        // this client, it can never build another descriptor — even after the
        // in-memory single-slot latch above is wiped by a transient status or
        // identity blip during the dealer-game rollover.
        if (holmWinPotPresentationKey && holmPresentedResultKeysRef.current.has(holmWinPotPresentationKey)) {
          return;
        }


        // Parse pot amount from message
        const potMatch = resultMessage.match(/POT:(\d+)/);
        const potAmount = potMatch ? parseInt(potMatch[1], 10) : 0;

        // Find winner name(s) from message - can be "Player1 and Player2 beat Chucky"
        const displayPart = resultMessage.split('|||')[0];
        const winnerMatch = displayPart.match(/^(.+?) beat Chucky/);
        const winnerNameRaw = winnerMatch ? winnerMatch[1] : '';
        const winnerName = winnerNameRaw.trim();
        
        // Check if this is a multi-player win (contains " and ")
        const isMultiPlayerWin = winnerName.includes(' and ');
        
        if (isMultiPlayerWin) {
          // Split by " and " to get individual winner names
          const winnerNames = winnerName.split(' and ').map(n => n.trim());
          const winnerPlayers: Player[] = [];
          
          for (const name of winnerNames) {
            const lowerName = name.toLowerCase();
            let foundPlayer = players.find((p) => (p.profiles?.username ?? '').trim() === name);
            if (!foundPlayer) {
              foundPlayer = players.find((p) => p.is_bot && getBotAlias(players, p.user_id).trim() === name);
            }
            if (!foundPlayer) {
              foundPlayer = players.find((p) => (p.profiles?.username ?? '').trim().toLowerCase() === lowerName);
            }
            if (!foundPlayer) {
              foundPlayer = players.find((p) => p.is_bot && getBotAlias(players, p.user_id).trim().toLowerCase() === lowerName);
            }
            if (foundPlayer) {
              winnerPlayers.push(foundPlayer);
            }
          }
          
          // Fallback: use all stayed players if we couldn't resolve names
          if (winnerPlayers.length === 0) {
            const stayed = players.filter((p) => p.current_decision === 'stay' && !p.sitting_out);
            winnerPlayers.push(...stayed);
          }
          
          if (winnerPlayers.length === 0) {
            console.warn('[HOLM WIN POT] Could not resolve any winner players for multi-player animation; skipping trigger.', {
              winnerName,
              winnerNames,
            });
            // No descriptor can be built from this result — release the
            // route-owned LAST HAND hold so navigation is never deadlocked.
            setHolmTerminalPresentationDone(resultMessage);
            return;
          }

          
          // Mark processed
          holmWinProcessedRef.current = resultMessage;
          
          const winnerPositions = winnerPlayers.map(p => p.position);
          console.log('[HOLM WIN POT] Triggering multi-player pot animation for:', winnerNames, 'positions:', winnerPositions, 'pot:', potAmount);
          
          setHolmWinPotAmount(potAmount);
          setHolmWinWinnerPositions(winnerPositions);
          setHolmWinWinnerPosition(winnerPositions[0]); // Keep single position for backwards compat
          const _multiTrigger = `holm-win-multi-${Date.now()}`;
          recordHolmLifecycle('winpot.trigger.multi', {
            triggerId: _multiTrigger,
            potAmount,
            winnerNames,
            winnerPositions,
            gameStatus: game?.status ?? null,
            lastRoundResult: game?.last_round_result ?? null,
          });
          setHolmWinPotTriggerId(_multiTrigger);
        } else {
          // Single player win - existing logic
          const lowerWinner = winnerName.toLowerCase();
          let winnerPlayer = players.find((p) => (p.profiles?.username ?? '').trim() === winnerName);

          if (!winnerPlayer) {
            winnerPlayer = players.find((p) => p.is_bot && getBotAlias(players, p.user_id).trim() === winnerName);
          }

          if (!winnerPlayer && winnerName) {
            winnerPlayer = players.find((p) => (p.profiles?.username ?? '').trim().toLowerCase() === lowerWinner);
          }

          if (!winnerPlayer && winnerName) {
            winnerPlayer = players.find((p) => p.is_bot && getBotAlias(players, p.user_id).trim().toLowerCase() === lowerWinner);
          }

          // Holm win-vs-Chucky is a solo stay scenario; use that as a safe fallback for animation targeting.
          if (!winnerPlayer) {
            const stayed = players.filter((p) => p.current_decision === 'stay' && !p.sitting_out);
            if (stayed.length === 1) {
              winnerPlayer = stayed[0];
            }
          }

          if (!winnerPlayer) {
            console.warn('[HOLM WIN POT] Could not resolve winner player for animation; skipping trigger.', {
              winnerName,
              displayPart,
              players: players.map((p) => ({
                id: p.id,
                pos: p.position,
                username: p.profiles?.username,
                is_bot: p.is_bot,
                alias: p.is_bot ? getBotAlias(players, p.user_id) : undefined,
                decision: p.current_decision,
              })),
            });
            // Same deadlock guard as the multi-winner branch above.
            setHolmTerminalPresentationDone(resultMessage);
            return;
          }

          // Mark processed only once we successfully resolved a winner.
          holmWinProcessedRef.current = resultMessage;

          const winnerPosition = winnerPlayer.position;

          console.log('[HOLM WIN POT] Triggering pot animation for:', winnerName || winnerPlayer.profiles?.username, 'position:', winnerPosition, 'pot:', potAmount);

          setHolmWinPotAmount(potAmount);
          setHolmWinWinnerPosition(winnerPosition);
          setHolmWinWinnerPositions([winnerPosition]);
          const _soloTrigger = `holm-win-${Date.now()}`;
          recordHolmLifecycle('winpot.trigger.solo', {
            triggerId: _soloTrigger,
            potAmount,
            winnerName: winnerPlayer.profiles?.username ?? winnerName,
            winnerPosition,
            gameStatus: game?.status ?? null,
            lastRoundResult: game?.last_round_result ?? null,
          });
          setHolmWinPotTriggerId(_soloTrigger);
        }
      }
    }

    // Reset when the game leaves the terminal window. `session_ended` on a
    // LAST HAND win is part of that window (the descriptor must survive the
    // authoritative snapshot), so it must NOT clear the trigger here.
    if (!_holmTerminalStatus) {
      holmWinProcessedRef.current = null;
      // CRITICAL: Clear the trigger ID so animation doesn't re-fire in new game
      recordHolmLifecycle('winpot.clear', {
        reason: 'game.status left terminal window',
        gameStatus: game?.status ?? null,
      });
      setHolmWinPotTriggerId(null);
      setHolmWinWinnerPositions([]);
      // Reset the transition guard for future game_over handling
      gameOverTransitionRef.current = false;
    }
  }, [game?.status, game?.game_type, game?.last_round_result, players, holmWinPotPresentationKey, holmTerminalRevealPresentationKey, holmTerminalRevealCompleteKey]);

  // Horses/SCC win pot animation trigger detection
  // Detect Horses or Ship Captain Crew game_over and trigger pot-to-player animation
  // Track the round/hand that triggered animation to prevent re-triggers
  const horsesWinAnimationRoundRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (game?.game_type !== 'horses' && game?.game_type !== 'ship-captain-crew') return;
    
    // When moving to a new round (not game_over), reset the processed ref for that new round
    if (game?.status !== 'game_over') {
      // Only reset if we're in a new round (current_round changed)
      if (horsesWinAnimationRoundRef.current !== null && 
          game?.current_round !== null && 
          game?.current_round !== horsesWinAnimationRoundRef.current) {
        horsesWinProcessedRef.current = null;
        horsesWinAnimationRoundRef.current = null;
      }
      return;
    }
    
    const resultMessage = game?.last_round_result;
    if (!resultMessage) return;
    
    // Example format: "PlayerName wins with Horse" or "BotName wins with ..."
    const isHorsesWin = resultMessage.includes('wins with');
    if (!isHorsesWin) return;
    
    // Don't re-process the same result (prevents double-trigger from dependency changes)
    if (horsesWinProcessedRef.current === resultMessage) return;
    
    // Don't trigger if animation is already in progress
    if (horsesWinPotTriggerId) return;
    
    // Parse winner name from message "PlayerName wins with ..."
    const match = resultMessage.match(/^(.+?) wins with/);
    const winnerName = match?.[1]?.trim() || '';
    
    // Find winner player
    let winnerPlayer = players.find(p => 
      p.profiles?.username?.trim().toLowerCase() === winnerName.toLowerCase()
    );
    
    // Try bot alias
    if (!winnerPlayer) {
      winnerPlayer = players.find(p => 
        p.is_bot && getBotAlias(players, p.user_id).trim().toLowerCase() === winnerName.toLowerCase()
      );
    }
    
    if (!winnerPlayer) {
      console.warn('[HORSES WIN POT] Could not resolve winner player for animation:', { winnerName, resultMessage });
      return;
    }
    
    // Get pot amount from cache (since DB pot is already reset to 0)
    const localPot = cachedPotForHorsesWinRef.current || game?.pot || 0;

    // Mark as processed early so the async branch doesn't re-enter on re-render
    horsesWinProcessedRef.current = resultMessage;
    horsesWinAnimationRoundRef.current = game?.current_round ?? null;

    const triggerWithPot = (potAmount: number) => {
      if (potAmount <= 0) {
        console.warn('[HORSES WIN POT] Skipping animation - pot is 0 even after game_results lookup:', { potAmount });
        // Reset processed ref so the safety fallback path or a later state change can retry
        horsesWinProcessedRef.current = null;
        horsesWinAnimationRoundRef.current = null;
        return;
      }
      console.log('[HORSES WIN POT] Triggering pot animation for:', winnerName, 'position:', winnerPlayer!.position, 'pot:', potAmount);
      const _triggerId = `horses-win-${Date.now()}`;
      // Win-presentation instrumentation was removed.
      setHorsesWinPotAmount(potAmount);
      setHorsesWinWinnerPosition(winnerPlayer!.position);
      setHorsesWinPotTriggerId(_triggerId);
    };

    if (localPot > 0) {
      triggerWithPot(localPot);
      return;
    }

    // Refresh-resilient fallback: pot was reset before this client could cache it.
    // Authoritative pot lives in game_results.pot_won for the current dealer game / hand.
    console.log('[HORSES WIN POT] Local pot is 0; querying game_results for authoritative pot');
    void (async () => {
      try {
        const dealerGameId = game?.current_game_uuid;
        const handNumber = game?.total_hands ?? 1;
        const gameType = game?.game_type;

        // Triple-key scoping required: game_id + dealer_game_id + hand_number.
        // If dealer_game_id is missing we MUST NOT fall back to a recency-only
        // lookup — that could pull pot_won from a prior dealer game in the same
        // session. Bail to safety fallback instead.
        if (!dealerGameId) {
          console.warn('[HORSES WIN POT] No current_game_uuid; cannot safely look up pot_won. Letting safety fallback handle.');
          triggerWithPot(0);
          return;
        }

        const { data, error } = await supabase
          .from('game_results')
          .select('pot_won, dealer_game_id, hand_number, game_type, game_id, created_at')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .eq('hand_number', handNumber)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.warn('[HORSES WIN POT] game_results lookup failed:', error);
          triggerWithPot(0);
          return;
        }

        const row = data && data[0];
        // Sanity: row must match the active Horses/SCC dealer game.
        if (!row) {
          triggerWithPot(0);
          return;
        }
        if (row.game_type && gameType && row.game_type !== gameType) {
          console.warn('[HORSES WIN POT] game_results game_type mismatch; ignoring', { rowType: row.game_type, gameType });
          triggerWithPot(0);
          return;
        }
        triggerWithPot(row.pot_won || 0);
      } catch (err) {
        console.warn('[HORSES WIN POT] game_results lookup threw:', err);
        triggerWithPot(0);
      }
    })();
  }, [game?.status, game?.game_type, game?.last_round_result, game?.current_round, game?.current_game_uuid, game?.total_hands, players, horsesWinPotTriggerId, gameId]);

  // Cache pot value for 3-5-7 win animation (pot gets reset before game_over)
  const cachedPotFor357WinRef = useRef<number>(0);
  
  // Cache pot value for Horses win animation (pot gets reset before game_over)
  const cachedPotForHorsesWinRef = useRef<number>(0);
  
  // Cache leg positions for 3-5-7 win animation (legs get reset before animation runs)
  const [cachedLegPositions, setCachedLegPositions] = useState<{ playerId: string; position: number; legCount: number }[]>([]);
  // Also keep a ref for immediate access
  const cachedLegPositionsRef = useRef<{ playerId: string; position: number; legCount: number }[]>([]);
  
  // Compute a string representation of player legs to use as dependency
  // This ensures the effect runs whenever ANY player's legs change
  const playerLegsString = players.map(p => `${p.id}:${p.legs}`).join(',');
  
  // Aggressively cache pot and leg positions whenever they're non-zero
  // This runs on every players/pot change to capture values BEFORE backend resets them
  useEffect(() => {
    if (game?.game_type === 'holm-game') return;
    
    // Cache pot whenever it grows (never overwrite with a smaller/reset pot)
    if (game?.pot && game.pot > cachedPotFor357WinRef.current) {
      const prev = cachedPotFor357WinRef.current;
      cachedPotFor357WinRef.current = game.pot;
      console.log('[357 CACHE] Cached pot (max):', { prev, next: game.pot });
    }
    
    // Cache pot for Horses separately
    if ((game?.game_type === 'horses' || game?.game_type === 'ship-captain-crew') && game?.pot && game.pot > cachedPotForHorsesWinRef.current) {
      cachedPotForHorsesWinRef.current = game.pot;
      console.log('[DICE CACHE] Cached pot (max):', game.pot);
    }
    
    // Cache leg positions whenever any player has legs (before they get reset)
    const playersWithLegs = players.filter(p => p.legs > 0);
    if (playersWithLegs.length > 0) {
      const positions = playersWithLegs.map(p => ({
        playerId: p.id,
        position: p.position,
        legCount: p.legs
      }));
      setCachedLegPositions(positions);
      cachedLegPositionsRef.current = positions;
    }
  }, [game?.pot, game?.game_type, playerLegsString]);
  
  // Detect 3-5-7 final leg win and trigger win animation
  // Trigger on "won a leg" message OR "won the game" message (backend may have already transitioned)
  useEffect(() => {
    if (game?.game_type === 'holm-game' || !game?.last_round_result) return;
    
    const resultMessage = game.last_round_result;
    
    // Check for three patterns: "won a leg", "won the game", or authoritative 357_SWEEP sentinel
    const isLegWinMessage = resultMessage.includes('won a leg');
    const isGameWinMessage = resultMessage.includes('won the game');
    const isSweepMessage = resultMessage.startsWith('357_SWEEP:');

    if (!isLegWinMessage && !isGameWinMessage && !isSweepMessage) return;

    // A new dealer game can surface before its inherited session-level
    // `last_round_result` row has cleared. Let the descriptor-rotation effect
    // retire that older generation first; it will rerun this detector for a
    // genuine new result, even if the winner text is identical.
    if (
      game.current_game_uuid != null &&
      terminal357Descriptor?.dealerGameId != null &&
      terminal357Descriptor.dealerGameId !== game.current_game_uuid &&
      terminal357Descriptor.terminalResultIdentity === resultMessage
    ) {
      return;
    }

    
    
    // Prevent duplicate processing for this terminal dealer-game generation.
    // `game.id` is the long-lived session id, so the same player can earn the
    // same final leg text again in the next dealer game. Preserve a prior
    // descriptor through a transient null `current_game_uuid`, but never let
    // it make the next concrete dealer game look like a duplicate.
    const terminalDealerGameId =
      game.current_game_uuid ?? terminal357Descriptor?.dealerGameId ?? 'unknown';
    const processedKey = `${game.id}:${terminalDealerGameId}:${resultMessage}`;

    if (threeFiveSevenWinProcessedRef.current === processedKey) {
      console.log('[357 WIN] Already triggered for this result message, skipping duplicate detection');
      return;
    }

    // Also prevent re-trigger if we still have an active trigger
    if (threeFiveSevenWinTriggerId) {
      console.log('[357 WIN] Already have trigger, skipping duplicate detection');
      return;
    }

    // Parse winner from message - handle both formats
    const displayPart = resultMessage.split('|||')[0];
    let winnerName = '';
    let sweepAmountFromSentinel: number | null = null;

    if (isSweepMessage) {
      // Format: "357_SWEEP:PlayerName:AwardedAmount"
      const body = displayPart.slice('357_SWEEP:'.length);
      const lastColon = body.lastIndexOf(':');
      if (lastColon >= 0) {
        winnerName = body.slice(0, lastColon).trim();
        const parsedAmount = Number(body.slice(lastColon + 1).trim());
        if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
          sweepAmountFromSentinel = parsedAmount;
        } else {
          console.error('[357 WIN] 357_SWEEP sentinel amount missing/malformed/non-positive:', body);
        }
      } else {
        // Legacy sentinel without amount — diagnostic; treat as malformed.
        winnerName = body.trim();
        console.error('[357 WIN] 357_SWEEP sentinel missing amount segment:', body);
      }
    } else if (isLegWinMessage) {
      const winnerMatch = displayPart.match(/^(.+?) won a leg/);
      winnerName = winnerMatch ? winnerMatch[1] : '';
    } else if (isGameWinMessage) {
      // Format: "🏆 PlayerName won the game with X legs!"
      const winnerMatch = displayPart.match(/🏆\s*(.+?)\s+won the game/);
      winnerName = winnerMatch ? winnerMatch[1] : '';
    }


    // Find winner player - check both profile username AND bot alias for bot players
    const winnerPlayer = players.find(p => {
      if (p.profiles?.username === winnerName) return true;
      // For bots, check if the alias matches
      if (p.is_bot && getBotAlias(players, p.user_id) === winnerName) return true;
      return false;
    });
    if (!winnerPlayer) {
      console.log('[357 WIN] Could not find winner player:', winnerName);
      return;
    }

    // For leg win messages, check if this is the FINAL leg (player has reached legsToWin)
    // For game win messages, we already know it's the final leg
    const legsToWin = game?.legs_to_win || 3;


    if (isLegWinMessage && winnerPlayer.legs < legsToWin) {
      console.log('[357 WIN] Not final leg, player has', winnerPlayer.legs, 'of', legsToWin);
      return;
    }

    // Mark as processed for this exact result message (prevents repeat firing).
    threeFiveSevenWinProcessedRef.current = processedKey;

    // CACHE LEG POSITIONS NOW before backend resets them.
    // SWEEP EXCEPTION: the authoritative leg delta for an instant 3-5-7 sweep
    // is zero (no legs were earned). We MUST NOT reconstruct fake legs from
    // legsToWin — the legs-to-player phase must be skipped entirely.
    let legPositions: Array<{ playerId: string; position: number; legCount: number }> = [];

    if (isSweepMessage) {
      legPositions = [];
      console.log('[357 WIN] Sweep detected — skipping leg reconstruction (legsDelta=0)');
    } else {
      // First try to get from current player data
      const playersWithLegs = players.filter(p => p.legs > 0);

      if (playersWithLegs.length > 0) {
        // Use live data - legs haven't been reset yet
        legPositions = playersWithLegs.map(p => ({
          playerId: p.id,
          position: p.position,
          legCount: p.legs
        }));
        console.log('[357 WIN] Using live leg data:', legPositions);
      } else if (cachedLegPositionsRef.current.length > 0) {
        // Use cached data from ref (more reliable than state during rapid updates)
        legPositions = cachedLegPositionsRef.current;
        console.log('[357 WIN] Using cached leg data from ref:', legPositions);
      } else {
        // Legs already reset and no cache - reconstruct from winner (guaranteed to have legsToWin)
        legPositions = [{
          playerId: winnerPlayer.id,
          position: winnerPlayer.position,
          legCount: legsToWin
        }];
        console.log('[357 WIN] Legs already reset, using reconstructed data:', legPositions);
      }
    }

    setCachedLegPositions(legPositions);
    cachedLegPositionsRef.current = legPositions;
    console.log('[357 WIN] Final cached leg positions:', legPositions);
    
    // Get winner's cards - but VERIFY they belong to current game by checking card count
    // 3-5-7 card counts: Round 1 = 3, Round 2 = 5, Round 3 = 7
    const expectedCardCountFromCurrentRound =
      game?.current_round === 1 ? 3 : game?.current_round === 2 ? 5 : 7;
    const winnerCardsData = playerCards.find(pc => pc.player_id === winnerPlayer.id);
    const rawWinnerCards = winnerCardsData?.cards || [];

    // IDENTITY-BOUND WINNER HAND CONTRACT.
    //
    // Show Cards is an explicit privacy action — the wrong cards must
    // never table on the felt. The captured snapshot's identity is
    // sourced from `playerCardsIdentity` (the immutable identity bound
    // to the currently-loaded `playerCards` fetch) — NOT from
    // `currentRound`, which may already have rotated to null during
    // terminal settlement. Using `currentRound` here would store
    // `roundId: null` in the expectation, and the resolver would then
    // permanently fail to match the winning round's real
    // `playerCardsIdentity.roundId`.
    //
    // The winner's row on `playerCards` is authoritative for its own
    // round — a fully-loaded 3-5-7 hand contains exactly 3, 5, or 7
    // cards. We treat any of those counts as a "complete" round hand.
    // Partial or empty rows leave the expectation pending; the
    // resolver below awaits an identity-matched fetch and populates
    // the snapshot then. Consent (`winner357ShowCards`) is untouched.
    const snapshotDealerGameId = playerCardsIdentity?.dealerGameId ?? null;
    const snapshotHandNumber = playerCardsIdentity?.handNumber ?? null;
    const snapshotRoundId = playerCardsIdentity?.roundId ?? null;

    const rawCount = rawWinnerCards.length;
    const rawCountIsCompleteHand = rawCount === 3 || rawCount === 5 || rawCount === 7;
    const canCaptureSnapshotNow = !!playerCardsIdentity && rawCountIsCompleteHand;

    const expectedCardCount = canCaptureSnapshotNow
      ? rawCount
      : expectedCardCountFromCurrentRound;

    const winnerCards: CardType[] = canCaptureSnapshotNow ? rawWinnerCards : [];

    setTerminal357WinnerHandExpectation({
      dealerGameId: snapshotDealerGameId,
      handNumber: snapshotHandNumber,
      roundId: snapshotRoundId,
      playerId: winnerPlayer.id,
      terminalResultIdentity: resultMessage,
      expectedCardCount,
    });

    if (rawCount > 0 && winnerCards.length === 0) {
      console.warn('[357 WIN] Winner cards rejected — awaiting identity-matched fetch', {
        expected: expectedCardCount,
        actual: rawCount,
        canCaptureSnapshotNow,
        snapshotDealerGameId,
        snapshotHandNumber,
        snapshotRoundId,
        playerCardsIdentity,
      });
    }



    // A. Sweep parser diagnostic — emits for every 357 win-detection pass.
    emit357RuntimeDiag('sweep_parser_entered', {
      gameId: game?.id ?? null,
      roundId: game?.current_round != null ? String(game.current_round) : null,
      viewerPlayerId: currentPlayer?.id ?? null,
      winnerPlayerId: winnerPlayer?.id ?? null,
      terminalResultIdentity: resultMessage,
    }, {
      rawResultMessage: resultMessage,
      matchedIsSweep: isSweepMessage,
      parsedWinnerName: winnerName || null,
      parsedAmount: sweepAmountFromSentinel,
      parseError: isSweepMessage && sweepAmountFromSentinel === null ? 'missing_or_malformed_amount' : null,
    });

    // B. Show-cards decision diagnostic.
    emit357RuntimeDiag('show_cards_decision', {
      gameId: game?.id ?? null,
      roundId: game?.current_round != null ? String(game.current_round) : null,
      viewerPlayerId: currentPlayer?.id ?? null,
      winnerPlayerId: winnerPlayer?.id ?? null,
      terminalResultIdentity: resultMessage,
    }, {
      expectedCardCount,
      rawWinnerCardCount: rawWinnerCards.length,
      cardsAcceptedForDisplay: winnerCards.length,
      staleContaminationRejected: rawWinnerCards.length > 0 && rawWinnerCards.length !== expectedCardCount,
      currentRound: game?.current_round ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
    });

    
    // Extract pot from message if available (format: "$X pot").
    // SWEEP: use the immutable pre-zero terminal awarded amount embedded in
    // the sentinel — never derive from games.pot after settlement.
    let potAmount = 0;
    if (isSweepMessage) {
      if (sweepAmountFromSentinel !== null) {
        potAmount = sweepAmountFromSentinel;
      } else {
        console.error('[357 WIN] Sweep missing immutable amount — refusing to default to $0 via games.pot');
        // Diagnostic-only fallback to cached max pot; still never games.pot (which is 0 post-settlement).
        potAmount = cachedPotFor357WinRef.current;
      }
    } else if (isGameWinMessage) {
      // Parse pot from message: "🏆 Player won the game with X legs! (+$Y: $Z pot + $W legs)"
      const potMatch = displayPart.match(/\$(\d+)\s*pot/);
      if (potMatch) {
        potAmount = parseInt(potMatch[1], 10);
      }
    }
    // Fallback to cached or live pot (use potForDisplay which never flashes to 0)
     if (potAmount === 0 && !isSweepMessage) {
       // Try round.pot first (usually persists longer), then cached max, then stable pot
       // CRITICAL: Scope by dealer_game_id + hand_number to prevent cross-contamination
       const dealerRounds357 = game?.current_game_uuid
         ? game?.rounds?.filter((r: any) => r.dealer_game_id === game.current_game_uuid)
         : game?.rounds;
       const matching357 = dealerRounds357?.filter((r: any) => r.round_number === game.current_round) ?? [];
       const liveRound = matching357.reduce<any>(
         (best: any, r: any) => (!best || (r.hand_number ?? 0) > (best.hand_number ?? 0) ? r : best),
         null
       );
       const liveRoundPot = liveRound?.pot || 0;
       potAmount = Math.max(liveRoundPot, cachedPotFor357WinRef.current, potForDisplay);
     }
    
    console.log('[357 WIN] Triggering win animation for:', winnerName, 'pot:', potAmount, 'messageType:', isGameWinMessage ? 'game_win' : 'leg_win');
    
    // Mark animation as active - this blocks GameOverCountdown and ante animations until animation completes
    setIs357WinAnimationActive(true);
    __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: true, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
    is357WinAnimationActiveRef.current = true;
    setThreeFiveSevenWinPotAmount(potAmount);
    setThreeFiveSevenWinnerId(winnerPlayer.id);
    setThreeFiveSevenWinnerCards(winnerCards);
    const _357trigger = `357-win-${Date.now()}`;
    setThreeFiveSevenWinTriggerId(_357trigger);

    // Slice 1 (inert): build the immutable normalized terminal descriptor
    // ALONGSIDE the bespoke instant-win path. The new controller consumes
    // this in Slice 3; today it is diagnostic-only.
    //
    // CORRECTED SLICE 1 RULES:
    //  - Instant-357 sweep eligibility for SweepTheLegsAnimation is
    //    governed by the IMMUTABLE Round 1 opening legs snapshot persisted
    //    on `rounds.three_five_seven_legs_at_start`. If that row is not
    //    yet available (transient realtime gap) the descriptor is left
    //    PENDING and this effect re-runs when `game?.rounds` changes.
    //    Only a definitively-null stored column (legacy pre-migration
    //    hand) is treated as "no legs at start".
    //  - Normal-win eligibility is ALWAYS true — the normal prelude
    //    settles the winning final leg before entering the shared path.
    //    We do NOT read Round 1 opening metadata for normal wins.
    //  - `proofCards` still requires exactly three authoritative cards
    //    on winnerId's playerCards row for instant-357. Empty → pending.
    //  - Descriptor is cleared ONLY on dealerGameId rotation (see
    //    cleanup effect further down).
    (() => {
      if (!game?.id) return;
      const gt = game?.game_type;
      const is357GameType = gt === '3-5-7' || gt === '3-5-7-game' || gt === '357';
      if (!is357GameType) return;

      // ---- Explicit source predicates (mutually exclusive) ----------
      const isInstant357Terminal =
        isSweepMessage
        && sweepAmountFromSentinel !== null
        && !!winnerPlayer;
      const isNormal357Terminal =
        !isInstant357Terminal
        && (isGameWinMessage || (isLegWinMessage && winnerPlayer.legs >= legsToWin));
      if (!isInstant357Terminal && !isNormal357Terminal) {
        return;
      }
      const source: 'normal-win' | 'instant-357' =
        isInstant357Terminal ? 'instant-357' : 'normal-win';

      // ---- Instant-357 only: locate the canonical Round 1 row and
      //      read the immutable legs-at-hand-start snapshot from
      //      `rounds.three_five_seven_legs_at_start`. -----------------
      let playersAtHandStart: Terminal357PlayerLegsSnapshot[] | undefined;
      let hadAuthoritativeLegs: boolean;

      if (isInstant357Terminal) {
        const dealerGameId = game.current_game_uuid ?? null;
        const handNumberForLookup =
          (currentRound?.hand_number ?? null) as number | null;
        const round1Row = (game?.rounds as any[] | undefined)?.find((r: any) =>
          r?.round_number === 1
          && r?.dealer_game_id === dealerGameId
          && (r?.hand_number ?? null) === handNumberForLookup
        );
        if (!round1Row) {
          emit357RuntimeDiag('sweep_parser_entered', {
            gameId: game.id,
            roundId: currentRound?.id ?? null,
            viewerPlayerId: currentPlayer?.id ?? null,
            winnerPlayerId: winnerPlayer.id,
            terminalResultIdentity: resultMessage,
          }, {
            diagnostic: '357.wartime.legs_at_start_missing',
            reason: 'round1_row_not_yet_available',
            dealerGameId,
            handNumber: handNumberForLookup,
          });
          return; // leave descriptor pending; re-run on rounds update
        }
        const storedSnapshot = (round1Row as any).three_five_seven_legs_at_start;
        if (storedSnapshot == null) {
          // Legacy pre-migration hand OR (transiently) not yet propagated
          // through realtime for this client. We can distinguish only by
          // the row's created_at vs. the migration timestamp; without
          // that ground truth we still fail-safe (skip sweep) but log
          // the incidence for post-hoc review.
          emit357RuntimeDiag('sweep_parser_entered', {
            gameId: game.id,
            roundId: currentRound?.id ?? null,
            viewerPlayerId: currentPlayer?.id ?? null,
            winnerPlayerId: winnerPlayer.id,
            terminalResultIdentity: resultMessage,
          }, {
            diagnostic: '357.wartime.legs_at_start_missing',
            reason: 'stored_snapshot_null',
            round1RowId: round1Row.id ?? null,
            round1CreatedAt: round1Row.created_at ?? null,
            dealerGameId,
            handNumber: handNumberForLookup,
          });
          playersAtHandStart = [];
          hadAuthoritativeLegs = false;
        } else if (Array.isArray(storedSnapshot)) {
          playersAtHandStart = (storedSnapshot as any[]).map((p) => ({
            playerId: String(p.player_id ?? p.playerId ?? ''),
            position: Number(p.position ?? 0),
            legs: Number(p.legs ?? 0),
          }));
          hadAuthoritativeLegs = playersAtHandStart.some(
            (p) => Number(p.legs ?? 0) > 0,
          );
        } else {
          // Corrupt shape — do not guess. Fail-safe skip + diagnostic.
          emit357RuntimeDiag('sweep_parser_entered', {
            gameId: game.id,
            roundId: currentRound?.id ?? null,
            viewerPlayerId: currentPlayer?.id ?? null,
            winnerPlayerId: winnerPlayer.id,
            terminalResultIdentity: resultMessage,
          }, {
            diagnostic: '357.wartime.legs_at_start_missing',
            reason: 'stored_snapshot_wrong_shape',
            snapshotTypeof: typeof storedSnapshot,
          });
          playersAtHandStart = [];
          hadAuthoritativeLegs = false;
        }
      } else {
        // Normal-win: eligibility is unconditional. Do NOT read the
        // Round 1 opening snapshot — it is stale by construction.
        hadAuthoritativeLegs = true;
        playersAtHandStart = undefined;
      }

      // ---- Authoritative proof cards (instant-357 only) -------------
      // Instant-357 is detected after terminal settlement, when
      // `games.current_round` can already be null. Therefore the proof
      // source must be the immutable terminal source shape itself: an
      // instant 3-5-7 winner has exactly three authoritative cards on
      // the winner's player_cards row. Do not reuse the generic
      // expectedCardCount derived from games.current_round here; that
      // value is for normal round display only and incorrectly becomes
      // 7 after settlement nulls the round.
      let proofCards: CardType[] | null = null;
      if (isInstant357Terminal) {
        const winnerRow = playerCards.find((pc) => pc.player_id === winnerPlayer.id);
        const raw = (winnerRow?.cards ?? []) as CardType[];
        const expectedInstantProofCardCount = 3;
        if (raw.length === expectedInstantProofCardCount) {
          proofCards = raw;
        } else {
          emit357RuntimeDiag('sweep_parser_entered', {
            gameId: game.id,
            roundId: game?.current_round != null ? String(game.current_round) : null,
            viewerPlayerId: currentPlayer?.id ?? null,
            winnerPlayerId: winnerPlayer.id,
            terminalResultIdentity: resultMessage,
          }, {
            diagnostic: 'terminal_descriptor_proof_cards_missing_nonblocking',
            expectedCardCount,
            expectedInstantProofCardCount,
            rawWinnerCardCount: raw.length,
            dealerGameId: game.current_game_uuid ?? null,
            handNumber: currentRound?.hand_number ?? null,
          });
          proofCards = null;
        }
      }

      const targetLegs = source === 'normal-win' ? legsToWin : null;
      const identityInput = {
        gameId: game.id,
        dealerGameId: game.current_game_uuid ?? null,
        roundId: currentRound?.id ?? null,
        handNumber: (currentRound?.hand_number ?? null) as number | null,
        handContextId: handContextKey ?? null,
        terminalResultIdentity: resultMessage,
      };
      const descriptor: Terminal357Descriptor = {
        ...identityInput,
        terminalGenerationId: buildTerminal357GenerationId(identityInput),
        source,
        winnerId: winnerPlayer.id,
        winnerName: winnerName || (winnerPlayer.profiles?.username ?? `Player ${winnerPlayer.position}`),
        winnerPosition: winnerPlayer.position,
        targetLegs,
        proofCards,
        playersAtHandStart,
        hadAuthoritativeLegs,
      };
      setTerminal357Descriptor(descriptor);
    })();
    // Win-presentation instrumentation was removed.
  }, [game?.game_type, game?.last_round_result, game?.pot, game?.legs_to_win, game?.rounds, game?.current_game_uuid, players, playerCards, threeFiveSevenWinTriggerId, terminal357Descriptor?.dealerGameId, terminal357Descriptor?.terminalResultIdentity]);
  
  // Identity-bound winner-hand resolver.
  //
  // Runs whenever `playerCards` or its bound identity changes. If a
  // terminal winner expectation is outstanding and NO winner cards are
  // yet tabled, this effect populates `threeFiveSevenWinnerCards` iff
  // the incoming player_cards row strictly matches ALL identity fields
  // AND the exact expected card count. Partial rows, prior-round rows,
  // and cross-dealer-game rows are hard-rejected (they don't advance
  // this effect). The winner's Show Cards consent latch remains set
  // while we wait — the felt stage simply cannot mount until the
  // identity-matched hand arrives.
  useEffect(() => {
    const exp = terminal357WinnerHandExpectation;
    if (!exp) return;
    if (threeFiveSevenWinnerCards.length === exp.expectedCardCount) return;
    if (!playerCardsIdentity) return;
    if (
      playerCardsIdentity.dealerGameId !== exp.dealerGameId ||
      playerCardsIdentity.handNumber !== exp.handNumber ||
      playerCardsIdentity.roundId !== exp.roundId
    ) {
      return;
    }
    const row = playerCards.find(pc => pc.player_id === exp.playerId);
    const cards = (row?.cards as CardType[] | undefined) ?? [];
    if (cards.length !== exp.expectedCardCount) return;
    setThreeFiveSevenWinnerCards(cards);
  }, [terminal357WinnerHandExpectation, playerCardsIdentity, playerCards, threeFiveSevenWinnerCards.length]);

  // Reset 3-5-7 win state when starting a new game or when game ends (to prepare for next game)
  useEffect(() => {
    // CRITICAL: Never clear 357 win state while the client-side win animation sequence is still playing.
    // If we clear early, MobileGameTable will unmount PotToPlayerAnimation mid-flight.
    if (is357WinAnimationActiveRef.current) {
      console.log('[357 WIN RESET] Deferring reset because win animation is still active', {
        status: game?.status,
        currentRound: game?.current_round,
      });
      return;
    }

    // Reset on new game start (round 1)
    if (game?.status === 'in_progress' && game?.current_round === 1) {
      console.log('[357 WIN RESET] Resetting win state for new game');
      threeFiveSevenWinProcessedRef.current = null;
      setThreeFiveSevenWinTriggerId(null);
      setThreeFiveSevenWinnerId(null);
      setThreeFiveSevenWinPotAmount(0);
      setThreeFiveSevenWinnerCards([]);
      setTerminal357WinnerHandExpectation(null);
      cachedPotFor357WinRef.current = 0;
      setCachedLegPositions([]);
      setIs357WinAnimationActive(false);
      __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
      is357WinAnimationActiveRef.current = false;
      // NOTE: terminal357Descriptor is NOT cleared here. See the
      // dealerGameId-rotation effect below for the correct cleanup
      // predicate — the old table surface can still be mounted during
      // `in_progress`/round-1 bootstrap of the next dealer game, and we
      // must keep the descriptor alive through pot/confetti/completion
      // of the outgoing terminal.
    }
    // Also reset when transitioning from game_over to dealer_selection (next game starting)
    if (game?.status === 'dealer_selection' || game?.status === 'configuring') {
      console.log('[357 WIN RESET] Resetting win state for dealer selection/configuring');
      threeFiveSevenWinProcessedRef.current = null;
      setThreeFiveSevenWinTriggerId(null);
      setThreeFiveSevenWinnerId(null);
      setThreeFiveSevenWinPotAmount(0);
      setThreeFiveSevenWinnerCards([]);
      setTerminal357WinnerHandExpectation(null);
      cachedPotFor357WinRef.current = 0;
      setCachedLegPositions([]);
      setIs357WinAnimationActive(false);
      __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
      is357WinAnimationActiveRef.current = false;
      // NOTE: terminal357Descriptor is NOT cleared here. Status alone is
      // not a safe erase signal — the old table surface can persist
      // through this transition. See the dedicated cleanup effect below.
    }
  }, [game?.status, game?.current_round, game?.current_game_uuid]);

  // Terminal descriptor cleanup — Slice 1 correction #4.
  // Clear the descriptor ONLY when the active dealerGameId rotates to a
  // DIFFERENT non-null value than the one the descriptor was built for.
  // A null current_game_uuid (between dealer games), a status transition,
  // or a current_round=null blip do NOT clear it — the old surface may
  // still be visually mounted and we must retain the announcement, proof
  // cards, hadAuthoritativeLegs, and winner identity through the last
  // rendered frame.
  useEffect(() => {
    if (!terminal357Descriptor) return;
    const activeDealerGameId = game?.current_game_uuid ?? null;
    const descriptorDealerGameId = terminal357Descriptor.dealerGameId;
    if (
      activeDealerGameId != null
      && descriptorDealerGameId != null
      && activeDealerGameId !== descriptorDealerGameId
    ) {
      console.log('[357 TERMINAL DESCRIPTOR] Cleared on dealerGameId rotation', {
        previous: descriptorDealerGameId,
        next: activeDealerGameId,
      });
      setTerminal357Descriptor(null);
    }
  }, [game?.current_game_uuid, terminal357Descriptor]);

  // Handle Holm win pot animation complete - delay 2 seconds then proceed to next game
  const handleHolmWinPotAnimationComplete = useCallback(async () => {
    // LAST HAND terminal path: the authoritative settlement already committed
    // `session_ended`, so there is no next game to proceed to. Release the
    // route-owned presentation hold (`holmTerminalPresentationDone`), which
    // lets the shared session-ended navigation effect resume. The trigger is
    // cleared in the same commit so the animation cannot re-arm.
    // No status write, no timer.
    if (game?.status === 'session_ended' && game?.game_type === 'holm-game') {
      recordHolmLifecycle('winpot.complete.terminal-release', {
        gameStatus: game?.status ?? null,
        lastRoundResult: game?.last_round_result ?? null,
      });
      if (holmWinPotPresentationKey) holmPresentedResultKeysRef.current.add(holmWinPotPresentationKey);
      // CANONICAL HOLM TERMINAL COMPLETION BOUNDARY (LAST HAND). Publish
      // the same stable identity used for presentation single-fire, so the
      // Session Ended phase can only follow a completed presentation of the
      // exact result that produced `session_ended`.
      liveTerminalPresentationObservedRef.current = true;
      markTerminalPresentationComplete(
        holmWinPotPresentationKey ?? `holm|winpot|${(game as any)?.current_game_uuid ?? 'no-dealer-game'}|${game?.total_hands ?? 'no-hand'}|${game?.last_round_result ?? 'no-result'}`,
      );

      setHolmTerminalPresentationDone(game?.last_round_result ?? 'holm-terminal-done');
      setHolmWinPotTriggerId(null);
      setHolmWinWinnerPositions([]);
      return;
    }
    // Guard: Only proceed if we're actually in game_over with a valid Holm win
    if (game?.status !== 'game_over' || game?.game_type !== 'holm-game') {
      recordHolmLifecycle('winpot.complete.ignored', {
        reason: 'not in game_over or not holm-game',
        gameStatus: game?.status ?? null,
        gameType: game?.game_type ?? null,
      });
      console.log('[HOLM WIN POT] Animation callback fired but game not in expected state, ignoring');
      return;
    }
    
    // Also verify there was actually a win (player beat Chucky)
    if (!game?.last_round_result?.includes('beat Chucky') || game?.last_round_result?.includes('Chucky beat')) {
      recordHolmLifecycle('winpot.complete.ignored', {
        reason: 'no valid beat-Chucky win in last_round_result',
        lastRoundResult: game?.last_round_result ?? null,
      });
      console.log('[HOLM WIN POT] Animation callback but no valid win result, ignoring');
      return;
    }
    
    recordHolmLifecycle('winpot.complete.start', {
      delayMs: 3000,
      lastRoundResult: game?.last_round_result ?? null,
      presentationKey: holmWinPotPresentationKey,
    });
    console.log('[HOLM WIN POT] Animation complete, waiting 3 seconds before proceeding');
    // ORDINARY ROLLOVER — presentation idempotency.
    // Mark this stable terminal-result identity consumed and retire the active
    // descriptor in the same commit. The authoritative result stays
    // observable through the whole `game_over` → next-dealer-game gap, so
    // without this the animation owner could be re-mounted (or re-admitted)
    // and replay the same pot/confetti sequence. Table retention is unaffected:
    // `isTerminalSlotPresentation` still holds via `game_over` / `game_over_at`.
    if (holmWinPotPresentationKey) holmPresentedResultKeysRef.current.add(holmWinPotPresentationKey);
    setHolmWinPotTriggerId(null);
    setHolmWinWinnerPositions([]);
    // Wait 3 seconds after animation to let players see the final state (tabled cards stay visible)
    await new Promise(resolve => setTimeout(resolve, 3000));

    
    recordHolmLifecycle('winpot.complete.proceed', {
      lastRoundResult: game?.last_round_result ?? null,
    });
    console.log('[HOLM WIN POT] Delay complete, proceeding to next game');
    await handleGameOverComplete();
  }, [game?.status, game?.game_type, game?.last_round_result, (game as any)?.current_game_uuid, game?.total_hands, handleGameOverComplete, holmWinPotPresentationKey, markTerminalPresentationComplete]);

  // Handle 3-5-7 win animation started - clear trigger to prevent remount re-trigger
  const handleThreeFiveSevenWinAnimationStarted = useCallback(() => {
    console.log('[357 WIN] Animation started, clearing trigger to prevent duplicate');
    setThreeFiveSevenWinTriggerId(null);
  }, [gameId, game, user?.id]);

  // Handle 3-5-7 win animation complete - proceed directly to next game after delay
  const handleThreeFiveSevenWinAnimationComplete = useCallback(async () => {
    const _gocIdentity357 = {
      gameId: gameId ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
      roundId: game?.current_round != null ? String(game.current_round) : null,
      handNumber: game?.total_hands ?? null,
      viewerPlayerId: user?.id ?? null,
      winnerPlayerId: threeFiveSevenWinnerId ?? null,
      animationId: threeFiveSevenWinTriggerId ?? null,
      lastRoundResult: game?.last_round_result ?? null,
      clientKnownStatus: game?.status ?? null,
      currentGameUuid: game?.current_game_uuid ?? null,
      currentRound: game?.current_round ?? null,
    };
    emit357GameOverCompleteDiag('entry', _gocIdentity357);
    __emitWartimeProgressionAt(__WARTIME_SRC.PROG_HANDLE357_WINCOMPLETE.id, {
      callback: 'handleThreeFiveSevenWinAnimationComplete',
      entry: 'entry',
      identity: {
        gameId: gameId ?? null,
        dealerGameId: game?.current_game_uuid ?? null,
        triggerId: threeFiveSevenWinTriggerId ?? null,
      },
      gameStatus: game?.status ?? null,
    });

    if (game?.game_type === 'holm-game' || !gameId) {
      emit357GameOverCompleteDiag('returned', {
        ..._gocIdentity357,
        returnSite: 'handleThreeFiveSevenWinAnimationComplete:preamble',
        returnReason: !gameId ? 'no-game-id' : 'holm-game',
      });
      __emitWartimeProgressionAt(__WARTIME_SRC.PROG_HANDLE357_WINCOMPLETE.id, {
        callback: 'handleThreeFiveSevenWinAnimationComplete',
        entry: 'return',
        reason: !gameId ? 'no-game-id' : 'holm-game',
        identity: {
          gameId: gameId ?? null,
          dealerGameId: game?.current_game_uuid ?? null,
          triggerId: threeFiveSevenWinTriggerId ?? null,
        },
        gameStatus: game?.status ?? null,
      });
      return;
    }


    // Always clear the active flag so countdowns / resets don't unmount animations mid-flight.
    setIs357WinAnimationActive(false);
    __emitWartimeRefWrite({ fieldName: 'is357WinAnimationActiveRef', sourceSiteId: __WARTIME_SRC.STATE_WIN_ANIM_ACTIVE.id, previous: is357WinAnimationActiveRef.current, next: false, identity: __wartimeGameIdentity, owner: __wartimeGameOwner });
    is357WinAnimationActiveRef.current = false;
    setThreeFiveSevenWinTriggerId(null);
    setThreeFiveSevenWinnerId(null);
    setThreeFiveSevenWinPotAmount(0);
    setThreeFiveSevenWinnerCards([]);
    setTerminal357WinnerHandExpectation(null);
    cachedPotFor357WinRef.current = 0;
    setCachedLegPositions([]);

    // CRITICAL: Fetch fresh game status from DB - React state may be stale
    const { data: freshGame, error: fetchError } = await supabase
      .from('games')
      .select('status, game_type, current_game_uuid, current_round, total_hands, game_over_at, last_round_result')
      .eq('id', gameId)
      .single();

    const _branchDecision =
      !fetchError && freshGame?.status && freshGame.status !== 'game_over'
        ? 'return_after_fetch_game_data'
        : 'continue_to_handle_game_over_complete';
    emit357GameOverCompleteDiag('status_refetch_result', {
      ..._gocIdentity357,
      returnedStatus: freshGame?.status ?? null,
      returnedCurrentGameUuid: freshGame?.current_game_uuid ?? null,
      returnedCurrentRound: freshGame?.current_round ?? null,
      returnedGameOverAt: freshGame?.game_over_at ?? null,
      returnedLastRoundResult: freshGame?.last_round_result ?? null,
      fetchErrorCode: (fetchError as any)?.code ?? null,
      fetchErrorMessage: (fetchError as any)?.message ?? null,
      fetchErrorDetails: (fetchError as any)?.details ?? null,
      fetchErrorHint: (fetchError as any)?.hint ?? null,
      branchDecision: _branchDecision,
      branchReason: fetchError
        ? 'fetch-error-fallthrough-to-owner'
        : freshGame?.status && freshGame.status !== 'game_over'
          ? `status-is-${freshGame.status}-not-game_over`
          : 'status-is-game_over-or-null',
    });

    if (!fetchError && freshGame?.status === 'session_ended') {
      // Reaching this callback proves this mount presented the live 3-5-7
      // terminal sequence through its canonical completion boundary.
      liveTerminalPresentationObservedRef.current = true;
      markTerminalPresentationComplete(
        `${freshGame.game_type}|winseq|${gameId}|${freshGame.current_game_uuid ?? 'no'}|${freshGame.total_hands ?? 'no'}`,
      );
      await fetchGameData();
      return;
    }

    if (!fetchError && freshGame?.status && freshGame.status !== 'game_over') {
      emit357GameOverCompleteDiag('returned', {
        ..._gocIdentity357,
        returnSite: 'handleThreeFiveSevenWinAnimationComplete:status_refetch',
        returnReason: `fresh-status-${freshGame.status}-not-game_over`,
        returnedStatus: freshGame.status,
      });
      await fetchGameData();
      return;
    }

    emit357GameOverCompleteDiag('owner_invoking', {
      ..._gocIdentity357,
      statusPassedIn: freshGame?.status ?? null,
      returnedCurrentGameUuid: freshGame?.current_game_uuid ?? null,
      returnedCurrentRound: freshGame?.current_round ?? null,
    });

    try {
      await handleGameOverComplete();
    } catch (e) {
      emit357GameOverCompleteDiag('returned', {
        ..._gocIdentity357,
        returnSite: 'handleThreeFiveSevenWinAnimationComplete:owner_threw',
        returnReason: 'handleGameOverComplete-threw',
        error: e,
      });
      emit357InstantWinTerminal('failed', {
        gameId: gameId ?? undefined,
        eventKind: 'cross_country_advance',
        error: e,
      });
      throw e;
    }
  }, [game?.status, game?.game_type, game?.current_game_uuid, game?.current_round, game?.total_hands, game?.last_round_result, gameId, handleGameOverComplete, fetchGameData, markTerminalPresentationComplete, user?.id, threeFiveSevenWinnerId, threeFiveSevenWinTriggerId]);


  // YAHTZEE game_over transition
  // Yahtzee handles its own win overlay/animation internally, then sets game to game_over.
  // After a brief delay, transition to next game.
  // IMPORTANT: Use a ref for handleGameOverComplete so the effect cleanup doesn't cancel
  // our timers when `game` object changes and causes handleGameOverComplete to get a new reference.
  const handleGameOverCompleteRef = useRef(handleGameOverComplete);
  handleGameOverCompleteRef.current = handleGameOverComplete;

  const handleYahtzeeTerminalPresentationComplete = useCallback((terminalIdentity: string) => {
    markTerminalPresentationComplete(terminalIdentity);
    const facts = terminalStatusFactsRef.current;
    if (facts.status !== 'game_over') return;

    // The animation callback is the ordinary-game continuation boundary.
    // Mark this result before invoking the shared owner so the fallback effect
    // cannot schedule a second transition in the same render.
    yahtzeeGameOverProcessedRef.current = facts.lastRoundResult || 'unknown';
    gameOverTransitionRef.current = false;
    void handleGameOverCompleteRef.current();
  }, [markTerminalPresentationComplete]);

  useEffect(() => {
    if (game?.game_type !== 'yahtzee' || game?.status !== 'game_over') {
      if (game?.status !== 'game_over') yahtzeeGameOverProcessedRef.current = null;
      return;
    }
    // Settlement is immediate, but connected clients keep the same table
    // through the real chip-animation completion boundary. The callback above
    // owns normal continuation; this effect is recovery-only while no local
    // presentation is active.
    if (terminalPresentationActive) return;
    const resultKey = game?.last_round_result || 'unknown';
    if (yahtzeeGameOverProcessedRef.current === resultKey) return;
    yahtzeeGameOverProcessedRef.current = resultKey;

    console.log('[YAHTZEE GAME OVER] Detected game_over, transitioning after delay. result:', resultKey);
    const timer = setTimeout(async () => {
      console.log('[YAHTZEE GAME OVER] Delay complete, calling handleGameOverComplete');
      gameOverTransitionRef.current = false;
      await handleGameOverCompleteRef.current();
    }, 2000);

    // The complete scheduled recovery function owns disconnected/stuck
    // fallback. Do not add a browser poll that can race exact-identity replay.
    return () => clearTimeout(timer);
  }, [game?.status, game?.game_type, game?.last_round_result, gameId, terminalPresentationActive]);


  // When high-card dealer selection finishes, transition to in_progress and create round 1
  const handleCribbageDealerSelectionComplete = useCallback(async (dealerPosition: number) => {
    if (!gameId) return;

    // ── HANDOFF TRACE #1 + #2: entry ──
    beginCribbageHandoffTrace(gameId, 'handleCribbageDealerSelectionComplete_entry');
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'handler_entry',
      userId: user?.id ?? null,
      context: {
        handler: 'handleCribbageDealerSelectionComplete',
        dealerPosition,
        gameStatus: game?.status,
        dealerGameId: game?.current_game_uuid ?? null,
        currentRoundId: currentRound?.id?.slice(0, 8) ?? null,
        dealerSelectionCardsLen: dealerSelectionCards.length,
        dealerSelectionCardIds: toDealerSelectionCardIds(dealerSelectionCards),
        isCribbageDealerSelection: game?.status === 'cribbage_dealer_selection',
        showAnteDialog,
      },
    });

    // CRITICAL: Only the host should advance the game.
    // If a non-host flips status early, it can unmount the host's dealer-selection component
    // and cancel the host timeout that should start round 1.
    // IMPORTANT: Host is NOT necessarily seat 1 (cribbage/bots can occupy seat 1).
    // Use the same host rule as the rest of Game.tsx: current_host if present, else earliest HUMAN player.
    const currentHost = (game as any)?.current_host as string | null | undefined;
    const hostPlayer = [...players]
      .filter((p) => !p.is_bot)
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())[0];
    const isHostUser = Boolean(user?.id && (currentHost ? currentHost === user.id : hostPlayer?.user_id === user.id));
    if (!isHostUser) {
      console.log('[CRIBBAGE] Non-host received dealer selection complete; ignoring');
      return;
    }
    
    console.log('[CRIBBAGE] Dealer selection complete, winner position:', dealerPosition);
    
    // Bug A fix: clear stale session-level dealer-selection visuals at the exact
    // handoff point where session-level high-card completes. This prevents the
    // one-frame flash of stale session cards when the dealer-game scope begins.
    recordWaitingLifecycle('dealerSelectionCards cleared', {
      source: 'cribbage-handoff-complete',
      callsite: 'src/pages/Game.tsx:~7959',
      dealerPosition,
      prevLength: dealerSelectionCards.length,
      gameId: gameId ?? null,
    });
    recordHighCardCardsClear({
      source: 'cribbage-handoff-complete',
      callsite: 'src/pages/Game.tsx:8126 handleCribbageDealerSelectionComplete',
      reason: 'session-level dealer-selection completed; clearing stale visuals at handoff',
      cardsLengthBeforeClear: dealerSelectionCards.length,
      cardsLengthAfterClear: 0,
      gameStatus: game?.status ?? null,
      winnerPosition: dealerPosition,
      dealerSelectionComplete: true,
      currentRoundId: currentRound?.id ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      gameId: gameId ?? null,
    });
    recordHighCardWriter({
      gameId: gameId ?? '',
      source: 'cribbage-complete-handoff',
      callsite: 'src/pages/Game.tsx:8232 handleCribbageDealerSelectionComplete setDealerSelectionCards([])',
      reason: 'cribbage dealer selection complete → host clears session-level cards before persisting dealer + creating round 1',
      previousLength: dealerSelectionCards.length,
      nextLength: 0,
      previousCardIds: dealerSelectionCards.map(c => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
      nextCardIds: [],
      renderPath: 'host',
      surfaceInstanceId: `Game.tsx:setDealerSelectionCards:${gameId ?? ''}`,
      winnerPosition: dealerPosition,
      isComplete: true,
      extra: { trigger: 'handleCribbageDealerSelectionComplete', dealerPosition },
    });
    setDealerSelectionCards([]);
    setDealerSelectionWinnerPosition(null);


    // ── HANDOFF TRACE #3: parent dealer-selection state cleared (handoff callback) ──
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'parent_ds_cleared',
      userId: user?.id ?? null,
      context: {
        trigger: 'handleCribbageDealerSelectionComplete',
        dealerPosition,
        gameStatus: game?.status,
      },
    });
    
    logDebugEvent({
      gameId: gameId!,
      eventType: 'crib:lifecycle:session_transition',
      payload: {
        transition: 'dealer_selection_complete',
        dealerPosition,
        prevStatus: game?.status,
        dealerGameId: game?.current_game_uuid ?? null,
        ...buildMetaPayload(),
      },
    });

    // The server atomically consumes its persisted dealer result, deals the
    // first hand, creates player_cards, and advances the game pointers.
    // ── HANDOFF TRACE #6: startCribbageRound entry ──
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'startCribbageRound_entry',
      userId: user?.id ?? null,
      context: { isFirstHand: false, gameStatus: game?.status },
    });
    const result = await startCribbageRound(gameId, false);
    // ── HANDOFF TRACE #6: startCribbageRound exit ──
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'startCribbageRound_exit',
      userId: user?.id ?? null,
      roundId: result.roundId ?? null,
      context: {
        success: result.success,
        roundId: result.roundId?.slice(0, 8) ?? null,
        handNumber: result.handNumber ?? null,
        error: result.error ?? null,
      },
    });
    if (!result.success) {
      console.error('[CRIBBAGE] Failed to start cribbage round after dealer selection:', result.error);
      return;
    }
    
    // ── HANDOFF TRACE #2: handler exit ──
    emitCribbageHandoffTrace({
      gameId,
      eventType: 'handler_exit',
      userId: user?.id ?? null,
      roundId: result.roundId ?? null,
      context: {
        handler: 'handleCribbageDealerSelectionComplete',
        success: true,
        roundId: result.roundId?.slice(0, 8) ?? null,
        handNumber: result.handNumber ?? null,
      },
    });

    // Trigger refetch to update UI
    fetchGameData();
  }, [gameId, game, players, user?.id, fetchGameData]);

  const handleAllAnteDecisionsIn = async () => {
    recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn entered', {
      file: 'src/pages/Game.tsx',
      function: 'handleAllAnteDecisionsIn',
      caller: 'bot ante effect / ante completion paths',
      gameId,
      status: game?.status ?? null,
      dealerGameId: game?.current_game_uuid ?? null,
    });
    if (!gameId) {
      recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn skipped', {
        file: 'src/pages/Game.tsx',
        function: 'handleAllAnteDecisionsIn',
        skipReason: 'no gameId',
      });
      anteProcessingRef.current = false;
      return;
    }
    
    // CRITICAL: Don't start round if game is paused
    if (game?.is_paused) {
      recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn skipped', {
        file: 'src/pages/Game.tsx',
        function: 'handleAllAnteDecisionsIn',
        skipReason: 'game is paused',
        gameId,
      });
      console.log('[ANTE] Game is paused, skipping ante processing');
      anteProcessingRef.current = false;
      return;
    }

    // CRITICAL: Fetch fresh game status AND game_type from DB to prevent race conditions in multiplayer.
    // React state can be stale, causing both clients to attempt ante processing or use wrong game type.
    // OPTIMIZATION: Run game + players fetches in parallel (previously serial — saved ~210ms on critical path).
    recordStartupFlight('FETCH TIMELINE', 'handleAllAnteDecisionsIn fresh game+players fetch start (parallel)', {
      file: 'src/pages/Game.tsx',
      function: 'handleAllAnteDecisionsIn',
      gameId,
    });
    const [gameRes, playersRes] = await Promise.all([
      supabase
        .from('games')
        .select('*, players(*)')
        .eq('id', gameId)
        .single(),
      supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId),
    ]);
    const { data: freshGame, error: gameError } = gameRes as any;
    const { data: freshPlayers, error: playersError } = playersRes as any;
    recordStartupFlight('FETCH TIMELINE', 'handleAllAnteDecisionsIn fresh game+players fetch complete (parallel)', {
      file: 'src/pages/Game.tsx',
      function: 'handleAllAnteDecisionsIn',
      gameId,
      oldValue: { status: game?.status ?? null, game_type: game?.game_type ?? null, current_game_uuid: game?.current_game_uuid ?? null },
      newValue: {
        status: freshGame?.status ?? null,
        game_type: freshGame?.game_type ?? null,
        current_game_uuid: freshGame?.current_game_uuid ?? null,
        total_hands: freshGame?.total_hands ?? null,
        playerCount: freshPlayers?.length ?? 0,
      },
      gameError: gameError?.message ?? null,
      playersError: playersError?.message ?? null,
    });

    if (gameError || !freshGame) {
      recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn exited', {
        file: 'src/pages/Game.tsx',
        function: 'handleAllAnteDecisionsIn',
        reason: 'fresh game fetch failed',
        gameId,
        error: gameError?.message ?? null,
      });
      console.log('[ANTE] Error fetching fresh game status:', gameError);
      anteProcessingRef.current = false;
      return;
    }

    // Prevent duplicate calls if already in progress (using FRESH DB data, not stale React state)
    if (freshGame.status === 'in_progress') {
      recordStartupFlight('EFFECT TIMELINE', 'handleAllAnteDecisionsIn skipped', {
        file: 'src/pages/Game.tsx',
        function: 'handleAllAnteDecisionsIn',
        skipReason: 'fresh status already in_progress',
        gameId,
      });
      console.log('[ANTE] Already in progress (fresh check), skipping');
      anteProcessingRef.current = false;
      return;
    }

    // Treat ante completion as the gin-startup T0 (the post-submit chain).
    if (freshGame.game_type === 'gin-rummy') {
      markGinSubmit(gameId);
    }
    console.log('[GIN_RUNTIME_TIMELINE] ante completion handler:start', {
      t: Date.now(),
      gameId,
      dealerGameId: game?.current_game_uuid ?? null,
      freshStatus: freshGame.status,
      freshGameType: freshGame.game_type,
    });

    if (playersError || !freshPlayers) {
      console.error('[ANTE] Error fetching players:', playersError);
      anteProcessingRef.current = false;
      return;
    }

    // Get players who anted up from FRESH database data
    const antedPlayers = freshPlayers.filter(p => p.ante_decision === 'ante_up');
    const sittingOutPlayers = freshPlayers.filter(p => p.ante_decision === 'sit_out' || p.sitting_out);
    recordStartupFlight('PHASE TIMELINE', 'handleAllAnteDecisionsIn ante cohort evaluated', {
      file: 'src/pages/Game.tsx',
      function: 'handleAllAnteDecisionsIn',
      oldValue: null,
      newValue: { antedPlayers: antedPlayers.length, sittingOutPlayers: sittingOutPlayers.length, totalPlayers: freshPlayers.length },
      antedPlayerIds: antedPlayers.map((p: any) => p.id),
      sittingOutPlayerIds: sittingOutPlayers.map((p: any) => p.id),
    });

    console.log('[ANTE] Anted players (from DB):', antedPlayers.length, 'Sitting out:', sittingOutPlayers.length, 'Total players:', freshPlayers.length);

    // BATCH: Handle sitting out players in parallel (fire-and-forget for non-critical counters)
    const sittingOutUpdates = sittingOutPlayers.map(player => {
      const newSittingOutHands = (player.sitting_out_hands || 0) + 1;
      // Sitting Out is not a delayed stand-up. Keep the counter for future
      // inactivity policy, but never forfeit a seat without an explicit
      // Stand Up or Leave action.
      return supabase.from('players').update({ sitting_out_hands: newSittingOutHands }).eq('id', player.id);
    });
    
    // BATCH: Reset sitting_out_hands for anted players (only those with > 0)
    const playersToReset = antedPlayers.filter(p => p.sitting_out_hands > 0).map(p => p.id);
    const resetPromise = playersToReset.length > 0 
      ? supabase.from('players').update({ sitting_out_hands: 0 }).in('id', playersToReset)
      : Promise.resolve();
    
    // Execute all in parallel - don't await, fire-and-forget for counter updates
    void Promise.all([...sittingOutUpdates, resetPromise]).catch(err => 
      console.error('[ANTE] Non-critical sitting out update error:', err)
    );

    // Check if we have enough active players (need at least 2)
    if (antedPlayers.length < 2) {
      console.log('[ANTE] Not enough players to play this hand:', antedPlayers.length);
      
      // Set a message to display
      await supabase
        .from('games')
        .update({ 
          last_round_result: 'Not enough players to play this hand',
          status: 'game_over'
        })
        .eq('id', gameId);
      
      // Immediately trigger game over flow — outcome is already known, no
      // need for an artificial UX pause (was 3s, caused "Awaiting ante
      // decisions" to linger after the only remaining decision resolved).
      setTimeout(async () => {

        // Re-fetch fresh players to evaluate states
        const { data: latestPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        if (latestPlayers) {
          // Evaluate player states and determine if session should end or continue
          const { activePlayerCount, activeHumanCount, eligibleDealerCount } = await evaluatePlayerStatesEndOfGame(gameId);

          console.log('[ANTE] After evaluation - Active players:', activePlayerCount, 'Active humans:', activeHumanCount, 'Eligible dealers:', eligibleDealerCount);

          // SESSION HYGIENE: sanitize automation + clear dealer-game transient
          // session state for ALL players before branching.
          await sanitizePlayerAutomationStateForSession(gameId);
          await clearDealerGameTransientSessionState(gameId);

          // Zero active humans closes a settled real-money session through the
          // database; one active human follows the existing waiting path.
          if (activeHumanCount < 1) {
            if (game?.real_money) {
              const outcome = await resolvePostgameParticipation(gameId);
              console.log('[ANTE] Postgame participation outcome:', outcome);
            } else {
              await supabase
                .from('games')
                .update({
                  status: 'game_over',
                  pending_session_end: true,
                  session_ended_at: new Date().toISOString(),
                })
                .eq('id', gameId);
            }
            anteProcessingRef.current = false;
            fetchGameData();
            return;
          }
          
          // Priority 2: Need at least 1 eligible dealer AND 2+ active players to continue
          if (eligibleDealerCount >= 1 && activePlayerCount >= 2) {
            // Rotate dealer and start new game selection
            const currentDealerPos = game?.dealer_position || 1;
            const newDealerPos = await rotateDealerPosition(gameId, currentDealerPos);
            const setupSeconds = Math.max(1, game?.game_setup_timer_seconds ?? 30);
            const configDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();
            // Topology normalization at the next-dealer-game bootstrap boundary.
            recordNormalizationDbg({ kind: 'call-site', caller: 'ante→game_selection', didInvokeNormalizer: true, statusTransition: 'game_over/ante→game_selection' });
            try { await normalizeTwoPlayerSeatsIfNeeded(gameId, 'ante→game_selection'); }
            catch (e) { console.error('[ANTE → game_selection] normalize threw:', e); }
            await supabase
              .from('games')
              .update({ 
                status: 'game_selection',
                config_complete: false,
                config_deadline: configDeadline,
                last_round_result: null,
                awaiting_next_round: false,
                dealer_position: newDealerPos,
              })
              .eq('id', gameId);
          } else {
            // Revert to waiting status; passive sit-outs remain seated (no status='left').
            console.log('[ANTE] Not enough players - reverting to waiting');

            await supabase
              .from('games')
              .update({ 
                status: 'waiting',
                awaiting_next_round: false,
                last_round_result: null
              })
              .eq('id', gameId);
          }
        }
        
        anteProcessingRef.current = false;
        fetchGameData();
      }, 3000);
      
      return;
    }

    console.log('[ANTE] Starting first round through its authoritative owner');

    // Start first round - let the round start functions handle the status change
    try {
          // CRITICAL: Use freshGame (from DB) for game_type, not stale React state!
          // After transitioning from 3-5-7 to Holm, React state may still have old game_type
          const isHolmGame = freshGame?.game_type === 'holm-game' || freshGame?.game_type === 'holm';
          const isHorsesGame = freshGame?.game_type === 'horses' || freshGame?.game_type === 'ship-captain-crew';
          const isYahtzeeGame = freshGame?.game_type === 'yahtzee';
          const isCribbageGame = freshGame?.game_type === 'cribbage';

          // Capture PRE-ante chips and trigger animation IMMEDIATELY (before DB ops).
          const activePlayersBefore = players.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left');
          const perPlayerAmount = typeof freshGame?.ante_amount === 'number' ? freshGame.ante_amount : 0;

          // Skip ante animation for cribbage and yahtzee - they don't use the chip animation pattern
          if (!isCribbageGame && !isYahtzeeGame && perPlayerAmount > 0 && activePlayersBefore.length > 0) {
            const preChipsSnapshot: Record<string, number> = {};
            const expectedChips: Record<string, number> = {};
            activePlayersBefore.forEach(p => {
              preChipsSnapshot[p.id] = p.chips;
              expectedChips[p.id] = p.chips - perPlayerAmount;
            });
            const expectedPot = perPlayerAmount * activePlayersBefore.length;

            setPreAnteChips(preChipsSnapshot);
            setExpectedPostAnteChips(expectedChips);
            setAnteAnimationExpectedPot(expectedPot);

            // Identity-scoped guard: tie the key to the authoritative dealer-game UUID,
            // NOT to derived chip/pot values. expectedPot depends on freshGame.ante_amount *
            // players.filter(...) — the latter reads React state, which can race realtime
            // during inter-game transitions (e.g. Gin → Holm). If the cohort changes between
            // an early-returned first call and a second call, expectedPot would differ,
            // producing a different triggerKey and bypassing the dedup guard. Using
            // current_game_uuid makes the guard stable across any cohort/pot drift within
            // the same dealer game's first ante.
            const dealerGameKey = freshGame?.current_game_uuid ?? `nodgid-${expectedPot}`;
            const triggerKey = `${isHolmGame ? 'holm' : isHorsesGame ? 'horses' : '357'}-first-ante-${dealerGameKey}`;
            if (anteAnimationFiredRef.current !== triggerKey) {
              anteAnimationFiredRef.current = triggerKey;
              setAnteAnimationTriggerId(`ante-${Date.now()}`);
            }
          }

          // Now start the round (animation already triggered above)
          if (isHolmGame) {
            // Every client may safely request the same start. PostgreSQL locks
            // the game row and returns the existing first round to replays.
            await startHolmInitialHand(gameId);
          } else if (isHorsesGame) {
            // isHorsesGame now includes ship-captain-crew - use freshGame for type check
            const firstHandCallerContext = {
              caller: 'Game.tsx:ante-decision-complete',
              reason: 'first-hand-after-ante',
              trigger: 'all ante decisions in / proceeding to first round',
              prevDealerGameId: (freshGame as any)?.current_game_uuid ?? null,
              prevAwaitingNextRound: (freshGame as any)?.awaiting_next_round ?? null,
              prevAnteDecisionDeadline: (freshGame as any)?.ante_decision_deadline ?? null,
              extra: {
                freshGameStatus: (freshGame as any)?.status,
                freshIsFirstHand: (freshGame as any)?.is_first_hand,
                activePlayerCount: activePlayersBefore.length,
              },
            };
            if (freshGame?.game_type === 'ship-captain-crew') {
              await startSCCRound(gameId, true, firstHandCallerContext);
            } else {
              await startHorsesRound(gameId, true, firstHandCallerContext);
            }
          } else if (isYahtzeeGame) {
            console.log('[ANTE][YAHTZEE] Starting yahtzee round');
            await startYahtzeeRound(gameId!, true);
            await fetchGameData();
          } else if (isCribbageGame) {
            // Cribbage: transition to dealer selection phase (high-card animation)
            // The round will be created after dealer selection completes
            console.log('[ANTE][CRIBBAGE] Transitioning to cribbage_dealer_selection');
            // ── HANDOFF TRACE: ante → cribbage_dealer_selection transition ──
            emitCribbageHandoffTrace({
              gameId: gameId!,
              eventType: 'ante_to_crib_dealer_selection',
              userId: user?.id ?? null,
              context: {
                prevStatus: freshGame?.status,
                dealerGameId: game?.current_game_uuid ?? null,
                dealerSelectionCardsLen: dealerSelectionCards.length,
              },
            });
            // ── STALE-CARD FIX: clear session-level dealer-selection visuals ──
            // Proven by handoff trace: these persist from the session high-card
            // draw and leak into the dealer-game's HighCardDealerSelection as
            // stale props if not cleared here.
            recordWaitingLifecycle('dealerSelectionCards cleared', {
              source: 'all-ante-decisions-in (cribbage entry)',
              callsite: 'src/pages/Game.tsx:~8395',
              prevLength: dealerSelectionCards.length,
              gameId: gameId ?? null,
            });
            recordHighCardCardsClear({
              source: 'all-ante-decisions-in',
              callsite: 'src/pages/Game.tsx:8568 ante→cribbage_dealer_selection',
              reason: 'clearing session-level dealer-selection visuals before entering dealer-game scope',
              cardsLengthBeforeClear: dealerSelectionCards.length,
              cardsLengthAfterClear: 0,
              gameStatus: freshGame?.status ?? null,
              winnerPosition: dealerSelectionWinnerPosition ?? null,
              dealerSelectionComplete: null,
              currentRoundId: currentRound?.id ?? null,
              dealerGameId: (game as any)?.current_game_uuid ?? null,
              gameId: gameId ?? null,
            });
            recordHighCardWriter({
              gameId: gameId ?? '',
              source: 'ante-to-cribbage-transition',
              callsite: 'src/pages/Game.tsx:8689 handleAllAnteDecisionsIn setDealerSelectionCards([])',
              reason: 'ante decisions complete → clearing session-level dealer-selection visuals before entering dealer-game scope',
              previousLength: dealerSelectionCards.length,
              nextLength: 0,
              previousCardIds: dealerSelectionCards.map(c => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`),
              nextCardIds: [],
              renderPath: 'host',
              surfaceInstanceId: `Game.tsx:setDealerSelectionCards:${gameId ?? ''}`,
              winnerPosition: dealerSelectionWinnerPosition ?? null,
              isComplete: null,
              extra: { trigger: 'handleAllAnteDecisionsIn', freshGameStatus: freshGame?.status ?? null },
            });
            setDealerSelectionCards([]);
            setDealerSelectionWinnerPosition(null);

            // Topology normalization at the next-dealer-game bootstrap boundary.
            recordNormalizationDbg({ kind: 'call-site', caller: 'ante→cribbage_dealer_selection', didInvokeNormalizer: true, statusTransition: 'ante_decision→cribbage_dealer_selection' });
            try { await normalizeTwoPlayerSeatsIfNeeded(gameId, 'ante→cribbage_dealer_selection'); }
            catch (e) { console.error('[ANTE → cribbage_dealer_selection] normalize threw:', e); }
            // PostgreSQL commits the status and dealer result together. Fetch
            // the committed row explicitly so the initiating client does not
            // depend on receiving its own realtime event to mount the draw.
            await beginCribbageDealerSelection(gameId!);
            await fetchGameData();
          } else if (freshGame?.game_type === 'gin-rummy') {
            // Gin Rummy: go straight to in_progress and start the round
            recordStartupFlight('EFFECT TIMELINE', 'startGinRummyRound call issued', {
              file: 'src/pages/Game.tsx',
              function: 'handleAllAnteDecisionsIn',
              caller: 'all ante decisions in',
              gameId,
              dealerGameId: game?.current_game_uuid ?? null,
            });
            console.log('[GIN_RUNTIME_TIMELINE] gin state bootstrap:start', {
              t: Date.now(),
              gameId,
              dealerGameId: game?.current_game_uuid ?? null,
            });
            ginTrace('startGinRummyRound:entered', {
              dealerGameId: game?.current_game_uuid ?? null,
            });
            // OPTIMIZATION: Pass already-fetched game (with players) so startGinRummyRound
            // does not re-fetch the same row, and assume first hand of dealer_game (total_hands===0)
            // to skip the existing-rounds precheck. Unique-constraint guard on insert preserves safety.
            const preloadedGameForGin = {
              ...freshGame,
              players: freshPlayers, // freshGame already includes .players, but freshPlayers is authoritative
            };
            const ginStartResult = await startGinRummyRound(gameId!, {
              game: preloadedGameForGin,
              assumeFirstHand: (freshGame?.total_hands ?? 0) === 0,
            });
            recordStartupFlight('EFFECT TIMELINE', 'startGinRummyRound returned', {
              file: 'src/pages/Game.tsx',
              function: 'handleAllAnteDecisionsIn',
              caller: 'all ante decisions in',
              gameId,
              oldValue: null,
              newValue: { success: ginStartResult.success, roundId: ginStartResult.roundId, handNumber: ginStartResult.handNumber, hasRound: !!ginStartResult.round, error: ginStartResult.error ?? null },
            });
            ginTrace('startGinRummyRound:returned', {
              success: ginStartResult.success,
              roundId: ginStartResult.roundId?.slice(0, 8) ?? null,
              handNumber: ginStartResult.handNumber ?? null,
            });
            console.log('[GIN_RUNTIME_TIMELINE] gin state bootstrap:complete', {
              t: Date.now(),
              gameId,
              dealerGameId: game?.current_game_uuid ?? null,
              roundId: ginStartResult.roundId?.slice(0, 8) ?? null,
              handNumber: ginStartResult.handNumber ?? null,
              success: ginStartResult.success,
              error: ginStartResult.error ?? null,
            });

            // Seed only the exact round identity into Game state so the initiating
            // client mounts without waiting for its own Realtime event. Gin gameplay
            // presentation separately refetches its caller-specific private projection;
            // the generic rounds row may later contain only the public masked document.
            if (ginStartResult.success && ginStartResult.round) {
              const insertedRound = ginStartResult.round as any;
              const insertedHand = ginStartResult.handNumber ?? insertedRound.hand_number ?? 1;
              recordStartupFlight('SYNC TIMELINE', 'optimistic round seed dispatched', {
                file: 'src/pages/Game.tsx',
                function: 'handleAllAnteDecisionsIn',
                roundId: insertedRound.id,
                handNumber: insertedHand,
                dealerGameId: insertedRound.dealer_game_id ?? null,
              });
              // Arm the regression guard so any stale fetch landing after this
              // seed cannot reset status back to ante_decision / drop currentRound.
              if (insertedRound.dealer_game_id && insertedRound.id) {
                ginOptimisticSeedRef.current = {
                  dealerGameId: insertedRound.dealer_game_id,
                  roundId: insertedRound.id,
                  handNumber: insertedHand,
                  seededAt: Date.now(),
                };
              }
              setGame((prev) => {
                if (!prev) return prev;
                const rounds = prev.rounds ?? [];
                const idx = rounds.findIndex((r: any) => r.id === insertedRound.id);
                const nextRounds = idx === -1
                  ? [...rounds, insertedRound]
                  : (() => { const arr = [...rounds]; arr[idx] = { ...arr[idx], ...insertedRound }; return arr; })();
                return {
                  ...prev,
                  status: 'in_progress',
                  current_round: 1,
                  total_hands: insertedHand,
                  is_first_hand: insertedHand === 1,
                  rounds: nextRounds,
                };
              });
            }
            // Canonical sync: Realtime announces the row/status identity only;
            // GinRummyGameTable reads cards through gin_rummy_get_state.

          } else {
            // ── SINGLE-OWNER PREFLIGHT ──────────────────────────
            // Preflight is a READ-ONLY check performed BEFORE any
            // mutation. `startRound` no longer contains a second gate.
            // If preflight fails → leave status='ante_decision',
            // persist a visible failure event, admin-only toast, return.
            // If preflight passes (or is inapplicable) → execute the
            // ORIGINAL canonical production ordering unchanged:
            //   games.status='in_progress'  →  startRound(gameId, 1)
            let preflightBlocked:
              | { reason: string; reasons: string[]; snapshot: any }
              | null = null;
            try {
              const harnessId = await readDebugHarness('3-5-7');
              if (harnessId === 'instant_win') {
                const pf = isTargetedWartimePreflightReadyForHarness({
                  gameId,
                  dealerGameId: game?.current_game_uuid ?? null,
                });
                if (!pf.preflightReady) {
                  preflightBlocked = {
                    reason: 'preflight_not_ready',
                    reasons: pf.snapshot?.reasons ?? [],
                    snapshot: pf.snapshot,
                  };
                }
              }
            } catch (err: any) {
              preflightBlocked = {
                reason: 'harness_preflight_error',
                reasons: [err?.message ?? 'unknown'],
                snapshot: null,
              };
            }
            if (preflightBlocked) {
              const missingSites: any[] = Array.isArray(
                preflightBlocked.snapshot?.targetedSitesMissing,
              )
                ? preflightBlocked.snapshot.targetedSitesMissing
                : [];
              await supabase.from('debug_events').insert({
                event_type: '357.wartime.harness_preflight_blocked_visible',
                game_id: gameId,
                payload: {
                  reason: preflightBlocked.reason,
                  reasons: preflightBlocked.reasons,
                  targetedSitesMissingCount: missingSites.length,
                  targetedSitesMissing: missingSites.slice(0, 20),
                  sessionId: preflightBlocked.snapshot?.sessionId ?? null,
                  buildSha: preflightBlocked.snapshot?.buildSha ?? null,
                  bundleFilename:
                    preflightBlocked.snapshot?.bundleFilename ?? null,
                  dealerGameId: game?.current_game_uuid ?? null,
                } as any,
              } as never);
              if (isSuperuser) {
                toast({
                  title: '3-5-7 wartime preflight failed — round not started',
                  description:
                    `reason=${preflightBlocked.reason}` +
                    (preflightBlocked.reasons.length
                      ? ` · failed=${preflightBlocked.reasons.join(',')}`
                      : '') +
                    (missingSites.length
                      ? ` · missingSites=${missingSites.length}`
                      : ''),
                  variant: 'destructive',
                });
              }
              anteProcessingRef.current = false;
              return;
            }
            // The bootstrap RPC owns the status transition, ante transfer,
            // opening deal, exact round identity, and any instant settlement.
            // ── H1R3 → H2R1 targeted trace: advancement request.
            try {
              void (async () => {
                const mod = await import('@/lib/threeFiveSeven/wartime/h1r3ToH2r1');
                const sites = await import('@/lib/threeFiveSeven/wartime/sourceSites');
                mod.emitH1r3ToH2r1({
                  eventName: 'h1r3_to_h2.advance_requested',
                  sourceSiteId: sites.SRC.H1R3_ADVANCE_REQUESTED.id,
                  identity: {
                    gameId, dealerGameId: (game as any)?.current_game_uuid ?? null,
                    handNumber: ((game as any)?.total_hands ?? 0),
                    roundNumber: (game as any)?.current_round ?? null,
                    currentGameUuid: (game as any)?.current_game_uuid ?? null,
                  },
                  payload: {
                    callerAnchor: 'Game.handleAllAnteDecisionsIn.startRound(1)',
                    previousRoundIdentity: {
                      handNumber: (game as any)?.total_hands ?? null,
                      roundNumber: (game as any)?.current_round ?? null,
                    },
                    proposedNextHandNumber: ((game as any)?.total_hands ?? 0) + 1,
                    proposedNextRoundNumber: 1,
                    currentGameStatus: (game as any)?.status ?? null,
                    awaitingNextRound: (game as any)?.awaiting_next_round ?? null,
                  },
                  forceEmit: true,
                });
              })();
            } catch { /* fire-and-forget */ }
            const bootstrapResult = await startRound(gameId, 1) as any;
            const committedRound = bootstrapResult?.round;
            const committedGame = bootstrapResult?.game;
            const committedRoundOnePresentation =
              parseThreeFiveSevenRolloverAdvanceResult(gameId, bootstrapResult);
            if (!committedRoundOnePresentation) {
              throw new Error('3-5-7 bootstrap omitted its exact committed presentation cursor');
            }
            setDirectThreeFiveSevenRolloverPresentation(committedRoundOnePresentation);
            if (committedRound?.id) {
              setGame((prev) => {
                if (!prev) return prev;
                const rounds = prev.rounds ?? [];
                const index = rounds.findIndex((row: any) => row.id === committedRound.id);
                const nextRounds = index < 0
                  ? [...rounds, committedRound]
                  : rounds.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, ...committedRound } : row);
                return {
                  ...prev,
                  ...(committedGame ?? {}),
                  rounds: nextRounds,
                };
              });
            }
            await fetchGameData('manual');
          }

      // CRITICAL: Reset processing ref AFTER successful round start
      // Without this, future ante processing in the same session would be blocked!
      anteProcessingRef.current = false;
    } catch (error: any) {
      console.error('[ANTE] Error starting round:', error);
      // The RPC is atomic: a failure leaves ante_decision unchanged and must
      // be surfaced, never "repaired" by a browser-authored lifecycle write.
      anteProcessingRef.current = false;
    }
  };

  const leaveGame = () => {
    navigate("/");
  };

  const addChips = async (amount: number = 100) => {
    if (!gameId || !user) return;

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    // Use atomic increment to prevent race conditions
    const { error } = await supabase.rpc('increment_player_chips', {
      p_player_id: currentPlayer.id,
      p_amount: amount,
    });

    if (error) {
      console.error('Failed to add chips:', error);
      return;
    }
  };

  // ─── Deferred auto-roll-off latch ───────────────────────────────────
  // When a player unchecks auto-roll during a bot-owned timed-out turn,
  // we defer the auto_fold=false write until the turn advances.
  // Key format: "roundId:playerId"
  const deferredAutoRollOffRef = useRef<string | null>(null);
  const [pendingAutoRollOff, setPendingAutoRollOff] = useState(false);

  // Detect turn advance (currentTurnPlayerId changes) → apply deferred write
  const prevTurnPlayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    const horsesState = currentRound?.horses_state as HorsesStateFromDB | null;
    const curTurnId = horsesState?.currentTurnPlayerId ?? null;

    if (prevTurnPlayerIdRef.current !== null && curTurnId !== prevTurnPlayerIdRef.current) {
      // Turn advanced — apply deferred auto-roll-off if set
      if (deferredAutoRollOffRef.current && currentPlayer) {
        const [, deferredPlayerId] = deferredAutoRollOffRef.current.split(':');
        if (deferredPlayerId === currentPlayer.id) {
          console.log('[AUTO_FOLD] Turn advanced — applying deferred auto_fold=false for player:', deferredPlayerId);
          supabase
            .from('players')
            .update({ auto_fold: false })
            .eq('id', deferredPlayerId)
            .then(({ error }) => {
              if (error) console.error('[AUTO_FOLD] Deferred write failed:', error);
            });
        }
        deferredAutoRollOffRef.current = null;
        setPendingAutoRollOff(false);
      }
    }
    prevTurnPlayerIdRef.current = curTurnId;
  }, [(currentRound?.horses_state as HorsesStateFromDB | null)?.currentTurnPlayerId]);

  // Handle auto_fold toggle - player can disable their auto_fold status
  // When opting back in (auto_fold=false), also extend the turn deadline so the
  // enforce-deadlines edge function doesn't immediately re-set auto_fold=true.
  const handleAutoFoldChange = async (playerId: string, autoFold: boolean) => {
    console.log('[AUTO_FOLD] Changing auto_fold for player:', playerId, 'to:', autoFold);

    // ─── Deferred-off guard for Horses/SCC ───────────────────────────
    // If this player IS the current turn player in an active Horses/SCC turn,
    // defer the write so the bot loop keeps ownership and completes the turn.
    if (!autoFold && currentRound?.id && game?.game_type && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew')) {
      const horsesState = currentRound?.horses_state as HorsesStateFromDB | null;
      if (horsesState?.currentTurnPlayerId === playerId && horsesState?.gamePhase === 'playing') {
        console.log('[AUTO_FOLD] Deferring auto_fold=false — bot owns current turn. Will apply after turn advances.');
        deferredAutoRollOffRef.current = `${currentRound.id}:${playerId}`;
        setPendingAutoRollOff(true);

        // Clear sit_out_next_hand immediately so the player stays in next hand
        await supabase
          .from('players')
          .update({ sit_out_next_hand: false })
          .eq('id', playerId);

        return; // Do NOT write auto_fold=false yet
      }
    }

    // Opt-back-in (auto_fold=false) is an explicit rejoin gesture and must
    // cancel any pending sit-out / stand-up intent set by a prior timeout.
    // Without this, a player who timed out (sit_out_next_hand=true), then
    // opts back in and plays the rest of the dealer game, will still be
    // converted to sitting_out at the dealer-game boundary by
    // evaluatePlayerStatesEndOfGame.
    const autoFoldUpdate: Record<string, any> = { auto_fold: autoFold };
    if (!autoFold) {
      autoFoldUpdate.sit_out_next_hand = false;
      autoFoldUpdate.stand_up_next_hand = false;
    }
    const { error } = await supabase
      .from('players')
      .update(autoFoldUpdate)
      .eq('id', playerId);
    
    if (error) {
      console.error('[AUTO_FOLD] Error updating auto_fold:', error);
      return;
    }

    // When player opts back in, extend the turn deadline so they have time to act
    // before the deadline enforcer re-triggers auto_fold.
    if (!autoFold && currentRound?.id && game?.game_type && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew')) {
      const horsesState = currentRound?.horses_state as any;
      if (horsesState) {
        const extendedDeadline = new Date(Date.now() + (decisionTimerRef.current || 30) * 1000).toISOString();
        await supabase
          .from('rounds')
          .update({
            horses_state: {
              ...horsesState,
              turnDeadline: extendedDeadline,
            },
          })
          .eq('id', currentRound.id);
        console.log('[AUTO_FOLD] Extended turn deadline after opt-back-in:', extendedDeadline);
      }
    }
  };

  const handleStay = async (traceSource: 'live stay' | 'pre-stay execute' = 'live stay') => {
    if (!gameId || !user) return;

    if (is357GameType && (game?.status === 'game_over' || currentRound == null)) {
      console.warn('[PLAYER DECISION] reject Stay — 3-5-7 terminal/missing round boundary', {
        status: game.status,
        currentRoundId: currentRound?.id ?? null,
      });
      return;
    }

    // Authoritative-hand suppression: local viewer already holds a
    // length-3 3-5-7 hand → terminal presentation is imminent, reject.
    if (is357GameType) {
      const selfPlayer = players.find((p) => p.user_id === user.id) ?? null;
      const selfCardsRow = selfPlayer ? playerCards.find((pc) => pc.player_id === selfPlayer.id) : null;
      const selfCards = (selfCardsRow?.cards ?? []) as CardType[];
      if (Array.isArray(selfCards) && selfCards.length === 3 && has357Hand(selfCards)) {
        console.warn('[PLAYER DECISION] reject Stay — 3-5-7 authoritative hand held');
        return;
      }
    }


    // P0 fix B: Holm decision actionability requires deal readiness.
    if (game?.game_type === 'holm-game' && !isHolmHandReady(handContextKey)) {
      console.warn('[PLAYER DECISION] reject Stay — Holm deal not ready');
      const currentPlayer = players.find(p => p.user_id === user.id) ?? null;
      const fromPre = traceSource === 'pre-stay execute';
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'stay',
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'holm-deal-not-ready', preserveArm: fromPre },
      });
      if (fromPre) {
        // Transient — release consume latch so a later tick can retry this same arrival.
        holmPreDecisionConsumingRef.current = false;
      } else {
        holmPreDecisionArmedRef.current = null;
        holmPreDecisionConsumingRef.current = false;
        setHolmPreFold(false);
        setHolmPreStay(false);
      }
      return;
    }

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) {
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: null,
        decision: 'stay',
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'current-player-not-found' },
      });
      return;
    }

    // Optimistic UI update - show indicator immediately
    setPendingDecision('stay');

    console.log('[PLAYER DECISION] Player staying:', {
      playerId: currentPlayer.id,
      position: currentPlayer.position,
      gameType: game?.game_type
    });

    try {
      if (game?.game_type === 'holm-game' && !currentRound?.id) {
        throw new Error('Holm Stay requires an active round');
      }
      const decisionResult = await makeDecision(gameId, currentPlayer.id, 'stay', (game?.game_type === 'holm-game' || is357GameType) ? currentRound!.id : undefined);
      if (is357GameType) {
        const allFoldPresentation = parseThreeFiveSevenAllFoldDecisionResult(gameId, decisionResult);
        if (allFoldPresentation) {
          setDirectThreeFiveSevenAllFoldPresentation(allFoldPresentation);
        }
        await fetchGameData('manual');
      }
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'stay',
        makeDecisionInvoked: true,
        requestStatus: 'accepted',
      });
      
      console.log('[PLAYER DECISION] Stay decision made - makeDecision handles turn advancement');
      
      // For Holm games, explicitly fetch to get updated turn position - don't rely on realtime alone
      // Note: checkHolmRoundComplete is called inside makeDecision, no need to call again
      if (game?.game_type === 'holm-game') {
        console.log('[PLAYER DECISION] *** Explicitly fetching after turn advance ***');
        setTimeout(() => fetchGameData(), 150);
      }
    } catch (error: any) {
      console.error('Error making stay decision:', error);
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'stay',
        makeDecisionInvoked: true,
        requestStatus: 'error',
        errorMessage: error?.message ?? String(error),
      });
      // Clear pending decision on error
      setPendingDecision(null);
    }
  };

  const handleFold = async (traceSource: 'live fold' | 'pre-fold execute' = 'live fold') => {
    if (!gameId || !user) return;

    if (is357GameType && (game?.status === 'game_over' || currentRound == null)) {
      console.warn('[PLAYER DECISION] reject Fold — 3-5-7 terminal/missing round boundary', {
        status: game.status,
        currentRoundId: currentRound?.id ?? null,
      });
      return;
    }

    if (is357GameType) {
      const selfPlayer = players.find((p) => p.user_id === user.id) ?? null;
      const selfCardsRow = selfPlayer ? playerCards.find((pc) => pc.player_id === selfPlayer.id) : null;
      const selfCards = (selfCardsRow?.cards ?? []) as CardType[];
      if (Array.isArray(selfCards) && selfCards.length === 3 && has357Hand(selfCards)) {
        console.warn('[PLAYER DECISION] reject Fold — 3-5-7 authoritative hand held');
        return;
      }
    }


    // P0 fix B: Holm decision actionability requires deal readiness.
    if (game?.game_type === 'holm-game' && !isHolmHandReady(handContextKey)) {
      console.warn('[PLAYER DECISION] reject Fold — Holm deal not ready');
      const currentPlayer = players.find(p => p.user_id === user.id) ?? null;
      const fromPre = traceSource === 'pre-fold execute';
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'fold',
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'holm-deal-not-ready', preserveArm: fromPre },
      });
      if (fromPre) {
        holmPreDecisionConsumingRef.current = false;
      } else {
        holmPreDecisionArmedRef.current = null;
        holmPreDecisionConsumingRef.current = false;
        setHolmPreFold(false);
        setHolmPreStay(false);
      }
      return;
    }

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) {
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: null,
        decision: 'fold',
        makeDecisionInvoked: false,
        requestStatus: 'rejected',
        extra: { reason: 'current-player-not-found' },
      });
      return;
    }

    // Optimistic UI update - show indicator immediately
    setPendingDecision('fold');

    try {
      if (game?.game_type === 'holm-game' && !currentRound?.id) {
        throw new Error('Holm Fold requires an active round');
      }
      const decisionResult = await makeDecision(gameId, currentPlayer.id, 'fold', (game?.game_type === 'holm-game' || is357GameType) ? currentRound!.id : undefined);
      if (is357GameType) {
        const allFoldPresentation = parseThreeFiveSevenAllFoldDecisionResult(gameId, decisionResult);
        if (allFoldPresentation) {
          setDirectThreeFiveSevenAllFoldPresentation(allFoldPresentation);
        }
        await fetchGameData('manual');
      }
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'fold',
        makeDecisionInvoked: true,
        requestStatus: 'accepted',
      });
      
      console.log('[PLAYER DECISION] Fold decision made - makeDecision handles turn advancement');
      
      // For Holm games, explicitly fetch to get updated turn position - don't rely on realtime alone
      // Note: checkHolmRoundComplete is called inside makeDecision, no need to call again
      if (game?.game_type === 'holm-game') {
        console.log('[PLAYER DECISION] *** Explicitly fetching after turn advance (fold) ***');
        setTimeout(() => fetchGameData(), 150);
      }
    } catch (error: any) {
      console.error('Error making fold decision:', error);
      recordHolmDecisionSubmission({
        source: traceSource,
        actor: currentPlayer,
        decision: 'fold',
        makeDecisionInvoked: true,
        requestStatus: 'error',
        errorMessage: error?.message ?? String(error),
      });
      // Clear pending decision on error
      setPendingDecision(null);
    }
  };

  const handleThreeFiveSevenAllFoldPresentationComplete = async (
    presentation: ThreeFiveSevenAllFoldPresentation,
  ) => {
    if (!gameId || presentation.gameId !== gameId) return;
    const key = getThreeFiveSevenAllFoldPresentationKey(presentation);
    if (advancingThreeFiveSevenAllFoldRef.current.has(key)) return;
    advancingThreeFiveSevenAllFoldRef.current.add(key);
    try {
      const advanceResult = await proceedToNextRound(gameId, {
        dealerGameId: presentation.dealerGameId,
        roundId: presentation.roundId,
        handNumber: presentation.handNumber,
        roundNumber: presentation.roundNumber,
      });
      if (presentation.roundNumber === 3) {
        const rollover = parseThreeFiveSevenRolloverAdvanceResult(gameId, advanceResult);
        if (!rollover) {
          throw new Error('3-5-7 all-fold rollover returned no exact committed transfer identity');
        }
        setDirectThreeFiveSevenRolloverPresentation(rollover);
      }
      await fetchGameData('manual');
    } catch (error: any) {
      advancingThreeFiveSevenAllFoldRef.current.delete(key);
      console.error('[357 ALL FOLD] Exact presentation handoff failed', error);
      toast({
        title: 'Could not start the next round',
        description: error?.message ?? 'The server rejected the 3-5-7 handoff.',
        variant: 'destructive',
      });
    }
  };

  // DEBUG: Manual proceed to next round (when debugHolmPaused is true)
  const handleDebugProceed = async () => {
    if (!gameId) return;
    console.log('[DEBUG PROCEED] Manually proceeding to next round');
    
    try {
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame) {
        console.log('[HOLM CONTINUATION] Manual client progression suppressed; database release owns advancement');
        return;
      } else {
        await proceedToNextRound(gameId);
      }
      
      // Refetch immediately
      await fetchGameData();
      
      console.log('[DEBUG PROCEED] Done');
    } catch (error) {
      console.error('[DEBUG PROCEED] ERROR:', error);
    }
  };


  const handleEndSession = async () => {
    if (!gameId) return;

    try {
      // If we're in a pre-game state (no active dealer game running),
      // end session immediately instead of deferring to end-of-hand
      const noActiveDealerGame = ['game_selection', 'dealer_selection', 'configuring', 'waiting'].includes(game?.status || '');
      
      if (noActiveDealerGame) {
        // Check if session has any history (game_results)
        const { count } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);
        
        const hasHistory = (count ?? 0) > 0;
        
        if (hasHistory || game?.real_money) {
          // Archive to session_ended
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              session_ended_at: new Date().toISOString(),
              pending_session_end: false,
              game_over_at: new Date().toISOString(),
            })
            .eq('id', gameId);
        } else {
          // No history, safe to delete
          // Delete players first, then game
          await supabase.from('players').delete().eq('game_id', gameId);
          await supabase.from('games').delete().eq('id', gameId);
        }
      } else {
        // Active game in progress - defer to end-of-hand
        if (game?.game_type === 'holm' || game?.game_type === 'holm-game') {
          // Holm's final decision and terminal settlement are server-owned. This
          // request takes the same game-row lock so LAST HAND cannot be lost if
          // a browser closes while the final decision is resolving.
          const { data, error } = await supabase.rpc('holm_request_session_end', {
            p_game_id: gameId,
          });

          if (error || !(data as { request_recorded?: boolean } | null)?.request_recorded) {
            throw error ?? new Error('Holm LAST HAND request was not recorded');
          }
        } else {
          await supabase
            .from('games')
            .update({
              pending_session_end: true,
            })
            .eq('id', gameId);
        }
      }

      setShowEndSessionDialog(false);
    } catch (error: any) {
      console.error('Error ending session:', error);
    }
  };

  const handleBlastGame = async () => {
    if (!gameId || !isAdmin || game?.real_money !== false || isBlastingGame) return;

    setIsBlastingGame(true);
    try {
      const { data, error } = await supabase.rpc('admin_blast_fake_money_game', {
        p_game_id: gameId,
      });

      if (error) throw error;

      const result = data as { outcome?: string; deleted?: boolean } | null;
      if (result?.outcome !== 'deleted' && result?.outcome !== 'already-deleted') {
        throw new Error('The session was not deleted');
      }

      // The initiating admin does not wait for its own realtime echo. Other
      // connected clients take the matching games DELETE path below.
      missingGameHandledRef.current = true;
      recordTerminalRecovery('kick-or-removal', {
        gameId,
        source: 'admin-blast-fake-money-game',
      });
      releaseRecoveryLease('kick-or-removal', {
        gameId,
        source: 'admin-blast-fake-money-game',
      });
      navigate('/', { replace: true });
    } catch (error: any) {
      console.error('[ADMIN BLAST] Failed to delete fake-money session:', error);
      toast({
        title: 'Could not blast this game',
        description: error?.message || 'The session was not deleted.',
        variant: 'destructive',
      });
    } finally {
      setIsBlastingGame(false);
    }
  };


  const handleAddBot = async () => {
    if (!gameId) return;
    try {
      await addBotPlayer(gameId);
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to add bot player",
        variant: "destructive",
      });
    }
  };

  /**
   * Single canonical Add Bot owner for every entry point (mobile gear menu,
   * desktop gear menu, desktop button).
   *
   * Success confirmation is the TABLE, not a toast: the authoritative insert
   * returns the bot player row, we re-publish canonical players, then confirm
   * the returned identity is present in the published projection. The bot is
   * authored sitting_out=true / waiting=true, so the existing canonical
   * participant-status palette renders it as a yellow waiting seat.
   *
   * Throws on failure (after a destructive toast carrying the real error
   * text) so callers can keep their menu open — no false success.
   */
  const addBotAuthoritative = async (): Promise<void> => {
    if (!gameId) throw new Error('No active game');
    let botPlayerId: string | null = null;
    try {
      const botPlayer: any = await addBotPlayerSittingOut(gameId);
      botPlayerId = botPlayer?.id ?? null;
      if (!botPlayerId) throw new Error('Bot was created without an identity');
      await fetchGameData('manual');
      const observed = playersRef.current.some((p) => p.id === botPlayerId);
      if (!observed) {
        throw new Error('Bot was created but the table did not observe the new seat');
      }
    } catch (error: any) {
      toast({
        title: 'Could not add bot',
        description: error?.message || String(error),
        variant: 'destructive',
      });
      throw error;
    }
  };



  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl);
  };


  const handleSelectSeat = async (position: number) => {
    if (!gameId || !user) {
      toast({
        title: "Error",
        description: "You must be logged in to select a seat.",
        variant: "destructive",
      });
      return;
    }

    const currentPlayer = players.find(p => p.user_id === user.id);
    
    // Setup states where new players can join immediately (not sitting out)
    const setupStates = ['waiting', 'waiting_for_players', 'dealer_selection', 'game_selection', 'configuring', 'ante_decision'];
    // If game is actively playing (not in setup/config), new players should sit out until next game
    const gameInProgress = !setupStates.includes(game?.status || '');
    
    // For waiting status (before game starts), players join in "waiting" status (ready to play)
    const isWaitingForPlayers = game?.status === 'waiting' || game?.status === 'waiting_for_players';
    
    try {
      if (!currentPlayer) {
        // Check if this user already has a player record in this game (they left and are returning)
        const { data: existingPlayer } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (existingPlayer) {
          // Player is returning - reactivate, update position, restore chips from snapshot
          const lastKnownChips = await getLastKnownChips(gameId, user.id);
          const { error: updateError } = await supabase
            .from('players')
            .update({
              status: 'active',
              position: position,
              sitting_out: gameInProgress,
              waiting: gameInProgress, // If game in progress, mark as waiting to join next game
              ante_decision: null, // Reset ante decision so they get the popup
              stand_up_next_hand: false,
              sit_out_next_hand: false,
              ...(lastKnownChips !== null ? { chips: lastKnownChips } : {}),
            })
            .eq('id', existingPlayer.id);
          
          if (updateError) {
            console.error('Error rejoining game:', updateError);
            toast({
              title: "Error Rejoining Game",
              description: updateError.message || "Failed to select seat. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          // Toast removed per user request
        } else {
          // User is a new observer - insert them as a new player
          // Check if they have a previous chip count from an earlier departure
          const lastKnownChips = await getLastKnownChips(gameId, user.id);
          
          // Fetch user's profile to get their deck_color_mode preference
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('deck_color_mode')
            .eq('id', user.id)
            .maybeSingle();
          
          // For waiting status: players join with waiting=true (ready to play when game starts)
          // For other setup phases: players join immediately
          // For in_progress games: players sit out until next game
          const { error: joinError } = await supabase
            .from('players')
            .insert({
              game_id: gameId,
              user_id: user.id,
              chips: lastKnownChips ?? 0, // Restore previous chips if available
              position: position,
              sitting_out: gameInProgress,
              waiting: isWaitingForPlayers ? true : gameInProgress, // waiting: mark as waiting to play
              ante_decision: null, // Ensure ante_decision is null so they get the popup
              deck_color_mode: userProfile?.deck_color_mode || null // Copy from profile
            });

          if (joinError) {
            console.error('Error joining game:', joinError);
            toast({
              title: "Error Joining Game",
              description: joinError.message || "Failed to select seat. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          // Toast removed per user request
        }
      } else {
        // Existing player changing seats
        // Keep sitting_out status if game is in progress
        const { error: updateError } = await supabase
          .from('players')
          .update({
            position: position,
            sitting_out: gameInProgress ? currentPlayer.sitting_out : false,
            // When the table is in the waiting/lobby phase, taking a seat
            // re-activates the viewer — there is no separate "Rejoin"
            // affordance. Clears waiting/observer status so they're
            // dealt in normally on the next game.
            ...(gameInProgress ? {} : { status: 'active', waiting: false }),
          })
          .eq('id', currentPlayer.id);
          
        if (updateError) {
          console.error('Error changing seats:', updateError);
          toast({
            title: "Error Changing Seats",
            description: updateError.message || "Failed to change seats. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Toast removed per user request
      }
      
      // Refetch to update UI
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      console.error('Error selecting seat:', error);
      toast({
        title: "Unexpected Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Calculate the NEXT dealer position (for game_over countdown display)
  // This needs to be BEFORE the loading return to maintain consistent hook order
  // This needs to match the logic in rotateDealerPosition which considers:
  // - Only non-sitting-out players (after player state evaluation)
  // - Only non-bot players
  // - Rotates clockwise from current dealer position
  const dealerPlayer = players.find(p => p.position === game?.dealer_position);
  const nextDealerPlayer = useMemo(() => {
    if (!game || game.status !== 'game_over') return dealerPlayer;
    
    // Get eligible dealers (non-sitting-out, non-bot humans)
    // Note: During game_over, player states haven't been evaluated yet by handleGameOverComplete
    // So we need to predict who will be eligible AFTER evaluation
    const eligiblePlayers = players.filter(p => {
      // If they have sit_out_next_hand or stand_up_next_hand, they won't be eligible
      if (p.sit_out_next_hand || p.stand_up_next_hand) return false;
      // If they're sitting out and not waiting to rejoin, they won't be eligible
      if (p.sitting_out && !p.waiting) return false;
      // Bots can't be dealers
      if (p.is_bot) return false;
      return true;
    }).sort((a, b) => a.position - b.position);
    
    if (eligiblePlayers.length === 0) return dealerPlayer;
    
    const currentDealerPosition = game.dealer_position || 1;
    const eligiblePositions = eligiblePlayers.map(p => p.position);
    const currentDealerIndex = eligiblePositions.indexOf(currentDealerPosition);
    
    let nextPosition: number;
    if (currentDealerIndex === -1) {
      // Current dealer not eligible, pick first eligible
      nextPosition = eligiblePositions[0];
    } else {
      // Rotate to next position (clockwise)
      const nextIndex = (currentDealerIndex + 1) % eligiblePositions.length;
      nextPosition = eligiblePositions[nextIndex];
    }
    
    return players.find(p => p.position === nextPosition) || dealerPlayer;
  }, [game?.status, game?.dealer_position, players, dealerPlayer]);

  // Phase 6: passive PlayfieldSlot identity tracker. MUST be called
  // unconditionally in stable hook order BEFORE any early returns to
  // satisfy rules-of-hooks. The `enabled` flag makes it a runtime
  // no-op when the game isn't loaded or isn't a poker-variant family.
  // Phase 6: passive PlayfieldSlot identity tracker. P9.4 (re-scoped):
  // widen from poker-variant-only to the canonical-shell family so
  // gin-rummy participates in the shell ownership boundary instead of
  // patching seat/lifecycle locally. `isPokerVariantFamily` is untouched
  // because bot/scoring code still depends on it.
  const phase6Enabled =
    !loading &&
    !!game &&
    isCanonicalShellFamily(game?.game_type) &&
    import.meta.env.VITE_CANONICAL_SHELL_LIFT !== 'off';
  // Phase 7: when the slot controller is on, it owns identity telemetry.
  // Disable this tracker to prevent duplicate slot-identity-changed events.
  const phase7SlotNeutralOn =
    import.meta.env.VITE_CANONICAL_SLOT_NEUTRAL === 'on';
  useSlotIdentityTracker({
    enabled: phase6Enabled && !phase7SlotNeutralOn,
    gameId: gameId ?? null,
    gameType: game?.game_type ?? null,
    dealerGameId: (game as any)?.current_game_uuid ?? null,
  });

  if ((loading || !game) && !hasHydratedRef.current) {
    setLifecycleContext({
      userId: user?.id ?? null,
      gameId: gameId ?? null,
      gameType: game?.game_type ?? null,
      gameStatus: game?.status ?? null,
      dealerGameId: (game as any)?.current_game_uuid ?? null,
      currentGameUuid: (game as any)?.current_game_uuid ?? null,
      shellRoute: 'Game:bootstrap',
      feltOwnership: 'bootstrap-forced',
    });
    setLifecycleFact('Game.branch', 'bootstrap');
    setLifecycleFact('Game.loading', loading);
    setLifecycleFact('Game.game', !!game);
    setLifecycleFact('Game.game_type', game?.game_type ?? null);
    setLifecycleFact('Game.status', game?.status ?? null);
    setLifecycleFact('Game.enableOuterShell', 'bootstrap-forced');
    setLifecycleFact('Game.innerBgClass', 'min-h-screen(bootstrap)');
    return (
      <SurfaceReadinessProvider>
        <PersistentTableShell
          gameId={gameId ?? undefined}
          viewerUserId={user?.id ?? null}
          /* Reserve header row + waiting chrome during bootstrap so the
             shell-owned ellipse (anchored inside the children grid row)
             does NOT shift vertically when the actual mobileHeader and
             ShellHudChrome mount on hydration. Root-cause fix for the
             Phase 3.1d transient first-frame layout settle. */
          header={isMobile ? (
            <div
              data-canonical-shell-header-placeholder=""
              className="px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border"
              style={{ height: 41, minHeight: 41 }}
              aria-hidden="true"
            />
          ) : undefined}
        >
          <WaitingFlightMarker
            event="PersistentTableShell branch=bootstrap"
            payload={{ gameId: gameId ?? null, hasGame: !!game, loading: !!loading }}
          />
          <div
            data-canonical-bootstrap=""
            data-lifecycle-branch="bootstrap"
            className={isMobile ? 'flex-1 min-h-0 flex flex-col' : 'min-h-screen'}
            aria-busy="true"
          >
            {/* Reserve the exact waiting table/HUD/content composition so
                the shell-owned felt frame is already painted at the same
                y-coordinate as the hydrated waiting surface. */}
            {isMobile ? (
              <>
                <div
                  data-canonical-bootstrap-table-region=""
                  className="flex-shrink-0"
                  style={{
                    height: 'calc(24px + min(86vw, calc(var(--shell-play-h) - 24px), 400px))',
                    minHeight: 260,
                  }}
                />
                <div style={{ height: 36 }} aria-hidden="true" />
                <div style={{ height: 44 }} aria-hidden="true" />
                <div className="flex-1 min-h-0" />
              </>
            ) : null}
          </div>
        </PersistentTableShell>
        {/* StartupFlightRecorderOverlay is mounted once at App.tsx; do not
            duplicate here — duplicate mounts caused redundant fixed-position
            dev chrome on top of canonical HUD rows. */}
      </SurfaceReadinessProvider>
    );
  }

  // After hydration, `game` is guaranteed non-null via the
  // lastGameRef fallback. Narrow the type for downstream code that
  // assumes `game` is non-null past this point.
  if (!game) {
    return null;
  }


  // Non-committed lobby/session-ended states release stale gameplay
  // identity (game.name / instanceLabel / stakes) and render the
  // canonical lobby brand. Committed phases (dealer_selection,
  // ante_decision, in_progress, game_over) must NOT enter this mode;
  // they render the committed game plate via the felt contract.
  const _shellLobbyStatuses = new Set<string>([
    'waiting', 'waiting_for_players',
    'configuring', 'game_selection', 'session_ended',
  ]);
  // ── SHARED TERMINAL-PRESENTATION HOLD SEAM ─────────────────────────
  // Cross-game invariant (recorded for the later cross-game terminal
  // audit): authoritative `session_ended` may land BEFORE the local
  // terminal presentation finishes. While it is still presenting, the
  // full gameplay presentation shell — felt, seat ring, HUD stacks, pot
  // anchors — must stay admitted with the SAME mounted instances. This
  // single predicate is the only owner of that widening; every render
  // gate that would otherwise release the gameplay surface at
  // `session_ended` consults it. No status rewrite, no timer, no
  // duplicate surface.
  const _terminalPresentationHold =
    (
      terminalPresentationActive ||
      holmLastHandPresentationPending ||
      liveTerminalPresentationPending
    ) &&
    (game.status as string) === 'session_ended';
  // Shared SESSION ENDED TABLE PHASE (client-local, read-only). Structurally
  // like Waiting: same persistent shell, same felt, same seat ring, HUD/tab
  // rail intact — every game-specific artifact retired (not blurred, not
  // covered: not rendered). Mutually exclusive with
  // `_terminalPresentationHold` by construction, because admission requires
  // the canonical terminal presentation to have already completed and this
  // predicate is only reachable after that completion token landed.
  const _sessionEndedTableActive =
    sessionEndedTableAdmitted &&
    (game.status as string) === 'session_ended' &&
    !terminalPresentationActive &&
    !holmLastHandPresentationPending &&
    !liveTerminalPresentationPending;

  // Terminal-presentation hold: while the canonical win sequence is still
  // presenting locally, a `session_ended` status must NOT flip the shell into
  // lobby mode — that swaps branding and releases the gameplay surface out
  // from under the running celebration.
  const _isShellLobbyMode =
    game.status != null &&
    _shellLobbyStatuses.has(game.status) &&
    !_terminalPresentationHold &&
    // Session Ended is a canonical TABLE phase, not lobby: lobby mode
    // clears the ambient announcement track, which would immediately wipe
    // the persistent row-1 "Session Ended" plate.
    !_sessionEndedTableActive;


  // Header chrome title contract: ALWAYS show session name, across every
  // lifecycle phase. The "P-Town Poker" lobby override applies only to
  // the felt plate (see feltGameName). Header chrome and felt plate are
  // separate display contracts — do not couple them.
  const gameName = game.name || `Game #${gameId?.slice(0, 8)}`;
  const sessionStartTime = game.created_at ? new Date(game.created_at).toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  }) : '';
  const handsPlayed = game.total_hands || 0;

  // Find the host - use current_host if set, otherwise fallback to earliest player
  const hostPlayer = [...players].filter(p => !p.is_bot).sort((a, b) => 
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  )[0];
  const currentHost = (game as any).current_host;
  const sessionHostPlayer = currentHost
    ? players.find((player) => player.user_id === currentHost)
    : hostPlayer;
  const sessionHostUserId = currentHost ?? sessionHostPlayer?.user_id ?? null;
  const sessionHostName = sessionHostPlayer?.profiles?.username ?? 'the session host';
  const isCreator = currentHost ? currentHost === user?.id : hostPlayer?.user_id === user?.id;
  const isWaitingTableStatus = game.status === 'waiting' || game.status === 'waiting_for_players';
  const canStart = isWaitingTableStatus && players.length >= 2 && isCreator;
  const isDealer = dealerPlayer?.user_id === user?.id;
  const currentPlayer = players.find(p => p.user_id === user?.id);

  // Route-stable shell mount: the PersistentTableShell parent is
  // decided once per /game/:gameId session at route entry and never
  // flips based on mutable runtime state. This is what prevents the
  // mid-session subtree remount that previously caused the post-
  // selection black screen / HUD disappearance. Canonical-family
  // features (seats, projection, identity tracker) remain gated by
  // game_type below — they only adjust inert sub-props, never the
  // parent identity.
  const enableOuterShell =
    import.meta.env.VITE_CANONICAL_SHELL_LIFT !== 'off';

  // NOTE: do NOT define ShellWrap as an inline component here — its
  // type identity would change every render and remount the entire
  // subtree (and the PersistentTableShell itself), violating INV-shell-1
  // and breaking lobby interactions. Inline the conditional instead.

  // Non-canonical-shell families keep their legacy slate gradient on
  // the inner page wrapper (the shell sits transparently underneath
  // for them); canonical-shell families let the shell paint chrome.
  // Route-stable shell family signal. game.game_type is null precisely
  // during the configuring/game_selection window (the dealer is choosing
  // inside the setup modal), so gating canonical shell ownership on
  // game.game_type alone breaks continuity by construction. Fall through
  // a sticky chain (current → last known → previous game config), and
  // additionally treat the configuring/game_selection statuses as
  // canonical-route by default — every game family currently selectable
  // in the setup modal is a canonical-shell family, so this is safe.
  const _routeShellGameType =
    game.game_type ?? lastKnownGameTypeRef.current ?? previousGameConfig?.game_type ?? null;
  const _routeShellAnteAmount =
    game.ante_amount ?? previousGameConfig?.ante_amount ?? 0;
  const _isConfiguringContext =
    game.status === 'game_selection' ||
    game.status === 'configuring' ||
    // Persistent-poker-shell refactor: dealer_selection is a pre-game
    // lifecycle phase identical in structural intent to game_selection
    // / configuring. Including it here keeps the route stable on
    // `Game:canonical` from session start through in_progress, which
    // is what eliminates the legacy↔canonical ShellHudChrome teardown
    // and the MobileGameTable position swap during DealerGameSetup.
    game.status === 'dealer_selection' ||
    ((game.status === 'game_over' || game.status === 'session_ended') && !(game as any).config_complete);
  // Phase 3.1d: a fresh-session waiting state with no committed family
  // (no last-known / no previous config to fall back to) is canonical
  // by construction — the canonical ellipse is the universal neutral
  // surface and the waiting branch above routes to
  // CanonicalShellWaitingSurface in that case. Without this, the inner
  // bg would render the legacy slate gradient and visually fight the
  // shell-owned ellipse.
  const _isFreshWaitingNoFamily =
    isWaitingTableStatus &&
    game.game_type == null &&
    lastKnownGameTypeRef.current == null &&
    (previousGameConfig?.game_type ?? null) == null;
  const _treatAsCanonicalRoute =
    isCanonicalShellFamily(_routeShellGameType) ||
    (game.game_type == null && _isConfiguringContext) ||
    _isFreshWaitingNoFamily;

  // Persistent-poker-shell scope. When true, the slot mounts a single
  // MobileGameTable instance keyed by stable gameId across the entire
  // dealer_selection → game_selection → configuring → ante_decision →
  // in_progress → game_over lifecycle, with DealerGameSetup /
  // HighCardDealerSelection rendered as overlays on top (not sibling
  // teardown/recreation). Bootstrap window (game_type still null) is
  // included so the slot owns the surface from session start.
  const _isPokerShellPersistent =
    enableOuterShell && (
      isPokerVariantFamily(_routeShellGameType) ||
      (_routeShellGameType == null && (
        game.status === 'dealer_selection' ||
        game.status === 'game_selection' ||
        game.status === 'configuring'
      ))
    );

  // Sibling persistence concept scoped ONLY to PSC persistentChildrenKey.
  // Keeps canonical-shell-family consumers (gin-rummy, cribbage, yahtzee, etc.)
  // mounted across lifecycle transitions without broadening
  // _isPokerShellPersistent (whose other call sites — dealer selection
  // overlays, observer overlays, terminal animation gates — must remain
  // poker-variant-only).
  const _isCanonicalShellPersistent =
    enableOuterShell && _treatAsCanonicalRoute && gameId != null;

  // Hook-free transition instrumentation. Logged only when the value
  // actually changes; safe at render time (no hooks, no state).
  _shellLogIfChanged('Game._isPokerShellPersistent', _isPokerShellPersistent, {
    enableOuterShell,
    _routeShellGameType,
    gameStatus: game.status ?? null,
    gameType: game.game_type ?? null,
    branch: isPokerVariantFamily(_routeShellGameType)
      ? 'poker-variant-family'
      : (_routeShellGameType == null
        ? `route-type-null/${game.status ?? 'unknown'}`
        : 'not-persistent'),
  });
  _shellLogIfChanged('Game._routeShellGameType', _routeShellGameType, {
    gameType: game.game_type ?? null,
    lastKnown: lastKnownGameTypeRef.current ?? null,
    prevConfig: previousGameConfig?.game_type ?? null,
  });
  _shellLogIfChanged('Game.enableOuterShell.value', enableOuterShell);


  // When the canonical shell owns the page column (header + children +
  // rail + tab bar in a flex column anchored to min-h-screen), the
  // inner tree must fit the children flex slot — NOT claim 100dvh,
  // which would push the rail and tab bar below the viewport. Use
  // `flex-1 min-h-0` so mobile inner content fills the remaining
  // space above the shell-owned rail and tab bar without overflow.
  const _innerBgClass = `${isMobile ? (_treatAsCanonicalRoute && enableOuterShell ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'h-dvh overflow-hidden') : 'min-h-screen p-4'} ${_treatAsCanonicalRoute ? 'bg-transparent' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'}`;
  setLifecycleContext({
    userId: user?.id ?? null,
    gameId: gameId ?? null,
    gameType: game.game_type ?? null,
    gameStatus: game.status ?? null,
    dealerGameId: (game as any).current_game_uuid ?? null,
    currentGameUuid: (game as any).current_game_uuid ?? null,
    clientRole: currentPlayer
      ? (currentPlayer.status === 'observer' ? 'observer' : 'player')
      : 'observer',
    shellRoute: _treatAsCanonicalRoute ? 'Game:canonical' : 'Game:legacy',
    feltOwnership: enableOuterShell && _treatAsCanonicalRoute ? 'shell-owned' : 'inner-owned',
  });
  setLifecycleFact('Game.branch', 'loaded');
  setLifecycleFact('Game.loading', false);
  setLifecycleFact('Game.game_type', game.game_type ?? null);
  setLifecycleFact('Game.status', game.status ?? null);
  setLifecycleFact('Game.enableOuterShell', enableOuterShell);
  setLifecycleFact('Game.shellCanonicalFamily', _treatAsCanonicalRoute);
  setLifecycleFact('Game.innerBgClass', _innerBgClass);
  // Shell-owned mobile header chrome. Authored here (so the existing
  // data wiring stays put) and handed to PersistentTableShell via the
  // `header` prop. The shell renders it above the canonical
  // announcement rail and the opaque game children.
  const mobileHeader = isMobile ? (
    <div className="flex items-center justify-between px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">PPL</span>
        {currentPlayer ? (
          <PlayerOptionsMenu
            isSittingOut={currentPlayer.sitting_out}
            isObserver={false}
            waiting={currentPlayer.waiting}
            autoAnte={playerOptions.autoAnte}
            autoAnteRunback={playerOptions.autoAnteRunback}
            sitOutNextHand={playerOptions.sitOutNextHand}
            standUpNextHand={playerOptions.standUpNextHand}
            onAutoAnteChange={(v) => handlePlayerOptionChange('auto_ante', v)}
            onAutoAnteRunbackChange={(v) => handlePlayerOptionChange('auto_ante_runback', v)}
            onSitOutNextHandChange={(v) => handlePlayerOptionChange('sit_out_next_hand', v)}
            onStandUpNextHandChange={(v) => handlePlayerOptionChange('stand_up_next_hand', v)}
            onStandUpNow={handleStandUpNow}
            onLeaveGameNow={handleLeaveGameNow}
            variant="mobile"
            gameStatus={game.status}
            isHost={isCreator}
            isPaused={game.is_paused}
            onTogglePause={(game.status === 'in_progress' || game.status === 'configuring' || game.status === 'game_selection' || game.status === 'ante_decision') ? handleTogglePause : undefined}
            onAddBot={addBotAuthoritative}

            canAddBot={players.length < 7 && (game.status === 'in_progress' || isWaitingTableStatus) && !game.real_money}
            onEndSession={isCreator && ['in_progress', 'ante_decision', 'dealer_selection', 'game_selection', 'configuring'].includes(game.status) ? () => setShowEndSessionDialog(true) : undefined}
            canBlastGame={isAdmin && game.real_money === false}
            onBlastGame={() => void handleBlastGame()}
            deckColorMode={(currentPlayer.deck_color_mode as 'two_color' | 'four_color') || 'four_color'}
            onDeckColorModeChange={async (mode) => {
              await handleDeckColorModeChange(currentPlayer.id, mode, fetchGameData);
            }}
          />
        ) : (
          <PlayerOptionsMenu
            isSittingOut={false}
            isObserver={true}
            waiting={false}
            autoAnte={false}
            autoAnteRunback={false}
            sitOutNextHand={false}
            standUpNextHand={false}
            onAutoAnteChange={() => {}}
            onAutoAnteRunbackChange={() => {}}
            onSitOutNextHandChange={() => {}}
            onStandUpNextHandChange={() => {}}
            onStandUpNow={() => {}}
            onLeaveGameNow={handleLeaveGameNow}
            variant="mobile"
            gameStatus={game.status}
            canBlastGame={isAdmin && game.real_money === false}
            onBlastGame={() => void handleBlastGame()}
            deckColorMode={'four_color'}
            onDeckColorModeChange={async () => {}}
          />
        )}
        {/* 357 PRESENTATION LEDGER pill is mounted globally from
            App.tsx's DebugTray so it is visible on every client
            (host/non-host, observer, sitting-out, folded, timed-out)
            regardless of the local hand-pane branch. */}
        <VisualBugReportButton
          gameId={gameId!}
          gameType={game.game_type}
          dealerGameId={currentRound?.dealer_game_id || game.current_game_uuid || null}
          roundId={currentRound?.id || null}
          handNumber={game.total_hands ?? null}
          phase={currentRound?.status || game.status}
          currentTurnPlayerId={null}
          viewerPlayerId={currentPlayer?.id || null}
          activeTab={null}
          isPaused={game.is_paused}
          hasActiveTimer={!!decisionDeadline && !game.is_paused}
          onPause={handleTogglePause}
          onResume={handleTogglePause}
          variant="mobile"
          reporterUsername={currentPlayer?.profiles?.username}
        />
        {game.pending_session_end && (
          <Badge variant="destructive" className="text-xs px-2 py-0.5">LAST HAND</Badge>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {gameName}
        {!_isShellLobbyMode && game.real_money && <span className="text-green-500 font-semibold ml-1">$</span>}
      </span>
    </div>
  ) : null;

  const innerTree = (
    <div data-lifecycle-branch="loaded-inner" className={_innerBgClass}>
      {/*
       * Phase 2, Step 4 — session-level passive lifecycle rail ownership.
       * Emits canonical ambient/transient events for dealer-selection,
       * dealer-configuring, and awaiting-ante lifecycle states across
       * all non-Cribbage games. Cribbage owns its own rail emissions
       * inside CribbageMobileGameTable and is skipped by this component.
       */}
      <SessionLifecycleAnnouncer
        gameId={gameId ?? null}
        gameType={game.game_type}
        gameStatus={game.status}
        isPaused={game.is_paused === true}
        sessionHostUserId={sessionHostUserId}
        sessionHostName={sessionHostName}
        configComplete={(game as any).config_complete ?? null}
        isViewerDealer={isDealer}
        allowBotDealers={allowBotDealers}
        dealerPlayer={dealerPlayer as any}
        players={players as any}
        dealerSelectionCards={dealerSelectionCards as any}
        dealerSelectionWinnerPosition={dealerSelectionWinnerPosition}
      />





      <div className={`${isMobile ? 'h-full flex flex-col overflow-hidden' : 'max-w-7xl mx-auto space-y-6'}`}>
        {/* Desktop header */}
        {!isMobile && (
          <div className="flex justify-between items-center">
            <div className="flex items-start gap-3">
              {/* Player Options Menu - only show if player is seated */}
              {currentPlayer && (
                <PlayerOptionsMenu
                  isSittingOut={currentPlayer.sitting_out}
                  isObserver={false}
                  waiting={currentPlayer.waiting}
                  autoAnte={playerOptions.autoAnte}
                  autoAnteRunback={playerOptions.autoAnteRunback}
                  sitOutNextHand={playerOptions.sitOutNextHand}
                  standUpNextHand={playerOptions.standUpNextHand}
                  onAutoAnteChange={(v) => handlePlayerOptionChange('auto_ante', v)}
                  onAutoAnteRunbackChange={(v) => handlePlayerOptionChange('auto_ante_runback', v)}
                  onSitOutNextHandChange={(v) => handlePlayerOptionChange('sit_out_next_hand', v)}
                  onStandUpNextHandChange={(v) => handlePlayerOptionChange('stand_up_next_hand', v)}
                  onStandUpNow={handleStandUpNow}
                  onLeaveGameNow={handleLeaveGameNow}
                  variant="desktop"
                  gameStatus={game.status}
                  isHost={isCreator}
                  isPaused={game.is_paused}
                  onTogglePause={(game.status === 'in_progress' || game.status === 'configuring' || game.status === 'game_selection' || game.status === 'ante_decision') ? handleTogglePause : undefined}
                  onAddBot={addBotAuthoritative}

                  canAddBot={players.length < 7 && (game.status === 'in_progress' || isWaitingTableStatus) && !game.real_money}
                  canBlastGame={isAdmin && game.real_money === false}
                  onBlastGame={() => void handleBlastGame()}
                  deckColorMode={(currentPlayer.deck_color_mode as 'two_color' | 'four_color') || 'four_color'}
                  onDeckColorModeChange={async (mode) => {
                    await handleDeckColorModeChange(currentPlayer.id, mode, fetchGameData);
                  }}
                />
              )}
              <VisualBugReportButton
                gameId={gameId!}
                gameType={game.game_type}
                dealerGameId={currentRound?.dealer_game_id || game.current_game_uuid || null}
                roundId={currentRound?.id || null}
                handNumber={game.total_hands ?? null}
                phase={currentRound?.status || game.status}
                currentTurnPlayerId={null}
                viewerPlayerId={currentPlayer?.id || null}
                activeTab={null}
                isPaused={game.is_paused}
                hasActiveTimer={!!decisionDeadline && !game.is_paused}
                onPause={handleTogglePause}
                onResume={handleTogglePause}
                variant="desktop"
                reporterUsername={currentPlayer?.profiles?.username}
              />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">Peoria Poker League</h1>
                <p className="text-muted-foreground">
                  {gameName}
                  {!_isShellLobbyMode && game.real_money && <span className="text-green-500 font-semibold ml-1">$</span>}
                </p>
                <p className="text-sm text-muted-foreground">Session started at: {sessionStartTime}</p>
                <p className="text-sm text-muted-foreground">{handsPlayed} hands played</p>
              </div>
            </div>
            <div className="flex gap-2">
              {game.status === 'in_progress' && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex gap-2">
                    {isCreator && players.length < 7 && (
                      <Button 
                        variant="outline" 
                        onClick={() => { void addBotAuthoritative().catch(() => {}); }}


                      >
                        <Bot className="w-4 h-4 mr-2" />
                        Add Bot
                      </Button>
                    )}
                    {isCreator && (
                      <Button 
                        variant={game.is_paused ? "default" : "outline"} 
                        onClick={handleTogglePause}
                      >
                        {game.is_paused ? '▶️ Resume' : '⏸️ Pause'}
                      </Button>
                    )}
                  </div>
                  {game.is_paused && (
                    <Badge variant="destructive" className="animate-pulse text-sm px-3 py-1">
                      ⏸️ GAME PAUSED
                    </Badge>
                  )}
                </div>
              )}
              {isWaitingTableStatus && (
                <Button variant="default" onClick={handleInvite}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Invite Players
                </Button>
              )}
              {isCreator && ['in_progress', 'ante_decision', 'dealer_selection', 'game_selection', 'configuring'].includes(game.status) && (
                <Button variant="destructive" onClick={() => setShowEndSessionDialog(true)}>
                  End Session
                </Button>
              )}
              {/* Only show Leave Game if player is sitting out or is an observer */}
              {(!players.find(p => p.user_id === user?.id) || players.find(p => p.user_id === user?.id)?.sitting_out) && (
                <Button variant="outline" onClick={leaveGame}>
                  Leave Game
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Mobile header is now shell-owned. Authored below as
            `mobileHeader` and passed to PersistentTableShell via the
            `header` prop, which renders it above the canonical
            shell-owned announcement rail. */}



        {/* waiting status — all waiting-table statuses render the canonical
            waiting surface. Do not route by stale game.game_type here. */}
        {isWaitingTableStatus && (() => {
          recordWaitingLifecycleIfChanged(
            `waitBranch:${gameId ?? 'none'}`,
            'waiting branch decision',
            {
              status: game.status,
              gameType: game.game_type ?? null,
              branch: 'CanonicalShellWaitingSurface',
              hasGame: !!game,
              playersCount: players.length,
            },
          );
          return null;
        })()}
        {/* P1 Waiting Table Identity Fix:
            Any `game.status === 'waiting'` state — whether fresh pre-session
            or post-timeout/insufficient-players — must render the canonical
            waiting surface. Routing by stale `game.game_type` (which is not
            nulled post-hand) caused mixed ownership: legacy
            WaitingForPlayersTable + MGT gameplay seat renderer leaked beneath
            PreSessionSeatLayer, producing duplicate chip clusters and stale
            "HORSES / $2" identity. The canonical surface is the single
            source of truth for waiting-table presentation. */}
        {isWaitingTableStatus && (
          <CanonicalShellWaitingSurface
            gameId={gameId!}
            gameType={null}
            anteAmount={0}
            players={players as any}
            currentUserId={user?.id}
            onSelectSeat={handleSelectSeat}
            onGameStart={startGameFromWaiting}
            onBotAdded={fetchGameData}
            realMoney={game.real_money}
            allMessages={allMessages}
            onSendChat={sendChatMessage}
            isChatSending={isChatSending}
          />
        )}



        {(game.status === 'dealer_selection' || game.status === 'game_selection' || game.status === 'configuring' || game.status === 'game_over' || game.status === 'session_ended' || is357WinAnimationActive || horsesWinPotTriggerId) && (
          <>
            {/* Phase 1 (canonical table unification, Bucket 1):
                A1 dealer-selection background sibling is restricted to
                non-canonical-seat-consumer families. Canonical-seat
                consumers (cribbage / gin-rummy / yahtzee) own their
                own unified persistent table across every phase
                including dealer-selection — rendering a parallel
                MobileGameTable backdrop here would violate the single
                canonical surface invariant. Poker-variant family
                (holm / 3-5-7 / horses / SCC) still renders the
                backdrop because the PlayfieldSlotController does not
                cover their `dealer_selection` status; that gap is
                Bucket 3/4 of the unification initiative. */}
            {game.status === 'dealer_selection' && !isCanonicalSeatConsumer(game.game_type) && !_isPokerShellPersistent && (
              <>
                <WaitingFlightMarker
                  event="dealer-selection-bg"
                  payload={{
                    gameId,
                    gameType: game.game_type ?? null,
                    playerCount: players.length,
                    viewerPosition: getPositionForUserId(user?.id ?? '') ?? null,
                  }}
                />
                {/* Show game table as background during dealer selection (non-canonical-seat-consumer families). */}
                <MobileGameTable key={gameId ?? 'unknown-game'} sessionEndedPhase={_sessionEndedTableActive}
                    instanceLabel="dealer-selection-bg"
                    currentRoundNotReadyForPresentation={currentRoundNotReadyForPresentation}
                    gameId={gameId}
                    players={players}
                    currentUserId={user?.id}
                    pot={0}
                    currentRound={0}
                    allDecisionsIn={false}
                    playerCards={[]}
                    timeLeft={null}
                    lastRoundResult={null}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value ?? 0}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                    gameStatus={game.status}
                    handContextId={null}
                    chatBubbles={chatBubbles}
                    allMessages={allMessages}
                    onSendChat={sendChatMessage}
                    isChatSending={isChatSending}
                    getPositionForUserId={getPositionForUserId}
                    onLeaveGameNow={handleLeaveGameNow}
                    activeTab={mobileActiveTab}
                    onActiveTabChange={setMobileActiveTab}
                    hasUnreadMessages={mobileHasUnreadMessages}
                    onHasUnreadMessagesChange={setMobileHasUnreadMessages}
                    lastSeenChatMessageId={lastSeenChatMessageId}
                    onLastSeenChatMessageIdChange={setLastSeenChatMessageId}
                    lastReadChatMessageId={lastReadChatMessageId}
                    onLastReadChatMessageIdChange={setLastReadChatMessageId}
                    latestRealtimeChatMessage={latestRealtimeMessage}
                    chatInputValue={mobileChatInput}
                    onChatInputChange={setMobileChatInput}
                    isWaitingPhase={true}
                    dealerSelectionCards={dealerSelectionCards}
                    dealerSelectionWinnerPosition={dealerSelectionWinnerPosition}
                  />
                {/* High Card Dealer Selection */}
                <HighCardDealerSelection 
                  gameId={gameId!}
                  players={players}
                  onComplete={selectDealer}
                  isHost={isCreator}
                  allowBotDealers={allowBotDealers}
                  syncedState={(game as any).dealer_selection_state ?? null}
                  onCardsUpdate={setDealerSelectionCards}
                  onWinnerPositionUpdate={setDealerSelectionWinnerPosition}
                  cribTraceGating={{
                    mountSite: 'Game.tsx:status-keyed-sibling-table',
                    gameStatus: game.status,
                    currentRoundId: currentRound?.id ?? null,
                    gameType: game.game_type ?? null,
                  }}
                />


              </>
            )}
            {(!is357WinAnimationActive && !horsesWinPotTriggerId && !_isPokerShellPersistent && (
              game.status === 'game_selection' ||
              game.status === 'configuring' ||
              ((game.status === 'game_over' || game.status === 'session_ended') && !(game as any).config_complete)
            )) ? (
              <div className="relative">
                {/* Phase 1: A2 status-keyed sibling table. `!_treatAsCanonicalRoute`
                    is the route-stable gate; `!isCanonicalShellFamily` is a
                    belt-and-suspenders structural guard so this branch
                    cannot fire for any registered canonical-shell game,
                    even if route-resolution changes. Stable `gameId` key
                    eliminates the per-status forced remount that previously
                    caused the visible mid-transition table swap. */}
                {!_treatAsCanonicalRoute && !isCanonicalShellFamily(game.game_type) && (
                  <MobileGameTable key={gameId ?? 'unknown-game'} sessionEndedPhase={_sessionEndedTableActive}
                    instanceLabel="status-keyed"
                    currentRoundNotReadyForPresentation={currentRoundNotReadyForPresentation}
                    gameId={gameId}
                    players={players}
                    currentUserId={user?.id}
                    pot={potForDisplay}
                    currentRound={0}
                    allDecisionsIn={false}
                    playerCards={[]}
                    timeLeft={null}
                    lastRoundResult={null}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value ?? 0}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                    gameStatus={game.status}
                    handContextId={null}
                    chatBubbles={chatBubbles}
                    allMessages={allMessages}
                    onSendChat={sendChatMessage}
                    isChatSending={isChatSending}
                    getPositionForUserId={getPositionForUserId}
                    onLeaveGameNow={handleLeaveGameNow}
                    activeTab={mobileActiveTab}
                    onActiveTabChange={setMobileActiveTab}
                    hasUnreadMessages={mobileHasUnreadMessages}
                    onHasUnreadMessagesChange={setMobileHasUnreadMessages}
                    lastSeenChatMessageId={lastSeenChatMessageId}
                    onLastSeenChatMessageIdChange={setLastSeenChatMessageId}
                    lastReadChatMessageId={lastReadChatMessageId}
                    onLastReadChatMessageIdChange={setLastReadChatMessageId}
                    latestRealtimeChatMessage={latestRealtimeMessage}
                    chatInputValue={mobileChatInput}
                    onChatInputChange={setMobileChatInput}
                    dealerSetupMessage={!isDealer && dealerPlayer && !(dealerPlayer.is_bot && allowBotDealers) ? `${dealerPlayer.is_bot ? getBotAlias(players, dealerPlayer.user_id) : (dealerPlayer.profiles?.username || 'Player')} is configuring the next game` : undefined}
                    isWaitingPhase={true}
                  />
                )}
                {(isDealer || (dealerPlayer?.is_bot && allowBotDealers)) && (
                  <DealerGameSetup
                    gameId={gameId!}
                    dealerUsername={dealerPlayer?.is_bot ? getBotAlias(players, dealerPlayer.user_id) : (dealerPlayer?.profiles?.username || '')}
                    isBot={dealerPlayer?.is_bot || false}
                    dealerPlayerId={dealerPlayer?.id || ''}
                    dealerPosition={game.dealer_position || 1}
                    configDeadline={game.config_deadline ?? null}
                    previousGameType={(previousGameConfig?.game_type ?? game.game_type) || undefined}
                    previousGameConfig={previousGameConfig}
                    sessionGameConfigs={sessionGameConfigs}
                    isFirstHand={!hasSessionHistory && !previousGameConfig}
                    gameSetupTimerSeconds={game.game_setup_timer_seconds || 30}
                    anteDecisionTimerSeconds={game.ante_decision_timer_seconds || 30}
                    activePlayerCount={players.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left').length}
                    activeHumanCount={players.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left' && !p.is_bot).length}
                    onConfigComplete={handleConfigComplete}
                    onSessionEnd={() => setShowEndSessionDialog(true)}
                    onSitOut={async () => {
                      // Handle dealer sitting out - mark as sitting out then evaluate player counts
                      if (!dealerPlayer?.id || !gameId) return;

                      if (is357GameType) {
                        try {
                          await declineThreeFiveSevenSetup({
                            gameId,
                            expectedDealerPosition: game.dealer_position || 1,
                            expectedConfigDeadline: (game as { config_deadline?: string | null }).config_deadline,
                          });
                          await fetchGameData();
                        } catch (error) {
                          console.error('[3-5-7 SETUP DECLINE] Authoritative transition failed:', error);
                          toast({
                            title: 'Could not sit out',
                            description: error instanceof Error ? error.message : 'The server rejected the setup handoff.',
                            variant: 'destructive',
                          });
                        }
                        return;
                      }
                      
                      console.log('[SIT OUT] Dealer sitting out from game selection');
                      
                      // Step 1: Mark dealer as sitting out
                      await supabase
                        .from('players')
                        .update({
                          sitting_out: true,
                          sit_out_next_hand: false,
                          waiting: false
                        })
                        .eq('id', dealerPlayer.id);
                      
                      // Step 2: Evaluate all player states AFTER marking sitting out
                      const { activePlayerCount, activeHumanCount, eligibleDealerCount } = 
                        await evaluatePlayerStatesEndOfGame(gameId);
                      
                      console.log('[SIT OUT] After evaluation - active:', activePlayerCount, 
                        'active humans:', activeHumanCount, 'eligible dealers:', eligibleDealerCount);
                      
                      // A real-money setup exit is a server-owned lifecycle
                      // boundary. One human returns to post-game waiting; zero
                      // humans closes exactly once from final snapshots.
                      if (activeHumanCount < 1 || activePlayerCount < 2) {
                        if (game?.real_money) {
                          const outcome = await resolvePostgameParticipation(gameId);
                          console.log('[SIT OUT] Postgame participation outcome:', outcome);
                          await fetchGameData();
                          return;
                        }

                        console.log('[SIT OUT] Not enough players to continue - reverting to waiting');
                        
                        // Session hygiene + keep passive sit-outs seated (no status='left').
                        await sanitizePlayerAutomationStateForSession(gameId);
                        await clearDealerGameTransientSessionState(gameId);
                        
                        // Revert to waiting status
                        await supabase
                          .from('games')
                          .update({
                            status: 'waiting',
                            awaiting_next_round: false,
                            last_round_result: null,
                            config_deadline: null,
                            game_type: null
                          })
                          .eq('id', gameId);
                        
                        await fetchGameData();
                        return;
                      }

                      // Need an eligible dealer to continue even when two or
                      // more players remain. This is not a session-end path.
                      if (eligibleDealerCount < 1) {
                        await sanitizePlayerAutomationStateForSession(gameId);
                        await clearDealerGameTransientSessionState(gameId);
                        await supabase
                          .from('games')
                          .update({
                            status: 'waiting',
                            awaiting_next_round: false,
                            last_round_result: null,
                            config_deadline: null,
                            game_type: null,
                          })
                          .eq('id', gameId);
                        await fetchGameData();
                        return;
                      }
                      
                      // Step 4: We have enough players - rotate dealer to next eligible player
                      const newDealerPosition = await rotateDealerPosition(gameId, game.dealer_position || 1);
                      console.log('[SIT OUT] Rotating dealer to position:', newDealerPosition);
                      
                      // Set new dealer position and reset to game selection
                      const setupSeconds = Math.max(1, game?.game_setup_timer_seconds ?? 30);
                      const configDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();
                      
                      // Topology normalization at the next-dealer-game bootstrap boundary.
                      recordNormalizationDbg({ kind: 'call-site', caller: 'DealerConfig sitout#1', didInvokeNormalizer: true, statusTransition: '→game_selection' });
                      try { await normalizeTwoPlayerSeatsIfNeeded(gameId, 'DealerConfig sitout#1'); }
                      catch (e) { console.error('[SIT OUT → game_selection] normalize threw:', e); }

                      await supabase
                        .from('games')
                        .update({
                          dealer_position: newDealerPosition,
                          config_deadline: configDeadline,
                          config_complete: false,
                          game_type: null
                        })
                        .eq('id', gameId);
                      
                      await fetchGameData();
                    }}
                  />
                )}
                {/* Observer lifecycle messaging during DealerGameSetup
                    is owned by `SessionLifecycleAnnouncer` and emitted
                    into the canonical shell announcement rail (see the
                    `dealer_configuring` ambient). The earlier
                    absolute-positioned <LifecycleAnnouncement /> plate
                    here floated above the shell-owned felt and is
                    intentionally removed — lifecycle messaging belongs
                    in the rail, not the table region. */}
              </div>
            /* Phase 1: A3 terminal/win-animation sibling table. The fragile
               hand-curated game-type denylist (cribbage/gin-rummy/horses/SCC)
               that previously protected this branch has been replaced with
               the canonical registry check `!isCanonicalShellFamily(...)`.
               This prevents the duplicate-table regression class from
               recurring whenever a new game is added to the canonical
               shell family — adding it to CANONICAL_SHELL_FAMILY alone is
               now sufficient to keep this sibling branch from coexisting
               with the canonical slot. `!_treatAsCanonicalRoute` remains
               as the primary route-stable gate. */
            ) : (!_treatAsCanonicalRoute && !isCanonicalShellFamily(game.game_type) && !_isPokerShellPersistent && (game.status === 'game_over' || game.status === 'session_ended' || (is357WinAnimationActive && game.game_type !== 'holm-game') || horsesWinPotTriggerId) && (!game.last_round_result || !game.last_round_result.includes('Chucky beat'))) ? (
              <div className="relative">
                <MobileGameTable key={gameId ?? 'unknown-game'} sessionEndedPhase={_sessionEndedTableActive}
                    instanceLabel="game-over-or-win-anim-ungated"
                    currentRoundNotReadyForPresentation={currentRoundNotReadyForPresentation}
                    gameId={gameId}
                    players={is357GameType && threeFiveSevenView ? threeFiveSevenPlayers : holmPlayers}
                    currentUserId={user?.id}
                    pot={potForDisplay}
                    currentRound={game.current_round || 0}
                    allDecisionsIn={true}
                    playerCards={playerCardsForPresentation}
                    timeLeft={null}
                    lastRoundResult={game.last_round_result ?? null}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value ?? 0}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                    communityCards={game.game_type === 'holm-game' ? ((holmView?.communityCards as CardType[] | undefined) ?? []) : (currentRound?.community_cards as CardType[] | undefined)}
                    communityCardsRevealed={effectiveCommunityCardsRevealed}
                    chuckyCards={chuckyCardsForPresentation}
                    chuckyCardsRevealed={chuckyCardsRevealedForPresentation}
                    chuckyActive={chuckyActiveForPresentation}
                    gameType={game.game_type}
                    gameStatus={(is357WinAnimationActive && game.game_type !== 'holm-game') ? 'game_over' : game.status}
                    roundStatus={holmView?.roundStatus}
                    isGameOver={game.status === 'game_over' || game.status === 'session_ended' || !!game.game_over_at}
                    isDealer={isDealer || (dealerPlayer?.is_bot && allowBotDealers) || false}
                    onNextGame={handleDealerConfirmGameOver}
                    chatBubbles={chatBubbles}
                    allMessages={allMessages}
                    onSendChat={sendChatMessage}
                    isChatSending={isChatSending}
                    getPositionForUserId={getPositionForUserId}
                    onLeaveGameNow={handleLeaveGameNow}
                    holmWinPotTriggerId={holmWinPotTriggerId}
                    onTerminalPresentationActiveChange={handleTerminalPresentationActiveChange}
                    holmWinPotAmount={holmWinPotAmount}
                    holmWinWinnerPosition={holmWinWinnerPosition}
                    holmWinWinnerPositions={holmWinWinnerPositions}
                    onHolmWinPotAnimationComplete={handleHolmWinPotAnimationComplete}
                    horsesWinPotTriggerId={horsesWinPotTriggerId}
                    horsesWinPotAmount={horsesWinPotAmount || cachedPotForHorsesWinRef.current}
                    horsesWinWinnerPosition={horsesWinWinnerPosition}
                    onHorsesWinPotAnimationComplete={() => {
                      console.log('[HORSES WIN] Animation complete, transitioning to next game');
                      setHorsesWinPotTriggerId(null);
                      cachedPotForHorsesWinRef.current = 0;
                      handleGameOverComplete();
                    }}
                    threeFiveSevenWinTriggerId={threeFiveSevenWinTriggerId}
                    threeFiveSevenWinPotAmount={threeFiveSevenWinPotAmount}
                    threeFiveSevenWinnerId={threeFiveSevenWinnerId}
                    threeFiveSevenWinnerCards={threeFiveSevenWinnerCards}
                    threeFiveSevenCachedLegPositions={cachedLegPositions}
                    onThreeFiveSevenWinAnimationStarted={handleThreeFiveSevenWinAnimationStarted}
                    onThreeFiveSevenWinAnimationComplete={handleThreeFiveSevenWinAnimationComplete}
                    threeFiveSevenTerminalDescriptor={terminal357Descriptor}
                    externalShowdownCardsCache={showdownCardsCacheRef}
                    externalShowdownRoundNumber={showdownRoundNumberRef}
                    externalCommunityCardsCache={communityCardsCacheRef}
                    externalCommunityCacheEpoch={communityCacheEpoch}
                    handContextId={handContextKey}
                    winner357ShowCards={winner357ShowCards}
                    onWinner357ShowCards={handleWinner357ShowCards}
                    rabbitHunt={game.rabbit_hunt ?? false}
                    activeTab={mobileActiveTab}
                    onActiveTabChange={setMobileActiveTab}
                    hasUnreadMessages={mobileHasUnreadMessages}
                    onHasUnreadMessagesChange={setMobileHasUnreadMessages}
                    lastSeenChatMessageId={lastSeenChatMessageId}
                    onLastSeenChatMessageIdChange={setLastSeenChatMessageId}
                    lastReadChatMessageId={lastReadChatMessageId}
                    onLastReadChatMessageIdChange={setLastReadChatMessageId}
                    latestRealtimeChatMessage={latestRealtimeMessage}
                    chatInputValue={mobileChatInput}
                    onChatInputChange={setMobileChatInput}
                  />
              </div>
            ) : null}
          </>
        )}


        {game.status === 'completed' && (
          <Card className="border-poker-gold border-4">
            <CardHeader>
              <CardTitle className="text-center text-3xl text-poker-gold">Game Over!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-poker-gold/20 p-6 rounded-lg border-2 border-poker-gold/60">
                <p className="text-poker-gold font-bold text-2xl text-center">
                  {(game as any).last_round_result || 'Game completed'}
                </p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Final Standings:</h3>
                {players
                  .sort((a, b) => b.legs - a.legs || b.chips - a.chips)
                  .map((p, index) => (
                    <div 
                      key={p.id}
                      className={`flex justify-between items-center p-3 rounded ${
                        index === 0 ? 'bg-poker-gold/20 border border-poker-gold' : 'bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="text-2xl">🏆</span>}
                        <span className={index === 0 ? 'font-bold text-poker-gold' : ''}>
                          {p.is_bot ? getBotAlias(players, p.user_id) : (p.profiles?.username || `Player ${p.position}`)}
                          {p.is_bot && ' 🤖'}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          {p.legs} legs
                        </Badge>
                        <Badge variant="outline" className={p.chips < 0 ? 'text-red-500' : ''}>${formatChipValue(p.chips)}</Badge>
                      </div>
                    </div>
                  ))}
              </div>
              
              <div className="flex gap-2 justify-center">
                <Button onClick={() => navigate('/')} variant="outline">
                  Back to Lobby
                </Button>
              </div>
            </CardContent>
          </Card>
        )}



        {(
          game.status === 'ante_decision' ||
          game.status === 'in_progress' ||
          game.status === 'cribbage_dealer_selection' ||
          (game.status === 'dealer_selection' && game.game_type === 'gin-rummy') ||
          (game.status === 'game_over' && (game.game_type === 'cribbage' || game.game_type === 'gin-rummy' || game.game_type === 'yahtzee')) ||
          // TERMINAL-PRESENTATION HOLD (shared seam). This gate — not the
          // per-family branch selector inside the slot — is the first owner
          // that removed the gameplay surface on a LAST HAND win: the
          // authoritative status goes straight to `session_ended`, no clause
          // here matched, and the whole PlayfieldSlotController subtree
          // (felt content, seat ring, local + remote HUD stacks, pot/chip
          // destination anchors) physically unmounted while the shell-owned
          // overlay layers kept animating. Keeping the SAME slot mounted
          // preserves the existing instances and keys.
          _terminalPresentationHold ||
          // SESSION ENDED TABLE PHASE (shared). Same mounted slot, gameplay
          // children retired via `isTerminalSessionEndHandoff`.
          _sessionEndedTableActive ||

          // Phase 7 fix (inter-game continuity): keep the slot controller
          // continuously mounted across the inter-game lifecycle window
          // for the poker-variant family so the NeutralInterstitial
          // actually bridges dealer-game rollovers (game_over →
          // game_selection → configuring → ante_decision → in_progress)
          // instead of the controller being physically unmounted between
          // dealer games — which is what caused the full-screen black
          // flash regression. Explicitly EXCLUDES pre-session statuses
          // ('waiting' lobby, pre-seat observer flows): those lifecycle
          // surfaces remain siblings outside the slot per the approved
          // Phase 7 ownership contract.
          (_treatAsCanonicalRoute && (
            game.status === 'game_selection' ||
            game.status === 'configuring' ||
            game.status === 'game_over' ||
            // Lifecycle continuity for poker-variant family during
            // session-start dealer high-card bootstrap. Without this,
            // the slot controller is unmounted during `dealer_selection`
            // and the shell loses NeutralInterstitial's bottom-panel
            // ShellHudChrome (rail + tab bar) — observed as the
            // dark/no-style transient between waiting and DealerGameSetup.
            (game.status === 'dealer_selection' && (supportsDealerSelectionOverlay(game.game_type) || _isPokerShellPersistent || _isCanonicalShellPersistent))
          ))
        ) && (
          // Phase 7: PlayfieldSlotController owns ONLY the active gameplay
          // surface. Lifecycle UI (lobby, waiting, dealer config/setup,
          // ante dialog, observer affordances) lives as siblings outside
          // this slot. Identity is keyed on (game_type, current_game_uuid)
          // so neutral interstitial only gates dealer-game rollovers
          // within a continuously-mounted gameplay phase.
          <PlayfieldSlotController
            desiredIdentity={(() => {
              const dgid = (game as any).current_game_uuid ?? null;
              const gtype = game.game_type ?? null;
              if (dgid && gtype) {
                return { gameType: gtype, dealerGameId: dgid };
              }
              // Dealer-game null is an explicit lifecycle boundary:
              // active gameplay is no longer mounted, but the canonical
              // shell/slot stage remains mounted and owns the neutral felt.
              // Do NOT stick the prior dealer identity here; doing so lets
              // terminal presentation survive into next-game setup and can
              // deadlock readiness when the same game is selected again.
              return null;
            })()}
            gameId={gameId ?? null}
            readinessScope={game.game_type === 'gin-rummy' ? (currentRound?.id ?? null) : null}
            persistentChildrenKey={(_isPokerShellPersistent || _isCanonicalShellPersistent) ? (gameId ?? null) : null}
            // ORDINARY-WIN CONTINUITY (Defect A owner). This flag makes the
            // slot controller render NeutralInterstitial *exclusively* —
            // it drops the persistent gameplay children entirely. The old
            // predicate (holm + game_over + current_game_uuid == null) is
            // ALSO true for every ordinary dealer-game rollover, so the
            // table physically unmounted for the whole game_over →
            // game_selection gap and remounted at next-game setup. Scope it
            // to a real authoritative session end, and never while a
            // terminal presentation is still running locally.
            // SESSION ENDED TABLE PHASE: the exclusive handoff branch drops
            // the persistent gameplay children — which are the owners of the
            // canonical HUD stack (ShellHudChrome/ShellHudGrid), tab rail,
            // chat pane and hand-history pane. The Session Ended phase is a
            // canonical TABLE phase, so it keeps the normal mounted children
            // (gameplay artifacts are already retired at `session_ended`) and
            // must NOT enter the exclusive handoff.
            isTerminalSessionEndHandoff={
              (game?.game_type === 'holm-game' &&
                game?.status === 'game_over' &&
                (game as any)?.current_game_uuid == null &&
                (game as any)?.pending_session_end === true &&
                !_terminalPresentationHold)
            }



            neutralActiveTab={mobileActiveTab}
            onNeutralActiveTabChange={setMobileActiveTabWithTrace}
            neutralParticipants={players as any}
            neutralCurrentUserId={user?.id ?? null}
            neutralParticipantGameType={game.game_type ?? null}
            preGameOverlay={(_isPokerShellPersistent || _isCanonicalShellPersistent) ? (
              <>
                {/* HighCardDealerSelection overlay — bootstrap dealer
                    selection for any persistent shell (poker-variant
                    family AND canonical-shell family: cribbage / gin /
                    yahtzee). Single phase machine: games.status ===
                    'dealer_selection' ALWAYS mounts this controller, so
                    dealer_selection_state gets written and selectDealer()
                    advances the lifecycle to game_selection → ante. */}
                {game.status === 'dealer_selection' && (
                  <HighCardDealerSelection
                    gameId={gameId!}
                    players={players}
                    onComplete={selectDealer}
                    isHost={isCreator}
                    allowBotDealers={allowBotDealers}
                    syncedState={(game as any).dealer_selection_state ?? null}
                    onCardsUpdate={setDealerSelectionCards}
                    onWinnerPositionUpdate={setDealerSelectionWinnerPosition}
                    cribTraceGating={{
                      mountSite: 'Game.tsx:persistent-shell-preGameOverlay',
                      gameStatus: game.status,
                      currentRoundId: currentRound?.id ?? null,
                      gameType: game.game_type ?? null,
                    }}
                  />
                )}
                {/* DealerGameSetup overlay — gated on poker-shell only;
                    canonical-shell games (cribbage/gin/yahtzee) reach
                    DealerGameSetup through their dedicated waiting/setup
                    branch above, so do not duplicate the mount here. */}
                {_isPokerShellPersistent &&
                  (game.status === 'game_selection' ||
                  game.status === 'configuring' ||
                  // `session_ended` is a terminal table phase, never a
                  // setup continuation. A connected player can still occupy
                  // the prior dealer seat when the session closes.
                  (game.status === 'game_over' && !(game as any).config_complete)) &&
                  !is357WinAnimationActive && !horsesWinPotTriggerId &&
                  (isDealer || (dealerPlayer?.is_bot && allowBotDealers)) && (
                  <DealerGameSetup
                    gameId={gameId!}
                    dealerUsername={dealerPlayer?.is_bot ? getBotAlias(players, dealerPlayer.user_id) : (dealerPlayer?.profiles?.username || '')}
                    isBot={dealerPlayer?.is_bot || false}
                    dealerPlayerId={dealerPlayer?.id || ''}
                    dealerPosition={game.dealer_position || 1}
                    configDeadline={game.config_deadline ?? null}
                    previousGameType={(previousGameConfig?.game_type ?? game.game_type) || undefined}
                    previousGameConfig={previousGameConfig}
                    sessionGameConfigs={sessionGameConfigs}
                    isFirstHand={!hasSessionHistory && !previousGameConfig}
                    gameSetupTimerSeconds={game.game_setup_timer_seconds || 30}
                    anteDecisionTimerSeconds={game.ante_decision_timer_seconds || 30}
                    activePlayerCount={players.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left').length}
                    activeHumanCount={players.filter(p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left' && !p.is_bot).length}
                    onConfigComplete={handleConfigComplete}
                    onSessionEnd={() => setShowEndSessionDialog(true)}
                    onSitOut={async () => {
                      if (!dealerPlayer?.id || !gameId) return;
                      if (is357GameType) {
                        try {
                          await declineThreeFiveSevenSetup({
                            gameId,
                            expectedDealerPosition: game.dealer_position || 1,
                            expectedConfigDeadline: (game as { config_deadline?: string | null }).config_deadline,
                          });
                          await fetchGameData();
                        } catch (error) {
                          console.error('[3-5-7 SETUP DECLINE] Authoritative transition failed:', error);
                          toast({
                            title: 'Could not sit out',
                            description: error instanceof Error ? error.message : 'The server rejected the setup handoff.',
                            variant: 'destructive',
                          });
                        }
                        return;
                      }
                      await supabase
                        .from('players')
                        .update({ sitting_out: true, sit_out_next_hand: false, waiting: false })
                        .eq('id', dealerPlayer.id);
                      const { activePlayerCount, activeHumanCount, eligibleDealerCount } =
                        await evaluatePlayerStatesEndOfGame(gameId);
                      if (activeHumanCount < 1 || activePlayerCount < 2) {
                        if (game?.real_money) {
                          const outcome = await resolvePostgameParticipation(gameId);
                          console.log('[DEALER SETUP] Postgame participation outcome:', outcome);
                          await fetchGameData();
                          return;
                        }

                        await sanitizePlayerAutomationStateForSession(gameId);
                        await clearDealerGameTransientSessionState(gameId);
                        await supabase
                          .from('games')
                          .update({
                            status: 'waiting',
                            awaiting_next_round: false,
                            last_round_result: null,
                            config_deadline: null,
                            game_type: null,
                          })
                          .eq('id', gameId);
                        await fetchGameData();
                        return;
                      }
                      if (eligibleDealerCount < 1) {
                        await sanitizePlayerAutomationStateForSession(gameId);
                        await clearDealerGameTransientSessionState(gameId);
                        await supabase
                          .from('games')
                          .update({
                            status: 'waiting',
                            awaiting_next_round: false,
                            last_round_result: null,
                            config_deadline: null,
                            game_type: null,
                          })
                          .eq('id', gameId);
                        await fetchGameData();
                        return;
                      }
                      const newDealerPosition = await rotateDealerPosition(gameId, game.dealer_position || 1);
                      const setupSeconds = Math.max(1, game?.game_setup_timer_seconds ?? 30);
                      const configDeadline = new Date(Date.now() + setupSeconds * 1000).toISOString();
                      // Topology normalization at the next-dealer-game bootstrap boundary.
                      recordNormalizationDbg({ kind: 'call-site', caller: 'DealerConfig sitout#2', didInvokeNormalizer: true, statusTransition: '→game_selection' });
                      try { await normalizeTwoPlayerSeatsIfNeeded(gameId, 'DealerConfig sitout#2'); }
                      catch (e) { console.error('[SIT OUT#2 → game_selection] normalize threw:', e); }
                      await supabase
                        .from('games')
                        .update({
                          dealer_position: newDealerPosition,
                          config_deadline: configDeadline,
                          config_complete: false,
                          game_type: null,
                        })
                        .eq('id', gameId);
                      await fetchGameData();
                    }}
                  />
                )}
              </>
            ) : null}
            neutralGameKind={(() => {
              // Once the dealer-game's game_type is known (from current,
              // last-known, or previous config), publish it as the
              // neutral interstitial's gameKind so the felt adopts the
              // selected game's branding immediately (ante decisions,
              // dealer-selection, etc.) — not just at gameplay start.
              const t = _routeShellGameType;
              if (t === 'gin-rummy' || t === 'holm-game' || t === 'horses' || t === 'ship-captain-crew' || t === 'yahtzee' || t === 'cribbage') return t;
              if (t === '3-5-7' || t === '3-5-7-game' || t === '357') return 'three-five-seven';
              return null; // NeutralInterstitial falls back to a generic plate-less felt
            })()}
            neutralAnteAmount={game.ante_amount || 1}
            readyToMount={(() => {
              // Phase 7 readiness gate (narrow scope): only answer
              // "is the intended gameplay surface ready to paint a
              // stable first frame?". Default true for statuses where
              // the surface mounts pre-round (ante_decision, dealer
              // selection, configuring, game_selection, game_over for
              // non-round-bound branches). For in_progress / round-
              // bound game_over we require currentRound to be scoped
              // to the current dealer game — otherwise the surface
              // would mount with stale or empty round state.
              const dgid = (game as any).current_game_uuid ?? null;
              if (!dgid) {
                Promise.resolve().then(() => recordStartupValue('READINESS TIMELINE', 'PlayfieldSlotController readyToMount prop', true, {
                  file: 'src/pages/Game.tsx',
                  reason: 'no dealer game id',
                  gameStatus: game.status,
                }));
                return true;
              }
              const status = game.status;
              if (status === 'in_progress') {
                const ready = Boolean(
                  currentRound?.id &&
                  (currentRound as any).dealer_game_id === dgid
                );
                Promise.resolve().then(() => recordStartupValue('READINESS TIMELINE', 'PlayfieldSlotController readyToMount prop', ready, {
                  file: 'src/pages/Game.tsx',
                  reason: 'in_progress requires scoped currentRound',
                  currentRoundId: currentRound?.id ?? null,
                  currentRoundDealerGameId: (currentRound as any)?.dealer_game_id ?? null,
                  dealerGameId: dgid,
                }));
                return ready;
              }
              Promise.resolve().then(() => recordStartupValue('READINESS TIMELINE', 'PlayfieldSlotController readyToMount prop', true, {
                file: 'src/pages/Game.tsx',
                reason: 'pre-round status defaults ready',
                gameStatus: status,
                dealerGameId: dgid,
              }));
              return true;
            })()}
          >
            {(() => {
          const isInProgress = game.status === 'in_progress';
          const isYahtzeeGameOver =
            game.game_type === 'yahtzee' &&
            (game.status === 'game_over' || _terminalPresentationHold);
          const isAnteDecision = game.status === 'ante_decision';
          const isCribbageDealerSelection = game.status === 'cribbage_dealer_selection';
          const isGinRummyDealerSelection = game.status === 'dealer_selection' && game.game_type === 'gin-rummy';
          // LAST-HAND terminal presentation hold: on a final-hand win the
          // authoritative status goes straight to `session_ended` (never
          // through `game_over`), which previously dropped the cribbage
          // render branch mid-celebration. While the win sequence is still
          // presenting locally, admit the SAME cribbage branch so the table,
          // seat ring, HUD stacks and chip-transfer destination stay mounted.
          // Purely a render-admission widening — no status rewrite, no timer.
          const isCribbageGameOver =
            game.game_type === 'cribbage' &&
            (game.status === 'game_over' || _terminalPresentationHold);

          const isGinRummyGameOver =
            game.game_type === 'gin-rummy' &&
            (game.status === 'game_over' || _terminalPresentationHold);
          const isTerminalSlotPresentation =
            game.status === 'game_over' ||
            !!game.game_over_at ||
            terminalPresentationActive ||
            // Route-owned Holm LAST HAND hold: keeps the round context (and
            // therefore cards / pot / result props) alive from the first
            // `session_ended` render — before the trigger effect commits —
            // so the surface never blanks under the celebration.
            _terminalPresentationHold ||
            (is357WinAnimationActive && game.game_type !== 'holm-game') ||
            !!holmWinPotTriggerId ||
            !!horsesWinPotTriggerId;
          const renderRoundContext = isInProgress || isTerminalSlotPresentation;
          const hasActiveRound = renderRoundContext && Boolean(currentRound?.id);
          const effectiveRenderGameType = game.game_type ?? lastKnownGameTypeRef.current ?? previousGameConfig?.game_type ?? null;

          // ── FELT COMMITMENT TRACE (diagnostic-only) ────────────────────
          // Proves which lifecycle bucket the current frame falls into and
          // which metadata source the felt plate ought to draw from. Diff-
          // gated by a JSON key so the console stays readable.
          {
            const _status = game.status as string;
            const _currentDealerGameId = (game as any)?.current_game_uuid ?? null;
            const _configComplete = !!(game as any)?.config_complete;
            const _selectedGameType = game.game_type ?? null;
            const _selectedStakes = game.ante_amount ?? null;
            const _roundId = currentRound?.id ?? null;
            const _roundStatus = currentRound?.status ?? null;
            const _roundDealerGameId = (currentRound as any)?.dealer_game_id ?? null;

            // Lifecycle buckets:
            //  - SESSION_WAITING_TABLE: fresh waiting, no committed dealer game ever / not yet
            //  - DEALER_GAME_SETUP: enough players, picking next game (no committed lifecycle)
            //  - COMMITTED_DEALERGAME: dealer_selection → win presentation
            const _committedLifecycleStatuses = new Set([
              'ante_decision', 'in_progress', 'game_over',
              'dealer_selection', 'cribbage_dealer_selection',
            ]);
            const _setupLifecycleStatuses = new Set([
              'configuring', 'game_selection',
            ]);
            const _isSessionWaitingTable =
              (_status === 'waiting' || _status === 'waiting_for_players') &&
              !_currentDealerGameId;
            const _isDealerGameSetup =
              _setupLifecycleStatuses.has(_status as any) ||
              ((_status === 'waiting' || _status === 'waiting_for_players') && !!_currentDealerGameId === false && false) ||
              // post-game return-to-brand: status reverted but stale id may linger
              ((_status === 'waiting' || _status === 'waiting_for_players') && !!(game as any)?.game_over_at);
            const _hasCommittedDealerGameForCurrentLifecycle =
              _committedLifecycleStatuses.has(_status as any) &&
              !!_currentDealerGameId &&
              _configComplete &&
              // round (if present) must scope to the committed dealer game
              (!_roundId || !_roundDealerGameId || _roundDealerGameId === _currentDealerGameId);

            // ---------- committedDealerGameReason FIRST ----------
            // Single semantic phase derived from server-authoritative
            // status (+ teardown hint). This is the source of truth;
            // every other bucket (sessionPhase, displayPlate,
            // feltPlateMode) is derived FROM this. No UNRESOLVED bucket.
            let _committedReason: 'waiting_for_players' | 'game_selection' | 'dealer_selection' | 'ante_decision' | 'in_progress' | 'game_over' | 'teardown' | 'unknown';
            if (_isSessionWaitingTable) {
              _committedReason = 'waiting_for_players';
            } else if (_status === 'configuring' || _status === 'game_selection') {
              _committedReason = 'game_selection';
            } else if ((_status === 'waiting' || _status === 'waiting_for_players') && !!(game as any)?.game_over_at) {
              _committedReason = 'teardown';
            } else if (_status === 'dealer_selection' || _status === 'cribbage_dealer_selection') {
              _committedReason = 'dealer_selection';
            } else if (_status === 'ante_decision') {
              _committedReason = 'ante_decision';
            } else if (_status === 'in_progress') {
              _committedReason = 'in_progress';
            } else if (_status === 'game_over') {
              _committedReason = 'game_over';
            } else {
              _committedReason = 'unknown';
            }

            // Phase bucket — derived from reason. Mirrors what
            // `deriveFeltPlateMode()` does for the actual felt: any
            // committed lifecycle status maps to COMMITTED_DEALERGAME
            // regardless of whether configComplete / round scoping
            // have caught up yet. Those checks remain meaningful for
            // gameplay wiring (_hasCommittedDealerGameForCurrentLifecycle
            // below) but they MUST NOT produce a felt-phase taxonomy
            // hole.
            const _COMMITTED_REASONS = new Set([
              'dealer_selection', 'ante_decision', 'in_progress', 'game_over',
            ]);
            const _BRAND_REASONS = new Set([
              'waiting_for_players', 'game_selection', 'teardown',
            ]);
            const _sessionPhase: 'SESSION_WAITING_TABLE' | 'DEALER_GAME_SETUP' | 'COMMITTED_DEALERGAME' | 'UNRESOLVED' =
              _committedReason === 'waiting_for_players' ? 'SESSION_WAITING_TABLE'
              : (_committedReason === 'game_selection' || _committedReason === 'teardown') ? 'DEALER_GAME_SETUP'
              : _COMMITTED_REASONS.has(_committedReason) ? 'COMMITTED_DEALERGAME'
              : 'UNRESOLVED'; // only reachable via _committedReason === 'unknown'

            const _displayPlate: 'BRAND' | 'GAME' | 'AMBIGUOUS' =
              _COMMITTED_REASONS.has(_committedReason) ? 'GAME'
              : _BRAND_REASONS.has(_committedReason) ? 'BRAND'
              : 'AMBIGUOUS';

            const _feltPlateMode: 'P-TOWN' | 'GAME_NAME' | 'AMBIGUOUS' =
              _displayPlate === 'GAME' ? 'GAME_NAME'
              : _displayPlate === 'BRAND' ? 'P-TOWN'
              : 'AMBIGUOUS';
            const _metadataSource =
              _displayPlate === 'GAME' ? 'games.game_type + games.ante_amount (committed)'
              : _displayPlate === 'BRAND' ? 'brand (no committed lifecycle)'
              : 'unresolved';
            const _fallbackReason = _displayPlate === 'AMBIGUOUS'
              ? `unknown-status=${_status} gtype=${_selectedGameType} ante=${_selectedStakes} cfg=${_configComplete}`
              : null;

            const _trace = {
              status: _status,
              sessionPhase: _sessionPhase,
              dealerGameState: '(client lacks dealer_games row — see currentDealerGameId)',
              currentDealerGameId: _currentDealerGameId,
              selectedDealerGame: _selectedGameType,
              selectedStakes: _selectedStakes,
              lastCompletedDealerGame: (game as any)?.game_over_at ?? null,
              roundId: _roundId,
              roundStatus: _roundStatus,
              roundDealerGameId: _roundDealerGameId,
              configComplete: _configComplete,
              isSessionWaitingTable: _isSessionWaitingTable,
              isDealerGameSetup: _isDealerGameSetup,
              hasCommittedDealerGameForCurrentLifecycle: _hasCommittedDealerGameForCurrentLifecycle,
              feltPlateMode: _feltPlateMode,
              feltGameName: _feltPlateMode === 'GAME_NAME' ? _selectedGameType : 'P-Town Poker',
              feltStakes: _feltPlateMode === 'GAME_NAME' ? _selectedStakes : null,
              // What the CURRENT code actually does (legacy contract):
              currentCodeWouldPublish: {
                isWaitingPhase: !renderRoundContext,
                gameKind: effectiveRenderGameType,
                anteAmount: game.ante_amount ?? 0,
              },
              metadataSource: _metadataSource,
              fallbackReason: _fallbackReason,
            };
            const _key = JSON.stringify(_trace);
            const _w: any = typeof window !== 'undefined' ? window : {};
            if (_w.__feltCommitTraceKey !== _key) {
              _w.__feltCommitTraceKey = _key;
              // eslint-disable-next-line no-console
              console.info('[FELT COMMITMENT TRACE]', _trace);
              try {
                const _hasRound = !!_roundId;
                // BRAND plate always shows P-TOWN POKER, ignoring any
                // stale selectedDealerGame/selectedStakes — those
                // remain visible in the pill as diagnostic context
                // only and CANNOT influence display.
                const _displayGame = _displayPlate === 'GAME'
                  ? String(_selectedGameType ?? '').toUpperCase()
                  : 'P-TOWN POKER';
                const _displayStakes = _displayPlate === 'GAME' && _selectedStakes != null
                  ? `$${_selectedStakes}`
                  : 'none';
                const _legacyIsWaiting = !renderRoundContext;
                const _legacyFallback = _legacyIsWaiting && _hasCommittedDealerGameForCurrentLifecycle
                  ? 'isWaitingPhase=true (legacy: !renderRoundContext)'
                  : (_legacyIsWaiting ? 'isWaitingPhase=true' : 'none');
                // EXPLICIT FELT PLATE CONTRACT (post-fix):
                // Every publisher sends `feltPlateMode`; the shell
                // felt reads ONLY that. `isWaitingPhase` can no longer
                // influence plate selection.
                const _legacyCanInfluence = false;
                feltDebugRecord({
                  phase: _sessionPhase,
                  status: _status,
                  committedDealerGameReason: _committedReason,
                  isSessionWaitingTable: _isSessionWaitingTable,
                  hasCommittedDealerGame: _hasCommittedDealerGameForCurrentLifecycle,
                  hasRoundContext: _hasRound,
                  selectedDealerGame: _selectedGameType,
                  selectedStakes: _selectedStakes,
                  displayPlate: _displayPlate,
                  displayGame: _displayGame,
                  displayStakes: _displayStakes,
                  gameSource: _displayPlate === 'GAME' ? 'games.game_type' : 'brand',
                  stakesSource: _displayPlate === 'GAME' && _selectedStakes != null ? 'games.ante_amount' : 'brand',
                  fallbackReason: _legacyFallback,
                  legacyIsWaitingPhase: _legacyIsWaiting,
                  legacyCanInfluenceFeltPlate: _legacyCanInfluence,
                });
              } catch { /* noop */ }
            }
          }


          Promise.resolve().then(() => {
            recordStartupValue('IDENTITY TIMELINE', 'effectiveRenderGameType', effectiveRenderGameType, { file: 'src/pages/Game.tsx' });
            recordStartupValue('IDENTITY TIMELINE', 'render propRoundId precursor', currentRound?.id ?? null, { file: 'src/pages/Game.tsx', renderRoundContext, hasActiveRound });
            recordStartupValue('READINESS TIMELINE', 'render hasActiveRound', hasActiveRound, { file: 'src/pages/Game.tsx', renderRoundContext });
          });

          // SHELL LC: comparative branch-selector instrumentation.
          // Pre-compute which IIFE return branch will win so we can prove
          // the Gin-specific delta vs Cribbage/Yahtzee at the
          // dealer_selection → ante_decision transition.
          {
            const _isDiceGameOverProbe = game.status === 'game_over' && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew');
            const _isGinRummyConfiguringProbe = (game.status === 'configuring' || game.status === 'game_selection') && effectiveRenderGameType === 'gin-rummy';
            let _selectedBranch = 'fallback:MobileGameTable(main-in-progress-gated)';
            if (game.game_type === 'cribbage' && (isCribbageDealerSelection || isAnteDecision || isInProgress || isCribbageGameOver)) {
              _selectedBranch = 'cribbage:CribbageMobileGameTable';
            } else if (effectiveRenderGameType === 'gin-rummy' && (_isGinRummyConfiguringProbe || isGinRummyDealerSelection || isAnteDecision || isInProgress || isGinRummyGameOver)) {
              _selectedBranch = 'gin:GinRummyGameTable';
            } else if ((isInProgress || isAnteDecision || _isDiceGameOverProbe || !!horsesWinPotTriggerId) && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew')) {
              _selectedBranch = 'dice:MobileGameTable(cribbage-or-special)';
            } else if (game.game_type === 'yahtzee' && (isAnteDecision || isInProgress || isYahtzeeGameOver)) {
              _selectedBranch = 'yahtzee:YahtzeeGameTable';
            }
            _shellLogIfChanged('Game.IIFE.branch', _selectedBranch, {
              gameStatus: game.status,
              gameType: game.game_type,
              effectiveRenderGameType,
              lastKnownGameType: lastKnownGameTypeRef.current,
              previousConfigGameType: previousGameConfig?.game_type ?? null,
              isAnteDecision,
              isInProgress,
              isGinRummyDealerSelection,
              isCribbageDealerSelection,
              hasCurrentRound: Boolean(currentRound?.id),
              currentRoundDealerGameId: (currentRound as any)?.dealer_game_id ?? null,
              currentDealerGameId: (game as any).current_game_uuid ?? null,
            });
          }

          // CRIBBAGE — unified single instance across ALL session phases
          // One persistent CribbageMobileGameTable prevents physical unmount/remount during
          // bootstrap transitions (ante_decision → dealer_selection → in_progress → game_over)
          if (game.game_type === 'cribbage' && (isCribbageDealerSelection || isAnteDecision || isInProgress || isCribbageGameOver)) {
            // Authoritative dealer-game id lives on the games row (persistent
            // across the resume window). Prefer it over `currentRound.dealer_game_id`
            // so a transiently-empty rounds list on visibility/reconnect resume
            // cannot render a null dealerGameId over a valid in-progress identity.
            const _authDealerGameIdRaw = (game as any).current_game_uuid ?? null;
            const _preservedCrib = lastValidCribbageIdentityRef.current;
            const _preservedApplies = !!(
              _preservedCrib &&
              gameId &&
              _preservedCrib.gameId === gameId &&
              _authDealerGameIdRaw &&
              _preservedCrib.dealerGameId === _authDealerGameIdRaw &&
              isInProgress
            );

            // In-progress / game-over branch: authoritative round id, with a
            // narrow same-scope preservation fallback used ONLY when the
            // authoritative round row has not yet re-landed post-resume.
            let cribbageRoundId = '';
            let cribbageDealerGameId: string | null = null;
            let cribbageHandNumber = isAnteDecision ? 0 : (currentRound?.hand_number ?? 1);
            if (isInProgress || isCribbageGameOver) {
              const liveRoundId = currentRound?.id || '';
              const liveDealerGameId = (currentRound as any)?.dealer_game_id ?? _authDealerGameIdRaw ?? null;
              if (liveRoundId && liveDealerGameId) {
                cribbageRoundId = liveRoundId;
                cribbageDealerGameId = liveDealerGameId;
                // Refresh preserved identity (same-scope only).
                if (gameId && liveDealerGameId) {
                  lastValidCribbageIdentityRef.current = {
                    gameId,
                    dealerGameId: liveDealerGameId,
                    roundId: liveRoundId,
                    handNumber: currentRound?.hand_number ?? null,
                  };
                }
              } else if (_preservedApplies && _preservedCrib) {
                // Use preserved identity only during the resume hydration window.
                cribbageRoundId = _preservedCrib.roundId;
                cribbageDealerGameId = _preservedCrib.dealerGameId;
                if (typeof _preservedCrib.handNumber === 'number') {
                  cribbageHandNumber = _preservedCrib.handNumber;
                }
              } else {
                cribbageRoundId = liveRoundId;
                cribbageDealerGameId = liveDealerGameId;
              }
            } else {
              cribbageDealerGameId = game.current_game_uuid || null;
              // Not in-progress → clear preservation so stale IDs cannot
              // survive a genuine lifecycle boundary (rotation / game_over /
              // session reset / return to waiting).
              lastValidCribbageIdentityRef.current = null;
            }
            // Also clear if the authoritative dealer-game rotated.
            if (
              lastValidCribbageIdentityRef.current &&
              _authDealerGameIdRaw &&
              lastValidCribbageIdentityRef.current.dealerGameId !== _authDealerGameIdRaw
            ) {
              lastValidCribbageIdentityRef.current = null;
            }

            const cribbagePot = isCribbageGameOver ? 0 : (isInProgress ? potForDisplay : 0);

            // Persistent-owner provenance capture (one-shot at first hydrated render).
            // Uses the raw authoritative (current_game_uuid, currentRound.hand_number)
            // pair — same fields the DB advances when a new dealer game or hand is
            // created — so the "baseline" reflects exactly what was present at route
            // entry regardless of transient bootstrap/phase state.
            if (!initialCribbageIdentityRef.current.captured) {
              initialCribbageIdentityRef.current = {
                captured: true,
                dealerGameId: (game as any).current_game_uuid ?? null,
                handNumber: currentRound?.hand_number ?? null,
              };
            }
            const _cribBaseline = initialCribbageIdentityRef.current;
            const _authDealerGameId = (game as any).current_game_uuid ?? null;
            const _authHandNumber = currentRound?.hand_number ?? null;
            const cribbageEntryMode: 'live-transition' | 'historical-entry' =
              _cribBaseline.captured &&
              _cribBaseline.dealerGameId !== null &&
              _cribBaseline.dealerGameId === _authDealerGameId &&
              _cribBaseline.handNumber !== null &&
              _cribBaseline.handNumber === _authHandNumber
                ? 'historical-entry'
                : 'live-transition';

            // ── HANDOFF TRACE #8: parent render branch with dealer-selection props ──
            emitCribbageHandoffTrace({
              gameId: gameId!,
              eventType: 'parent_render_branch',
              userId: user?.id ?? null,
              roundId: cribbageRoundId?.slice(0, 8) || null,
              context: {
                branch: isCribbageDealerSelection ? 'cribbage_dealer_selection'
                  : isAnteDecision ? 'cribbage_ante_decision'
                  : isCribbageGameOver ? 'cribbage_game_over'
                  : 'cribbage_in_progress',
                gameStatus: game.status,
                dealerGameId: cribbageDealerGameId?.slice(0, 8) ?? null,
                dealerPosition: game.dealer_position,
                currentRoundId: currentRound?.id?.slice(0, 8) ?? null,
                handNumber: currentRound?.hand_number ?? null,
                isDealerSelectionProp: isCribbageDealerSelection,
                hasHighCardDealerSelectionSibling: isCribbageDealerSelection,
                dealerSelectionCardsLen: dealerSelectionCards.length,
                dealerSelectionCardIds: toDealerSelectionCardIds(dealerSelectionCards),
                showAnteDialog,
              },
            });

            return (
              <CribbageMobileGameTable sessionEndedPhase={_sessionEndedTableActive}
                gameId={gameId!}
                roundId={cribbageRoundId}
                dealerGameId={cribbageDealerGameId}
                handNumber={cribbageHandNumber}
                entryMode={cribbageEntryMode}
                players={players}
                currentUserId={user?.id || ''}
                dealerPosition={game.dealer_position || 1}
                anteAmount={game.ante_amount || 1}
                pot={cribbagePot}
                isHost={isCreator}
                onGameComplete={handleGameOverComplete}
                onTerminalPresentationActiveChange={handleTerminalPresentationActiveChange}
                onTerminalPresentationComplete={markTerminalPresentationComplete}
                dealerChatMessages={cribbageDealerChatMessages}
                onInjectDealerChatMessage={injectCribbageDealerChatMessage}
                gameConfig={{
                  pointsToWin: game.points_to_win || 121,
                  skunkEnabled: game.skunk_enabled ?? true,
                  skunkThreshold: game.skunk_threshold || 91,
                  doubleSkunkEnabled: game.double_skunk_enabled ?? true,
                  doubleSkunkThreshold: game.double_skunk_threshold || 61,
                }}
                isDealerSelection={isCribbageDealerSelection}
                dealerSelectionCards={isCribbageDealerSelection ? dealerSelectionCards : undefined}
                dealerSelectionWinnerPosition={isCribbageDealerSelection ? dealerSelectionWinnerPosition : undefined}
                // ── Phase 2.1: session-level dealer-selection controller
                // is now hosted inside the slot child. Parent threads in
                // the synced state + state-update callbacks; no sibling
                // JSX mounts above the table.
                dealerSelectionSyncedState={
                  isCribbageDealerSelection
                    ? ((game as any).dealer_selection_state as DealerSelectionState | null)
                    : null
                }
                onDealerSelectionCardsUpdate={setDealerSelectionCards}
                onDealerSelectionWinnerPositionUpdate={(pos) => {
                  setDealerSelectionWinnerPosition(pos);
                  // ── HANDOFF TRACE #3: session-level ds winner position updated ──
                  emitCribbageHandoffTrace({
                    gameId: gameId!,
                    eventType: 'parent_ds_winner_position_update',
                    userId: user?.id ?? null,
                    context: { winnerPosition: pos },
                  });
                }}
                onDealerSelectionComplete={handleCribbageDealerSelectionComplete}
              />
            );
          }

          // GIN RUMMY — Gin-owned phases ONLY (active gameplay + terminal outcome).
          // Configuring / game_selection / dealer_selection / ante_decision are shell-owned
          // phases. Mounting Gin during them would leak old Gin state/refs/DealRuntime/portals
          // across dealer games. Run It Back is a fresh game launch — old Gin table must not
          // exist during shell-owned interstitial phases.
          if (effectiveRenderGameType === 'gin-rummy' && (isInProgress || isGinRummyGameOver)) {
            const _ginEffRoundId = currentRound?.id || '';
            const _ginEffDealerGameId = currentRound?.dealer_game_id || null;
            Promise.resolve().then(() => {
              recordStartupValue('IDENTITY TIMELINE', 'propRoundId available', _ginEffRoundId, {
                file: 'src/pages/Game.tsx',
                isInProgress,
                isGinRummyGameOver,
                gameStatus: game.status,
              });
              recordStartupValue('IDENTITY TIMELINE', 'dealerGameId prop available', _ginEffDealerGameId, {
                file: 'src/pages/Game.tsx',
                isInProgress,
                isGinRummyGameOver,
                gameStatus: game.status,
              });
            });
            return (
              <>

                <GinRummyGameTable
                  key={_ginEffDealerGameId ?? 'none'}
                  gameId={gameId!}
                  roundId={_ginEffRoundId}
                  dealerGameId={_ginEffDealerGameId}
                  handNumber={currentRound?.hand_number ?? 1}
                  players={players}
                  currentUserId={user?.id || ''}
                  dealerPosition={game.dealer_position || 1}
                  anteAmount={game.ante_amount || 1}
                  pot={potForDisplay}
                  isHost={isCreator}
                  onGameComplete={handleGameOverComplete}
                  onTerminalPresentationActiveChange={handleTerminalPresentationActiveChange}
                  onTerminalPresentationComplete={markTerminalPresentationComplete}
                  // Lifted mobile tab + chat compose state (single source of
                  // truth at Game.tsx). Gin table must NOT own its own
                  // activeTab: without this, seeding from persistence would
                  // force 'cards' on mount when ante wait had 'chat' active,
                  // and the chat compose draft would vanish on table remount.
                  activeTab={mobileActiveTab}
                  onActiveTabChange={setMobileActiveTab}
                  chatInputValue={mobileChatInput}
                  onChatInputChange={setMobileChatInput}
                />
              </>
            );
          }


          // DICE GAMES (Horses and Ship Captain Crew)
          // All users (mobile + desktop) route through MobileGameTable + useHorsesMobileController
          // for unified sync-gated gameplay. Desktop differences are handled by responsive sizing.
          // Terminal win animation is rendered here too. Keeping it inside
          // PlayfieldSlotController prevents the shared game-over sibling branch
          // from mounting a second MobileGameTable under the active dice table.
          const isDiceGameOver = game.status === 'game_over' && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew');
          if ((isInProgress || isAnteDecision || isDiceGameOver || !!horsesWinPotTriggerId) && (game.game_type === 'horses' || game.game_type === 'ship-captain-crew')) {
            const horsesState = currentRound?.horses_state as HorsesStateFromDB | null;
            const isDiceTerminalPresentation = isDiceGameOver || (!!horsesWinPotTriggerId && !isInProgress && !isAnteDecision);

            return (
              <MobileGameTable sessionEndedPhase={_sessionEndedTableActive}
                key={gameId ?? 'unknown-game'}
                instanceLabel="cribbage-or-special"
                currentRoundNotReadyForPresentation={currentRoundNotReadyForPresentation}
                gameId={gameId}
                players={players}
                currentUserId={user?.id}
                pot={potForDisplay}
                currentRound={game.current_round ?? 0}
                allDecisionsIn={isDiceTerminalPresentation}
                playerCards={[]}
                timeLeft={isInProgress ? timeLeft : (isAnteDecision ? anteTimeLeft : null)}
                maxTime={isInProgress ? (decisionMaxTime ?? decisionTimerSeconds) : undefined}
                lastRoundResult={(isInProgress || isDiceTerminalPresentation) ? ((game as any).last_round_result || null) : null}
                dealerPosition={game.dealer_position}
                legValue={game.leg_value ?? 0}
                legsToWin={game.legs_to_win || 3}
                potMaxEnabled={game.pot_max_enabled ?? true}
                potMaxValue={game.pot_max_value || 10}
                pendingSessionEnd={game.pending_session_end || false}
                awaitingNextRound={game.awaiting_next_round || false}
                gameType={game.game_type}
                roundStatus={currentRound?.status}
                isPaused={game.is_paused || false}
                anteAmount={game.ante_amount || 1}
                pussyTaxValue={game.pussy_tax_value || 1}
                gameStatus={game.status}
                anteAnimationTriggerId={anteAnimationTriggerId}
                anteAnimationExpectedPot={anteAnimationExpectedPot}
                preAnteChips={preAnteChips}
                expectedPostAnteChips={expectedPostAnteChips}
                onAnteAnimationStarted={() => {
                  setAnteAnimationTriggerId(null);
                  setAnteAnimationExpectedPot(null);
                  setPreAnteChips(null);
                  setExpectedPostAnteChips(null);
                }}
                chatBubbles={chatBubbles}
                allMessages={allMessages}
                onSendChat={sendChatMessage}
                isChatSending={isChatSending}
                isHost={isCreator}
                onPlayerClick={(player) => { setSelectedPlayer(player as Player); setShowPlayerOptions(true); }}
                getPositionForUserId={getPositionForUserId}
                onStay={() => {}}
                onFold={() => {}}
                onSelectSeat={handleSelectSeat}
                // Horses-specific state
                horsesRoundId={currentRound?.id || null}
                horsesState={horsesState}
                horsesDealerGameId={(game as any).current_game_uuid ?? null}
                horsesHandNumber={currentRound?.hand_number ?? null}
                isGameOver={isDiceTerminalPresentation}
                isDealer={isDiceTerminalPresentation ? (isDealer || (dealerPlayer?.is_bot && allowBotDealers) || false) : undefined}
                onNextGame={isDiceTerminalPresentation ? handleDealerConfirmGameOver : undefined}
                horsesWinPotTriggerId={horsesWinPotTriggerId}
                horsesWinPotAmount={horsesWinPotAmount || cachedPotForHorsesWinRef.current}
                horsesWinWinnerPosition={horsesWinWinnerPosition}
                onHorsesWinPotAnimationComplete={() => {
                  console.log('[HORSES WIN] Animation complete, transitioning to next game');
                  setHorsesWinPotTriggerId(null);
                  cachedPotForHorsesWinRef.current = 0;
                  handleGameOverComplete();
                }}
                // Lifted mobile state
                activeTab={mobileActiveTab}
                onActiveTabChange={setMobileActiveTab}
                hasUnreadMessages={mobileHasUnreadMessages}
                onHasUnreadMessagesChange={setMobileHasUnreadMessages}
                lastSeenChatMessageId={lastSeenChatMessageId}
                onLastSeenChatMessageIdChange={setLastSeenChatMessageId}
                lastReadChatMessageId={lastReadChatMessageId}
                onLastReadChatMessageIdChange={setLastReadChatMessageId}
                latestRealtimeChatMessage={latestRealtimeMessage}
                chatInputValue={mobileChatInput}
                onChatInputChange={setMobileChatInput}
                dealerSetupMessage={undefined}
                onAutoFoldChange={handleAutoFoldChange}
                pendingAutoRollOff={pendingAutoRollOff}
              />
            );
          }

          // YAHTZEE — unified single instance across ante_decision, in_progress, game_over
          // One persistent YahtzeeGameTable prevents blank "Loading Yahtzee" screen during phase transitions
          if (game.game_type === 'yahtzee' && (isAnteDecision || isInProgress || isYahtzeeGameOver)) {
            const yahtzeeState = (isInProgress || isYahtzeeGameOver) ? ((currentRound as any)?.yahtzee_state as import('@/lib/yahtzeeTypes').YahtzeeState | null) : null;
            return (
              <YahtzeeGameTable
                gameId={gameId!}
                players={players}
                currentUserId={user?.id}
                pot={(isInProgress || isYahtzeeGameOver) ? potForDisplay : 0}
                anteAmount={game.ante_amount || 1}
                dealerPosition={game.dealer_position || 1}
                currentRoundId={(isInProgress || isYahtzeeGameOver) ? (currentRound?.id || null) : null}
                dealerGameId={(isInProgress || isYahtzeeGameOver) ? (currentRound?.dealer_game_id || null) : null}
                handNumber={(isInProgress || isYahtzeeGameOver) ? (currentRound?.hand_number ?? null) : null}
                yahtzeeState={yahtzeeState}
                onRefetch={fetchGameData}
                onTerminalPresentationActiveChange={handleTerminalPresentationActiveChange}
                onTerminalPresentationComplete={handleYahtzeeTerminalPresentationComplete}
                isHost={isCreator}
                onPlayerClick={(player) => { setSelectedPlayer(player as Player); setShowPlayerOptions(true); }}
              />
            );
          }

          // GIN RUMMY is handled above in the unified block


          // 3-5-7 entry-mode provenance (persistent Game.tsx route owner).
          // Capture once at first hydrated render; classify current
          // authoritative identity against the baseline.
          let _three57EntryMode: 'live-transition' | 'historical-entry' | undefined = undefined;
          if (is357GameType) {
            const _authDealerGameId357 = (game as any).current_game_uuid ?? null;
            const _authHandNumber357 = currentRound?.hand_number ?? null;
            if (!initial357IdentityRef.current.captured) {
              initial357IdentityRef.current = {
                captured: true,
                dealerGameId: _authDealerGameId357,
                handNumber: _authHandNumber357,
              };
            }
            const _b357 = initial357IdentityRef.current;
            _three57EntryMode =
              _b357.captured &&
              _b357.dealerGameId !== null &&
              _b357.dealerGameId === _authDealerGameId357 &&
              _b357.handNumber !== null &&
              _b357.handNumber === _authHandNumber357
              ? 'historical-entry'
              : 'live-transition';
          }

          let _holmEntryMode: 'live-transition' | 'historical-entry' | undefined = undefined;
          if (game.game_type === 'holm-game' && holmView) {
            const _authDealerGameIdHolm = holmView.dealerGameId ?? game.current_game_uuid ?? null;
            const _authRoundIdHolm = holmView.roundId ?? null;
            const _authHandNumberHolm = holmView.handNumber ?? null;
            if (!initialHolmIdentityRef.current.captured) {
              initialHolmIdentityRef.current = {
                captured: true,
                dealerGameId: _authDealerGameIdHolm,
                roundId: _authRoundIdHolm,
                handNumber: _authHandNumberHolm,
              };
            }
            const _holmBaseline = initialHolmIdentityRef.current;
            _holmEntryMode = classifyHolmRouteEntryMode({
              baseline: {
                dealerGameId: _holmBaseline.dealerGameId,
                roundId: _holmBaseline.roundId,
                handNumber: _holmBaseline.handNumber,
              },
              current: {
                dealerGameId: _authDealerGameIdHolm,
                roundId: _authRoundIdHolm,
                handNumber: _authHandNumberHolm,
              },
              roundStatus: holmView.roundStatus,
              observedPreHandLifecycle: holmPreHandLifecycleObservedRef.current,
            });
          }

          return (
            <MobileGameTable sessionEndedPhase={_sessionEndedTableActive}
              key={gameId ?? 'unknown-game'}
              instanceLabel="main-in-progress-gated"
              currentRoundNotReadyForPresentation={currentRoundNotReadyForPresentation}
              gameId={gameId}
              three57EntryMode={_three57EntryMode}
              holmEntryMode={_holmEntryMode}
              holmHandNumber={game.game_type === 'holm-game' ? (holmView?.handNumber ?? null) : null}
              players={is357GameType && threeFiveSevenView ? threeFiveSevenPlayers : holmPlayers}
              currentUserId={user?.id}
              pot={game.game_type === 'holm-game' && holmView ? holmView.pot : (is357GameType && threeFiveSevenView ? threeFiveSevenView.pot : potForDisplay)}
              currentRound={renderRoundContext ? (is357GameType && threeFiveSevenView ? threeFiveSevenView.roundNumber : (game.current_round ?? 0)) : 0}
              allDecisionsIn={renderRoundContext ? (is357GameType && threeFiveSevenView ? threeFiveSevenView.players.every(p => p.decisionLocked || p.sittingOut || p.autoFold) : allDecisionsInForPresentation) : false}
              playerCards={renderRoundContext ? playerCardsForPresentation : []}
              timeLeft={isInProgress ? (is357GameType && !dealTimerAllowed357 ? null : (game.game_type === 'holm-game' ? (holmPresentedDecisionTimer?.remainingSeconds ?? null) : timeLeft)) : (isAnteDecision ? anteTimeLeft : null)}
              maxTime={isInProgress && !(is357GameType && !dealTimerAllowed357) ? (game.game_type === 'holm-game' ? holmPresentedDecisionTimer?.totalSeconds : (decisionMaxTime ?? decisionTimerSeconds)) : undefined}
              timerEpoch={isInProgress
                ? (game.game_type === 'holm-game'
                    ? (holmPresentedDecisionTimer?.deadline ?? null)
                    : (is357GameType ? decisionDeadline : null))
                : null}
              lastRoundResult={renderRoundContext ? (game.game_type === 'holm-game' && holmView
                ? holmView.lastRoundResult
                : (is357GameType && threeFiveSevenView ? threeFiveSevenView.lastRoundResult : ((game as any).last_round_result || null))) : null}
              dealerPosition={game.game_type === 'holm-game' && holmView ? holmView.dealerPosition : (is357GameType && threeFiveSevenView ? threeFiveSevenView.dealerPosition : game.dealer_position)}
              legValue={game.leg_value ?? 0}
              legsToWin={game.legs_to_win || 3}
              potMaxEnabled={game.pot_max_enabled ?? true}
              potMaxValue={game.pot_max_value || 10}
              pendingSessionEnd={game.pending_session_end || false}
              awaitingNextRound={renderRoundContext ? (game.game_type === 'holm-game' && holmView
                ? (holmView.roundStatus === 'completed' && !!holmView.lastRoundResult)
                : (is357GameType && threeFiveSevenView ? threeFiveSevenView.awaitingNextRound : (game.awaiting_next_round || false))) : false}
              gameType={game.game_type}
              isGameOver={isTerminalSlotPresentation}
              isDealer={isTerminalSlotPresentation ? (isDealer || (dealerPlayer?.is_bot && allowBotDealers) || false) : undefined}
              onNextGame={isTerminalSlotPresentation ? handleDealerConfirmGameOver : undefined}
              communityCards={renderRoundContext ? (game.game_type === 'holm-game' ? ((holmView?.communityCards as CardType[] | undefined) ?? []) : (currentRound?.community_cards as CardType[] | undefined)) : undefined}
              communityCardsRevealed={renderRoundContext ? effectiveCommunityCardsRevealed : undefined}
              buckPosition={renderRoundContext ? (game.game_type === 'holm-game' ? (holmView ? getHolmPhysicalBuckPosition(holmView) : null) : (is357GameType && threeFiveSevenView ? threeFiveSevenView.buckPosition : game.buck_position)) : undefined}
              buckTransferPresentation={game.game_type === 'holm-game' ? ((game as unknown as { buck_transfer_presentation?: { id: string; sessionId: string; dealerGameId: string; roundId: string; handContextId: string; handNumber: number; sequence: number; fromPosition: number; toPosition: number; createdAt: string; source: string } | null }).buck_transfer_presentation ?? null) : null}
              currentTurnPosition={renderRoundContext ? (game.game_type === 'holm-game' ? (holmView?.currentTurnPosition ?? null) : (is357GameType && threeFiveSevenView ? threeFiveSevenView.currentTurnPosition : null)) : null}
              chuckyCards={renderRoundContext ? chuckyCardsForPresentation : undefined}
              chuckyActive={renderRoundContext ? chuckyActiveForPresentation : undefined}
              chuckyCardsRevealed={renderRoundContext ? chuckyCardsRevealedForPresentation : undefined}
              roundStatus={renderRoundContext ? (game.game_type === 'holm-game' ? holmView?.roundStatus : (is357GameType && threeFiveSevenView ? threeFiveSevenView.roundStatus : currentRound?.status)) : undefined}
              pendingDecision={isInProgress ? pendingDecision : null}
              isPaused={renderRoundContext ? (game.is_paused || false) : false}
              anteAmount={(() => { console.log('[ANTE_PROP_DEBUG] Passing anteAmount to MobileGameTable:', game.ante_amount); return game.ante_amount; })()}
              pussyTaxValue={game.pussy_tax_value || 1}
              gameStatus={game.status}
              holmDealerGameId={(game as any).current_game_uuid ?? null}
              holmPresentationIdentity={game.game_type === 'holm-game' ? holmPresentationIdentity : null}
              horsesRoundId={currentRound?.id ?? null}
              horsesHandNumber={currentRound?.hand_number ?? null}
              threeFiveSevenAuthoritativeRoundId={is357GameType ? (currentRound?.id ?? null) : null}
              threeFiveSevenAuthoritativeRoundNumber={is357GameType ? (currentRound?.round_number ?? null) : null}
              threeFiveSevenViewRoundId={is357GameType ? (threeFiveSevenView?.roundId ?? null) : null}
              threeFiveSevenViewRoundNumber={is357GameType ? (threeFiveSevenView?.roundNumber ?? null) : null}
              threeFiveSevenRolloverPresentation={is357GameType ? threeFiveSevenRolloverPresentation : null}
              threeFiveSevenAllFoldPresentation={is357GameType ? threeFiveSevenAllFoldPresentation : null}
              onThreeFiveSevenAllFoldPresentationComplete={is357GameType
                ? handleThreeFiveSevenAllFoldPresentationComplete
                : undefined}
              isWaitingPhase={!renderRoundContext}
              dealerSelectionCards={dealerSelectionCards}
              dealerSelectionWinnerPosition={dealerSelectionWinnerPosition}
              anteAnimationTriggerId={anteAnimationTriggerId}
              anteAnimationExpectedPot={anteAnimationExpectedPot}
              preAnteChips={preAnteChips}
              expectedPostAnteChips={expectedPostAnteChips}
              onAnteAnimationStarted={() => {
                setAnteAnimationTriggerId(null);
                setAnteAnimationExpectedPot(null);
                setPreAnteChips(null);
                setExpectedPostAnteChips(null);
              }}
              chipTransferTriggerId={renderRoundContext ? chipTransferTriggerId : null}
              chipTransferAmount={renderRoundContext ? chipTransferAmount : undefined}
              chipTransferWinnerId={renderRoundContext ? chipTransferWinnerId : null}
              chipTransferLoserIds={renderRoundContext ? chipTransferLoserIds : []}
              onChipTransferStarted={isInProgress ? () => setChipTransferTriggerId(null) : undefined}
              onChipTransferEnded={isInProgress ? () => {
                setChipTransferWinnerId(null);
                setChipTransferLoserIds([]);
                setChipTransferAmount(0);
              } : undefined}
              chuckyLossTriggerId={renderRoundContext ? chuckyLossTriggerId : null}
              chuckyLossAmount={renderRoundContext ? chuckyLossAmount : undefined}
              chuckyLossPlayerIds={renderRoundContext ? chuckyLossPlayerIds : []}
              onChuckyLossEnded={isInProgress ? handleHolmChuckyLossPresentationComplete : undefined}
              onHolmContinuationPresentationComplete={isInProgress ? handleHolmContinuationPresentationComplete : undefined}
              onHolmDealPresentationComplete={isInProgress ? handleHolmDealPresentationComplete : undefined}
              holmShowdownTriggerId={renderRoundContext ? holmShowdownTriggerId : null}
              holmShowdownMatchAmount={renderRoundContext ? holmShowdownMatchAmount : undefined}
              holmShowdownWinnerIds={renderRoundContext ? holmShowdownWinnerIds : []}
              holmShowdownLoserIds={renderRoundContext ? holmShowdownLoserIds : []}
              holmShowdownPhase={renderRoundContext ? holmShowdownPhase : 'idle'}
              onHolmShowdownPotToWinnerEnded={isInProgress ? () => {
                setHolmShowdownTriggerId(null);
                setHolmShowdownPhase('losers-to-pot');
              } : undefined}
              onHolmShowdownLosersEnded={isInProgress ? () => {
                setHolmShowdownPhase('idle');
                setHolmShowdownPotAmount(0);
                setHolmShowdownMatchAmount(0);
                setHolmShowdownWinnerIds([]);
                setHolmShowdownLoserIds([]);
              } : undefined}
              holmWinPotTriggerId={renderRoundContext ? holmWinPotTriggerId : null}
              onTerminalPresentationActiveChange={handleTerminalPresentationActiveChange}
              holmWinPotAmount={renderRoundContext ? holmWinPotAmount : undefined}
              holmWinWinnerPosition={renderRoundContext ? holmWinWinnerPosition : undefined}
              holmWinWinnerPositions={renderRoundContext ? holmWinWinnerPositions : undefined}
              onHolmWinPotAnimationComplete={renderRoundContext ? handleHolmWinPotAnimationComplete : undefined}
              threeFiveSevenWinTriggerId={threeFiveSevenWinTriggerId}
              threeFiveSevenWinPotAmount={threeFiveSevenWinPotAmount}
              threeFiveSevenWinnerId={threeFiveSevenWinnerId}
              threeFiveSevenWinnerCards={threeFiveSevenWinnerCards}
              threeFiveSevenCachedLegPositions={cachedLegPositions}
              onThreeFiveSevenWinAnimationStarted={handleThreeFiveSevenWinAnimationStarted}
              onThreeFiveSevenWinAnimationComplete={handleThreeFiveSevenWinAnimationComplete}
              threeFiveSevenTerminalDescriptor={terminal357Descriptor}
              onStay={isInProgress ? () => handleStay() : () => {}}
              onFold={isInProgress ? () => handleFold() : () => {}}

              onSelectSeat={handleSelectSeat}
              isHost={isCreator}
              onPlayerClick={isInProgress ? (player) => { setSelectedPlayer(player as Player); setShowPlayerOptions(true); } : undefined}
              chatBubbles={chatBubbles}
              allMessages={allMessages}
              onSendChat={sendChatMessage}
              isChatSending={isChatSending}
              getPositionForUserId={getPositionForUserId}
              onLeaveGameNow={handleLeaveGameNow}
              realMoney={game.real_money || false}
              revealAtShowdown={game.reveal_at_showdown || false}
              externalShowdownCardsCache={isInProgress && hasActiveRound ? showdownCardsCacheRef : undefined}
              externalShowdownRoundNumber={isInProgress && hasActiveRound ? showdownRoundNumberRef : undefined}
              externalCommunityCardsCache={isInProgress && hasActiveRound ? communityCardsCacheRef : undefined}
              externalCommunityCacheEpoch={communityCacheEpoch}
              handContextId={hasActiveRound ? handContextKey : null}
              winner357ShowCards={winner357ShowCards}
              onWinner357ShowCards={handleWinner357ShowCards}
              holmPreFold={holmPreFold}
              holmPreStay={holmPreStay}
              onHolmPreFoldChange={(checked) => armHolmPreDecision(checked ? 'fold' : null)}
              onHolmPreStayChange={(checked) => armHolmPreDecision(checked ? 'stay' : null)}
              holmDealReady={game?.game_type === 'holm-game' ? holmDecisionPresentationReady : true}
              rabbitHunt={game.rabbit_hunt ?? false}
              activeTab={mobileActiveTab}
              onActiveTabChange={setMobileActiveTab}
              hasUnreadMessages={mobileHasUnreadMessages}
              onHasUnreadMessagesChange={setMobileHasUnreadMessages}
              lastSeenChatMessageId={lastSeenChatMessageId}
              onLastSeenChatMessageIdChange={setLastSeenChatMessageId}
              lastReadChatMessageId={lastReadChatMessageId}
              onLastReadChatMessageIdChange={setLastReadChatMessageId}
              latestRealtimeChatMessage={latestRealtimeMessage}
              chatInputValue={mobileChatInput}
              onChatInputChange={setMobileChatInput}
              onAutoFoldChange={isInProgress ? handleAutoFoldChange : undefined}
              pendingAutoRollOff={pendingAutoRollOff}
              on357TimerAllowedChange={setDealReadiness357}
            />
          );
          })()}
          </PlayfieldSlotController>
        )}

        {game.status === 'ante_decision' && showAnteDialog && user && game.ante_amount !== undefined && isRunningItBack !== null && (() => {
          logDebugEvent({
            gameId: gameId!,
            userId: user.id,
            eventType: 'ante_modal_render_gate',
            payload: {
              showAnteDialog,
              gameStatus: game.status,
              dealerGameId: game.current_game_uuid ?? null,
              isRunningItBack,
              anteAmount: game.ante_amount,
            },
          });
          const currentPlayer = players.find(p => p.user_id === user.id);
          return (
            <AnteUpDialog
              gameId={gameId!}
              playerId={currentPlayer?.id || ''}
              gameType={game.game_type}
              anteAmount={game.ante_amount}
              legValue={game.leg_value ?? 0}
              pussyTaxEnabled={game.pussy_tax_enabled ?? true}
              pussyTaxValue={game.pussy_tax_value || 1}
              legsToWin={game.legs_to_win || 3}
              potMaxEnabled={game.pot_max_enabled ?? true}
              potMaxValue={game.pot_max_value || 10}
              chuckyCards={game.chucky_cards}
              isRunningItBack={isRunningItBack}
              autoAnte={currentPlayer?.auto_ante ?? false}
              autoAnteRunback={currentPlayer?.auto_ante_runback ?? false}
              anteDecisionTimerSeconds={game.ante_decision_timer_seconds || 30}
              onDecisionMade={(decision) => {
                // ── Set latch BEFORE hiding so transient server regression cannot re-trigger ──
                const currentPlayer = players.find(p => p.user_id === user.id);
                const latchKey = `${gameId}|${game.current_game_uuid ?? ''}|${currentPlayer?.id ?? ''}`;
                anteConfirmedLatchRef.current = latchKey;
                console.log('[ANTE LATCH] Set:', latchKey);
                
                setShowAnteDialog(false);

                // ISSUE 2 FIX: optimistic local merge — immediately reflect the
                // dealer's own ante decision in local players state, and if all
                // active non-sitting-out players are now decided, call
                // handleAllAnteDecisionsIn without waiting for realtime/poll.
                if (decision && currentPlayer) {
                  setPlayers(prev => prev.map(p =>
                    p.id === currentPlayer.id
                      ? { ...p, ante_decision: decision, sitting_out: decision === 'sit_out' ? true : p.sitting_out }
                      : p
                  ));
                  const merged = players.map(p =>
                    p.id === currentPlayer.id
                      ? { ...p, ante_decision: decision, sitting_out: decision === 'sit_out' ? true : p.sitting_out }
                      : p
                  );
                  const activePlayers = merged.filter(
                    p => !p.sitting_out && (p as any).status !== 'observer' && (p as any).status !== 'left'
                  );
                  const allDecided = activePlayers.length >= 2 && activePlayers.every(p => !!p.ante_decision);
                  recordStartupFlight('PHASE TIMELINE', 'allDecided evaluated after dealer ante submit (optimistic)', {
                    file: 'src/pages/Game.tsx',
                    function: 'AnteUpDialog onDecisionMade',
                    gameId,
                    dealerGameId: game.current_game_uuid ?? null,
                    newValue: allDecided,
                    activePlayers: activePlayers.length,
                    decision,
                  });
                  if (allDecided && !anteProcessingRef.current) {
                    console.log('[GIN_RUNTIME_TIMELINE] dealer-submit:allDecided=true → immediate handleAllAnteDecisionsIn');
                    anteProcessingRef.current = true;
                    handleAllAnteDecisionsIn();
                  }
                }

                // ── HANDOFF TRACE #5c: ante modal CONFIRMED (decision made) ──
                emitCribbageHandoffTrace({
                  gameId: gameId!,
                  eventType: 'ante_modal_confirmed',
                  userId: user?.id ?? null,
                  context: {
                    gameStatus: game.status,
                    dealerGameId: game.current_game_uuid ?? null,
                    dealerSelectionCardsLen: dealerSelectionCards.length,
                    latchKey,
                  },
                });
              }}

            />
          );
        })()}

      </div>
      {/* Player click dialog for host */}
      <PlayerClickDialog
        open={showPlayerOptions}
        onOpenChange={setShowPlayerOptions}
        player={selectedPlayer}
        players={players}
        gameId={gameId!}
        isHost={isCreator}
        currentUserId={user?.id}
        onUpdate={fetchGameData}
      />

      {/* Not enough players countdown overlay */}
      {showNotEnoughPlayers && (
        <NotEnoughPlayersCountdown 
          gameId={gameId!} 
          onComplete={() => setShowNotEnoughPlayers(false)}
          onResume={() => {
            setShowNotEnoughPlayers(false);
            // Re-run the end-of-game evaluation which will now find enough players
            handleGameOverComplete();
          }}
          currentPlayerId={currentPlayer?.id}
          isCurrentPlayerSittingOut={currentPlayer?.sitting_out}
          isCurrentPlayerWaiting={currentPlayer?.waiting}
        />
      )}


      <AlertDialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Session for Everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the session for all players after the current game completes. 
              All players will be notified that this is the last hand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndSession}>
              Confirm End Session
            </AlertDialogAction>
          </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>

    <DebugLogToggle />


    </div>
  );

  // P9.4 (re-scoped, Option A): shell owns SeatAnchorLayer for the
  // canonical-shell family. Feed it the seated-player roster so every
  // canonical-shell game (poker variants AND gin-rummy) consumes the
  // same resolver via useSeatAnchors(), with no per-game projection
  // recomputation. Roster filter is game-agnostic (seated, not
  // sitting-out, not waiting, not observer/left) — the resolver
  // canonicalizes 2P face-to-face / observer-upper-left semantics.
  // SeatAnchorLayer is a canonical-family-only feature. Gate it on
  // game_type (NOT on shell mount, which is now route-stable). For
  // non-canonical families we pass undefined so PersistentTableShell's
  // `seats && projectionMode` check skips SeatAnchorLayer entirely.
  // PR-B.3: gate canonical SeatAnchorLayer on the SAME sticky chain used
  // for the shell-felt gameType prop, not raw `game.game_type`. During
  // bootstrap (session start → DealerGameSetup completion) raw game_type
  // is null, which collapsed `isCanonicalShellFamily(...)` to false and
  // skipped SeatAnchorLayer entirely. PersistentTableShell still mounted
  // (because gameType falls back to 'holm-game' for the persistent poker
  // shell), but seats=undefined/projectionMode=undefined meant the
  // anchor provider never wrapped the slot — so MGT's
  // useRequiredSeatAnchors returned null and no seat chrome rendered.
  // Rollover already had game_type populated from the prior dealer game,
  // which is why between-game setup looked correct. Resolve through the
  // same chain so bootstrap and rollover go through identical wiring.
  const _shellRoutedGameType =
    _routeShellGameType ?? (_isPokerShellPersistent ? 'holm-game' : null);
  const shellCanonicalFamily = isCanonicalShellFamily(_shellRoutedGameType);
  // P0 (chip/seat continuity fix): the shell-owned SeatAnchorLayer must
  // also mount during fresh-waiting (no committed game_type) AND during
  // any configuring context that renders CanonicalShellWaitingSurface
  // / canonical interstitial surfaces. Those surfaces consume
  // useSeatAnchorsOptional() and explicitly record
  // `contract-violation.missing-seat-anchor-provider` when ambient is
  // null. Previously the gate was scoped to `shellCanonicalFamily`
  // (which needs a real game_type), so a fresh-waiting session entered
  // the canonical waiting surface without an anchor provider above it.
  const shellAnchorEligible =
    shellCanonicalFamily || _isFreshWaitingNoFamily || _isConfiguringContext;
  // The shell roster owns physical seats, not next-game participation.
  // A sitting-out player remains seated and visible (red); only explicit
  // observer/left state releases their position for another player.
  const _isShellSeatRosterMember = (p: { status?: string | null }) =>
    p.status !== 'observer' && p.status !== 'left';
  // Stable-identity shell seat roster (see hook-rule note below).
  const _shellSeatRosterKey = shellAnchorEligible
    ? players
        .filter(_isShellSeatRosterMember)
        .map(p => p.position)
        .sort((a, b) => a - b)
        .join(',')
    : '';
  let shellEligibleSeats: Array<{ position: number; occupied: boolean; hidden: boolean }> | undefined;
  if (shellAnchorEligible && gameId) {
    const cached = __shellSeatRosterCache.get(gameId);
    if (cached && cached.key === _shellSeatRosterKey) {
      shellEligibleSeats = cached.seats;
    } else {
      shellEligibleSeats = players
        .filter(_isShellSeatRosterMember)
        .map(p => ({ position: p.position, occupied: true, hidden: false }));
      __shellSeatRosterCache.set(gameId, { key: _shellSeatRosterKey, seats: shellEligibleSeats });
    }
  }

  // A player remains in their active canonical seat projection while
  // sitting out. Observer projection is reserved for an actual stand-up or
  // leave, so a sit-out never causes a table-wide geometry reset.
  const isViewerSeated = !!currentPlayer
    && currentPlayer.status !== 'observer'
    && currentPlayer.status !== 'left';
  const shellViewerPosition = isViewerSeated ? (currentPlayer?.position ?? null) : null;
  const shellProjectionMode: 'active-canonical' | 'observer-absolute' | undefined = shellAnchorEligible
    ? (isViewerSeated ? 'active-canonical' : 'observer-absolute')
    : undefined;

  // Wartime FIX #1 — shell-owned pre-session seat layer.
  // Build a stable participants array for every pre-session phase
  // (waiting / dealer_selection / configuring / game_selection /
  // ante_decision / fresh-waiting-no-family). The shell renders one
  // PreSessionSeatLayer at a stable React tree position so cluster
  // identity (providerInstanceId, clusterInstanceId, chipDomNodeId)
  // survives WaitingTable → NeutralInterstitial → WaitingSlot →
  // DealerSelection → DealerConfig transitions. Layer unmounts (prop
  // returns null) the moment gameplay takes ownership — gameplay
  // chip/seat ownership remains unchanged for Cribbage/Gin/Yahtzee/
  // Horses/Holm/3-5-7.
  // Lobby/pre-session statuses. game_over and session_ended are
  // included so the shell continues to own seat geometry + branding
  // while the post-game waiting surface is visible. This is what
  // prevents the post-game "duplicate chipstack + SHIP $0" symptom:
  // the shell asserts ownership in lobby mode, and fallback seat
  // renderers (CanonicalShellWaitingSurface, MobileGameTable
  // pre-session branch, CribbageMobileGameTable pre-session branch)
  // short-circuit via usePreSessionSeatOwned().
  const _PRE_SESSION_STATUSES = new Set<string>([
    'waiting',
    'waiting_for_players',
    'dealer_selection',
    'cribbage_dealer_selection',
    'configuring',
    'game_selection',
    'ante_decision',
    'game_over',
    'session_ended',
  ]);
  // Terminal-presentation hold: `session_ended` must not hand seat/HUD
  // ownership to PreSessionSeatLayer while the canonical win sequence is
  // still running on this client — that is what tore the HUD stacks and
  // chip-transfer destination out mid-celebration on a LAST HAND win.
  const _isPreSessionPhase =
    (game.status != null &&
      _PRE_SESSION_STATUSES.has(game.status) &&
      !_terminalPresentationHold) ||
    _isFreshWaitingNoFamily;

  // shellMode === 'lobby' — drives both seat ownership AND
  // presentation (title, stakes) regardless of stale gameplay state
  // lingering in game.name / game.game_type / instanceLabel.
  const _isLobbyMode = _isPreSessionPhase;
  const _shellPreSessionRosterKey = (shellAnchorEligible && _isLobbyMode)
    ? players
        .filter(_isShellSeatRosterMember)

        .map(p => `${p.position}:${p.id}:${Math.round(p.chips ?? 0)}:${p.status ?? ''}:${p.waiting ? 1 : 0}:${p.sitting_out ? 1 : 0}`)
        .sort()
        .join('|')
    : '';
  let preSessionParticipants:
    | Array<{
        id: string;
        position: number;
        chips?: number | null;
        status?: string;
        user_id?: string | null;
        is_bot?: boolean | null;
        waiting?: boolean | null;
        sitting_out?: boolean | null;
        profiles?: { username?: string };
      }>
    | null = null;
  if (shellAnchorEligible && _isLobbyMode && gameId) {
    const cached = __shellPreSessionRosterCache.get(gameId);
    if (cached && cached.key === _shellPreSessionRosterKey) {
      preSessionParticipants = cached.participants;
    } else {
      preSessionParticipants = players
        .filter(_isShellSeatRosterMember)
        .map(p => ({
          id: p.id,
          position: p.position,
          chips: p.chips,
          status: p.status,
          user_id: p.user_id,
          is_bot: p.is_bot,
          waiting: p.waiting,
          sitting_out: p.sitting_out,
          profiles: p.profiles,
        }));
      __shellPreSessionRosterCache.set(gameId, {
        key: _shellPreSessionRosterKey,
        participants: preSessionParticipants,
      });
    }
    // CRITICAL: ensure non-null even when roster is empty so the
    // shell still claims pre-session seat ownership (and fallback
    // renderers stay off). Presence must NOT determine ownership.
    if (preSessionParticipants == null) preSessionParticipants = [];
  }




  // PR-B.3 instrumentation: hand-1 bootstrap flash diagnostic.
  // IMPORTANT: this block lives AFTER the `if (!game) return null` guard
  // above, so it MUST NOT introduce React hooks (useRef/useEffect) here
  // — doing so changed the hook count between the pre-hydration render
  // and the post-hydration render and crashed the waiting phase. We
  // implement the dedup via a module-level Map keyed by gameId, and
  // fire the insert inline. The insert is fire-and-forget; the dedup
  // key collapses no-op renders so volume stays bounded.
  if ((currentRound?.hand_number ?? 0) <= 1 && gameId) {
    const _seatInputsKey = shellEligibleSeats
      ? shellEligibleSeats
          .map(s => `${s.position}:${s.occupied ? 1 : 0}:${s.hidden ? 1 : 0}`)
          .sort()
          .join('|')
      : 'undefined';

    // ── Extended diagnostic dimensions (PR-B.4) ──────────────────────
    // None of these introduce hooks — they read existing in-render
    // values. They feed both the dedup key (so any change fires a new
    // event) and the persisted payload (so the timeline is self-
    // describing without relying on memory of which client flashed).
    const _isHolm = game.game_type === 'holm-game';
    const _holmRoundId = _isHolm ? (holmView?.roundId ?? null) : null;
    const _holmRoundStatus = _isHolm ? (holmView?.roundStatus ?? null) : null;
    const _holmHandNumber = _isHolm ? (holmView?.handNumber ?? null) : null;
    const _holmCurrentTurnPosition = _isHolm ? (holmView?.currentTurnPosition ?? null) : null;
    const _holmSyncStampedHand =
      _isHolm && (holmView as any)?.__syncHandNumber != null
        ? (holmView as any).__syncHandNumber
        : null;
    const _currentRoundId = currentRound?.id ?? null;
    const _currentRoundStatus = currentRound?.status ?? null;
    const _hasActiveRound = !!_currentRoundId;
    // renderRoundContext + identity-stale are computed later in the
    // render tree; replicate the cheap precursor inputs here so we
    // can see the gate without restructuring.
    const _renderRoundContextPrecursor =
      _currentRoundStatus === 'in_progress'
      || _currentRoundStatus === 'showdown'
      || _currentRoundStatus === 'completed'
      || _currentRoundStatus === 'processing';
    // Identity-stale heuristic: holmView round id disagrees with the
    // currentRound row, OR holm stamped hand disagrees with the
    // currentRound hand_number. Either is a hydration-lag signal.
    const _isIdentityStale = _isHolm
      ? (
          (_holmRoundId != null && _currentRoundId != null && _holmRoundId !== _currentRoundId)
          || (_holmSyncStampedHand != null
              && currentRound?.hand_number != null
              && _holmSyncStampedHand !== currentRound.hand_number)
        )
      : false;

    const _bootstrapDiagKey = [
      _shellRoutedGameType ?? 'null',
      shellProjectionMode ?? 'undef',
      shellViewerPosition ?? 'null',
      _seatInputsKey,
      `persistent=${_isPokerShellPersistent ? 1 : 0}`,
      `status=${game.status ?? 'null'}`,
      `rId=${_currentRoundId ? String(_currentRoundId).slice(-8) : 'null'}`,
      `rStatus=${_currentRoundStatus ?? 'null'}`,
      `holmRId=${_holmRoundId ? String(_holmRoundId).slice(-8) : 'null'}`,
      `holmHand=${_holmHandNumber ?? 'null'}`,
      `holmStamp=${_holmSyncStampedHand ?? 'null'}`,
      `holmTurn=${_holmCurrentTurnPosition ?? 'null'}`,
      `holmRStatus=${_holmRoundStatus ?? 'null'}`,
      `stale=${_isIdentityStale ? 1 : 0}`,
      `rrcPre=${_renderRoundContextPrecursor ? 1 : 0}`,
      `hasRound=${_hasActiveRound ? 1 : 0}`,
    ].join('|');

    const prev = __bootstrapFlashDiagCache.get(gameId) ?? null;
    if (prev !== _bootstrapDiagKey) {
      __bootstrapFlashDiagCache.set(gameId, _bootstrapDiagKey);
      const payload = {
        clientInstanceId: __bootstrapFlashClientInstanceId,
        from: prev,
        to: _bootstrapDiagKey,
        handNumber: currentRound?.hand_number ?? null,
        status: game.status ?? null,
        rawGameType: game.game_type ?? null,
        shellRoutedGameType: _shellRoutedGameType,
        shellCanonicalFamily,
        shellProjectionMode: shellProjectionMode ?? null,
        shellViewerPosition,
        isViewerSeated,
        currentPlayerId: currentPlayer?.id ?? null,
        currentPlayerStatus: currentPlayer?.status ?? null,
        currentPlayerPosition: currentPlayer?.position ?? null,
        currentPlayerWaiting: (currentPlayer as any)?.waiting ?? null,
        currentPlayerSittingOut: currentPlayer?.sitting_out ?? null,
        playerCount: players.length,
        seatedCount: shellEligibleSeats?.length ?? 0,
        seatRoster: shellEligibleSeats
          ? shellEligibleSeats.map(s => s.position).sort((a, b) => a - b)
          : null,
        persistentPokerShell: _isPokerShellPersistent,
        dealerGameId: (game as any).current_game_uuid ?? null,
        configComplete: (game as any).config_complete ?? null,
        // ── PR-B.4 extended dimensions ──────────────────────────────
        currentRoundId: _currentRoundId,
        currentRoundStatus: _currentRoundStatus,
        hasActiveRound: _hasActiveRound,
        renderRoundContextPrecursor: _renderRoundContextPrecursor,
        isIdentityStale: _isIdentityStale,
        holmRoundId: _holmRoundId,
        holmRoundStatus: _holmRoundStatus,
        holmHandNumber: _holmHandNumber,
        holmSyncStampedHand: _holmSyncStampedHand,
        holmCurrentTurnPosition: _holmCurrentTurnPosition,
        holmViewPresent: _isHolm ? !!holmView : null,
        tPerf: performance.now(),
      };
      // Defer to a microtask so we don't perform a side-effect during render.
      Promise.resolve().then(() => {
        supabase
          .from('debug_events' as any)
          .insert({
            game_id: gameId,
            round_id: currentRound?.id ?? null,
            user_id: user?.id ?? null,
            client_role: isViewerSeated ? 'actor' : 'observer',
            event_type: 'bootstrap_flash_diag',
            payload,
          } as any)
          .then(({ error }) => {
            if (error) console.warn('[BOOTSTRAP_FLASH_DIAG] persist failed:', error.message);
          });
      });
    }
  }



  // P9.6: shell-owned pre-hand felt removed. Gameplay surfaces own the
  // single authoritative canonical felt; the shell no longer
  // renders a second felt floor underneath the slot.


  // P1 on-screen debug HUD removed — diagnostic served its purpose.

  return (
    <VisualPreferencesProvider userId={user?.id}>
      <GameChatContextProvider
        value={{
          chatBubbles,
          allMessages,
          sendMessage: sendChatMessage,
          isSending: isChatSending,
          getPositionForUserId,
          latestRealtimeMessage,
          isChatHydrated,
          hydrationBaselineIds,
          chatConversationKey,
        }}
      >
      <VoiceOperationIdentityProvider
        value={{
          isActiveGameRoute: true,
          gameId: gameId ?? null,
          sessionId: normalShellSessionId,
          dealerGameId: (game as any)?.current_game_uuid ?? null,
          gameType: game?.game_type ?? null,
          shellPhase: game?.status ?? null,
          activeTab: mobileActiveTab ?? null,
          localPlayerId: currentPlayer?.id ?? null,
        }}
      >
      <ChatAttentionProvider currentUserId={user?.id}>

      <GameDeckColorModeSync
        playerId={currentPlayer?.id}
        playerDeckColorMode={currentPlayer?.deck_color_mode}
        onModeChange={() => {}}
      />
      {/* Gin phase trace pill removed — investigation retired. */}
      {enableOuterShell ? (
        <SurfaceReadinessProvider>

          <PersistentTableShell
            gameId={gameId ?? undefined}
            /* Sticky shell game type: `game.game_type` is null during the
               configuring / game_selection window (between Start Game and
               DealerGameSetup completion). Passing raw null here would
               unmount ShellOwnedFeltHost for any feltless poker family
               and blank the shell-owned felt mid-transition. Use the
               sticky chain (current -> last known -> previous config) so
               the shell felt stays continuously mounted across lifecycle
               transitions. */
            /* Persistent-poker-shell pre-game window: `game.game_type` is
               null from session start through DealerGameSetup completion.
               Previously we defaulted to `'holm-game'` here so the shell
               felt would paint from the first frame, but that branding
               leaked into the canonical felt plate during bootstrap
               high-card-for-dealer (visible HOLM label on a fresh
               session). `CanonicalFeltSurface` now supports a neutral
               `gameKind: null` render (felt geometry only, no plate),
               so we pass undefined here and let the neutral surface
               own bootstrap. The sticky chain (_routeShellGameType)
               still resolves real families once the dealer commits a
               game type. */
            gameType={_routeShellGameType ?? undefined}
            anteAmount={_routeShellAnteAmount}
            projectionMode={shellProjectionMode}
            viewerPosition={shellViewerPosition}
            viewerUserId={user?.id ?? null}
            seats={shellEligibleSeats}
            preSessionParticipants={preSessionParticipants}
            lobbyMode={_isShellLobbyMode}
            header={mobileHeader}
          >
            <WaitingFlightMarker
              event="PersistentTableShell branch=post-hydration"
              payload={{ gameId: gameId ?? null, gameType: _routeShellGameType ?? null }}
            />
            {innerTree}
            {/* SESSION ENDED TABLE PHASE — canonical table phase, standard HUD.
                The results panel portals into the canonical felt surface; the
                persistent row-1 announcement uses the canonical ambient track;
                "Back to Lobby" portals into the canonical active-pane row
                (HUD row 4) and only while the active game-content tab is
                selected. No bespoke HUD, chat, or history copies. */}
            {_sessionEndedTableActive ? (
              <>
                <SessionEndedAnnouncementMount gameId={gameId!} />
                <SessionEndedFeltPanel
                  gameId={gameId!}
                  currentUserId={user?.id ?? null}
                />
                <SessionEndedPaneAction
                  active={mobileActiveTab === 'cards'}
                  onBackToLobby={() => navigate('/')}
                />
              </>
            ) : null}



          </PersistentTableShell>
          
          {/* Gin-only readiness probe (capability-driven, not shell branching).
              Lives outside the slot so it can prove "first renderable frame
              exists" BEFORE the controller mounts the surface. */}
          {game.game_type === 'gin-rummy' && game.current_game_uuid && currentRound?.id ? (
            <GinRummyReadinessProbe
              dealerGameId={game.current_game_uuid}
              roundId={currentRound.id}
              parentHasGinState={Boolean((currentRound as any)?.gin_rummy_state)}
            />
          ) : null}
        </SurfaceReadinessProvider>
      ) : (
        // Non-shell fallback: render the mobile header inline above
        // the inner tree so behavior matches the shell-enabled path
        // (header still appears) without the shell-owned rail.
        <>
          {mobileHeader}
          {innerTree}
        </>
      )}

      {/* StartupFlightRecorderOverlay is mounted once at App.tsx; do not
          duplicate here. */}
      <CribDealerDrawTraceOverlay gameId={gameId ?? null} />
      </ChatAttentionProvider>
      </VoiceOperationIdentityProvider>
      </GameChatContextProvider>
    </VisualPreferencesProvider>
  );
};


export default Game;
