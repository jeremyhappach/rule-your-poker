import { recordSurfaceOwnership, recordWaitingLifecycle, recordWaitingLifecycleIfChanged } from "@/lib/canonicalShell/waitingTableFlight";
import { ffRecord } from "@/lib/canonicalShell/cardTransport/holmFullForensics";
import { nextClockwise } from "@/lib/canonicalShell/seatRing";
import { isHolmHandReady, subscribeHolmHandReady } from "@/lib/canonicalShell/cardTransport/holmDealBarrier";
import { subscribeHolmDealDbg, getHolmDealDbgMeta } from "@/lib/canonicalShell/cardTransport/holmDealDbg";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerHand } from "./PlayerHand";
import { PlayingCard } from "./PlayingCard";
import { CanonicalChipDisc } from "./canonicalShell/CanonicalChipDisc";
import { DealerIndicator } from "./canonicalShell/DealerIndicator";
import { CanonicalChipstack } from "./canonicalShell/CanonicalChipstack";
import { CanonicalCardBack } from "./canonicalShell/CanonicalCardBack";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { CommunityCards } from "./CommunityCards";
import { HolmCanonicalCommunityRow } from "./HolmCanonicalCommunityRow";
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
import { TurnSpotlight } from "./TurnSpotlight";
import {
  ThreeFiveSevenDealOrchestrator,
  ThreeFiveSevenDealRuntimeMaybe,
  Use357OppCount,
  Use357SelfHand,
  is357GameType as __is357GameType,
  cardsThisWaveFor357,
  prevWaveCountFor357,
  totalAfterWaveFor357,
} from "./ThreeFiveSevenDealOrchestrator";

import { useLifecycleMount, setLifecycleFact, setLifecycleContext } from "@/lib/canonicalShell/lifecycleDebug";
import { useChangeTracker as useShellChangeTracker, useUnmountSnapshot as useShellUnmountSnapshot } from "@/lib/canonicalShell/shellLifecycleLog";
import { useHolmLifecycleTrace } from "@/lib/holm/holmLifecycleTrace";
import { supabase as __mgtSupabase } from "@/integrations/supabase/client";
import { recordDealerSelectionDiag } from "@/lib/dealerSelectionDiag";
import { useStartupMountTrace, useStartupRenderTrace } from "@/lib/startupFlightRecorder";

// ── BOOTSTRAP_FLASH_MGT instrumentation (PR-B.4) ──
// Module-level dedup + stable per-tab instance id so we can correlate
// the two clients in SQL without depending on user_id mapping.
const __mgtFlashClientInstanceId: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mgt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const __mgtFlashLastKeyByGame = new Map<string, string>();
function __mgtFlashPersist(row: { game_id: string; event_type: string; payload: Record<string, unknown> }) {
  // Fire-and-forget; never await.
  Promise.resolve().then(async () => {
    try {
      await __mgtSupabase.from('debug_events').insert({
        game_id: row.game_id,
        event_type: row.event_type,
        payload: { clientInstanceId: __mgtFlashClientInstanceId, ...row.payload },
      } as any);
    } catch { /* swallow — diagnostics must never break gameplay */ }
  });
}


import { BucksOnYouAnimation } from "./BucksOnYouAnimation";
import {
  recordBucksForensic,
  recordBucksViolation,
  evaluateBucksShowRequest,
  notifyBucksShowGranted,
  buildBucksForensicsText,
  getBucksForensics,
} from "@/lib/canonicalShell/holmBucksOverlayForensics";
import {
  releaseBuckPresentationGate,
} from "@/lib/canonicalShell/holmBuckPresentationGate";
import { NoQualifyAnimation } from "./NoQualifyAnimation";
import { MidnightAnimation } from "./MidnightAnimation";
import { LegEarnedAnimation } from "./LegEarnedAnimation";
import { LegsToPlayerAnimation } from "./LegsToPlayerAnimation";
import { SweepsPotAnimation } from "./SweepsPotAnimation";
import {
  clockwiseDistance as canonicalClockwiseDistance,
  observerSlotForPosition,
  type CanonicalSlot,
} from "@/lib/canonicalShell/seatAnchors";
import { useRequiredSeatAnchors } from "@/lib/canonicalShell/SeatAnchorLayer";
import { usePreSessionSeatOwned } from "@/lib/canonicalShell/PreSessionSeatLayer";
import { setPresessionGeometryPhase } from "@/lib/wartimeDebug/presessionGeometrySampler";
import { CanonicalSeatCluster } from "@/lib/canonicalShell/CanonicalSeatCluster";
import { getCanonicalSlotPlacement } from "@/lib/canonicalShell/canonicalSlotPlacement";
import { ActivePlayerHUD } from "@/lib/canonicalShell/ActivePlayerHUD";
import { resolveChipEndpoint } from "@/lib/canonicalShell/chipEndpoints";
import {
  derivePlayerStatus,
  getParticipantChipBgClass,
  type CanonicalSeatStatusRing,
} from "@/lib/canonicalShell/participantStatus";
// PersistentTableShell ownership lifted to Game.tsx in Phase 5;
// MobileGameTable no longer mounts an inner shell to avoid duplicate
// shell ownership (single authoritative outer instance per session).

import { LegIndicator } from "./LegIndicator";
import { AutoRollIndicator } from "./AutoRollIndicator";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { DiceGameplayGeometryProvider } from "@/lib/wave5GameplayGeometry/DiceGameplayGeometryProvider";
import { DiceAnchoredSlot } from "./DiceAnchoredSlot";
import { AssignedRectFitter } from "@/lib/wave5GameplayGeometry/AssignedRectPx";
import {
  HolmGameplayGeometryProvider,
  useHolmGameplayGeometry,
} from "@/lib/wave5GameplayGeometry/HolmGameplayGeometryProvider";
import { HolmAnchoredSlot } from "./HolmAnchoredSlot";
import { HolmLonePlayerFan } from "./HolmLonePlayerFan";
import {
  HolmDealOrchestrator,
  HolmDealRuntimeMaybe,
  HolmDealPhaseHost,
  HolmSettledGate,
  useHolmSettledIds,
} from "./HolmDealOrchestrator";
import { ThreeFiveSevenGameplayGeometryProvider } from "@/lib/wave5GameplayGeometry/ThreeFiveSevenGameplayGeometryProvider";
import { ThreeFiveSevenAnchoredSlot } from "./ThreeFiveSevenAnchoredSlot";
import {
  diceBeatBadgeId,
  diceOpponentDiceStageId,
  type DiceGameType,
} from "@/lib/dice/diceArtifactDescriptors";
import { DiceTraceHUD } from "./DiceTraceHUD";
import { HorsesHandResultDisplay } from "./HorsesHandResultDisplay";
import { HorsesMobileCardsTab } from "./HorsesMobileCardsTab";
import { useHorsesMobileController, HorsesStateFromDB } from "@/hooks/useHorsesMobileController";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { Card as CardType, evaluateHand, formatHandRank, getWinningCardIndices } from "@/lib/cardUtils";
import { getAggressionAbbreviation } from "@/lib/botAggression";
import { getBotAlias } from "@/lib/botAlias";
import { cn, formatChipValue } from "@/lib/utils";
import cubsLogo from "@/assets/cubs-logo.png";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { useChipStackEmoticons } from "@/hooks/useChipStackEmoticons";
import { useDeviceSize } from "@/hooks/useDeviceSize";
import { useWakeLock } from "@/hooks/useWakeLock";
import { MessageSquare, User, Clock, Target } from "lucide-react";
import { HandHistory } from "./HandHistory";
import { traceNormalSeatRender, traceSoloAreaRender, traceNormalSeatBlocked, resetHolmRenderTrace } from "@/lib/holmRenderTrace";
import type { HolmRenderPayload } from "@/lib/holmRenderTrace";
import { usePublishShellFelt, deriveFeltGameKind, type CanonicalFeltGameKind } from "@/lib/canonicalShell/ShellOwnedFeltHost";
import { useShellOverlayPortal } from "@/lib/canonicalShell/ShellOverlayMounts";
import { OverSeatBadgePortal } from "@/lib/canonicalShell/OverSeatBadgePortal";
import { deriveFeltPlateMode } from "@/lib/canonicalShell/feltPlateMode";
import { CanonicalPotZone } from "@/lib/canonicalShell/CanonicalPotZone";
import { useShellTabBar, ShellTabBar } from "@/lib/canonicalShell/ShellTabBar";
import { useShellTimer, ShellTimerRail, useShellTimerStateForRender } from "@/lib/canonicalShell/ShellTimerRail";

import { ShellHudGrid } from "@/lib/canonicalShell/ShellHudGrid";
import { useAnnouncements } from "@/lib/canonicalShell/announcements";
import { dealerAffordanceStore, timerDbgStore, type TimerBlockedReason } from "@/lib/canonicalShell/extraDebugStore";
import { useDealRuntime } from "@/lib/canonicalShell/cardTransport/DealRuntime";
import { HolmOwnershipBeacon } from "@/lib/canonicalShell/cardTransport/HolmOwnershipBeacon";
import { HolmSoloRootRegistrar } from "@/lib/canonicalShell/cardTransport/holmSoloOwnership";
import {
  ChuckyVisualCardInstrumenter,
  chuckyVisualMarkAllSettled,
  chuckyVisualMarkAnnouncement,
  chuckyVisualMarkRevealSequenceScheduled,
  chuckyVisualResetForHand,
} from "@/lib/canonicalShell/cardTransport/holmChuckyRevealDbg";
import { recordHolmTimelineEvent } from "@/lib/canonicalShell/cardTransport/holmWartimeForensics";
import { recordChuckyRenderState } from "@/lib/canonicalShell/cardTransport/holmChuckyRenderStateForensics";
import {
  instrumentHolmSelfStageRender,
  instrumentHolmPotRender,
  recordHolmPotConsumed,
  recordHolmPotComplete,
  recordHolmChuckyAdmission,
} from "@/lib/canonicalShell/cardTransport/holmStageAndPotForensics";

import {
  recordChuckyRevealTimerArm,
  recordChuckyRevealStep,
  ensureChuckyConfigLoaded,
  getChuckyConfiguredStepperDelayMs,
} from "@/lib/canonicalShell/cardTransport/holmChuckyRevealTimingDbg";
import {
  recordSoloStateChange,
  recordChuckyVisualTrigger,
  captureStack,
} from "@/lib/canonicalShell/cardTransport/holmSoloStateTrace";
import { dealDbgUpsert } from "@/lib/canonicalShell/cardTransport/cardTransportDbg";
import { getCanonicalTimerEligibility } from "@/lib/canonicalShell/timerEligibility";

const __chuckyAuditRefIds = new WeakMap<object, string>();
let __chuckyAuditRefSeq = 0;

function __chuckyAuditRefId(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value !== 'object' && typeof value !== 'function') return `${typeof value}:${String(value)}`;
  const obj = value as object;
  let id = __chuckyAuditRefIds.get(obj);
  if (!id) {
    id = `ref#${++__chuckyAuditRefSeq}`;
    __chuckyAuditRefIds.set(obj, id);
  }
  return id;
}

function __chuckyAuditCardsHash(cards: CardType[] | null | undefined): string {
  if (!cards) return 'null';
  return cards.map((c: any) => `${c?.rank ?? '?'}${c?.suit ?? '?'}`).join('|');
}

function __chuckyAuditDiffDeps(
  prev: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): Record<string, { prev: unknown; next: unknown }> | null {
  if (!prev || !next) return null;
  const diff: Record<string, { prev: unknown; next: unknown }> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  keys.forEach((key) => {
    if (!Object.is(prev[key], next[key])) diff[key] = { prev: prev[key], next: next[key] };
  });
  return Object.keys(diff).length > 0 ? diff : null;
}

function __chuckyAuditNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function __chuckyAuditOwnerStack(): string | null {
  try {
    return typeof (React as any).captureOwnerStack === 'function'
      ? (React as any).captureOwnerStack()
      : null;
  } catch {
    return null;
  }
}


// P9.1 — First visible canonical shell visual cutover.
// Default ON; flip VITE_CANONICAL_SHELL_VISUAL='off' to revert.
const CANONICAL_SHELL_VISUAL_ENABLED =
  import.meta.env.VITE_CANONICAL_SHELL_VISUAL !== 'off';

/**
 * HolmOpponentCardBackSlot — slot DOM always exists; the actual
 * CanonicalCardBack content only renders once DealRuntime has settled
 * the cardId. This prevents the cardBacks renderer from bypassing the
 * canonical deal animation by mounting all opponent cards in a single
 * React commit (which made domMountAt == firstVisibleAt < settleAt).
 */
/**
 * HolmOpponentCardBackSlot — strict anchor/card split.
 *
 * Outer container is a layout-stable invisible spacer. It is NOT a card:
 * no `data-holm-card-id`, no `data-holm-renderer`, no card markers, not
 * counted by the ownership scanner. It exists only to reserve fan
 * geometry so settled cards land in the same x-positions they will
 * occupy after settle.
 *
 * The actual `CanonicalCardBack` (with `data-holm-card-id`) mounts ONLY
 * when `deal.isSettled(cardId)`. Before settle, the slot's visible
 * width is zero — no painted DOM that the DOM scanner can mistake for
 * a card. The opp-stack flight target itself is owned by
 * `GameplayOpponentSeatLayer` via `[data-card-anchor="opp-stack-{pos}"]`,
 * not by this slot.
 */
function HolmOpponentCardBackSlot({
  index,
  cardId,
  cardCount,
  hasFolded,
}: {
  index: number;
  cardId: string;
  cardCount: number;
  hasFolded: boolean;
}) {
  const deal = useDealRuntime();
  const settled = deal ? deal.isSettled(cardId) : true;
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: 12,
    height: 20,
    marginLeft: index > 0 ? '-5px' : '0',
    zIndex: cardCount - index,
  };
  return (
    <div
      style={containerStyle}
      data-holm-opp-slot-pending={settled ? undefined : '1'}
      aria-hidden={settled ? undefined : 'true'}
    >
      {settled && (
        <>
          <HolmOwnershipBeacon
            cardId={cardId}
            renderer="MobileGameTable.holmCanonicalSeat.cardBacks"
            componentName="HolmOpponentCardBackSlot"
            handContextId={deal?.handContextId ?? null}
            phase={deal?.phase ?? 'NO_RUNTIME'}
            renderReason="settled-cardback"
          />
          <CanonicalCardBack
            widthPx={12}
            heightPx={20}
            variant="flat"
            dataAttrs={{
              'data-holm-card-id': cardId,
              'data-holm-renderer': 'MobileGameTable.holmCanonicalSeat.cardBacks',
              'data-holm-component': 'OPPONENT',
            }}
            style={{
              position: 'absolute',
              inset: 0,
              animationDelay: hasFolded ? `${index * 0.05}s` : '0s',
            }}
          />
        </>
      )}
    </div>
  );
}

/**
 * CommunityStageHolmSwitch — owns the per-phase swap between the
 * canonical per-slot community renderer (during DealRuntime
 * DEALING/READY) and the legacy CommunityCards reveal renderer
 * (during GAMEPLAY or when no DealRuntime is mounted).
 */
function CommunityStageHolmSwitch({
  handContextId,
  cards,
  revealed,
  highlightedIndices,
  kickerIndices,
  hasHighlights,
  tightOverlap,
}: {
  handContextId: string;
  cards: CardType[];
  revealed: number;
  highlightedIndices: number[];
  kickerIndices: number[];
  hasHighlights: boolean;
  tightOverlap: boolean;
}) {
  const deal = useDealRuntime();
  // HARD LATCH: once we have ever rendered the legacy CommunityCards
  // renderer for this handContextId (i.e. DealRuntime reached GAMEPLAY,
  // OR no DealRuntime is mounted), we MUST NOT revert to the canonical
  // per-slot row. Subsequent waves (e.g. Chucky) call beginWave() which
  // sets phase back to DEALING — without this latch, already-revealed
  // community cards would regress to face-down backs mid-hand.
  const handedOffRef = useRef<string | null>(null);
  const inCanonicalDealRaw =
    !!deal && deal.gameType === 'holm-game' && deal.phase !== 'GAMEPLAY';
  const latchedForThisHand = handedOffRef.current === handContextId;
  if (!inCanonicalDealRaw && !latchedForThisHand) {
    handedOffRef.current = handContextId;
  }
  const inCanonicalDeal = inCanonicalDealRaw && !latchedForThisHand;
  if (inCanonicalDeal) {
    return (
      <HolmCanonicalCommunityRow
        handContextId={handContextId}
        cards={cards}
        tightOverlap={tightOverlap}
      />
    );
  }
  return (
    <CommunityCards
      cards={cards}
      holmHandContextId={handContextId}
      revealed={revealed}
      highlightedIndices={highlightedIndices}
      kickerIndices={kickerIndices}
      hasHighlights={hasHighlights}
      tightOverlap={tightOverlap}
    />
  );
}

function DealAwareShellTimerRail() {
  const deal = useDealRuntime();
  const eligibility = deal
    ? getCanonicalTimerEligibility({
        gameType: deal.gameType,
        dealPhase: deal.phase,
        dealSettled: deal.dealSettled,
        readyReleased: deal.readyReleased,
        activePlayerId: deal.phase === 'GAMEPLAY' ? 'shell-active-turn' : null,
      })
    : { visible: true, running: true };

  useEffect(() => {
    if (!deal) return;
    dealDbgUpsert(deal.handContextId, {
      phase: deal.phase,
      expectedCount: deal.expectedCount,
      cardsSettled: deal.settledCardIds.size,
      dealSettled: deal.dealSettled,
      readyReleased: deal.readyReleased,
      timerVisible: eligibility.visible,
      timerRunning: eligibility.running,
    });
    if (deal.phase !== 'READY' || !deal.readyReleased) return;
    const raf = requestAnimationFrame(() => deal.enterGameplay());
    return () => cancelAnimationFrame(raf);
  }, [deal, deal?.phase, deal?.expectedCount, deal?.settledCardIds.size, deal?.dealSettled, deal?.readyReleased, eligibility.visible, eligibility.running]);

  if (!eligibility.visible) return null;
  return <ShellTimerRail />;
}

function ThreeFiveSevenTimerGateReporter({
  onAllowedChange,
}: {
  onAllowedChange?: (allowed: boolean) => void;
}) {
  const deal = useDealRuntime();
  const allowed = deal ? deal.timerAllowed : true;
  useEffect(() => {
    onAllowedChange?.(allowed);
  }, [allowed, onAllowedChange]);
  // BREAK THE TIMER DEADLOCK:
  // The canonical rail (DealAwareShellTimerRail) is the historical
  // driver of enterGameplay(), but it is only mounted when `hasTimer`
  // is true — and for 3-5-7 `hasTimer` requires `timeLeft !== null`,
  // which is itself gated by `dealTimerAllowed357 === true`, which
  // requires phase === 'GAMEPLAY'. That's circular.
  //
  // This reporter is mounted unconditionally inside the
  // ThreeFiveSevenDealRuntimeMaybe provider, so it always sees the
  // live DealRuntime. Drive READY → GAMEPLAY here so phase advances
  // regardless of rail mount state. Idempotent: DealRuntime's
  // enterGameplay only advances when phase === 'READY'.
  useEffect(() => {
    if (!deal) return;
    if (deal.phase !== 'READY' || !deal.readyReleased) return;
    const raf = requestAnimationFrame(() => deal.enterGameplay());
    return () => cancelAnimationFrame(raf);
  }, [deal, deal?.phase, deal?.readyReleased]);
  return null;
}

function resolveCanonicalFeltKind(gameType: string | undefined): CanonicalFeltGameKind | null {
  if (!CANONICAL_SHELL_VISUAL_ENABLED) return null;
  if (gameType === 'holm-game') return 'holm-game';
  if (gameType === '3-5-7' || gameType === '357' || gameType === '3-5-7-game') return 'three-five-seven';
  if (gameType === 'horses') return 'horses';
  if (gameType === 'ship-captain-crew') return 'ship-captain-crew';
  if (gameType === 'yahtzee') return 'yahtzee';
  return null;
}
import { classify357TransitionType, persist357Investigation } from "@/lib/threeFiveSevenSyncDiagnostics";
import {
  logRevealRenderFrame,
  logResolutionGate,
  type SequenceContext as HolmSequenceContext,
} from "@/lib/holmRevealInstrumentation";


// Persist pot display across MobileGameTable remounts (Game.tsx uses changing `key`, which
// otherwise resets state and reintroduces the pot flash).
const displayedPotMemoryByGameId = new Map<string, number>();

// Custom Spade icon with pronounced stem (Lucide's looks like upside-down heart)
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

// Custom dice icon with visible white pips (Lucide Dice5 shows as solid square)
const DiceIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="0"
  >
    {/* Dice body */}
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    {/* White pips - 5-dot pattern */}
    <circle cx="7.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="12" cy="12" r="1.5" fill="white" />
    <circle cx="7.5" cy="16.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="16.5" r="1.5" fill="white" />
  </svg>
);

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
  auto_fold?: boolean;
  profiles?: {
    username: string;
    aggression_level?: string;
  };
}
interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

function getHolmSelfDealCardIds({
  handContextId,
  players,
  buckPosition,
  selfPlayerId,
  cardsPerPlayer = 4,
}: {
  handContextId: string | null | undefined;
  players: Player[];
  buckPosition: number | null | undefined;
  selfPlayerId: string;
  cardsPerPlayer?: number;
}): string[] {
  if (!handContextId || typeof buckPosition !== 'number' || !selfPlayerId) return [];
  const active = players
    .filter((p) => p.status === 'active' && !p.sitting_out)
    .sort((a, b) => a.position - b.position);
  if (!active.length) return [];
  // CLOCKWISE from buck — must match HolmDealOrchestrator.
  const positions = active.map(p => p.position);
  const byPos = new Map(active.map(p => [p.position, p]));
  if (!byPos.has(buckPosition)) return [];
  const ring: Player[] = [];
  let cur = buckPosition;
  for (let i = 0; i < active.length; i++) {
    const seat = byPos.get(cur);
    if (!seat) return [];
    ring.push(seat);
    if (i < active.length - 1) cur = nextClockwise(cur, positions);
  }
  const ids: string[] = [];
  let dealIndex = 0;
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const recipient of ring) {
      if (recipient.id === selfPlayerId) ids.push(`${handContextId}#hand-${dealIndex}`);
      dealIndex += 1;
    }
  }
  return ids;
}

function UseHolmSelfHand<T>({
  currentPlayerId,
  handContextId,
  players,
  buckPosition,
  cards,
  render,
}: {
  currentPlayerId: string;
  handContextId: string | null | undefined;
  players: Player[];
  buckPosition: number | null | undefined;
  cards: T[];
  render: (effectiveCards: T[], dealPhase: string, boundary: {
    claimedCardIds: string[];
    rawClaimedCardIds: string[];
    baseHandContextId: string;
    playerId: string;
    boundaryCardIdPrefix: string;
  }) => ReactNode;
}) {
  const deal = useDealRuntime();
  const phase = deal?.phase ?? 'NO_RUNTIME';
  const baseHandContextId = handContextId ?? deal?.handContextId ?? 'no-runtime';
  const selfCardIds = useMemo(
    () => getHolmSelfDealCardIds({ handContextId: baseHandContextId, players, buckPosition, selfPlayerId: currentPlayerId }),
    [baseHandContextId, players, buckPosition, currentPlayerId],
  );
  // EXPLICIT 1:1 self-ordinal → settled mapping.
  //
  // selfCardIds is built in self-ordinal order from the buck-first ring
  // (e.g. hand-1, hand-5, hand-9, hand-13 for a 4-handed table). For
  // each self ordinal i, render currentPlayerCards[i] iff that ordinal
  // has been canonically settled. Cards appear in self-ordinal order;
  // never bulk-flash, never fall through to authoritative until the
  // canonical Holm deal completes (phase === GAMEPLAY).
  const effectiveCards = useMemo(() => {
    if (!deal || deal.gameType !== 'holm-game' || deal.phase === 'GAMEPLAY') return cards;
    const out: T[] = [];
    for (let i = 0; i < selfCardIds.length; i++) {
      const cid = selfCardIds[i];
      if (cid && deal.isSettled(cid) && cards[i] != null) out.push(cards[i]);
    }
    return out;
  }, [cards, deal, selfCardIds]);
  const settledSelfCardIds = useMemo(
    () => selfCardIds.filter((cardId) => deal?.isSettled(cardId)),
    [deal, selfCardIds],
  );
  const boundaryCardIdPrefix = `${baseHandContextId}#holm-self#${currentPlayerId || 'no-player'}`;
  const boundaryClaimedCardIds = useMemo(
    () => Array.from({ length: effectiveCards.length }, (_unused, index) => `${boundaryCardIdPrefix}#idx-${index}`),
    [boundaryCardIdPrefix, effectiveCards.length],
  );

  return <>{render(effectiveCards, phase, {
    claimedCardIds: boundaryClaimedCardIds,
    rawClaimedCardIds: settledSelfCardIds,
    baseHandContextId,
    playerId: currentPlayerId,
    boundaryCardIdPrefix,
  })}</>;
}


interface ChatBubbleData {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
}

// (legacy local TimerBar removed — timer presentation is owned by
//  the canonical shell via ShellTimerRail. Games publish state only.)


interface MobileGameTableProps {
  gameId?: string;
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
  /** Server-authored Buck-transfer presentation event (Holm). Latched by id. */
  buckTransferPresentation?: {
    id: string;
    sessionId: string;
    sequence: number;
    fromPosition: number;
    toPosition: number;
    createdAt: string;
    source: string;
  } | null;
  currentTurnPosition?: number | null;
  chuckyCards?: CardType[];
  chuckyActive?: boolean;
  chuckyCardsRevealed?: number;
  roundStatus?: string;
  // Horses (dice) state
  horsesRoundId?: string | null;
  horsesState?: HorsesStateFromDB | null;
  /** Dealer-game (session) UUID for the dice game framework identity feed. */
  horsesDealerGameId?: string | null;
  /** Authoritative hand_number of the current round (drives progress vector). */
  horsesHandNumber?: number | null;
  pendingDecision?: 'stay' | 'fold' | null;
  isPaused?: boolean;
  anteAmount?: number;
  pussyTaxValue?: number;
  gameStatus?: string; // For ante animation trigger
  instanceLabel?: string; // For diagnostic instrumentation only — identifies which MobileGameTable render-site is mounted
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
  holmWinWinnerPositions?: number[]; // For multi-player wins
  onHolmWinPotAnimationComplete?: () => void;
  // Horses win pot animation props (winner takes pot at game end)
  horsesWinPotTriggerId?: string | null;
  horsesWinPotAmount?: number;
  horsesWinWinnerPosition?: number;
  onHorsesWinPotAnimationComplete?: () => void;
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
  allMessages?: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }[];
  latestRealtimeChatMessage?: { id: string; user_id: string; message: string; image_url?: string | null; username?: string } | null;
  onSendChat?: (message: string, imageFile?: File) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  // Observer leave game prop
  onLeaveGameNow?: () => void;
  // Waiting phase - hide pot display
  isWaitingPhase?: boolean;
  // Canonical slot-owned waiting content (rendered inside the table container,
  // not as a floating overlay). Used by WaitingForPlayersTable to fold the
  // seated-count message into the canonical stage.
  waitingSlotContent?: React.ReactNode;
  // Waiting-only active-player content pane. Rendered in the bottom HUD
  // region (in place of the gameplay cards tab) while `isWaitingPhase` is
  // true. Hosts the Invite / Add Bot / Start Game (dealer) and Share
  // (non-dealer) controls so gameplay actions live in the active pane,
  // not on the felt.
  waitingActivePaneContent?: React.ReactNode;
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
  // Holm rabbit hunt enabled
  rabbitHunt?: boolean;
  // Mobile tab state (lifted to parent to persist across remounts)
  activeTab?: 'cards' | 'chat' | 'lobby' | 'history';
  onActiveTabChange?: (tab: 'cards' | 'chat' | 'lobby' | 'history') => void;
  // Unread messages state (lifted to parent to persist across remounts)
  hasUnreadMessages?: boolean;
  onHasUnreadMessagesChange?: (hasUnread: boolean) => void;
  // Chat seen watermark (lifted to parent to persist across remounts)
  lastSeenChatMessageId?: string | null;
  onLastSeenChatMessageIdChange?: (id: string | null) => void;
  // Chat read watermark (lifted to parent to persist across remounts)
  lastReadChatMessageId?: string | null;
  onLastReadChatMessageIdChange?: (id: string | null) => void;
  // Chat input state (lifted to parent to persist across remounts)
  chatInputValue?: string;
  onChatInputChange?: (value: string) => void;
  // Dealer setup message - shown as yellow announcement when another player is configuring
  dealerSetupMessage?: string | null;
  // Re-ante message - shown during 3-5-7 subsequent round 1 ante animations
  reAnteMessage?: string | null;
  // Auto-fold callback for when player disables auto_fold
  onAutoFoldChange?: (playerId: string, autoFold: boolean) => void;
  // When true, auto-roll disable is deferred until end of current turn
  pendingAutoRollOff?: boolean;
  on357TimerAllowedChange?: (allowed: boolean) => void;
  // High card dealer selection props
  dealerSelectionCards?: { playerId: string; position: number; card: { suit: string; rank: string }; isRevealed: boolean; isWinner: boolean; isDimmed: boolean; roundNumber: number }[];
  dealerSelectionAnnouncement?: string | null;
  dealerSelectionWinnerPosition?: number | null; // Position of winner for spotlight effect
  /**
   * Legacy `feltOwnership` prop has been retired. Shell-owned felt is the
   * sole canonical mount for every family — no local felt branch exists.
   */
}

/**
 * DealerSelectionVisibilityTracker — render-tied cards_visible probe.
 *
 * Mounted INSIDE the `{dealerSelectionCards.length > 0 && (...)}` branch
 * of the session dealer-selection overlay. Because it lives inside the
 * conditional, its mount/unmount actually reflects whether the overlay
 * reached the DOM — not just whether props arrived at MobileGameTable.
 * A prop-keyed effect at the component root cannot make that distinction
 * and was previously firing `cards_visible` even in repros where the
 * user never saw the cards.
 */
const DealerSelectionVisibilityTracker = ({
  gameId,
  cardCount,
  winnerPosition,
  viewerHasCurrentPlayer,
}: {
  gameId: string | undefined;
  cardCount: number;
  winnerPosition: number | null;
  viewerHasCurrentPlayer: boolean;
}) => {
  const lastCountRef = useRef<number>(0);
  useEffect(() => {
    // Defer one frame so child PlayingCard DOM exists before counting.
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const domCount =
          typeof document !== 'undefined'
            ? document.querySelectorAll('[data-dsel-card="1"]').length
            : 0;
        recordDealerSelectionDiag('dealer_selection_cards_visible', {
          sessionId: gameId ?? null,
          dealerSelectionId: gameId ? `${gameId}:host` : null,
          cardCount: domCount,
          winnerPosition,
          presentationVisibilityState: domCount > 0 ? 'visible' : 'mounted-empty',
          extra: {
            surface: 'MobileGameTable.dealerSelectionOverlay',
            phase: 'mount',
            viewerHasCurrentPlayer,
            propCardCount: cardCount,
            domCardCount: domCount,
          },
        });
        lastCountRef.current = domCount;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      recordDealerSelectionDiag('dealer_selection_cards_visible', {
        sessionId: gameId ?? null,
        dealerSelectionId: gameId ? `${gameId}:host` : null,
        cardCount: 0,
        winnerPosition,
        presentationVisibilityState: 'cleared',
        extra: {
          surface: 'MobileGameTable.dealerSelectionOverlay',
          phase: 'unmount',
          priorDomCount: lastCountRef.current,
          viewerHasCurrentPlayer,
        },
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};


export const MobileGameTable = ({
  gameId,
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
  buckTransferPresentation,
  currentTurnPosition,
  chuckyCards,
  chuckyActive,
  chuckyCardsRevealed,
  roundStatus,
  horsesRoundId,
  horsesState,
  horsesDealerGameId,
  horsesHandNumber,
  pendingDecision,
  isPaused,
  anteAmount = 0,
  pussyTaxValue = 1,
  gameStatus,
  instanceLabel = 'unknown',
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
  holmWinWinnerPositions = [],
  onHolmWinPotAnimationComplete,
  horsesWinPotTriggerId,
  horsesWinPotAmount = 0,
  horsesWinWinnerPosition = 1,
  onHorsesWinPotAnimationComplete,
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
  latestRealtimeChatMessage = null,
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onLeaveGameNow,
  isWaitingPhase = false,
  waitingSlotContent,
  waitingActivePaneContent,
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
  rabbitHunt = false,
  activeTab: externalActiveTab,
  onActiveTabChange,
  hasUnreadMessages: externalHasUnreadMessages,
  onHasUnreadMessagesChange,
  lastSeenChatMessageId: externalLastSeenChatMessageId,
  onLastSeenChatMessageIdChange,
  lastReadChatMessageId: externalLastReadChatMessageId,
  onLastReadChatMessageIdChange,
  chatInputValue: externalChatInputValue,
  onChatInputChange: externalOnChatInputChange,
  dealerSetupMessage,
  reAnteMessage,
  onAutoFoldChange,
  pendingAutoRollOff = false,
  on357TimerAllowedChange,
  dealerSelectionCards = [],
  dealerSelectionAnnouncement,
  dealerSelectionWinnerPosition,
}: MobileGameTableProps) => {
  useStartupMountTrace('MobileGameTable', { gameId: gameId ?? null, gameType: gameType ?? null, instanceLabel });
  useStartupRenderTrace('MobileGameTable', {
    gameId: gameId ?? null,
    gameType: gameType ?? null,
    gameStatus: gameStatus ?? null,
    instanceLabel,
    playersCount: players.length,
    currentTurnPosition: currentTurnPosition ?? null,
    roundStatus: roundStatus ?? null,
    horsesRoundId: horsesRoundId ?? null,
    horsesDealerGameId: horsesDealerGameId ?? null,
    horsesHandNumber: horsesHandNumber ?? null,
    isWaitingPhase,
    isGameOver,
  }, { file: 'src/components/MobileGameTable.tsx' });
  const {
    getFourColorSuit,
    getCardBackColors,
    getEffectiveDeckColorMode,
  } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const deckColorMode = getEffectiveDeckColorMode();

  // Shell-owned transient overlay portal — HighCard reveal escapes the
  // gameplay subtree (where CanonicalSeatCluster's always-on stacking
  // contexts would trap it under chip discs/nameplates) and renders in
  // the shell's `slot` overlay layer (z=78, above seat clusters, below
  // ChipTransportRuntime z=80). See ShellOverlayMounts.
  const highCardOverlayPortal = useShellOverlayPortal('slot');

  // ── dealer_selection_diag: cards_visible / cleared ──
  // NOTE: this checkpoint is intentionally NOT fired from a prop-keyed
  // effect here. Receiving props does not prove the cards reached the
  // render surface — an ancestor gate, conditional render, or unmount
  // can keep the overlay from ever mounting. The checkpoint is fired
  // from <DealerSelectionVisibilityTracker /> mounted INSIDE the actual
  // `{dealerSelectionCards.length > 0 && (...)}` render branch below,
  // so "visible" and "cleared" reflect true DOM mount/unmount of the
  // session dealer-selection overlay.


  // Publish canonical felt context to the shell-owned host (sole felt mount).
  // CRITICAL: when no concrete game kind can be derived (pre-first-game in
  // the persistent poker-shell, gameType still null), we publish `null` so
  // we do NOT semantically leak a fake 'holm-game' default onto the felt.
  // NeutralInterstitial's waiting-phase publish then owns the felt and
  // suppresses the game-name plate.
  const _derivedFeltKind = deriveFeltGameKind(gameType);
  usePublishShellFelt(
    _derivedFeltKind
      ? {
          gameKind: _derivedFeltKind,
          anteAmount,
          potMaxEnabled,
          potMaxValue,
          legsToWin,
          // isWaitingPhase retained for legacy compatibility — felt no
          // longer reads it for plate selection (see feltPlateMode).
          isWaitingPhase,
          // EXPLICIT plate contract: derive from server status, NOT
          // from `isWaitingPhase` (which means HUD/animation gating
          // elsewhere). Single source of truth for felt plate.
          feltPlateMode: deriveFeltPlateMode(gameStatus),
          publisherLabel: `MobileGameTable:${instanceLabel}`,
        }
      : null,
  );

  // ── DIAGNOSTIC: poker-shell continuity audit ──────────────────────
  useLifecycleMount('MobileGameTable', {
    instanceLabel,
    gameType: gameType ?? null,
    initialGameStatus: gameStatus ?? null,
  });
  useShellChangeTracker('MobileGameTable', 'instanceLabel', instanceLabel);
  useShellChangeTracker('MobileGameTable', 'gameType', gameType ?? '(none)');
  useShellUnmountSnapshot('MobileGameTable', {
    parent: 'Game.tsx (varies by branch) — key={gameId} so remounts only on gameId change',
    instanceLabel,
    gameType: gameType ?? null,
    gameStatus: gameStatus ?? null,
  });
  useEffect(() => {
    setLifecycleFact(`MGT:${instanceLabel}:gameStatus`, gameStatus ?? null);
    setLifecycleContext({
      gameType: gameType ?? null,
      gameStatus: gameStatus ?? null,
      shellRoute: `MGT:${instanceLabel}`,
    });
  }, [gameStatus, instanceLabel, gameType]);

  // ── Holm lifecycle trace (P0 investigation, instrumentation only) ──
  // Captures every transition in the prop-level fields that govern the
  // Holm WIN_SEQUENCE → blank-table → replay symptom chain. Diff-emits
  // to debug_events (event_type='lifecycle.holm.lifecycle') and to the
  // on-screen shell lifecycle panel. No behavior change.
  useHolmLifecycleTrace(
    {
      gameType: gameType ?? null,
      gameStatus: gameStatus ?? null,
      currentRound: currentRound ?? null,
      holmWinPotTriggerId: holmWinPotTriggerId ?? null,
      holmWinPotAmount: holmWinPotAmount ?? 0,
      holmWinWinnerPosition: holmWinWinnerPosition ?? null,
      holmShowdownPhase: holmShowdownPhase ?? null,
      holmShowdownTriggerId: holmShowdownTriggerId ?? null,
      instanceLabel,
    },
    { scope: instanceLabel, enabled: gameType === 'holm-game' },
  );

  // ── Waiting-table flight recorder (instrumentation only) ────────
  // Classify which surface this MGT instance is presenting based on
  // its lifecycle inputs. Emits an ownership snapshot once per
  // (surface, instanceLabel, gameType) tuple.
  useEffect(() => {
    const PRE_SESSION_STATUSES = new Set([
      'waiting',
      'dealer_selection',
      'cribbage_dealer_selection',
      'configuring',
      'game_selection',
      'ante_decision',
    ]);
    const isPreSessionPhase = !!gameStatus && PRE_SESSION_STATUSES.has(gameStatus);
    const surface = isWaitingPhase
      ? 'WaitingSlot'
      : (gameStatus === 'dealer_selection' ? 'DealerSelection' : 'Gameplay');
    recordWaitingLifecycle(`MGT presenting ${surface}`, {
      gameId: gameId ?? null,
      instanceLabel,
      gameType: gameType ?? null,
      gameStatus: gameStatus ?? null,
      isWaitingPhase,
      isGameOver,
      playerCount: players.length,
    });
    recordSurfaceOwnership(surface, {
      SeatOwner: 'Shell:MobileGameTable CanonicalSeatCluster',
      ChipOwner: isPreSessionPhase
        ? 'Shell:MobileGameTable CanonicalSeatCluster (pre-session identity pill)'
        : 'Shell:MobileGameTable renderPlayerChip (gameplay glyph)',
      ControlOwner: isWaitingPhase
        ? 'Slot:waitingSlotContent (Add Bot / Start Game injected)'
        : 'Slot:MobileGameTable gameplay actions',
      AnnouncementOwner: 'Shell:CanonicalAnnouncementProvider rail',
      HUDOwner: 'Shell:ShellHudChrome + ShellTabBar',
    }, { instanceLabel, gameType: gameType ?? null });
  }, [isWaitingPhase, gameStatus, gameType, instanceLabel, isGameOver, gameId, players.length]);

  // P-WAIT.B2: per-player chip-glyph render trace (MGT). Surface name
  // is derived the same way as the MGT presenting emit above. Signature-
  // keyed so we only emit when the rendered chip identity changes.
  useEffect(() => {
    const PRE_SESSION_STATUSES = new Set([
      'waiting',
      'dealer_selection',
      'cribbage_dealer_selection',
      'configuring',
      'game_selection',
      'ante_decision',
    ]);
    const isPreSessionPhase = !!gameStatus && PRE_SESSION_STATUSES.has(gameStatus);
    const surface = isWaitingPhase
      ? 'WaitingSlot'
      : (gameStatus === 'dealer_selection' ? 'DealerSelection' : 'Gameplay');
    // During pre-session the seat-map renders the canonical identity
    // pill via CanonicalSeatCluster (status palette) for every consumer
    // of MobileGameTable — matching CanonicalShellWaitingSurface. Only
    // gameplay phases fall back to the per-game chip glyphs.
    const isCanonicalSeat =
      isPreSessionPhase ||
      gameType === 'cribbage' ||
      gameType === 'gin-rummy' ||
      gameType === 'yahtzee';
    const renderer = isCanonicalSeat ? 'CanonicalSeatCluster.chipValue' : 'renderPlayerChip';
    const viewerPos = (players as any[]).find(p => p.user_id === currentUserId)?.position ?? null;
    for (const p of (players as any[])) {
      recordWaitingLifecycleIfChanged(
        `chipglyph:MGT:${instanceLabel}:${p.id}`,
        'chip-glyph render',
        {
          surface,
          renderer,
          position: p.position,
          playerId: p.id,
          userId: p.user_id,
          name: p.profiles?.username ?? (p.is_bot ? 'Bot' : 'Player'),
          chipValue: p.chips ?? 0,
          variant: isCanonicalSeat ? 'status-palette' : 'gameplay-glyph',
          seatAnchorSource: 'MobileGameTable (shell SeatAnchorLayer)',
          chipAnchorSource: isCanonicalSeat
            ? 'CanonicalSeatCluster (slot-derived)'
            : 'renderPlayerChip (gameplay glyph)',
          chipStyleSource: isCanonicalSeat
            ? 'derivePlayerStatus → status palette'
            : 'renderPlayerChip (gameplay glyph)',
          projectionMode: null,
          viewerPosition: viewerPos,
          instanceLabel,
          isPreSessionPhase,
        },
      );
    }
  }, [players, isWaitingPhase, gameStatus, gameType, instanceLabel, currentUserId]);



  // Prevent screen from dimming during gameplay
  useWakeLock(true);

  // Helper: check if this is a dice game (Horses or Ship Captain Crew)
  const isDiceGame = gameType === 'horses' || gameType === 'ship-captain-crew';
  // Dealer setup/config phases keep the table mounted as a dimmed background.
  // Dice gameplay/result surfaces must be hard-disabled here; otherwise prior
  // dealer-game result badges can survive behind the setup modal.
  const isDealerConfigPhase = gameStatus === 'ante_decision' || gameStatus === 'configuring' || gameStatus === 'game_selection' || gameStatus === 'dealer_selection';
  const diceGameplayUiActive = isDiceGame && !isDealerConfigPhase;

  // DEALER AFFORDANCE DBG — dice families MUST render no dealer
  // affordance of any kind. This emitter proves the contract.
  useEffect(() => {
    if (!isDiceGame) return;
    dealerAffordanceStore.record({
      game: gameType ?? 'unknown',
      identityDealerVisible: false, // gated by gameType in identity row
      seatDealerVisible: false,     // renderHorses/SccCanonicalSeat pass isDealer={false}
      legacyDealerVisible: false,   // felt D pip now gated on !isDiceGame
      callerId: currentUserId ? currentUserId.slice(0, 8) : null,
      dealerId: dealerPosition != null ? `pos:${dealerPosition}` : null,
    });
  }, [isDiceGame, gameType, currentUserId, dealerPosition]);

  
  // Z-index for player slots - higher in dice games to stay above spotlight
  // For 3-5-7 games, player cards need to be above the pot (z-20) during showdown
  const playerSlotZIndex = diceGameplayUiActive ? 'z-[105]' : 'z-30';
  
  // Device size detection for tablet/desktop responsive sizing
  const { isTablet, isDesktop } = useDeviceSize();

  // Dice game controller - enabled for Horses and Ship Captain Crew
  const horsesController = useHorsesMobileController({
    enabled: diceGameplayUiActive,
    gameId,
    dealerGameId: horsesDealerGameId ?? null,
    currentHandNumber: horsesHandNumber ?? null,
    players: players as any,
    currentUserId,
    pot,
    anteAmount,
    dealerPosition: dealerPosition ?? 1,
    currentRoundId: horsesRoundId ?? null,
    horsesState: (horsesState as any) ?? null,
    gameType: gameType ?? 'horses',
    isPaused: isPaused ?? false,
    decisionTimerSeconds: maxTime,
  });

  // Tab state - use external if provided, otherwise internal
  const [internalActiveTab, setInternalActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
  const activeTab = externalActiveTab ?? internalActiveTab;
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab;
  
  // Flash the cards tab icon when new cards are dealt
  const [cardsTabFlashing, setCardsTabFlashing] = useState(false);
  const prevCardCountRef = useRef<number>(0);
  
  // Flash the chat tab icon when new messages arrive
  const [chatTabFlashing, setChatTabFlashing] = useState(false);
  // Unread messages state - use external if provided, otherwise internal
  const [internalHasUnreadMessages, setInternalHasUnreadMessages] = useState(false);
  const hasUnreadMessages = externalHasUnreadMessages ?? internalHasUnreadMessages;
  const setHasUnreadMessages = onHasUnreadMessagesChange ?? setInternalHasUnreadMessages;
  // Chat seen watermark - use external (lifted) if provided, otherwise internal
  const [internalLastSeenId, setInternalLastSeenId] = useState<string | null>(null);
  const lastSeenChatMessageId = externalLastSeenChatMessageId ?? internalLastSeenId;
  const setLastSeenChatMessageId = onLastSeenChatMessageIdChange ?? setInternalLastSeenId;
  // Chat read watermark - use external (lifted) if provided, otherwise internal
  const [internalLastReadId, setInternalLastReadId] = useState<string | null>(null);
  const lastReadChatMessageId = externalLastReadChatMessageId ?? internalLastReadId;
  const setLastReadChatMessageId = onLastReadChatMessageIdChange ?? setInternalLastReadId;
  // Hydration guard: skip indicator logic until initial message load is complete
  const chatHydratedRef = useRef(false);
  const hasObservedInitialChatSnapshotRef = useRef(false);
  const processedEligibleRealtimeRef = useRef(false);
  const lastProcessedRealtimeMessageIdRef = useRef<string | null>(null);
  const greenClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showGreenChatIndicator = chatTabFlashing;
  const showRedChatIndicator = hasUnreadMessages && !chatTabFlashing;

  const getChatIndicatorEligibility = useCallback((message: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }) => {
    const isOptimistic = message.id.startsWith('optimistic-');
    const isDealerOrSystem = message.id.startsWith('dealer-') || !message.user_id;
    const isSelfAuthored = !!currentUserId && message.user_id === currentUserId;
    const authorPlayer = players.find((player) => player.user_id === message.user_id);
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

    return {
      eligible: reason === 'eligible-other-human',
      reason,
    };
  }, [currentUserId, players]);

  const eligibleIndicatorMessages = useMemo(
    () => allMessages.filter((message) => getChatIndicatorEligibility(message).eligible),
    [allMessages, getChatIndicatorEligibility]
  );

  const getMessagesAfterWatermark = useCallback(
    (
      messages: { id: string; user_id: string; message: string; image_url?: string | null; username?: string }[],
      watermarkId: string | null | undefined,
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
        surface: 'holm',
        messageId: message?.id ?? null,
        currentUserId: currentUserId ?? null,
        'message.user_id': message?.user_id ?? null,
        activeTab,
        hydrated: chatHydratedRef.current,
        flashing: chatTabFlashing,
        unread: hasUnreadMessages,
        lastSeen: lastSeenChatMessageId,
        lastRead: lastReadChatMessageId,
        ...overrides,
      });
    },
    [activeTab, chatTabFlashing, currentUserId, hasUnreadMessages, lastReadChatMessageId, lastSeenChatMessageId]
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

    if (latestEligibleMessage && lastReadChatMessageId !== latestEligibleMessage.id) {
      setLastReadChatMessageId(latestEligibleMessage.id);
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
  }, [
    chatTabFlashing,
    eligibleIndicatorMessages,
    hasUnreadMessages,
    lastReadChatMessageId,
    logChatIndicator,
    setActiveTab,
    setHasUnreadMessages,
    setLastReadChatMessageId,
  ]);

  useEffect(() => {
    return () => {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
      }
    };
  }, []);
  
  // Swipe gesture handlers for tab switching
  const swipeHandlers = useSwipeGesture(
    () => {}, // Swipe up - no action
    () => {}  // Swipe down - no action
  );

  // Chopped animation state
  const [showChopped, setShowChopped] = useState(false);
  const lastChoppedResultRef = useRef<string | null>(null);
  
  // Dice debug overlay state tracking
  const [feltBlockMounted, setFeltBlockMounted] = useState(false);

  // CRITICAL FIX: Freeze Beat badge at turn start - never update during player's turn
  // This prevents the badge from flickering/updating when the player's roll takes the lead
  // The cache is snapshotted ONCE when isMyTurn transitions from false to true,
  // and is never updated again until the turn ends.
  const cachedWinningResultRef = useRef<{
    description: string;
    dice: any[] | null;
    dealerGameId: string | null;
    roundId: string | null;
    source: string;
  } | null>(null);
  const turnSnapshotTakenRef = useRef(false); // True once we've snapshotted at turn start
  const horsesDealerGameScope = horsesDealerGameId ?? null;
  const horsesRoundScope = horsesRoundId ?? null;
  const renderDealerGameScopeRef = useRef<string | null>(horsesDealerGameScope);
  const isHorsesDealerBoundaryFirstRender = isDiceGame && renderDealerGameScopeRef.current !== horsesDealerGameScope;

  // Synchronous first-frame boundary guard: refs cleared in useEffect are one
  // commit too late. The Beat/result cache can otherwise paint prior dealer-game
  // badges for a frame before cleanup runs.
  if (
    cachedWinningResultRef.current &&
    (isDealerConfigPhase ||
      cachedWinningResultRef.current.dealerGameId !== horsesDealerGameScope ||
      cachedWinningResultRef.current.roundId !== horsesRoundScope)
  ) {
    console.warn('[HORSES_BADGE_BOUNDARY] rejected stale Beat badge cache before paint', {
      cachedDealerGameId: cachedWinningResultRef.current.dealerGameId?.slice(0, 8) ?? null,
      currentDealerGameId: horsesDealerGameScope?.slice(0, 8) ?? null,
      cachedRoundId: cachedWinningResultRef.current.roundId?.slice(0, 8) ?? null,
      currentRoundId: horsesRoundScope?.slice(0, 8) ?? null,
      source: cachedWinningResultRef.current.source,
      description: cachedWinningResultRef.current.description,
    });
    cachedWinningResultRef.current = null;
    turnSnapshotTakenRef.current = false;
  }

  if (isHorsesDealerBoundaryFirstRender) {
    console.info('[HORSES_BADGE_BOUNDARY] first render after dealerGameId change', {
      prevDealerGameId: renderDealerGameScopeRef.current?.slice(0, 8) ?? null,
      nextDealerGameId: horsesDealerGameScope?.slice(0, 8) ?? null,
      roundId: horsesRoundScope?.slice(0, 8) ?? null,
      gamePhase: horsesController.gamePhase,
      currentTurnPlayerId: horsesController.currentTurnPlayerId?.slice(0, 8) ?? null,
      myStateComplete: !!horsesController.myState?.isComplete,
      myStateResult: (horsesController.myState?.result as any)?.description ?? null,
      completedHoldPlayerId: horsesController.completedTurnHold?.playerId?.slice(0, 8) ?? null,
      currentWinningResult: (horsesController.currentWinningResult as any)?.description ?? null,
      cachedBeatBadge: cachedWinningResultRef.current
        ? {
            dealerGameId: cachedWinningResultRef.current.dealerGameId?.slice(0, 8) ?? null,
            roundId: cachedWinningResultRef.current.roundId?.slice(0, 8) ?? null,
            source: cachedWinningResultRef.current.source,
            description: cachedWinningResultRef.current.description,
          }
        : null,
    });
    renderDealerGameScopeRef.current = horsesDealerGameScope;
  }
  
  // Detect turn transitions and manage snapshot lifecycle
  const isMyTurn = horsesController.isMyTurn;
  useEffect(() => {
    if (isMyTurn && !turnSnapshotTakenRef.current) {
      // Turn just started - take the snapshot NOW (before any rolls)
      const liveWinningResult = horsesController.currentWinningResult;
      const liveWinningDice = horsesController.getWinningPlayerDice?.();
      
      if (liveWinningResult?.description) {
        cachedWinningResultRef.current = {
          description: liveWinningResult.description,
          dice: liveWinningDice ?? null,
          dealerGameId: horsesDealerGameId ?? null,
          roundId: horsesRoundId ?? null,
          source: 'turn-start-snapshot',
        };
      } else {
        // No hand to beat - explicitly set to null so we don't show any beat badge
        cachedWinningResultRef.current = null;
      }
      turnSnapshotTakenRef.current = true;
      console.log('[MobileGameTable] Beat badge snapshot taken at turn start:', cachedWinningResultRef.current);
    } else if (!isMyTurn && turnSnapshotTakenRef.current) {
      // Turn just ended - reset for next time
      turnSnapshotTakenRef.current = false;
      cachedWinningResultRef.current = null;
    }
  }, [isMyTurn, horsesController.currentWinningResult, horsesController.getWinningPlayerDice, horsesDealerGameScope, horsesRoundScope]);

  // CRITICAL FIX: Sticky cache for the entire felt block content.
  // During brief state gaps (gamePhase flips to waiting/complete, currentTurnPlayerId null, etc.)
  // the felt block used to return null (unmount) which causes visible flicker.
  // We reuse the last rendered node for a short grace period.
  const cachedFeltBlockNodeRef = useRef<{
    at: number;
    dealerGameId: string | null;
    roundId: string | null;
    turnPlayerId: string | null;
    node: any;
  } | null>(null);

  if (isDealerConfigPhase && cachedFeltBlockNodeRef.current) {
    console.warn('[HORSES_BADGE_BOUNDARY] rejected stale felt block cache during dealer setup', {
      gameStatus,
      cachedDealerGameId: cachedFeltBlockNodeRef.current.dealerGameId?.slice(0, 8) ?? null,
      cachedRoundId: cachedFeltBlockNodeRef.current.roundId?.slice(0, 8) ?? null,
    });
    cachedFeltBlockNodeRef.current = null;
  }

  // Parent-level felt block tracing: track previous branch to detect switches
  const prevFeltBranchRef = useRef<string>("none");
  const prevFeltRollKeyRef = useRef<string | number | undefined>(undefined);
  const feltBranchCountRef = useRef(0);

  // Buck's on you overlay — event-driven, strictly scoped to handContextId.
  // SINGLE OWNER. Fires once per handContextId iff: the prior-hand observed
  // buckPosition existed AND differed AND the new-hand buckPosition === self.
  // No phase/roundStatus/dealer/announcement/result triggers. No fallback writers.
  const [activeBuckPresentationId, setActiveBuckPresentationId] = useState<string | null>(null);
  // Latched server-authored buck-transfer presentation waiting for the
  // prior-hand teardown boundary before promoting to active (showing
  // BucksOnYou). Cleared once promoted or once a newer event supersedes.
  const [pendingBuckPresentation, setPendingBuckPresentation] =
    useState<{ id: string; hci: string | null } | null>(null);
  // Latch on Buck-transfer event ID (NOT handContextId). Server-authored events
  // carry stable IDs; we render exactly once per ID for the receiving viewer.
  const buckOverlayFiredEventIdRef = useRef<string | null>(null);
  // The active gated handContextId — retained as no-op for legacy gate
  // release on overlay completion. Deal is NOT blocked by buck overlay.
  const buckOverlayGatedHciRef = useRef<string | null>(null);
  // Retained for legacy forensic shape; no longer used for show eligibility.
  const priorHandBuckRef = useRef<{ hci: string; buckPosition: number } | null>(null);
  const buckOverlayFiredForHciRef = useRef<string | null>(null);

  
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
  // REF-BASED GUARD: Prevents double-trigger of leg animation due to async state batching
  // When set to true, the fallback path in 357 win trigger will skip forcing the animation
  const legAnimationActiveRef = useRef(false);
  
  // 357 Sweeps pot animation state
  const [showSweepsPot, setShowSweepsPot] = useState(false);
  const [sweepsPlayerName, setSweepsPlayerName] = useState('');
  const lastSweepsResultRef = useRef<string | null>(null);
  
  // 3-5-7 win animation state (phases: leg -> legs-to-player -> pot-to-player)
  // ⚠ TODO WAVE 5 — ThreeFiveSevenWinController is parked. See
  // src/lib/357/UNDER_CONSTRUCTION.md for the full inventory and the
  // selector list (useShould357DeferPot / DeferHandReset /
  // SuppressAnnouncement / IsSeatTabled) that should migrate into
  // CanonicalPhaseEngine. Phase ownership remains game-local until then.
  // Known shipping bug: MGT/Game remount mid-sequence strands the win
  // animation (Loading… flash → zombie table).
  const [threeFiveSevenWinPhase, setThreeFiveSevenWinPhase] = useState<'idle' | 'waiting' | 'legs-to-player' | 'pot-to-player' | 'delay'>('idle');
  const [legsToPlayerTriggerId, setLegsToPlayerTriggerId] = useState<string | null>(null);
  const [potToPlayerTriggerId357, setPotToPlayerTriggerId357] = useState<string | null>(null);
  const lastThreeFiveSevenTriggerRef = useRef<string | null>(null);
  const currentAnimationIdRef = useRef<string | null>(null); // Track current animation to ignore stale callbacks
  const threeFiveSevenWinPhaseRef = useRef<'idle' | 'waiting' | 'legs-to-player' | 'pot-to-player' | 'delay'>('idle'); // Ref for callback access
  const legsToPlayerCompletedRef = useRef<string | null>(null); // Guard against duplicate legs-to-player completion
  const potToPlayerCompletedRef = useRef<string | null>(null); // Guard against duplicate pot-to-player completion
  
  // DEBUG: Track when phase changed for elapsed time in overlay
  const phaseChangedAtRef = useRef<number>(Date.now());
  const [debugElapsedMs, setDebugElapsedMs] = useState(0);
  
  // Update elapsed time every 100ms when not idle (for debug overlay)
  useEffect(() => {
    if (threeFiveSevenWinPhase === 'idle') {
      phaseChangedAtRef.current = Date.now();
      setDebugElapsedMs(0);
      return;
    }
    
    // Phase changed - reset timer
    phaseChangedAtRef.current = Date.now();
    setDebugElapsedMs(0);
    
    const interval = setInterval(() => {
      setDebugElapsedMs(Date.now() - phaseChangedAtRef.current);
    }, 100);
    
    return () => clearInterval(interval);
  }, [threeFiveSevenWinPhase]);
  
  // FIX: Keep pot hidden after Holm win animation until game resets
  // NEW APPROACH: Use a "pot hidden until next game" flag that's set when Holm win starts
  const [holmWinPotHiddenUntilReset, setHolmWinPotHiddenUntilReset] = useState(false);
  
  // FIX: Same for 357 - keep pot hidden after pot-to-player animation until game resets
  const [threeFiveSevenPotHiddenUntilReset, setThreeFiveSevenPotHiddenUntilReset] = useState(false);

  // HOLM: Lock solo-vs-Chucky tabling once it starts to prevent flicker/unmount during win animation
  const [soloVsChuckyTableLocked, setSoloVsChuckyTableLocked] = useState(false);
  const [soloVsChuckyPlayerIdLocked, setSoloVsChuckyPlayerIdLocked] = useState<string | null>(null);
  // Track if tabled cards have already animated (to prevent re-animation on re-render)
  const soloVsChuckyAnimatedRef = useRef(false);
  // Track which handContextId the solo-vs-Chucky lock was captured for.
  // CRITICAL: Prevents stale re-capture during hand transitions where isSoloVsChuckyRaw
  // is momentarily true from previous hand's lingering current_decision='stay'.
  const soloVsChuckyLockHandRef = useRef<string | null>(null);

  // Wave 5D follow-up — lone-player tabled-cards persistence snapshot.
  // Captured the first time the stage becomes visible in the current
  // hand and re-used until the handContextId boundary clears it. Keeps
  // ONE descriptor / ONE placement / ONE renderer / ONE DOM root alive
  // through TABLED → CHUCKY_REVEAL → SHOWDOWN → PLAYER_TO_POT →
  // WIN_SEQUENCE → COMPLETE even when isSoloVsChucky / current_decision
  // / player_cards momentarily flicker false.
  const lonePlayerStageSnapshotRef = useRef<{
    handContextId: string;
    playerId: string;
    cards: CardType[];
  } | null>(null);

  // Sticky persistence refs used by the TABLED_SELF / CHUCKY_TABLED render
  // predicates only. They mirror the live state when it is good and are
  // ONLY released when a NEW non-null handContextId arrives that differs
  // from the captured one (NEXT_HAND PRE_DEAL). They are NOT wiped by
  // intermediate lifecycle effects, so the stages persist through
  // CHUCKY_REVEAL → RESULT_ANNOUNCEMENT → SHOWDOWN → WIN_SEQUENCE →
  // PLAYER_TO_POT exactly per the ownership contract.
  const tabledSelfStickyRef = useRef<{
    handContextId: string;
    playerId: string;
    cards: CardType[];
  } | null>(null);
  const chuckyStageStickyRef = useRef<{
    handContextId: string;
    cards: CardType[];
    revealedCount: number;
  } | null>(null);
  
  // HOLM: Lock showdown mode (narrow cards) once it starts to prevent snap-back after announcement clears
  const [showdownModeLocked, setShowdownModeLocked] = useState(false);
  
  // HOLM: Gate announcement display until community card 4 flip animation completes.
  // CommunityCards.tsx uses a 1500ms delay for the last card in a batch flip (card 4).
  // This prevents the hand result banner from appearing before card 4 is visually revealed.
  const [holmCommunityFullyRevealed, setHolmCommunityFullyRevealed] = useState(false);
  const holmRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Spotlight is a pure projection of currentTurnPosition — no sticky cache,
  // no visited-set, no independent turn ownership. See spotlight render site.



  
  // Flash triggers for winner's chipstack when receiving legs/pot
  const [winnerLegsFlashTrigger, setWinnerLegsFlashTrigger] = useState<{ id: string; amount: number; playerId: string } | null>(null);
  const [winnerPotFlashTrigger, setWinnerPotFlashTrigger] = useState<{ id: string; amount: number; playerId: string } | null>(null);
  
  // Chip stack emoticon hook - manages realtime emoticon overlays
  // (hook is initialized below after currentPlayer is defined)
  
  // FIX: Cache current player's legs EAGERLY - capture before any state transitions
  // This must be updated BEFORE game_over status, not during render
  const [cachedCurrentPlayerLegs, setCachedCurrentPlayerLegs] = useState<number>(0);
  
  // Table container ref for ante animation
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Delayed pot display - only update when chips arrive at pot box
  const potMemoryKey = gameId ?? 'unknown-game';
  const [displayedPot, setDisplayedPot] = useState(() => {
    const memoryValue = displayedPotMemoryByGameId.get(potMemoryKey);
    const initialValue = memoryValue ?? pot;
    console.log('[POT_INIT] displayedPot initialized:', { 
      memoryValue, 
      potProp: pot, 
      initialValue,
      gameId: potMemoryKey 
    });
    return initialValue;
  });
  useLayoutEffect(() => {
    displayedPotMemoryByGameId.set(potMemoryKey, displayedPot);
  }, [potMemoryKey, displayedPot]);
  
  // Clear stale pot memory when starting a fresh hand (pot resets to antes only)
  const prevHandContextRef = useRef(handContextId);
  const prevHorsesRoundIdRef = useRef(horsesRoundId);
  const prevHorsesDealerGameIdRef = useRef(horsesDealerGameId);
  useEffect(() => {
    if (horsesDealerGameId !== prevHorsesDealerGameIdRef.current) {
      cachedWinningResultRef.current = null;
      cachedFeltBlockNodeRef.current = null;
      turnSnapshotTakenRef.current = false;
      prevHorsesDealerGameIdRef.current = horsesDealerGameId;
    }

    // Clear on handContextId change (for card games)
    if (handContextId && handContextId !== prevHandContextRef.current) {
      // New hand started - clear any stale memory to use fresh pot value
      console.log('[POT_MEMORY] New hand detected, clearing stale memory:', {
        prevHand: prevHandContextRef.current,
        newHand: handContextId,
        currentMemory: displayedPotMemoryByGameId.get(potMemoryKey),
        newPotProp: pot
      });
      displayedPotMemoryByGameId.delete(potMemoryKey);
      
      // CRITICAL FIX: Clear cached winning result to prevent "Beat" badge persistence on rollovers
      // This ensures the SCC/Horses "Beat" badge doesn't show stale results from the prior round
      cachedWinningResultRef.current = null;

      // Clear render trace fingerprints for new hand boundary
      resetHolmRenderTrace(handContextId);
      
      prevHandContextRef.current = handContextId;
    }
    
    // CRITICAL FIX: Also clear on horsesRoundId change (for dice games - Horses/SCC rollovers)
    // The horsesRoundId changes on each dice game rollover, which handContextId may not always track
    if (horsesRoundId && horsesRoundId !== prevHorsesRoundIdRef.current) {
      cachedWinningResultRef.current = null;
      cachedFeltBlockNodeRef.current = null;
      turnSnapshotTakenRef.current = false; // Reset turn tracking on round change
      prevHorsesRoundIdRef.current = horsesRoundId;
    }
  }, [handContextId, horsesRoundId, horsesDealerGameId, potMemoryKey, pot]);
  
  // CRITICAL FIX: Clear stale pot memory when entering dealer config phases (new game starting)
  // This prevents the $6 pot bug where old pot values carry over to a new game
  const prevGameStatusForMemoryRef = useRef(gameStatus);
  useEffect(() => {
    const dealerConfigPhases = ['configuring', 'ante_decision', 'game_selection', 'dealer_selection'];
    const isEnteringDealerConfig = dealerConfigPhases.includes(gameStatus || '') && 
                                    !dealerConfigPhases.includes(prevGameStatusForMemoryRef.current || '');
    
    if (isEnteringDealerConfig) {
      console.log('[POT_MEMORY] Entering dealer config phase, clearing stale pot memory:', {
        prevStatus: prevGameStatusForMemoryRef.current,
        newStatus: gameStatus,
        clearedMemory: displayedPotMemoryByGameId.get(potMemoryKey),
      });
      displayedPotMemoryByGameId.delete(potMemoryKey);
      // Also reset displayedPot to 0 for fresh game start
      setDisplayedPot(0);
      
      // CRITICAL FIX: Clear cached winning result to prevent "Beat" badge persistence
      // This ensures the SCC/Horses "Beat" badge doesn't show stale results from prior game
      cachedWinningResultRef.current = null;
    }
    
    prevGameStatusForMemoryRef.current = gameStatus;
  }, [gameStatus, potMemoryKey]);

  const isAnteAnimatingRef = useRef(false);

  // CRITICAL: Use a REF for locked chip values during animation
  // State updates can be batched/delayed by React, but refs update synchronously
  const lockedChipsRef = useRef<Record<string, number> | null>(null);
  
  // CRITICAL: Lock ante animation values at animation START so they're still available in onChipsArrived
  // (the parent clears these props after onAnimationStart, but we need them 800ms later)
  const lockedAnteExpectedPotRef = useRef<number | null>(null);
  const lockedAnteTotalRef = useRef<number>(0);

  // Delayed chip display - decrement immediately on animation start, sync after
  const [displayedChips, setDisplayedChips] = useState<Record<string, number>>({});

  // ========== POT ANIMATION CLASSIFICATION ==========

  // There are TWO types of animations that affect the pot:
  // 1. POT-IN (player → pot): ante, pussy tax, chucky loss, losers-to-pot
  //    - These ADD chips to the pot
  //    - Display should show pre-animation pot, then increment after chips arrive
  // 2. POT-OUT (pot → player): 357 win, Holm win, showdown pot-to-winner
  //    - These DEDUCT chips from the pot
  //    - Display should show the allDecisionsIn snapped pot, then go to 0 when animation BEGINS
  //
  // The KEY insight: For POT-OUT animations, we use the pot value captured when allDecisionsIn
  // became true. This ensures the displayed pot is correct during the entire animation sequence.

  // ========== SNAPSHOT POT WHEN allDecisionsIn TRANSITIONS TO TRUE ==========
  // This captures the pot value at the moment all decisions are locked in.
  // This value is used by POT-OUT animations (pot-to-player).
  const allDecisionsSnappedPotRef = useRef<number | null>(null);
  const prevAllDecisionsInRef = useRef(allDecisionsIn);
  const prevGameStatusForPotRef = useRef(gameStatus);
  
  // Snapshot pot when allDecisionsIn transitions false -> true
  useLayoutEffect(() => {
    const wasAllIn = prevAllDecisionsInRef.current;
    const isAllIn = allDecisionsIn;
    
    if (!wasAllIn && isAllIn) {
      // SNAPSHOT: Capture current displayedPot - this is the value for POT-OUT animations
      allDecisionsSnappedPotRef.current = displayedPot;
      console.log('[POT_SNAPSHOT] allDecisionsIn snapped pot at', displayedPot);
    }
    
    prevAllDecisionsInRef.current = isAllIn;
  }, [allDecisionsIn, displayedPot]);
  
  // Clear snapshot when game transitions to a fresh state
  useEffect(() => {
    const prev = prevGameStatusForPotRef.current;
    const curr = gameStatus;
    
    // Fresh start statuses
    const freshStatuses = ['ante_decision', 'configuring', 'game_selection', 'dealer_selection', 'waiting_for_players'];
    if (prev && prev !== curr) {
      if (freshStatuses.includes(curr || '') || (prev === 'game_over' && curr !== 'game_over')) {
        allDecisionsSnappedPotRef.current = null;
        console.log('[POT_SNAPSHOT] cleared on status transition:', prev, '->', curr);
      }
    }
    
    prevGameStatusForPotRef.current = curr;
  }, [gameStatus]);

  // ========== POT-IN ANIMATION DETECTION ==========
  // These are animations where chips move FROM players TO the pot
  const potLockRef = useRef(false);
  const potLockTriggerRef = useRef<string | null>(null);
  const potIncreaseSyncTimeoutRef = useRef<number | null>(null);
  // Safety: if the pot gets locked but the corresponding animation never fires (rare ref/timing race),
  // auto-unlock so the pot doesn't get stuck at the pre-animation value (often 0).
  const potLockSafetyTimeoutRef = useRef<number | null>(null);

  // INITIAL ANTE GUARD:
  // On the very first ante of a session, there is a short window where the backend pot can briefly
  // report 0 while the first hand/round record is being created. That transient 0 must NOT overwrite
  // the correct post-ante displayed pot.
  const initialAntePotGuardRef = useRef<{ expectedPot: number; expiresAt: number } | null>(null);
  
  // Track if a POT-OUT animation is active (pot → player)
  const [potOutAnimationActive, setPotOutAnimationActive] = useState(false);

  // Reliable per-player amount for POT-IN animations.
  // IMPORTANT: For normal antes, the configured anteAmount prop is authoritative.
  // Snapshots are still useful as a fallback, but they can be wrong if any upstream value is scaled.
  const getPotInPerPlayerAmount = useCallback(() => {
    if (!anteAnimationTriggerId) return anteAmount;

    const isPussyTaxTrigger = anteAnimationTriggerId.startsWith('pussy-tax-');
    if (isPussyTaxTrigger) return pussyTaxValue ?? 0;

    // Normal ante: trust the game-configured ante amount.
    if (typeof anteAmount === 'number' && anteAmount > 0) return anteAmount;

    // Fallback: derive from snapshots (should be rare).
    if (preAnteChips && expectedPostAnteChips) {
      const activePlayers = players.filter((p) => !p.sitting_out);
      for (const p of activePlayers) {
        const pre = preAnteChips[p.id];
        const post = expectedPostAnteChips[p.id];
        if (typeof pre === 'number' && typeof post === 'number') {
          const diff = pre - post;
          if (diff > 0) return diff;
        }
      }
    }

    return 0;
  }, [anteAnimationTriggerId, anteAmount, expectedPostAnteChips, players, preAnteChips, pussyTaxValue]);

  const potInPerPlayerAmount = useMemo(() => getPotInPerPlayerAmount(), [getPotInPerPlayerAmount]);
  const chuckyVisualRevealCompleteRef = useRef(false);
  const chuckyNormalRevealBranchLockedRef = useRef(false);
  const chuckyVisualStepperMountedRef = useRef(false);
  const chuckyVisualStepperTimeoutActiveRef = useRef(false);
  const chuckyVisualStepperLastDeadlineRef = useRef<number | null>(null);
  const chuckyVisualStepperLastCleanupReasonRef = useRef<string | null>(null);
  const chuckyVisualStepperLastDepChangeRef = useRef<Record<string, { prev: unknown; next: unknown }> | null>(null);
  const chuckyVisualStepperStallKeyRef = useRef<string | null>(null);

  const getPendingPotInAnimation = useCallback(() => {
    // 1) Ante / Pussy tax (chips -> pot) - POT-IN
    if (anteAnimationTriggerId) {
      const isPussyTaxTrigger = anteAnimationTriggerId.startsWith('pussy-tax-');
      const perPlayerAmount = getPotInPerPlayerAmount();
      const activePlayers = players.filter((p) => !p.sitting_out);
      const activeCount = activePlayers.length;

      if (perPlayerAmount <= 0 || activeCount <= 0) {
        console.warn('[POT_IN] Skipping pot-in lock (invalid amount/count)', {
          triggerId: anteAnimationTriggerId,
          perPlayerAmount,
          activeCount,
        });
        return null;
      }

      const totalAmount = perPlayerAmount * activeCount;
      const postPotFromProps = anteAnimationExpectedPot ?? pot;
      // For a fresh-hand ante, the post pot should be at least the ante total.
      const postPot = isPussyTaxTrigger ? postPotFromProps : Math.max(postPotFromProps, totalAmount);

      // For rollovers (re-antes), the pot should preserve the existing value.
      // Detect rollovers: anteAnimationExpectedPot is set AND is greater than just the antes being added.
      // This means there's an existing pot (from a tie/chop) that should be preserved.
      const isRolloverAnte = anteAnimationExpectedPot !== null && anteAnimationExpectedPot !== undefined && anteAnimationExpectedPot > totalAmount;
      
      // IMPORTANT: prePot = 0 ONLY for true fresh-hand antes (no prior pot).
      // For pussy-tax and rollover antes, prePot = postPot - totalAmount (preserve existing pot).
      const prePot = (isPussyTaxTrigger || isRolloverAnte) ? Math.max(0, postPot - totalAmount) : 0;

      return { lockId: anteAnimationTriggerId, prePot, postPot, totalAmount, type: 'pot-in' as const };
    }
    // 2) Holm Chucky loss (specific players pay into pot) - POT-IN
    if (chuckyLossTriggerId && chuckyVisualRevealCompleteRef.current && chuckyLossPlayerIds.length > 0 && chuckyLossAmount > 0) {
      const totalAmount = chuckyLossAmount * chuckyLossPlayerIds.length;
      const postPot = pot;
      const prePot = Math.max(0, postPot - totalAmount);
      return { lockId: chuckyLossTriggerId, prePot, postPot, totalAmount, type: 'pot-in' as const };
    }

    // 3) Holm showdown losers-to-pot (losers pay match amount into pot) - POT-IN
    if (holmShowdownPhase === 'losers-to-pot' && phase2TriggerId && holmShowdownLoserIds.length > 0 && holmShowdownMatchAmount > 0) {
      const totalAmount = holmShowdownMatchAmount * holmShowdownLoserIds.length;
      const postPot = pot;
      const prePot = Math.max(0, postPot - totalAmount);
      return { lockId: phase2TriggerId, prePot, postPot, totalAmount, type: 'pot-in' as const };
    }

    return null;
  }, [
    pot,
    players,
    anteAnimationTriggerId,
    getPotInPerPlayerAmount,
    anteAnimationExpectedPot,
    chuckyLossTriggerId,
    chuckyLossAmount,
    chuckyLossPlayerIds,
    holmShowdownPhase,
    phase2TriggerId,
    holmShowdownLoserIds,
    holmShowdownMatchAmount,
  ]);

  // Freeze displayedPot BEFORE the first paint whenever a pot-in animation is pending.
  useLayoutEffect(() => {
    // Skip if a POT-OUT animation is active (pot → player) - those control pot directly
    if (potOutAnimationActive) return;

    const pending = getPendingPotInAnimation();
    if (!pending) return;

    // If we've already shown the post-pot value, never "rewind" to pre-pot.
    // This avoids the post → pre → post flash when triggers arrive late.
    if (displayedPot >= pending.postPot) {
      return;
    }

    // Only lock once per trigger id (prevents re-locking after we intentionally set post pot).
    if (potLockTriggerRef.current === pending.lockId) return;

    // Clear any prior safety unlock.
    if (potLockSafetyTimeoutRef.current) {
      window.clearTimeout(potLockSafetyTimeoutRef.current);
      potLockSafetyTimeoutRef.current = null;
    }

    potLockTriggerRef.current = pending.lockId;
    potLockRef.current = true;
    console.log('[POT_LOCK] lock(pre-paint)', {
      gameId: potMemoryKey,
      lockId: pending.lockId,
      prePot: pending.prePot,
      postPot: pending.postPot,
      backendPot: pot,
    });
    setDisplayedPot(pending.prePot);

    // SAFETY: if chips never "arrive" (e.g. animation didn't mount in time), unlock after a short delay.
    // NOTE: When we intentionally slow the ante travel (debugging), keep safety > travel time.
    const lockId = pending.lockId;
    const postPot = pending.postPot;
    const isSlowDebugAnteLock =
      lockId === anteAnimationTriggerId &&
      !lockId.startsWith('pussy-tax-');
    const safetyMs = isSlowDebugAnteLock ? 12_000 : 2200;

    potLockSafetyTimeoutRef.current = window.setTimeout(() => {
      if (potLockRef.current && potLockTriggerRef.current === lockId) {
        console.warn('[POT_LOCK] safety-unlock (no animation completion observed)', { gameId: potMemoryKey, lockId, postPot, backendPot: pot });
        potLockRef.current = false;
        setDisplayedPot(postPot);
      }
      potLockSafetyTimeoutRef.current = null;
    }, safetyMs);
  }, [getPendingPotInAnimation, pot, potMemoryKey, displayedPot, potOutAnimationActive, anteAnimationTriggerId]);

  // Sync displayedPot to backend pot when NOT locked/animating.
  // KEY RULES:
  // - POT-IN animations (player → pot): Block increases until chips arrive
  // - POT-OUT animations (pot → player): Use allDecisionsSnappedPot, set to 0 when animation begins
  const hasPending357WinForPot = !!(threeFiveSevenWinTriggerId && threeFiveSevenWinPotAmount > 0);
  useEffect(() => {
    if (potIncreaseSyncTimeoutRef.current) {
      window.clearTimeout(potIncreaseSyncTimeoutRef.current);
      potIncreaseSyncTimeoutRef.current = null;
    }

    // CRITICAL: If a POT-OUT animation is active, the pot display is controlled directly
    // by the animation handlers (showing snapped pot → 0). Skip all sync logic.
    if (potOutAnimationActive) {
      console.log('[POT_SYNC] BLOCKED (POT-OUT animation active)', { displayedPot, backendPot: pot });
      return;
    }

    // Clear initial-ante guard as soon as backend catches up or it expires.
    const guard = initialAntePotGuardRef.current;
    if (guard) {
      const now = Date.now();
      const expired = now >= guard.expiresAt;
      const backendCaughtUp = pot >= guard.expectedPot;

      if (expired || backendCaughtUp) {
        initialAntePotGuardRef.current = null;
      } else if (pot < displayedPot) {
        // This is the bug: pot temporarily reports 0 (or lower) during initial ante.
        console.log('[POT_SYNC] BLOCKED decrease (initial-ante guard)', {
          displayedPot,
          backendPot: pot,
          expectedPot: guard.expectedPot,
          msLeft: guard.expiresAt - now,
        });
        return;
      }
    }


    // 357 win phases:
    // - waiting / legs-to-player: game is still resolving the win (block pot sync to avoid flicker)
    // - pot-to-player / delay: chips are leaving pot or +$x is flashing; pot should be FREE to sync
    //   (especially for next-hand ante/bets). This is the key fix.
    const phase357 = threeFiveSevenWinPhaseRef.current;

    // Once pot-to-player starts, pot is visually empty and should be allowed to sync (incl. increases)
    // even while the later +$x flash happens (delay).
    const isPotVisuallyEmpty = phase357 === 'pot-to-player' || phase357 === 'delay';
    const isPrePotToPlayer357Phase = phase357 === 'waiting' || phase357 === 'legs-to-player';

    // HARD RULE: during normal play, the pot should not move backwards.
    // We only allow decreases when the pot is visually empty (chips leaving the pot).
    // This prevents the post → pre/0 → post flicker when the backend briefly emits an older pot value.
    if (pot < displayedPot && !isPotVisuallyEmpty) {
      console.error('[POT_SYNC] BLOCKED unexpected decrease', {
        gameId: potMemoryKey,
        displayedPot,
        backendPot: pot,
        phase: phase357,
        triggerId357: threeFiveSevenWinTriggerId,
        triggerIdHolm: holmWinPotTriggerId,
        anteTrigger: anteAnimationTriggerId,
        handContextId,
      });
      return;
    }

    // Block pot INCREASES only during true lock / chip-flight phases.
    // IMPORTANT: Do NOT block increases during 'delay' (+$x flash) — next hand may already be starting.
    const shouldBlockIncrease =
      potLockRef.current ||
      isAnteAnimatingRef.current ||
      isPrePotToPlayer357Phase ||
      // If a 357 win trigger exists but we haven't reached pot-to-player yet, keep increases blocked.
      // Once pot-to-player (or delay) starts, allow increases.
      ((hasPending357WinForPot || !!threeFiveSevenWinTriggerId) && !isPotVisuallyEmpty) ||
      !!holmWinPotTriggerId;

    // For decreases: block EXCEPT when pot is visually empty (pot-to-player or delay phase)
    const shouldBlockDecrease =
      potLockRef.current ||
      isAnteAnimatingRef.current ||
      // Block when ante trigger exists (animation about to start) - prevents 0-flash before lock
      !!anteAnimationTriggerId ||
      // Block during waiting/legs-to-player phases, but NOT pot-to-player/delay
      (phase357 !== 'idle' && !isPotVisuallyEmpty) ||
      // Block if trigger exists but pot-to-player hasn't started yet
      (!!threeFiveSevenWinTriggerId && !isPotVisuallyEmpty) ||
      !!holmWinPotTriggerId;

    // If backend pot increased, delay the visual sync long enough for animation trigger to lock.
    if (pot > displayedPot) {
      if (shouldBlockIncrease) {
        console.log('[POT_SYNC] BLOCKED increase (animation active)', {
          phase: phase357,
          triggerId357: threeFiveSevenWinTriggerId,
          triggerIdHolm: holmWinPotTriggerId,
          isPotVisuallyEmpty,
        });
        return;
      }
      const delayMs = 1400;
      console.log('[POT_SYNC] delay-increase', { gameId: potMemoryKey, displayedPot, backendPot: pot, delayMs });
      potIncreaseSyncTimeoutRef.current = window.setTimeout(() => {
        // Re-check if POT-OUT animation started
        if (potOutAnimationActive) {
          console.log('[POT_SYNC] skipped-after-delay (POT-OUT active)', { displayedPot, backendPot: pot });
          return;
        }

        const phaseNow357 = threeFiveSevenWinPhaseRef.current;
        const isPotVisuallyEmptyNow = phaseNow357 === 'pot-to-player' || phaseNow357 === 'delay';
        const isPrePotToPlayer357PhaseNow = phaseNow357 === 'waiting' || phaseNow357 === 'legs-to-player';

        if (
          potLockRef.current ||
          isAnteAnimatingRef.current ||
          isPrePotToPlayer357PhaseNow ||
          ((hasPending357WinForPot || !!threeFiveSevenWinTriggerId) && !isPotVisuallyEmptyNow)
        ) {
          console.log('[POT_SYNC] skipped-after-delay (locked/animating)', { gameId: potMemoryKey, displayedPot, backendPot: pot });
          return;
        }
        console.log('[POT_SYNC] apply-after-delay', { gameId: potMemoryKey, backendPot: pot });
        setDisplayedPot(pot);
      }, delayMs);
      return;
    }

    // Decreases (or same) - allow when pot is visually empty, block during other phases
    if (shouldBlockDecrease) {
      console.log('[POT_SYNC] BLOCKED decrease (win animation active)', {
        displayedPot,
        backendPot: pot,
        phase: phase357,
        isPotVisuallyEmpty,
      });
      return;
    }

    console.log('[POT_SYNC] apply-immediate', { gameId: potMemoryKey, displayedPot, backendPot: pot });
    setDisplayedPot(pot);

    return () => {
      if (potIncreaseSyncTimeoutRef.current) {
        window.clearTimeout(potIncreaseSyncTimeoutRef.current);
        potIncreaseSyncTimeoutRef.current = null;
      }
    };
  }, [
    pot,
    displayedPot,
    hasPending357WinForPot,
    potMemoryKey,
    threeFiveSevenWinTriggerId,
    holmWinPotTriggerId,
    anteAnimationTriggerId,
    handContextId,
  ]);


  
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
  // CRITICAL FIX: Also force-clear displayedChips after a short delay to ensure DB sync
  // This fixes the chip display bug after rollover where chips show wrong values
  useEffect(() => {
    if (!isAnteAnimatingRef.current && !lockedChipsRef.current && Object.keys(displayedChips).length > 0) {
      setDisplayedChips({});
    }
  }, [players, displayedChips]);
  
  // CRITICAL FIX: Force sync chips to DB values when entering in_progress status
  // This ensures chip displays are correct after rollover/re-ante
  const prevStatusForChipSyncRef = useRef(gameStatus);
  useEffect(() => {
    const wasConfigPhase = ['configuring', 'ante_decision'].includes(prevStatusForChipSyncRef.current || '');
    const isNowInProgress = gameStatus === 'in_progress';
    
    if (wasConfigPhase && isNowInProgress) {
      // Small delay to let ante animation complete, then force sync
      const syncTimer = setTimeout(() => {
        if (!isAnteAnimatingRef.current) {
          console.log('[CHIP_SYNC] Force clearing displayedChips after status transition');
          lockedChipsRef.current = null;
          setDisplayedChips({});
        }
      }, 2000);
      
      return () => clearTimeout(syncTimer);
    }
    
    prevStatusForChipSyncRef.current = gameStatus;
  }, [gameStatus]);
  
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
    setApprovedHandContextId(null);
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
  // Track which handContextId the approved community cards belong to (prevents stale card flash)
  const [approvedHandContextId, setApprovedHandContextId] = useState<string | null>(null);
  const communityCardsDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDetectedRoundRef = useRef<number | null>(
    isDealerConfigPhase ? null : (externalCommunityCardsCache?.current?.round || null)
  ); // Track which round we've detected (to prevent re-triggering)

  // Refs/state for positioning the Rabbit Hunt label directly under the rendered community cards
  const communityCardsWrapperRef = useRef<HTMLDivElement | null>(null);
  const [rabbitHuntLabelTop, setRabbitHuntLabelTop] = useState<number | null>(null);

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
  
  // CRITICAL: Track the handContextId when cards were cached to prevent stale cards from previous hands
  // This fixes the bug where wrong cards are displayed during solo vs Chucky showdown
  const showdownHandContextRef = useRef<string | null>(null);
  
  // Cache Chucky cards to persist through announcement phase.
  // cachedChuckyCardsRevealed is a LOCAL, MONOTONIC, SEQUENTIAL render count.
  // The incoming chuckyCardsRevealed prop is treated as a TARGET only; a stepper
  // effect below advances the rendered count one card at a time toward that target.
  const [cachedChuckyCards, _setCachedChuckyCardsRaw] = useState<CardType[] | null>(null);
  const cachedChuckyCardsLiveRef = useRef<CardType[] | null>(null);
  cachedChuckyCardsLiveRef.current = cachedChuckyCards;
  const [cachedChuckyActive, _setCachedChuckyActiveRaw] = useState<boolean>(false);
  const [cachedChuckyCardsRevealed, _setCachedChuckyCardsRevealedRaw] = useState<number>(0);
  // Prime the configured reveal-cadence fetch as early as possible so the
  // first stepper arm reads from game_defaults (not the in-flight fallback).
  useEffect(() => { ensureChuckyConfigLoaded(); }, []);
  // Chucky visual-result gate is derived below, after solo ownership and
  // Holm DealRuntime metadata are in scope. No result/win/announcement path
  // may consume raw `holmWinPotTriggerId` for presentation.
  // Wartime forensics: every writer of cachedChuckyCardsRevealed is routed
  // through this wrapper so we capture (a) STATE_CHANGED transitions and
  // (b) RESET events with writer attribution. NO logic changes.
  const lastChuckyRevealedRef = useRef<number>(0);
  // Stable per-MobileGameTable instance id. Declared here (instead of next
  // to the chucky stepper effect) so the state-setter wrapper can stamp it
  // onto CHUCKY_REVEALED_STATE_CHANGED. WAR-TIME ONLY.
  const chuckyInstanceIdRef = useRef<string>('');
  if (!chuckyInstanceIdRef.current) {
    chuckyInstanceIdRef.current = `mgt#${Math.random().toString(36).slice(2, 10)}`;
  }
  // WAR-TIME CALLGRAPH: per-render seq incremented on EVERY render of MobileGameTable.
  // Stamped on every Chucky event so we can prove render→effect ordering.
  const chuckyRenderSeqRef = useRef(0);
  chuckyRenderSeqRef.current += 1;
  // Track chuckyCards PROP identity (same contents, new array reference each render = parent churn).
  const chuckyCardsPropIdentityRef = useRef<{ ref: unknown; contents: string; renderSeq: number } | null>(null);
  const setCachedChuckyCards = useCallback(
    (
      next: CardType[] | null | ((prev: CardType[] | null) => CardType[] | null),
      writerMeta?: { writer: string; reason?: string },
    ) => {
      _setCachedChuckyCardsRaw((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: CardType[] | null) => CardType[] | null)(prev) : next;
        if (resolved == null && prev && prev.length > 0 && chuckyNormalRevealBranchLockedRef.current) {
          recordHolmTimelineEvent('CHUCKY_NORMAL_REVEAL_BRANCH_EXIT_BLOCKED', {
            instanceId: chuckyInstanceIdRef.current,
            renderSeq: chuckyRenderSeqRef.current,
            writer: writerMeta?.writer ?? 'unknown',
            reason: writerMeta?.reason ?? null,
            attemptedClear: 'cachedChuckyCards',
            handContextId: handContextIdRef.current ?? null,
            phase: chuckyPhaseRef.current ?? null,
            cachedLen: prev.length,
            cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
          }, handContextIdRef.current ?? null);
          return prev;
        }
        recordHolmTimelineEvent('CHUCKY_ARRAY_IDENTITY_CHURN', {
          instanceId: chuckyInstanceIdRef.current,
          renderSeq: chuckyRenderSeqRef.current,
          writer: writerMeta?.writer ?? 'unknown',
          reason: writerMeta?.reason ?? null,
          oldRef: __chuckyAuditRefId(prev),
          newRef: __chuckyAuditRefId(resolved),
          oldHash: __chuckyAuditCardsHash(prev),
          newHash: __chuckyAuditCardsHash(resolved),
          sameContents: __chuckyAuditCardsHash(prev) === __chuckyAuditCardsHash(resolved),
          handContextId: handContextIdRef.current ?? null,
          phase: chuckyPhaseRef.current ?? null,
        }, handContextIdRef.current ?? null);
        cachedChuckyCardsLiveRef.current = resolved;
        return resolved;
      });
    },
    [],
  );
  const setCachedChuckyActive = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      _setCachedChuckyActiveRaw((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
        if (resolved === false && prev && chuckyNormalRevealBranchLockedRef.current && (cachedChuckyCardsLiveRef.current?.length ?? 0) > 0) {
          recordHolmTimelineEvent('CHUCKY_NORMAL_REVEAL_BRANCH_EXIT_BLOCKED', {
            instanceId: chuckyInstanceIdRef.current,
            renderSeq: chuckyRenderSeqRef.current,
            writer: 'setCachedChuckyActive',
            reason: 'attempted inactive while visual reveal incomplete',
            attemptedClear: 'cachedChuckyActive',
            handContextId: handContextIdRef.current ?? null,
            phase: chuckyPhaseRef.current ?? null,
            cachedLen: cachedChuckyCardsLiveRef.current?.length ?? 0,
            cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
          }, handContextIdRef.current ?? null);
          return prev;
        }
        return resolved;
      });
    },
    [],
  );
  const setCachedChuckyCardsRevealed = useCallback(
    (
      next: number | ((prev: number) => number),
      writerMeta?: { writer: string; reason: string },
    ) => {
      _setCachedChuckyCardsRevealedRaw((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: number) => number)(prev) : next;
        const handCtx = cachedChuckyHandContextRef.current ?? handContextIdRef.current ?? null;
        if (resolved === 0 && prev > 0 && chuckyNormalRevealBranchLockedRef.current) {
          recordHolmTimelineEvent('CHUCKY_NORMAL_REVEAL_BRANCH_EXIT_BLOCKED', {
            instanceId: chuckyInstanceIdRef.current,
            renderSeq: chuckyRenderSeqRef.current,
            writer: writerMeta?.writer ?? 'unknown',
            reason: writerMeta?.reason ?? null,
            attemptedClear: 'cachedChuckyCardsRevealed',
            handContextId: handCtx,
            phase: chuckyPhaseRef.current ?? null,
            cachedLen: cachedChuckyCardsLiveRef.current?.length ?? 0,
            cachedChuckyCardsRevealed: prev,
          }, handCtx);
          lastChuckyRevealedRef.current = prev;
          return prev;
        }
        if (resolved !== prev) {
          recordHolmTimelineEvent('CHUCKY_REVEALED_STATE_CHANGED', {
            instanceId: chuckyInstanceIdRef.current,
            oldValue: prev,
            newValue: resolved,
            source: writerMeta?.writer ?? 'unknown',
            reason: writerMeta?.reason ?? null,
            handContextId: handCtx,
            cachedChuckyHandContextId: cachedChuckyHandContextRef.current,
          }, handCtx);
        }
        if (resolved === 0 && prev !== 0) {
          recordHolmTimelineEvent('CHUCKY_REVEALED_RESET', {
            writer: writerMeta?.writer ?? 'unknown',
            reason: writerMeta?.reason ?? null,
            handContextId: handCtx,
            cachedChuckyHandContextId: cachedChuckyHandContextRef.current,
            prev,
          }, handCtx);
        }
        lastChuckyRevealedRef.current = resolved;
        return resolved;
      });
    },
    [],
  );
  // Target reveal count (latest authoritative value); rendered count steps toward this.
  const chuckyTargetRevealedRef = useRef<number>(0);
  // Track which handContextId the cached Chucky cards belong to
  const cachedChuckyHandContextRef = useRef<string | null>(null);
  // Mirror handContextId in a ref so the setter wrapper (created once via
  // useCallback) can always read the latest value without re-creating.
  const handContextIdRef = useRef<string | null>(null);
  useEffect(() => { handContextIdRef.current = handContextId ?? null; }, [handContextId]);
  const chuckyPhaseRef = useRef<string | null>(null);
  useEffect(() => { chuckyPhaseRef.current = roundStatus ?? null; }, [roundStatus]);
  // Live refs so the reveal loop can read current values without listing
  // them as effect deps (which would cause mount/unmount churn after every
  // reveal). These are the SINGLE READER of mid-flight reveal state.
  const cachedChuckyCardsRevealedRef = useRef<number>(0);
  useEffect(() => { cachedChuckyCardsRevealedRef.current = cachedChuckyCardsRevealed; }, [cachedChuckyCardsRevealed]);
  const cachedChuckyCardsLenRef = useRef<number>(0);
  useEffect(() => { cachedChuckyCardsLenRef.current = cachedChuckyCards?.length ?? 0; }, [cachedChuckyCards]);

  const clearChuckyRevealOwnership = useCallback((writer: string, reason: string) => {
    if (chuckyNormalRevealBranchLockedRef.current) {
      recordHolmTimelineEvent('CHUCKY_NORMAL_REVEAL_BRANCH_EXIT_BLOCKED', {
        instanceId: chuckyInstanceIdRef.current,
        renderSeq: chuckyRenderSeqRef.current,
        writer,
        reason,
        attemptedClear: 'chuckyRevealOwnershipRefs',
        handContextId: handContextIdRef.current ?? null,
        phase: chuckyPhaseRef.current ?? null,
        cachedLen: cachedChuckyCardsLiveRef.current?.length ?? 0,
        cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
      }, handContextIdRef.current ?? null);
      return false;
    }
    chuckyTargetRevealedRef.current = 0;
    cachedChuckyHandContextRef.current = null;
    return true;
  }, []);

  
  // Track previous round AND game type to detect new game start
  const prevRoundForCacheClearRef = useRef<number | null>(null);
  const prevGameTypeForCacheClearRef = useRef<string | null | undefined>(gameType);

  // 3-5-7 hand epoch — bumps when round transitions back to 1 (new hand
  // within the same dealer game) so the per-wave DealRuntime key reflects
  // a fresh hand even though the round number repeats.
  const threeFiveSevenHandEpochRef = useRef<number>(0);
  const prevRoundForHandEpochRef = useRef<number | null>(null);
  if (__is357GameType(gameType)) {
    const prev = prevRoundForHandEpochRef.current;
    if (currentRound === 1 && prev !== null && prev > 1) {
      threeFiveSevenHandEpochRef.current += 1;
    }
    prevRoundForHandEpochRef.current = currentRound ?? null;
  } else {
    prevRoundForHandEpochRef.current = null;
  }
  const threeFiveSevenHandContextId =
    __is357GameType(gameType) && gameId
      ? `${gameId}#h${threeFiveSevenHandEpochRef.current}`
      : null;
  const threeFiveSevenWaveContextId =
    threeFiveSevenHandContextId && typeof currentRound === 'number' && currentRound >= 1
      ? `${threeFiveSevenHandContextId}#r${currentRound}`
      : null;
  const threeFiveSevenSelfPlayerId =
    __is357GameType(gameType) && currentUserId
      ? (players.find(p => p.user_id === currentUserId)?.id ?? null)
      : null;
  const threeFiveSevenActiveSeats = __is357GameType(gameType)
    ? players
        .filter(p => p.status === 'active' && !p.sitting_out)
        .map(p => ({ playerId: p.id, position: p.position }))
    : [];
  const threeFiveSevenDealerPosition =
    __is357GameType(gameType) ? (typeof dealerPosition === 'number' ? dealerPosition : 0) : 0;

  
  // Clear showdown/community/Chucky caches when starting a NEW game:
  // 1. Round goes from 2/3 back to 1
  // 2. Game type changes (e.g., holm → 357)
  // This prevents stale Holm cards flashing at the start of a new 3-5-7 game.
  useEffect(() => {
    const prevRound = prevRoundForCacheClearRef.current;
    const prevGameType = prevGameTypeForCacheClearRef.current;

    let shouldClear = false;
    let reason = '';

    // If round dropped back to 1 from a higher round, it's a new game
    if (currentRound === 1 && prevRound !== null && prevRound > 1) {
      shouldClear = true;
      reason = `round went from ${prevRound} to 1`;
    }

    // If game type changed, it's definitely a new game
    if (prevGameType !== undefined && prevGameType !== gameType) {
      shouldClear = true;
      reason = `game type changed from ${prevGameType} to ${gameType}`;
    }

    if (shouldClear) {
      console.log('[NEW_GAME_CACHE_RESET] Clearing mobile caches - new game detected:', reason);

      // Showdown exposure cache
      showdownRoundRef.current = null;
      showdownCardsCache.current = new Map();
      showdownHandContextRef.current = null;

      // Community UI cache
      setApprovedCommunityCards(null);
      setApprovedRoundForDisplay(null);
      setApprovedHandContextId(null);
      setIsDelayingCommunityCards(false);
      setStaggeredCardCount(0);
      lastDetectedRoundRef.current = null;
      if (communityCardsDelayRef.current) {
        clearTimeout(communityCardsDelayRef.current);
        communityCardsDelayRef.current = null;
      }

      // Reset both internal/external community ref cache
      communityCardsCache.current = { cards: null, round: null, show: gameType !== 'holm-game' };
      setShowCommunityCards(gameType !== 'holm-game');

      // Chucky UI cache
      setCachedChuckyCards(null, { writer: 'newGameCacheReset', reason: 'new game detected (round drop or game-type change)' });
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0, { writer: 'newGameCacheReset', reason: 'new game detected (round drop or game-type change)' });
      clearChuckyRevealOwnership('newGameCacheReset', 'new game detected (round drop or game-type change)');
    }

    prevRoundForCacheClearRef.current = currentRound;
    prevGameTypeForCacheClearRef.current = gameType;
  }, [currentRound, gameType, showdownRoundRef, showdownCardsCache, communityCardsCache, clearChuckyRevealOwnership]);

  // AGGRESSIVE: When your player-hand round changes, hard-reset community + Chucky UI caches.
  // Symptom: player hand updates, but community/Chucky stay stuck on previous hand.
  // IMPORTANT: During payout/win animations, the parent may advance handContextId early.
  // If we reset caches immediately, tabled cards can "snap back" during the pot-to-player animation.
  const prevHandContextIdRef = useRef<string | null>(handContextId ?? null);
  const pendingHandContextIdRef = useRef<string | null>(null);

  const resetHandUiCaches = useCallback((reason: string, from: string | null, to: string | null) => {
    console.error('[HAND_RESET][MOBILE] Clearing card UI caches', {
      reason,
      from,
      to,
      currentRound,
      gameStatus,
    });

    // Community UI cache
    setShowCommunityCards(false);
    setApprovedCommunityCards(null);
    setApprovedRoundForDisplay(null);
    setApprovedHandContextId(null);
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
    showdownHandContextRef.current = null;

    // Chucky UI cache
    setCachedChuckyCards(null, { writer: 'resetHandUiCaches', reason: 'hand-boundary reset' });
    setCachedChuckyActive(false);
    setCachedChuckyCardsRevealed(0, { writer: 'resetHandUiCaches', reason: 'hand-boundary reset' });
    clearChuckyRevealOwnership('resetHandUiCaches', 'hand-boundary reset');

    // Solo-vs-Chucky tabling lock (must clear together with caches)
    setSoloVsChuckyTableLocked(false);
    setSoloVsChuckyPlayerIdLocked(null);
    soloVsChuckyAnimatedRef.current = false;
    // Wave 5D follow-up — clear the lone-player stage snapshot at the
    // same hand-boundary that resets every other Holm cache.
    lonePlayerStageSnapshotRef.current = null;
    
    // Showdown mode lock (prevents cards from snapping back after announcement clears)
    setShowdownModeLocked(false);
    
    // Community reveal gate (prevents announcement before card 4 flip animation)
    setHolmCommunityFullyRevealed(false);
    if (holmRevealTimerRef.current) { clearTimeout(holmRevealTimerRef.current); holmRevealTimerRef.current = null; }
    
    // (Spotlight has no per-hand cache to reset — it derives from currentTurnPosition.)
    void to;

    
    // NOTE: currentPlayerCardsRef is reset separately in the useMemo that computes currentPlayerCards
    // because it's defined later in the component (after currentPlayer is computed)


    // External lifted community cache (parent)
    if (externalCommunityCardsCache) {
      externalCommunityCardsCache.current = { cards: null, round: null, show: false };
    }
  }, [currentRound, gameStatus, externalCommunityCardsCache, showdownRoundRef, showdownCardsCache, clearChuckyRevealOwnership]);

  const shouldDeferHandReset = useCallback(() => {
    const isGameOverPhase = gameStatus === 'game_over' || !!isGameOver;
    const is357Animating = gameType !== 'holm-game' && threeFiveSevenWinPhase !== 'idle';
    const isHolmAnimating = !!holmWinPotTriggerId || holmShowdownPhase !== 'idle';
    return isGameOverPhase || isHolmAnimating || is357Animating;
  }, [gameStatus, isGameOver, gameType, threeFiveSevenWinPhase, holmWinPotTriggerId, holmShowdownPhase]);

  useEffect(() => {
    const prev = prevHandContextIdRef.current;
    const next = handContextId ?? null;

    if (prev === next) return;

    if (shouldDeferHandReset()) {
      pendingHandContextIdRef.current = next;
      console.warn('[HAND_RESET][MOBILE] Deferring hand context reset until animations complete', {
        prev,
        next,
        gameStatus,
        holmWinPotTriggerId,
        holmShowdownPhase,
        threeFiveSevenWinPhase,
      });
      return;
    }

    resetHandUiCaches('hand_context_changed', prev, next);
    prevHandContextIdRef.current = next;
  }, [handContextId, gameStatus, holmWinPotTriggerId, holmShowdownPhase, threeFiveSevenWinPhase, shouldDeferHandReset, resetHandUiCaches]);

  useEffect(() => {
    const pending = pendingHandContextIdRef.current;
    if (!pending) return;

    if (shouldDeferHandReset()) return;

    const prev = prevHandContextIdRef.current;
    if (prev !== pending) {
      resetHandUiCaches('deferred_hand_context_changed', prev, pending);
      prevHandContextIdRef.current = pending;
    }

    pendingHandContextIdRef.current = null;
  }, [shouldDeferHandReset, resetHandUiCaches]);

  
  // Compute showdown state synchronously during render
  // This should trigger when we need to show exposed cards
  const isInEarlyPhase = roundStatus === 'betting' || roundStatus === 'pending' || roundStatus === 'ante';
  // Count players who stayed for multi-player showdown detection
  const stayedPlayersCount = players.filter(p => p.current_decision === 'stay').length;
  const is357Round3MultiPlayerShowdown = gameType !== 'holm-game' && currentRound === 3 && allDecisionsIn && stayedPlayersCount >= 2;
  // Combined check for any 3-5-7 multi-player showdown (rounds 2 or 3) - used to hide dealer button and shrink UI
  // Use allDecisionsIn OR awaitingNextRound to catch showdown state even when allDecisionsIn resets
  const is357MultiPlayerShowdown = gameType !== 'holm-game' && 
    (currentRound === 2 || currentRound === 3) && 
    stayedPlayersCount >= 2 && 
    (allDecisionsIn || awaitingNextRound);
  
  // ── HOLM hand-lifecycle gating (root-cause fix #1) ──────────────
  // Solo eligibility MUST be scoped to the active Holm hand. The DealRuntime
  // singleton (holmDealDbg) is the authoritative source for the *current*
  // handContextId's deal phase. Any stale `allDecisionsIn` / `awaitingNextRound` /
  // `holmWinPotTriggerId` / `lastRoundResult` from h1 must NOT be allowed to
  // declare solo for h2 while DealRuntime says PRE_DEAL / DEALING.
  const holmDealMetaSnap = useSyncExternalStore(
    subscribeHolmDealDbg,
    getHolmDealDbgMeta,
    getHolmDealDbgMeta,
  );
  const holmDealPhaseForHand =
    gameType === 'holm-game' &&
    !!handContextId &&
    holmDealMetaSnap.handContextId === handContextId
      ? holmDealMetaSnap.phase
      : null;
  const holmDealNotReady =
    gameType === 'holm-game' &&
    (holmDealPhaseForHand === 'PRE_DEAL' || holmDealPhaseForHand === 'DEALING');
  const earlyRoundForSolo =
    roundStatus === 'pending' || roundStatus === 'betting' || roundStatus === 'ante';
  // Stay count gated to the CURRENT hand (decision_locked === true means the
  // server confirmed the decision belongs to this hand, not stale h1 carry-over).
  const stayedLockedCount = players.filter(
    p => p.current_decision === 'stay' && p.decision_locked === true,
  ).length;

  // HOLM: Detect solo player vs Chucky showdown (1 player stayed).
  // Hard guards (audit RC1):
  //   - gameType === 'holm-game'
  //   - handContextId present
  //   - DealRuntime NOT in PRE_DEAL/DEALING for THIS hand
  //   - roundStatus NOT in pending/betting/ante (config phases never solo)
  //   - exactly one decision_locked stayer for THIS hand
  //   - hand actually entered solo/resolution lifecycle (allDecisionsIn OR
  //     chuckyActive OR an active showdown/completed signal). awaitingNextRound
  //     and lastRoundResult are accepted ONLY together with holmWinPotTriggerId,
  //     because both can linger from h1 into h2 PRE_DEAL.
  const isSoloVsChuckyRaw =
    gameType === 'holm-game' &&
    !!handContextId &&
    !holmDealNotReady &&
    !earlyRoundForSolo &&
    stayedLockedCount === 1 &&
    (
      chuckyActive ||
      roundStatus === 'showdown' ||
      (roundStatus === 'completed' &&
        (chuckyActive || !!holmWinPotTriggerId || isGameOver)) ||
      allDecisionsIn ||
      (!!awaitingNextRound && !!lastRoundResult && !!holmWinPotTriggerId) ||
      !!holmWinPotTriggerId ||
      isGameOver
    );

  const stickyChuckyHandMatchesVisualGate =
    !!chuckyStageStickyRef.current &&
    (handContextId == null || chuckyStageStickyRef.current.handContextId === handContextId);
  const visualRevealCount = Math.max(
    cachedChuckyCardsRevealed,
    stickyChuckyHandMatchesVisualGate ? (chuckyStageStickyRef.current?.revealedCount ?? 0) : 0,
  );
  const requiredRevealCount = Math.max(
    cachedChuckyCards?.length ?? 0,
    stickyChuckyHandMatchesVisualGate ? (chuckyStageStickyRef.current?.cards?.length ?? 0) : 0,
    chuckyCards?.length ?? 0,
    holmDealMetaSnap.handContextId === handContextId ? (holmDealMetaSnap.chuckyExpected ?? 0) : 0,
  );
  const isHolmSoloChucky =
    gameType === 'holm-game' &&
    (
      isSoloVsChuckyRaw ||
      soloVsChuckyTableLocked ||
      cachedChuckyActive ||
      chuckyActive ||
      requiredRevealCount > 0
    );
  const chuckyVisualRevealComplete =
    !isHolmSoloChucky || visualRevealCount >= requiredRevealCount;
  chuckyVisualRevealCompleteRef.current = chuckyVisualRevealComplete;
  const chuckyNormalRevealBranchLocked =
    isHolmSoloChucky &&
    requiredRevealCount > 0 &&
    visualRevealCount < requiredRevealCount &&
    !!cachedChuckyCards &&
    cachedChuckyCards.length > 0;
  chuckyNormalRevealBranchLockedRef.current = chuckyNormalRevealBranchLocked;
  const holmWinPotTriggerIdGated = chuckyVisualRevealComplete ? holmWinPotTriggerId : null;
  const chuckyLossTriggerIdGated = chuckyVisualRevealComplete ? chuckyLossTriggerId : null;




  useEffect(() => {
    if (isSoloVsChuckyRaw) {
      setSoloVsChuckyTableLocked(true);
      return;
    }
    // holmWinPotTriggerId alone may NOT relatch across a hand boundary.
    // Require the deal to be past DEALING for THIS hand and a real solo lock.
    if (
      holmWinPotTriggerId &&
      !holmDealNotReady &&
      stayedLockedCount === 1 &&
      !earlyRoundForSolo
    ) {
      setSoloVsChuckyTableLocked(true);
    }
  }, [
    isSoloVsChuckyRaw,
    holmWinPotTriggerId,
    holmDealNotReady,
    stayedLockedCount,
    earlyRoundForSolo,
  ]);

  // Wartime invariant: SOLO must never be declared during PRE_DEAL/DEALING.
  useEffect(() => {
    if (gameType !== 'holm-game' || !handContextId) return;
    if (!(isSoloVsChuckyRaw || soloVsChuckyTableLocked)) return;
    if (holmDealPhaseForHand === 'PRE_DEAL') {
      recordHolmTimelineEvent(
        'SOLO_DECLARED_DURING_PRE_DEAL',
        {
          handContextId,
          isSoloVsChuckyRaw: !!isSoloVsChuckyRaw,
          soloVsChuckyTableLocked: !!soloVsChuckyTableLocked,
          stayedLockedCount,
          stayedPlayersCount,
          roundStatus,
          allDecisionsIn,
          awaitingNextRound,
          holmWinPotTriggerId: holmWinPotTriggerId ?? null,
        },
        handContextId,
      );
    } else if (holmDealPhaseForHand === 'DEALING') {
      recordHolmTimelineEvent(
        'SOLO_DECLARED_DURING_DEALING',
        {
          handContextId,
          isSoloVsChuckyRaw: !!isSoloVsChuckyRaw,
          soloVsChuckyTableLocked: !!soloVsChuckyTableLocked,
          stayedLockedCount,
          stayedPlayersCount,
          roundStatus,
          allDecisionsIn,
          awaitingNextRound,
          holmWinPotTriggerId: holmWinPotTriggerId ?? null,
        },
        handContextId,
      );
    }
  }, [
    gameType,
    handContextId,
    holmDealPhaseForHand,
    isSoloVsChuckyRaw,
    soloVsChuckyTableLocked,
    stayedLockedCount,
    stayedPlayersCount,
    roundStatus,
    allDecisionsIn,
    awaitingNextRound,
    holmWinPotTriggerId,
  ]);

  // Correction effect: if the latch fired due to a transient stayedPlayersCount===1
  // but the count later proves it's a multi-player showdown, unlock so cards stay in
  // the active player box instead of the top tabled area.
  useEffect(() => {
    if (stayedPlayersCount > 1 && soloVsChuckyTableLocked && !holmWinPotTriggerId) {
      setSoloVsChuckyTableLocked(false);
      setSoloVsChuckyPlayerIdLocked(null);
      soloVsChuckyAnimatedRef.current = false;
      lonePlayerStageSnapshotRef.current = null;
    }
  }, [stayedPlayersCount, soloVsChuckyTableLocked, holmWinPotTriggerId]);

  // Reset ALL solo-vs-Chucky locks on hand transition to prevent stale cross-hand tabling.
  // CRITICAL: soloVsChuckyTableLocked MUST be reset here too — if only the player ID is cleared
  // but the table lock persists, the capture effect (below) will fire with stale lastRoundResult
  // and lock the WRONG player, causing the folded player's cards to table and the stayed player's
  // cards to render at the chip stack instead of the tabled position.
  useEffect(() => {
    setSoloVsChuckyTableLocked(false);
    setSoloVsChuckyPlayerIdLocked(null);
    soloVsChuckyAnimatedRef.current = false;
    lonePlayerStageSnapshotRef.current = null;
    // Mark this handContextId so the capture effect knows not to re-capture stale data
    soloVsChuckyLockHandRef.current = handContextId ?? null;
    // CRITICAL: Also clear showdownModeLocked here — if it persists from the prior showdown hand,
    // isAnyPlayerInShowdown stays true into the next hand, causing the solo player's cards to
    // briefly render in their normal seat (dual-render) before shouldHideForTabling catches up.
    // resetHandUiCaches also clears this, but it can be deferred during animations — this effect
    // fires immediately on handContextId change, closing the 1–2 frame window.
    setShowdownModeLocked(false);
  }, [handContextId]);

  // ── Explicit TABLED_SELF / CHUCKY_TABLED destroy-on-NEW_HAND_STARTED ──
  // Ownership contract:
  //   For a given handContextId, EITHER SELF_HAND OR TABLED_SELF.
  // When a new handContextId arrives and the previous hand was a solo
  // (TABLED_SELF was alive), we MUST immediately:
  //   - destroy TABLED_SELF
  //   - destroy CHUCKY_TABLED
  //   - clear solo snapshots
  //   - clear reveal caches (cachedChuckyCards / cachedChuckyActive /
  //     cachedChuckyCardsRevealed / chuckyTargetRevealedRef)
  //   - clear cachedChuckyHandContextRef
  // and emit TABLED_SELF_UNMOUNT(reason=NEW_HAND_STARTED) into the
  // wartime timeline. This DOES NOT wait for resetHandUiCaches (which is
  // deferred during win animations) and DOES NOT depend on
  // shouldDeferHandReset. Solo cross-hand carryover is illegal regardless
  // of payout animation state.
  const prevHandWasSoloRef = useRef(false);
  const prevHandContextForSoloDestroyRef = useRef<string | null>(handContextId ?? null);
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    // Track wasSolo while the current hand is alive.
    if (soloVsChuckyTableLocked || isSoloVsChuckyRaw || cachedChuckyActive || (cachedChuckyCards && cachedChuckyCards.length > 0)) {
      prevHandWasSoloRef.current = true;
    }
  }, [gameType, soloVsChuckyTableLocked, isSoloVsChuckyRaw, cachedChuckyActive, cachedChuckyCards]);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    const prev = prevHandContextForSoloDestroyRef.current;
    const next = handContextId ?? null;
    if (prev === next) return;
    const wasSolo = prevHandWasSoloRef.current;
    prevHandContextForSoloDestroyRef.current = next;
    prevHandWasSoloRef.current = false;
    if (!chuckyNormalRevealBranchLockedRef.current) {
      chuckyVisualResetForHand(next);
    } else {
      recordHolmTimelineEvent('CHUCKY_NORMAL_REVEAL_BRANCH_EXIT_BLOCKED', {
        instanceId: chuckyInstanceIdRef.current,
        renderSeq: chuckyRenderSeqRef.current,
        writer: 'soloDestroyOnHandChange',
        reason: 'blocked chuckyVisualResetForHand while visual reveal incomplete',
        attemptedClear: 'chuckyVisualResetForHand',
        handContextId: prev,
        nextHandContextId: next,
        phase: chuckyPhaseRef.current ?? null,
        cachedLen: cachedChuckyCardsLiveRef.current?.length ?? 0,
        cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
      }, prev);
    }
    if (!wasSolo) return;
    // Force-destroy regardless of deferral state.
    setCachedChuckyCards(null, { writer: 'soloDestroyOnHandChange', reason: 'NEW_HAND_STARTED (was solo)' });
    setCachedChuckyActive(false);
    setCachedChuckyCardsRevealed(0, { writer: 'soloDestroyOnHandChange', reason: 'NEW_HAND_STARTED (was solo)' });
    clearChuckyRevealOwnership('soloDestroyOnHandChange', 'NEW_HAND_STARTED (was solo)');
    lonePlayerStageSnapshotRef.current = null;
    setSoloVsChuckyTableLocked(false);
    setSoloVsChuckyPlayerIdLocked(null);
    soloVsChuckyAnimatedRef.current = false;
    recordHolmTimelineEvent('TABLED_SELF_UNMOUNT', {
      reason: 'NEW_HAND_STARTED',
      prevHandContextId: prev,
      nextHandContextId: next,
    }, prev);
  }, [gameType, handContextId, clearChuckyRevealOwnership]);

  // ── WAR-TIME: SOLO_STATE_CHANGED watcher ──
  // Pure instrumentation: fire on every observable transition of the
  // solo-leakage surface. Records the prev/next snapshot + the current
  // hand context so we can pinpoint the writer that produced
  // SOLO_DECLARED during PRE_DEAL of h2.
  const soloTraceSnapRef = useRef<string>('');
  const prevHandCtxForTraceRef = useRef<string | null>(handContextId ?? null);
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    const snap = {
      handContextId: handContextId ?? null,
      prevHandContextId: prevHandCtxForTraceRef.current,
      isSoloVsChuckyRaw: !!isSoloVsChuckyRaw,
      soloVsChuckyTableLocked: !!soloVsChuckyTableLocked,
      soloDeclared: !!(isSoloVsChuckyRaw || soloVsChuckyTableLocked),
      soloVsChuckyPlayerIdLocked,
      chuckyActive: !!chuckyActive,
      cachedChuckyActive,
      cachedChuckyCardsExists: !!(cachedChuckyCards && cachedChuckyCards.length > 0),
      cachedChuckyCardsCount: cachedChuckyCards?.length ?? 0,
      cachedChuckyHandContextId: cachedChuckyHandContextRef.current,
      tabledSnapshotExists: !!lonePlayerStageSnapshotRef.current,
      tabledSnapshotHandId: lonePlayerStageSnapshotRef.current?.handContextId ?? null,
      holmWinPotTriggerId: holmWinPotTriggerId ?? null,
      roundStatus,
      allDecisionsIn,
      stayedPlayersCount,
    };
    const key = JSON.stringify(snap);
    if (key === soloTraceSnapRef.current) return;
    soloTraceSnapRef.current = key;
    recordSoloStateChange({
      ...snap,
      source: 'watcher-effect',
      callsite: 'MobileGameTable:soloStateWatcher',
      reason: 'state-diff',
    });
    prevHandCtxForTraceRef.current = handContextId ?? null;
  }, [
    gameType, handContextId, isSoloVsChuckyRaw, soloVsChuckyTableLocked,
    soloVsChuckyPlayerIdLocked, chuckyActive, cachedChuckyActive, cachedChuckyCards,
    holmWinPotTriggerId, roundStatus, allDecisionsIn, stayedPlayersCount,
  ]);



  // Capture the solo player id once, so we can keep tabling even if current_decision gets cleared during payout
  useEffect(() => {
    if (soloVsChuckyPlayerIdLocked) return;
    if (!(isSoloVsChuckyRaw || soloVsChuckyTableLocked || holmWinPotTriggerId)) return;

    // FIX 6 (CRITICAL): Solo capture MUST require exactly 1 stayer.
    // Without this, holmWinPotTriggerId from a SHOWDOWN win (2+ stayers) allows
    // entry into the capture path, and players.find() locks the first stayer as
    // "solo" even though it's a multi-player showdown. The correction effect
    // (stayedPlayersCount > 1) is also suppressed by holmWinPotTriggerId,
    // so the wrong lock persists across hand boundaries.
    // Proven failure: Pedro Strop session hand 4 (showdown) → Hap incorrectly
    // locked as solo because holmWinPotTriggerId bypassed all guards.
    if (stayedPlayersCount !== 1) {
      return;
    }

    const isEarlyPhaseForCapture = roundStatus === 'betting' || roundStatus === 'pending' || roundStatus === 'ante';
    if (isSoloVsChuckyRaw && !holmWinPotTriggerId && !chuckyActive && isEarlyPhaseForCapture && !allDecisionsIn) {
      return;
    }

    if (!chuckyActive && !holmWinPotTriggerId && (roundStatus === 'completed' || roundStatus === 'showdown') && !allDecisionsIn) {
      return;
    }

    if (!allDecisionsIn) return;

    // FIX 5: Require decision_locked === true to confirm the stay belongs to the CURRENT hand.
    const stayed = players.find(p => p.current_decision === 'stay' && p.decision_locked === true);
    const staleCandidate = !stayed ? players.find(p => p.current_decision === 'stay') : null;

    if (staleCandidate && !stayed) {
      // Log blocked capture — candidate had stay but no decision_locked
      console.log('[HOLM-SOLO] Solo capture BLOCKED — stale decision_locked', {
        candidatePlayerId: staleCandidate.id,
        current_decision: staleCandidate.current_decision,
        decision_locked: staleCandidate.decision_locked,
        allDecisionsIn,
        handContextId,
        roundStatus,
        chuckyActive,
      });
      import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
        persistSyncDebugEvent({
          gameId,
          gameType: 'holm-game',
          handNumber: 0,
          roundId: null,
          eventType: 'sync-gate',
          severity: 'warn',
          eventName: 'solo-lock-capture-blocked',
          payload: {
            candidatePlayerId: staleCandidate.id,
            current_decision: staleCandidate.current_decision,
            decision_locked: staleCandidate.decision_locked,
            allDecisionsIn,
            handContextId,
            roundStatus,
            chuckyActive,
          },
        });
      }).catch(() => {});
      return;
    }

    if (stayed) {
      console.log('[HOLM-SOLO] Solo capture applied', {
        playerId: stayed.id,
        current_decision: stayed.current_decision,
        decision_locked: stayed.decision_locked,
        allDecisionsIn,
        handContextId,
        roundStatus,
        chuckyActive,
      });
      import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
        persistSyncDebugEvent({
          gameId,
          gameType: 'holm-game',
          handNumber: 0,
          roundId: null,
          eventType: 'transition',
          severity: 'info',
          eventName: 'solo-lock-capture-applied',
          payload: {
            playerId: stayed.id,
            decision_locked: stayed.decision_locked,
            allDecisionsIn,
            handContextId,
            roundStatus,
            chuckyActive,
          },
        });
      }).catch(() => {});
      setSoloVsChuckyPlayerIdLocked(stayed.id);
      return;
    }

    if (lastRoundResult) {
      const result = lastRoundResult.toLowerCase();
      for (const p of players) {
        const botAlias = p.is_bot ? getBotAlias(players, p.user_id) : '';
        const candidates = [p.profiles?.username, botAlias]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());

        if (
          candidates.some(
            (name) =>
              result.includes(`${name} beat`) ||
              result.includes(`${name} won`) ||
              result.includes(`${name} wins`) ||
              result.includes(`${name} earns`)
          )
        ) {
          setSoloVsChuckyPlayerIdLocked(p.id);
          return;
        }
      }
    }
  }, [isSoloVsChuckyRaw, soloVsChuckyTableLocked, holmWinPotTriggerId, players, soloVsChuckyPlayerIdLocked, lastRoundResult, roundStatus, chuckyActive, allDecisionsIn, handContextId, gameId, stayedPlayersCount]);

  // Reset of solo-vs-Chucky locks is also handled inside resetHandUiCaches (and is deferred during animations)
  // so tabled cards can't snap back mid pot-to-player animation.

  // INVARIANT: Detect stale solo-player re-lock across hand boundaries
  // Skip for true solo-vs-chucky (only 1 human) — same player re-locking is expected.
  const humanPlayerCount = players.filter(p => !p.is_bot && !p.sitting_out).length;
  useEffect(() => {
    if (gameType !== 'holm-game' || !soloVsChuckyPlayerIdLocked || !handContextId) return;
    if (humanPlayerCount <= 1) return; // Solo game: same player always locks, not a bug
    import('@/lib/holmSyncDiagnostics').then(({ checkSoloPlayerMismatch }) => {
      checkSoloPlayerMismatch(soloVsChuckyPlayerIdLocked, currentUserId, handContextId, gameId);
    }).catch(() => { /* safe */ });
  }, [soloVsChuckyPlayerIdLocked, handContextId, gameType, currentUserId, gameId, humanPlayerCount]);

  // ── Horses/SCC sync diagnostics: invariant checks ──────────────
  useEffect(() => {
    if (!isDiceGame || !gameId || !horsesController) return;
    const hs = horsesController;
    const handNum = currentRound ?? 0;

    import('@/lib/horsesSyncDiagnostics').then(({
      checkHorsesStuckNullTurn,
      checkHorsesStuckAllComplete,
      checkHorsesPhaseRenderMismatch,
      checkHorsesRegressiveHand,
    }) => {
      // INV-1: stuck-null-turn
      checkHorsesStuckNullTurn(gameId, handNum, hs.gamePhase, hs.currentTurnPlayerId);

      // INV-2: stuck-all-complete
      // Guard: skip when state is not yet hydrated (null phase / empty turnOrder)
      const hsTurnOrder = horsesState?.turnOrder as string[] | undefined;
      if (horsesState?.playerStates && hsTurnOrder && hsTurnOrder.length > 0 && hs.gamePhase) {
        checkHorsesStuckAllComplete(
          gameId, handNum, hs.gamePhase,
          horsesState.playerStates as Record<string, { isComplete?: boolean }>,
          hsTurnOrder,
        );
      }

      // INV-3: phase-render-mismatch
      if (hs.gamePhase === 'playing') {
        checkHorsesPhaseRenderMismatch(gameId, handNum, hs.gamePhase, 'input');
      } else if (hs.gamePhase === 'complete') {
        checkHorsesPhaseRenderMismatch(gameId, handNum, hs.gamePhase, 'result');
      }

      // INV-4: regressive-hand-identity
      checkHorsesRegressiveHand(gameId, handNum);
    }).catch(() => { /* safe */ });
  }, [isDiceGame, gameId, horsesController?.gamePhase, horsesController?.currentTurnPlayerId, currentRound, horsesState]);

  useEffect(() => {
    if (!isDiceGame || !gameId) return;
    return () => {
      import('@/lib/horsesSyncDiagnostics').then(({ resetHorsesTracking }) => {
        resetHorsesTracking(gameId);
      }).catch(() => {});
    };
  }, [isDiceGame, gameId]);

  const isSoloVsChucky = isSoloVsChuckyRaw || soloVsChuckyTableLocked;

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

  // Rabbit hunt label should sit directly under CommunityCards (regardless of scale/viewport).
  // CRITICAL: Detect stale approved cards by checking if handContextId changed.
  // This prevents the "flash of previous cards" on new hand when approvedCommunityCards
  // hasn't been cleared yet but handContextId indicates a new hand started.
  const approvedCardsAreStale = !!(
    handContextId &&
    approvedHandContextId &&
    handContextId !== approvedHandContextId
  );

  const shouldShowHolmCommunityCards =
    gameType === "holm-game" &&
    !!approvedCommunityCards &&
    (approvedCommunityCards?.length ?? 0) > 0 &&
    showCommunityCards &&
    !approvedCardsAreStale && // Don't show stale cards
    (isInGameOverStatus || currentRound === approvedRoundForDisplay);

  const revealedForRabbitUi = isDelayingCommunityCards
    ? staggeredCardCount
    : (communityCardsRevealed ?? 0);

  const hasWinResult =
    typeof lastRoundResult === "string" && /(beat|wins|won)/i.test(lastRoundResult);

  // Rabbit hunt should only show when ALL players folded (not during solo vs Chucky showdown)
  // soloVsChuckyTableLocked prevents the brief flicker when stayedPlayersCount temporarily becomes 0
  const shouldShowRabbitHuntLabel =
    shouldShowHolmCommunityCards &&
    rabbitHunt &&
    stayedPlayersCount === 0 &&
    !soloVsChuckyTableLocked &&
    !isSoloVsChucky &&
    revealedForRabbitUi > 2 &&
    !hasWinResult;

  useLayoutEffect(() => {
    if (!shouldShowRabbitHuntLabel) {
      setRabbitHuntLabelTop(null);
      return;
    }

    const update = () => {
      const containerEl = tableContainerRef.current;
      const cardsEl = communityCardsWrapperRef.current;

      if (!containerEl || !cardsEl) {
        setRabbitHuntLabelTop(null);
        return;
      }

      const containerRect = containerEl.getBoundingClientRect();
      const cardsRect = cardsEl.getBoundingClientRect();

      // NOTE: getBoundingClientRect does NOT include box-shadow, and these cards have a strong shadow.
      // Add extra padding so the label clears the *visual* bottom edge.
      const paddingPx = 52;
      const nextTop = Math.round(cardsRect.bottom - containerRect.top + paddingPx);
      setRabbitHuntLabelTop(nextTop);
    };

    // Measure now + across the 300ms transition window so the label follows the moving cards.
    update();
    const raf = requestAnimationFrame(update);
    const t1 = window.setTimeout(update, 160);
    const t2 = window.setTimeout(update, 320);

    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", update);
    };
  }, [
    shouldShowRabbitHuntLabel,
    isDelayingCommunityCards,
    staggeredCardCount,
    communityCardsRevealed,
    isHolmMultiPlayerShowdown,
    approvedCommunityCards,
    showCommunityCards,
  ]);
  
  if (currentRound && showdownRoundRef.current !== null && showdownRoundRef.current !== currentRound && !isInGameOverStatus) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
    showdownHandContextRef.current = null;
  }
  
  // Also clear if we're in early phase, no announcement, AND allDecisionsIn is false (truly new hand)
  // But NEVER clear during game_over - cards must remain visible
  if (showdownRoundRef.current !== null && isInEarlyPhase && !lastRoundResult && !allDecisionsIn && !isInGameOverStatus) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
    showdownHandContextRef.current = null;
  }
  
  // CRITICAL: Also clear cache if handContextId changed (new hand started) - prevents stale cards
  // This is the main fix for the bug where wrong cards are displayed during solo vs Chucky showdown
  if (
    showdownHandContextRef.current !== null &&
    showdownHandContextRef.current !== (handContextId ?? null) &&
    !isInGameOverStatus
  ) {
    console.log('[SHOWDOWN_CACHE] Clearing cache - handContextId changed:', {
      prev: showdownHandContextRef.current,
      next: handContextId ?? null,
    });
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
    showdownHandContextRef.current = null;
  }
  
  // If showdown is active, cache cards for players who stayed
  // CRITICAL: Only cache if handContextId matches (prevents caching stale cards from previous hand)
  if (isShowdownActive && currentRound && handContextId) {
    if (showdownRoundRef.current === null) {
      showdownRoundRef.current = currentRound;
      showdownHandContextRef.current = handContextId;
    }
    // Cache cards for stayed players during this showdown
    // CRITICAL: Verify handContextId matches before caching to prevent stale card caching
    if (showdownRoundRef.current === currentRound && showdownHandContextRef.current === handContextId) {
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
    } else if (showdownHandContextRef.current !== handContextId) {
      // handContextId changed but cache wasn't cleared yet (race condition)
      // Don't cache stale cards - wait for proper cache clear
      console.warn('[SHOWDOWN_CACHE] Skipping cache - handContextId mismatch:', {
        cached: showdownHandContextRef.current,
        current: handContextId,
      });
    }
  }
  
  const getCardsFingerprint = (cardsToPrint: CardType[]) =>
    cardsToPrint.map(c => `${c.rank}${c.suit}`).join('|');

  // Function to get cards for a player (use cache during showdown)
  const getPlayerCards = (playerId: string): CardType[] => {
    const liveCards = playerCards.find(pc => pc.player_id === playerId)?.cards || [];

    // Cache validity rules:
    // - ALWAYS prefer strict handContextId match when available
    // - If handContextId is temporarily missing, fall back to round match (NEVER blindly trust cache)
    // - CRITICAL: handContextId mismatch means stale cache - NEVER return stale cards
    const isCacheValidForCurrentHand =
      handContextId != null
        ? showdownHandContextRef.current === handContextId
        : showdownRoundRef.current !== null && showdownRoundRef.current === currentRound;

    const cachedCards = showdownCardsCache.current.get(playerId);

    // CRITICAL: If cache is invalid (wrong hand), return live cards only - never stale cache
    // This prevents wrong cards from flashing at showdown on new hands
    if (!isCacheValidForCurrentHand) {
      return liveCards;
    }

    // If we have both cached + live and they differ, the cache is stale.
    // Prefer live cards and refresh the cache so exposed/tabled cards match the actual hand.
    if (cachedCards && cachedCards.length > 0 && liveCards.length > 0) {
      const cachedFp = getCardsFingerprint(cachedCards);
      const liveFp = getCardsFingerprint(liveCards);
      if (cachedFp !== liveFp) {
        showdownCardsCache.current.set(playerId, [...liveCards]);
        return liveCards;
      }
    }

    // During game_over, use cached cards for pot animation visibility
    // Cache validity is already confirmed above
    if (isInGameOverStatus) {
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
      if (liveCards.length > 0) {
        return liveCards;
      }
    }

    // Once cards are cached for this round AND same hand context, ALWAYS use cache
    // This prevents flickering when isShowdownActive temporarily becomes false
    if (showdownRoundRef.current === currentRound) {
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
    }

    return liveCards;
  };
  
  // Function to check if a player's cards should be shown
  const isPlayerCardsExposed = (playerId: string): boolean => {
    // CRITICAL: Validate cache with BOTH round AND handContextId
    const isCacheValidForCurrentHand = handContextId != null
      ? showdownHandContextRef.current === handContextId && showdownRoundRef.current === currentRound
      : showdownRoundRef.current !== null && showdownRoundRef.current === currentRound;
    
    // CRITICAL: If cache is invalid (wrong hand), cards are NOT exposed - prevents stale exposure
    if (!isCacheValidForCurrentHand) {
      return false;
    }
    
    // During game_over, show cached cards only if cache is valid (already confirmed above)
    if (isInGameOverStatus && showdownCardsCache.current.has(playerId)) {
      return true;
    }
    if (!currentRound) return false;
    // Cards are exposed if: cache is valid AND player has cached cards
    return showdownCardsCache.current.has(playerId);
  };

  // Find current player and their cards
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  
  // CRITICAL FIX: Use handContextId to validate current player cards.
  // During hand transitions, playerCards may briefly contain stale data from the previous hand.
  // We cache the last valid cards for the current player and only update when we can confirm
  // the new cards are for the CURRENT hand (via handContextId match).
  const currentPlayerCardsRef = useRef<{ cards: CardType[]; handContextId: string | null }>({
    cards: [],
    handContextId: null,
  });
  // Frozen snapshot of currentPlayerCards held for the duration of a Holm
  // win-pot animation. Lifetime is bound to handContextId (NOT to the trigger
  // prop) so the snapshot survives even if the parent clears
  // holmWinPotTriggerId early (e.g., via the isInProgress gate or premature
  // completion). Snapshot only releases when the hand actually advances.
  const holmWinPotFrozenCardsRef = useRef<{
    triggerId: string | null;
    cards: CardType[];
    handContextId: string | null;
  }>({
    triggerId: null,
    cards: [],
    handContextId: null,
  });
  
  // HAND TRANSITION GUARD: When handContextId changes, briefly hide cards to prevent stale card flash.
  // This is similar to the Cribbage pattern - a short transition period ensures old cards disappear
  // before new cards are shown, avoiding the "switch" visual.
  const [isHandTransitioning, setIsHandTransitioning] = useState(false);
  // PR-B.4: source label of last currentPlayerCards memo decision (for flash diag).
  const __mgtCurrentPlayerCardsSourceRef = useRef<string>('init');
  const handTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHandContextForTransitionRef = useRef<string | null>(null);
  const prevRoundForHandTransitionRef = useRef<number | null>(null);
  
  useEffect(() => {
    // P0 fix: hand-boundary transition guard applied UNIVERSALLY — not
    // gated on gameType. Stale-card flashes across identity boundaries
    // are a class invariant, not a Holm-only bug. This also fires when
    // prevContext is null and newContext becomes non-null (cross-
    // dealer_game mount, e.g. Gin → Holm) so a fresh MobileGameTable
    // instance with stale parent `playerCards` prop cannot paint
    // previous-game cards on the new felt.
    const prevContext = prevHandContextForTransitionRef.current;
    const newContext = handContextId ?? null;

    if (prevContext !== newContext) {
      const is357StagedRoundAdvance =
        __is357GameType(gameType) &&
        prevContext !== null &&
        newContext !== null &&
        (currentRound ?? 0) > 1 &&
        (prevRoundForHandTransitionRef.current ?? 0) < (currentRound ?? 0);
      // PR-B.5 FIX (asymmetric Holm first-hand flash): Do NOT arm the
      // transition guard on null → non-null bootstrap when raw player_cards
      // for the new hand are already present. The guard exists to bridge
      // BETWEEN hands (hide stale cards before fresh ones arrive). On a
      // fresh MobileGameTable mount with no previous hand, there are no
      // stale cards to hide — arming the 200ms timer here wipes cards
      // that already rendered correctly (race-dependent: flashes only on
      // the client whose raw cards arrive in the same render as
      // handContextId, not the client where handContextId leads).
      const isBootstrapFromNull = prevContext === null && newContext !== null;
      const rawCardsAlreadyPresent =
        (currentPlayer
          ? playerCards.find(pc => pc.player_id === currentPlayer.id)?.cards?.length ?? 0
          : 0) > 0;

      if (!(isBootstrapFromNull && rawCardsAlreadyPresent) && !is357StagedRoundAdvance) {
        setIsHandTransitioning(true);

        if (handTransitionTimeoutRef.current) {
          clearTimeout(handTransitionTimeoutRef.current);
        }

        handTransitionTimeoutRef.current = setTimeout(() => {
          setIsHandTransitioning(false);
          handTransitionTimeoutRef.current = null;
        }, 200);
      }
    }

    prevHandContextForTransitionRef.current = newContext;
    prevRoundForHandTransitionRef.current = currentRound ?? null;

    return () => {
      if (handTransitionTimeoutRef.current) {
        clearTimeout(handTransitionTimeoutRef.current);
      }
    };
  }, [handContextId, gameType, currentRound]);
  
  const rawCurrentPlayerCards = currentPlayer 
    ? playerCards.find(pc => pc.player_id === currentPlayer.id)?.cards || [] 
    : [];
  
  
  // Update cache only when:
  // 1. handContextId changes (new hand started) - reset to new cards (or empty if not yet received)
  // 2. handContextId is the same AND we have new cards - update with fresh cards
  // 3. handContextId is null but we have cards - accept them (fallback for legacy behavior)
  const currentPlayerCards = useMemo(() => {
    let chosen: { source: string; cards: CardType[] };

    // ANIMATION-SCOPED FROZEN SNAPSHOT: While the Holm win-pot/chip-award
    // animation is active, return a frozen snapshot. Lifetime is bound to
    // handContextId, NOT to holmWinPotTriggerId, so the snapshot survives
    // any premature trigger clear (parent isInProgress gate, completion skew).
    if (holmWinPotTriggerId) {
      if (holmWinPotFrozenCardsRef.current.triggerId !== holmWinPotTriggerId) {
        const snapshot = rawCurrentPlayerCards.length > 0
          ? rawCurrentPlayerCards
          : currentPlayerCardsRef.current.cards;
        holmWinPotFrozenCardsRef.current = {
          triggerId: holmWinPotTriggerId,
          cards: snapshot,
          handContextId: handContextId ?? null,
        };
      }
      chosen = { source: 'frozen-trigger-active', cards: holmWinPotFrozenCardsRef.current.cards };
    } else if (
      holmWinPotFrozenCardsRef.current.triggerId !== null &&
      holmWinPotFrozenCardsRef.current.handContextId !== (handContextId ?? null)
    ) {
      // Hand advanced — release snapshot.
      holmWinPotFrozenCardsRef.current = { triggerId: null, cards: [], handContextId: null };
      chosen = { source: 'frozen-released-hand-advanced', cards: [] };
    } else if (
      holmWinPotFrozenCardsRef.current.triggerId !== null &&
      holmWinPotFrozenCardsRef.current.cards.length > 0
    ) {
      chosen = { source: 'frozen-trigger-cleared-same-hand', cards: holmWinPotFrozenCardsRef.current.cards };
    } else if (isHandTransitioning && !(__is357GameType(gameType) && (currentRound ?? 0) > 1)) {
      // TRANSITION GUARD: During hand transition, return empty to prevent stale card flash
      chosen = { source: 'empty-hand-transitioning', cards: [] };
    } else if (gameType === 'holm-game' && roundStatus === 'completed') {
      // HOLM COMPLETED GUARD: Keep cards visible for the remainder of the same hand
      // (covers chip-award animation window). Only hide once handContextId actually
      // advances to the next hand.
      const cachedHandContextId = currentPlayerCardsRef.current.handContextId;
      const cachedCards = currentPlayerCardsRef.current.cards;
      const sameHand = handContextId != null && handContextId === cachedHandContextId;

      if (sameHand && rawCurrentPlayerCards.length > 0) {
        chosen = { source: 'holm-completed-raw-same-hand', cards: rawCurrentPlayerCards };
      } else if (sameHand && cachedCards.length > 0) {
        chosen = { source: 'holm-completed-cached-same-hand', cards: cachedCards };
      } else if (rawCurrentPlayerCards.length > 0 && cachedHandContextId == null) {
        // First render after completion before cache seeded — accept raw.
        chosen = { source: 'holm-completed-raw-uncached', cards: rawCurrentPlayerCards };
      } else {
        chosen = { source: 'empty-holm-completed', cards: [] };
      }
    } else {
      const cachedHandContextId = currentPlayerCardsRef.current.handContextId;
      const cachedCards = currentPlayerCardsRef.current.cards;

      if (handContextId !== cachedHandContextId) {
        // Case 1: handContextId changed — new hand boundary.
        if (__is357GameType(gameType) && (currentRound ?? 0) > 1 && cachedCards.length > 0) {
          const stagedCards = rawCurrentPlayerCards.length >= cachedCards.length ? rawCurrentPlayerCards : cachedCards;
          if (rawCurrentPlayerCards.length >= cachedCards.length) {
            currentPlayerCardsRef.current = { cards: rawCurrentPlayerCards, handContextId: handContextId ?? null };
          }
          chosen = { source: '357-staged-round-floor', cards: stagedCards };
        } else if (rawCurrentPlayerCards.length > 0) {
          currentPlayerCardsRef.current = { cards: rawCurrentPlayerCards, handContextId: handContextId ?? null };
          chosen = { source: 'raw-new-hand', cards: rawCurrentPlayerCards };
        } else {
          // P0 fix: do NOT return cached previous-hand cards across an
          // identity boundary. The cached snapshot belongs to the prior
          // hand; rendering it on the new hand is exactly the stale-
          // artifact bug. Return empty until raw cards for the new
          // hand arrive (the 200ms transition guard above bridges any
          // visible gap).
          chosen = { source: 'empty-new-hand-no-raw-yet', cards: [] };
        }
      } else if (rawCurrentPlayerCards.length > 0) {
        // Case 2: Same hand - prefer new cards if available
        const rawFp = rawCurrentPlayerCards.map(c => `${c.rank}${c.suit}`).join('|');
        const cachedFp = cachedCards.map(c => `${c.rank}${c.suit}`).join('|');
        if (rawFp !== cachedFp) {
          currentPlayerCardsRef.current = { cards: rawCurrentPlayerCards, handContextId: handContextId ?? null };
        }
        chosen = { source: 'raw-same-hand', cards: rawCurrentPlayerCards };
      } else {
        // No new cards but we have cached - keep cached
        chosen = { source: 'cached-same-hand-no-raw', cards: cachedCards };
      }
    }

    __mgtCurrentPlayerCardsSourceRef.current = chosen.source;
    if (gameType === 'holm-game') {
      const rawFp = rawCurrentPlayerCards.map(c => `${c.rank}${c.suit}`).join('|');
      const chosenFp = chosen.cards.map(c => `${c.rank}${c.suit}`).join('|');
      const cachedRef = currentPlayerCardsRef.current;
      ffRecord({
        writerId: 'MobileGameTable.tsx:currentPlayerCardsMemo:L3866',
        source: 'HOLM_SELF_HAND_LINEAGE',
        marker: 'HOLM_SELF_HAND_SELECTOR_DECISION',
        identity: { segmentId: handContextId ?? null, playerId: currentPlayer?.id ?? null },
        payload: {
          chosenSource: chosen.source,
          chosenLength: chosen.cards.length,
          chosenFingerprint: chosenFp,
          rawLength: rawCurrentPlayerCards.length,
          rawFingerprint: rawFp,
          cachedLength: cachedRef.cards.length,
          cachedHandContextId: cachedRef.handContextId,
          activeHandContextId: handContextId ?? null,
          isHandTransitioning,
          roundStatus,
          holmWinPotTriggerId: holmWinPotTriggerId ?? null,
        },
      });
    }
    return chosen.cards;
  }, [rawCurrentPlayerCards, handContextId, isHandTransitioning, gameType, roundStatus, holmWinPotTriggerId, currentPlayer?.id]);

  // ── BOOTSTRAP_FLASH_MGT snapshot effect (Holm hand 1–2 only) ──
  // Captures every distinct flip across the dimensions most likely to
  // cause a sub-shell mount→flash→remount on first hand bootstrap.
  const __mgtFlashEnabled = gameType === 'holm-game' && !!gameId && (currentRound ?? 0) <= 2;
  useEffect(() => {
    if (!__mgtFlashEnabled) return;
    if (!gameId) return;

    const seatedCards: Record<string, number> = {};
    const seatedRawCards: Record<string, number> = {};
    try {
      for (const p of players) {
        if (p.status === 'active' || p.status === 'folded') {
          const pc = playerCards.find(x => x.player_id === p.id);
          const key = `p${p.position}`;
          seatedRawCards[key] = pc?.cards?.length ?? 0;
          seatedCards[key] = seatedRawCards[key];
        }
      }
    } catch { /* */ }

    const seatedCardsKey = Object.entries(seatedCards).sort().map(([k, v]) => `${k}=${v}`).join(',');

    const key = [
      handContextId ?? 'null',
      `isHT=${isHandTransitioning ? 1 : 0}`,
      `isDelayCC=${isDelayingCommunityCards ? 1 : 0}`,
      `showCC=${showCommunityCards ? 1 : 0}`,
      `approvedHC=${approvedHandContextId ?? 'null'}`,
      `cpcLen=${currentPlayerCards.length}`,
      `cpcSrc=${__mgtCurrentPlayerCardsSourceRef.current}`,
      `seated=${seatedCardsKey}`,
      `cr=${currentRound ?? 'null'}`,
      `rs=${roundStatus ?? 'null'}`,
      `gs=${gameStatus ?? 'null'}`,
    ].join('|');

    const prev = __mgtFlashLastKeyByGame.get(gameId) ?? '';
    if (prev === key) return;
    __mgtFlashLastKeyByGame.set(gameId, key);

    __mgtFlashPersist({
      game_id: gameId,
      event_type: 'mgt_bootstrap_flash_snapshot',
      payload: {
        from: prev || null,
        to: key,
        handContextId: handContextId ?? null,
        isHandTransitioning,
        isDelayingCommunityCards,
        showCommunityCards,
        approvedHandContextId: approvedHandContextId ?? null,
        currentPlayerCardsLength: currentPlayerCards.length,
        currentPlayerCardsSource: __mgtCurrentPlayerCardsSourceRef.current,
        seatedCards,
        currentRound: currentRound ?? null,
        roundStatus: roundStatus ?? null,
        gameStatus: gameStatus ?? null,
        gameType,
        instanceLabel,
        tPerf: typeof performance !== 'undefined' ? performance.now() : null,
      },
    });
  }, [
    __mgtFlashEnabled,
    gameId,
    handContextId,
    isHandTransitioning,
    isDelayingCommunityCards,
    showCommunityCards,
    approvedHandContextId,
    currentPlayerCards.length,
    players,
    playerCards,
    currentRound,
    roundStatus,
    gameStatus,
    gameType,
    instanceLabel,
  ]);

  // Chip stack emoticon overlays - realtime synced via database
  const { emoticonOverlays, sendEmoticon, isSending: isEmoticonSending } = useChipStackEmoticons(
    gameId,
    currentPlayer?.id
  );
  
  // Handler for quick emoticon selection
  const handleQuickEmoticon = useCallback((emoticon: string) => {
    sendEmoticon(emoticon);
  }, [sendEmoticon]);

  // Detect when cards are dealt and trigger flash (only when not on cards tab)
  useEffect(() => {
    const currentCardCount = currentPlayerCards.length;
    
    if (currentCardCount > prevCardCountRef.current && activeTab !== 'cards') {
      setCardsTabFlashing(true);
      const timeout = setTimeout(() => setCardsTabFlashing(false), 1500);
      prevCardCountRef.current = currentCardCount;
      return () => clearTimeout(timeout);
    }
    
    prevCardCountRef.current = currentCardCount;
  }, [currentPlayerCards.length, activeTab]);
  
  // Realtime-only GREEN pulse path: only eligible other-human messages can pulse or set unread.
  useEffect(() => {
    if (!latestRealtimeChatMessage) return;

    logChatIndicator('realtime received', latestRealtimeChatMessage);

    const eligibility = getChatIndicatorEligibility(latestRealtimeChatMessage);

    logChatIndicator('eligibility', latestRealtimeChatMessage, {
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    });

    if (!eligibility.eligible) {
      return;
    }

    if (
      lastProcessedRealtimeMessageIdRef.current === latestRealtimeChatMessage.id ||
      lastSeenChatMessageId === latestRealtimeChatMessage.id
    ) {
      console.log('[holm-chat-indicator] skipped stale/replayed', {
        messageId: latestRealtimeChatMessage.id,
      });
      return;
    }

    // Always update watermarks so the message is never lost
    processedEligibleRealtimeRef.current = true;
    lastProcessedRealtimeMessageIdRef.current = latestRealtimeChatMessage.id;
    setLastSeenChatMessageId(latestRealtimeChatMessage.id);
    logChatIndicator('watermark updated', latestRealtimeChatMessage, {
      lastSeen: latestRealtimeChatMessage.id,
      lastRead: lastReadChatMessageId,
      reason: 'eligible-realtime-seen',
    });

    // Pre-hydration: preserve the message as unseen, but never pulse/mark-read.
    if (!chatHydratedRef.current) {
      logChatIndicator('pre-hydration deferred', latestRealtimeChatMessage, {
        lastSeen: latestRealtimeChatMessage.id,
        lastRead: lastReadChatMessageId,
      });
      return;
    }

    if (activeTab === 'chat') {
      if (greenClearTimeoutRef.current) {
        clearTimeout(greenClearTimeoutRef.current);
        greenClearTimeoutRef.current = null;
      }

      if (chatTabFlashing) {
        logChatIndicator('green cleared', latestRealtimeChatMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          reason: 'chat-already-open',
        });
      }

      setChatTabFlashing(false);
      setHasUnreadMessages(false);

      if (lastReadChatMessageId !== latestRealtimeChatMessage.id) {
        setLastReadChatMessageId(latestRealtimeChatMessage.id);
        logChatIndicator('watermark updated', latestRealtimeChatMessage, {
          activeTab: 'chat',
          flashing: false,
          unread: false,
          lastSeen: latestRealtimeChatMessage.id,
          lastRead: latestRealtimeChatMessage.id,
          reason: 'realtime-while-chat-open',
        });
      }

      logChatIndicator('red cleared', latestRealtimeChatMessage, {
        activeTab: 'chat',
        flashing: false,
        unread: false,
        reason: 'chat-already-open',
      });
      return;
    }

    if (greenClearTimeoutRef.current) {
      clearTimeout(greenClearTimeoutRef.current);
    }

    setChatTabFlashing(true);
    setHasUnreadMessages(true);
    logChatIndicator('green set', latestRealtimeChatMessage, {
      flashing: true,
      unread: true,
      lastSeen: latestRealtimeChatMessage.id,
    });
    logChatIndicator('red set', latestRealtimeChatMessage, {
      flashing: true,
      unread: true,
      lastSeen: latestRealtimeChatMessage.id,
      reason: 'eligible-realtime-while-chat-closed',
    });

    greenClearTimeoutRef.current = setTimeout(() => {
      greenClearTimeoutRef.current = null;
      setChatTabFlashing(false);
      logChatIndicator('green cleared', latestRealtimeChatMessage, {
        flashing: false,
        unread: true,
        lastSeen: latestRealtimeChatMessage.id,
        reason: 'pulse-timeout',
      });
    }, 1500);
  }, [
    activeTab,
    chatTabFlashing,
    getChatIndicatorEligibility,
    lastReadChatMessageId,
    lastSeenChatMessageId,
    latestRealtimeChatMessage,
    logChatIndicator,
    setHasUnreadMessages,
    setLastReadChatMessageId,
    setLastSeenChatMessageId,
  ]);

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

      if (!lastSeenChatMessageId && !lastReadChatMessageId && latestEligibleMessage && !processedEligibleRealtimeRef.current) {
        setLastSeenChatMessageId(latestEligibleMessage.id);
        setLastReadChatMessageId(latestEligibleMessage.id);
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

      if (latestEligibleMessage && lastReadChatMessageId !== latestEligibleMessage.id) {
        setLastReadChatMessageId(latestEligibleMessage.id);
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

    let unreadEligibleMessages: typeof eligibleIndicatorMessages = [];

    if (lastReadChatMessageId) {
      unreadEligibleMessages = getMessagesAfterWatermark(eligibleIndicatorMessages, lastReadChatMessageId);

      if (eligibleIndicatorMessages.length > 0 && unreadEligibleMessages.length === 0 && !eligibleIndicatorMessages.some((message) => message.id === lastReadChatMessageId)) {
        console.log('[holm-chat-indicator] red unread skipped', {
          reason: 'stale-read-watermark',
          lastReadChatMessageId,
        });
      }
    } else if (lastSeenChatMessageId) {
      unreadEligibleMessages = getMessagesAfterWatermark(eligibleIndicatorMessages, lastSeenChatMessageId, true);

      if (eligibleIndicatorMessages.length > 0 && unreadEligibleMessages.length === 0 && !eligibleIndicatorMessages.some((message) => message.id === lastSeenChatMessageId)) {
        console.log('[holm-chat-indicator] red unread skipped', {
          reason: 'stale-seen-watermark',
          lastSeenChatMessageId,
        });
      }
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
    lastReadChatMessageId,
    lastSeenChatMessageId,
    logChatIndicator,
    setHasUnreadMessages,
    setLastReadChatMessageId,
    setLastSeenChatMessageId,
  ]);

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

  // Publish tab metadata to the shell-owned tab bar. Shell owns layout
  // and geometry; this surface provides only the icon choice and
  // gameplay-derived indicator state (cards-tab flash on turn, chat
  // unread/new-message indicators).
  {
    const isYourTurnNotOnCardsTab = !isPaused && isPlayerTurn && !hasDecided && activeTab !== 'cards' && roundStatus === 'betting';
    const cardsFlash: 'green' | 'red' | null = (!isPaused && cardsTabFlashing)
      ? 'green'
      : isYourTurnNotOnCardsTab
        ? 'red'
        : null;
    useShellTabBar({
      cardsIcon: isDiceGame ? 'dice' : 'spade',
      activeTab,
      setActiveTab,
      cardsFlashing: cardsFlash,
      chatFlashing: showGreenChatIndicator ? 'green' : null,
      chatIndicator: showRedChatIndicator ? 'red' : null,
      onOpenChat: handleOpenChatTab,
      isPaused: !!isPaused,
    });
  }

  // Publish timer state to the shell-owned canonical timer rail.
  // Games provide semantic state only (secondsRemaining, totalSeconds,
  // paused, actorLabel). The shell owns all rendering, colors, and
  // mount-frame snapping. There is no game-specific timer presentation.
  {
    const diceTimerActive =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.gamePhase === 'playing' &&
      !!horsesController.currentTurnPlayerId &&
      !horsesController.currentTurnPlayer?.is_bot &&
      horsesController.timeLeft !== null;

    const turnTimerActive =
      !diceTimerActive &&
      !!currentPlayer &&
      isPlayerTurn &&
      roundStatus === 'betting' &&
      !hasDecided &&
      timeLeft !== null &&
      timeLeft > 0 &&
      !!maxTime;

    let shellTimerState: Parameters<typeof useShellTimer>[0] = null;
    if (isPaused) {
      shellTimerState = {
        secondsRemaining: 0,
        totalSeconds: 1,
        paused: true,
        identityKey: 'paused',
      };
    } else if (diceTimerActive) {
      shellTimerState = {
        secondsRemaining: horsesController.timeLeft as number,
        totalSeconds: horsesController.maxTime ?? 30,
        actorLabel: horsesController.currentTurnPlayerName ?? null,
        activePlayerId: horsesController.currentTurnPlayerId,
        identityKey: `dice-${horsesController.currentTurnPlayerId}`,
      };
    } else if (turnTimerActive) {
      shellTimerState = {
        secondsRemaining: timeLeft as number,
        totalSeconds: maxTime as number,
        activePlayerId: currentPlayer.id,
        identityKey: `turn-${currentRound}-${currentTurnPosition ?? ''}`,
      };
    }
    useShellTimer(shellTimerState);
    const providerStateAfterPublish = useShellTimerStateForRender();

    // Mirror the gameplay-branch `hasTimer` gate (defined far below at the
    // ShellHudGrid render site). When this is false even though
    // `shellTimerState` is non-null, the rail is never mounted — the
    // provider has state, but no <ShellTimerRail/> exists to consume it.
    const hasTimerGateMirror = !!isPaused || (
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.gamePhase === 'playing' &&
      !!horsesController.currentTurnPlayerId &&
      !horsesController.currentTurnPlayer?.is_bot &&
      horsesController.timeLeft !== null
    ) || (
      !!currentPlayer &&
      isPlayerTurn &&
      roundStatus === 'betting' &&
      !hasDecided &&
      timeLeft !== null &&
      timeLeft > 0 &&
      !!maxTime
    );

    // ── TIMER DBG snapshot ──────────────────────────────────────────
    // Records the exact gate state behind diceTimerActive so we can
    // distinguish "not mounted" / "mounted hidden" / "null deadline" /
    // "expired deadline" without console scraping. DOM mount/visibility
    // is merged in by ExtraDebugPills' rAF sampler.
    {
      const isDice = !!diceGameplayUiActive;
      const turnDeadline = (horsesState as any)?.turnDeadline ?? null;
      const deadlineExpired = !!(turnDeadline && new Date(turnDeadline).getTime() <= Date.now());
      let blockedReason: TimerBlockedReason = 'ok';
      if (isDice) {
        if (!horsesRoundId) blockedReason = 'no_round';
        else if (!horsesState) blockedReason = 'horses_state_missing';
        else if (horsesController.gamePhase !== 'playing') blockedReason = 'game_phase_not_playing';
        else if (!horsesController.currentTurnPlayerId) blockedReason = 'no_current_turn_player';
        else if (horsesController.currentTurnPlayer?.is_bot) blockedReason = 'bot_turn';
        else if (!turnDeadline) blockedReason = 'turn_deadline_null';
        else if (deadlineExpired && horsesController.timeLeft === null) blockedReason = 'deadline_expired';
        else if (horsesController.timeLeft === null) blockedReason = 'time_left_null';
        else if (!diceTimerActive) blockedReason = 'timer_not_published';
      } else if (!shellTimerState) {
        blockedReason = 'timer_not_published';
      }
      const timerDbgEntries = timerDbgStore.get();
      const latestTimerDbg = timerDbgEntries[timerDbgEntries.length - 1];
      const nowMs = Date.now();
      const nextTimerPublished = !!shellTimerState;
      const nextProviderHasState = !!providerStateAfterPublish;
      // Latency tracking: capture wall-clock at each transition false→true,
      // reset to null when publish goes back to false (new publish cycle).
      let publishedAt = latestTimerDbg?.publishedAt ?? null;
      let providerReceivedAt = latestTimerDbg?.providerReceivedAt ?? null;
      let timerMountedAt = latestTimerDbg?.timerMountedAt ?? null;
      if (nextTimerPublished && !latestTimerDbg?.timerPublished) {
        publishedAt = nowMs;
        providerReceivedAt = null;
        timerMountedAt = null;
      } else if (!nextTimerPublished) {
        publishedAt = null;
        providerReceivedAt = null;
        timerMountedAt = null;
      }
      if (nextProviderHasState && !latestTimerDbg?.providerHasState && publishedAt !== null && providerReceivedAt === null) {
        providerReceivedAt = nowMs;
      }
      const latencyPublishToProvider = publishedAt !== null && providerReceivedAt !== null ? providerReceivedAt - publishedAt : null;
      const latencyProviderToMount = providerReceivedAt !== null && timerMountedAt !== null ? timerMountedAt - providerReceivedAt : null;
      const latencyTotal = publishedAt !== null && timerMountedAt !== null ? timerMountedAt - publishedAt : null;
      timerDbgStore.record({
        gameType: gameType ?? null,
        roundId: (horsesRoundId ?? null) as string | null,
        roundStatus: roundStatus ?? null,
        gamePhase: horsesController.gamePhase ?? null,
        diceGameplayUiActive: isDice,
        horsesControllerEnabled: !!horsesController.enabled,
        horsesStateExists: !!horsesState,
        currentTurnPlayerId: horsesController.currentTurnPlayerId ?? null,
        currentTurnPlayerIsBot: horsesController.currentTurnPlayer
          ? !!horsesController.currentTurnPlayer.is_bot
          : null,
        turnDeadline,
        roundDecisionDeadline: null,
        timeLeft: isDice ? (horsesController.timeLeft ?? null) : (timeLeft ?? null),
        maxTime: isDice ? (horsesController.maxTime ?? null) : (maxTime ?? null),
        diceTimerActive: !!diceTimerActive,
        timerPublished: nextTimerPublished,
        providerHasState: nextProviderHasState,
        hasTimerGate: !!hasTimerGateMirror,
        shellHudGridMounted: latestTimerDbg?.shellHudGridMounted ?? false, // DOM-owned; filled by ExtraDebugPills sampler
        timerRowMounted: latestTimerDbg?.timerRowMounted ?? false,         // DOM-owned; filled by ExtraDebugPills sampler
        timerRowChildCount: latestTimerDbg?.timerRowChildCount ?? 0,       // DOM-owned; filled by ExtraDebugPills sampler
        timerMounted: latestTimerDbg?.timerMounted ?? false,               // DOM-owned; filled by ExtraDebugPills sampler
        timerVisible: latestTimerDbg?.timerVisible ?? false,               // DOM-owned; filled by ExtraDebugPills sampler
        blockedReason,
        publishedAt,
        providerReceivedAt,
        timerMountedAt,
        latencyPublishToProvider,
        latencyProviderToMount,
        latencyTotal,
      });
    }
  }



  // Check if we should be in showdown display mode (hide chipstacks, buck, show larger cards)
  // This is true when: 
  // 1. Any player has exposed cards during active showdown, OR
  // 2. We have a result announcement showing (lastRoundResult is set)
  // 3. Chucky is active (community cards being revealed)
  // 4. We've locked showdown mode (prevents snap-back after announcement clears)
  const hasExposedPlayers = players.some(p => isPlayerCardsExposed(p.id));
  // Check if we're showing an announcement (either normal round result or game-over)
  // Result announcement must wait for the Chucky VISUAL reveal to finish.
  // Otherwise the announcement can render before / during the flips, gating
  // observers and producing the "rapid reveal after announcement" artifact.
  const isShowingAnnouncement =
    gameType === 'holm-game' &&
    !!lastRoundResult &&
    (awaitingNextRound || isGameOver) &&
    chuckyVisualRevealComplete;
  // Include Chucky active state to prevent flicker when community cards start revealing
  const isChuckyRevealing = gameType === 'holm-game' && (chuckyActive || cachedChuckyActive);
  const isAnyPlayerInShowdownRaw = gameType === 'holm-game' && (hasExposedPlayers || isShowingAnnouncement || isChuckyRevealing);
  
  // Lock showdown mode once it becomes true - only reset via resetHandUiCaches
  useEffect(() => {
    if (isAnyPlayerInShowdownRaw && !showdownModeLocked) {
      setShowdownModeLocked(true);
    }
  }, [isAnyPlayerInShowdownRaw, showdownModeLocked]);
  
  // Use locked state to prevent snap-back (cards stay narrow after announcement clears)
  const isAnyPlayerInShowdown = isAnyPlayerInShowdownRaw || showdownModeLocked;

  // Determine winner from lastRoundResult for dimming logic
  // ALSO derive winner when holmWinPotTriggerId is set (for tabling winner cards during animation)
  const winnerPlayerId = useMemo(() => {
    // Need announcement OR active holm win animation to determine winner
    const shouldDeriveWinner = isShowingAnnouncement || holmWinPotTriggerIdGated;
    if (!shouldDeriveWinner || !lastRoundResult) return null;
    // Parse winner from announcement - format usually includes player username
    // Look for patterns like "PlayerName beat", "PlayerName won", "PlayerName wins", "PlayerName earns"
    const result = lastRoundResult.toLowerCase();
    for (const player of players) {
      const botAlias = player.is_bot ? getBotAlias(players, player.user_id) : '';
      const candidates = [player.profiles?.username, botAlias]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());

      if (
        candidates.some(
          (name) =>
            result.includes(`${name} beat`) ||
            result.includes(`${name} won`) ||
            result.includes(`${name} wins`) ||
            result.includes(`${name} earns`)
        )
      ) {
        return player.id;
      }
    }
    return null;
  }, [isShowingAnnouncement, holmWinPotTriggerIdGated, lastRoundResult, players]);

  // ── Forensics: Holm pot-transfer lifecycle (read-only) ──
  if (gameType === 'holm-game') {
    try {
      instrumentHolmPotRender({
        handContextId: handContextId ?? null,
        phase: String(holmDealPhaseForHand ?? 'unknown'),
        roundStatus: (roundStatus as string | null) ?? null,
        rawTriggerId: holmWinPotTriggerId ?? null,
        gatedTriggerId: holmWinPotTriggerIdGated ?? null,
        winnerPlayerId: winnerPlayerId ?? null,
        potAmount: typeof holmWinPotAmount === 'number' ? holmWinPotAmount : null,
        lastRoundResultHandContextId: null,
        chuckyVisualRevealComplete,
        isShowingAnnouncement: !!isShowingAnnouncement,
        sessionPaused: !!isPaused,
        consumedTriggerId: null,
        callerFile: 'src/components/MobileGameTable.tsx',
        callerFn: 'componentBody.potRender',
      });
    } catch { /* noop */ }
  }



  // Format 3-5-7 showdown announcement based on reveal settings and whether current player stayed
  // New format from server: "WinnerName won showdown|||WINNER:id|||LOSERS:ids|||AMOUNT:x|||HANDNAME:description"
  const format357ShowdownAnnouncement = useMemo(() => {
    if (!lastRoundResult || gameType === 'holm-game') return lastRoundResult?.split('|||')[0] || '';
    
    // Check if this is a 3-5-7 showdown result (contains HANDNAME field)
    const parts = lastRoundResult.split('|||');
    const handNamePart = parts.find(p => p.startsWith('HANDNAME:'));
    
    // If no HANDNAME field, this is not a showdown result - return as-is
    if (!handNamePart) return parts[0] || '';
    
    const basePart = parts[0] || ''; // e.g., "Hap won showdown"
    const handName = handNamePart.replace('HANDNAME:', '');
    const winnerName = basePart.replace(' won showdown', '');
    
    // Case 1: reveal_at_showdown is OFF - everyone sees "(no reveal)"
    if (!revealAtShowdown) {
      return `${winnerName} won (no reveal)`;
    }
    
    // Case 2: reveal_at_showdown is ON
    // - If current player stayed, they see the detailed hand description
    // - If current player didn't stay, they see "(secret reveal)"
    if (currentPlayerStayed) {
      return `${winnerName} won with ${handName}`;
    } else {
      return `${winnerName} won showdown (secret reveal)`;
    }
  }, [lastRoundResult, gameType, revealAtShowdown, currentPlayerStayed]);

  // ── 357 announcement instrumentation ──
  const prev357AnnouncementRef = useRef<string | null>(null);
  useEffect(() => {
    // Gate to 3-5-7 only. This instrumentation was previously firing for every
    // non-holm game (Horses/SCC/Cribbage), polluting forensic queries with
    // game_type='3-5-7' rows for unrelated game types.
    if (gameType !== '3-5-7' || !gameId) return;
    // The announcement renders when: lastRoundResult is present AND (awaitingNextRound OR roundStatus completed/showdown OR allDecisionsIn)
    const announcementEligible = !!lastRoundResult && !lastRoundResult.startsWith('357_SWEEP:') &&
      !(lastRoundResult.includes('won the game')) &&
      !(threeFiveSevenWinTriggerId && lastRoundResult.includes('won a leg')) &&
      gameStatus !== 'configuring' && gameStatus !== 'ante_decision' &&
      (awaitingNextRound || roundStatus === 'completed' || roundStatus === 'showdown' || allDecisionsIn || chuckyActive);
    
    const key = `${currentRound}-${lastRoundResult?.slice(0, 20)}`;
    if (key === prev357AnnouncementRef.current) return;
    
    const tType = classify357TransitionType(lastRoundResult);
    if (announcementEligible) {
      prev357AnnouncementRef.current = key;
      persist357Investigation(gameId, 0, '357-announcement-rendered', {
        roundNumber: currentRound,
        rawLastRoundResultPresent: !!lastRoundResult,
        awaitingNextRound,
        roundStatus: roundStatus ?? null,
        renderedMessageType: lastRoundResult?.includes('|||WINNER:') ? 'showdown' : lastRoundResult?.includes('pussy tax') ? 'pussy-tax' : 'other',
        transitionType: tType,
      });
    } else if (lastRoundResult && !announcementEligible) {
      prev357AnnouncementRef.current = key;
      persist357Investigation(gameId, 0, '357-announcement-skipped', {
        roundNumber: currentRound,
        reason: gameStatus === 'configuring' ? 'configuring-phase' : gameStatus === 'ante_decision' ? 'ante-decision-phase' : 'eligibility-failed',
        awaitingNextRound,
        roundStatus: roundStatus ?? null,
        rawLastRoundResultPresent: !!lastRoundResult,
        transitionType: tType,
      });
    }
  }, [gameId, gameType, lastRoundResult, awaitingNextRound, roundStatus, allDecisionsIn, chuckyActive, gameStatus, currentRound, threeFiveSevenWinTriggerId]);

  // ── Phase 4: Canonical gameplay announcement emits ────────────────────────
  // Migration of the legacy MobileGameTable gold plate (`announcementFallback`)
  // to shell-owned semantic emits. Renderer in
  // `canonicalShell/announcements/renderers.tsx` produces the visible plate;
  // this surface only emits.
  //
  // Scope: dealerGameId/roundId left as gameId/handContextId so events scope
  // to the active hand and are torn down on hand boundary by the provider.
  const announcements = useAnnouncements();

  // (A) Horses / SCC turn announcement → peg_notice (transient).
  const lastEmittedTurnAnnouncementRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDiceGame || !horsesController.enabled) return;
    const text = horsesController.turnAnnouncement;
    if (!text) return;
    const key = `${gameId ?? 'no-game'}:${horsesController.gamePhase ?? 'unk'}:${text}`;
    if (lastEmittedTurnAnnouncementRef.current === key) return;
    lastEmittedTurnAnnouncementRef.current = key;
    announcements.emit({
      id: `peg:${key}`,
      type: 'peg_notice',
      scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
      payload: { title: text, kind: 'horses_turn' },
      ttlMs: 2500,
    });
  }, [isDiceGame, horsesController.enabled, horsesController.turnAnnouncement, horsesController.gamePhase, gameId, handContextId, announcements]);

  // (B + C) Holm / 3-5-7 round + game-over result plate →
  //   round_win (transient, mid-hand)
  //   match_win (transient, game-over, extended TTL to persist through overlays)
  // Retired-text latch (game-scoped). Once a lastRoundResult value has been
  // emitted (or short-circuited as owned by an overlay) for the current
  // gameId, it MUST NOT re-emit when identity advances (handContextId /
  // currentRound bump, new cards arrive, overlay suppression drops, etc.).
  // Key intentionally OMITS handContextId / currentRound so identity churn
  // cannot re-key a stale result. Latch resets when gameId changes.
  const lastEmittedResultRef = useRef<string | null>(null);
  const retiredResultTextsRef = useRef<{ gameId: string | null; texts: Set<string> }>({ gameId: null, texts: new Set() });
  // Whenever the raw lastRoundResult value changes, retire the prior value
  // so it can never re-emit even if it briefly reappears under new identity.
  const prevRawResultRef = useRef<string | null>(null);
  useEffect(() => {
    const currentGameId = gameId ?? null;
    if (retiredResultTextsRef.current.gameId !== currentGameId) {
      retiredResultTextsRef.current = { gameId: currentGameId, texts: new Set() };
      prevRawResultRef.current = null;
    }
    const prev = prevRawResultRef.current;
    if (prev && prev !== lastRoundResult) {
      retiredResultTextsRef.current.texts.add(prev);
    }
    prevRawResultRef.current = lastRoundResult ?? null;
  }, [gameId, lastRoundResult]);
  useEffect(() => {
    if (isDiceGame) return; // dice games handled separately below
    if (!lastRoundResult) return;
    if (lastRoundResult.startsWith('357_SWEEP:')) return; // sweep overlay owns it
    // 3-5-7 leg/game-win overlays own these messages — suppress rail.
    // 3-5-7 LEG win overlay (LegEarnedAnimation) owns the "won a leg" text —
    // suppress rail and retire it. GAME-WIN ("won the game") is intentionally
    // NOT suppressed: the canonical match_win emit drives the shell-owned
    // CanonicalCelebrationLayer (confetti) and the lifecycle rail winner
    // plate, while the bespoke 3-5-7 win sequence (LegsToPlayer → PotToPlayer
    // → tabled winner cards) plays underneath. This restores the intended
    // pot-won → sweep → announcement → celebration → chip transfer sequence.
    const isLegWin = gameType !== 'holm-game' && !!threeFiveSevenWinTriggerId && lastRoundResult.includes('won a leg');
    if (isLegWin) {
      // Overlay owns this text — retire it so the rail never re-emits it
      // when the overlay suppression flag drops on a later identity tick.
      if (lastRoundResult) retiredResultTextsRef.current.texts.add(lastRoundResult);
      return;
    }
    // Don't surface stale result during setup phases for a new hand.
    if (gameStatus === 'configuring' || gameStatus === 'ante_decision') return;
    // Holm: gate until community card 4 and solo-Chucky visual reveal finish flipping.
    if (gameType === 'holm-game' && (!holmCommunityFullyRevealed || !chuckyVisualRevealComplete)) return;

    const isResultEligible =
      isGameOver ||
      awaitingNextRound ||
      roundStatus === 'completed' ||
      roundStatus === 'showdown' ||
      allDecisionsIn ||
      (gameType === 'holm-game' ? chuckyVisualRevealComplete && chuckyActive : chuckyActive);
    if (!isResultEligible) return;

    const projectedText =
      gameType !== 'holm-game' && lastRoundResult.includes('beat Chucky')
        ? '🏆 Game Complete!'
        : gameType !== 'holm-game'
          ? format357ShowdownAnnouncement
          : lastRoundResult.split('|||')[0];
    if (!projectedText) return;

    const kind = isGameOver ? 'match' : 'round';
    // Game-scoped dedupe: identity churn (handContextId / currentRound) is
    // intentionally NOT part of the key. A given projectedText emits once
    // per game, then is retired.
    const key = `${gameId ?? 'no-game'}:${kind}:${projectedText}`;
    if (lastEmittedResultRef.current === key) return;
    if (retiredResultTextsRef.current.texts.has(lastRoundResult)) return;
    lastEmittedResultRef.current = key;
    retiredResultTextsRef.current.texts.add(lastRoundResult);

    if (isGameOver) {
      announcements.clearAmbient();
      announcements.emit({
        id: `match_win:${key}`,
        type: 'match_win',
        scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
        payload: { text: projectedText, gameType: gameType ?? undefined },
        // Persist through chip transfer / pot animation overlays.
        ttlMs: 10000,
      });
    } else {
      announcements.emit({
        id: `round_win:${key}`,
        type: 'round_win',
        scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
        payload: { text: projectedText, gameType: gameType ?? undefined },
        ttlMs: 3000,
      });
    }
  }, [
    isDiceGame, lastRoundResult, gameType, threeFiveSevenWinTriggerId, threeFiveSevenWinPhase,
    gameStatus, holmCommunityFullyRevealed, isGameOver, awaitingNextRound, roundStatus,
    allDecisionsIn, chuckyActive, chuckyVisualRevealComplete, format357ShowdownAnnouncement, gameId, handContextId,
    currentRound, announcements,
  ]);

  // Horses / SCC game-over result → match_win.
  useEffect(() => {
    if (!isDiceGame) return;
    if (!isGameOver) return;
    if (!lastRoundResult) return;
    const projected = lastRoundResult.split('|||')[0];
    if (!projected) return;
    const key = `${gameId ?? 'no-game'}:dice-match:${projected}`;
    if (lastEmittedResultRef.current === key) return;
    if (retiredResultTextsRef.current.texts.has(lastRoundResult)) return;
    lastEmittedResultRef.current = key;
    retiredResultTextsRef.current.texts.add(lastRoundResult);
    announcements.clearAmbient();
    announcements.emit({
      id: `match_win:${key}`,
      type: 'match_win',
      scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
      payload: { text: projected, gameType: gameType ?? undefined },
      ttlMs: 10000,
    });
  }, [isDiceGame, isGameOver, lastRoundResult, gameId, handContextId, gameType, announcements]);

  // Horses / SCC tie-rollover → peg_notice ("One tie, all tie").
  // Tie rollovers don't end the game (no match_win); surface a transient
  // semantic announcement so players see why the hand re-anted instead
  // of silently re-dealing.
  const lastEmittedDiceTieRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDiceGame) return;
    if (isGameOver) return;
    if (!lastRoundResult) return;
    if (!/tie/i.test(lastRoundResult)) return;
    const key = `${gameId ?? 'no-game'}:${handContextId ?? 'no-hand'}:dice-tie:${lastRoundResult}`;
    if (lastEmittedDiceTieRef.current === key) return;
    lastEmittedDiceTieRef.current = key;
    announcements.emit({
      id: `peg:${key}`,
      type: 'peg_notice',
      scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
      payload: { title: 'One tie, all tie', kind: 'tie-rollover' },
      ttlMs: 2500,
    });
  }, [isDiceGame, isGameOver, lastRoundResult, gameId, handContextId, announcements]);

  // (D) 3-5-7 re-ante message → peg_notice.
  const lastEmittedReAnteRef = useRef<string | null>(null);
  useEffect(() => {
    if (!reAnteMessage) return;
    const key = `${gameId ?? 'no-game'}:${handContextId ?? 'no-hand'}:reante:${reAnteMessage}`;
    if (lastEmittedReAnteRef.current === key) return;
    lastEmittedReAnteRef.current = key;
    announcements.emit({
      id: `peg:${key}`,
      type: 'peg_notice',
      scope: { dealerGameId: gameId ?? null, roundId: handContextId ?? null },
      payload: { title: reAnteMessage, kind: 'reante' },
      ttlMs: 2000,
    });
  }, [reAnteMessage, gameId, handContextId, announcements]);
  // ── End Phase 4 emits ─────────────────────────────────────────────────────



  // Check if current player is the winner (for dimming logic)
  const isCurrentPlayerWinner = winnerPlayerId === currentPlayer?.id;

  // HOLM: If the current player is the solo-vs-Chucky player, keep their cards "tabled" on the felt
  // through the win/payout sequence (hide from bottom section to prevent the "snap back" effect).
  // CRITICAL: Also check holmWinPotTriggerId - if pot animation is active, keep cards tabled for the winner
  // to prevent brief re-population during win celebration.
  const isCurrentPlayerSoloVsChucky =
    gameType === 'holm-game' &&
    !!currentPlayer &&
    (
      // Case 1: Normal solo-vs-Chucky flow
      (isSoloVsChucky &&
        (soloVsChuckyPlayerIdLocked
          ? soloVsChuckyPlayerIdLocked === currentPlayer.id
          : winnerPlayerId
            ? winnerPlayerId === currentPlayer.id
            : currentPlayer.current_decision === 'stay')) ||
      // Case 2: During pot-to-player animation, keep winner's cards tabled even if isSoloVsChucky briefly flickers
      (holmWinPotTriggerIdGated && winnerPlayerId === currentPlayer.id)
    );

  // Get winner's cards for highlighting (winner may be current player or another player)
  // ALSO provide cards when holmWinPotTriggerId is set (for tabling winner cards during animation)
  const winnerCards = useMemo(() => {
    const shouldDeriveCards = isShowingAnnouncement || holmWinPotTriggerIdGated;
    if (!winnerPlayerId || !shouldDeriveCards) return [];
    if (winnerPlayerId === currentPlayer?.id) {
      return currentPlayerCards;
    }
    // Find winner's cards from playerCards
    const winnerCardData = playerCards.find(pc => pc.player_id === winnerPlayerId);
    return winnerCardData?.cards || [];
  }, [winnerPlayerId, isShowingAnnouncement, holmWinPotTriggerIdGated, currentPlayer?.id, currentPlayerCards, playerCards]);

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
    if (gameType === 'holm-game' && !chuckyVisualRevealComplete) return;
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
  }, [lastRoundResult, gameType, currentPlayer, currentUserId, chuckyVisualRevealComplete]);

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

  // BUCK'S ON YOU — SINGLE OWNER. Consumes ONLY the server-authored
  // `buckTransferPresentation` event written in the same DB transaction
  // that mutates `games.buck_position`. No HCI/phase/position derivation.
  // Latched on event.id. Stale sessions, duplicate IDs, non-server source,
  // and recipient!=self are rejected silently (no violation spam).
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    const ev = buckTransferPresentation;
    if (!ev || !ev.id) return;

    const selfPos = currentPlayer && typeof currentPlayer.position === 'number'
      ? currentPlayer.position : null;
    const sessionId = (currentPlayer as { game_id?: string } | null | undefined)?.game_id ?? null;

    // Session scope
    if (sessionId && ev.sessionId && ev.sessionId !== sessionId) {
      recordBucksForensic('SHOW_SUPPRESSED', {
        predicate: 'session-mismatch', eventId: ev.id, evSession: ev.sessionId, selfSession: sessionId,
      });
      return;
    }
    // Source authority
    if (ev.source !== 'SERVER_BUCK_TRANSFER') {
      recordBucksViolation('HOLM_BUCKS_OVERLAY_EVENT_SOURCE_NOT_SERVER', {
        eventId: ev.id, source: ev.source,
      });
      return;
    }
    // Duplicate latch
    if (buckOverlayFiredEventIdRef.current === ev.id) {
      return;
    }
    // Recipient must be self
    if (selfPos == null || ev.toPosition !== selfPos) {
      recordBucksForensic('SERVER_BUCK_TRANSFER_RECEIVED', {
        eventId: ev.id, fromPosition: ev.fromPosition, toPosition: ev.toPosition,
        selfPosition: selfPos, recipientIsSelf: false,
      });
      return;
    }

    // Authoritative: latch event id as PENDING. Promotion to active
    // (visible overlay) waits for prior-hand teardown boundary.
    buckOverlayFiredEventIdRef.current = ev.id;
    recordBucksForensic('SERVER_BUCK_TRANSFER_RECEIVED', {
      eventId: ev.id, fromPosition: ev.fromPosition, toPosition: ev.toPosition,
      selfPosition: selfPos, recipientIsSelf: true,
    });

    setPendingBuckPresentation({ id: ev.id, hci: handContextId ?? null });
    recordBucksForensic('LATCH_SET', {
      eventId: ev.id, handContextId: handContextId ?? null,
      predicate: 'BUCKS_PENDING_AWAITING_TEARDOWN',
    });
  }, [buckTransferPresentation, gameType, currentPlayer, handContextId]);

  // BUCK'S ON YOU — promote PENDING → ACTIVE once prior-hand teardown
  // boundary is reached. Teardown = community cards no longer mounted
  // AND no in-flight result announcement. Deal is NOT blocked.
  useEffect(() => {
    if (!pendingBuckPresentation) return;
    if (showCommunityCards) return;
    if (isShowingAnnouncement) return;
    // Single-shot promotion.
    const { id, hci } = pendingBuckPresentation;
    setPendingBuckPresentation(null);
    buckOverlayGatedHciRef.current = hci;
    setActiveBuckPresentationId(id);
    notifyBucksShowGranted({ currentHandContextId: handContextId ?? null, authoritativeEventId: id });
    recordBucksForensic('SHOW_GRANTED', {
      eventId: id, handContextId: handContextId ?? null,
      predicate: 'BUCKS_OVERLAY_SHOWN_AFTER_TEARDOWN',
    });
  }, [pendingBuckPresentation, showCommunityCards, isShowingAnnouncement, handContextId]);



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
        setApprovedHandContextId(null);
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
      setApprovedHandContextId(null);
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
      
      // Brief delay before revealing cards one at a time
      const cardCount = communityCardsRevealed || 2;
      console.log('🔥🔥 [MOBILE_COMMUNITY] Setting 200ms timeout to approve round', currentRound, 'with', cardCount, 'cards');
      const capturedHandContextId = handContextId; // Capture for closure
      communityCardsDelayRef.current = setTimeout(() => {
        console.log('🔥🔥🔥🔥🔥 [MOBILE_COMMUNITY] Delay complete - approving round for display:', currentRound);
        setApprovedRoundForDisplay(currentRound); // NOW we approve this round for display
        setApprovedCommunityCards(communityCards ? [...communityCards] : null); // Cache the cards at approval time
        setApprovedHandContextId(capturedHandContextId ?? null); // Track which hand these cards belong to
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
      }, 200);
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
    setApprovedHandContextId(handContextId ?? null); // Track which hand these cards belong to
  }, [gameType, currentRound, communityCards, approvedCommunityCards, approvedRoundForDisplay, isDelayingCommunityCards, showCommunityCards, handContextId]);

  // RECOVERY: Force-approve community cards if they should be visible but aren't.
  // This catches edge cases where:
  // 1. Component remounts and lastDetectedRoundRef already equals currentRound (no "new round" trigger)
  // 2. The 1s delay timer was cancelled before completing
  // 3. Any other race condition that leaves cards stuck invisible
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    if (!currentRound) return;
    if (isDealerConfigPhase) return;
    if (awaitingNextRound) return;
    if (isDelayingCommunityCards) return; // delay is active, don't interfere
    if (showCommunityCards) return; // already showing, nothing to recover
    
    const liveLen = communityCards?.length ?? 0;
    if (liveLen === 0) return; // no cards to show yet
    
    // If we have live community cards but showCommunityCards is false AND we're not in a delay,
    // the approval logic failed somewhere. Force-approve after a short grace period.
    const recoveryTimeout = setTimeout(() => {
      // Re-check conditions inside timeout (they may have changed)
      if (!showCommunityCards && !isDelayingCommunityCards && communityCards && communityCards.length > 0) {
        console.warn('🔥🔥🔥 [MOBILE_COMMUNITY] RECOVERY: Force-approving community cards that were stuck invisible', {
          currentRound,
          lastDetectedRound: lastDetectedRoundRef.current,
          liveLen: communityCards.length,
          approvedRoundForDisplay,
        });
        
        lastDetectedRoundRef.current = currentRound;
        setApprovedRoundForDisplay(currentRound);
        setApprovedCommunityCards([...communityCards]);
        setApprovedHandContextId(handContextId ?? null);
        setShowCommunityCards(true);
        setStaggeredCardCount(communityCardsRevealed || 2);
        setIsDelayingCommunityCards(false);
      }
    }, 1500); // Wait 1.5s to give normal flow time to complete
    
    return () => clearTimeout(recoveryTimeout);
  }, [gameType, currentRound, communityCards, showCommunityCards, isDelayingCommunityCards, isDealerConfigPhase, awaitingNextRound, handContextId, communityCardsRevealed, approvedRoundForDisplay]);

  // HOLM: Track when community card 4 flip animation has completed.
  // CommunityCards.tsx applies a 1500ms delay to the last card in a batch flip.
  // Gate the result announcement on this to prevent it appearing before card 4 is visible.
  useEffect(() => {
    if (gameType !== 'holm-game') {
      setHolmCommunityFullyRevealed(true); // Non-Holm: no gate
      return;
    }
    
    const revealed = communityCardsRevealed ?? 0;
    if (revealed >= 4) {
      // Card 4 flip animation takes 1500ms in CommunityCards.tsx; add 200ms buffer
      if (holmRevealTimerRef.current) clearTimeout(holmRevealTimerRef.current);
      holmRevealTimerRef.current = setTimeout(() => {
        setHolmCommunityFullyRevealed(true);
        holmRevealTimerRef.current = null;
      }, 1700);
    } else {
      // Not yet at 4 cards - reset gate
      setHolmCommunityFullyRevealed(false);
      if (holmRevealTimerRef.current) { clearTimeout(holmRevealTimerRef.current); holmRevealTimerRef.current = null; }
    }
    
    return () => {
      if (holmRevealTimerRef.current) { clearTimeout(holmRevealTimerRef.current); holmRevealTimerRef.current = null; }
    };
  }, [gameType, communityCardsRevealed]);

  // Cache Chucky cards when available, clear only when buck passes or new game starts.
  // NOTE: cachedChuckyCardsRevealed is the LOCAL rendered count, advanced by the
  // sequential stepper effect below. Here we only update the TARGET ref, never the
  // rendered count directly (which would let target jumps like 0→2 show both cards
  // simultaneously under jittered/coalesced snapshots).
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    // CALLGRAPH: identity churn audit. If chuckyCards is a NEW array reference
    // but contents are unchanged, the parent is churning the prop identity which
    // re-runs this effect → setCachedChuckyCards([...]) → new cachedChuckyCards
    // identity → stepper effect re-arms → cleanup clears timeout before fire.
    {
      const contents = chuckyCards ? chuckyCards.map((c: any) => `${c?.rank}${c?.suit}`).join('|') : '';
      const prev = chuckyCardsPropIdentityRef.current;
      const refChanged = !prev || prev.ref !== chuckyCards;
      const contentsChanged = !prev || prev.contents !== contents;
      if (refChanged) {
        recordHolmTimelineEvent('CHUCKY_CACHE_EFFECT_ENTER', {
          renderSeq: chuckyRenderSeqRef.current,
          instanceId: chuckyInstanceIdRef.current,
          chuckyCardsRefChanged: refChanged,
          chuckyCardsContentsChanged: contentsChanged,
          identityChurn: refChanged && !contentsChanged,
          prevRenderSeq: prev?.renderSeq ?? null,
          contentsLen: chuckyCards?.length ?? 0,
          chuckyActive,
          handContextId: handContextId ?? null,
        }, handContextId ?? null);
        chuckyCardsPropIdentityRef.current = { ref: chuckyCards, contents, renderSeq: chuckyRenderSeqRef.current };
      }
    }

    
    // CRITICAL: Clear cached Chucky cards when entering dealer config phases
    if (isDealerConfigPhase) {
      if (cachedChuckyCards && cachedChuckyCards.length > 0) {
        console.log('[MOBILE_CHUCKY] Dealer config phase - clearing cached Chucky cards');
        setCachedChuckyCards(null, { writer: 'cacheEffect.dealerConfigPhase', reason: 'dealer-config phase entered' });
        setCachedChuckyActive(false);
        setCachedChuckyCardsRevealed(0, { writer: 'cacheEffect.dealerConfigPhase', reason: 'dealer-config phase entered' });
        clearChuckyRevealOwnership('cacheEffect.dealerConfigPhase', 'dealer-config phase entered');
      }
      return;
    }
    
    // CRITICAL: Clear cached Chucky cards when handContextId changes (new hand started)
    if (
      cachedChuckyHandContextRef.current !== null &&
      handContextId !== null &&
      cachedChuckyHandContextRef.current !== handContextId
    ) {
      console.log('[MOBILE_CHUCKY] handContextId changed - clearing stale Chucky cache', {
        prev: cachedChuckyHandContextRef.current,
        next: handContextId,
      });
      setCachedChuckyCards(null, { writer: 'cacheEffect.handContextChanged', reason: 'handContextId changed (stale cache clear)' });
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0, { writer: 'cacheEffect.handContextChanged', reason: 'handContextId changed (stale cache clear)' });
      clearChuckyRevealOwnership('cacheEffect.handContextChanged', 'handContextId changed (stale cache clear)');
      return;
    }
    
    // When buck passes (awaitingNextRound AND no result), clear cached Chucky data
    if (awaitingNextRound && !lastRoundResult) {
      console.log('[MOBILE_CHUCKY] Buck passed - clearing cached Chucky cards');
      setCachedChuckyCards(null, { writer: 'cacheEffect.buckPassed', reason: 'awaitingNextRound && !lastRoundResult' });
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0, { writer: 'cacheEffect.buckPassed', reason: 'awaitingNextRound && !lastRoundResult' });
      clearChuckyRevealOwnership('cacheEffect.buckPassed', 'awaitingNextRound && !lastRoundResult');
      return;
    }
    
    // Cache Chucky data when it's available AND track which hand it belongs to.
    // GUARD: require non-null handContextId — never cache without authoritative
    // hand identity (prevents stale renders after hand completes).
    if (chuckyActive && chuckyCards && chuckyCards.length > 0 && handContextId !== null) {
      if (cachedChuckyHandContextRef.current === null || cachedChuckyHandContextRef.current === handContextId) {
        // IDENTITY-PRESERVING WRITE: bail out early if incoming chuckyCards have
        // identical contents AND belong to the same handContextId as what we've
        // already cached. Without this, every parent render produces a new
        // `chuckyCards` array reference → this effect re-runs →
        // `setCachedChuckyCards([...chuckyCards])` churns the cached identity →
        // the reveal stepper re-arms and its cleanup clears the pending timeout
        // BEFORE it fires.
        const incomingHash = chuckyCards.map((c: any) => `${c?.rank}${c?.suit}`).join('|');
        const cachedHash = cachedChuckyCards ? cachedChuckyCards.map((c: any) => `${c?.rank}${c?.suit}`).join('|') : '';
        const sameContents =
          cachedChuckyCards != null &&
          cachedChuckyCards.length === chuckyCards.length &&
          incomingHash === cachedHash;
        const sameHand = cachedChuckyHandContextRef.current === handContextId;

        if (sameContents && sameHand) {
          // No-op: preserve cached array identity so the reveal stepper effect
          // stays stable. Still advance the monotonic target.
          const newTarget = chuckyCardsRevealed || 0;
          if (newTarget > chuckyTargetRevealedRef.current) {
            chuckyTargetRevealedRef.current = newTarget;
          }
          return;
        }

        // Holm v3 narrow fix: forbid shrinking an established Chucky cache
        // while the normal reveal is locked. A partial incoming payload of
        // fewer cards than the established cached set would otherwise let
        // the stepper terminate early (idx === incomingLen) and never arm
        // the final card. Reject the write and preserve the larger array.
        const existingCached = cachedChuckyCardsLiveRef.current;
        const existingLen = existingCached?.length ?? 0;
        if (
          chuckyNormalRevealBranchLockedRef.current &&
          existingLen > 0 &&
          chuckyCards.length < existingLen
        ) {
          const existingHashLocal = existingCached
            ? existingCached.map((c: any) => `${c?.rank}${c?.suit}`).join('|')
            : '';
          recordHolmTimelineEvent('HOLM_CHUCKY_CACHE_SHRINK_REJECTED', {
            writer: 'cacheEffect.cachePath',
            handContextId: handContextId ?? null,
            existingLength: existingLen,
            incomingLength: chuckyCards.length,
            existingHash: existingHashLocal,
            incomingHash,
            visualRevealCount,
            requiredRevealCount,
          }, handContextId ?? null);
          console.warn('[MOBILE_CHUCKY] Rejected cache shrink during locked reveal:', {
            existingLen, incomingLen: chuckyCards.length,
          });
          return;
        }

        recordHolmTimelineEvent('CHUCKY_CACHE_SET_CARDS', {
          renderSeq: chuckyRenderSeqRef.current,
          instanceId: chuckyInstanceIdRef.current,
          writer: 'cacheEffect.cachePath',
          chuckyCardsLen: chuckyCards.length,
          alreadyCachedLen: cachedChuckyCards?.length ?? 0,
          willCreateNewArrayIdentity: true,
          sameContents,
          sameHand,
          handContextId: handContextId ?? null,
        }, handContextId ?? null);
        console.log('[MOBILE_CHUCKY] Caching Chucky cards:', chuckyCards.length, 'for hand:', handContextId);
        setCachedChuckyCards([...chuckyCards], { writer: 'cacheEffect.cachePath', reason: 'chuckyActive && cards available' });
        setCachedChuckyActive(true);
        const newTarget = chuckyCardsRevealed || 0;
        if (newTarget > chuckyTargetRevealedRef.current) {
          chuckyTargetRevealedRef.current = newTarget;
        }
        cachedChuckyHandContextRef.current = handContextId ?? null;

      } else {
        console.warn('[MOBILE_CHUCKY] Skipping cache - handContextId mismatch:', {
          cached: cachedChuckyHandContextRef.current,
          current: handContextId,
        });
      }
    }

    // GUARD: clear cachedChuckyActive once handContextId clears, UNLESS we are
    // still actively rendering the final reveal sequence (revealed < total).
    // Without this, cachedChuckyActive stays true after hand resolution and the
    // cache effect keeps re-running on every render.
    if (
      cachedChuckyActive &&
      handContextId === null &&
      (!cachedChuckyCards || cachedChuckyCardsRevealed >= cachedChuckyCards.length)
    ) {
      setCachedChuckyActive(false);
    }
  }, [gameType, gameStatus, chuckyActive, chuckyCards, chuckyCardsRevealed, awaitingNextRound, lastRoundResult, cachedChuckyCards, handContextId, isDealerConfigPhase, cachedChuckyActive, cachedChuckyCardsRevealed, clearChuckyRevealOwnership]);

  // Chucky reveal BARRIER: hold all reveals until every chucky card has
  // settled (DealRuntime enters GAMEPLAY → markHolmHandReady). Once the
  // barrier trips, force-reveal all 4 in a fast sequence regardless of
  // the authoritative chuckyCardsRevealed counter — animation contract
  // requires sequential reveal, not per-card settled callbacks.
  const [holmBarrierTick, setHolmBarrierTick] = useState(0);
  useEffect(() => subscribeHolmHandReady(() => setHolmBarrierTick(t => t + 1)), []);
  // Chucky-specific barrier (audit RC3). isHolmHandReady can be satisfied by
  // the hands/community waves alone in some paths; the visual stepper must
  // additionally require that the chucky wave's expected cards are ALL
  // settled for THIS handContextId and that the local cache matches.
  const chuckyBarrierOpen =
    gameType === 'holm-game' &&
    !!handContextId &&
    isHolmHandReady(handContextId) &&
    holmDealMetaSnap.handContextId === handContextId &&
    holmDealMetaSnap.chuckyExpected > 0 &&
    holmDealMetaSnap.chuckySettled >= holmDealMetaSnap.chuckyExpected &&
    cachedChuckyHandContextRef.current === handContextId &&
    !!cachedChuckyCards &&
    cachedChuckyCards.length >= holmDealMetaSnap.chuckyExpected;
  void holmBarrierTick; // re-evaluates above on barrier flip

  // War-time forensics: hook the barrier flip → allChuckySettled marker.
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    if (!chuckyBarrierOpen) return;
    chuckyVisualMarkAllSettled(handContextId ?? null);
  }, [gameType, chuckyBarrierOpen, handContextId]);

  // War-time forensics: announcement visibility → barrier marker.
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    chuckyVisualMarkAnnouncement(
      handContextId ?? null,
      !!isShowingAnnouncement,
      typeof lastRoundResult === 'string' ? lastRoundResult : null,
    );
  }, [gameType, isShowingAnnouncement, handContextId, lastRoundResult]);

  // WAR-TIME AUDIT: capture which dep triggers effect cleanup before timeout fires.
  // chuckyInstanceIdRef is declared above (next to setCachedChuckyCardsRevealed).
  // effectInstance: incremented each time the chucky stepper effect ENTERS, so
  // we can distinguish:
  //   CASE A (remount): MOUNT#1→ARM→UNMOUNT→MOUNT#2→ARM
  //   CASE B (effect re-run): MOUNT#1→ARM→CLEANUP→ARM→CLEANUP→ARM
  const chuckyEffectInstanceRef = useRef(0);
  const chuckyEffectIdRef = useRef(0);
  const chuckyComponentUnmountingRef = useRef(false);
  const chuckyLatestRevealDepsRef = useRef<Record<string, unknown> | null>(null);
  const chuckyRevealDepSnapshot: Record<string, unknown> = {
    cachedChuckyCardsRef: __chuckyAuditRefId(cachedChuckyCards),
    cachedChuckyCardsContentsHash: __chuckyAuditCardsHash(cachedChuckyCards),
    cachedChuckyCardsRevealed,
    cachedChuckyActive,
    cachedChuckyHandContextId: cachedChuckyHandContextRef.current ?? null,
    handContextId: handContextId ?? null,
    phase: roundStatus ?? null,
    announcementShowing: !!isShowingAnnouncement,
    soloVsChuckyTableLocked: !!soloVsChuckyTableLocked,
    gameType,
    chuckyCardsRevealed,
    chuckyBarrierOpen,
    cachedChuckyCardsLength: cachedChuckyCards?.length ?? 0,
    isSoloVsChuckyRaw: !!isSoloVsChuckyRaw,
    chuckyActive: !!chuckyActive,
  };
  chuckyLatestRevealDepsRef.current = chuckyRevealDepSnapshot;
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    recordHolmTimelineEvent('CHUCKY_RENDER_TREE', {
      instanceId: chuckyInstanceIdRef.current,
      renderSeq: chuckyRenderSeqRef.current,
      mounted: true,
      owners: {
        chuckyStage: cachedChuckyActive && cachedChuckyCards && cachedChuckyCards.length > 0 ? 'MobileGameTable.holmChuckyStage' : null,
        cachedChuckyCards: 'MobileGameTable.useState(cachedChuckyCards)',
        cachedChuckyCardsRevealed: 'MobileGameTable.useState(cachedChuckyCardsRevealed)',
        revealEffect: 'MobileGameTable.ChuckyRevealStepperEffect',
      },
      cachedChuckyCardsRef: __chuckyAuditRefId(cachedChuckyCards),
      cachedChuckyCardsContentsHash: __chuckyAuditCardsHash(cachedChuckyCards),
      cachedChuckyCardsCount: cachedChuckyCards?.length ?? 0,
      cachedChuckyCardsRevealed,
      cachedChuckyActive,
      handContextId: handContextId ?? null,
      cachedChuckyHandContextId: cachedChuckyHandContextRef.current ?? null,
      phase: roundStatus ?? null,
      announcementShowing: !!isShowingAnnouncement,
      soloVsChuckyTableLocked: !!soloVsChuckyTableLocked,
    }, handContextId ?? null);
  });
  // Component MOUNT / UNMOUNT (per MobileGameTable instance).
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    chuckyComponentUnmountingRef.current = false;
    const instanceId = chuckyInstanceIdRef.current;
    recordHolmTimelineEvent('CHUCKY_COMPONENT_MOUNT', {
      instanceId,
      handContextId: handContextIdRef.current ?? null,
      cachedChuckyCardsIdentity: null,
      cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
    }, handContextIdRef.current ?? null);
    return () => {
      chuckyComponentUnmountingRef.current = true;
      const componentStack = captureStack();
      const ownerStack = __chuckyAuditOwnerStack();
      recordHolmTimelineEvent('CHUCKY_COMPONENT_UNMOUNT', {
        instanceId,
        handContextId: handContextIdRef.current ?? null,
        cachedChuckyCardsRevealed: lastChuckyRevealedRef.current,
        componentStack,
        ownerStack,
      }, handContextIdRef.current ?? null);
      recordHolmTimelineEvent('CHUCKY_RENDER_TREE', {
        instanceId,
        renderSeq: chuckyRenderSeqRef.current,
        mounted: false,
        owners: {
          chuckyStage: null,
          cachedChuckyCards: 'MobileGameTable.useState(cachedChuckyCards)',
          cachedChuckyCardsRevealed: 'MobileGameTable.useState(cachedChuckyCardsRevealed)',
          revealEffect: 'MobileGameTable.ChuckyRevealStepperEffect',
        },
        why: 'MobileGameTable component unmount cleanup',
        componentStack,
        ownerStack,
      }, handContextIdRef.current ?? null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ──────────────────────────────────────────────────────────────────
  // CHUCKY REVEAL SCHEDULER — latched presentation transaction
  //
  // Once started for a handContextId, this loop must finish every configured
  // visual reveal. Server completion / result / announcement / win state may
  // observe it only; those states must not be dependencies that tear down the
  // pending timeout before the next visible increment.
  // ──────────────────────────────────────────────────────────────────
  const chuckyEffectDepsRef = useRef<Record<string, unknown> | null>(null);
  const chuckyEffectTimeoutSeqRef = useRef(0);
  const chuckyRevealLoopHandRef = useRef<string | null>(null);
  const chuckyRevealLoopCancelRef = useRef<((reason: string) => void) | null>(null);
  const totalLenForReveal = cachedChuckyCards?.length ?? 0;
  useEffect(() => {
    const enterDeps = { gameType, chuckyBarrierOpen, handContextId, totalLenForReveal };
    const changedSinceLastEnter = __chuckyAuditDiffDeps(chuckyEffectDepsRef.current, enterDeps);
    if (changedSinceLastEnter) {
      chuckyVisualStepperLastDepChangeRef.current = changedSinceLastEnter;
    }
    chuckyEffectDepsRef.current = enterDeps;

    if (chuckyRevealLoopHandRef.current && handContextId && chuckyRevealLoopHandRef.current !== handContextId) {
      chuckyRevealLoopCancelRef.current?.('handContextId changed');
    }

    if (gameType !== 'holm-game') return;
    if (!chuckyBarrierOpen) return;
    if (!handContextId) return;
    if (totalLenForReveal <= 0) return;
    // Guard: never restart reveal loop within the same hand.
    if (chuckyRevealLoopHandRef.current === handContextId) return;
    chuckyRevealLoopHandRef.current = handContextId;

    const effectId = ++chuckyEffectIdRef.current;
    const mountAt = __chuckyAuditNow();
    const effectInstance = ++chuckyEffectInstanceRef.current;
    const instanceId = chuckyInstanceIdRef.current;
    const enterRenderSeq = chuckyRenderSeqRef.current;
    chuckyVisualStepperMountedRef.current = true;
    chuckyVisualStepperLastCleanupReasonRef.current = null;
    chuckyVisualStepperLastDepChangeRef.current = changedSinceLastEnter;

    if (chuckyTargetRevealedRef.current < totalLenForReveal) {
      chuckyTargetRevealedRef.current = totalLenForReveal;
    }

    recordHolmTimelineEvent('CHUCKY_EFFECT_INSTANCE', {
      instanceId, effectId, effectInstance, mountAt, cleanupAt: null,
      reason: 'MOUNT', renderSeqAtMount: enterRenderSeq,
      renderSeqAtCleanup: null, timeoutId: null, firedBeforeCleanup: null,
    }, handContextId);
    recordHolmTimelineEvent('CHUCKY_EFFECT_ENTER', {
      instanceId, effectId, effectInstance, mountAt,
      renderSeq: enterRenderSeq, handContextId,
      deps: enterDeps,
      changedSinceLastEnter,
    }, handContextId);

    chuckyVisualMarkRevealSequenceScheduled(handContextId);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancelLoop = (reason: string) => {
      if (cancelled) return;
      cancelled = true;
      if (timer) clearTimeout(timer);
      chuckyVisualStepperMountedRef.current = false;
      chuckyVisualStepperTimeoutActiveRef.current = false;
      const cleanupAt = __chuckyAuditNow();
      chuckyVisualStepperLastCleanupReasonRef.current = reason;
      recordHolmTimelineEvent('CHUCKY_EFFECT_CLEANUP', {
        instanceId, effectId, effectInstance, mountAt, cleanupAt,
        handContextId,
        reason,
        dependencyChange: chuckyVisualStepperLastDepChangeRef.current,
      }, handContextId);
      if (chuckyRevealLoopHandRef.current === handContextId) {
        chuckyRevealLoopHandRef.current = null;
      }
      if (chuckyRevealLoopCancelRef.current === cancelLoop) {
        chuckyRevealLoopCancelRef.current = null;
      }
    };
    chuckyRevealLoopCancelRef.current = cancelLoop;
    // Local monotonic counter — starts from whatever has already been
    // revealed (in case of remount after a true new-hand boundary).
    let idx = cachedChuckyCardsRevealedRef.current;

    // Holm v3 narrow fix: snapshot the reveal total ONCE for this stepper
    // session. tick() must NOT re-read mutable cachedChuckyCardsLenRef,
    // because a partial cache rewrite could otherwise shrink `total` below
    // the established reveal target and terminate the loop early (e.g.
    // idx === 3, total === 3) without arming the final card.
    const sessionRevealTotal = totalLenForReveal;

    const HOLM_REVEAL_FALLBACK_MS = 1500;

    const tick = () => {
      if (cancelled) return;
      const total = sessionRevealTotal;
      if (idx >= total) {
        recordHolmTimelineEvent('CHUCKY_REVEAL_COMPLETE', {
          instanceId, effectId, handContextId, total,
        }, handContextId);
        chuckyVisualStepperMountedRef.current = false;
        chuckyVisualStepperTimeoutActiveRef.current = false;
        if (chuckyRevealLoopCancelRef.current === cancelLoop) {
          chuckyRevealLoopCancelRef.current = null;
        }
        return;
      }
      const cfgDelay = getChuckyConfiguredStepperDelayMs(idx, total);
      const delayMs = cfgDelay.ms ?? HOLM_REVEAL_FALLBACK_MS;
      const source: 'gameDefaults' | 'fallback' =
        cfgDelay.ms != null && cfgDelay.source === 'gameDefaults' ? 'gameDefaults' : 'fallback';
      const timeoutSeq = ++chuckyEffectTimeoutSeqRef.current;
      const deadline = __chuckyAuditNow() + delayMs;
      chuckyVisualStepperTimeoutActiveRef.current = true;
      chuckyVisualStepperLastDeadlineRef.current = deadline;

      recordHolmTimelineEvent('CHUCKY_TIMEOUT_ARMED', {
        instanceId, effectId, effectInstance,
        renderSeq: chuckyRenderSeqRef.current, mountAt, handContextId,
        timeoutId: timeoutSeq, delay: delayMs, deadline, prev: idx, total,
      }, handContextId);
      recordChuckyRevealTimerArm({
        handContextId, delayMs, index: idx, total, delaySource: source,
      });

      timer = setTimeout(() => {
        if (cancelled) return;
        chuckyVisualStepperTimeoutActiveRef.current = false;
        idx += 1;
        recordHolmTimelineEvent('CHUCKY_TIMEOUT_FIRED', {
          instanceId, effectId, effectInstance,
          renderSeq: chuckyRenderSeqRef.current,
          armedAtRenderSeq: enterRenderSeq, mountAt, handContextId,
          timeoutId: timeoutSeq, prev: idx - 1, next: idx,
        }, handContextId);
        recordChuckyRevealStep({
          handContextId, index: idx - 1, total,
          actualDelayUsedMs: delayMs, source,
        });
        setCachedChuckyCardsRevealed(
          (prev) => (prev < idx ? idx : prev),
          { writer: 'stepper.setTimeout', reason: 'sequential reveal advance' },
        );
        tick();
      }, delayMs);
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameType, chuckyBarrierOpen, handContextId, totalLenForReveal]);

  useEffect(() => {
    return () => {
      chuckyRevealLoopCancelRef.current?.('component unmount');
    };
  }, []);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    if (!handContextId) return;
    if (visualRevealCount >= requiredRevealCount) return;
    if (!chuckyVisualStepperMountedRef.current) return;
    const deadline = chuckyVisualStepperLastDeadlineRef.current;
    if (deadline == null) return;

    const fireAt = deadline + 250;
    const waitMs = Math.max(0, fireAt - __chuckyAuditNow());
    const handle = window.setTimeout(() => {
      if (visualRevealCount >= requiredRevealCount) return;
      if (!chuckyVisualStepperMountedRef.current) return;
      if (__chuckyAuditNow() < fireAt) return;
      const stallKey = `${handContextId}|${visualRevealCount}|${requiredRevealCount}|${Math.round(deadline)}`;
      if (chuckyVisualStepperStallKeyRef.current === stallKey) return;
      chuckyVisualStepperStallKeyRef.current = stallKey;
      recordHolmTimelineEvent('HOLM_CHUCKY_VISUAL_STEPPER_STALLED', {
        handContextId,
        visualRevealCount,
        requiredRevealCount,
        roundStatus: roundStatus ?? null,
        serverRevealCount: chuckyCardsRevealed ?? 0,
        stepperMounted: chuckyVisualStepperMountedRef.current,
        timeoutActive: chuckyVisualStepperTimeoutActiveRef.current,
        rafActive: false,
        lastScheduledDeadline: deadline,
        cleanupReason: chuckyVisualStepperLastCleanupReasonRef.current,
        effectDependencyChangeThatCanceledOrRestartedIt: chuckyVisualStepperLastDepChangeRef.current,
      }, handContextId);
    }, waitMs);

    return () => window.clearTimeout(handle);
  }, [gameType, handContextId, visualRevealCount, requiredRevealCount, roundStatus, chuckyCardsRevealed]);





  // ── Holm reveal-render-boundary instrumentation (L2) ────────
  // Observe transitions in *what is rendered face-up* for community + Chucky cards
  // so we can prove whether the on-screen reveal matches the authoritative *_revealed.
  const lastRenderedCommunityRef = useRef(0);
  const lastRenderedChuckyRef = useRef(0);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    if (!gameId) return;

    const ctx: HolmSequenceContext = {
      gameId,
      roundId: handContextId ?? null,
      handNumber: currentRound ?? 0,
      stayerPlayerId: soloVsChuckyPlayerIdLocked,
    };

    // Community: rendered count = same as authoritative since CommunityCards consumes the prop directly
    const communityRendered = isDelayingCommunityCards
      ? staggeredCardCount
      : (communityCardsRevealed ?? 0);
    const communityShould = communityCardsRevealed ?? 0;

    if (communityRendered !== lastRenderedCommunityRef.current) {
      // Log only the newest transitioning card index
      const idx = Math.max(0, communityRendered - 1);
      logRevealRenderFrame(ctx, {
        cardType: 'community',
        cardIndex: idx,
        shouldBeFaceUp: idx < communityShould,
        actuallyRenderedFaceUp: idx < communityRendered,
        renderOrderStep: 0, // assigned inside logger
        extra: {
          communityRendered,
          communityShould,
          isDelayingCommunityCards,
          staggeredCardCount,
        },
      });
      lastRenderedCommunityRef.current = communityRendered;
    }

    // Chucky: rendered count = cachedChuckyCardsRevealed (drives the inline DOM)
    const chuckyRendered = cachedChuckyCardsRevealed;
    const chuckyShould = chuckyCardsRevealed ?? 0;

    if (chuckyRendered !== lastRenderedChuckyRef.current) {
      const idx = Math.max(0, chuckyRendered - 1);
      logRevealRenderFrame(ctx, {
        cardType: 'chucky',
        cardIndex: idx,
        shouldBeFaceUp: idx < chuckyShould,
        actuallyRenderedFaceUp: idx < chuckyRendered,
        renderOrderStep: 0,
        extra: {
          chuckyRendered,
          chuckyShould,
          cachedChuckyActive,
          cachedChuckyTotal: cachedChuckyCards?.length ?? 0,
        },
      });
      lastRenderedChuckyRef.current = chuckyRendered;
    }
  }, [
    gameType,
    gameId,
    handContextId,
    currentRound,
    soloVsChuckyPlayerIdLocked,
    communityCardsRevealed,
    isDelayingCommunityCards,
    staggeredCardCount,
    cachedChuckyCardsRevealed,
    chuckyCardsRevealed,
    cachedChuckyActive,
    cachedChuckyCards,
  ]);

  // Reset render trackers when hand context changes
  useEffect(() => {
    lastRenderedCommunityRef.current = 0;
    lastRenderedChuckyRef.current = 0;
  }, [handContextId]);

  // Detect when a player earns a leg (3-5-7 games only)
  // IMPORTANT: MobileGameTable can remount between hands/round transitions; we must NOT treat existing legs as "new" on mount.
  const legsTrackerInitializedRef = useRef(false);
  const firedLegAnimationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (gameType === 'holm-game') return;

    // CRITICAL: This component is also used as a "background table" during dealer selection / setup phases.
    // In those phases, late realtime player updates (e.g. the final leg increment) can arrive AFTER the background
    // table mounts, causing it to "re-detect" the winning leg and replay the animation.
    if (isWaitingPhase) {
      // Reset baseline so when we return to gameplay we snapshot fresh and don't animate stale transitions.
      legsTrackerInitializedRef.current = false;
      playerLegsRef.current = {};
      firedLegAnimationKeysRef.current = new Set();
      return;
    }

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
          // Mark ref SYNCHRONOUSLY to prevent race with 357 trigger fallback path
          legAnimationActiveRef.current = true;

          // Track the winning leg player for card exposure
          if (isWinningLeg) {
            console.log('[MOBILE] 🏆 FINAL LEG WON - exposing cards for:', player.id);
            setWinningLegPlayerId(player.id);
          }
        }
      }

      playerLegsRef.current[player.id] = currentLegs;
    });
  }, [players, gameType, legsToWin, isWaitingPhase]);
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

  
  // 3-5-7 win animation sequence: triggered by parent when player wins final leg.
  // IMPORTANT: Only run the full animation sequence when we're in a stable "game over" view.
  // Game.tsx swaps layouts on status transitions; if we start during in_progress we can get unmounted
  // mid-sequence and the parent trigger may already have been cleared.
  const threeFiveSevenCachedLegPositionsRef = useRef(threeFiveSevenCachedLegPositions);
  threeFiveSevenCachedLegPositionsRef.current = threeFiveSevenCachedLegPositions;

  // Stable snapshot used during the 3-5-7 win transition (prevents leg flicker if backend resets legs mid-view).
  const threeFiveSevenLegsSnapshotRef = useRef<{ playerId: string; position: number; legCount: number }[]>([]);
  
  // Legacy 3-5-7 win animation trigger from parent (kept as fallback)
  // NOTE: Primary trigger now comes from LegEarnedAnimation onComplete when isWinningLegAnimation is true
  useEffect(() => {
    // Same reasoning as above: never run win-trigger fallback logic in the dealer-selection/setup background table.
    if (isWaitingPhase) return;

    if (!threeFiveSevenWinTriggerId || threeFiveSevenWinTriggerId === lastThreeFiveSevenTriggerRef.current) {
      return;
    }

    // Skip if animation is already in progress (triggered by LegEarnedAnimation completion)
    if (threeFiveSevenWinPhaseRef.current !== 'idle') {
      console.log('[357 WIN] Trigger received but animation already in progress, phase:', threeFiveSevenWinPhaseRef.current);
      // Still mark as handled and notify parent
      lastThreeFiveSevenTriggerRef.current = threeFiveSevenWinTriggerId;
      onThreeFiveSevenWinAnimationStarted?.();
      return;
    }

    // NOTE: Removed game_over check - the animation should run for all players regardless of local game status.
    // The parent (Game.tsx) triggers this only when appropriate.

    // If the normal "leg gained" detector missed (common when legs_to_win=1 and backend resets fast),
    // force the leg-earned banner so the win moment still feels right.
    // CRITICAL: Check legAnimationActiveRef SYNCHRONOUSLY - showLegEarned state may be stale due to async batching
    // ALSO check isWinningLegAnimation state - if it's already true, the primary path already triggered
    if (!legAnimationActiveRef.current && !showLegEarned && !isWinningLegAnimation && threeFiveSevenWinnerId) {
      const winner = players.find((p) => p.id === threeFiveSevenWinnerId);
      if (winner) {
        const winnerName = winner.is_bot
          ? getBotAlias(players, winner.user_id)
          : (winner.profiles?.username || `Player ${winner.position}`);
        console.log('[LEG ANIMATION] Forcing LegEarnedAnimation from 357 trigger for winner:', winnerName);
        setLegEarnedPlayerName(winnerName);
        setLegEarnedPlayerPosition(winner.position);
        setIsWinningLegAnimation(true);
        setShowLegEarned(true);
        legAnimationActiveRef.current = true; // Mark ref to prevent any further triggers
        setWinningLegPlayerId(winner.id);
      }
    }

    // Mark as handled for this component instance.
    lastThreeFiveSevenTriggerRef.current = threeFiveSevenWinTriggerId;

    // Generate unique animation ID to track this specific sequence
    const animationId = `anim-${Date.now()}`;
    currentAnimationIdRef.current = animationId;

    // Capture leg positions at animation start (don't depend on prop changes during animation)
    const capturedLegPositions = threeFiveSevenCachedLegPositionsRef.current;

    // Lock a stable legs snapshot for the whole win sequence (prevents re-appearing legs if backend/state shifts).
    threeFiveSevenLegsSnapshotRef.current = capturedLegPositions;

    console.log('[357 WIN] Starting win animation sequence (fallback trigger), animationId:', animationId);
    console.log('[357 WIN] Using leg positions from prop:', capturedLegPositions);

    // Clear trigger in parent after starting
    onThreeFiveSevenWinAnimationStarted?.();

    // IMMEDIATELY set phase to 'waiting' so display logic uses cached values
    // This prevents the 2.6s gap where trigger is null and phase is idle
    setThreeFiveSevenWinPhase('waiting');
    threeFiveSevenWinPhaseRef.current = 'waiting';
    setLegsToPlayerTriggerId(null);
    setPotToPlayerTriggerId357(null);
    
    // Reset one-shot guards for this new animation
    legsToPlayerCompletedRef.current = null;
    potToPlayerCompletedRef.current = null;

    // Wait for leg earned animation to complete (it runs for 2.5s for winning leg)
    // Then start legs-to-player animation - reduced delay for tighter transition
    // NOTE: This is a FALLBACK path - the LegEarnedAnimation onComplete callback is the primary path
    setTimeout(() => {
      // Only proceed if this is still the current animation
      if (currentAnimationIdRef.current !== animationId) {
        console.log('[357 WIN] Stale animation (ID mismatch), skipping Phase 1');
        return;
      }
      // Only proceed if still in 'waiting' phase (not already triggered by LegEarnedAnimation callback)
      if (threeFiveSevenWinPhaseRef.current !== 'waiting') {
        console.log('[357 WIN] Already past waiting phase (LegEarnedAnimation path won), skipping Phase 1');
        return;
      }
      console.log('[357 WIN] Phase 1 (fallback path): legs-to-player, using positions:', capturedLegPositions);
      setThreeFiveSevenWinPhase('legs-to-player');
      threeFiveSevenWinPhaseRef.current = 'legs-to-player';
      setLegsToPlayerTriggerId(`legs-to-player-${Date.now()}`);
    }, 1800); // Tighter timing - start legs-to-player just after leg lands
    // NOTE: threeFiveSevenCachedLegPositions intentionally NOT in deps - we capture it via ref at animation start
    // to prevent dependency changes during animation from invalidating the animation sequence
  }, [threeFiveSevenWinTriggerId, onThreeFiveSevenWinAnimationStarted, gameStatus, isGameOver, isWaitingPhase]);

  const handleLegsToPlayerComplete = useCallback(() => {
    const animId = currentAnimationIdRef.current;
    
    // One-shot guard: only fire once per animation sequence
    if (legsToPlayerCompletedRef.current === animId) {
      return;
    }
    
    // Use ref to get current phase (avoids stale closure)
    if (threeFiveSevenWinPhaseRef.current !== 'legs-to-player') {
      return;
    }

    // Mark as completed for this animation
    legsToPlayerCompletedRef.current = animId;

    // Trigger "+XL" flash on winner's chipstack
    const totalLegs = threeFiveSevenCachedLegPositions.reduce((sum, p) => sum + p.legCount, 0);
    if (threeFiveSevenWinnerId && totalLegs > 0) {
      setWinnerLegsFlashTrigger({
        id: `legs-flash-${Date.now()}`,
        amount: totalLegs,
        playerId: threeFiveSevenWinnerId
      });
    }


    setThreeFiveSevenWinPhase('pot-to-player');
    threeFiveSevenWinPhaseRef.current = 'pot-to-player';
    // FIX: Set pot hidden flag NOW so pot stays hidden after animation completes
    setThreeFiveSevenPotHiddenUntilReset(true);
    // CRITICAL: Mark POT-OUT animation as active and set pot to 0 when animation begins
    setPotOutAnimationActive(true);
    setDisplayedPot(0);
    setPotToPlayerTriggerId357(`pot-to-player-357-${Date.now()}`);
  }, [threeFiveSevenCachedLegPositions, threeFiveSevenWinnerId, threeFiveSevenWinPotAmount, players, legsToPlayerTriggerId]);

  // Handle pot-to-player animation complete -> 300ms delay -> next game
  const handlePotToPlayerComplete357 = useCallback(() => {
    const animId = currentAnimationIdRef.current;
    

    // One-shot guard: only fire once per animation sequence
    if (potToPlayerCompletedRef.current === animId) {
      return;
    }

    // Use ref to get current phase (avoids stale closure)
    if (threeFiveSevenWinPhaseRef.current !== 'pot-to-player') {
      return;
    }

    // Mark as completed for this animation
    potToPlayerCompletedRef.current = animId;

    // Trigger "+$X" flash on winner's chipstack
    if (threeFiveSevenWinnerId && threeFiveSevenWinPotAmount > 0) {
      setWinnerPotFlashTrigger({
        id: `pot-flash-${Date.now()}`,
        amount: threeFiveSevenWinPotAmount,
        playerId: threeFiveSevenWinnerId
      });
    }

    
    setThreeFiveSevenWinPhase('delay');
    threeFiveSevenWinPhaseRef.current = 'delay';

    // Capture current animation ID
    const animationId = currentAnimationIdRef.current;

    // 300ms delay before proceeding to next game
    setTimeout(() => {

      // Only complete if this is still the current animation
      if (currentAnimationIdRef.current !== animationId) {
        return;
      }


      setThreeFiveSevenWinPhase('idle');
      threeFiveSevenWinPhaseRef.current = 'idle';
      setPotOutAnimationActive(false); // Clear POT-OUT flag
      setLegsToPlayerTriggerId(null);
      setPotToPlayerTriggerId357(null);

      if (onThreeFiveSevenWinAnimationComplete) {
        onThreeFiveSevenWinAnimationComplete();
      }
    }, 300);
  }, [onThreeFiveSevenWinAnimationComplete, threeFiveSevenWinnerId, threeFiveSevenWinPotAmount, potToPlayerTriggerId357]);

  // ── Canonical seat contract (PR-B: single-path collapse) ──────────
  //
  // MobileGameTable has exactly ONE seat-rendering path: read every
  // anchor from the shell-owned SeatAnchorLayer (gated by
  // CANONICAL_SEAT_CONSUMERS), render each occupied seat through
  // <CanonicalSeatCluster slot={anchor.slot}>, and let the cluster
  // resolve placement, observer/active projection, and the Holm
  // showdown raise.
  //
  // No bespoke positioning if-tree, no `getObserverSlotFromPosition`
  // helper, no per-projection seat branch. Projection mode and slot
  // identity are owned by `resolveSeatAnchors` in seatAnchors.ts; this
  // component is a pure consumer.
  //
  // Positional helpers retained as TEMPORARY consumers (slotPositions
  // for dice fly-in origin, getClockwiseDistance for buck/spotlight,
  // etc.) are NOT seat renderers — they convert authoritative seat
  // positions to pixel offsets for non-seat overlays. Per the user's
  // PR-B scope they may stay until a follow-up rewires them through
  // canonical pixel anchors; seat ownership/projection/continuity is
  // the milestone for this PR.
  const shellAnchors = useRequiredSeatAnchors(gameType ?? null);
  const preSessionSeatOwned = usePreSessionSeatOwned();

  // PRESESSION_GEOMETRY_COMPARE phase tagging — scopes the wartime
  // sampler to the pre-game window the user cares about and clears it
  // once gameplay takes over. Does not influence rendering.
  useEffect(() => {
    let phase: string | null = null;
    if (gameStatus === 'waiting_for_players') phase = 'WaitingTable';
    else if (gameStatus === 'ante_decision') phase = 'AnteDecision';
    else if (gameStatus === 'dealer_selection' || gameStatus === 'cribbage_dealer_selection') phase = 'CribbageDealerSelection';
    else if (gameStatus === 'in_progress') phase = 'GameplayStart';
    else phase = null;
    setPresessionGeometryPhase(phase);
    return () => { setPresessionGeometryPhase(null); };
  }, [gameStatus]);
  const currentPos = currentPlayer?.position ?? 1;
  const otherPlayersRaw = players.filter(p => p.user_id !== currentUserId);

  // Canonical-anchor-backed clockwise distance.
  //
  // PR-B.2 fix: previously this derived distance purely from raw seat
  // positions via `canonicalClockwiseDistance(currentPos, playerPos)`.
  // The canonical seat anchor system maps positions to slots through a
  // mirrored table (ACTIVE_DISTANCE_TO_SLOT: distance 1→slot 5,
  // distance 6→slot 0) AND can canonicalize 2P face-to-face
  // arrangements, so a raw distance disagreed with the slot the seat
  // cluster actually rendered into. Consequence: spotlight, chip
  // transport, and any other consumer that takes this distance and
  // converts to `relativeSlot = distance - 1` pointed at the
  // mirror-image seat for one or more players.
  //
  // We now resolve distance from the SAME `shellAnchors.byPosition`
  // table that drives seat rendering. Slot N is mapped to
  // `distance = N + 1` so legacy consumers (`relativeSlot = distance -
  // 1`) land on the canonical slot they actually see on the felt.
  // HOME slot (-1, viewer's own seat) → distance 0. If an anchor is
  // missing (defensive: viewer is observer or roster is mid-mutation)
  // we fall back to the legacy ring math so consumers don't crash.
  const getClockwiseDistance = (playerPos: number): number => {
    if (playerPos === currentPos) return 0;
    const slot = shellAnchors?.byPosition.get(playerPos)?.slot;
    if (slot === undefined || slot === null) {
      return canonicalClockwiseDistance(currentPos, playerPos);
    }
    if (slot === -1) return 0; // HOME — viewer's own seat
    return slot + 1;
  };


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
    if (isDiceGame) return 0;
    if (gameType === 'holm-game') return 4;
    if (round === 1) return 3;
    if (round === 2) return 5;
    if (round === 3) return 7;
    return 3;
  };
  const expectedCardCount = getExpectedCardCount(currentRound);

  // Get player status chip background color based on status.
  // Delegates to the canonical shell shared participant status
  // palette (src/lib/canonicalShell/participantStatus.ts) so the
  // legacy poker surface and every canonical-shell consumer (waiting
  // surface, Cribbage/Gin/Yahtzee seat clusters) stay in lockstep on
  // the four-state language: active=white, waiting=yellow,
  // sitting_out=red, stayed=green.
  // NOTE: dice games (Horses / SCC) have no stay/fold semantics, so
  // we suppress the 'stayed' resolution via hasStayDecision.
  const getPlayerChipBgColor = (player: Player, playerDecision: string | null) => {
    const status = derivePlayerStatus(player, playerDecision, {
      hasStayDecision: !isDiceGame,
    });
    return getParticipantChipBgClass(status);
  };

  // Calculate animation origin for dice fly-in based on current turn player's position.
  // Sourced from the same canonical anchor table the seat cluster reads
  // from, so observer vs active projection cannot drift between the
  // chip stack and the dice origin.
  const getDiceAnimationOrigin = useCallback((): { x: number; y: number } | undefined => {
    const turnPlayerId = horsesController.currentTurnPlayerId;
    if (!turnPlayerId) return undefined;

    const turnPlayer = players.find(p => p.id === turnPlayerId);
    if (!turnPlayer) return undefined;

    const anchor = shellAnchors?.byPosition.get(turnPlayer.position);
    const slot = anchor?.slot ?? null;
    if (slot === null) return undefined;

    // Map CanonicalSlot → approximate pixel offsets from dice-area center.
    // Mobile layout is roughly 300px wide, 200px tall.
    const slotPositions: Record<number, { x: number; y: number }> = {
      [-1]: { x: 0, y: 80 },
      0: { x: -80, y: 60 },
      1: { x: -100, y: 0 },
      2: { x: -80, y: -50 },
      3: { x: 80, y: -50 },
      4: { x: 100, y: 0 },
      5: { x: 80, y: 60 },
    };
    return slotPositions[slot] ?? { x: 0, y: 60 };
  }, [horsesController.currentTurnPlayerId, players, shellAnchors]);

  /**
   * Dice-only legacy seat renderer (Horses / Ship-Captain-Crew).
   *
   * Wave 3C.4: 357 was routed off this path to `render357CanonicalSeat`.
   * Holm has been off this path since 3C.3b (`renderHolmCanonicalSeat`).
   * What remains here is intentionally narrow: chip stack + dealer pip
   * + auto-roll indicator + dice result element + name plate, all
   * preserved 1:1 from the legacy Horses/SCC implementation. This
   * function will be retired entirely in the dice canonical-seat wave.
   *
   * No is357* / winningLeg / threeFiveSeven* / soloVsChucky* /
   * PlayerHand / card-back / leg-indicator code remains here — those
   * artifacts were 357-only and now live in `render357CanonicalSeat`.
   */
  const renderPlayerChip = (player: Player, slotIndex?: number) => {
    const isTheirTurn =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentTurnPlayerId === player.id &&
      !awaitingNextRound;
    const isCurrentUser = player.user_id === currentUserId;

    // Slot is always the canonical anchor slot passed by the seat mapper.
    const effectiveSlotIndex = slotIndex;

    const playerDecision = player.current_decision;
    const cards = getPlayerCards(player.id);

    // Status chip background color.
    const chipBgColor = getPlayerChipBgColor(player, playerDecision);

    // Host click affordance.
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;

    // Slot geometry (used only for name-plate placement + dealer-pip side).
    const isBottomPosition = effectiveSlotIndex === 0 || effectiveSlotIndex === 5 || effectiveSlotIndex === -1;
    const isUpperCorner = effectiveSlotIndex === 2 || effectiveSlotIndex === 3;
    const isRightSideSlot = effectiveSlotIndex !== undefined && effectiveSlotIndex >= 3;

    const isDealer = dealerPosition === player.position;

    // Auto-roll indicator (dice only).
    const showAutoRollIndicator = isDiceGame && player.auto_fold && !player.is_bot;

    const chipElement = (
      <div className="relative flex items-center gap-1">
        {/* Auto-roll indicator */}
        {showAutoRollIndicator && <AutoRollIndicator isRightSide={isRightSideSlot} />}

        {/* Dealer pip — positioned OUTSIDE chip stack toward the rim. */}
        {isDealer && (
          <div
            className="absolute z-30"
            style={
              isRightSideSlot
                ? { right: '-2px', top: '50%', transform: 'translateY(-50%) translateX(75%)' }
                : { left: '-2px', top: '50%', transform: 'translateY(-50%) translateX(-75%)' }
            }
          >
            <div className="w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-[10px]">D</span>
            </div>
          </div>
        )}

        <CanonicalChipstack
          position={player.position}
          clickable={isClickable}
          onClick={isClickable ? () => onPlayerClick(player) : undefined}
        >
          <CanonicalChipDisc
            amount={
              emoticonOverlays[player.id]
                ? null
                : (lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips)
            }
            bgClass={chipBgColor}
            showTurnRing={isTheirTurn}
            pulseDisc={isTheirTurn}
            folded={playerDecision === 'fold'}
            clickable={isClickable}
            positionAnchor={player.position}
            size="gameplay"
            overlay={
              emoticonOverlays[player.id] ? (
                <div
                  className={cn(
                    'absolute inset-0 rounded-full flex items-center justify-center z-10',
                    isTablet ? 'w-16 h-16' : 'w-12 h-12',
                  )}
                >
                  <span
                    className={cn(
                      'animate-in fade-in zoom-in duration-200',
                      isTablet ? 'text-2xl' : 'text-xl',
                    )}
                    style={{
                      animation:
                        emoticonOverlays[player.id].expiresAt - Date.now() < 500
                          ? 'fadeOutEmoticon 0.5s ease-out forwards'
                          : undefined,
                    }}
                  >
                    {emoticonOverlays[player.id].emoticon}
                  </span>
                </div>
              ) : undefined
            }
          >
            <ValueChangeFlash
              value={0}
              prefix="+$"
              position="top-left"
              manualTrigger={
                winnerPotFlashTrigger?.playerId === player.id
                  ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount }
                  : null
              }
            />
          </CanonicalChipDisc>
        </CanonicalChipstack>
      </div>
    );

    const nameElement = (
      <span
        className={cn(
          'truncate leading-none font-bold',
          isTablet || isDesktop
            ? 'text-sm max-w-[90px] bg-white text-black px-1.5 py-0.5 rounded'
            : 'text-[11px] max-w-[70px] text-white drop-shadow-md font-semibold',
        )}
      >
        {player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || `P${player.position}`)}
        {isCurrentUser && (
          <span
            className={cn(
              'ml-1 font-medium',
              isTablet || isDesktop ? 'text-xs text-black/70' : 'text-[10px] text-white/70',
            )}
          >
            R{currentRound}
          </span>
        )}
      </span>
    );

    // Dice result element (Horses / SCC) — replaces the chip stack
    // once the player has completed their hand for the round.
    const horsesStatePlayerData = diceGameplayUiActive && horsesController.enabled
      ? (horsesState as any)?.playerStates?.[player.id]
      : null;
    const horsesPlayerResult = diceGameplayUiActive && horsesController.enabled
      ? horsesController.getPlayerHandResult(player.id)
      : null;
    const effectiveHorsesResult = horsesPlayerResult;
    const isHorsesCurrentlyWinning =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentlyWinningPlayerIds.includes(player.id);

    const horsesResultElement = diceGameplayUiActive && effectiveHorsesResult && (() => {
      if (gameType === 'ship-captain-crew') {
        const hasSccShape = typeof (effectiveHorsesResult as any).isQualified === 'boolean';
        if (!hasSccShape) return null;
        const isQualified = (effectiveHorsesResult as any).isQualified;
        if (!isQualified) {
          return (
            <div className={cn('inline-flex items-center justify-center rounded px-2 py-1', 'bg-white border border-gray-300')}>
              <span className="text-sm font-bold text-red-600">NQ</span>
            </div>
          );
        }
        if (horsesStatePlayerData?.dice) {
          const allDice = horsesStatePlayerData.dice as SCCDieType[];
          const cargoDice = allDice.filter(d => !d.sccType);
          return (
            <div
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-0.5 py-0.5',
                isHorsesCurrentlyWinning ? 'bg-poker-gold border border-poker-gold' : 'bg-white border border-gray-300',
              )}
            >
              {cargoDice.slice(0, 2).map((die, idx) => (
                <HorsesDie
                  key={idx}
                  value={die.value}
                  isHeld={false}
                  isRolling={false}
                  canToggle={false}
                  onToggle={() => {}}
                  size="xs"
                  showWildHighlight={false}
                  isSCCDie={false}
                />
              ))}
            </div>
          );
        }
      }
      if (effectiveHorsesResult?.description) {
        return (
          <div className="flex items-center justify-center">
            <HorsesHandResultDisplay
              description={effectiveHorsesResult.description}
              isWinning={isHorsesCurrentlyWinning}
              size="sm"
            />
          </div>
        );
      }
      return null;
    })();

    const hideChipForHorses = diceGameplayUiActive && effectiveHorsesResult;

    // Reference `cards` to keep getPlayerCards subscription parity with
    // pre-cutover behavior (no-op render side effect for dice — cards is
    // always empty here, but keeps useMemo/subscription identical).
    void cards;

    return (
      <div key={player.id} className="flex flex-col items-center gap-0.5 relative">
        {/* Name above for bottom positions and middle positions. Upper
            corners place the name BELOW the chipstack for readability. */}
        {(isBottomPosition || (!isBottomPosition && !isUpperCorner)) && nameElement}
        <div className="relative transition-opacity duration-150">
          {!hideChipForHorses && (
            <div data-seat-chip-position={player.position} className="relative">
              <ActivePlayerHUD
                timeLeft={timeLeft}
                maxTime={maxTime}
                isActive={isTheirTurn && roundStatus === 'betting'}
                size={52}
                seatPosition={player.position}
                gameId={gameId}
                gameType={gameType}
              >
                {chipElement}
              </ActivePlayerHUD>
            </div>
          )}
          {hideChipForHorses && (
            <div className="animate-in fade-in duration-150">{horsesResultElement}</div>
          )}
        </div>
        {/* Name BELOW chipstack for upper corners. */}
        {isUpperCorner && nameElement}
      </div>
    );
  };

  /**
   * Wave 3C.3b — Holm-only canonical gameplay seat.
   *
   * Renders the opponent gameplay seat for Holm via the canonical
   * CanonicalSeatCluster pill (using the additive 3C.3a slots:
   * chipHUD / chipDiscChildren / chipPresentation / namePlacement).
   * The cluster now owns: background plate, name, dealer badge,
   * chip counter, status ring, chip transport endpoint, emoticon
   * slot. Holm continues to own: card backs, exposed showdown
   * cards, gameplay artifacts (passed as cluster children).
   *
   * Scope: Holm only. 357 / Horses / SCC keep `renderPlayerChip` +
   * `hideChipBubble` until their own wave.
   */
  const renderHolmCanonicalSeat = (player: Player, slot: CanonicalSlot) => {
    const isTheirTurn = currentTurnPosition === player.position && !awaitingNextRound;
    const isCurrentUser = player.user_id === currentUserId;
    const playerDecision = player.current_decision;
    const cards = getPlayerCards(player.id);
    const apparentIsActivePlayer = player.status === 'active' && !player.sitting_out;
    const hasFolded = playerDecision === 'fold';
    const showCardBacks =
      apparentIsActivePlayer && expectedCardCount > 0 && currentRound > 0 && !hasFolded;
    const cardCountToShow = cards.length > 0 ? cards.length : expectedCardCount;
    const isDealer = dealerPosition === player.position;
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;
    const isBottomPosition = slot === 0 || slot === 5 || slot === -1;
    const isUpperCorner = slot === 2 || slot === 3;
    const isMiddlePosition = slot === 1 || slot === 4;
    const isRightSideSlot = slot >= 3;

    const stayed = playerDecision === 'stay';
    // Latch raise through the entire multiplayer showdown lifecycle
    // (including holmWinPotTriggerId / WIN_SEQUENCE). Dropping it on
    // pot-trigger caused stayed clusters to snap downward at the start
    // of the pot-to-player animation. Raise releases only when
    // isHolmMultiPlayerShowdown itself releases (hand boundary).
    const raise = isHolmMultiPlayerShowdown && stayed;

    // Showdown / chip-replacement derivation.
    const hasExposedCards = isPlayerCardsExposed(player.id) && cards.length > 0;
    const isInAnnouncementShowdown =
      isShowingAnnouncement && playerDecision === 'stay' && cards.length > 0;
    const isShowdown = hasExposedCards || isInAnnouncementShowdown;
    const isHolmWinWinner = !!holmWinPotTriggerIdGated && winnerPlayerId === player.id;
    const soloLockedId = soloVsChuckyPlayerIdLocked;
    const isSoloVsChuckyPlayerForChip =
      isSoloVsChucky && soloLockedId === player.id && player.id !== currentPlayer?.id;
    const hideChipForShowdown =
      isHolmMultiPlayerShowdown && isShowdown && !isHolmWinWinner && !isSoloVsChuckyPlayerForChip;
    const soloAreaPlayerId = isSoloVsChucky
      ? (soloLockedId || players.find(p => p.current_decision === 'stay')?.id || null)
      : null;
    const isSoloVsChuckyPlayerRaw =
      soloAreaPlayerId !== null && soloAreaPlayerId === player.id && player.id !== currentPlayer?.id;
    const shouldHideForTabling = isHolmWinWinner || isSoloVsChuckyPlayerForChip || isSoloVsChuckyPlayerRaw;

    // Chip palette via shared participant-status helper (parity with
    // legacy getPlayerChipBgColor).
    const participantStatus = derivePlayerStatus(player, playerDecision, {
      hasStayDecision: true,
    });

    // Identity row.
    const displayName = player.is_bot
      ? getBotAlias(players, player.user_id)
      : (player.profiles?.username || `P${player.position}`);

    // Chip text — preserves the legacy displayedChips / lockedChips
    // animation source. Hidden when emoticon overlay is active (the
    // overlay paints over the value).
    const chipAmount = lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips;
    const chipText = emoticonOverlays[player.id] ? '' : `$${formatChipValue(Math.round(chipAmount ?? 0))}`;

    // Holm polish: turn indication is the descending timer ring + table
    // spotlight only. No separate yellow chip-disc underlay/highlight.
    const statusRing: CanonicalSeatStatusRing | undefined = undefined;

    // ActivePlayerHUD wraps the chip-disc body so the countdown ring
    // is preserved 1:1. The HUD's children are injected by the cluster
    // via cloneElement.
    const chipHUD = (
      <ActivePlayerHUD
        timeLeft={timeLeft}
        maxTime={maxTime}
        isActive={isTheirTurn && roundStatus === 'betting'}
        size={52}
        seatPosition={player.position}
        gameId={gameId}
        gameType={gameType}
      />
    );

    // ValueChangeFlash siblings rendered INSIDE the canonical disc.
    const chipDiscChildren = (
      <>
        <ValueChangeFlash
          value={0}
          prefix="+L"
          position="top-right"
          manualTrigger={
            winnerLegsFlashTrigger?.playerId === player.id
              ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount }
              : null
          }
        />
        <ValueChangeFlash
          value={0}
          prefix="+$"
          position="top-left"
          manualTrigger={
            winnerPotFlashTrigger?.playerId === player.id
              ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount }
              : null
          }
        />
      </>
    );

    // Emoticon overlay (paints over the disc face) — matches legacy
    // CanonicalChipDisc.overlay path.
    const emoticon = emoticonOverlays[player.id];
    const chipOverlay = emoticon ? (
      <div className="absolute inset-0 rounded-full flex items-center justify-center z-10">
        <span
          className="text-xl animate-in fade-in zoom-in duration-200"
          style={{
            animation:
              emoticon.expiresAt - Date.now() < 500
                ? 'fadeOutEmoticon 0.5s ease-out forwards'
                : undefined,
          }}
        >
          {emoticon.emoticon}
        </span>
      </div>
    ) : undefined;

    // Chip presentation. Showdown hides the chip; if an emoticon is
    // pending it paints in place of the chip (legacy emoticonOverlayElement).
    let chipPresentation: 'auto' | 'hidden' | ReactNode = 'auto';
    if (hideChipForShowdown) {
      if (emoticon) {
        chipPresentation = (
          <div className="w-12 h-12 rounded-full bg-slate-700/80 border-2 border-slate-600/50 flex items-center justify-center">
            <span
              className="text-xl animate-in fade-in zoom-in duration-200"
              style={{
                animation:
                  emoticon.expiresAt - Date.now() < 500
                    ? 'fadeOutEmoticon 0.5s ease-out forwards'
                    : undefined,
              }}
            >
              {emoticon.emoticon}
            </span>
          </div>
        );
      } else {
        chipPresentation = 'hidden';
      }
    }

    // Cards (gameplay artifact owned by Holm) — rendered as cluster
    // children below the pill.
    const isLosingPlayer =
      isShowingAnnouncement && !!winnerPlayerId && player.id !== winnerPlayerId && playerDecision === 'stay';
    const isWinningPlayer = isShowingAnnouncement && winnerPlayerId === player.id;
    const playerExplicitlyStayed = playerDecision === 'stay';

    // Wave 3C.3c — stable name placement during Holm gameplay. Name
    // is always rendered above the chip across active/inactive/
    // showdown/emoticon/dealer states. Eliminates active-state
    // hopping caused by namePlacement migration.
    const showNameBelowCards = false;
    const namePlacement: 'above-chip' | 'below-chip' | 'none' = 'above-chip';

    const holmDealCardIdsForPlayer = (() => {
      if (gameType !== 'holm-game' || !handContextId || typeof buckPosition !== 'number') return [] as string[];
      const active = players
        .filter(p => p.status === 'active' && !p.sitting_out)
        .sort((a, b) => a.position - b.position);
      const start = active.findIndex(p => p.position === buckPosition);
      if (start < 0) return [] as string[];
      const ring = [...active.slice(start), ...active.slice(0, start)];
      const ids: string[] = [];
      let dealIndex = 0;
      for (let round = 0; round < 4; round++) {
        for (const recipient of ring) {
          if (recipient.id === player.id) ids.push(`${handContextId}#hand-${dealIndex}`);
          dealIndex += 1;
        }
      }
      return ids;
    })();


    const cardsNode = isShowdown && !shouldHideForTabling && playerExplicitlyStayed ? (
      <div
        className={cn(
          'flex scale-100 origin-top relative z-40',
          isLosingPlayer && 'opacity-40 grayscale-[30%]',
          showNameBelowCards && isUpperCorner && '-mb-2',
        )}
      >
        <PlayerHand
          cards={cards}
          isHidden={false}
          highlightedIndices={isWinningPlayer ? winningCardHighlights.playerIndices : []}
          kickerIndices={isWinningPlayer ? winningCardHighlights.kickerPlayerIndices : []}
          hasHighlights={isWinningPlayer && winningCardHighlights.hasHighlights}
          gameType={gameType}
          currentRound={currentRound}
          showSeparated={false}
          tightOverlap={isHolmMultiPlayerShowdown}
          unusedCardsBelow={false}
          isRightSide={isRightSideSlot}
          isBottomPosition={isBottomPosition}
        />
      </div>
    ) : (
      !shouldHideForTabling && showCardBacks && cardCountToShow > 0 && (
        <div className={cn('flex', hasFolded && 'animate-[foldCards_1.5s_ease-out_forwards]')}>
          {Array.from({ length: Math.min(cardCountToShow, 7) }, (_, i) => {
            const cardId =
              holmDealCardIdsForPlayer[i] ?? `${handContextId ?? 'no-hand'}#opp-${player.id}-${i}`;
            return (
              <HolmOpponentCardBackSlot
                key={i}
                index={i}
                cardId={cardId}
                cardCount={cardCountToShow}
                hasFolded={hasFolded}
              />
            );
          })}
        </div>
      )
    );

    const nameBelowCardsNode = showNameBelowCards && (
      <div className={isUpperCorner ? 'mt-2' : ''}>
        <span
          className={cn(
            'truncate leading-none font-bold',
            isTablet || isDesktop
              ? 'text-sm max-w-[90px] bg-white text-black px-1.5 py-0.5 rounded'
              : 'text-[11px] max-w-[70px] text-white drop-shadow-md font-semibold',
          )}
        >
          {displayName}
          {isCurrentUser && (
            <span
              className={cn(
                'ml-1 font-medium',
                isTablet || isDesktop ? 'text-xs text-black/70' : 'text-[10px] text-white/70',
              )}
            >
              R{currentRound}
            </span>
          )}
        </span>
      </div>
    );

    // Wave 5D follow-up — route the local viewer's multiplayer
    // showdown exposed cards through the SAME CanonicalSeatCluster
    // path used for opponents (no active-hand-region bypass). Opt
    // in only when the current user is the seated player AND a
    // multiplayer showdown is in flight AND they stayed.
    const isLocalViewer = player.id === currentPlayer?.id;
    const allowSelfRenderForShowdown =
      isLocalViewer && isHolmMultiPlayerShowdown && isShowdown && playerExplicitlyStayed;

    return (
      <CanonicalSeatCluster
        key={player.id}
        slot={slot}
        position={player.position}
        name={displayName}
        chipValue={chipText}
        isDealer={isDealer}
        status={participantStatus}
        statusRing={statusRing}
        chipHUD={chipHUD}
        chipDiscChildren={chipDiscChildren}
        chipOverlay={chipOverlay}
        chipPresentation={chipPresentation}
        namePlacement={namePlacement}
        dimChip={hasFolded}
        onChipClick={isClickable ? () => onPlayerClick!(player) : undefined}
        raisePosition={raise}
        growUpwardAtBottom={isHolmMultiPlayerShowdown}
        allowSelfRender={allowSelfRenderForShowdown}
        className={playerSlotZIndex}
        ownerLabel="Slot:MobileGameTable.holmCanonicalSeat"
        playerId={player.id}
      >
        {cardsNode}
        {nameBelowCardsNode}
      </CanonicalSeatCluster>
    );
  };

  /**
   * Wave 3C.4 — 357-only canonical gameplay seat.
   *
   * Mirrors `renderHolmCanonicalSeat` and projects through the same
   * CanonicalSeatCluster pill (chipDiscChildren / chipOverlay /
   * chipPresentation / namePlacement="above-chip"). The cluster owns:
   * background plate, name, dealer pip, chip counter, status palette,
   * chip transport endpoint (`data-chip-center`), emoticon overlay.
   * 357 owns only its genuine gameplay artifacts: leg indicators
   * (with displayLegs animation cache), per-round showdown reveals,
   * win-animation tabling suppression, solo-vs-Chucky suppression,
   * and the dealer-pip suppression during multi-player showdowns.
   *
   * Scope: 357 only. Horses/SCC remain on the legacy `renderPlayerChip`
   * until their own wave.
   */
  const render357CanonicalSeat = (player: Player, slot: CanonicalSlot) => {
    const isCurrentUser = player.user_id === currentUserId;

    // 357 hides opponent decisions until allDecisionsIn flips.
    const playerDecision = (isCurrentUser || allDecisionsIn)
      ? player.current_decision
      : null;
    const cards = getPlayerCards(player.id);

    const rawIsActivePlayer = player.status === 'active' && !player.sitting_out;
    // While we're hiding decisions from opponents, treat "folded" as
    // still active so the visible card-back stack doesn't disappear
    // before the round resolves.
    const apparentIsActivePlayer =
      (player.status === 'active' || player.status === 'folded') && !player.sitting_out;

    const showCardBacks = apparentIsActivePlayer && expectedCardCount > 0 && currentRound > 0;
    const cardCountToShow = cards.length > 0 ? cards.length : expectedCardCount;

    const isDealer = dealerPosition === player.position;
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;
    const isRightSideSlot = slot >= 3;
    const isBottomPosition = slot === 0 || slot === 5 || slot === -1;

    // 357 showdown derivation — three exclusive reveal modes.
    const hasExposedCards = isPlayerCardsExposed(player.id) && cards.length > 0;
    const isWinningLegReveal = winningLegPlayerId === player.id && cards.length > 0;
    const isRound3MultiShowdown = is357Round3MultiPlayerShowdown && hasExposedCards;
    const isSecretReveal = is357SecretRevealActive && playerDecision === 'stay' && hasExposedCards;
    const isShowdown = isWinningLegReveal || isRound3MultiShowdown || isSecretReveal;

    // Win-animation / solo-vs-Chucky tabling suppression.
    const isWinAnimationWinner =
      threeFiveSevenWinnerId === player.id && threeFiveSevenWinPhase !== 'idle';
    const soloLockedId = soloVsChuckyPlayerIdLocked;
    const isSoloVsChuckyPlayerForChip =
      isSoloVsChucky && soloLockedId === player.id && player.id !== currentPlayer?.id;
    const soloAreaPlayerId = isSoloVsChucky
      ? (soloLockedId || players.find(p => p.current_decision === 'stay')?.id || null)
      : null;
    const isSoloVsChuckyPlayerRaw =
      soloAreaPlayerId !== null && soloAreaPlayerId === player.id && player.id !== currentPlayer?.id;
    const shouldHideForTabling =
      isWinAnimationWinner || isSoloVsChuckyPlayerForChip || isSoloVsChuckyPlayerRaw;

    // Hide chip during multi-player showdowns (R2/R3) to make room for cards.
    const hideChipForShowdown = is357MultiPlayerShowdown && isShowdown;

    // Status palette (357 honors stayed-decision green).
    const participantStatus = derivePlayerStatus(player, playerDecision, {
      hasStayDecision: true,
    });

    const displayName = player.is_bot
      ? getBotAlias(players, player.user_id)
      : (player.profiles?.username || `P${player.position}`);

    const chipAmount = lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips;
    const chipText = emoticonOverlays[player.id] ? '' : `$${formatChipValue(Math.round(chipAmount ?? 0))}`;

    // 357 has no per-seat turn (decisions are simultaneous within the
    // round) — no status ring, no ActivePlayerHUD wrapper.
    const statusRing: CanonicalSeatStatusRing | undefined = undefined;

    // Leg indicators with the displayLegs animation cache, preserved
    // 1:1 from legacy renderPlayerChip. Rendered as a sibling INSIDE
    // the CanonicalChipDisc body so the absolute pip cluster anchors
    // off the same canonical disc that publishes data-chip-center.
    const playerLegs = player.legs;
    const isLegAnimatingForThisPlayer =
      showLegEarned && legEarnedPlayerPosition === player.position;
    const hideLegsForWinAnimation =
      threeFiveSevenWinPhase === 'legs-to-player' ||
      threeFiveSevenWinPhase === 'pot-to-player' ||
      threeFiveSevenWinPhase === 'delay';
    const isInWinAnimation = threeFiveSevenWinPhase !== 'idle';
    const cachedLegsForThisPlayer =
      threeFiveSevenCachedLegPositions.find(p => p.playerId === player.id)?.legCount || 0;
    const effectivePlayerLegs = isInWinAnimation ? cachedLegsForThisPlayer : playerLegs;
    const legsWereSweptThisSession =
      lastThreeFiveSevenTriggerRef.current !== null && threeFiveSevenWinPhase === 'idle';
    const displayLegs = hideLegsForWinAnimation
      ? 0
      : legsWereSweptThisSession
        ? 0
        : isLegAnimatingForThisPlayer
          ? Math.max(0, effectivePlayerLegs - 1)
          : effectivePlayerLegs;

    const legIndicator = displayLegs > 0 ? (
      <div
        className="absolute z-30"
        style={
          isRightSideSlot
            ? { left: '6px', top: '50%', transform: 'translateY(-50%) translateX(-100%)' }
            : { right: '6px', top: '50%', transform: 'translateY(-50%) translateX(100%)' }
        }
      >
        <div className="flex" style={{ flexDirection: isRightSideSlot ? 'row-reverse' : 'row' }}>
          {Array.from({ length: Math.min(displayLegs, legsToWin) }).map((_, i) => {
            const showLegDollarValue = legValue > 0;
            const legDisplayText = showLegDollarValue ? `$${legValue}` : 'L';
            const chipSize = showLegDollarValue ? 'w-6 h-6' : 'w-5 h-5';
            const textSize = showLegDollarValue ? 'text-[8px]' : 'text-[10px]';
            return (
              <div
                key={i}
                className={`${chipSize} rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg`}
                style={{
                  marginLeft: !isRightSideSlot && i > 0 ? '-8px' : '0',
                  marginRight: isRightSideSlot && i > 0 ? '-8px' : '0',
                  zIndex: Math.min(displayLegs, legsToWin) - i,
                }}
              >
                <span className={`text-slate-800 font-bold ${textSize}`}>{legDisplayText}</span>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

    const chipDiscChildren = (
      <>
        {legIndicator}
        <ValueChangeFlash
          value={0}
          prefix="+L"
          position="top-right"
          manualTrigger={
            winnerLegsFlashTrigger?.playerId === player.id
              ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount }
              : null
          }
        />
        <ValueChangeFlash
          value={0}
          prefix="+$"
          position="top-left"
          manualTrigger={
            winnerPotFlashTrigger?.playerId === player.id
              ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount }
              : null
          }
        />
      </>
    );

    // Emoticon overlay (paints over the disc face).
    const emoticon = emoticonOverlays[player.id];
    const chipOverlay = emoticon ? (
      <div className="absolute inset-0 rounded-full flex items-center justify-center z-10">
        <span
          className="text-xl animate-in fade-in zoom-in duration-200"
          style={{
            animation:
              emoticon.expiresAt - Date.now() < 500
                ? 'fadeOutEmoticon 0.5s ease-out forwards'
                : undefined,
          }}
        >
          {emoticon.emoticon}
        </span>
      </div>
    ) : undefined;

    // Chip presentation. Multi-player showdown hides the chip to free
    // space for exposed cards; an emoticon paints in its place when
    // present (matches legacy emoticonOverlayElement).
    let chipPresentation: 'auto' | 'hidden' | ReactNode = 'auto';
    if (hideChipForShowdown) {
      if (emoticon) {
        chipPresentation = (
          <div className="w-12 h-12 rounded-full bg-slate-700/80 border-2 border-slate-600/50 flex items-center justify-center">
            <span
              className="text-xl animate-in fade-in zoom-in duration-200"
              style={{
                animation:
                  emoticon.expiresAt - Date.now() < 500
                    ? 'fadeOutEmoticon 0.5s ease-out forwards'
                    : undefined,
              }}
            >
              {emoticon.emoticon}
            </span>
          </div>
        );
      } else {
        chipPresentation = 'hidden';
      }
    }

    // Cards (gameplay artifact owned by 357) — rendered as cluster
    // children below the pill.
    const isWinningPlayer = isShowingAnnouncement && winnerPlayerId === player.id;
    const isLosingPlayer =
      isShowingAnnouncement && !!winnerPlayerId && player.id !== winnerPlayerId && playerDecision === 'stay';

    // Hide opponent card backs as soon as a 357 winner is identified
    // (covers the brief gap before the win animation phase machine
    // engages). Preserved verbatim from legacy.
    const winnerIdForBackHide = threeFiveSevenWinnerId ?? winningLegPlayerId;
    const isWinContextActive = threeFiveSevenWinPhase !== 'idle' || !!winningLegPlayerId;
    const hideBacksDuringWin =
      isWinContextActive && !!winnerIdForBackHide && player.id !== winnerIdForBackHide;

    const cardsNode = isShowdown && !shouldHideForTabling ? (
      <div
        className={cn(
          'flex scale-100 origin-top relative z-40',
          isLosingPlayer && 'opacity-40 grayscale-[30%]',
        )}
      >
        <PlayerHand
          cards={cards}
          isHidden={false}
          highlightedIndices={isWinningPlayer ? winningCardHighlights.playerIndices : []}
          kickerIndices={isWinningPlayer ? winningCardHighlights.kickerPlayerIndices : []}
          hasHighlights={isWinningPlayer && winningCardHighlights.hasHighlights}
          gameType={gameType}
          currentRound={currentRound}
          showSeparated={currentRound === 3 && cards.length === 7 && !is357MultiPlayerShowdown}
          tightOverlap={false}
          unusedCardsBelow={is357MultiPlayerShowdown && (currentRound === 2 || currentRound === 3)}
          isRightSide={isRightSideSlot}
          isBottomPosition={isBottomPosition}
        />
      </div>
    ) : (
      !shouldHideForTabling && !hideBacksDuringWin && showCardBacks && (cardCountToShow > 0 || prevWaveCountFor357(currentRound ?? 0) > 0) && (
        <Use357OppCount
          playerId={player.id}
          seat={player.position}
          baseline={prevWaveCountFor357(currentRound ?? 0)}
          defaultCount={cardCountToShow}
          expected={totalAfterWaveFor357(currentRound ?? 0) || cardCountToShow}
          render={(visibleCount) => (
            visibleCount > 0 ? (
              <div className="flex">
                {Array.from({ length: Math.min(visibleCount, 7) }, (_, i) => (
                  <CanonicalCardBack
                    key={i}
                    widthPx={12}
                    heightPx={20}
                    variant="flat"
                    style={{
                      marginLeft: i > 0 ? '-5px' : '0',
                      zIndex: visibleCount - i,
                    }}
                  />
                ))}
              </div>
            ) : null
          )}
        />
      )
    );

    return (
      <CanonicalSeatCluster
        key={player.id}
        slot={slot}
        position={player.position}
        name={displayName}
        chipValue={chipText}
        // Dealer pip is suppressed during R2/R3 multi-player showdowns
        // to reduce clutter (legacy parity).
        isDealer={isDealer && !is357MultiPlayerShowdown}
        status={participantStatus}
        statusRing={statusRing}
        chipDiscChildren={chipDiscChildren}
        chipOverlay={chipOverlay}
        chipPresentation={chipPresentation}
        namePlacement="above-chip"
        onChipClick={isClickable ? () => onPlayerClick!(player) : undefined}
        className={playerSlotZIndex}
        ownerLabel="Slot:MobileGameTable.357CanonicalSeat"
        playerId={player.id}
      >
        {cardsNode}
      </CanonicalSeatCluster>
    );
  };

  /**
   * Wave 3C.5 — Horses canonical gameplay seat.
   *
   * Mirrors renderHolmCanonicalSeat. Holm is the spec. Only genuine
   * Horses gameplay artifacts project from the seat:
   *   - AutoRollIndicator (chipDiscChildren — absolute sibling inside disc)
   *   - HorsesHandResultDisplay (chipPresentation override when the
   *     player has a completed hand result for the round)
   *
   * No bespoke chip circle, name plate, dealer pip, or seat geometry.
   * Chip palette derives from derivePlayerStatus with
   * hasStayDecision:false (dice games have no stay/fold semantics).
   */
  const renderHorsesCanonicalSeat = (player: Player, slot: CanonicalSlot) => {
    const isTheirTurn =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentTurnPlayerId === player.id &&
      !awaitingNextRound;
    const playerDecision = player.current_decision;
    const isDealer = dealerPosition === player.position;
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;

    const participantStatus = derivePlayerStatus(player, playerDecision, {
      hasStayDecision: false,
    });

    const displayName = player.is_bot
      ? getBotAlias(players, player.user_id)
      : (player.profiles?.username || `P${player.position}`);

    const chipAmount = lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips;
    const chipText = emoticonOverlays[player.id] ? '' : `$${formatChipValue(Math.round(chipAmount ?? 0))}`;

    const showTurnRing = isTheirTurn;
    const statusRing: CanonicalSeatStatusRing | undefined = showTurnRing ? 'turn' : undefined;

    const chipHUD = (
      <ActivePlayerHUD
        timeLeft={timeLeft}
        maxTime={maxTime}
        isActive={isTheirTurn && roundStatus === 'betting'}
        size={52}
        seatPosition={player.position}
        gameId={gameId}
        gameType={gameType}
      />
    );

    const showAutoRollIndicator = player.auto_fold && !player.is_bot;
    const isRightSideSlot = slot >= 3;
    const chipDiscChildren = (
      <>
        {showAutoRollIndicator && <AutoRollIndicator isRightSide={isRightSideSlot} />}
        <ValueChangeFlash
          value={0}
          prefix="+$"
          position="top-left"
          manualTrigger={
            winnerPotFlashTrigger?.playerId === player.id
              ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount }
              : null
          }
        />
      </>
    );

    const emoticon = emoticonOverlays[player.id];
    const chipOverlay = emoticon ? (
      <div className="absolute inset-0 rounded-full flex items-center justify-center z-10">
        <span
          className="text-xl animate-in fade-in zoom-in duration-200"
          style={{
            animation:
              emoticon.expiresAt - Date.now() < 500
                ? 'fadeOutEmoticon 0.5s ease-out forwards'
                : undefined,
          }}
        >
          {emoticon.emoticon}
        </span>
      </div>
    ) : undefined;

    const horsesPlayerResult = diceGameplayUiActive && horsesController.enabled
      ? horsesController.getPlayerHandResult(player.id)
      : null;
    const isHorsesCurrentlyWinning =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentlyWinningPlayerIds.includes(player.id);

    // OWNERSHIP: the Horses win-score badge is owned by the shell
    // transient overlay (z=85). The seat keeps an INVISIBLE shim of the
    // same badge in the chip-presentation slot so chip-cell geometry
    // (cell size, name placement, chip-text suppression) is
    // byte-identical to pre-migration; the visible copy is portaled
    // into ShellOverlay:transient via OverSeatBadgePortal anchored to
    // [data-chip-center]. No bespoke offsets, no z-hacks.
    const horsesResultBadge =
      diceGameplayUiActive && horsesPlayerResult?.description ? (
        <HorsesHandResultDisplay
          description={horsesPlayerResult.description}
          isWinning={isHorsesCurrentlyWinning}
          size="sm"
        />
      ) : null;

    let chipPresentation: 'auto' | 'hidden' | ReactNode = 'auto';
    if (horsesResultBadge) {
      // Anchor-publishing shim. Mirrors CanonicalChipDisc's outer box
      // geometry (w-12/w-16) AND carries `data-chip-center` so the
      // OverSeatBadgePortal anchor remains resolvable for the ENTIRE
      // win sequence — even though the default chip disc is no longer
      // mounted under this presentation. Without this, the disc's
      // `[data-chip-center]` disappears the instant a winner is
      // declared and the portal cannot resolve a position, so the
      // badge never appears. Centered, opacity:0, non-interactive.
      chipPresentation = (
        <div
          aria-hidden
          data-chip-center={player.position}
          data-shim-owner="HorsesWinScoreBadge"
          className={cn(
            'relative flex items-center justify-center',
            isTablet ? 'w-16 h-16' : 'w-12 h-12',
          )}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ opacity: 0 }}>{horsesResultBadge}</div>
        </div>
      );
    }

    return (
      <>
        <CanonicalSeatCluster
          key={player.id}
          slot={slot}
          position={player.position}
          name={displayName}
          chipValue={chipText}
          /* Dice families have no dealer concept. */
          isDealer={false}
          status={participantStatus}
          statusRing={statusRing}
          chipHUD={chipHUD}
          chipDiscChildren={chipDiscChildren}
          chipOverlay={chipOverlay}
          chipPresentation={chipPresentation}
          namePlacement="above-chip"
          onChipClick={isClickable ? () => onPlayerClick!(player) : undefined}
          className={playerSlotZIndex}
          ownerLabel="Slot:MobileGameTable.horsesCanonicalSeat"
          playerId={player.id}
        />
        {horsesResultBadge ? (
          <OverSeatBadgePortal
            key={`horses-badge-${player.id}`}
            position={player.position}
            ownerLabel="ShellOverlay:HorsesWinScoreBadge"
          >
            {horsesResultBadge}
          </OverSeatBadgePortal>
        ) : null}
      </>
    );
  };

  /**
   * Wave 3C.5 — Ship-Captain-Crew canonical gameplay seat.
   *
   * Mirrors renderHorsesCanonicalSeat. The only SCC-specific artifact
   * is the cargo-dice / NQ badge displayed in place of the chip via
   * the chipPresentation slot once the player has a completed hand
   * result. Preserved 1:1 from legacy renderPlayerChip.
   */
  const renderSccCanonicalSeat = (player: Player, slot: CanonicalSlot) => {
    const isTheirTurn =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentTurnPlayerId === player.id &&
      !awaitingNextRound;
    const playerDecision = player.current_decision;
    const isDealer = dealerPosition === player.position;
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;

    const participantStatus = derivePlayerStatus(player, playerDecision, {
      hasStayDecision: false,
    });

    const displayName = player.is_bot
      ? getBotAlias(players, player.user_id)
      : (player.profiles?.username || `P${player.position}`);

    const chipAmount = lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips;
    const chipText = emoticonOverlays[player.id] ? '' : `$${formatChipValue(Math.round(chipAmount ?? 0))}`;

    const showTurnRing = isTheirTurn;
    const statusRing: CanonicalSeatStatusRing | undefined = showTurnRing ? 'turn' : undefined;

    const chipHUD = (
      <ActivePlayerHUD
        timeLeft={timeLeft}
        maxTime={maxTime}
        isActive={isTheirTurn && roundStatus === 'betting'}
        size={52}
        seatPosition={player.position}
        gameId={gameId}
        gameType={gameType}
      />
    );

    const showAutoRollIndicator = player.auto_fold && !player.is_bot;
    const isRightSideSlot = slot >= 3;
    const chipDiscChildren = (
      <>
        {showAutoRollIndicator && <AutoRollIndicator isRightSide={isRightSideSlot} />}
        <ValueChangeFlash
          value={0}
          prefix="+$"
          position="top-left"
          manualTrigger={
            winnerPotFlashTrigger?.playerId === player.id
              ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount }
              : null
          }
        />
      </>
    );

    const emoticon = emoticonOverlays[player.id];
    const chipOverlay = emoticon ? (
      <div className="absolute inset-0 rounded-full flex items-center justify-center z-10">
        <span
          className="text-xl animate-in fade-in zoom-in duration-200"
          style={{
            animation:
              emoticon.expiresAt - Date.now() < 500
                ? 'fadeOutEmoticon 0.5s ease-out forwards'
                : undefined,
          }}
        >
          {emoticon.emoticon}
        </span>
      </div>
    ) : undefined;

    const horsesStatePlayerData = diceGameplayUiActive && horsesController.enabled
      ? (horsesState as any)?.playerStates?.[player.id]
      : null;
    const horsesPlayerResult = diceGameplayUiActive && horsesController.enabled
      ? horsesController.getPlayerHandResult(player.id)
      : null;
    const isHorsesCurrentlyWinning =
      diceGameplayUiActive &&
      horsesController.enabled &&
      horsesController.currentlyWinningPlayerIds.includes(player.id);

    // OWNERSHIP: the SCC win-score badge (NQ or cargo-dice) is owned
    // by the shell transient overlay (z=85). The seat keeps an
    // INVISIBLE shim in the chip-presentation slot so chip-cell
    // geometry is byte-identical to pre-migration; the visible copy
    // is portaled into ShellOverlay:transient via OverSeatBadgePortal
    // anchored to [data-chip-center]. No bespoke offsets, no z-hacks.
    let sccResultBadge: ReactNode = null;
    if (diceGameplayUiActive && horsesPlayerResult) {
      const hasSccShape = typeof (horsesPlayerResult as any).isQualified === 'boolean';
      if (hasSccShape) {
        const isQualified = (horsesPlayerResult as any).isQualified;
        if (!isQualified) {
          sccResultBadge = (
            <div className={cn(
              'inline-flex items-center justify-center rounded px-2 py-1',
              'bg-white border border-gray-300 animate-in fade-in duration-150',
            )}>
              <span className="text-sm font-bold text-red-600">NQ</span>
            </div>
          );
        } else if (horsesStatePlayerData?.dice) {
          const allDice = horsesStatePlayerData.dice as SCCDieType[];
          const cargoDice = allDice.filter(d => !d.sccType);
          sccResultBadge = (
            <div
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-0.5 py-0.5 animate-in fade-in duration-150',
                isHorsesCurrentlyWinning ? 'bg-poker-gold border border-poker-gold' : 'bg-white border border-gray-300',
              )}
            >
              {cargoDice.slice(0, 2).map((die, idx) => (
                <HorsesDie
                  key={idx}
                  value={die.value}
                  isHeld={false}
                  isRolling={false}
                  canToggle={false}
                  onToggle={() => {}}
                  size="xs"
                  showWildHighlight={false}
                  isSCCDie={false}
                />
              ))}
            </div>
          );
        }
      }
    }

    let chipPresentation: 'auto' | 'hidden' | ReactNode = 'auto';
    if (sccResultBadge) {
      // Anchor-publishing shim — see Horses comment above. Carries
      // `data-chip-center` so OverSeatBadgePortal can resolve the
      // anchor while the default chip disc is unmounted.
      chipPresentation = (
        <div
          aria-hidden
          data-chip-center={player.position}
          data-shim-owner="SccWinScoreBadge"
          className={cn(
            'relative flex items-center justify-center',
            isTablet ? 'w-16 h-16' : 'w-12 h-12',
          )}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ opacity: 0 }}>{sccResultBadge}</div>
        </div>
      );
    }

    return (
      <>
        <CanonicalSeatCluster
          key={player.id}
          slot={slot}
          position={player.position}
          name={displayName}
          chipValue={chipText}
          /* Dice families have no dealer concept. */
          isDealer={false}
          status={participantStatus}
          statusRing={statusRing}
          chipHUD={chipHUD}
          chipDiscChildren={chipDiscChildren}
          chipOverlay={chipOverlay}
          chipPresentation={chipPresentation}
          namePlacement="above-chip"
          onChipClick={isClickable ? () => onPlayerClick!(player) : undefined}
          className={playerSlotZIndex}
          ownerLabel="Slot:MobileGameTable.sccCanonicalSeat"
          playerId={player.id}
        />
        {sccResultBadge ? (
          <OverSeatBadgePortal
            key={`scc-badge-${player.id}`}
            position={player.position}
            ownerLabel="ShellOverlay:SccWinScoreBadge"
          >
            {sccResultBadge}
          </OverSeatBadgePortal>
        ) : null}
      </>
    );
  };


  return <HolmDealRuntimeMaybe
    handContextId={gameType === 'holm-game' ? (handContextId ?? null) : null}
    gameType={gameType}
  >
    {gameType === 'holm-game' && handContextId && currentPlayer && (currentPlayer as any).id && typeof buckPosition === 'number' && typeof dealerPosition === 'number' && (
      <>
        <HolmDealOrchestrator
          handContextId={handContextId}
          seats={players.filter(p => p.status === 'active' && !p.sitting_out).map(p => ({ playerId: p.id, position: p.position }))}
          buckPosition={buckPosition}
          dealerPosition={dealerPosition}
          selfPlayerId={(currentPlayer as any).id}
          selfPosition={currentPlayer?.position ?? null}
          cardsPerPlayer={4}
          selfHand={currentPlayerCards}
          communityCards={communityCards ?? []}
          soloDeclared={!!isSoloVsChucky}
          chuckyCards={chuckyCards ?? null}
        />
        <HolmDealPhaseHost
          handContextId={handContextId}
          soloDeclared={!!isSoloVsChucky}
          chuckyCount={(chuckyCards ?? []).length}
        />
      </>
    )}
    <ThreeFiveSevenDealRuntimeMaybe handContextId={threeFiveSevenHandContextId}>
    <ThreeFiveSevenTimerGateReporter onAllowedChange={on357TimerAllowedChange} />
    <div className="flex flex-col h-full min-h-0 overflow-hidden relative bg-transparent">
      {threeFiveSevenWaveContextId && threeFiveSevenSelfPlayerId && threeFiveSevenDealerPosition > 0 && threeFiveSevenActiveSeats.length > 0 ? (
        <ThreeFiveSevenDealOrchestrator
          waveContextId={threeFiveSevenWaveContextId}
          dealerPosition={threeFiveSevenDealerPosition}
          selfPlayerId={threeFiveSevenSelfPlayerId}
          selfPosition={currentPlayer?.position ?? null}
          activeSeats={threeFiveSevenActiveSeats}
          cardsThisWave={cardsThisWaveFor357(currentRound ?? 0)}
        />
      ) : null}
      

      {/* Status badges moved to bottom section */}
      
      {/* Main table area - USE MORE VERTICAL SPACE */}
      {/* TOP safe-area spacer — pixels donated from Row 4 (pane) that
          appear ABOVE the felt region. Provides clearance into which
          top-seat names + top-seat artifacts (rendered with
          overflow:visible) can render without colliding with the shell
          header. Width-only token; never reads game type. */}
      <div
        aria-hidden
        data-canonical-shell-play-top-spacer=""
        style={{ flex: '0 0 var(--play-top-safe-area, 0px)', pointerEvents: 'none' }}
      />
      {/* Felt region — height owned by the shell via --shell-felt-h.
          The HUD region below naturally consumes --shell-hud-h, so
          the play/HUD partition is deterministic and proportional. */}
      <div
        ref={tableContainerRef}
        data-canonical-table-container=""
        data-canonical-table-felt-ownership="shell"
        className="relative"
        style={{ height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)', overflow: 'visible' }}
      >

        {/* Phase 3.2 (complete): MobileGameTable no longer owns ANY felt.
            The shell-owned `ShellOwnedFeltHost` (mounted inside
            `PersistentTableShell` for every poker-family route) is the
            sole `data-canonical-felt-surface` for the entire session
            lifecycle. Both the canonical (canonical felt) and
            legacy (gradient ellipse + game-name plate) self-owned felt
            paths have been retired here. The `feltOwnership` prop is
            retained as a no-op data attribute marker for the
            single-felt invariant audit; remove once Game.tsx stops
            passing it. */}

        {/* Canonical slot-owned waiting content — lives INSIDE the table
            container (not a wrapper-level floating overlay). Renders during
            the waiting phase so seated-count and invite/start CTAs are
            owned by the canonical stage. */}
        {isWaitingPhase && waitingSlotContent}

        
        
        
        {/* Turn Spotlight - Holm games and Dice games */}
        {gameType === 'holm-game' && (() => {
          // SPOTLIGHT OWNERSHIP CONTRACT:
          // The spotlight is a pure projection of the authoritative active
          // player (currentTurnPosition). It does NOT maintain visited-set
          // semantics, sticky position caches, or any independent notion of
          // turn identity. It must match the chip ring, action UI, and bot
          // actor at all times. Smoothing is visual-only (opacity/angle
          // transitions inside <TurnSpotlight>) — never target identity.
          const spotlightPosition = allDecisionsIn ? null : (currentTurnPosition ?? null);

          return (
            <TurnSpotlight
              currentTurnPosition={spotlightPosition}
              currentPlayerPosition={currentPlayer?.position ?? null}
              isObserver={!currentPlayer}
              getClockwiseDistance={getClockwiseDistance}
              containerRef={tableContainerRef}
              isVisible={
                roundStatus === 'betting' &&
                !allDecisionsIn &&
                !awaitingNextRound &&
                spotlightPosition !== null &&
                !isWaitingPhase &&
                !isSoloVsChucky &&
                !soloVsChuckyTableLocked
              }
              shellOwned={true}
            />
          );
        })()}



        
        {/* Turn Spotlight - Dice games (Horses/SCC) - DISABLED */}
        {diceGameplayUiActive && horsesController.enabled && (
          <TurnSpotlight
            currentTurnPosition={horsesController.currentTurnPlayer?.position ?? null}
            currentPlayerPosition={currentPlayer?.position ?? null}
            isObserver={!currentPlayer}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            isVisible={horsesController.gamePhase === 'playing' && horsesController.currentTurnPlayerId !== null}
            useFullCoverage={true}
            disabled={true}
          />
        )}
        
        {/* Turn Spotlight - Dealer Selection Winner */}
        {dealerSelectionWinnerPosition !== null && dealerSelectionWinnerPosition !== undefined && (
          <TurnSpotlight
            currentTurnPosition={dealerSelectionWinnerPosition}
            currentPlayerPosition={currentPlayer?.position ?? null}
            isObserver={!currentPlayer}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            isVisible={true}
            shellOwned={true}
          />
        )}
        
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
          anteAmount={potInPerPlayerAmount}
          chipAmount={potInPerPlayerAmount}
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

            // CRITICAL: Capture expected pot and total BEFORE parent clears them
            // (parent clears props in onAnteAnimationStarted, but we need values 800ms later in onChipsArrived)
            const isPussyTaxTrigger = anteAnimationTriggerId?.startsWith('pussy-tax-');
            const perPlayerAmount = getPotInPerPlayerAmount();
            const activePlayers = players.filter((p) => !p.sitting_out);

            // DEBUG: Log all values used in estimation
            console.log('[ANTE_ANIM_DEBUG] Animation starting', {
              triggerId: anteAnimationTriggerId,
              anteAmountProp: anteAmount,
              pussyTaxValueProp: pussyTaxValue,
              potInPerPlayerAmount,
              perPlayerAmountComputed: perPlayerAmount,
              activeCount: activePlayers.length,
              preAnteChips,
              expectedPostAnteChips,
              anteAnimationExpectedPot,
              pot,
            });

            if (perPlayerAmount <= 0 || activePlayers.length <= 0) {
              console.warn('[ANTE_ANIM] Invalid perPlayerAmount/activeCount at animation start - clearing trigger', {
                triggerId: anteAnimationTriggerId,
                perPlayerAmount,
                activeCount: activePlayers.length,
              });
              onAnteAnimationStarted?.();
              isAnteAnimatingRef.current = false;
              return;
            }

            const totalAmount = perPlayerAmount * activePlayers.length;
            const postPotFromProps = anteAnimationExpectedPot ?? pot;
            const postPot = isPussyTaxTrigger ? postPotFromProps : Math.max(postPotFromProps, totalAmount);

            // Lock these values in refs so onChipsArrived can use them
            lockedAnteExpectedPotRef.current = postPot;
            lockedAnteTotalRef.current = totalAmount;

            console.log('[ANTE_ANIM_DEBUG] Computed values', {
              totalAmount,
              postPotFromProps,
              postPot,
              willUseExpectedPostAnteChips: !!expectedPostAnteChips,
            });

            // Prefer expectedPostAnteChips only if it is consistent with our per-player amount.
            const expectedChipsConsistent = (() => {
              if (!expectedPostAnteChips || !preAnteChips) return false;
              for (const p of activePlayers) {
                const pre = preAnteChips[p.id];
                const post = expectedPostAnteChips[p.id];
                if (typeof pre === 'number' && typeof post === 'number') {
                  return pre - post === perPlayerAmount;
                }
              }
              return false;
            })();

            if (expectedPostAnteChips && expectedChipsConsistent) {
              console.log('[ANTE_ANIM_DEBUG] Using expectedPostAnteChips for display', expectedPostAnteChips);
              lockedChipsRef.current = { ...expectedPostAnteChips };
              setDisplayedChips({ ...expectedPostAnteChips });
            } else {
              if (expectedPostAnteChips && !expectedChipsConsistent) {
                console.warn('[ANTE_ANIM_DEBUG] Ignoring expectedPostAnteChips (inconsistent with perPlayerAmount)', {
                  perPlayerAmount,
                  expectedPostAnteChips,
                  preAnteChips,
                });
              }

              // Fallback: compute based on a trusted perPlayerAmount.
              const newLockedChips: Record<string, number> = {};
              activePlayers.forEach((p) => {
                const preFromSnapshot = preAnteChips?.[p.id];
                const snapshotLooksValid =
                  typeof preFromSnapshot === 'number' &&
                  Math.abs((preFromSnapshot - p.chips) - perPlayerAmount) <= 1;

                const chipsBefore = snapshotLooksValid ? preFromSnapshot : p.chips;
                newLockedChips[p.id] = chipsBefore - perPlayerAmount;
              });

              console.log('[ANTE_ANIM_DEBUG] Fallback computed chips', { newLockedChips, preAnteChips });
              lockedChipsRef.current = newLockedChips;
              setDisplayedChips(newLockedChips);
            }

            // Clear the trigger so it doesn't fire again on status change
            onAnteAnimationStarted?.();

            // Lock pot display at PRE-ANTE value for the duration of the chip travel
            potLockRef.current = true;

            // Calculate pre-ante pot by subtracting the total ante amount from the expected post-ante pot.
            // This works for ALL ante types: fresh antes ($0 pot), rollovers (existing pot), and pussy tax.
            // For a fresh ante: postPot=4, totalAmount=4 → preAntePot=0
            // For a rollover:   postPot=6, totalAmount=3 → preAntePot=3 (keeps existing pot visible)
            // For pussy tax:    postPot=5, totalAmount=1 → preAntePot=4 (keeps existing pot visible)
            const preAntePot = Math.max(0, postPot - totalAmount);

            console.log('[ANTE_ANIM_DEBUG] Setting displayedPot', { preAntePot, displayedPot, postPot, totalAmount, isPussyTaxTrigger });
            if (displayedPot !== preAntePot) {
              setDisplayedPot(preAntePot);
            }
          }}
          onChipsArrived={() => {
            // Use LOCKED values captured at animation start (props may have been cleared by parent)
            const lockedExpectedPot = lockedAnteExpectedPotRef.current;
            const lockedTotalAmount = lockedAnteTotalRef.current;
            
            // Determine if this was a pussy tax trigger (use locked value or check triggerId pattern)
            const isPussyTaxTrigger = anteAnimationTriggerId?.startsWith('pussy-tax-');

            // Update pot display when chips arrive.
            // CRITICAL: Use locked expected pot (captured at animation start before parent cleared it)
            if (lockedExpectedPot !== null && lockedExpectedPot > 0) {
              setDisplayedPot(lockedExpectedPot);

              if (!isPussyTaxTrigger) {
                initialAntePotGuardRef.current = {
                  expectedPot: lockedExpectedPot,
                  expiresAt: Date.now() + 8000,
                };
              }
            } else {
              // Fallback: use locked total amount
              setDisplayedPot(prev => {
                const next = prev + lockedTotalAmount;

                if (!isPussyTaxTrigger) {
                  initialAntePotGuardRef.current = {
                    expectedPot: next,
                    expiresAt: Date.now() + 8000,
                  };
                }

                return next;
              });
            }

            // Clear locked refs
            lockedAnteExpectedPotRef.current = null;
            lockedAnteTotalRef.current = 0;

            // Unlock pot syncing after chips arrive (POT-IN complete)
            potLockRef.current = false;
            if (potLockSafetyTimeoutRef.current) {
              window.clearTimeout(potLockSafetyTimeoutRef.current);
              potLockSafetyTimeoutRef.current = null;
            }
            console.log('[POT_LOCK] unlock(chips-arrived)', { gameId: potMemoryKey, backendPot: pot, lockedExpectedPot, lockedTotalAmount });
            // Keep locked values active - the useEffect watching players will clear
            // them automatically when backend values match expected values
            isAnteAnimatingRef.current = false;
            setAnteFlashTrigger({ id: `ante-${Date.now()}`, amount: lockedTotalAmount });
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
          triggerId={chuckyLossTriggerIdGated}
          specificPlayerIds={chuckyLossPlayerIds}
           onAnimationStart={() => {
             // Freeze pot at PRE-loss value (backend pot is already post-loss by the time we animate)
             const totalLoss = chuckyLossAmount * chuckyLossPlayerIds.length;
             potLockRef.current = true;

             // If we've already shown the post-loss pot (late trigger), never "rewind".
             if (displayedPot < pot) {
               setDisplayedPot(Math.max(0, pot - totalLoss));
             }

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
            // Chips arrived at pot - show the post-loss pot and unlock syncing (POT-IN complete)
            setDisplayedPot(pot);
            potLockRef.current = false;
            if (potLockSafetyTimeoutRef.current) {
              window.clearTimeout(potLockSafetyTimeoutRef.current);
              potLockSafetyTimeoutRef.current = null;
            }
            console.log('[POT_LOCK] unlock(chucky-loss)', { gameId: potMemoryKey, backendPot: pot });
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
        {holmWinPotTriggerIdGated && (
          <HolmWinPotAnimation
            triggerId={holmWinPotTriggerIdGated}
            amount={holmWinPotAmount}
            winnerPosition={holmWinWinnerPosition}
            winnerPositions={holmWinWinnerPositions}
            currentPlayerPosition={currentPlayer?.position ?? null}
            isCurrentPlayerWinner={
              holmWinWinnerPositions.length > 0
                ? holmWinWinnerPositions.includes(currentPlayer?.position ?? -1)
                : currentPlayer?.position === holmWinWinnerPosition
            }
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            onAnimationStart={() => {
              // POT-OUT animation starting - mark active and use snapped pot
              setPotOutAnimationActive(true);
              setDisplayedPot(0);
              console.log('[HOLM WIN] POT-OUT animation started, snapped pot was:', allDecisionsSnappedPotRef.current);
              try {
                recordHolmPotConsumed(
                  {
                    triggerId: holmWinPotTriggerIdGated ?? null,
                    amount: holmWinPotAmount,
                    winnerPosition: holmWinWinnerPosition,
                    callerFile: 'src/components/MobileGameTable.tsx',
                    callerFn: 'HolmWinPotAnimation.onAnimationStart',
                  },
                  handContextId ?? null,
                );
              } catch { /* noop */ }

              if (gameType === 'holm-game' && gameId) {
                logResolutionGate(
                  {
                    gameId,
                    roundId: handContextId ?? null,
                    handNumber: currentRound ?? 0,
                    stayerPlayerId: soloVsChuckyPlayerIdLocked,
                  },
                  'chip-transfer-start',
                  { trigger: 'holm-win-pot-animation', amount: holmWinPotAmount },
                );
              }
            }}
            onAnimationComplete={() => {
              // FIX: Mark animation as completed to keep pot hidden
              console.log('[HOLM WIN] Animation complete - setting holmWinPotHiddenUntilReset=true');
              setHolmWinPotHiddenUntilReset(true);
              setPotOutAnimationActive(false); // Clear POT-OUT flag
              onHolmWinPotAnimationComplete?.();
              try {
                recordHolmPotComplete(
                  {
                    triggerId: holmWinPotTriggerIdGated ?? null,
                    amount: holmWinPotAmount,
                    callerFile: 'src/components/MobileGameTable.tsx',
                    callerFn: 'HolmWinPotAnimation.onAnimationComplete',
                  },
                  handContextId ?? null,
                );
              } catch { /* noop */ }

              if (gameType === 'holm-game' && gameId) {
                logResolutionGate(
                  {
                    gameId,
                    roundId: handContextId ?? null,
                    handNumber: currentRound ?? 0,
                    stayerPlayerId: soloVsChuckyPlayerIdLocked,
                  },
                  'next-transition-start',
                  { trigger: 'holm-win-pot-animation-complete' },
                );
              }
            }}
          />
        )}
        
        {/* Dice Win Pot Animation (Horses / Ship Captain Crew): straight pot → winner (no confetti) */}
        {horsesWinPotTriggerId && (
          <PotToPlayerAnimation
            triggerId={horsesWinPotTriggerId}
            amount={horsesWinPotAmount}
            winnerPosition={horsesWinWinnerPosition}
            currentPlayerPosition={currentPlayer?.position ?? null}
            getClockwiseDistance={getClockwiseDistance}
            containerRef={tableContainerRef}
            gameType={gameType}
            onAnimationStart={() => {
              setPotOutAnimationActive(true);
              setDisplayedPot(0);
            }}
            onAnimationEnd={() => {
              setHolmWinPotHiddenUntilReset(true);
              setPotOutAnimationActive(false);
              onHorsesWinPotAnimationComplete?.();
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
               // Freeze pot at PRE-loss value (backend pot is already post-loss by the time we animate)
               const totalLoserPay = holmShowdownMatchAmount * holmShowdownLoserIds.length;
               potLockRef.current = true;

               // If we've already shown the post-loss pot (late trigger), never "rewind".
               if (displayedPot < pot) {
                 setDisplayedPot(Math.max(0, pot - totalLoserPay));
               }

              // Backend ALREADY deducted chips. Show pre-loss values.
              const newDisplayedChips: Record<string, number> = {};
              holmShowdownLoserIds.forEach(loserId => {
                const loser = players.find(p => p.id === loserId);
                if (loser) {
                  newDisplayedChips[loserId] = loser.chips + holmShowdownMatchAmount;
                }
              });
              setDisplayedChips(newDisplayedChips);
            }}
            onChipsArrived={() => {
              // Chips arrived at pot - show post-loss pot and unlock (POT-IN complete)
              setDisplayedPot(pot);
              potLockRef.current = false;
              if (potLockSafetyTimeoutRef.current) {
                window.clearTimeout(potLockSafetyTimeoutRef.current);
                potLockSafetyTimeoutRef.current = null;
              }
              console.log('[POT_LOCK] unlock(showdown-losers)', { gameId: potMemoryKey, backendPot: pot });
              setDisplayedChips({});
              // Trigger pot flash with NET change (losers paid - winner took)
              // Since winner already took pot, new pot = losers' match total
              const totalLoserPay = holmShowdownMatchAmount * holmShowdownLoserIds.length;
              setAnteFlashTrigger({ id: `showdown-losers-in-${Date.now()}`, amount: totalLoserPay });
              onHolmShowdownLosersEnded?.();
            }}
          />
        )}
        
        {(() => {
          recordBucksForensic('OVERLAY_RENDERED', {
            ownerFile: 'src/components/MobileGameTable.tsx',
            ownerComponent: 'MobileGameTable',
            ownerBranch: 'BucksOnYouAnimation@~8031',
            activeBuckPresentationId,
            handContextId: handContextId ?? null,
            buckPosition: buckPosition ?? null,
            currentRound: typeof currentRound === 'number' ? currentRound : null,
            gameStatus: gameStatus ?? null,
            roundStatus: roundStatus ?? null,
            textSource: 'BUCKS_ON_YOU_EXPLICIT_ANIMATION_COMPONENT',
            isGenericAnnouncement: false,
          });
          return null;
        })()}
        <BucksOnYouAnimation
          presentationId={activeBuckPresentationId}
          onComplete={(completedId) => {
            // Accept completion only when it matches the currently-active
            // presentation. Stale completions from older IDs are ignored.
            if (completedId !== activeBuckPresentationId) {
              recordBucksForensic('SHOW_SUPPRESSED', {
                predicate: 'stale-completion-ignored',
                completedId,
                activeBuckPresentationId,
              });
              return;
            }
            const gatedHci = buckOverlayGatedHciRef.current;
            recordBucksForensic('DISMISSED', {
              ownerFile: 'src/components/MobileGameTable.tsx',
              ownerComponent: 'MobileGameTable',
              ownerBranch: 'BucksOnYouAnimation.onComplete',
              handContextId: handContextId ?? null,
              gatedHci,
              completedId,
            });
            // Single state transition: clear active id + release gate.
            setActiveBuckPresentationId(null);
            if (gatedHci) {
              releaseBuckPresentationGate(gatedHci);
              buckOverlayGatedHciRef.current = null;
              recordBucksForensic('LATCH_CLEARED', {
                handContextId: gatedHci, predicate: 'BUCKS_GATE_RELEASED',
              });
            }
          }}
        />

        
        
        {/* No Qualify Animation (Ship Captain Crew only) */}
        {diceGameplayUiActive && (gameType === 'ship-captain-crew') && (
          <NoQualifyAnimation 
            show={horsesController.showNoQualifyAnimation} 
            playerName={horsesController.noQualifyPlayerName ?? undefined}
            onComplete={horsesController.handleNoQualifyAnimationComplete}
          />
        )}
        
        {/* Midnight Animation (Ship Captain Crew only - when someone rolls 12) */}
        {diceGameplayUiActive && (gameType === 'ship-captain-crew') && (
          <MidnightAnimation 
            show={horsesController.showMidnightAnimation} 
            playerName={horsesController.midnightPlayerName ?? undefined}
            onComplete={horsesController.handleMidnightAnimationComplete}
          />
        )}
        
        {/* Leg Earned Animation (3-5-7 only) */}
        <LegEarnedAnimation 
          show={showLegEarned} 
          playerName={legEarnedPlayerName}
          legValue={legValue}
          targetPosition={(() => {
            // Canonical endpoint resolution (P8.2b leg-award patch).
            // Active and observer projections both resolve through the
            // same seat anchor markers — no relative-slot math here.
            if (!legEarnedPlayerPosition) return undefined;
            const container = tableContainerRef.current;
            if (!container) return undefined;
            const resolved = resolveChipEndpoint({
              ref: { kind: 'seat', position: legEarnedPlayerPosition },
              container,
              debugLabel: '357-leg-earned',
            });
            if (!resolved) return undefined;
            const rect = container.getBoundingClientRect();
            if (!rect.width || !rect.height) return undefined;
            return {
              top: `${(resolved.y / rect.height) * 100}%`,
              left: `${(resolved.x / rect.width) * 100}%`,
            };
          })()}
          isWinningLeg={isWinningLegAnimation}
          suppressWinnerOverlay={gameType !== 'holm-game'} // Suppress for 3-5-7 - has its own win animation
          onComplete={() => {
            setShowLegEarned(false);
            legAnimationActiveRef.current = false; // Reset ref so next leg can trigger
            // For 3-5-7: When winning leg animation completes, immediately start the win animation sequence
            // GUARD: Only start if not already in progress (prevents double-firing)
            if (
              gameType !== 'holm-game' &&
              isWinningLegAnimation &&
              threeFiveSevenWinnerId &&
              threeFiveSevenWinPhaseRef.current === 'idle'
            ) {
              // Mark this win sequence as "handled" even if the legacy parent trigger is already cleared.
              // This prevents legs from re-appearing when we return to idle.
              lastThreeFiveSevenTriggerRef.current = threeFiveSevenWinTriggerId ?? `357-seq-${Date.now()}`;

              // Lock stable legs snapshot for the whole sequence.
              threeFiveSevenLegsSnapshotRef.current = threeFiveSevenCachedLegPositions;

              // IMPORTANT: Clear the parent trigger (if any) so the legacy trigger-based effect cannot start a 2nd sequence later.
              onThreeFiveSevenWinAnimationStarted?.();

              console.log('[357 WIN] LegEarnedAnimation complete for winning leg, starting legs-to-player phase immediately');

              // CRITICAL: Only set animation ID if not already set by the trigger-based effect (Path A).
              // If we overwrite it here, the delay timer's animationId check will fail and skip completion.
              if (!currentAnimationIdRef.current) {
                const animationId = `anim-${Date.now()}`;
                currentAnimationIdRef.current = animationId;
              }

              // Set phase to legs-to-player to start the sweep animation
              setThreeFiveSevenWinPhase('legs-to-player');
              threeFiveSevenWinPhaseRef.current = 'legs-to-player';
              setLegsToPlayerTriggerId(`legs-to-player-${Date.now()}`);
            }
          }}
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
            legValue={legValue}
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
            onAnimationEnd={() => {
              handlePotToPlayerComplete357();
            }}
          />
        )}
        
        {/* threeFiveSeven.winnerTabledCardsStage — Wave 5D anchored.
            Persistent stage: stays mounted across the entire win
            lifecycle (waiting → legs-to-player → pot-to-player → delay
            → teardown). Entry spin-in plays once (rounds 1-2 + Show
            Cards) and never replays — the DOM root persists. Animation
            distances are percentage-based (relative to the slot's own
            height, which derives from assignedRect.height via vmin),
            so no fixed-px translates and no magic percentages. */}
        {(() => {
          const winnerStageVisible =
            gameType !== 'holm-game' &&
            !!threeFiveSevenWinnerId &&
            threeFiveSevenWinPhase !== 'idle' &&
            threeFiveSevenWinnerCards.length > 0 &&
            (currentRound === 3 || winner357ShowCards);
          if (gameType === 'holm-game') return null;
          return (
            <ThreeFiveSevenGameplayGeometryProvider
              winnerTabledCardsVisible={winnerStageVisible}
            >
              {winnerStageVisible && (
                <ThreeFiveSevenAnchoredSlot
                  artifactId="threeFiveSeven.winnerTabledCardsStage"
                  zIndex={20}
                >
                  <div
                    className="flex flex-col items-center justify-center w-full h-full"
                    style={{
                      animation:
                        currentRound !== 3 && winner357ShowCards
                          ? 'winner357TableSpinIn 1.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards'
                          : undefined,
                      willChange: 'transform, opacity',
                    }}
                  >
                    <PlayerHand
                      cards={threeFiveSevenWinnerCards}
                      isHidden={currentRound === 3 ? !winner357ShowCards : false}
                      gameType={gameType}
                      currentRound={currentRound}
                      showSeparated={currentRound === 3}
                    />
                  </div>
                  <style>{`
                    @keyframes winner357TableSpinIn {
                      0%   { opacity: 0; transform: translateY(150%) rotate(0deg); }
                      40%  { opacity: 1; transform: translateY(60%)  rotate(270deg); }
                      70%  { opacity: 1; transform: translateY(20%)  rotate(540deg); }
                      100% { opacity: 1; transform: translateY(0)    rotate(720deg); }
                    }
                  `}</style>
                </ThreeFiveSevenAnchoredSlot>
              )}
            </ThreeFiveSevenGameplayGeometryProvider>
          );
        })()}
        
        {/* Pot display - centered and larger for 3-5-7, above community cards for Holm */}
        {/* FIX: Use visibility:hidden instead of conditional rendering to prevent ValueChangeFlash remount */}
        {(() => {
          const shouldHidePot = !!(isWaitingPhase || holmWinPotTriggerIdGated || holmWinPotHiddenUntilReset ||
            threeFiveSevenWinPhase === 'pot-to-player' || threeFiveSevenWinPhase === 'delay' || threeFiveSevenPotHiddenUntilReset);

          // IMPORTANT: During the initial ante animation we must never briefly show a stale pre-ante pot
          // (e.g. "$4") before the locked pre-ante pot is applied. For initial ante, the pre-ante pot
          // is always 0. Keep pussy-tax behavior unchanged.
          const isInitialAntePending = !!(anteAnimationTriggerId && !anteAnimationTriggerId.startsWith('pussy-tax-'));

          return (
            <div 
              className={`absolute left-1/2 transform -translate-x-1/2 z-20 transition-all duration-300 ${
                gameType === 'holm-game' 
                  ? (isHolmMultiPlayerShowdown ? 'top-[50%] -translate-y-full' : 'top-[35%] -translate-y-full')
                  : isDiceGame
                    ? 'top-[28%] -translate-y-full'  /* Dice games: moved up since label is now single line */
                    : 'top-1/2 -translate-y-1/2'
              }`}
              style={{ 
                visibility: shouldHidePot ? 'hidden' : 'visible',
                opacity: shouldHidePot ? 0 : 1,
                pointerEvents: shouldHidePot ? 'none' : 'auto'
              }}
            >
              {(() => {
                const canonicalFeltKind = resolveCanonicalFeltKind(gameType);
                const potValueText = `$${formatChipValue(Math.round(
                  gameType !== 'holm-game' && threeFiveSevenWinPhase !== 'idle' && threeFiveSevenWinPotAmount > 0
                    ? threeFiveSevenWinPotAmount
                    : isInitialAntePending
                      ? 0
                      : displayedPot
                ))}`;
                if (canonicalFeltKind) {
                  // P9.1/P9.2/P9.3: shell-defined pot pill for Holm + 3-5-7 + Horses + SCC + Yahtzee.
                  const isDiceKind = canonicalFeltKind === 'horses' || canonicalFeltKind === 'ship-captain-crew' || canonicalFeltKind === 'yahtzee';
                  const prominentKind = canonicalFeltKind === 'holm-game' || isDiceKind;
                  const potSize: 'compact' | 'regular' | 'prominent' =
                    prominentKind
                      ? 'prominent'
                      : is357MultiPlayerShowdown
                        ? 'compact'
                        : 'regular';
                  const valueClass =
                    prominentKind
                      ? (isTablet ? 'text-4xl' : isDesktop ? 'text-3xl' : 'text-xl')
                      : is357MultiPlayerShowdown
                        ? (isTablet ? 'text-xl' : 'text-base')
                        : (isTablet ? 'text-4xl' : 'text-3xl');
                  return (
                    <CanonicalPotZone size={potSize} isTablet={isTablet} isDesktop={isDesktop}>
                      <span className={cn('text-poker-gold font-bold', valueClass)}>{potValueText}</span>
                      <ValueChangeFlash
                        value={pot}
                        position="top-right"
                        disabled={shouldHidePot}
                        manualTrigger={anteFlashTrigger}
                      />
                    </CanonicalPotZone>
                  );
                }
                // Legacy pot pill (other games / flag off).
                return (
                  <div
                    data-pot-anchor=""
                    className={cn(
                      "relative bg-black/70 backdrop-blur-sm rounded-full border border-poker-gold/60",
                      gameType === 'holm-game' || isDiceGame
                        ? (isTablet ? 'px-10 py-4' : isDesktop ? 'px-8 py-3' : 'px-5 py-1.5')
                        : is357MultiPlayerShowdown
                          ? (isTablet ? 'px-5 py-2' : 'px-3 py-1')
                          : (isTablet ? 'px-10 py-4' : 'px-8 py-3')
                    )}
                  >
                    <span className={cn(
                      "text-poker-gold font-bold",
                      gameType === 'holm-game' || isDiceGame
                        ? (isTablet ? 'text-4xl' : isDesktop ? 'text-3xl' : 'text-xl')
                        : is357MultiPlayerShowdown
                          ? (isTablet ? 'text-xl' : 'text-base')
                          : (isTablet ? 'text-4xl' : 'text-3xl')
                    )}>{potValueText}</span>
                    <ValueChangeFlash
                      value={pot}
                      position="top-right"
                      disabled={shouldHidePot}
                      manualTrigger={anteFlashTrigger}
                    />
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* High Card Dealer Selection — render every participant's card on the felt,
            including the current player's. Dealer-selection is not normal gameplay
            hand rendering; the bottom card area is suppressed during this phase, so
            the overlay must own complete presentation. */}
        {(() => {
          // ── HIGH CARD LEAK DBG ──
          // The session-level high-card overlay must render ONLY when the game
          // is actually in the SESSION dealer-selection status. Cribbage's
          // dealer-selection cards live in the SAME `dealerSelectionCards`
          // state (Game.tsx shares one store between session-DS and cribbage-DS),
          // so without this guard, any frame where MobileGameTable is mounted
          // while `dealerSelectionCards` still holds the just-finished cribbage
          // draw will flash those cards in session-high-card visual layout
          // (opponent slots / over chip stacks / felt-front for self).
          //
          // Acceptance: at "Dealer configuring next game", drawCards=null,
          // spotlight=null, transient overlays empty.
          const hasCards = !!(dealerSelectionCards && dealerSelectionCards.length > 0);
          const isSessionDealerSelection = gameStatus === 'dealer_selection';
          if (hasCards && !isSessionDealerSelection) {
            recordWaitingLifecycleIfChanged(
              `highcard:leak-suppressed:${gameId}:${gameStatus}:${dealerSelectionCards.length}`,
              'HIGH_CARD_LEAK_DBG suppressed session-high-card render (cards present but gameStatus is not dealer_selection)',
              {
                surface: 'MobileGameTable',
                gameId,
                gameStatus: gameStatus ?? null,
                drawCardsCount: dealerSelectionCards.length,
                drawCardsIds: dealerSelectionCards.map(
                  (c) => `p${c.position}:${c.card?.rank ?? '?'}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}:w${c.isWinner ? 1 : 0}`,
                ),
                drawSource: 'shared Game.tsx dealerSelectionCards state (session + cribbage)',
                rendererUsed: 'MobileGameTable session-dealer-selection-overlay (SUPPRESSED)',
                drawRound: dealerSelectionCards[0]?.roundNumber ?? null,
                isRedraw: dealerSelectionCards.length > (new Set(dealerSelectionCards.map(c => c.position))).size,
                sessionHighCardMounted: false,
                cribbageDealerSelectionMounted: 'unknown (cribbage table-owned)',
                hint: 'cards belong to the just-finished cribbage dealer-selection; clear dealerSelectionCards on cribbage_dealer_selection→game_over transition or before remounting MGT',
              },
            );
            return null;
          }
          return null;
        })()}
        {dealerSelectionCards && dealerSelectionCards.length > 0 && gameStatus === 'dealer_selection' && highCardOverlayPortal(
          <div
            data-wartime-high-card-container={gameId}
            data-wartime-renderer-instance={`MobileGameTable:${instanceLabel}:${gameId ?? 'no-game'}`}
            data-wartime-component="MobileGameTable"
            data-wartime-render-branch="session-dealer-selection-overlay"
            data-wartime-surface="HighCardRender"
            data-shell-overlay-owner="HighCardReveal"
            data-shell-overlay-consumer="HighCardReveal"
            className="absolute inset-0 pointer-events-none"
          >


            <DealerSelectionVisibilityTracker
              gameId={gameId}
              cardCount={dealerSelectionCards.length}
              winnerPosition={dealerSelectionWinnerPosition ?? null}
              viewerHasCurrentPlayer={!!currentPlayer}
            />

            {/* Cards for each player position arranged around the table (relative to current player) */}
            {(() => {
              // Get unique positions from dealer selection cards
              const uniquePositions = [...new Set(dealerSelectionCards.map(c => c.position))];

              // Slot position mapping for relative positioning (matches animation components).
              // Slot -1 is reserved for the seated viewer themselves (bottom-center).
              const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
                if (slotIndex < 0) return { top: 82, left: 50 }; // seated viewer (self)
                const slots: Record<number, { top: number; left: number }> = {
                  0: { top: 85, left: 10 },   // Bottom-left
                  1: { top: 50, left: 5 },    // Middle-left
                  2: { top: 12, left: 15 },   // Top-left
                  3: { top: 12, left: 85 },   // Top-right
                  4: { top: 50, left: 95 },   // Middle-right
                  5: { top: 85, left: 90 },   // Bottom-right
                };
                return slots[slotIndex] || { top: 50, left: 50 };
              };

              // Absolute position mapping for observers (no currentPlayer)
              const getAbsolutePositionPercent = (position: number): { top: number; left: number } => {
                const positions: Record<number, { top: number; left: number }> = {
                  1: { top: 12, left: 15 },   // Top-left
                  2: { top: 50, left: 5 },    // Left
                  3: { top: 85, left: 10 },   // Bottom-left
                  4: { top: 85, left: 50 },   // Bottom-center
                  5: { top: 85, left: 90 },   // Bottom-right
                  6: { top: 50, left: 95 },   // Right
                  7: { top: 12, left: 85 },   // Top-right
                };
                return positions[position] || { top: 50, left: 50 };
              };

              return uniquePositions.map((position) => {
                // Get all cards for this position (including tie-breakers)
                const allCardsForPosition = dealerSelectionCards.filter(c => c.position === position);
                if (allCardsForPosition.length === 0) return null;

                // Calculate position - use relative slots for seated players, absolute for observers.
                // The current player (viewer's seat) renders at slot -1 (bottom-center self slot).
                let posPercent: { top: number; left: number };
                if (currentPlayer) {
                  if (currentPlayer.position === position) {
                    posPercent = getSlotPercent(-1);
                  } else {
                    const distance = getClockwiseDistance(position);
                    const slotIndex = distance - 1;
                    posPercent = getSlotPercent(slotIndex);
                  }
                } else {
                  posPercent = getAbsolutePositionPercent(position);
                }

                
                const player = players.find(p => p.position === position);
                const playerName = player 
                  ? (player.is_bot 
                      ? getBotAlias(players, player.user_id) 
                      : (player.profiles?.username || `P${position}`))
                  : `P${position}`;
                
                return (
                  <div 
                    key={`dealer-selection-${position}`}
                    className="absolute flex flex-col items-center pointer-events-none"
                    style={{
                      top: `${posPercent.top}%`,
                      left: `${posPercent.left}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {/* Stack all cards for this position (tie-breaker rounds) - positioned directly over chip stack */}
                    <div className="flex gap-1">
                      {allCardsForPosition.map((cardData, idx) => {
                        const _cardRank = (cardData.card as any)?.rank ?? '?';
                        const _cardSuit = (cardData.card as any)?.suit?.[0] ?? '?';
                        return (
                        <div 
                          key={`card-${cardData.roundNumber}-${idx}`}
                          data-dsel-card="1"
                          data-dsel-position={position}
                          data-wartime-high-card="card"
                          data-card-key={`p${position}-r${cardData.roundNumber}-${idx}`}
                          data-card-id={`p${position}:${_cardRank}${_cardSuit}:r${cardData.roundNumber}`}
                          data-player-position={position}
                          className="transition-all duration-500"

                          style={{
                            opacity: cardData.isRevealed ? 1 : 0.9,
                            transform: cardData.isRevealed 
                              ? (cardData.isDimmed ? 'scale(0.95)' : 'scale(1)')
                              : 'scale(1)',
                          }}
                        >

                          <PlayingCard
                            card={cardData.card as CardType}
                            isHidden={!cardData.isRevealed}
                            size="xl"
                            isHighlighted={false}
                            isDimmed={cardData.isDimmed && cardData.isRevealed}
                            className={cn(
                              "shadow-2xl transition-all duration-500",
                              cardData.isDimmed && cardData.isRevealed && "opacity-50"
                            )}
                          />
                        </div>
                        );
                      })}

                    </div>
                    {/* Player name badge removed per user request - cards placed directly over chip stack */}
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Dice game felt dice OR result (rolls happen on the felt, not in the bottom section) */}
        {diceGameplayUiActive && horsesController.enabled && (() => {
          // Wave 5D — compute anchored stage visibility from controller state.
          const _isInHoldPeriod = !!(horsesController.feltDice as any)?.isCompletedHold;
          const _isCompleteOrWaiting =
            (horsesController.gamePhase === 'complete' || horsesController.gamePhase === 'waiting') &&
            !_isInHoldPeriod;
          const _diceArray = (horsesController.feltDice as any)?.dice as any[] | undefined;
          const _hasRolled = _diceArray?.some((d) => d?.value > 0) ?? false;
          const _showResult = !horsesController.feltDice && !!horsesController.currentTurnPlayerId
            && !!horsesController.getPlayerHandResult(horsesController.currentTurnPlayerId);
          const _opponentDiceVisible = !horsesController.isMyTurn && !_showResult && !_isCompleteOrWaiting
            && (_hasRolled || !!horsesController.feltDice);
          const _beatBadgeVisible = horsesController.isMyTurn && !_showResult && !_isCompleteOrWaiting;
          return (
            <DiceGameplayGeometryProvider
              gameType={gameType as DiceGameType}
              opponentDiceVisible={_opponentDiceVisible}
              beatBadgeVisible={_beatBadgeVisible}
            >
              {(() => {
          const logPrefix = `[FELT_BLOCK_DEBUG ${gameType === 'ship-captain-crew' ? 'SCC' : 'HORSES'}]`;

          const FELT_STICKY_MS = 1200;

          const getCachedFeltNode = () => {
            const cached = cachedFeltBlockNodeRef.current;
            if (!cached) return null;

             const withinGrace = Date.now() - cached.at < FELT_STICKY_MS;
             const currentTurnId = horsesController.currentTurnPlayerId ?? null;
             const currentDealerGameId = horsesDealerGameId ?? null;
             const currentRoundId = horsesRoundId ?? null;
             // Only reuse cached node if we're still on the same turn.
             // If the current turn is briefly null during a transition, do NOT reuse the old node;
             // it can display the previous player's final dice.
             const sameTurn = currentTurnId !== null && currentTurnId === cached.turnPlayerId;
              const sameDealerGame = currentDealerGameId !== null && currentDealerGameId === cached.dealerGameId;
              const sameRound = currentRoundId !== null && currentRoundId === cached.roundId;

              return withinGrace && sameDealerGame && sameRound && sameTurn ? cached.node : null;
          };

          const cacheFeltNode = (node: any) => {
            cachedFeltBlockNodeRef.current = {
              at: Date.now(),
              dealerGameId: horsesDealerGameId ?? null,
              roundId: horsesRoundId ?? null,
              turnPlayerId: horsesController.currentTurnPlayerId ?? null,
              node,
            };
            return node;
          };
          
          // Don't show dice when game phase is complete or waiting
          // EXCEPTION: If we're in a completed turn hold period, show the dice
          const isInHoldPeriod = !!(horsesController.feltDice as any)?.isCompletedHold;

          const diceArray = (horsesController.feltDice as any)?.dice as any[] | undefined;
          const currentRollKey = (horsesController.feltDice as any)?.rollKey;
          const feltPlayerId = (horsesController.feltDice as any)?.playerId;
          const rollsRemaining = (horsesController.feltDice as any)?.rollsRemaining as number | undefined;
          const hasRolled = diceArray?.some(d => d?.value > 0) ?? false;
          const showResult = !horsesController.feltDice && !!horsesController.currentTurnPlayerId && !!horsesController.getPlayerHandResult(horsesController.currentTurnPlayerId);
          const showDice = !!horsesController.feltDice && !!diceArray?.length;

          // --- PARENT-LEVEL BRANCH TRACING ---
          // Determine which branch we're about to take
          let feltBranch = "unknown";
          let feltBranchDetail: Record<string, unknown> = {};
          if ((horsesController.gamePhase === 'complete' || horsesController.gamePhase === 'waiting') && !isInHoldPeriod) {
            const cached = getCachedFeltNode();
            feltBranch = cached ? "gamePhase:cached" : "gamePhase:placeholder";
            feltBranchDetail = { gamePhase: horsesController.gamePhase, isInHoldPeriod, hasCached: !!cached };
          } else if (horsesController.isMyTurn && !hasRolled) {
            feltBranch = "myTurn:preRoll";
            feltBranchDetail = { isMyTurn: true, hasRolled: false };
          } else if (!horsesController.isMyTurn && !hasRolled && !showResult) {
            const cached = getCachedFeltNode();
            feltBranch = cached ? "observer:noRoll:cached" : "observer:noRoll:placeholder";
            feltBranchDetail = { isMyTurn: false, hasRolled, showResult, hasCached: !!cached };
          } else if (showResult) {
            feltBranch = "result";
            feltBranchDetail = { showResult: true, feltDice: !!horsesController.feltDice };
          } else if (horsesController.isMyTurn) {
            feltBranch = "myTurn:rolling";
            feltBranchDetail = { isMyTurn: true, hasRolled: true };
          } else {
            feltBranch = "observer:diceLayout";
            feltBranchDetail = {
              showDice,
              feltPlayerId,
              currentTurnPlayerId: horsesController.currentTurnPlayerId,
              diceTableKey: feltPlayerId ?? horsesController.currentTurnPlayerId ?? "no-turn",
              rollsRemaining,
              diceIsHeld: diceArray?.map(d => !!d?.isHeld),
              heldMaskPresent: !!(horsesController.feltDice as any)?.heldMaskBeforeComplete,
            };
          }

          // Log when branch changes OR rollKey changes
          const prevBranch = prevFeltBranchRef.current;
          const prevRollKey = prevFeltRollKeyRef.current;
          const branchChanged = feltBranch !== prevBranch;
          const rollKeyChanged = currentRollKey !== prevRollKey;
          feltBranchCountRef.current++;

          prevFeltBranchRef.current = feltBranch;
          prevFeltRollKeyRef.current = currentRollKey;

          if ((horsesController.gamePhase === 'complete' || horsesController.gamePhase === 'waiting') && !isInHoldPeriod) {

            const cachedNode = getCachedFeltNode();
            if (cachedNode) {
              // Keep debug overlay state consistent
              if (!feltBlockMounted) setTimeout(() => setFeltBlockMounted(true), 0);
              return cachedNode;
            }

            // Keep a stable (invisible) placeholder instead of unmounting.
            // This avoids mount/unmount flicker in the center felt block.
            return (
              <div
                className={cn(
                  "absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2 opacity-0",
                )}
                style={{ pointerEvents: 'none' }}
              />
            );
          }
          
          const currentTurnResult = horsesController.currentTurnPlayerId 
            ? horsesController.getPlayerHandResult(horsesController.currentTurnPlayerId)
            : null;
          const isCurrentTurnWinning = horsesController.currentTurnPlayerId 
            && horsesController.currentlyWinningPlayerIds.includes(horsesController.currentTurnPlayerId);

          const fallbackDice = Array.from({ length: 5 }, () => ({ value: 0, isHeld: false }));
          
          // Check if dice have been rolled (at least one die has a value > 0)
          
          
          // If it's my turn and I haven't rolled yet, show "You are rolling" message + Beat badge
          if (horsesController.isMyTurn && !hasRolled) {
            // Track mount for debug overlay
            if (!feltBlockMounted) {
              setTimeout(() => setFeltBlockMounted(true), 0);
            }
            
            // Get winning result to show what we're trying to beat
            // Use cached result if current one is undefined (prevents flicker during state transitions)
            const liveWinningResult = horsesController.currentWinningResult;
            const liveWinningDice = horsesController.getWinningPlayerDice?.();
            
            // Update cache when we have valid data
            if (liveWinningResult?.description) {
              cachedWinningResultRef.current = {
                description: liveWinningResult.description,
                dice: liveWinningDice ?? null,
                dealerGameId: horsesDealerGameScope,
                roundId: horsesRoundScope,
                source: 'felt-preroll-live-update',
              };
            }
            
            // Use cached result if live one is invalid
            const winningResultToBeat = liveWinningResult ?? 
              (cachedWinningResultRef.current ? { description: cachedWinningResultRef.current.description } : null);
            const winningDice = liveWinningDice ?? cachedWinningResultRef.current?.dice;
            const isSCCGame = gameType === 'ship-captain-crew';
            
            // For SCC, get cargo dice (non-SCC dice with value > 0)
            const cargoDice = isSCCGame && winningDice 
              ? (winningDice as SCCDieType[]).filter(d => !d.isSCC && d.value > 0)
              : null;
            
            const node = (
              <DiceAnchoredSlot
                artifactId={diceBeatBadgeId(gameType as DiceGameType)}
                innerStyle={{ pointerEvents: 'auto' }}
              >
                <AssignedRectFitter>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                      You are rolling
                    </p>
                    {/* Beat badge - show what hand to beat */}
                    {winningResultToBeat && (
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <Target className="text-muted-foreground w-3 h-3" />
                        <span className="text-muted-foreground text-xs">
                          Beat:
                        </span>
                        {isSCCGame && cargoDice && cargoDice.length === 2 ? (
                          <div className="flex items-center gap-1">
                            {cargoDice.map((die, idx) => (
                              <HorsesDie
                                key={idx}
                                value={die.value}
                                isHeld={false}
                                isRolling={false}
                                canToggle={false}
                                size="sm"
                                showWildHighlight={false}
                                forceWhiteBackground={true}
                              />
                            ))}
                          </div>
                        ) : gameType === 'horses' ? (
                          <HorsesHandResultDisplay
                            description={winningResultToBeat.description}
                            isWinning={true}
                            size="sm"
                          />
                        ) : null}
                        {horsesController.isCurrentWinningTied && (
                          <span className="font-medium text-amber-400 text-xs">
                            (Tied)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </AssignedRectFitter>
              </DiceAnchoredSlot>
            );


            return cacheFeltNode(node);
          }
          
          // If observing someone else who hasn't rolled yet, keep a stable placeholder.
          // We also reuse a short-lived cached node to prevent flicker during turn/player transitions.
          if (!horsesController.isMyTurn && !hasRolled && !showResult) {

            const cachedNode = getCachedFeltNode();
            if (cachedNode) {
              if (!feltBlockMounted) setTimeout(() => setFeltBlockMounted(true), 0);
              return cachedNode;
            }

            return (
              <div
                className={cn(
                  "absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2 opacity-0",
                )}
                style={{ pointerEvents: 'none' }}
              />
            );
          }

          // Track mount for debug overlay
          if (!feltBlockMounted) {
            setTimeout(() => setFeltBlockMounted(true), 0);
          }
          // rollsRemaining already declared above for tracing

          if (showResult && currentTurnResult) {
            // Result badge — NOT migrated to anchored framework this wave.
            return (
              <div
                className={cn(
                  "absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2",
                )}
                style={{ pointerEvents: 'auto' }}
              >
                <div className="flex flex-col items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-lg px-4 py-1.5 font-bold",
                      isCurrentTurnWinning && "bg-green-600 text-white",
                    )}
                  >
                    {gameType === 'horses' ? (
                      <HorsesHandResultDisplay
                        description={currentTurnResult.description}
                        isWinning={isCurrentTurnWinning}
                        size="md"
                      />
                    ) : (
                      currentTurnResult.description
                    )}
                  </Badge>
                </div>
              </div>
            );
          }

          if (horsesController.isMyTurn) {
            // My turn — Beat badge stage (Wave 5D anchored).
            const winResult = cachedWinningResultRef.current
              ? { description: cachedWinningResultRef.current.description }
              : null;
            const winDice = cachedWinningResultRef.current?.dice ?? null;

            return (
              <DiceAnchoredSlot
                artifactId={diceBeatBadgeId(gameType as DiceGameType)}
                innerStyle={{ pointerEvents: 'auto', flexDirection: 'column', gap: '0.5rem' }}
              >
                <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                  You are rolling
                </p>
                {winResult && (
                  <div className={cn(
                    "flex items-center justify-center gap-2",
                    isTablet && "gap-4"
                  )}>
                    <Target className={cn(
                      "text-muted-foreground",
                      isTablet ? "w-10 h-10" : "w-3 h-3"
                    )} />
                    <span className={cn(
                      "text-muted-foreground",
                      isTablet ? "text-xl font-medium" : "text-xs"
                    )}>
                      Beat:
                    </span>
                    {gameType === 'ship-captain-crew' && (() => {
                      const cargo = winDice ? (winDice as SCCDieType[]).filter(d => !d.isSCC && d.value > 0) : [];
                      return cargo.length === 2 ? (
                        <div className={cn("flex items-center", isTablet ? "gap-2" : "gap-1")}>
                          {cargo.map((die, idx) => (
                            <HorsesDie
                              key={idx}
                              value={die.value}
                              isHeld={false}
                              isRolling={false}
                              canToggle={false}
                              size={isTablet ? "md" : "sm"}
                              showWildHighlight={false}
                              forceWhiteBackground={true}
                            />
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {gameType === 'horses' && (
                      <HorsesHandResultDisplay
                        description={winResult.description}
                        isWinning={true}
                        size={isTablet ? "md" : "sm"}
                      />
                    )}
                    {horsesController.isCurrentWinningTied && (
                      <span className={cn(
                        "font-medium text-amber-400",
                        isTablet ? "text-base" : "text-xs"
                      )}>
                        (Tied)
                      </span>
                    )}
                  </div>
                )}
              </DiceAnchoredSlot>
            );
          }

          // Observer view — Opponent dice stage (Wave 5D anchored).
          return (
            <DiceAnchoredSlot
              artifactId={diceOpponentDiceStageId(gameType as DiceGameType)}
              innerStyle={{ pointerEvents: 'auto' }}
            >
              <AssignedRectFitter>
                <DiceTableLayout
                  key={`${horsesDealerGameId ?? 'no-dealer-game'}:${horsesRoundId ?? 'no-round'}:${(horsesController.feltDice as any)?.playerId ?? horsesController.currentTurnPlayerId ?? "no-turn"}`}
                  dice={(showDice ? diceArray! : fallbackDice).map((die: any, i: number) => {
                    const showHeldVisual =
                      typeof rollsRemaining === "number" && rollsRemaining < 3 && !!die?.isHeld;
                    return {
                      ...die,
                      isHeld: showHeldVisual,
                    };
                  }) as (HorsesDieType | SCCDieType)[]}
                  isRolling={
                    showDice && horsesController.isMyTurn
                      ? horsesController.isRolling
                      : false
                  }
                  canToggle={false}
                  size="md"
                  gameType={gameType ?? undefined}
                  showWildHighlight={gameType !== 'ship-captain-crew'}
                  useSCCDisplayOrder={gameType === 'ship-captain-crew'}
                  sccHand={gameType === 'ship-captain-crew' ? { dice: (showDice ? diceArray! : fallbackDice) as SCCDieType[] } as SCCHand : undefined}
                  isObserver={true}
                  hideUnrolledDice={!((horsesController.feltDice as any)?.rollKey)}
                  heldMaskBeforeComplete={(horsesController.feltDice as any)?.heldMaskBeforeComplete}
                  previouslyHeldCount={(horsesController.feltDice as any)?.heldCountBeforeComplete}
                  animationOrigin={getDiceAnimationOrigin()}
                  rollKey={(horsesController.feltDice as any)?.rollKey}
                  isQualified={(horsesController.feltDice as any)?.isQualified}
                  cacheKey={`${horsesDealerGameId ?? 'no-dealer-game'}:${horsesRoundId ?? 'no-round'}:${(horsesController.feltDice as any)?.playerId ?? horsesController.currentTurnPlayerId ?? "no-turn"}`}
                />
              </AssignedRectFitter>
            </DiceAnchoredSlot>
          );
              })()}
            </DiceGameplayGeometryProvider>
          );
        })()}

        {/* Wave 5D — Holm anchored gameplay stages.
              ONE descriptor → ONE placement → ONE renderer → ONE DOM root for:
                holm.communityCardsStage
                holm.lonePlayerTabledCardsStage
                holm.chuckyStage
              Stages own geometry; cards derive size from assignedRect.height. */}
        {gameType === 'holm-game' && (() => {
          const communityShouldShow =
            !!approvedCommunityCards &&
            approvedCommunityCards.length > 0 &&
            !!showCommunityCards &&
            (isInGameOverStatus || currentRound === approvedRoundForDisplay);

          const liveLoneSoloPlayerId =
            isSoloVsChucky
              ? (soloVsChuckyPlayerIdLocked ||
                  players.find(p => p.current_decision === 'stay')?.id ||
                  null)
              : null;
          const liveLoneSoloPlayer = liveLoneSoloPlayerId
            ? players.find(p => p.id === liveLoneSoloPlayerId) || null
            : null;
          const liveLoneSoloCards = liveLoneSoloPlayer
            ? getPlayerCards(liveLoneSoloPlayer.id)
            : [];
          // Audit RC2: TABLED_SELF live path must be hand-context-scoped.
          // Require an explicit locked solo player whose lock was captured
          // FOR this handContextId, and that the deal is past PRE_DEAL/DEALING.
          const liveLockMatchesHand =
            !!soloVsChuckyPlayerIdLocked &&
            soloVsChuckyLockHandRef.current === handContextId &&
            liveLoneSoloPlayerId === soloVsChuckyPlayerIdLocked;
          const hasLiveLonePlayer =
            !!isSoloVsChucky &&
            !!liveLoneSoloPlayer &&
            liveLoneSoloCards.length > 0 &&
            liveLockMatchesHand &&
            !holmDealNotReady;

          // Wave 5D follow-up — capture / re-use the persistence snapshot.
          // The snapshot is keyed on handContextId and survives every
          // volatile drop of isSoloVsChucky / current_decision /
          // player_cards through the win sequence. Cleared at the
          // hand-boundary reset effects.
          const snap = lonePlayerStageSnapshotRef.current;
          const fpOf = (arr: Array<{rank:string;suit:string}>) => arr.map(c => `${c.rank}${c.suit}`).join('|');
          const prevSnapBefore = snap
            ? { handContextId: snap.handContextId, playerId: snap.playerId, count: snap.cards.length, fp: fpOf(snap.cards) }
            : null;
          const prevStickyBefore = tabledSelfStickyRef.current
            ? { handContextId: tabledSelfStickyRef.current.handContextId, playerId: tabledSelfStickyRef.current.playerId, count: tabledSelfStickyRef.current.cards.length, fp: fpOf(tabledSelfStickyRef.current.cards) }
            : null;
          let snapshotWriteReason: string | null = null;
          if (hasLiveLonePlayer && handContextId) {
            const sameHand = snap?.handContextId === handContextId;
            const sameId = sameHand && snap?.playerId === liveLoneSoloPlayer!.id;
            // Update card identities only while live data is fresh, so the
            // snapshot tracks any late-arriving rabbit-hunt updates within
            // the same hand. Player id is captured once and not re-bound.
            if (!sameHand || !sameId) {
              lonePlayerStageSnapshotRef.current = {
                handContextId,
                playerId: liveLoneSoloPlayer!.id,
                cards: liveLoneSoloCards,
              };
              snapshotWriteReason = !sameHand ? 'new-hand' : 'new-player-id';
            } else if (
              liveLoneSoloCards.length > 0 &&
              liveLoneSoloCards.length >= (snap?.cards.length ?? 0)
            ) {
              lonePlayerStageSnapshotRef.current = {
                handContextId,
                playerId: liveLoneSoloPlayer!.id,
                cards: liveLoneSoloCards,
              };
              snapshotWriteReason = 'refresh-cards-monotonic';
            }
          }

          // ── TABLED_SELF sticky predicate ──────────────────────────────
          // Release the sticky snapshot ONLY when a new non-null
          // handContextId proves we are in NEXT_HAND PRE_DEAL.
          let stickyClearReason: string | null = null;
          let stickyWriteReason: string | null = null;
          if (
            tabledSelfStickyRef.current &&
            handContextId &&
            tabledSelfStickyRef.current.handContextId !== handContextId
          ) {
            stickyClearReason = 'new-handContextId';
            tabledSelfStickyRef.current = null;
          }
          // Capture / refresh the sticky snapshot whenever the live
          // signal is good (mirrors lonePlayerStageSnapshotRef updates).
          if (hasLiveLonePlayer && handContextId) {
            tabledSelfStickyRef.current = {
              handContextId,
              playerId: liveLoneSoloPlayer!.id,
              cards: liveLoneSoloCards,
            };
            stickyWriteReason = 'live-good';
          }

          const activeSnap =
            // Sticky snapshot survives transient handContextId nulls and
            // any intermediate lifecycle wipes of lonePlayerStageSnapshotRef.
            tabledSelfStickyRef.current ??
            (lonePlayerStageSnapshotRef.current?.handContextId &&
            (!handContextId ||
              lonePlayerStageSnapshotRef.current.handContextId === handContextId)
              ? lonePlayerStageSnapshotRef.current
              : null);
          const activeSnapSourceTag: 'sticky' | 'persistence' | 'none' =
            tabledSelfStickyRef.current ? 'sticky'
            : (activeSnap ? 'persistence' : 'none');

          const loneSoloPlayer =
            liveLoneSoloPlayer ??
            (activeSnap
              ? players.find(p => p.id === activeSnap.playerId) || null
              : null);
          const loneSoloCards =
            liveLoneSoloCards.length > 0
              ? liveLoneSoloCards
              : (activeSnap?.cards ?? []);
          const loneSoloCardsSourceTag: 'liveLoneSoloCards' | 'activeSnap.cards' | 'empty' =
            liveLoneSoloCards.length > 0 ? 'liveLoneSoloCards'
            : (activeSnap?.cards && activeSnap.cards.length > 0 ? 'activeSnap.cards' : 'empty');

          ffRecord({
            writerId: 'MobileGameTable.tsx:loneSoloDerivation:L8961',
            source: 'HOLM_OLD_CARD_LINEAGE',
            marker: 'HOLM_OLD_CARD_LONE_SOLO_DERIVATION',
            identity: {
              segmentId: handContextId ?? null,
              playerId: loneSoloPlayer?.id ?? null,
            },
            payload: {
              activeHandContextId: handContextId ?? null,
              isSoloVsChucky: !!isSoloVsChucky,
              soloVsChuckyPlayerIdLocked: soloVsChuckyPlayerIdLocked ?? null,
              soloVsChuckyLockHand: soloVsChuckyLockHandRef.current ?? null,
              liveLoneSoloPlayerId,
              liveLoneSoloCount: liveLoneSoloCards.length,
              liveLoneSoloFingerprint: fpOf(liveLoneSoloCards as any),
              liveLockMatchesHand,
              hasLiveLonePlayer,
              holmDealNotReady,
              prevSnapBefore,
              prevStickyBefore,
              snapshotWriteReason,
              stickyClearReason,
              stickyWriteReason,
              snapAfter: lonePlayerStageSnapshotRef.current
                ? {
                    handContextId: lonePlayerStageSnapshotRef.current.handContextId,
                    playerId: lonePlayerStageSnapshotRef.current.playerId,
                    count: lonePlayerStageSnapshotRef.current.cards.length,
                    fp: fpOf(lonePlayerStageSnapshotRef.current.cards as any),
                  }
                : null,
              stickyAfter: tabledSelfStickyRef.current
                ? {
                    handContextId: tabledSelfStickyRef.current.handContextId,
                    playerId: tabledSelfStickyRef.current.playerId,
                    count: tabledSelfStickyRef.current.cards.length,
                    fp: fpOf(tabledSelfStickyRef.current.cards as any),
                  }
                : null,
              activeSnapSource: activeSnapSourceTag,
              loneSoloCardsSource: loneSoloCardsSourceTag,
              loneSoloCardsCount: loneSoloCards.length,
              loneSoloCardsFingerprint: fpOf(loneSoloCards as any),
              loneSoloOriginHandContextId:
                loneSoloCardsSourceTag === 'liveLoneSoloCards'
                  ? (handContextId ?? null)
                  : (activeSnap?.handContextId ?? null),
              loneSoloPlayerResolved: loneSoloPlayer?.id ?? null,
            },
          });
          const lonePlayerVisible =
            hasLiveLonePlayer || (!!activeSnap && !!loneSoloPlayer && loneSoloCards.length > 0);

          // ── Forensics: SELF_HAND / TABLED_SELF routing (read-only) ──
          if (gameType === 'holm-game') {
            try {
              instrumentHolmSelfStageRender({
                handContextId: handContextId ?? null,
                phase: String(holmDealPhaseForHand ?? 'unknown'),
                roundStatus: (roundStatus as string | null) ?? null,
                lonePlayerVisible,
                hasLiveLonePlayer,
                activeSnapSource: tabledSelfStickyRef.current
                  ? 'sticky'
                  : (lonePlayerStageSnapshotRef.current ? 'stage' : 'none'),
                activeSnapOriginHandContextId: activeSnap?.handContextId ?? null,
                tabledSelfStickyOriginHandContextId:
                  tabledSelfStickyRef.current?.handContextId ?? null,
                lonePlayerStageSnapshotOriginHandContextId:
                  lonePlayerStageSnapshotRef.current?.handContextId ?? null,
                selfHandAnchorPresent: !lonePlayerVisible && !!currentPlayer,
                tabledSelfStagePresent: lonePlayerVisible && !!loneSoloPlayer,
                cachedChuckyRevealed: cachedChuckyCardsRevealed,
                requiredRevealCount,
                visualRevealCount,
                chuckyVisualRevealComplete,
                rawWinTriggerId: holmWinPotTriggerId ?? null,
                gatedWinTriggerId: holmWinPotTriggerIdGated ?? null,
                rawLossTriggerId: chuckyLossTriggerId ?? null,
                gatedLossTriggerId: chuckyLossTriggerIdGated ?? null,
                callerFile: 'src/components/MobileGameTable.tsx',
                callerFn: 'gameplayRenderIIFE.selfStage',
              });
            } catch { /* noop */ }
          }


          // ── CHUCKY_TABLED sticky predicate ────────────────────────────
          if (
            chuckyStageStickyRef.current &&
            handContextId &&
            chuckyStageStickyRef.current.handContextId !== handContextId
          ) {
            chuckyStageStickyRef.current = null;
          }
          // ── Holm-only render eligibility guard ───────────────────────
          // Every Chucky render source carries an immutable origin
          // handContextId. A source contributes cards / reveal count
          // ONLY when its origin matches the current handContextId.
          // Otherwise it is rejected at render-time (no promotion,
          // no copy, no re-stamp). This prevents H1's cached/sticky
          // Chucky presentation from rendering inside H2.
          const cachedChuckyOriginHandContextId = cachedChuckyHandContextRef.current;
          const cachedChuckySourceEligible =
            !!cachedChuckyCards &&
            cachedChuckyCards.length > 0 &&
            !!handContextId &&
            cachedChuckyOriginHandContextId === handContextId;
          const stickyChuckyOriginHandContextId =
            chuckyStageStickyRef.current?.handContextId ?? null;
          // POST-ANNOUNCEMENT PERSISTENCE: sticky stays eligible whenever the
          // current handContextId matches its origin OR handContextId is
          // transiently null (announcement clear / win transition). The
          // sticky is only forcibly cleared above when a DIFFERENT non-null
          // handContextId arrives (next-hand PRE_DEAL boundary).
          const stickyChuckySourceEligible =
            !!chuckyStageStickyRef.current &&
            !!stickyChuckyOriginHandContextId &&
            (handContextId == null || stickyChuckyOriginHandContextId === handContextId);
          if (
            (cachedChuckyCards && cachedChuckyCards.length > 0 && !cachedChuckySourceEligible) ||
            (chuckyStageStickyRef.current && !stickyChuckySourceEligible)
          ) {
            try {
              console.log('[HOLM_STALE_CHUCKY_RENDER_SOURCE_REJECTED]', {
                currentHandContextId: handContextId,
                cachedOriginHandContextId: cachedChuckyOriginHandContextId,
                cachedLen: cachedChuckyCards?.length ?? 0,
                cachedRevealed: cachedChuckyCardsRevealed,
                stickyOriginHandContextId: stickyChuckyOriginHandContextId,
                stickyLen: chuckyStageStickyRef.current?.cards?.length ?? 0,
                stickyRevealed: chuckyStageStickyRef.current?.revealedCount ?? 0,
              });
            } catch { /* noop */ }
          }
          // CHUCKY_TABLED_PERSISTENCE — promote sticky whenever cached cards
          // are eligible for the CURRENT HCI, regardless of cachedChuckyActive.
          // Backend flips chucky_active=false at terminal SHOWDOWN; if we only
          // captured sticky while active=true the snapshot can never reach
          // revealedCount === required. Cards/HCI come from the same
          // authoritative reveal source — NOT fabrication.
          if (
            cachedChuckySourceEligible &&
            cachedChuckyCards &&
            handContextId
          ) {
            const previousStickyRevealCount =
              chuckyStageStickyRef.current?.handContextId === handContextId
                ? chuckyStageStickyRef.current.revealedCount
                : 0;
            // Once reveal completed on this hand, LOCK sticky at full count
            // so it cannot regress through SHOWDOWN → announcement → win
            // celebration. Cleared only at next-hand HCI boundary (above).
            const lockedRevealed =
              requiredRevealCount > 0 && visualRevealCount >= requiredRevealCount
                ? cachedChuckyCards.length
                : Math.max(previousStickyRevealCount, cachedChuckyCardsRevealed);
            chuckyStageStickyRef.current = {
              handContextId,
              cards: cachedChuckyCards,
              revealedCount: Math.min(cachedChuckyCards.length, lockedRevealed),
            };
          }
          const chuckyCardsForRender: CardType[] | null =
            cachedChuckySourceEligible && cachedChuckyCards
              ? cachedChuckyCards
              : stickyChuckySourceEligible
                ? (chuckyStageStickyRef.current?.cards ?? null)
                : null;
          // Sticky alone (HCI-matched, non-empty cards) keeps the stage
          // mounted through celebration; do not additionally gate on
          // cachedChuckyActive.
          const chuckyVisible =
            (!!cachedChuckyActive && cachedChuckySourceEligible) ||
            (stickyChuckySourceEligible && !!chuckyCardsForRender && chuckyCardsForRender.length > 0);
          const chuckyTotalVisibleForRender = chuckyCardsForRender?.length ?? 0;
          const eligibleCachedRevealed = cachedChuckySourceEligible ? cachedChuckyCardsRevealed : 0;
          const eligibleStickyRevealed = stickyChuckySourceEligible
            ? (chuckyStageStickyRef.current?.revealedCount ?? 0)
            : 0;
          const chuckyStickyRevealCountForRender = eligibleStickyRevealed;
          const chuckyRevealedCountForRender = Math.min(
            chuckyTotalVisibleForRender,
            Math.max(eligibleCachedRevealed, eligibleStickyRevealed),
          );

          // ── Forensics: new-hand Chucky admission summary (read-only) ──
          if (gameType === 'holm-game') {
            try {
              recordHolmChuckyAdmission({
                handContextId: handContextId ?? null,
                cachedChuckyOriginHandContextId: cachedChuckyOriginHandContextId ?? null,
                cachedChuckySourceEligible,
                stickyChuckyOriginHandContextId: stickyChuckyOriginHandContextId ?? null,
                stickyChuckySourceEligible,
                stickyChuckyRevealOriginHandContextId:
                  chuckyStageStickyRef.current?.handContextId ?? null,
                stickyChuckyRevealEligible:
                  stickyChuckySourceEligible && chuckyStickyRevealCountForRender > 0,
                renderedChuckyCount: chuckyTotalVisibleForRender,
                renderedRevealCount: chuckyRevealedCountForRender,
                serverRevealCount: cachedChuckyCardsRevealed,
                callerFile: 'src/components/MobileGameTable.tsx',
                callerFn: 'gameplayRenderIIFE.chuckyAdmission',
              });
            } catch { /* noop */ }
          }


          console.log("🔥🔥🔥 [MOBILE_COMMUNITY] RENDER DECISION:", {
            shouldShow: communityShouldShow,
            gameType,
            hasApprovedCards: !!approvedCommunityCards,
            approvedCardsLength: approvedCommunityCards?.length,
            showCommunityCards,
            isInGameOverStatus,
            currentRound,
            approvedRoundForDisplay,
            roundMatch: currentRound === approvedRoundForDisplay,
          });

          return (
            <HolmGameplayGeometryProvider
              communityCardsVisible={communityShouldShow}
              lonePlayerTabledCardsVisible={lonePlayerVisible}
              chuckyVisible={chuckyVisible}
            >
              {/* holm.lonePlayerTabledCardsStage — persistent solo-vs-Chucky cards */}
              {lonePlayerVisible && loneSoloPlayer && (() => {
                traceSoloAreaRender({
                  clientId: currentUserId,
                  gameId: gameId ?? '',
                  roundId: handContextId ?? undefined,
                  handNumber: 0,
                  handContextId: handContextId ?? '',
                  renderedPlayerId: loneSoloPlayer.id,
                  cardIds: loneSoloCards.map(c => `${c.rank}${c.suit}`).join(','),
                  cardSource: soloVsChuckyPlayerIdLocked ? 'lockedId' : 'rawFind',
                  isShowdown: !!showdownModeLocked,
                  shouldHideForTabling: false,
                  isHolmWinWinner: false,
                  isSoloVsChuckyPlayer: true,
                  isSoloVsChuckyPlayerRaw: false,
                  isSoloVsChucky: !!isSoloVsChucky,
                  soloVsChuckyPlayerIdLocked,
                  soloVsChuckyTableLocked,
                  showdownModeLocked: !!showdownModeLocked,
                  stayedPlayersCount,
                  playerDecision: loneSoloPlayer.current_decision,
                  decisionLocked: loneSoloPlayer.decision_locked,
                  playerExplicitlyStayed: loneSoloPlayer.current_decision === 'stay',
                  apparentIsActivePlayer: true,
                  isSoloVsChuckyRaw: !!isSoloVsChuckyRaw,
                });

                const RANK_ORDER: Record<string, number> = {
                  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
                };
                const sortedCards = [...loneSoloCards]
                  .map((card, index) => ({ card, originalIndex: index }))
                  .sort((a, b) => RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank]);

                const isSoloPlayerWinner = winnerPlayerId === loneSoloPlayer.id;
                const hasHighlights = isSoloPlayerWinner && winningCardHighlights.hasHighlights;

                const shouldAnimate = !soloVsChuckyAnimatedRef.current;
                if (shouldAnimate) soloVsChuckyAnimatedRef.current = true;

                return (
                  <HolmAnchoredSlot
                    artifactId="holm.lonePlayerTabledCardsStage"
                    zIndex={20}
                  >
                    <HolmSoloRootRegistrar
                      root="TABLED_SELF"
                      mounted={true}
                      cardIds={loneSoloCards.map((c) => `${c.rank}${c.suit}`)}
                      handContextId={handContextId ?? null}
                      soloDeclared={!!isSoloVsChucky}
                      phase={chuckyVisible ? (chuckyRevealedCountForRender >= chuckyTotalVisibleForRender ? 'SHOWDOWN' : 'CHUCKY_REVEAL') : 'SOLO_DECLARED'}
                      caller="MobileGameTable.lonePlayerTabledCardsStage"
                    />
                    <HolmLonePlayerFan
                      sortedCards={sortedCards}
                      isSoloPlayerWinner={isSoloPlayerWinner}
                      winningPlayerIndices={winningCardHighlights.playerIndices}
                      kickerPlayerIndices={winningCardHighlights.kickerPlayerIndices}
                      hasHighlights={hasHighlights}
                      isFourColor={deckColorMode === 'four_color'}
                      getFourColorSuit={getFourColorSuit}
                      animate={shouldAnimate}
                    />
                    <style>{`
                      @keyframes holmSoloTableSlide {
                        0% { opacity: 0; transform: translateY(120px) scale(0.8); }
                        100% { opacity: 1; transform: translateY(0) scale(1); }
                      }
                    `}</style>
                  </HolmAnchoredSlot>
                );
              })()}

              {/* holm.communityCardsStage — community cards + rabbit-hunt anchor */}
              {communityShouldShow && (
                <>
                  <HolmAnchoredSlot
                    artifactId="holm.communityCardsStage"
                    zIndex={110}
                    ref={communityCardsWrapperRef}
                  >
                    <HolmSoloRootRegistrar
                      root="COMMUNITY"
                      mounted={true}
                      cardIds={(approvedCommunityCards ?? []).map((c) => `${c.rank}${c.suit}`)}
                      handContextId={handContextId ?? null}
                      soloDeclared={!!isSoloVsChucky}
                      phase={chuckyVisible ? 'CHUCKY_REVEAL' : 'GAMEPLAY'}
                      caller="MobileGameTable.communityCardsStage"
                    />
                    {/*
                      Holm canonical deal ownership cutover:
                        - Always mount HolmCanonicalCommunityRow so the
                          4 community anchors exist BEFORE the community
                          wave dispatches. Per-slot card content is gated
                          on DealRuntime settled ids — no placeholders,
                          no local animation refs, no authoritative
                          fall-through.
                        - Once DealRuntime hands off to GAMEPLAY (or no
                          DealRuntime is mounted), defer to the legacy
                          CommunityCards renderer for the reveal /
                          highlight pipeline.
                    */}
                    <CommunityStageHolmSwitch
                      handContextId={handContextId!}
                      cards={approvedCommunityCards!}
                      revealed={
                        isDelayingCommunityCards
                          ? staggeredCardCount
                          : (communityCardsRevealed || 2)
                      }
                      highlightedIndices={winningCardHighlights.communityIndices}
                      kickerIndices={winningCardHighlights.kickerCommunityIndices}
                      hasHighlights={winningCardHighlights.hasHighlights}
                      tightOverlap={isHolmMultiPlayerShowdown}
                    />

                  </HolmAnchoredSlot>

                  {shouldShowRabbitHuntLabel && rabbitHuntLabelTop !== null && (
                    <div
                      className="absolute left-1/2 z-20 transform -translate-x-1/2 text-center pointer-events-none"
                      style={{ top: rabbitHuntLabelTop }}
                    >
                      <span className="text-3xl">🐰</span>
                    </div>
                  )}
                </>
              )}

              {/* holm.chuckyStage — devil avatar + Chucky cards in ONE stage */}
              {chuckyVisible && chuckyCardsForRender && (() => {
                const chuckyHandIdForRender =
                  handContextId ?? chuckyStageStickyRef.current?.handContextId ?? null;
                const chuckyTotalForRender = chuckyCardsForRender.length;
                return (
                <HolmAnchoredSlot
                  artifactId="holm.chuckyStage"
                  zIndex={10}
                >
                  <HolmSoloRootRegistrar
                    root="CHUCKY_TABLED"
                    mounted={true}
                    cardIds={chuckyCardsForRender.map((c) => `${c.rank}${c.suit}`)}
                    handContextId={chuckyHandIdForRender}
                    soloDeclared={!!isSoloVsChucky}
                    phase={chuckyRevealedCountForRender >= chuckyTotalForRender ? 'SHOWDOWN' : 'CHUCKY_REVEAL'}
                    caller="MobileGameTable.chuckyStage"
                  />
                  <div
                    className={cn(
                      "flex items-center",
                      isTablet || isDesktop ? '-space-x-1' : '-space-x-[2px]'
                    )}
                    style={{ height: '90%' }}
                  >
                    <span
                      className="text-red-400 mr-1"
                      style={{ fontSize: '60%' }}
                    >
                      👿
                    </span>
                    {chuckyCardsForRender.map((card, index) => {
                      const isRevealed = index < chuckyRevealedCountForRender;
                      const isFourColor = deckColorMode === 'four_color';
                      const fourColorConfig = getFourColorSuit(card.suit);
                      const cardBg = isRevealed
                        ? isFourColor && fourColorConfig ? fourColorConfig.bg : 'white'
                        : undefined;
                      const twoColorTextStyle = !isFourColor && isRevealed
                        ? { color: (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#000000' }
                        : {};
                      const shouldDimChucky = !!winnerPlayerId && isShowingAnnouncement;
                      const dimStyle = shouldDimChucky ? { opacity: 0.4, filter: 'grayscale(30%)' } : {};
                      return (
                        <div
                          key={index}
                          data-holm-card-id={`${chuckyHandIdForRender}#chucky-${index}`}
                          data-holm-renderer="MobileGameTable.holmChuckyStage"
                          data-holm-component="CHUCKY"
                          data-card-anchor={`chucky-${index}`}
                          data-anchor-owner="MobileGameTable.holmChuckyStage.slot"
                          style={{ height: '100%', aspectRatio: '5 / 7' }}
                        >
                          <ChuckyVisualCardInstrumenter
                            handContextId={chuckyHandIdForRender}
                            index={index}
                            isRevealed={isRevealed}
                            renderer="MobileGameTable.holmChuckyStage"
                            owner="cachedChuckyCardsRevealed"
                            phase={chuckyRevealedCountForRender >= chuckyTotalForRender ? 'SHOWDOWN' : 'CHUCKY_REVEAL'}
                            cachedChuckyCardsRevealed={chuckyRevealedCountForRender}
                            cachedChuckyCardsCount={chuckyTotalForRender}
                          />
                          {(() => {
                            try {
                              recordChuckyRenderState({
                                handContextId: chuckyHandIdForRender,
                                cardIndex: index,
                                card: { rank: card.rank, suit: card.suit },
                                roundStatus: roundStatus ?? null,
                                phase: chuckyRevealedCountForRender >= chuckyTotalForRender ? 'SHOWDOWN' : 'CHUCKY_REVEAL',
                                isShowingAnnouncement: !!isShowingAnnouncement,
                                holmWinPotTriggerActive: !!holmWinPotTriggerIdGated,
                                resultGateAllowed: !!(awaitingNextRound && lastRoundResult && chuckyVisualRevealComplete),
                                awaitingNextRound: !!(awaitingNextRound && chuckyVisualRevealComplete),
                                lastRoundResultPresent: !!(lastRoundResult && chuckyVisualRevealComplete),
                                serverRevealCount: typeof chuckyCardsRevealed === 'number' ? chuckyCardsRevealed : null,
                                cachedChuckyCardsRevealed: chuckyRevealedCountForRender,
                                requiredRevealCount: chuckyTotalForRender,
                                cardsCameFromLive: !!(cachedChuckyCards && cachedChuckyCards.length > 0),
                                cardsCameFromSticky: !(cachedChuckyCards && cachedChuckyCards.length > 0) && !!chuckyStageStickyRef.current,
                                actualPropIsHidden: !isRevealed,
                                actualPropFaceUp: isRevealed,
                                reason: shouldDimChucky ? 'dim-during-announcement' : null,
                              });
                            } catch { /* read-only forensics */ }
                            return null;
                          })()}
                          <HolmSettledGate cardId={`${chuckyHandIdForRender}#chucky-${index}`}>
                            {isRevealed ? (
                              <div
                                className="w-full h-full rounded-md border-2 border-red-500 flex flex-col items-center justify-center shadow-lg transition-opacity duration-300"
                                style={{
                                  backgroundColor: cardBg,
                                  ...twoColorTextStyle,
                                  ...dimStyle,
                                }}
                              >
                                <span className={`text-xl font-black leading-none ${isFourColor ? 'text-white' : ''}`}>
                                  {card.rank}
                                </span>
                                {!isFourColor && (
                                  <span className="text-2xl leading-none -mt-0.5">{card.suit}</span>
                                )}
                              </div>
                            ) : (
                              <CanonicalCardBack
                                widthPx={40}
                                heightPx={60}
                                variant="raised"
                                radiusPx={6}
                                style={{ width: '100%', height: '100%' }}
                              />
                            )}
                          </HolmSettledGate>
                        </div>
                      );
                    })}
                  </div>
                </HolmAnchoredSlot>
                );
              })()}
            </HolmGameplayGeometryProvider>
          );
        })()}

        
        {/* Winner's Tabled Cards - shown above pot (overlaying game name/pot max) when player beats Chucky */}
        {/* This displays during the pot-to-winner animation so cards are visible */}
        {/* Don't show tabled cards to the winner themselves - they can see their own cards in their player card area */}
        {/* SKIP if cards are already tabled via solo vs Chucky - they're already in position */}
        {gameType === 'holm-game' && holmWinPotTriggerIdGated && winnerPlayerId && winnerCards.length > 0 && winnerPlayerId !== currentPlayer?.id && !isSoloVsChucky && (
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
        
        {/* PR-B: single seat-rendering path.
            Every occupied seat resolves through the shell-owned
            SeatAnchorLayer (gated by CANONICAL_SEAT_CONSUMERS) and
            renders through CanonicalSeatCluster at the projected
            canonical slot. No observer/seated branch. No bespoke
            absolute positioning. The Holm multi-player showdown raise
            lives in `getCanonicalSlotRaiseClass` (driven by
            `raisePosition`), not in this component.

            `hideChipBubble` is intentional: the cluster's identity
            pill is not used here yet — chip visuals/decorators
            (turn-pulse ring, dealer pip, leg indicators, auto-roll,
            emoticons, ValueChangeFlash, card backs, exposed showdown
            cards) remain owned by `renderPlayerChip` until the
            follow-up styling-unification PR. Cluster handles ONLY
            positioning, projection, and the raise. */}
        {(() => {
          // Pre-session canonical chip continuity (Wartime FIX #1).
          //
          // During pre-session phases (waiting + dealer-selection +
          // dealer-game setup), every consumer of MobileGameTable must
          // present chips through the SAME canonical primitive that
          // CanonicalShellWaitingSurface uses, so the visible chip layer
          // does not switch from a canonical pill to the legacy
          // `renderPlayerChip` glyph as the user transitions
          // WaitingTable → NeutralInterstitial → DealerSelection. Active
          // gameplay (in_progress / game_over / ante_decision once a
          // dealer game is running) keeps the legacy chip element
          // untouched — this is NOT a multi-game gameplay chip migration.
          const PRE_SESSION_STATUSES = new Set([
            'waiting',
            'dealer_selection',
            'cribbage_dealer_selection',
            'configuring',
            'game_selection',
            'ante_decision',
          ]);
          const isPreSessionPhase =
            !!gameStatus && PRE_SESSION_STATUSES.has(gameStatus);

          return players.map((player) => {
            const anchor = shellAnchors?.byPosition.get(player.position);
            const slot: CanonicalSlot | null = anchor?.slot ?? null;
            if (slot === null) return null;
            // Self-suppression is handled inside CanonicalSeatCluster
            // (returns null when viewerPosition === position), so the
            // current player never double-renders at HOME on top of the
            // bottom HUD.
            const stayed = player.current_decision === 'stay';
            const raise = isHolmMultiPlayerShowdown && stayed;

            if (isPreSessionPhase) {
              // Wartime FIX #1: when the shell-owned
              // PreSessionSeatLayer is mounted above (single cluster
              // set surviving every pre-session phase transition),
              // skip the local cluster JSX so chip identity does not
              // remount across WaitingSlot ↔ DealerSelection.
              if (preSessionSeatOwned) return null;
              // Canonical identity pill — same inputs / palette /
              // primitive as CanonicalShellWaitingSurface. Gameplay-only
              // decorators (turn pulse, leg pips, auto-roll, emoticons,
              // dealer pip, ValueChangeFlash, card backs) are
              // intentionally suppressed here; they belong to active
              // gameplay only.
              const status = derivePlayerStatus(player, null, {
                hasStayDecision: false,
              });
              const displayName = player.is_bot
                ? getBotAlias(players, player.user_id)
                : (player.profiles?.username || `P${player.position}`);
              const chipText = `$${formatChipValue(Math.round(player.chips ?? 0))}`;
              return (
                <CanonicalSeatCluster
                  key={player.id}
                  slot={slot}
                  position={player.position}
                  name={displayName}
                  chipValue={chipText}
                  status={status}
                  isDealer={false}
                  className={playerSlotZIndex}
                  ownerLabel="Slot:MobileGameTable.preSessionPill"
                  playerId={player.id}
                />
              );
            }

            // Canonical gameplay-seat routing.
            //  holm-game        → renderHolmCanonicalSeat   (Wave 3C.3b)
            //  three-five-seven → render357CanonicalSeat    (Wave 3C.4)
            //  horses           → renderHorsesCanonicalSeat (Wave 3C.5)
            //  scc              → renderSccCanonicalSeat    (Wave 3C.5)
            //  else             → legacy fallback (hideChipBubble wrap)
            if (gameType === 'holm-game') {
              return renderHolmCanonicalSeat(player, slot);
            }
            if (gameType === '3-5-7' || gameType === '357' || gameType === '3-5-7-game') {
              return render357CanonicalSeat(player, slot);
            }
            if (gameType === 'horses') {
              return renderHorsesCanonicalSeat(player, slot);
            }
            if (gameType === 'ship-captain-crew') {
              return renderSccCanonicalSeat(player, slot);
            }


            return (
              <CanonicalSeatCluster
                key={player.id}
                slot={slot}
                position={player.position}
                name=""
                chipValue=""
                hideChipBubble
                raisePosition={raise}
                className={playerSlotZIndex}
                ownerLabel="Slot:MobileGameTable.gameplayChipWrapper"
                playerId={player.id}
              >
                {renderPlayerChip(player, slot)}
              </CanonicalSeatCluster>
            );
          });
        })()}


        
        {/* Dealer button is now shown on player chip stacks (OUTSIDE position), no separate felt button needed */}
        
        {/* Buck indicator on felt - Holm games only, hide only during active showdown (not locked).
            Positioning is sourced from the canonical seat anchor (same
            slot the player chip cluster occupies). This guarantees the
            buck tracks the seat through every projection-mode change
            (observer-absolute / active-canonical) and lifecycle phase
            without a parallel pixel map. */}
        {gameType === 'holm-game' && buckPosition !== null && buckPosition !== undefined && !isAnyPlayerInShowdownRaw && (() => {
          const buckAnchor = shellAnchors?.byPosition.get(buckPosition);
          const buckSlot = buckAnchor?.slot ?? null;
          if (buckSlot === null) return null;
          const placement = getCanonicalSlotPlacement(buckSlot);
          return (
            <div
              className={`absolute z-30 flex ${placement.className}`}
              style={{ transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
              data-buck-slot={buckSlot}
            >
              <div className="relative">
                <div className="absolute inset-0 bg-blue-600 rounded-full blur-sm animate-pulse opacity-75" />
                <div className="relative bg-white rounded-full p-0.5 shadow-lg border-2 border-blue-800 animate-bounce flex items-center justify-center w-7 h-7">
                  <img alt="Buck" className="w-full h-full rounded-full object-cover" src="/lovable-uploads/7ca746e0-8bcb-4dcd-9d87-407f9457deb8.png" />
                </div>
              </div>
            </div>
          );
        })()}

        
        {/* Current player's legs indicator on felt - 3-5-7 games only */}
        {/* Use a stable snapshot during the win transition so legs don't disappear/reappear mid-sequence */}
        {gameType !== 'holm-game' && currentPlayer && (() => {
          const hideLegsForWinAnimation =
            threeFiveSevenWinPhase === 'legs-to-player' ||
            threeFiveSevenWinPhase === 'pot-to-player' ||
            threeFiveSevenWinPhase === 'delay';

          const legsWereSweptThisSession =
            lastThreeFiveSevenTriggerRef.current !== null && threeFiveSevenWinPhase === 'idle';

          if (hideLegsForWinAnimation || legsWereSweptThisSession) return null;

          const useStableSnapshot =
            !!threeFiveSevenWinTriggerId ||
            threeFiveSevenWinPhase !== 'idle' ||
            lastThreeFiveSevenTriggerRef.current !== null;

          const legsSource =
            useStableSnapshot && threeFiveSevenLegsSnapshotRef.current.length
              ? threeFiveSevenLegsSnapshotRef.current
              : threeFiveSevenCachedLegPositions;

          const cachedLegData = legsSource?.find((p) => p.playerId === currentPlayer.id);

          const shouldPreferCached = isInGameOverStatus || useStableSnapshot;

          const effectiveLegs =
            shouldPreferCached && cachedLegData && cachedLegData.legCount > 0
              ? cachedLegData.legCount
              : (cachedCurrentPlayerLegs > 0 && isInGameOverStatus ? cachedCurrentPlayerLegs : currentPlayer.legs);

          const isAnimatingCurrentPlayer =
            showLegEarned && legEarnedPlayerPosition === currentPlayer.position;

          // While the flying leg is in the air, don't show it in the felt stack yet.
          const displayCount = Math.min(
            Math.max(0, isAnimatingCurrentPlayer ? effectiveLegs - 1 : effectiveLegs),
            legsToWin,
          );

          if (displayCount <= 0) return null;

          const showLegDollarValue = legValue > 0;
          const legDisplayText = showLegDollarValue ? `$${legValue}` : 'L';
          const chipSize = showLegDollarValue ? 'w-8 h-8' : 'w-7 h-7';
          const textSize = showLegDollarValue ? 'text-[9px]' : 'text-xs';

          return (
            <div
              className="absolute z-20"
              style={{
                bottom: '8px',
                left: '55%',
                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div className="flex">
                {Array.from({ length: displayCount }).map((_, i) => (
                  <div
                    key={i}
                    className={`${chipSize} rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg`}
                    style={{
                      marginLeft: i > 0 ? '-10px' : '0',
                      zIndex: displayCount - i,
                    }}
                  >
                    <span className={`text-slate-800 font-bold ${textSize}`}>{legDisplayText}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        
        {/* Legacy felt dealer chip REMOVED — canonical ownership lives in
            DealerIndicator (shell HUD identity row) + CanonicalSeatCluster
            (opponent name-row pip). The free-standing felt "D" leaked
            across dealer_selection → game_selection → ante_decision
            transitions because it tracked dealer_position only. Do NOT
            revive — if a lifecycle gap needs a local dealer affordance,
            render <DealerIndicator/> in the canonical HUD row instead. */}
        
        {/* Open seats for seat selection — observers only.
            Geometry is single-sourced from the canonical seat map
            (observerSlotForPosition + getCanonicalSlotPlacement), the
            SAME map seat clusters use. A `+` is suppressed when EITHER
            the position is taken OR the resolved canonical slot is
            already occupied by any seated player — so a `+` can never
            sit underneath a chipstack. */}
        {canSelectSeat && openSeats.length > 0 && (() => {
          // Resolved-slot occupancy. When a SeatAnchorLayer is mounted
          // (gameplay families), read from the shared anchor map so
          // open-seat geometry tracks the same projection the clusters
          // render at. When no provider is mounted (legacy waiting
          // path), fall back to the canonical observer-absolute map.
          const occupiedSlots = new Set<number>();
          for (const player of players) {
            const slot =
              shellAnchors?.byPosition.get(player.position)?.slot
              ?? observerSlotForPosition(player.position);
            if (slot != null) occupiedSlots.add(slot);
          }
          return openSeats.map(pos => {
            const slot = observerSlotForPosition(pos);
            if (slot == null) return null;
            if (occupiedSlots.has(slot)) return null;
            const placement = getCanonicalSlotPlacement(slot, 'open-seat');
            return (
              <div
                key={pos}
                className={`absolute z-20 pointer-events-auto ${placement.className}`}
                data-waiting-seat-open={pos}
                data-waiting-seat-slot={slot}
              >
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

      {/* BOTTOM safe-area spacer — pixels donated from Row 4 (pane) that
          appear BELOW the felt region. Bottom-seat decorations (card
          backs, showdown cards) rendered inside the felt region with
          overflow:visible render INTO this gap rather than being
          clipped at the felt-region bottom edge. Width-only token;
          never reads game type. */}
      <div
        aria-hidden
        data-canonical-shell-play-bottom-spacer=""
        style={{ flex: '0 0 var(--play-bottom-safe-area, 0px)', pointerEvents: 'none' }}
      />

      {/* Bottom section - Current player's cards and actions (swipeable) */}
      <div className="flex-1 min-h-0 bg-gradient-to-t from-background via-background to-background/95 border-t border-border touch-pan-x overflow-hidden" {...swipeHandlers}>
        {isWaitingPhase ? (
          <ShellHudGrid
            timer={null}
            identity={
              currentPlayer ? (
                <div className="w-full h-full flex items-center justify-center gap-2 px-3 overflow-hidden">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {currentPlayer.profiles?.username || 'You'}
                  </p>
                  <span className={cn(
                    "font-bold text-lg tabular-nums",
                    currentPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'
                  )}>
                    ${formatChipValue(Math.round(currentPlayer.chips ?? 0))}
                  </span>
                </div>
              ) : null
            }
            pane={
              <>
                {activeTab === 'cards' && (
                  <div className="h-full px-4 pt-3 pb-5 flex flex-col items-center justify-start gap-4">
                    {waitingActivePaneContent}
                  </div>
                )}

                {activeTab === 'chat' && (
                  <div className="h-full px-3 pb-3 flex flex-col overflow-hidden min-h-0">
                    {onSendChat ? (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <MobileChatPanel
                          messages={allMessages}
                          onSend={onSendChat}
                          isSending={isChatSending}
                          chatInputValue={externalChatInputValue}
                          onChatInputChange={externalOnChatInputChange}
                        />
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm text-center">Chat not available</p>
                    )}
                  </div>
                )}

                {activeTab === 'lobby' && (
                  <div className="h-full px-3 pb-2 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <h3 className="text-sm font-bold text-foreground">Game Lobby</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
                      {players.map(player => {
                        const isCurrentUser = player.user_id === currentUserId;
                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "flex items-center justify-between py-1.5 px-2 rounded-md",
                              isCurrentUser ? 'bg-primary/10' : 'bg-transparent',
                              player.sitting_out ? 'opacity-50' : ''
                            )}
                          >
                            <span className={cn("text-sm font-medium truncate", isCurrentUser ? 'text-primary' : 'text-foreground')}>
                              {player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || `P${player.position}`)}
                            </span>
                            <span className="text-right min-w-[45px] font-bold text-sm text-poker-gold">
                              ${formatChipValue(Math.round(player.chips ?? 0))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="h-full px-4 py-6 text-center text-muted-foreground text-sm">
                    History will appear once the game starts.
                  </div>
                )}
              </>
            }
          />
        ) : (() => {
          /* PHASE C — CANONICAL ROW-4 PANE OWNERSHIP.
             Gameplay surface now publishes timer / pane / identity through
             ShellHudGrid. Row 1 (announcement) and row 3 (tabs) are owned
             entirely by the shell. The pane slot contains the previously
             free-flowing tab content (cards / observer / chat / lobby /
             history) wrapped as a single node. Identity is the canonical
             row-5 owner. No game-specific timer visuals, no free-flowing
             content below ShellTabBar. Containment / scaling issues exposed
             by this migration are deferred to a subsequent phase. */
          const hasTimer = !!isPaused || (
            diceGameplayUiActive &&
            horsesController.enabled &&
            horsesController.gamePhase === 'playing' &&
            !!horsesController.currentTurnPlayerId &&
            !horsesController.currentTurnPlayer?.is_bot &&
            horsesController.timeLeft !== null
          ) || (
            !!currentPlayer &&
            isPlayerTurn &&
            roundStatus === 'betting' &&
            !hasDecided &&
            timeLeft !== null &&
            timeLeft > 0 &&
            !!maxTime
          );

          const paneContent = (
            <>
              {/* WAITING-PHASE ACTIVE PANE — dead in this branch (handled
                  by the isWaitingPhase ShellHudGrid above) but preserved
                  for safety during gameplay/waiting straddle frames. */}
              {isWaitingPhase && activeTab === 'cards' && (
                <div className="px-4 py-6 h-full flex flex-col items-center justify-center gap-4">
                  {waitingActivePaneContent}
                </div>
              )}

              {/* CARDS TAB - Player cards, buttons */}
              {!isWaitingPhase && activeTab === 'cards' && currentPlayer && !isDealerConfigPhase && (
                diceGameplayUiActive ? (
                  <HorsesMobileCardsTab
                    currentUserPlayer={currentPlayer as any}
                    horses={horsesController}
                    gameType={gameType}
                    onEmoticonSelect={handleQuickEmoticon}
                    isEmoticonSending={isEmoticonSending}
                    emoticonOverlays={emoticonOverlays}
                    winnerLegsFlashTrigger={winnerLegsFlashTrigger}
                    winnerPotFlashTrigger={winnerPotFlashTrigger}
                    onAutoFoldChange={onAutoFoldChange ? (autoFold) => onAutoFoldChange(currentPlayer.id, autoFold) : undefined}
                    pendingAutoRollOff={pendingAutoRollOff}
                  />
                ) : (
                  <div className="px-2 flex flex-col h-full" data-357-active-pane-content="">
                  {(() => {
                    const isWinner357InAnimation = gameType !== 'holm-game' &&
                      threeFiveSevenWinnerId === currentPlayer?.id &&
                      threeFiveSevenWinPhase !== 'idle';

                    // Numeric scale + reserve for the visible-player hand box.
                    // Keeping these as numbers lets us (a) derive the Tailwind
                    // class strings and (b) pass the Wave 2A
                    // `availableHeightPx` budget to PlayerHand — the resolver
                    // then clamps cardHeight so cards never overflow the
                    // reserve box into the action-strip sibling below.
                    const handScaleNum =
                      gameType !== 'holm-game'
                        ? (currentRound === 1
                            ? (isTablet || isDesktop ? 2.8 : 1.6)
                            : currentRound === 2
                              ? (isTablet || isDesktop ? 2.8 : 2.2)
                              : (isTablet || isDesktop ? 2.6 : 2.1))
                        : (isTablet || isDesktop ? 2.4 : 2.3);
                    const handReserveNum =
                      gameType === 'holm-game'
                        ? (isTablet || isDesktop ? 170 : 130)
                        : (currentRound === 1
                            ? (isTablet || isDesktop ? 200 : 120)
                            : currentRound === 2
                              ? (isTablet || isDesktop ? 180 : 105)
                              : (isTablet || isDesktop ? 160 : 90));
                    const currentPlayerHandScaleClass =
                      gameType !== "holm-game"
                        ? (currentRound === 1
                            ? (isTablet || isDesktop ? "scale-[2.8]" : "scale-[1.6]")
                            : currentRound === 2
                              ? (isTablet || isDesktop ? "scale-[2.8]" : "scale-[2.2]")
                              : (isTablet || isDesktop ? "scale-[2.6]" : "scale-[2.1]"))
                        : (isTablet || isDesktop ? "scale-[2.4]" : "scale-[2.3]");
                    const currentPlayerHandReserveClass =
                      gameType === "holm-game"
                        ? (isTablet || isDesktop ? "min-h-[170px]" : "min-h-[130px]")
                        : (currentRound === 1
                            ? (isTablet || isDesktop ? "min-h-[200px]" : "min-h-[120px]")
                            : currentRound === 2
                              ? (isTablet || isDesktop ? "min-h-[180px]" : "min-h-[105px]")
                              : (isTablet || isDesktop ? "min-h-[160px]" : "min-h-[90px]"));
                    // Unscaled vertical budget for the resolver. Reserve box
                    // height divided by the wrapper scale, minus ~4px slack
                    // for the ±2° rotation each card applies.
                    const handAvailableHeightPx357 =
                      gameType !== 'holm-game'
                        ? Math.max(20, handReserveNum / handScaleNum - 4)
                        : undefined;

                    const currentPlayerDealerCards = currentPlayer && dealerSelectionCards
                      ? dealerSelectionCards.filter(c => c.position === currentPlayer.position)
                      : [];
                    const showDealerSelectionCards = currentPlayerDealerCards.length > 0;

                    return (
                      <div className={cn(
                        "flex flex-col items-center",
                        gameType !== "holm-game" ? "gap-0" : "gap-0",
                      )}>
                        {showDealerSelectionCards ? (
                          <div className="flex flex-col items-center gap-2 py-4">
                            <div className="flex gap-2">
                              {currentPlayerDealerCards.map((cardData, idx) => (
                                <div
                                  key={`dealer-card-${cardData.roundNumber}-${idx}`}
                                  className="transition-all duration-500"
                                  style={{
                                    opacity: cardData.isRevealed ? 1 : 0.9,
                                    transform: cardData.isRevealed
                                      ? (cardData.isDimmed ? 'scale(0.95)' : 'scale(1)')
                                      : 'scale(1)',
                                  }}
                                >
                                  <PlayingCard
                                    card={cardData.card as CardType}
                                    isHidden={!cardData.isRevealed}
                                    size="xl"
                                    isHighlighted={false}
                                    isDimmed={cardData.isDimmed && cardData.isRevealed}
                                    className={cn(
                                      "shadow-2xl transition-all duration-500",
                                      cardData.isDimmed && cardData.isRevealed && "opacity-50"
                                    )}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {isWinner357InAnimation ? (
                          (() => {
                            const isFinalRound = currentRound === 3;
                            return !winner357ShowCards ? (
                              <Button
                                variant="outline"
                                size={isFinalRound ? "lg" : "default"}
                                onClick={() => onWinner357ShowCards?.()}
                                className={cn(
                                  "bg-green-600 hover:bg-green-700 text-white border-green-500 font-bold",
                                  isFinalRound ? "px-6 py-3 text-base" : "px-4 py-2 text-sm",
                                )}
                              >
                                Show Cards
                              </Button>
                            ) : (
                              <div className="text-sm text-green-400 font-medium">
                                {isFinalRound ? 'Cards Shown' : 'Cards Tabled'}
                              </div>
                            );
                          })()
                        ) : null}

                        {isWinner357InAnimation ? (
                          (() => {
                            if (currentRound === 3) return null;
                            return !winner357ShowCards && currentPlayerCards.length > 0 ? (
                              <div className={cn("flex items-start justify-center w-full", currentPlayerHandReserveClass)} data-357-active-hand-region="" data-holm-active-hand-region="">
                                <div className={`transform ${currentPlayerHandScaleClass} origin-top`}>
                                  <PlayerHand
                                    cards={currentPlayerCards}
                                    isHidden={false}
                                    gameType={gameType}
                                    currentRound={currentRound}
                                    showSeparated={currentRound === 3}
                                    availableHeightPx={handAvailableHeightPx357}
                                    wrapperScale={handScaleNum}

                                  />
                                </div>
                              </div>
                            ) : null;
                          })()
                        ) : isCurrentPlayerSoloVsChucky || (
                          // Wave 5D follow-up — current viewer's exposed
                          // cards during multiplayer showdown are owned
                          // by their CanonicalSeatCluster (allowSelfRender)
                          // on the felt, not by this active-hand region.
                          gameType === 'holm-game'
                          && isHolmMultiPlayerShowdown
                          && currentPlayer?.current_decision === 'stay'
                        ) ? (
                          <div className="flex items-center justify-center py-4">
                            <span className="text-sm text-muted-foreground italic">Cards on the felt</span>
                          </div>
                        ) : (
                          // UNIFIED stable subtree — outer wrapper, inner
                          // transform, and PlayerHand element identity must
                          // be stable across the empty→populated transition
                          // so card 0 of round 1 doesn't trigger a remount
                          // flash. Use357SelfHand clips visibility; when no
                          // cards have arrived yet the rendered fan is empty
                          // but the same PlayerHand instance persists.
                          <div
                            className={cn(
                              "flex items-start justify-center",
                              currentPlayerHandReserveClass,
                              gameType !== 'holm-game' && currentRound === 1 && currentPlayerCards.length > 0 ? "w-auto" : "w-full",
                            )}
                            data-357-active-hand-region="" data-holm-active-hand-region=""
                          >
                            <div
                              className={cn(
                                `transform ${currentPlayerHandScaleClass} origin-top`,
                                isPlayerTurn && roundStatus === 'betting' && !hasDecided && !isPaused && timeLeft !== null && timeLeft <= 3 ? 'animate-rapid-flash' : '',
                                (isShowingAnnouncement && winnerPlayerId && !isCurrentPlayerWinner && currentPlayer?.current_decision === 'stay') || currentPlayer?.current_decision === 'fold' ? 'opacity-40 grayscale-[30%]' : '',
                                currentPlayerCards.length === 0 && !__is357GameType(gameType) ? 'opacity-0 pointer-events-none' : '',
                              )}
                            >
                              {(() => {
                                const renderActiveSelfHand = (effectiveCards: CardType[], dealPhase: string, boundary: {
                                  claimedCardIds: string[];
                                  rawClaimedCardIds: string[];
                                  baseHandContextId: string;
                                  playerId: string;
                                  boundaryCardIdPrefix: string;
                                }) => {
                                  const is357 = __is357GameType(gameType);
                                  const is357Staged = is357 && (dealPhase === 'DEALING' || dealPhase === 'PRE_DEAL' || dealPhase === 'READY');
                                  const isHolmStaged = gameType === 'holm-game' && dealPhase !== 'GAMEPLAY';
                                  // 357 HARD CONTRACT: during the staged
                                  // deal, the self hand is the EXACT set
                                  // of transport-claimed cards. No
                                  // placeholder backs, no isHidden
                                  // expansion, no expectedCardCount
                                  // pre-render. 0→1→2→3 strictly.
                                    return (
                                     <>
                                       {gameType === 'holm-game' && (
                                          <HolmSoloRootRegistrar
                                            root="SELF_HAND"
                                            mounted={effectiveCards.length > 0}
                                            cardIds={effectiveCards.map((c) => `${c.rank}${c.suit}`)}
                                            handContextId={boundary.baseHandContextId}
                                            soloDeclared={!!isSoloVsChucky}
                                            phase={dealPhase}
                                            caller="MobileGameTable.activeSelfHand.PlayerHand"
                                          />
                                       )}
                                       {gameType === 'holm-game' && boundary.rawClaimedCardIds.map((cid) => (
                                         <HolmOwnershipBeacon
                                           key={`holm-self-beacon-${cid}`}
                                           cardId={cid}
                                           renderer="MobileGameTable.activeSelfHand.PlayerHand"
                                           componentName="PlayerHand(self)"
                                           handContextId={boundary.baseHandContextId}
                                           phase={dealPhase}
                                           renderReason={`self-rendered count=${effectiveCards.length}`}
                                         />
                                       ))}
                                       <PlayerHand
                                         cards={effectiveCards}
                                         isHidden={is357Staged || isHolmStaged ? false : effectiveCards.length === 0}
                                         expectedCardCount={
                                           is357Staged || isHolmStaged
                                             ? undefined
                                             : (effectiveCards.length === 0
                                               ? (gameType === 'holm-game' ? 2 : (currentRound === 1 ? 3 : currentRound === 2 ? 5 : 7))
                                               : undefined)
                                         }
                                         highlightedIndices={isCurrentPlayerWinner ? winningCardHighlights.playerIndices : []}
                                         kickerIndices={isCurrentPlayerWinner ? winningCardHighlights.kickerPlayerIndices : []}
                                         hasHighlights={isCurrentPlayerWinner && winningCardHighlights.hasHighlights}
                                         gameType={gameType}
                                         currentRound={currentRound}
                                         dealPhase={dealPhase}
                                         claimedCardIds={boundary.claimedCardIds}
                                         baseHandContextId={boundary.baseHandContextId}
                                         boundaryCardIdPrefix={boundary.boundaryCardIdPrefix}
                                         source="MobileGameTable.activeSelfHand"
                                         forceHiddenFaces={false}
                                         showSeparated={gameType !== 'holm-game' && currentRound === 3 && effectiveCards.length === 7}
                                         tightOverlap={isHolmMultiPlayerShowdown}
                                         availableHeightPx={handAvailableHeightPx357}
                                         wrapperScale={handScaleNum}
                                       />
                                     </>
                                   );
                                };
                                return gameType === 'holm-game' ? (
                                  <UseHolmSelfHand
                                    currentPlayerId={currentPlayer?.id ?? ''}
                                    handContextId={handContextId}
                                    players={players}
                                    buckPosition={buckPosition}
                                    cards={currentPlayerCards}
                                    render={renderActiveSelfHand}
                                  />
                                ) : (
                                  <Use357SelfHand
                                    currentPlayerId={currentPlayer?.id ?? ''}
                                    cards={currentPlayerCards}
                                    baseline={__is357GameType(gameType) ? prevWaveCountFor357(currentRound ?? 0) : 0}
                                    render={renderActiveSelfHand}
                                  />
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className={cn(
                    // Stable allocation: this strip swaps between buttons,
                    // badges, auto-fold label, and pre-decision checkboxes
                    // across the hand lifecycle. The geometry contract
                    // requires the gameplay artifact above (the hand) not
                    // to shift when this sibling's content changes. We
                    // reserve the height of the *tallest* variant
                    // (auto-fold label ≈ 52px mobile, ≈ 64px tablet) so
                    // every transition centers content inside a fixed box.
                    "flex items-center justify-center",
                    isTablet ? "h-[64px] mt-0 mb-1" : "h-[52px] mt-0 mb-1"
                  )}>

                    {currentPlayer.auto_fold && !currentPlayer.sitting_out ? (
                      <label className={cn(
                        "flex items-center gap-3 cursor-pointer rounded-lg border border-border bg-transparent",
                        isTablet ? "px-6 py-3" : "px-4 py-2"
                      )}>
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={(e) => {
                            if (!e.target.checked && onAutoFoldChange) {
                              onAutoFoldChange(currentPlayer.id, false);
                            }
                          }}
                          className={cn(
                            "rounded border-2 border-border accent-primary",
                            isTablet ? "w-7 h-7" : "w-5 h-5"
                          )}
                        />
                        <span className={cn(
                          "font-medium text-foreground",
                          isTablet ? "text-lg" : "text-sm"
                        )}>Auto-fold (will sit out next hand)</span>
                      </label>
                    ) : canDecide && !currentPlayer.auto_fold ? (
                      <div className={cn("flex justify-center", isTablet ? "gap-4" : "gap-2")}>
                        <Button
                          variant="destructive"
                          size="default"
                          onClick={onFold}
                          className={cn(
                            "font-bold",
                            isTablet ? "w-[160px] text-lg h-14" : "w-[100px] text-sm h-9"
                          )}
                        >
                          {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                        </Button>
                        <Button
                          size="default"
                          onClick={onStay}
                          className={cn(
                            "bg-poker-chip-green hover:bg-poker-chip-green/80 text-white font-bold",
                            isTablet ? "w-[160px] text-lg h-14" : "w-[100px] text-sm h-9"
                          )}
                        >
                          Stay
                        </Button>
                      </div>
                    ) : currentPlayer.sitting_out && !currentPlayer.waiting ? (
                      <RejoinNextHandButton playerId={currentPlayer.id} />
                    ) : hasDecided ? (
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
                    ) : gameType === 'holm-game' && !canDecide && !hasDecided && roundStatus === 'betting' && currentPlayerCards.length > 0 && !currentPlayer?.auto_fold ? (
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
                    ) : currentPlayerCards.length === 0 && roundStatus === 'betting' ? (
                      <div className="flex gap-2 justify-center opacity-0 pointer-events-none">
                        <Button variant="destructive" size="default" className="flex-1 max-w-[120px] text-sm font-bold h-9">
                          {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                        </Button>
                        <Button size="default" className="flex-1 max-w-[120px] bg-poker-chip-green text-white text-sm font-bold h-9">
                          Stay
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <style>{`
                    @keyframes fadeOutEmoticon {
                      from { opacity: 1; transform: scale(1); }
                      to { opacity: 0; transform: scale(0.8); }
                    }
                  `}</style>
                  </div>
                )
              )}

              {/* CARDS TAB - Observer state */}
              {!isWaitingPhase && activeTab === 'cards' && !currentPlayer && (
                <div className="px-4 pb-4 h-full">
                  <div className="flex items-center justify-between mb-3">
                    {onLeaveGameNow && (
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
                        onLeaveGameNow={onLeaveGameNow}
                        variant="mobile"
                      />
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm text-center mb-3">
                    You are observing this game
                  </p>
                </div>
              )}

              {/* CHAT TAB */}
              {activeTab === 'chat' && (
                <div className="px-3 pb-3 h-full flex flex-col overflow-hidden min-h-0">
                  {onSendChat ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <MobileChatPanel
                        messages={allMessages}
                        onSend={onSendChat}
                        isSending={isChatSending}
                        chatInputValue={externalChatInputValue}
                        onChatInputChange={externalOnChatInputChange}
                      />
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center">Chat not available</p>
                  )}
                </div>
              )}

              {/* LOBBY TAB */}
              {activeTab === 'lobby' && (
                <div className="px-3 pb-2 h-full flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <h3 className="text-sm font-bold text-foreground">Game Lobby</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {gameType === 'holm-game' ? 'Holm' : isDiceGame ? (gameType === 'ship-captain-crew' ? 'Ship' : 'Horses') : '3-5-7'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Pot: <span className="text-poker-gold font-bold">${Math.round(displayedPot)}</span>
                      </span>
                    </div>
                  </div>
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
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className={`text-sm font-medium truncate ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
                              {player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || `P${player.position}`)}
                            </span>
                            {isDealing && !is357MultiPlayerShowdown && <span className="text-[9px] px-1 py-0 bg-poker-gold text-black rounded font-bold">D</span>}
                            {hasBuck && gameType === 'holm-game' && <span className="text-[9px] px-1 py-0 bg-amber-600 text-white rounded font-bold">B</span>}
                            {player.is_bot && <span className="text-[9px] text-muted-foreground">(Bot)</span>}
                            {player.auto_fold && !player.is_bot && !player.sitting_out && <span className="text-[9px] text-amber-400 italic">folding</span>}
                            {player.sitting_out && <span className="text-[9px] text-muted-foreground italic">out</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
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
                            <div className={`text-right min-w-[45px] font-bold text-sm ${(lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips) < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                              ${formatChipValue(Math.round(lockedChipsRef.current?.[player.id] ?? displayedChips[player.id] ?? player.chips))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* HISTORY TAB */}
              {activeTab === 'history' && gameId && (
                <div className="px-3 pb-2 h-full flex flex-col overflow-hidden">
                  <HandHistory
                    gameId={gameId}
                    currentUserId={currentUserId}
                    currentPlayerId={currentPlayer?.id}
                    currentPlayerChips={currentPlayer?.chips}
                    gameType={gameType}
                    currentRound={currentRound}
                  />
                </div>
              )}
            </>
          );

          const identityContent = currentPlayer ? (
            <div className={cn(
              "w-full h-full flex items-center justify-center px-3",
              isTablet ? "gap-3" : "gap-2"
            )}>
              <QuickEmoticonPicker
                onSelect={handleQuickEmoticon}
                disabled={isEmoticonSending || !currentPlayer}
              />
              {/* Canonical dealer indicator — only card families (Holm,
                  3-5-7) render this in the identity row. Dice families
                  (Horses, SCC) have no dealer concept. */}
              {(gameType === 'holm-game' ||
                gameType === '3-5-7' ||
                gameType === '357' ||
                gameType === '3-5-7-game') &&
                dealerPosition === currentPlayer.position && (
                  <DealerIndicator />
                )}
              <p className={cn(
                "font-semibold text-foreground truncate",
                isTablet ? "text-xl" : "text-sm"
              )}>
                {currentPlayer.profiles?.username || 'You'}
                {(currentPlayer.auto_fold || currentPlayer.sitting_out) && !currentPlayer.waiting ? (
                  <span className="ml-1 text-destructive font-bold">(sitting out)</span>
                ) : currentPlayer.waiting ? (
                  <span className="ml-1 text-yellow-500">(waiting)</span>
                ) : (
                  <span className="ml-1 text-green-500">(active)</span>
                )}
              </p>
              <div className="relative pr-6">
                {emoticonOverlays[currentPlayer.id] ? (
                  <span
                    className={cn(
                      "animate-in fade-in zoom-in duration-200",
                      isTablet ? "text-3xl" : "text-2xl"
                    )}
                    style={{
                      animation:
                        emoticonOverlays[currentPlayer.id].expiresAt - Date.now() < 500
                          ? 'fadeOutEmoticon 0.5s ease-out forwards'
                          : undefined,
                    }}
                  >
                    {emoticonOverlays[currentPlayer.id].emoticon}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      isTablet ? "text-2xl" : "text-lg",
                      (lockedChipsRef.current?.[currentPlayer.id] ?? displayedChips[currentPlayer.id] ?? currentPlayer.chips) < 0
                        ? 'text-destructive'
                        : 'text-poker-gold'
                    )}
                  >
                    ${formatChipValue(
                      Math.round(
                        lockedChipsRef.current?.[currentPlayer.id] ??
                          displayedChips[currentPlayer.id] ??
                          currentPlayer.chips,
                      ),
                    )}
                  </span>
                )}
                <ValueChangeFlash
                  value={0}
                  prefix="+L"
                  position="top-right"
                  manualTrigger={winnerLegsFlashTrigger?.playerId === currentPlayer.id ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount } : null}
                />
                <ValueChangeFlash
                  value={0}
                  prefix="+$"
                  position="top-left"
                  manualTrigger={winnerPotFlashTrigger?.playerId === currentPlayer.id ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount } : null}
                />
              </div>
              {diceGameplayUiActive && horsesController.enabled && horsesController.isMyTurn && horsesController.gamePhase === "playing" ? (
                <Badge variant="outline" className={isTablet ? "text-sm" : "text-xs"}>
                  Rolls: {horsesController.localHand.rollsRemaining}
                </Badge>
              ) : !diceGameplayUiActive && currentPlayerCards.length > 0 && gameType === 'holm-game' && chuckyActive && !isGameOver && !allDecisionsIn && roundStatus === 'betting' ? (
                <Badge className="bg-poker-gold/20 text-poker-gold border-poker-gold/40 text-xs px-2 py-0.5">
                  {formatHandRank(evaluateHand(currentPlayerCards, false).rank)}
                </Badge>
              ) : null}
            </div>
          ) : null;

          return (
            <ShellHudGrid
              timer={hasTimer ? <DealAwareShellTimerRail /> : null}
              pane={paneContent}
              identity={identityContent}
            />
          );
        })()}
      </div>
    {/* Dice trace HUD for debugging observer hold/unhold hop */}
    {(gameType === 'horses' || gameType === 'ship-captain-crew') && <DiceTraceHUD />}
    </div>
  </ThreeFiveSevenDealRuntimeMaybe>
  </HolmDealRuntimeMaybe>;
};