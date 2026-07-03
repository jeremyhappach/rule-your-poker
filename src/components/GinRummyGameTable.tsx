// Gin Rummy Game Table - Mobile layout following CribbageMobileGameTable pattern
// Circular felt, opponent chip, tabs (cards, chat, lobby, history)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { readPersistedMatchChatTab, writePersistedMatchChatTab } from '@/lib/matchChatTabPersistence';
import { useGameStateSync, getGinRummyProgress } from '@/lib/gameStateSync';
import { useAuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentity';
import { isIdentityForward, type AuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentityPure';
import {
  type GinPresentationIdentity,
  ginIdentityEqual,
  ginIdentityKey,
  isGinIdentityForward,
  ginIdentityMismatchAxis,
} from '@/lib/ginRummy/presentationIdentity';


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
import { useLifecycleMount } from '@/lib/canonicalShell/lifecycleDebug';
import { useChangeTracker, useUnmountSnapshot } from '@/lib/canonicalShell/shellLifecycleLog';
import { ginTrace } from '@/lib/ginStartupTrace';

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
import { GinRummyDealOrchestrator } from './GinRummyDealOrchestrator';
import { GinAnchoredSlot } from './GinAnchoredSlot';
import { GinRummyPegBoard } from './GinRummyPegBoard';
import { DealRuntime, useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { CARDS_PER_PLAYER as GIN_CARDS_PER_PLAYER } from '@/lib/ginRummyTypes';
import type { ReactNode } from 'react';
import { GinRummyKnockDisplay } from './GinRummyKnockDisplay';
import { GinRummyOpponentDrawAnimation } from './GinRummyOpponentDrawAnimation';
import { GinRummySelfDrawAnimation } from './GinRummySelfDrawAnimation';
// GinRummyMatchWinner intentionally not imported — see terminal-lifecycle note below.
import { GinRummyKnockOverlay } from './GinRummyKnockOverlay';
import { GinRummyGinOverlay } from './GinRummyGinOverlay';
// eslint-disable-next-line no-restricted-imports -- P0 migration: move to shell-owned presentation.chipTransfer (plan step 3e)
import { CribbageChipTransferAnimation } from './CribbageChipTransferAnimation';
import { resolveChipEndpoint } from '@/lib/canonicalShell/chipEndpoints';
import { useAnnouncements } from '@/lib/canonicalShell/announcements';
import confetti from 'canvas-confetti';
import { MobileChatPanel } from './MobileChatPanel';
import { HandHistory } from './HandHistory';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { useKnockSound } from '@/hooks/useKnockSound';
import { useGameChatContext } from '@/hooks/GameChatContext';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';
import { usePublishShellFelt } from '@/lib/canonicalShell/ShellOwnedFeltHost';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { getCanonicalSlotPlacement } from '@/lib/canonicalShell/canonicalSlotPlacement';
import { GameplayOpponentSeatLayer } from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import { usePreSessionSeatOwned } from '@/lib/canonicalShell/PreSessionSeatLayer';
import { DealerIndicator } from './canonicalShell/DealerIndicator';
import { useRequiredSeatAnchors } from '@/lib/canonicalShell/SeatAnchorLayer';
import { useGeometryTokensOptional } from '@/lib/canonicalShell/ResponsiveGeometryProvider';


// (Opponent card-back strip moved to shell-owned
// GameplayOpponentSeatLayer → ShellOpponentCardBacks. Games emit
// typed `cardBacks` data; the shell renders the artifact.)
import { useShellTabBar } from '@/lib/canonicalShell/ShellTabBar';
// Phase 2: ShellHudGrid imposes the deterministic 5-row HUD grid.
// Gin's Phase 5 diagnostic local gold plate is preserved inside the
// timer row of the grid (semantically still "operational HUD chrome"
// adjacent to the tab bar) until canonical announcement wiring lands.
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { QuickEmoticonPicker } from './QuickEmoticonPicker';
import { recordStartupFlight, recordStartupValue, useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';

// Local card-id helpers (formerly in ginSelfDrawTrace) — used by the
// self-draw withhold registry.
const cardId = (c: { rank: string; suit: string } | null | undefined): string | null =>
  c ? `${c.rank}${c.suit}` : null;
const cardIds = (
  hand: Array<{ rank: string; suit: string }> | null | undefined,
): string[] => (hand ?? []).map(c => `${c.rank}${c.suit}`);



import { MessageSquare, User, Clock } from 'lucide-react';
import { GinRummyGameplayGeometryProvider } from '@/lib/wave5GameplayGeometry/GinRummyGameplayGeometryProvider';

const traceGinAnnouncement = (event: string, payload: Record<string, unknown> = {}) => {
  try {
    const params = new URLSearchParams(window.location.search);
    const enabled =
      params.get('trace_gin_announcements') === '1' ||
      window.localStorage.getItem('ptp_trace_gin_announcements') === '1';
    if (!enabled) return;
    console.log('[GIN_ANN_TRACE]', event, {
      t: Math.round(performance.now()),
      ...payload,
    });
  } catch {
    // no-op: diagnostic only
  }
};

const summarizeGinRunbackState = (state: GinRummyState | null | undefined) => state ? ({
  handNumber: state.handNumber ?? null,
  phase: state.phase ?? null,
  turnPhase: state.turnPhase ?? null,
  actionCount: state.actionCount ?? null,
  winnerPlayerId: state.winnerPlayerId ?? null,
  knockResult: state.knockResult ? {
    isGin: state.knockResult.isGin,
    isUndercut: state.knockResult.isUndercut,
    winnerId: state.knockResult.winnerId,
  } : null,
}) : null;

const summarizeGinRunbackIdentity = (identity: AuthoritativeIdentity | null | undefined) => identity ? ({
  dealerGameId: identity.dealerGameId ?? null,
  roundId: identity.roundId ?? null,
  handNumber: identity.handNumber ?? null,
}) : null;

const getGinRunbackHandCount = (state: GinRummyState | null | undefined, playerId: string | null | undefined) => {
  if (!state || !playerId) return null;
  return state.playerStates?.[playerId]?.hand?.length ?? null;
};

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

/**
 * DealRuntimeMaybe — wraps children with DealRuntime when a stable
 * handContextId exists. When absent, children render unwrapped so
 * destination consumers fall through to the legacy "full hand
 * immediately" path (useDealRuntime() returns null).
 */
function DealRuntimeMaybe({ handContextId, children }: { handContextId: string | null | undefined; children: ReactNode }) {
  if (!handContextId) return <>{children}</>;
  return (
    <DealRuntime key={handContextId} handContextId={handContextId} gameType="gin-rummy">
      {children}
    </DealRuntime>
  );
}

/**
 * GinDealClippedOpponentSeatLayer — wraps GameplayOpponentSeatLayer
 * with a deal-runtime-aware cardBacks clipper. During DEALING, each
 * opponent's visible cardback count is capped at the number of
 * intents addressed to that recipient that have already settled, so
 * cards arrive one at a time. PRE_DEAL → 0 backs. READY/GAMEPLAY or
 * no runtime → full hand size from the base callback.
 */
function GinDealClippedOpponentSeatLayer(props: {
  participants: Array<{ id: string; position: number; name: string; chips: number }>;
  presentation: import('@/lib/canonicalShell/GameplayOpponentSeatLayer').GameplayOpponentSeatPresentation;
  handContextId: string | null;
}) {
  const deal = useDealRuntime();
  const { handContextId } = props;
  const wrapped = useMemo<import('@/lib/canonicalShell/GameplayOpponentSeatLayer').GameplayOpponentSeatPresentation>(() => {
    const base = props.presentation;
    return {
      ...base,
      cardBacks: (p) => {
        const baseBacks = base.cardBacks?.(p) ?? null;
        if (!baseBacks) return baseBacks;
        // Contract: no DealRuntime, no committed hand context, or hand
        // context mismatch → opponent cardback count = 0. Prevents the
        // duplicate-visual where the full authoritative opponent stack
        // paints before/while the opening deal transports those same
        // cards.
        if (!deal || !handContextId || deal.handContextId !== handContextId) {
          return { ...baseBacks, count: 0, visible: false };
        }
        // PRE_DEAL or DEALING → only show settled-at-destination count.
        if (deal.phase === 'PRE_DEAL' || deal.phase === 'DEALING') {
          const allowed = deal.getSettledCountForPlayer(p.id);
          if (allowed <= 0) return { ...baseBacks, count: 0, visible: false };
          return { ...baseBacks, count: Math.min(baseBacks.count, allowed) };
        }
        // READY or GAMEPLAY → authoritative opponent hand length.
        return baseBacks;
      },
    };
  }, [props.presentation, deal, handContextId]);
  return (
    <GameplayOpponentSeatLayer
      family="gin-rummy"
      participants={props.participants}
      presentation={wrapped}
    />
  );
}


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

type AcceptedGinPresentation = {
  identity: GinPresentationIdentity;
  state: GinRummyState;
} | null;

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
  useLifecycleMount('GinRummyGameTable');
  useStartupMountTrace('GinRummyGameTable', { gameId, dealerGameId: dealerGameId ?? null, propRoundId: propRoundId ?? null });
  useStartupRenderTrace('GinRummyGameTable', {
    gameId,
    propRoundId: propRoundId ?? null,
    dealerGameId: dealerGameId ?? null,
    propHandNumber,
    bootstrapState: bootstrapState ? { phase: bootstrapState.phase, handNumber: (bootstrapState as any).handNumber ?? null } : null,
    playersCount: players.length,
    pot,
  }, { file: 'src/components/GinRummyGameTable.tsx' });
  useChangeTracker('GinRummyGameTable', 'identity', `${dealerGameId ?? '-'}|${propRoundId ?? '-'}|h${propHandNumber}`);
  useUnmountSnapshot('GinRummyGameTable', {
    parent: 'PlayfieldSlotController children (gin-rummy gameplay branch in Game.tsx)',
    gameId, dealerGameId, propRoundId, propHandNumber,
    keyedByParent: 'no explicit key on this element (parent: PlayfieldSlotController slot div keyed by mountedIdentity)',
  });
  useEffect(() => {
    ginTrace('GinRummyGameTable mounted', {
      hasPropRoundId: !!propRoundId,
      propHandNumber,
      hasBootstrap: !!bootstrapState,
      hasBootstrapPhase: bootstrapState?.phase ?? null,
      dealerGameId: dealerGameId ?? null,
    });
  }, []);

  // ── Identity/bootstrap arrival traces (one-time edges) ──
  const propRoundIdSeenRef = useRef(false);
  useEffect(() => {
    if (!propRoundIdSeenRef.current && propRoundId) {
      propRoundIdSeenRef.current = true;
      ginTrace('gin.propRoundId arrived', { propRoundId, propHandNumber });
    }
  }, [propRoundId, propHandNumber]);

  const bootstrapSeenRef = useRef(false);
  useEffect(() => {
    if (!bootstrapSeenRef.current && bootstrapState) {
      bootstrapSeenRef.current = true;
      ginTrace('gin.bootstrapState arrived', {
        phase: bootstrapState.phase,
        handNumber: (bootstrapState as any)?.handNumber ?? null,
      });
    }
  }, [bootstrapState]);

  // Publish canonical felt context to shell-owned host (sole felt mount).
  usePublishShellFelt({
    gameKind: 'gin-rummy',
    anteAmount,
    isWaitingPhase: false,
    feltPlateMode: 'GAME',
    publisherLabel: 'GinRummyGameTable',
  });
  const firstRenderRef = useRef(false);
  if (!firstRenderRef.current) {
    firstRenderRef.current = true;
    ginTrace('gin.first-render', { hasBootstrap: !!bootstrapState });
  }
  const { getCardBackColors } = useVisualPreferences();

  const cardBackColors = getCardBackColors();
  const { playKnock } = useKnockSound();
  
  // Prevent screen from dimming during gameplay
  useWakeLock(true);

  const { allMessages, sendMessage, isSending: isChatSending, latestRealtimeMessage, isChatHydrated, hydrationBaselineIds } = useGameChatContext();
  const announcements = useAnnouncements();
  const preSessionSeatOwnedByShell = usePreSessionSeatOwned();
  // (debug instrumentation moved to AnnouncementDebugPanel)

  const [acceptedPresentation, setAcceptedPresentation] = useState<AcceptedGinPresentation>(null);

  // ── Phase 2: framework-owned authoritative identity ─────────────
  // Dealer-game-scoped feed observes new rounds across boundaries so the
  // client cannot become structurally blind to a forward-advanced hand
  // started by a peer client.
  const { identity: authIdentity } = useAuthoritativeIdentity({ dealerGameId });
  useEffect(() => {
    recordStartupValue('IDENTITY TIMELINE', 'authIdentity available', authIdentity ? {
      dealerGameId: authIdentity.dealerGameId ?? null,
      roundId: authIdentity.roundId ?? null,
      handNumber: authIdentity.handNumber ?? null,
    } : null, { file: 'src/components/GinRummyGameTable.tsx', gameId });
  }, [authIdentity?.dealerGameId, authIdentity?.roundId, authIdentity?.handNumber, gameId]);

  const authIdentitySeenRef = useRef(false);
  useEffect(() => {
    if (!authIdentitySeenRef.current && authIdentity?.roundId) {
      authIdentitySeenRef.current = true;
      ginTrace('gin.authIdentity arrived', {
        roundId: authIdentity.roundId,
        handNumber: authIdentity.handNumber ?? null,
        dealerGameId: authIdentity.dealerGameId ?? null,
      });
    }
  }, [authIdentity?.roundId, authIdentity?.handNumber, authIdentity?.dealerGameId]);


  // ── Canonical 3-axis presentation identity (Plan A) ─────────────
  // ONE immutable object. All render paths consume acceptedPresentation
  // only; its identity and state are installed together or cleared together.
  const [committedIdentity, setCommittedIdentity] = useState<GinPresentationIdentity | null>(null);

  // Compute the incoming complete tuple. If ANY axis is missing, return
  // null — partial tuples never become committedIdentity.
  const incomingIdentity = useMemo<GinPresentationIdentity | null>(() => {
    const propHand = propHandNumber ?? -1;
    const authHand = authIdentity?.handNumber ?? -1;
    const useAuth = authIdentity?.roundId != null && authHand >= propHand;
    const r = useAuth ? authIdentity!.roundId! : propRoundId;
    const dg = useAuth
      ? (authIdentity?.dealerGameId ?? dealerGameId ?? null)
      : (dealerGameId ?? null);
    const h = useAuth ? authHand : propHand;
    if (!r || !dg || !h || h <= 0) return null;
    return { dealerGameId: dg, roundId: r, handNumber: h };
  }, [propRoundId, propHandNumber, authIdentity?.roundId, authIdentity?.handNumber, authIdentity?.dealerGameId, dealerGameId]);

  // identityBoundaryPending: one-frame neutral pass when committedIdentity
  // and the freshly-computed incomingIdentity disagree on any axis. Hard
  // render-side nuller so a stale tuple never paints under a new identity.
  const identityBoundaryPending = !!committedIdentity && !!incomingIdentity &&
    !ginIdentityEqual(committedIdentity, incomingIdentity) &&
    isGinIdentityForward(committedIdentity, incomingIdentity);
  const renderCommittedIdentity = identityBoundaryPending ? null : committedIdentity;
  const renderAcceptedPresentation = !renderCommittedIdentity
    ? null
    : acceptedPresentation;


  // Atomic committedIdentity transitions. Every forward change to any axis
  // enters the same neutral boundary before the next tuple can render.
  // The updater also schedules setAcceptedPresentation(null) so React
  // batches identity-null + presentation-null into ONE re-render. There
  // is no transient frame where committedIdentity=null and
  // acceptedPresentation still holds an outgoing-hand state.
  useEffect(() => {
    if (!incomingIdentity) return;
    setCommittedIdentity((prev) => {
      if (ginIdentityEqual(prev, incomingIdentity)) return prev;
      if (prev && !isGinIdentityForward(prev, incomingIdentity)) {
        return prev;
      }
      if (prev) {
        setAcceptedPresentation(null);
        return null;
      }
      return incomingIdentity;
    });
  }, [incomingIdentity, committedIdentity, gameId, authIdentity]);

  // Note: sync-framework reset on identity change is handled by the
  // existing `roundId`-keyed reset effect further below (alias of
  // committedIdentity.roundId), so it fires automatically.


  // Aliases — all downstream references read these. NEVER read prop or
  // auth fragments directly for identity from this point onward.
  const roundId = renderCommittedIdentity?.roundId ?? '';
  const handNumber = renderCommittedIdentity?.handNumber ?? 0;
  const currentRoundId = roundId;
  const currentHandNumber = handNumber;
  // Plan A: handContextId is derived ONLY from committedIdentity. Never
  // from prop+local+local. When committedIdentity is null, handContextId
  // is null → DealRuntimeMaybe does not mount DealRuntime and the
  // orchestrator gate (handContextId && ...) does not mount the
  // orchestrator. No opening-deal dispatch occurs.
  const handContextId = renderCommittedIdentity ? ginIdentityKey(renderCommittedIdentity) : null;
  // Refs mirror committedIdentity so callback closures (applyState,
  // overlay effects, bootstrap load) can identity-gate without rebinding.
  const currentRoundIdRef = useRef<string>(roundId);
  const currentHandNumberRef = useRef<number>(handNumber);
  const committedIdentityRef = useRef<GinPresentationIdentity | null>(renderCommittedIdentity);
  const acceptedPresentationRef = useRef<AcceptedGinPresentation>(renderAcceptedPresentation);
  currentRoundIdRef.current = roundId;
  currentHandNumberRef.current = handNumber;
  committedIdentityRef.current = renderCommittedIdentity;
  acceptedPresentationRef.current = renderAcceptedPresentation;

  const installAcceptedPresentation = useCallback((identity: GinPresentationIdentity, state: GinRummyState) => {
    setAcceptedPresentation({ identity, state });
  }, []);

  // DealRuntime/orchestrator blocked trace — fires once per render when
  // committedIdentity is null. Surfaces the explicit "neutral incoming"
  // contract in the runback pill.
  useEffect(() => {
    if (committedIdentity != null) return;
  }, [committedIdentity, incomingIdentity, gameId, authIdentity]);
  useEffect(() => {
    recordStartupValue('IDENTITY TIMELINE', 'GinRummyGameTable.identity', `${dealerGameId ?? '-'}|${roundId ?? '-'}|h${handNumber}`, {
      file: 'src/components/GinRummyGameTable.tsx',
      propRoundId: propRoundId ?? null,
      authRoundId: authIdentity?.roundId ?? null,
    });
  }, [dealerGameId, roundId, handNumber, propRoundId, authIdentity?.roundId]);

  const roundIdSeenRef = useRef(false);
  useEffect(() => {
    if (!roundIdSeenRef.current && roundId) {
      roundIdSeenRef.current = true;
      ginTrace('gin.roundId established', {
        roundId,
        handNumber,
        source: authIdentitySeenRef.current ? 'authIdentity-or-prop' : 'prop-only',
      });
    }
  }, [roundId, handNumber]);


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
    // Handoff step 1: drop OUTGOING presentation immediately.
    setGinState(null);
    // Handoff step 2: pre-advance the identity latch to the INCOMING round
    // BEFORE `currentRoundId` state catches up. Any in-flight realtime/poll
    // callbacks still closed over the outgoing round will fail the latch
    // check in applyState and be dropped, so a stale R{N} payload cannot
    // be accepted under R{N+1}.
    if (authIdentity.roundId) {
      roundIdLatchRef.current = authIdentity.roundId;
    }
    // Handoff step 3: clear overlay-fire latches so any pending overlay
    // computed under the outgoing identity cannot fire under the incoming
    // identity. Re-armed by the roundId-change reset effect.
    ginOverlayFiredRef.current = false;
    knockOverlayFiredRef.current = false;
    prevPhaseRef.current = null;
    setShowKnockOverlay(false);
    setShowGinOverlay(false);
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
    identityResetState: null,
    identity: authIdentity,
  });

  // Sync framework is now fed directly by applyState (realtime/poll handler).
  // Local mutations feed it via ginSync.applyOptimistic() / updateState().

  // One render-owned envelope. Renderers and local action paths never mix a
  // state object from one holder with identity/provenance from another.
  const acceptedPresentationMatches = ginIdentityEqual(renderAcceptedPresentation?.identity ?? null, renderCommittedIdentity);
  const viewState = acceptedPresentationMatches ? renderAcceptedPresentation?.state ?? null : null;
  const ginState = viewState;
  const isPlayable = !!renderCommittedIdentity && !!renderAcceptedPresentation && acceptedPresentationMatches;
  const visiblePlayable = isPlayable;
  const setGinState = useCallback((state: GinRummyState | null) => {
    const sourceIdentity = renderCommittedIdentity;
    const activeIdentity = committedIdentityRef.current;
    if (!state) {
      if (!activeIdentity || ginIdentityEqual(sourceIdentity, activeIdentity)) {
        setAcceptedPresentation(null);
      }
      return;
    }
    if (!sourceIdentity || !ginIdentityEqual(sourceIdentity, activeIdentity)) return;
    if ((state.handNumber ?? 0) !== sourceIdentity.handNumber) return;
    setAcceptedPresentation({ identity: sourceIdentity, state });
  }, [renderCommittedIdentity]);
  const lastAuthoritativeSignatureRef = useRef<string | null>(null);
  const localOptimisticSignatureRef = useRef<string | null>(null);
  const firstAcceptedCurrentRoundSnapshotRef = useRef(false);
  const signatureForGinRunback = useCallback((state: GinRummyState | null | undefined) => {
    if (!state) return 'null';
    return `${state.handNumber ?? 0}|${state.phase}|${state.turnPhase ?? ''}|${state.actionCount ?? 0}|${state.winnerPlayerId ?? ''}|${state.knockResult?.winnerId ?? ''}|${state.knockResult?.isGin ? 'gin' : 'nogin'}`;
  }, []);

  const bootstrapAppliedRef = useRef(false);
  useEffect(() => {
    if (!bootstrapState || !roundId) {
      recordStartupFlight('EFFECT TIMELINE', 'bootstrapState apply effect skipped', {
        file: 'src/components/GinRummyGameTable.tsx',
        function: 'bootstrapState apply useEffect',
        skipReason: !bootstrapState ? 'no bootstrapState' : 'no roundId',
        hasBootstrapState: !!bootstrapState,
        hasRoundId: !!roundId,
      });
      ginTrace('gin.receiveAuthoritativeUpdate gated', {
        hasBootstrapState: !!bootstrapState,
        hasRoundId: !!roundId,
      });
      return;
    }
    // Site 6 admission — full 3-axis provenance.
    const payloadProvenance: GinPresentationIdentity | null =
      dealerGameId && propRoundId && bootstrapState.handNumber && bootstrapState.handNumber > 0
        ? { dealerGameId, roundId: propRoundId, handNumber: bootstrapState.handNumber }
        : null;
    const mismatch = ginIdentityMismatchAxis(payloadProvenance, committedIdentityRef.current);
    if (mismatch) {
      return;
    }
    const result = ginSync.receiveAuthoritativeUpdate(bootstrapState);
    recordStartupFlight('SYNC TIMELINE', 'bootstrapState receiveAuthoritativeUpdate returned', {
      file: 'src/components/GinRummyGameTable.tsx',
      function: 'bootstrapState apply useEffect',
      roundId,
      oldValue: null,
      newValue: { phase: bootstrapState.phase, handNumber: (bootstrapState as any)?.handNumber ?? null },
      result,
    });
    if (result.accepted) {
      lastAuthoritativeSignatureRef.current = signatureForGinRunback(bootstrapState);
      installAcceptedPresentation(payloadProvenance!, bootstrapState);
    }
    if (!bootstrapAppliedRef.current && result.accepted) {
      bootstrapAppliedRef.current = true;
      ginTrace('gin.receiveAuthoritativeUpdate first-accepted', {
        roundId,
        phase: bootstrapState.phase,
      });
    }
    ginTrace('gin.bootstrapState applied', { accepted: result.accepted, phase: bootstrapState.phase });
  }, [bootstrapState, roundId]);


  // First non-null viewState (presentation ready) — the gate that
  // unblocks the playable subtree render path at line ~1589.
  const viewStateReadyRef = useRef(false);
  useEffect(() => {
    recordStartupValue('SYNC TIMELINE', 'GinRummyGameTable.presentationState', ginSync.presentationState ? {
      phase: (ginSync.presentationState as any)?.phase ?? null,
      handNumber: (ginSync.presentationState as any)?.handNumber ?? null,
      currentPlayerId: (ginSync.presentationState as any)?.currentPlayerId ?? null,
      turnIndex: (ginSync.presentationState as any)?.turnIndex ?? null,
    } : null, { file: 'src/components/GinRummyGameTable.tsx', roundId: roundId ?? null });
    if (viewStateReadyRef.current) return;
    if (!ginSync.presentationState) return;
    viewStateReadyRef.current = true;
    ginTrace('gin.viewState ready (first non-null)', {
      phase: (ginSync.presentationState as any)?.phase ?? null,
      handNumber: (ginSync.presentationState as any)?.handNumber ?? null,
    });
  }, [ginSync.presentationState]);

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
  const [activeTab, setActiveTabRaw] = useState<'cards' | 'chat' | 'lobby' | 'history'>(
    () => readPersistedMatchChatTab(gameId, 'cards') as 'cards' | 'chat' | 'lobby' | 'history'
  );
  const setActiveTab = useCallback((next: 'cards' | 'chat' | 'lobby' | 'history') => {
    writePersistedMatchChatTab(gameId, next);
    setActiveTabRaw(next);
  }, [gameId]);
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

  // Publish tab metadata to the shell-owned tab bar.
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

  // Chip transfer animation at match end (player-to-player like cribbage)
  const [chipAnimTriggerId, setChipAnimTriggerId] = useState<string | null>(null);
  const [storedChipPositions, setStoredChipPositions] = useState<{
    winner: { x: number; y: number };
    losers: { playerId: string; x: number; y: number }[];
  } | null>(null);
  const [chipAnimAmount, setChipAnimAmount] = useState(0);
  // matchEndAnimatedRef removed — replaced by matchEndKeyRef (keyed on dealerGameId+winnerId) for hard idempotency.
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevPhaseRef = useRef<string | null>(null);
  const [showKnockOverlay, setShowKnockOverlay] = useState(false);
  const [showGinOverlay, setShowGinOverlay] = useState(false);

  useEffect(() => {
    if (!showKnockOverlay && !showGinOverlay) return;
    const overlay = showGinOverlay ? 'gin' : 'knock';
    requestAnimationFrame(() => {
      traceGinAnnouncement('overlay:paint', {
        overlay,
        phase: viewState?.phase ?? ginState?.phase ?? null,
        roundId: currentRoundId?.slice(0, 8) ?? null,
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        handNumber,
      });
    });
  }, [showKnockOverlay, showGinOverlay, viewState?.phase, ginState?.phase, currentRoundId, dealerGameId, handNumber]);

  // Opponent draw animation state
  const [opponentDrawTriggerId, setOpponentDrawTriggerId] = useState<string | null>(null);
  const [opponentDrawSource, setOpponentDrawSource] = useState<'stock' | 'discard'>('stock');
  const [opponentDrawCard, setOpponentDrawCard] = useState<GinRummyCard | null>(null);
  const [opponentDrawTargetSlot, setOpponentDrawTargetSlot] = useState<CanonicalSlot | null>(null);
  const [opponentDrawKey, setOpponentDrawKey] = useState(0);
  // Self draw animation state — mirrors opponent transport, destination
  // resolves to the active-player box (`[data-gin-active-pane-content]`).
  //
  // Keyed by intentId so each in-flight transport tracks its own card
  // identity. The withheld-card display gate releases that exact card
  // when its own SELF_DRAW_TRANSPORT_SETTLED fires — independent of any
  // subsequent draw. This prevents the "one card behind" leak where a
  // stale withholding from the prior draw kept the prior card hidden.
  interface SelfDrawIntent {
    intentId: string;
    source: 'stock' | 'discard';
    card: GinRummyCard | null;
    drawnCardId: string | null;
    handContextId: string | null;
    actionKey: string;
  }
  const [selfDrawIntents, setSelfDrawIntents] = useState<Record<string, SelfDrawIntent>>({});
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
  const shellAnchors = useRequiredSeatAnchors('gin-rummy');
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

  // Canonical table-surface max-height token (single configurable contract).
  const geometryTokens = useGeometryTokensOptional();
  const tableSurfaceMaxHeight = geometryTokens?.tableSurfaceMaxHeight ?? '55vh';

  // Canonical slot placement — sourced from the shell's single
  // ergonomic-projection contract (canonicalSlotPlacement). This is the
  // same anchor used by the spotlight cone, chip-transport endpoints,
  // and any future seat-anchored overlays. No Gin-specific coordinates.
  // (See: src/lib/canonicalShell/canonicalSlotPlacement.ts)




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
    if (!ginState) {
      return;
    }
    // ── Overlay identity boundary ──
    // Overlays may fire only from an accepted authoritative snapshot for the
    // CURRENT incoming identity. Stale ginState (prior hand), null/bootstrap
    // ginState, and any state whose handNumber does not match the live
    // identity must not produce knock/gin overlays under R{N+1}.
    const stateHand = ginState.handNumber ?? 0;
    if (stateHand > 0 && currentHandNumber > 0 && stateHand !== currentHandNumber) {
      return;
    }
    const currentPhase = ginState.phase;
    const anyPlayerHasGin = ginState.playerStates && Object.values(ginState.playerStates).some(ps => ps.hasGin);
    if (currentPhase === 'knocking' && prevPhaseRef.current !== 'knocking' && !showKnockOverlay && !knockOverlayFiredRef.current) {
      console.log('[GIN] Phase → knocking, showing knock overlay');
      traceGinAnnouncement('overlay:trigger', {
        overlay: 'knock',
        phase: currentPhase,
        prevPhase: prevPhaseRef.current,
        scopeDealerGameId: gameId,
        propDealerGameId: dealerGameId,
        roundId: currentRoundId,
        handNumber: ginState.handNumber ?? handNumber,
      });
      knockOverlayFiredRef.current = true;
      setTimeout(() => playKnock(), 100);
      setShowKnockOverlay(true);
    }
    // Detect gin: phase goes to scoring/complete with hasGin flag on a player
    if (
      (currentPhase === 'scoring' || currentPhase === 'complete') &&
      prevPhaseRef.current !== 'scoring' &&
      prevPhaseRef.current !== 'complete' &&
      !showGinOverlay &&
      !ginOverlayFiredRef.current &&
      (ginState.knockResult?.isGin || anyPlayerHasGin)
    ) {
      console.log('[GIN] GIN detected, showing gin overlay');
      traceGinAnnouncement('overlay:trigger', {
        overlay: 'gin',
        phase: currentPhase,
        prevPhase: prevPhaseRef.current,
        scopeDealerGameId: gameId,
        propDealerGameId: dealerGameId,
        roundId: currentRoundId,
        handNumber: ginState.handNumber ?? handNumber,
      });
      ginOverlayFiredRef.current = true;
      setShowGinOverlay(true);
    }

    // Canonical INTERIM hand-result plate. Fires simultaneously with the
    // centered overlay (knock at `knocking`, gin at `scoring`/`complete`
    // with hasGin) so the rail and overlay land in the same frame. The
    // interim emission uses the rail-visible `round_win` type (not the
    // CTA-ambient `waiting_for_player`, which the rail intentionally
    // suppresses). A long TTL keeps it sticky until processCompletion
    // dismisses it and emits the final scored hand_result on the rail.
    const showOverlayPhase =
      currentPhase === 'knocking' ||
      currentPhase === 'laying_off' ||
      ((currentPhase === 'scoring' || currentPhase === 'complete') &&
        (ginState.knockResult?.isGin || anyPlayerHasGin));
    if (showOverlayPhase && dealerGameId) {
      const knockerEntry = Object.entries(ginState.playerStates).find(
        ([, ps]) => ps.hasKnocked || ps.hasGin,
      );
      if (knockerEntry) {
        const [knockerId, knockerState] = knockerEntry;
        const knockerName = getPlayerUsername(knockerId);
        const text = knockerState?.hasGin
          ? `${knockerName} went gin!`
          : `${knockerName} knocked! (${knockerState?.deadwoodValue ?? 0} dw)`;
        const interimId = `${gameId}:${dealerGameId}:gin-interim-hand-result:${ginState.handNumber ?? handNumber}`;
        traceGinAnnouncement('interim_hand_result:emit:callsite', {
          id: interimId,
          phase: currentPhase,
          overlayPhase: showOverlayPhase,
          scopeDealerGameId: gameId,
          propDealerGameId: dealerGameId,
          roundId: currentRoundId,
          text,
        });
        announcements.emit({
          id: interimId,
          type: 'round_win',
          scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
          payload: { text },
          // Sticky: hold the rail until processCompletion supersedes
          // with the final scored hand_result. Cleared explicitly by
          // dismiss(interimId) below; this TTL is just a safety net.
          ttlMs: 60000,
        });
      }
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

    // Seated players see opponent draws via the felt animation; their
    // OWN draws use the self-draw animation (pile → active-pane box).
    if (currentPlayerId && action.playerId === currentPlayerId) {
      if (action.type === 'draw_stock' || action.type === 'draw_discard') {
        const source = action.type === 'draw_stock' ? 'stock' : 'discard';
        const intentId = `self-draw-${actionKey}`;
        const drawnCard = action.card ?? null;
        const drawnIdForIntent = cardId(drawnCard);
        setSelfDrawIntents(prev => {
          if (prev[intentId]) return prev;
          return {
            ...prev,
            [intentId]: {
              intentId,
              source,
              card: drawnCard,
              drawnCardId: drawnIdForIntent,
              handContextId: handContextId ?? null,
              actionKey,
            },
          };
        });
      }
      return;
    }
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
      ginTrace('gin.hydration load:start', { roundId: roundId?.slice(0, 8) });
      const { data, error } = await supabase
        .from('rounds')
        .select('gin_rummy_state')
        .eq('id', roundId)
        .single();

      if (!error && data?.gin_rummy_state) {
        const state = data.gin_rummy_state as unknown as GinRummyState;
        // Site 6 admission — full 3-axis provenance.
        const expectedHand = currentHandNumberRef.current;
        const stateHand = (state as { handNumber?: number })?.handNumber ?? 0;
        const fetchProvenance: GinPresentationIdentity | null =
          dealerGameId && roundId && stateHand > 0
            ? { dealerGameId, roundId, handNumber: stateHand }
            : null;
        const fetchMismatch = ginIdentityMismatchAxis(fetchProvenance, committedIdentityRef.current);
        if (fetchMismatch) {
          return;
        }
        const result = ginSync.receiveAuthoritativeUpdate(state);
        if (result.accepted) {
          lastAuthoritativeSignatureRef.current = signatureForGinRunback(state);
          installAcceptedPresentation(fetchProvenance!, state);
          if (!firstAcceptedCurrentRoundSnapshotRef.current && stateHand === expectedHand) {
            firstAcceptedCurrentRoundSnapshotRef.current = true;
          }
        }
        console.log('[GIN_RUNTIME_TIMELINE] viewState hydration load:applied', {
          gameId,
          roundId: roundId?.slice(0, 8),
          elapsedMs: Math.round(performance.now() - startedAt),
          accepted: result.accepted,
          reason: result.reason,
          phase: state.phase,
          handNumber: state.handNumber ?? null,
        });
        ginTrace('gin.hydration load:applied', {
          elapsedMs: Math.round(performance.now() - startedAt),
          accepted: result.accepted,
          phase: state.phase,
        });
      } else {
        console.warn('[GIN_RUNTIME_TIMELINE] viewState hydration load:empty', {
          gameId,
          roundId: roundId?.slice(0, 8),
          elapsedMs: Math.round(performance.now() - startedAt),
          error: error?.message ?? null,
        });
        ginTrace('gin.hydration load:empty', {
          elapsedMs: Math.round(performance.now() - startedAt),
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
      const stateHandForTrace = (state as { handNumber?: number } | null)?.handNumber ?? 0;
      recordStartupFlight('SYNC TIMELINE', 'Gin applyState entered', {
        file: 'src/components/GinRummyGameTable.tsx',
        function: 'applyState',
        source,
        roundId,
        phase: state.phase,
        handNumber: (state as any)?.handNumber ?? null,
      });
      if (!isActive) {
        return;
      }
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
      // Site 6 admission — full 3-axis provenance.
      const expectedHand = currentHandNumberRef.current;
      const stateHand = (state as { handNumber?: number } | null)?.handNumber ?? 0;
      const rtProvenance: GinPresentationIdentity | null =
        dealerGameId && roundId && stateHand > 0
          ? { dealerGameId, roundId, handNumber: stateHand }
          : null;
      const rtMismatch = ginIdentityMismatchAxis(rtProvenance, committedIdentityRef.current);
      if (rtMismatch) {
        logDebugEvent({
          gameId, roundId, userId: currentUserId, clientRole: 'actor',
          eventType: 'gin:identity_provenance_drop',
          payload: ginStateSummary(state, {
            source,
            mismatchAxis: rtMismatch,
            payload: ginIdentityKey(rtProvenance),
            committed: ginIdentityKey(committedIdentityRef.current),
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
      recordStartupFlight('SYNC TIMELINE', 'Gin receiveAuthoritativeUpdate from applyState returned', {
        file: 'src/components/GinRummyGameTable.tsx',
        function: 'applyState',
        source,
        roundId,
        oldValue: null,
        newValue: { phase: state.phase, handNumber: (state as any)?.handNumber ?? null },
        result,
      });
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
        lastAuthoritativeSignatureRef.current = signatureForGinRunback(state);
        installAcceptedPresentation(rtProvenance!, state);
        if (!firstAcceptedCurrentRoundSnapshotRef.current && stateHand === expectedHand) {
          firstAcceptedCurrentRoundSnapshotRef.current = true;
        }
        // NOTE: Match-win ownership inversion — we intentionally do NOT
        // call onGameCompleteRef.current() here when reaching
        // phase === 'complete' with a winnerPlayerId. The presentation
        // lifecycle in processCompletion (driven off viewState) owns
        // the terminal sequence end-to-end:
        //   hand_result → waitForDismiss → match_win → paint frame →
        //   confetti → chip transfer → onGameComplete.
        // Firing onGameComplete here races dealer-game teardown against
        // the canonical match_win paint, so the rail plate gets preempted
        // before observers/winner ever see it.
        if (state.phase === 'complete' && state.winnerPlayerId) {
          traceGinAnnouncement('applyState:onGameComplete:deferred-to-lifecycle', {
            source,
            winnerPlayerId: state.winnerPlayerId,
            roundId,
            dealerGameId,
            handNumber: state.handNumber ?? handNumber,
          });
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
          recordStartupFlight('REALTIME TIMELINE', 'GinRummyGameTable rounds callback fired / payload received', {
            file: 'src/components/GinRummyGameTable.tsx',
            function: 'round-specific realtime callback',
            table: 'rounds',
            row: (payload.new as any)?.id ?? roundId,
            eventType: payload.eventType,
            oldValue: null,
            newValue: {
              roundId: (payload.new as any)?.id ?? null,
              hasGinRummyState: !!(payload.new as any)?.gin_rummy_state,
              phase: ((payload.new as any)?.gin_rummy_state as any)?.phase ?? null,
            },
          });
          const newData = payload.new as { gin_rummy_state?: GinRummyState };
          if (newData.gin_rummy_state) {
            applyState(newData.gin_rummy_state, 'realtime');
          }
        }
      )
      .subscribe((status) => {
        console.log('[GIN-RUMMY] Realtime subscription status:', status);
        recordStartupFlight('REALTIME TIMELINE', 'GinRummyGameTable subscription status', {
          file: 'src/components/GinRummyGameTable.tsx',
          function: 'round-specific subscription status callback',
          channel: `gin-rummy-${roundId}`,
          oldValue: null,
          newValue: status,
        });
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
      // Gate hydration on the authoritative store signal, not on
      // "allMessages became non-empty" (which would treat the first
      // realtime message as hydration and auto-clear unread).
      if (!isChatHydrated) {
        return;
      }
      hasObservedInitialChatSnapshotRef.current = true;
      chatHydratedRef.current = true;

      const baselineSet = hydrationBaselineIds ? new Set(hydrationBaselineIds) : null;
      const baselineLatestEligible = baselineSet
        ? (eligibleIndicatorMessages.filter((m) => baselineSet.has(m.id)).slice(-1)[0] ?? null)
        : null;

      if (!lastSeenChatMessageIdRef.current && !lastReadChatMessageIdRef.current && baselineLatestEligible && !lastProcessedRealtimeMessageIdRef.current) {
        lastSeenChatMessageIdRef.current = baselineLatestEligible.id;
        lastReadChatMessageIdRef.current = baselineLatestEligible.id;
        setHasUnreadMessages(false);
        logChatIndicator('watermark updated', baselineLatestEligible, {
          flashing: false,
          unread: false,
          lastSeen: baselineLatestEligible.id,
          lastRead: baselineLatestEligible.id,
          reason: 'hydration-baseline-seed',
        });
        // Fall through so RED reconciliation can flag any post-baseline
        // messages that arrived during hydration.
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
    hydrationBaselineIds,
    isChatHydrated,
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

    // Replay / duplicate guard (do NOT compare against lastSeen — the
    // seen cursor must not silently absorb realtime messages).
    if (lastProcessedRealtimeMessageIdRef.current === latestRealtimeMessage.id) {
      return;
    }

    lastProcessedRealtimeMessageIdRef.current = latestRealtimeMessage.id;
    // Do NOT advance lastSeen/lastRead here. A realtime message is
    // post-hydration and must remain unread until an explicit
    // Chat-open/read acknowledgement.
    logChatIndicator('watermark updated', latestRealtimeMessage, {
      lastSeen: lastSeenChatMessageIdRef.current,
      lastRead: lastReadChatMessageIdRef.current,
      reason: 'eligible-realtime-observed-no-cursor-advance',
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
    // CRITICAL: both gates are also in the dep array below. Without that, the
    // bot effect could fire while isIdentityStale=true on the hand boundary,
    // bail, and then never re-run once the gate cleared (because none of
    // [ginState, currentPlayerId, isProcessing, players, roundId] would
    // change again). Symptom: stuck on "Bot deciding on upcard..." on the
    // 2nd hand. Keeping the refs for the synchronous read; deps wake us.
    if (isIdentityStaleRef.current || !interactionsAllowedRef.current) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'gin-rummy',
        handNumber: currentHandNumber ?? null,
        roundId: roundId ?? null,
        eventType: 'transition',
        severity: 'info',
        eventName: 'gin-bot-loop-skip-gated',
        payload: {
          isIdentityStale: isIdentityStaleRef.current,
          interactionsAllowed: interactionsAllowedRef.current,
          phase: ginState.phase,
          turnPhase: ginState.turnPhase,
          currentTurn: ginState.currentTurnPlayerId?.slice(0, 8) ?? null,
        },
      });
      return;
    }

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
  }, [ginState, currentPlayerId, isProcessing, players, roundId,
      // Wake-up deps: ensure bot loop re-fires when the identity/interactions
      // gate flips open AFTER ginState was already populated for a new hand.
      ginSync.isIdentityStale, ginSync.interactionsAllowed]);
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
  // Driven off viewState (presentation), NOT raw ginState. This keeps the
  // terminal lifecycle on a single authoritative-via-presentation trigger,
  // matches what the user actually sees, and prevents optimistic +
  // authoritative double-fire from re-running animation/announcement.
  //
  // Idempotency: the match-win path is keyed by `${dealerGameId}:${winnerId}`
  // in matchEndKeyRef so it can NEVER fire twice for the same terminal.
  // Hand-rotation path uses handCompletionInProgress as before.
  const handCompletionInProgress = useRef(false);
  const matchEndKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!viewState || viewState.phase !== 'complete') return;
    if (!dealerGameId) return;
    if (handCompletionInProgress.current) return;

    // Match-win idempotency: once a terminal key fires, do not refire.
    const matchKey = viewState.winnerPlayerId
      ? `${dealerGameId}:${viewState.winnerPlayerId}`
      : null;
    if (matchKey && matchEndKeyRef.current === matchKey) return;

    handCompletionInProgress.current = true;
    if (matchKey) matchEndKeyRef.current = matchKey;

    // Snapshot the dealerGameId at the moment we entered the terminal
    // lifecycle. Used as a stale-scope guard before firing the final
    // onGameComplete — if the parent advanced to a new dealer-game
    // (external teardown, reconnect, etc.) we must not double-fire the
    // transition for the prior game.
    const dealerGameIdAtStart = dealerGameId;
    const processCompletion = async () => {
      try {
        traceGinAnnouncement('completion:start', {
          phase: viewState.phase,
          winnerPlayerId: viewState.winnerPlayerId ?? null,
          roundId: currentRoundId,
          dealerGameId,
          handNumber,
        });
        // Record hand result (history only, no chip transfer per-hand)
        if (viewState.knockResult) {
          await recordGinRummyHandResult(gameId, dealerGameId, handNumber, viewState);
        }

        // ---- Canonical HAND-RESULT announcement ----
        // Emit a single round_win plate describing the hand outcome
        // (scored knock/gin/undercut OR void hand). The canonical
        // provider owns its TTL; match-win sequencing below waits for
        // this announcement to actually leave the rail via
        // waitForDismiss — no duplicated timeout constant.
        const handResultId = `${gameId}:${dealerGameId}:gin-hand-result:${handNumber}`;
        const interimId = `${gameId}:${dealerGameId}:gin-interim-hand-result:${handNumber}`;
        const handResultScope = { dealerGameId: gameId, roundId: currentRoundId ?? null };
        // Supersede the interim plate emitted at knock/gin moment so the
        // final scored hand_result takes over the same rail slot.
        announcements.dismiss(interimId);
        announcements.clearAmbient('waiting_for_player');
        if (viewState.knockResult) {
          const r = viewState.knockResult;
          const winnerName = getPlayerUsername(r.winnerId);
          const dwDiff = Math.abs(r.opponentDeadwood - r.knockerDeadwood);
          const bonus = r.isGin
            ? ` (${dwDiff} dw + 25 gin bonus)`
            : r.isUndercut
              ? ` (${dwDiff} dw + 25 undercut bonus)`
              : ` (${dwDiff} dw)`;
          traceGinAnnouncement('round_win:emit:callsite', {
            id: handResultId,
            scope: handResultScope,
            text: `${winnerName} +${r.pointsAwarded}${bonus}`,
          });
          announcements.emit({
            id: handResultId,
            type: 'round_win',
            scope: handResultScope,
            payload: { text: `${winnerName} +${r.pointsAwarded}${bonus}` },
          });
        } else {
          announcements.emit({
            id: handResultId,
            type: 'round_win',
            scope: handResultScope,
            payload: { text: 'Void Hand — Stock Exhausted' },
            ttlMs: 2500,
          });
        }

        // Match-win path
        if (viewState.winnerPlayerId) {
          // Gate match-win sequence on the hand-result actually leaving
          // the rail. Single source of truth = announcement lifecycle.
          traceGinAnnouncement('waitForDismiss:start', { id: handResultId });
          await announcements.waitForDismiss(handResultId);
          traceGinAnnouncement('waitForDismiss:resolved', { id: handResultId });

          const winnerId = viewState.winnerPlayerId;
          const loserId =
            winnerId === viewState.dealerPlayerId
              ? viewState.nonDealerPlayerId
              : viewState.dealerPlayerId;
          const winnerPlayer = players.find(p => p.id === winnerId);
          const loserPlayer = players.find(p => p.id === loserId);

          // ── Canonical match_win FIRST — unconditional ──
          // Emit on every client (winner / loser / observer) regardless
          // of whether the chip-transfer animation can resolve seat
          // endpoints. The rail plate is the canonical terminal surface;
          // chip-transfer is decorative and may be skipped on observers
          // whose container/seat refs aren't ready, but the rail must
          // still paint. Mirrors Cribbage's terminal lifecycle.
          if (winnerPlayer) {
            const winnerName = getDisplayName(
              players,
              winnerPlayer,
              winnerPlayer.profiles?.username || 'Player',
            );
            const winnerScore = viewState.matchScores?.[winnerId] ?? 0;
            const loserScore = viewState.matchScores?.[loserId] ?? 0;
            announcements.clearAmbient();
            const matchWinId = `${gameId}:${dealerGameId ?? 'no-dg'}:match_win:${winnerId}`;
            traceGinAnnouncement('match_win:emit:callsite', {
              id: matchWinId,
              scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
              winnerName,
              winnerScore,
              loserScore,
              amount: anteAmount,
            });
            announcements.emit({
              id: matchWinId,
              type: 'match_win',
              scope: { dealerGameId: gameId, roundId: currentRoundId ?? null },
              payload: {
                winnerName,
                score: { winner: winnerScore, loser: loserScore },
                amount: anteAmount,
              },
              // Keep the rail plate alive across the full chip-transfer
              // sequence (~4500ms + teardown). Scope boundary teardown
              // clears it when the dealer-game advances.
              ttlMs: 10000,
            });

            // Give the rail one paint frame so the match_win plate is
            // on-screen before confetti / chip animation kick in. Avoids
            // the visual race where chip-transfer setState triggers a
            // re-render path that competes with the announcement paint.
            await new Promise<void>((resolve) => {
              if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => resolve());
              } else {
                setTimeout(resolve, 16);
              }
            });
            traceGinAnnouncement('match_win:post-paint-frame', { id: matchWinId });

            // Winner-only confetti
            if (winnerPlayer.user_id === currentUserId) {
              traceGinAnnouncement('confetti:start', { id: matchWinId, winnerOnly: true });
              confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'],
              });
            }
          }

          // Chip-transfer animation — decorative; skip silently if seat
          // endpoints can't be resolved (rail still painted above).
          const container = tableContainerRef.current;
          if (container && winnerPlayer && loserPlayer) {
            const rect = container.getBoundingClientRect();
            const resolveSeat = (position: number, isLocal: boolean) => {
              const resolved = resolveChipEndpoint({
                ref: { kind: 'seat', position },
                container,
                debugLabel: 'gin-match-end',
              });
              if (resolved) {
                return { x: rect.left + resolved.x, y: rect.top + resolved.y };
              }
              return isLocal
                ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
                : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };
            };
            const winnerIsLocal = winnerPlayer.user_id === currentUserId;
            const loserIsLocal = loserPlayer.user_id === currentUserId;
            const winnerPos = resolveSeat(winnerPlayer.position, winnerIsLocal);
            const loserPos = resolveSeat(loserPlayer.position, loserIsLocal);
            setChipAnimAmount(anteAmount);
            setStoredChipPositions({
              winner: winnerPos,
              losers: [{ playerId: loserId, x: loserPos.x, y: loserPos.y }],
            });
            traceGinAnnouncement('chip-transfer:start', {
              triggerId: `gin-win-${dealerGameId}-${winnerId}`,
              amount: anteAmount,
            });
            setChipAnimTriggerId(`gin-win-${dealerGameId}-${winnerId}`);
          }

          // Wait for animation to play
          await new Promise(resolve => setTimeout(resolve, 4500));
          await endGinRummyGame(gameId, roundId, viewState);
          // Hard teardown of terminal UI before handing off — prevents the
          // chip-transfer overlay and any seat-projected terminal state from
          // bleeding into the next-game / dealer-setup surface.
          setStoredChipPositions(null);
          setChipAnimTriggerId(null);
          // Stale-scope guard: only fire the dealer-game transition if
          // we're still on the dealer-game that started this lifecycle.
          if (dealerGameIdAtStart === dealerGameId) {
            traceGinAnnouncement('onGameComplete:fire', {
              dealerGameId,
              winnerPlayerId: viewState.winnerPlayerId,
            });
            onGameCompleteRef.current();
          } else {
            traceGinAnnouncement('onGameComplete:skipped:stale-dealer-game', {
              dealerGameIdAtStart,
              dealerGameIdNow: dealerGameId,
            });
          }
          return;
        }

        // Start next hand after a delay (longer for gin so players can read cards)
        const isGin = viewState.knockResult?.isGin;
        const delay = !viewState.knockResult ? 1500 : isGin ? 5000 : 3000;
        await new Promise(resolve => setTimeout(resolve, delay));
        const result = await startNextGinRummyHand(gameId, dealerGameId, viewState);
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
  }, [viewState?.phase, viewState?.winnerPlayerId, dealerGameId]);



  const updateState = async (
    newState: GinRummyState,
    traceId?: string,
  ) => {
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
    localOptimisticSignatureRef.current = signatureForGinRunback(newState);
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
  // Shared pre-hold path for every self-draw action (stock, discard, and
  // take_first_draw upcard). Registers the pending-withheld intent before
  // any optimistic state commit or async await, so the drawn card never
  // renders in the active hand until its transport settles.
  const beginSelfDrawPresentation = (args: {
    source: 'stock' | 'discard';
    selectedCard: GinRummyCard | null;
    preState: GinRummyState;
    newState: GinRummyState;
  }): void => {
    const { source, newState } = args;
    const drawnCard = newState.lastAction?.card ?? null;
    const drawnId = cardId(drawnCard);
    const _action = newState.lastAction!;
    const _actionKey = `${_action.type}-${_action.playerId}-${_action.timestamp}`;
    const _intentId = `self-draw-${_actionKey}`;
    setSelfDrawIntents(prev => prev[_intentId] ? prev : {
      ...prev,
      [_intentId]: {
        intentId: _intentId,
        source,
        card: drawnCard,
        drawnCardId: drawnId,
        handContextId: handContextId ?? null,
        actionKey: _actionKey,
      },
    });
  };

  const handleDrawStock = async () => {
    const tid = newTraceId();
    logDebugEvent({
      gameId, roundId, userId: currentUserId, clientRole: 'actor',
      eventType: 'gin:input:draw_stock', traceId: tid,
      payload: ginStateSummary(ginState, { isProcessing, hasPlayer: !!currentPlayerId }),
    });
    if (!ginState) {
      return;
    }
    if (!currentPlayerId) {
      return;
    }
    if (isProcessing) {
      return;
    }
    try {
      const preState = ginState;
      const newState = drawFromStock(ginState, currentPlayerId);
      beginSelfDrawPresentation({
        source: 'stock',
        selectedCard: null,
        preState,
        newState,
      });
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
    if (!ginState) {
      return;
    }
    if (!currentPlayerId) {
      return;
    }
    if (isProcessing) {
      return;
    }
    try {
      const preState = ginState;
      const topDiscard = ginState.discardPile?.[ginState.discardPile.length - 1] ?? null;
      const newState = drawFromDiscard(ginState, currentPlayerId);
      beginSelfDrawPresentation({
        source: 'discard',
        selectedCard: topDiscard,
        preState,
        newState,
      });
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
        traceGinAnnouncement('overlay:trigger:local-action', {
          overlay: 'gin',
          phase: newState.phase,
          scopeDealerGameId: gameId,
          propDealerGameId: dealerGameId,
          roundId: currentRoundId,
          handNumber: newState.handNumber ?? handNumber,
        });
        localOptimisticSignatureRef.current = signatureForGinRunback(newState);
        ginOverlayFiredRef.current = true;
        setShowGinOverlay(true);
        // Write scoring state to DB so opponent sees gin phase and gets overlay too
        await supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        traceGinAnnouncement('local-action:scoring-state-written', {
          overlay: 'gin',
          phase: newState.phase,
          roundId: currentRoundId,
        });
        ginSync.applyOptimistic(newState);
        setGinState(newState);
        await new Promise(resolve => setTimeout(resolve, 3500));
        // Transition scoring → complete in one shot (no redundant scoring write)
        newState = scoreHand(newState);
      } else if (newState.phase === 'knocking') {
        // Knock! Show overlay FIRST locally, write to DB for opponent, then delay before tabling
        traceGinAnnouncement('overlay:trigger:local-action', {
          overlay: 'knock',
          phase: newState.phase,
          scopeDealerGameId: gameId,
          propDealerGameId: dealerGameId,
          roundId: currentRoundId,
          handNumber: newState.handNumber ?? handNumber,
        });
        localOptimisticSignatureRef.current = signatureForGinRunback(newState);
        setTimeout(() => playKnock(), 100);
        knockOverlayFiredRef.current = true;
        setShowKnockOverlay(true);
        // Write knocking state to DB so opponent sees overlay too
        await supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        traceGinAnnouncement('local-action:knocking-state-written', {
          overlay: 'knock',
          phase: newState.phase,
          roundId: currentRoundId,
        });
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
    const tid = newTraceId();
    if (!currentPlayerId) {
      return;
    }
    if (isProcessing) {
      return;
    }
    try {
      // Fetch fresh state from DB to prevent stale closure issues in multiplayer
      const fresh = await fetchFreshState();
      if (!fresh) {
        return;
      }
      if (fresh.phase !== 'first_draw') {
        return;
      }
      if (fresh.firstDrawOfferedTo !== currentPlayerId) {
        return;
      }
      const topDiscard = fresh.discardPile?.[fresh.discardPile.length - 1] ?? null;
      const newState = takeFirstDrawCard(fresh, currentPlayerId);
      // Route take_first_draw through the same shared pre-hold path as
      // normal stock/discard so the upcard is synchronously withheld
      // before the optimistic commit and released only on its matching
      // transport settle.
      beginSelfDrawPresentation({
        source: 'discard',
        selectedCard: topDiscard,
        preState: fresh,
        newState,
      });
      await updateState(newState, tid);
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

  // ── Phase 5 DIAGNOSTIC REVERT ─────────────────────────────────────────
  // Gin-only revert of the canonical announcement emit. Restores the
  // local gold-plate fallback below to isolate whether Phase 5's emit
  // useEffect was a side-channel into the hand-2 bot stall. Do not
  // re-add useAnnouncements here without coordinated re-migration.


  // P9.6: pre-viewState rendering — Gin owns the single authoritative
  // table geometry. Render the same layout shell (felt only, no
  // gameplay content) so there is exactly one canonical felt surface
  // mounted continuously from slot mount through first viewState. Do
  // NOT reintroduce lifecycle messaging or a separate pre-hand UI
  // surface; gameplay children are simply gated off until viewState
  // arrives.
  const placeholderPaintedRef = useRef(false);
  const playablePaintedRef = useRef(false);
  // Hand-boundary gate: when the monotonic handNumber has advanced past
  // the presentation's handNumber, the playable subtree below would
  // render the OLD hand's felt (pegboard, knockResult, prior cards) under
  // the NEW hand identity. That produces the "double game table /
  // double mount" symptom at the boundary — old completed-hand surface
  // visible while the new hand is hydrating. Treat the stale-hand window
  // identically to a null viewState so exactly ONE felt surface is
  // mounted at any frame across a hand transition.
  const viewStateHandNumber = (viewState as { handNumber?: number } | null)?.handNumber ?? 0;
  const isStaleHandPresentation =
    !!viewState && handNumber > 0 && viewStateHandNumber > 0 && viewStateHandNumber < handNumber;
  ginTrace('gin.placeholder gate', {
    hasViewState: !!viewState,
    hasBootstrapState: !!bootstrapState,
    hasRoundId: !!roundId,
    viewStateHandNumber,
    handNumber,
    isStaleHandPresentation,
    presentationStateNull: ginSync.presentationState == null,
    interactionsAllowed: ginSync.interactionsAllowed,
    isIdentityStale: ginSync.isIdentityStale,
  });
  Promise.resolve().then(() => {
    recordStartupValue('PLACEHOLDER TIMELINE', 'Gin placeholder gate', {
      hasViewState: !!viewState,
      hasBootstrapState: !!bootstrapState,
      hasRoundId: !!roundId,
      viewStateHandNumber,
      handNumber,
      isStaleHandPresentation,
      presentationStateNull: ginSync.presentationState == null,
      interactionsAllowed: ginSync.interactionsAllowed,
      isIdentityStale: ginSync.isIdentityStale,
    }, { file: 'src/components/GinRummyGameTable.tsx' });
  });
  // ISSUE 1 FIX: Do NOT early-return a placeholder that would unmount the
  // canonical shell chrome (ShellHudGrid, ActivePlayerHUD, seat clusters,
  // chip bubbles, identity row, announcement rail). The outer layout stays
  // mounted continuously from slot mount onward. Only the gameplay-specific
  // subtrees that REQUIRE a hydrated viewState are gated behind `isPlayable`.
  // Plan A: subtree may render ONLY when the render-owned envelope exists
  // and its identity exactly equals the current committedIdentity.
  // While ANY of these fails, no DealRuntime / orchestrator / felt /
  // overlay may render under a new identity.


  useEffect(() => {
  }, [gameId, authIdentity?.roundId, authIdentity?.handNumber, currentRoundId, currentHandNumber, viewState?.handNumber, viewState?.phase, ginState?.handNumber, ginState?.phase, isStaleHandPresentation, isPlayable, currentPlayerId, opponentId]);

  if (!isPlayable && !placeholderPaintedRef.current) {
    placeholderPaintedRef.current = true;
    recordStartupFlight('PLACEHOLDER TIMELINE', 'placeholder enter', {
      file: 'src/components/GinRummyGameTable.tsx',
      oldValue: 'not-painted',
      newValue: 'placeholder',
      hasViewState: !!viewState,
      isStaleHandPresentation,
    });
    ginTrace('gin.first painted (placeholder)');
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ginTrace('gin.placeholder visible (rAF)');
      }));
    }
  }
  if (!isPlayable && isStaleHandPresentation) {
    ginTrace('gin.placeholder forced (stale-hand at boundary)', {
      viewStateHandNumber,
      handNumber,
    });
  }
  if (isPlayable && !playablePaintedRef.current) {
    playablePaintedRef.current = true;
    recordStartupFlight('PLACEHOLDER TIMELINE', 'placeholder exit / first playable frame', {
      file: 'src/components/GinRummyGameTable.tsx',
      oldValue: 'placeholder',
      newValue: 'playable',
      hasViewState: !!viewState,
      handNumber,
      viewStateHandNumber,
    });
    ginTrace('gin.first painted (playable)');
    ginTrace('gin.playable gate', {
      hasViewState: !!viewState,
      hasBootstrapState: !!bootstrapState,
      hasRoundId: !!roundId,
      viewStateHandNumber,
      handNumber,
      isStaleHandPresentation,
    });
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ginTrace('first active gameplay visible');
      }));
    }
  }


  // Persistent match snapshot for the score rail. The rail is
  // persistent match state and must never blink/reset/remount during
  // opening-deal phases or across the identity-null pass between
  // hands. We seed it from the latest hydrated viewState and hold the
  // last seen value via a ref so the renderer always has data once
  // the first hand has hydrated.
  const persistentMatchSnapshotRef = useRef<{
    matchScores: Record<string, number>;
    pointsToWin: number;
    playerIds: [string, string];
  } | null>(null);
  const liveMatchSnapshot = viewState && currentPlayerId
    ? {
        matchScores: viewState.matchScores ?? {},
        pointsToWin: viewState.pointsToWin ?? 100,
        playerIds: [currentPlayerId, opponentId] as [string, string],
      }
    : null;
  if (liveMatchSnapshot) persistentMatchSnapshotRef.current = liveMatchSnapshot;
  const persistentMatchSnapshot = liveMatchSnapshot ?? persistentMatchSnapshotRef.current;


  return (
    <div className="h-full flex flex-col bg-transparent relative">
    <DealRuntimeMaybe handContextId={handContextId}>
      
      {/* Felt Area - Upper Section with canonical oval table */}
      <div
        ref={tableContainerRef}
        className="relative overflow-visible"
        style={{ height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)', pointerEvents: 'none' }}
      >

        <GinRummyGameplayGeometryProvider
          phase={(viewState?.phase ?? 'idle') as any}
          hidePiles={!!viewState && ['knocking', 'laying_off', 'scoring', 'complete'].includes(viewState.phase)}
          knockDisplayVisible={
            !!viewState &&
            (viewState.phase === 'knocking' ||
              viewState.phase === 'laying_off' ||
              viewState.phase === 'scoring' ||
              (viewState.phase === 'complete' && !!viewState.knockResult))
          }
        >

            {/* Shell owns canonical felt. */}

            {/* Persistent score rail — mounted continuously for the
                lifetime of this Gin component instance. Driven by a
                sticky match snapshot so it survives the identity-null
                pass between hands within a dealer game (no remount, no
                animate-from-zero blink). Match target denominator is
                ginState.pointsToWin (authoritative 100). */}
            {persistentMatchSnapshot && (
              <GinAnchoredSlot artifactId="gin.pegboard">
                {/* Direct mount. GinRummyPegBoard preserves the original
                    full-width internal rail layout, then measures the
                    visible label/track bounds and translates that visual
                    assembly onto the resolved GeoLab anchor. */}
                <GinRummyPegBoard
                  matchScores={persistentMatchSnapshot.matchScores}
                  pointsToWin={persistentMatchSnapshot.pointsToWin}
                  playerIds={persistentMatchSnapshot.playerIds}
                  getPlayerUsername={getPlayerUsername}
                />
              </GinAnchoredSlot>
            )}

            {/* Felt Content — requires hydrated viewState */}
            {visiblePlayable && viewState && (
              <GinRummyFeltContent
                ginState={viewState}
                currentPlayerId={currentPlayerId}
                opponentId={opponentId}
                currentTurnSlot={currentTurnSlot}
                currentTurnPosition={
                  viewState.currentTurnPlayerId
                    ? players.find(p => p.id === viewState.currentTurnPlayerId)?.position ?? null
                    : null
                }
                getPlayerUsername={getPlayerUsername}
                cardBackColors={cardBackColors}
                onDrawStock={handleDrawStock}
                onDrawDiscard={viewState.phase === 'first_draw' ? handleTakeFirstDraw : handleDrawDiscard}
                isProcessing={isProcessing}
                isPlayable={isPlayable}
                handContextId={handContextId}
              />
            )}

            {/* Wave 2 canonical deal orchestrator — emits the 22 Gin
                intents (20 alternating hidden, +stock, +discard upcard)
                once authoritative state hydrates. Also mounts the
                canonical [data-card-anchor="hand-${selfPlayerId}"]
                terminus for self-recipient intents. */}
            {handContextId && viewState && currentPlayerId &&
              viewState.dealerPlayerId && viewState.nonDealerPlayerId &&
              (viewState.playerStates?.[currentPlayerId]?.hand?.length ?? 0) >= GIN_CARDS_PER_PLAYER &&
              viewState.discardPile?.[0] ? (
                <GinRummyDealOrchestrator
                  handContextId={handContextId}
                  dealerPlayerId={viewState.dealerPlayerId}
                  nonDealerPlayerId={viewState.nonDealerPlayerId}
                  selfPlayerId={currentPlayerId}
                  seats={activeSeatPlayers
                    .filter(p => p.id === viewState.dealerPlayerId || p.id === viewState.nonDealerPlayerId)
                    .map(p => ({ playerId: p.id, position: p.position }))}
                  cardsPerPlayer={GIN_CARDS_PER_PLAYER}
                  selfHand={viewState.playerStates[currentPlayerId].hand}
                  discardTop={viewState.discardPile[0]}
                />
              ) : null}


            {/* Opponent Draw Animation */}
            <GinRummyOpponentDrawAnimation
              key={opponentDrawKey}
              triggerId={opponentDrawTriggerId}
              drawSource={opponentDrawSource}
              card={opponentDrawCard}
              cardBackColors={cardBackColors}
              targetSlot={opponentDrawTargetSlot}
            />

            {/* Self Draw Animations — one per in-flight intent.
                Each releases its OWN withheld card on settle. */}
            {Object.values(selfDrawIntents).map(intent => (
              <GinRummySelfDrawAnimation
                key={intent.intentId}
                triggerId={intent.intentId}
                drawSource={intent.source}
                card={intent.card}
                cardBackColors={cardBackColors}
                onSettled={() => {
                  setSelfDrawIntents(prev => {
                    if (!prev[intent.intentId]) return prev;
                    const next = { ...prev };
                    delete next[intent.intentId];
                    return next;
                  });
                }}
              />
            ))}


            {/* Knock/Gin Felt Display — shows only the OPPONENT's cards
                on the felt. Mounted as a direct child of the geometry
                provider (no wrapper div) so its GinAnchoredSlot portal
                is the sole owner of position/size — same reactive
                mounted-consumer path as gin.pegboard and
                gin.stockDiscardGroup:
                  useDraftedGeometryOverrides
                  → GinRummyGameplayGeometryProvider re-resolves
                  → GinAnchoredSlot re-renders with new rect. */}
            {visiblePlayable && viewState && (viewState.phase === 'knocking' || viewState.phase === 'laying_off' || viewState.phase === 'scoring' || (viewState.phase === 'complete' && !!viewState.knockResult)) && (
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
            {visiblePlayable && viewState && showKnockOverlay && (() => {
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
            {visiblePlayable && viewState && showGinOverlay && (() => {
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

            {/* Match-win winner UI is owned by the canonical shell rail
                (CanonicalAnnouncementLayer renders the `match_win`
                plate emitted from processCompletion above). Winner-only
                confetti fires there as well. No bespoke Gin terminal
                surface — mirrors Cribbage's terminal lifecycle. */}


            {/* Player-to-player chip transfer animation at match end */}
            {storedChipPositions && (
              <CribbageChipTransferAnimation
                triggerId={chipAnimTriggerId}
                amount={chipAnimAmount}
                winnerPosition={storedChipPositions.winner}
                loserPositions={storedChipPositions.losers}
              />
            )}

            {/* Felt-level dealer marker removed — canonical dealer
                indicator in the local identity row is the single source. */}


            {/* Opponent overlay — shell-owned via GameplayOpponentSeatLayer.
                Games emit typed presentation accessors; the shell mounts
                CanonicalSeatCluster per opponent and renders the
                card-back strip from typed `cardBacks` data. */}
            <GinDealClippedOpponentSeatLayer
              handContextId={handContextId}
              participants={(isObserver
                ? activeSeatPlayers
                : activeSeatPlayers.filter(p => p.id !== currentPlayerId)
              ).map(seatPlayer => ({
                id: seatPlayer.id,
                position: seatPlayer.position,
                name: getDisplayName(players, seatPlayer, seatPlayer.profiles?.username || 'Player'),
                chips: seatPlayer.chips,
              }))}
              presentation={{
                dealerPip: (p) => isCribDealer(p.id),
                statusRing: (p) => {
                  const seatPlayer = activeSeatPlayers.find(sp => sp.id === p.id);
                  return seatPlayer && (seatPlayer.sitting_out || (seatPlayer as any).auto_fold)
                    ? 'sitting_out'
                    : 'active';
                },
                cardBacks: (p) => {
                  if (!viewState) return null;
                  
                  const seatState = viewState.playerStates?.[p.id];
                  if (!seatState || seatState.hand.length === 0) return null;
                  const isOpponentSeat = !isObserver && p.id === opponentId;
                  const visible =
                    isOpponentSeat &&
                    viewState.phase !== 'knocking' &&
                    viewState.phase !== 'laying_off' &&
                    viewState.phase !== 'scoring' &&
                    !(viewState.phase === 'complete' && viewState.knockResult);
                  return {
                    count: seatState.hand.length,
                    visible,
                    variant: 'gin',
                  };
                },
              }}
            />


        </GinRummyGameplayGeometryProvider>
        </div>



      {/* Bottom Section — shell-owned proportional 5-row HUD grid.
          Hand-result and in-progress (knocking/laying_off) messaging is
          now owned by the canonical announcement rail (round_win +
          waiting_for_player ambient emitted from this component). The
          row-2 local gold-plate fallback has been removed; the timer
          slot stays empty for Gin. */}
      <div style={{ pointerEvents: 'auto', flex: '0 0 var(--shell-hud-h)', display: 'flex', flexDirection: 'column' }}>
      <ShellHudGrid
        timer={null}

        identity={
          currentPlayer ? (
            <div className="flex items-center justify-center gap-2 h-full">
              <QuickEmoticonPicker
                onSelect={async (emoticon: string) => {
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
              {isCribDealer(currentPlayerId) && <DealerIndicator />}
              <p className="font-semibold text-sm text-foreground">
                {currentPlayer.profiles?.username || 'You'}
              </p>
              <span className="font-bold text-lg text-poker-gold">
                ${formatChipValue(currentPlayer.chips)}
              </span>
            </div>
          ) : null
        }
        pane={
          <div className="relative w-full h-full overflow-hidden" data-gin-active-pane-content="">
            {activeTab === 'cards' && currentPlayer && visiblePlayable && viewState && (
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
                handIdentityKey={handContextId}
                withheldDrawnCards={Object.values(selfDrawIntents)
                  .map(i => i.card)
                  .filter((c): c is GinRummyCard => !!c)
                  .map(c => ({ rank: c.rank, suit: c.suit }))}
              />
            )}

            {activeTab === 'cards' && currentPlayer && !visiblePlayable && (
              <div className="px-4 py-6">
                <p className="text-muted-foreground text-sm text-center">
                  Preparing hand…
                </p>
              </div>
            )}

            {activeTab === 'cards' && !currentPlayer && (
              <div className="px-4 py-6">
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
              <div className="p-4 space-y-2 overflow-y-auto h-full">
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
        }
      />
      </div>
    </DealRuntimeMaybe>
    </div>

  );
};
